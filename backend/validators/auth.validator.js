const { body } = require("express-validator");
const { resultadoValidacion } = require("./comun");

const validarLogin = [
  body("email")
    .isString()
    .trim()
    .toLowerCase()
    .isEmail()
    .withMessage("Correo electrónico inválido"),
  body("password")
    .isString()
    .isLength({ min: 1, max: 200 })
    .withMessage("La contraseña es obligatoria"),
  resultadoValidacion,
];

module.exports = { validarLogin };
