/**
 * Rutas de los catálogos administrables:
 *   /api/clientes  /api/tipos-vehiculo  /api/tipos-servicio  /api/conceptos
 *
 * Para cada uno:
 *   GET   /       listar  (?buscar= ?activo= ?limite= ?pagina=)
 *   GET   /:id    detalle
 *   POST  /       crear                       (administrador)
 *   PATCH /:id    actualizar / desactivar     (administrador) { ...campos, motivo? }
 *
 * No hay DELETE: los registros se DESACTIVAN (activo = false) para no romper
 * los servicios históricos que los usan.
 */
const { Router } = require("express");
const { autenticar } = require("../middlewares/auth");
const { requierePermiso } = require("../middlewares/permisos");
const { idParam, paginacion, resultadoValidacion } = require("../validators/comun");
const reglas = require("../validators/catalogoAdmin.validator");
const { crearControladorCatalogo } = require("../controllers/catalogoAdmin.controller");
const S = require("../services/catalogosAdmin.service");

/**
 * Crea un router completo para un catálogo.
 * permisoVer: quién puede consultar · "catalogos:gestionar": quién modifica
 */
function routerCatalogo(controlador, validaciones, permisoVer) {
  const router = Router();
  router.use(autenticar);
  const ver = requierePermiso(permisoVer, "catalogos:gestionar");
  const gestionar = requierePermiso("catalogos:gestionar");

  router.get("/", ver, ...paginacion(), resultadoValidacion, controlador.listar);
  router.get("/:id", ver, idParam(), resultadoValidacion, controlador.obtener);
  router.post("/", gestionar, ...validaciones.crear, controlador.crear);
  router.patch("/:id", gestionar, ...validaciones.actualizar, controlador.actualizar);
  return router;
}

const clientes = routerCatalogo(
  crearControladorCatalogo(S.ClienteService, {
    clave: "clientes",
    claveUno: "cliente",
    filtrosQuery: { activo: "activo" },
    camposBusqueda: ["razon_social", "nombre_comercial", "nit"],
  }),
  reglas.cliente,
  "clientes:ver",
);

const tiposVehiculo = routerCatalogo(
  crearControladorCatalogo(S.TipoVehiculoService, { clave: "tipos_vehiculo", claveUno: "tipo_vehiculo", camposBusqueda: ["nombre"] }),
  reglas.tipoVehiculo,
  "catalogos:ver",
);

const tiposServicio = routerCatalogo(
  crearControladorCatalogo(S.TipoServicioService, {
    clave: "tipos_servicio",
    claveUno: "tipo_servicio",
    filtrosQuery: { activo: "activo" },
    camposBusqueda: ["nombre"],
  }),
  reglas.tipoServicio,
  "catalogos:ver",
);

const conceptos = routerCatalogo(
  crearControladorCatalogo(S.ConceptoService, {
    clave: "conceptos",
    claveUno: "concepto",
    filtrosQuery: { activo: "activo" },
    camposBusqueda: ["nombre"],
    validarCambio: S.validarCambioConcepto,
  }),
  reglas.concepto,
  "catalogos:ver",
);

module.exports = { clientes, tiposVehiculo, tiposServicio, conceptos, routerCatalogo };
