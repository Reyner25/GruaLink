/**
 * Tabla administrable reutilizable: listar, buscar, crear y editar registros
 * de cualquier recurso del backend (clientes, grúas, usuarios, tarifas…).
 *
 * Cada pantalla solo DESCRIBE el recurso; este componente hace el resto.
 *
 * Props principales:
 *   ruta, clave, claveUno   endpoint y nombres en la respuesta
 *                           (ej. "/clientes", "clientes", "cliente")
 *   columnas  [{ campo, titulo, render?(fila), alinear? }]
 *   campos    [{ campo, etiqueta, tipo, requerido?, soloCrear?, opciones?,
 *                nulable?, ayuda?, deshabilitado?(fila) }]
 *             tipo: "texto" | "numero" | "dinero" | "fecha" | "hora" | "booleano" |
 *                   "select" | "password" | "email"
 *   filtros   valores fijos para el listado (ej. { cliente_id: "generales" })
 *   accionesFila(fila, recargar)  botones extra por fila
 *   puedeEditar   si es false, solo lectura (financiero)
 *   permitirBorrar  muestra "Borrar" (tarifas no usadas)
 *   buscarEn  campos donde busca el cuadro de búsqueda (en el navegador)
 *
 * Al EDITAR solo se envían los campos que cambiaron, más un motivo opcional
 * que queda en la bitácora.
 */
import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Snackbar,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import SearchIcon from "@mui/icons-material/Search";
import { useCargar } from "../../hooks/useCargar";
import { actualizarRecurso, crearRecurso, eliminarRecurso, listarRecurso } from "../../api/admin.api";
import { erroresPorCampo, mensajeError } from "../../utils/formato";
import { Cargando, ErrorCarga } from "../operador/Comunes";

// ---------- Conversión entre el formulario (texto) y la API (tipos reales) ----------

function aFormulario(campo, valor) {
  if (campo.tipo === "booleano") return Boolean(valor);
  if (valor === null || valor === undefined) return "";
  if (campo.tipo === "select") return String(valor);
  if (campo.tipo === "numero" || campo.tipo === "dinero") return String(valor).replace(".", ",");
  if (campo.tipo === "hora") return String(valor).slice(0, 5); // "19:00:00" → "19:00"
  return String(valor);
}

function aApi(campo, texto) {
  if (campo.tipo === "booleano") return texto;
  const limpio = typeof texto === "string" ? texto.trim() : texto;
  if (limpio === "") return campo.nulable ? null : undefined;
  if (campo.tipo === "numero" || campo.tipo === "dinero") {
    // "1.500.000" (dinero con puntos de miles) o "17,5" (decimal con coma)
    const normal = campo.tipo === "dinero" ? limpio.replace(/\./g, "").replace(",", ".") : limpio.replace(",", ".");
    return Number(normal);
  }
  if (campo.tipo === "select") return campo.opcionesNumericas === false ? limpio : /^\d+$/.test(limpio) ? Number(limpio) : limpio;
  return limpio;
}

// ---------- Diálogo crear / editar ----------

