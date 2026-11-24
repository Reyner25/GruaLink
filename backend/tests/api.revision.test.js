/**
 * Pruebas de la REVISIÓN del administrador: corregir (km, horas, empresa,
 * tarifa manual), recargo nocturno automático, precios propios de cada
 * cliente, aprobar y pago al operador.
 * Preparación común: ayudas/contexto.js (el operador 1 queda en turno).
 */
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const ExcelJS = require("exceljs");
const ctx = require("./ayudas/contexto");

const { api, tokens, ids, pool } = ctx;

before(() => ctx.preparar({ turnoOperador1: true }));
after(() => ctx.terminar());

test("La Rolita: al finalizar usa 0 km; el administrador carga 17,5 km y se recalcula (rango 15–19,99)", async () => {
  const id = await ctx.servicioFinalizado({ servicio: { cliente_id: ids.laRolita, tipo_vehiculo_id: ids.buseton } });
  assert.strictEqual((await ctx.verAdmin(id)).servicio.valor_tarifa_basica, 480000); // rango "menos de 15 km"

  const corr = await api("POST", `/api/servicios/${id}/corregir`, { token: tokens.admin, body: { km_vacio: 3.2, km_servicio: 17.5, motivo: "Km del reporte GPS" } });
  assert.strictEqual(corr.status, 200, JSON.stringify(corr.datos));
  assert.strictEqual((await ctx.verAdmin(id)).servicio.valor_tarifa_basica, 548000);
});

test("recargo nocturno: límites de la hora de corte (20:40 general, hasta las 6:00)", () => {
  const { esNocturno } = require("../services/tarifa.service");
  const a = (hora) => `${ids.ayer}T${hora}:00-05:00`; // hora de Colombia
  assert.strictEqual(esNocturno(a("20:40")), false); // estrictamente después de 20:40
  assert.strictEqual(esNocturno(a("20:41")), true);
  assert.strictEqual(esNocturno(a("23:59")), true);
  assert.strictEqual(esNocturno(a("00:30")), true);
  assert.strictEqual(esNocturno(a("05:59")), true);
  assert.strictEqual(esNocturno(a("06:00")), false);
  assert.strictEqual(esNocturno(a("12:00")), false);
  assert.strictEqual(esNocturno(a("19:30"), "19:00"), true); // La Rolita
  assert.strictEqual(esNocturno(a("19:00"), "19:00"), false);
  assert.strictEqual(esNocturno(null), false);
});

