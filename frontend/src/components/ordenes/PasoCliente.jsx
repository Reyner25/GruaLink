import {
  MenuItem,
  Stack,
  TextField,
  Typography,
  Paper,
  Box,
} from "@mui/material";
import BusinessIcon from "@mui/icons-material/Business";

export default function PasoCliente({ form, catalogos, errores, onChange }) {
  const clienteSeleccionado = catalogos.clientes.find(
    (c) => String(c.id) === String(form.cliente_id),
  );

  return (
    <Stack spacing={2.5}>
      <Typography sx={{ fontWeight: 600 }} variant="subtitle1">
        Datos del cliente
      </Typography>

      <TextField
        select
        label="Cliente"
        value={form.cliente_id}
        onChange={onChange("cliente_id")}
        error={!!errores.cliente_id}
        helperText={errores.cliente_id || "Busque por nombre comercial"}
        fullWidth
      >
        {catalogos.clientes.map((c) => (
          <MenuItem key={c.id} value={c.id}>
            {c.nombre}
          </MenuItem>
        ))}
      </TextField>

      {clienteSeleccionado && (
        <Paper
          variant="outlined"
          sx={{
            p: 2,
            display: "flex",
            alignItems: "center",
            gap: 2,
            bgcolor: "#EEF4FD",
          }}
        >
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: 2,
              bgcolor: "primary.main",
              display: "grid",
              placeItems: "center",
            }}
          >
            <BusinessIcon sx={{ color: "#fff" }} />
          </Box>
          <Box>
            <Typography variant="caption" color="text.secondary">
              Cliente seleccionado
            </Typography>
            <Typography sx={{ fontWeight: 600 }}>
              {clienteSeleccionado.nombre}
            </Typography>
          </Box>
        </Paper>
      )}

      <TextField
        label="Fecha del servicio"
        type="date"
        value={form.fecha_servicio}
        onChange={onChange("fecha_servicio")}
        error={!!errores.fecha_servicio}
        helperText={errores.fecha_servicio}
        InputLabelProps={{ shrink: true }}
        fullWidth
      />

      <TextField
        select
        label="Grúa asignada"
        value={form.grua_id}
        onChange={onChange("grua_id")}
        error={!!errores.grua_id}
        helperText={errores.grua_id}
        fullWidth
      >
        {catalogos.gruas.map((g) => (
          <MenuItem key={g.id} value={g.id}>
            {g.numero_interno} · {g.placa}
          </MenuItem>
        ))}
      </TextField>
    </Stack>
  );
}
