/**
 * Aprobar un servicio: valor aprobado (por defecto el calculado).
 * Si el valor es distinto del calculado, el motivo es obligatorio.
 */
import { useState } from "react";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment, Stack, TextField, Typography } from "@mui/material";
import { aprobarServicio } from "../../../api/admin.api";
import { useEnviar } from "../../../hooks/useEnviar";
import { formatoMoneda, sinKilometros } from "../../../utils/formato";
import { aPesos } from "./formularioCorreccion";

export default function DialogoAprobar({ abierto, onCerrar, onListo, servicio }) {
  const calculado = servicio.valor_calculado;
  // Se escribe con coma decimal (los puntos se toman como separador de miles)
  const [valor, setValor] = useState(calculado === null ? "" : String(calculado).replace(".", ","));
  const [motivo, setMotivo] = useState("");
  const { enviando, error, enviar } = useEnviar();

  const numero = aPesos(valor);
  const valido = valor !== "" && !Number.isNaN(numero) && numero >= 0;
  const distinto = calculado !== null && valido && numero !== calculado;
  const motivoOk = !distinto || motivo.trim().length >= 5;
  const sinKm = sinKilometros(servicio);

  const aprobar = () =>
    enviar(async () => {
      await aprobarServicio(servicio.id, { valor_aprobado: numero, motivo: motivo.trim() });
      onListo(`Orden #${servicio.numero_orden} aprobada por ${formatoMoneda(numero)}`);
    });

  return (
    <Dialog open={abierto} onClose={() => !enviando && onCerrar()} maxWidth="xs" fullWidth>
      <DialogTitle>Aprobar orden #{servicio.numero_orden}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography>
            Valor calculado: <b>{calculado === null ? "A convenir (sin tarifa)" : formatoMoneda(calculado)}</b>
          </Typography>
          {sinKm && <Alert severity="warning">Este servicio no tiene kilómetros registrados. Si el cliente cobra por distancia, corríjalos antes de aprobar.</Alert>}
          {servicio.tarifa_bolsa_id && servicio.bolsa_km_mes === null && (
            <Alert severity="warning">
              Bolsa de kilómetros: el mes aún no termina y el valor es PROVISIONAL (columna provisional de la bolsa). Si se aprueba ahora, queda fijo y no se ajusta con la
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
