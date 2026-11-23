/**
 * Datos de prueba para DESARROLLO (no usar en producción).
 *
 * Carga:
 *   - Usuarios de prueba (operadores y financiero)
 *   - Clientes con tarifa propia
 *   - TARIFAS 2026 del archivo "Tarifas clientes 2026" (PLANES_2026): clientes
 *     generales, CAPITALBUS, E-MASIVO, SI18, Masivo Capital, Bogotá Móvil y
 *     La Rolita (por rangos de km). Suma: pendiente.
 *   - Catálogo de conceptos adicionales y sus precios por cliente
 *
 * Nunca sobrescribe un valor existente: si la base tiene un valor distinto
 * al del archivo, lo informa al final para revisarlo en el panel.
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
  ["EMASIVO 10 SAS", "901351770", "EMASIVO 10"],
  ["MASIVO CAPITAL S A S- EN REORGANIZACION", "900394791", "MASIVO CAPITAL"],
  ["SISTEMA INTEGRADO DE OPERACION DE TRANSPORTE SI18 - NORTE S.A.S", "901230629", "SI18 - NORTE"],
  ["SISTEMA INTEGRADO DE OPERACIÓN DE TRANSPORTE SI18 - CALLE 80 S.A.S", "901230687", "SI18 - CALLE 80"],
  ["SISTEMA INTEGRADO DE OPERACIÓN DE TRANSPORTE SI18 - SUBA S.A.S", "901230668", "SI18 - SUBA"],
];

const VIGENCIA_2026 = { desde: "2026-01-01", hasta: "2026-12-31" };

// Conceptos adicionales: [clave, nombre en el sistema, unidad de cobro]
// "Recargo nocturno" lo agrega el sistema solo (migración 009).
const CONCEPTOS = [
  ["cardan", "Desmontar cardán", "evento"],
  ["persiana", "Quitar persiana", "evento"],
  ["camara", "Quitar cámara de freno", "cantidad"],
  ["kit", "Uso de kit antiderrames", "evento"],
  ["recargo", "Recargo nocturno", "evento"],
  ["standby", "Hora standby / disponibilidad", "hora"],
  ["reiniciada", "Reiniciada", "evento"],
];

// Rangos de km de La Rolita 2026: [km desde, km hasta (null = sin límite), valor]
const RANGOS_LA_ROLITA = [
  [0, 14.99, 480000], // menor a 15 km
  [15, 19.99, 548000],
  [20, 24.99, 612000],
  [25, 29.99, 830000],
  [30, 34.99, 956000],
  [35, 39.99, 1020000],
  [40, 44.99, 1148000],
  [45, 49.99, 1275000],
  [50, null, 1275000], // más de 50 km
];

/**
 * TARIFAS 2026 (archivo "Tarifas clientes 2026", Bogotá).
 * Cada plan: a qué clientes aplica (NIT; null = Clientes generales), tarifas
 * básicas por tipo de servicio y vehículo, y precios de conceptos.
 *  - "Dual y/o padrón" = Padrón.
 *  - Un "-" en el archivo = no se carga (el cliente no tiene ese cobro).
 *  - SUMA: pendiente (tiene una forma de cobro propia; llega en otro archivo).
 */
