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
  InputAdornment,
  Stack,
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
export function DialogoCorregir({ abierto, onCerrar, onListo, servicio, conceptosActuales: todosActuales, catalogoConceptos: todoElCatalogo }) {
  const cerrado = ["finalizado", "en_revision"].includes(servicio.estado);
  // El recargo nocturno es automático (según la hora de fin): no se marca a mano
  const conceptosActuales = todosActuales.filter((c) => !c.es_recargo_nocturno);
  const catalogoConceptos = todoElCatalogo.filter((c) => !c.es_recargo_nocturno);
  const inicial = () => ({
    km_vacio: String(servicio.km_vacio ?? 0),
    km_servicio: String(servicio.km_servicio ?? 0),
    placa_vehiculo: servicio.placa_vehiculo || "",
    numero_vehiculo: servicio.numero_vehiculo || "",
    origen: servicio.origen || "",
    destino: servicio.destino || "",
    conceptos: Object.fromEntries(conceptosActuales.map((c) => [c.concepto_id, String(c.cantidad)])),
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

  // Solo se envían los campos que cambiaron
  function armarCambios() {
    const cambios = {};
    if (aNumero(form.km_vacio) !== Number(servicio.km_vacio)) cambios.km_vacio = aNumero(form.km_vacio);
    if (aNumero(form.km_servicio) !== Number(servicio.km_servicio)) cambios.km_servicio = aNumero(form.km_servicio);
    for (const campo of ["placa_vehiculo", "numero_vehiculo", "origen", "destino"]) {
      if (form[campo].trim() !== (servicio[campo] || "")) cambios[campo] = form[campo].trim() || null;
    }
    if (cerrado) {
      const nuevos = Object.entries(form.conceptos).map(([id, cant]) => ({ concepto_id: Number(id), cantidad: aNumero(cant) }));
      const antes = conceptosActuales.map((c) => `${c.concepto_id}:${Number(c.cantidad)}`).sort().join();
      const despues = nuevos.map((c) => `${c.concepto_id}:${c.cantidad}`).sort().join();
      if (antes !== despues) cambios.conceptos = nuevos;
    }
    return cambios;
  }

  const kmValidos = numeroValido(form.km_vacio) && numeroValido(form.km_servicio);
  const conceptosValidos = Object.values(form.conceptos).every((c) => numeroValido(c, { min: 0.01, max: 999 }));
  const cambios = kmValidos && conceptosValidos ? armarCambios() : {};
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

  return (
    <Dialog open={abierto} onClose={() => !enviando && onCerrar()} maxWidth="md" fullWidth>
      <DialogTitle>Corregir orden #{servicio.numero_orden}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5}>
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Kilómetros
            </Typography>
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
            </Typography>
          </Box>

          {cerrado ? (
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                Trabajos adicionales (el precio lo pone el sistema según el cliente y la fecha)
              </Typography>
              <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>
                El recargo nocturno no aparece aquí: el sistema lo aplica solo cuando el servicio termina en horario nocturno.
              </Typography>
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
            </Box>
          ) : (
            <Alert severity="info">Los trabajos adicionales se corrigen cuando el operador finalice el servicio.</Alert>
          )}

          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Vehículo y ubicación
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ mb: 2 }}>
              <TextField
                label="Placa"
                value={form.placa_vehiculo}
                onChange={(e) => cambiar("placa_vehiculo", e.target.value.toUpperCase().replace(/[\s-]/g, ""))}
                slotProps={{ htmlInput: { maxLength: 10 } }}
              />
              <TextField label="Número del vehículo" value={form.numero_vehiculo} onChange={(e) => cambiar("numero_vehiculo", e.target.value)} />
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
              <TextField label="Origen" value={form.origen} onChange={(e) => cambiar("origen", e.target.value)} />
              <TextField label="Destino" value={form.destino} onChange={(e) => cambiar("destino", e.target.value)} />
            </Stack>
          </Box>

          <TextField
            label="Motivo de la corrección *"
            placeholder="Ej: km según reporte GPS; stand-by reportado por el cliente"
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
