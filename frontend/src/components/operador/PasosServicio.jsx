/**
 * Pasos del formulario "Nuevo servicio".
 * Cada paso recibe: form (datos), cambiar(campo, valor), errores, catalogos.
 * No guardan estado propio: todo vive en NuevoServicio.jsx.
 */
import {
  Autocomplete,
  Box,
  Card,
  CardContent,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import BusinessIcon from "@mui/icons-material/Business";
import PhoneIcon from "@mui/icons-material/Phone";
import BadgeIcon from "@mui/icons-material/Badge";
import PersonIcon from "@mui/icons-material/Person";
import DirectionsBusIcon from "@mui/icons-material/DirectionsBus";
import PlaceIcon from "@mui/icons-material/Place";
import FlagIcon from "@mui/icons-material/Flag";
import EventIcon from "@mui/icons-material/Event";
import BuildIcon from "@mui/icons-material/Build";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import ConfirmationNumberIcon from "@mui/icons-material/ConfirmationNumber";
import NotesIcon from "@mui/icons-material/Notes";
import { FilaDato, TituloSeccion } from "./Comunes";
import { formatoFecha, formatoFechaHora } from "../../utils/formato";

// ---------- Indicador de pasos (1 · 2 · 3 · 4) ----------
export function IndicadorPasos({ pasos, actual }) {
  return (
    <Stack direction="row" sx={{ px: 2, py: 1.5, bgcolor: "background.paper", borderBottom: 1, borderColor: "divider" }}>
      {pasos.map((texto, i) => {
        const hecho = i < actual;
        const activo = i === actual;
        return (
          <Stack key={texto} sx={{ alignItems: "center", flex: 1, position: "relative" }}>
            {i > 0 && (
              <Box
                sx={{
                  position: "absolute",
                  top: 14,
                  right: "50%",
                  width: "100%",
                  height: 2,
                  bgcolor: hecho || activo ? "primary.main" : "divider",
                  zIndex: 0,
                }}
              />
            )}
            <Box
              sx={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                display: "grid",
                placeItems: "center",
                fontSize: 14,
                fontWeight: 700,
                zIndex: 1,
                bgcolor: hecho || activo ? "primary.main" : "background.paper",
                color: hecho || activo ? "#fff" : "text.secondary",
                border: 2,
                borderColor: hecho || activo ? "primary.main" : "divider",
              }}
            >
              {i + 1}
            </Box>
            <Typography variant="caption" sx={{ mt: 0.5, fontWeight: activo ? 700 : 400 }} color={activo ? "primary" : "text.secondary"}>
              {texto}
            </Typography>
          </Stack>
        );
      })}
    </Stack>
  );
}

// ---------- Paso 1: Cliente ----------
export function PasoCliente({ form, cambiar, errores, catalogos }) {
  const cliente = catalogos.clientes.find((c) => c.id === form.cliente_id) || null;
  return (
    <>
      <TituloSeccion>Datos del cliente</TituloSeccion>
      <Autocomplete
        options={catalogos.clientes}
        value={cliente}
        onChange={(_, c) => cambiar("cliente_id", c?.id ?? null)}
        getOptionLabel={(c) => c.nombre}
        filterOptions={(opciones, { inputValue }) => {
          const q = inputValue.trim().toLowerCase();
          return opciones.filter((c) => !q || `${c.nombre} ${c.razon_social} ${c.nit}`.toLowerCase().includes(q));
        }}
        renderOption={({ key, ...props }, c) => (
          <li key={key} {...props}>
            <Box>
              <Typography>{c.nombre}</Typography>
              <Typography variant="caption" color="text.secondary">
                NIT {c.nit}
              </Typography>
            </Box>
          </li>
        )}
        noOptionsText="No se encontró el cliente"
        renderInput={(params) => (
          <TextField {...params} label="Buscar cliente por nombre o NIT *" error={Boolean(errores.cliente_id)} helperText={errores.cliente_id} />
        )}
      />
      {cliente && (
        <Card variant="outlined" sx={{ bgcolor: "primary.light", borderColor: "primary.main" }}>
          <CardContent sx={{ py: 1 }}>
            <FilaDato icono={<BusinessIcon />} etiqueta="Razón social" valor={cliente.razon_social} />
            <FilaDato icono={<BadgeIcon />} etiqueta="NIT" valor={cliente.nit} />
            <FilaDato icono={<PhoneIcon />} etiqueta="Teléfono de contacto" valor={cliente.telefono} />
          </CardContent>
        </Card>
      )}
    </>
  );
}

