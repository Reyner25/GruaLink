/**
 * Tarifas → "Bolsa de km": la tabla de los clientes que se cobran por
 * kilometraje mensual (Suma), igual que en el Excel:
 *   columnas = km de TODOS los servicios del mes · filas = km de cada servicio.
 *
 *  - Clic en una celda (administrador) → cambiar forma y valor. Las celdas que
 *    ya cobraron servicios están bloqueadas (candado).
 *  - "Nueva vigencia": copia la tabla desde una fecha (ej. 2027) para cambiar
 *    valores sin tocar lo ya cobrado; la anterior se cierra el día antes.
 *  - Columna provisional: la que se usa mientras el mes está abierto.
 */
import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
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
import LockIcon from "@mui/icons-material/Lock";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { useCargar } from "../../hooks/useCargar";
import { actualizarCeldaBolsa, cambiarProvisionalBolsa, clientesConBolsa, nuevaVigenciaBolsa, tablaBolsaKm } from "../../api/admin.api";
import { formatoFecha, formatoMoneda, formatoNumero, hoy, mensajeError } from "../../utils/formato";
import { Cargando, ErrorCarga } from "../operador/Comunes";

const n = (v) => (v === null || v === undefined ? null : Number(v));
const textoColumna = (c) => (c.hasta === null ? `${formatoNumero(Math.floor(c.desde))} o más` : `${formatoNumero(Math.floor(c.desde))} – ${formatoNumero(c.hasta)}`);
const textoFila = (f) => (n(f.desde) === 0 ? `hasta ${formatoNumero(f.hasta)} km` : f.hasta === null ? `más de ${formatoNumero(Math.floor(f.desde))} km` : `${formatoNumero(f.desde)} – ${formatoNumero(f.hasta)} km`);
const textoCelda = (c) => (c.forma === "a_convenir" ? "A convenir" : c.forma === "por_km" ? `${formatoMoneda(c.valor)} / km` : formatoMoneda(c.valor));
const kmDeColumna = (c) => (c.hasta === null ? Math.floor(c.desde) + 1 : n(c.hasta)); // un km que cae en la columna
const textoVigencia = (v) =>
  `${formatoFecha(v.vigente_desde)} – ${v.vigente_hasta ? formatoFecha(v.vigente_hasta) : "sin fin"}${v.vigente_hoy ? " · vigente hoy" : ""}${v.usada ? " · en uso" : ""}`;

