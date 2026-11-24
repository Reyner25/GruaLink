/**
 * Reglas de negocio de los servicios de grúa (punto de entrada único).
 *
 * El código está dividido en services/servicio/:
 *   operador.js   crear() y finalizar(): flujo del operador desde el celular
 *   revision.js   cambiarEstado(), aprobar() y corregir(): revisión del administrador
 *   reglas.js     validaciones compartidas (transiciones de estado, horas, catálogos)
 *   valores.js    cálculo de valores en $ (igual al finalizar y al corregir)
 *
 * Los controladores importan SOLO este archivo.
 */
const { TRANSICIONES } = require("./servicio/reglas");
const operador = require("./servicio/operador");
const revision = require("./servicio/revision");

const ServicioService = { TRANSICIONES, ...operador, ...revision };

module.exports = ServicioService;
