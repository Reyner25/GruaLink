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
  ["ORGANIZACION SUMA SAS", "900364615", "SUMA"],
];

/**
 * SUMA 2026: cobro por BOLSA DE KILOMETRAJE MENSUAL (archivo "202611 Tarifa
 * de Suma"). Ver docs/PLAN-SUMA.md.
 *  - Columnas: km de todos los servicios del mes (servicio + vacío).
 *    PROVISIONAL: menos de 600 km usa la columna 600–900 y más de 2.400 la
 *    2100–2400; el límite superior de cada columna queda incluido.
 *  - Filas: km del servicio (servicio + vacío). < 10 km = km × $/km;
 *    10,01 a 95 km = valor fijo; > 95 km = a convenir.
 */
const BOLSA_SUMA = {
  nit: "900364615",
  columnas: [
    [0, 900], // 600–900 (y menos)
    [900.01, 1200],
    [1200.01, 1500],
    [1500.01, 1800],
    [1800.01, 2100],
    [2100.01, null], // 2100–2400 (y más)
  ],
  // $/km del rango < 10 km, por columna (de menor a mayor bolsa)
  porKmMenor10: [51548, 34365, 26296, 25774, 25657, 25322],
  // $/servicio de 10,01 a 95 km: una fila por rango de 5 km, por columna
  fijos: [
    [433005, 406683, 390889, 381677, 377728, 372463], // 10,01–15
    [510656, 471173, 447482, 434322, 427741, 421160], // 15,01–20
    [589624, 543560, 515921, 500128, 492231, 484334], // 20,01–25
    [672540, 617263, 584360, 565934, 556721, 547509], // 25,01–30
    [759405, 693598, 654114, 631740, 621212, 609366], // 30,01–35
    [838372, 765985, 722553, 697546, 684385, 672540], // 35,01–40
    [929184, 843636, 792308, 763353, 748876, 734399], // 40,01–45
    [994991, 902862, 847585, 815998, 800205, 784411], // 45,01–50
    [1064746, 963404, 902862, 868643, 851533, 834424], // 50,01–55
    [1138448, 1026578, 959455, 921287, 902862, 883121], // 55,01–60
    [1204255, 1085803, 1014732, 973933, 952875, 933133], // 60,01–65
    [1281906, 1150294, 1071326, 1026578, 1004204, 981829], // 65,01–70
    [1347712, 1209519, 1126604, 1079223, 1055533, 1031843], // 70,01–75
    [1417468, 1270061, 1181881, 1131868, 1106862, 1081856], // 75,01–80
    [1491170, 1333235, 1238475, 1184513, 1158190, 1130551], // 80,01–85
    [1556976, 1392461, 1293752, 1237158, 1208204, 1180565], // 85,01–90
    [1634628, 1456951, 1350345, 1289803, 1251635, 1229261], // 90,01–95
  ],
};

// Tarifas 2026. Su vigencia se extendió hasta el 28/02/2027 (25/11/2026), mientras
// se definen las tarifas 2027. El seed no cambia lo que ya existe en una base:
// solo aplica a bases nuevas (instalación y pruebas).
const VIGENCIA_2026 = { desde: "2026-01-01", hasta: "2027-02-28" };

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
      Remolque: { Biarticulado: 658000, Articulado: 378000 }, // articulado confirmado por SOTRANDES (25/11/2026)
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

      // Horario del recargo nocturno: va en el PRECIO del recargo (Tarifas → Precios de
      // conceptos). General 20:40 a 06:00; un cliente puede tener su hora (La Rolita 19:00).
      // Solo se llena si está vacío (no cambia lo que el administrador haya puesto).
      const desde = clienteId ? plan.recargoNocturnoDesde : "20:40";
      const hasta = clienteId ? null : "06:00";
      if (desde) {
        await client.query(
          `UPDATE precios_concepto
           SET recargo_desde = COALESCE(recargo_desde, $3::time), recargo_hasta = COALESCE(recargo_hasta, $4::time)
           WHERE concepto_id = $1 AND cliente_id IS NOT DISTINCT FROM $2 AND vigente_desde = $5`,
          [conceptos.recargo, clienteId, desde, hasta, VIGENCIA_2026.desde],
        );
      }
    }
  }
  console.log(`✔ Tarifas 2026: ${tarifas} tarifa(s) y ${precios} precio(s) de conceptos nuevos (lo que ya existía no se duplicó)`);
  await crearBolsaSuma(client);
  await crearReglasPago(client, conceptos);
  if (DIFERENCIAS.length) {
    console.log(`\n⚠ ${DIFERENCIAS.length} valor(es) de la base NO coinciden con el archivo (no se cambiaron; revíselos en el panel → Tarifas):`);
    DIFERENCIAS.forEach((d) => console.log(`  - ${d}`));
  }
}

