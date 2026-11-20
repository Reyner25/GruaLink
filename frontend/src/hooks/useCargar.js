/**
 * Hook para cargar datos de la API con estado de carga y error.
 *
 *   const { datos, cargando, error, recargar } = useCargar(() => listarServicios(), [filtro]);
 *
 * - "dependencias": cuando cambian, se vuelve a cargar (como en useEffect).
 *   Deben ser valores simples (textos, números).
 * - recargar(): vuelve a pedir los datos (botón "Reintentar").
 * - Si el componente se desmonta o cambian las dependencias antes de que
 *   llegue la respuesta, esa respuesta vieja se ignora.
 *
 * Cómo sabe si está cargando: cada petición tiene una "clave" (dependencias +
 * número de recarga). Está cargando mientras el último resultado guardado no
 * corresponda a la clave actual.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { mensajeError } from "../utils/formato";

export function useCargar(funcion, dependencias = []) {
  const [version, setVersion] = useState(0);
  const [resultado, setResultado] = useState({ clave: null, datos: null, error: "" });
  const clave = JSON.stringify([...dependencias, version]);

  // Siempre usar la función más reciente sin volver a disparar la carga
  const funcionRef = useRef(funcion);
  useEffect(() => {
    funcionRef.current = funcion;
  });

  useEffect(() => {
    let vigente = true;
    funcionRef
      .current()
      .then((datos) => vigente && setResultado({ clave, datos, error: "" }))
      .catch((err) => vigente && setResultado((r) => ({ clave, datos: r.datos, error: mensajeError(err) })));
    return () => {
      vigente = false;
    };
  }, [clave]);

  const recargar = useCallback(() => setVersion((v) => v + 1), []);
  const cargando = resultado.clave !== clave;
  return { datos: resultado.datos, cargando, error: cargando ? "" : resultado.error, recargar };
}
