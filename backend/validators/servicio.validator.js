/**
 * Validación de servicios.
 *
 * Solo se aceptan los campos listados aquí (resultadoValidacion descarta el
 * resto). Por eso NO aparecen operador_id, grua_id, numero_orden, estado ni
 * ningún valor en pesos: esos los decide el servidor.
 */
const { body, param, query } = require("express-validator");
const { resultadoValidacion } = require("./comun");

const ESTADOS = ["solicitado", "asignado", "en_desplazamiento", "en_servicio",
  "finalizado", "en_revision", "aprobado", "anulado"];

const id = (campo, mensaje) => body(campo).isInt({ min: 1 }).withMessage(mensaje).toInt();

const textoOpcional = (campo, max) =>
  body(campo)
    .optional({ values: "null" })
    .isString()
    .trim()
    .isLength({ max })
    .withMessage(`Máximo ${max} caracteres`)
    .customSanitizer((v) => (v === "" ? null : v));

const fechaHoraOpcional = (campo, mensaje) =>
  body(campo).optional({ values: "null" }).isISO8601({ strict: true }).withMessage(mensaje);


const validarCrearServicio = [
  id("cliente_id", "Seleccione un cliente"),
  id("tipo_vehiculo_id", "Seleccione el tipo de vehículo"),
  id("tipo_servicio_id", "Seleccione el tipo de servicio"),
  body("placa_vehiculo")
    .isString()
    .trim()
    .toUpperCase()
    .customSanitizer((v) => v.replace(/[\s-]/g, "")) // "ABC 123" y "ABC-123" → "ABC123"
    .matches(/^[A-Z0-9]{3,10}$/)
    .withMessage("Placa inválida (solo letras y números, 3 a 10)"),
  textoOpcional("numero_vehiculo", 20),
  body("fecha_servicio").isISO8601({ strict: true }).withMessage("Fecha del servicio inválida"),
  fechaHoraOpcional("hora_solicitud", "Hora de solicitud inválida"),
  fechaHoraOpcional("inicio_servicio", "Hora de inicio inválida"),
  textoOpcional("origen", 255),
  textoOpcional("destino", 255),
  // es_rescate ya no se recibe: lo decide el tipo de servicio
  textoOpcional("tipo_vehiculo_otro", 60), // obligatorio solo si el tipo es "Otro" (lo valida el servicio)
  textoOpcional("observaciones", 2000),
  resultadoValidacion,
];

const validarFinalizarServicio = [
  param("id").isInt({ min: 1 }).withMessage("Id inválido"),
  fechaHoraOpcional("inicio_servicio", "Hora de inicio inválida"),
  body("fin_servicio").isISO8601({ strict: true }).withMessage("Hora de finalización inválida"),
  // km_vacio y km_servicio ya no se reciben del operador: los carga el
  // administrador con la corrección autorizada (validarCorregir).
  body("entregado_sin_novedad").isBoolean({ strict: true }).withMessage("Indique si se entregó sin novedad"),
  textoOpcional("recibe_nombre", 120),
  textoOpcional("recibe_documento", 30),
  textoOpcional("observaciones_entrega", 2000),
  body("conceptos").optional().isArray({ max: 20 }).withMessage("Conceptos inválidos"),
  body("conceptos.*.concepto_id").isInt({ min: 1 }).withMessage("Concepto inválido").toInt(),
  body("conceptos.*.cantidad")
    .isFloat({ gt: 0, max: 999 })
    .withMessage("La cantidad debe ser mayor que 0")
    .toFloat(),
  resultadoValidacion,
];

const validarCambioEstado = [
  param("id").isInt({ min: 1 }).withMessage("Id inválido"),
  body("estado").isIn(ESTADOS).withMessage("Estado inválido"),
  body("motivo").optional({ values: "null" }).isString().trim().isLength({ max: 500 }),
  resultadoValidacion,
];

const validarAprobar = [
  param("id").isInt({ min: 1 }).withMessage("Id inválido"),
  body("valor_aprobado")
    .optional({ values: "null" })
    .isFloat({ min: 0, max: 9999999999 })
    .withMessage("Valor aprobado inválido")
    .toFloat(),
  body("motivo").optional({ values: "null" }).isString().trim().isLength({ max: 500 }),
  resultadoValidacion,
];

