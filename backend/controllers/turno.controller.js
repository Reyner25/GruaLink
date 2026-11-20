/**
 * Controlador de turnos: traduce HTTP <-> servicio de negocio.
 * Nunca toma el operador del cuerpo de la petición: siempre de la sesión.
 */
const TurnoService = require("../services/turno.service");
const TurnoModel = require("../models/turno.model");
const GruaModel = require("../models/grua.model");
const { tienePermiso } = require("../middlewares/permisos");

async function activo(req, res, next) {
  try {
    const turno = await TurnoModel.obtenerActivo(req.usuario.id);
    res.json({ turno });
  } catch (err) {
    next(err);
  }
}

async function gruasDisponibles(req, res, next) {
  try {
    res.json({ gruas: await GruaModel.listarParaTurno() });
  } catch (err) {
    next(err);
  }
}

async function iniciar(req, res, next) {
  try {
    const turno = await TurnoService.iniciar({
      operadorId: req.usuario.id,
      gruaId: req.body.grua_id,
      observaciones: req.body.observaciones,
    });
    res.status(201).json({ turno });
  } catch (err) {
    next(err);
  }
}

async function finalizar(req, res, next) {
  try {
    const turno = await TurnoService.finalizar({
      operadorId: req.usuario.id,
      observaciones: req.body.observaciones,
      justificacion: req.body.justificacion,
    });
    res.json({ turno });
  } catch (err) {
    next(err);
  }
}

// Historial: el operador solo ve los suyos; el administrador puede filtrar
async function listar(req, res, next) {
  try {
    // En Express 5 req.query es de solo lectura: los números se convierten aquí
    const veTodos = tienePermiso(req.usuario.rol, "turnos:ver_todos");
    const turnos = await TurnoModel.listar({
      operadorId: veTodos ? Number(req.query.operador_id) || undefined : req.usuario.id,
      desde: req.query.desde,
      hasta: req.query.hasta,
      limite: Number(req.query.limite) || 30,
      pagina: Number(req.query.pagina) || 1,
    });
    res.json({ turnos });
  } catch (err) {
    next(err);
  }
}

async function cerrarPorAdministrador(req, res, next) {
  try {
    const turno = await TurnoService.cerrarPorAdministrador({
      turnoId: Number(req.params.id),
      adminId: req.usuario.id,
      motivo: req.body.motivo,
    });
    res.json({ turno });
  } catch (err) {
    next(err);
  }
}

module.exports = { activo, gruasDisponibles, iniciar, finalizar, listar, cerrarPorAdministrador };
