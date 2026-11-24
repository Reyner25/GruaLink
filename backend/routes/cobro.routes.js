/**
 * Cobro mensual a las empresas  →  /api/cobro   (Reportes → Cobro)
 *
 *  GET /?mes=AAAA-MM&incluir_sin_aprobar=true|false
 *      Por empresa: cantidad de servicios, sin aprobar, subtotal, IVA y total.
 *
 * Descargas (en /api/exportar, mismos filtros + cliente_id opcional):
 *  GET /api/exportar/cobro           Excel del cobro (RESUMEN + una hoja por empresa)
 *  GET /api/exportar/cobro-ordenes   PDF con las órdenes de servicio del cobro
 *
 * Administrador y financiero (reportes:ver + valores:ver).
 */
const { Router } = require("express");
const { query } = require("express-validator");
const { autenticar } = require("../middlewares/auth");
const { requierePermiso } = require("../middlewares/permisos");
const { resultadoValidacion } = require("../validators/comun");
const Cobro = require("../services/cobro.service");

const filtrosCobro = [
  query("mes").matches(/^\d{4}-(0[1-9]|1[0-2])$/).withMessage("Mes inválido (AAAA-MM)"),
  query("cliente_id").optional().isInt({ min: 1 }),
  query("incluir_sin_aprobar").optional().isIn(["true", "false"]),
  resultadoValidacion,
];
const leerFiltros = (q) => ({
  mes: q.mes,
  clienteId: q.cliente_id ? Number(q.cliente_id) : undefined,
  incluirSinAprobar: q.incluir_sin_aprobar === "true",
});

const router = Router();
router.use(autenticar, requierePermiso("reportes:ver"), requierePermiso("valores:ver"));

router.get("/", ...filtrosCobro, async (req, res, next) => {
  try {
    const empresas = await Cobro.datos(leerFiltros(req.query));
    // Para la pantalla basta el resumen por empresa (sin el detalle de cada servicio)
    res.json({
      iva: Cobro.IVA,
      empresas: empresas.map(({ servicios, ...e }) => e),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.filtrosCobro = filtrosCobro;
module.exports.leerFiltros = leerFiltros;