// Corrección: todos los campos opcionales; motivo obligatorio
const opcional = (campo) => body(campo).optional({ values: "undefined" });
const validarCorregir = [
  param("id").isInt({ min: 1 }).withMessage("Id inválido"),
  body("motivo").isString().trim().isLength({ min: 5, max: 500 }).withMessage("El motivo es obligatorio (mínimo 5 caracteres)"),
  ...["cliente_id", "tipo_vehiculo_id", "tipo_servicio_id", "grua_id"].map((c) =>
    opcional(c).isInt({ min: 1 }).withMessage("Id inválido").toInt(),
  ),
  opcional("placa_vehiculo")
    .isString()
    .trim()
    .toUpperCase()
    .customSanitizer((v) => v.replace(/[\s-]/g, ""))
    .matches(/^[A-Z0-9]{3,10}$/)
    .withMessage("Placa inválida"),
  opcional("fecha_servicio").isISO8601({ strict: true }).withMessage("Fecha inválida"),
  ...["hora_solicitud", "inicio_servicio", "fin_servicio"].map((c) =>
    body(c).optional({ values: "undefined" }).custom((v) => v === null || !Number.isNaN(Date.parse(v))).withMessage("Fecha/hora inválida"),
  ),
  ...["km_vacio", "km_servicio"].map((c) => opcional(c).isFloat({ min: 0, max: 9999 }).withMessage("Km inválidos").toFloat()),
  opcional("entregado_sin_novedad").isBoolean({ strict: true }),
  // Clientes por bolsa de km (Suma): servicio fuera de la disponibilidad → tarifa general
  opcional("fuera_disponibilidad").isBoolean({ strict: true }).withMessage("Debe ser sí o no"),
  // Ajustes del administrador: tarifa básica manual (null = automática) y recargo nocturno
  body("tarifa_basica_manual")
    .optional({ values: "undefined" })
    .custom((v) => v === null || (typeof v === "number" && v >= 0 && v <= 999999999))
    .withMessage("Tarifa manual inválida (valor en pesos o vacío para automática)"),
  opcional("recargo_nocturno").isIn(["auto", "si", "no"]).withMessage("Recargo nocturno: auto, si o no"),
  ...[["tipo_vehiculo_otro", 60], ["numero_vehiculo", 20], ["origen", 255], ["destino", 255], ["recibe_nombre", 120], ["recibe_documento", 30],
    ["observaciones", 2000], ["observaciones_entrega", 2000]].map(([c, max]) =>
    body(c)
      .optional({ values: "undefined" })
      .customSanitizer((v) => (typeof v === "string" ? v.trim() || null : v))
      .custom((v) => v === null || (typeof v === "string" && v.length <= max))
      .withMessage(`Máximo ${max} caracteres`),
  ),
  opcional("conceptos").isArray({ max: 20 }),
  body("conceptos.*.concepto_id").isInt({ min: 1 }).toInt(),
  body("conceptos.*.cantidad").isFloat({ gt: 0, max: 999 }).toFloat(),
  resultadoValidacion,
];

const validarId = [param("id").isInt({ min: 1 }).withMessage("Id inválido"), resultadoValidacion];

const validarListado = [
  query("desde").optional().isISO8601({ strict: true }),
  query("hasta").optional().isISO8601({ strict: true }),
  query("estado").optional().isIn(ESTADOS),
  query("cliente_id").optional().isInt({ min: 1 }),
  query("grua_id").optional().isInt({ min: 1 }),
  query("operador_id").optional().isInt({ min: 1 }),
  query("limite").optional().isInt({ min: 1, max: 200 }),
  query("pagina").optional().isInt({ min: 1 }),
  resultadoValidacion,
];

module.exports = {
  validarCrearServicio,
  validarFinalizarServicio,
  validarCambioEstado,
  validarAprobar,
  validarCorregir,
  validarId,
  validarListado,
};
