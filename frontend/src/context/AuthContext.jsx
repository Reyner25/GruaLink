/**
 * Sesión del usuario.
 *
 * - El token y el usuario se guardan en localStorage para no pedir login
 *   cada vez que se abre la app.
 * - Al abrir la app se VALIDA el token con /auth/yo: si expiró o el usuario
 *   fue desactivado, se cierra la sesión.
 * - A dónde va cada rol después del login: utils/roles.js (inicioPorRol).
 */
import { createContext, useContext, useEffect, useState } from "react";
import * as authApi from "../api/auth.api";

const AuthContext = createContext(null);

const CLAVE_TOKEN = "grualink_token";
const CLAVE_USUARIO = "grualink_usuario";

function leerUsuarioGuardado() {
  try {
    const guardado = localStorage.getItem(CLAVE_USUARIO);
    return guardado && localStorage.getItem(CLAVE_TOKEN) ? JSON.parse(guardado) : null;
  } catch {
    return null;
  }
}

function limpiarSesion() {
  localStorage.removeItem(CLAVE_TOKEN);
  localStorage.removeItem(CLAVE_USUARIO);
}

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(leerUsuarioGuardado);
  // true mientras se valida el token guardado (evita mostrar pantallas con una sesión vencida)
  const [validando, setValidando] = useState(Boolean(leerUsuarioGuardado()));

  useEffect(() => {
    if (!validando) return;
    authApi
      .yo()
      .then((datos) => {
        localStorage.setItem(CLAVE_USUARIO, JSON.stringify(datos));
        setUsuario(datos);
      })
      .catch((err) => {
        // Solo se cierra la sesión si el servidor dijo que no es válida.
        // Sin internet, se conserva para que el operador pueda reintentar.
        if (err.response?.status === 401) {
          limpiarSesion();
          setUsuario(null);
        }
      })
      .finally(() => setValidando(false));
  }, [validando]);

  async function iniciarSesion(email, password) {
    const { token, usuario: datos } = await authApi.login(email, password);
    localStorage.setItem(CLAVE_TOKEN, token);
    localStorage.setItem(CLAVE_USUARIO, JSON.stringify(datos));
    setUsuario(datos);
    return datos;
  }

  async function cerrarSesion() {
    try {
      await authApi.logout();
    } catch {
      // aunque falle (sin internet), se borra la sesión local
    } finally {
      limpiarSesion();
      setUsuario(null);
    }
  }

  return (
    <AuthContext.Provider value={{ usuario, validando, iniciarSesion, cerrarSesion }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext);
}
