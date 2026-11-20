/**
 * Configuración de la aplicación Express (SIN arrancar el servidor).
 *
 * Está separada de server.js para que las pruebas puedan crear la app
 * en un puerto libre sin chocar con el servidor de desarrollo.
 */
const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const routes = require("./routes");
const { errorHandler } = require("./middlewares/errorHandler");

function crearApp() {
  const app = express();

  // Encabezados HTTP de seguridad
  app.use(helmet());

  // Solo aceptamos JSON pequeño: un servicio no necesita más de 100 KB
  app.use(express.json({ limit: "100kb" }));

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
      keyGenerator: (req) =>
        `${rateLimit.ipKeyGenerator(req.ip)}|${String(req.body?.email || "").toLowerCase()}`,
      message: { error: "Demasiados intentos. Espere 15 minutos.", codigo: "DEMASIADOS_INTENTOS" },
    }),
  );

  app.use("/api", routes);

  // Ruta inexistente
  app.use("/api", (req, res) => {
    res.status(404).json({ error: "Ruta no encontrada", codigo: "NO_ENCONTRADO" });
  });

  app.use(errorHandler);
  return app;
}

module.exports = { crearApp };
