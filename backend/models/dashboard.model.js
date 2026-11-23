/**
 * Consultas del dashboard y reportes. TODO se calcula en PostgreSQL con
 * consultas agregadas (COUNT, SUM, GROUP BY), nunca en el navegador.
 */
const { pool } = require("../config/db");

// Arma el WHERE de servicios según los filtros recibidos
function filtrosServicios({ desde, hasta, clienteId, gruaId, operadorId, estado }) {
  const condiciones = [];
  const valores = [];
  const agregar = (sql, valor) => {
    if (valor === undefined || valor === null || valor === "") return;
    valores.push(valor);
    condiciones.push(sql.replace("?", `$${valores.length}`));
  };
  agregar("s.fecha_servicio >= ?", desde);
  agregar("s.fecha_servicio <= ?", hasta);
  agregar("s.cliente_id = ?", clienteId);
  agregar("s.grua_id = ?", gruaId);
  agregar("s.operador_id = ?", operadorId);
  agregar("s.estado = ?", estado);
  return { where: condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "", valores };
}

const DashboardModel = {
  // Estado ACTUAL de la flota (no depende de las fechas)
  async flota() {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE estado = 'activa')::int AS activas,
              count(*) FILTER (WHERE estado = 'mantenimiento')::int AS mantenimiento,
              count(*) FILTER (WHERE estado = 'inactiva')::int AS inactivas,
              (SELECT count(*)::int FROM turnos_operador WHERE estado = 'activo') AS en_turno
       FROM gruas`,
    );
    return rows[0];
  },

  // Totales de servicios. Los anulados no suman dinero.
  async servicios(filtros) {
    const { where, valores } = filtrosServicios(filtros);
    const { rows } = await pool.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE s.estado IN ('solicitado','asignado'))::int AS pendientes,
              count(*) FILTER (WHERE s.estado IN ('en_desplazamiento','en_servicio'))::int AS en_ejecucion,
              count(*) FILTER (WHERE s.estado = 'finalizado')::int AS finalizados,
              count(*) FILTER (WHERE s.estado = 'en_revision')::int AS en_revision,
              count(*) FILTER (WHERE s.estado = 'aprobado')::int AS aprobados,
              count(*) FILTER (WHERE s.estado = 'anulado')::int AS anulados,
              COALESCE(sum(s.valor_calculado) FILTER (WHERE s.estado <> 'anulado'), 0)::numeric AS valor_calculado,
              COALESCE(sum(s.valor_aprobado) FILTER (WHERE s.estado = 'aprobado'), 0)::numeric AS valor_aprobado,
              COALESCE(sum(s.km_servicio) FILTER (WHERE s.estado <> 'anulado'), 0)::numeric AS km_servicio,
              -- Tiempo de reacción promedio en minutos (inicio - solicitud)
              round(avg(EXTRACT(EPOCH FROM (s.inicio_servicio - s.hora_solicitud)) / 60)
                    FILTER (WHERE s.inicio_servicio IS NOT NULL AND s.hora_solicitud IS NOT NULL
                              AND s.estado <> 'anulado'))::int AS reaccion_promedio_min
       FROM servicios s
       ${where}`,
      valores,
    );
    return rows[0];
  },

  async porDia(filtros) {
    const { where, valores } = filtrosServicios(filtros);
    const { rows } = await pool.query(
      `SELECT s.fecha_servicio::text AS fecha, count(*)::int AS servicios,
              COALESCE(sum(s.valor_calculado) FILTER (WHERE s.estado <> 'anulado'), 0)::numeric AS valor_calculado
       FROM servicios s ${where}
       GROUP BY s.fecha_servicio ORDER BY s.fecha_servicio`,
      valores,
    );
    return rows;
  },

  // Agrupación genérica: por cliente, por grúa o por operador
  async agrupado(filtros, por) {
    const AGRUPACIONES = {
      cliente: { join: "JOIN clientes x ON x.id = s.cliente_id", nombre: "COALESCE(x.nombre_comercial, x.razon_social)" },
      grua: { join: "JOIN gruas x ON x.id = s.grua_id", nombre: "x.numero_interno || ' · ' || x.placa" },
      operador: { join: "JOIN usuarios x ON x.id = s.operador_id", nombre: "x.nombre" },
    };
    const a = AGRUPACIONES[por];
    const { where, valores } = filtrosServicios(filtros);
    const { rows } = await pool.query(
      `SELECT x.id, ${a.nombre} AS nombre,
              count(*)::int AS servicios,
              count(*) FILTER (WHERE s.estado = 'aprobado')::int AS aprobados,
              COALESCE(sum(s.valor_calculado) FILTER (WHERE s.estado <> 'anulado'), 0)::numeric AS valor_calculado,
              COALESCE(sum(s.valor_aprobado) FILTER (WHERE s.estado = 'aprobado'), 0)::numeric AS valor_aprobado,
              COALESCE(sum(s.km_servicio) FILTER (WHERE s.estado <> 'anulado'), 0)::numeric AS km_servicio
       FROM servicios s ${a.join}
       ${where}
       GROUP BY x.id, ${a.nombre}
       ORDER BY servicios DESC, nombre`,
      valores,
    );
    return rows;
  },

  /**
   * Promedio de grúas por día (reporte "Promedio de grúas").
   * Para cada día del rango:
   *   total          grúas registradas
   *   en_operacion   grúas con al menos un turno ese día (turnos_operador)
   *   mantenimiento  grúas cuyo último estado al final del día era "mantenimiento"
   *   inactivas      ídem "inactiva"   (gruas_estado_historial)
   *   disponibilidad % de grúas no en mantenimiento ni inactivas
   */
  async promedioGruas({ desde, hasta }) {
    const { rows } = await pool.query(
      `WITH dias AS (
         SELECT d::date AS dia FROM generate_series($1::date, $2::date, interval '1 day') AS d
       ),
       estado_dia AS (
         -- Último estado registrado de cada grúa antes de terminar el día
         SELECT dias.dia, g.id AS grua_id,
                (SELECT h.estado FROM gruas_estado_historial h
                  WHERE h.grua_id = g.id AND h.desde < dias.dia + 1
                  ORDER BY h.desde DESC, h.id DESC LIMIT 1) AS estado
         FROM dias CROSS JOIN gruas g
       ),
       operacion AS (
         SELECT dias.dia, count(DISTINCT t.grua_id)::int AS en_operacion
         FROM dias
         LEFT JOIN turnos_operador t
                ON t.inicio < dias.dia + 1
               AND COALESCE(t.fin, now()) >= dias.dia
         GROUP BY dias.dia
       )
       SELECT e.dia::text AS fecha,
              count(*) FILTER (WHERE e.estado IS NOT NULL)::int AS total,
              o.en_operacion,
              count(*) FILTER (WHERE e.estado = 'mantenimiento')::int AS mantenimiento,
              count(*) FILTER (WHERE e.estado = 'inactiva')::int AS inactivas
       FROM estado_dia e
       JOIN operacion o ON o.dia = e.dia
       GROUP BY e.dia, o.en_operacion
       ORDER BY e.dia`,
      [desde, hasta],
    );
    return rows.map((r) => ({
      ...r,
      disponibilidad: r.total ? Math.round(((r.total - r.mantenimiento - r.inactivas) / r.total) * 1000) / 10 : 0,
    }));
  },
};

module.exports = DashboardModel;
// Se reutiliza en la exportación a Excel (mismos filtros que el dashboard)
module.exports.filtrosServicios = filtrosServicios;
