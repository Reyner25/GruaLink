/**
 * Pruebas de la BOLSA DE KILÓMETROS mensual (Suma): cálculo por columna (km
 * del mes) y fila (km del servicio), mes abierto con columna provisional,
 * cierre de mes, recálculos, y la administración de la tabla en Tarifas.
 * Preparación común: ayudas/contexto.js (el operador 1 queda en turno).
 */
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const ctx = require("./ayudas/contexto");

const { api, tokens, ids, pool } = ctx;

before(() => ctx.preparar({ turnoOperador1: true }));
after(() => ctx.terminar());

test("Suma: bolsa de km mensual (columna por km del mes, fila por km del servicio)", async () => {
  const suma = ids.suma;
  const nuevo = async (finalizar) => ctx.servicioFinalizado({ servicio: { cliente_id: suma }, finalizar });
  const corregir = async (id, body) => {
    const r = await api("POST", `/api/servicios/${id}/corregir`, { token: tokens.admin, body: { motivo: "Km reales del GPS", ...body } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.datos));
  };
  const ver = ctx.verAdmin;
  const valor = async (id) => (await ver(id)).servicio.valor_calculado;
  const mesAnterior = ids.mesAnterior;

  // ---- MES ABIERTO: columna provisional 1500–1800 ----
  // S1: 18 km en servicio + 2 en vacío = 20 km (fila 15,01–20)
  const s1 = await nuevo();
  await corregir(s1, { km_servicio: 18, km_vacio: 2 });
  let d = await ver(s1);
  assert.strictEqual(d.servicio.valor_calculado, 434322); // columna provisional 1500–1800
  assert.strictEqual(d.servicio.bolsa_km_mes, null); // null = provisional
  assert.strictEqual(d.servicio.km_facturables, 20); // servicio + vacío

  // S3: 8 km (< 10 km → según distancia: 8 × $25.774 provisional); el cardán se registra sin cobro
  const s3 = await nuevo({ conceptos: [{ concepto_id: ids.cardan, cantidad: 1 }] });
  await corregir(s3, { km_servicio: 8 });
  d = await ver(s3);
  assert.strictEqual(d.servicio.valor_calculado, 206192);
  assert.strictEqual(d.servicio.valor_conceptos, 0);
  assert.strictEqual(d.conceptos[0].total, 0);

  // ---- FIN DE MES: el mantenimiento recalcula con la columna real (bolsa 28 km → 600–900) ----
  await pool.query("UPDATE servicios SET fecha_servicio = $1 WHERE id = ANY($2::int[])", [mesAnterior, [s1, s3]]);
  const { cerrarMesesPendientes } = require("../services/bolsaKm.service");
  assert.strictEqual(await cerrarMesesPendientes(), 2);
  d = await ver(s1);
  assert.strictEqual(d.servicio.valor_calculado, 510656);
  assert.strictEqual(d.servicio.bolsa_km_mes, 28);
  assert.strictEqual(await valor(s3), 412384); // 8 × 51.548
  assert.strictEqual(await cerrarMesesPendientes(), 0); // ya no queda nada provisional

  // ---- MES CERRADO: cada cambio recalcula el mes con la columna real ----
  // S2: 1.000 km (> 95 km → a convenir); la bolsa sube a 1.028 → columna 900–1200 y S1 y S3 se recalculan
  const s2 = await nuevo();
  await corregir(s2, { fecha_servicio: mesAnterior, km_servicio: 1000 });
  assert.strictEqual(await valor(s2), null);
  assert.strictEqual(await valor(s1), 471173);
  assert.strictEqual(await valor(s3), 274920); // 8 × 34.365

  // S4 fuera de la disponibilidad: tarifa general (articulado 393.000) + cardán general (92.400); sus km NO suman a la bolsa
  const s4 = await nuevo({ conceptos: [{ concepto_id: ids.cardan, cantidad: 1 }] });
  await corregir(s4, { fecha_servicio: mesAnterior, km_servicio: 900, fuera_disponibilidad: true });
  d = await ver(s4);
  assert.strictEqual(d.servicio.valor_calculado, 485400);
  assert.strictEqual(d.servicio.tarifa_bolsa_id, null);
  assert.strictEqual(await valor(s1), 471173); // la bolsa sigue en 1.028 km

  // Anular S2: la bolsa baja a 28 km → columna 600–900 otra vez
  await api("PATCH", `/api/servicios/${s2}/estado`, { token: tokens.admin, body: { estado: "anulado", motivo: "Duplicado" } });
  assert.strictEqual(await valor(s1), 510656);
  assert.strictEqual(await valor(s3), 412384); // 8 × 51.548

  // Un aprobado conserva su valor aunque la bolsa cambie
  await api("POST", `/api/servicios/${s1}/aprobar`, { token: tokens.admin, body: {} });
  await corregir(s4, { fuera_disponibilidad: false }); // S4 entra a la bolsa: 928 km → columna 900–1200
  assert.strictEqual((await ver(s1)).servicio.valor_aprobado, 510656);
  // Pago al operador en Suma: 6 % del valor aprobado (510.656 → 30.639)
  assert.strictEqual((await ver(s1)).pago_operador.valor, 30639);
  assert.strictEqual(await valor(s3), 274920);

  // Resumen de la bolsa del mes cerrado y del mes abierto
  const abierto = await api("GET", `/api/bolsa-km?cliente_id=${suma}&mes=${ids.hoy.slice(0, 7)}`, { token: tokens.admin });
  assert.strictEqual(abierto.datos.provisional, true);
  const r = await api("GET", `/api/bolsa-km?cliente_id=${suma}&mes=${mesAnterior.slice(0, 7)}`, { token: tokens.admin });
  assert.strictEqual(r.status, 200, JSON.stringify(r.datos));
  assert.strictEqual(r.datos.provisional, false);
  assert.strictEqual(r.datos.km_mes, 928);
  assert.deepStrictEqual(r.datos.columna, { desde: 900.01, hasta: 1200 });
  assert.strictEqual(r.datos.siguiente.faltan_km, 272.01);
  assert.strictEqual(r.datos.servicios.length, 4);
  // Clientes por bolsa (para el selector de la pantalla)
  const clientes = (await api("GET", "/api/bolsa-km/clientes", { token: tokens.fin })).datos.clientes;
  assert.ok(clientes.some((c) => c.id === suma));

  // Cada recálculo automático quedó en la bitácora
  const { rows } = await pool.query(
    "SELECT count(*)::int AS n FROM bitacora WHERE entidad = 'servicios' AND registro_id = $1 AND motivo LIKE 'Recálculo automático%'",
    [s3],
  );
  assert.ok(rows[0].n >= 2);
});

