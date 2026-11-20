/**
 * Cliente HTTP único para toda la app.
 * - baseURL "/api": en desarrollo Vite lo redirige al backend (vite.config.js).
 * - Agrega el token de sesión a cada petición.
 * - Si el servidor responde 401 (sesión vencida), borra la sesión y va al login.
 */
import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  timeout: 20000, // en campo la señal puede ser lenta
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("grualink_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const esLogin = error.config?.url?.includes("/auth/login");
    if (error.response?.status === 401 && !esLogin) {
      localStorage.removeItem("grualink_token");
      localStorage.removeItem("grualink_usuario");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  },
);

export default api;
