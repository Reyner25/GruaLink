/**
 * Modelos de los catálogos administrables, construidos con crearModeloCrud.
 * "columnas" = lista blanca de lo que se puede escribir en cada tabla.
 */
const { crearModeloCrud } = require("./crud.model");

const ClienteModel = crearModeloCrud({
  tabla: "clientes",
  columnas: ["razon_social", "nit", "nombre_comercial", "telefono", "email", "direccion", "recargo_nocturno_desde", "modalidad_cobro", "activo"],
  orden: "COALESCE(nombre_comercial, razon_social)",
});

const TipoVehiculoModel = crearModeloCrud({
  tabla: "tipos_vehiculo",
  columnas: ["nombre", "es_otro"],
  orden: "es_otro, nombre",
});

const TipoServicioModel = crearModeloCrud({
  tabla: "tipos_servicio",
  columnas: ["nombre", "valor_a_convenir", "es_rescate", "activo"],
  orden: "nombre",
});

const ConceptoModel = crearModeloCrud({
  tabla: "conceptos_tarifa",
  columnas: ["nombre", "descripcion", "unidad_cobro", "la_reporta_operador", "activo"],
  orden: "nombre",
});

module.exports = { ClienteModel, TipoVehiculoModel, TipoServicioModel, ConceptoModel };
