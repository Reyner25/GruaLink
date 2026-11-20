import { Box, Divider, Paper, Stack, Typography } from "@mui/material";

function Fila({ etiqueta, valor }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        {etiqueta}
      </Typography>
      <Typography>{valor || "—"}</Typography>
    </Box>
  );
}

export default function PasoResumen({ form, catalogos }) {
  const cliente = catalogos.clientes.find(
    (c) => String(c.id) === String(form.cliente_id),
  )?.nombre;
  const grua = catalogos.gruas.find(
    (g) => String(g.id) === String(form.grua_id),
  );
  const tipo = catalogos.tipos.find(
    (t) => String(t.id) === String(form.tipo_vehiculo_id),
  )?.nombre;

  return (
    <Stack spacing={2.5}>
      <Typography sx={{ fontWeight: 600 }} variant="subtitle1">
        Resumen del servicio
      </Typography>

      <Paper variant="outlined" sx={{ p: 2, bgcolor: "#EEF4FD" }}>
        <Typography variant="caption" color="text.secondary">
          Número de orden
        </Typography>
        <Typography fontStyle="italic" color="text.secondary">
          Se generará al guardar
        </Typography>
      </Paper>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={2} divider={<Divider flexItem />}>
          <Fila etiqueta="Cliente" valor={cliente} />
          <Fila
            etiqueta="Grúa"
            valor={grua ? `${grua.numero_interno} · ${grua.placa}` : ""}
          />
          <Fila etiqueta="Fecha del servicio" valor={form.fecha_servicio} />
          <Fila etiqueta="Tipo de vehículo" valor={tipo} />
          <Fila etiqueta="Placa" valor={form.placa_vehiculo?.toUpperCase()} />
          <Fila etiqueta="Número de vehículo" valor={form.numero_vehiculo} />
          <Fila etiqueta="Origen" valor={form.origen} />
          <Fila etiqueta="Destino" valor={form.destino} />
          <Fila etiqueta="Km en vacío" valor={form.km_vacio || "0"} />
          <Fila etiqueta="Km del servicio" valor={form.km_servicio} />
          <Fila etiqueta="Observaciones" valor={form.observaciones} />
        </Stack>
      </Paper>
    </Stack>
  );
}
