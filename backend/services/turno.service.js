/**
 * Reglas de negocio de los turnos del operador.
 *
 * Reglas implementadas:
 *  1. La hora de inicio y fin la pone el SERVIDOR (no el celular).
 *  2. Un operador no puede tener dos turnos activos.
 *  3. Una grúa no puede estar en dos turnos activos.
 *     (Las reglas 2 y 3 también las garantiza PostgreSQL con índices únicos;
 *      aquí se validan antes para dar un mensaje claro.)
 *  4. Solo se puede iniciar turno con una grúa en estado "activa".
 *  5. Para finalizar el turno con servicios sin finalizar, el operador debe
 *     escribir una justificación.
 *  6. El administrador puede cerrar un turno olvidado, con motivo obligatorio.
 *
 * PROVISIONAL (pregunta P3): el operador ELIGE la grúa al iniciar turno,
 * porque en el Excel un mismo operador usa grúas distintas en días distintos.
 */
const { withTransaction } = require("../config/db");
const TurnoModel = require("../models/turno.model");
const GruaModel = require("../models/grua.model");
const ServicioModel = require("../models/servicio.model");
const BitacoraModel = require("../models/bitacora.model");
const { errorNegocio } = require("../utils/errores");

const TurnoService = {
  async iniciar({ operadorId, gruaId, observaciones }) {
    return withTransaction(async (client) => {
      const activo = await TurnoModel.obtenerActivo(operadorId, { client });
      if (activo) {
        throw errorNegocio(409, "TURNO_YA_ACTIVO", "Ya tienes un turno activo", { turno_id: activo.id });
      }

      const grua = await GruaModel.obtenerPorId(gruaId, { client });
      if (!grua) throw errorNegocio(404, "GRUA_NO_EXISTE", "La grúa no existe");
      if (grua.estado !== "activa") {
        throw errorNegocio(409, "GRUA_NO_DISPONIBLE", `La grúa ${grua.numero_interno} está en estado "${grua.estado}"`);
      }

      // Si otro operador la tomó justo ahora, el índice único de PostgreSQL
      // lanza error 23505 y el errorHandler lo traduce a "GRUA_EN_USO".
      const turno = await TurnoModel.crear(client, { operadorId, gruaId, observaciones });

      await BitacoraModel.registrar(client, {
        usuarioId: operadorId,
        entidad: "turnos_operador",
        registroId: turno.id,
        operacion: "iniciar_turno",
        nuevos: { grua_id: gruaId, inicio: turno.inicio, observaciones_inicio: observaciones || null },
      });
      return turno;
    });
  },

  async finalizar({ operadorId, observaciones, justificacion }) {
    return withTransaction(async (client) => {
      // FOR UPDATE: si el operador pulsa "Finalizar" dos veces, la segunda
      // petición espera a la primera y luego ya no encuentra turno activo.
      const turno = await TurnoModel.obtenerActivo(operadorId, { client, bloquear: true });
      if (!turno) throw errorNegocio(409, "SIN_TURNO_ACTIVO", "No tienes un turno activo");

      const abiertos = await ServicioModel.listarAbiertosDeTurno(turno.id, { client });
      if (abiertos.length > 0 && !justificacion) {
        throw errorNegocio(
          409,
          "SERVICIOS_SIN_FINALIZAR",
          `Tienes ${abiertos.length} servicio(s) sin finalizar. Finalízalos o escribe una justificación.`,
          { servicios: abiertos },
        );
      }

      const textoCierre = [observaciones, justificacion && `Justificación servicios abiertos: ${justificacion}`]
        .filter(Boolean)
        .join("\n");

      const cerrado = await TurnoModel.cerrar(client, turno.id, {
        estado: "finalizado",
        observaciones: textoCierre,
      });

      await BitacoraModel.registrar(client, {
        usuarioId: operadorId,
        entidad: "turnos_operador",
        registroId: turno.id,
        operacion: "finalizar_turno",
        anteriores: { estado: "activo" },
        nuevos: { estado: "finalizado", fin: cerrado.fin, servicios_abiertos: abiertos.map((s) => s.numero_orden) },
        motivo: justificacion || null,
      });
      return cerrado;
    });
  },

  async cerrarPorAdministrador({ turnoId, adminId, motivo }) {
    return withTransaction(async (client) => {
      const turno = await TurnoModel.obtenerPorId(turnoId, { client, bloquear: true });
      if (!turno) throw errorNegocio(404, "TURNO_NO_EXISTE", "El turno no existe");
      if (turno.estado !== "activo") {
        throw errorNegocio(409, "TURNO_NO_ACTIVO", "El turno ya está cerrado");
      }

      const cerrado = await TurnoModel.cerrar(client, turnoId, {
        estado: "cerrado_admin",
        observaciones: `Cerrado por administrador: ${motivo}`,
        cerradoPor: adminId,
      });

      await BitacoraModel.registrar(client, {
        usuarioId: adminId,
        entidad: "turnos_operador",
        registroId: turnoId,
        operacion: "cerrar_turno",
        anteriores: { estado: "activo" },
        nuevos: { estado: "cerrado_admin", fin: cerrado.fin },
        motivo,
      });
      return cerrado;
    });
  },
};

module.exports = TurnoService;
