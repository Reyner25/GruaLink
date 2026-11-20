const { Router } = require("express");
const { login, logout, yo } = require("../controllers/auth.controller");
const { autenticar } = require("../middlewares/auth");
const { validarLogin } = require("../validators/auth.validator");

const router = Router();
router.post("/login", validarLogin, login);
router.post("/logout", autenticar, logout);
router.get("/yo", autenticar, yo);

module.exports = router;
