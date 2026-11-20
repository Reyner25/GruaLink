import api from "./client";

export async function obtenerCatalogos() {
  const { data } = await api.get("/catalogos");
  return data;
}
