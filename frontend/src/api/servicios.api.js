/**
 * Llamadas a la API de servicios (ver backend/routes/servicio.routes.js).
 */
import api from "./client";

// Devuelve { servicio }
export async function crearServicio(datos) {
  const { data } = await api.post("/servicios", datos);
  return data;
}

// Devuelve { servicio, conceptos, requiere_valor_manual }
export async function finalizarServicio(id, datos) {
  const { data } = await api.post(`/servicios/${id}/finalizar`, datos);
  return data;
}

export async function listarServicios(filtros = {}) {
  const { data } = await api.get("/servicios", { params: filtros });
  return data.servicios;
}

// Solo el servicio (compatibilidad con pantallas anteriores)
export async function obtenerServicio(id) {
  const { data } = await api.get(`/servicios/${id}`);
  return data.servicio;
}

// Servicio + conceptos aplicados
export async function obtenerServicioDetalle(id) {
  const { data } = await api.get(`/servicios/${id}`);
  return data;
}
