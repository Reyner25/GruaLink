/**
 * COBRO MENSUAL a las empresas (Reportes → Cobro).
 *
 * Replica el Excel que se envía cada mes ("AAAAMM Servicios de grúas cobro"):
 *  - Hoja RESUMEN: por empresa, cantidad de servicios, subtotal, IVA 19 % y
 *    total; fila TOTAL GENERAL. Las cifras son fórmulas a las hojas de cada empresa.
 *  - Una hoja por empresa: "SERVICIO DE GRÚA PRESTADOS A …", una fila por
 *    servicio con la tarifa y cada adicional en su columna (cardán, persiana,
 *    cámaras, recargo nocturno, rescate), total a cobrar y observaciones;
 *    al final Sub Total, IVA 19 % y Total.
 *  - Clientes por bolsa de km (Suma): columna KM (servicio + vacío) y un
 *    resumen por grúa al final.
 *
 * Qué servicios entran: los del MES (fecha del servicio) APROBADOS. Opcional:
 * incluir también los finalizados / en revisión sin aprobar (salen marcados).
 * Valor a cobrar: el aprobado; si aún no se aprueba, el calculado.
 */
const ExcelJS = require("exceljs");
const { pool } = require("../config/db");

const IVA = 0.19;
const AZUL_TITULO = "FF0B1F3A";
const AZUL_ENCABEZADO = "FF1F3B73";
const AMARILLO_PENDIENTE = "FFFFF4CC";
const MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];

const nombreMes = (mes) => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;

// Columna de cada adicional (por el nombre del concepto)
function columnaConcepto(c) {
  if (c.es_recargo_nocturno) return "recargo";
  const n = c.nombre.toLowerCase();
  if (/card[aá]n|\beje\b|tubo/.test(n)) return "cardan";
  if (/persiana/.test(n)) return "persiana";
  if (/c[aá]mara/.test(n)) return "camaras";
  return "otros";
}

/**
 * Servicios del mes agrupados por empresa, con sus valores repartidos en
 * las columnas del cobro.
 */
async function datos({ mes, clienteId, incluirSinAprobar = false }) {
  const estados = incluirSinAprobar ? ["aprobado", "finalizado", "en_revision"] : ["aprobado"];
  const valores = [mes, estados];
  let filtroCliente = "";
  if (clienteId) {
    valores.push(clienteId);
    filtroCliente = `AND s.cliente_id = $${valores.length}`;
  }
  const hora = (col) => `to_char(${col} AT TIME ZONE 'America/Bogota', 'HH24:MI')`;
  const { rows: servicios } = await pool.query(
    `SELECT s.id, s.numero_orden, s.fecha_servicio::text AS fecha, s.estado,
            ${hora("s.inicio_servicio")} AS hora_inicio, ${hora("s.fin_servicio")} AS hora_fin,
            g.placa AS grua_placa, s.numero_vehiculo, s.placa_vehiculo,
            COALESCE(s.tipo_vehiculo_otro, tv.nombre) AS tipo_vehiculo,
            c.id AS cliente_id, COALESCE(c.nombre_comercial, c.razon_social) AS cliente, c.modalidad_cobro,
            u.nombre AS operador, s.origen, s.destino,
            s.km_servicio + s.km_vacio AS km_bolsa,
            s.valor_tarifa_basica, s.valor_conceptos, s.valor_calculado, s.valor_aprobado,
            COALESCE(NULLIF(s.observaciones_entrega, ''), s.observaciones) AS observaciones
     FROM servicios s
     JOIN clientes c ON c.id = s.cliente_id
     JOIN gruas g ON g.id = s.grua_id
     JOIN usuarios u ON u.id = s.operador_id
     JOIN tipos_vehiculo tv ON tv.id = s.tipo_vehiculo_id
     WHERE to_char(s.fecha_servicio, 'YYYY-MM') = $1 AND s.estado = ANY($2::text[]) ${filtroCliente}
     ORDER BY cliente, s.fecha_servicio, s.inicio_servicio NULLS LAST, s.id`,
    valores,
  );
  const ids = servicios.map((s) => s.id);
  const { rows: conceptos } = ids.length
    ? await pool.query(
        `SELECT sc.servicio_id, ct.nombre, ct.es_recargo_nocturno, sc.total
         FROM servicio_conceptos sc JOIN conceptos_tarifa ct ON ct.id = sc.concepto_id
         WHERE sc.servicio_id = ANY($1::int[])`,
        [ids],
      )
    : { rows: [] };

  const empresas = new Map();
  for (const s of servicios) {
    const col = { cardan: 0, persiana: 0, camaras: 0, recargo: 0, otros: 0 };
    for (const c of conceptos.filter((x) => x.servicio_id === s.id)) col[columnaConcepto(c)] += Number(c.total);
    const aprobado = s.estado === "aprobado";
    const total = aprobado ? Number(s.valor_aprobado) : s.valor_calculado === null ? null : Number(s.valor_calculado);
    const conceptosTotal = Object.values(col).reduce((a, b) => a + b, 0);
    // Sin tarifa (rescate / a convenir): lo aprobado menos los adicionales va en "M.Rescate"
    const aConvenir = s.valor_tarifa_basica === null;
    const tarifa = aConvenir ? 0 : Number(s.valor_tarifa_basica);
    const rescate = aConvenir && total !== null ? Math.max(0, total - conceptosTotal) : 0;
    const suma = tarifa + rescate + conceptosTotal;
    const notas = [];
    if (!aprobado) notas.push(total === null ? "SIN APROBAR · valor a convenir pendiente" : "SIN APROBAR");
    if (total !== null && Math.round(total) !== Math.round(suma)) notas.push(`Valor aprobado con ajuste (calculado ${Math.round(suma).toLocaleString("es-CO")})`);
    if (s.observaciones) notas.push(s.observaciones);

    const fila = {
      ...s,
      numero_vehiculo: s.numero_vehiculo || s.placa_vehiculo,
      tarifa,
      ...col,
      rescate,
      total: total ?? 0,
      ajustado: total !== null && Math.round(total) !== Math.round(suma),
      pendiente: !aprobado,
      observaciones: notas.join(" · "),
    };
    if (!empresas.has(s.cliente_id)) {
      empresas.set(s.cliente_id, { cliente_id: s.cliente_id, cliente: s.cliente, bolsa: s.modalidad_cobro === "bolsa_km_mensual", servicios: [] });
    }
    empresas.get(s.cliente_id).servicios.push(fila);
  }
  return [...empresas.values()].map((e) => {
    const subtotal = e.servicios.reduce((t, s) => t + s.total, 0);
    return {
      ...e,
      cantidad: e.servicios.length,
      sin_aprobar: e.servicios.filter((s) => s.pendiente).length,
      subtotal,
      iva: Math.round(subtotal * IVA * 100) / 100,
      total: Math.round(subtotal * (1 + IVA) * 100) / 100,
    };
  });
}

