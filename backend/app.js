/**
 * Configuración de la aplicación Express (SIN arrancar el servidor).
 *
 * Está separada de server.js para que las pruebas puedan crear la app
 * en un puerto libre sin chocar con el servidor de desarrollo.
 *
 * En PRODUCCIÓN esta misma app entrega también la interfaz (frontend/dist):
 * un solo proceso y un solo puerto para la API y la app web.
 *
 * opciones (todas opcionales; server.js las toma de config/entorno.js):
 *   frontendDist  carpeta con la app compilada (null = no servirla)
 *   trustProxy    cuántos proxies hay delante (para conocer la IP real)
 *   https         el sitio se publica con HTTPS
 */
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const routes = require("./routes");
const { pool } = require("./config/db");
const { errorHandler } = require("./middlewares/errorHandler");
const { version } = require("./package.json");

function crearApp({ frontendDist = null, trustProxy = false, https = false } = {}) {
  const app = express();

  // Detrás de un proxy (IIS, Nginx, Caddy…) la IP del cliente llega en
  // X-Forwarded-For. Sin esto, todos los usuarios tendrían la IP del proxy y
  // el límite de intentos de login los bloquearía a todos juntos.
  app.set("trust proxy", trustProxy);
  app.disable("x-powered-by");

  // Encabezados HTTP de seguridad. "upgrade-insecure-requests" y HSTS solo
  // cuando el sitio tiene HTTPS (si no, romperían el acceso por http en la red local).
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { upgradeInsecureRequests: https ? [] : null } },
      strictTransportSecurity: https,
    }),
  );

  // Solo aceptamos JSON pequeño: un servicio no necesita más de 100 KB
  app.use(express.json({ limit: "100kb" }));

  // Estado del servicio (sin sesión): para monitoreo y para saber si la base responde
  app.get("/api/salud", async (req, res) => {
    try {
      await pool.query("SELECT 1");
      res.json({ estado: "ok", base_de_datos: "ok", version });
    } catch {
      res.status(503).json({ estado: "error", base_de_datos: "sin conexión", version });
    }
  });

  // Máximo 10 intentos de login cada 15 minutos.
  // La clave combina IP + correo: varios operadores que salen a internet por
  // la misma IP (Wi-Fi de la base, red celular) no se bloquean entre ellos.
  app.use(
    "/api/auth/login",
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 10,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      keyGenerator: (req) => `${rateLimit.ipKeyGenerator(req.ip)}|${String(req.body?.email || "").toLowerCase()}`,
      message: { error: "Demasiados intentos. Espere 15 minutos.", codigo: "DEMASIADOS_INTENTOS" },
    }),
  );

  app.use("/api", routes);

  // Ruta de API inexistente
  app.use("/api", (req, res) => {
    res.status(404).json({ error: "Ruta no encontrada", codigo: "NO_ENCONTRADO" });
  });

  // ---------- App web compilada (solo si se indicó la carpeta) ----------
  if (frontendDist) {
    // Archivos con huella en el nombre (assets/index-AbC123.js): caché de un año
    app.use("/assets", express.static(path.join(frontendDist, "assets"), { immutable: true, maxAge: "365d", index: false }));
    app.use(express.static(frontendDist, { index: false, maxAge: "1h" }));
    // Cualquier otra dirección (/app/servicios, /admin/tarifas…) la resuelve React:
    // se entrega index.html sin caché para que una actualización se vea de inmediato.
    app.use((req, res, next) => {
      if (req.method !== "GET" && req.method !== "HEAD") return next();
      res.set("Cache-Control", "no-cache");
      res.sendFile(path.join(frontendDist, "index.html"));
    });
  }

  app.use(errorHandler);
  return app;
}

module.exports = { crearApp };
