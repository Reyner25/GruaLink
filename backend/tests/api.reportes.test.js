/**
 * Pruebas de los REPORTES del panel: turnos de los operadores (en curso,
 * historial, resumen y Excel) y cobro mensual a las empresas (resumen, Excel
 * como el que se envía y órdenes en PDF).
 * Cada prueba crea sus propios datos. Preparación común: ayudas/contexto.js
 * (el operador 1 queda en turno).
 */
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const ExcelJS = require("exceljs");
const ctx = require("./ayudas/contexto");

const { api, tokens, ids, pool } = ctx;

before(() => ctx.preparar({ turnoOperador1: true }));
after(() => ctx.terminar());

const leerExcel = async (buffer) => {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer);
  return libro;
};

test("panel de turnos: en curso, historial con horas y servicios, resumen por operador y Excel", async () => {
  // Un turno que el administrador tuvo que cerrar (aparece en el historial)
  const olvidado = await api("POST", "/api/turnos/iniciar", { token: tokens.op2, body: { grua_id: ids.grua2 } });
  await api("POST", `/api/turnos/${olvidado.datos.turno.id}/cerrar`, { token: tokens.admin, body: { motivo: "El operador olvidó cerrar el turno" } });

  const inicio = await api("POST", "/api/turnos/iniciar", { token: tokens.op2, body: { grua_id: ids.grua2 } });
  assert.strictEqual(inicio.status, 201, JSON.stringify(inicio.datos));
  const id = inicio.datos.turno.id;
  const operadorId = inicio.datos.turno.operador_id;
  // Simula que lleva 3 horas en turno
  await pool.query("UPDATE turnos_operador SET inicio = now() - interval '3 hours' WHERE id = $1", [id]);

  // Quién está en turno: solo el administrador
  assert.strictEqual((await api("GET", "/api/turnos/en-curso", { token: tokens.fin })).status, 403);
  assert.strictEqual((await api("GET", "/api/turnos/en-curso", { token: tokens.op1 })).status, 403);
  const enCurso = (await api("GET", "/api/turnos/en-curso", { token: tokens.admin })).datos.turnos;
  const actual = enCurso.find((t) => t.id === id);
  assert.ok(actual, "el turno activo debe aparecer en curso");
  assert.ok(actual.duracion_min >= 179 && actual.duracion_min <= 181);
  assert.strictEqual(actual.operador_nombre, "Operador Prueba Dos");

  // Historial filtrado por operador y estado
  const turnos = async (estado) => (await api("GET", `/api/turnos?operador_id=${operadorId}&estado=${estado}`, { token: tokens.admin })).datos.turnos;
  const activos = await turnos("activo");
  assert.deepStrictEqual(activos.map((t) => t.id), [id]);
  assert.strictEqual(activos[0].servicios, 0);
  const cerrados = await turnos("cerrado_admin");
  assert.ok(cerrados.length >= 1 && cerrados[0].cerrado_por_nombre);

  // Resumen por operador
  const resumen = (await api("GET", `/api/turnos/resumen?operador_id=${operadorId}`, { token: tokens.admin })).datos.operadores;
  assert.strictEqual(resumen.length, 1);
  assert.strictEqual(resumen[0].activos, 1);
  assert.ok(resumen[0].cerrados_admin >= 1);
  assert.ok(resumen[0].minutos >= 180);
  assert.strictEqual(resumen[0].turnos, activos.length + cerrados.length + (await turnos("finalizado")).length);

  // Excel
  const xls = await ctx.descargar(`/api/exportar/turnos?operador_id=${operadorId}`, tokens.admin);
  assert.strictEqual(xls.status, 200);
  const libro = await leerExcel(xls.buffer);
  assert.strictEqual(libro.getWorksheet("Turnos").rowCount, resumen[0].turnos + 2); // encabezado + turnos + TOTAL
  assert.strictEqual((await ctx.descargar("/api/exportar/turnos", tokens.fin)).status, 403);

  await api("POST", `/api/turnos/${id}/cerrar`, { token: tokens.admin, body: { motivo: "Fin de la prueba del panel" } });
});

