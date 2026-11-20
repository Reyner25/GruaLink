const CatalogosModel = require("../models/catalogos.model");
const { tienePermiso } = require("../middlewares/permisos");

// Todas las listas que necesita el formulario de servicio, en una sola llamada
async function obtenerCatalogos(req, res, next) {
  try {
    const [clientes, gruas, tipos, tiposServicio, conceptos] = await Promise.all([
      CatalogosModel.clientesActivos(),
      CatalogosModel.gruasActivas(),
      CatalogosModel.tiposVehiculo(),
      CatalogosModel.tiposServicioActivos(),
      CatalogosModel.conceptosActivos(),
    ]);
    // Quien no puede corregir servicios (el operador) solo ve los conceptos que
    // le corresponde reportar (no stand-by ni recargo nocturno)
    const conceptosVisibles = tienePermiso(req.usuario.rol, "servicios:corregir")
      ? conceptos
      : conceptos.filter((c) => c.la_reporta_operador);
    res.json({ clientes, gruas, tipos, tipos_servicio: tiposServicio, conceptos: conceptosVisibles });
  } catch (err) {
    next(err);
  }
}

module.exports = { obtenerCatalogos };
