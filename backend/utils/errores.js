/**
 * Errores de negocio.
 *
 * En vez de repetir en cada servicio:
 *   const e = new Error("..."); e.status = 409; e.code = "..."; throw e;
 * se escribe:
 *   throw errorNegocio(409, "TURNO_ACTIVO", "Ya tienes un turno activo");
 *
 * El middleware errorHandler convierte este error en la respuesta HTTP.
 */
class ErrorNegocio extends Error {
  constructor(status, codigo, mensaje, detalle) {
    super(mensaje);
    this.status = status;
    this.code = codigo;
    this.detalle = detalle;
  }
}

function errorNegocio(status, codigo, mensaje, detalle) {
  return new ErrorNegocio(status, codigo, mensaje, detalle);
}

module.exports = { ErrorNegocio, errorNegocio };
