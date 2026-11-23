/**
 * Botón de descarga de reportes (Excel o PDF) con los filtros actuales.
 * Muestra "Generando…" mientras el servidor arma el archivo y un aviso si falla.
 *
 *   <BotonExportar reporte="servicios" filtros={filtros} />                 Excel
 *   <BotonExportar reporte="ordenes" filtros={filtros} tipo="pdf" texto="Órdenes en PDF" />
 *   <BotonExportar reporte={`ordenes/${id}`} tipo="pdf" compacto />         solo ícono (en tablas)
 */
import { useState } from "react";
import { Alert, Button, CircularProgress, IconButton, Snackbar, Tooltip } from "@mui/material";
import DownloadIcon from "@mui/icons-material/Download";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import { descargarArchivo } from "../../api/admin.api";

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

export default function BotonExportar({
  reporte,
  filtros,
  tipo = "excel",
  texto = tipo === "pdf" ? "Descargar PDF" : "Exportar a Excel",
  variant = "contained",
  compacto = false,
}) {
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState("");
  const Icono = tipo === "pdf" ? PictureAsPdfIcon : DownloadIcon;

  async function exportar(evento) {
    evento.stopPropagation(); // dentro de una fila clicable, no abrir el detalle
    setGenerando(true);
    setError("");
    try {
      await descargarArchivo(reporte, filtros);
    } catch (err) {
      setError(await mensajeDeBlob(err));
    } finally {
      setGenerando(false);
    }
  }

  return (
    <>
      {compacto ? (
        <Tooltip title={texto}>
          {/* El span permite el Tooltip con el botón desactivado; también frena el
              clic para que no abra el detalle de la fila mientras se genera */}
          <span onClick={(e) => e.stopPropagation()}>
            <IconButton size="small" aria-label={texto} onClick={exportar} disabled={generando}>
              {generando ? <CircularProgress size={18} /> : <Icono fontSize="small" />}
            </IconButton>
          </span>
        </Tooltip>
      ) : (
        <Button variant={variant} startIcon={<Icono />} onClick={exportar} disabled={generando}>
          {generando ? "Generando…" : texto}
        </Button>
      )}
      <Snackbar open={Boolean(error)} autoHideDuration={6000} onClose={() => setError("")} anchorOrigin={{ vertical: "top", horizontal: "center" }}>
        <Alert severity="error" variant="filled" onClose={() => setError("")}>
          {error}
        </Alert>
      </Snackbar>
    </>
  );
}
