/**
 * Lectura y validación de las variables de entorno (archivo .env).
 *
 * Se llama UNA vez al arrancar (server.js). Si falta algo crítico, el
 * servidor NO arranca y explica qué falta: es mejor fallar al inicio que
 * descubrirlo cuando un operador intenta registrar un servicio.
 */
const fs = require("fs");
const path = require("path");

const esProduccion = () => process.env.NODE_ENV === "production";

function leerEntorno() {
  const errores = [];
  const avisos = [];

  if (!process.env.DATABASE_URL) errores.push("Falta DATABASE_URL (conexión a PostgreSQL).");

  const ttl = Number(process.env.SESSION_TTL_HORAS || 8);
  if (!Number.isFinite(ttl) || ttl <= 0 || ttl > 24 * 30) errores.push("SESSION_TTL_HORAS debe ser un número de horas entre 1 y 720.");

  const dist = process.env.FRONTEND_DIST || path.join(__dirname, "..", "..", "frontend", "dist");
  const hayFrontend = fs.existsSync(path.join(dist, "index.html"));

  if (esProduccion()) {
    if (!hayFrontend) errores.push(`No se encontró la app compilada en ${dist}. Ejecute "npm run build" en frontend.`);
    try {
      const usuario = decodeURIComponent(new URL(process.env.DATABASE_URL).username);
      if (usuario === "postgres") {
        avisos.push(
          "La API se conecta como 'postgres' (superusuario). En producción use el usuario con permisos mínimos (npm run crear-usuario-app).",
        );
      }
    } catch {
      errores.push("DATABASE_URL no tiene un formato válido (postgres://usuario:clave@servidor:5432/base).");
    }
    if (!process.env.TRUST_PROXY) {
      avisos.push(
        "TRUST_PROXY no está definido. Si la API está detrás de un proxy (IIS, Nginx, Caddy), defínalo para que el límite de intentos de login use la IP real.",
      );
    }
  }

  return {
    errores,
    avisos,
    config: {
      produccion: esProduccion(),
      puerto: Number(process.env.PORT || 4000),
      // Dirección donde escucha. Vacío = todas (red local). En la nube, "127.0.0.1":
      // solo el proxy HTTPS (Caddy) del mismo servidor puede llegar a la API.
      host: process.env.HOST || undefined,
      ttlSesionHoras: ttl,
      frontendDist: hayFrontend ? dist : null,
      // Cantidad de proxies delante de la API ("1"), o "loopback" si el proxy está en el mismo equipo
      trustProxy: process.env.TRUST_PROXY
        ? /^\d+$/.test(process.env.TRUST_PROXY)
          ? Number(process.env.TRUST_PROXY)
          : process.env.TRUST_PROXY
        : false,
      // true cuando el sitio se publica con HTTPS: el navegador fuerza HTTPS (HSTS)
      https: process.env.SITIO_HTTPS === "true",
    },
  };
}

module.exports = { leerEntorno, esProduccion };
