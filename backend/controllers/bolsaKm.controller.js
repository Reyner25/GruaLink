/**
 * Controlador de /api/bolsa-km (bolsa de kilometraje mensual, Suma).
 * Traduce HTTP <-> servicios bolsaKm (cálculo del mes) y bolsaTabla
 * (administración de la tabla de tarifas).
 */
const { withTransaction } = require("../config/db");
const BolsaKm = require("../services/bolsaKm.service");
const BolsaTabla = require("../services/bolsaTabla.service");
const BolsaKmModel = require("../models/bolsaKm.model");
const { errorNegocio } = require("../utils/errores");

async function clientes(req, res, next) {
  try {
    res.json({ clientes: await BolsaKmModel.clientes() });
  } catch (err) {
    next(err);
  }
}

// Km del mes, columna aplicada, cuánto falta para la siguiente y los servicios del mes
async function resumenMes(req, res, next) {
  try {
    const clienteId = Number(req.query.cliente_id);
    const { mes } = req.query;
    const [resumen, servicios] = await Promise.all([BolsaKm.resumenMes({ clienteId, mes }), BolsaKmModel.serviciosDelMes(clienteId, mes)]);
    res.json({ ...resumen, servicios });
  } catch (err) {
    next(err);
  }
}

async function recalcular(req, res, next) {
  try {
    const { cliente_id: clienteId, mes } = req.body;
    const cambiaron = await withTransaction(async (client) => {
      if (!(await BolsaKm.esBolsa(client, clienteId))) {
        throw errorNegocio(422, "CLIENTE_SIN_BOLSA", "Este cliente no se cobra por bolsa de km");
      }
      return BolsaKm.recalcularMes(client, { clienteId, fecha: `${mes}-01`, usuarioId: req.usuario.id });
    });
    res.json({ cambiaron });
  } catch (err) {
    next(err);
  }
}

async function tabla(req, res, next) {
  try {
    res.json(await BolsaTabla.tabla({ clienteId: Number(req.query.cliente_id), vigenteDesde: req.query.vigente_desde }));
  } catch (err) {
    next(err);
  }
}

async function actualizarCelda(req, res, next) {
  try {
    const { forma, valor = null, motivo } = req.body;
    res.json({ celda: await BolsaTabla.actualizarCelda({ id: Number(req.params.id), forma, valor, motivo, usuarioId: req.usuario.id }) });
  } catch (err) {
    next(err);
  }
}

async function nuevaVigencia(req, res, next) {
  try {
    const { cliente_id: clienteId, copiar_de: copiarDe, vigente_desde: vigenteDesde, motivo } = req.body;
    res.status(201).json(await BolsaTabla.nuevaVigencia({ clienteId, copiarDe, vigenteDesde, motivo, usuarioId: req.usuario.id }));
  } catch (err) {
    next(err);
  }
}

async function editarVigencia(req, res, next) {
  try {
    const { cliente_id: clienteId, vigente_desde: vigenteDesde, nuevo_desde: nuevoDesde, nuevo_hasta: nuevoHasta, motivo } = req.body;
    res.json(await BolsaTabla.editarVigencia({ clienteId, vigenteDesde, nuevoDesde, nuevoHasta, motivo, usuarioId: req.usuario.id }));
  } catch (err) {
    next(err);
  }
}

async function borrarVigencia(req, res, next) {
  try {
    const { cliente_id: clienteId, vigente_desde: vigenteDesde, motivo } = req.body;
    await BolsaTabla.borrarVigencia({ clienteId, vigenteDesde, motivo, usuarioId: req.usuario.id });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

async function cambiarProvisional(req, res, next) {
  try {
    res.json(await BolsaTabla.cambiarProvisional({ clienteId: req.body.cliente_id, km: req.body.bolsa_km_provisional, usuarioId: req.usuario.id }));
  } catch (err) {
    next(err);
  }
}

module.exports = { clientes, resumenMes, recalcular, tabla, actualizarCelda, nuevaVigencia, editarVigencia, borrarVigencia, cambiarProvisional };
