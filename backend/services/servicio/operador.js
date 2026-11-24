/**
 * Flujo del OPERADOR (desde el celular), en dos momentos:
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
 */
const { withTransaction } = require("../../config/db");
const ServicioModel = require("../../models/servicio.model");
const TurnoModel = require("../../models/turno.model");
const CatalogosModel = require("../../models/catalogos.model");
const BitacoraModel = require("../../models/bitacora.model");
const BolsaKm = require("../bolsaKm.service");
const { errorNegocio } = require("../../utils/errores");
const R = require("./reglas");
const { calcular, columnasCalculadas } = require("./valores");

async function crear({ operadorId, datos }) {
  return withTransaction(async (client) => {
    // 1. Debe tener un turno activo: de ahí salen la grúa y el turno
    const turno = await TurnoModel.obtenerActivo(operadorId, { client });
    if (!turno) throw errorNegocio(409, "SIN_TURNO_ACTIVO", "Debes iniciar tu turno antes de registrar servicios");

    // 2. Catálogos válidos y activos
    await R.exigirClienteActivo(client, datos.cliente_id);
    const tipoVehiculo = await R.exigirTipoVehiculo(client, datos.tipo_vehiculo_id);
    const vehiculoOtro = R.descripcionVehiculoOtro(tipoVehiculo, datos.tipo_vehiculo_otro);
    const tipoServicio = await R.exigirTipoServicio(client, datos.tipo_servicio_id);

    // 3. Fechas y horas coherentes
    await R.validarFechaDentroDelTurno(client, datos.fecha_servicio, turno);
    R.noEnElFuturo(datos.hora_solicitud, "La hora de solicitud");
    R.noEnElFuturo(datos.inicio_servicio, "La hora de inicio");
    R.inicioDespuesDeSolicitud(datos.hora_solicitud, datos.inicio_servicio);

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
    await BitacoraModel.registrar(client, { usuarioId: operadorId, entidad: "servicios", registroId: id, operacion: "crear", nuevos: servicio });
    return servicio;
  });
}

async function finalizar({ operadorId, servicioId, datos }) {
  return withTransaction(async (client) => {
    await BolsaKm.bloquearSiAplica(client, servicioId); // clientes por bolsa de km
    // FOR UPDATE: dos "finalizar" simultáneos no pueden pasar
    const actual = await R.obtenerParaOperador(client, servicioId, operadorId);

    if (!ServicioModel.ESTADOS_ABIERTOS.includes(actual.estado)) {
      throw errorNegocio(409, "SERVICIO_YA_CERRADO", `El servicio ya está "${actual.estado}" y no se puede modificar`);
    }
    R.validarTransicion(actual.estado, "finalizado");

    const inicio = datos.inicio_servicio ?? actual.inicio_servicio;
    if (!inicio) throw errorNegocio(422, "FALTA_INICIO", "Falta la hora de inicio del servicio");
    R.noEnElFuturo(datos.inicio_servicio, "La hora de inicio");
    R.inicioDespuesDeSolicitud(actual.hora_solicitud, inicio);
    R.noEnElFuturo(datos.fin_servicio, "La hora de finalización");
    R.finDespuesDeInicio(inicio, datos.fin_servicio);

    // Un servicio ya creado puede tener catálogos que se desactivaron después
    const tipoServicio = await CatalogosModel.tipoServicio(actual.tipo_servicio_id, { client });
    const tipoVehiculo = await CatalogosModel.tipoVehiculo(actual.tipo_vehiculo_id, { client });
    const valores = await calcular(client, {
      servicio: actual,
      tipoVehiculo,
      tipoServicio,
      conceptos: datos.conceptos,
      finServicio: datos.fin_servicio, // define el recargo nocturno automático
      soloOperador: true,
    });

    await ServicioModel.finalizar(client, servicioId, {
      inicio_servicio: inicio,
      fin_servicio: datos.fin_servicio,
      // km_vacio y km_servicio NO se escriben aquí: los carga el administrador
      entregado_sin_novedad: datos.entregado_sin_novedad,
      recibe_nombre: datos.recibe_nombre ?? null,
      recibe_documento: datos.recibe_documento ?? null,
      observaciones_entrega: datos.observaciones_entrega ?? null,
      ...columnasCalculadas(valores),
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
}

module.exports = { crear, finalizar };
