/**
 * Rutas de turnos  →  /api/turnos
 *
 *  GET  /activo             turno activo del operador (o null)
 *  GET  /gruas-disponibles  grúas activas, marcando las que ya están en uso
 *  POST /iniciar            { grua_id, observaciones? }
 *  POST /finalizar          { observaciones?, justificacion? }
 *  GET  /                   historial (operador: propios · admin: todos)
 *  POST /:id/cerrar         admin cierra un turno olvidado { motivo }
 */
const { Router } = require("express");
const { autenticar } = require("../middlewares/auth");
const { requierePermiso } = require("../middlewares/permisos");
const v = require("../validators/turno.validator");
const ctrl = require("../controllers/turno.controller");

const router = Router();
router.use(autenticar);

router.get("/activo", requierePermiso("turnos:propios"), ctrl.activo);
router.get("/gruas-disponibles", requierePermiso("turnos:propios"), ctrl.gruasDisponibles);
router.post("/iniciar", requierePermiso("turnos:propios"), v.validarIniciarTurno, ctrl.iniciar);
router.post("/finalizar", requierePermiso("turnos:propios"), v.validarFinalizarTurno, ctrl.finalizar);
router.get("/", requierePermiso("turnos:propios", "turnos:ver_todos"), v.validarListado, ctrl.listar);
router.post("/:id/cerrar", requierePermiso("turnos:cerrar_otros"), v.validarCerrarTurnoAdmin, ctrl.cerrarPorAdministrador);

module.exports = router;
