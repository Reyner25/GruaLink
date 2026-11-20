import { MenuItem, Stack, TextField, Typography } from "@mui/material";

export default function PasoVehiculo({ form, catalogos, errores, onChange }) {
  return (
    <Stack spacing={2.5}>
      <Typography sx={{ fontWeight: 600 }} variant="subtitle1">
        Datos del vehículo
      </Typography>

      <TextField
        select
        label="Tipo de vehículo"
        value={form.tipo_vehiculo_id}
        onChange={onChange("tipo_vehiculo_id")}
        error={!!errores.tipo_vehiculo_id}
        helperText={errores.tipo_vehiculo_id}
        fullWidth
      >
        {catalogos.tipos.map((t) => (
          <MenuItem key={t.id} value={t.id}>
            {t.nombre}
          </MenuItem>
        ))}
      </TextField>

      <TextField
        label="Placa del vehículo"
        value={form.placa_vehiculo}
        onChange={onChange("placa_vehiculo")}
        error={!!errores.placa_vehiculo}
        helperText={errores.placa_vehiculo}
        inputProps={{ style: { textTransform: "uppercase" } }}
        fullWidth
      />

      <TextField
        label="Número del vehículo (opcional)"
        value={form.numero_vehiculo}
        onChange={onChange("numero_vehiculo")}
        fullWidth
      />

      <TextField
        label="Origen"
        value={form.origen}
        onChange={onChange("origen")}
        helperText="Dirección de recogida"
        fullWidth
      />

      <TextField
        label="Destino"
        value={form.destino}
        onChange={onChange("destino")}
        helperText="Dirección de destino o taller"
        fullWidth
      />

      <Stack direction="row" spacing={2}>
        <TextField
          label="Km en vacío"
          type="number"
          value={form.km_vacio}
          onChange={onChange("km_vacio")}
          error={!!errores.km_vacio}
          helperText={errores.km_vacio}
          inputProps={{ inputMode: "decimal", min: 0, step: "0.1" }}
          fullWidth
        />
        <TextField
          label="Km del servicio"
          type="number"
          value={form.km_servicio}
          onChange={onChange("km_servicio")}
          error={!!errores.km_servicio}
          helperText={errores.km_servicio}
          inputProps={{ inputMode: "decimal", min: 0, step: "0.1" }}
          fullWidth
        />
      </Stack>

      <TextField
        label="Observaciones (opcional)"
        multiline
        minRows={3}
        value={form.observaciones}
        onChange={onChange("observaciones")}
        fullWidth
      />
    </Stack>
  );
}
