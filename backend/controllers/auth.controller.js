const bcrypt = require("bcrypt");
const crypto = require("crypto");
const { pool } = require("../config/db");
const UsuarioModel = require("../models/usuario.model");
const { permisosDe } = require("../middlewares/permisos");

const TTL_HORAS = Number(process.env.SESSION_TTL_HORAS || 8);

// Hash de una contraseña que no existe. Se compara contra él cuando el correo
// no existe, para que la respuesta tarde lo mismo exista o no el usuario
// (si no, un atacante podría adivinar correos midiendo el tiempo).
const HASH_FALSO = bcrypt.hashSync("no-existe-este-usuario", 10);

function usuarioPublico(usuario) {
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    email: usuario.email,
    rol: usuario.rol,
    permisos: permisosDe(usuario.rol),
  };
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    const usuario = await UsuarioModel.buscarPorEmail(email);

    const coincide = await bcrypt.compare(password, usuario?.password_hash || HASH_FALSO);
    // Respuesta genérica: no revela si falló el correo, la clave o si está inactivo
    if (!usuario || !usuario.activo || !coincide) {
      return res.status(401).json({ error: "Credenciales inválidas", codigo: "CREDENCIALES" });
    }

    const token = crypto.randomUUID();
    await pool.query(
      `INSERT INTO sesiones_activas (id, usuario_id, expira_en)
       VALUES ($1, $2, now() + make_interval(hours => $3))`,
      [token, usuario.id, TTL_HORAS],
    );
    await UsuarioModel.registrarUltimoLogin(usuario.id);

    res.json({ token, usuario: usuarioPublico(usuario) });
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    await pool.query("DELETE FROM sesiones_activas WHERE id = $1", [req.token]);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

// Devuelve el usuario de la sesión actual (lo usa el frontend al recargar)
async function yo(req, res) {
  res.json({ usuario: usuarioPublico(req.usuario) });
}

module.exports = { login, logout, yo };
