/**
 * Reportes en pantalla y auditoría.
 *
 *  /api/dashboard   (administrador y financiero)
 *    GET /resumen          flota + totales de servicios + serie por día
 *                          ?desde ?hasta ?cliente_id ?grua_id ?operador_id ?estado
 *    GET /por/:agrupacion  cliente | grua | operador  (mismos filtros)
 *    GET /promedio-gruas   ?desde ?hasta  (máx. 366 días)
 *
 *  /api/bitacora    (solo administrador)
 *    GET /   ?entidad ?registro_id ?usuario_id ?operacion ?desde ?hasta ?pagina
 *
 *  /api/cobro       (reportes:ver + valores:ver)  Reportes → Cobro
 *    GET /?mes=AAAA-MM&incluir_sin_aprobar   por empresa: servicios, subtotal, IVA y total
 *
 *  /api/liquidacion-operadores   (reportes:ver + valores:ver)
 *    GET /?desde&hasta&operador_id&cliente_id   pago a cada operador y detalle por servicio
 *
 * Las descargas (Excel/PDF) de estos reportes están en exportar.routes.js.
 */
const { Router } = require("express");
const { autenticar } = require("../middlewares/auth");
const { requierePermiso } = require("../middlewares/permisos");
const V = require("../validators/reportes.validator");
const ctrl = require("../controllers/reportes.controller");

const dashboard = Router();
dashboard.use(autenticar, requierePermiso("reportes:ver"));
dashboard.get("/resumen", ...V.filtrosServicios, ctrl.resumen);
dashboard.get("/por/:agrupacion", V.validarAgrupacion, ...V.filtrosServicios, ctrl.agrupado);
dashboard.get("/promedio-gruas", ...V.filtrosServicios, ctrl.promedioGruas);

const bitacora = Router();
bitacora.use(autenticar, requierePermiso("bitacora:ver"));
bitacora.get("/", ...V.filtrosBitacora, ctrl.bitacora);

// Reportes con dinero: además de ver reportes, hay que poder ver valores
const conValores = [autenticar, requierePermiso("reportes:ver"), requierePermiso("valores:ver")];

const cobro = Router();
cobro.use(...conValores);
cobro.get("/", ...V.filtrosCobro, ctrl.cobro);

const liquidacion = Router();
liquidacion.use(...conValores);
liquidacion.get("/", ...V.filtrosLiquidacion, ctrl.liquidacion);

module.exports = { dashboard, bitacora, cobro, liquidacion };
