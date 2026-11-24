/**
 * Turnos de los operadores (solo administrador): lo REAL, tal como lo
 * registran los operadores en el celular al iniciar y finalizar turno.
 *
 *  - En turno ahora: quién está trabajando, en qué grúa, desde qué hora y
 *    cuánto lleva. Si lleva más de 12 h, probablemente olvidó cerrarlo: el
 *    administrador lo puede cerrar con un motivo (queda en la bitácora).
 *  - Resumen por operador: turnos, horas trabajadas, promedio, servicios.
 *  - Historial: cada turno con inicio, fin, duración, servicios y estado.
 *  - Exportar a Excel con los mismos filtros.
 */
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  MenuItem,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import TimerIcon from "@mui/icons-material/Timer";
import EventNoteIcon from "@mui/icons-material/EventNote";
import ScheduleIcon from "@mui/icons-material/Schedule";
import { useCargar } from "../../hooks/useCargar";
import { cerrarTurno, listarRecurso, listarTurnos, listarUsuarios, resumenTurnos, turnosEnCurso } from "../../api/admin.api";
import { formatoFechaHora, formatoNumero, hoy, mensajeError } from "../../utils/formato";
import { EncabezadoPagina, Indicador, Panel } from "../../components/admin/Comunes";
import BotonExportar from "../../components/admin/BotonExportar";
import { Cargando, ErrorCarga } from "../../components/operador/Comunes";

// Más de esto en turno: probablemente el operador olvidó cerrarlo
const HORAS_ALERTA = 12;

const ESTADOS = {
  activo: { texto: "En turno", color: "success" },
  finalizado: { texto: "Finalizado", color: "default" },
  cerrado_admin: { texto: "Cerrado por admin.", color: "warning" },
};

