/**
 * Botones de acción del administrador sobre un servicio, con sus diálogos.
 * Qué botones salen depende del estado y de los permisos del usuario:
 *   abierto ............ Corregir datos · Anular
 *   finalizado ......... Pasar a revisión · Corregir · Aprobar · Anular
 *   en revisión ........ Corregir · Aprobar · Devolver a finalizado · Anular
 *   aprobado ........... Reabrir (vuelve a revisión) · Anular — ambos con motivo
 *   anulado ............ (sin acciones: queda cerrado)
 * En todos los estados: descargar la orden en PDF.
 *
 *   onListo(mensaje): una acción terminó bien (el padre recarga)
 *   onError(mensaje): "Pasar a revisión" falló (no tiene diálogo propio)
 */
import { useState } from "react";
import { Button } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import VerifiedIcon from "@mui/icons-material/Verified";
import BlockIcon from "@mui/icons-material/Block";
import RateReviewIcon from "@mui/icons-material/RateReview";
import UndoIcon from "@mui/icons-material/Undo";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import { useAuth } from "../../../context/AuthContext";
import { cambiarEstadoServicio } from "../../../api/admin.api";
import { puede } from "../../../utils/roles";
import { formatoMoneda, mensajeError } from "../../../utils/formato";
import BotonExportar from "../BotonExportar";
import DialogoCorregir from "./DialogoCorregir";
import DialogoAprobar from "./DialogoAprobar";
import DialogoMotivo from "./DialogoMotivo";

export default function AccionesServicio({ servicio: s, conceptos, catalogos, onListo, onError }) {
  const { usuario } = useAuth();
  const [dialogo, setDialogo] = useState(null); // "corregir" | "aprobar" | "anular" | "devolver" | "reabrir"

  const revisable = ["finalizado", "en_revision"].includes(s.estado);
  const aprobado = s.estado === "aprobado";
  const cerradoDefinitivo = aprobado || s.estado === "anulado";
  const puedeCambiarEstado = puede(usuario, "servicios:cambiar_estado");

  function terminar(mensaje) {
    setDialogo(null);
    onListo(mensaje);
  }

  async function pasarARevision() {
    onError("");
    try {
      await cambiarEstadoServicio(s.id, "en_revision");
      terminar("El servicio pasó a revisión");
    } catch (err) {
      onError(mensajeError(err));
    }
  }

  const cerrar = () => setDialogo(null);
  const comunes = { abierto: true, onCerrar: cerrar, onListo: terminar, servicio: s };
  const botonAnular = (
    <Button color="error" startIcon={<BlockIcon />} onClick={() => setDialogo("anular")}>
      Anular
    </Button>
  );

  return (
    <>
      {/* El PDF de la orden se puede descargar siempre (también aprobados y anulados) */}
      <BotonExportar reporte={`ordenes/${s.id}`} tipo="pdf" texto="Orden en PDF" variant="outlined" />

      {!cerradoDefinitivo && (
        <>
          {s.estado === "finalizado" && puedeCambiarEstado && (
            <Button startIcon={<RateReviewIcon />} onClick={pasarARevision}>
              Pasar a revisión
            </Button>
          )}
          {s.estado === "en_revision" && puedeCambiarEstado && (
            <Button startIcon={<UndoIcon />} onClick={() => setDialogo("devolver")}>
              Devolver
            </Button>
          )}
          {puede(usuario, "servicios:corregir") && (
            <Button variant="outlined" startIcon={<EditIcon />} onClick={() => setDialogo("corregir")} disabled={!catalogos}>
              Corregir
            </Button>
          )}
          {revisable && puede(usuario, "servicios:aprobar") && (
            <Button variant="contained" color="success" startIcon={<VerifiedIcon />} onClick={() => setDialogo("aprobar")}>
              Aprobar
            </Button>
          )}
          {puedeCambiarEstado && botonAnular}
        </>
      )}

      {/* Aprobado: solo el administrador puede reabrirlo o anularlo (con motivo) */}
      {aprobado && puedeCambiarEstado && (
        <>
          <Button startIcon={<LockOpenIcon />} onClick={() => setDialogo("reabrir")}>
            Reabrir
          </Button>
          {botonAnular}
        </>
      )}

      {dialogo === "corregir" && catalogos && <DialogoCorregir {...comunes} conceptosActuales={conceptos} catalogos={catalogos} />}
      {dialogo === "aprobar" && <DialogoAprobar {...comunes} />}
      {dialogo === "anular" && (
        <DialogoMotivo
          {...comunes}
          estado="anulado"
          titulo="Anular"
          textoBoton="Anular servicio"
          color="error"
          explicacion={
            aprobado
              ? `Este servicio ya está APROBADO por ${formatoMoneda(s.valor_aprobado)}. Al anularlo deja de sumar en los reportes. No se puede deshacer.`
              : "El servicio deja de sumar en los reportes. No se puede deshacer."
          }
        />
      )}
      {dialogo === "reabrir" && (
        <DialogoMotivo
          {...comunes}
          estado="en_revision"
          titulo="Reabrir"
          textoBoton="Reabrir servicio"
          color="warning"
          explicacion={`El servicio vuelve a "En revisión" y se quita la aprobación (${formatoMoneda(s.valor_aprobado)}). Luego podrá corregirlo y aprobarlo de nuevo. La aprobación anterior queda en la bitácora.`}
        />
      )}
      {dialogo === "devolver" && <DialogoMotivo {...comunes} estado="finalizado" titulo="Devolver a finalizado" textoBoton="Devolver" obligatorio={false} />}
    </>
  );
}
