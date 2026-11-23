/**
 * Rutas de servicios  →  /api/servicios
 *
 *  GET   /                listado (operador: propios · admin/financiero: todos)
 *  GET   /mi-resumen      total de servicios del operador en un periodo
 *  GET   /:id             detalle + conceptos
 *  POST  /                operador crea un servicio (requiere turno activo)
 *  POST  /:id/finalizar   operador finaliza SU servicio (una sola vez)
 *  PATCH /:id/estado      administrador: en_revision, devolver a finalizado, anular {estado, motivo}
 *                         aprobado → en_revision (reabrir) o anulado: motivo obligatorio
 *  POST  /:id/aprobar     administrador aprueba {valor_aprobado?, motivo?}
 *  POST  /:id/corregir    administrador corrige datos {…campos, conceptos?, motivo} → recalcula
 *
 * No existe PUT/DELETE: después de guardar, el operador no puede editar ni
 * borrar. Las correcciones las hace el administrador y quedan en bitácora.
 */
const { Router } = require("express");
const { autenticar } = require("../middlewares/auth");
const { requierePermiso } = require("../middlewares/permisos");
const v = require("../validators/servicio.validator");
const ctrl = require("../controllers/servicio.controller");

const router = Router();
router.use(autenticar);

const puedeVer = requierePermiso("servicios:ver_propios", "servicios:ver_todos");

router.get("/", puedeVer, v.validarListado, ctrl.listar);
router.get("/mi-resumen", requierePermiso("servicios:ver_propios"), ctrl.miResumen);
router.get("/:id", puedeVer, v.validarId, ctrl.detalle);
router.post("/", requierePermiso("servicios:crear"), v.validarCrearServicio, ctrl.crear);
router.post("/:id/finalizar", requierePermiso("servicios:finalizar_propios"), v.validarFinalizarServicio, ctrl.finalizar);
router.patch("/:id/estado", requierePermiso("servicios:cambiar_estado"), v.validarCambioEstado, ctrl.cambiarEstado);
router.post("/:id/aprobar", requierePermiso("servicios:aprobar"), v.validarAprobar, ctrl.aprobar);
router.post("/:id/corregir", requierePermiso("servicios:corregir"), v.validarCorregir, ctrl.corregir);

module.exports = router;
