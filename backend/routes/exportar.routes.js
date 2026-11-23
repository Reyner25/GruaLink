/**
 * Exportación a Excel  →  /api/exportar   (administrador y financiero)
 *
 *  GET /servicios        ?desde ?hasta ?cliente_id ?grua_id ?operador_id ?estado
 *                        Una hoja "Servicios": una fila por servicio, con los
 *                        trabajos adicionales en columnas y fila de totales.
 *  GET /ordenes          mismos filtros → PDF con una orden de servicio por página
 *  GET /ordenes/:id      PDF de una sola orden
 *  GET /promedio-gruas   ?desde ?hasta   (máx. 1 año)
 *
 * Usa los mismos filtros que el dashboard y el listado de servicios, así el
 * archivo coincide con lo que se ve en pantalla.
 */
const { Router } = require("express");
const { query, param } = require("express-validator");
const { autenticar } = require("../middlewares/auth");
const { requierePermiso, tienePermiso } = require("../middlewares/permisos");
const { resultadoValidacion } = require("../validators/comun");
const ExportarModel = require("../models/exportar.model");
const DashboardModel = require("../models/dashboard.model");
const { crearExcel } = require("../services/excel.service");
const { crearOrdenesPdf } = require("../services/pdf.service");
const { errorNegocio } = require("../utils/errores");

const ESTADOS = {
  solicitado: "Solicitado",
  asignado: "Asignado",
  en_desplazamiento: "En desplazamiento",
  en_servicio: "En servicio",
  finalizado: "Finalizado",
  en_revision: "En revisión",
  aprobado: "Aprobado",
  anulado: "Anulado",
};
const UNIDADES = { evento: "Evento", hora: "Hora", km: "Km", cantidad: "Unidad" };

const filtrosValidos = [
  query("desde").optional().isISO8601({ strict: true }).withMessage("Fecha 'desde' inválida"),
  query("hasta").optional().isISO8601({ strict: true }).withMessage("Fecha 'hasta' inválida"),
  query("cliente_id").optional().isInt({ min: 1 }),
  query("grua_id").optional().isInt({ min: 1 }),
  query("operador_id").optional().isInt({ min: 1 }),
  query("estado").optional().isIn(Object.keys(ESTADOS)),
  resultadoValidacion,
];

function enviarExcel(res, buffer, nombre) {
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
  res.send(Buffer.from(buffer));
}

/**
 * Convierte el detalle de trabajos adicionales en columnas de la hoja de
 * servicios: por cada concepto que aparece en el periodo, "<concepto> (cant.)"
 * y "<concepto> ($)". Solo salen los conceptos usados, ordenados por nombre.
 * Devuelve las columnas y, por servicio, los valores de esas columnas.
 */
function columnasDeConceptos(conceptos) {
  const usados = new Map(); // concepto_id → { nombre, unidad }
  const porServicio = new Map(); // servicio_id → { c<id>_cant, c<id>_valor }
  for (const c of conceptos) {
    usados.set(c.concepto_id, { nombre: c.concepto, unidad: UNIDADES[c.unidad_cobro] || c.unidad_cobro });
    const fila = porServicio.get(c.servicio_id) || {};
    fila[`c${c.concepto_id}_cant`] = c.cantidad;
    fila[`c${c.concepto_id}_valor`] = c.total;
    porServicio.set(c.servicio_id, fila);
  }
  const columnas = [...usados.entries()]
    .sort((a, b) => a[1].nombre.localeCompare(b[1].nombre, "es"))
    .flatMap(([id, { nombre, unidad }]) => [
      { titulo: `${nombre} (cant. ${unidad.toLowerCase()})`, campo: `c${id}_cant`, formato: "numero", ancho: 12 },
      { titulo: `${nombre} ($)`, campo: `c${id}_valor`, formato: "moneda", ancho: 13 },
    ]);
  return { columnas, porServicio };
}

const sufijoFechas =(q) => [q.desde, q.hasta].filter(Boolean).join("_a_") || "todo";

const router = Router();
router.use(autenticar, requierePermiso("reportes:ver"));