test("recargo nocturno: se aplica solo según la hora de fin y la hora de corte de cada cliente", async () => {
  await ctx.recargoNocturnoActivo(true);
  try {
    const a = (hora) => `${ids.ayer}T${hora}:00-05:00`;
    const horas = (solicitud, inicio, fin) => ({ hora_solicitud: a(solicitud), inicio_servicio: a(inicio), fin_servicio: a(fin) });
    const corregir = (id, body) => api("POST", `/api/servicios/${id}/corregir`, { token: tokens.admin, body: { motivo: "Horas reales", ...body } });
    const conceptos = ctx.verAdmin;

    // Bogotá Móvil (corte general 20:40)
    const id = await ctx.servicioFinalizado();

    let r = await corregir(id, horas("21:30", "21:45", "22:15"));
    assert.strictEqual(r.status, 200, JSON.stringify(r.datos));
    let d = await conceptos(id);
    const recargo = d.conceptos.find((c) => c.concepto_id === ids.recargo);
    assert.ok(recargo, "debe tener recargo nocturno");
    assert.strictEqual(recargo.cantidad, 1);
    assert.strictEqual(recargo.total, 86500); // precio Bogotá Móvil
    assert.strictEqual(d.servicio.valor_conceptos, 86500);

    // Termina 19:30 → para el corte general (20:40) ya no hay recargo
    await corregir(id, horas("18:30", "18:45", "19:30"));
    d = await conceptos(id);
    assert.ok(!d.conceptos.some((c) => c.concepto_id === ids.recargo));
    assert.strictEqual(d.servicio.valor_conceptos, 0);

    // El administrador no puede ponerlo a mano: si el horario no es nocturno, se quita
    await corregir(id, { conceptos: [{ concepto_id: ids.recargo, cantidad: 1 }] });
    assert.ok(!(await conceptos(id)).conceptos.some((c) => c.concepto_id === ids.recargo));

    // La Rolita: corte 19:00 → termina 19:30 sí lleva recargo, a su precio (98.000)
    const lr = await ctx.servicioFinalizado({ servicio: { cliente_id: ids.laRolita, tipo_vehiculo_id: ids.buseton } });
    r = await corregir(lr, horas("18:30", "18:45", "19:30"));
    assert.strictEqual(r.status, 200, JSON.stringify(r.datos));
    d = await conceptos(lr);
    assert.strictEqual(d.conceptos.find((c) => c.concepto_id === ids.recargo)?.total, 98000);

    // ---- Horario en Tarifas → Precios de conceptos (migración 014) ----
    const tieneRecargo = async (sid) => (await conceptos(sid)).conceptos.some((c) => c.concepto_id === ids.recargo);
    const precioRecargo = async (cliente) =>
      (await api("GET", `/api/precios-concepto?cliente_id=${cliente}&concepto_id=${ids.recargo}&vigente_en=${ids.ayer}`, { token: tokens.admin })).datos.precios[0];
    const general = await precioRecargo("generales");
    assert.strictEqual(general.recargo_desde, "20:40");
    assert.strictEqual(general.recargo_hasta, "06:00");
    assert.strictEqual((await precioRecargo(ids.laRolita)).recargo_desde, "19:00"); // hora propia de La Rolita
    await corregir(id, horas("21:00", "21:10", "21:30")); // 21:30 > 20:40 → recargo
    assert.strictEqual(await tieneRecargo(id), true);
    // Cambiar la hora general (se permite aunque el precio ya se haya usado)
    const cambio = await api("PATCH", `/api/precios-concepto/${general.id}`, { token: tokens.admin, body: { recargo_desde: "22:00", motivo: "Nuevo horario" } });
    assert.strictEqual(cambio.status, 200, JSON.stringify(cambio.datos));
    await corregir(id, { motivo: "Recalcular con el nuevo horario", km_vacio: 1 });
    assert.strictEqual(await tieneRecargo(id), false); // 21:30 ya no pasa de 22:00
    // Hora propia del cliente (Bogotá Móvil 21:00): gana sobre la general
    const propio = await precioRecargo(ids.bogotaMovil);
    await api("PATCH", `/api/precios-concepto/${propio.id}`, { token: tokens.admin, body: { recargo_desde: "21:00", motivo: "Hora del cliente" } });
    await corregir(id, { motivo: "Recalcular con la hora del cliente", km_vacio: 2 });
    assert.strictEqual(await tieneRecargo(id), true); // 21:30 > 21:00
    await api("PATCH", `/api/precios-concepto/${propio.id}`, { token: tokens.admin, body: { recargo_desde: null, motivo: "Usar la general" } });
    // El horario solo se pone en el precio del recargo; el valor de un precio en uso sigue bloqueado
    const cardan = (await api("GET", `/api/precios-concepto?cliente_id=generales&concepto_id=${ids.cardan}&vigente_en=${ids.ayer}`, { token: tokens.admin })).datos.precios[0];
    assert.strictEqual((await api("PATCH", `/api/precios-concepto/${cardan.id}`, { token: tokens.admin, body: { recargo_desde: "22:00" } })).datos.codigo, "SOLO_RECARGO");
    assert.strictEqual((await api("PATCH", `/api/precios-concepto/${general.id}`, { token: tokens.admin, body: { valor: 1 } })).datos.codigo, "TARIFA_EN_USO");
    await api("PATCH", `/api/precios-concepto/${general.id}`, { token: tokens.admin, body: { recargo_desde: "20:40", motivo: "Horario original" } });

    // ---- El administrador decide el recargo: siempre / nunca / automático ----
    await corregir(id, horas("10:00", "10:15", "11:00")); // de día
    assert.strictEqual(await tieneRecargo(id), false);
    await corregir(id, { recargo_nocturno: "si" });
    assert.strictEqual(await tieneRecargo(id), true);
    await corregir(id, horas("21:30", "21:45", "22:15")); // de noche…
    await corregir(id, { recargo_nocturno: "no" }); // …pero el administrador lo quita
    assert.strictEqual(await tieneRecargo(id), false);
    await corregir(id, { recargo_nocturno: "auto" });
    assert.strictEqual(await tieneRecargo(id), true);
  } finally {
    await ctx.recargoNocturnoActivo(false);
    await pool.query(
      `UPDATE precios_concepto p SET recargo_desde = CASE WHEN p.cliente_id IS NULL THEN '20:40'::time ELSE p.recargo_desde END,
              recargo_hasta = CASE WHEN p.cliente_id IS NULL THEN '06:00'::time ELSE p.recargo_hasta END
       FROM conceptos_tarifa ct WHERE ct.id = p.concepto_id AND ct.es_recargo_nocturno`,
    );
    await pool.query("UPDATE precios_concepto SET recargo_desde = NULL WHERE cliente_id = $1 AND concepto_id = $2", [ids.bogotaMovil, ids.recargo]);
  }
});

