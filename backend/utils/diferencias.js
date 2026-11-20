/**
 * Compara un registro antes y después de un cambio y devuelve SOLO los campos
 * que cambiaron. Se usa para la bitácora: así queda claro qué se modificó.
 *
 *   diferencias({ a: 1, b: 2 }, { a: 1, b: 3 })
 *   → { anteriores: { b: 2 }, nuevos: { b: 3 }, cambio: true }
 */
function normalizar(valor) {
  if (valor instanceof Date) return valor.toISOString();
  if (valor === undefined) return null;
  return valor;
}

function diferencias(antes, despues, { ignorar = [] } = {}) {
  const anteriores = {};
  const nuevos = {};
  const campos = new Set([...Object.keys(antes || {}), ...Object.keys(despues || {})]);
  for (const campo of campos) {
    if (ignorar.includes(campo)) continue;
    const a = normalizar(antes?.[campo]);
    const d = normalizar(despues?.[campo]);
    if (JSON.stringify(a) !== JSON.stringify(d)) {
      anteriores[campo] = a;
      nuevos[campo] = d;
    }
  }
  return { anteriores, nuevos, cambio: Object.keys(nuevos).length > 0 };
}

module.exports = { diferencias };
