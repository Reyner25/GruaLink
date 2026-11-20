const { pool } = require("../config/db");

// Formato de un UUID; si el token no lo cumple, ni siquiera se consulta la BD
const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Verifica que la petición traiga un token de sesión válido y vigente.
 * Si es válido, deja en req.usuario: { id, nombre, email, rol }.
 */
async function autenticar(req, res, next) {
  try {
    const encabezado = req.headers.authorization || "";
    const token = encabezado.startsWith("Bearer ") ? encabezado.slice(7).trim() : "";
    if (!FORMATO_UUID.test(token)) {
      return res.status(401).json({ error: "No autenticado", codigo: "NO_AUTENTICADO" });
    }

    const { rows } = await pool.query(
      `SELECT u.id, u.nombre, u.email, r.nombre AS rol
       FROM sesiones_activas s
       JOIN usuarios u ON u.id = s.usuario_id
       JOIN roles r ON r.id = u.rol_id
       WHERE s.id = $1 AND s.expira_en > now() AND u.activo`,
      [token],
    );
    if (!rows[0]) {
      return res.status(401).json({ error: "Sesión inválida o expirada", codigo: "SESION_INVALIDA" });
    }

    req.usuario = rows[0];
    req.token = token;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { autenticar };