function DialogoRegistro({ abierto, fila, campos, ruta, claveUno, titulo, textoNuevo, onCerrar, onListo }) {
  const editando = Boolean(fila);
  const visibles = campos.filter((c) => !(editando && c.soloCrear));
  const [form, setForm] = useState(() =>
    Object.fromEntries(visibles.map((c) => [c.campo, aFormulario(c, editando ? fila[c.campo] : c.porDefecto ?? (c.tipo === "booleano" ? true : ""))])),
  );
  const [motivo, setMotivo] = useState("");
  const [errores, setErrores] = useState({});
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);

  const cambiar = (campo, valor) => {
    setForm((f) => ({ ...f, [campo]: valor }));
    setErrores((e) => ({ ...e, [campo]: undefined }));
  };

  // Validación mínima en el navegador; el backend valida todo de nuevo
  function validar() {
    const e = {};
    for (const c of visibles) {
      if (c.deshabilitado?.(fila)) continue;
      const v = form[c.campo];
      if (c.requerido && (v === "" || v === null)) e[c.campo] = "Obligatorio";
      if ((c.tipo === "numero" || c.tipo === "dinero") && v !== "" && Number.isNaN(aApi(c, v))) e[c.campo] = "Número inválido";
    }
    return e;
  }

  async function guardar() {
    const e = validar();
    setErrores(e);
    if (Object.keys(e).length) return;

    const datos = {};
    for (const c of visibles) {
      if (c.deshabilitado?.(fila)) continue;
      const valor = aApi(c, form[c.campo]);
      if (valor === undefined) continue;
      // Al editar, solo lo que cambió
      if (editando && JSON.stringify(valor) === JSON.stringify(fila[c.campo] ?? (c.nulable ? null : undefined))) continue;
      if (editando && aFormulario(c, fila[c.campo]) === form[c.campo]) continue;
      datos[c.campo] = valor;
    }
    if (editando && Object.keys(datos).length === 0) {
      setError("No cambió ningún dato.");
      return;
    }

    setEnviando(true);
    setError("");
    try {
      if (editando) await actualizarRecurso(ruta, claveUno, fila.id, { ...datos, ...(motivo.trim() ? { motivo: motivo.trim() } : {}) });
      else await crearRecurso(ruta, claveUno, datos);
      onListo(editando ? "Cambios guardados" : `${titulo} creado`);
    } catch (err) {
      setErrores(erroresPorCampo(err));
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open={abierto} onClose={() => !enviando && onCerrar()} maxWidth="sm" fullWidth>
      <DialogTitle>{editando ? `Editar ${titulo.toLowerCase()}` : textoNuevo || `Nuevo ${titulo.toLowerCase()}`}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {visibles.map((c) => {
            const deshabilitado = c.deshabilitado?.(fila) || false;
            const comun = {
              label: `${c.etiqueta}${c.requerido ? " *" : ""}`,
              value: form[c.campo],
              onChange: (e) => cambiar(c.campo, e.target.value),
              error: Boolean(errores[c.campo]),
              helperText: errores[c.campo] || (deshabilitado && c.ayudaBloqueado) || c.ayuda,
              disabled: deshabilitado,
            };
            if (c.tipo === "booleano") {
              return (
                <FormControlLabel
                  key={c.campo}
                  control={<Switch checked={form[c.campo]} onChange={(e) => cambiar(c.campo, e.target.checked)} disabled={deshabilitado} />}
                  label={c.etiqueta}
                />
              );
            }
            if (c.tipo === "select") {
              return (
                <TextField key={c.campo} select {...comun}>
                  {(c.opciones || []).map((o) => (
                    <MenuItem key={String(o.valor)} value={String(o.valor)}>
                      {o.texto}
                    </MenuItem>
                  ))}
                </TextField>
              );
            }
            if (c.tipo === "fecha") return <TextField key={c.campo} type="date" {...comun} slotProps={{ inputLabel: { shrink: true } }} />;
            if (c.tipo === "hora") return <TextField key={c.campo} type="time" {...comun} slotProps={{ inputLabel: { shrink: true } }} />;
            if (c.tipo === "dinero")
              return (
                <TextField
                  key={c.campo}
                  {...comun}
                  onChange={(e) => cambiar(c.campo, e.target.value.replace(/[^\d.,]/g, ""))}
                  slotProps={{ htmlInput: { inputMode: "numeric" }, input: { startAdornment: <InputAdornment position="start">$</InputAdornment> } }}
                />
              );
            if (c.tipo === "numero")
              return <TextField key={c.campo} {...comun} onChange={(e) => cambiar(c.campo, e.target.value.replace(/[^\d.,]/g, ""))} slotProps={{ htmlInput: { inputMode: "decimal" } }} />;
            return <TextField key={c.campo} type={c.tipo === "password" ? "password" : c.tipo === "email" ? "email" : "text"} {...comun} />;
          })}
          {editando && (
            <TextField label="Motivo del cambio (opcional)" value={motivo} onChange={(e) => setMotivo(e.target.value)} helperText="Queda registrado en la bitácora." />
          )}
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCerrar} disabled={enviando}>
          Cancelar
        </Button>
        <Button variant="contained" onClick={guardar} disabled={enviando}>
          {enviando ? "Guardando…" : "Guardar"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ---------- Borrar (solo recursos que lo permiten) ----------

function DialogoBorrar({ fila, ruta, onCerrar, onListo }) {
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  async function borrar() {
    setEnviando(true);
    try {
      await eliminarRecurso(ruta, fila.id, motivo.trim());
      onListo("Registro borrado");
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }
  return (
    <Dialog open onClose={() => !enviando && onCerrar()} maxWidth="xs" fullWidth>
      <DialogTitle>¿Borrar este registro?</DialogTitle>
      <DialogContent dividers>
        <TextField fullWidth autoFocus label="Motivo *" value={motivo} onChange={(e) => setMotivo(e.target.value)} multiline minRows={2} helperText="Mínimo 5 caracteres. Queda en la bitácora." />
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
        <Button color="error" variant="contained" onClick={borrar} disabled={enviando || motivo.trim().length < 5}>
          Borrar
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// ---------- Componente principal ----------

export default function CrudCatalogo({
  ruta,
  clave,
  claveUno,
  titulo,
  columnas,
  campos,
  filtros = {},
  accionesFila,
  puedeEditar = true,
  permitirBorrar = false,
  puedeBorrarFila = () => true,
  buscarEn = [],
  barraExtra,
  textoNuevo,
}) {
  const claveFiltros = JSON.stringify(filtros);
  const { datos, cargando, error, recargar } = useCargar(() => listarRecurso(ruta, clave, filtros), [ruta, claveFiltros]);
  const [dialogo, setDialogo] = useState(null); // { tipo: "crear" | "editar" | "borrar", fila }
  const [aviso, setAviso] = useState("");
  const [buscar, setBuscar] = useState("");

  function listo(mensaje) {
    setDialogo(null);
    setAviso(mensaje);
    recargar();
  }

  const q = buscar.trim().toLowerCase();
  const filas = (datos || []).filter((f) => !q || buscarEn.some((c) => String(f[c] ?? "").toLowerCase().includes(q)));

  return (
    <Card>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ p: 2, alignItems: { sm: "center" } }}>
        {buscarEn.length > 0 && (
          <TextField
            size="small"
            placeholder="Buscar…"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            sx={{ maxWidth: 360 }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }}
          />
        )}
        {barraExtra}
        <Box sx={{ flexGrow: 1 }} />
        {puedeEditar && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setDialogo({ tipo: "crear" })}>
            {textoNuevo || `Nuevo ${titulo.toLowerCase()}`}
          </Button>
        )}
      </Stack>

      {cargando && !datos && <Cargando />}
      {error && (
        <Box sx={{ p: 2 }}>
          <ErrorCarga mensaje={error} onReintentar={recargar} />
        </Box>
      )}
      {datos && (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ "& th": { fontWeight: 700, bgcolor: "background.default" } }}>
                {columnas.map((c) => (
                  <TableCell key={c.campo} align={c.alinear}>
                    {c.titulo}
                  </TableCell>
                ))}
                {(puedeEditar || accionesFila) && <TableCell align="right">Acciones</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {filas.map((f) => (
                <TableRow key={f.id} hover>
                  {columnas.map((c) => (
                    <TableCell key={c.campo} align={c.alinear}>
                      {c.render ? c.render(f) : f[c.campo] ?? "—"}
                    </TableCell>
                  ))}
                  {(puedeEditar || accionesFila) && (
                    <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                      {accionesFila?.(f, () => listo("Cambios guardados"))}
                      {puedeEditar && (
                        <Tooltip title="Editar">
                          <IconButton size="small" aria-label="Editar" onClick={() => setDialogo({ tipo: "editar", fila: f })}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {puedeEditar && permitirBorrar && puedeBorrarFila(f) && (
                        <Tooltip title="Borrar">
                          <IconButton size="small" aria-label="Borrar" color="error" onClick={() => setDialogo({ tipo: "borrar", fila: f })}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {filas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={columnas.length + 1} align="center" sx={{ py: 4, color: "text.secondary" }}>
                    No hay registros.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {(dialogo?.tipo === "crear" || dialogo?.tipo === "editar") && (
        <DialogoRegistro
          abierto
          fila={dialogo.fila}
          campos={campos}
          ruta={ruta}
          claveUno={claveUno}
          titulo={titulo}
          textoNuevo={textoNuevo}
          onCerrar={() => setDialogo(null)}
          onListo={listo}
        />
      )}
      {dialogo?.tipo === "borrar" && <DialogoBorrar fila={dialogo.fila} ruta={ruta} onCerrar={() => setDialogo(null)} onListo={listo} />}

      <Snackbar open={Boolean(aviso)} autoHideDuration={3500} onClose={() => setAviso("")} anchorOrigin={{ vertical: "top", horizontal: "center" }}>
        <Alert severity="success" variant="filled" onClose={() => setAviso("")}>
          {aviso}
        </Alert>
      </Snackbar>
    </Card>
  );
}
