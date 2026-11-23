/**
 * Mapa de todas las rutas de la API (prefijo /api).
 */
const { Router } = require("express");
const authRoutes = require("./auth.routes");
const servicioRoutes = require("./servicio.routes");
const catalogosRoutes = require("./catalogos.routes");
const turnoRoutes = require("./turno.routes");
const catalogosAdmin = require("./catalogosAdmin.routes");
const gruaRoutes = require("./grua.routes");
const usuarioRoutes = require("./usuario.routes");
const tarifaRoutes = require("./tarifa.routes");
const reportes = require("./reportes.routes");
const exportarRoutes = require("./exportar.routes");

const router = Router();

// Operador (y comunes)
router.use("/auth", authRoutes);
router.use("/catalogos", catalogosRoutes); // listas para formularios
router.use("/turnos", turnoRoutes);
router.use("/servicios", servicioRoutes);

// Administración
router.use("/clientes", catalogosAdmin.clientes);
router.use("/tipos-vehiculo", catalogosAdmin.tiposVehiculo);
router.use("/tipos-servicio", catalogosAdmin.tiposServicio);
router.use("/conceptos", catalogosAdmin.conceptos);
router.use("/gruas", gruaRoutes);
router.use("/usuarios", usuarioRoutes);
router.use("/tarifas", tarifaRoutes.tarifas);
router.use("/precios-concepto", tarifaRoutes.preciosConcepto);

// Reportes y auditoría
router.use("/dashboard", reportes.dashboard);
router.use("/bitacora", reportes.bitacora);
router.use("/exportar", exportarRoutes); // descargas en Excel
router.use("/bolsa-km", require("./bolsaKm.routes")); // bolsa de kilometraje mensual (Suma)

module.exports = router;
