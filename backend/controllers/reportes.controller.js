/**
 * Controlador de reportes en pantalla: dashboard, bitácora, cobro mensual
 * y liquidación de operadores. (Las descargas están en exportar.controller.)
 */
const DashboardModel = require("../models/dashboard.model");
const BitacoraModel = require("../models/bitacora.model");
const Cobro = require("../services/cobro.service");
const PagoOperador = require("../services/pagoOperador.service");
const V = require("../validators/reportes.validator");

const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" }); // AAAA-MM-DD

// ---------- Dashboard ----------
async function resumen(req, res, next) {
  try {
    const filtros = V.leerFiltrosServicios(req.query);
    const [flota, servicios, porDia] = await Promise.all([DashboardModel.flota(), DashboardModel.servicios(filtros), DashboardModel.porDia(filtros)]);
    res.json({ filtros: req.query, flota, servicios, por_dia: porDia });
  } catch (err) {
    next(err);
  }
}

async function agrupado(req, res, next) {
  try {
    const filas = await DashboardModel.agrupado(V.leerFiltrosServicios(req.query), req.params.agrupacion);
    res.json({ agrupacion: req.params.agrupacion, filas });
  } catch (err) {
    next(err);
  }
}

// Promedio de grúas por día. Sin fechas: los últimos 7 días
async function promedioGruas(req, res, next) {
  try {
    const hasta = req.query.hasta || hoy();
    const desde = req.query.desde || new Date(Date.parse(hasta) - 6 * 86400000).toISOString().slice(0, 10);
    V.validarRango(desde, hasta);

    const filas = await DashboardModel.promedioGruas({ desde, hasta });
    const promedio = (campo) => (filas.length ? Math.round((filas.reduce((s, f) => s + f[campo], 0) / filas.length) * 10) / 10 : 0);
    res.json({
      desde,
      hasta,
      promedio: {
        en_operacion: promedio("en_operacion"),
        mantenimiento: promedio("mantenimiento"),
        inactivas: promedio("inactivas"),
        disponibilidad: promedio("disponibilidad"),
      },
      dias: filas,
    });
  } catch (err) {
    next(err);
  }
}

// ---------- Bitácora ----------
async function bitacora(req, res, next) {
  try {
    res.json({ registros: await BitacoraModel.listar(V.leerFiltrosBitacora(req.query)) });
  } catch (err) {
    next(err);
  }
}

// ---------- Cobro mensual ----------
async function cobro(req, res, next) {
  try {
    const empresas = await Cobro.datos(V.leerFiltrosCobro(req.query));
    // Para la pantalla basta el resumen por empresa (sin el detalle de cada servicio)
    res.json({ iva: Cobro.IVA, empresas: empresas.map(({ servicios, ...e }) => e) });
  } catch (err) {
    next(err);
  }
}

// ---------- Liquidación de operadores ----------
async function liquidacion(req, res, next) {
  try {
    res.json(await PagoOperador.liquidacion(V.leerFiltrosLiquidacion(req.query)));
  } catch (err) {
    next(err);
  }
}

module.exports = { resumen, agrupado, promedioGruas, bitacora, cobro, liquidacion };
