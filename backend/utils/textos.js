/**
 * Textos para mostrar (en Excel y PDF) de los valores internos de la base.
 * Un solo lugar: si cambia un nombre, cambia en todos los reportes.
 */
const ESTADOS_SERVICIO = {
  solicitado: "Solicitado",
  asignado: "Asignado",
  en_desplazamiento: "En desplazamiento",
  en_servicio: "En servicio",
  finalizado: "Finalizado",
  en_revision: "En revisión",
  aprobado: "Aprobado",
  anulado: "Anulado",
};

const ESTADOS_TURNO = { activo: "En turno", finalizado: "Finalizado", cerrado_admin: "Cerrado por el administrador" };

const UNIDADES_COBRO = { evento: "Evento", hora: "Hora", km: "Km", cantidad: "Unidad" };

const COMPONENTES_PAGO = {
  total: "Todo el valor del servicio",
  tarifa_basica: "Tarifa básica",
  valor_a_convenir: "Servicios a convenir (rescate)",
  concepto: "Trabajo adicional",
};

const FORMAS_BOLSA = { fijo: "Valor fijo", por_km: "Por km", a_convenir: "A convenir" };

module.exports = { ESTADOS_SERVICIO, ESTADOS_TURNO, UNIDADES_COBRO, COMPONENTES_PAGO, FORMAS_BOLSA };