function DialogoCelda({ celda, columna, fila, onCerrar, onListo }) {
  const [forma, setForma] = useState(celda.forma);
  const [valor, setValor] = useState(celda.valor === null ? "" : String(Math.round(celda.valor)));
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const numero = Number(String(valor).replace(/\./g, "").replace(",", "."));
  const valido = forma === "a_convenir" || (valor !== "" && !Number.isNaN(numero) && numero >= 0);

  async function guardar() {
    setEnviando(true);
    setError("");
    try {
      await actualizarCeldaBolsa(celda.id, { forma, valor: forma === "a_convenir" ? null : numero, motivo: motivo.trim() || undefined });
      onListo("Celda actualizada");
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open onClose={() => !enviando && onCerrar()} maxWidth="xs" fullWidth>
      <DialogTitle>Cambiar valor</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Km del mes: <b>{textoColumna(columna)}</b> · Km del servicio: <b>{textoFila(fila)}</b>
        </Typography>
        <Stack spacing={2}>
          <TextField select label="Cómo se cobra" value={forma} onChange={(e) => setForma(e.target.value)}>
            <MenuItem value="fijo">Valor fijo por servicio</MenuItem>
            <MenuItem value="por_km">Por km (valor × km del servicio)</MenuItem>
            <MenuItem value="a_convenir">A convenir (lo define el administrador al aprobar)</MenuItem>
          </TextField>
          {forma !== "a_convenir" && (
            <TextField
              label={forma === "por_km" ? "Valor por km *" : "Valor por servicio *"}
              value={valor}
              onChange={(e) => setValor(e.target.value.replace(/[^\d.,]/g, ""))}
              error={!valido}
              helperText={valido ? formatoMoneda(numero) : "Escriba el valor en pesos"}
              slotProps={{ htmlInput: { inputMode: "numeric" }, input: { startAdornment: <InputAdornment position="start">$</InputAdornment> } }}
            />
          )}
          <TextField label="Motivo del cambio (opcional)" value={motivo} onChange={(e) => setMotivo(e.target.value)} helperText="Queda en la bitácora." />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCerrar} disabled={enviando}>
          Cancelar
        </Button>
        <Button variant="contained" onClick={guardar} disabled={enviando || !valido}>
          {enviando ? "Guardando…" : "Guardar"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function DialogoVigencia({ clienteId, vigencia, onCerrar, onListo }) {
  const [desde, setDesde] = useState("");
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  async function crear() {
    setEnviando(true);
    setError("");
    try {
      await nuevaVigenciaBolsa({ cliente_id: clienteId, copiar_de: vigencia.vigente_desde, vigente_desde: desde, motivo: motivo.trim() });
      onListo(desde);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open onClose={() => !enviando && onCerrar()} maxWidth="xs" fullWidth>
      <DialogTitle>Nueva vigencia de la tabla</DialogTitle>
      <DialogContent dividers>
        <Alert severity="info" sx={{ mb: 2 }}>
          Se copia la tabla que rige desde el {formatoFecha(vigencia.vigente_desde)} con todos sus valores. Después puede cambiar las celdas de la copia. La tabla
          actual se cierra el día anterior a la nueva fecha; lo ya cobrado no cambia.
        </Alert>
        <Stack spacing={2}>
          <TextField type="date" label="Rige desde *" value={desde} onChange={(e) => setDesde(e.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: hoy() } }} />
          <TextField label="Motivo *" value={motivo} onChange={(e) => setMotivo(e.target.value)} helperText="Ej.: tarifas Suma 2027" />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCerrar} disabled={enviando}>
          Cancelar
        </Button>
        <Button variant="contained" onClick={crear} disabled={enviando || !desde || motivo.trim().length < 5}>
          {enviando ? "Creando…" : "Crear copia"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function BolsaKmTabla({ editar }) {
  const clientes = useCargar(clientesConBolsa, []);
  const [clienteElegido, setClienteElegido] = useState("");
  const [vigenciaElegida, setVigenciaElegida] = useState("");
  const clienteId = clienteElegido || (clientes.datos?.[0] ? String(clientes.datos[0].id) : "");
  const tabla = useCargar(() => (clienteId ? tablaBolsaKm(clienteId, vigenciaElegida || undefined) : Promise.resolve(null)), [clienteId, vigenciaElegida]);
  const [editando, setEditando] = useState(null); // { celda, columna, fila }
  const [copiando, setCopiando] = useState(false);
  const [aviso, setAviso] = useState("");

  if (clientes.cargando && !clientes.datos) return <Cargando />;
  if (clientes.error) return <ErrorCarga mensaje={clientes.error} onReintentar={clientes.recargar} />;
  if (clientes.datos.length === 0) {
    return <Alert severity="info">Ningún cliente se cobra por bolsa de km. Se configura en Clientes → Modalidad de cobro.</Alert>;
  }

  const t = tabla.datos;
  const celda = (col, fila) => t.celdas.find((c) => n(c.bolsa_km_desde) === n(col.desde) && n(c.km_desde) === n(fila.desde));
  const provisional = t?.cliente.bolsa_km_provisional ?? 1800;
  const columnaProvisional = t?.columnas.find((c) => n(c.desde) <= n(provisional) && (c.hasta === null || n(c.hasta) >= n(provisional)));

  async function guardarProvisional(valorKm) {
    try {
      const r = await cambiarProvisionalBolsa(Number(clienteId), Number(valorKm));
      setAviso(`Columna provisional guardada${r.recalculados ? `; se recalcularon ${r.recalculados} servicio(s) del mes en curso` : ""}`);
      tabla.recargar();
    } catch (err) {
      setAviso(mensajeError(err));
    }
  }

  return (
    <>
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} useFlexGap sx={{ flexWrap: "wrap", alignItems: { md: "center" } }}>
            <TextField
              select
              size="small"
              label="Cliente"
              value={clienteId}
              onChange={(e) => {
                setClienteElegido(e.target.value);
                setVigenciaElegida("");
              }}
              sx={{ minWidth: 180 }}
            >
              {clientes.datos.map((c) => (
                <MenuItem key={c.id} value={String(c.id)}>
                  {c.nombre}
                </MenuItem>
              ))}
            </TextField>
            {t?.vigencia && (
              <TextField select size="small" label="Vigencia" value={t.vigencia.vigente_desde} onChange={(e) => setVigenciaElegida(e.target.value)} sx={{ minWidth: 300 }}>
                {t.versiones.map((v) => (
                  <MenuItem key={v.vigente_desde} value={v.vigente_desde}>
                    {textoVigencia(v)}
                  </MenuItem>
                ))}
              </TextField>
            )}
            {t?.columnas.length > 0 && (
              <TextField
                select
                size="small"
                label="Columna provisional (mes abierto)"
                value={columnaProvisional ? String(kmDeColumna(columnaProvisional)) : ""}
                onChange={(e) => guardarProvisional(e.target.value)}
                disabled={!editar}
                sx={{ minWidth: 260 }}
                helperText="Se usa hasta que termina el mes"
              >
                {t.columnas.map((c) => (
                  <MenuItem key={c.desde} value={String(kmDeColumna(c))}>
                    {textoColumna(c)} km
                  </MenuItem>
                ))}
              </TextField>
            )}
            {editar && t?.vigencia && (
              <Button variant="outlined" startIcon={<ContentCopyIcon />} onClick={() => setCopiando(true)} sx={{ ml: { md: "auto" } }}>
                Nueva vigencia
              </Button>
            )}
          </Stack>
        </CardContent>
      </Card>

      {tabla.cargando && !t && <Cargando />}
      {tabla.error && <ErrorCarga mensaje={tabla.error} onReintentar={tabla.recargar} />}
      {t && !t.vigencia && <Alert severity="info">Este cliente aún no tiene tabla de bolsa de km.</Alert>}
      {t?.vigencia && (
        <Card>
          <CardContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Columnas: km de todos los servicios del mes (servicio + vacío). Filas: km de cada servicio. {editar && "Clic en una celda para cambiarla. "}
              <LockIcon sx={{ fontSize: 14, verticalAlign: "middle" }} /> = ya cobró servicios: para cambiarla cree una nueva vigencia.
            </Typography>
            <TableContainer>
              <Table size="small" sx={{ "& td, & th": { whiteSpace: "nowrap" } }}>
                <TableHead>
                  <TableRow sx={{ "& th": { fontWeight: 700 } }}>
                    <TableCell>Km del servicio \ Km del mes</TableCell>
                    {t.columnas.map((c) => (
                      <TableCell key={c.desde} align="right" sx={c === columnaProvisional ? { bgcolor: "warning.light" } : undefined}>
                        {textoColumna(c)}
                        {c === columnaProvisional && (
                          <Typography variant="caption" component="div">
                            provisional
                          </Typography>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {t.filas.map((f) => (
                    <TableRow key={f.desde}>
                      <TableCell sx={{ fontWeight: 600 }}>{textoFila(f)}</TableCell>
                      {t.columnas.map((col) => {
                        const c = celda(col, f);
                        if (!c) return <TableCell key={col.desde} align="right">—</TableCell>;
                        const clicable = editar && !c.usada;
                        return (
                          <TableCell
                            key={col.desde}
                            align="right"
                            onClick={clicable ? () => setEditando({ celda: c, columna: col, fila: f }) : undefined}
                            sx={{ cursor: clicable ? "pointer" : "default", "&:hover": clicable ? { bgcolor: "action.hover" } : undefined }}
                          >
                            <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
                              {c.usada && (
                                <Tooltip title="Ya cobró servicios: no se modifica">
                                  <LockIcon sx={{ fontSize: 14, color: "text.disabled" }} />
                                </Tooltip>
                              )}
                              {textoCelda(c)}
                            </Box>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </CardContent>
        </Card>
      )}

      {editando && (
        <DialogoCelda
          {...editando}
          onCerrar={() => setEditando(null)}
          onListo={(m) => {
            setEditando(null);
            setAviso(m);
            tabla.recargar();
          }}
        />
      )}
      {copiando && t?.vigencia && (
        <DialogoVigencia
          clienteId={Number(clienteId)}
          vigencia={t.vigencia}
          onCerrar={() => setCopiando(false)}
          onListo={(desde) => {
            setCopiando(false);
            setAviso("Nueva vigencia creada: ya puede cambiar sus celdas");
            setVigenciaElegida(desde);
          }}
        />
      )}
      <Snackbar open={Boolean(aviso)} autoHideDuration={5000} onClose={() => setAviso("")} message={aviso} anchorOrigin={{ vertical: "top", horizontal: "center" }} />
    </>
  );
}
