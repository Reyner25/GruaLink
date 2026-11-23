/**
 * Bolsa de kilometraje mensual (cliente Suma). Ver docs/PLAN-SUMA.md.
 *
 * El valor de cada servicio depende de los km de TODO el mes. Por eso, cada
 * vez que un servicio del mes cambia (se finaliza, se corrigen sus km o su
 * fecha, se anula, se reabre…), se RECALCULAN los demás servicios del mes que
 * aún no están aprobados. Los aprobados conservan su valor.
 *
 * Mientras el mes está abierto los valores son provisionales: el último
 * servicio del mes puede cambiar la columna de todos.
 */
const ServicioModel = require("../models/servicio.model");
const CatalogosModel = require("../models/catalogos.model");
const TarifaModel = require("../models/tarifa.model");
const BitacoraModel = require("../models/bitacora.model");
const { calcularValores } = require("./tarifa.service");

const esBolsa = async (client, clienteId) => (await TarifaModel.modalidadCliente(clienteId, { client })) === "bolsa_km_mensual";

/**
 * Bloquea la bolsa del mes del servicio ANTES de tocar filas, para que dos
 * cambios simultáneos del mismo mes se hagan uno tras otro (sin bloqueos
 * cruzados). Se llama al inicio de finalizar / corregir / cambiar estado.
 */
async function bloquearSiAplica(client, servicioId) {
  const { rows } = await client.query(
    `SELECT s.cliente_id, s.fecha_servicio, c.modalidad_cobro
     FROM servicios s JOIN clientes c ON c.id = s.cliente_id WHERE s.id = $1`,
    [servicioId],
  );
  if (rows[0]?.modalidad_cobro === "bolsa_km_mensual") {
    await TarifaModel.bloquearBolsaMes(client, rows[0].cliente_id, rows[0].fecha_servicio);
  }
}

/**
 * Recalcula los servicios abiertos a revisión (finalizado / en revisión)
 * del cliente en el mes de "fecha", dentro de la bolsa. excluirId: el
 * servicio que se acaba de calcular. Devuelve cuántos cambiaron de valor.
 */
async function recalcularMes(client, { clienteId, fecha, excluirId = null, usuarioId = null }) {
  if (!(await esBolsa(client, clienteId))) return 0;
  await TarifaModel.bloquearBolsaMes(client, clienteId, fecha);

  const { rows } = await client.query(
    `SELECT s.id FROM servicios s
     JOIN tipos_servicio ts ON ts.id = s.tipo_servicio_id
     WHERE s.cliente_id = $1
       AND date_trunc('month', s.fecha_servicio) = date_trunc('month', $2::date)
       AND s.estado IN ('finalizado', 'en_revision')
       AND NOT s.fuera_disponibilidad AND ts.usa_bolsa_km
       AND s.id IS DISTINCT FROM $3
     ORDER BY s.id`,
    [clienteId, fecha, excluirId],
  );

  let cambiaron = 0;
  for (const { id } of rows) {
    const s = await ServicioModel.obtenerPorId(id, { client, bloquear: true });
    const conceptos = await ServicioModel.obtenerConceptos(id, { client });
    const valores = await calcularValores(
      {
        clienteId: s.cliente_id,
        tipoVehiculo: await CatalogosModel.tipoVehiculo(s.tipo_vehiculo_id, { client }),
        tipoServicio: await CatalogosModel.tipoServicio(s.tipo_servicio_id, { client }),
        fecha: s.fecha_servicio,
        kmServicio: s.km_servicio,
        kmVacio: s.km_vacio,
        conceptos: conceptos.map((c) => ({ concepto_id: c.concepto_id, cantidad: c.cantidad })),
        finServicio: s.fin_servicio,
        servicioId: id,
        fueraDisponibilidad: s.fuera_disponibilidad,
      },
      { client },
    );
    const igual =
      valores.valor_calculado === s.valor_calculado &&
      valores.tarifa_bolsa_id === s.tarifa_bolsa_id &&
      Number(valores.bolsa_km_mes) === Number(s.bolsa_km_mes);
    if (igual) continue;

    await ServicioModel.actualizarValores(client, id, valores);
    await BitacoraModel.registrar(client, {
      usuarioId,
      entidad: "servicios",
      registroId: id,
      operacion: "actualizar",
      anteriores: { valor_calculado: s.valor_calculado, bolsa_km_mes: s.bolsa_km_mes, tarifa_bolsa_id: s.tarifa_bolsa_id },
      nuevos: { valor_calculado: valores.valor_calculado, bolsa_km_mes: valores.bolsa_km_mes, tarifa_bolsa_id: valores.tarifa_bolsa_id },
      motivo: `Recálculo automático: bolsa de km del mes = ${valores.bolsa_km_mes} km`,
    });
    cambiaron++;
  }
  return cambiaron;
}

/**
 * Resumen de la bolsa de un cliente en un mes ("2026-11"): km acumulados,
 * columna aplicada, cuántos km faltan para la siguiente (más barata) y los
 * servicios del mes con su valor.
 */
async function resumenMes({ clienteId, mes }, { client } = {}) {
  const fecha = `${mes}-01`;
  const opciones = client ? { client } : undefined;
  const kmMes = await TarifaModel.kmBolsaMes({ clienteId, fecha }, opciones);
  const columnas = await TarifaModel.columnasBolsa({ clienteId, fecha }, opciones);
  const n = (v) => (v === null ? null : Number(v));
  const actual = columnas.find((c) => n(c.bolsa_km_desde) <= kmMes && (c.bolsa_km_hasta === null || n(c.bolsa_km_hasta) >= kmMes));
  const siguiente = columnas.find((c) => n(c.bolsa_km_desde) > kmMes);
  return {
    mes,
    km_mes: kmMes,
    columna: actual ? { desde: n(actual.bolsa_km_desde), hasta: n(actual.bolsa_km_hasta) } : null,
    siguiente: siguiente ? { desde: n(siguiente.bolsa_km_desde), faltan_km: Math.round((n(siguiente.bolsa_km_desde) - kmMes) * 100) / 100 } : null,
    columnas: columnas.map((c) => ({ desde: n(c.bolsa_km_desde), hasta: n(c.bolsa_km_hasta) })),
  };
}

module.exports = { bloquearSiAplica, recalcularMes, resumenMes, esBolsa };