const PLANES_2026 = [
  {
    nombre: "Clientes generales",
    nits: [null],
    servicios: {
      Remolque: { Biarticulado: 684000, Articulado: 393000, Busetón: 410000, Padrón: 440000 },
      "Remolque parte trasera": { Busetón: 1023000, Padrón: 1166000 },
      "Servicio fallido": { Biarticulado: 303000, Articulado: 173000, Busetón: 181000, Padrón: 195000 },
    },
    conceptos: { cardan: 92400, persiana: 25700, camara: 25700, kit: 114000, recargo: 86500, standby: 108000, reiniciada: 215000 },
  },
  {
    nombre: "CAPITALBUS",
    nits: ["901240442"],
    servicios: {
      Remolque: { Biarticulado: 658000, Articulado: 368000 },
      "Servicio fallido": { Biarticulado: 296000, Articulado: 169800 },
    },
    conceptos: { cardan: 88000, persiana: 24800, camara: 24800, kit: 110500, recargo: 82400, standby: 103100, reiniciada: 206000 },
  },
  {
    nombre: "E-MASIVO",
    nits: ["901351770"],
    servicios: {
      Remolque: { Busetón: 474000, Padrón: 507000 },
      "Remolque parte trasera": { Busetón: 1180000, Padrón: 1346000 },
      "Servicio fallido": { Busetón: 208000, Padrón: 225000 },
    },
    conceptos: { cardan: 107000, persiana: 30000, camara: 30000, kit: 132000, recargo: 100000, standby: 123000, reiniciada: 248000 },
  },
  {
    nombre: "SI18 (Norte, Calle 80 y Suba)",
    nits: ["901230629", "901230687", "901230668"],
    servicios: {
      Remolque: { Biarticulado: 640000, Articulado: 368000 },
      "Servicio fallido": { Biarticulado: 287800, Articulado: 165000 },
    },
    conceptos: { cardan: 85600, persiana: 24100, camara: 24100, kit: 108000, recargo: 80200, standby: 100000, reiniciada: 200600 },
  },
  {
    nombre: "Masivo Capital",
    nits: ["900394791"],
    servicios: {
      Remolque: { Articulado: 450000, Busetón: 410000, Padrón: 440000 },
      "Remolque parte trasera": { Busetón: 1023000, Padrón: 1166000 },
      "Servicio fallido": { Busetón: 181000, Padrón: 195000 },
    },
    conceptos: { cardan: 92400, persiana: 25700, camara: 25700, kit: 114000, recargo: 86500, standby: 108000, reiniciada: 215000 },
  },
  {
    nombre: "Bogotá Móvil",
    nits: ["901230120"],
    servicios: {
      Remolque: { Biarticulado: 684000, Articulado: 393000 },
      "Servicio fallido": { Biarticulado: 303000, Articulado: 173000 },
    },
    conceptos: { cardan: 92400, persiana: 25700, camara: 25700, kit: 114000, recargo: 86500, standby: 108000, reiniciada: 215000 },
  },
  {
    // Busetón y buseta (el padrón tiene otra tarifa, aún no definida → usa la general).
    // Sin kit antiderrames ni reiniciada: por el tipo de vehículo no aplican.
    nombre: "La Rolita",
    nits: ["901526664"],
    recargoNocturnoDesde: "19:00",
    rangosKm: { servicio: "Remolque", vehiculos: ["Busetón", "Buseta"], rangos: RANGOS_LA_ROLITA },
    servicios: {
      "Remolque parte trasera": { Busetón: 1238000 }, // "Busetón enganchado, parte trasera"
      "Servicio fallido": { Busetón: 357000, Buseta: 357000 }, // "Servicio fallido de grúa"
    },
    conceptos: { cardan: 128000, persiana: 28000, camara: 28000, recargo: 98000, standby: 153000 },
  },
];

// Diferencias encontradas entre la base y este archivo (no se sobrescriben)
const DIFERENCIAS = [];

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

/**
 * Inserta una tarifa si no existe (mismo cliente, vehículo, servicio, km
 * desde y fecha de inicio). Si existe con OTRO valor, no la toca: la anota
 * en DIFERENCIAS para que el administrador decida (puede estar usada).
 */