test("dashboard y promedio de grúas: resumen, agrupado y Excel con rango máximo de un año", async () => {
  await ctx.servicioFinalizado();
  const resumen = await api("GET", `/api/dashboard/resumen?desde=${ids.hoy}&hasta=${ids.hoy}`, { token: tokens.fin });
  assert.strictEqual(resumen.status, 200, JSON.stringify(resumen.datos));
  assert.ok(resumen.datos.flota && resumen.datos.servicios);
  const porCliente = await api("GET", `/api/dashboard/por/cliente?desde=${ids.hoy}&hasta=${ids.hoy}`, { token: tokens.fin });
  assert.ok(porCliente.datos.filas.length >= 1);
  assert.strictEqual((await api("GET", "/api/dashboard/por/marca", { token: tokens.fin })).status, 422);

  const promedio = await api("GET", "/api/dashboard/promedio-gruas", { token: tokens.fin });
  assert.strictEqual(promedio.datos.dias.length, 7); // sin fechas: los últimos 7 días
  assert.strictEqual((await api("GET", "/api/dashboard/promedio-gruas?desde=2026-01-02&hasta=2026-01-01", { token: tokens.fin })).datos.codigo, "RANGO_INVALIDO");
  const xls = await ctx.descargar(`/api/exportar/promedio-gruas?desde=${ids.ayer}&hasta=${ids.hoy}`, tokens.fin);
  assert.strictEqual(xls.status, 200);
  assert.strictEqual((await ctx.descargar("/api/exportar/promedio-gruas?desde=2024-01-01&hasta=2026-01-01", tokens.fin)).status, 422);
});