test("corrección completa: cambiar la empresa y poner una tarifa manual", async () => {
  const id = await ctx.servicioFinalizado({ finalizar: { conceptos: [{ concepto_id: ids.cardan, cantidad: 1 }] } }); // Bogotá Móvil, articulado
  const corregir = async (body) => {
    const r = await api("POST", `/api/servicios/${id}/corregir`, { token: tokens.admin, body: { motivo: "Ajuste del administrador", ...body } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.datos));
    return (await ctx.verAdmin(id)).servicio;
  };

  // Cambiar la empresa: se recalcula con la tarifa y los precios de CAPITALBUS (368.000 + cardán 88.000)
  let sv = await corregir({ cliente_id: ids.capitalbus, placa_vehiculo: "abc 123", recibe_nombre: "Supervisor", observaciones: "Era de CAPITALBUS" });
  assert.strictEqual(sv.cliente_id, ids.capitalbus);
  assert.strictEqual(sv.valor_tarifa_basica, 368000);
  assert.strictEqual(sv.valor_calculado, 456000);
  assert.strictEqual(sv.placa_vehiculo, "ABC123");
  assert.strictEqual(sv.recibe_nombre, "Supervisor");

  // Tarifa manual: reemplaza la de la tabla
  sv = await corregir({ tarifa_basica_manual: 500000 });
  assert.strictEqual(sv.valor_tarifa_basica, 500000);
  assert.strictEqual(sv.tarifa_id, null);
  assert.strictEqual(sv.valor_calculado, 588000);
  // Quitarla vuelve a la automática
  sv = await corregir({ tarifa_basica_manual: null });
  assert.strictEqual(sv.valor_tarifa_basica, 368000);
  const malo = await api("POST", `/api/servicios/${id}/corregir`, { token: tokens.admin, body: { tarifa_basica_manual: -5, motivo: "Valor inválido" } });
  assert.strictEqual(malo.status, 422);

  // Excel de tarifas: 4 hojas; financiero sí, operador no
  const xls = await ctx.descargar(`/api/exportar/tarifas?vigente_en=${ids.hoy}`, tokens.fin);
  assert.strictEqual(xls.status, 200);
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(xls.buffer);
  assert.deepStrictEqual(libro.worksheets.map((w) => w.name), ["Tarifa básica", "Precios de conceptos", "Pago a operadores", "Bolsa de kilómetros"]);
  assert.ok(libro.getWorksheet("Tarifa básica").rowCount > 10);
  assert.strictEqual(libro.getWorksheet("Bolsa de kilómetros").rowCount, 115); // encabezado + 114 celdas
  assert.strictEqual((await ctx.descargar("/api/exportar/tarifas", tokens.op1)).status, 403);
});