/**
 * Tabla de la bolsa de km de Suma (6 columnas × 19 filas). Se carga solo si
 * Suma aún no tiene tabla para 2026 (no reemplaza una existente).
 */
async function crearBolsaSuma(client) {
  const clienteId = await idPorNombre(client, "clientes", "nit", BOLSA_SUMA.nit);
  // Columna provisional del mes abierto: 1500–1800 (se cambia en Tarifas → Bolsa de km)
  await client.query(
    "UPDATE clientes SET modalidad_cobro = 'bolsa_km_mensual', bolsa_km_provisional = COALESCE(bolsa_km_provisional, 1800) WHERE id = $1",
    [clienteId],
  );

  const { rows } = await client.query(
    "SELECT count(*)::int AS n FROM tarifas_bolsa_km WHERE cliente_id = $1 AND vigente_desde = $2",
    [clienteId, VIGENCIA_2026.desde],
  );
  if (rows[0].n > 0) {
    console.log(`✔ Bolsa de km de Suma: ya existe (${rows[0].n} celdas); no se cambió`);
    return;
  }
  let celdas = 0;
  const insertar = async ([bolsaDesde, bolsaHasta], kmDesde, kmHasta, forma, valor) => {
    await client.query(
      `INSERT INTO tarifas_bolsa_km (cliente_id, bolsa_km_desde, bolsa_km_hasta, km_desde, km_hasta, forma, valor, vigente_desde, vigente_hasta)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [clienteId, bolsaDesde, bolsaHasta, kmDesde, kmHasta, forma, valor, VIGENCIA_2026.desde, VIGENCIA_2026.hasta],
    );
    celdas++;
  };
  for (const [i, columna] of BOLSA_SUMA.columnas.entries()) {
    await insertar(columna, 0, 10, "por_km", BOLSA_SUMA.porKmMenor10[i]); // < 10 km: según distancia
    for (const [f, fila] of BOLSA_SUMA.fijos.entries()) {
      await insertar(columna, 10.01 + 5 * f, 15 + 5 * f, "fijo", fila[i]);
    }
    await insertar(columna, 95.01, null, "a_convenir", null); // > 95 km
  }
  console.log(`✔ Bolsa de km de Suma: ${celdas} celdas cargadas`);
}

/**
 * PAGO AL OPERADOR (23/11/2026). [nit (null = cualquier otra empresa),
 * componente, clave del concepto, forma, valor]. Se editan en el panel:
 * Tarifas → "Pago a operadores".
 */
const REGLAS_PAGO = [
  [null, "tarifa_basica", null, "porcentaje", 8],
  [null, "valor_a_convenir", null, "porcentaje", 8], // rescate
  [null, "concepto", "cardan", "fijo_servicio", 20000], // una vez por servicio
  [null, "concepto", "persiana", "porcentaje", 8],
  [null, "concepto", "camara", "no_paga", null],
  [null, "concepto", "recargo", "no_paga", null],
  [null, "concepto", "standby", "no_paga", null],
  [null, "concepto", "kit", "no_paga", null],
  [null, "concepto", "reiniciada", "no_paga", null],
  ["900364615", "total", null, "porcentaje", 6], // SUMA: 6 % del valor del servicio
];

async function crearReglasPago(client, conceptos) {
  let nuevas = 0;
  for (const [nit, componente, clave, forma, valor] of REGLAS_PAGO) {
    const clienteId = nit ? await idPorNombre(client, "clientes", "nit", nit) : null;
    const conceptoId = clave ? conceptos[clave] : null;
    const { rowCount } = await client.query(
      `INSERT INTO reglas_pago_operador (cliente_id, componente, concepto_id, forma, valor, vigente_desde)
       SELECT $1::int, $2::varchar, $3::int, $4::varchar, $5::numeric, $6::date
       WHERE NOT EXISTS (
         SELECT 1 FROM reglas_pago_operador
         WHERE cliente_id IS NOT DISTINCT FROM $1::int AND componente = $2::varchar AND concepto_id IS NOT DISTINCT FROM $3::int
       )`,
      [clienteId, componente, conceptoId, forma, valor, VIGENCIA_2026.desde],
    );
    nuevas += rowCount;
  }
  console.log(`✔ Reglas de pago al operador: ${nuevas} nueva(s)`);
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
