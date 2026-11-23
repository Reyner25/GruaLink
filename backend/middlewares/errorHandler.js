/**
 * Manejo centralizado de errores.
 *
 * Todos los controladores hacen next(err); aquí se decide qué ve el cliente.
 *  - Errores de negocio (status 4xx): se muestra su mensaje.
 *  - Errores de PostgreSQL conocidos: se traducen a un mensaje claro.
 *  - Cualquier otro error: 500 genérico (el detalle solo va a la consola,
 *    para no revelar información interna).
 */

// Códigos de error de PostgreSQL → respuesta HTTP
const ERRORES_PG = {
  23505: { status: 409, codigo: "DUPLICADO", mensaje: "El registro ya existe" },
  23503: { status: 422, codigo: "REFERENCIA_INVALIDA", mensaje: "Hace referencia a un dato que no existe" },
  23514: { status: 422, codigo: "REGLA_INCUMPLIDA", mensaje: "Los datos no cumplen una regla de la base de datos" },
  "23P01": { status: 409, codigo: "SUPERPOSICION", mensaje: "Se superpone con otro registro vigente" },
  "22P02": { status: 422, codigo: "FORMATO_INVALIDO", mensaje: "Un dato tiene un formato inválido" },
  "22007": { status: 422, codigo: "FECHA_INVALIDA", mensaje: "Una fecha u hora es inválida" },
  "22008": { status: 422, codigo: "FECHA_INVALIDA", mensaje: "Una fecha u hora está fuera de rango" },
};

// Mensajes más precisos para restricciones con nombre propio
const RESTRICCIONES = {
  ux_turno_activo_por_operador: { codigo: "TURNO_YA_ACTIVO", mensaje: "Ya tienes un turno activo" },
  ux_turno_activo_por_grua: { codigo: "GRUA_EN_USO", mensaje: "Esa grúa ya está en un turno activo de otro operador" },
  servicios_numero_orden_key: { codigo: "ORDEN_DUPLICADA", mensaje: "El número de orden ya existe" },
};

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  // JSON mal formado en el cuerpo de la petición
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "El cuerpo de la petición no es JSON válido", codigo: "JSON_INVALIDO" });
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({ error: "La petición es demasiado grande", codigo: "PETICION_GRANDE" });
  }

  const pg = ERRORES_PG[err.code];
  if (pg) {
    const especifico = RESTRICCIONES[err.constraint] || {};
    return res.status(pg.status).json({
      error: especifico.mensaje || pg.mensaje,
      codigo: especifico.codigo || pg.codigo,
    });
  }

  const status = err.status || 500;
  if (status >= 500) {
    // Al registro del servidor va todo el detalle (fecha, ruta, usuario y pila)…
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} usuario=${req.usuario?.id ?? "-"}`, err);
    // …pero al cliente NO: un código interno (ECONNREFUSED, 42P01…) daría pistas a un atacante
    return res.status(500).json({ error: "Error interno del servidor", codigo: "ERROR_INTERNO" });
  }
  res.status(status).json({
    error: err.message,
    codigo: err.code,
    detalle: err.detalle,
  });
}

module.exports = { errorHandler };
