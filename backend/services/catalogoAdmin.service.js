/**
 * Lógica común para administrar tablas sencillas, CON BITÁCORA.
 *
 * crearServicioCatalogo({ modelo, entidad, ocultar }) devuelve:
 *   listar, obtener, crear, actualizar
 * Cada crear/actualizar se hace en una transacción y deja registro en la
 * bitácora (quién, qué cambió antes → después, motivo).
 *
 * "ocultar": campos que nunca se guardan en la bitácora (ej. password_hash).
 */
const { withTransaction } = require("../config/db");
const BitacoraModel = require("../models/bitacora.model");
const { diferencias } = require("../utils/diferencias");
const { errorNegocio } = require("../utils/errores");

function sinCampos(objeto, campos) {
  const copia = { ...objeto };
  campos.forEach((c) => delete copia[c]);
  return copia;
}

function crearServicioCatalogo({ modelo, entidad, nombre = "registro", ocultar = [] }) {
  const servicio = {
    listar: (opciones) => modelo.listar(opciones),

    async obtener(id) {
      const fila = await modelo.obtenerPorId(id);
      if (!fila) throw errorNegocio(404, "NO_ENCONTRADO", `El ${nombre} no existe`);
      return fila;
    },

    async crear({ datos, usuarioId }) {
      return withTransaction(async (client) => {
        const creado = await modelo.crear(client, datos);
        await BitacoraModel.registrar(client, {
          usuarioId,
          entidad,
          registroId: creado.id,
          operacion: "crear",
          nuevos: sinCampos(creado, ocultar),
        });
        return creado;
      });
    },

    /**
     * validarCambio(actual, cambios, client): función opcional para reglas
     * propias de cada tabla (ej. "no puedes desactivarte a ti mismo").
     */
    async actualizar({ id, cambios, usuarioId, motivo, validarCambio }) {
      return withTransaction(async (client) => {
        const actual = await modelo.obtenerPorId(id, { client, bloquear: true });
        if (!actual) throw errorNegocio(404, "NO_ENCONTRADO", `El ${nombre} no existe`);
        if (validarCambio) await validarCambio(actual, cambios, client);

        const actualizado = await modelo.actualizar(client, id, cambios);
        const dif = diferencias(sinCampos(actual, ocultar), sinCampos(actualizado, ocultar));
        if (dif.cambio) {
          await BitacoraModel.registrar(client, {
            usuarioId,
            entidad,
            registroId: id,
            operacion: "actualizar",
            anteriores: dif.anteriores,
            nuevos: dif.nuevos,
            motivo,
          });
        }
        return { actual, actualizado, dif };
      });
    },
  };
  return servicio;
}

module.exports = { crearServicioCatalogo, sinCampos };
