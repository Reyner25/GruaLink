/**
 * Hook para los botones que guardan algo (diálogos de Guardar, Aprobar…).
 *
 *   const { enviando, error, enviar } = useEnviar();
 *   <Button onClick={() => enviar(async () => { await guardar(); onListo("Listo"); })} disabled={enviando}>
 *
 * - enviando: true mientras la acción está en curso (para deshabilitar botones).
 * - error: mensaje legible si la acción falló (se limpia al volver a enviar).
 */
import { useCallback, useState } from "react";
import { mensajeError } from "../utils/formato";

export function useEnviar() {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  const enviar = useCallback(async (accion) => {
    setEnviando(true);
    setError("");
    try {
      await accion();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }, []);

  return { enviando, error, enviar };
}
