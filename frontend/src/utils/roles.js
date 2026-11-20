// A dónde va cada rol después del login
export function inicioPorRol(rol) {
  return rol === "operador" ? "/app" : "/admin";
}

// ¿El usuario tiene el permiso? (la lista viene del backend en /auth/login y /auth/yo)
// Solo para mostrar u ocultar botones: el backend valida de nuevo cada acción.
export function puede(usuario, permiso) {
  const permisos = usuario?.permisos || [];
  return permisos.includes("*") || permisos.includes(permiso);
}
