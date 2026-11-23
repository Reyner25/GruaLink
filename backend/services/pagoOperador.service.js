/**
 * PAGO AL OPERADOR de cada servicio (reglas en Tarifas → "Pago a operadores").
 *
 * Reglas vigentes en la fecha del servicio: para cada parte se usa la regla
 * propia del cliente si existe; si no, la de "Cualquier otra empresa". Así se
 * puede cambiar solo una parte para un cliente sin repetir todas las demás.
 *
 *  - Regla "total" (Suma 6 %): % × valor del servicio.
 *  - Si no hay "total", parte por parte:
 *      tarifa básica      → su regla (8 %)
 *      a convenir/rescate → su regla (8 %) sobre el valor aprobado sin adicionales
 *      cada concepto      → porcentaje de su total, fijo una vez por servicio
 *                           (cardán $20.000) o no se paga. Sin regla = no se paga.
 *
 * BASE = valor APROBADO. Antes de aprobar se usa el calculado y el pago es
 * PROVISIONAL. Si se aprobó un valor distinto al calculado (descuento), las
 * partes en porcentaje se ajustan en la misma proporción; los fijos no.
 *
 * Al APROBAR, el pago se guarda en el servicio (valor_operador y su detalle):
 * así un cambio posterior de reglas no altera lo ya aprobado.
 */
const { pool } = require("../config/db");

const pesos = (n) => Math.round(Number(n) || 0);

async function reglasVigentes(clienteId, fecha, { client = pool } = {}) {
  const { rows } = await client.query(
    `SELECT r.id, r.cliente_id, r.componente, r.concepto_id, r.forma, r.valor, ct.nombre AS concepto
     FROM reglas_pago_operador r
     LEFT JOIN conceptos_tarifa ct ON ct.id = r.concepto_id
     WHERE (r.cliente_id = $1 OR r.cliente_id IS NULL)
       AND r.vigente_desde <= $2 AND (r.vigente_hasta IS NULL OR r.vigente_hasta >= $2)`,
    [clienteId, fecha],
  );
  // Primero las del cliente: al buscar una parte, gana la propia sobre la general
  return rows.sort((a, b) => (a.cliente_id === null) - (b.cliente_id === null));
}

const textoRegla = (r) =>
  !r ? "Sin regla (no se paga)" : r.forma === "porcentaje" ? `${Number(r.valor)} %` : r.forma === "fijo_servicio" ? `Fijo $${pesos(r.valor).toLocaleString("es-CO")}` : "No se paga";

/**
 * Calcula el pago del operador. servicio: fila de servicios (con estado,
 * valores, cliente y fecha); conceptos: los del servicio (con total).
 * Devuelve { valor, provisional, detalle: [{ parte, regla_id, regla, base, pago }] }.
 */
async function calcular(servicio, conceptos, opciones) {
  if (servicio.estado === "anulado") return { valor: 0, provisional: false, anulado: true, detalle: [] };
  const aprobado = servicio.estado === "aprobado";
  const reglas = await reglasVigentes(servicio.cliente_id, servicio.fecha_servicio, opciones);
  const regla = (componente, conceptoId = null) => reglas.find((r) => r.componente === componente && (r.concepto_id ?? null) === conceptoId);
  const aplicar = (r, base) => (!r || r.forma === "no_paga" ? 0 : r.forma === "porcentaje" ? (Number(base) * Number(r.valor)) / 100 : Number(r.valor));

  const calculado = servicio.valor_calculado === null ? null : Number(servicio.valor_calculado);
  const totalBase = aprobado ? Number(servicio.valor_aprobado) : calculado;
  const detalle = [];
  const agregar = (parte, r, base, pago) => detalle.push({ parte, regla_id: r?.id ?? null, regla: textoRegla(r), base: base === null ? null : pesos(base), pago: pesos(pago) });

  const total = regla("total");
  if (total) {
    // Ej. Suma: 6 % del valor del servicio (si aún no tiene valor, 0 provisional)
    agregar("Valor del servicio", total, totalBase, totalBase === null ? 0 : aplicar(total, totalBase));
  } else {
    // Descuento/ajuste al aprobar: las partes en % se ajustan en la misma proporción
    const factor = aprobado && calculado ? Number(servicio.valor_aprobado) / calculado : 1;

    if (servicio.valor_tarifa_basica !== null && servicio.valor_tarifa_basica !== undefined) {
      const r = regla("tarifa_basica");
      const base = Number(servicio.valor_tarifa_basica) * factor;
      agregar("Tarifa básica", r, base, aplicar(r, base));
    } else {
      // A convenir (rescate, vehículo "Otro"): lo aprobado menos los adicionales
      const r = regla("valor_a_convenir");
      const base = aprobado ? Math.max(0, Number(servicio.valor_aprobado) - Number(servicio.valor_conceptos || 0)) : null;
      agregar("Valor a convenir (rescate)", r, base, base === null ? 0 : aplicar(r, base));
    }

    for (const c of conceptos) {
      const r = regla("concepto", c.concepto_id);
      if (r?.forma === "fijo_servicio") {
        // "Si hay algún valor": una vez por servicio, sin importar la cantidad
        agregar(c.nombre, r, null, Number(c.cantidad) > 0 ? aplicar(r) : 0);
      } else {
        const base = Number(c.total) * factor;
        agregar(c.nombre, r, base, aplicar(r, base));
      }
    }
  }

  return { valor: detalle.reduce((s, d) => s + d.pago, 0), provisional: !aprobado, detalle };
}

