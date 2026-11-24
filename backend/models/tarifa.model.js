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

  // ---------- Bolsa de kilometraje mensual (Suma) ----------

  // ¿El mes de esta fecha sigue abierto? (es el mes actual o uno futuro, hora de Colombia)
  async mesAbierto(fecha, { client = pool } = {}) {
    const { rows } = await client.query("SELECT date_trunc('month', $1::date) >= date_trunc('month', current_date) AS abierto", [fecha]);
    return rows[0].abierto;
  },

  // Km que eligen la columna PROVISIONAL del cliente (Tarifas → Bolsa de km). NULL = por defecto
  async kmProvisional(clienteId, { client = pool } = {}) {
    const { rows } = await client.query("SELECT bolsa_km_provisional FROM clientes WHERE id = $1", [clienteId]);
    return rows[0]?.bolsa_km_provisional ?? null;
  },

  async modalidadCliente(clienteId, { client = pool } = {}) {
    const { rows } = await client.query("SELECT modalidad_cobro FROM clientes WHERE id = $1", [clienteId]);
    return rows[0]?.modalidad_cobro || "por_servicio";
  },

  /**
   * Bloqueo de la bolsa de un cliente en un mes: mientras una transacción
   * recalcula ese mes, otra que también lo toque espera (se libera al
   * terminar la transacción). Evita dos cálculos simultáneos con totales distintos.
   */
  async bloquearBolsaMes(client, clienteId, fecha) {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('bolsa_km:' || $1::text || ':' || to_char($2::date, 'YYYY-MM')))", [
      clienteId,
      fecha,
    ]);
  },

  /**
   * Km de la bolsa del mes: servicio + vacío de los servicios del cliente en
   * ese mes calendario que entran en la bolsa (no anulados, dentro de la
   * disponibilidad, tipo de servicio de bolsa). excluirId: el servicio que se
   * está calculando (se suman aparte sus km nuevos).
   */
  async kmBolsaMes({ clienteId, fecha, excluirId = null }, { client = pool } = {}) {
    const { rows } = await client.query(
      `SELECT COALESCE(sum(s.km_servicio + s.km_vacio), 0)::numeric AS km
       FROM servicios s
       JOIN tipos_servicio ts ON ts.id = s.tipo_servicio_id
       WHERE s.cliente_id = $1
         AND date_trunc('month', s.fecha_servicio) = date_trunc('month', $2::date)
         AND s.estado <> 'anulado' AND NOT s.fuera_disponibilidad AND ts.usa_bolsa_km
         AND s.id IS DISTINCT FROM $3`,
      [clienteId, fecha, excluirId],
    );
    return Number(rows[0].km);
  },

  // Celda de la tabla: columna por la bolsa del mes, fila por los km del servicio
  async celdaBolsa({ clienteId, fecha, kmMes, km }, { client = pool } = {}) {
    const { rows } = await client.query(
      `SELECT id, bolsa_km_desde, bolsa_km_hasta, km_desde, km_hasta, forma, valor
       FROM tarifas_bolsa_km
       WHERE cliente_id = $1
         AND vigente_desde <= $2 AND (vigente_hasta IS NULL OR vigente_hasta >= $2)
         AND bolsa_km_desde <= $3 AND (bolsa_km_hasta IS NULL OR bolsa_km_hasta >= $3)
         AND km_desde <= $4 AND (km_hasta IS NULL OR km_hasta >= $4)`,
      [clienteId, fecha, kmMes, km],
    );
    return rows[0] || null;
  },

  // Columnas (rangos de bolsa) vigentes del cliente, para mostrar cuánto falta a la siguiente
  async columnasBolsa({ clienteId, fecha }, { client = pool } = {}) {
    const { rows } = await client.query(
      `SELECT DISTINCT bolsa_km_desde, bolsa_km_hasta FROM tarifas_bolsa_km
       WHERE cliente_id = $1 AND vigente_desde <= $2 AND (vigente_hasta IS NULL OR vigente_hasta >= $2)
       ORDER BY bolsa_km_desde`,
      [clienteId, fecha],
    );
    return rows;
  },

  /**
   * Datos para el recargo nocturno automático: el concepto marcado como
   * recargo (si existe y está activo) y la hora de corte propia del cliente
   * (NULL = usar la general).
   */
  // Horario: el del PRECIO del recargo vigente en la fecha (Tarifas → Precios de
  // conceptos): primero el del cliente, si no el general, si no el del concepto.
  async reglaRecargoNocturno(clienteId, fecha, { client = pool } = {}) {
    const vigente = `p.concepto_id = ct.id AND p.vigente_desde <= $2::date AND (p.vigente_hasta IS NULL OR p.vigente_hasta >= $2::date)`;
    const { rows } = await client.query(
      `SELECT ct.id AS concepto_id,
              to_char(COALESCE(propio.recargo_desde, general.recargo_desde, ct.recargo_desde), 'HH24:MI') AS desde,
              to_char(COALESCE(propio.recargo_hasta, general.recargo_hasta, ct.recargo_hasta), 'HH24:MI') AS hasta
       FROM (SELECT 1) AS uno
       LEFT JOIN conceptos_tarifa ct ON ct.es_recargo_nocturno AND ct.activo
       LEFT JOIN LATERAL (SELECT p.recargo_desde, p.recargo_hasta FROM precios_concepto p WHERE ${vigente} AND p.cliente_id = $1 LIMIT 1) propio ON TRUE
       LEFT JOIN LATERAL (SELECT p.recargo_desde, p.recargo_hasta FROM precios_concepto p WHERE ${vigente} AND p.cliente_id IS NULL LIMIT 1) general ON TRUE`,
      [clienteId, fecha || new Date().toISOString().slice(0, 10)],
    );
    return rows[0];
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
