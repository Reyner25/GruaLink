// A dónde va cada rol después del login
export function inicioPorRol(rol) {
  return rol === "operador" ? "/app" : "/panel";
}
