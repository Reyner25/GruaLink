/**
 * Consultas para exportar a Excel.
 *
 * Las fechas y horas se devuelven como TEXTO ya convertido a hora de
 * Colombia (to_char ... AT TIME ZONE 'America/Bogota'); excel.service las
 * convierte en fechas de Excel. Así el archivo muestra la misma hora que la
 * pantalla, sin importar la zona horaria del servidor.
 */
const { pool } = require("../config/db");
const { filtrosServicios } = require("./dashboard.model");

const LIMITE_FILAS = 20000; // protección: un Excel más grande no es práctico

const hora = (col) => `to_char(${col} AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD HH24:MI:SS')`;

const ExportarModel = {
  LIMITE_FILAS,

  async servicios(filtros) {
    const { where, valores } = filtrosServicios(filtros);
    valores.push(LIMITE_FILAS + 1);
    const { rows } = await pool.query(
      `SELECT s.id, s.numero_orden, s.fecha_servicio::text AS fecha_servicio, s.estado,
              COALESCE(c.nombre_comercial, c.razon_social) AS cliente, c.nit AS cliente_nit,
              u.nombre AS operador, g.numero_interno AS grua, g.placa AS grua_placa,
              s.placa_vehiculo, s.numero_vehiculo,
              COALESCE(s.tipo_vehiculo_otro, tv.nombre) AS tipo_vehiculo,
              ts.nombre AS tipo_servicio, s.es_rescate,
              ${hora("s.hora_solicitud")} AS hora_solicitud,
              ${hora("s.inicio_servicio")} AS inicio_servicio,
              ${hora("s.fin_servicio")} AS fin_servicio,
              round(EXTRACT(EPOCH FROM (s.inicio_servicio - s.hora_solicitud)) / 60)::int AS reaccion_min,
              round(EXTRACT(EPOCH FROM (s.fin_servicio - s.inicio_servicio)) / 60)::int AS duracion_min,
              s.origen, s.destino,
              s.km_vacio, s.km_servicio, s.km_vacio + s.km_servicio AS km_total, s.km_facturables,
              s.valor_tarifa_basica, s.valor_conceptos, s.valor_calculado, s.valor_aprobado,
              aprob.nombre AS aprobado_por, ${hora("s.aprobado_en")} AS aprobado_en,
              s.entregado_sin_novedad, s.recibe_nombre, s.recibe_documento,
              s.observaciones, s.observaciones_entrega
       FROM servicios s
       JOIN clientes c ON c.id = s.cliente_id
       JOIN usuarios u ON u.id = s.operador_id
       JOIN gruas g ON g.id = s.grua_id
       JOIN tipos_vehiculo tv ON tv.id = s.tipo_vehiculo_id
       LEFT JOIN tipos_servicio ts ON ts.id = s.tipo_servicio_id
       LEFT JOIN usuarios aprob ON aprob.id = s.aprobado_por
       ${where}
       ORDER BY s.fecha_servicio, s.id
       LIMIT $${valores.length}`,
      valores,
    );
    return rows;
  },

  // Detalle de trabajos adicionales de los servicios exportados
  async conceptosDe(servicioIds) {
    if (servicioIds.length === 0) return [];
    const { rows } = await pool.query(
      `SELECT s.numero_orden, s.fecha_servicio::text AS fecha_servicio,
              COALESCE(c.nombre_comercial, c.razon_social) AS cliente,
              ct.nombre AS concepto, ct.unidad_cobro, sc.cantidad, sc.valor_unitario, sc.total
       FROM servicio_conceptos sc
       JOIN servicios s ON s.id = sc.servicio_id
       JOIN clientes c ON c.id = s.cliente_id
       JOIN conceptos_tarifa ct ON ct.id = sc.concepto_id
       WHERE sc.servicio_id = ANY($1::int[])
       ORDER BY s.fecha_servicio, s.id, ct.nombre`,
      [servicioIds],
    );
    return rows;
  },
};

module.exports = ExportarModel;
