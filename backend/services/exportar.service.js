/**
 * Arma los archivos que se descargan desde /api/exportar (Excel y PDF).
 *
 * Cada función recibe filtros ya leídos (ver validators/reportes.validator.js)
 * y devuelve { buffer, nombre }. El controlador solo los envía.
 * Aquí se decide QUÉ columnas lleva cada hoja; el formato (estilos, fechas,
 * totales) lo pone excel.service.
 */
const ExportarModel = require("../models/exportar.model");
const DashboardModel = require("../models/dashboard.model");
const TurnoModel = require("../models/turno.model");
const BolsaKmModel = require("../models/bolsaKm.model");
const { TarifaAdminModel, PrecioConceptoModel, ReglaPagoModel, listarConVigencia } = require("../models/tarifaAdmin.model");
const { crearExcel } = require("./excel.service");
const { crearOrdenesPdf } = require("./pdf.service");
const PagoOperador = require("./pagoOperador.service");
const Cobro = require("./cobro.service");
const { errorNegocio } = require("../utils/errores");
const { validarRango } = require("../validators/reportes.validator");
const { ESTADOS_SERVICIO, ESTADOS_TURNO, UNIDADES_COBRO, COMPONENTES_PAGO, FORMAS_BOLSA } = require("../utils/textos");

const LIMITE_ORDENES_PDF = 500; // un PDF más grande tarda y pesa demasiado

const sufijoFechas = (f) => [f.desde, f.hasta].filter(Boolean).join("_a_") || "todo";
const vigencia = [
  { titulo: "Vigente desde", campo: "vigente_desde", formato: "fecha", ancho: 12 },
  { titulo: "Vigente hasta", campo: "vigente_hasta", formato: "fecha", ancho: 12 },
];
const usoTexto = (usada) => (usada ? "En uso" : "Sin uso");

// Fecha/hora → texto en hora de Colombia ("2026-11-24 06:05:00"), como espera crearExcel
const horaColombia = (d) =>
  d ? new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "medium" }).format(new Date(d)) : null;

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
    usados.set(c.concepto_id, { nombre: c.concepto, unidad: UNIDADES_COBRO[c.unidad_cobro] || c.unidad_cobro });
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

// ---------- Servicios (una hoja, conceptos en columnas) ----------
async function serviciosExcel(filtros) {
  const filas = await ExportarModel.servicios(filtros);
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
            estado_texto: ESTADOS_SERVICIO[f.estado] || f.estado,
            ...(anulado ? { valor_calculado: null, valor_aprobado: null, valor_tarifa_basica: null, valor_conceptos: null } : {}),
          };
        }),
      },
    ],
  });
  return { buffer, nombre: `GruaLink_servicios_${sufijoFechas(filtros)}.xlsx` };
}

// ---------- PDF de órdenes de servicio ----------
/**
 * filtros: los de ExportarModel.servicios (incluye servicioId / servicioIds).
 * nombre: texto, o función (servicios) => texto.
 * mostrarValores: el dinero solo sale para quien tiene permiso de ver valores.
 */
async function ordenesPdf(filtros, { nombre, mostrarValores, generadoPor }) {
  const servicios = await ExportarModel.servicios(filtros, { limite: LIMITE_ORDENES_PDF });
  if (servicios.length === 0) throw errorNegocio(404, "SIN_SERVICIOS", "No hay servicios con estos filtros");
  if (servicios.length > LIMITE_ORDENES_PDF) {
    throw errorNegocio(422, "DEMASIADAS_ORDENES", `Son más de ${LIMITE_ORDENES_PDF} órdenes: reduzca el rango de fechas o filtre por cliente o grúa.`);
  }
  const conceptos = await ExportarModel.conceptosDe(servicios.map((s) => s.id));
  const buffer = await crearOrdenesPdf({ servicios, conceptos, mostrarValores, generadoPor });
  return { buffer, nombre: typeof nombre === "function" ? nombre(servicios) : nombre };
}

const ordenesDelPeriodo = (filtros, opciones) => ordenesPdf(filtros, { ...opciones, nombre: `GruaLink_ordenes_${sufijoFechas(filtros)}.pdf` });

const ordenDeServicio = (servicioId, opciones) =>
  ordenesPdf({ servicioId }, { ...opciones, nombre: (s) => `Orden_${String(s[0].numero_orden).replace(/[^\w-]/g, "")}.pdf` });

// ---------- Cobro mensual ----------
async function cobroExcel(filtros) {
  const { buffer, nombre } = await Cobro.excel(filtros);
  return { buffer, nombre: nombre.replace(/[^\w .()-]/g, "") };
}

