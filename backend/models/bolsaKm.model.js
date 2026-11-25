/**
 * Consultas de la bolsa de kilometraje mensual que usan los reportes
 * (pantalla "Bolsa de kilómetros" y Excel de tarifas).
 * El cálculo de tarifas por bolsa está en TarifaModel / tarifa.service.
 */
const { pool } = require("../config/db");

const BolsaKmModel = {
  /**
   * Clientes que se cobran por bolsa de km, más los que ya tienen tabla pero
   * aún no se cobran así (se les preparó la tabla antes de cambiar la modalidad).
   * por_bolsa: true si ya se cobran por bolsa.
   */
  async clientes() {
    const { rows } = await pool.query(
      `SELECT c.id, COALESCE(c.nombre_comercial, c.razon_social) AS nombre, c.modalidad_cobro = 'bolsa_km_mensual' AS por_bolsa
       FROM clientes c
       WHERE c.modalidad_cobro = 'bolsa_km_mensual' OR EXISTS (SELECT 1 FROM tarifas_bolsa_km b WHERE b.cliente_id = c.id)
       ORDER BY 2`,
    );
    return rows;
  },

  // ¿El cliente tiene tabla de bolsa vigente hoy?
  async tieneTablaVigente(clienteId, { client = pool } = {}) {
    const { rows } = await client.query(
      `SELECT 1 FROM tarifas_bolsa_km WHERE cliente_id = $1
         AND vigente_desde <= current_date AND (vigente_hasta IS NULL OR vigente_hasta >= current_date) LIMIT 1`,
      [clienteId],
    );
    return Boolean(rows[0]);
  },

  // Servicios de un cliente en un mes (AAAA-MM) con los km que suman a la bolsa
  async serviciosDelMes(clienteId, mes) {
    const { rows } = await pool.query(
      `SELECT s.id, s.numero_orden, s.fecha_servicio::text AS fecha_servicio, s.estado,
              ts.nombre AS tipo_servicio, ts.usa_bolsa_km, s.fuera_disponibilidad,
              s.km_servicio, s.km_vacio, s.km_servicio + s.km_vacio AS km_bolsa,
              s.valor_calculado, s.valor_aprobado, s.placa_vehiculo
       FROM servicios s
       LEFT JOIN tipos_servicio ts ON ts.id = s.tipo_servicio_id
       WHERE s.cliente_id = $1 AND to_char(s.fecha_servicio, 'YYYY-MM') = $2
       ORDER BY s.fecha_servicio, s.id`,
      [clienteId, mes],
    );
    return rows;
  },

  /**
   * Todas las celdas de las tablas de bolsa, para el Excel de tarifas.
   * clienteId: número, "generales" (no hay bolsa general → nada) o vacío (todos).
   * vigenteEn: solo las tablas vigentes en esa fecha.
   */
  async celdasParaExportar({ clienteId, vigenteEn } = {}) {
    const filtros = [];
    const valores = [];
    if (clienteId === "generales") filtros.push("FALSE");
    else if (clienteId) {
      valores.push(Number(clienteId));
      filtros.push(`b.cliente_id = $${valores.length}`);
    }
    if (vigenteEn) {
      valores.push(vigenteEn);
      filtros.push(`b.vigente_desde <= $${valores.length} AND (b.vigente_hasta IS NULL OR b.vigente_hasta >= $${valores.length})`);
    }
    const { rows } = await pool.query(
      `SELECT COALESCE(c.nombre_comercial, c.razon_social) AS cliente, b.bolsa_km_desde, b.bolsa_km_hasta,
              b.km_desde, b.km_hasta, b.forma, b.valor, b.vigente_desde::text AS vigente_desde, b.vigente_hasta::text AS vigente_hasta
       FROM tarifas_bolsa_km b JOIN clientes c ON c.id = b.cliente_id
       ${filtros.length ? `WHERE ${filtros.join(" AND ")}` : ""}
       ORDER BY cliente, b.vigente_desde, b.bolsa_km_desde, b.km_desde`,
      valores,
    );
    return rows;
  },
};

module.exports = BolsaKmModel;
