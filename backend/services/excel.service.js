/**
 * Genera archivos de Excel (.xlsx) con ExcelJS.
 *
 * crearExcel({ titulo, hojas }) devuelve un Buffer listo para descargar.
 *
 *   hojas: [{
 *     nombre: "Servicios",
 *     columnas: [{ titulo: "Valor", campo: "valor_calculado", formato: "moneda", ancho: 14 }],
 *     filas: [{ valor_calculado: 485400, ... }],
 *     totales: ["valor_calculado"],   // (opcional) fila de totales con SUMA()
 *   }]
 *
 * Formatos: "texto" (por defecto), "numero", "entero", "moneda", "fecha",
 *           "fechaHora", "si_no".
 *
 * FECHAS: las consultas entregan la fecha/hora YA en hora de Colombia como
 * texto ("2026-11-20 16:18:00"). Aquí se convierten a fecha de Excel sin
 * zona horaria, para que Excel muestre exactamente esa hora y se pueda
 * filtrar y ordenar por fecha.
 */
const ExcelJS = require("exceljs");

const AZUL_OSCURO = "FF0B1F3A";
const GRIS_TOTAL = "FFE8F0FC";

const FORMATOS = {
  numero: "#,##0.##",
  entero: "#,##0",
  moneda: '"$" #,##0',
  fecha: "dd/mm/yyyy",
  fechaHora: "dd/mm/yyyy hh:mm",
};

// "2026-11-20" o "2026-11-20 16:18:00" → Date en UTC con esa misma hora
function aFechaExcel(texto) {
  if (!texto) return null;
  const m = String(texto).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const [, a, mes, d, h = "0", min = "0", s = "0"] = m;
  return new Date(Date.UTC(+a, +mes - 1, +d, +h, +min, +s));
}

function convertir(valor, formato) {
  if (valor === null || valor === undefined || valor === "") return null;
  if (formato === "fecha" || formato === "fechaHora") return aFechaExcel(valor);
  if (formato === "numero" || formato === "entero" || formato === "moneda") return Number(valor);
  if (formato === "si_no") return valor ? "Sí" : "No";
  return valor;
}

// Letra de columna de Excel: 1 → A, 27 → AA
function letra(n) {
  let s = "";
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

async function crearExcel({ titulo, hojas }) {
  const libro = new ExcelJS.Workbook();
  libro.creator = "GruaLink";
  libro.title = titulo;
  libro.created = new Date();

  for (const hoja of hojas) {
    const ws = libro.addWorksheet(hoja.nombre, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = hoja.columnas.map((c) => ({
      header: c.titulo,
      key: c.campo,
      width: c.ancho || Math.max(12, c.titulo.length + 2),
      style: FORMATOS[c.formato] ? { numFmt: FORMATOS[c.formato] } : {},
    }));

    // Encabezado azul oscuro con texto blanco
    const encabezado = ws.getRow(1);
    encabezado.font = { bold: true, color: { argb: "FFFFFFFF" } };
    encabezado.fill = { type: "pattern", pattern: "solid", fgColor: { argb: AZUL_OSCURO } };
    encabezado.alignment = { vertical: "middle", wrapText: true };
    encabezado.height = 30;

    for (const fila of hoja.filas) {
      ws.addRow(Object.fromEntries(hoja.columnas.map((c) => [c.campo, convertir(fila[c.campo], c.formato)])));
    }

    // Filtros de Excel en el encabezado
    if (hoja.filas.length > 0) {
      ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: hoja.columnas.length } };
    }

    // Fila de totales con fórmulas SUMA (se recalculan si el usuario edita)
    if (hoja.totales?.length && hoja.filas.length > 0) {
      const ultima = hoja.filas.length + 1;
      const valores = { [hoja.columnas[0].campo]: "TOTAL" };
      hoja.columnas.forEach((c, i) => {
        if (hoja.totales.includes(c.campo)) {
          const col = letra(i + 1);
          valores[c.campo] = { formula: `SUBTOTAL(9,${col}2:${col}${ultima})` };
        }
      });
      const filaTotal = ws.addRow(valores);
      filaTotal.font = { bold: true };
      filaTotal.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIS_TOTAL } };
    }
  }

  return libro.xlsx.writeBuffer();
}

module.exports = { crearExcel, aFechaExcel };
