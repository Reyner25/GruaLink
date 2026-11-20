/**
 * Pruebas de las REGLAS que protege la base de datos (Etapa 2).
 *
 * Cada prueba intenta hacer algo prohibido y verifica que PostgreSQL lo rechace.
 * Todo corre dentro de una transacción que al final se DESHACE (ROLLBACK),
 * así que las pruebas no dejan basura en la base de datos.
 *
 * Corre sobre la base de PRUEBAS. Requisito: haber corrido una vez
 * "npm run test:preparar".
 * Uso (desde la carpeta backend):  npm test
 */
require("./entorno");
const { test, after } = require("node:test");
const assert = require("node:assert");
const { pool } = require("../config/db");

// Códigos de error de PostgreSQL que esperamos ver
const ERROR = {
  UNICO: "23505", // se repite un valor único
  CHECK: "23514", // no cumple una regla CHECK
  EXCLUSION: "23P01", // rangos superpuestos (EXCLUDE)
};

/**
 * Ejecuta "prueba" dentro de una transacción que siempre se deshace.
 */
async function enTransaccionDeshecha(prueba) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await prueba(client);
  } finally {
    await client.query("ROLLBACK");
    client.release();
  }
}

/**
 * Verifica que una consulta FALLE con el código de error esperado.
 * Usa un SAVEPOINT porque, en PostgreSQL, después de un error la transacción
 * queda bloqueada; volver al savepoint permite seguir probando.
 */
async function esperarError(client, sql, params, codigoEsperado) {
  await client.query("SAVEPOINT antes");
  try {
    await client.query(sql, params);
    assert.fail("La consulta debía fallar, pero se ejecutó");
  } catch (error) {
    if (error.code === "ERR_ASSERTION") throw error;
    assert.strictEqual(error.code, codigoEsperado, error.message);
  } finally {
    await client.query("ROLLBACK TO SAVEPOINT antes");
  }
}

async function datosBase(client) {
  const usuarios = await client.query(
    `SELECT id FROM usuarios WHERE email IN ('operador1@grualink.test','operador2@grualink.test')
     ORDER BY email`,
  );
  const gruas = await client.query("SELECT id FROM gruas ORDER BY id LIMIT 2");
  assert.strictEqual(usuarios.rows.length, 2, "Faltan usuarios de prueba: corra npm run seed");
  return {
    operador1: usuarios.rows[0].id,
    operador2: usuarios.rows[1].id,
    grua1: gruas.rows[0].id,
    grua2: gruas.rows[1].id,
  };
}

const INSERTAR_TURNO =
  "INSERT INTO turnos_operador (operador_id, grua_id) VALUES ($1, $2) RETURNING id";

test("un operador NO puede tener dos turnos activos", () =>
  enTransaccionDeshecha(async (client) => {
    const d = await datosBase(client);
    await client.query(INSERTAR_TURNO, [d.operador1, d.grua1]);
    await esperarError(client, INSERTAR_TURNO, [d.operador1, d.grua2], ERROR.UNICO);
  }));

test("una grúa NO puede estar en dos turnos activos", () =>
  enTransaccionDeshecha(async (client) => {
    const d = await datosBase(client);
    await client.query(INSERTAR_TURNO, [d.operador1, d.grua1]);
    await esperarError(client, INSERTAR_TURNO, [d.operador2, d.grua1], ERROR.UNICO);
  }));

test("después de finalizar el turno, el operador puede abrir uno nuevo", () =>
  enTransaccionDeshecha(async (client) => {
    const d = await datosBase(client);
    const { rows } = await client.query(INSERTAR_TURNO, [d.operador1, d.grua1]);
    await client.query(
      "UPDATE turnos_operador SET estado = 'finalizado', fin = now() WHERE id = $1",
      [rows[0].id],
    );
    await client.query(INSERTAR_TURNO, [d.operador1, d.grua1]); // no debe fallar
  }));

test("un turno finalizado debe tener hora de fin", () =>
  enTransaccionDeshecha(async (client) => {
    const d = await datosBase(client);
    const { rows } = await client.query(INSERTAR_TURNO, [d.operador1, d.grua1]);
    await esperarError(
      client,
      "UPDATE turnos_operador SET estado = 'finalizado' WHERE id = $1",
      [rows[0].id],
      ERROR.CHECK,
    );
  }));

test("NO se permiten tarifas con rangos de km superpuestos", () =>
  enTransaccionDeshecha(async (client) => {
    const ids = await client.query(
      `SELECT (SELECT id FROM tipos_vehiculo WHERE nombre = 'Articulado') AS vehiculo,
              (SELECT id FROM tipos_servicio WHERE nombre = 'Remolque') AS servicio,
              (SELECT id FROM clientes ORDER BY id LIMIT 1) AS cliente`,
    );
    const { vehiculo, servicio, cliente } = ids.rows[0];
    const insertar = `INSERT INTO tarifas (cliente_id, tipo_vehiculo_id, tipo_servicio_id,
                        km_desde, km_hasta, valor, vigente_desde, vigente_hasta)
                      VALUES ($1, $2, $3, $4, $5, 100000, '2030-01-01', '2030-12-31')`;

    await client.query(insertar, [cliente, vehiculo, servicio, 0, 10]);
    // 10,01 a 15 NO se cruza con 0 a 10 → se acepta
    await client.query(insertar, [cliente, vehiculo, servicio, 10.01, 15]);
    // 12 a 20 SÍ se cruza con 10,01 a 15 → se rechaza
    await esperarError(client, insertar, [cliente, vehiculo, servicio, 12, 20], ERROR.EXCLUSION);
  }));

test("un concepto NO puede tener dos precios vigentes para el mismo cliente", () =>
  enTransaccionDeshecha(async (client) => {
    const { rows } = await client.query("SELECT id FROM conceptos_tarifa LIMIT 1");
    // El seed ya cargó un precio general 2026; otro precio general en 2026 se cruza
    await esperarError(
      client,
      `INSERT INTO precios_concepto (concepto_id, cliente_id, valor, vigente_desde)
       VALUES ($1, NULL, 1000, '2026-06-01')`,
      [rows[0].id],
      ERROR.EXCLUSION,
    );
  }));

test("la bitácora acepta operaciones nuevas y rechaza las desconocidas", () =>
  enTransaccionDeshecha(async (client) => {
    const insertar =
      "INSERT INTO bitacora (entidad, registro_id, operacion) VALUES ('turnos_operador', 1, $1)";
    await client.query(insertar, ["iniciar_turno"]);
    await esperarError(client, insertar, ["borrar"], ERROR.CHECK);
  }));

test("la numeración digital de órdenes empieza en 1 (migración 006)", async () => {
  // Lee la definición de la secuencia sin consumir números
  const { rows } = await pool.query(
    `SELECT start_value, min_value
     FROM pg_sequences WHERE sequencename = 'servicios_numero_orden_seq'`,
  );
  assert.strictEqual(Number(rows[0].start_value), 1);
  assert.strictEqual(Number(rows[0].min_value), 1);
});

after(() => pool.end());