test("Tarifas → Bolsa de km: ver la tabla, corregir celdas, nueva vigencia y columna provisional", async () => {
  const suma = ids.suma;
  const ver = async (extra = "") => (await api("GET", `/api/bolsa-km/tabla?cliente_id=${suma}${extra}`, { token: tokens.fin })).datos;

  // La tabla como en el Excel: 6 columnas × 19 filas (el financiero puede verla)
  let t = await ver();
  assert.strictEqual(t.columnas.length, 6);
  assert.strictEqual(t.filas.length, 19);
  assert.strictEqual(t.celdas.length, 114);
  assert.strictEqual(t.vigencia.vigente_desde, "2026-01-01");

  // Una celda que ya cobró servicios no se modifica
  const usada = t.celdas.find((c) => c.usada);
  assert.ok(usada, "la prueba de Suma dejó celdas usadas");
  const r1 = await api("PATCH", `/api/bolsa-km/celdas/${usada.id}`, { token: tokens.admin, body: { forma: "fijo", valor: 1, motivo: "Intento" } });
  assert.strictEqual(r1.datos.codigo, "CELDA_EN_USO");
  // El financiero no edita
  assert.strictEqual((await api("PATCH", `/api/bolsa-km/celdas/${usada.id}`, { token: tokens.fin, body: { forma: "fijo", valor: 1 } })).status, 403);

  // Una celda sin uso sí: 2100–2400 km del mes, 90,01–95 km del servicio
  const libre = t.celdas.find((c) => !c.usada && c.bolsa_km_hasta === null && Number(c.km_desde) === 90.01);
  const r2 = await api("PATCH", `/api/bolsa-km/celdas/${libre.id}`, { token: tokens.admin, body: { forma: "fijo", valor: 1300000, motivo: "Corrección del valor" } });
  assert.strictEqual(r2.status, 200, JSON.stringify(r2.datos));
  assert.strictEqual(r2.datos.celda.valor, 1300000);
  const r3 = await api("PATCH", `/api/bolsa-km/celdas/${libre.id}`, { token: tokens.admin, body: { forma: "a_convenir", valor: 5 } });
  assert.strictEqual(r3.datos.codigo, "VALOR_SOBRA");
  await api("PATCH", `/api/bolsa-km/celdas/${libre.id}`, { token: tokens.admin, body: { forma: "fijo", valor: 1229261, motivo: "Valor original" } });

  // Nueva vigencia: no puede empezar antes del último servicio cobrado con la tabla actual
  const mesAnterior = ids.mesAnterior;
  const r4 = await api("POST", "/api/bolsa-km/versiones", {
    token: tokens.admin,
    body: { cliente_id: suma, copiar_de: "2026-01-01", vigente_desde: mesAnterior, motivo: "Tabla nueva" },
  });
  assert.strictEqual(r4.datos.codigo, "CIERRE_ANTES_DE_USO");
  const manana = await ctx.fecha("current_date + 1");
  const r5 = await api("POST", "/api/bolsa-km/versiones", {
    token: tokens.admin,
    body: { cliente_id: suma, copiar_de: "2026-01-01", vigente_desde: manana, motivo: "Tabla nueva" },
  });
  assert.strictEqual(r5.status, 201, JSON.stringify(r5.datos));
  assert.strictEqual(r5.datos.celdas, 114);
  t = await ver(`&vigente_desde=${manana}`);
  assert.strictEqual(t.versiones.length, 2);
  assert.ok(t.celdas.every((c) => !c.usada)); // la copia aún no se ha usado

  // ---- Editar la vigencia ----
  const editar = (body) => api("PATCH", "/api/bolsa-km/versiones", { token: tokens.admin, body: { cliente_id: suma, motivo: "Ajuste de vigencia", ...body } });
  const borrar = (desde) => api("DELETE", "/api/bolsa-km/versiones", { token: tokens.admin, body: { cliente_id: suma, vigente_desde: desde, motivo: "Creada por error" } });
  const pasado = { d: await ctx.fecha("current_date + 2"), f: await ctx.fecha("current_date + 40") };
  try {
    // Sin uso: se cambian inicio y fin
    let e = await editar({ vigente_desde: manana, nuevo_desde: pasado.d, nuevo_hasta: pasado.f });
    assert.strictEqual(e.status, 200, JSON.stringify(e.datos));
    assert.deepStrictEqual(e.datos, { vigente_desde: pasado.d, vigente_hasta: pasado.f });
    e = await editar({ vigente_desde: pasado.d, nuevo_hasta: null }); // sin fin
    assert.strictEqual(e.datos.vigente_hasta, null);
    // En uso: el inicio no se cambia y el fin no puede quedar antes del último servicio cobrado
    assert.strictEqual((await editar({ vigente_desde: "2026-01-01", nuevo_desde: "2026-02-01" })).datos.codigo, "VIGENCIA_EN_USO");
    const antesDeUso = (await pool.query("SELECT ($1::date - 1)::text AS d", [mesAnterior])).rows[0].d;
    assert.strictEqual((await editar({ vigente_desde: "2026-01-01", nuevo_hasta: antesDeUso })).datos.codigo, "CIERRE_ANTES_DE_USO");
    // No puede cruzarse con otra vigencia
    assert.strictEqual((await editar({ vigente_desde: "2026-01-01", nuevo_hasta: "2026-12-31" })).status, 409);
    // Borrar: la que está en uso no; la copia sin uso sí
    assert.strictEqual((await borrar("2026-01-01")).datos.codigo, "VIGENCIA_EN_USO");
    assert.strictEqual((await borrar(pasado.d)).status, 204);
    // Ya sin la copia, la original vuelve a su fin (31/12/2026)
    e = await editar({ vigente_desde: "2026-01-01", nuevo_hasta: "2026-12-31" });
    assert.strictEqual(e.status, 200, JSON.stringify(e.datos));
    assert.strictEqual((await ver()).versiones.length, 1);
  } finally {
    // Deja la base como estaba aunque algo falle (la prueba se repite otros días)
    await pool.query("DELETE FROM tarifas_bolsa_km WHERE cliente_id = $1 AND vigente_desde <> '2026-01-01'", [suma]);
    await pool.query("UPDATE tarifas_bolsa_km SET vigente_hasta = '2026-12-31' WHERE cliente_id = $1 AND vigente_desde = '2026-01-01'", [suma]);
  }

  // Columna provisional: 2000 km → columna 1800–2100; un servicio de 20 km del mes en curso vale 427.741
  const r6 = await api("PATCH", "/api/bolsa-km/provisional", { token: tokens.admin, body: { cliente_id: suma, bolsa_km_provisional: 2000 } });
  assert.strictEqual(r6.status, 200, JSON.stringify(r6.datos));
  try {
    const id = await ctx.servicioFinalizado({ servicio: { cliente_id: suma }, corregir: { km_servicio: 20 } });
    assert.strictEqual((await ctx.verAdmin(id)).servicio.valor_calculado, 427741);
    const resumen = (await api("GET", `/api/bolsa-km?cliente_id=${suma}&mes=${ids.hoy.slice(0, 7)}`, { token: tokens.admin })).datos;
    assert.strictEqual(resumen.columna_provisional, "1800–2100");
    // Volver a 1800: el mes en curso se recalcula solo (20 km en 1500–1800 = 434.322)
    const r7 = await api("PATCH", "/api/bolsa-km/provisional", { token: tokens.admin, body: { cliente_id: suma, bolsa_km_provisional: 1800 } });
    assert.ok(r7.datos.recalculados >= 1);
    assert.strictEqual((await ctx.verAdmin(id)).servicio.valor_calculado, 434322);
  } finally {
    await pool.query("UPDATE clientes SET bolsa_km_provisional = 1800 WHERE id = $1", [suma]);
  }
});
