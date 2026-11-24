/**
 * Genera el PDF de las ÓRDENES DE SERVICIO (una orden por página, tamaño carta).
 *
 * crearOrdenesPdf({ servicios, conceptos, mostrarValores, generadoPor })
 * devuelve un Buffer listo para descargar.
 *
 *   servicios:  filas de ExportarModel.servicios (fechas ya en hora de Colombia, como texto)
 *   conceptos:  filas de ExportarModel.conceptosDe (trabajos adicionales)
 *   mostrarValores: false → la orden sale sin dinero (para quien no tiene "valores:ver")
 *
 * Contenido de cada orden: encabezado con el número de orden, datos del
 * servicio, vehículo, recorrido y tiempos, trabajos adicionales, valores,
 * entrega, observaciones y firmas. Los servicios anulados llevan una marca
 * de agua "ANULADO".
 *
 * Usa las fuentes estándar del PDF (Helvetica): no hay que instalar fuentes y
 * soportan tildes y ñ.
 */
const PDFDocument = require("pdfkit");

const EMPRESA = "SOCIEDAD TRANSPORTADORA DE LOS ANDES S.A. — SOTRANDES";
const AZUL = "#0B1F3A";
const GRIS = "#5F6B7A";
const TEXTO = "#111827";
const LINEA = "#C9D2DE";
const FONDO = "#EEF3FA";

// Página carta: 612 × 792 puntos (1 punto = 1/72 de pulgada)
const ALTO_PAGINA = 792;
const M = 36; // margen
const ANCHO = 612 - 2 * M;
const Y_FIRMAS = ALTO_PAGINA - M - 78; // las firmas van siempre abajo

const { ESTADOS_SERVICIO: ESTADOS } = require("../utils/textos");
// Unidades abreviadas para la orden (en el Excel van completas: utils/textos.js)
const UNIDADES = { evento: "evento", hora: "h", km: "km", cantidad: "und." };

// ---------- Formatos ----------
const vacio = (v) => v === null || v === undefined || v === "";
const texto = (v) => (vacio(v) ? "—" : String(v));
const fmtMoneda = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
const moneda = (v) => (vacio(v) ? "—" : fmtMoneda.format(Number(v)));
const numero = (v) => (vacio(v) ? "—" : new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(Number(v)));

// "2026-11-20 16:18:00" → "20/11/2026 16:18" ;  "2026-11-20" → "20/11/2026"
function fechaHora(t) {
  if (vacio(t)) return "—";
  const m = String(t).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return String(t);
  return `${m[3]}/${m[2]}/${m[1]}${m[4] ? ` ${m[4]}:${m[5]}` : ""}`;
}
const soloHora = (t) => (vacio(t) ? "—" : fechaHora(t).split(" ")[1] || "—");

function duracion(min) {
  if (vacio(min)) return "—";
  const n = Number(min);
  return n < 60 ? `${n} min` : `${Math.floor(n / 60)} h ${n % 60} min`;
}

const ahoraBogota = () =>
  new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" }).format(new Date());

// ---------- Piezas de la página ----------
function encabezado(doc, s) {
  doc.rect(M, M, ANCHO, 62).fill(AZUL);
  doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(15).text("ORDEN DE SERVICIO DE GRÚA", M + 14, M + 14, { width: ANCHO - 170 });
  doc.font("Helvetica").fontSize(8).text(EMPRESA, M + 14, M + 36, { width: ANCHO - 170 });

  const x = M + ANCHO - 160;
  doc.font("Helvetica").fontSize(7.5).text("N.º DE ORDEN", x, M + 10, { width: 146, align: "right" });
  doc.font("Helvetica-Bold").fontSize(24).text(texto(s.numero_orden), x, M + 22, { width: 146, align: "right" });

  const y = M + 62 + 8;
  doc.fillColor(GRIS).font("Helvetica").fontSize(9);
  doc.text(`Fecha del servicio: `, M, y, { continued: true }).fillColor(TEXTO).font("Helvetica-Bold").text(fechaHora(s.fecha_servicio), { continued: true });
  doc.fillColor(GRIS).font("Helvetica").text(`      Estado: `, { continued: true }).fillColor(TEXTO).font("Helvetica-Bold").text(ESTADOS[s.estado] || s.estado);
  return y + 20;
}

