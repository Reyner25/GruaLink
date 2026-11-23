/**
 * Botón "Exportar a Excel": descarga el reporte con los filtros actuales.
 * Muestra "Generando…" mientras el servidor arma el archivo y un aviso si falla.
 */
import { useState } from "react";
import { Alert, Button, Snackbar } from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import { descargarExcel } from "../../api/admin.api";

// Con responseType "blob", el error del servidor también llega como blob:
// se lee como texto para mostrar el mensaje real.
async function mensajeDeBlob(err) {
  try {
    const texto = await err.response?.data?.text?.();
    return JSON.parse(texto).error;
  } catch {
    return err.response ? "No se pudo generar el archivo" : "Sin conexión con el servidor";
  }
}

export default function BotonExportar({ reporte, filtros, texto = "Exportar a Excel", variant = "contained" }) {
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState("");

  async function exportar() {
    setGenerando(true);
    setError("");
    try {
      await descargarExcel(reporte, filtros);
    } catch (err) {
      setError(await mensajeDeBlob(err));
    } finally {
      setGenerando(false);
    }
  }

  return (
    <>
      <Button variant={variant} startIcon={<DownloadIcon />} onClick={exportar} disabled={generando}>
        {generando ? "Generando…" : texto}
      </Button>
      <Snackbar open={Boolean(error)} autoHideDuration={6000} onClose={() => setError("")} anchorOrigin={{ vertical: "top", horizontal: "center" }}>
        <Alert severity="error" variant="filled" onClose={() => setError("")}>
          {error}
        </Alert>
      </Snackbar>
    </>
  );
}
