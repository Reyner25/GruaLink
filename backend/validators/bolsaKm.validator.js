/**
 * Reglas de validación de /api/bolsa-km (bolsa de kilometraje mensual).
 */
const { query, body, param } = require("express-validator");
const { resultadoValidacion } = require("./comun");
const { mesValido } = require("./reportes.validator");

const fecha = (regla) => regla.isISO8601({ strict: true }).withMessage("Fecha inválida");
const clienteBody = () => body("cliente_id").isInt({ min: 1 }).toInt();
const motivoObligatorio = () =>
  body("motivo").isString().trim().isLength({ min: 5, max: 500 }).withMessage("El motivo es obligatorio (mínimo 5 caracteres)");

const validarResumenMes = [query("cliente_id").isInt({ min: 1 }).withMessage("Cliente inválido"), mesValido(query("mes")), resultadoValidacion];

const validarRecalcular = [clienteBody(), mesValido(body("mes")), resultadoValidacion];

const validarTabla = [
  query("cliente_id").isInt({ min: 1 }).withMessage("Cliente inválido"),
  fecha(query("vigente_desde").optional()),
  resultadoValidacion,
];

const validarCelda = [
  param("id").isInt({ min: 1 }),
  body("forma").isIn(["fijo", "por_km", "a_convenir"]).withMessage("Forma de cobro: fijo, por_km o a_convenir"),
  body("valor")
    .optional({ values: "undefined" })
    .custom((v) => v === null || (typeof v === "number" && v >= 0 && v <= 999999999))
    .withMessage("Valor inválido"),
  body("motivo").optional({ values: "null" }).isString().trim().isLength({ max: 500 }),
  resultadoValidacion,
];

const validarNuevaVigencia = [clienteBody(), fecha(body("copiar_de")), fecha(body("vigente_desde")), motivoObligatorio(), resultadoValidacion];

const validarCrearTabla = [
  clienteBody(),
  body("copiar_de_cliente").isInt({ min: 1 }).withMessage("Indique de qué cliente se copia la tabla").toInt(),
  fecha(body("copiar_de")),
  fecha(body("vigente_desde")),
  motivoObligatorio(),
  resultadoValidacion,
];

const validarEditarVigencia = [
  clienteBody(),
  fecha(body("vigente_desde")),
  fecha(body("nuevo_desde").optional({ values: "undefined" })),
  body("nuevo_hasta")
    .optional({ values: "undefined" })
    .custom((v) => v === null || (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))))
    .withMessage("Fecha final inválida (o vacía = sin fin)"),
  motivoObligatorio(),
  resultadoValidacion,
];

const validarBorrarVigencia = [clienteBody(), fecha(body("vigente_desde")), motivoObligatorio(), resultadoValidacion];

const validarProvisional = [
  clienteBody(),
  body("bolsa_km_provisional").isFloat({ min: 0, max: 99999999 }).withMessage("Km inválidos").toFloat(),
  resultadoValidacion,
];

module.exports = {
  validarResumenMes,
  validarRecalcular,
  validarTabla,
  validarCelda,
  validarNuevaVigencia,
  validarCrearTabla,
  validarEditarVigencia,
  validarBorrarVigencia,
  validarProvisional,
};
