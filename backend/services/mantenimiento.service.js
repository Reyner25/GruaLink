/**
 * Tareas de mantenimiento que corren solas mientras la API está encendida.
 *
 * - Cada hora borra las sesiones vencidas (sesiones_activas.expira_en ya
 *   pasó). Ya no sirven para entrar, pero ocupan espacio.
 */
const { pool } = require("../config/db");

const UNA_HORA = 60 * 60 * 1000;

async function limpiarSesionesVencidas() {
  try {
    const { rowCount } = await pool.query("DELETE FROM sesiones_activas WHERE expira_en < now()");
    if (rowCount > 0) console.log(`[mantenimiento] ${rowCount} sesión(es) vencida(s) borrada(s)`);
  } catch (error) {
    console.error("[mantenimiento] No se pudieron limpiar las sesiones:", error.message);
  }
}

function iniciarMantenimiento() {
  limpiarSesionesVencidas();
  const temporizador = setInterval(limpiarSesionesVencidas, UNA_HORA);
  temporizador.unref(); // no impide que el proceso termine
  return () => clearInterval(temporizador);
}

module.exports = { iniciarMantenimiento, limpiarSesionesVencidas };
