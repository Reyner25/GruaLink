/**
 * Administración de grúas.
 * - Crear / editar placa y número interno.
 * - Cambiar estado (activa / mantenimiento / inactiva) con motivo: queda en
 *   el historial que usa el reporte "Promedio de grúas".
 * - Una grúa en turno activo no se puede mandar a mantenimiento (lo impide
 *   el backend y aquí se muestra el mensaje).
 */
import { useState } from "react";
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import HistoryIcon from "@mui/icons-material/History";
import { useAuth } from "../../context/AuthContext";
import { useCargar } from "../../hooks/useCargar";
import { cambiarEstadoGrua, historialGrua } from "../../api/admin.api";
import { formatoFechaHora, mensajeError } from "../../utils/formato";
import { puede } from "../../utils/roles";
import { EncabezadoPagina } from "../../components/admin/Comunes";
import CrudCatalogo from "../../components/admin/CrudCatalogo";
import { Cargando } from "../../components/operador/Comunes";

const ESTADOS = {
  activa: { texto: "Activa", color: "success" },
  mantenimiento: { texto: "Mantenimiento", color: "warning" },
  inactiva: { texto: "Inactiva", color: "error" },
};

function DialogoEstado({ grua, onCerrar, onListo }) {
  const [estado, setEstado] = useState(grua.estado === "activa" ? "mantenimiento" : "activa");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  async function guardar() {
    setEnviando(true);
    setError("");
    try {
      await cambiarEstadoGrua(grua.id, estado, motivo.trim());
      onListo();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }
  return (
    <Dialog open onClose={() => !enviando && onCerrar()} maxWidth="xs" fullWidth>
      <DialogTitle>Cambiar estado · grúa {grua.numero_interno}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <TextField select label="Nuevo estado" value={estado} onChange={(e) => setEstado(e.target.value)}>
            {Object.entries(ESTADOS)
              .filter(([v]) => v !== grua.estado)
              .map(([v, e]) => (
                <MenuItem key={v} value={v}>
                  {e.texto}
                </MenuItem>
              ))}
          </TextField>
          <TextField label="Motivo *" value={motivo} onChange={(e) => setMotivo(e.target.value)} multiline minRows={2} helperText="Ej: cambio de aceite, choque, sale de taller (mínimo 5 caracteres)" />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCerrar} disabled={enviando}>
          Cancelar
        </Button>
        <Button variant="contained" onClick={guardar} disabled={enviando || motivo.trim().length < 5}>
          Guardar
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function DialogoHistorial({ grua, onCerrar }) {
  const { datos, cargando } = useCargar(() => historialGrua(grua.id), [grua.id]);
  return (
    <Dialog open onClose={onCerrar} maxWidth="sm" fullWidth>
      <DialogTitle>Historial de estados · grúa {grua.numero_interno}</DialogTitle>
      <DialogContent dividers>
        {cargando && <Cargando />}
        <Stack spacing={1.5}>
          {(datos || []).map((h) => (
            <Stack key={h.id} direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
              <Chip size="small" label={ESTADOS[h.estado]?.texto || h.estado} color={ESTADOS[h.estado]?.color} />
              <Typography variant="body2">
                {formatoFechaHora(h.desde)} · {h.usuario || "Sistema"}
                {h.motivo && ` · ${h.motivo}`}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCerrar}>Cerrar</Button>
      </DialogActions>
    </Dialog>
  );
}

export default function Gruas() {
  const { usuario } = useAuth();
  const gestionar = puede(usuario, "gruas:gestionar");
  const [dialogo, setDialogo] = useState(null); // { tipo: "estado" | "historial", grua, recargar }

  return (
    <>
      <EncabezadoPagina titulo="Grúas" descripcion="Flota de grúas, su estado y quién las está usando ahora." migas={[{ texto: "Grúas" }]} />
      <CrudCatalogo
        ruta="/gruas"
        clave="gruas"
        claveUno="grua"
        titulo="Grúa"
        textoNuevo="Nueva grúa"
        puedeEditar={gestionar}
        buscarEn={["numero_interno", "placa", "operador_en_turno"]}
        columnas={[
          { campo: "numero_interno", titulo: "Número" },
          { campo: "placa", titulo: "Placa" },
          {
            campo: "estado",
            titulo: "Estado",
            render: (f) => <Chip size="small" label={ESTADOS[f.estado]?.texto} color={ESTADOS[f.estado]?.color} />,
          },
          {
            campo: "operador_en_turno",
            titulo: "En turno ahora",
            render: (f) => (f.operador_en_turno ? `${f.operador_en_turno} (desde ${formatoFechaHora(f.turno_inicio)})` : "—"),
          },
        ]}
        campos={[
          { campo: "numero_interno", etiqueta: "Número interno", tipo: "texto", requerido: true, ayuda: "Ej: G1, G2, G5" },
          { campo: "placa", etiqueta: "Placa", tipo: "texto", requerido: true },
        ]}
        accionesFila={(f, recargar) => (
          <>
            <Tooltip title="Historial de estados">
              <IconButton size="small" aria-label="Historial de estados" onClick={() => setDialogo({ tipo: "historial", grua: f })}>
                <HistoryIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            {gestionar && (
              <Tooltip title="Cambiar estado">
                <IconButton size="small" aria-label="Cambiar estado" onClick={() => setDialogo({ tipo: "estado", grua: f, recargar })}>
                  <SwapHorizIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </>
        )}
      />
      {dialogo?.tipo === "estado" && (
        <DialogoEstado
          grua={dialogo.grua}
          onCerrar={() => setDialogo(null)}
          onListo={() => {
            dialogo.recargar();
            setDialogo(null);
          }}
        />
      )}
      {dialogo?.tipo === "historial" && <DialogoHistorial grua={dialogo.grua} onCerrar={() => setDialogo(null)} />}
    </>
  );
}
