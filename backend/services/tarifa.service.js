/**
 * Cálculo de valores de un servicio. SIEMPRE en el backend: el celular nunca
 * envía precios, solo QUÉ se hizo (cliente, vehículo, tipo de servicio, km,
 * conceptos y cantidades).
 *
 * valor_calculado = valor_tarifa_basica + valor_conceptos
 *
 * Reglas:
 *  - Tarifa básica: se busca la del cliente; si no tiene, la de "Clientes
 *    generales". Si hay más de una que aplique → error (nunca se elige al azar).
 *  - Tipo de servicio "a convenir" (ej. rescate): no hay tarifa básica;
 *    el administrador define el valor al revisar el servicio.
 *  - PROVISIONAL: vehículo tipo "Otro" (volqueta, camión…): no tiene tarifa
 *    propia, así que también queda "a convenir".
 *  - Conceptos: precio del cliente o, si no existe, el general.
 *    total = valor unitario × cantidad.
 *
 * PROVISIONAL (pregunta P8): km facturables = km de servicio (sin km en vacío).
 * Los km los registra el ADMINISTRADOR en la revisión (corrección autorizada),
 * no el operador. Al finalizar, el servicio se calcula con los km que tenga
 * (0 por defecto) y se recalcula cuando el administrador los corrige.
 * PENDIENTE (P10): conceptos con unidad "porcentaje" se rechazan hasta definir
 *   sobre qué base se calculan.
 *
 * RECARGO NOCTURNO AUTOMÁTICO (tarifas 2026): si el servicio TERMINA después
 * de la hora de corte (20:40 general; cada cliente puede tener la suya, ej.
 * La Rolita 19:00) y antes de las 6:00 a. m. (hora de Colombia), se agrega
 * solo el concepto marcado como recargo (cantidad 1). Nadie lo agrega ni lo
 * quita a mano: si la hora de fin cambia en una corrección, se recalcula.
 */
const TarifaModel = require("../models/tarifa.model");
const { errorNegocio } = require("../utils/errores");

// Redondea a 2 decimales (centavos) para que coincida con NUMERIC(12,2)
const redondear = (n) => Math.round(Number(n) * 100) / 100;

const RECARGO_NOCTURNO = {
  desdeGeneral: "20:40", // hora de corte de "Clientes generales"
  hasta: "06:00", // hasta esta hora de la madrugada sigue aplicando
};

const minutosDelDia = (hhmm) => {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
};

/**
 * ¿La hora de fin cae en horario nocturno? Se compara la hora de COLOMBIA.
 * Estrictamente después de la hora de corte (20:40 → 20:41 sí, 20:40 no) y
 * antes de las 6:00 (05:59 sí, 06:00 no).
 */
function esNocturno(finServicio, desde = RECARGO_NOCTURNO.desdeGeneral) {
  if (!finServicio) return false;
  const fin = new Date(finServicio);
  if (Number.isNaN(fin.getTime())) return false;
  const partes = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(fin);
  const minutos = minutosDelDia(partes);
  return minutos > minutosDelDia(desde) || minutos < minutosDelDia(RECARGO_NOCTURNO.hasta);
}

/**
 * Quita el recargo que venga en la lista (es automático) y lo agrega si
 * corresponde según la hora de fin. Devuelve la lista final de conceptos.
 */
async function aplicarRecargoNocturno({ conceptos = [], clienteId, finServicio }, opciones) {
  const regla = await TarifaModel.reglaRecargoNocturno(clienteId, opciones);
  if (!regla.concepto_id) return { conceptos, automaticos: new Set() };
  const sinRecargo = conceptos.filter((c) => c.concepto_id !== regla.concepto_id);
  if (!esNocturno(finServicio, regla.desde || RECARGO_NOCTURNO.desdeGeneral)) return { conceptos: sinRecargo, automaticos: new Set() };
  return { conceptos: [...sinRecargo, { concepto_id: regla.concepto_id, cantidad: 1 }], automaticos: new Set([regla.concepto_id]) };
}

function kmFacturables({ kmServicio }) {
  return redondear(kmServicio);
}

