/**
 * Textos y cálculos pequeños de la tabla de bolsa de kilómetros.
 *   columna = rango de km de TODOS los servicios del mes
 *   fila    = rango de km de cada servicio
 */
import { formatoFecha, formatoMoneda, formatoNumero } from "../../../utils/formato";

export const n = (v) => (v === null || v === undefined ? null : Number(v));

export const textoColumna = (c) =>
  c.hasta === null ? `${formatoNumero(Math.floor(c.desde))} o más` : `${formatoNumero(Math.floor(c.desde))} – ${formatoNumero(c.hasta)}`;

export const textoFila = (f) =>
  n(f.desde) === 0 ? `hasta ${formatoNumero(f.hasta)} km` : f.hasta === null ? `más de ${formatoNumero(Math.floor(f.desde))} km` : `${formatoNumero(f.desde)} – ${formatoNumero(f.hasta)} km`;

export const textoCelda = (c) => (c.forma === "a_convenir" ? "A convenir" : c.forma === "por_km" ? `${formatoMoneda(c.valor)} / km` : formatoMoneda(c.valor));

// Un km que cae dentro de la columna (para guardarlo como columna provisional)
export const kmDeColumna = (c) => (c.hasta === null ? Math.floor(c.desde) + 1 : n(c.hasta));

export const textoVigencia = (v) =>
  `${formatoFecha(v.vigente_desde)} – ${v.vigente_hasta ? formatoFecha(v.vigente_hasta) : "sin fin"}${v.vigente_hoy ? " · vigente hoy" : ""}${v.usada ? " · en uso" : ""}`;
