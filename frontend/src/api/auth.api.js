import api from "./client";

export async function login(email, password) {
  const { data } = await api.post("/auth/login", { email, password });
  return data;
}

export async function logout() {
  await api.post("/auth/logout");
}

// Usuario de la sesión actual (para validar el token guardado al abrir la app)
export async function yo() {
  const { data } = await api.get("/auth/yo");
  return data.usuario;
}
