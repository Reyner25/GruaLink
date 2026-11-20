/**
 * Administración de grúas.
 *
 * Reglas:
 *  - Al crear una grúa se registra su estado inicial en el historial.
 *  - El estado (activa / mantenimiento / inactiva) se cambia con su propio
 *    endpoint, con motivo, y queda en gruas_estado_historial (lo usa el
 *    reporte "Promedio de grúas").
 *  - No se puede poner en mantenimiento/inactiva una grúa que está en un turno
 *    activo: primero se cierra el turno (si no, el operador seguiría
 *    registrando servicios con una grúa "en taller").
 */
const { withTransaction } = require("../config/db");
const GruaModel = require("../models/grua.model");
const BitacoraModel = require("../models/bitacora.model");
const { crearServicioCatalogo } = require("./catalogoAdmin.service");
const { errorNegocio } = require("../utils/errores");

const base = crearServicioCatalogo({ modelo: GruaModel, entidad: "gruas", nombre: "grúa" });

const GruaService = {
  ...base,

  async crear({ datos, usuarioId }) {
    return withTransaction(async (client) => {
      const creada = await GruaModel.crear(client, datos);
      await client.query(
        `INSERT INTO gruas_estado_historial (grua_id, estado, usuario_id, motivo)
         VALUES ($1, $2, $3, 'Alta de la grúa')`,
        [creada.id, creada.estado, usuarioId],
      );
      await BitacoraModel.registrar(client, {
        usuarioId,
        entidad: "gruas",
        registroId: creada.id,
        operacion: "crear",
        nuevos: creada,
      });
      return creada;
    });
  },

  async cambiarEstado({ id, estado, usuarioId, motivo }) {
    return withTransaction(async (client) => {
      const actual = await GruaModel.obtenerPorId(id, { client, bloquear: true });
      if (!actual) throw errorNegocio(404, "NO_ENCONTRADO", "La grúa no existe");
      if (actual.estado === estado) {
        throw errorNegocio(409, "SIN_CAMBIOS", `La grúa ya está en estado "${estado}"`);
      }
      if (estado !== "activa" && actual.turno_activo_id) {
        throw errorNegocio(
          409,
          "GRUA_EN_TURNO",
          `La grúa está en el turno activo de ${actual.operador_en_turno}. Cierre ese turno primero.`,
          { turno_id: actual.turno_activo_id },
        );
      }

      const actualizada = await GruaModel.cambiarEstado(client, id, { estado, usuarioId, motivo });
      await BitacoraModel.registrar(client, {
        usuarioId,
        entidad: "gruas",
        registroId: id,
        operacion: "actualizar",
        anteriores: { estado: actual.estado },
        nuevos: { estado },
        motivo,
      });
      return actualizada;
    });
  },

  historial: (id) => GruaModel.historial(id),
};

module.exports = GruaService;
