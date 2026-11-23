/**
 * Utilidades compartidas por respaldo.js y restaurar.js.
 *
 * - Lee la conexión de DATABASE_URL (archivo .env).
 * - Busca pg_dump / pg_restore: primero en PG_BIN (si se define en .env),
 *   luego en C:\Program Files\PostgreSQL\<versión>\bin, y si no, en el PATH.
 * - Pasa la contraseña por la variable PGPASSWORD (nunca se imprime ni
 *   queda en el historial de comandos).
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });
const fs = require("fs");
const path = require("path");

function buscarHerramienta(nombre) {
  const exe = process.platform === "win32" ? `${nombre}.exe` : nombre;
  if (process.env.PG_BIN) return path.join(process.env.PG_BIN, exe);

  const base = "C:\\Program Files\\PostgreSQL";
  if (process.platform === "win32" && fs.existsSync(base)) {
    // La versión más nueva instalada (18, 17, 16…)
    const versiones = fs
      .readdirSync(base)
      .filter((v) => /^\d+$/.test(v))
      .sort((a, b) => Number(b) - Number(a));
    for (const v of versiones) {
      const ruta = path.join(base, v, "bin", exe);
      if (fs.existsSync(ruta)) return ruta;
    }
  }
  return exe; // confiar en el PATH
}

// Separa la URL de conexión en las partes que piden pg_dump / pg_restore.
// Respaldar y restaurar se hacen con el usuario DUEÑO (DATABASE_URL_ADMIN)
// si existe: el usuario de la API (permisos mínimos) no puede recrear tablas.
function conexion() {
  const texto = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;
  if (!texto) throw new Error("Falta DATABASE_URL en backend/.env");
  const url = new URL(texto);
  return {
    host: url.hostname,
    puerto: url.port || "5432",
    usuario: decodeURIComponent(url.username),
    clave: decodeURIComponent(url.password),
    base: decodeURIComponent(url.pathname.slice(1)),
  };
}

const CARPETA_RESPALDOS = path.join(__dirname, "..", "..", "respaldos");

module.exports = { buscarHerramienta, conexion, CARPETA_RESPALDOS };
