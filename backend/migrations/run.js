/**
 * Ejecutor de migraciones de GruaLink.
 *
 * ¿Qué es una migración?
 *   Un archivo .sql con un cambio a la base de datos (crear tabla, agregar columna...).
 *   Se numeran (000_, 001_, 002_...) y se ejecutan en orden, UNA SOLA VEZ.
 *
 * ¿Cómo sabe cuáles ya se ejecutaron?
 *   Guarda el nombre de cada archivo aplicado en la tabla "schema_migrations".
 *
 * Uso (desde la carpeta backend, en la terminal):
 *   npm run migrate          -> aplica las migraciones pendientes
 *   npm run migrate -- --ver -> solo muestra cuáles están pendientes
 */
require("dotenv").config({ quiet: true });
const fs = require("fs");
const path = require("path");
const { pool } = require("../config/db");

const CARPETA = __dirname;

async function main() {
  const soloVer = process.argv.includes("--ver");

  // 1. Crear la tabla de control si no existe
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      nombre VARCHAR(200) PRIMARY KEY,
      aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

  // 2. Leer los archivos .sql en orden alfabético (por eso el prefijo numérico)
  const archivos = fs
    .readdirSync(CARPETA)
    .filter((nombre) => nombre.endsWith(".sql"))
    .sort();

  // 3. Averiguar cuáles ya se aplicaron
  const { rows } = await pool.query("SELECT nombre FROM schema_migrations");
  const aplicadas = new Set(rows.map((fila) => fila.nombre));
  const pendientes = archivos.filter((nombre) => !aplicadas.has(nombre));

  if (pendientes.length === 0) {
    console.log("✔ La base de datos está al día. No hay migraciones pendientes.");
    return;
  }

  if (soloVer) {
    console.log("Migraciones pendientes:");
    pendientes.forEach((nombre) => console.log("  -", nombre));
    return;
  }

  // 4. Aplicar cada migración dentro de una transacción:
  //    si algo falla, se deshace TODO lo de ese archivo (no queda a medias).
  for (const nombre of pendientes) {
    const sql = fs.readFileSync(path.join(CARPETA, nombre), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (nombre) VALUES ($1)", [
        nombre,
      ]);
      await client.query("COMMIT");
      console.log("✔ Aplicada:", nombre);
    } catch (error) {
      await client.query("ROLLBACK");
      console.error(`✖ Falló ${nombre}: ${error.message}`);
      console.error("  No se aplicó ningún cambio de este archivo.");
      process.exitCode = 1;
      break; // no seguir con las siguientes: dependen de esta
    } finally {
      client.release();
    }
  }
}

main()
  .catch((error) => {
    console.error("Error inesperado:", error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
