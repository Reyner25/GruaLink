/**
 * Modelo de servicios: SOLO SQL.
 *
 * Seguridad: crear() y finalizar() solo escriben las columnas de sus listas
 * blancas. Aunque por error llegue un objeto con "valor_aprobado" u
 * "operador_id" extra, esas columnas se ignoran.
 */
const { pool } = require("../config/db");

// Columnas que se escriben al CREAR un servicio
const COLUMNAS_CREAR = [
  "numero_orden", "grua_id", "operador_id", "turno_id", "cliente_id",
  "tipo_vehiculo_id", "tipo_vehiculo_otro", "tipo_servicio_id", "placa_vehiculo", "numero_vehiculo",
  "fecha_servicio", "hora_solicitud", "inicio_servicio", "origen", "destino",
  "es_rescate", "observaciones", "estado",
];

// Columnas que se escriben al FINALIZAR un servicio
const COLUMNAS_FINALIZAR = [
  "inicio_servicio", "fin_servicio", "km_vacio", "km_servicio", "km_facturables",
  "entregado_sin_novedad", "recibe_nombre", "recibe_documento",
  "observaciones_entrega", "tarifa_id", "valor_tarifa_basica", "valor_conceptos",
  "valor_calculado", "estado",
];

// Columnas que el ADMINISTRADOR puede cambiar en una corrección autorizada
// (más los valores recalculados). Nunca: numero_orden, operador_id, turno_id.
const COLUMNAS_CORREGIR = [
  "cliente_id", "tipo_vehiculo_id", "tipo_vehiculo_otro", "tipo_servicio_id", "grua_id", "placa_vehiculo",
  "numero_vehiculo", "fecha_servicio", "hora_solicitud", "inicio_servicio", "fin_servicio",
  "origen", "destino", "es_rescate", "km_vacio", "km_servicio", "km_facturables",
  "entregado_sin_novedad", "recibe_nombre", "recibe_documento", "observaciones",
  "observaciones_entrega", "tarifa_id", "valor_tarifa_basica", "valor_conceptos", "valor_calculado",
];

// Columnas que se escriben al APROBAR
const COLUMNAS_APROBAR = ["estado", "valor_aprobado", "aprobado_por", "aprobado_en"];

// Estados en los que el servicio aún no se ha cerrado
const ESTADOS_ABIERTOS = ["solicitado", "asignado", "en_desplazamiento", "en_servicio"];

const SELECT_DETALLE = `
  SELECT s.*,
         COALESCE(c.nombre_comercial, c.razon_social) AS cliente_nombre, c.nit AS cliente_nit,
         g.placa AS grua_placa, g.numero_interno AS grua_numero,
         -- Para "Otro" se muestra lo que escribió el operador (ej. "Volqueta")
         COALESCE(s.tipo_vehiculo_otro, tv.nombre) AS tipo_vehiculo, ts.nombre AS tipo_servicio,
         u.nombre AS operador_nombre
  FROM servicios s
  JOIN clientes c ON c.id = s.cliente_id
  JOIN gruas g ON g.id = s.grua_id
  JOIN tipos_vehiculo tv ON tv.id = s.tipo_vehiculo_id
  LEFT JOIN tipos_servicio ts ON ts.id = s.tipo_servicio_id
  JOIN usuarios u ON u.id = s.operador_id`;

function soloColumnas(datos, permitidas) {
  return permitidas.filter((col) => datos[col] !== undefined);
}

