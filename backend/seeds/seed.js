/**
 * Datos de prueba para DESARROLLO (no usar en producción).
 *
 * Carga:
 *   - Usuarios de prueba (operadores y financiero)
 *   - Tarifas 2026 de "Clientes generales" (hoja TB TARIFAS del Excel)
 *   - Tarifas por rangos de km de La Rolita (ejemplo de tarifa por km)
 *   - Catálogo de conceptos adicionales y sus precios (generales y CAPITALBUS)
 *
 * Se puede ejecutar varias veces: si un dato ya existe, no lo duplica.
 *
 * Uso (desde la carpeta backend):
 *   npm run seed              catálogos + usuarios de prueba (solo desarrollo)
 *   npm run datos-iniciales   solo catálogos y tarifas (permitido en producción)
 */
require("dotenv").config({ quiet: true });
const bcrypt = require("bcrypt");
const { pool, withTransaction } = require("../config/db");

// Contraseña de TODOS los usuarios de prueba. Solo para desarrollo.
const PASSWORD_PRUEBA = "Grualink2026*";

const USUARIOS_PRUEBA = [
  { nombre: "Administrador Prueba", email: "admin@grualink.test", rol: "administrador" },
  { nombre: "Operador Prueba Uno", email: "operador1@grualink.test", rol: "operador" },
  { nombre: "Operador Prueba Dos", email: "operador2@grualink.test", rol: "operador" },
  { nombre: "Financiero Prueba", email: "financiero@grualink.test", rol: "financiero" },
];

// Catálogos mínimos. En la base de desarrollo ya existen (no se duplican);
// en una base nueva (ej. la de pruebas) se crean.
const TIPOS_VEHICULO = ["Articulado", "Biarticulado", "Padrón", "Buseta", "Busetón"];

// [placa, número interno] — grúas propias que aparecen en el Excel
const GRUAS = [
  ["XVV453", "G1"],
  ["XVV429", "G2"],
  ["RKL914", "G5"],
  ["DYN707", "G7"],
  ["ESS265", "G8"],
];

// [razón social, NIT, nombre comercial] — tomados de la tabla clientes real
const CLIENTES = [
  ["OPERADORA DISTRITAL DE TRANSPORTE S.A.S.", "901526664", "La Rolita"],
  ["CAPITALBUS SAS", "901240442", "CAPITALBUS"],
  ["BOGOTA MOVIL OPERACION SUR S.A.S", "901230120", "BOGOTA MOVIL"],
];

const VIGENCIA_2026 = { desde: "2026-01-01", hasta: "2026-12-31" };

// [tipo de servicio, tipo de vehículo, valor]  — Clientes generales, Bogotá 2026
const TARIFAS_GENERALES = [
  ["Remolque", "Biarticulado", 684000],
  ["Remolque", "Articulado", 393000],
  ["Remolque", "Busetón", 410000],
  ["Remolque", "Padrón", 440000],
  ["Remolque parte trasera", "Busetón", 1023000],
  ["Remolque parte trasera", "Padrón", 1166000],
  ["Servicio fallido", "Biarticulado", 303000],
  ["Servicio fallido", "Articulado", 173000],
  ["Servicio fallido", "Busetón", 181000],
  ["Servicio fallido", "Padrón", 195000],
];

// [km desde, km hasta (null = sin límite), valor] — La Rolita 2026, busetón
const RANGOS_LA_ROLITA = [
  [0, 14.99, 480000],
  [15, 19.99, 548000],
  [20, 24.99, 612000],
  [25, 29.99, 830000],
  [30, 34.99, 956000],
  [35, 39.99, 1020000],
  [40, 44.99, 1148000],
  [45, 49.99, 1275000],
  [50, null, 1275000],
];

// [nombre, unidad de cobro, precio general, precio CAPITALBUS]
const CONCEPTOS = [
  ["Desmontar cardán", "evento", 92400, 88000],
  ["Quitar persiana", "evento", 25700, 24800],
  ["Quitar cámara de freno", "cantidad", 25700, 24800],
  ["Uso de kit antiderrames", "evento", 114000, 110500],
  ["Recargo nocturno", "evento", 86500, 82400],
  ["Hora standby / disponibilidad", "hora", 108000, 103100],
  ["Reiniciada", "evento", 215000, 206000],
];

// Busca un id por nombre; lanza error claro si no existe
async function idPorNombre(client, tabla, columna, valor) {
  const { rows } = await client.query(
    `SELECT id FROM ${tabla} WHERE ${columna} = $1`,
    [valor],
  );
  if (!rows[0]) throw new Error(`No existe "${valor}" en ${tabla}`);
  return rows[0].id;
}

async function crearUsuarios(client) {
  const hash = await bcrypt.hash(PASSWORD_PRUEBA, 10);
  for (const u of USUARIOS_PRUEBA) {
    const rolId = await idPorNombre(client, "roles", "nombre", u.rol);
    await client.query(
      `INSERT INTO usuarios (rol_id, nombre, email, password_hash)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO NOTHING`,
      [rolId, u.nombre, u.email, hash],
    );
  }
  console.log(`✔ Usuarios de prueba (${USUARIOS_PRUEBA.length})`);
}