router.get("/servicios", ...filtrosValidos, async (req, res, next) => {
  try {
    const q = req.query;
    const filas = await ExportarModel.servicios({
      desde: q.desde,
      hasta: q.hasta,
      clienteId: q.cliente_id ? Number(q.cliente_id) : undefined,
      gruaId: q.grua_id ? Number(q.grua_id) : undefined,
      operadorId: q.operador_id ? Number(q.operador_id) : undefined,
      estado: q.estado,
    });
    if (filas.length > ExportarModel.LIMITE_FILAS) {
      throw errorNegocio(422, "DEMASIADAS_FILAS", `Son más de ${ExportarModel.LIMITE_FILAS} servicios: reduzca el rango de fechas.`);
    }
    const conceptos = await ExportarModel.conceptosDe(filas.map((f) => f.id));
    const { columnas: columnasConceptos, porServicio } = columnasDeConceptos(conceptos);

    const buffer = await crearExcel({
      titulo: "Servicios de grúa",
      hojas: [
        {
          nombre: "Servicios",
          totales: [
            "km_vacio", "km_servicio", "km_total", "valor_tarifa_basica",
            ...columnasConceptos.map((c) => c.campo),
            "valor_conceptos", "valor_calculado", "valor_aprobado",
          ],
          columnas: [
            { titulo: "Orden", campo: "numero_orden", ancho: 9 },
            { titulo: "Fecha", campo: "fecha_servicio", formato: "fecha", ancho: 11 },
            { titulo: "Estado", campo: "estado_texto", ancho: 13 },
            { titulo: "Cliente", campo: "cliente", ancho: 22 },
            { titulo: "NIT", campo: "cliente_nit", ancho: 13 },
            { titulo: "Operador", campo: "operador", ancho: 20 },
            { titulo: "Grúa", campo: "grua", ancho: 7 },
            { titulo: "Placa grúa", campo: "grua_placa", ancho: 10 },
            { titulo: "Placa vehículo", campo: "placa_vehiculo", ancho: 11 },
            { titulo: "N.º vehículo", campo: "numero_vehiculo", ancho: 11 },
            { titulo: "Tipo vehículo", campo: "tipo_vehiculo", ancho: 13 },
            { titulo: "Tipo servicio", campo: "tipo_servicio", ancho: 14 },
            { titulo: "Rescate", campo: "es_rescate", formato: "si_no", ancho: 8 },
            { titulo: "Hora solicitud", campo: "hora_solicitud", formato: "fechaHora", ancho: 16 },
            { titulo: "Inicio", campo: "inicio_servicio", formato: "fechaHora", ancho: 16 },
            { titulo: "Fin", campo: "fin_servicio", formato: "fechaHora", ancho: 16 },
            { titulo: "Reacción (min)", campo: "reaccion_min", formato: "entero", ancho: 10 },
            { titulo: "Duración (min)", campo: "duracion_min", formato: "entero", ancho: 10 },
            { titulo: "Origen", campo: "origen", ancho: 22 },
            { titulo: "Destino", campo: "destino", ancho: 22 },
            { titulo: "Km vacío", campo: "km_vacio", formato: "numero", ancho: 9 },
            { titulo: "Km servicio", campo: "km_servicio", formato: "numero", ancho: 9 },
            { titulo: "Km total", campo: "km_total", formato: "numero", ancho: 9 },
            { titulo: "Km facturables", campo: "km_facturables", formato: "numero", ancho: 10 },
            // Clientes por bolsa de km (Suma)
            { titulo: "Fuera de disponibilidad", campo: "fuera_disponibilidad", formato: "si_no", ancho: 11 },
            { titulo: "Bolsa km del mes", campo: "bolsa_km_mes", formato: "numero", ancho: 11 },
            { titulo: "Tarifa básica", campo: "valor_tarifa_basica", formato: "moneda", ancho: 13 },
            // Trabajos adicionales: dos columnas (cantidad y valor) por cada concepto usado
            ...columnasConceptos,
            { titulo: "Total adicionales", campo: "valor_conceptos", formato: "moneda", ancho: 13 },
            { titulo: "Valor calculado", campo: "valor_calculado", formato: "moneda", ancho: 13 },
            { titulo: "Valor aprobado", campo: "valor_aprobado", formato: "moneda", ancho: 13 },
            { titulo: "Aprobado por", campo: "aprobado_por", ancho: 18 },
            { titulo: "Aprobado el", campo: "aprobado_en", formato: "fechaHora", ancho: 16 },
            { titulo: "Entregado sin novedad", campo: "entregado_sin_novedad", formato: "si_no", ancho: 10 },
            { titulo: "Recibe", campo: "recibe_nombre", ancho: 18 },
            { titulo: "Documento recibe", campo: "recibe_documento", ancho: 13 },
            { titulo: "Observaciones", campo: "observaciones", ancho: 35 },
            { titulo: "Observaciones entrega", campo: "observaciones_entrega", ancho: 35 },
          ],
          filas: filas.map((f) => {
            const anulado = f.estado === "anulado";
            const adicionales = { ...porServicio.get(f.id) };
            // Los anulados no suman dinero (igual que el dashboard): se dejan las cantidades
            if (anulado) for (const campo of Object.keys(adicionales)) if (campo.endsWith("_valor")) adicionales[campo] = null;
            return {
              ...f,
              ...adicionales,
              estado_texto: ESTADOS[f.estado] || f.estado,
              ...(anulado ? { valor_calculado: null, valor_aprobado: null, valor_tarifa_basica: null, valor_conceptos: null } : {}),
            };
          }),
        },
      ],
    });
    enviarExcel(res, buffer, `GruaLink_servicios_${sufijoFechas(q)}.xlsx`);
  } catch (err) {
    next(err);
  }
});

