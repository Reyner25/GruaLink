/**
 * Restaura un respaldo creado con "npm run respaldo" en la base de DATABASE_URL.
 *
 * Uso (desde la carpeta backend):
 *   npm run restaurar -- ..\respaldos\grualink_20261120_1700.dump
 *
 * ⚠ REEMPLAZA todo el contenido de la base de destino (borra tablas y las
 *   vuelve a crear con los datos del respaldo). Por eso pide escribir
 *   "SI" antes de continuar.
 *
 * Requisitos en el equipo de destino:
 *   - PostgreSQL de la misma versión que el origen o más nueva.
 *   - La base ya creada (vacía o no) y su conexión en backend/.env.
 *   - Después de restaurar NO hace falta "npm run migrate" ni "npm run seed":
 *     el respaldo ya trae las migraciones aplicadas y los datos.
 */
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { execFileSync } = require("child_process");
const { buscarHerramienta, conexion } = require("./herramientasPg");

const archivo = process.argv[2];
if (!archivo || !fs.existsSync(archivo)) {
  console.error("✖ Indique el archivo a restaurar. Ejemplo:");
  console.error("  npm run restaurar -- ..\\respaldos\\grualink_20261120_1700.dump");
  process.exit(1);
}

const c = conexion();
const pregunta = readline.createInterface({ input: process.stdin, output: process.stdout });
pregunta.question(
  `Esto REEMPLAZA todos los datos de la base "${c.base}" en ${c.host} con el respaldo\n` +
    `  ${path.resolve(archivo)}\nEscriba SI para continuar: `,
  (respuesta) => {
    pregunta.close();
    if (respuesta.trim() !== "SI") {
      console.log("Cancelado. No se cambió nada.");
      return;
    }
    try {
      execFileSync(
        buscarHerramienta("pg_restore"),
        [
          "-h", c.host, "-p", c.puerto, "-U", c.usuario, "-d", c.base,
          "--clean", "--if-exists", // borra lo que exista antes de recrearlo
          "--no-owner", "--no-privileges", // el dueño será el usuario de .env
          "--single-transaction", // si algo falla, no queda a medias
          archivo,
        ],
        { env: { ...process.env, PGPASSWORD: c.clave }, stdio: "inherit" },
      );
      console.log(`✔ Base "${c.base}" restaurada desde ${path.basename(archivo)}`);
      // El respaldo no guarda permisos (--no-privileges): si en este equipo la API
      // usa el usuario grualink_app, hay que volver a darle permisos.
      console.log("  Si la API usa el usuario grualink_app, ejecute ahora: npm run crear-usuario-app (Enter para no cambiar la clave)");
    } catch (error) {
      console.error("✖ La restauración falló; no se cambió nada:", error.message);
      process.exitCode = 1;
    }
  },
);