// ---------- Paso 2: Vehículo ----------
export function PasoVehiculo({ form, cambiar, errores, catalogos }) {
  const elegido = catalogos.tipos.find((t) => t.id === form.tipo_vehiculo_id);
  return (
    <>
      <TituloSeccion>Datos del vehículo</TituloSeccion>
      <Box>
        <Typography variant="body2" color={errores.tipo_vehiculo_id ? "error" : "text.secondary"} sx={{ mb: 1 }}>
          Tipo de vehículo *
        </Typography>
        {/* Botones grandes en vez de lista: más fácil de tocar en la calle */}
        <ToggleButtonGroup
          exclusive
          value={form.tipo_vehiculo_id}
          onChange={(_, v) => v !== null && cambiar("tipo_vehiculo_id", v)}
          sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}
        >
          {catalogos.tipos.map((t) => (
            <ToggleButton
              key={t.id}
              value={t.id}
              sx={{ border: "1px solid !important", borderColor: "divider", borderRadius: "10px !important", py: 1.5, textTransform: "none" }}
            >
              {t.nombre}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        {errores.tipo_vehiculo_id && (
          <Typography variant="caption" color="error">
            {errores.tipo_vehiculo_id}
          </Typography>
        )}
      </Box>
      {/* "Otro": el operador escribe cuál es (volqueta, camión, van…) */}
      {elegido?.es_otro && (
        <TextField
          label="¿Qué tipo de vehículo es? *"
          placeholder="Ej: Volqueta, Camión, Van"
          value={form.tipo_vehiculo_otro}
          onChange={(e) => cambiar("tipo_vehiculo_otro", e.target.value)}
          error={Boolean(errores.tipo_vehiculo_otro)}
          helperText={errores.tipo_vehiculo_otro || "El valor de este servicio lo define el administrador"}
          autoFocus
          slotProps={{ htmlInput: { maxLength: 60 } }}
        />
      )}
      <TextField
        label="Placa del vehículo *"
        placeholder="Ej: ESS265"
        value={form.placa_vehiculo}
        // Mayúsculas y sin espacios ni guiones, igual a como la guarda el servidor
        onChange={(e) => cambiar("placa_vehiculo", e.target.value.toUpperCase().replace(/[\s-]/g, ""))}
        error={Boolean(errores.placa_vehiculo)}
        helperText={errores.placa_vehiculo}
        slotProps={{ htmlInput: { maxLength: 10, autoCapitalize: "characters", style: { textTransform: "uppercase" } } }}
      />
      <TextField
        label="Número del vehículo (opcional)"
        placeholder="Ej: 13033"
        value={form.numero_vehiculo}
        onChange={(e) => cambiar("numero_vehiculo", e.target.value)}
        error={Boolean(errores.numero_vehiculo)}
        helperText={errores.numero_vehiculo}
        slotProps={{ htmlInput: { maxLength: 20, inputMode: "numeric" } }}
      />
      <TextField
        label="Observaciones del vehículo (opcional)"
        placeholder="Ej: vehículo con carga, avería, etc."
        multiline
        minRows={2}
        value={form.obs_vehiculo}
        onChange={(e) => cambiar("obs_vehiculo", e.target.value)}
        slotProps={{ htmlInput: { maxLength: 900 } }}
      />
    </>
  );
}

// ---------- Paso 3: Información del servicio ----------
export function PasoServicio({ form, cambiar, errores, catalogos, fechaMinima, fechaMaxima }) {
  return (
    <>
      <TituloSeccion>Información del servicio</TituloSeccion>
      <TextField
        label="Fecha del servicio *"
        type="date"
        value={form.fecha_servicio}
        onChange={(e) => cambiar("fecha_servicio", e.target.value)}
        error={Boolean(errores.fecha_servicio)}
        helperText={errores.fecha_servicio || "Entre el inicio de tu turno y hoy"}
        slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: fechaMinima, max: fechaMaxima } }}
      />
      <TextField
        label="Hora de solicitud"
        type="datetime-local"
        value={form.hora_solicitud}
        onChange={(e) => cambiar("hora_solicitud", e.target.value)}
        error={Boolean(errores.hora_solicitud)}
        helperText={errores.hora_solicitud || "Cuándo pidieron la grúa"}
        slotProps={{ inputLabel: { shrink: true } }}
      />
      <TextField
        select
        id="tipo-servicio" // el id une la etiqueta con la lista (accesibilidad)
        label="Tipo de servicio *"
        value={form.tipo_servicio_id ?? ""}
        // Si es un rescate lo sabe el servidor por el tipo de servicio: no se pregunta aparte
        onChange={(e) => cambiar("tipo_servicio_id", e.target.value)}
        error={Boolean(errores.tipo_servicio_id)}
        helperText={errores.tipo_servicio_id}
      >
        {catalogos.tipos_servicio.map((t) => (
          <MenuItem key={t.id} value={t.id}>
            {t.nombre}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        label="Ubicación de recogida (origen)"
        placeholder="Ej: Av. Calle 26 # 68-45"
        value={form.origen}
        onChange={(e) => cambiar("origen", e.target.value)}
        slotProps={{ htmlInput: { maxLength: 255 } }}
      />
      <TextField
        label="Destino / taller / patio"
        placeholder="Ej: Patio Prosperidad"
        value={form.destino}
        onChange={(e) => cambiar("destino", e.target.value)}
        slotProps={{ htmlInput: { maxLength: 255 } }}
      />
      <TextField
        label="Hora de inicio del servicio"
        type="datetime-local"
        value={form.inicio_servicio}
        onChange={(e) => cambiar("inicio_servicio", e.target.value)}
        error={Boolean(errores.inicio_servicio)}
        helperText={errores.inicio_servicio || "Cuándo empezaste a atender el vehículo (puedes llenarla al finalizar)"}
        slotProps={{ inputLabel: { shrink: true } }}
      />
      <TextField
        label="Observaciones adicionales (opcional)"
        multiline
        minRows={2}
        value={form.obs_servicio}
        onChange={(e) => cambiar("obs_servicio", e.target.value)}
        slotProps={{ htmlInput: { maxLength: 900 } }}
      />
    </>
  );
}

// ---------- Paso 4: Resumen ----------
export function PasoResumen({ form, catalogos, turno }) {
  const cliente = catalogos.clientes.find((c) => c.id === form.cliente_id);
  const tipo = catalogos.tipos.find((t) => t.id === form.tipo_vehiculo_id);
  const tipoServicio = catalogos.tipos_servicio.find((t) => t.id === form.tipo_servicio_id);
  return (
    <>
      <TituloSeccion>Revisa antes de guardar</TituloSeccion>
      <Card>
        <CardContent sx={{ py: 1 }}>
          <FilaDato icono={<ConfirmationNumberIcon />} etiqueta="Número de orden" valor="Se generará al guardar" />
          <FilaDato icono={<PersonIcon />} etiqueta="Cliente" valor={cliente?.nombre} />
          <FilaDato
            icono={<DirectionsBusIcon />}
            etiqueta="Vehículo"
            valor={`${form.placa_vehiculo} · ${tipo?.es_otro ? form.tipo_vehiculo_otro.trim() : tipo?.nombre || ""}${form.numero_vehiculo ? ` · N.º ${form.numero_vehiculo}` : ""}`}
          />
          <FilaDato icono={<BuildIcon />} etiqueta="Tipo de servicio" valor={tipoServicio?.nombre} />
          <FilaDato icono={<EventIcon />} etiqueta="Fecha del servicio" valor={formatoFecha(form.fecha_servicio)} />
          <FilaDato icono={<EventIcon />} etiqueta="Hora de solicitud" valor={form.hora_solicitud ? formatoFechaHora(form.hora_solicitud) : null} />
          <FilaDato icono={<EventIcon />} etiqueta="Inicio del servicio" valor={form.inicio_servicio ? formatoFechaHora(form.inicio_servicio) : "Se registrará al finalizar"} />
          <FilaDato icono={<PlaceIcon />} etiqueta="Origen" valor={form.origen} />
          <FilaDato icono={<FlagIcon />} etiqueta="Destino" valor={form.destino} />
          <FilaDato icono={<LocalShippingIcon />} etiqueta="Grúa (de tu turno)" valor={`${turno.grua_numero} · ${turno.grua_placa}`} />
          {(form.obs_vehiculo || form.obs_servicio) && (
            <FilaDato icono={<NotesIcon />} etiqueta="Observaciones" valor={[form.obs_vehiculo, form.obs_servicio].filter(Boolean).join(" · ")} />
          )}
        </CardContent>
      </Card>
      <Typography variant="body2" color="text.secondary">
        Después de guardar no podrás modificar estos datos. Si hay un error, el administrador puede corregirlo.
      </Typography>
    </>
  );
}
