/**
 * Capa "Vista" del backend: decide QUÉ CAMPOS recibe cada usuario.
 *
 * Quien no tenga el permiso "valores:ver" (el operador) no recibe ningún
 * valor en pesos. Ocultar en el backend es lo que protege de verdad: aunque
 * alguien inspeccione las respuestas de la API, los valores no viajan.
 *
 * PENDIENTE (P12): confirmar si el operador debe ver algún valor.
 */
const { tienePermiso } = require("../middlewares/permisos");

const CAMPOS_FINANCIEROS = [
  "valor_tarifa_basica",
  "valor_conceptos",
  "valor_calculado",
  "valor_aprobado",
  "porcentaje_operador",
  "tarifa_id",
  "tarifa_bolsa_id",
  "bolsa_km_mes",
  "bolsa_valor",
];

function puedeVerValores(rol) {
  return tienePermiso(rol, "valores:ver");
}

function presentarServicio(servicio, rol) {
  if (!servicio) return servicio;
  const salida = { ...servicio };
  if (!puedeVerValores(rol)) CAMPOS_FINANCIEROS.forEach((campo) => delete salida[campo]);
  return salida;
}

function presentarConceptos(conceptos, rol) {
  if (puedeVerValores(rol)) return conceptos;
  return conceptos.map(({ concepto_id, nombre, unidad_cobro, cantidad }) => ({
    concepto_id,
    nombre,
    unidad_cobro,
    cantidad,
  }));
}

module.exports = { presentarServicio, presentarConceptos };
