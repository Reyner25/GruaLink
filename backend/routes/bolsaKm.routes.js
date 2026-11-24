/**
 * Bolsa de kilometraje mensual (Suma)  →  /api/bolsa-km
 *
 *  GET  /clientes                 clientes que se cobran por bolsa
 *  GET  /?cliente_id&mes=AAAA-MM   km del mes, columna aplicada, cuánto falta
 *                                 para la siguiente y los servicios del mes
 *  GET   /tabla?cliente_id&vigente_desde   tabla de una vigencia (Tarifas → Bolsa de kilómetros)
 *  PATCH /celdas/:id {forma, valor, motivo}   corregir una celda (si no se ha usado)
 *  POST  /versiones {cliente_id, copiar_de, vigente_desde, motivo}   nueva vigencia (copia)
 *  PATCH /versiones {cliente_id, vigente_desde, nuevo_desde?, nuevo_hasta?, motivo}   editar vigencia
 *  DELETE /versiones {cliente_id, vigente_desde, motivo}   borrar una tabla sin uso
 *  PATCH /provisional {cliente_id, bolsa_km_provisional}   columna provisional del mes abierto
 *  POST /recalcular {cliente_id, mes}   vuelve a calcular el mes (normalmente
 *                                 no hace falta: se recalcula solo)
 */
const { Router } = require("express");
const { autenticar } = require("../middlewares/auth");
const { requierePermiso } = require("../middlewares/permisos");
const V = require("../validators/bolsaKm.validator");
const ctrl = require("../controllers/bolsaKm.controller");

const verReportes = requierePermiso("reportes:ver");
const verTarifas = requierePermiso("tarifas:ver", "tarifas:gestionar");
const gestionarTarifas = requierePermiso("tarifas:gestionar");

const router = Router();
router.use(autenticar);

// Reporte del mes
router.get("/clientes", verReportes, ctrl.clientes);
router.get("/", verReportes, ...V.validarResumenMes, ctrl.resumenMes);
router.post("/recalcular", requierePermiso("servicios:corregir"), ...V.validarRecalcular, ctrl.recalcular);

// Administración de la tabla (Tarifas → "Bolsa de kilómetros")
router.get("/tabla", verTarifas, ...V.validarTabla, ctrl.tabla);
router.patch("/celdas/:id", gestionarTarifas, ...V.validarCelda, ctrl.actualizarCelda);
router.post("/versiones", gestionarTarifas, ...V.validarNuevaVigencia, ctrl.nuevaVigencia);
router.patch("/versiones", gestionarTarifas, ...V.validarEditarVigencia, ctrl.editarVigencia);
router.delete("/versiones", gestionarTarifas, ...V.validarBorrarVigencia, ctrl.borrarVigencia);
router.patch("/provisional", gestionarTarifas, ...V.validarProvisional, ctrl.cambiarProvisional);

module.exports = router;