async function crearTarifa(client, t, etiqueta) {
  const { rows } = await client.query(
    `SELECT id, valor FROM tarifas
     WHERE cliente_id IS NOT DISTINCT FROM $1 AND tipo_vehiculo_id = $2 AND tipo_servicio_id = $3
       AND km_desde = $4 AND vigente_desde = $5`,
    [t.clienteId, t.tipoVehiculoId, t.tipoServicioId, t.kmDesde, VIGENCIA_2026.desde],
  );
  if (rows[0]) {
    if (Number(rows[0].valor) !== t.valor) DIFERENCIAS.push(`Tarifa ${etiqueta} (id ${rows[0].id}): en la base ${rows[0].valor}, en el archivo ${t.valor}`);
    return 0;
  }
  await client.query(
    `INSERT INTO tarifas (cliente_id, tipo_vehiculo_id, tipo_servicio_id,
                          km_desde, km_hasta, valor, vigente_desde, vigente_hasta)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [t.clienteId, t.tipoVehiculoId, t.tipoServicioId, t.kmDesde, t.kmHasta, t.valor, VIGENCIA_2026.desde, VIGENCIA_2026.hasta],
  );
  return 1;
}

// Igual que crearTarifa, para el precio de un concepto
async function crearPrecio(client, { conceptoId, clienteId, valor }, etiqueta) {
  const { rows } = await client.query(
    `SELECT id, valor FROM precios_concepto
     WHERE concepto_id = $1 AND cliente_id IS NOT DISTINCT FROM $2 AND vigente_desde = $3`,
    [conceptoId, clienteId, VIGENCIA_2026.desde],
  );
  if (rows[0]) {
    if (Number(rows[0].valor) !== valor) DIFERENCIAS.push(`Precio ${etiqueta} (id ${rows[0].id}): en la base ${rows[0].valor}, en el archivo ${valor}`);
    return 0;
  }
  await client.query(
    `INSERT INTO precios_concepto (concepto_id, cliente_id, valor, vigente_desde, vigente_hasta)
     VALUES ($1, $2, $3, $4, $5)`,
    [conceptoId, clienteId, valor, VIGENCIA_2026.desde, VIGENCIA_2026.hasta],
  );
  return 1;
}

async function crearConceptos(client) {
  const ids = {};
  for (const [clave, nombre, unidad] of CONCEPTOS) {
    const { rows } = await client.query(
      `INSERT INTO conceptos_tarifa (nombre, unidad_cobro)
       VALUES ($1, $2)
       ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre
       RETURNING id`,
      [nombre, unidad],
    );
    ids[clave] = rows[0].id;
  }
  // El recargo nocturno lo aplica el sistema (no el operador)
  await client.query(
    `UPDATE conceptos_tarifa SET es_recargo_nocturno = TRUE, la_reporta_operador = FALSE WHERE id = $1`,
    [ids.recargo],
  );
  await client.query("UPDATE conceptos_tarifa SET la_reporta_operador = FALSE WHERE id = $1", [ids.standby]);
  return ids;
}

async function crearTarifas(client) {
  const conceptos = await crearConceptos(client);
  const idVehiculo = {};
  const idServicio = {};
  const vehiculo = async (n) => (idVehiculo[n] ??= await idPorNombre(client, "tipos_vehiculo", "nombre", n));
  const servicio = async (n) => (idServicio[n] ??= await idPorNombre(client, "tipos_servicio", "nombre", n));

  let tarifas = 0;
  let precios = 0;
  for (const plan of PLANES_2026) {
    for (const nit of plan.nits) {
      const clienteId = nit ? await idPorNombre(client, "clientes", "nit", nit) : null;
      const quien = nit ? `${plan.nombre} ${nit}` : plan.nombre;

      for (const [nombreServicio, porVehiculo] of Object.entries(plan.servicios || {})) {
        for (const [nombreVehiculo, valor] of Object.entries(porVehiculo)) {
          tarifas += await crearTarifa(
            client,
            { clienteId, tipoVehiculoId: await vehiculo(nombreVehiculo), tipoServicioId: await servicio(nombreServicio), kmDesde: 0, kmHasta: null, valor },
            `${quien} · ${nombreServicio} · ${nombreVehiculo}`,
          );
        }
      }

      if (plan.rangosKm) {
        const { servicio: nombreServicio, vehiculos, rangos } = plan.rangosKm;
        for (const nombreVehiculo of vehiculos) {
          for (const [kmDesde, kmHasta, valor] of rangos) {
            tarifas += await crearTarifa(
              client,
              { clienteId, tipoVehiculoId: await vehiculo(nombreVehiculo), tipoServicioId: await servicio(nombreServicio), kmDesde, kmHasta, valor },
              `${quien} · ${nombreServicio} · ${nombreVehiculo} · desde ${kmDesde} km`,
            );
          }
        }
      }

      for (const [clave, valor] of Object.entries(plan.conceptos || {})) {
        precios += await crearPrecio(client, { conceptoId: conceptos[clave], clienteId, valor }, `${quien} · ${clave}`);
      }

      // Hora de corte del recargo nocturno (solo si el cliente no tiene una ya)
      if (clienteId && plan.recargoNocturnoDesde) {
        await client.query(
          "UPDATE clientes SET recargo_nocturno_desde = $2 WHERE id = $1 AND recargo_nocturno_desde IS NULL",
          [clienteId, plan.recargoNocturnoDesde],
        );
      }
    }
  }
  console.log(`✔ Tarifas 2026: ${tarifas} tarifa(s) y ${precios} precio(s) de conceptos nuevos (lo que ya existía no se duplicó)`);
  if (DIFERENCIAS.length) {
    console.log(`\n⚠ ${DIFERENCIAS.length} valor(es) de la base NO coinciden con el archivo (no se cambiaron; revíselos en el panel → Tarifas):`);
    DIFERENCIAS.forEach((d) => console.log(`  - ${d}`));
  }
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
    await crearTarifas(client); // incluye conceptos y sus precios
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
