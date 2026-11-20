/**
 * Filtros del panel guardados en la URL (?desde=…&cliente_id=…).
 * Así se pueden compartir, usar "atrás" del navegador o recargar sin perderlos.
 *
 *   const { filtros, cambiar, limpiar } = useFiltrosUrl({ desde: "2026-11-01" });
 */
import { useSearchParams } from "react-router-dom";

export const CAMPOS_FILTRO = ["desde", "hasta", "cliente_id", "grua_id", "operador_id", "estado"];

export function useFiltrosUrl(valoresIniciales = {}) {
  const [params, setParams] = useSearchParams();
  const filtros = Object.fromEntries(CAMPOS_FILTRO.map((c) => [c, params.get(c) ?? valoresIniciales[c] ?? ""]));

  function cambiar(campo, valor) {
    const nuevos = new URLSearchParams(params);
    if (valor === "" || valor === null) nuevos.delete(campo);
    else nuevos.set(campo, valor);
    setParams(nuevos, { replace: true });
  }

  function limpiar() {
    setParams(new URLSearchParams(), { replace: true });
  }

  return { filtros, cambiar, limpiar };
}