const ServicioModel = {
  ESTADOS_ABIERTOS,

  async siguienteNumeroOrden(client) {
    const { rows } = await client.query("SELECT nextval('servicios_numero_orden_seq') AS n");
    return String(rows[0].n);
  },

  async crear(client, datos) {
    const columnas = soloColumnas(datos, COLUMNAS_CREAR);
    const { rows } = await client.query(
      `INSERT INTO servicios (${columnas.join(", ")})
       VALUES (${columnas.map((_, i) => `$${i + 1}`).join(", ")})
       RETURNING id`,
      columnas.map((col) => datos[col]),
    );
    return rows[0].id;
  },

  async finalizar(client, id, datos) {
    const columnas = soloColumnas(datos, COLUMNAS_FINALIZAR);
    const asignaciones = columnas.map((col, i) => `${col} = $${i + 2}`);
    await client.query(
      `UPDATE servicios SET ${asignaciones.join(", ")}, cerrado_en = now() WHERE id = $1`,
      [id, ...columnas.map((col) => datos[col])],
    );
  },

  // Actualiza solo las columnas de la lista blanca indicada
  async actualizarColumnas(client, id, datos, permitidas) {
    const columnas = soloColumnas(datos, permitidas);
    if (columnas.length === 0) return;
    await client.query(
      `UPDATE servicios SET ${columnas.map((col, i) => `${col} = $${i + 2}`).join(", ")} WHERE id = $1`,
      [id, ...columnas.map((col) => datos[col])],
    );
  },

  corregir(client, id, datos) {
    return this.actualizarColumnas(client, id, datos, COLUMNAS_CORREGIR);
  },

  aprobar(client, id, datos) {
    return this.actualizarColumnas(client, id, datos, COLUMNAS_APROBAR);
  },

  async reemplazarConceptos(client, servicioId, conceptos) {
    await client.query("DELETE FROM servicio_conceptos WHERE servicio_id = $1", [servicioId]);
    await this.insertarConceptos(client, servicioId, conceptos);
  },

  async insertarConceptos(client, servicioId, conceptos) {
    for (const c of conceptos) {
      await client.query(
        `INSERT INTO servicio_conceptos (servicio_id, concepto_id, cantidad, valor_unitario, total)
         VALUES ($1, $2, $3, $4, $5)`,
        [servicioId, c.concepto_id, c.cantidad, c.valor_unitario, c.total],
      );
    }
  },

  /**
   * Con bloquear=true usa FOR UPDATE: si llegan dos "finalizar" del mismo
   * servicio al mismo tiempo, el segundo espera y luego ve que ya está
   * finalizado. Así se evitan finalizaciones dobles.
   */
  async obtenerPorId(id, { client = pool, bloquear = false } = {}) {
    const { rows } = await client.query(
      `${SELECT_DETALLE} WHERE s.id = $1 ${bloquear ? "FOR UPDATE OF s" : ""}`,
      [id],
    );
    return rows[0] || null;
  },

  async obtenerConceptos(servicioId, { client = pool } = {}) {
    const { rows } = await client.query(
      `SELECT sc.concepto_id, ct.nombre, ct.unidad_cobro, sc.cantidad, sc.valor_unitario, sc.total
       FROM servicio_conceptos sc
       JOIN conceptos_tarifa ct ON ct.id = sc.concepto_id
       WHERE sc.servicio_id = $1
       ORDER BY ct.nombre`,
      [servicioId],
    );
    return rows;
  },

  async actualizarEstado(client, id, estado) {
    await client.query("UPDATE servicios SET estado = $2 WHERE id = $1", [id, estado]);
    return this.obtenerPorId(id, { client });
  },

  // Reabrir un aprobado: vuelve a revisión y deja de contar como aprobado
  async reabrir(client, id) {
    await client.query(
      `UPDATE servicios
       SET estado = 'en_revision', valor_aprobado = NULL, aprobado_por = NULL, aprobado_en = NULL
       WHERE id = $1`,
      [id],
    );
    return this.obtenerPorId(id, { client });
  },

  async listarAbiertosDeTurno(turnoId, { client = pool } = {}) {
    const { rows } = await client.query(
      `SELECT id, numero_orden, estado FROM servicios
       WHERE turno_id = $1 AND estado = ANY($2::text[])
       ORDER BY id`,
      [turnoId, ESTADOS_ABIERTOS],
    );
    return rows;
  },

  async listar({ operadorId, desde, hasta, estado, clienteId, gruaId, limite = 50, pagina = 1 }) {
    const condiciones = [];
    const valores = [];
    const agregar = (sql, valor) => {
      valores.push(valor);
      condiciones.push(sql.replace("?", `$${valores.length}`));
    };
    if (operadorId) agregar("s.operador_id = ?", operadorId);
    if (desde) agregar("s.fecha_servicio >= ?", desde);
    if (hasta) agregar("s.fecha_servicio <= ?", hasta);
    if (estado) agregar("s.estado = ?", estado);
    if (clienteId) agregar("s.cliente_id = ?", clienteId);
    if (gruaId) agregar("s.grua_id = ?", gruaId);

    const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";
    valores.push(limite, (pagina - 1) * limite);

    const { rows } = await pool.query(
      `SELECT s.id, s.numero_orden, s.fecha_servicio, s.inicio_servicio, s.placa_vehiculo,
              s.estado, s.km_servicio, s.valor_calculado, s.valor_aprobado, s.operador_id, s.turno_id,
              COALESCE(c.nombre_comercial, c.razon_social) AS cliente_nombre,
              g.numero_interno AS grua_numero, g.placa AS grua_placa,
              COALESCE(s.tipo_vehiculo_otro, tv.nombre) AS tipo_vehiculo, ts.nombre AS tipo_servicio
       FROM servicios s
       JOIN clientes c ON c.id = s.cliente_id
       JOIN gruas g ON g.id = s.grua_id
       JOIN tipos_vehiculo tv ON tv.id = s.tipo_vehiculo_id
       LEFT JOIN tipos_servicio ts ON ts.id = s.tipo_servicio_id
       ${where}
       ORDER BY s.fecha_servicio DESC, s.id DESC
       LIMIT $${valores.length - 1} OFFSET $${valores.length}`,
      valores,
    );
    return rows;
  },

  async contarPorOperador(operadorId, { desde, hasta }) {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM servicios
       WHERE operador_id = $1 AND fecha_servicio BETWEEN $2 AND $3`,
      [operadorId, desde, hasta],
    );
    return rows[0].total;
  },
};

module.exports = ServicioModel;
