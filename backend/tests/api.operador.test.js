/**
 * Pruebas de la API del OPERADOR (como lo haría el celular): login, turnos,
 * registrar y finalizar servicios, y lo que el operador NO puede hacer.
 *
 * Otras pruebas de la API: api.revision (administrador), api.bolsaKm (Suma),
 * api.reportes (turnos y cobro), api.admin (catálogos, usuarios, tarifas).
 * Preparación común: ayudas/contexto.js.
 */
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const ctx = require("./ayudas/contexto");

const { api, tokens, ids, pool, datosServicio, datosFinalizar, haceMinutos } = ctx;

before(() => ctx.preparar()); // sin turno: la primera prueba verifica que se exige
after(() => ctx.terminar());

// ---------- Autenticación ----------

test("login: contraseña incorrecta → 401 sin revelar el motivo", async () => {
  const r = await api("POST", "/api/auth/login", { body: { email: "operador1@grualink.test", password: "mala" } });
  assert.strictEqual(r.status, 401);
  assert.strictEqual(r.datos.codigo, "CREDENCIALES");
});

test("login: sin contraseña → 422 (antes era error 500)", async () => {
  const r = await api("POST", "/api/auth/login", { body: { email: "operador1@grualink.test" } });
  assert.strictEqual(r.status, 422);
});

test("/auth/yo devuelve rol y permisos", async () => {
  const r = await api("GET", "/api/auth/yo", { token: tokens.op1 });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.datos.usuario.rol, "operador");
  assert.ok(r.datos.usuario.permisos.includes("turnos:propios"));
});

test("sin token → 401", async () => {
  const r = await api("GET", "/api/turnos/activo");
  assert.strictEqual(r.status, 401);
});

// ---------- Turnos ----------

test("no se puede registrar un servicio sin turno activo", async () => {
  const r = await api("POST", "/api/servicios", { token: tokens.op1, body: datosServicio() });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.datos.codigo, "SIN_TURNO_ACTIVO");
});

test("iniciar turno: la hora la pone el servidor", async () => {
  const r = await api("POST", "/api/turnos/iniciar", {
    token: tokens.op1,
    body: { grua_id: ids.grua1, observaciones: "Grúa con tanque lleno", inicio: "2020-01-01T00:00:00Z" },
  });
  assert.strictEqual(r.status, 201, JSON.stringify(r.datos));
  assert.strictEqual(r.datos.turno.estado, "activo");
  // Se ignoró el "inicio" enviado: la hora es de ahora
  assert.ok(Math.abs(new Date(r.datos.turno.inicio) - Date.now()) < 60000);
});

test("un operador no puede tener dos turnos activos", async () => {
  const r = await api("POST", "/api/turnos/iniciar", { token: tokens.op1, body: { grua_id: ids.grua2 } });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.datos.codigo, "TURNO_YA_ACTIVO");
});

test("una grúa no puede estar en dos turnos activos", async () => {
  const r = await api("POST", "/api/turnos/iniciar", { token: tokens.op2, body: { grua_id: ids.grua1 } });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.datos.codigo, "GRUA_EN_USO");
});

test("gruas-disponibles marca la grúa en uso", async () => {
  const r = await api("GET", "/api/turnos/gruas-disponibles", { token: tokens.op2 });
  const g1 = r.datos.gruas.find((g) => g.id === ids.grua1);
  assert.strictEqual(g1.en_uso, true);
});

// ---------- Servicios ----------

test("crear servicio: el servidor ignora operador, grúa, número de orden y valores enviados", async () => {
  const r = await api("POST", "/api/servicios", {
    token: tokens.op1,
    body: datosServicio({ operador_id: 9999, grua_id: ids.grua2, numero_orden: "TRAMPA", valor_calculado: 1, valor_conceptos: 5000000, estado: "aprobado" }),
  });
  assert.strictEqual(r.status, 201, JSON.stringify(r.datos));
  const s = r.datos.servicio;
  assert.strictEqual(s.numero_orden, "1"); // primera orden digital
  assert.strictEqual(s.operador_id, ids.op1);
  assert.strictEqual(s.grua_id, ids.grua1); // la del turno, no la enviada
  assert.strictEqual(s.estado, "en_servicio");
  assert.strictEqual(s.placa_vehiculo, "WCS473"); // normalizada
  assert.strictEqual(s.valor_calculado, undefined); // el operador no ve valores
  ids.servicio1 = s.id;

  const enBd = await pool.query("SELECT valor_conceptos FROM servicios WHERE id = $1", [s.id]);
  assert.strictEqual(enBd.rows[0].valor_conceptos, 0); // no se coló el valor enviado
});

