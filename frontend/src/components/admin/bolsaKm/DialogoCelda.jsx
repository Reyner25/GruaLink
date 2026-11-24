/**
 * Cambiar una celda de la tabla de bolsa de km: forma de cobro y valor.
 * (Solo celdas que todavía no han cobrado servicios.)
 */
import { useState } from "react";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { actualizarCeldaBolsa } from "../../../api/admin.api";
import { useEnviar } from "../../../hooks/useEnviar";
import { formatoMoneda } from "../../../utils/formato";
import { textoColumna, textoFila } from "./textosBolsa";

export default function DialogoCelda({ celda, columna, fila, onCerrar, onListo }) {
  const [forma, setForma] = useState(celda.forma);
  const [valor, setValor] = useState(celda.valor === null ? "" : String(Math.round(celda.valor)));
  const [motivo, setMotivo] = useState("");
  const { enviando, error, enviar } = useEnviar();
  const numero = Number(String(valor).replace(/\./g, "").replace(",", "."));
  const valido = forma === "a_convenir" || (valor !== "" && !Number.isNaN(numero) && numero >= 0);

  const guardar = () =>
    enviar(async () => {
      await actualizarCeldaBolsa(celda.id, { forma, valor: forma === "a_convenir" ? null : numero, motivo: motivo.trim() || undefined });
      onListo("Celda actualizada");
    });

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
