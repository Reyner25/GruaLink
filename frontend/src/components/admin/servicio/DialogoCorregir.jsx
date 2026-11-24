/**
 * Corrección autorizada del ADMINISTRADOR: puede cambiar todos los datos del
 * servicio (cliente, tipo de servicio y vehículo, grúa, fecha y horas, km,
 * vehículo, ubicación, entrega, observaciones, trabajos adicionales), poner
 * una tarifa básica manual y decidir si se cobra el recargo nocturno. Solo se
 * envía lo que cambió; el servidor recalcula los valores y deja todo en la
 * bitácora con el motivo.
 *
 * La lógica del formulario (qué cambió, validaciones) está en formularioCorreccion.js.
 */
import { useState } from "react";
import {
  Alert,
  Box,
  Button,
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
  TextField,
  Typography,
} from "@mui/material";
import { corregirServicio } from "../../../api/admin.api";
import { useEnviar } from "../../../hooks/useEnviar";
import { formatoMoneda } from "../../../utils/formato";
import { aPesos, armarCambios, formularioInicial, formularioValido, HORAS, numeroValido, opcionesCon } from "./formularioCorreccion";
import TrabajosAdicionales from "./TrabajosAdicionales";

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

// Campo de texto a media fila (dos por fila en pantallas medianas)
const Mitad = ({ children }) => <Grid size={{ xs: 12, sm: 6 }}>{children}</Grid>;

