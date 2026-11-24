/**
 * Cálculo de los valores en $ de un servicio, igual al finalizar (operador)
 * que al corregir (administrador). Un solo lugar para no olvidar ningún dato
 * que afecta la tarifa (bolsa de km, recargo nocturno, ajustes manuales…).
 */
const { calcularValores } = require("../tarifa.service");

/**
 * servicio: el servicio con los datos finales (de la base + los cambios).
 * conceptos: [{ concepto_id, cantidad }] trabajos adicionales.
 * finServicio: hora de fin (define el recargo nocturno automático).
 * soloOperador: true cuando el operador finaliza (solo conceptos que él registra).
 */
function calcular(client, { servicio, tipoVehiculo, tipoServicio, conceptos, finServicio, soloOperador = false }) {
  return calcularValores(
    {
      clienteId: servicio.cliente_id,
      tipoVehiculo,
      tipoServicio,
      fecha: servicio.fecha_servicio,
      kmServicio: servicio.km_servicio, // los km los carga el administrador (0 hasta entonces)
      conceptos,
      finServicio,
      ...(soloOperador ? { soloOperador: true } : {}),
      kmVacio: servicio.km_vacio,
      servicioId: servicio.id,
      fueraDisponibilidad: servicio.fuera_disponibilidad,
      tarifaManual: servicio.tarifa_basica_manual, // ajustes del administrador
      recargoModo: servicio.recargo_nocturno,
    },
    { client },
  );
}

// Columnas del servicio que salen del cálculo
const columnasCalculadas = (valores) => ({
  km_facturables: valores.km_facturables,
  tarifa_id: valores.tarifa_id,
  valor_tarifa_basica: valores.valor_tarifa_basica,
  valor_conceptos: valores.valor_conceptos,
  valor_calculado: valores.valor_calculado,
  tarifa_bolsa_id: valores.tarifa_bolsa_id,
  bolsa_km_mes: valores.bolsa_km_mes,
});

module.exports = { calcular, columnasCalculadas };
