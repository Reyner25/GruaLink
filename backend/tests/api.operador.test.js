/**
 * Pruebas de la API del operador: login, turnos y servicios.
 *
 * Levantan la API de verdad (en un puerto libre) contra la base de PRUEBAS
 * y hacen peticiones HTTP como lo haría el celular.
 *
 * Requisito: "npm run test:preparar" (una vez).
 * Ojo: dependen de las tarifas 2026 del seed (vigentes hasta 31/12/2026).
 */
require("./entorno");
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const { pool } = require("../config/db");
const { crearApp } = require("../app");

const PASSWORD = "Grualink2026*"; // PASSWORD_PRUEBA de seeds/seed.js
let servidor;
let base;
const tokens = {};
const ids = {};

// ---------- Utilidades ----------

async function api(metodo, ruta, { token, body } = {}) {
  const respuesta = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const texto = await respuesta.text();
  return { status: respuesta.status, datos: texto ? JSON.parse(texto) : null };
}

async function login(email) {
  const r = await api("POST", "/api/auth/login", { body: { email, password: PASSWORD } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.datos));
  return r.datos.token;
}

async function idDe(sql, valor) {
  const { rows } = await pool.query(sql, [valor]);
  assert.ok(rows[0], `No encontrado: ${valor}`);
  return rows[0].id;
}

const haceMinutos = (min) => new Date(Date.now() - min * 60000).toISOString();

function datosServicio(extra = {}) {
  return {
    cliente_id: ids.bogotaMovil,
    tipo_vehiculo_id: ids.articulado,
    tipo_servicio_id: ids.remolque,
    placa_vehiculo: "wcs 473",
    fecha_servicio: ids.hoy,
    hora_solicitud: haceMinutos(90),
    inicio_servicio: haceMinutos(60),
    origen: "Portal Tunal",
    destino: "Patio Prosperidad",
    ...extra,
  };
}

const datosFinalizar = (extra = {}) => ({
  fin_servicio: haceMinutos(5),
  entregado_sin_novedad: true,
  recibe_nombre: "Jefe de patio",
  ...extra,
});

// ---------- Preparación ----------

before(async () => {
  // Base de pruebas limpia en cada corrida
  await pool.query(`TRUNCATE servicio_conceptos, servicios, turnos_operador, bitacora,
                    sesiones_activas RESTART IDENTITY CASCADE`);
  await pool.query("ALTER SEQUENCE servicios_numero_orden_seq RESTART WITH 1");
  await pool.query("UPDATE gruas SET estado = 'activa'");

  servidor = crearApp().listen(0);
  base = `http://127.0.0.1:${servidor.address().port}`;

  tokens.op1 = await login("operador1@grualink.test");
  tokens.op2 = await login("operador2@grualink.test");
  tokens.admin = await login("admin@grualink.test");
  tokens.fin = await login("financiero@grualink.test");

  ids.op1 = await idDe("SELECT id FROM usuarios WHERE email = $1", "operador1@grualink.test");
  ids.grua1 = await idDe("SELECT id FROM gruas WHERE numero_interno = $1", "G1");
  ids.grua2 = await idDe("SELECT id FROM gruas WHERE numero_interno = $1", "G2");
  ids.bogotaMovil = await idDe("SELECT id FROM clientes WHERE nombre_comercial = $1", "BOGOTA MOVIL");
  ids.capitalbus = await idDe("SELECT id FROM clientes WHERE nombre_comercial = $1", "CAPITALBUS");
  ids.laRolita = await idDe("SELECT id FROM clientes WHERE nombre_comercial = $1", "La Rolita");
  ids.articulado = await idDe("SELECT id FROM tipos_vehiculo WHERE nombre = $1", "Articulado");
  ids.buseton = await idDe("SELECT id FROM tipos_vehiculo WHERE nombre = $1", "Busetón");
  ids.remolque = await idDe("SELECT id FROM tipos_servicio WHERE nombre = $1", "Remolque");
  ids.rescate = await idDe("SELECT id FROM tipos_servicio WHERE nombre = $1", "Rescate");
  ids.cardan = await idDe("SELECT id FROM conceptos_tarifa WHERE nombre = $1", "Desmontar cardán");
  ids.standby = await idDe("SELECT id FROM conceptos_tarifa WHERE nombre = $1", "Hora standby / disponibilidad");
  ids.camara = await idDe("SELECT id FROM conceptos_tarifa WHERE nombre = $1", "Quitar cámara de freno");
  ids.otro = await idDe("SELECT id FROM tipos_vehiculo WHERE nombre = $1", "Otro");
  ids.hoy = (await pool.query("SELECT current_date::text AS hoy")).rows[0].hoy;
  ids.ayer = (await pool.query("SELECT (current_date - 1)::text AS d")).rows[0].d;
  ids.recargo = await idDe("SELECT id FROM conceptos_tarifa WHERE es_recargo_nocturno = $1", true);
  // Los servicios de prueba terminan "hace 5 minutos": si las pruebas se corren
  // de noche, el recargo nocturno automático cambiaría los valores esperados.
  // Se desactiva aquí; la prueba del recargo lo activa con horas fijas.
  await recargoNocturnoActivo(false);
});

