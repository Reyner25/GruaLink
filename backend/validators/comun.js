/**
 * Piezas de validación que comparten todos los validadores.
 */
const { body, param, query, validationResult, matchedData } = require("express-validator");

/**
 * Se pone al FINAL de la lista de reglas de un endpoint.
 * 1. Si alguna regla falló → responde 422 con la lista de campos inválidos.
 * 2. Si todo está bien → reemplaza req.body por SOLO los campos validados.
 *
 * El paso 2 es la "lista blanca": cualquier campo que el celular envíe y que
 * no esté en las reglas (operador_id, valor_calculado, estado...) se descarta.
 * Así el frontend nunca puede colar datos que solo decide el servidor.
 */
function resultadoValidacion(req, res, next) {
  const errores = validationResult(req);
  if (!errores.isEmpty()) {
    return res.status(422).json({
      error: "Datos inválidos",
      codigo: "VALIDACION",
      campos: errores.array().map((e) => ({ campo: e.path, mensaje: e.msg })),
    });
  }
  req.body = matchedData(req, { locations: ["body"], includeOptionals: false });
  next();
}

/**
 * Para los PATCH: exige que llegue al menos un campo para cambiar
 * (además del "motivo", que no es un campo del registro).
 */
function alMenosUnCampo(req, res, next) {
  const campos = Object.keys(req.body).filter((c) => c !== "motivo");
  if (campos.length === 0) {
    return res.status(422).json({ error: "No se envió ningún campo para cambiar", codigo: "SIN_CAMBIOS" });
  }
  next();
}

// ---------- Constructores de reglas reutilizables ----------
// "opcional: true" se usa en los PATCH, donde cada campo puede o no venir.

function texto(campo, { max, min = 1, opcional = false, mensaje } = {}) {
  let regla = body(campo);
  if (opcional) regla = regla.optional({ values: "undefined" });
  return regla
    .isString()
    .withMessage(mensaje || "Debe ser texto")
    .bail()
    .trim()
    .isLength({ min, max })
    .withMessage(mensaje || `Debe tener entre ${min} y ${max} caracteres`);
}

// Texto que puede quedar vacío: "" o null se guardan como NULL
function textoNulable(campo, max) {
  return body(campo)
    .optional({ values: "undefined" })
    .customSanitizer((v) => (typeof v === "string" ? v.trim() || null : v))
    .custom((v) => v === null || (typeof v === "string" && v.length <= max))
    .withMessage(`Debe ser texto de máximo ${max} caracteres`);
}

function booleano(campo, { opcional = false } = {}) {
  let regla = body(campo);
  if (opcional) regla = regla.optional({ values: "undefined" });
  return regla.isBoolean({ strict: true }).withMessage("Debe ser verdadero o falso");
}

function entero(campo, { opcional = false, mensaje = "Id inválido" } = {}) {
  let regla = body(campo);
  if (opcional) regla = regla.optional({ values: "undefined" });
  return regla.isInt({ min: 1 }).withMessage(mensaje).toInt();
}

function dinero(campo, { opcional = false, mensaje = "Valor inválido" } = {}) {
  let regla = body(campo);
  if (opcional) regla = regla.optional({ values: "undefined" });
  return regla.isFloat({ min: 0, max: 9999999999 }).withMessage(mensaje).toFloat();
}

function fecha(campo, { opcional = false, nulable = false, mensaje = "Fecha inválida (AAAA-MM-DD)" } = {}) {
  let regla = body(campo);
  if (opcional) regla = regla.optional({ values: nulable ? "null" : "undefined" });
  return regla.isISO8601({ strict: true }).withMessage(mensaje).bail().isLength({ max: 10 }).withMessage(mensaje);
}

const motivo = (obligatorio = false) =>
  obligatorio
    ? texto("motivo", { min: 5, max: 500, mensaje: "El motivo es obligatorio (mínimo 5 caracteres)" })
    : textoNulable("motivo", 500);

const idParam = () => param("id").isInt({ min: 1 }).withMessage("Id inválido");

const paginacion = () => [
  query("limite").optional().isInt({ min: 1, max: 500 }),
  query("pagina").optional().isInt({ min: 1 }),
  query("buscar").optional().isString().isLength({ max: 100 }),
];

module.exports = {
  resultadoValidacion,
  alMenosUnCampo,
  texto,
  textoNulable,
  booleano,
  entero,
  dinero,
  fecha,
  motivo,
  idParam,
  paginacion,
};