// Órdenes de servicio (PDF) de los mismos servicios del cobro
async function cobroOrdenesPdf(filtros, opciones) {
  const ids = (await Cobro.datos(filtros)).flatMap((e) => e.servicios.map((s) => s.id));
  if (!ids.length) throw errorNegocio(404, "SIN_SERVICIOS", "No hay servicios para cobrar en ese mes");
  return ordenesPdf({ servicioIds: ids }, { ...opciones, nombre: `Ordenes ${filtros.mes.replace("-", "")}.pdf` });
}

// ---------- Liquidación de operadores ----------
async function pagoOperadoresExcel(filtros) {
  const { operadores, servicios } = await PagoOperador.liquidacion(filtros);
  const buffer = await crearExcel({
    titulo: "Liquidación de operadores",
    hojas: [
      {
        nombre: "Resumen por operador",
        totales: ["servicios", "aprobados", "pago_aprobado", "pago_pendiente", "pago_total"],
        columnas: [
          { titulo: "Operador", campo: "operador", ancho: 26 },
          { titulo: "Servicios", campo: "servicios", formato: "entero", ancho: 10 },
          { titulo: "Aprobados", campo: "aprobados", formato: "entero", ancho: 10 },
          { titulo: "Pago aprobado", campo: "pago_aprobado", formato: "moneda", ancho: 15 },
          { titulo: "Pendiente (sin aprobar)", campo: "pago_pendiente", formato: "moneda", ancho: 15 },
          { titulo: "Total", campo: "pago_total", formato: "moneda", ancho: 15 },
        ],
        filas: operadores,
      },
      {
        nombre: "Detalle por servicio",
        totales: ["valor_servicio", "pago"],
        columnas: [
          { titulo: "Operador", campo: "operador", ancho: 24 },
          { titulo: "Orden", campo: "numero_orden", ancho: 9 },
          { titulo: "Fecha", campo: "fecha_servicio", formato: "fecha", ancho: 11 },
          { titulo: "Cliente", campo: "cliente", ancho: 20 },
          { titulo: "Servicio", campo: "tipo_servicio", ancho: 16 },
          { titulo: "Grúa", campo: "grua", ancho: 7 },
          { titulo: "Estado", campo: "estado_texto", ancho: 12 },
          { titulo: "Valor del servicio", campo: "valor_servicio", formato: "moneda", ancho: 14 },
          { titulo: "Pago al operador", campo: "pago", formato: "moneda", ancho: 14 },
          { titulo: "Provisional", campo: "provisional", formato: "si_no", ancho: 10 },
          { titulo: "Cómo se calculó", campo: "como", ancho: 60 },
        ],
        filas: servicios.map((s) => ({
          ...s,
          estado_texto: ESTADOS_SERVICIO[s.estado] || s.estado,
          como: s.partes.filter((p) => p.pago > 0).map((p) => `${p.parte}: ${p.regla}`).join(" · "),
        })),
      },
    ],
  });
  return { buffer, nombre: `GruaLink_pago_operadores_${sufijoFechas(filtros)}.xlsx` };
}

