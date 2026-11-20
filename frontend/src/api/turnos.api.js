/**
 * Llamadas a la API de turnos (ver backend/routes/turno.routes.js).
 * El operador NUNCA envía su id ni la hora: los pone el servidor.
 */
import api from "./client";

export async function obtenerTurnoActivo() {
  const { data } = await api.get("/turnos/activo");
  return data.turno; // null si no hay turno
}

export async function gruasDisponibles() {
  const { data } = await api.get("/turnos/gruas-disponibles");
  return data.gruas;
}

export async function iniciarTurno({ grua_id, observaciones }) {
  const { data } = await api.post("/turnos/iniciar", { grua_id, observaciones });
  return data.turno;
}

export async function finalizarTurno({ observaciones, justificacion }) {
  const { data } = await api.post("/turnos/finalizar", { observaciones, justificacion });
  return data.turno;
}

export async function historialTurnos(filtros = {}) {
  const { data } = await api.get("/turnos", { params: filtros });
  return data.turnos;
}
