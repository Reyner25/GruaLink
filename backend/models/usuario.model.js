/**
 * Modelo de usuarios.
 * IMPORTANTE: el listado y el detalle NUNCA devuelven password_hash.
 * Solo buscarPorEmail (usado en el login) lo trae.
 */
const { pool } = require("../config/db");
const { crearModeloCrud } = require("./crud.model");

const SELECT_SIN_CLAVE = `
  SELECT u.id, u.nombre, u.email, u.activo, u.ultimo_login, u.creado_en,
         u.rol_id, r.nombre AS rol
  FROM usuarios u
  JOIN roles r ON r.id = u.rol_id`;

const crud = crearModeloCrud({
  tabla: "usuarios",
  columnas: ["rol_id", "nombre", "email", "password_hash", "activo"],
  select: SELECT_SIN_CLAVE,
  orden: "nombre",
});

const UsuarioModel = {
  ...crud,

  async buscarPorEmail(email) {
    const { rows } = await pool.query(
      `SELECT u.id, u.nombre, u.email, u.password_hash, u.activo, r.nombre AS rol
       FROM usuarios u
       JOIN roles r ON r.id = u.rol_id
       WHERE lower(u.email) = lower($1)`,
      [email],
    );
    return rows[0] || null;
  },

  async registrarUltimoLogin(id) {
    await pool.query("UPDATE usuarios SET ultimo_login = now() WHERE id = $1", [id]);
  },

  async idRol(nombre, { client = pool } = {}) {
    const { rows } = await client.query("SELECT id FROM roles WHERE nombre = $1", [nombre]);
    return rows[0]?.id || null;
  },

  // El correo se compara sin mayúsculas: "Juan@x.com" y "juan@x.com" son el mismo
  async emailEnUso(email, { excluirId = 0, client = pool } = {}) {
    const { rows } = await client.query(
      "SELECT 1 FROM usuarios WHERE lower(email) = lower($1) AND id <> $2",
      [email, excluirId],
    );
    return Boolean(rows[0]);
  },

  // Cierra todas las sesiones del usuario (al desactivarlo o cambiar su clave)
  async cerrarSesiones(id, { client = pool } = {}) {
    await client.query("DELETE FROM sesiones_activas WHERE usuario_id = $1", [id]);
  },

  async roles() {
    const { rows } = await pool.query("SELECT id, nombre FROM roles ORDER BY id");
    return rows;
  },
};

module.exports = UsuarioModel;