// ---------- Tarifas (cuatro hojas) ----------
async function tarifasExcel({ clienteId, vigenteEn }) {
  const opciones = { clienteId, vigenteEn, limite: ExportarModel.LIMITE_FILAS };
  const [tarifas, precios, reglas, bolsa] = await Promise.all([
    listarConVigencia(TarifaAdminModel, opciones),
    listarConVigencia(PrecioConceptoModel, opciones),
    listarConVigencia(ReglaPagoModel, opciones),
    BolsaKmModel.celdasParaExportar({ clienteId, vigenteEn }),
  ]);

  const buffer = await crearExcel({
    titulo: "Tarifas",
    hojas: [
      {
        nombre: "Tarifa básica",
        columnas: [
          { titulo: "Cliente", campo: "cliente_nombre", ancho: 24 },
          { titulo: "Tipo de servicio", campo: "tipo_servicio", ancho: 22 },
          { titulo: "Tipo de vehículo", campo: "tipo_vehiculo", ancho: 16 },
          { titulo: "Km desde", campo: "km_desde", formato: "numero", ancho: 9 },
          { titulo: "Km hasta", campo: "km_hasta", formato: "numero", ancho: 9 },
          { titulo: "Valor", campo: "valor", formato: "moneda", ancho: 14 },
          ...vigencia,
          { titulo: "Uso", campo: "uso", ancho: 9 },
        ],
        filas: tarifas.map((t) => ({ ...t, uso: usoTexto(t.usada) })),
      },
      {
        nombre: "Precios de conceptos",
        columnas: [
          { titulo: "Concepto", campo: "concepto", ancho: 30 },
          { titulo: "Unidad", campo: "unidad", ancho: 9 },
          { titulo: "Cliente", campo: "cliente_nombre", ancho: 24 },
          { titulo: "Valor unitario", campo: "valor", formato: "moneda", ancho: 14 },
          ...vigencia,
          { titulo: "Uso", campo: "uso", ancho: 9 },
        ],
        filas: precios.map((p) => ({ ...p, unidad: UNIDADES_COBRO[p.unidad_cobro] || p.unidad_cobro, uso: usoTexto(p.usada) })),
      },
      {
        nombre: "Pago a operadores",
        columnas: [
          { titulo: "Cliente", campo: "cliente_nombre", ancho: 24 },
          { titulo: "Aplica a", campo: "aplica", ancho: 30 },
          { titulo: "Cómo se paga", campo: "como", ancho: 28 },
          ...vigencia,
          { titulo: "Uso", campo: "uso", ancho: 9 },
        ],
        filas: reglas.map((r) => ({
          ...r,
          aplica: r.componente === "concepto" ? r.concepto : COMPONENTES_PAGO[r.componente],
          como:
            r.forma === "porcentaje"
              ? `${Number(r.valor)} %`
              : r.forma === "fijo_servicio"
                ? `$${Math.round(r.valor).toLocaleString("es-CO")} fijo por servicio`
                : "No se paga",
          uso: usoTexto(r.usada),
        })),
      },
      {
        nombre: "Bolsa de kilómetros",
        columnas: [
          { titulo: "Cliente", campo: "cliente", ancho: 16 },
          { titulo: "Km del mes desde", campo: "bolsa_km_desde", formato: "numero", ancho: 12 },
          { titulo: "Km del mes hasta", campo: "bolsa_km_hasta", formato: "numero", ancho: 12 },
          { titulo: "Km del servicio desde", campo: "km_desde", formato: "numero", ancho: 12 },
          { titulo: "Km del servicio hasta", campo: "km_hasta", formato: "numero", ancho: 12 },
          { titulo: "Forma", campo: "forma_texto", ancho: 12 },
          { titulo: "Valor", campo: "valor", formato: "moneda", ancho: 14 },
          ...vigencia,
        ],
        filas: bolsa.map((b) => ({ ...b, forma_texto: FORMAS_BOLSA[b.forma] || b.forma })),
      },
    ],
  });
  return { buffer, nombre: `GruaLink_tarifas_${vigenteEn ? `vigentes_${vigenteEn}` : "todas"}.xlsx` };
}

// ---------- Turnos de los operadores ----------
async function turnosExcel(filtros) {
  const turnos = await TurnoModel.listar({ ...filtros, limite: ExportarModel.LIMITE_FILAS });
  const buffer = await crearExcel({
    titulo: "Turnos de operadores",
    hojas: [
      {
        nombre: "Turnos",
        totales: ["horas", "servicios"],
        columnas: [
          { titulo: "Operador", campo: "operador_nombre", ancho: 24 },
          { titulo: "Grúa", campo: "grua_numero", ancho: 7 },
          { titulo: "Placa grúa", campo: "grua_placa", ancho: 10 },
          { titulo: "Inicio", campo: "inicio_texto", formato: "fechaHora", ancho: 16 },
          { titulo: "Fin", campo: "fin_texto", formato: "fechaHora", ancho: 16 },
          { titulo: "Horas", campo: "horas", formato: "numero", ancho: 8 },
          { titulo: "Servicios", campo: "servicios", formato: "entero", ancho: 9 },
          { titulo: "Estado", campo: "estado_texto", ancho: 16 },
          { titulo: "Cerrado por", campo: "cerrado_por_nombre", ancho: 18 },
          { titulo: "Observaciones al iniciar", campo: "observaciones_inicio", ancho: 30 },
          { titulo: "Observaciones al cerrar", campo: "observaciones_cierre", ancho: 35 },
        ],
        filas: turnos.map((t) => ({
          ...t,
          inicio_texto: horaColombia(t.inicio),
          fin_texto: horaColombia(t.fin),
          horas: Math.round((t.duracion_min / 60) * 100) / 100,
          estado_texto: ESTADOS_TURNO[t.estado] || t.estado,
        })),
      },
    ],
  });
  return { buffer, nombre: `GruaLink_turnos_${sufijoFechas(filtros)}.xlsx` };
}

// ---------- Promedio de grúas (máx. un año) ----------
async function promedioGruasExcel({ desde, hasta }) {
  if (!desde || !hasta) throw errorNegocio(422, "FECHAS_OBLIGATORIAS", "Indique 'desde' y 'hasta'");
  validarRango(desde, hasta);
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
  return { buffer, nombre: `GruaLink_promedio_gruas_${sufijoFechas({ desde, hasta })}.xlsx` };
}

module.exports = {
  serviciosExcel,
  ordenesDelPeriodo,
  ordenDeServicio,
  cobroExcel,
  cobroOrdenesPdf,
  pagoOperadoresExcel,
  tarifasExcel,
  turnosExcel,
  promedioGruasExcel,
};
