const { body, param, query } = require("express-validator");
const { resultadoValidacion } = require("./comun");

// Texto opcional: se recorta y se limita para no guardar textos gigantes
const textoOpcional = (campo, max = 1000) =>
  body(campo)
    .optional({ values: "falsy" })
    .isString()
    .trim()
    .isLength({ max })
    .withMessage(`Máximo ${max} caracteres`);

const validarIniciarTurno = [
  body("grua_id").isInt({ min: 1 }).withMessage("Seleccione una grúa").toInt(),
  textoOpcional("observaciones"),
  resultadoValidacion,
];

const validarFinalizarTurno = [
  textoOpcional("observaciones"),
  textoOpcional("justificacion"),
  resultadoValidacion,
];

const validarCerrarTurnoAdmin = [
  param("id").isInt({ min: 1 }).withMessage("Id inválido"),
  body("motivo")
    .isString()
    .trim()
    .isLength({ min: 5, max: 500 })
    .withMessage("El motivo es obligatorio (mínimo 5 caracteres)"),
  resultadoValidacion,
];

const validarListado = [
  query("desde").optional().isISO8601({ strict: true }).withMessage("Fecha 'desde' inválida"),
  query("hasta").optional().isISO8601({ strict: true }).withMessage("Fecha 'hasta' inválida"),
  // Solo se VALIDA el query; la conversión a número se hace en el controlador
  // porque en Express 5 req.query no se puede modificar.
  query("operador_id").optional().isInt({ min: 1 }),
  query("grua_id").optional().isInt({ min: 1 }),
  query("estado").optional().isIn(["activo", "finalizado", "cerrado_admin"]).withMessage("Estado inválido"),
  query("limite").optional().isInt({ min: 1, max: 200 }),
  query("pagina").optional().isInt({ min: 1 }),
  resultadoValidacion,
];

module.exports = {
  validarIniciarTurno,
  validarFinalizarTurno,
  validarCerrarTurnoAdmin,
  validarListado,
};
