/**
 * Modelos para ADMINISTRAR tarifas y precios de conceptos.
 * (La búsqueda de la tarifa que aplica a un servicio está en tarifa.model.js)
 *
 * Cada fila trae "usada": TRUE si algún servicio ya se calculó con ella.
 * Las filas usadas no se pueden cambiar ni borrar (solo cerrar su vigencia),
 * para que siempre se sepa con qué precio se cobró cada servicio.
 */
const { pool } = require("../config/db");
const { crearModeloCrud } = require("./crud.model");

const SELECT_TARIFAS = `
  SELECT t.id, t.cliente_id, t.tipo_vehiculo_id, t.tipo_servicio_id,
         t.km_desde, t.km_hasta, t.valor, t.vigente_desde, t.vigente_hasta,
         COALESCE(c.nombre_comercial, c.razon_social, 'Clientes generales') AS cliente_nombre,
         tv.nombre AS tipo_vehiculo, ts.nombre AS tipo_servicio,
         EXISTS (SELECT 1 FROM servicios s WHERE s.tarifa_id = t.id) AS usada,
         (SELECT max(s.fecha_servicio) FROM servicios s WHERE s.tarifa_id = t.id) AS ultima_fecha_uso
  FROM tarifas t
  LEFT JOIN clientes c ON c.id = t.cliente_id
  JOIN tipos_vehiculo tv ON tv.id = t.tipo_vehiculo_id
  JOIN tipos_servicio ts ON ts.id = t.tipo_servicio_id`;

/*
 * Un precio de concepto se considera "usado" si hay un servicio de su
 * concepto, dentro de su vigencia, del mismo cliente (o de cualquier cliente
 * si es precio general) y cobrado con ese mismo valor unitario.
 * (servicio_conceptos guarda el valor cobrado, no el id del precio.)
 */
const USO_PRECIO = `
  FROM servicio_conceptos sc
  JOIN servicios s ON s.id = sc.servicio_id
  WHERE sc.concepto_id = p.concepto_id
    AND sc.valor_unitario = p.valor
    AND s.fecha_servicio >= p.vigente_desde
    AND (p.vigente_hasta IS NULL OR s.fecha_servicio <= p.vigente_hasta)
    AND (p.cliente_id IS NULL OR s.cliente_id = p.cliente_id)`;

const SELECT_PRECIOS = `
  SELECT p.id, p.concepto_id, p.cliente_id, p.valor, p.vigente_desde, p.vigente_hasta,
         to_char(p.recargo_desde, 'HH24:MI') AS recargo_desde, to_char(p.recargo_hasta, 'HH24:MI') AS recargo_hasta,
         ct.nombre AS concepto, ct.unidad_cobro, ct.es_recargo_nocturno,
         COALESCE(c.nombre_comercial, c.razon_social, 'Clientes generales') AS cliente_nombre,
         EXISTS (SELECT 1 ${USO_PRECIO}) AS usada,
         (SELECT max(s.fecha_servicio) ${USO_PRECIO}) AS ultima_fecha_uso
  FROM precios_concepto p
  JOIN conceptos_tarifa ct ON ct.id = p.concepto_id
  LEFT JOIN clientes c ON c.id = p.cliente_id`;

const TarifaAdminModel = crearModeloCrud({
  tabla: "tarifas",
  columnas: ["cliente_id", "tipo_vehiculo_id", "tipo_servicio_id", "km_desde", "km_hasta", "valor", "vigente_desde", "vigente_hasta"],
  select: SELECT_TARIFAS,
  orden: "cliente_id NULLS FIRST, tipo_servicio_id, tipo_vehiculo_id, vigente_desde DESC, km_desde",
});

