/**
 * Llamadas a la API que usa el panel ADMINISTRATIVO.
 * (El backend valida permisos en cada una: el financiero solo puede leer.)
 */
import api from "./client";

// Quita filtros vacíos para no mandar "?cliente_id=" en la URL
const limpiar = (filtros = {}) =>
  Object.fromEntries(Object.entries(filtros).filter(([, v]) => v !== "" && v !== null && v !== undefined));

// ---------- Dashboard y reportes ----------
export async function resumenDashboard(filtros) {
  const { data } = await api.get("/dashboard/resumen", { params: limpiar(filtros) });
  return data;
}

export async function dashboardAgrupado(agrupacion, filtros) {
  const { data } = await api.get(`/dashboard/por/${agrupacion}`, { params: limpiar(filtros) });
  return data.filas;
}

export async function promedioGruas(filtros) {
  const { data } = await api.get("/dashboard/promedio-gruas", { params: limpiar(filtros) });
  return data;
}

// ---------- Servicios ----------
export async function listarServiciosAdmin(filtros) {
  const { data } = await api.get("/servicios", { params: limpiar(filtros) });
  return data.servicios;
}

export async function cambiarEstadoServicio(id, estado, motivo) {
  const { data } = await api.patch(`/servicios/${id}/estado`, { estado, motivo: motivo || undefined });
  return data.servicio;
}

export async function aprobarServicio(id, { valor_aprobado, motivo }) {
  const { data } = await api.post(`/servicios/${id}/aprobar`, {
    valor_aprobado: valor_aprobado ?? undefined,
    motivo: motivo || undefined,
  });
  return data.servicio;
}

export async function corregirServicio(id, cambios) {
  const { data } = await api.post(`/servicios/${id}/corregir`, cambios);
  return data;
}

// ---------- Bitácora ----------
export async function consultarBitacora(filtros) {
  const { data } = await api.get("/bitacora", { params: limpiar(filtros) });
  return data.registros;
}

// ---------- Recursos administrables (genérico) ----------
// ruta: "/clientes", "/gruas", "/usuarios", "/tarifas", "/precios-concepto",
//       "/tipos-vehiculo", "/tipos-servicio", "/conceptos"
// clave: nombre de la lista en la respuesta ("clientes"); claveUno: en singular
export async function listarRecurso(ruta, clave, filtros) {
  const { data } = await api.get(ruta, { params: limpiar({ limite: 500, ...filtros }) });
  return data[clave];
}

export async function crearRecurso(ruta, claveUno, datos) {
  const { data } = await api.post(ruta, datos);
  return data[claveUno];
}

export async function actualizarRecurso(ruta, claveUno, id, cambios) {
  const { data } = await api.patch(`${ruta}/${id}`, cambios);
  return data[claveUno];
}

export async function eliminarRecurso(ruta, id, motivo) {
  await api.delete(`${ruta}/${id}`, { data: { motivo } });
}

export async function cambiarEstadoGrua(id, estado, motivo) {
  const { data } = await api.post(`/gruas/${id}/estado`, { estado, motivo });
  return data.grua;
}

export async function historialGrua(id) {
  const { data } = await api.get(`/gruas/${id}/historial`);
  return data.historial;
}

export async function cambiarPasswordUsuario(id, password, motivo) {
  await api.post(`/usuarios/${id}/password`, { password, motivo: motivo || undefined });
}

// ---------- Catálogos para filtros ----------
export async function listarUsuarios(filtros) {
  const { data } = await api.get("/usuarios", { params: limpiar(filtros) });
  return data.usuarios;
}

export async function listarGruasAdmin(filtros) {
  const { data } = await api.get("/gruas", { params: limpiar(filtros) });
  return data.gruas;
}