// ---------- PDF de órdenes de servicio ----------
const LIMITE_ORDENES_PDF = 500; // un PDF más grande tarda y pesa demasiado

async function enviarOrdenes(req, res, filtros, nombre) {
  const servicios = await ExportarModel.servicios(filtros, { limite: LIMITE_ORDENES_PDF });
  if (servicios.length === 0) throw errorNegocio(404, "SIN_SERVICIOS", "No hay servicios con estos filtros");
  if (servicios.length > LIMITE_ORDENES_PDF) {
    throw errorNegocio(422, "DEMASIADAS_ORDENES", `Son más de ${LIMITE_ORDENES_PDF} órdenes: reduzca el rango de fechas o filtre por cliente o grúa.`);
  }
  const conceptos = await ExportarModel.conceptosDe(servicios.map((s) => s.id));
  const buffer = await crearOrdenesPdf({
    servicios,
    conceptos,
    // El dinero solo sale para quien tiene permiso de ver valores
    mostrarValores: tienePermiso(req.usuario.rol, "valores:ver"),
    generadoPor: req.usuario.nombre,
  });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${typeof nombre === "function" ? nombre(servicios) : nombre}"`);
  res.send(buffer);
}

router.get("/ordenes", ...filtrosValidos, async (req, res, next) => {
  try {
    const q = req.query;
    await enviarOrdenes(
      req,
      res,
      {
        desde: q.desde,
        hasta: q.hasta,
        clienteId: q.cliente_id ? Number(q.cliente_id) : undefined,
        gruaId: q.grua_id ? Number(q.grua_id) : undefined,
        operadorId: q.operador_id ? Number(q.operador_id) : undefined,
        estado: q.estado,
      },
      `GruaLink_ordenes_${sufijoFechas(q)}.pdf`,
    );
  } catch (err) {
    next(err);
  }
});

router.get("/ordenes/:id", param("id").isInt({ min: 1 }).withMessage("Id inválido"), resultadoValidacion, async (req, res, next) => {
  try {
    await enviarOrdenes(req, res, { servicioId: Number(req.params.id) }, (s) => `Orden_${String(s[0].numero_orden).replace(/[^\w-]/g, "")}.pdf`);
  } catch (err) {
    next(err);
  }
});

router.get("/promedio-gruas", ...filtrosValidos, async (req, res, next) => {
  try {
    const { desde, hasta } = req.query;
    if (!desde || !hasta) throw errorNegocio(422, "FECHAS_OBLIGATORIAS", "Indique 'desde' y 'hasta'");
    const dias = (Date.parse(hasta) - Date.parse(desde)) / 86400000;
    if (dias < 0) throw errorNegocio(422, "RANGO_INVALIDO", "'desde' es posterior a 'hasta'");
    if (dias > 366) throw errorNegocio(422, "RANGO_MUY_LARGO", "El rango máximo es de un año");

    const filas = await DashboardModel.promedioGruas({ desde, hasta });
    const buffer = await crearExcel({
      titulo: "Promedio de grúas",
      hojas: [
        {
          nombre: "Promedio de grúas",
          columnas: [
            { titulo: "Fecha", campo: "fecha", formato: "fecha", ancho: 12 },
            { titulo: "Total de grúas", campo: "total", formato: "entero", ancho: 12 },
            { titulo: "En operación", campo: "en_operacion", formato: "entero", ancho: 12 },
            { titulo: "Mantenimiento", campo: "mantenimiento", formato: "entero", ancho: 13 },
            { titulo: "Inactivas", campo: "inactivas", formato: "entero", ancho: 10 },
            { titulo: "% Disponibilidad", campo: "disponibilidad", formato: "numero", ancho: 14 },
          ],
          filas,
        },
      ],
    });
    enviarExcel(res, buffer, `GruaLink_promedio_gruas_${sufijoFechas(req.query)}.xlsx`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
