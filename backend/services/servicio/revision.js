/**
 * Revisión del ADMINISTRADOR: cambiar estado (revisión, anular, reabrir),
 * aprobar y corregir. Todo queda en la bitácora con el motivo.
 */
const { withTransaction } = require("../../config/db");
const ServicioModel = require("../../models/servicio.model");
const BitacoraModel = require("../../models/bitacora.model");
const BolsaKm = require("../bolsaKm.service");
const PagoOperador = require("../pagoOperador.service");
const { errorNegocio } = require("../../utils/errores");
const { diferencias } = require("../../utils/diferencias");
const R = require("./reglas");
const { calcular, columnasCalculadas } = require("./valores");

// Fecha "YYYY-MM-DD" → "YYYY-MM" (mes de la bolsa de km)
const mesDe = (fecha) => String(fecha).slice(0, 7);

/**
 * Cambio de estado: pasar a revisión, devolver a finalizado, anular.
 * (Aprobar tiene su propio método porque exige valor.)
 *
 * Servicios APROBADOS (motivo siempre obligatorio):
 *  - Reabrir (→ en_revision): se borran valor aprobado, quién y cuándo, para
 *    que deje de contar como aprobado; quedan guardados en la bitácora.
 *    Después se corrige y se aprueba otra vez con el flujo normal.
 *  - Anular (→ anulado): se conservan los datos de la aprobación como historia.
 */
async function cambiarEstado({ id, nuevoEstado, usuarioId, motivo }) {
  if (nuevoEstado === "aprobado") {
    throw errorNegocio(422, "USE_APROBAR", "Para aprobar use POST /servicios/:id/aprobar (requiere valor aprobado)");
  }
  if (nuevoEstado === "anulado" && !motivo) {
    throw errorNegocio(422, "MOTIVO_OBLIGATORIO", "Para anular un servicio debe escribir el motivo");
  }
  return withTransaction(async (client) => {
    await BolsaKm.bloquearSiAplica(client, id);
    const actual = await R.obtenerBloqueado(client, id);
    R.validarTransicion(actual.estado, nuevoEstado);

    const reabrir = actual.estado === "aprobado" && nuevoEstado === "en_revision";
    if (actual.estado === "aprobado" && !motivo) {
      throw errorNegocio(422, "MOTIVO_OBLIGATORIO", `Para ${reabrir ? "reabrir" : "anular"} un servicio aprobado debe escribir el motivo`);
    }

    const actualizado = reabrir ? await ServicioModel.reabrir(client, id) : await ServicioModel.actualizarEstado(client, id, nuevoEstado);

    // Para los aprobados, la bitácora guarda también la aprobación que había
    const aprobacion =
      actual.estado === "aprobado" ? { valor_aprobado: actual.valor_aprobado, aprobado_por: actual.aprobado_por, aprobado_en: actual.aprobado_en } : {};
    await BitacoraModel.registrar(client, {
      usuarioId,
      entidad: "servicios",
      registroId: id,
      operacion: nuevoEstado === "anulado" ? "anular" : reabrir ? "reabrir" : "actualizar",
      anteriores: { estado: actual.estado, ...aprobacion },
      nuevos: reabrir ? { estado: nuevoEstado, valor_aprobado: null, aprobado_por: null, aprobado_en: null } : { estado: nuevoEstado },
      motivo,
    });
    // Bolsa de km: anular saca sus km del mes; reabrir lo vuelve a recalcular
    if (await BolsaKm.recalcularMes(client, { clienteId: actual.cliente_id, fecha: actual.fecha_servicio, usuarioId })) {
      return ServicioModel.obtenerPorId(id, { client });
    }
    return actualizado;
  });
}

/**
 * Aprobación.
 *  - Solo servicios "finalizado" o "en_revision".
 *  - valor_aprobado: si no se envía, se aprueba el valor calculado.
 *  - Servicios "a convenir" (sin valor calculado) exigen valor_aprobado.
 *  - Si el valor aprobado es distinto del calculado, el motivo es obligatorio.
 */
async function aprobar({ id, usuarioId, valorAprobado, motivo }) {
  return withTransaction(async (client) => {
    const actual = await R.obtenerBloqueado(client, id);
    if (!["finalizado", "en_revision"].includes(actual.estado)) {
      throw errorNegocio(409, "NO_APROBABLE", `Solo se aprueban servicios finalizados o en revisión (está "${actual.estado}")`);
    }

    const calculado = actual.valor_calculado;
    const valor = valorAprobado ?? calculado;
    if (valor === null || valor === undefined) {
      throw errorNegocio(422, "VALOR_OBLIGATORIO", "Este servicio no tiene valor calculado (a convenir): indique el valor aprobado");
    }
    if (calculado !== null && valor !== calculado && !motivo) {
      throw errorNegocio(422, "MOTIVO_OBLIGATORIO", "El valor aprobado es distinto del calculado: escriba el motivo");
    }

    await ServicioModel.aprobar(client, id, { estado: "aprobado", valor_aprobado: valor, aprobado_por: usuarioId, aprobado_en: new Date() });
    // Pago al operador: queda fijo con el valor aprobado y las reglas de hoy
    const pago = await PagoOperador.guardarAlAprobar(client, id);
    const aprobado = await ServicioModel.obtenerPorId(id, { client });
    await BitacoraModel.registrar(client, {
      usuarioId,
      entidad: "servicios",
      registroId: id,
      operacion: "aprobar",
      anteriores: { estado: actual.estado, valor_aprobado: actual.valor_aprobado },
      nuevos: { estado: "aprobado", valor_aprobado: valor, valor_calculado: calculado, valor_operador: pago.valor },
      motivo,
    });
    return aprobado;
  });
}