// ---------- Excel ----------
const borde = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
const MONEDA = '"$" #,##0';
const letra = (n) => {
  let s = "";
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};
const fechaExcel = (iso) => {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d));
};
const horaExcel = (hhmm) => {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return (h * 60 + m) / 1440; // fracción del día
};

// Nombre de hoja válido y único (máx. 31 caracteres, sin : \ / ? * [ ])
function nombreHoja(nombre, usados) {
  let base = nombre.replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31) || "Empresa";
  let n = base;
  for (let i = 2; usados.has(n.toLowerCase()); i++) n = `${base.slice(0, 28)} ${i}`;
  usados.add(n.toLowerCase());
  return n;
}

function hojaEmpresa(libro, empresa, nombre) {
  const ws = libro.addWorksheet(nombre, { views: [{ state: "frozen", ySplit: 2 }] });
  const hayOtros = empresa.servicios.some((s) => s.otros > 0);
  // [título, campo, ancho, formato]
  const columnas = [
    ["Placa Grua", "grua_placa", 14],
    ["No. Orden de servicio", "numero_orden", 16],
    ["Número de Vehículo", "numero_vehiculo", 18],
    ["Tipo Vehiculo", "tipo_vehiculo", 15],
    ["Empresa y/o cliente", "cliente", 20],
    ["Operador  Grua", "operador", 20],
    ["Fecha", "fecha", 12, "fecha"],
    ["H.de inicio", "hora_inicio", 11, "hora"],
    ["H.de final", "hora_fin", 11, "hora"],
    ["Origen del Servicio", "origen", 28],
    ["Destino del Servicio", "destino", 28],
    ...(empresa.bolsa ? [["KM", "km_bolsa", 9, "numero"]] : []),
    ["Tarifa", "tarifa", 15, "moneda", true],
    ["Cardan/Eje/Tubo de Admisión", "cardan", 16, "moneda", true],
    ["persiana", "persiana", 13, "moneda", true],
    ["camaras", "camaras", 13, "moneda", true],
    ["Recargo Nocturno", "recargo", 14, "moneda", true],
    ["M.Rescate", "rescate", 14, "moneda", true],
    ...(hayOtros ? [["Otros adicionales (stand-by, kit, reiniciada…)", "otros", 18, "moneda", true]] : []),
    ["Tal.Tarifa a cobrar", "total", 17, "moneda"],
    ["Observaciones", "observaciones", 45],
  ];
  const nCols = columnas.length;
  const colTotal = columnas.findIndex((c) => c[1] === "total") + 1;
  const sumables = columnas.map((c, i) => (c[4] ? i + 1 : null)).filter(Boolean);

  // Título
  ws.mergeCells(1, 1, 1, nCols);
  const titulo = ws.getCell(1, 1);
  titulo.value = `SERVICIO DE GRÚA PRESTADOS A ${empresa.cliente.toUpperCase()}`;
  titulo.font = { bold: true, size: 16, color: { argb: "FFFFFFFF" } };
  titulo.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL_TITULO } };
  titulo.alignment = { horizontal: "center", vertical: "middle" };
  ws.getRow(1).height = 30;

  // Encabezados
  const enc = ws.getRow(2);
  columnas.forEach(([t, , ancho], i) => {
    const celda = enc.getCell(i + 1);
    celda.value = t;
    celda.font = { bold: true, color: { argb: "FFFFFFFF" } };
    celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL_ENCABEZADO } };
    celda.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    celda.border = borde;
    ws.getColumn(i + 1).width = ancho;
  });
  enc.height = 32;

  // Servicios
  const primera = 3;
  empresa.servicios.forEach((s, k) => {
    const r = primera + k;
    const fila = ws.getRow(r);
    columnas.forEach(([, campo, , formato], i) => {
      const celda = fila.getCell(i + 1);
      let v = s[campo];
      if (formato === "fecha") v = fechaExcel(v);
      else if (formato === "hora") v = horaExcel(v);
      else if (formato === "moneda" || formato === "numero") v = v === null || v === undefined ? 0 : Number(v);
      celda.value = v ?? "";
      if (formato === "fecha") celda.numFmt = "dd/mm/yyyy";
      if (formato === "hora") celda.numFmt = "h:mm";
      if (formato === "moneda") celda.numFmt = MONEDA;
      if (formato === "numero") celda.numFmt = "#,##0.0";
      celda.border = borde;
      celda.alignment = { vertical: "middle", wrapText: campo === "observaciones" || campo === "origen" || campo === "destino" };
      if (s.pendiente) celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AMARILLO_PENDIENTE } };
    });
    // Total a cobrar: SUMA de las columnas (como el Excel) salvo que se haya aprobado otro valor
    const celdaTotal = fila.getCell(colTotal);
    celdaTotal.value = s.ajustado
      ? s.total
      : { formula: `SUM(${sumables.map((c) => `${letra(c)}${r}`).join(",")})`, result: s.total };
  });
  const ultima = primera + empresa.servicios.length - 1;

  // Sub Total / IVA / Total (debajo, en la columna anterior al total)
  const fSub = ultima + 1;
  const etiquetas = [
    ["Sub Total", { formula: `SUM(${letra(colTotal)}${primera}:${letra(colTotal)}${ultima})`, result: empresa.subtotal }],
    [`IVA ${IVA * 100}%`, { formula: `${letra(colTotal)}${fSub}*${IVA}`, result: empresa.iva }],
    ["Total", { formula: `${letra(colTotal)}${fSub}+${letra(colTotal)}${fSub + 1}`, result: empresa.total }],
  ];
  etiquetas.forEach(([texto, valor], k) => {
    const r = fSub + k;
    const e = ws.getCell(r, colTotal - 1);
    e.value = texto;
    e.font = { bold: true };
    e.alignment = { horizontal: "right" };
    const v = ws.getCell(r, colTotal);
    v.value = valor;
    v.numFmt = MONEDA;
    v.font = { bold: true };
    v.border = borde;
  });
  if (empresa.bolsa) {
    const colKm = columnas.findIndex((c) => c[1] === "km_bolsa") + 1;
    const km = ws.getCell(fSub, colKm);
    km.value = { formula: `SUM(${letra(colKm)}${primera}:${letra(colKm)}${ultima})`, result: empresa.servicios.reduce((t, s) => t + Number(s.km_bolsa || 0), 0) };
    km.numFmt = "#,##0.0";
    km.font = { bold: true };

    // Resumen por grúa (como el del Excel de Suma)
    let r = fSub + 5;
    const cab = ws.getRow(r);
    cab.getCell(2).value = "Grúa";
    cab.getCell(3).value = "Total a cobrar";
    [2, 3].forEach((c) => {
      cab.getCell(c).font = { bold: true, color: { argb: "FFFFFFFF" } };
      cab.getCell(c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL_ENCABEZADO } };
      cab.getCell(c).border = borde;
    });
    const placas = [...new Set(empresa.servicios.map((s) => s.grua_placa))];
    for (const placa of placas) {
      r++;
      ws.getCell(r, 2).value = placa;
      ws.getCell(r, 3).value = {
        formula: `SUMIF(A${primera}:A${ultima},"${placa}",${letra(colTotal)}${primera}:${letra(colTotal)}${ultima})`,
        result: empresa.servicios.filter((s) => s.grua_placa === placa).reduce((t, s) => t + s.total, 0),
      };
      ws.getCell(r, 3).numFmt = MONEDA;
      [2, 3].forEach((c) => (ws.getCell(r, c).border = borde));
    }
    r++;
    ws.getCell(r, 2).value = "Total general";
    ws.getCell(r, 3).value = { formula: `SUM(C${fSub + 6}:C${r - 1})`, result: empresa.subtotal };
    ws.getCell(r, 3).numFmt = MONEDA;
    [2, 3].forEach((c) => {
      ws.getCell(r, c).font = { bold: true };
      ws.getCell(r, c).border = borde;
    });
  }
  return { hoja: nombre, celdaSub: `${letra(colTotal)}${fSub}`, celdaIva: `${letra(colTotal)}${fSub + 1}`, celdaTotal: `${letra(colTotal)}${fSub + 2}` };
}

