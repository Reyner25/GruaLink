/**
 * Reglas de los servicios de grúa que comparten el flujo del operador
 * (operador.js) y la revisión del administrador (revision.js).
 *
 * Son validaciones: no guardan nada. Si algo no cumple, lanzan errorNegocio.
 */
const ServicioModel = require("../../models/servicio.model");
const CatalogosModel = require("../../models/catalogos.model");
const { errorNegocio } = require("../../utils/errores");

// Margen para diferencias de reloj entre el celular y el servidor
const TOLERANCIA_FUTURO_MIN = 10;

// Estados a los que puede pasar un servicio desde cada estado
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

// ---------- Fechas y horas ----------

function noEnElFuturo(fechaIso, campo) {
  if (!fechaIso) return;
  const limite = Date.now() + TOLERANCIA_FUTURO_MIN * 60 * 1000;
  if (new Date(fechaIso).getTime() > limite) {
    throw errorNegocio(422, "HORA_FUTURA", `${campo} no puede estar en el futuro`);
  }
}

// El servicio no puede empezar antes de que lo pidieran: el tiempo de
// reacción (inicio − solicitud) sería negativo.
function inicioDespuesDeSolicitud(horaSolicitud, inicio) {
  if (horaSolicitud && inicio && new Date(inicio) < new Date(horaSolicitud)) {
    throw errorNegocio(422, "INICIO_ANTES_DE_SOLICITUD", "La hora de inicio es anterior a la hora de solicitud");
  }
}

function finDespuesDeInicio(inicio, fin) {
  if (inicio && fin && new Date(fin) < new Date(inicio)) {
    throw errorNegocio(422, "FIN_ANTES_DE_INICIO", "La hora de finalización es anterior a la de inicio");
  }
}

/**
 * PROVISIONAL (P13): la fecha del servicio debe estar entre el día en que
 * empezó el turno y hoy. Así no se pueden retrodatar servicios para que
 * apliquen tarifas antiguas.
 */
async function validarFechaDentroDelTurno(client, fechaServicio, turno) {
  const { rows } = await client.query(
    `SELECT $1::date BETWEEN $2::timestamptz::date AND current_date AS valida,
            $2::timestamptz::date AS desde, current_date AS hasta`,
    [fechaServicio, turno.inicio],
  );
  if (!rows[0].valida) {
    throw errorNegocio(422, "FECHA_FUERA_DEL_TURNO", `La fecha del servicio debe estar entre ${rows[0].desde} y ${rows[0].hasta}`);
  }
}

// ---------- Catálogos ----------

async function exigirClienteActivo(client, clienteId) {
  if (!(await CatalogosModel.clienteActivo(clienteId, { client }))) {
    throw errorNegocio(422, "CLIENTE_INVALIDO", "El cliente no existe o está inactivo");
  }
}

async function exigirTipoVehiculo(client, id) {
  const tipoVehiculo = await CatalogosModel.tipoVehiculo(id, { client });
  if (!tipoVehiculo) throw errorNegocio(422, "TIPO_VEHICULO_INVALIDO", "El tipo de vehículo no existe");
  return tipoVehiculo;
}

// exigirActivo: al crear o al CAMBIAR el tipo; un servicio viejo puede tener uno ya inactivo
async function exigirTipoServicio(client, id, { exigirActivo = true } = {}) {
  const tipoServicio = await CatalogosModel.tipoServicio(id, { client });
  if (!tipoServicio || (exigirActivo && !tipoServicio.activo)) {
    throw errorNegocio(422, "TIPO_SERVICIO_INVALIDO", "El tipo de servicio no existe o está inactivo");
  }
  return tipoServicio;
}

async function exigirGrua(client, gruaId) {
  if (!(await CatalogosModel.gruaExiste(gruaId, { client }))) throw errorNegocio(422, "GRUA_INVALIDA", "La grúa no existe");
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

// ---------- Lectura con bloqueo ----------

// FOR UPDATE: bloquea la fila hasta el final de la transacción
async function obtenerBloqueado(client, servicioId) {
  const servicio = await ServicioModel.obtenerPorId(servicioId, { client, bloquear: true });
  if (!servicio) throw errorNegocio(404, "SERVICIO_NO_EXISTE", "El servicio no existe");
  return servicio;
}

async function obtenerParaOperador(client, servicioId, operadorId) {
  const servicio = await obtenerBloqueado(client, servicioId);
  if (servicio.operador_id !== operadorId) throw errorNegocio(403, "SIN_PERMISO", "Este servicio no es tuyo");
  return servicio;
}

module.exports = {
  TRANSICIONES,
  validarTransicion,
  noEnElFuturo,
  inicioDespuesDeSolicitud,
  finDespuesDeInicio,
  validarFechaDentroDelTurno,
  exigirClienteActivo,
  exigirTipoVehiculo,
  exigirTipoServicio,
  exigirGrua,
  descripcionVehiculoOtro,
  obtenerBloqueado,
  obtenerParaOperador,
};
