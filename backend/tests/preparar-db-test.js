/**
 * Prepara la base de datos de PRUEBAS (ej. "GruaLink_test").
 *
 * Por qué una base aparte:
 *   Las pruebas de la API crean turnos y servicios de verdad (y gastan
 *   números de orden). Si corrieran sobre la base de desarrollo, la primera
 *   orden real ya no sería la número 1 y quedaría basura de pruebas.
 *
 * Qué hace:
 *   1. Crea la base de pruebas si no existe.
 *   2. Le aplica todas las migraciones.
 *   3. Carga los datos de prueba (seed).
 *
 * Uso (desde la carpeta backend):  npm run test:preparar
 * Se ejecuta UNA vez, y de nuevo cada vez que se agregue una migración.
 */
require("dotenv").config({ quiet: true });
const { execFileSync } = require("child_process");
const path = require("path");
const { Client } = require("pg");

async function crearBaseSiNoExiste() {
  process.env.NODE_ENV = "test";
  const { urlDeConexion } = require("../config/db");
  const urlTest = new URL(urlDeConexion());
  const nombreBase = decodeURIComponent(urlTest.pathname.slice(1));

  // Conectarse a la base "postgres" (siempre existe) para poder crear otra
  const urlAdmin = new URL(urlTest);
  urlAdmin.pathname = "/postgres";
  const admin = new Client({ connectionString: urlAdmin.toString() });
  await admin.connect();
  try {
    const { rows } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [nombreBase]);
    if (rows.length === 0) {
      // El nombre de una base no se puede pasar como parámetro ($1):
      // se escapa con comillas dobles (formato de identificador de PostgreSQL)
      await admin.query(`CREATE DATABASE "${nombreBase.replace(/"/g, '""')}"`);
      console.log(`✔ Base de pruebas creada: ${nombreBase}`);
    } else {
      console.log(`✔ La base de pruebas ya existe: ${nombreBase}`);
    }
  } finally {
    await admin.end();
  }
}

function ejecutar(script) {
  execFileSync(process.execPath, [path.join(__dirname, "..", script)], {
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "test" },
  });
}

crearBaseSiNoExiste()
  .then(() => {
    ejecutar("migrations/run.js");
    ejecutar("seeds/seed.js");
    console.log("\nListo. Ahora puede correr:  npm test");
  })
  .catch((error) => {
    console.error("✖ No se pudo preparar la base de pruebas:", error.message);
    process.exitCode = 1;
  });
