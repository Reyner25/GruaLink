/**
 * Dashboard, reportes y bitácora.
 *
 *  /api/dashboard   (administrador y financiero)
 *    GET /resumen          flota + totales de servicios + serie por día
 *                          ?desde ?hasta ?cliente_id ?grua_id ?operador_id ?estado
 *    GET /por/:agrupacion  cliente | grua | operador  (mismos filtros)
 *    GET /promedio-gruas   ?desde ?hasta  (máx. 366 días)
 *
 *  /api/bitacora    (solo administrador)
 *    GET /   ?entidad ?registro_id ?usuario_id ?operacion ?desde ?hasta ?pagina
 */
const { Router } = require("express");
const { query, param } = require("express-validator");
const { autenticar } = require("../middlewares/auth");
const { requierePermiso } = require("../middlewares/permisos");
const { resultadoValidacion } = require("../validators/comun");
const DashboardModel = require("../models/dashboard.model");
const BitacoraModel = require("../models/bitacora.model");
const { errorNegocio } = require("../utils/errores");

const ESTADOS = ["solicitado", "asignado", "en_desplazamiento", "en_servicio", "finalizado", "en_revision", "aprobado", "anulado"];

const filtrosValidos = [
  query("desde").optional().isISO8601({ strict: true }).withMessage("Fecha 'desde' inválida"),
  query("hasta").optional().isISO8601({ strict: true }).withMessage("Fecha 'hasta' inválida"),
  query("cliente_id").optional().isInt({ min: 1 }),
  query("grua_id").optional().isInt({ min: 1 }),
  query("operador_id").optional().isInt({ min: 1 }),
  query("estado").optional().isIn(ESTADOS),
  resultadoValidacion,
];

const leerFiltros = (q) => ({
  desde: q.desde,
  hasta: q.hasta,
  clienteId: q.cliente_id ? Number(q.cliente_id) : undefined,
  gruaId: q.grua_id ? Number(q.grua_id) : undefined,
  operadorId: q.operador_id ? Number(q.operador_id) : undefined,
  estado: q.estado,
});

const hoy = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" }); // AAAA-MM-DD

const dashboard = Router();
dashboard.use(autenticar, requierePermiso("reportes:ver"));

dashboard.get("/resumen", ...filtrosValidos, async (req, res, next) => {
  try {
    const filtros = leerFiltros(req.query);
    const [flota, servicios, porDia] = await Promise.all([
      DashboardModel.flota(),
      DashboardModel.servicios(filtros),
      DashboardModel.porDia(filtros),
    ]);
    res.json({ filtros: req.query, flota, servicios, por_dia: porDia });
  } catch (err) {
    next(err);
  }
});

dashboard.get(
  "/por/:agrupacion",
  param("agrupacion").isIn(["cliente", "grua", "operador"]).withMessage("Agrupación: cliente, grua u operador"),
  ...filtrosValidos,
  async (req, res, next) => {
    try {
      const filas = await DashboardModel.agrupado(leerFiltros(req.query), req.params.agrupacion);
      res.json({ agrupacion: req.params.agrupacion, filas });
    } catch (err) {
      next(err);
    }
  },
);

dashboard.get("/promedio-gruas", ...filtrosValidos, async (req, res, next) => {
  try {
    const hasta = req.query.hasta || hoy();
    const desde = req.query.desde || new Date(Date.parse(hasta) - 6 * 86400000).toISOString().slice(0, 10);
    const dias = (Date.parse(hasta) - Date.parse(desde)) / 86400000;
    if (dias < 0) throw errorNegocio(422, "RANGO_INVALIDO", "'desde' es posterior a 'hasta'");
    if (dias > 366) throw errorNegocio(422, "RANGO_MUY_LARGO", "El rango máximo es de un año");

    const filas = await DashboardModel.promedioGruas({ desde, hasta });
    const promedio = (campo) =>
      filas.length ? Math.round((filas.reduce((s, f) => s + f[campo], 0) / filas.length) * 10) / 10 : 0;
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
});

const bitacora = Router();
bitacora.use(autenticar, requierePermiso("bitacora:ver"));
bitacora.get(
  "/",
  query("entidad").optional().isString().isLength({ max: 60 }),
  query("registro_id").optional().isInt({ min: 1 }),
  query("usuario_id").optional().isInt({ min: 1 }),
  query("operacion").optional().isString().isLength({ max: 20 }),
  query("desde").optional().isISO8601({ strict: true }),
  query("hasta").optional().isISO8601({ strict: true }),
  query("limite").optional().isInt({ min: 1, max: 200 }),
  query("pagina").optional().isInt({ min: 1 }),
  resultadoValidacion,
  async (req, res, next) => {
    try {
      const q = req.query;
      const registros = await BitacoraModel.listar({
        entidad: q.entidad,
        registroId: q.registro_id ? Number(q.registro_id) : undefined,
        usuarioId: q.usuario_id ? Number(q.usuario_id) : undefined,
        operacion: q.operacion,
        desde: q.desde,
        hasta: q.hasta,
        limite: Number(q.limite) || 50,
        pagina: Number(q.pagina) || 1,
      });
      res.json({ registros });
    } catch (err) {
      next(err);
    }
  },
);

module.exports = { dashboard, bitacora };