after(async () => {
  await recargoNocturnoActivo(true);
  servidor?.close();
  await pool.end();
});

async function recargoNocturnoActivo(activo) {
  await pool.query("UPDATE conceptos_tarifa SET activo = $1 WHERE es_recargo_nocturno", [activo]);
}

// ---------- Autenticación ----------

test("login: contraseña incorrecta → 401 sin revelar el motivo", async () => {
  const r = await api("POST", "/api/auth/login", {
    body: { email: "operador1@grualink.test", password: "mala" },
  });
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
    body: datosServicio({
      operador_id: 9999,
      grua_id: ids.grua2,
      numero_orden: "TRAMPA",
      valor_calculado: 1,
      valor_conceptos: 5000000,
      estado: "aprobado",
    }),
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
  const r = await api("POST", "/api/servicios", {
    token: tokens.op1,
    body: datosServicio({ fecha_servicio: "2026-01-15" }),
  });
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
  const s = await api("POST", "/api/servicios", {
    token: tokens.op1,
    body: datosServicio({ hora_solicitud: haceMinutos(30), inicio_servicio: null }),
  });
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
  const r = await api("POST", "/api/servicios", {
    token: tokens.op1,
    body: datosServicio({ placa_vehiculo: "!!", cliente_id: "abc" }),
  });
  assert.strictEqual(r.status, 422);
  const campos = r.datos.campos.map((c) => c.campo);
  assert.ok(campos.includes("placa_vehiculo") && campos.includes("cliente_id"));
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
  const admin = await api("GET", `/api/servicios/${ids.servicio1}`, { token: tokens.admin });
  assert.strictEqual(admin.datos.servicio.valor_tarifa_basica, 393000);
  assert.strictEqual(admin.datos.servicio.valor_conceptos, 92400);
  assert.strictEqual(admin.datos.servicio.valor_calculado, 485400);
  assert.strictEqual(admin.datos.servicio.km_servicio, 0); // se ignoró el km enviado
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
  const sin = await api("POST", "/api/servicios", {
    token: tokens.op1,
    body: datosServicio({ tipo_vehiculo_id: ids.otro }),
  });
  assert.strictEqual(sin.status, 422);
  assert.strictEqual(sin.datos.codigo, "FALTA_TIPO_VEHICULO_OTRO");

  const con = await api("POST", "/api/servicios", {
    token: tokens.op1,
    body: datosServicio({ tipo_vehiculo_id: ids.otro, tipo_vehiculo_otro: "  Volqueta " }),
  });
  assert.strictEqual(con.status, 201, JSON.stringify(con.datos));
  assert.strictEqual(con.datos.servicio.tipo_vehiculo_otro, "Volqueta");
  assert.strictEqual(con.datos.servicio.tipo_vehiculo, "Volqueta"); // se muestra lo escrito

  const fin = await api("POST", `/api/servicios/${con.datos.servicio.id}/finalizar`, {
    token: tokens.op1,
    body: datosFinalizar(),
  });
  assert.strictEqual(fin.status, 200, JSON.stringify(fin.datos));
  assert.strictEqual(fin.datos.requiere_valor_manual, true);

  // Con un tipo normal, la descripción se descarta
  const normal = await api("POST", "/api/servicios", {
    token: tokens.op1,
    body: datosServicio({ tipo_vehiculo_otro: "Volqueta" }),
  });
  assert.strictEqual(normal.datos.servicio.tipo_vehiculo_otro, null);
  await api("POST", `/api/servicios/${normal.datos.servicio.id}/finalizar`, { token: tokens.op1, body: datosFinalizar() });
});

