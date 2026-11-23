/**
 * Catálogos (listas) que usan los formularios: clientes, tipos de vehículo,
 * tipos de servicio, conceptos y grúas.
 */
const { pool } = require("../config/db");

const CatalogosModel = {
  async clientesActivos() {
    const { rows } = await pool.query(
      `SELECT id, COALESCE(nombre_comercial, razon_social) AS nombre,
              razon_social, nit, telefono
       FROM clientes
       WHERE activo = TRUE
       ORDER BY nombre`,
    );
    return rows;
  },

  async gruasActivas() {
    const { rows } = await pool.query(
      `SELECT id, placa, numero_interno FROM gruas
       WHERE estado = 'activa' ORDER BY numero_interno`,
    );
    return rows;
  },

  async tiposVehiculo() {
    // "Otro" siempre al final de la lista
    const { rows } = await pool.query("SELECT id, nombre, es_otro FROM tipos_vehiculo ORDER BY es_otro, nombre");
    return rows;
  },

  async tiposServicioActivos() {
    const { rows } = await pool.query(
      `SELECT id, nombre, valor_a_convenir, es_rescate FROM tipos_servicio
       WHERE activo = TRUE ORDER BY nombre`,
    );
    return rows;
  },

  // Solo el catálogo (QUÉ se cobra), sin precios: el operador no ve valores
  async conceptosActivos() {
    const { rows } = await pool.query(
      `SELECT id, nombre, unidad_cobro, la_reporta_operador, es_recargo_nocturno FROM conceptos_tarifa
       WHERE activo = TRUE ORDER BY nombre`,
    );
    return rows;
  },

  // ---- Validaciones puntuales (usadas por los servicios de negocio) ----

  async clienteActivo(id, { client = pool } = {}) {
    const { rows } = await client.query(
      "SELECT id FROM clientes WHERE id = $1 AND activo = TRUE",
      [id],
    );
    return Boolean(rows[0]);
  },

  async tipoVehiculo(id, { client = pool } = {}) {
    const { rows } = await client.query("SELECT id, nombre, es_otro FROM tipos_vehiculo WHERE id = $1", [id]);
    return rows[0] || null;
  },

  async tipoServicio(id, { client = pool } = {}) {
    const { rows } = await client.query(
      "SELECT id, nombre, valor_a_convenir, es_rescate, usa_bolsa_km, activo FROM tipos_servicio WHERE id = $1",
      [id],
    );
    return rows[0] || null;
  },
};

module.exports = CatalogosModel;
