/**
 * Lógica (sin pantalla) del diálogo "Corregir servicio":
 *   - formularioInicial(servicio, conceptos): el formulario con los datos actuales
 *   - armarCambios(form, servicio, …): SOLO los campos que cambiaron, listos para la API
 *   - validaciones de números
 *
 * Separada del componente para poder leerla (y cambiarla) sin el JSX.
 * Los valores en $ NUNCA se envían: el backend los recalcula.
 */

// Números escritos con coma o punto decimal
export const aNumero = (v) => Number(String(v).replace(",", "."));
export const numeroValido = (v, { min = 0, max = 9999 } = {}) => v !== "" && !Number.isNaN(aNumero(v)) && aNumero(v) >= min && aNumero(v) <= max;
// Pesos: los puntos son separador de miles y la coma es decimal
export const aPesos = (v) => Number(String(v).replace(/\./g, "").replace(",", "."));

// Fecha/hora ISO → "AAAA-MM-DDTHH:MM" en hora de Colombia (para <input type="datetime-local">)
export const aLocal = (iso) =>
  iso ? new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" }).format(new Date(iso)).replace(" ", "T") : "";
// …y de vuelta: Colombia es UTC−5 todo el año (sin horario de verano)
const deLocal = (texto) => (texto ? new Date(`${texto}:00-05:00`).toISOString() : null);

export const HORAS = [
  ["hora_solicitud", "Hora de solicitud"],
  ["inicio_servicio", "Inicio del servicio"],
  ["fin_servicio", "Fin del servicio"],
];
const TEXTOS = ["placa_vehiculo", "numero_vehiculo", "origen", "destino", "tipo_vehiculo_otro", "recibe_nombre", "recibe_documento", "observaciones", "observaciones_entrega"];
const IDS = ["cliente_id", "tipo_servicio_id", "tipo_vehiculo_id", "grua_id"];

const conTexto = (v) => String(v ?? 0).replace(".", ",");
const tieneTarifaManual = (s) => s.tarifa_basica_manual !== null && s.tarifa_basica_manual !== undefined;

/**
 * Formulario con los datos actuales del servicio.
 * conceptosActuales: trabajos adicionales SIN el recargo nocturno (va con su propio control).
 */
export function formularioInicial(servicio, conceptosActuales) {
  return {
    ...Object.fromEntries(TEXTOS.map((c) => [c, servicio[c] || ""])),
    ...Object.fromEntries(IDS.map((c) => [c, servicio[c] ? String(servicio[c]) : ""])),
    ...Object.fromEntries(HORAS.map(([c]) => [c, aLocal(servicio[c])])),
    fecha_servicio: String(servicio.fecha_servicio || "").slice(0, 10),
    km_vacio: conTexto(servicio.km_vacio),
    km_servicio: conTexto(servicio.km_servicio),
    entregado_sin_novedad: Boolean(servicio.entregado_sin_novedad),
    conceptos: Object.fromEntries(conceptosActuales.map((c) => [c.concepto_id, conTexto(c.cantidad)])),
    fuera_disponibilidad: Boolean(servicio.fuera_disponibilidad),
    tarifa_manual_activa: tieneTarifaManual(servicio),
    tarifa_manual: tieneTarifaManual(servicio) ? String(servicio.tarifa_basica_manual) : "",
    recargo_nocturno: servicio.recargo_nocturno || "auto",
    motivo: "",
  };
}

/**
 * ¿El formulario se puede enviar? (números válidos)
 */
export function formularioValido(form) {
  const kmValidos = numeroValido(form.km_vacio) && numeroValido(form.km_servicio);
  const conceptosValidos = Object.values(form.conceptos).every((c) => numeroValido(c, { min: 0.01, max: 999 }));
  const tarifa = aPesos(form.tarifa_manual);
  const tarifaValida = !form.tarifa_manual_activa || (form.tarifa_manual !== "" && !Number.isNaN(tarifa) && tarifa >= 0);
  return { kmValidos, conceptosValidos, tarifaValida, todo: kmValidos && conceptosValidos && tarifaValida };
}

/**
 * Solo los campos que cambiaron respecto al servicio.
 *   esVehiculoOtro: el tipo de vehículo elegido es "Otro" (si no, su descripción no se envía)
 *   porBolsa: cliente por bolsa de km (solo ahí se envía "fuera de disponibilidad")
 *   cerrado: finalizado o en revisión (solo ahí se corrigen conceptos, tarifa y recargo)
 */
export function armarCambios(form, servicio, { conceptosActuales, esVehiculoOtro, porBolsa, cerrado }) {
  const cambios = {};
  for (const campo of TEXTOS) {
    if (campo === "tipo_vehiculo_otro" && !esVehiculoOtro) continue;
    if (form[campo].trim() !== (servicio[campo] || "")) cambios[campo] = form[campo].trim() || null;
  }
  for (const campo of IDS) {
    if (form[campo] && form[campo] !== String(servicio[campo] ?? "")) cambios[campo] = Number(form[campo]);
  }
  for (const [campo] of HORAS) {
    if (form[campo] !== aLocal(servicio[campo])) cambios[campo] = deLocal(form[campo]);
  }
  if (form.fecha_servicio && form.fecha_servicio !== String(servicio.fecha_servicio).slice(0, 10)) cambios.fecha_servicio = form.fecha_servicio;
  if (aNumero(form.km_vacio) !== Number(servicio.km_vacio)) cambios.km_vacio = aNumero(form.km_vacio);
  if (aNumero(form.km_servicio) !== Number(servicio.km_servicio)) cambios.km_servicio = aNumero(form.km_servicio);
  if (form.entregado_sin_novedad !== Boolean(servicio.entregado_sin_novedad)) cambios.entregado_sin_novedad = form.entregado_sin_novedad;
  if (porBolsa && form.fuera_disponibilidad !== Boolean(servicio.fuera_disponibilidad)) cambios.fuera_disponibilidad = form.fuera_disponibilidad;

  if (cerrado) {
    const manual = form.tarifa_manual_activa ? aPesos(form.tarifa_manual) : null;
    const antes = tieneTarifaManual(servicio) ? Number(servicio.tarifa_basica_manual) : null;
    if (manual !== antes) cambios.tarifa_basica_manual = manual;
    if (form.recargo_nocturno !== (servicio.recargo_nocturno || "auto")) cambios.recargo_nocturno = form.recargo_nocturno;

    const nuevos = Object.entries(form.conceptos).map(([id, cant]) => ({ concepto_id: Number(id), cantidad: aNumero(cant) }));
    const firma = (lista) => lista.map((c) => `${c.concepto_id}:${Number(c.cantidad)}`).sort().join();
    if (firma(conceptosActuales) !== firma(nuevos)) cambios.conceptos = nuevos;
  }
  return cambios;
}

// Opciones de un select: las activas + la actual del servicio (aunque esté inactiva)
export function opcionesCon(lista, actualId, texto) {
  const opciones = lista.map((x) => ({ valor: String(x.id), texto: texto(x) }));
  if (actualId && !opciones.some((o) => o.valor === String(actualId))) opciones.push({ valor: String(actualId), texto: `(actual) #${actualId}` });
  return opciones;
}