test("CAPITALBUS: precio propio de conceptos; el administrador agrega 1,5 h de stand-by", async () => {
  const id = await ctx.servicioFinalizado({ servicio: { cliente_id: ids.capitalbus }, finalizar: { conceptos: [{ concepto_id: ids.camara, cantidad: 2 }] } });
  // Cámara de freno CAPITALBUS 24.800 × 2 = 49.600
  assert.strictEqual((await ctx.verAdmin(id)).servicio.valor_conceptos, 49600);

  await api("POST", `/api/servicios/${id}/corregir`, {
    token: tokens.admin,
    body: {
      conceptos: [
        { concepto_id: ids.camara, cantidad: 2 },
        { concepto_id: ids.standby, cantidad: 1.5 },
      ],
      motivo: "Stand-by reportado por el cliente",
    },
  });
  // + stand-by CAPITALBUS 103.100 × 1,5 h = 154.650 → 204.250
  assert.strictEqual((await ctx.verAdmin(id)).servicio.valor_conceptos, 204250);
});

test("pago al operador: 8 % por parte + bono de cardán una vez; base = valor aprobado", async () => {
  const persiana = await ctx.idDe("SELECT id FROM conceptos_tarifa WHERE nombre = $1", "Quitar persiana");
  const id = await ctx.servicioFinalizado({
    finalizar: {
      conceptos: [
        { concepto_id: ids.cardan, cantidad: 2 },
        { concepto_id: persiana, cantidad: 1 },
        { concepto_id: ids.camara, cantidad: 2 },
      ],
    },
  });
  // Bogotá Móvil: 393.000 + cardán 2 × 92.400 + persiana 25.700 + cámaras 2 × 25.700 = 654.900
  let d = await ctx.verAdmin(id);
  assert.strictEqual(d.servicio.valor_calculado, 654900);
  // 8 % × 393.000 = 31.440 + cardán $20.000 (una vez) + 8 % × 25.700 = 2.056 + cámaras 0 = 53.496
  assert.strictEqual(d.pago_operador.valor, 53496);
  assert.strictEqual(d.pago_operador.provisional, true);

  // El operador no ve el pago (ni ningún valor)
  const op = (await api("GET", `/api/servicios/${id}`, { token: tokens.op1 })).datos;
  assert.strictEqual(op.pago_operador, undefined);
  assert.strictEqual(op.servicio.valor_operador, undefined);

  // Aprobado con 10 % de descuento: las partes en % bajan 10 %; el bono no
  const ap = await api("POST", `/api/servicios/${id}/aprobar`, { token: tokens.admin, body: { valor_aprobado: 589410, motivo: "Descuento 10 %" } });
  assert.strictEqual(ap.status, 200, JSON.stringify(ap.datos));
  d = await ctx.verAdmin(id);
  assert.strictEqual(d.pago_operador.valor, 50146); // 28.296 + 20.000 + 1.850
  assert.strictEqual(d.pago_operador.provisional, false);
  assert.strictEqual(d.servicio.valor_operador, 50146); // quedó guardado

  // Reglas: la del cardán queda "usada" y no se puede crear otra que se cruce
  const reglas = (await api("GET", "/api/pago-operador", { token: tokens.admin })).datos.reglas;
  const cardan = reglas.find((r) => r.componente === "concepto" && r.concepto_id === ids.cardan && r.cliente_id === null);
  assert.strictEqual(cardan.usada, true);
  const cruce = await api("POST", "/api/pago-operador", {
    token: tokens.admin,
    body: { cliente_id: null, componente: "concepto", concepto_id: ids.cardan, forma: "fijo_servicio", valor: 25000, vigente_desde: ids.hoy },
  });
  assert.strictEqual(cruce.status, 409);
  const usada = await api("PATCH", `/api/pago-operador/${cardan.id}`, { token: tokens.admin, body: { valor: 25000 } });
  assert.strictEqual(usada.datos.codigo, "TARIFA_EN_USO");
  const sinConcepto = await api("POST", "/api/pago-operador", {
    token: tokens.admin,
    body: { cliente_id: ids.capitalbus, componente: "concepto", forma: "porcentaje", valor: 5, vigente_desde: ids.hoy },
  });
  assert.strictEqual(sinConcepto.datos.codigo, "FALTA_CONCEPTO");

  // Liquidación: el operador no tiene acceso; el financiero sí
  const q = `desde=${ids.hoy}&hasta=${ids.hoy}&operador_id=${ids.op1}`;
  assert.strictEqual((await api("GET", `/api/liquidacion-operadores?${q}`, { token: tokens.op1 })).status, 403);
  const liq = (await api("GET", `/api/liquidacion-operadores?${q}`, { token: tokens.fin })).datos;
  const fila = liq.servicios.find((x) => x.servicio_id === id);
  assert.strictEqual(fila.pago, 50146);
  assert.strictEqual(fila.provisional, false);
  const resumen = liq.operadores.find((o) => o.operador_id === ids.op1);
  const suma = (lista) => lista.reduce((t, x) => t + x.pago, 0);
  assert.strictEqual(resumen.pago_total, suma(liq.servicios.filter((x) => x.operador_id === ids.op1)));

  const xls = await ctx.descargar(`/api/exportar/pago-operadores?${q}`, tokens.admin);
  assert.strictEqual(xls.status, 200);
  assert.match(xls.r.headers.get("content-type"), /spreadsheetml/);

  // Regla propia de UNA parte (CAPITALBUS: persiana 10 %): las demás partes siguen con la general
  const propia = await api("POST", "/api/pago-operador", {
    token: tokens.admin,
    body: { cliente_id: ids.capitalbus, componente: "concepto", concepto_id: persiana, forma: "porcentaje", valor: 10, vigente_desde: ids.hoy },
  });
  assert.strictEqual(propia.status, 201, JSON.stringify(propia.datos));
  try {
    const cb = await ctx.servicioFinalizado({ servicio: { cliente_id: ids.capitalbus }, finalizar: { conceptos: [{ concepto_id: persiana, cantidad: 1 }] } });
    // 8 % × 368.000 (tarifa CAPITALBUS, regla general) = 29.440 + 10 % × 24.800 (regla propia) = 2.480
    assert.strictEqual((await ctx.verAdmin(cb)).pago_operador.valor, 31920);
  } finally {
    await api("DELETE", `/api/pago-operador/${propia.datos.regla.id}`, { token: tokens.admin, body: { motivo: "Fin de la prueba" } });
  }
});

test("el administrador ve las órdenes en PDF; los anulados y aprobados también", async () => {
  const id = await ctx.servicioFinalizado();
  const pdf = await ctx.descargar(`/api/exportar/ordenes/${id}`, tokens.admin);
  assert.strictEqual(pdf.status, 200);
  assert.match(pdf.r.headers.get("content-type"), /application\/pdf/);
  await api("PATCH", `/api/servicios/${id}/estado`, { token: tokens.admin, body: { estado: "anulado", motivo: "Prueba de PDF anulado" } });
  assert.strictEqual((await ctx.descargar(`/api/exportar/ordenes/${id}`, tokens.admin)).status, 200);
  assert.strictEqual((await ctx.descargar(`/api/exportar/ordenes/${id}`, tokens.op1)).status, 403);
  // Excel de servicios del día con los mismos filtros del listado
  const xls = await ctx.descargar(`/api/exportar/servicios?desde=${ids.hoy}&hasta=${ids.hoy}`, tokens.fin);
  assert.strictEqual(xls.status, 200);
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(xls.buffer);
  assert.ok(libro.getWorksheet("Servicios").rowCount > 2);
});
