/**
 * Servicios de los catálogos administrables + sus reglas propias.
 */
const { crearServicioCatalogo } = require("./crudConBitacora.service");
const M = require("../models/catalogosAdmin.model");
const { errorNegocio } = require("../utils/errores");

const ClienteService = crearServicioCatalogo({ modelo: M.ClienteModel, entidad: "clientes", nombre: "cliente" });
const TipoVehiculoService = crearServicioCatalogo({ modelo: M.TipoVehiculoModel, entidad: "tipos_vehiculo", nombre: "tipo de vehículo" });
const TipoServicioService = crearServicioCatalogo({ modelo: M.TipoServicioModel, entidad: "tipos_servicio", nombre: "tipo de servicio" });
const ConceptoService = crearServicioCatalogo({ modelo: M.ConceptoModel, entidad: "conceptos_tarifa", nombre: "concepto" });

/**
 * Regla: la unidad de cobro de un concepto ya usado en servicios no se puede
 * cambiar (los servicios guardados quedarían con cantidades sin sentido:
 * "2" horas no es lo mismo que "2" eventos). Se crea un concepto nuevo.
 */
async function validarCambioConcepto(actual, cambios, client) {
  // El horario solo aplica al concepto que el sistema usa como recargo nocturno
  for (const campo of ["recargo_desde", "recargo_hasta"]) {
    if (cambios[campo] === undefined) continue;
    if (!actual.es_recargo_nocturno) {
      throw errorNegocio(422, "SOLO_RECARGO", "El horario solo se configura en el concepto de recargo nocturno");
    }
    if (cambios[campo] === null) {
      throw errorNegocio(422, "HORA_OBLIGATORIA", "Indique la hora de inicio y de fin del recargo nocturno");
    }
  }
  if (cambios.unidad_cobro && cambios.unidad_cobro !== actual.unidad_cobro) {
    const { rows } = await client.query(
      "SELECT 1 FROM servicio_conceptos WHERE concepto_id = $1 LIMIT 1",
      [actual.id],
    );
    if (rows[0]) {
      throw errorNegocio(409, "CONCEPTO_EN_USO", "Este concepto ya se usó en servicios: no se puede cambiar su unidad de cobro. Cree un concepto nuevo.");
    }
  }
}

module.exports = {
  ClienteService,
  TipoVehiculoService,
  TipoServicioService,
  ConceptoService,
  validarCambioConcepto,
};
