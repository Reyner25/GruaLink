/**
 * Validación y lectura de filtros de reportes, dashboard, exportaciones,
 * cobro, liquidación de operadores y bitácora.
 *
 * Cada "filtros..." es la lista de reglas que va en la ruta (termina en
 * resultadoValidacion). Cada "leer..." convierte req.query (texto) en el
 * objeto que reciben los modelos y servicios (números, nombres en camelCase).
 * En Express 5 req.query es de solo lectura: por eso se lee aquí y no se modifica.
 */
const { query, param } = require("express-validator");
const { resultadoValidacion } = require("./comun");
const { errorNegocio } = require("../utils/errores");
const { ESTADOS_SERVICIO, ESTADOS_TURNO } = require("../utils/textos");

const fechaQuery = (campo, mensaje = `Fecha '${campo}' inválida`) => query(campo).optional().isISO8601({ strict: true }).withMessage(mensaje);
const idQuery = (campo) => query(campo).optional().isInt({ min: 1 });
const numero = (v) => (v ? Number(v) : undefined);
const mesValido = (regla) => regla.matches(/^\d{4}-(0[1-9]|1[0-2])$/).withMessage("Mes inválido (AAAA-MM)");

// Un rango de fechas válido y de máximo un año (366 días)
function validarRango(desde, hasta) {
  const dias = (Date.parse(hasta) - Date.parse(desde)) / 86400000;
  if (dias < 0) throw errorNegocio(422, "RANGO_INVALIDO", "'desde' es posterior a 'hasta'");
  if (dias > 366) throw errorNegocio(422, "RANGO_MUY_LARGO", "El rango máximo es de un año");
}

// ---------- Servicios (dashboard, listado, Excel y PDF de órdenes) ----------
const filtrosServicios = [
  fechaQuery("desde"),
  fechaQuery("hasta"),
  idQuery("cliente_id"),
  idQuery("grua_id"),
  idQuery("operador_id"),
  query("estado").optional().isIn(Object.keys(ESTADOS_SERVICIO)),
  resultadoValidacion,
];
const leerFiltrosServicios = (q) => ({
  desde: q.desde,
  hasta: q.hasta,
  clienteId: numero(q.cliente_id),
  gruaId: numero(q.grua_id),
  operadorId: numero(q.operador_id),
  estado: q.estado,
});

const validarAgrupacion = param("agrupacion").isIn(["cliente", "grua", "operador"]).withMessage("Agrupación: cliente, grua u operador");

// ---------- Liquidación de operadores ----------
const filtrosLiquidacion = [
  query("desde").isISO8601({ strict: true }).withMessage("Fecha 'desde' obligatoria"),
  query("hasta").isISO8601({ strict: true }).withMessage("Fecha 'hasta' obligatoria"),
  idQuery("operador_id"),
  idQuery("cliente_id"),
  resultadoValidacion,
];
function leerFiltrosLiquidacion(q) {
  validarRango(q.desde, q.hasta);
  return { desde: q.desde, hasta: q.hasta, operadorId: numero(q.operador_id), clienteId: numero(q.cliente_id) };
}

// ---------- Cobro mensual ----------
const filtrosCobro = [
  mesValido(query("mes")),
  idQuery("cliente_id"),
  query("incluir_sin_aprobar").optional().isIn(["true", "false"]),
  resultadoValidacion,
];
const leerFiltrosCobro = (q) => ({ mes: q.mes, clienteId: numero(q.cliente_id), incluirSinAprobar: q.incluir_sin_aprobar === "true" });

// ---------- Exportar tarifas y turnos ----------
const filtrosTarifas = [
  query("cliente_id").optional().custom((v) => v === "generales" || /^\d+$/.test(v)),
  fechaQuery("vigente_en"),
  resultadoValidacion,
];

const filtrosTurnos = [
  fechaQuery("desde"),
  fechaQuery("hasta"),
  idQuery("operador_id"),
  idQuery("grua_id"),
  query("estado").optional().isIn(Object.keys(ESTADOS_TURNO)),
  resultadoValidacion,
];
const leerFiltrosTurnos = (q) => ({ operadorId: numero(q.operador_id), gruaId: numero(q.grua_id), estado: q.estado, desde: q.desde, hasta: q.hasta });

// ---------- Bitácora ----------
const filtrosBitacora = [
  query("entidad").optional().isString().isLength({ max: 60 }),
  idQuery("registro_id"),
  idQuery("usuario_id"),
  query("operacion").optional().isString().isLength({ max: 20 }),
  fechaQuery("desde"),
  fechaQuery("hasta"),
  query("limite").optional().isInt({ min: 1, max: 200 }),
  query("pagina").optional().isInt({ min: 1 }),
  resultadoValidacion,
];
const leerFiltrosBitacora = (q) => ({
  entidad: q.entidad,
  registroId: numero(q.registro_id),
  usuarioId: numero(q.usuario_id),
  operacion: q.operacion,
  desde: q.desde,
  hasta: q.hasta,
  limite: Number(q.limite) || 50,
  pagina: Number(q.pagina) || 1,
});

module.exports = {
  mesValido,
  validarRango,
  filtrosServicios,
  leerFiltrosServicios,
  validarAgrupacion,
  filtrosLiquidacion,
  leerFiltrosLiquidacion,
  filtrosCobro,
  leerFiltrosCobro,
  filtrosTarifas,
  filtrosTurnos,
  leerFiltrosTurnos,
  filtrosBitacora,
  leerFiltrosBitacora,
};