/**
 * Corrección autorizada.
 *
 *  - No se corrigen servicios aprobados ni anulados.
 *  - Motivo obligatorio. Queda en bitácora con valores anteriores y nuevos.
 *  - Si el servicio ya estaba finalizado (o en revisión), los valores se
 *    RECALCULAN con los datos corregidos (tarifa y conceptos vigentes en la
 *    fecha del servicio). Si no se envían conceptos, se conservan los que
 *    tenía, re-preciados (por si cambió el cliente o la fecha).
 *  - En servicios aún abiertos solo se corrigen datos (no hay valores todavía).
 */
async function corregir({ id, usuarioId, cambios, motivo }) {
  return withTransaction(async (client) => {
    await BolsaKm.bloquearSiAplica(client, id);
    const actual = await R.obtenerBloqueado(client, id);
    if (["aprobado", "anulado"].includes(actual.estado)) {
      throw errorNegocio(409, "NO_CORREGIBLE", `Un servicio "${actual.estado}" no se puede corregir`);
    }
    const cerrado = ["finalizado", "en_revision"].includes(actual.estado);
    const { conceptos, ...datos } = cambios;
    if (conceptos && !cerrado) {
      throw errorNegocio(422, "CONCEPTOS_NO_PERMITIDOS", "Los conceptos se registran al finalizar el servicio");
    }

    // Catálogos que cambian deben existir y estar activos
    if (datos.cliente_id) await R.exigirClienteActivo(client, datos.cliente_id);
    const tipoVehiculo = await R.exigirTipoVehiculo(client, datos.tipo_vehiculo_id ?? actual.tipo_vehiculo_id);
    // Si cambia el tipo de vehículo o su descripción, se vuelve a validar "Otro"
    if (datos.tipo_vehiculo_id !== undefined || datos.tipo_vehiculo_otro !== undefined) {
      datos.tipo_vehiculo_otro = R.descripcionVehiculoOtro(
        tipoVehiculo,
        datos.tipo_vehiculo_otro !== undefined ? datos.tipo_vehiculo_otro : actual.tipo_vehiculo_otro,
      );
    }
    const tipoServicio = await R.exigirTipoServicio(client, datos.tipo_servicio_id ?? actual.tipo_servicio_id, {
      exigirActivo: Boolean(datos.tipo_servicio_id),
    });
    // El rescate siempre sigue al tipo de servicio
    if (datos.tipo_servicio_id) datos.es_rescate = tipoServicio.es_rescate;
    if (datos.grua_id) await R.exigirGrua(client, datos.grua_id);

    const final = { ...actual, ...datos };
    R.inicioDespuesDeSolicitud(final.hora_solicitud, final.inicio_servicio);
    R.finDespuesDeInicio(final.inicio_servicio, final.fin_servicio);

    const conceptosAntes = await ServicioModel.obtenerConceptos(id, { client });
    let conceptosDespues = conceptosAntes;
    if (cerrado) {
      const valores = await calcular(client, {
        servicio: final,
        tipoVehiculo,
        tipoServicio,
        conceptos: conceptos ?? conceptosAntes.map((c) => ({ concepto_id: c.concepto_id, cantidad: c.cantidad })),
        finServicio: final.fin_servicio, // si cambia la hora de fin, el recargo se recalcula
      });
      Object.assign(datos, columnasCalculadas(valores));
      await ServicioModel.reemplazarConceptos(client, id, valores.conceptos);
      conceptosDespues = valores.conceptos;
    }

    await ServicioModel.corregir(client, id, datos);
    // Bolsa de km: recalcular el mes del servicio (y el nuevo, si cambió de mes o de cliente)
    await BolsaKm.recalcularMes(client, { clienteId: actual.cliente_id, fecha: actual.fecha_servicio, excluirId: id, usuarioId });
    if (final.cliente_id !== actual.cliente_id || mesDe(final.fecha_servicio) !== mesDe(actual.fecha_servicio)) {
      await BolsaKm.recalcularMes(client, { clienteId: final.cliente_id, fecha: final.fecha_servicio, excluirId: id, usuarioId });
    }
    const corregido = await ServicioModel.obtenerPorId(id, { client });

    const dif = diferencias(actual, corregido);
    const resumen = (lista) => lista.map((c) => ({ concepto_id: c.concepto_id, cantidad: c.cantidad, total: c.total }));
    if (JSON.stringify(resumen(conceptosAntes)) !== JSON.stringify(resumen(conceptosDespues))) {
      dif.anteriores.conceptos = resumen(conceptosAntes);
      dif.nuevos.conceptos = resumen(conceptosDespues);
      dif.cambio = true;
    }
    if (!dif.cambio) throw errorNegocio(422, "SIN_CAMBIOS", "Los datos enviados son iguales a los actuales");

    await BitacoraModel.registrar(client, {
      usuarioId,
      entidad: "servicios",
      registroId: id,
      operacion: "autorizar_correccion",
      anteriores: dif.anteriores,
      nuevos: dif.nuevos,
      motivo,
    });
    return { servicio: corregido, conceptos: conceptosDespues, cambios: dif };
  });
}

module.exports = { cambiarEstado, aprobar, corregir };