export default function DialogoCorregir({ abierto, onCerrar, onListo, servicio, conceptosActuales: todosActuales, catalogos }) {
  const cerrado = ["finalizado", "en_revision"].includes(servicio.estado);
  const { clientes = [], tipos = [], tipos_servicio: tiposServicio = [], gruas = [], conceptos: todoElCatalogo = [] } = catalogos || {};
  // El recargo nocturno se maneja con su propio control (automático / sí / no)
  const conceptosActuales = todosActuales.filter((c) => !c.es_recargo_nocturno);
  const catalogoConceptos = todoElCatalogo.filter((c) => !c.es_recargo_nocturno);
  // Clientes por bolsa de km (Suma): el administrador indica si va fuera de la disponibilidad
  const porBolsa = servicio.cliente_modalidad_cobro === "bolsa_km_mensual";

  const [form, setForm] = useState(() => formularioInicial(servicio, conceptosActuales));
  const { enviando, error, enviar } = useEnviar();

  const cambiar = (campo, valor) => setForm((f) => ({ ...f, [campo]: valor }));
  const cambiarConcepto = (id, valor) =>
    setForm((f) => {
      const conceptos = { ...f.conceptos };
      if (valor === null) delete conceptos[id];
      else conceptos[id] = valor;
      return { ...f, conceptos };
    });

  const tipoVehiculo = tipos.find((t) => String(t.id) === form.tipo_vehiculo_id);
  const validez = formularioValido(form);
  const cambios = validez.todo ? armarCambios(form, servicio, { conceptosActuales, esVehiculoOtro: Boolean(tipoVehiculo?.es_otro), porBolsa, cerrado }) : {};
  const hayCambios = Object.keys(cambios).length > 0;
  const motivoValido = form.motivo.trim().length >= 5;

  const guardar = () =>
    enviar(async () => {
      await corregirServicio(servicio.id, { ...cambios, motivo: form.motivo.trim() });
      onListo("Corrección guardada. Los valores se recalcularon.");
    });

  // Atajos para los campos repetidos
  const texto = (campo, etiqueta, props = {}) => (
    <TextField fullWidth label={etiqueta} value={form[campo]} onChange={(e) => cambiar(campo, e.target.value)} {...props} />
  );
  const select = (campo, etiqueta, opciones) => (
    <TextField select fullWidth label={etiqueta} value={form[campo]} onChange={(e) => cambiar(campo, e.target.value)}>
      {opciones.map((o) => (
        <MenuItem key={o.valor} value={o.valor}>
          {o.texto}
        </MenuItem>
      ))}
    </TextField>
  );
  const interruptor = (campo, etiqueta) => <FormControlLabel control={<Switch checked={form[campo]} onChange={(e) => cambiar(campo, e.target.checked)} />} label={etiqueta} />;

  return (
    <Dialog open={abierto} onClose={() => !enviando && onCerrar()} maxWidth="md" fullWidth>
      <DialogTitle>Corregir orden #{servicio.numero_orden}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={3}>
          <Seccion titulo="Servicio">
            <Grid container spacing={2}>
              <Mitad>{select("cliente_id", "Cliente (empresa)", opcionesCon(clientes, servicio.cliente_id, (c) => c.nombre))}</Mitad>
              <Mitad>{select("tipo_servicio_id", "Tipo de servicio", opcionesCon(tiposServicio, servicio.tipo_servicio_id, (t) => t.nombre))}</Mitad>
              <Mitad>{select("tipo_vehiculo_id", "Tipo de vehículo", opcionesCon(tipos, servicio.tipo_vehiculo_id, (t) => t.nombre))}</Mitad>
              {tipoVehiculo?.es_otro && <Mitad>{texto("tipo_vehiculo_otro", "¿Qué vehículo es? *")}</Mitad>}
              <Mitad>{select("grua_id", "Grúa", opcionesCon(gruas, servicio.grua_id, (g) => `${g.numero_interno} · ${g.placa}`))}</Mitad>
              <Mitad>{texto("fecha_servicio", "Fecha del servicio", { type: "date", slotProps: { inputLabel: { shrink: true } } })}</Mitad>
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
                  {texto(campo, etiqueta, { type: "datetime-local", slotProps: { inputLabel: { shrink: true } } })}
                </Grid>
              ))}
            </Grid>
          </Seccion>

          <Seccion titulo="Vehículo y ubicación">
            <Grid container spacing={2}>
              <Mitad>
                <TextField
                  fullWidth
                  label="Placa"
                  value={form.placa_vehiculo}
                  onChange={(e) => cambiar("placa_vehiculo", e.target.value.toUpperCase().replace(/[\s-]/g, ""))}
                  slotProps={{ htmlInput: { maxLength: 10 } }}
                />
              </Mitad>
              <Mitad>{texto("numero_vehiculo", "Número del vehículo")}</Mitad>
              <Mitad>{texto("origen", "Origen")}</Mitad>
              <Mitad>{texto("destino", "Destino")}</Mitad>
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
                {interruptor("fuera_disponibilidad", "Fuera de la disponibilidad")}
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
                <TrabajosAdicionales catalogo={catalogoConceptos} valores={form.conceptos} onCambiar={cambiarConcepto} />
              </Seccion>

              <Seccion titulo="Valores">
                <Grid container spacing={2}>
                  <Mitad>
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
                  </Mitad>
                  <Mitad>
                    {interruptor("tarifa_manual_activa", "Tarifa básica manual")}
                    {form.tarifa_manual_activa ? (
                      <TextField
                        fullWidth
                        size="small"
                        label="Tarifa básica *"
                        value={form.tarifa_manual}
                        onChange={(e) => cambiar("tarifa_manual", e.target.value.replace(/[^\d.,]/g, ""))}
                        error={!validez.tarifaValida}
                        helperText={validez.tarifaValida && form.tarifa_manual !== "" ? formatoMoneda(aPesos(form.tarifa_manual)) : "Valor en pesos: reemplaza la tarifa de la tabla"}
                        slotProps={{ htmlInput: { inputMode: "numeric" }, input: { startAdornment: <InputAdornment position="start">$</InputAdornment> } }}
                      />
                    ) : (
                      <Typography variant="caption" color="text.secondary" component="div">
                        Automática: la de la tabla de tarifas del cliente (o la bolsa de km).
                      </Typography>
                    )}
                  </Mitad>
                </Grid>
              </Seccion>
            </>
          ) : (
            <Alert severity="info">Los trabajos adicionales, la tarifa y el recargo se corrigen cuando el operador finalice el servicio.</Alert>
          )}

          <Seccion titulo="Entrega y observaciones">
            {interruptor("entregado_sin_novedad", "Entregado sin novedad")}
            <Grid container spacing={2} sx={{ mt: 0.5 }}>
              <Mitad>{texto("recibe_nombre", "Recibe (nombre)")}</Mitad>
              <Mitad>{texto("recibe_documento", "Documento de quien recibe")}</Mitad>
              <Mitad>{texto("observaciones", "Observaciones", { multiline: true, minRows: 2 })}</Mitad>
              <Mitad>{texto("observaciones_entrega", "Observaciones de la entrega", { multiline: true, minRows: 2 })}</Mitad>
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
