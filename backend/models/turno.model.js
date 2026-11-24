/**
 * Modelo de turnos: SOLO consultas SQL, sin reglas de negocio.
 * Las reglas (quién puede iniciar, qué validar al cerrar) están en
 * services/turno.service.js.
 *
 * Los métodos que escriben reciben "client" (conexión dentro de una
 * transacción). Los que solo leen aceptan client opcional.
 */
const { pool } = require("../config/db");

// Columnas que se devuelven siempre, con los datos de la grúa ya unidos
const SELECT_TURNO = `
  SELECT t.id, t.operador_id, t.grua_id, t.inicio, t.fin, t.estado,
         t.observaciones_inicio, t.observaciones_cierre, t.cerrado_por,
         g.placa AS grua_placa, g.numero_interno AS grua_numero,
         u.nombre AS operador_nombre,
         cp.nombre AS cerrado_por_nombre,
         -- Minutos trabajados (si sigue activo, hasta ahora)
         round(EXTRACT(EPOCH FROM (COALESCE(t.fin, now()) - t.inicio)) / 60)::int AS duracion_min,
         (SELECT count(*)::int FROM servicios s WHERE s.turno_id = t.id AND s.estado <> 'anulado') AS servicios
  FROM turnos_operador t
  JOIN gruas g ON g.id = t.grua_id
  JOIN usuarios u ON u.id = t.operador_id
  LEFT JOIN usuarios cp ON cp.id = t.cerrado_por`;

/**
 * Filtros del historial y del resumen (por fecha de INICIO del turno, en hora
 * de Colombia). Devuelve { where, valores } listos para la consulta.
 */
function filtrosTurnos({ operadorId, gruaId, estado, desde, hasta }) {
  const condiciones = [];
  const valores = [];
  const agregar = (sql, valor) => {
    if (valor === undefined || valor === null || valor === "") return;
    valores.push(valor);
    condiciones.push(sql.replace("?", `$${valores.length}`));
  };
  agregar("t.operador_id = ?", operadorId);
  agregar("t.grua_id = ?", gruaId);
  agregar("t.estado = ?", estado);
  agregar("t.inicio >= ?::date", desde);
  agregar("t.inicio < ?::date + 1", hasta);
  return { where: condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "", valores };
}

const TurnoModel = {
  /**
   * Turno activo del operador, o null.
   * Con bloquear=true usa FOR UPDATE: mientras dure la transacción, otra
   * petición del mismo operador debe esperar (evita cierres dobles).
   */
  async obtenerActivo(operadorId, { client = pool, bloquear = false } = {}) {
    const { rows } = await client.query(
      `${SELECT_TURNO}
       WHERE t.operador_id = $1 AND t.estado = 'activo'
       ${bloquear ? "FOR UPDATE OF t" : ""}`,
      [operadorId],
    );
    return rows[0] || null;
  },

  async obtenerPorId(id, { client = pool, bloquear = false } = {}) {
    const { rows } = await client.query(
      `${SELECT_TURNO} WHERE t.id = $1 ${bloquear ? "FOR UPDATE OF t" : ""}`,
      [id],
    );
    return rows[0] || null;
  },

  // inicio usa now() de PostgreSQL: la hora la pone el SERVIDOR, no el celular
  async crear(client, { operadorId, gruaId, observaciones }) {
    const { rows } = await client.query(
      `INSERT INTO turnos_operador (operador_id, grua_id, observaciones_inicio)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [operadorId, gruaId, observaciones || null],
    );
    return this.obtenerPorId(rows[0].id, { client });
  },

  async cerrar(client, id, { estado, observaciones, cerradoPor }) {
    await client.query(
      `UPDATE turnos_operador
       SET estado = $2, fin = now(), observaciones_cierre = $3, cerrado_por = $4
       WHERE id = $1`,
      [id, estado, observaciones || null, cerradoPor || null],
    );
    return this.obtenerPorId(id, { client });
  },

  async listar({ operadorId, gruaId, estado, desde, hasta, limite = 30, pagina = 1 }) {
    const { where, valores } = filtrosTurnos({ operadorId, gruaId, estado, desde, hasta });
    valores.push(limite, (pagina - 1) * limite);
    const { rows } = await pool.query(
      `${SELECT_TURNO}
       ${where}
       ORDER BY t.inicio DESC
       LIMIT $${valores.length - 1} OFFSET $${valores.length}`,
      valores,
    );
    return rows;
  },

  // Operadores en turno AHORA (todos los turnos activos), el más antiguo primero
  async activos() {
    const { rows } = await pool.query(`${SELECT_TURNO} WHERE t.estado = 'activo' ORDER BY t.inicio`);
    return rows;
  },

  /**
   * Resumen por operador en el periodo: turnos, minutos trabajados, turno más
   * largo, servicios y turnos que tuvo que cerrar el administrador.
   */
  async resumenPorOperador(filtros) {
    const { where, valores } = filtrosTurnos(filtros);
    const { rows } = await pool.query(
      `SELECT x.operador_id, x.operador_nombre,
              count(*)::int AS turnos,
              sum(x.duracion_min)::int AS minutos,
              round(avg(x.duracion_min))::int AS promedio_min,
              max(x.duracion_min)::int AS max_min,
              sum(x.servicios)::int AS servicios,
              count(*) FILTER (WHERE x.estado = 'cerrado_admin')::int AS cerrados_admin,
              count(*) FILTER (WHERE x.estado = 'activo')::int AS activos
       FROM (${SELECT_TURNO} ${where}) AS x
       GROUP BY x.operador_id, x.operador_nombre
       ORDER BY x.operador_nombre`,
      valores,
    );
    return rows;
  },
};

module.exports = TurnoModel;