test("no se puede registrar un servicio con fecha anterior al turno", async () => {
  const r = await api("POST", "/api/servicios", { token: tokens.op1, body: datosServicio({ fecha_servicio: "2026-01-15" }) });
  assert.strictEqual(r.status, 422);
  assert.strictEqual(r.datos.codigo, "FECHA_FUERA_DEL_TURNO");
});

test("la hora de inicio no puede ser anterior a la de solicitud (al crear y al finalizar)", async () => {
  const crear = await api("POST", "/api/servicios", {
    token: tokens.op1,
    body: datosServicio({ hora_solicitud: haceMinutos(30), inicio_servicio: haceMinutos(60) }),
  });
  assert.strictEqual(crear.status, 422);
  assert.strictEqual(crear.datos.codigo, "INICIO_ANTES_DE_SOLICITUD");

  // Creado sin hora de inicio; al finalizar se envía una anterior a la solicitud
  const s = await api("POST", "/api/servicios", { token: tokens.op1, body: datosServicio({ hora_solicitud: haceMinutos(30), inicio_servicio: null }) });
  const fin = await api("POST", `/api/servicios/${s.datos.servicio.id}/finalizar`, {
    token: tokens.op1,
    body: datosFinalizar({ inicio_servicio: haceMinutos(90) }),
  });
  assert.strictEqual(fin.status, 422);
  assert.strictEqual(fin.datos.codigo, "INICIO_ANTES_DE_SOLICITUD");

  // Con una hora válida sí se finaliza (para no dejarlo abierto)
  const ok = await api("POST", `/api/servicios/${s.datos.servicio.id}/finalizar`, {
    token: tokens.op1,
    body: datosFinalizar({ inicio_servicio: haceMinutos(20) }),
  });
  assert.strictEqual(ok.status, 200, JSON.stringify(ok.datos));
});

test("datos inválidos → 422 con la lista de campos", async () => {
  const r = await api("POST", "/api/servicios", { token: tokens.op1, body: datosServicio({ placa_vehiculo: "!!", cliente_id: "abc" }) });
  assert.strictEqual(r.status, 422);
  const campos = r.datos.campos.map((c) => c.campo);
  assert.ok(campos.includes("placa_vehiculo") && campos.includes("cliente_id"));
});

test("número del vehículo: obligatorio, acepta letras y se guarda en mayúsculas", async () => {
  const crear = (numero) => api("POST", "/api/servicios", { token: tokens.op1, body: datosServicio({ numero_vehiculo: numero }) });
  for (const vacio of [undefined, null, "", "   "]) {
    const r = await crear(vacio);
    assert.strictEqual(r.status, 422, `debía rechazar ${JSON.stringify(vacio)}`);
    assert.ok(r.datos.campos.some((c) => c.campo === "numero_vehiculo"));
  }
  assert.strictEqual((await crear("13<033>")).status, 422); // caracteres raros
  const ok = await crear("  z-1045 ");
  assert.strictEqual(ok.status, 201, JSON.stringify(ok.datos));
  assert.strictEqual(ok.datos.servicio.numero_vehiculo, "Z-1045");
  const id = ok.datos.servicio.id;
  await api("POST", `/api/servicios/${id}/finalizar`, { token: tokens.op1, body: datosFinalizar() });

  // El administrador lo puede corregir, pero no dejarlo vacío
  const corregir = (numero) => api("POST", `/api/servicios/${id}/corregir`, { token: tokens.admin, body: { numero_vehiculo: numero, motivo: "Número del bus" } });
  assert.strictEqual((await corregir("")).status, 422);
  assert.strictEqual((await corregir(null)).status, 422);
  const r = await corregir("bt 0101");
  assert.strictEqual(r.status, 200, JSON.stringify(r.datos));
  assert.strictEqual((await ctx.verAdmin(id)).servicio.numero_vehiculo, "BT 0101");
});