async function seleccionarTarifa({ clienteId, tipoVehiculoId, tipoServicioId, fecha, km }, opciones) {
  const candidatas = await TarifaModel.buscarCandidatas(
    { clienteId, tipoVehiculoId, tipoServicioId, fecha, km },
    opciones,
  );

  // Si el cliente tiene tarifa propia, se ignoran las generales
  const delCliente = candidatas.filter((t) => t.cliente_id !== null);
  const aplicables = delCliente.length > 0 ? delCliente : candidatas;

  if (aplicables.length === 0) {
    throw errorNegocio(
      422,
      "TARIFA_NO_ENCONTRADA",
      "No hay tarifa vigente para este cliente, tipo de vehículo, tipo de servicio y kilometraje. Avise al administrador.",
    );
  }
  if (aplicables.length > 1) {
    throw errorNegocio(409, "TARIFA_AMBIGUA", "Hay varias tarifas que aplican. Revise la configuración tarifaria.", {
      tarifas: aplicables.map((t) => t.id),
    });
  }

  const [tarifa] = aplicables;
  return {
    tarifaId: tarifa.id,
    valor: redondear(tarifa.valor),
    origen: tarifa.cliente_id ? "cliente" : "clientes_generales",
  };
}

/**
 * soloOperador=true: cuando el que envía los conceptos es el OPERADOR, se
 * rechazan los que no le corresponde reportar (stand-by, recargo nocturno).
 */
async function calcularConceptos({ conceptos = [], clienteId, fecha, soloOperador = false, automaticos = new Set() }, opciones) {
  if (conceptos.length === 0) return { detalle: [], total: 0 };

  const ids = conceptos.map((c) => c.concepto_id);
  if (new Set(ids).size !== ids.length) {
    throw errorNegocio(422, "CONCEPTO_REPETIDO", "Un concepto aparece dos veces; use la cantidad");
  }

  const precios = await TarifaModel.preciosDeConceptos({ conceptoIds: ids, clienteId, fecha }, opciones);
  const porId = new Map(precios.map((p) => [p.concepto_id, p]));

  const detalle = conceptos.map(({ concepto_id: id, cantidad }) => {
    const precio = porId.get(id);
    if (!precio || !precio.activo) {
      throw errorNegocio(422, "CONCEPTO_INVALIDO", `El concepto ${id} no existe o está inactivo`);
    }
    // Los automáticos (recargo nocturno) los agrega el sistema, no el operador
    if (soloOperador && !precio.la_reporta_operador && !automaticos.has(id)) {
      throw errorNegocio(403, "CONCEPTO_SOLO_ADMIN", `"${precio.nombre}" lo aplica el administrador, no el operador`);
    }
    if (precio.unidad_cobro === "porcentaje") {
      throw errorNegocio(422, "CONCEPTO_SIN_REGLA", `"${precio.nombre}" se cobra por porcentaje y esa regla aún no está definida`);
    }
    if (precio.valor === null) {
      throw errorNegocio(422, "CONCEPTO_SIN_PRECIO", `"${precio.nombre}" no tiene precio vigente para esta fecha`);
    }
    return {
      concepto_id: id,
      nombre: precio.nombre,
      unidad_cobro: precio.unidad_cobro,
      cantidad: redondear(cantidad),
      valor_unitario: redondear(precio.valor),
      total: redondear(precio.valor * cantidad),
    };
  });

  return { detalle, total: redondear(detalle.reduce((suma, d) => suma + d.total, 0)) };
}

/**
 * BOLSA DE KILOMETRAJE MENSUAL (cliente Suma, docs/PLAN-SUMA.md).
 * Servicio DENTRO de la disponibilidad:
 *  - km del servicio = servicio + vacío (así lo dice la tabla de Suma).
 *  - bolsa del mes = km de los demás servicios del mes + los de este.
 *  - La celda (columna por bolsa, fila por km) da el valor: fijo, km × $/km
 *    (< 10 km) o a convenir (> 95 km).
 *  - Los trabajos adicionales se REGISTRAN pero no se cobran (valor 0) y no
 *    hay recargo nocturno: solo se cobran fuera de la disponibilidad.
 *  - MES ABIERTO (23/11/2026): mientras no se sabe en qué bolsa va a caer el
 *    mes, se usa la columna PROVISIONAL 1500–1800 km (bolsa_km_mes queda
 *    vacío). Cuando el mes termina, el mantenimiento recalcula el mes con la
 *    columna real (mantenimiento.service.js).
 * Cuando cambian los km o el estado de un servicio de un mes cerrado, los
 * demás se recalculan (bolsaKm.service.js).
 */
const BOLSA_PROVISIONAL = { columna: "1500–1800", km: 1800 }; // km que cae en esa columna