function seccion(doc, titulo, y) {
  doc.rect(M, y, ANCHO, 15).fill(FONDO);
  doc.fillColor(AZUL).font("Helvetica-Bold").fontSize(8).text(titulo.toUpperCase(), M + 8, y + 4, { characterSpacing: 0.6 });
  return y + 21;
}

/**
 * Una fila de datos "etiqueta / valor". La fila se divide en 4 partes;
 * cada celda dice cuántas ocupa: [etiqueta, valor, partes = 1].
 * Los textos largos se cortan con "…" para que la orden quepa en una página.
 */
function filaCampos(doc, y, celdas, { maxAlto = 24 } = {}) {
  const parte = ANCHO / 4;
  let x = M;
  let alto = 0;
  for (const [etiqueta, valor, partes = 1] of celdas) {
    const w = parte * partes - 10;
    doc.fillColor(GRIS).font("Helvetica").fontSize(7).text(etiqueta, x + 2, y, { width: w, lineBreak: false });
    const v = texto(valor);
    doc.fillColor(TEXTO).font("Helvetica-Bold").fontSize(9);
    const h = Math.min(doc.heightOfString(v, { width: w }), maxAlto);
    doc.text(v, x + 2, y + 9, { width: w, height: maxAlto, ellipsis: true });
    alto = Math.max(alto, 9 + h);
    x += parte * partes;
  }
  return y + alto + 7;
}

const MAX_CONCEPTOS = 8;
function tablaConceptos(doc, y, conceptos, mostrarValores) {
  if (conceptos.length === 0) {
    doc.fillColor(GRIS).font("Helvetica-Oblique").fontSize(8.5).text("Sin trabajos adicionales.", M + 2, y);
    return y + 16;
  }
  // Columnas: concepto | cantidad | valor unitario | total
  const cols = mostrarValores
    ? [{ w: ANCHO - 300 }, { w: 90, a: "right" }, { w: 105, a: "right" }, { w: 105, a: "right" }]
    : [{ w: ANCHO - 120 }, { w: 120, a: "right" }];
  const fila = (valores, fuente, color) => {
    let x = M;
    doc.font(fuente).fontSize(8.5).fillColor(color);
    valores.forEach((v, i) => {
      doc.text(v, x + 2, y, { width: cols[i].w - 6, align: cols[i].a || "left", lineBreak: false, ellipsis: true });
      x += cols[i].w;
    });
    y += 13;
  };
  fila(mostrarValores ? ["Concepto", "Cantidad", "Valor unitario", "Total"] : ["Concepto", "Cantidad"], "Helvetica-Bold", GRIS);
  doc.moveTo(M, y - 2).lineTo(M + ANCHO, y - 2).strokeColor(LINEA).lineWidth(0.6).stroke();
  y += 2;

  for (const c of conceptos.slice(0, MAX_CONCEPTOS)) {
    const cantidad = `${numero(c.cantidad)} ${UNIDADES[c.unidad_cobro] || ""}`.trim();
    fila(mostrarValores ? [c.concepto, cantidad, moneda(c.valor_unitario), moneda(c.total)] : [c.concepto, cantidad], "Helvetica", TEXTO);
  }
  if (conceptos.length > MAX_CONCEPTOS) {
    doc.fillColor(GRIS).font("Helvetica-Oblique").fontSize(8).text(`… y ${conceptos.length - MAX_CONCEPTOS} concepto(s) más (ver detalle en GruaLink).`, M + 2, y);
    y += 13;
  }
  return y + 4;
}

