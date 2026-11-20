/**
 * Finalización de un servicio (información operativa y de entrega).
 *
 * Registra: hora de inicio (si faltaba) y fin, entrega sin novedad, quién
 * recibe, observaciones de entrega y los trabajos adicionales realizados
 * (cardán, persiana, cámaras…) con su cantidad.
 *
 * NO registra (lo hace el administrador en la revisión): kilómetros en vacío
 * y en servicio, hora stand-by y recargo nocturno. El catálogo que recibe el
 * operador ya no incluye esos conceptos.
 *
 * El operador NO ve ni envía precios: el backend calcula los valores.
 * Una vez finalizado, el servicio queda bloqueado para el operador; el
 * backend impide una segunda finalización aunque se toque dos veces.
 */
import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import { useCargar } from "../../hooks/useCargar";
import { obtenerServicioDetalle, finalizarServicio } from "../../api/servicios.api";
import { obtenerCatalogos } from "../../api/catalogos.api";
import {
  aInputFechaHora,
  deInputFechaHora,
  ESTADOS_ABIERTOS,
  formatoFechaHora,
  formatoNumero,
  mensajeError,
  UNIDADES_COBRO,
  erroresPorCampo,
} from "../../utils/formato";
import { BarraAcciones, BarraSuperior, Cargando, Contenido, ErrorCarga, TituloSeccion } from "../../components/operador/Comunes";

// Cuánto suma/resta el botón +/- según la unidad (las horas admiten medias)
const PASO_CANTIDAD = { hora: 0.5, km: 1, evento: 1, cantidad: 1 };

function SelectorConceptos({ conceptos, seleccion, onChange }) {
  function alternar(c) {
    const nueva = { ...seleccion };
    if (nueva[c.id]) delete nueva[c.id];
    else nueva[c.id] = 1;
    onChange(nueva);
  }
  function sumar(c, delta) {
    const actual = seleccion[c.id] || 0;
    const valor = Math.round((actual + delta) * 100) / 100;
    const nueva = { ...seleccion };
    if (valor <= 0) delete nueva[c.id];
    else nueva[c.id] = Math.min(valor, 999);
    onChange(nueva);
  }

  return (
    <Stack spacing={1}>
      {conceptos.map((c) => {
        const cantidad = seleccion[c.id];
        const paso = PASO_CANTIDAD[c.unidad_cobro] || 1;
        return (
          <Card key={c.id} variant="outlined" sx={{ borderColor: cantidad ? "primary.main" : "divider" }}>
            <Stack direction="row" sx={{ alignItems: "center", px: 1, py: 0.5 }}>
              <FormControlLabel
                sx={{ flexGrow: 1, m: 0 }}
                control={
                  <Checkbox
                    checked={Boolean(cantidad)}
                    onChange={() => alternar(c)}
                    slotProps={{ input: { "aria-label": c.nombre } }}
                  />
                }
                label={
                  <Box>
                    <Typography sx={{ fontWeight: 600 }} variant="body2">
                      {c.nombre}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {UNIDADES_COBRO[c.unidad_cobro]}
                    </Typography>
                  </Box>
                }
              />
              {cantidad && (
                <Stack sx={{ alignItems: "center" }} direction="row">
                  <IconButton aria-label={`Menos ${c.nombre}`} onClick={() => sumar(c, -paso)}>
                    <RemoveIcon />
                  </IconButton>
                  <Typography sx={{ fontWeight: 700, minWidth: 32, textAlign: "center" }} aria-live="polite">
                    {formatoNumero(cantidad)}
                  </Typography>
                  <IconButton aria-label={`Más ${c.nombre}`} onClick={() => sumar(c, paso)}>
                    <AddIcon />
                  </IconButton>
                </Stack>
              )}
            </Stack>
          </Card>
        );
      })}
    </Stack>
  );
}