test("un servicio finalizado no se puede finalizar otra vez", async () => {
  const r = await api("POST", `/api/servicios/${ids.servicio1}/finalizar`, {
    token: tokens.op1,
    body: datosFinalizar(),
  });
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

test("La Rolita: al finalizar usa 0 km; el administrador carga 17,5 km y se recalcula (rango 15–19,99)", async () => {
  const creado = await api("POST", "/api/servicios", {
    token: tokens.op1,
    body: datosServicio({ cliente_id: ids.laRolita, tipo_vehiculo_id: ids.buseton }),
  });
  const id = creado.datos.servicio.id;
  const r = await api("POST", `/api/servicios/${id}/finalizar`, { token: tokens.op1, body: datosFinalizar() });
  assert.strictEqual(r.status, 200, JSON.stringify(r.datos));
  let admin = await api("GET", `/api/servicios/${id}`, { token: tokens.admin });
  assert.strictEqual(admin.datos.servicio.valor_tarifa_basica, 480000); // rango "menos de 15 km"

  const corr = await api("POST", `/api/servicios/${id}/corregir`, {
    token: tokens.admin,
    body: { km_vacio: 3.2, km_servicio: 17.5, motivo: "Km del reporte GPS" },
  });
  assert.strictEqual(corr.status, 200, JSON.stringify(corr.datos));
  admin = await api("GET", `/api/servicios/${id}`, { token: tokens.admin });
  assert.strictEqual(admin.datos.servicio.valor_tarifa_basica, 548000);
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
  await recargoNocturnoActivo(true);
  try {
    const a = (hora) => `${ids.ayer}T${hora}:00-05:00`;
    const horas = (solicitud, inicio, fin) => ({ hora_solicitud: a(solicitud), inicio_servicio: a(inicio), fin_servicio: a(fin) });
    const corregir = (id, body) => api("POST", `/api/servicios/${id}/corregir`, { token: tokens.admin, body: { motivo: "Horas reales", ...body } });
    const conceptos = async (id) => (await api("GET", `/api/servicios/${id}`, { token: tokens.admin })).datos;

    // Bogotá Móvil (corte general 20:40)
    const s = await api("POST", "/api/servicios", { token: tokens.op1, body: datosServicio() });
    const id = s.datos.servicio.id;
    await api("POST", `/api/servicios/${id}/finalizar`, { token: tokens.op1, body: datosFinalizar() });

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
    const lr = await api("POST", "/api/servicios", { token: tokens.op1, body: datosServicio({ cliente_id: ids.laRolita, tipo_vehiculo_id: ids.buseton }) });
    await api("POST", `/api/servicios/${lr.datos.servicio.id}/finalizar`, { token: tokens.op1, body: datosFinalizar() });
    r = await corregir(lr.datos.servicio.id, horas("18:30", "18:45", "19:30"));
    assert.strictEqual(r.status, 200, JSON.stringify(r.datos));
    d = await conceptos(lr.datos.servicio.id);
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
    await recargoNocturnoActivo(false);
    await pool.query(
      `UPDATE precios_concepto p SET recargo_desde = CASE WHEN p.cliente_id IS NULL THEN '20:40'::time ELSE p.recargo_desde END,
              recargo_hasta = CASE WHEN p.cliente_id IS NULL THEN '06:00'::time ELSE p.recargo_hasta END
       FROM conceptos_tarifa ct WHERE ct.id = p.concepto_id AND ct.es_recargo_nocturno`,
    );
    await pool.query(
      `UPDATE precios_concepto SET recargo_desde = NULL WHERE cliente_id = $1 AND concepto_id = $2`,
      [ids.bogotaMovil, ids.recargo],
    );
  }
});

test("corrección completa: cambiar la empresa y poner una tarifa manual", async () => {
  const s = await api("POST", "/api/servicios", { token: tokens.op1, body: datosServicio() }); // Bogotá Móvil, articulado
  const id = s.datos.servicio.id;
  await api("POST", `/api/servicios/${id}/finalizar`, { token: tokens.op1, body: datosFinalizar({ conceptos: [{ concepto_id: ids.cardan, cantidad: 1 }] }) });
  const corregir = async (body) => {
    const r = await api("POST", `/api/servicios/${id}/corregir`, { token: tokens.admin, body: { motivo: "Ajuste del administrador", ...body } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.datos));
    return (await api("GET", `/api/servicios/${id}`, { token: tokens.admin })).datos.servicio;
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
  const xls = await fetch(`${base}/api/exportar/tarifas?vigente_en=${ids.hoy}`, { headers: { Authorization: `Bearer ${tokens.fin}` } });
  assert.strictEqual(xls.status, 200);
  const ExcelJS = require("exceljs");
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(Buffer.from(await xls.arrayBuffer()));
  assert.deepStrictEqual(libro.worksheets.map((w) => w.name), ["Tarifa básica", "Precios de conceptos", "Pago a operadores", "Bolsa de km (Suma)"]);
  assert.ok(libro.getWorksheet("Tarifa básica").rowCount > 10);
  assert.strictEqual(libro.getWorksheet("Bolsa de km (Suma)").rowCount, 115); // encabezado + 114 celdas
  assert.strictEqual((await fetch(`${base}/api/exportar/tarifas`, { headers: { Authorization: `Bearer ${tokens.op1}` } })).status, 403);
});

test("CAPITALBUS: precio propio de conceptos; el administrador agrega 1,5 h de stand-by", async () => {
  const creado = await api("POST", "/api/servicios", {
    token: tokens.op1,
    body: datosServicio({ cliente_id: ids.capitalbus }),
  });
  const id = creado.datos.servicio.id;
  await api("POST", `/api/servicios/${id}/finalizar`, {
    token: tokens.op1,
    body: datosFinalizar({ conceptos: [{ concepto_id: ids.camara, cantidad: 2 }] }),
  });
  let admin = await api("GET", `/api/servicios/${id}`, { token: tokens.admin });
  // Cámara de freno CAPITALBUS 24.800 × 2 = 49.600
  assert.strictEqual(admin.datos.servicio.valor_conceptos, 49600);

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
  admin = await api("GET", `/api/servicios/${id}`, { token: tokens.admin });
  // + stand-by CAPITALBUS 103.100 × 1,5 h = 154.650 → 204.250
  assert.strictEqual(admin.datos.servicio.valor_conceptos, 204250);
});

test("pago al operador: 8 % por parte + bono de cardán una vez; base = valor aprobado", async () => {
  const persiana = await idDe("SELECT id FROM conceptos_tarifa WHERE nombre = $1", "Quitar persiana");
  const s = await api("POST", "/api/servicios", { token: tokens.op1, body: datosServicio() });
  const id = s.datos.servicio.id;
  await api("POST", `/api/servicios/${id}/finalizar`, {
    token: tokens.op1,
    body: datosFinalizar({
      conceptos: [
        { concepto_id: ids.cardan, cantidad: 2 },
        { concepto_id: persiana, cantidad: 1 },
        { concepto_id: ids.camara, cantidad: 2 },
      ],
    }),
  });
  // Bogotá Móvil: 393.000 + cardán 2 × 92.400 + persiana 25.700 + cámaras 2 × 25.700 = 654.900
  let d = (await api("GET", `/api/servicios/${id}`, { token: tokens.admin })).datos;
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
  d = (await api("GET", `/api/servicios/${id}`, { token: tokens.admin })).datos;
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

  const xls = await fetch(`${base}/api/exportar/pago-operadores?${q}`, { headers: { Authorization: `Bearer ${tokens.admin}` } });
  assert.strictEqual(xls.status, 200);
  assert.match(xls.headers.get("content-type"), /spreadsheetml/);

  // Regla propia de UNA parte (CAPITALBUS: persiana 10 %): las demás partes siguen con la general
  const propia = await api("POST", "/api/pago-operador", {
    token: tokens.admin,
    body: { cliente_id: ids.capitalbus, componente: "concepto", concepto_id: persiana, forma: "porcentaje", valor: 10, vigente_desde: ids.hoy },
  });
  assert.strictEqual(propia.status, 201, JSON.stringify(propia.datos));
  const cb = await api("POST", "/api/servicios", { token: tokens.op1, body: datosServicio({ cliente_id: ids.capitalbus }) });
  await api("POST", `/api/servicios/${cb.datos.servicio.id}/finalizar`, {
    token: tokens.op1,
    body: datosFinalizar({ conceptos: [{ concepto_id: persiana, cantidad: 1 }] }),
  });
  const pcb = (await api("GET", `/api/servicios/${cb.datos.servicio.id}`, { token: tokens.admin })).datos.pago_operador;
  // 8 % × 368.000 (tarifa CAPITALBUS, regla general) = 29.440 + 10 % × 24.800 (regla propia) = 2.480
  assert.strictEqual(pcb.valor, 31920);
  await api("DELETE", `/api/pago-operador/${propia.datos.regla.id}`, { token: tokens.admin, body: { motivo: "Fin de la prueba" } });
});

test("Suma: bolsa de km mensual (columna por km del mes, fila por km del servicio)", async () => {
  const suma = await idDe("SELECT id FROM clientes WHERE nit = $1", "900364615");
  const nuevo = async (extra = {}) => {
    const c = await api("POST", "/api/servicios", { token: tokens.op1, body: datosServicio({ cliente_id: suma, ...extra }) });
    assert.strictEqual(c.status, 201, JSON.stringify(c.datos));
    return c.datos.servicio.id;
  };
  const finalizar = (id, extra) => api("POST", `/api/servicios/${id}/finalizar`, { token: tokens.op1, body: datosFinalizar(extra) });
  const corregir = async (id, body) => {
    const r = await api("POST", `/api/servicios/${id}/corregir`, { token: tokens.admin, body: { motivo: "Km reales del GPS", ...body } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.datos));
  };
  const ver = async (id) => (await api("GET", `/api/servicios/${id}`, { token: tokens.admin })).datos;
  const valor = async (id) => (await ver(id)).servicio.valor_calculado;

  const mesAnterior = (await pool.query("SELECT (date_trunc('month', current_date) - interval '1 month' + interval '14 days')::date::text AS d")).rows[0].d;

  // ---- MES ABIERTO: columna provisional 1500–1800 ----
  // S1: 18 km en servicio + 2 en vacío = 20 km (fila 15,01–20)
  const s1 = await nuevo();
  await finalizar(s1);
  await corregir(s1, { km_servicio: 18, km_vacio: 2 });
  let d = await ver(s1);
  assert.strictEqual(d.servicio.valor_calculado, 434322); // columna provisional 1500–1800
  assert.strictEqual(d.servicio.bolsa_km_mes, null); // null = provisional
  assert.strictEqual(d.servicio.km_facturables, 20); // servicio + vacío

  // S3: 8 km (< 10 km → según distancia: 8 × $25.774 provisional); el cardán se registra sin cobro
  const s3 = await nuevo();
  await finalizar(s3, { conceptos: [{ concepto_id: ids.cardan, cantidad: 1 }] });
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
  await finalizar(s2);
  await corregir(s2, { fecha_servicio: mesAnterior, km_servicio: 1000 });
  assert.strictEqual(await valor(s2), null);
  assert.strictEqual(await valor(s1), 471173);
  assert.strictEqual(await valor(s3), 274920); // 8 × 34.365

  // S4 fuera de la disponibilidad: tarifa general (articulado 393.000) + cardán general (92.400); sus km NO suman a la bolsa
  const s4 = await nuevo();
  await finalizar(s4, { conceptos: [{ concepto_id: ids.cardan, cantidad: 1 }] });
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

  // Cada recálculo automático quedó en la bitácora
  const { rows } = await pool.query(
    "SELECT count(*)::int AS n FROM bitacora WHERE entidad = 'servicios' AND registro_id = $1 AND motivo LIKE 'Recálculo automático%'",
    [s3],
  );
  assert.ok(rows[0].n >= 2);
});

test("Tarifas → Bolsa de km: ver la tabla, corregir celdas, nueva vigencia y columna provisional", async () => {
  const suma = await idDe("SELECT id FROM clientes WHERE nit = $1", "900364615");
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
  const mesAnterior = (await pool.query("SELECT (date_trunc('month', current_date) - interval '1 month' + interval '14 days')::date::text AS d")).rows[0].d;
  const r4 = await api("POST", "/api/bolsa-km/versiones", {
    token: tokens.admin,
    body: { cliente_id: suma, copiar_de: "2026-01-01", vigente_desde: mesAnterior, motivo: "Tabla nueva" },
  });
  assert.strictEqual(r4.datos.codigo, "CIERRE_ANTES_DE_USO");
  const manana = (await pool.query("SELECT (current_date + 1)::text AS d")).rows[0].d;
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
  const pasado = (await pool.query("SELECT (current_date + 2)::text AS d, (current_date + 40)::text AS f")).rows[0];
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
    const c = await api("POST", "/api/servicios", { token: tokens.op1, body: datosServicio({ cliente_id: suma }) });
    await api("POST", `/api/servicios/${c.datos.servicio.id}/finalizar`, { token: tokens.op1, body: datosFinalizar() });
    await api("POST", `/api/servicios/${c.datos.servicio.id}/corregir`, { token: tokens.admin, body: { km_servicio: 20, motivo: "Km reales" } });
    const d = (await api("GET", `/api/servicios/${c.datos.servicio.id}`, { token: tokens.admin })).datos.servicio;
    assert.strictEqual(d.valor_calculado, 427741);
    const resumen = (await api("GET", `/api/bolsa-km?cliente_id=${suma}&mes=${ids.hoy.slice(0, 7)}`, { token: tokens.admin })).datos;
    assert.strictEqual(resumen.columna_provisional, "1800–2100");
    // Volver a 1800: el mes en curso se recalcula solo (20 km en 1500–1800 = 434.322)
    const r7 = await api("PATCH", "/api/bolsa-km/provisional", { token: tokens.admin, body: { cliente_id: suma, bolsa_km_provisional: 1800 } });
    assert.ok(r7.datos.recalculados >= 1);
    assert.strictEqual((await api("GET", `/api/servicios/${c.datos.servicio.id}`, { token: tokens.admin })).datos.servicio.valor_calculado, 434322);
  } finally {
    await pool.query("UPDATE clientes SET bolsa_km_provisional = 1800 WHERE id = $1", [suma]);
  }
});

test("rescate (a convenir): se marca por el tipo de servicio y queda para el administrador", async () => {
  const creado = await api("POST", "/api/servicios", {
    token: tokens.op1,
    body: datosServicio({ tipo_servicio_id: ids.rescate }),
  });
  assert.strictEqual(creado.datos.servicio.es_rescate, true); // sin que el operador lo marque
  const r = await api("POST", `/api/servicios/${creado.datos.servicio.id}/finalizar`, {
    token: tokens.op1,
    body: datosFinalizar(),
  });
  assert.strictEqual(r.status, 200, JSON.stringify(r.datos));
  assert.strictEqual(r.datos.requiere_valor_manual, true);
});

test("un operador no ve ni finaliza servicios de otro", async () => {
  const ver = await api("GET", `/api/servicios/${ids.servicio1}`, { token: tokens.op2 });
  assert.strictEqual(ver.status, 403);
  const lista = await api("GET", "/api/servicios", { token: tokens.op2 });
  assert.strictEqual(lista.datos.servicios.length, 0);
});

test("el operador no puede cambiar estados (aprobar)", async () => {
  const r = await api("PATCH", `/api/servicios/${ids.servicio1}/estado`, {
    token: tokens.op1,
    body: { estado: "en_revision" },
  });
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

  const con = await api("POST", "/api/turnos/finalizar", {
    token: tokens.op1,
    body: { justificacion: "El cliente canceló y no se pudo cerrar en el sistema" },
  });
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

  const r = await api("POST", `/api/turnos/${id}/cerrar`, {
    token: tokens.admin,
    body: { motivo: "El operador olvidó cerrar el turno" },
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.datos.turno.estado, "cerrado_admin");
});

test("panel de turnos: en curso, historial con horas y servicios, resumen por operador y Excel", async () => {
  const inicio = await api("POST", "/api/turnos/iniciar", { token: tokens.op2, body: { grua_id: ids.grua2 } });
  assert.strictEqual(inicio.status, 201, JSON.stringify(inicio.datos));
  const id = inicio.datos.turno.id;
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
  const activos = (await api("GET", `/api/turnos?operador_id=${inicio.datos.turno.operador_id}&estado=activo`, { token: tokens.admin })).datos.turnos;
  assert.deepStrictEqual(activos.map((t) => t.id), [id]);
  assert.strictEqual(activos[0].servicios, 0);
  const cerrados = (await api("GET", `/api/turnos?operador_id=${inicio.datos.turno.operador_id}&estado=cerrado_admin`, { token: tokens.admin })).datos.turnos;
  assert.ok(cerrados.length >= 1 && cerrados[0].cerrado_por_nombre);

  // Resumen por operador
  const resumen = (await api("GET", `/api/turnos/resumen?operador_id=${inicio.datos.turno.operador_id}`, { token: tokens.admin })).datos.operadores;
  assert.strictEqual(resumen.length, 1);
  assert.strictEqual(resumen[0].activos, 1);
  assert.ok(resumen[0].cerrados_admin >= 1);
  assert.ok(resumen[0].minutos >= 180);
  assert.strictEqual(resumen[0].turnos, activos.length + cerrados.length + (await api("GET", `/api/turnos?operador_id=${inicio.datos.turno.operador_id}&estado=finalizado`, { token: tokens.admin })).datos.turnos.length);

  // Excel
  const xls = await fetch(`${base}/api/exportar/turnos?operador_id=${inicio.datos.turno.operador_id}`, { headers: { Authorization: `Bearer ${tokens.admin}` } });
  assert.strictEqual(xls.status, 200);
  const ExcelJS = require("exceljs");
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(Buffer.from(await xls.arrayBuffer()));
  assert.strictEqual(libro.getWorksheet("Turnos").rowCount, resumen[0].turnos + 2); // encabezado + turnos + TOTAL
  assert.strictEqual((await fetch(`${base}/api/exportar/turnos`, { headers: { Authorization: `Bearer ${tokens.fin}` } })).status, 403);

  await api("POST", `/api/turnos/${id}/cerrar`, { token: tokens.admin, body: { motivo: "Fin de la prueba del panel" } });
});

test("cobro mensual: resumen por empresa, Excel como el que se envía y órdenes en PDF", async () => {
  const ExcelJS = require("exceljs");
  const mes = ids.hoy.slice(0, 7);
  const mesAnterior = (await pool.query("SELECT to_char(current_date - interval '1 month', 'YYYY-MM') AS m")).rows[0].m;
  assert.strictEqual((await api("GET", `/api/cobro?mes=${mes}`, { token: tokens.op1 })).status, 403);

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
    const r = await fetch(`${base}${ruta}`, { headers: { Authorization: `Bearer ${tokens.admin}` } });
    assert.strictEqual(r.status, 200, ruta);
    return { r, buffer: Buffer.from(await r.arrayBuffer()) };
  };
  let { r, buffer } = await bajar(`/api/exportar/cobro?mes=${mes}`);
  assert.match(r.headers.get("content-disposition"), /Servicios de gruas cobro\.xlsx/);
  let libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer);
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

  // Stand-by, kit y reiniciada: cada uno en su columna (servicio de CAPITALBUS aprobado)
  const kit = await idDe("SELECT id FROM conceptos_tarifa WHERE nombre = $1", "Uso de kit antiderrames");
  const reiniciada = await idDe("SELECT id FROM conceptos_tarifa WHERE nombre = $1", "Reiniciada");
  // El operador 1 cerró su turno en una prueba anterior: abre uno para este servicio
  const turno = await api("POST", "/api/turnos/iniciar", { token: tokens.op1, body: { grua_id: ids.grua1 } });
  assert.strictEqual(turno.status, 201, JSON.stringify(turno.datos));
  const sc = await api("POST", "/api/servicios", { token: tokens.op1, body: datosServicio({ cliente_id: ids.capitalbus }) });
  assert.strictEqual(sc.status, 201, JSON.stringify(sc.datos));
  const idSc = sc.datos.servicio.id;
  await api("POST", `/api/servicios/${idSc}/finalizar`, { token: tokens.op1, body: datosFinalizar() });
  await api("POST", "/api/turnos/finalizar", { token: tokens.op1, body: { observaciones: "Fin de la prueba del cobro" } });
  const corr = await api("POST", `/api/servicios/${idSc}/corregir`, {
    token: tokens.admin,
    body: {
      motivo: "Adicionales reportados",
      conceptos: [
        { concepto_id: ids.standby, cantidad: 1.5 },
        { concepto_id: kit, cantidad: 1 },
        { concepto_id: reiniciada, cantidad: 1 },
      ],
    },
  });
  assert.strictEqual(corr.status, 200, JSON.stringify(corr.datos));
  await api("POST", `/api/servicios/${idSc}/aprobar`, { token: tokens.admin, body: {} });
  ({ buffer } = await bajar(`/api/exportar/cobro?mes=${mes}&cliente_id=${ids.capitalbus}`));
  const libroCb = new ExcelJS.Workbook();
  await libroCb.xlsx.load(buffer);
  const hc = libroCb.getWorksheet("CAPITALBUS");
  const encCb = hc.getRow(2).values;
  const filaCb = [...Array(hc.rowCount).keys()].map((k) => hc.getRow(k + 1)).find((f) => String(f.getCell(2).value) === String(sc.datos.servicio.numero_orden));
  const valor = (titulo) => filaCb.getCell(encCb.indexOf(titulo)).value;
  assert.strictEqual(valor("Hora Stand By"), 154650); // 103.100 × 1,5 h (precio CAPITALBUS)
  assert.strictEqual(valor("Kit antiderrames"), 110500);
  assert.strictEqual(valor("Reiniciada"), 206000);
  assert.strictEqual(valor("Tal.Tarifa a cobrar").result, 368000 + 154650 + 110500 + 206000);
  const colTotal = encabezados.indexOf("Tal.Tarifa a cobrar") + 1;
  const filaSub = 3 + bogota.cantidad;
  assert.strictEqual(hoja.getCell(filaSub, colTotal - 1).value, "Sub Total");
  assert.strictEqual(hoja.getCell(filaSub, colTotal).value.result, bogota.subtotal);
  assert.strictEqual(hoja.getCell(filaSub + 2, colTotal).value.result, bogota.total);
  // El aprobado con descuento queda anotado
  assert.ok(Array.from({ length: bogota.cantidad }, (_, k) => String(hoja.getCell(3 + k, encabezados.length).value)).some((o) => o.includes("ajuste")));

  // Suma (mes anterior): columna KM y resumen por grúa
  const suma = await idDe("SELECT id FROM clientes WHERE nit = $1", "900364615");
  ({ buffer } = await bajar(`/api/exportar/cobro?mes=${mesAnterior}&cliente_id=${suma}&incluir_sin_aprobar=true`));
  libro = new ExcelJS.Workbook();
  await libro.xlsx.load(buffer);
  const hs = libro.getWorksheet("SUMA");
  assert.ok(hs.getRow(2).values.includes("KM"));
  let hayResumenGruas = false;
  hs.eachRow((row) => row.eachCell((c) => (hayResumenGruas ||= c.value === "Total general")));
  assert.ok(hayResumenGruas);

  // Órdenes de servicio en PDF del mismo cobro
  ({ r, buffer } = await bajar(`/api/exportar/cobro-ordenes?mes=${mes}&cliente_id=${bogota.cliente_id}`));
  assert.match(r.headers.get("content-type"), /application\/pdf/);
  assert.strictEqual(Number(buffer.toString("latin1").match(/\/Type \/Pages[\s\S]*?\/Count (\d+)/)?.[1]), bogota.cantidad);
});

test("cada operación importante quedó en la bitácora", async () => {
  const { rows } = await pool.query("SELECT DISTINCT operacion FROM bitacora ORDER BY 1");
  const operaciones = rows.map((r) => r.operacion);
  for (const op of ["cerrar_turno", "crear", "finalizar", "finalizar_turno", "iniciar_turno"]) {
    assert.ok(operaciones.includes(op), `Falta "${op}" en bitácora`);
  }
});
