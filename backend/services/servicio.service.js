/**
 * Reglas de negocio de los servicios de grúa.
 *
 * FLUJO DEL OPERADOR (dos momentos):
 *   1. crear()     → registra cliente, vehículo y datos del servicio.
 *                    Queda en estado "en_servicio".
 *   2. finalizar() → registra hora de fin, entrega y trabajos realizados.
 *                    (Los km, la hora stand-by y el recargo nocturno los
 *                    registra el ADMINISTRADOR en la revisión.)
 *                    Se calculan los valores y queda "finalizado".
 *                    Después de esto el operador ya NO puede modificarlo.
 *   (Si el operador registra el servicio cuando ya terminó, como en el Excel,
 *    la app del celular simplemente llama a los dos seguidos.)
 *
 * Lo que decide SIEMPRE el servidor (nunca el celular):
 *   número de orden, operador, grúa, turno, estado y todos los valores en $.
 *
 * PROVISIONAL (P13): la fecha del servicio debe estar entre el día en que
 * empezó el turno y hoy. Así no se pueden retrodatar servicios para que
 * apliquen tarifas antiguas.
 */
const { withTransaction } = require("../config/db");
const ServicioModel = require("../models/servicio.model");
const TurnoModel = require("../models/turno.model");
const CatalogosModel = require("../models/catalogos.model");
const BitacoraModel = require("../models/bitacora.model");
const { calcularValores } = require("./tarifa.service");
const BolsaKm = require("./bolsaKm.service");

// Fecha "YYYY-MM-DD" → "YYYY-MM" (mes de la bolsa de km)
const mesDe = (fecha) => String(fecha).slice(0, 7);
const { errorNegocio } = require("../utils/errores");
const { diferencias } = require("../utils/diferencias");

// Margen para diferencias de reloj entre el celular y el servidor
const TOLERANCIA_FUTURO_MIN = 10;

const TRANSICIONES = {
  solicitado: ["asignado", "anulado"],
  asignado: ["en_desplazamiento", "anulado"],
  en_desplazamiento: ["en_servicio", "anulado"],
  en_servicio: ["finalizado", "anulado"],
  // Anular después de finalizar: caso real del Excel ("ANULADA, SE CAMBIA POR OS …"),
  // por ejemplo un servicio duplicado detectado en la revisión. Exige motivo.
  finalizado: ["en_revision", "anulado"],
  en_revision: ["aprobado", "finalizado", "anulado"],
  // Un aprobado se puede REABRIR (vuelve a revisión para corregirlo y aprobarlo
  // de nuevo) o ANULAR. Solo el administrador y siempre con motivo.
  aprobado: ["en_revision", "anulado"],
  anulado: [],
};

function validarTransicion(actual, nuevo) {
  if (!TRANSICIONES[actual]?.includes(nuevo)) {
    throw errorNegocio(409, "TRANSICION_INVALIDA", `No se puede pasar de "${actual}" a "${nuevo}"`);
  }
}

function noEnElFuturo(fechaIso, campo) {
  if (!fechaIso) return;
  const limite = Date.now() + TOLERANCIA_FUTURO_MIN * 60 * 1000;
  if (new Date(fechaIso).getTime() > limite) {
    throw errorNegocio(422, "HORA_FUTURA", `${campo} no puede estar en el futuro`);
  }
}

/**
 * Tipo de vehículo "Otro": exige escribir cuál es (ej. "Volqueta").
 * Para cualquier otro tipo, la descripción se descarta (queda NULL).
 */
function descripcionVehiculoOtro(tipoVehiculo, texto) {
  if (!tipoVehiculo.es_otro) return null;
  const limpio = (texto || "").trim();
  if (limpio.length < 2) {
    throw errorNegocio(422, "FALTA_TIPO_VEHICULO_OTRO", "Escriba qué tipo de vehículo es (ej. Volqueta)");
  }
  return limpio;
}

// El servicio no puede empezar antes de que lo pidieran: el tiempo de
// reacción (inicio − solicitud) sería negativo.
function inicioDespuesDeSolicitud(horaSolicitud, inicio) {
  if (horaSolicitud && inicio && new Date(inicio) < new Date(horaSolicitud)) {
    throw errorNegocio(422, "INICIO_ANTES_DE_SOLICITUD", "La hora de inicio es anterior a la hora de solicitud");
  }
}