async function excel({ mes, clienteId, incluirSinAprobar }) {
  const empresas = await datos({ mes, clienteId, incluirSinAprobar });
  const libro = new ExcelJS.Workbook();
  libro.creator = "GruaLink";
  libro.title = `Cobro de servicios de grúa ${nombreMes(mes)}`;

  // RESUMEN primero (las fórmulas apuntan a las hojas de cada empresa)
  const resumen = libro.addWorksheet("RESUMEN");
  const usados = new Set(["resumen"]);
  const refs = empresas.map((e) => ({ e, ...hojaEmpresa(libro, e, nombreHoja(e.cliente, usados)) }));

  resumen.mergeCells("A1:E1");
  const t = resumen.getCell("A1");
  t.value = `RESUMEN DE FACTURACIÓN POR EMPRESA · ${nombreMes(mes)}`;
  t.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL_TITULO } };
  t.alignment = { horizontal: "center", vertical: "middle" };
  resumen.getRow(1).height = 28;
  ["Empresa", "Cantidad de servicios", "Subtotal", `IVA ${IVA * 100}%`, "Total"].forEach((txt, i) => {
    const c = resumen.getCell(2, i + 1);
    c.value = txt;
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL_ENCABEZADO } };
    c.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    c.border = borde;
  });
  [28, 14, 18, 16, 18].forEach((w, i) => (resumen.getColumn(i + 1).width = w));
  refs.forEach(({ e, hoja, celdaSub, celdaIva, celdaTotal }, k) => {
    const r = 3 + k;
    const q = `'${hoja.replace(/'/g, "''")}'`;
    resumen.getCell(r, 1).value = e.cliente + (e.sin_aprobar ? ` (${e.sin_aprobar} sin aprobar)` : "");
    resumen.getCell(r, 2).value = e.cantidad;
    resumen.getCell(r, 3).value = { formula: `${q}!${celdaSub}`, result: e.subtotal };
    resumen.getCell(r, 4).value = { formula: `${q}!${celdaIva}`, result: e.iva };
    resumen.getCell(r, 5).value = { formula: `${q}!${celdaTotal}`, result: e.total };
    for (let c = 1; c <= 5; c++) {
      resumen.getCell(r, c).border = borde;
      if (c >= 3) resumen.getCell(r, c).numFmt = MONEDA;
    }
  });
  const rt = 3 + refs.length;
  resumen.getCell(rt, 1).value = "TOTAL GENERAL";
  ["B", "C", "D", "E"].forEach((col, i) => {
    const c = resumen.getCell(`${col}${rt}`);
    const campo = ["cantidad", "subtotal", "iva", "total"][i];
    c.value = { formula: `SUM(${col}3:${col}${rt - 1})`, result: empresas.reduce((s, e) => s + e[campo], 0) };
    if (i > 0) c.numFmt = MONEDA;
  });
  for (let c = 1; c <= 5; c++) {
    resumen.getCell(rt, c).font = { bold: true };
    resumen.getCell(rt, c).border = borde;
  }
  if (!empresas.length) resumen.getCell("A3").value = "No hay servicios para cobrar en este mes.";

  const sufijo = clienteId && empresas[0] ? ` ${empresas[0].cliente}` : "";
  return { buffer: await libro.xlsx.writeBuffer(), nombre: `${mes.replace("-", "")} Servicios de gruas cobro${sufijo}.xlsx` };
}

module.exports = { datos, excel, IVA };
