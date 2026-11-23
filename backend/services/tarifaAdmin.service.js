/**
 * Administración de tarifas y precios de conceptos.
 *
 * Reglas (iguales para ambos):
 *  1. "Clientes generales" = cliente_id vacío (null).
 *  2. Rangos de km y vigencias no pueden superponerse: lo garantiza
 *     PostgreSQL (EXCLUDE) y el errorHandler responde 409 "SUPERPOSICION".
 *  3. Una tarifa/precio YA USADO en servicios no se modifica ni se borra:
 *     solo se puede CERRAR su vigencia (vigente_hasta). Para cambiar el precio
 *     se cierra la vigente y se crea una nueva. Así se conserva el histórico.
 *     La fecha de cierre no puede ser anterior al último servicio que la usó.
 *  4. Una tarifa/precio NO usado se puede corregir o borrar (errores de digitación).
 *  5. Todo queda en bitácora.
 */
const { withTransaction } = require("../config/db");
const BitacoraModel = require("../models/bitacora.model");
const { TarifaAdminModel, PrecioConceptoModel, ReglaPagoModel, listarConVigencia, eliminar } = require("../models/tarifaAdmin.model");
const { diferencias } = require("../utils/diferencias");
const { errorNegocio } = require("../utils/errores");

// Campos calculados que no se guardan en la bitácora
const IGNORAR = ["usada", "ultima_fecha_uso", "cliente_nombre", "tipo_vehiculo", "tipo_servicio", "concepto", "unidad_cobro"];
// (las reglas de pago al operador usan el mismo esquema: ver ReglaPagoService)

function validarCoherencia(fila) {
  if (fila.km_hasta !== undefined && fila.km_hasta !== null && Number(fila.km_hasta) <= Number(fila.km_desde)) {
    throw errorNegocio(422, "RANGO_KM_INVALIDO", "El km final debe ser mayor que el km inicial");
  }
  if (fila.vigente_hasta && fila.vigente_hasta < fila.vigente_desde) {
    throw errorNegocio(422, "VIGENCIA_INVALIDA", "La fecha final de vigencia es anterior a la inicial");
  }
}

/**
 * Reglas de pago al operador: coherencia entre "aplica a", concepto y forma.
 * (La base también lo exige; aquí se da un mensaje claro.)
 */
function validarReglaPago(fila) {
  if (fila.componente === "concepto" && !fila.concepto_id) {
    throw errorNegocio(422, "FALTA_CONCEPTO", "Indique el trabajo adicional (concepto) al que aplica la regla");
  }
  if (fila.componente !== "concepto" && fila.concepto_id) {
    throw errorNegocio(422, "CONCEPTO_SOBRA", "El concepto solo se indica cuando la regla aplica a un trabajo adicional");
  }
  if (fila.forma === "no_paga" && fila.valor !== null && fila.valor !== undefined) {
    throw errorNegocio(422, "VALOR_SOBRA", "\"No se paga\" no lleva valor: deje el valor vacío");
  }
  if (fila.forma === "porcentaje" && !(Number(fila.valor) >= 0 && Number(fila.valor) <= 100)) {
    throw errorNegocio(422, "PORCENTAJE_INVALIDO", "El porcentaje debe estar entre 0 y 100");
  }
  if (fila.forma === "fijo_servicio" && !(Number(fila.valor) >= 0)) {
    throw errorNegocio(422, "VALOR_INVALIDO", "Indique el valor fijo en pesos");
  }
}

function crearServicioVersionado({ modelo, entidad, nombre, validar = () => {} }) {
  return {
    listar: (opciones) => listarConVigencia(modelo, opciones),

    async obtener(id) {
      const fila = await modelo.obtenerPorId(id);
      if (!fila) throw errorNegocio(404, "NO_ENCONTRADO", `La ${nombre} no existe`);
      return fila;
    },

    async crear({ datos, usuarioId }) {
      validarCoherencia({ km_desde: 0, ...datos });
      validar(datos);
      return withTransaction(async (client) => {
        const creada = await modelo.crear(client, datos);
        await BitacoraModel.registrar(client, {
          usuarioId,
          entidad,
          registroId: creada.id,
          operacion: "crear",
          nuevos: diferencias({}, creada, { ignorar: IGNORAR }).nuevos,
        });
        return creada;
      });
    },

    async actualizar({ id, cambios, usuarioId, motivo }) {
      return withTransaction(async (client) => {
        const actual = await modelo.obtenerPorId(id, { client, bloquear: true });
        if (!actual) throw errorNegocio(404, "NO_ENCONTRADO", `La ${nombre} no existe`);

        if (actual.usada) {
          const otros = Object.keys(cambios).filter((c) => c !== "vigente_hasta");
          if (otros.length > 0) {
            throw errorNegocio(
              409,
              "TARIFA_EN_USO",
              `Esta ${nombre} ya se aplicó a servicios: solo se puede cerrar su vigencia. Para cambiar el valor, ciérrela y cree una nueva.`,
              { campos_no_permitidos: otros },
            );
          }
          if (cambios.vigente_hasta === null) {
            // reabrir sin fin está permitido
          } else if (actual.ultima_fecha_uso && cambios.vigente_hasta < actual.ultima_fecha_uso) {
            throw errorNegocio(
              409,
              "CIERRE_ANTES_DE_USO",
              `No puede cerrar la vigencia antes del ${actual.ultima_fecha_uso}: hay servicios de esa fecha que la usaron`,
            );
          }
        }
        validarCoherencia({ ...actual, ...cambios });
        validar({ ...actual, ...cambios });

        const actualizada = await modelo.actualizar(client, id, cambios);
        const dif = diferencias(actual, actualizada, { ignorar: IGNORAR });
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
        return actualizada;
      });
    },

    async eliminar({ id, usuarioId, motivo }) {
      return withTransaction(async (client) => {
        const actual = await modelo.obtenerPorId(id, { client, bloquear: true });
        if (!actual) throw errorNegocio(404, "NO_ENCONTRADO", `La ${nombre} no existe`);
        if (actual.usada) {
          throw errorNegocio(409, "TARIFA_EN_USO", `Esta ${nombre} ya se aplicó a servicios: no se puede borrar, solo cerrar su vigencia.`);
        }
        await eliminar(client, modelo.tabla, id);
        await BitacoraModel.registrar(client, {
          usuarioId,
          entidad,
          registroId: id,
          operacion: "anular",
          anteriores: diferencias({}, actual, { ignorar: IGNORAR }).nuevos,
          motivo,
        });
      });
    },
  };
}

const TarifaAdminService = crearServicioVersionado({ modelo: TarifaAdminModel, entidad: "tarifas", nombre: "tarifa" });
const PrecioConceptoService = crearServicioVersionado({ modelo: PrecioConceptoModel, entidad: "precios_concepto", nombre: "tarifa de concepto" });

const ReglaPagoService = crearServicioVersionado({
  modelo: ReglaPagoModel,
  entidad: "reglas_pago_operador",
  nombre: "regla de pago",
  validar: validarReglaPago,
});

module.exports = { TarifaAdminService, PrecioConceptoService, ReglaPagoService };