async function validarFechaDentroDelTurno(client, fechaServicio, turno) {
  const { rows } = await client.query(
    `SELECT $1::date BETWEEN $2::timestamptz::date AND current_date AS valida,
            $2::timestamptz::date AS desde, current_date AS hasta`,
    [fechaServicio, turno.inicio],
  );
  if (!rows[0].valida) {
    throw errorNegocio(
      422,
      "FECHA_FUERA_DEL_TURNO",
      `La fecha del servicio debe estar entre ${rows[0].desde} y ${rows[0].hasta}`,
    );
  }
}

async function obtenerParaOperador(client, servicioId, operadorId) {
  const servicio = await ServicioModel.obtenerPorId(servicioId, { client, bloquear: true });
  if (!servicio) throw errorNegocio(404, "SERVICIO_NO_EXISTE", "El servicio no existe");
  if (servicio.operador_id !== operadorId) {
    throw errorNegocio(403, "SIN_PERMISO", "Este servicio no es tuyo");
  }
  return servicio;
}

const ServicioService = {
  TRANSICIONES,

  async crear({ operadorId, datos }) {
    return withTransaction(async (client) => {
      // 1. Debe tener un turno activo: de ahí salen la grúa y el turno
      const turno = await TurnoModel.obtenerActivo(operadorId, { client });
      if (!turno) {
        throw errorNegocio(409, "SIN_TURNO_ACTIVO", "Debes iniciar tu turno antes de registrar servicios");
      }

      // 2. Catálogos válidos y activos
      if (!(await CatalogosModel.clienteActivo(datos.cliente_id, { client }))) {
        throw errorNegocio(422, "CLIENTE_INVALIDO", "El cliente no existe o está inactivo");
      }
      const tipoVehiculo = await CatalogosModel.tipoVehiculo(datos.tipo_vehiculo_id, { client });
      if (!tipoVehiculo) {
        throw errorNegocio(422, "TIPO_VEHICULO_INVALIDO", "El tipo de vehículo no existe");
      }
      const vehiculoOtro = descripcionVehiculoOtro(tipoVehiculo, datos.tipo_vehiculo_otro);
      const tipoServicio = await CatalogosModel.tipoServicio(datos.tipo_servicio_id, { client });
      if (!tipoServicio || !tipoServicio.activo) {
        throw errorNegocio(422, "TIPO_SERVICIO_INVALIDO", "El tipo de servicio no existe o está inactivo");
      }

      // 3. Fechas y horas coherentes
      await validarFechaDentroDelTurno(client, datos.fecha_servicio, turno);
      noEnElFuturo(datos.hora_solicitud, "La hora de solicitud");
      noEnElFuturo(datos.inicio_servicio, "La hora de inicio");
      inicioDespuesDeSolicitud(datos.hora_solicitud, datos.inicio_servicio);

      // 4. Guardar. Lista explícita: lo que no está aquí, no se guarda.
      const numeroOrden = await ServicioModel.siguienteNumeroOrden(client);
      const id = await ServicioModel.crear(client, {
        numero_orden: numeroOrden,
        operador_id: operadorId, // de la sesión
        grua_id: turno.grua_id, // del turno, no del celular
        turno_id: turno.id,
        cliente_id: datos.cliente_id,
        tipo_vehiculo_id: datos.tipo_vehiculo_id,
        tipo_vehiculo_otro: vehiculoOtro,
        tipo_servicio_id: tipoServicio.id,
        placa_vehiculo: datos.placa_vehiculo,
        numero_vehiculo: datos.numero_vehiculo ?? null,
        fecha_servicio: datos.fecha_servicio,
        hora_solicitud: datos.hora_solicitud ?? null,
        inicio_servicio: datos.inicio_servicio ?? null,
        origen: datos.origen ?? null,
        destino: datos.destino ?? null,
        es_rescate: tipoServicio.es_rescate, // lo decide el tipo de servicio, no el celular
        observaciones: datos.observaciones ?? null,
        estado: "en_servicio",
      });

      const servicio = await ServicioModel.obtenerPorId(id, { client });
      await BitacoraModel.registrar(client, {
        usuarioId: operadorId,
        entidad: "servicios",
        registroId: id,
        operacion: "crear",
        nuevos: servicio,
      });
      return servicio;
    });
  },

  async finalizar({ operadorId, servicioId, datos }) {
    return withTransaction(async (client) => {
      await BolsaKm.bloquearSiAplica(client, servicioId); // clientes por bolsa de km
      // FOR UPDATE: bloquea la fila; dos "finalizar" simultáneos no pueden pasar
      const actual = await obtenerParaOperador(client, servicioId, operadorId);

      if (!ServicioModel.ESTADOS_ABIERTOS.includes(actual.estado)) {
        throw errorNegocio(409, "SERVICIO_YA_CERRADO", `El servicio ya está "${actual.estado}" y no se puede modificar`);
      }
      validarTransicion(actual.estado, "finalizado");

      const inicio = datos.inicio_servicio ?? actual.inicio_servicio;
      if (!inicio) throw errorNegocio(422, "FALTA_INICIO", "Falta la hora de inicio del servicio");
      noEnElFuturo(datos.inicio_servicio, "La hora de inicio");
      inicioDespuesDeSolicitud(actual.hora_solicitud, inicio);
      noEnElFuturo(datos.fin_servicio, "La hora de finalización");
      if (new Date(datos.fin_servicio) < new Date(inicio)) {
        throw errorNegocio(422, "FIN_ANTES_DE_INICIO", "La hora de finalización es anterior a la de inicio");
      }

      const tipoServicio = await CatalogosModel.tipoServicio(actual.tipo_servicio_id, { client });
      const tipoVehiculo = await CatalogosModel.tipoVehiculo(actual.tipo_vehiculo_id, { client });
      const valores = await calcularValores(
        {
          clienteId: actual.cliente_id,
          tipoVehiculo,
          tipoServicio,
          fecha: actual.fecha_servicio,
          kmServicio: actual.km_servicio, // los km los carga el administrador (0 hasta entonces)
          conceptos: datos.conceptos,
          finServicio: datos.fin_servicio, // define el recargo nocturno automático
          soloOperador: true,
          kmVacio: actual.km_vacio,
          servicioId,
          fueraDisponibilidad: actual.fuera_disponibilidad,
        },
        { client },
      );

      await ServicioModel.finalizar(client, servicioId, {
        inicio_servicio: inicio,
        fin_servicio: datos.fin_servicio,
        // km_vacio y km_servicio NO se escriben aquí: los carga el administrador
        km_facturables: valores.km_facturables,
        entregado_sin_novedad: datos.entregado_sin_novedad,
        recibe_nombre: datos.recibe_nombre ?? null,
        recibe_documento: datos.recibe_documento ?? null,
        observaciones_entrega: datos.observaciones_entrega ?? null,
        tarifa_id: valores.tarifa_id,
        valor_tarifa_basica: valores.valor_tarifa_basica,
        valor_conceptos: valores.valor_conceptos,
        valor_calculado: valores.valor_calculado,
        tarifa_bolsa_id: valores.tarifa_bolsa_id,
        bolsa_km_mes: valores.bolsa_km_mes,
        estado: "finalizado",
      });
      await ServicioModel.insertarConceptos(client, servicioId, valores.conceptos);
      // Bolsa de km: los demás servicios del mes pueden cambiar de valor
      await BolsaKm.recalcularMes(client, { clienteId: actual.cliente_id, fecha: actual.fecha_servicio, excluirId: servicioId, usuarioId: operadorId });

      const servicio = await ServicioModel.obtenerPorId(servicioId, { client });
      await BitacoraModel.registrar(client, {
        usuarioId: operadorId,
        entidad: "servicios",
        registroId: servicioId,
        operacion: "finalizar",
        anteriores: { estado: actual.estado },
        nuevos: { ...servicio, conceptos: valores.conceptos },
      });
      return { servicio, conceptos: valores.conceptos, requiereValorManual: valores.requiere_valor_manual };
    });
  },

  /**
   * Cambio de estado por el administrador: pasar a revisión, devolver a
   * finalizado, anular. (Aprobar tiene su propio método porque exige valor.)
   *
   * Servicios APROBADOS (motivo siempre obligatorio):
   *  - Reabrir (→ en_revision): se borran valor aprobado, quién y cuándo, para
   *    que deje de contar como aprobado; quedan guardados en la bitácora.
   *    Después se corrige y se aprueba otra vez con el flujo normal.
   *  - Anular (→ anulado): se conservan los datos de la aprobación como historia.
   */
  async cambiarEstado({ id, nuevoEstado, usuarioId, motivo }) {
    if (nuevoEstado === "aprobado") {
      throw errorNegocio(422, "USE_APROBAR", "Para aprobar use POST /servicios/:id/aprobar (requiere valor aprobado)");
    }
    if (nuevoEstado === "anulado" && !motivo) {
      throw errorNegocio(422, "MOTIVO_OBLIGATORIO", "Para anular un servicio debe escribir el motivo");
    }
    return withTransaction(async (client) => {
      await BolsaKm.bloquearSiAplica(client, id);
      const actual = await ServicioModel.obtenerPorId(id, { client, bloquear: true });
      if (!actual) throw errorNegocio(404, "SERVICIO_NO_EXISTE", "El servicio no existe");
      validarTransicion(actual.estado, nuevoEstado);

      const reabrir = actual.estado === "aprobado" && nuevoEstado === "en_revision";
      if (actual.estado === "aprobado" && !motivo) {
        throw errorNegocio(422, "MOTIVO_OBLIGATORIO", `Para ${reabrir ? "reabrir" : "anular"} un servicio aprobado debe escribir el motivo`);
      }

      const actualizado = reabrir
        ? await ServicioModel.reabrir(client, id)
        : await ServicioModel.actualizarEstado(client, id, nuevoEstado);

      // Para los aprobados, la bitácora guarda también la aprobación que había
      const aprobacion =
        actual.estado === "aprobado"
          ? { valor_aprobado: actual.valor_aprobado, aprobado_por: actual.aprobado_por, aprobado_en: actual.aprobado_en }
          : {};
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
  },

  /**
   * Aprobación por el administrador.
   *  - Solo servicios "finalizado" o "en_revision".
   *  - valor_aprobado: si no se envía, se aprueba el valor calculado.
   *  - Servicios "a convenir" (sin valor calculado) exigen valor_aprobado.
   *  - Si el valor aprobado es distinto del calculado, el motivo es obligatorio.
   */
  async aprobar({ id, usuarioId, valorAprobado, motivo }) {
    return withTransaction(async (client) => {
      const actual = await ServicioModel.obtenerPorId(id, { client, bloquear: true });
      if (!actual) throw errorNegocio(404, "SERVICIO_NO_EXISTE", "El servicio no existe");
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

      await ServicioModel.aprobar(client, id, {
        estado: "aprobado",
        valor_aprobado: valor,
        aprobado_por: usuarioId,
        aprobado_en: new Date(),
      });
      const aprobado = await ServicioModel.obtenerPorId(id, { client });
      await BitacoraModel.registrar(client, {
        usuarioId,
        entidad: "servicios",
        registroId: id,
        operacion: "aprobar",
        anteriores: { estado: actual.estado, valor_aprobado: actual.valor_aprobado },
        nuevos: { estado: "aprobado", valor_aprobado: valor, valor_calculado: calculado },
        motivo,
      });
      return aprobado;
    });
  },

  /**
   * Corrección autorizada por el administrador.
   *
   *  - No se corrigen servicios aprobados ni anulados.
   *  - Motivo obligatorio. Queda en bitácora con valores anteriores y nuevos.
   *  - Si el servicio ya estaba finalizado (o en revisión), los valores se
   *    RECALCULAN con los datos corregidos (tarifa y conceptos vigentes en la
   *    fecha del servicio). Si no se envían conceptos, se conservan los que
   *    tenía, re-preciados (por si cambió el cliente o la fecha).
   *  - En servicios aún abiertos solo se corrigen datos (no hay valores todavía).
   */
  async corregir({ id, usuarioId, cambios, motivo }) {
    return withTransaction(async (client) => {
      await BolsaKm.bloquearSiAplica(client, id);
      const actual = await ServicioModel.obtenerPorId(id, { client, bloquear: true });
      if (!actual) throw errorNegocio(404, "SERVICIO_NO_EXISTE", "El servicio no existe");
      if (["aprobado", "anulado"].includes(actual.estado)) {
        throw errorNegocio(409, "NO_CORREGIBLE", `Un servicio "${actual.estado}" no se puede corregir`);
      }
      const cerrado = ["finalizado", "en_revision"].includes(actual.estado);
      const { conceptos, ...datos } = cambios;
      if (conceptos && !cerrado) {
        throw errorNegocio(422, "CONCEPTOS_NO_PERMITIDOS", "Los conceptos se registran al finalizar el servicio");
      }

      // Catálogos que cambian deben existir y estar activos
      if (datos.cliente_id && !(await CatalogosModel.clienteActivo(datos.cliente_id, { client }))) {
        throw errorNegocio(422, "CLIENTE_INVALIDO", "El cliente no existe o está inactivo");
      }
      const tipoVehiculo = await CatalogosModel.tipoVehiculo(datos.tipo_vehiculo_id ?? actual.tipo_vehiculo_id, { client });
      if (!tipoVehiculo) {
        throw errorNegocio(422, "TIPO_VEHICULO_INVALIDO", "El tipo de vehículo no existe");
      }
      // Si cambia el tipo de vehículo o su descripción, se vuelve a validar "Otro"
      if (datos.tipo_vehiculo_id !== undefined || datos.tipo_vehiculo_otro !== undefined) {
        datos.tipo_vehiculo_otro = descripcionVehiculoOtro(
          tipoVehiculo,
          datos.tipo_vehiculo_otro !== undefined ? datos.tipo_vehiculo_otro : actual.tipo_vehiculo_otro,
        );
      }
      const idTipoServicio = datos.tipo_servicio_id ?? actual.tipo_servicio_id;
      const tipoServicio = await CatalogosModel.tipoServicio(idTipoServicio, { client });
      if (!tipoServicio || (datos.tipo_servicio_id && !tipoServicio.activo)) {
        throw errorNegocio(422, "TIPO_SERVICIO_INVALIDO", "El tipo de servicio no existe o está inactivo");
      }
      // El rescate siempre sigue al tipo de servicio
      if (datos.tipo_servicio_id) datos.es_rescate = tipoServicio.es_rescate;
      if (datos.grua_id) {
        const { rows } = await client.query("SELECT 1 FROM gruas WHERE id = $1", [datos.grua_id]);
        if (!rows[0]) throw errorNegocio(422, "GRUA_INVALIDA", "La grúa no existe");
      }

      const final = { ...actual, ...datos };
      inicioDespuesDeSolicitud(final.hora_solicitud, final.inicio_servicio);
      if (final.inicio_servicio && final.fin_servicio && new Date(final.fin_servicio) < new Date(final.inicio_servicio)) {
        throw errorNegocio(422, "FIN_ANTES_DE_INICIO", "La hora de finalización es anterior a la de inicio");
      }

      const conceptosAntes = await ServicioModel.obtenerConceptos(id, { client });
      let conceptosDespues = conceptosAntes;
      if (cerrado) {
        const valores = await calcularValores(
          {
            clienteId: final.cliente_id,
            tipoVehiculo,
            tipoServicio,
            fecha: final.fecha_servicio,
            kmServicio: final.km_servicio,
            conceptos: conceptos ?? conceptosAntes.map((c) => ({ concepto_id: c.concepto_id, cantidad: c.cantidad })),
            finServicio: final.fin_servicio, // si cambia la hora de fin, el recargo se recalcula
            kmVacio: final.km_vacio,
            servicioId: id,
            fueraDisponibilidad: final.fuera_disponibilidad,
          },
          { client },
        );
        Object.assign(datos, {
          km_facturables: valores.km_facturables,
          tarifa_id: valores.tarifa_id,
          valor_tarifa_basica: valores.valor_tarifa_basica,
          valor_conceptos: valores.valor_conceptos,
          valor_calculado: valores.valor_calculado,
          tarifa_bolsa_id: valores.tarifa_bolsa_id,
          bolsa_km_mes: valores.bolsa_km_mes,
        });
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
  },
};

module.exports = ServicioService;
