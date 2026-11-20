/**
 * Turno activo del operador, compartido por todas las pantallas de /app.
 *
 * Así el inicio, el formulario de servicio y el cierre de turno ven el mismo
 * dato sin pedirlo cada uno. Después de iniciar o finalizar el turno, la
 * pantalla llama a actualizarTurno(nuevo) o recargarTurno().
 */
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { obtenerTurnoActivo } from "../api/turnos.api";
import { mensajeError } from "../utils/formato";

const TurnoContext = createContext(null);

export function TurnoProvider({ children }) {
  const [turno, setTurno] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  // Carga inicial al entrar a la app
  useEffect(() => {
    let vigente = true;
    obtenerTurnoActivo()
      .then((t) => vigente && setTurno(t))
      .catch((err) => vigente && setError(mensajeError(err, "No se pudo consultar el turno")))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, []);

  // Recarga manual (botón "Reintentar")
  const recargarTurno = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      setTurno(await obtenerTurnoActivo());
    } catch (err) {
      setError(mensajeError(err, "No se pudo consultar el turno"));
    } finally {
      setCargando(false);
    }
  }, []);

  return (
    <TurnoContext.Provider value={{ turno, cargando, error, recargarTurno, actualizarTurno: setTurno }}>
      {children}
    </TurnoContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTurno() {
  return useContext(TurnoContext);
}