async function calcularPorBolsa({ clienteId, fecha, kmServicio, kmVacio, conceptos, soloOperador, servicioId }, opciones) {
  const client = opciones?.client;
  if (client) await TarifaModel.bloquearBolsaMes(client, clienteId, fecha);
  const km = redondear(Number(kmServicio || 0) + Number(kmVacio || 0));
  const provisional = await TarifaModel.mesAbierto(fecha, opciones);
  const kmMes = provisional ? null : redondear((await TarifaModel.kmBolsaMes({ clienteId, fecha, excluirId: servicioId }, opciones)) + km);
  const celda = await TarifaModel.celdaBolsa({ clienteId, fecha, kmMes: provisional ? BOLSA_PROVISIONAL.km : kmMes, km }, opciones);
  if (!celda) {
    throw errorNegocio(422, "TARIFA_BOLSA_NO_ENCONTRADA", "No hay tabla de bolsa de km vigente para este cliente y fecha. Avise al administrador.");
  }

  // Adicionales: se validan y registran, sin cobro
  const registrados = await calcularConceptos({ conceptos, clienteId: null, fecha, soloOperador }, opciones);
  const sinCobro = registrados.detalle.map((c) => ({ ...c, valor_unitario: 0, total: 0 }));

  const valor =
    celda.forma === "fijo" ? redondear(celda.valor) : celda.forma === "por_km" ? Math.round(Number(celda.valor) * km) : null;
  return {
    km_facturables: km,
    tarifa_id: null,
    tarifa_bolsa_id: celda.id,
    bolsa_km_mes: kmMes, // null = columna provisional (mes abierto)
    valor_tarifa_basica: valor,
    valor_conceptos: 0,
    valor_calculado: valor, // null = a convenir (> 95 km)
    requiere_valor_manual: valor === null,
    conceptos: sinCobro,
  };
}

/**
 * Calcula todos los valores de un servicio.
 * Devuelve lo que se guarda en la tabla servicios + el detalle de conceptos.
 *
 * Clientes por bolsa de km (Suma): los remolques dentro de la disponibilidad
 * van por calcularPorBolsa; todo lo demás (fuera de la disponibilidad,
 * servicio fallido) se cobra con la tarifa y los precios de CLIENTES GENERALES.
 */
async function calcularValores(
  {
    clienteId, tipoVehiculo, tipoServicio, fecha, kmServicio, kmVacio = 0, conceptos, finServicio,
    soloOperador = false, servicioId = null, fueraDisponibilidad = false,
  },
  opciones,
) {
  const porBolsa = (await TarifaModel.modalidadCliente(clienteId, opciones)) === "bolsa_km_mensual";
  if (porBolsa && !fueraDisponibilidad && tipoServicio.usa_bolsa_km && !tipoServicio.valor_a_convenir && !tipoVehiculo.es_otro) {
    return calcularPorBolsa({ clienteId, fecha, kmServicio, kmVacio, conceptos, soloOperador, servicioId }, opciones);
  }
  // Cliente por bolsa, servicio que no va en la bolsa → tarifa general
  const clienteTarifa = porBolsa ? null : clienteId;

  const km = kmFacturables({ kmServicio });
  // La hora de corte del recargo es la del cliente; el precio, el de su tarifa
  const conRecargo = await aplicarRecargoNocturno({ conceptos, clienteId, finServicio }, opciones);
  const adicionales = await calcularConceptos(
    { conceptos: conRecargo.conceptos, clienteId: clienteTarifa, fecha, soloOperador, automaticos: conRecargo.automaticos },
    opciones,
  );
  const sinBolsa = { tarifa_bolsa_id: null, bolsa_km_mes: null };

  if (tipoServicio.valor_a_convenir || tipoVehiculo.es_otro) {
    return {
      ...sinBolsa,
      km_facturables: km,
      tarifa_id: null,
      valor_tarifa_basica: null,
      valor_conceptos: adicionales.total,
      valor_calculado: null, // lo define el administrador
      requiere_valor_manual: true,
      conceptos: adicionales.detalle,
    };
  }

  const tarifa = await seleccionarTarifa(
    { clienteId: clienteTarifa, tipoVehiculoId: tipoVehiculo.id, tipoServicioId: tipoServicio.id, fecha, km },
    opciones,
  );
  return {
    ...sinBolsa,
    km_facturables: km,
    tarifa_id: tarifa.tarifaId,
    valor_tarifa_basica: tarifa.valor,
    valor_conceptos: adicionales.total,
    valor_calculado: redondear(tarifa.valor + adicionales.total),
    requiere_valor_manual: false,
    conceptos: adicionales.detalle,
  };
}

module.exports = { BOLSA_PROVISIONAL, calcularValores, seleccionarTarifa, calcularConceptos, kmFacturables, redondear, esNocturno, RECARGO_NOCTURNO };
