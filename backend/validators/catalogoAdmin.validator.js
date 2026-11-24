/**
 * Reglas de validación de los catálogos que administra el administrador.
 * Cada catálogo tiene reglas para CREAR (campos obligatorios) y para
 * ACTUALIZAR (todos opcionales, pero al menos uno).
 */
const { body } = require("express-validator");
const c = require("./comun");

// Hora "HH:MM" (ej. 19:00) o null
const horaNulable = (campo) =>
  body(campo)
    .optional({ values: "undefined" })
    .customSanitizer((v) => (typeof v === "string" ? v.trim().slice(0, 5) || null : v))
    .custom((v) => v === null || (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)))
    .withMessage("Hora inválida (formato HH:MM, ej. 19:00)");

// ---------- Clientes ----------
// NIT: se quitan puntos y espacios ("900.123.456 - 7" → "900123456-7")
const nit = (opcional) => {
  let regla = body("nit");
  if (opcional) regla = regla.optional({ values: "undefined" });
  return regla
    .isString()
    .customSanitizer((v) => v.replace(/[.\s]/g, ""))
    .matches(/^\d{5,15}(-\d)?$/)
    .withMessage("NIT inválido (solo números, opcional '-' y dígito de verificación)");
};

const emailNulable = body("email")
  .optional({ values: "undefined" })
  .customSanitizer((v) => (typeof v === "string" ? v.trim().toLowerCase() || null : v))
  .custom((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
  .withMessage("Correo electrónico inválido");

const camposCliente = (opcional) => [
  c.texto("razon_social", { max: 200, opcional, mensaje: "Razón social obligatoria (máx. 200)" }),
  nit(opcional),
  c.textoNulable("nombre_comercial", 120),
  c.textoNulable("telefono", 30),
  emailNulable,
  c.textoNulable("direccion", 255),
  // Hora de corte del recargo nocturno ("19:00"); vacío = la general (20:40)
  body("recargo_nocturno_desde")
    .optional({ values: "undefined" })
    .customSanitizer((v) => (typeof v === "string" ? v.trim() || null : v))
    .custom((v) => v === null || (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)))
    .withMessage("Hora inválida (formato HH:MM, ej. 19:00)"),
  // Cómo se cobra: por servicio (tarifas normales) o por bolsa de km mensual (Suma)
  body("modalidad_cobro").optional({ values: "undefined" }).isIn(["por_servicio", "bolsa_km_mensual"]).withMessage("Modalidad de cobro inválida"),
  c.booleano("activo", { opcional: true }),
];

// ---------- Tipos de vehículo ----------
const camposTipoVehiculo = (opcional) => [
  c.texto("nombre", { max: 60, opcional }),
  c.booleano("es_otro", { opcional: true }), // el operador debe escribir cuál vehículo es
];

// ---------- Tipos de servicio ----------
const camposTipoServicio = (opcional) => [
  c.texto("nombre", { max: 80, opcional }),
  c.booleano("valor_a_convenir", { opcional: true }),
  c.booleano("es_rescate", { opcional: true }), // los servicios de este tipo se marcan como rescate
  c.booleano("activo", { opcional: true }),
];

// ---------- Conceptos (qué se cobra) ----------
// "porcentaje" no se ofrece hasta definir sobre qué base se calcula (P10)
const UNIDADES = ["evento", "hora", "km", "cantidad"];
const camposConcepto = (opcional) => [
  c.texto("nombre", { max: 120, opcional }),
  c.textoNulable("descripcion", 1000),
  (opcional ? body("unidad_cobro").optional({ values: "undefined" }) : body("unidad_cobro"))
    .isIn(UNIDADES)
    .withMessage(`Unidad de cobro: ${UNIDADES.join(", ")}`),
  c.booleano("la_reporta_operador", { opcional: true }), // false = solo lo aplica el administrador
  // Horario del recargo nocturno (solo para el concepto "Recargo nocturno")
  horaNulable("recargo_desde"),
  horaNulable("recargo_hasta"),
  c.booleano("activo", { opcional: true }),
];

// Arma las dos listas (crear / actualizar) a partir de una función de campos
function reglas(campos) {
  return {
    crear: [...campos(false), c.resultadoValidacion],
    actualizar: [c.idParam(), ...campos(true), c.motivo(), c.resultadoValidacion, c.alMenosUnCampo],
  };
}

module.exports = {
  cliente: reglas(camposCliente),
  tipoVehiculo: reglas(camposTipoVehiculo),
  tipoServicio: reglas(camposTipoServicio),
  concepto: reglas(camposConcepto),
  UNIDADES,
};
