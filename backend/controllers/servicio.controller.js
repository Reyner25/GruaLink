/**
 * Controlador de servicios: traduce HTTP <-> servicio de negocio.
 * El operador SIEMPRE sale de la sesión (req.usuario), nunca del body.
 */
const ServicioService = require("../services/servicio.service");
const ServicioModel = require("../models/servicio.model");
const { presentarServicio, presentarConceptos } = require("../views/serializers");
const { tienePermiso } = require("../middlewares/permisos");

async function crear(req, res, next) {
  try {
    const servicio = await ServicioService.crear({ operadorId: req.usuario.id, datos: req.body });
    res.status(201).json({ servicio: presentarServicio(servicio, req.usuario.rol) });
  } catch (err) {
    next(err);
  }
}

async function finalizar(req, res, next) {
  try {
    const { servicio, conceptos, requiereValorManual } = await ServicioService.finalizar({
      operadorId: req.usuario.id,
      servicioId: Number(req.params.id),
      datos: req.body,
    });
    res.json({
      servicio: presentarServicio(servicio, req.usuario.rol),
      conceptos: presentarConceptos(conceptos, req.usuario.rol),
      requiere_valor_manual: requiereValorManual,
    });
  } catch (err) {
    next(err);
  }
}

async function cambiarEstado(req, res, next) {
  try {
    const servicio = await ServicioService.cambiarEstado({
      id: Number(req.params.id),
      nuevoEstado: req.body.estado,
      usuarioId: req.usuario.id,
      motivo: req.body.motivo,
    });
    res.json({ servicio: presentarServicio(servicio, req.usuario.rol) });
  } catch (err) {
    next(err);
  }
}

async function aprobar(req, res, next) {
  try {
    const servicio = await ServicioService.aprobar({
      id: Number(req.params.id),
      usuarioId: req.usuario.id,
      valorAprobado: req.body.valor_aprobado ?? undefined,
      motivo: req.body.motivo,
    });
    res.json({ servicio: presentarServicio(servicio, req.usuario.rol) });
  } catch (err) {
    next(err);
  }
}

async function corregir(req, res, next) {
  try {
    const { motivo, ...cambios } = req.body;
    const resultado = await ServicioService.corregir({
      id: Number(req.params.id),
      usuarioId: req.usuario.id,
      cambios,
      motivo,
    });
    res.json({
      servicio: presentarServicio(resultado.servicio, req.usuario.rol),
      conceptos: presentarConceptos(resultado.conceptos, req.usuario.rol),
      cambios: resultado.cambios,
    });
  } catch (err) {
    next(err);
  }
}

async function listar(req, res, next) {
  try {
    // Quien no puede ver todos (operador) queda limitado a SUS servicios
    const veTodos = tienePermiso(req.usuario.rol, "servicios:ver_todos");
    const q = req.query;
    const filas = await ServicioModel.listar({
      operadorId: veTodos ? Number(q.operador_id) || undefined : req.usuario.id,
      desde: q.desde,
      hasta: q.hasta,
      estado: q.estado,
      clienteId: Number(q.cliente_id) || undefined,
      gruaId: Number(q.grua_id) || undefined,
      limite: Number(q.limite) || 50,
      pagina: Number(q.pagina) || 1,
    });
    res.json({ servicios: filas.map((f) => presentarServicio(f, req.usuario.rol)) });
  } catch (err) {
    next(err);
  }
}

async function detalle(req, res, next) {
  try {
    const servicio = await ServicioModel.obtenerPorId(Number(req.params.id));
    if (!servicio) return res.status(404).json({ error: "Servicio no encontrado", codigo: "SERVICIO_NO_EXISTE" });

    const veTodos = tienePermiso(req.usuario.rol, "servicios:ver_todos");
    if (!veTodos && servicio.operador_id !== req.usuario.id) {
      return res.status(403).json({ error: "No puede ver este servicio", codigo: "SIN_PERMISO" });
    }
    const conceptos = await ServicioModel.obtenerConceptos(servicio.id);
    res.json({
      servicio: presentarServicio(servicio, req.usuario.rol),
      conceptos: presentarConceptos(conceptos, req.usuario.rol),
    });
  } catch (err) {
    next(err);
  }
}

async function miResumen(req, res, next) {
  try {
    const { desde, hasta } = req.query;
    const total = await ServicioModel.contarPorOperador(req.usuario.id, { desde, hasta });
    res.json({ total_servicios: total, desde, hasta });
  } catch (err) {
    next(err);
  }
}

module.exports = { crear, finalizar, cambiarEstado, aprobar, corregir, listar, detalle, miResumen };
