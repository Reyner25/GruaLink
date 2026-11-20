/**
 * Finalización del turno.
 *
 * - La hora de cierre la pone el servidor.
 * - Si el operador tiene servicios sin finalizar, se muestran y se exige una
 *   justificación (el backend también lo exige).
 * - Finalizar un SERVICIO no finaliza el turno: son acciones distintas.
 */
import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  List,
  ListItemButton,
  ListItemText,
  TextField,
  Typography,
} from "@mui/material";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import TimerIcon from "@mui/icons-material/Timer";
import { useTurno } from "../../context/TurnoContext";
import { useCargar } from "../../hooks/useCargar";
import { finalizarTurno } from "../../api/turnos.api";
import { listarServicios } from "../../api/servicios.api";
import { duracion, ESTADOS_ABIERTOS, formatoFechaHora, mensajeError } from "../../utils/formato";
import { BarraAcciones, BarraSuperior, Contenido, EstadoServicio, FilaDato } from "../../components/operador/Comunes";

export default function FinalizarTurno() {
  const navigate = useNavigate();
  const { turno, actualizarTurno } = useTurno();
  const { datos: servicios } = useCargar(() => listarServicios({ limite: 50 }), []);
  const [observaciones, setObservaciones] = useState("");
  const [justificacion, setJustificacion] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  if (!turno) return <Navigate to="/app" replace />;

  // Misma regla que el backend: servicios abiertos DE ESTE turno
  const abiertos = (servicios || []).filter((s) => s.turno_id === turno.id && ESTADOS_ABIERTOS.includes(s.estado));
  const requiereJustificacion = abiertos.length > 0;
  const puedeEnviar = !requiereJustificacion || justificacion.trim().length >= 5;

  async function enviar() {
    setEnviando(true);
    setError("");
    try {
      const cerrado = await finalizarTurno({
        observaciones: observaciones.trim() || undefined,
        justificacion: justificacion.trim() || undefined,
      });
      actualizarTurno(null);
      navigate("/app", { replace: true, state: { mensaje: `Turno finalizado a las ${formatoFechaHora(cerrado.fin)}` } });
    } catch (err) {
      setError(mensajeError(err));
      setConfirmar(false);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <BarraSuperior titulo="Finalizar turno" atras="/app" />
      <Contenido>
        <Card>
          <CardContent>
            <FilaDato icono={<AccessTimeIcon />} etiqueta="Inicio del turno" valor={formatoFechaHora(turno.inicio)} />
            <FilaDato icono={<TimerIcon />} etiqueta="Duración hasta ahora" valor={duracion(turno.inicio)} />
            <FilaDato icono={<LocalShippingIcon />} etiqueta="Grúa" valor={`${turno.grua_numero} · ${turno.grua_placa}`} />
          </CardContent>
        </Card>

        {requiereJustificacion && (
          <Alert severity="warning">
            <Typography sx={{ fontWeight: 700 }}>Tienes {abiertos.length} servicio(s) sin finalizar</Typography>
            Finalízalos antes de cerrar el turno, o escribe una justificación.
            <List dense disablePadding sx={{ mt: 1 }}>
              {abiertos.map((s) => (
                <ListItemButton key={s.id} onClick={() => navigate(`/app/servicios/${s.id}`)} sx={{ px: 0 }}>
                  <ListItemText primary={`#${s.numero_orden} · ${s.cliente_nombre}`} secondary={s.placa_vehiculo} />
                  <EstadoServicio estado={s.estado} />
                </ListItemButton>
              ))}
            </List>
          </Alert>
        )}

        {requiereJustificacion && (
          <TextField
            label="Justificación de servicios sin finalizar *"
            multiline
            minRows={2}
            value={justificacion}
            onChange={(e) => setJustificacion(e.target.value)}
            helperText="Mínimo 5 caracteres. Queda registrada para el administrador."
            slotProps={{ htmlInput: { maxLength: 1000 } }}
          />
        )}

        <TextField
          label="Observaciones finales (opcional)"
          multiline
          minRows={3}
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          slotProps={{ htmlInput: { maxLength: 1000 } }}
        />

        {error && <Alert severity="error">{error}</Alert>}
      </Contenido>

      <BarraAcciones>
        <Button variant="outlined" size="large" onClick={() => navigate("/app")} sx={{ flex: 1 }}>
          Cancelar
        </Button>
        <Button variant="contained" color="error" size="large" disabled={!puedeEnviar} onClick={() => setConfirmar(true)} sx={{ flex: 2 }}>
          Finalizar turno
        </Button>
      </BarraAcciones>

      <Dialog open={confirmar} onClose={() => !enviando && setConfirmar(false)}>
        <DialogTitle>¿Finalizar tu turno?</DialogTitle>
        <DialogContent>
          <Typography>
            Se registrará la hora de cierre ahora mismo. Después no podrás registrar servicios hasta iniciar un nuevo turno.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmar(false)} disabled={enviando}>
            Cancelar
          </Button>
          <Button variant="contained" color="error" onClick={enviar} disabled={enviando}>
            {enviando ? "Finalizando…" : "Sí, finalizar"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