function valores(doc, y, s) {
  const lineas = [
    ["Tarifa básica", s.valor_tarifa_basica === null && s.valor_calculado === null ? "A convenir" : moneda(s.valor_tarifa_basica)],
    ["Trabajos adicionales", moneda(s.valor_conceptos)],
    ["Valor calculado", s.valor_calculado === null ? "A convenir" : moneda(s.valor_calculado)],
  ];
  const xEtiqueta = M + ANCHO - 280;
  for (const [etiqueta, valor] of lineas) {
    doc.fillColor(GRIS).font("Helvetica").fontSize(9).text(etiqueta, xEtiqueta, y, { width: 150 });
    doc.fillColor(TEXTO).font("Helvetica").text(valor, xEtiqueta + 150, y, { width: 130 - 4, align: "right" });
    y += 13;
  }
  doc.moveTo(xEtiqueta, y).lineTo(M + ANCHO, y).strokeColor(LINEA).lineWidth(0.6).stroke();
  y += 5;
  doc.fillColor(AZUL).font("Helvetica-Bold").fontSize(10.5).text("VALOR APROBADO", xEtiqueta, y, { width: 150 });
  doc.text(vacio(s.valor_aprobado) ? "Pendiente" : moneda(s.valor_aprobado), xEtiqueta + 150, y, { width: 130 - 4, align: "right" });
  y += 15;
  if (s.aprobado_por) {
    doc.fillColor(GRIS).font("Helvetica").fontSize(7.5).text(`Aprobado por ${s.aprobado_por} el ${fechaHora(s.aprobado_en)}`, xEtiqueta, y, { width: 280, align: "right" });
    y += 11;
  }
  return y + 4;
}

function bloqueTexto(doc, y, contenido, maxAlto) {
  const v = texto(contenido);
  doc.fillColor(TEXTO).font("Helvetica").fontSize(8.5);
  const h = Math.min(doc.heightOfString(v, { width: ANCHO - 4 }), maxAlto);
  doc.text(v, M + 2, y, { width: ANCHO - 4, height: maxAlto, ellipsis: true });
  return y + h + 8;
}

function firmas(doc, s) {
  const y = Y_FIRMAS + 40;
  const w = (ANCHO - 40) / 2;
  const firma = (x, titulo, nombre, detalle) => {
    doc.moveTo(x, y).lineTo(x + w, y).strokeColor(TEXTO).lineWidth(0.7).stroke();
    doc.fillColor(TEXTO).font("Helvetica-Bold").fontSize(8.5).text(titulo, x, y + 5, { width: w });
    doc.fillColor(GRIS).font("Helvetica").fontSize(8).text(nombre || "Nombre: ______________________________", x, y + 17, { width: w, lineBreak: false, ellipsis: true });
    doc.text(detalle, x, y + 28, { width: w, lineBreak: false, ellipsis: true });
  };
  firma(M, "Operador de la grúa", texto(s.operador), `Grúa ${texto(s.grua)} · Placa ${texto(s.grua_placa)}`);
  firma(M + w + 40, "Recibe a satisfacción", s.recibe_nombre, s.recibe_documento ? `Documento: ${s.recibe_documento}` : "Documento: ______________________");
}

function marcaAnulado(doc) {
  doc.save();
  doc.rotate(-35, { origin: [306, 400] });
  doc.fillColor("#C62828").opacity(0.13).font("Helvetica-Bold").fontSize(110).text("ANULADO", 0, 345, { width: 612, align: "center", lineBreak: false });
  doc.restore();
  doc.opacity(1);
}

