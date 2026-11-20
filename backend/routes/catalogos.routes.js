const { Router } = require("express");
const { autenticar } = require("../middlewares/auth");
const { requierePermiso } = require("../middlewares/permisos");
const { obtenerCatalogos } = require("../controllers/catalogos.controller");

const router = Router();
router.use(autenticar);
router.get("/", requierePermiso("catalogos:ver"), obtenerCatalogos);

module.exports = router;
