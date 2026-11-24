/**
 * Diálogos de acciones del administrador sobre un servicio:
 *   - DialogoCorregir: km, trabajos adicionales (incluye stand-by y recargo
 *     nocturno) y datos del vehículo/ubicación. Motivo obligatorio.
 *   - DialogoAprobar: valor aprobado (por defecto el calculado).
 *   - DialogoMotivo: para anular o devolver a "finalizado".
 *
 * Todos llaman a la API y avisan al padre con onListo() para recargar.
 * Los valores en $ NUNCA se envían: el backend los recalcula.
 */
import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Grid,
  InputAdornment,
  MenuItem,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { aprobarServicio, corregirServicio, cambiarEstadoServicio } from "../../api/admin.api";
import { formatoMoneda, mensajeError, UNIDADES_COBRO } from "../../utils/formato";

const aNumero = (v) => Number(String(v).replace(",", "."));
const numeroValido = (v, { min = 0, max = 9999 } = {}) => v !== "" && !Number.isNaN(aNumero(v)) && aNumero(v) >= min && aNumero(v) <= max;

// ---------- Corregir ----------
// Fecha/hora ISO → "AAAA-MM-DDTHH:MM" en hora de Colombia (para <input type="datetime-local">)
const aLocal = (iso) =>
  iso ? new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Bogota", dateStyle: "short", timeStyle: "short" }).format(new Date(iso)).replace(" ", "T") : "";
// …y de vuelta: Colombia es UTC−5 todo el año (sin horario de verano)
const deLocal = (texto) => (texto ? new Date(`${texto}:00-05:00`).toISOString() : null);
const HORAS = [
  ["hora_solicitud", "Hora de solicitud"],
  ["inicio_servicio", "Inicio del servicio"],
  ["fin_servicio", "Fin del servicio"],
];
const TEXTOS = ["placa_vehiculo", "numero_vehiculo", "origen", "destino", "tipo_vehiculo_otro", "recibe_nombre", "recibe_documento", "observaciones", "observaciones_entrega"];
const IDS = ["cliente_id", "tipo_servicio_id", "tipo_vehiculo_id", "grua_id"];

// Opciones de un select: las activas + la actual del servicio (aunque esté inactiva)
function opcionesCon(lista, actualId, texto) {
  const opciones = lista.map((x) => ({ valor: String(x.id), texto: texto(x) }));
  if (actualId && !opciones.some((o) => o.valor === String(actualId))) opciones.push({ valor: String(actualId), texto: `(actual) #${actualId}` });
  return opciones;
}

function Seccion({ titulo, children }) {
  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
        {titulo}
      </Typography>
      {children}
    </Box>
  );
}

/**
 * Corrección autorizada del ADMINISTRADOR: puede cambiar todos los datos del
 * servicio (cliente, tipo de servicio y vehículo, grúa, fecha y horas, km,
 * vehículo, ubicación, entrega, observaciones, trabajos adicionales), poner
 * una tarifa básica manual y decidir si se cobra el recargo nocturno. Solo se
 * envía lo que cambió; el servidor recalcula los valores y deja todo en la
 * bitácora con el motivo.
 */