function horasMin(min) {
  if (min === null || min === undefined) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} h ${String(m).padStart(2, "0")} min` : `${m} min`;
}

function haceDias(n) {
  const d = new Date(`${hoy()}T12:00:00`);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Cerrar un turno olvidado: motivo obligatorio (mín. 5 caracteres). */
function DialogoCerrar({ turno, onCerrar, onListo }) {
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  async function confirmar() {
    setEnviando(true);
    setError("");
    try {
      await cerrarTurno(turno.id, motivo.trim());
      onListo(`Turno de ${turno.operador_nombre} cerrado`);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open onClose={() => !enviando && onCerrar()} maxWidth="xs" fullWidth>
      <DialogTitle>Cerrar turno de {turno.operador_nombre}</DialogTitle>
      <DialogContent dividers>
        <Alert severity="warning" sx={{ mb: 2 }}>
          Grúa {turno.grua_numero} · inició el {formatoFechaHora(turno.inicio)} · lleva {horasMin(turno.duracion_min)}. El turno se cierra con la hora de ahora y
          queda registrado en la bitácora.
        </Alert>
        <TextField
          autoFocus
          fullWidth
          multiline
          minRows={2}
          label="Motivo *"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          helperText="Ej.: el operador olvidó cerrar el turno al salir"
        />
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onCerrar} disabled={enviando}>
          Cancelar
        </Button>
        <Button variant="contained" color="warning" onClick={confirmar} disabled={enviando || motivo.trim().length < 5}>
          {enviando ? "Cerrando…" : "Cerrar turno"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function Turnos() {
  const [params, setParams] = useSearchParams();
  const filtros = {
    desde: params.get("desde") || haceDias(6),
    hasta: params.get("hasta") || hoy(),
    operador_id: params.get("operador_id") || "",
    grua_id: params.get("grua_id") || "",
    estado: params.get("estado") || "",
  };
  const clave = JSON.stringify(filtros);
  const [version, setVersion] = useState(0);
  const enCurso = useCargar(turnosEnCurso, [version]);
  const historial = useCargar(() => listarTurnos(filtros), [clave, version]);
  const resumen = useCargar(() => resumenTurnos(filtros), [clave, version]);
  const [cerrando, setCerrando] = useState(null);
  const [aviso, setAviso] = useState("");

  // Listas para los filtros
  const [listas, setListas] = useState({ operadores: [], gruas: [] });
  useEffect(() => {
    let vigente = true;
    Promise.all([listarUsuarios({ rol: "operador" }), listarRecurso("/gruas", "gruas")])
      .then(([u, g]) => vigente && setListas({ operadores: u.filter((x) => x.rol === "operador"), gruas: g }))
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, []);

  const cambiar = (campo, valor) => {
    const p = new URLSearchParams(params);
    if (valor) p.set(campo, valor);
    else p.delete(campo);
    setParams(p, { replace: true });
  };

  const operadores = resumen.datos || [];
  const totalMin = operadores.reduce((t, o) => t + o.minutos, 0);
  const totalTurnos = operadores.reduce((t, o) => t + o.turnos, 0);

  return (
    <>
      <EncabezadoPagina
        titulo="Turnos"
        descripcion="Turnos reales de los operadores: quién está en turno, horas trabajadas e historial."
        migas={[{ texto: "Turnos" }]}
        acciones={<BotonExportar reporte="turnos" filtros={filtros} />}
      />

      <Stack spacing={3}>
        {/* ---------- En turno ahora ---------- */}
        <Panel titulo={`En turno ahora (${enCurso.datos?.length ?? "…"})`}>
          {enCurso.cargando && !enCurso.datos && <Cargando />}
          {enCurso.error && <ErrorCarga mensaje={enCurso.error} onReintentar={enCurso.recargar} />}
          {enCurso.datos && enCurso.datos.length === 0 && (
            <Typography color="text.secondary">Ningún operador está en turno en este momento.</Typography>
          )}
          {enCurso.datos && enCurso.datos.length > 0 && (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ "& th": { fontWeight: 700 } }}>
                    <TableCell>Operador</TableCell>
                    <TableCell>Grúa</TableCell>
                    <TableCell>Inició</TableCell>
                    <TableCell>Lleva</TableCell>
                    <TableCell align="right">Servicios</TableCell>
                    <TableCell align="right" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {enCurso.datos.map((t) => {
                    const largo = t.duracion_min > HORAS_ALERTA * 60;
                    return (
                      <TableRow key={t.id}>
                        <TableCell sx={{ fontWeight: 600 }}>{t.operador_nombre}</TableCell>
                        <TableCell>
                          {t.grua_numero} · {t.grua_placa}
                        </TableCell>
                        <TableCell>{formatoFechaHora(t.inicio)}</TableCell>
                        <TableCell>
                          {horasMin(t.duracion_min)}
                          {largo && <Chip size="small" color="error" label="¿Olvidó cerrarlo?" sx={{ ml: 1 }} />}
                        </TableCell>
                        <TableCell align="right">{t.servicios}</TableCell>
                        <TableCell align="right">
                          <Button size="small" color="warning" onClick={() => setCerrando(t)}>
                            Cerrar turno
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Panel>

        {/* ---------- Filtros ---------- */}
        <Card>
          <CardContent>
            <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} useFlexGap sx={{ flexWrap: "wrap" }}>
              <TextField size="small" type="date" label="Desde" value={filtros.desde} onChange={(e) => cambiar("desde", e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField size="small" type="date" label="Hasta" value={filtros.hasta} onChange={(e) => cambiar("hasta", e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
              <TextField select size="small" label="Operador" value={filtros.operador_id} onChange={(e) => cambiar("operador_id", e.target.value)} sx={{ minWidth: 200 }}>
                <MenuItem value="">Todos</MenuItem>
                {listas.operadores.map((o) => (
                  <MenuItem key={o.id} value={String(o.id)}>
                    {o.nombre}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select size="small" label="Grúa" value={filtros.grua_id} onChange={(e) => cambiar("grua_id", e.target.value)} sx={{ minWidth: 140 }}>
                <MenuItem value="">Todas</MenuItem>
                {listas.gruas.map((g) => (
                  <MenuItem key={g.id} value={String(g.id)}>
                    {g.numero_interno} · {g.placa}
                  </MenuItem>
                ))}
              </TextField>
              <TextField select size="small" label="Estado" value={filtros.estado} onChange={(e) => cambiar("estado", e.target.value)} sx={{ minWidth: 170 }}>
                <MenuItem value="">Todos</MenuItem>
                {Object.entries(ESTADOS).map(([valor, e]) => (
                  <MenuItem key={valor} value={valor}>
                    {e.texto}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
          </CardContent>
        </Card>

        {/* ---------- Indicadores del periodo ---------- */}
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 4 }}>
            <Indicador titulo="Turnos en el periodo" valor={formatoNumero(totalTurnos)} icono={<EventNoteIcon />} />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Indicador titulo="Horas trabajadas" valor={horasMin(totalMin)} icono={<TimerIcon />} color="secondary.main" />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <Indicador titulo="Promedio por turno" valor={horasMin(totalTurnos ? Math.round(totalMin / totalTurnos) : null)} icono={<ScheduleIcon />} color="success.main" />
          </Grid>
        </Grid>

        {/* ---------- Resumen por operador ---------- */}
        <Panel titulo="Por operador">
          {resumen.error && <ErrorCarga mensaje={resumen.error} onReintentar={resumen.recargar} />}
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ "& th": { fontWeight: 700 } }}>
                  <TableCell>Operador</TableCell>
                  <TableCell align="right">Turnos</TableCell>
                  <TableCell align="right">Horas trabajadas</TableCell>
                  <TableCell align="right">Promedio por turno</TableCell>
                  <TableCell align="right">Turno más largo</TableCell>
                  <TableCell align="right">Servicios</TableCell>
                  <TableCell align="right">Cerrados por admin.</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {operadores.map((o) => (
                  <TableRow key={o.operador_id} hover sx={{ cursor: "pointer" }} onClick={() => cambiar("operador_id", String(o.operador_id))}>
                    <TableCell sx={{ fontWeight: 600 }}>
                      {o.operador_nombre}
                      {o.activos > 0 && <Chip size="small" color="success" label="En turno" sx={{ ml: 1 }} />}
                    </TableCell>
                    <TableCell align="right">{o.turnos}</TableCell>
                    <TableCell align="right">{horasMin(o.minutos)}</TableCell>
                    <TableCell align="right">{horasMin(o.promedio_min)}</TableCell>
                    <TableCell align="right">{horasMin(o.max_min)}</TableCell>
                    <TableCell align="right">{o.servicios}</TableCell>
                    <TableCell align="right">{o.cerrados_admin || "—"}</TableCell>
                  </TableRow>
                ))}
                {resumen.datos && operadores.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4, color: "text.secondary" }}>
                      No hay turnos en el periodo.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Panel>

        {/* ---------- Historial ---------- */}
        <Panel titulo={`Historial de turnos (${historial.datos?.length ?? "…"})`}>
          {historial.cargando && !historial.datos && <Cargando />}
          {historial.error && <ErrorCarga mensaje={historial.error} onReintentar={historial.recargar} />}
          {historial.datos && (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ "& th": { fontWeight: 700 } }}>
                    <TableCell>Operador</TableCell>
                    <TableCell>Grúa</TableCell>
                    <TableCell>Inicio</TableCell>
                    <TableCell>Fin</TableCell>
                    <TableCell align="right">Duración</TableCell>
                    <TableCell align="right">Servicios</TableCell>
                    <TableCell>Estado</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {historial.datos.map((t) => {
                    const notas = [t.observaciones_inicio && `Al iniciar: ${t.observaciones_inicio}`, t.observaciones_cierre && `Al cerrar: ${t.observaciones_cierre}`]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <TableRow key={t.id}>
                        <TableCell sx={{ fontWeight: 600 }}>{t.operador_nombre}</TableCell>
                        <TableCell>{t.grua_numero}</TableCell>
                        <TableCell>{formatoFechaHora(t.inicio)}</TableCell>
                        <TableCell>{t.fin ? formatoFechaHora(t.fin) : "—"}</TableCell>
                        <TableCell align="right">{horasMin(t.duracion_min)}</TableCell>
                        <TableCell align="right">{t.servicios}</TableCell>
                        <TableCell>
                          <Tooltip title={notas || (t.cerrado_por_nombre ? `Cerrado por ${t.cerrado_por_nombre}` : "")}>
                            <Chip size="small" label={ESTADOS[t.estado]?.texto || t.estado} color={ESTADOS[t.estado]?.color || "default"} />
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {historial.datos.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 4, color: "text.secondary" }}>
                        No hay turnos con estos filtros.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
          {historial.datos?.length === 200 && (
            <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 1 }}>
              Se muestran los 200 turnos más recientes. Reduzca las fechas o exporte a Excel para verlos todos.
            </Typography>
          )}
        </Panel>
      </Stack>

      {cerrando && (
        <DialogoCerrar
          turno={cerrando}
          onCerrar={() => setCerrando(null)}
          onListo={(mensaje) => {
            setCerrando(null);
            setAviso(mensaje);
            setVersion((v) => v + 1);
          }}
        />
      )}
      <Snackbar open={Boolean(aviso)} autoHideDuration={4000} onClose={() => setAviso("")} message={aviso} anchorOrigin={{ vertical: "top", horizontal: "center" }} />
    </>
  );
}
