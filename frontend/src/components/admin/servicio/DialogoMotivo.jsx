/**
 * Cambio de estado con motivo: anular, reabrir un aprobado o devolver a "finalizado".
 *   estado: el estado nuevo · obligatorio: si el motivo es obligatorio (mínimo 5 caracteres)
 *   explicacion: aviso que se muestra arriba (qué pasa al confirmar)
 */
import { useState } from "react";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField } from "@mui/material";
import { cambiarEstadoServicio } from "../../../api/admin.api";
import { useEnviar } from "../../../hooks/useEnviar";

export default function DialogoMotivo({ abierto, onCerrar, onListo, servicio, estado, titulo, textoBoton, color = "primary", obligatorio = true, explicacion }) {
  const [motivo, setMotivo] = useState("");
  const { enviando, error, enviar } = useEnviar();
  const ok = !obligatorio || motivo.trim().length >= 5;

  const confirmar = () =>
    enviar(async () => {
      await cambiarEstadoServicio(servicio.id, estado, motivo.trim());
      onListo(`${titulo}: hecho`);
    });

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
