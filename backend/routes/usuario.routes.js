/**
 * Rutas de usuarios  →  /api/usuarios   (solo administrador)
 *
 *  GET   /roles           roles disponibles
 *  GET   /                listado (?rol_id= ?activo= ?buscar=)
 *  GET   /:id             detalle (sin contraseña)
 *  POST  /                { nombre, email, rol, password }
 *  PATCH /:id             { nombre?, email?, rol?, activo?, motivo? }
 *  POST  /:id/password    { password, motivo? }   (cierra sus sesiones)
 */
const { Router } = require("express");
const { body } = require("express-validator");
const { autenticar } = require("../middlewares/auth");
const { requierePermiso } = require("../middlewares/permisos");
const c = require("../validators/comun");
const { crearControladorCatalogo } = require("../controllers/catalogoAdmin.controller");
const UsuarioService = require("../services/usuario.service");

const ROLES = ["administrador", "operador", "financiero"];

// Mínimo 8 caracteres, con al menos una letra y un número
const password = () =>
  body("password")
    .isString()
    .isLength({ min: 8, max: 100 })
    .withMessage("La contraseña debe tener mínimo 8 caracteres")
    .bail()
    .matches(/[A-Za-z]/)
    .withMessage("La contraseña debe tener al menos una letra")
    .matches(/\d/)
    .withMessage("La contraseña debe tener al menos un número");

const email = (opcional) => {
  let regla = body("email");
  if (opcional) regla = regla.optional({ values: "undefined" });
  return regla.isString().trim().toLowerCase().isEmail().withMessage("Correo electrónico inválido");
};

const rol = (opcional) => {
  let regla = body("rol");
  if (opcional) regla = regla.optional({ values: "undefined" });
  return regla.isIn(ROLES).withMessage(`Rol: ${ROLES.join(", ")}`);
};

const ctrl = crearControladorCatalogo(UsuarioService, {
  clave: "usuarios",
  claveUno: "usuario",
  filtrosQuery: { activo: "activo", rol_id: "rol_id" },
  camposBusqueda: ["nombre", "email"],
});

async function roles(req, res, next) {
  try {
    res.json({ roles: await UsuarioService.roles() });
  } catch (err) {
    next(err);
  }
}

async function cambiarPassword(req, res, next) {
  try {
    await UsuarioService.cambiarPassword({
      id: Number(req.params.id),
      password: req.body.password,
      motivo: req.body.motivo,
      usuarioId: req.usuario.id,
    });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

const router = Router();
router.use(autenticar, requierePermiso("usuarios:gestionar"));

router.get("/roles", roles);
router.get("/", ...c.paginacion(), c.resultadoValidacion, ctrl.listar);
router.get("/:id", c.idParam(), c.resultadoValidacion, ctrl.obtener);
router.post(
  "/",
  c.texto("nombre", { max: 120 }),
  email(false),
  rol(false),
  password(),
  c.booleano("activo", { opcional: true }),
  c.resultadoValidacion,
  ctrl.crear,
);
router.patch(
  "/:id",
  c.idParam(),
  c.texto("nombre", { max: 120, opcional: true }),
  email(true),
  rol(true),
  c.booleano("activo", { opcional: true }),
  c.motivo(),
  c.resultadoValidacion,
  c.alMenosUnCampo,
  ctrl.actualizar,
);
router.post("/:id/password", c.idParam(), password(), c.motivo(), c.resultadoValidacion, cambiarPassword);

module.exports = router;
