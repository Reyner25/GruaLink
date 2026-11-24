/**
 * Historial (bitácora) de un servicio: quién hizo qué, cuándo, con qué
 * motivo, y los campos que cambiaron (antes → después).
 *   version: al cambiar, se vuelve a cargar (después de una acción)
 *   nombresConceptos: { concepto_id: "Desmontar cardán" } para mostrar nombres
 */
import { Alert, Box, Divider, Stack, Typography } from "@mui/material";
import { useCargar } from "../../../hooks/useCargar";
import { consultarBitacora } from "../../../api/admin.api";
import { formatoFechaHora, formatoMoneda, formatoNumero } from "../../../utils/formato";
import { Cargando } from "../../operador/Comunes";

const OPERACIONES = {
  crear: "Creado",
  finalizar: "Finalizado por el operador",
  actualizar: "Cambio de estado",
  autorizar_correccion: "Corrección",
  aprobar: "Aprobado",
  anular: "Anulado",
  reabrir: "Reabierto (se quitó la aprobación)",
};

// Nombres legibles para los campos que aparecen en la bitácora
const CAMPOS = {
  estado: "Estado",
  km_vacio: "Km en vacío",
  km_servicio: "Km en servicio",
  km_facturables: "Km facturables",
  valor_tarifa_basica: "Tarifa básica",
  valor_conceptos: "Conceptos",
  valor_calculado: "Valor calculado",
  valor_aprobado: "Valor aprobado",
  placa_vehiculo: "Placa",
  numero_vehiculo: "N.º vehículo",
  origen: "Origen",
  destino: "Destino",
  conceptos: "Trabajos adicionales",
};
const ES_DINERO = ["valor_tarifa_basica", "valor_conceptos", "valor_calculado", "valor_aprobado"];
const ES_NUMERO = ["km_vacio", "km_servicio", "km_facturables"];

function valorLegible(campo, v, nombres = {}) {
  if (v === null || v === undefined) return "—";
  if (ES_DINERO.includes(campo)) return formatoMoneda(v);
  if (ES_NUMERO.includes(campo)) return formatoNumero(v);
  if (campo === "conceptos") return v.map((c) => `${nombres[c.concepto_id] || `#${c.concepto_id}`} × ${formatoNumero(c.cantidad)}`).join(", ") || "ninguno";
  return String(v);
}

export default function BitacoraServicio({ servicioId, version, nombresConceptos }) {
  const { datos, cargando, error } = useCargar(() => consultarBitacora({ entidad: "servicios", registro_id: servicioId, limite: 100 }), [servicioId, version]);
  if (cargando && !datos) return <Cargando />;
  if (error) return <Alert severity="error">{error}</Alert>;
  return (
    <Stack spacing={2} divider={<Divider flexItem />}>
      {(datos || []).map((b) => {
        const cambios = b.operacion === "crear" || b.operacion === "finalizar" ? [] : Object.keys(b.valores_nuevos || {}).filter((c) => CAMPOS[c]);
        return (
          <Box key={b.id}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {OPERACIONES[b.operacion] || b.operacion}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {formatoFechaHora(b.creado_en)} · {b.usuario_nombre || "Sistema"}
              </Typography>
            </Stack>
            {b.motivo && (
              <Typography variant="body2" color="text.secondary">
                Motivo: {b.motivo}
              </Typography>
            )}
            {cambios.map((c) => (
              <Typography key={c} variant="caption" component="div">
                {CAMPOS[c]}: {valorLegible(c, b.valores_anteriores?.[c], nombresConceptos)} → <b>{valorLegible(c, b.valores_nuevos[c], nombresConceptos)}</b>
              </Typography>
            ))}
          </Box>
        );
      })}
    </Stack>
  );
}
