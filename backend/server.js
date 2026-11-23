/**
 * Punto de entrada: carga el .env, valida la configuración y arranca la API.
 *
 * Uso:  npm run dev   (desarrollo: se reinicia solo al guardar cambios)
 *       npm start     (producción: NODE_ENV=production en el .env)
 *
 * En producción también entrega la app web compilada (frontend/dist).
 */
require("dotenv").config({ quiet: true });
const { leerEntorno } = require("./config/entorno");

const { errores, avisos, config } = leerEntorno();
if (errores.length) {
  console.error("✖ GruaLink no puede arrancar:");
  errores.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}
avisos.forEach((a) => console.warn(`⚠ ${a}`));

const { crearApp } = require("./app");
const { pool } = require("./config/db");
const { iniciarMantenimiento } = require("./services/mantenimiento.service");

const app = crearApp({
  // En desarrollo la app web la entrega Vite (npm run dev en frontend)
  frontendDist: config.produccion ? config.frontendDist : null,
  trustProxy: config.trustProxy,
  https: config.https,
});

const servidor = app.listen(config.puerto, config.host, () => {
  console.log(
    `GruaLink ${config.produccion ? "PRODUCCIÓN" : "desarrollo"} escuchando en puerto ${config.puerto}${config.host ? ` (${config.host})` : ""}`,
  );
  if (config.produccion) console.log(`  App web: ${config.frontendDist}`);
});
const detenerMantenimiento = iniciarMantenimiento();

// Apagado ordenado (servicio de Windows, PM2, Ctrl+C): termina las peticiones
// en curso y cierra las conexiones a la base antes de salir.
function apagar(senal) {
  console.log(`${senal} recibido: cerrando GruaLink…`);
  detenerMantenimiento();
  servidor.close(() => pool.end().finally(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGINT", () => apagar("SIGINT"));
process.on("SIGTERM", () => apagar("SIGTERM"));
