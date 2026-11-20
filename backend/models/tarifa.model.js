/**
 * Consultas de tarifas y precios de conceptos.
 * La DECISIÓN de cuál tarifa aplicar se toma en services/tarifa.service.js.
 */
const { pool } = require("../config/db");

const TarifaModel = {
  /**
   * Tarifas que podrían aplicar a un servicio: las del cliente Y las de
   * "Clientes generales" (cliente_id NULL). Las del cliente salen primero.
   *
   * Rango de km con ambos extremos incluidos (km_desde <= km <= km_hasta),
   * igual que la restricción tarifas_sin_superposicion ('[]').
   */
  async buscarCandidatas({ clienteId, tipoVehiculoId, tipoServicioId, fecha, km }, { client = pool } = {}) {
    const { rows } = await client.query(
      `SELECT id, cliente_id, valor, km_desde, km_hasta, vigente_desde, vigente_hasta
       FROM tarifas
       WHERE (cliente_id = $1 OR cliente_id IS NULL)
         AND tipo_vehiculo_id = $2
         AND tipo_servicio_id = $3
         AND vigente_desde <= $4
         AND (vigente_hasta IS NULL OR vigente_hasta >= $4)
         AND km_desde <= $5
         AND (km_hasta IS NULL OR km_hasta >= $5)
       ORDER BY cliente_id NULLS LAST`,
      [clienteId, tipoVehiculoId, tipoServicioId, fecha, km],
    );
    return rows;
  },

  /**
   * Precio vigente de cada concepto pedido: el del cliente si existe,
   * si no, el de "Clientes generales". DISTINCT ON se queda con la primera
   * fila de cada concepto según el ORDER BY (cliente antes que generales).
   */
  async preciosDeConceptos({ conceptoIds, clienteId, fecha }, { client = pool } = {}) {
    const { rows } = await client.query(
      `SELECT DISTINCT ON (c.id)
              c.id AS concepto_id, c.nombre, c.unidad_cobro, c.activo, c.la_reporta_operador,
              p.id AS precio_id, p.valor
       FROM conceptos_tarifa c
       LEFT JOIN precios_concepto p
              ON p.concepto_id = c.id
             AND (p.cliente_id = $2 OR p.cliente_id IS NULL)
             AND p.vigente_desde <= $3
             AND (p.vigente_hasta IS NULL OR p.vigente_hasta >= $3)
       WHERE c.id = ANY($1::int[])
       ORDER BY c.id, p.cliente_id NULLS LAST`,
      [conceptoIds, clienteId, fecha],
    );
    return rows;
  },
};

module.exports = TarifaModel;
