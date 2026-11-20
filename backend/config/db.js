/**
 * Conexión a PostgreSQL.
 *
 * - En desarrollo/producción usa DATABASE_URL (archivo .env).
 * - En pruebas (NODE_ENV=test) usa DATABASE_URL_TEST; si no existe, toma
 *   DATABASE_URL y le cambia el nombre de la base por "<nombre>_test".
 *   Así las pruebas NUNCA tocan la base de desarrollo.
 */
const { Pool, types } = require("pg");

// Las columnas DATE (ej. fecha_servicio) llegan como texto "2026-11-20".
// Sin esto, pg las convierte a objeto Date a medianoche UTC y en Colombia
// (UTC-5) se verían como el día anterior.
const OID_DATE = 1082;
types.setTypeParser(OID_DATE, (valor) => valor);

// NUMERIC (dinero, km) llega como texto para no perder precisión.
// Lo convertimos a número: nuestros valores caben sin problema en un Number.
const OID_NUMERIC = 1700;
types.setTypeParser(OID_NUMERIC, (valor) => Number(valor));

function urlDeConexion() {
  if (process.env.NODE_ENV !== "test") return process.env.DATABASE_URL;
  if (process.env.DATABASE_URL_TEST) return process.env.DATABASE_URL_TEST;
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = `${url.pathname}_test`;
  return url.toString();
}

const pool = new Pool({
  connectionString: urlDeConexion(),
  // Toda la API trabaja en hora de Colombia, sin importar dónde corra el servidor
  options: "-c timezone=America/Bogota",
});

// Ejecuta varias operaciones dentro de una misma transacción:
// si cualquiera falla, se deshacen todas.
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, withTransaction, urlDeConexion };