function orden(doc, s, conceptos, mostrarValores) {
  doc.addPage();
  if (s.estado === "anulado") marcaAnulado(doc);

  let y = encabezado(doc, s);

  y = seccion(doc, "Datos del servicio", y);
  y = filaCampos(doc, y, [["Cliente", s.cliente, 2], ["NIT", s.cliente_nit], ["Tipo de servicio", s.tipo_servicio]]);
  y = filaCampos(doc, y, [["Operador", s.operador, 2], ["Grúa", s.grua], ["Placa de la grúa", s.grua_placa]]);

  y = seccion(doc, "Vehículo atendido", y);
  y = filaCampos(doc, y, [["Placa", s.placa_vehiculo], ["N.º del vehículo", s.numero_vehiculo], ["Tipo de vehículo", s.tipo_vehiculo, 2]]);

  y = seccion(doc, "Recorrido y tiempos", y);
  y = filaCampos(doc, y, [["Origen", s.origen, 2], ["Destino", s.destino, 2]]);
  y = filaCampos(doc, y, [
    ["Hora de solicitud", fechaHora(s.hora_solicitud)],
    ["Inicio del servicio", soloHora(s.inicio_servicio)],
    ["Fin del servicio", soloHora(s.fin_servicio)],
    ["Reacción / duración", `${duracion(s.reaccion_min)} / ${duracion(s.duracion_min)}`],
  ]);
  y = filaCampos(doc, y, [
    ["Km en vacío", numero(s.km_vacio)],
    ["Km en servicio", numero(s.km_servicio)],
    ["Km total", numero(s.km_total)],
    ["Km facturables", numero(s.km_facturables)],
  ]);

  y = seccion(doc, "Trabajos adicionales", y);
  y = tablaConceptos(doc, y, conceptos, mostrarValores);

  if (mostrarValores) {
    y = seccion(doc, "Valores", y);
    y = valores(doc, y, s);
  }

  y = seccion(doc, "Entrega", y);
  y = filaCampos(doc, y, [
    ["Entregado sin novedad", s.entregado_sin_novedad ? "Sí" : "No"],
    ["Recibe", s.recibe_nombre, 2],
    ["Documento", s.recibe_documento],
  ]);

  // Observaciones: usan el espacio que quede antes de las firmas. Si hay
  // observaciones del servicio Y de la entrega, el espacio se reparte (así
  // ninguna desaparece); lo que no quepa se corta con "…".
  y = seccion(doc, "Observaciones", y);
  const disponible = () => Math.max(11, Y_FIRMAS - 6 - y);
  if (s.observaciones_entrega) {
    if (!vacio(s.observaciones)) y = bloqueTexto(doc, y, s.observaciones, Math.max(11, disponible() / 2 - 4));
    bloqueTexto(doc, y, `De la entrega: ${s.observaciones_entrega}`, disponible());
  } else {
    bloqueTexto(doc, y, s.observaciones, disponible());
  }

  firmas(doc, s);
}

async function crearOrdenesPdf({ servicios, conceptos, mostrarValores, generadoPor }) {
  const doc = new PDFDocument({
    size: "LETTER",
    autoFirstPage: false,
    bufferPages: true, // para escribir "Página X de Y" al final
    // Margen inferior pequeño: el pie de página va por debajo del contenido
    margins: { top: M, left: M, right: M, bottom: 12 },
    info: { Title: servicios.length === 1 ? `Orden de servicio ${servicios[0].numero_orden}` : "Órdenes de servicio", Author: "GruaLink", Creator: "GruaLink" },
  });
  const partes = [];
  doc.on("data", (p) => partes.push(p));
  const terminado = new Promise((resolver, rechazar) => {
    doc.on("end", () => resolver(Buffer.concat(partes)));
    doc.on("error", rechazar);
  });

  // Trabajos adicionales agrupados por servicio
  const porServicio = new Map();
  for (const c of conceptos) {
    if (!porServicio.has(c.servicio_id)) porServicio.set(c.servicio_id, []);
    porServicio.get(c.servicio_id).push(c);
  }

  for (const s of servicios) orden(doc, s, porServicio.get(s.id) || [], mostrarValores);

  // Pie de página en todas las hojas
  const generado = `Generado por GruaLink el ${ahoraBogota()}${generadoPor ? ` · ${generadoPor}` : ""}`;
  const { start, count } = doc.bufferedPageRange();
  for (let i = start; i < start + count; i++) {
    doc.switchToPage(i);
    const y = ALTO_PAGINA - M + 10;
    doc.fillColor(GRIS).font("Helvetica").fontSize(7);
    doc.text(generado, M, y, { width: ANCHO - 90, lineBreak: false });
    doc.text(`Página ${i - start + 1} de ${count}`, M + ANCHO - 90, y, { width: 90, align: "right", lineBreak: false });
  }

  doc.end();
  return terminado;
}

module.exports = { crearOrdenesPdf };
