/**
 * Controlador de descargas (/api/exportar): lee los filtros, pide el archivo
 * a exportar.service y lo envía. No arma hojas ni consulta la base.
 */
const Exportar = require("../services/exportar.service");
const { tienePermiso } = require("../middlewares/permisos");
const { leerFiltrosServicios, leerFiltrosLiquidacion, leerFiltrosCobro, leerFiltrosTurnos } = require("../validators/reportes.validator");

const TIPOS = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

function enviarArchivo(res, { buffer, nombre }) {
  const extension = nombre.split(".").pop();
  res.setHeader("Content-Type", TIPOS[extension] || "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
  res.send(Buffer.from(buffer));
}

// Opciones de los PDF: el dinero solo sale para quien tiene permiso de ver valores
const opcionesPdf = (req) => ({ mostrarValores: tienePermiso(req.usuario.rol, "valores:ver"), generadoPor: req.usuario.nombre });

// Convierte "async (req) => archivo" en un manejador de Express que lo envía
const descarga = (generar) => async (req, res, next) => {
  try {
    enviarArchivo(res, await generar(req));
  } catch (err) {
    next(err);
  }
};

module.exports = {
  servicios: descarga((req) => Exportar.serviciosExcel(leerFiltrosServicios(req.query))),
  ordenes: descarga((req) => Exportar.ordenesDelPeriodo(leerFiltrosServicios(req.query), opcionesPdf(req))),
  orden: descarga((req) => Exportar.ordenDeServicio(Number(req.params.id), opcionesPdf(req))),
  pagoOperadores: descarga((req) => Exportar.pagoOperadoresExcel(leerFiltrosLiquidacion(req.query))),
  cobro: descarga((req) => Exportar.cobroExcel(leerFiltrosCobro(req.query))),
  cobroOrdenes: descarga((req) => Exportar.cobroOrdenesPdf(leerFiltrosCobro(req.query), opcionesPdf(req))),
  tarifas: descarga((req) => Exportar.tarifasExcel({ clienteId: req.query.cliente_id, vigenteEn: req.query.vigente_en })),
  turnos: descarga((req) => Exportar.turnosExcel(leerFiltrosTurnos(req.query))),
  promedioGruas: descarga((req) => Exportar.promedioGruasExcel({ desde: req.query.desde, hasta: req.query.hasta })),
};
