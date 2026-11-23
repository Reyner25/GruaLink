/**
 * Crea un respaldo COMPLETO de la base de datos (estructura + datos).
 *
 * Uso (desde la carpeta backend):
 *   npm run respaldo                       respaldo + conserva los últimos 30
 *   npm run respaldo -- --conservar 60     conserva los últimos 60
 *   npm run respaldo -- --conservar 0      no borra ninguno
 *
 * Resultado: <carpeta>/grualink_AAAAMMDD_HHMM.dump
 *   carpeta = RESPALDOS_DIR del .env, o "respaldos/" en la raíz del proyecto.
 *   Recomendado en producción: otro disco o una carpeta de red.
 * Cada ejecución queda anotada en <carpeta>/respaldos.log.
 *
 * Formato "custom" de PostgreSQL (-Fc): va comprimido y se restaura con
 * pg_restore (ver restaurar.js). Para restaurarlo, el PostgreSQL de destino
 * debe ser de la MISMA versión o más nueva.
 *
 * Para programarlo todos los días en Windows: scripts/programar-respaldo.ps1
 *
 * ⚠ El archivo contiene DATOS REALES (clientes, usuarios): no subirlo a git.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { buscarHerramienta, conexion, CARPETA_RESPALDOS } = require("./herramientasPg");

const CARPETA = process.env.RESPALDOS_DIR || CARPETA_RESPALDOS;
const indice = process.argv.indexOf("--conservar");
const CONSERVAR = indice > -1 ? Number(process.argv[indice + 1]) : Number(process.env.RESPALDOS_CONSERVAR || 30);

function marcaDeTiempo() {
  const d = new Date();
  const dos = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${dos(d.getMonth() + 1)}${dos(d.getDate())}_${dos(d.getHours())}${dos(d.getMinutes())}`;
}

function anotar(linea) {
  try {
    fs.appendFileSync(path.join(CARPETA, "respaldos.log"), `${new Date().toISOString()} ${linea}\n`);
  } catch {
    /* si no se puede escribir el log, el respaldo igual cuenta */
  }
}

// Borra los respaldos más viejos y deja solo los últimos "cantidad"
function aplicarRetencion(cantidad) {
  if (!Number.isInteger(cantidad) || cantidad <= 0) return [];
  const respaldos = fs
    .readdirSync(CARPETA)
    .filter((f) => /^grualink_\d{8}_\d{4}\.dump$/.test(f))
    .sort(); // el nombre lleva la fecha: orden alfabético = orden cronológico
  const sobran = respaldos.slice(0, Math.max(0, respaldos.length - cantidad));
  sobran.forEach((f) => fs.unlinkSync(path.join(CARPETA, f)));
  return sobran;
}

try {
  if (!Number.isInteger(CONSERVAR) || CONSERVAR < 0) throw new Error("--conservar debe ser un número entero (0 = no borrar)");
  const c = conexion();
  fs.mkdirSync(CARPETA, { recursive: true });
  const archivo = path.join(CARPETA, `grualink_${marcaDeTiempo()}.dump`);

  execFileSync(
    buscarHerramienta("pg_dump"),
    ["-h", c.host, "-p", c.puerto, "-U", c.usuario, "-d", c.base, "-Fc", "--no-owner", "--no-privileges", "-f", archivo],
    { env: { ...process.env, PGPASSWORD: c.clave }, stdio: ["ignore", "inherit", "inherit"] },
  );

  const kb = Math.round(fs.statSync(archivo).size / 1024);
  const borrados = aplicarRetencion(CONSERVAR);
  anotar(`OK ${path.basename(archivo)} ${kb}KB${borrados.length ? ` (borrados ${borrados.length} antiguos)` : ""}`);
  console.log(`✔ Respaldo creado: ${archivo} (${kb} KB)`);
  if (borrados.length) console.log(`  Se borraron ${borrados.length} respaldo(s) antiguo(s); se conservan los últimos ${CONSERVAR}.`);
  console.log("  Contiene datos reales: guárdelo en un lugar seguro y no lo suba a git.");
} catch (error) {
  anotar(`ERROR ${error.message}`);
  console.error("✖ No se pudo crear el respaldo:", error.message);
  process.exitCode = 1;
}