export default function FinalizarServicio() {
  const { id } = useParams();
  const navigate = useNavigate();
  const detalle = useCargar(() => obtenerServicioDetalle(id), [id]);
  const catalogos = useCargar(obtenerCatalogos, []);

  const [form, setForm] = useState({
    inicio_servicio: "",
    fin_servicio: aInputFechaHora(),
    entregado_sin_novedad: true,
    recibe_nombre: "",
    recibe_documento: "",
    observaciones_entrega: "",
  });
  const [conceptos, setConceptos] = useState({}); // { concepto_id: cantidad }
  const [errores, setErrores] = useState({});
  const [confirmar, setConfirmar] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState("");

  if (detalle.cargando || catalogos.cargando) return <Cargando />;
  if (detalle.error || catalogos.error) {
    return (
      <>
        <BarraSuperior titulo="Finalizar servicio" atras />
        <Contenido>
          <ErrorCarga mensaje={detalle.error || catalogos.error} onReintentar={() => (detalle.recargar(), catalogos.recargar())} />
        </Contenido>
      </>
    );
  }

  const servicio = detalle.datos.servicio;
  // Si ya no está abierto (otro dispositivo lo finalizó), mostrar el detalle
  if (!ESTADOS_ABIERTOS.includes(servicio.estado)) return <Navigate to={`/app/servicios/${id}`} replace />;
  const faltaInicio = !servicio.inicio_servicio;

  function cambiar(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
    setErrores((e) => ({ ...e, [campo]: undefined }));
  }

  function validar() {
    const e = {};
    const ahora = Date.now() + 10 * 60000;
    const inicio = faltaInicio ? form.inicio_servicio : aInputFechaHora(servicio.inicio_servicio);
    if (faltaInicio && !form.inicio_servicio) e.inicio_servicio = "Indique la hora de inicio";
    else if (faltaInicio && new Date(form.inicio_servicio) > ahora) e.inicio_servicio = "No puede estar en el futuro";
    else if (faltaInicio && servicio.hora_solicitud && new Date(form.inicio_servicio) < new Date(servicio.hora_solicitud))
      e.inicio_servicio = `Es anterior a la hora de solicitud (${formatoFechaHora(servicio.hora_solicitud)})`;
    if (!form.fin_servicio) e.fin_servicio = "Indique la hora de finalización";
    else if (new Date(form.fin_servicio) > ahora) e.fin_servicio = "No puede estar en el futuro";
    else if (inicio && form.fin_servicio < inicio) e.fin_servicio = "Es anterior a la hora de inicio";
    if (!form.entregado_sin_novedad && !form.observaciones_entrega.trim())
      e.observaciones_entrega = "Describa la novedad de la entrega";
    return e;
  }

  function pedirConfirmacion() {
    const e = validar();
    setErrores(e);
    if (Object.keys(e).length === 0) setConfirmar(true);
  }

  async function enviar() {
    setEnviando(true);
    setErrorEnvio("");
    try {
      await finalizarServicio(id, {
        ...(faltaInicio ? { inicio_servicio: deInputFechaHora(form.inicio_servicio) } : {}),
        fin_servicio: deInputFechaHora(form.fin_servicio),
        entregado_sin_novedad: form.entregado_sin_novedad,
        recibe_nombre: form.recibe_nombre.trim() || null,
        recibe_documento: form.recibe_documento.trim() || null,
        observaciones_entrega: form.observaciones_entrega.trim() || null,
        conceptos: Object.entries(conceptos).map(([conceptoId, cantidad]) => ({ concepto_id: Number(conceptoId), cantidad })),
      });
      navigate(`/app/servicios/${id}`, { replace: true, state: { mensaje: `Orden #${servicio.numero_orden} finalizada` } });
    } catch (err) {
      setErrores(erroresPorCampo(err));
      setErrorEnvio(mensajeError(err));
      setConfirmar(false);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <BarraSuperior titulo={`Finalizar · Orden #${servicio.numero_orden}`} atras={`/app/servicios/${id}`} />
      <Contenido>
        <Card variant="outlined">
          <CardContent sx={{ py: 1.5 }}>
            <Typography sx={{ fontWeight: 700 }}>{servicio.cliente_nombre}</Typography>
            <Typography variant="body2" color="text.secondary">
              {servicio.placa_vehiculo} · {servicio.tipo_vehiculo} · {servicio.tipo_servicio}
            </Typography>
          </CardContent>
        </Card>

        <TituloSeccion>Tiempos</TituloSeccion>
        {faltaInicio && (
          <TextField
            label="Hora de inicio del servicio *"
            type="datetime-local"
            value={form.inicio_servicio}
            onChange={(e) => cambiar("inicio_servicio", e.target.value)}
            error={Boolean(errores.inicio_servicio)}
            helperText={errores.inicio_servicio}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        )}
        <TextField
          label="Hora de finalización *"
          type="datetime-local"
          value={form.fin_servicio}
          onChange={(e) => cambiar("fin_servicio", e.target.value)}
          error={Boolean(errores.fin_servicio)}
          helperText={errores.fin_servicio}
          slotProps={{ inputLabel: { shrink: true } }}
        />

        <TituloSeccion>Trabajos adicionales realizados</TituloSeccion>
        <Typography variant="body2" color="text.secondary" sx={{ mt: -1 }}>
          Marca lo que hiciste. Los valores los calcula el sistema.
        </Typography>
        <SelectorConceptos conceptos={catalogos.datos.conceptos} seleccion={conceptos} onChange={setConceptos} />

        <TituloSeccion>Entrega del vehículo</TituloSeccion>
        <FormControlLabel
          control={<Switch checked={form.entregado_sin_novedad} onChange={(e) => cambiar("entregado_sin_novedad", e.target.checked)} />}
          label={form.entregado_sin_novedad ? "Entregado sin novedad" : "Entregado CON novedad"}
        />
        <TextField label="Nombre de quien recibe" value={form.recibe_nombre} onChange={(e) => cambiar("recibe_nombre", e.target.value)} slotProps={{ htmlInput: { maxLength: 120 } }} />
        <TextField
          label="Documento de quien recibe"
          value={form.recibe_documento}
          onChange={(e) => cambiar("recibe_documento", e.target.value)}
          slotProps={{ htmlInput: { maxLength: 30, inputMode: "numeric" } }}
        />
        <TextField
          label={form.entregado_sin_novedad ? "Observaciones de entrega (opcional)" : "Describa la novedad *"}
          placeholder="Ej: se retira cardán y se entrega en patio"
          multiline
          minRows={3}
          value={form.observaciones_entrega}
          onChange={(e) => cambiar("observaciones_entrega", e.target.value)}
          error={Boolean(errores.observaciones_entrega)}
          helperText={errores.observaciones_entrega}
          slotProps={{ htmlInput: { maxLength: 2000 } }}
        />

        {errorEnvio && <Alert severity="error">{errorEnvio}</Alert>}
      </Contenido>

      <BarraAcciones>
        <Button variant="contained" size="large" fullWidth onClick={pedirConfirmacion}>
          Finalizar servicio
        </Button>
      </BarraAcciones>

      <Dialog open={confirmar} onClose={() => !enviando && setConfirmar(false)}>
        <DialogTitle>¿Finalizar la orden #{servicio.numero_orden}?</DialogTitle>
        <DialogContent>
          <Typography>Verifica que todo sea correcto: después de finalizar no podrás modificar el servicio.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmar(false)} disabled={enviando}>
            Revisar
          </Button>
          <Button variant="contained" onClick={enviar} disabled={enviando}>
            {enviando ? "Guardando…" : "Sí, finalizar"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
