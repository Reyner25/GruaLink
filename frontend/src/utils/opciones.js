// Textos de cada estado, centralizados para reutilizarlos en tablas y reportes
export const ETIQUETAS_ESTADO = {
  solicitado: "Solicitado",
  asignado: "Asignado",
  en_desplazamiento: "En desplazamiento",
  en_servicio: "En servicio",
  finalizado: "Finalizado",
  en_revision: "En revisión",
  aprobado: "Aprobado",
  anulado: "Anulado",
};

export const FECHA_HOY = () => new Date().toISOString().slice(0, 10);
