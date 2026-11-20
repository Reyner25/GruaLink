/**
 * Crea un respaldo COMPLETO de la base de datos (estructura + datos).
 *
 * Uso (desde la carpeta backend):  npm run respaldo
 * Resultado: respaldos/grualink_AAAAMMDD_HHMM.dump  (en la raíz del proyecto)
 *
 * Formato "custom" de PostgreSQL (-Fc): va comprimido y se restaura con
 * pg_restore (ver restaurar.js). Para restaurarlo, el PostgreSQL de destino
 * debe ser de la MISMA versión o más nueva.
 *
 * ⚠ El archivo contiene DATOS REALES (clientes, usuarios): no subirlo a git.
 *   La carpeta respaldos/ está excluida en .gitignore.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { buscarHerramienta, conexion, CARPETA_RESPALDOS } = require("./herramientasPg");

function marcaDeTiempo() {
  const d = new Date();
  const dos = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${dos(d.getMonth() + 1)}${dos(d.getDate())}_${dos(d.getHours())}${dos(d.getMinutes())}`;
}

try {
  const c = conexion();
  fs.mkdirSync(CARPETA_RESPALDOS, { recursive: true });
  const archivo = path.join(CARPETA_RESPALDOS, `grualink_${marcaDeTiempo()}.dump`);

  execFileSync(
    buscarHerramienta("pg_dump"),
    ["-h", c.host, "-p", c.puerto, "-U", c.usuario, "-d", c.base, "-Fc", "--no-owner", "--no-privileges", "-f", archivo],
    { env: { ...process.env, PGPASSWORD: c.clave }, stdio: ["ignore", "inherit", "inherit"] },
  );

  const kb = Math.round(fs.statSync(archivo).size / 1024);
  console.log(`✔ Respaldo creado: ${path.relative(process.cwd(), archivo)} (${kb} KB)`);
  console.log("  Contiene datos reales: guárdelo en un lugar seguro y no lo suba a git.");
} catch (error) {
  console.error("✖ No se pudo crear el respaldo:", error.message);
  process.exitCode = 1;
}