async function crearCatalogosBase(client) {
  for (const nombre of TIPOS_VEHICULO) {
    await client.query(
      "INSERT INTO tipos_vehiculo (nombre) VALUES ($1) ON CONFLICT (nombre) DO NOTHING",
      [nombre],
    );
  }
  for (const [placa, numero] of GRUAS) {
    await client.query(
      `INSERT INTO gruas (placa, numero_interno) VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
      [placa, numero],
    );
  }
  for (const [razonSocial, nit, nombreComercial] of CLIENTES) {
    await client.query(
      `INSERT INTO clientes (razon_social, nit, nombre_comercial) VALUES ($1, $2, $3)
       ON CONFLICT (nit) DO NOTHING`,
      [razonSocial, nit, nombreComercial],
    );
  }
  console.log("✔ Catálogos base (tipos de vehículo, grúas, clientes)");
}

// Inserta una tarifa solo si no existe una igual
async function crearTarifa(client, t) {
  await client.query(
    `INSERT INTO tarifas (cliente_id, tipo_vehiculo_id, tipo_servicio_id,
                          km_desde, km_hasta, valor, vigente_desde, vigente_hasta)
     SELECT $1, $2, $3, $4, $5, $6, $7, $8
     WHERE NOT EXISTS (
       SELECT 1 FROM tarifas
       WHERE cliente_id IS NOT DISTINCT FROM $1
         AND tipo_vehiculo_id = $2 AND tipo_servicio_id = $3
         AND km_desde = $4 AND vigente_desde = $7
     )`,
    [t.clienteId, t.tipoVehiculoId, t.tipoServicioId, t.kmDesde, t.kmHasta,
     t.valor, VIGENCIA_2026.desde, VIGENCIA_2026.hasta],
  );
}

async function crearTarifas(client) {
  for (const [servicio, vehiculo, valor] of TARIFAS_GENERALES) {
    await crearTarifa(client, {
      clienteId: null, // clientes generales
      tipoVehiculoId: await idPorNombre(client, "tipos_vehiculo", "nombre", vehiculo),
      tipoServicioId: await idPorNombre(client, "tipos_servicio", "nombre", servicio),
      kmDesde: 0,
      kmHasta: null,
      valor,
    });
  }

  const laRolita = await idPorNombre(client, "clientes", "nombre_comercial", "La Rolita");
  const buseton = await idPorNombre(client, "tipos_vehiculo", "nombre", "Busetón");
  const remolque = await idPorNombre(client, "tipos_servicio", "nombre", "Remolque");
  for (const [kmDesde, kmHasta, valor] of RANGOS_LA_ROLITA) {
    await crearTarifa(client, {
      clienteId: laRolita,
      tipoVehiculoId: buseton,
      tipoServicioId: remolque,
      kmDesde,
      kmHasta,
      valor,
    });
  }
  console.log("✔ Tarifas generales 2026 y rangos de La Rolita");
}

async function crearConceptos(client) {
  const capitalbus = await idPorNombre(client, "clientes", "nombre_comercial", "CAPITALBUS");

  for (const [nombre, unidad, precioGeneral, precioCapitalbus] of CONCEPTOS) {
    const { rows } = await client.query(
      `INSERT INTO conceptos_tarifa (nombre, unidad_cobro)
       VALUES ($1, $2)
       ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre
       RETURNING id`,
      [nombre, unidad],
    );
    const conceptoId = rows[0].id;

    for (const [clienteId, valor] of [[null, precioGeneral], [capitalbus, precioCapitalbus]]) {
      await client.query(
        `INSERT INTO precios_concepto (concepto_id, cliente_id, valor, vigente_desde, vigente_hasta)
         SELECT $1, $2, $3, $4, $5
         WHERE NOT EXISTS (
           SELECT 1 FROM precios_concepto
           WHERE concepto_id = $1 AND cliente_id IS NOT DISTINCT FROM $2
             AND vigente_desde = $4
         )`,
        [conceptoId, clienteId, valor, VIGENCIA_2026.desde, VIGENCIA_2026.hasta],
      );
    }
  }
  console.log(`✔ Conceptos adicionales (${CONCEPTOS.length}) con precios generales y de CAPITALBUS`);
}

// --solo-catalogos (npm run datos-iniciales): catálogos y tarifas SIN usuarios de prueba.
const SOLO_CATALOGOS = process.argv.includes("--solo-catalogos");

async function main() {
  // En producción jamás se crean usuarios con una contraseña que está en el código
  if (process.env.NODE_ENV === "production" && !SOLO_CATALOGOS) {
    throw new Error(
      "En producción no se cargan usuarios de prueba. Use 'npm run datos-iniciales' (solo catálogos) y 'npm run crear-admin'.",
    );
  }
  await withTransaction(async (client) => {
    if (!SOLO_CATALOGOS) await crearUsuarios(client);
    await crearCatalogosBase(client);
    await crearTarifas(client);
    await crearConceptos(client);
  });
  console.log(
    SOLO_CATALOGOS
      ? "\nListo. Catálogos y tarifas iniciales cargados (sin usuarios). Revise las tarifas en el panel → Tarifas."
      : "\nListo. Contraseña de los usuarios de prueba: ver PASSWORD_PRUEBA en seeds/seed.js",
  );
}

main()
  .catch((error) => {
    console.error("✖ Error cargando datos de prueba:", error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