test("finalizar: calcula tarifa general + concepto en el backend", async () => {
  const r = await api("POST", `/api/servicios/${ids.servicio1}/finalizar`, {
    token: tokens.op1,
    // km_servicio se envía a propósito: el operador ya no puede registrar km
    body: datosFinalizar({ km_servicio: 50, conceptos: [{ concepto_id: ids.cardan, cantidad: 1 }] }),
  });
  assert.strictEqual(r.status, 200, JSON.stringify(r.datos));
  assert.strictEqual(r.datos.servicio.estado, "finalizado");
  assert.strictEqual(r.datos.servicio.valor_calculado, undefined); // oculto al operador
  assert.strictEqual(r.datos.conceptos[0].total, undefined);

  // El administrador sí ve los valores: Articulado Bogotá Móvil 393.000 + cardán 92.400
  const admin = await ctx.verAdmin(ids.servicio1);
  assert.strictEqual(admin.servicio.valor_tarifa_basica, 393000);
  assert.strictEqual(admin.servicio.valor_conceptos, 92400);
  assert.strictEqual(admin.servicio.valor_calculado, 485400);
  assert.strictEqual(admin.servicio.km_servicio, 0); // se ignoró el km enviado
});

test("el operador no recibe ni puede enviar stand-by / recargo nocturno", async () => {
  const cat = await api("GET", "/api/catalogos", { token: tokens.op1 });
  const nombres = cat.datos.conceptos.map((c) => c.nombre);
  assert.ok(!nombres.includes("Hora standby / disponibilidad"));
  assert.ok(!nombres.includes("Recargo nocturno"));
  assert.ok(nombres.includes("Desmontar cardán"));

  const catAdmin = await api("GET", "/api/catalogos", { token: tokens.admin });
  assert.ok(catAdmin.datos.conceptos.some((c) => c.nombre === "Hora standby / disponibilidad"));

  const s = await api("POST", "/api/servicios", { token: tokens.op1, body: datosServicio() });
  const r = await api("POST", `/api/servicios/${s.datos.servicio.id}/finalizar`, {
    token: tokens.op1,
    body: datosFinalizar({ conceptos: [{ concepto_id: ids.standby, cantidad: 1 }] }),
  });
  assert.strictEqual(r.status, 403);
  assert.strictEqual(r.datos.codigo, "CONCEPTO_SOLO_ADMIN");
  await api("POST", `/api/servicios/${s.datos.servicio.id}/finalizar`, { token: tokens.op1, body: datosFinalizar() });
});

test("vehículo 'Otro': exige descripción y queda a convenir", async () => {
  const sin = await api("POST", "/api/servicios", { token: tokens.op1, body: datosServicio({ tipo_vehiculo_id: ids.otro }) });
  assert.strictEqual(sin.status, 422);
  assert.strictEqual(sin.datos.codigo, "FALTA_TIPO_VEHICULO_OTRO");

  const con = await api("POST", "/api/servicios", { token: tokens.op1, body: datosServicio({ tipo_vehiculo_id: ids.otro, tipo_vehiculo_otro: "  Volqueta " }) });
  assert.strictEqual(con.status, 201, JSON.stringify(con.datos));
  assert.strictEqual(con.datos.servicio.tipo_vehiculo_otro, "Volqueta");
  assert.strictEqual(con.datos.servicio.tipo_vehiculo, "Volqueta"); // se muestra lo escrito

  const fin = await api("POST", `/api/servicios/${con.datos.servicio.id}/finalizar`, { token: tokens.op1, body: datosFinalizar() });
  assert.strictEqual(fin.status, 200, JSON.stringify(fin.datos));
  assert.strictEqual(fin.datos.requiere_valor_manual, true);

  // Con un tipo normal, la descripción se descarta
  const normal = await api("POST", "/api/servicios", { token: tokens.op1, body: datosServicio({ tipo_vehiculo_otro: "Volqueta" }) });
  assert.strictEqual(normal.datos.servicio.tipo_vehiculo_otro, null);
  await api("POST", `/api/servicios/${normal.datos.servicio.id}/finalizar`, { token: tokens.op1, body: datosFinalizar() });
});

test("un servicio finalizado no se puede finalizar otra vez", async () => {
  const r = await api("POST", `/api/servicios/${ids.servicio1}/finalizar`, { token: tokens.op1, body: datosFinalizar() });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.datos.codigo, "SERVICIO_YA_CERRADO");
});

test("dos finalizaciones simultáneas: solo una pasa", async () => {
  const creado = await api("POST", "/api/servicios", { token: tokens.op1, body: datosServicio() });
  const ruta = `/api/servicios/${creado.datos.servicio.id}/finalizar`;
  const [a, b] = await Promise.all([
    api("POST", ruta, { token: tokens.op1, body: datosFinalizar() }),
    api("POST", ruta, { token: tokens.op1, body: datosFinalizar() }),
  ]);
  assert.deepStrictEqual([a.status, b.status].sort(), [200, 409]);
  const { rows } = await pool.query(
    "SELECT count(*)::int AS n FROM bitacora WHERE entidad = 'servicios' AND registro_id = $1 AND operacion = 'finalizar'",
    [creado.datos.servicio.id],
  );
  assert.strictEqual(rows[0].n, 1);
});