export function DialogoCorregir({ abierto, onCerrar, onListo, servicio, conceptosActuales: todosActuales, catalogos }) {
  const cerrado = ["finalizado", "en_revision"].includes(servicio.estado);
  const { clientes = [], tipos = [], tipos_servicio: tiposServicio = [], gruas = [], conceptos: todoElCatalogo = [] } = catalogos || {};
  // El recargo nocturno se maneja con su propio control (automático / sí / no)
  const conceptosActuales = todosActuales.filter((c) => !c.es_recargo_nocturno);
  const catalogoConceptos = todoElCatalogo.filter((c) => !c.es_recargo_nocturno);
  // Clientes por bolsa de km (Suma): el administrador indica si va fuera de la disponibilidad
  const porBolsa = servicio.cliente_modalidad_cobro === "bolsa_km_mensual";

  const inicial = () => ({
    ...Object.fromEntries(TEXTOS.map((c) => [c, servicio[c] || ""])),
    ...Object.fromEntries(IDS.map((c) => [c, servicio[c] ? String(servicio[c]) : ""])),
    ...Object.fromEntries(HORAS.map(([c]) => [c, aLocal(servicio[c])])),
    fecha_servicio: String(servicio.fecha_servicio || "").slice(0, 10),
    km_vacio: String(servicio.km_vacio ?? 0).replace(".", ","),
    km_servicio: String(servicio.km_servicio ?? 0).replace(".", ","),
    entregado_sin_novedad: Boolean(servicio.entregado_sin_novedad),
    conceptos: Object.fromEntries(conceptosActuales.map((c) => [c.concepto_id, String(c.cantidad).replace(".", ",")])),
    fuera_disponibilidad: Boolean(servicio.fuera_disponibilidad),
    tarifa_manual_activa: servicio.tarifa_basica_manual !== null && servicio.tarifa_basica_manual !== undefined,
    tarifa_manual: servicio.tarifa_basica_manual === null || servicio.tarifa_basica_manual === undefined ? "" : String(servicio.tarifa_basica_manual),
    recargo_nocturno: servicio.recargo_nocturno || "auto",
    motivo: "",
  });
  const [form, setForm] = useState(inicial);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  const cambiar = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));
  const cambiarConcepto = (id, valor) =>
    setForm((f) => {
      const conceptos = { ...f.conceptos };
      if (valor === null) delete conceptos[id];
      else conceptos[id] = valor;
      return { ...f, conceptos };
    });

  const tipoVehiculo = tipos.find((t) => String(t.id) === form.tipo_vehiculo_id);
  const tarifaManual = Number(String(form.tarifa_manual).replace(/\./g, "").replace(",", "."));
  const tarifaManualValida = !form.tarifa_manual_activa || (form.tarifa_manual !== "" && !Number.isNaN(tarifaManual) && tarifaManual >= 0);

  // Solo se envían los campos que cambiaron
  function armarCambios() {
    const cambios = {};
    for (const campo of TEXTOS) {
      if (campo === "tipo_vehiculo_otro" && !tipoVehiculo?.es_otro) continue;
      if (form[campo].trim() !== (servicio[campo] || "")) cambios[campo] = form[campo].trim() || null;
    }
    for (const campo of IDS) {
      if (form[campo] && form[campo] !== String(servicio[campo] ?? "")) cambios[campo] = Number(form[campo]);
    }
    for (const [campo] of HORAS) {
      if (form[campo] !== aLocal(servicio[campo])) cambios[campo] = deLocal(form[campo]);
    }
    if (form.fecha_servicio && form.fecha_servicio !== String(servicio.fecha_servicio).slice(0, 10)) cambios.fecha_servicio = form.fecha_servicio;
    if (aNumero(form.km_vacio) !== Number(servicio.km_vacio)) cambios.km_vacio = aNumero(form.km_vacio);
    if (aNumero(form.km_servicio) !== Number(servicio.km_servicio)) cambios.km_servicio = aNumero(form.km_servicio);
    if (form.entregado_sin_novedad !== Boolean(servicio.entregado_sin_novedad)) cambios.entregado_sin_novedad = form.entregado_sin_novedad;
    if (porBolsa && form.fuera_disponibilidad !== Boolean(servicio.fuera_disponibilidad)) cambios.fuera_disponibilidad = form.fuera_disponibilidad;
    if (cerrado) {
      const manual = form.tarifa_manual_activa ? tarifaManual : null;
      const antes = servicio.tarifa_basica_manual === undefined ? null : servicio.tarifa_basica_manual;
      if (manual !== (antes === null ? null : Number(antes))) cambios.tarifa_basica_manual = manual;
      if (form.recargo_nocturno !== (servicio.recargo_nocturno || "auto")) cambios.recargo_nocturno = form.recargo_nocturno;
      const nuevos = Object.entries(form.conceptos).map(([id, cant]) => ({ concepto_id: Number(id), cantidad: aNumero(cant) }));
      const antesConceptos = conceptosActuales.map((c) => `${c.concepto_id}:${Number(c.cantidad)}`).sort().join();
      const despues = nuevos.map((c) => `${c.concepto_id}:${c.cantidad}`).sort().join();
      if (antesConceptos !== despues) cambios.conceptos = nuevos;
    }
    return cambios;
  }

  const kmValidos = numeroValido(form.km_vacio) && numeroValido(form.km_servicio);
  const conceptosValidos = Object.values(form.conceptos).every((c) => numeroValido(c, { min: 0.01, max: 999 }));
  const cambios = kmValidos && conceptosValidos && tarifaManualValida ? armarCambios() : {};
  const hayCambios = Object.keys(cambios).length > 0;
  const motivoValido = form.motivo.trim().length >= 5;

  async function guardar() {
    setEnviando(true);
    setError("");
    try {
      await corregirServicio(servicio.id, { ...cambios, motivo: form.motivo.trim() });
      onListo("Corrección guardada. Los valores se recalcularon.");
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  const select = (campo, etiqueta, opciones) => (
    <TextField select fullWidth label={etiqueta} value={form[campo]} onChange={(e) => cambiar(campo, e.target.value)}>
      {opciones.map((o) => (
        <MenuItem key={o.valor} value={o.valor}>
          {o.texto}
        </MenuItem>
      ))}
    </TextField>
  );

  return (
    <Dialog open={abierto} onClose={() => !enviando && onCerrar()} maxWidth="md" fullWidth>
      <DialogTitle>Corregir orden #{servicio.numero_orden}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={3}>
          <Seccion titulo="Servicio">
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>{select("cliente_id", "Cliente (empresa)", opcionesCon(clientes, servicio.cliente_id, (c) => c.nombre))}</Grid>
              <Grid size={{ xs: 12, sm: 6 }}>{select("tipo_servicio_id", "Tipo de servicio", opcionesCon(tiposServicio, servicio.tipo_servicio_id, (t) => t.nombre))}</Grid>
              <Grid size={{ xs: 12, sm: 6 }}>{select("tipo_vehiculo_id", "Tipo de vehículo", opcionesCon(tipos, servicio.tipo_vehiculo_id, (t) => t.nombre))}</Grid>
              {tipoVehiculo?.es_otro && (
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField fullWidth label="¿Qué vehículo es? *" value={form.tipo_vehiculo_otro} onChange={(e) => cambiar("tipo_vehiculo_otro", e.target.value)} />
                </Grid>
              )}
              <Grid size={{ xs: 12, sm: 6 }}>{select("grua_id", "Grúa", opcionesCon(gruas, servicio.grua_id, (g) => `${g.numero_interno} · ${g.placa}`))}</Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField fullWidth type="date" label="Fecha del servicio" value={form.fecha_servicio} onChange={(e) => cambiar("fecha_servicio", e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
              </Grid>
            </Grid>
            {form.cliente_id !== String(servicio.cliente_id) && (
              <Alert severity="info" sx={{ mt: 1.5 }}>
                Al cambiar el cliente, la tarifa y los precios se recalculan con los del nuevo cliente.
              </Alert>
            )}
          </Seccion>

          <Seccion titulo="Horas (Colombia)">
            <Grid container spacing={2}>
              {HORAS.map(([campo, etiqueta]) => (
                <Grid key={campo} size={{ xs: 12, sm: 4 }}>
                  <TextField fullWidth type="datetime-local" label={etiqueta} value={form[campo]} onChange={(e) => cambiar(campo, e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
                </Grid>
              ))}
            </Grid>
          </Seccion>

          <Seccion titulo="Vehículo y ubicación">
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  label="Placa"
                  value={form.placa_vehiculo}
                  onChange={(e) => cambiar("placa_vehiculo", e.target.value.toUpperCase().replace(/[\s-]/g, ""))}
                  slotProps={{ htmlInput: { maxLength: 10 } }}
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField fullWidth label="Número del vehículo" value={form.numero_vehiculo} onChange={(e) => cambiar("numero_vehiculo", e.target.value)} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField fullWidth label="Origen" value={form.origen} onChange={(e) => cambiar("origen", e.target.value)} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField fullWidth label="Destino" value={form.destino} onChange={(e) => cambiar("destino", e.target.value)} />
              </Grid>
            </Grid>
          </Seccion>

          <Seccion titulo="Kilómetros">
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              {[
                ["km_vacio", "En vacío"],
                ["km_servicio", "En servicio"],
              ].map(([campo, etiqueta]) => (
                <TextField
                  key={campo}
                  label={etiqueta}
                  value={form[campo]}
                  onChange={(e) => cambiar(campo, e.target.value.replace(/[^\d.,]/g, ""))}
                  error={!numeroValido(form[campo])}
                  helperText={!numeroValido(form[campo]) ? "Número entre 0 y 9.999" : " "}
                  slotProps={{ htmlInput: { inputMode: "decimal" }, input: { endAdornment: <InputAdornment position="end">km</InputAdornment> } }}
                />
              ))}
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Los km en servicio determinan el rango de tarifa en clientes que cobran por distancia (ej. La Rolita).
              {porBolsa && " En este cliente (bolsa de km) cuentan servicio + vacío, y suman a la bolsa del mes."}
            </Typography>
            {porBolsa && (
              <Box sx={{ mt: 1 }}>
                <FormControlLabel
                  control={<Switch checked={form.fuera_disponibilidad} onChange={(e) => cambiar("fuera_disponibilidad", e.target.checked)} />}
                  label="Fuera de la disponibilidad"
                />
                <Typography variant="caption" color="text.secondary" component="div">
                  Fuera de la disponibilidad: se cobra con la tarifa de Clientes generales, con trabajos adicionales y recargo nocturno, y sus km no suman a la
                  bolsa. Dentro: valor por la bolsa de km del mes; los adicionales se registran sin cobro.
                </Typography>
              </Box>
            )}
          </Seccion>

          {cerrado ? (
            <>
              <Seccion titulo="Trabajos adicionales (el precio lo pone el sistema según el cliente y la fecha)">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell padding="checkbox" />
                      <TableCell>Concepto</TableCell>
                      <TableCell sx={{ width: 160 }}>Cantidad</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {catalogoConceptos.map((c) => {
                      const valor = form.conceptos[c.id];
                      const marcado = valor !== undefined;
                      return (
                        <TableRow key={c.id}>
                          <TableCell padding="checkbox">
                            <Checkbox
                              checked={marcado}
                              onChange={() => cambiarConcepto(c.id, marcado ? null : "1")}
                              slotProps={{ input: { "aria-label": c.nombre } }}
                            />
                          </TableCell>
                          <TableCell>
                            {c.nombre}
                            <Typography variant="caption" color="text.secondary" component="div">
                              {UNIDADES_COBRO[c.unidad_cobro]}
                              {!c.la_reporta_operador && " · solo administrador"}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            {marcado && (
                              <TextField
                                size="small"
                                value={valor}
                                onChange={(e) => cambiarConcepto(c.id, e.target.value.replace(/[^\d.,]/g, ""))}
                                error={!numeroValido(valor, { min: 0.01, max: 999 })}
                                slotProps={{ htmlInput: { inputMode: "decimal", "aria-label": `Cantidad ${c.nombre}` } }}
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Seccion>

              <Seccion titulo="Valores">
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      select
                      fullWidth
                      label="Recargo nocturno"
                      value={form.recargo_nocturno}
                      onChange={(e) => cambiar("recargo_nocturno", e.target.value)}
                      helperText="Automático: según la hora de fin y el horario del recargo"
                    >
                      <MenuItem value="auto">Automático (según la hora)</MenuItem>
                      <MenuItem value="si">Aplicar siempre</MenuItem>
                      <MenuItem value="no">No aplicar</MenuItem>
                    </TextField>
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <FormControlLabel
                      control={<Switch checked={form.tarifa_manual_activa} onChange={(e) => cambiar("tarifa_manual_activa", e.target.checked)} />}
                      label="Tarifa básica manual"
                    />
                    {form.tarifa_manual_activa ? (
                      <TextField
                        fullWidth
                        size="small"
                        label="Tarifa básica *"
                        value={form.tarifa_manual}
                        onChange={(e) => cambiar("tarifa_manual", e.target.value.replace(/[^\d.,]/g, ""))}
                        error={!tarifaManualValida}
                        helperText={tarifaManualValida && form.tarifa_manual !== "" ? formatoMoneda(tarifaManual) : "Valor en pesos: reemplaza la tarifa de la tabla"}
                        slotProps={{ htmlInput: { inputMode: "numeric" }, input: { startAdornment: <InputAdornment position="start">$</InputAdornment> } }}
                      />
                    ) : (
                      <Typography variant="caption" color="text.secondary" component="div">
                        Automática: la de la tabla de tarifas del cliente (o la bolsa de km).
                      </Typography>
                    )}
                  </Grid>
                </Grid>
              </Seccion>
            </>
          ) : (
            <Alert severity="info">Los trabajos adicionales, la tarifa y el recargo se corrigen cuando el operador finalice el servicio.</Alert>
          )}

          <Seccion titulo="Entrega y observaciones">
            <FormControlLabel
              control={<Switch checked={form.entregado_sin_novedad} onChange={(e) => cambiar("entregado_sin_novedad", e.target.checked)} />}
              label="Entregado sin novedad"
            />
            <Grid container spacing={2} sx={{ mt: 0.5 }}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField fullWidth label="Recibe (nombre)" value={form.recibe_nombre} onChange={(e) => cambiar("recibe_nombre", e.target.value)} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField fullWidth label="Documento de quien recibe" value={form.recibe_documento} onChange={(e) => cambiar("recibe_documento", e.target.value)} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField fullWidth multiline minRows={2} label="Observaciones" value={form.observaciones} onChange={(e) => cambiar("observaciones", e.target.value)} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  fullWidth
                  multiline
                  minRows={2}
                  label="Observaciones de la entrega"
                  value={form.observaciones_entrega}
                  onChange={(e) => cambiar("observaciones_entrega", e.target.value)}
                />
              </Grid>
            </Grid>
          </Seccion>

          <TextField
            label="Motivo de la corrección *"
            placeholder="Ej: km según reporte GPS; el servicio era de otra empresa"
            multiline
            minRows={2}
            value={form.motivo}
            onChange={(e) => cambiar("motivo", e.target.value)}
            helperText="Queda en la bitácora junto con los valores anteriores y nuevos (mínimo 5 caracteres)."
          />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCerrar} disabled={enviando}>
          Cancelar
        </Button>
        <Button variant="contained" onClick={guardar} disabled={enviando || !hayCambios || !motivoValido}>
          {enviando ? "Guardando…" : hayCambios ? "Guardar corrección" : "Sin cambios"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ---------- Aprobar ----------
export function DialogoAprobar({ abierto, onCerrar, onListo, servicio }) {
  const calculado = servicio.valor_calculado;
  // Se escribe con coma decimal (los puntos se toman como separador de miles)
  const [valor, setValor] = useState(calculado === null ? "" : String(calculado).replace(".", ","));
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  const numero = Number(String(valor).replace(/\./g, "").replace(",", "."));
  const valido = valor !== "" && !Number.isNaN(numero) && numero >= 0;
  const distinto = calculado !== null && valido && numero !== calculado;
  const motivoOk = !distinto || motivo.trim().length >= 5;

  async function aprobar() {
    setEnviando(true);
    setError("");
    try {
      await aprobarServicio(servicio.id, { valor_aprobado: numero, motivo: motivo.trim() });
      onListo(`Orden #${servicio.numero_orden} aprobada por ${formatoMoneda(numero)}`);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={abierto} onClose={() => !enviando && onCerrar()} maxWidth="xs" fullWidth>
      <DialogTitle>Aprobar orden #{servicio.numero_orden}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography>
            Valor calculado: <b>{calculado === null ? "A convenir (sin tarifa)" : formatoMoneda(calculado)}</b>
          </Typography>
          {(Number(servicio.km_servicio) === 0 && Number(servicio.km_vacio) === 0) && (
            <Alert severity="warning">Este servicio no tiene kilómetros registrados. Si el cliente cobra por distancia, corríjalos antes de aprobar.</Alert>
          )}
          {servicio.tarifa_bolsa_id && servicio.bolsa_km_mes === null && (
            <Alert severity="warning">
              Bolsa de km: el mes aún no termina y el valor es PROVISIONAL (columna provisional de la bolsa). Si se aprueba ahora, queda fijo y no se ajusta con la
              columna real del mes.
            </Alert>
          )}
          <TextField
            label="Valor aprobado *"
            value={valor}
            onChange={(e) => setValor(e.target.value.replace(/[^\d.,]/g, ""))}
            error={valor !== "" && !valido}
            slotProps={{ htmlInput: { inputMode: "numeric" }, input: { startAdornment: <InputAdornment position="start">$</InputAdornment> } }}
            helperText={valido ? formatoMoneda(numero) : "Escriba el valor en pesos"}
          />
          <TextField
            label={distinto ? "Motivo (obligatorio: el valor es distinto del calculado)" : "Motivo (opcional)"}
            multiline
            minRows={2}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            error={!motivoOk}
          />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCerrar} disabled={enviando}>
          Cancelar
        </Button>
        <Button variant="contained" color="success" onClick={aprobar} disabled={enviando || !valido || !motivoOk}>
          {enviando ? "Aprobando…" : "Aprobar"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ---------- Anular / devolver (cambio de estado con motivo) ----------
export function DialogoMotivo({ abierto, onCerrar, onListo, servicio, estado, titulo, textoBoton, color = "primary", obligatorio = true, explicacion }) {
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const ok = !obligatorio || motivo.trim().length >= 5;

  async function confirmar() {
    setEnviando(true);
    setError("");
    try {
      await cambiarEstadoServicio(servicio.id, estado, motivo.trim());
      onListo(`${titulo}: hecho`);
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={abierto} onClose={() => !enviando && onCerrar()} maxWidth="xs" fullWidth>
      <DialogTitle>
        {titulo} · orden #{servicio.numero_orden}
      </DialogTitle>
      <DialogContent dividers>
        {explicacion && (
          <Alert severity={color === "error" ? "error" : "warning"} sx={{ mb: 2 }}>
            {explicacion}
          </Alert>
        )}
        <TextField
          autoFocus
          fullWidth
          label={obligatorio ? "Motivo *" : "Motivo (opcional)"}
          multiline
          minRows={3}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          helperText="Queda registrado en la bitácora."
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
        <Button variant="contained" color={color} onClick={confirmar} disabled={enviando || !ok}>
          {enviando ? "Guardando…" : textoBoton}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