/**
 * Pago de un servicio para mostrar: si está aprobado y ya se guardó, el
 * guardado; si no, calculado ahora (provisional).
 */
async function deServicio(servicio, conceptos, opciones) {
  if (servicio.estado === "aprobado" && servicio.valor_operador !== null && servicio.valor_operador !== undefined) {
    return { valor: Number(servicio.valor_operador), provisional: false, detalle: servicio.pago_operador_detalle || [] };
  }
  return calcular(servicio, conceptos, opciones);
}

// Al aprobar: calcula y guarda el pago definitivo
async function guardarAlAprobar(client, servicioId) {
  const { rows } = await client.query("SELECT * FROM servicios WHERE id = $1", [servicioId]);
  const { rows: conceptos } = await client.query(
    `SELECT sc.concepto_id, ct.nombre, sc.cantidad, sc.total FROM servicio_conceptos sc
     JOIN conceptos_tarifa ct ON ct.id = sc.concepto_id WHERE sc.servicio_id = $1`,
    [servicioId],
  );
  const pago = await calcular(rows[0], conceptos, { client });
  await client.query("UPDATE servicios SET valor_operador = $2, pago_operador_detalle = $3 WHERE id = $1", [
    servicioId,
    pago.valor,
    JSON.stringify(pago.detalle),
  ]);
  return pago;
}

/**
 * LIQUIDACIÓN de operadores en un periodo (por fecha del servicio).
 * Incluye servicios finalizados, en revisión y aprobados (no anulados ni
 * abiertos). Por operador: total aprobado (definitivo) y total pendiente
 * (provisional, aún sin aprobar).
 */
async function liquidacion({ desde, hasta, operadorId, clienteId }) {
  const condiciones = ["s.estado IN ('finalizado', 'en_revision', 'aprobado')"];
  const valores = [];
  const agregar = (sql, v) => {
    if (v === undefined || v === null || v === "") return;
    valores.push(v);
    condiciones.push(sql.replace("?", `$${valores.length}`));
  };
  agregar("s.fecha_servicio >= ?", desde);
  agregar("s.fecha_servicio <= ?", hasta);
  agregar("s.operador_id = ?", operadorId);
  agregar("s.cliente_id = ?", clienteId);

  const { rows: servicios } = await pool.query(
    `SELECT s.*, s.fecha_servicio::text AS fecha_servicio, u.nombre AS operador,
            COALESCE(c.nombre_comercial, c.razon_social) AS cliente, ts.nombre AS tipo_servicio, g.numero_interno AS grua
     FROM servicios s
     JOIN usuarios u ON u.id = s.operador_id
     JOIN clientes c ON c.id = s.cliente_id
     JOIN gruas g ON g.id = s.grua_id
     LEFT JOIN tipos_servicio ts ON ts.id = s.tipo_servicio_id
     WHERE ${condiciones.join(" AND ")}
     ORDER BY u.nombre, s.fecha_servicio, s.id
     LIMIT 5000`,
    valores,
  );
  const ids = servicios.map((s) => s.id);
  const { rows: conceptos } = ids.length
    ? await pool.query(
        `SELECT sc.servicio_id, sc.concepto_id, ct.nombre, sc.cantidad, sc.total FROM servicio_conceptos sc
         JOIN conceptos_tarifa ct ON ct.id = sc.concepto_id WHERE sc.servicio_id = ANY($1::int[])`,
        [ids],
      )
    : { rows: [] };

  const detalle = [];
  const porOperador = new Map();
  for (const s of servicios) {
    const pago = await deServicio(s, conceptos.filter((c) => c.servicio_id === s.id));
    const base = s.estado === "aprobado" ? s.valor_aprobado : s.valor_calculado;
    detalle.push({
      servicio_id: s.id,
      numero_orden: s.numero_orden,
      fecha_servicio: s.fecha_servicio,
      operador_id: s.operador_id,
      operador: s.operador,
      cliente: s.cliente,
      tipo_servicio: s.tipo_servicio,
      grua: s.grua,
      estado: s.estado,
      valor_servicio: base === null ? null : Number(base),
      pago: pago.valor,
      provisional: pago.provisional,
      partes: pago.detalle,
    });
    const op = porOperador.get(s.operador_id) || { operador_id: s.operador_id, operador: s.operador, servicios: 0, aprobados: 0, pago_aprobado: 0, pago_pendiente: 0 };
    op.servicios++;
    if (pago.provisional) op.pago_pendiente += pago.valor;
    else {
      op.aprobados++;
      op.pago_aprobado += pago.valor;
    }
    porOperador.set(s.operador_id, op);
  }
  const operadores = [...porOperador.values()].map((o) => ({ ...o, pago_total: o.pago_aprobado + o.pago_pendiente }));
  return { operadores, servicios: detalle };
}

module.exports = { calcular, deServicio, guardarAlAprobar, reglasVigentes, liquidacion };