test("rescate (a convenir): se marca por el tipo de servicio y queda para el administrador", async () => {
  const creado = await api("POST", "/api/servicios", { token: tokens.op1, body: datosServicio({ tipo_servicio_id: ids.rescate }) });
  assert.strictEqual(creado.datos.servicio.es_rescate, true); // sin que el operador lo marque
  const r = await api("POST", `/api/servicios/${creado.datos.servicio.id}/finalizar`, { token: tokens.op1, body: datosFinalizar() });
  assert.strictEqual(r.status, 200, JSON.stringify(r.datos));
  assert.strictEqual(r.datos.requiere_valor_manual, true);
});

// ---------- Permisos ----------

test("un operador no ve ni finaliza servicios de otro", async () => {
  const ver = await api("GET", `/api/servicios/${ids.servicio1}`, { token: tokens.op2 });
  assert.strictEqual(ver.status, 403);
  const lista = await api("GET", "/api/servicios", { token: tokens.op2 });
  assert.strictEqual(lista.datos.servicios.length, 0);
});

test("el operador no puede cambiar estados (aprobar)", async () => {
  const r = await api("PATCH", `/api/servicios/${ids.servicio1}/estado`, { token: tokens.op1, body: { estado: "en_revision" } });
  assert.strictEqual(r.status, 403);
});

test("el financiero ve valores pero no puede registrar servicios", async () => {
  const crear = await api("POST", "/api/servicios", { token: tokens.fin, body: datosServicio() });
  assert.strictEqual(crear.status, 403);
  const ver = await api("GET", `/api/servicios/${ids.servicio1}`, { token: tokens.fin });
  assert.strictEqual(ver.datos.servicio.valor_calculado, 485400);
});

// ---------- Cierre de turno ----------

test("finalizar turno con servicios abiertos exige justificación", async () => {
  await api("POST", "/api/servicios", { token: tokens.op1, body: datosServicio() }); // queda abierto

  const sin = await api("POST", "/api/turnos/finalizar", { token: tokens.op1, body: {} });
  assert.strictEqual(sin.status, 409);
  assert.strictEqual(sin.datos.codigo, "SERVICIOS_SIN_FINALIZAR");

  const con = await api("POST", "/api/turnos/finalizar", { token: tokens.op1, body: { justificacion: "El cliente canceló y no se pudo cerrar en el sistema" } });
  assert.strictEqual(con.status, 200, JSON.stringify(con.datos));
  assert.strictEqual(con.datos.turno.estado, "finalizado");
  assert.ok(con.datos.turno.fin);
});

test("historial de turnos: el operador solo ve los suyos", async () => {
  const r = await api("GET", "/api/turnos", { token: tokens.op1 });
  assert.strictEqual(r.status, 200);
  assert.ok(r.datos.turnos.length >= 1);
  assert.ok(r.datos.turnos.every((t) => t.operador_id === ids.op1));
});

test("el administrador cierra un turno olvidado con motivo", async () => {
  const inicio = await api("POST", "/api/turnos/iniciar", { token: tokens.op2, body: { grua_id: ids.grua2 } });
  const id = inicio.datos.turno.id;

  const sinMotivo = await api("POST", `/api/turnos/${id}/cerrar`, { token: tokens.admin, body: {} });
  assert.strictEqual(sinMotivo.status, 422);

  const operador = await api("POST", `/api/turnos/${id}/cerrar`, { token: tokens.op1, body: { motivo: "intento" } });
  assert.strictEqual(operador.status, 403);

  const r = await api("POST", `/api/turnos/${id}/cerrar`, { token: tokens.admin, body: { motivo: "El operador olvidó cerrar el turno" } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.datos.turno.estado, "cerrado_admin");
});

test("cada operación importante quedó en la bitácora", async () => {
  const { rows } = await pool.query("SELECT DISTINCT operacion FROM bitacora ORDER BY 1");
  const operaciones = rows.map((r) => r.operacion);
  for (const op of ["cerrar_turno", "crear", "finalizar", "finalizar_turno", "iniciar_turno"]) {
    assert.ok(operaciones.includes(op), `Falta "${op}" en bitácora`);
  }
});
