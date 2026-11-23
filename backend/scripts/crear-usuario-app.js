/**
 * Crea (o actualiza) el usuario de PostgreSQL con PERMISOS MÍNIMOS que usa
 * la API en producción: "grualink_app".
 *
 * Por qué: la API no debe conectarse como "postgres" (superusuario). Si
 * hubiera un error en el código o alguien lograra abusar de la API, con un
 * superusuario podría borrar tablas o la base entera.
 *
 * Qué puede hacer grualink_app:
 *   ✔ leer, insertar, actualizar y borrar DATOS en las tablas de la app
 *   ✔ usar las secuencias (números de orden, ids)
 *   ✖ cambiar la estructura (crear/borrar tablas o columnas)
 *   ✖ modificar o borrar la BITÁCORA (solo puede agregar registros)
 *   ✖ tocar schema_migrations (las migraciones las corre el usuario dueño)
 *
 * Uso (desde la carpeta backend), conectado con el usuario DUEÑO de la base:
 *   npm run crear-usuario-app
 * Usa DATABASE_URL_ADMIN si existe; si no, DATABASE_URL.
 * Se puede repetir (ej. después de una migración que agrega tablas): vuelve
 * a aplicar los permisos y, si se escribe una contraseña, la cambia.
 *
 *   npm run crear-usuario-app -- --solo-permisos
 *     No pregunta nada: solo vuelve a aplicar los permisos a un usuario que
 *     ya existe (lo usan los scripts de instalación y actualización).
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });
const readline = require("readline");
const { Client } = require("pg");

const ROL = "grualink_app";
const urlDueno = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL;

function preguntarOculto(texto) {
  return new Promise((resolver) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl._writeToOutput = (s) => {
      if (s.includes(texto)) rl.output.write(s);
    };
    rl.question(texto, (r) => {
      rl.close();
      process.stdout.write("\n");
      resolver(r);
    });
  });
}

// Aplica los permisos. Recibe un cliente conectado como dueño de la base.
async function aplicarPermisos(cliente, base) {
  const ident = (s) => `"${s.replace(/"/g, '""')}"`;
  await cliente.query(`GRANT CONNECT ON DATABASE ${ident(base)} TO ${ROL}`);
  await cliente.query(`GRANT USAGE ON SCHEMA public TO ${ROL}`);
  await cliente.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ROL}`);
  await cliente.query(`GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${ROL}`);
  // Bitácora: solo agregar y consultar
  await cliente.query(`REVOKE UPDATE, DELETE, TRUNCATE ON bitacora FROM ${ROL}`);
  // Control de migraciones: solo consultar
  await cliente.query(`REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON schema_migrations FROM ${ROL}`).catch(() => {});
  // Tablas que creen migraciones futuras: mismos permisos automáticamente
  await cliente.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${ROL}`);
  await cliente.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${ROL}`);
}

async function main() {
  if (!urlDueno) throw new Error("Falta DATABASE_URL_ADMIN (o DATABASE_URL) en backend/.env");
  const base = decodeURIComponent(new URL(urlDueno).pathname.slice(1));
  const cliente = new Client({ connectionString: urlDueno });
  await cliente.connect();
  try {
    const { rows } = await cliente.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [ROL]);
    const existe = Boolean(rows[0]);

    if (process.argv.includes("--solo-permisos")) {
      if (!existe) throw new Error(`El usuario ${ROL} no existe: ejecute "npm run crear-usuario-app" sin --solo-permisos.`);
      await aplicarPermisos(cliente, base);
      console.log(`✔ Permisos de ${ROL} aplicados en la base "${base}"`);
      return;
    }

    const clave = await preguntarOculto(
      existe ? `El usuario ${ROL} ya existe. Nueva contraseña (Enter = no cambiarla): ` : `Contraseña para ${ROL} (mín. 12 caracteres): `,
    );
    if ((!existe || clave) && clave.length < 12) throw new Error("La contraseña debe tener mínimo 12 caracteres.");

    // La contraseña no se puede pasar como parámetro ($1) en CREATE/ALTER ROLE:
    // se escapa como literal de SQL (comillas simples duplicadas).
    const literal = (s) => `'${s.replace(/'/g, "''")}'`;
    if (!existe) {
      await cliente.query(`CREATE ROLE ${ROL} LOGIN PASSWORD ${literal(clave)} NOSUPERUSER NOCREATEDB NOCREATEROLE`);
      console.log(`✔ Usuario ${ROL} creado`);
    } else if (clave) {
      await cliente.query(`ALTER ROLE ${ROL} PASSWORD ${literal(clave)}`);
      console.log(`✔ Contraseña de ${ROL} actualizada`);
    }

    await aplicarPermisos(cliente, base);
    const u = new URL(urlDueno);
    console.log(`✔ Permisos aplicados en la base "${base}"`);
    console.log("\nEn backend/.env de PRODUCCIÓN deje así las conexiones:");
    console.log(`  DATABASE_URL=postgres://${ROL}:<contraseña>@${u.host}${u.pathname}`);
    console.log(`  DATABASE_URL_ADMIN=${u.protocol}//${u.username}:<contraseña del dueño>@${u.host}${u.pathname}`);
    console.log("(Si la contraseña tiene símbolos como @ : / #, escríbalos codificados: @ → %40)");
  } finally {
    await cliente.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("✖", error.message);
    process.exitCode = 1;
  });
}

module.exports = { aplicarPermisos, ROL };
