/**
 * Rutas de grúas  →  /api/gruas   (administrador; financiero solo consulta)
 *
 *  GET   /                listado con el operador que la usa ahora (?estado= ?buscar=)
 *  GET   /:id             detalle
 *  GET   /:id/historial   cambios de estado
 *  POST  /                { placa, numero_interno }
 *  PATCH /:id             { placa?, numero_interno?, motivo? }
 *  POST  /:id/estado      { estado: activa|mantenimiento|inactiva, motivo }
 */
const { Router } = require("express");
const { body } = require("express-validator");
const { autenticar } = require("../middlewares/auth");
const { requierePermiso } = require("../middlewares/permisos");
const c = require("../validators/comun");
const { crearControladorCatalogo } = require("../controllers/catalogoAdmin.controller");
const GruaService = require("../services/grua.service");

const placa = (opcional) => {
  let regla = body("placa");
  if (opcional) regla = regla.optional({ values: "undefined" });
  return regla
    .isString()
    .customSanitizer((v) => v.toUpperCase().replace(/[\s-]/g, ""))
    .matches(/^[A-Z0-9]{5,10}$/)
    .withMessage("Placa inválida");
};
const camposGrua = (opcional) => [placa(opcional), c.texto("numero_interno", { max: 20, opcional })];

const ctrl = crearControladorCatalogo(GruaService, {
  clave: "gruas",
  claveUno: "grua",
  filtrosQuery: { estado: "estado" },
  camposBusqueda: ["placa", "numero_interno"],
});

async function cambiarEstado(req, res, next) {
  try {
    const grua = await GruaService.cambiarEstado({
      id: Number(req.params.id),
      estado: req.body.estado,
      motivo: req.body.motivo,
      usuarioId: req.usuario.id,
    });
    res.json({ grua });
  } catch (err) {
    next(err);
  }
}

async function historial(req, res, next) {
  try {
    await GruaService.obtener(Number(req.params.id)); // 404 si no existe
    res.json({ historial: await GruaService.historial(Number(req.params.id)) });
  } catch (err) {
    next(err);
  }
}

const router = Router();
router.use(autenticar);
const ver = requierePermiso("gruas:ver", "gruas:gestionar");
const gestionar = requierePermiso("gruas:gestionar");

router.get("/", ver, ...c.paginacion(), c.resultadoValidacion, ctrl.listar);
router.get("/:id", ver, c.idParam(), c.resultadoValidacion, ctrl.obtener);
router.get("/:id/historial", ver, c.idParam(), c.resultadoValidacion, historial);
router.post("/", gestionar, ...camposGrua(false), c.resultadoValidacion, ctrl.crear);
router.patch("/:id", gestionar, c.idParam(), ...camposGrua(true), c.motivo(), c.resultadoValidacion, c.alMenosUnCampo, ctrl.actualizar);
router.post(
  "/:id/estado",
  gestionar,
  c.idParam(),
  body("estado").isIn(["activa", "mantenimiento", "inactiva"]).withMessage("Estado: activa, mantenimiento o inactiva"),
  c.motivo(true),
  c.resultadoValidacion,
  cambiarEstado,
);

module.exports = router;
