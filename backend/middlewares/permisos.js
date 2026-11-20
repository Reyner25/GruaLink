/**
 * Permisos por rol.
 *
 * Cada ruta pide un permiso (ej. "turnos:propios"). Este archivo es el ÚNICO
 * lugar donde se decide qué rol tiene qué permiso: si mañana el financiero
 * debe ver algo nuevo, se agrega aquí y no en cada controlador.
 *
 * "*" = todos los permisos (administrador). Los permisos que solo usa el
 * administrador (no hace falta listarlos, los cubre "*"):
 *   catalogos:gestionar, gruas:gestionar, usuarios:gestionar, tarifas:gestionar,
 *   turnos:ver_todos, turnos:cerrar_otros, servicios:cambiar_estado,
 *   servicios:aprobar, servicios:corregir, bitacora:ver
 */
const PERMISOS_POR_ROL = {
  administrador: ["*"],
  operador: [
    "catalogos:ver",
    "turnos:propios", // iniciar/finalizar su turno y ver su historial
    "servicios:crear",
    "servicios:ver_propios",
    "servicios:finalizar_propios",
  ],
  // Solo lectura de reportes, valores y configuración tarifaria
  financiero: [
    "catalogos:ver",
    "clientes:ver",
    "gruas:ver",
    "tarifas:ver",
    "servicios:ver_todos",
    "reportes:ver",
    "valores:ver",
  ],
};

function permisosDe(rol) {
  return PERMISOS_POR_ROL[rol] || [];
}

function tienePermiso(rol, permiso) {
  const permisos = permisosDe(rol);
  return permisos.includes("*") || permisos.includes(permiso);
}

/**
 * Middleware: deja pasar si el usuario tiene AL MENOS UNO de los permisos.
 *   requierePermiso("turnos:propios")
 *   requierePermiso("servicios:ver_propios", "servicios:ver_todos")
 */
function requierePermiso(...permisos) {
  return (req, res, next) => {
    if (permisos.some((p) => tienePermiso(req.usuario?.rol, p))) return next();
    return res.status(403).json({ error: "Permiso insuficiente", codigo: "SIN_PERMISO" });
  };
}

module.exports = { requierePermiso, tienePermiso, permisosDe };