const PrecioConceptoModel = crearModeloCrud({
  tabla: "precios_concepto",
  // recargo_desde / recargo_hasta: horario del recargo nocturno (solo en ese concepto)
  columnas: ["concepto_id", "cliente_id", "valor", "vigente_desde", "vigente_hasta", "recargo_desde", "recargo_hasta"],
  select: SELECT_PRECIOS,
  orden: "concepto, cliente_id NULLS FIRST, vigente_desde DESC",
});

/*
 * Reglas de pago al operador. Una regla está "usada" si algún servicio
 * aprobado guardó su pago con ella (pago_operador_detalle la nombra).
 */
const USO_REGLA = `FROM servicios s WHERE s.pago_operador_detalle @> jsonb_build_array(jsonb_build_object('regla_id', r.id))`;
const SELECT_REGLAS_PAGO = `
  SELECT r.id, r.cliente_id, r.componente, r.concepto_id, r.forma, r.valor, r.vigente_desde, r.vigente_hasta,
         COALESCE(c.nombre_comercial, c.razon_social, 'Cualquier otra empresa') AS cliente_nombre,
         ct.nombre AS concepto,
         EXISTS (SELECT 1 ${USO_REGLA}) AS usada,
         (SELECT max(s.fecha_servicio) ${USO_REGLA}) AS ultima_fecha_uso
  FROM reglas_pago_operador r
  LEFT JOIN clientes c ON c.id = r.cliente_id
  LEFT JOIN conceptos_tarifa ct ON ct.id = r.concepto_id`;

const ReglaPagoModel = crearModeloCrud({
  tabla: "reglas_pago_operador",
  columnas: ["cliente_id", "componente", "concepto_id", "forma", "valor", "vigente_desde", "vigente_hasta"],
  select: SELECT_REGLAS_PAGO,
  orden: "cliente_id NULLS FIRST, componente, concepto_id, vigente_desde DESC",
});
ReglaPagoModel.selectListado = SELECT_REGLAS_PAGO;
ReglaPagoModel.ordenListado = "cliente_id NULLS FIRST, componente, concepto NULLS FIRST, vigente_desde DESC";

/**
 * Listado con filtros especiales:
 *   cliente_id = "generales" → solo cliente_id NULL
 *   vigente_en = fecha       → vigentes en esa fecha
 */
async function listarConVigencia(modelo, { filtros = {}, clienteId, vigenteEn, limite = 500, pagina = 1 }) {
  const condiciones = [];
  const valores = [];
  for (const [col, valor] of Object.entries(filtros)) {
    if (valor === undefined) continue;
    valores.push(valor);
    condiciones.push(`${col} = $${valores.length}`);
  }
  if (clienteId === "generales") condiciones.push("cliente_id IS NULL");
  else if (clienteId) {
    valores.push(Number(clienteId));
    condiciones.push(`cliente_id = $${valores.length}`);
  }
  if (vigenteEn) {
    valores.push(vigenteEn);
    const n = valores.length;
    condiciones.push(`vigente_desde <= $${n} AND (vigente_hasta IS NULL OR vigente_hasta >= $${n})`);
  }
  const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";
  valores.push(limite, (pagina - 1) * limite);
  const select = modelo.selectListado || (modelo === TarifaAdminModel ? SELECT_TARIFAS : SELECT_PRECIOS);
  const orden =
    modelo.ordenListado ||
    (modelo === TarifaAdminModel
      ? "cliente_id NULLS FIRST, tipo_servicio, tipo_vehiculo, vigente_desde DESC, km_desde"
      : "concepto, cliente_id NULLS FIRST, vigente_desde DESC");
  const { rows } = await pool.query(
    `SELECT * FROM (${select}) AS t ${where}
     ORDER BY ${orden}
     LIMIT $${valores.length - 1} OFFSET $${valores.length}`,
    valores,
  );
  return rows;
}

async function eliminar(client, tabla, id) {
  await client.query(`DELETE FROM ${tabla} WHERE id = $1`, [id]);
}

module.exports = { TarifaAdminModel, PrecioConceptoModel, ReglaPagoModel, listarConVigencia, eliminar };
