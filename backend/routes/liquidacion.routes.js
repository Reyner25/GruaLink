/**
 * Liquidación de operadores  →  /api/liquidacion-operadores
 *
 *  GET /?desde&hasta&operador_id&cliente_id
 *      Por operador: servicios, pago aprobado (definitivo), pago pendiente
 *      (provisional, sin aprobar) y total; y el detalle por servicio.
 *
 * Valores en $: administrador y financiero (reportes:ver + valores:ver).
 * El Excel está en /api/exportar/pago-operadores.
 */
const { Router } = require("express");
const { query } = require("express-validator");
const { autenticar } = require("../middlewares/auth");
const { requierePermiso } = require("../middlewares/permisos");
const { resultadoValidacion } = require("../validators/comun");
const PagoOperador = require("../services/pagoOperador.service");
const { errorNegocio } = require("../utils/errores");

const filtrosLiquidacion = [
  query("desde").isISO8601({ strict: true }).withMessage("Fecha 'desde' obligatoria"),
  query("hasta").isISO8601({ strict: true }).withMessage("Fecha 'hasta' obligatoria"),
  query("operador_id").optional().isInt({ min: 1 }),
  query("cliente_id").optional().isInt({ min: 1 }),
  resultadoValidacion,
];

// Lee y valida los filtros (máximo un año)
function leerFiltros(q) {
  const dias = (Date.parse(q.hasta) - Date.parse(q.desde)) / 86400000;
  if (dias < 0) throw errorNegocio(422, "RANGO_INVALIDO", "'desde' es posterior a 'hasta'");
  if (dias > 366) throw errorNegocio(422, "RANGO_MUY_LARGO", "El rango máximo es de un año");
  return {
    desde: q.desde,
    hasta: q.hasta,
    operadorId: q.operador_id ? Number(q.operador_id) : undefined,
    clienteId: q.cliente_id ? Number(q.cliente_id) : undefined,
  };
}

const router = Router();
router.use(autenticar, requierePermiso("reportes:ver"), requierePermiso("valores:ver"));

router.get("/", ...filtrosLiquidacion, async (req, res, next) => {
  try {
    res.json(await PagoOperador.liquidacion(leerFiltros(req.query)));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.filtrosLiquidacion = filtrosLiquidacion;
module.exports.leerFiltros = leerFiltros;
