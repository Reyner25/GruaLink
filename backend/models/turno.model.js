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
         u.nombre AS operador_nombre
  FROM turnos_operador t
  JOIN gruas g ON g.id = t.grua_id
  JOIN usuarios u ON u.id = t.operador_id`;

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

  async listar({ operadorId, desde, hasta, limite = 30, pagina = 1 }) {
    const condiciones = [];
    const valores = [];
    const agregar = (sql, valor) => {
      valores.push(valor);
      condiciones.push(sql.replace("?", `$${valores.length}`));
    };
    if (operadorId) agregar("t.operador_id = ?", operadorId);
    if (desde) agregar("t.inicio >= ?::date", desde);
    if (hasta) agregar("t.inicio < ?::date + 1", hasta);

    const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";
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
};

module.exports = TurnoModel;