test("cobro mensual: resumen por empresa, Excel como el que se envía y órdenes en PDF", async () => {
  const mes = ids.hoy.slice(0, 7);
  const mesAnterior = ids.mesAnterior.slice(0, 7);
  assert.strictEqual((await api("GET", `/api/cobro?mes=${mes}`, { token: tokens.op1 })).status, 403);

  // Datos del mes: Bogotá Móvil con un servicio aprobado con descuento y otro sin aprobar;
  // Suma con un servicio del mes anterior (sin aprobar)
  const aprobado = await ctx.servicioFinalizado();
  const ap = await api("POST", `/api/servicios/${aprobado}/aprobar`, { token: tokens.admin, body: { valor_aprobado: 380000, motivo: "Descuento acordado" } });
  assert.strictEqual(ap.status, 200, JSON.stringify(ap.datos));
  await ctx.servicioFinalizado();
  await ctx.servicioFinalizado({ servicio: { cliente_id: ids.suma }, corregir: { fecha_servicio: ids.mesAnterior, km_servicio: 20 } });

  // Solo aprobados (por defecto) vs. incluyendo los sin aprobar
  const soloAprobados = (await api("GET", `/api/cobro?mes=${mes}`, { token: tokens.fin })).datos.empresas;
  const todos = (await api("GET", `/api/cobro?mes=${mes}&incluir_sin_aprobar=true`, { token: tokens.fin })).datos.empresas;
  const contar = (lista) => lista.reduce((t, e) => t + e.cantidad, 0);
  assert.ok(contar(todos) > contar(soloAprobados));
  const bogota = soloAprobados.find((e) => e.cliente === "BOGOTA MOVIL");
  assert.ok(bogota && bogota.sin_aprobar === 0);
  assert.strictEqual(bogota.iva, Math.round(bogota.subtotal * 0.19 * 100) / 100);

  // Excel: RESUMEN + una hoja por empresa, con las columnas del formato
  const bajar = async (ruta) => {
    const d = await ctx.descargar(ruta, tokens.admin);
    assert.strictEqual(d.status, 200, ruta);
    return d;
  };
  let { r, buffer } = await bajar(`/api/exportar/cobro?mes=${mes}`);
  assert.match(r.headers.get("content-disposition"), /Servicios de gruas cobro\.xlsx/);
  let libro = await leerExcel(buffer);
  assert.strictEqual(libro.worksheets[0].name, "RESUMEN");
  assert.strictEqual(libro.worksheets.length, soloAprobados.length + 1);
  const hoja = libro.getWorksheet("BOGOTA MOVIL");
  assert.match(hoja.getCell("A1").value, /^SERVICIO DE GRÚA PRESTADOS A BOGOTA MOVIL$/);
  const encabezados = hoja.getRow(2).values.filter(Boolean);
  for (const t of [
    "Placa Grua", "No. Orden de servicio", "Tarifa", "Cardan/Eje/Tubo de Admisión", "persiana", "camaras", "Recargo Nocturno",
    "Hora Stand By", "Kit antiderrames", "Reiniciada", "M.Rescate", "Tal.Tarifa a cobrar", "Observaciones",
  ]) {
    assert.ok(encabezados.includes(t), `falta la columna ${t}`);
  }
  assert.ok(!encabezados.includes("Otros adicionales")); // todos los conceptos tienen su columna
  const colTotal = encabezados.indexOf("Tal.Tarifa a cobrar") + 1;
  const filaSub = 3 + bogota.cantidad;
  assert.strictEqual(hoja.getCell(filaSub, colTotal - 1).value, "Sub Total");
  assert.strictEqual(hoja.getCell(filaSub, colTotal).value.result, bogota.subtotal);
  assert.strictEqual(hoja.getCell(filaSub + 2, colTotal).value.result, bogota.total);
  // El aprobado con descuento queda anotado
  assert.ok(Array.from({ length: bogota.cantidad }, (_, k) => String(hoja.getCell(3 + k, encabezados.length).value)).some((o) => o.includes("ajuste")));

  // Stand-by, kit y reiniciada: cada uno en su columna (servicio de CAPITALBUS aprobado)
  const kit = await ctx.idDe("SELECT id FROM conceptos_tarifa WHERE nombre = $1", "Uso de kit antiderrames");
  const reiniciada = await ctx.idDe("SELECT id FROM conceptos_tarifa WHERE nombre = $1", "Reiniciada");
  const idSc = await ctx.servicioFinalizado({
    servicio: { cliente_id: ids.capitalbus },
    corregir: {
      conceptos: [
        { concepto_id: ids.standby, cantidad: 1.5 },
        { concepto_id: kit, cantidad: 1 },
        { concepto_id: reiniciada, cantidad: 1 },
      ],
    },
  });
  await api("POST", `/api/servicios/${idSc}/aprobar`, { token: tokens.admin, body: {} });
  const numeroOrden = (await ctx.verAdmin(idSc)).servicio.numero_orden;
  ({ buffer } = await bajar(`/api/exportar/cobro?mes=${mes}&cliente_id=${ids.capitalbus}`));
  const hc = (await leerExcel(buffer)).getWorksheet("CAPITALBUS");
  const encCb = hc.getRow(2).values;
  const filaCb = [...Array(hc.rowCount).keys()].map((k) => hc.getRow(k + 1)).find((f) => String(f.getCell(2).value) === String(numeroOrden));
  const valor = (titulo) => filaCb.getCell(encCb.indexOf(titulo)).value;
  assert.strictEqual(valor("Hora Stand By"), 154650); // 103.100 × 1,5 h (precio CAPITALBUS)
  assert.strictEqual(valor("Kit antiderrames"), 110500);
  assert.strictEqual(valor("Reiniciada"), 206000);
  assert.strictEqual(valor("Tal.Tarifa a cobrar").result, 368000 + 154650 + 110500 + 206000);

  // Suma (mes anterior): columna KM y resumen por grúa
  ({ buffer } = await bajar(`/api/exportar/cobro?mes=${mesAnterior}&cliente_id=${ids.suma}&incluir_sin_aprobar=true`));
  libro = await leerExcel(buffer);
  const hs = libro.getWorksheet("SUMA");
  assert.ok(hs.getRow(2).values.includes("KM"));
  let hayResumenGruas = false;
  hs.eachRow((row) => row.eachCell((c) => (hayResumenGruas ||= c.value === "Total general")));
  assert.ok(hayResumenGruas);

  // Órdenes de servicio en PDF del mismo cobro
  ({ r, buffer } = await bajar(`/api/exportar/cobro-ordenes?mes=${mes}&cliente_id=${bogota.cliente_id}`));
  assert.match(r.headers.get("content-type"), /application\/pdf/);
  assert.strictEqual(Number(buffer.toString("latin1").match(/\/Type \/Pages[\s\S]*?\/Count (\d+)/)?.[1]), bogota.cantidad);
  // Un mes sin servicios para cobrar → 404
  assert.strictEqual((await ctx.descargar(`/api/exportar/cobro-ordenes?mes=2025-01`, tokens.admin)).status, 404);
});
