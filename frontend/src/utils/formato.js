/**
 * Funciones de formato y textos compartidos por todas las pantallas.
 * Todo se muestra en hora de Colombia, sin importar la zona del celular.
 */
const ZONA = "America/Bogota";

// "28/10/2026"
export function formatoFecha(valor) {
  if (!valor) return "—";
  // Las fechas "AAAA-MM-DD" se muestran tal cual (no son una hora)
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    const [a, m, d] = valor.split("-");
    return `${d}/${m}/${a}`;
  }
  return new Date(valor).toLocaleDateString("es-CO", { timeZone: ZONA, day: "2-digit", month: "2-digit", year: "numeric" });
}

// "14:32"
export function formatoHora(valor) {
  if (!valor) return "—";
  return new Date(valor).toLocaleTimeString("es-CO", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hour12: false });
}

// "28/10/2026 14:32"
export function formatoFechaHora(valor) {
  if (!valor) return "—";
  return `${formatoFecha(valor)} ${formatoHora(valor)}`;
}

// Duración legible entre dos fechas: "2 h 15 min"
export function duracion(desde, hasta = new Date()) {
  if (!desde) return "—";
  const minutos = Math.max(0, Math.round((new Date(hasta) - new Date(desde)) / 60000));
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return h ? `${h} h ${m} min` : `${m} min`;
}

// Fecha de hoy en Colombia "AAAA-MM-DD"
export function hoy() {
  return new Date().toLocaleDateString("en-CA", { timeZone: ZONA });
}

/**
 * Valor para un <input type="datetime-local"> ("2026-10-28T14:32")
 * a partir de una fecha. Usa la hora local del celular.
 */
export function aInputFechaHora(valor = new Date()) {
  const d = new Date(valor);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

// Del input datetime-local a ISO con zona (lo que espera la API)
export function deInputFechaHora(texto) {
  return texto ? new Date(texto).toISOString() : null;
}

export const ESTADOS_SERVICIO = {
  solicitado: { texto: "Solicitado", color: "default" },
  asignado: { texto: "Asignado", color: "info" },
  en_desplazamiento: { texto: "En desplazamiento", color: "secondary" },
  en_servicio: { texto: "En servicio", color: "success" },
  finalizado: { texto: "Finalizado", color: "primary" },
  en_revision: { texto: "En revisión", color: "warning" },
  aprobado: { texto: "Aprobado", color: "success" },
  anulado: { texto: "Anulado", color: "error" },
};

export const ESTADOS_ABIERTOS = ["solicitado", "asignado", "en_desplazamiento", "en_servicio"];

export const ESTADOS_TURNO = {
  activo: { texto: "En curso", color: "success" },
  finalizado: { texto: "Finalizado", color: "default" },
  cerrado_admin: { texto: "Cerrado por administrador", color: "warning" },
};

export const UNIDADES_COBRO = {
  evento: "por evento",
  hora: "por hora",
  km: "por km",
  cantidad: "por unidad",
};

// Pesos colombianos: 485400 → "$ 485.400"
export function formatoMoneda(n) {
  if (n === null || n === undefined || n === "") return "—";
  return Number(n).toLocaleString("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });
}

// Número con coma decimal colombiana: 1.5 → "1,5"; 12 → "12"
export function formatoNumero(n) {
  if (n === null || n === undefined || n === "") return "—";
  return Number(n).toLocaleString("es-CO", { maximumFractionDigits: 2 });
}

// Cantidad con su unidad en singular o plural: "1 evento", "1,5 horas", "2 unidades"
const UNIDAD_TEXTO = {
  evento: ["evento", "eventos"],
  hora: ["hora", "horas"],
  km: ["km", "km"],
  cantidad: ["unidad", "unidades"],
};
export function cantidadConUnidad(cantidad, unidad) {
  const [singular, plural] = UNIDAD_TEXTO[unidad] || ["", ""];
  return `${formatoNumero(cantidad)} ${Number(cantidad) === 1 ? singular : plural}`.trim();
}

/**
 * Convierte un error de Axios en un mensaje para mostrar.
 * Si la API devolvió errores por campo (422), los une en el texto.
 */
export function mensajeError(err, porDefecto = "Ocurrió un error. Intente de nuevo.") {
  if (!err?.response) return "Sin conexión con el servidor. Revise su internet e intente de nuevo.";
  const datos = err.response.data || {};
  if (Array.isArray(datos.campos) && datos.campos.length) {
    return datos.campos.map((c) => c.mensaje).join(" · ");
  }
  return datos.error || porDefecto;
}

// Errores por campo de una respuesta 422: { placa_vehiculo: "Placa inválida" }
export function erroresPorCampo(err) {
  const campos = err?.response?.data?.campos || [];
  return Object.fromEntries(campos.map((c) => [c.campo, c.mensaje]));
}
