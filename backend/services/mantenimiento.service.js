/**
 * Tareas de mantenimiento que corren solas mientras la API está encendida.
 *
 * - Cada hora borra las sesiones vencidas (sesiones_activas.expira_en ya
 *   pasó). Ya no sirven para entrar, pero ocupan espacio.
 * - Cada hora "cierra" los meses terminados de los clientes por bolsa de km
 *   (Suma): los servicios calculados con la columna provisional 1500–1800 se
 *   recalculan con la columna real del mes.
 */
const { pool } = require("../config/db");
const BolsaKm = require("./bolsaKm.service");

const UNA_HORA = 60 * 60 * 1000;

async function cerrarMesesBolsaKm() {
  try {
    const cambiaron = await BolsaKm.cerrarMesesPendientes();
    if (cambiaron > 0) console.log(`[mantenimiento] Bolsa de km: ${cambiaron} servicio(s) recalculado(s) con la columna real del mes`);
  } catch (error) {
    console.error("[mantenimiento] No se pudo cerrar la bolsa de km:", error.message);
  }
}

function tareas() {
  limpiarSesionesVencidas();
  cerrarMesesBolsaKm();
}

async function limpiarSesionesVencidas() {
  try {
    const { rowCount } = await pool.query("DELETE FROM sesiones_activas WHERE expira_en < now()");
    if (rowCount > 0) console.log(`[mantenimiento] ${rowCount} sesión(es) vencida(s) borrada(s)`);
  } catch (error) {
    console.error("[mantenimiento] No se pudieron limpiar las sesiones:", error.message);
  }
}

function iniciarMantenimiento() {
  tareas();
  const temporizador = setInterval(tareas, UNA_HORA);
  temporizador.unref(); // no impide que el proceso termine
  return () => clearInterval(temporizador);
}

module.exports = { iniciarMantenimiento, limpiarSesionesVencidas, cerrarMesesBolsaKm };
