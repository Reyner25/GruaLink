/**
 * Descargas en Excel y PDF  →  /api/exportar   (administrador y financiero)
 *
 *  GET /servicios        ?desde ?hasta ?cliente_id ?grua_id ?operador_id ?estado
 *                        Hoja "Servicios": una fila por servicio, trabajos
 *                        adicionales en columnas y fila de totales.
 *  GET /ordenes          mismos filtros → PDF con una orden de servicio por página
 *  GET /ordenes/:id      PDF de una sola orden
 *  GET /pago-operadores  ?desde ?hasta ?operador_id ?cliente_id  (valores:ver)
 *  GET /cobro            ?mes ?cliente_id ?incluir_sin_aprobar   (valores:ver)
 *  GET /cobro-ordenes    mismos filtros del cobro → PDF de sus órdenes
 *  GET /tarifas          ?cliente_id (número o "generales") ?vigente_en
 *  GET /turnos           ?desde ?hasta ?operador_id ?grua_id ?estado  (turnos:ver_todos)
 *  GET /promedio-gruas   ?desde ?hasta   (máx. 1 año)
 *
 * Usa los mismos filtros que el dashboard y el listado de servicios, así el
 * archivo coincide con lo que se ve en pantalla. Qué lleva cada archivo:
 * services/exportar.service.js.
 */
const { Router } = require("express");
const { autenticar } = require("../middlewares/auth");
const { requierePermiso } = require("../middlewares/permisos");
const { idParam, resultadoValidacion } = require("../validators/comun");
const V = require("../validators/reportes.validator");
const ctrl = require("../controllers/exportar.controller");

const router = Router();
router.use(autenticar, requierePermiso("reportes:ver"));

router.get("/servicios", ...V.filtrosServicios, ctrl.servicios);
router.get("/ordenes", ...V.filtrosServicios, ctrl.ordenes);
router.get("/ordenes/:id", idParam(), resultadoValidacion, ctrl.orden);
router.get("/pago-operadores", requierePermiso("valores:ver"), ...V.filtrosLiquidacion, ctrl.pagoOperadores);
router.get("/cobro", requierePermiso("valores:ver"), ...V.filtrosCobro, ctrl.cobro);
router.get("/cobro-ordenes", requierePermiso("valores:ver"), ...V.filtrosCobro, ctrl.cobroOrdenes);
router.get("/tarifas", requierePermiso("tarifas:ver", "tarifas:gestionar"), ...V.filtrosTarifas, ctrl.tarifas);
router.get("/turnos", requierePermiso("turnos:ver_todos"), ...V.filtrosTurnos, ctrl.turnos);
router.get("/promedio-gruas", ...V.filtrosServicios, ctrl.promedioGruas);

module.exports = router;
