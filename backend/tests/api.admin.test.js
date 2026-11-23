/**
 * Pruebas de la API del ADMINISTRADOR: catálogos, grúas, usuarios, tarifas,
 * aprobación, correcciones, dashboard y bitácora.
 *
 * Cada corrida crea sus propios datos con un sufijo único (cliente, grúa,
 * usuario), así no choca con datos de corridas anteriores.
 * Requisito: "npm run test:preparar" (una vez).
 */
require("./entorno");
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const { pool } = require("../config/db");
const { crearApp } = require("../app");

const PASSWORD = "Grualink2026*"; // PASSWORD_PRUEBA de seeds/seed.js
const SUFIJO = String(Date.now()).slice(-7);
let servidor;
let base;
const tk = {};
const ids = {};

async function api(metodo, ruta, { token, body } = {}) {
  const r = await fetch(`${base}${ruta}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const texto = await r.text();
  return { status: r.status, datos: texto ? JSON.parse(texto) : null };
}

async function login(email, password = PASSWORD) {
  const r = await api("POST", "/api/auth/login", { body: { email, password } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.datos));
  return r.datos.token;
}

async function idDe(sql, valor) {
  const { rows } = await pool.query(sql, [valor]);
  assert.ok(rows[0], `No encontrado: ${valor}`);
  return rows[0].id;
}

const haceMinutos = (min) => new Date(Date.now() - min * 60000).toISOString();

before(async () => {
  // Servicios que terminan "hace minutos": de noche el recargo automático
  // cambiaría los valores esperados. Se desactiva durante estas pruebas.
  await pool.query("UPDATE conceptos_tarifa SET activo = FALSE WHERE es_recargo_nocturno");
  // Que los operadores de prueba no tengan turnos abiertos de otras corridas
  await pool.query(
    `UPDATE turnos_operador SET estado = 'finalizado', fin = now()
     WHERE estado = 'activo' AND operador_id IN
       (SELECT id FROM usuarios WHERE email LIKE '%@grualink.test')`,
  );
  servidor = crearApp().listen(0);
  base = `http://127.0.0.1:${servidor.address().port}`;
  tk.admin = await login("admin@grualink.test");
  tk.op = await login("operador2@grualink.test");
  tk.fin = await login("financiero@grualink.test");
  ids.adminId = await idDe("SELECT id FROM usuarios WHERE email = $1", "admin@grualink.test");
  ids.opId = await idDe("SELECT id FROM usuarios WHERE email = $1", "operador2@grualink.test");
  ids.articulado = await idDe("SELECT id FROM tipos_vehiculo WHERE nombre = $1", "Articulado");
  ids.remolque = await idDe("SELECT id FROM tipos_servicio WHERE nombre = $1", "Remolque");
  ids.rescate = await idDe("SELECT id FROM tipos_servicio WHERE nombre = $1", "Rescate");
  ids.cardan = await idDe("SELECT id FROM conceptos_tarifa WHERE nombre = $1", "Desmontar cardán");
  ids.hoy = (await pool.query("SELECT current_date::text AS d")).rows[0].d;
  ids.ayer = (await pool.query("SELECT (current_date - 1)::text AS d")).rows[0].d;
});

after(async () => {
  // Ver api.operador.test.js: el recargo nocturno se desactiva durante las pruebas
  await pool.query("UPDATE conceptos_tarifa SET activo = TRUE WHERE es_recargo_nocturno");
  servidor?.close();
  await pool.end();
});

// ---------- Permisos ----------

test("permisos: operador sin acceso a administración; financiero solo lectura", async () => {
  assert.strictEqual((await api("GET", "/api/clientes", { token: tk.op })).status, 403);
  assert.strictEqual((await api("GET", "/api/dashboard/resumen", { token: tk.op })).status, 403);
  assert.strictEqual((await api("GET", "/api/clientes", { token: tk.fin })).status, 200);
  assert.strictEqual((await api("GET", "/api/tarifas", { token: tk.fin })).status, 200);
  assert.strictEqual((await api("GET", "/api/dashboard/resumen", { token: tk.fin })).status, 200);
  assert.strictEqual((await api("POST", "/api/clientes", { token: tk.fin, body: { razon_social: "X", nit: "123456" } })).status, 403);
  assert.strictEqual((await api("GET", "/api/usuarios", { token: tk.fin })).status, 403);
  assert.strictEqual((await api("GET", "/api/bitacora", { token: tk.fin })).status, 403);
});

// ---------- Clientes ----------

test("clientes: crear, NIT normalizado, duplicado y edición con bitácora", async () => {
  const nit = `9${SUFIJO}`;
  const r = await api("POST", "/api/clientes", {
    token: tk.admin,
    body: { razon_social: `Cliente Prueba ${SUFIJO} SAS`, nit: `${nit.slice(0, 3)}.${nit.slice(3)}`, nombre_comercial: `PRUEBA ${SUFIJO}`, email: "" },
  });
  assert.strictEqual(r.status, 201, JSON.stringify(r.datos));
  assert.strictEqual(r.datos.cliente.nit, nit); // sin puntos
  assert.strictEqual(r.datos.cliente.email, null); // "" → null
  ids.cliente = r.datos.cliente.id;

  const dup = await api("POST", "/api/clientes", { token: tk.admin, body: { razon_social: "Otro", nit } });
  assert.strictEqual(dup.status, 409);
  assert.strictEqual(dup.datos.codigo, "DUPLICADO");

  const vacio = await api("PATCH", `/api/clientes/${ids.cliente}`, { token: tk.admin, body: { motivo: "nada" } });
  assert.strictEqual(vacio.status, 422);

  const edit = await api("PATCH", `/api/clientes/${ids.cliente}`, {
    token: tk.admin,
    body: { telefono: "3001234567", motivo: "Actualización de datos de contacto" },
  });
  assert.strictEqual(edit.status, 200);
  const bit = await api("GET", `/api/bitacora?entidad=clientes&registro_id=${ids.cliente}`, { token: tk.admin });
  const act = bit.datos.registros.find((b) => b.operacion === "actualizar");
  assert.deepStrictEqual(act.valores_anteriores, { telefono: null });
  assert.deepStrictEqual(act.valores_nuevos, { telefono: "3001234567" });
  assert.strictEqual(act.motivo, "Actualización de datos de contacto");

  const busca = await api("GET", `/api/clientes?buscar=${SUFIJO}`, { token: tk.admin });
  assert.strictEqual(busca.datos.clientes.length, 1);
});

// ---------- Grúas ----------

test("grúas: crear registra historial; cambio de estado exige motivo", async () => {
  const r = await api("POST", "/api/gruas", {
    token: tk.admin,
    body: { placa: `t${SUFIJO.slice(-5)}`, numero_interno: `T${SUFIJO}` },
  });
  assert.strictEqual(r.status, 201, JSON.stringify(r.datos));
  ids.grua = r.datos.grua.id;

  const sinMotivo = await api("POST", `/api/gruas/${ids.grua}/estado`, { token: tk.admin, body: { estado: "mantenimiento" } });
  assert.strictEqual(sinMotivo.status, 422);

  const mant = await api("POST", `/api/gruas/${ids.grua}/estado`, {
    token: tk.admin,
    body: { estado: "mantenimiento", motivo: "Cambio de aceite" },
  });
  assert.strictEqual(mant.datos.grua.estado, "mantenimiento");

  // En mantenimiento no se puede iniciar turno con ella
  const turno = await api("POST", "/api/turnos/iniciar", { token: tk.op, body: { grua_id: ids.grua } });
  assert.strictEqual(turno.datos.codigo, "GRUA_NO_DISPONIBLE");

  await api("POST", `/api/gruas/${ids.grua}/estado`, { token: tk.admin, body: { estado: "activa", motivo: "Sale de taller" } });
  const hist = await api("GET", `/api/gruas/${ids.grua}/historial`, { token: tk.admin });
  assert.deepStrictEqual(hist.datos.historial.map((h) => h.estado), ["activa", "mantenimiento", "activa"]);
});

// ---------- Usuarios ----------

test("usuarios: crear, nunca devuelve la contraseña, reglas de desactivación", async () => {
  const email = `nuevo${SUFIJO}@grualink.test`;
  const debil = await api("POST", "/api/usuarios", {
    token: tk.admin,
    body: { nombre: "Nuevo", email, rol: "operador", password: "abc" },
  });
  assert.strictEqual(debil.status, 422);

  const r = await api("POST", "/api/usuarios", {
    token: tk.admin,
    body: { nombre: "Operador Nuevo", email: email.toUpperCase(), rol: "operador", password: "Clave12345" },
  });
  assert.strictEqual(r.status, 201, JSON.stringify(r.datos));
  assert.strictEqual(r.datos.usuario.email, email); // minúsculas
  assert.strictEqual(r.datos.usuario.password_hash, undefined);
  const nuevoId = r.datos.usuario.id;

  const lista = await api("GET", "/api/usuarios", { token: tk.admin });
  assert.ok(lista.datos.usuarios.every((u) => u.password_hash === undefined));

  const tokenNuevo = await login(email, "Clave12345");

  const yoMismo = await api("PATCH", `/api/usuarios/${ids.adminId}`, { token: tk.admin, body: { activo: false } });
  assert.strictEqual(yoMismo.datos.codigo, "NO_AUTODESACTIVAR");

  const des = await api("PATCH", `/api/usuarios/${nuevoId}`, {
    token: tk.admin,
    body: { activo: false, motivo: "Retiro de la empresa" },
  });
  assert.strictEqual(des.status, 200);
  // Su sesión quedó cerrada
  assert.strictEqual((await api("GET", "/api/auth/yo", { token: tokenNuevo })).status, 401);

  const bit = await pool.query(
    "SELECT valores_nuevos::text AS t FROM bitacora WHERE entidad = 'usuarios' AND registro_id = $1",
    [nuevoId],
  );
  assert.ok(bit.rows.every((b) => !b.t.includes("password_hash") && !b.t.includes("$2b$")));
});

// ---------- Tarifas ----------

test("tarifas: crear para el cliente, superposición rechazada, precio de concepto", async () => {
  const t = await api("POST", "/api/tarifas", {
    token: tk.admin,
    body: {
      cliente_id: ids.cliente,
      tipo_vehiculo_id: ids.articulado,
      tipo_servicio_id: ids.remolque,
      km_desde: 0,
      km_hasta: null,
      valor: 500000,
      vigente_desde: "2026-01-01",
    },
  });
  assert.strictEqual(t.status, 201, JSON.stringify(t.datos));
  ids.tarifa = t.datos.tarifa.id;

  const cruce = await api("POST", "/api/tarifas", {
    token: tk.admin,
    body: {
      cliente_id: ids.cliente,
      tipo_vehiculo_id: ids.articulado,
      tipo_servicio_id: ids.remolque,
      valor: 1,
      vigente_desde: "2026-06-01",
      vigente_hasta: "2026-12-31",
    },
  });
  assert.strictEqual(cruce.status, 409);
  assert.strictEqual(cruce.datos.codigo, "SUPERPOSICION");

  const malRango = await api("POST", "/api/tarifas", {
    token: tk.admin,
    body: { cliente_id: ids.cliente, tipo_vehiculo_id: ids.articulado, tipo_servicio_id: ids.rescate, km_desde: 10, km_hasta: 5, valor: 1, vigente_desde: "2026-01-01" },
  });
  assert.strictEqual(malRango.datos.codigo, "RANGO_KM_INVALIDO");

  const p = await api("POST", "/api/precios-concepto", {
    token: tk.admin,
    body: { concepto_id: ids.cardan, cliente_id: ids.cliente, valor: 80000, vigente_desde: "2026-01-01" },
  });
  assert.strictEqual(p.status, 201, JSON.stringify(p.datos));
  ids.precio = p.datos.precio.id;

  const lista = await api("GET", `/api/tarifas?cliente_id=${ids.cliente}&vigente_en=${ids.hoy}`, { token: tk.fin });
  assert.strictEqual(lista.datos.tarifas.length, 1);
  assert.strictEqual(lista.datos.tarifas[0].usada, false);
});

// ---------- Flujo completo: servicio → corrección → aprobación ----------

test("servicio del cliente nuevo usa SU tarifa y SU precio de concepto", async () => {
  const turno = await api("POST", "/api/turnos/iniciar", { token: tk.op, body: { grua_id: ids.grua } });
  assert.strictEqual(turno.status, 201, JSON.stringify(turno.datos));

  const s = await api("POST", "/api/servicios", {
    token: tk.op,
    body: {
      cliente_id: ids.cliente,
      tipo_vehiculo_id: ids.articulado,
      tipo_servicio_id: ids.remolque,
      placa_vehiculo: "ABC123",
      fecha_servicio: ids.hoy,
      hora_solicitud: haceMinutos(120),
      inicio_servicio: haceMinutos(90),
    },
  });
  assert.strictEqual(s.status, 201, JSON.stringify(s.datos));
  ids.servicio = s.datos.servicio.id;

  const f = await api("POST", `/api/servicios/${ids.servicio}/finalizar`, {
    token: tk.op,
    body: { fin_servicio: haceMinutos(10), km_vacio: 2, km_servicio: 8, entregado_sin_novedad: true, conceptos: [{ concepto_id: ids.cardan, cantidad: 1 }] },
  });
  assert.strictEqual(f.status, 200, JSON.stringify(f.datos));

  const d = await api("GET", `/api/servicios/${ids.servicio}`, { token: tk.admin });
  assert.strictEqual(d.datos.servicio.valor_tarifa_basica, 500000);
  assert.strictEqual(d.datos.servicio.valor_conceptos, 80000);
  assert.strictEqual(d.datos.servicio.valor_calculado, 580000);
});

test("una tarifa ya usada no se modifica ni se borra; solo se cierra su vigencia", async () => {
  const cambio = await api("PATCH", `/api/tarifas/${ids.tarifa}`, { token: tk.admin, body: { valor: 1 } });
  assert.strictEqual(cambio.datos.codigo, "TARIFA_EN_USO");

  const borrar = await api("DELETE", `/api/tarifas/${ids.tarifa}`, { token: tk.admin, body: { motivo: "prueba de borrado" } });
  assert.strictEqual(borrar.datos.codigo, "TARIFA_EN_USO");

  const cierreAntes = await api("PATCH", `/api/tarifas/${ids.tarifa}`, { token: tk.admin, body: { vigente_hasta: ids.ayer } });
  assert.strictEqual(cierreAntes.datos.codigo, "CIERRE_ANTES_DE_USO");

  const precioUsado = await api("PATCH", `/api/precios-concepto/${ids.precio}`, { token: tk.admin, body: { valor: 1 } });
  assert.strictEqual(precioUsado.datos.codigo, "TARIFA_EN_USO");
});

test("no se puede mandar a taller una grúa en turno, ni desactivar a un operador en turno", async () => {
  const g = await api("POST", `/api/gruas/${ids.grua}/estado`, { token: tk.admin, body: { estado: "mantenimiento", motivo: "Revisión" } });
  assert.strictEqual(g.datos.codigo, "GRUA_EN_TURNO");
  const u = await api("PATCH", `/api/usuarios/${ids.opId}`, { token: tk.admin, body: { activo: false } });
  assert.strictEqual(u.datos.codigo, "USUARIO_EN_TURNO");
});

test("corrección autorizada: recalcula valores y deja anteriores/nuevos en bitácora", async () => {
  const op = await api("POST", `/api/servicios/${ids.servicio}/corregir`, { token: tk.op, body: { km_servicio: 1, motivo: "intento" } });
  assert.strictEqual(op.status, 403);

  const sinMotivo = await api("POST", `/api/servicios/${ids.servicio}/corregir`, { token: tk.admin, body: { km_servicio: 9 } });
  assert.strictEqual(sinMotivo.status, 422);

  const r = await api("POST", `/api/servicios/${ids.servicio}/corregir`, {
    token: tk.admin,
    body: { km_servicio: 9.5, conceptos: [{ concepto_id: ids.cardan, cantidad: 2 }], motivo: "Remisión en papel indica 2 cardanes" },
  });
  assert.strictEqual(r.status, 200, JSON.stringify(r.datos));
  assert.strictEqual(r.datos.servicio.valor_calculado, 660000); // 500.000 + 2 × 80.000
  assert.strictEqual(r.datos.servicio.km_servicio, 9.5);

  const bit = await api("GET", `/api/bitacora?entidad=servicios&registro_id=${ids.servicio}&operacion=autorizar_correccion`, { token: tk.admin });
  const reg = bit.datos.registros[0];
  assert.strictEqual(reg.valores_anteriores.valor_calculado, 580000);
  assert.strictEqual(reg.valores_nuevos.valor_calculado, 660000);
  assert.strictEqual(reg.valores_anteriores.conceptos[0].cantidad, 1);
  assert.strictEqual(reg.valores_nuevos.conceptos[0].cantidad, 2);
  assert.strictEqual(reg.motivo, "Remisión en papel indica 2 cardanes");
});

test("aprobación: valor distinto exige motivo; aprobado ya no se corrige", async () => {
  const directo = await api("PATCH", `/api/servicios/${ids.servicio}/estado`, { token: tk.admin, body: { estado: "aprobado" } });
  assert.strictEqual(directo.datos.codigo, "USE_APROBAR");

  const rev = await api("PATCH", `/api/servicios/${ids.servicio}/estado`, { token: tk.admin, body: { estado: "en_revision" } });
  assert.strictEqual(rev.datos.servicio.estado, "en_revision");

  const sinMotivo = await api("POST", `/api/servicios/${ids.servicio}/aprobar`, { token: tk.admin, body: { valor_aprobado: 650000 } });
  assert.strictEqual(sinMotivo.datos.codigo, "MOTIVO_OBLIGATORIO");

  const ok = await api("POST", `/api/servicios/${ids.servicio}/aprobar`, {
    token: tk.admin,
    body: { valor_aprobado: 650000, motivo: "Descuento acordado con el cliente" },
  });
  assert.strictEqual(ok.status, 200, JSON.stringify(ok.datos));
  assert.strictEqual(ok.datos.servicio.estado, "aprobado");
  assert.strictEqual(ok.datos.servicio.valor_aprobado, 650000);
  assert.strictEqual(ok.datos.servicio.aprobado_por, ids.adminId);

  const corr = await api("POST", `/api/servicios/${ids.servicio}/corregir`, { token: tk.admin, body: { km_servicio: 1, motivo: "Después de aprobado" } });
  assert.strictEqual(corr.datos.codigo, "NO_CORREGIBLE");
});

test("rescate (a convenir): aprobar exige indicar el valor", async () => {
  const s = await api("POST", "/api/servicios", {
    token: tk.op,
    body: {
      cliente_id: ids.cliente,
      tipo_vehiculo_id: ids.articulado,
      tipo_servicio_id: ids.rescate,
      es_rescate: true,
      placa_vehiculo: "XYZ987",
      fecha_servicio: ids.hoy,
      inicio_servicio: haceMinutos(60),
    },
  });
  ids.rescateServicio = s.datos.servicio.id;
  await api("POST", `/api/servicios/${ids.rescateServicio}/finalizar`, {
    token: tk.op,
    body: { fin_servicio: haceMinutos(5), km_vacio: 0, km_servicio: 3, entregado_sin_novedad: true },
  });

  const sinValor = await api("POST", `/api/servicios/${ids.rescateServicio}/aprobar`, { token: tk.admin, body: {} });
  assert.strictEqual(sinValor.datos.codigo, "VALOR_OBLIGATORIO");
  const ok = await api("POST", `/api/servicios/${ids.rescateServicio}/aprobar`, { token: tk.admin, body: { valor_aprobado: 900000 } });
  assert.strictEqual(ok.status, 200, JSON.stringify(ok.datos));
});

test("anular exige motivo", async () => {
  const s = await api("POST", "/api/servicios", {
    token: tk.op,
    body: { cliente_id: ids.cliente, tipo_vehiculo_id: ids.articulado, tipo_servicio_id: ids.remolque, placa_vehiculo: "AAA111", fecha_servicio: ids.hoy },
  });
  const sin = await api("PATCH", `/api/servicios/${s.datos.servicio.id}/estado`, { token: tk.admin, body: { estado: "anulado" } });
  assert.strictEqual(sin.datos.codigo, "MOTIVO_OBLIGATORIO");
  const con = await api("PATCH", `/api/servicios/${s.datos.servicio.id}/estado`, {
    token: tk.admin,
    body: { estado: "anulado", motivo: "Servicio duplicado" },
  });
  assert.strictEqual(con.datos.servicio.estado, "anulado");
});

// ---------- Dashboard y reportes ----------

test("dashboard: indicadores reales desde SQL, filtrados por cliente", async () => {
  const r = await api("GET", `/api/dashboard/resumen?cliente_id=${ids.cliente}`, { token: tk.fin });
  assert.strictEqual(r.status, 200);
  const s = r.datos.servicios;
  assert.strictEqual(s.total, 3);
  assert.strictEqual(s.aprobados, 2);
  assert.strictEqual(s.anulados, 1);
  assert.strictEqual(s.valor_calculado, 660000); // el rescate no tiene calculado; el anulado no suma
  assert.strictEqual(s.valor_aprobado, 1550000); // 650.000 + 900.000
  assert.ok(s.reaccion_promedio_min >= 29 && s.reaccion_promedio_min <= 31);
  assert.ok(r.datos.flota.total >= 1);
  assert.strictEqual(r.datos.por_dia.length, 1);

  const porOp = await api("GET", `/api/dashboard/por/operador?cliente_id=${ids.cliente}`, { token: tk.fin });
  assert.strictEqual(porOp.datos.filas.length, 1);
  assert.strictEqual(porOp.datos.filas[0].servicios, 3);
});

test("exportar a Excel: mismos servicios del filtro, fechas reales, totales y anulados sin valor", async () => {
  const ExcelJS = require("exceljs");
  const descargar = async (ruta, token) => {
    const r = await fetch(`${base}${ruta}`, { headers: { Authorization: `Bearer ${token}` } });
    return { status: r.status, tipo: r.headers.get("content-type"), nombre: r.headers.get("content-disposition"), buffer: Buffer.from(await r.arrayBuffer()) };
  };

  // El operador no puede exportar
  assert.strictEqual((await descargar(`/api/exportar/servicios?cliente_id=${ids.cliente}`, tk.op)).status, 403);

  // El financiero sí
  const r = await descargar(`/api/exportar/servicios?cliente_id=${ids.cliente}&desde=${ids.hoy}&hasta=${ids.hoy}`, tk.fin);
  assert.strictEqual(r.status, 200);
  assert.match(r.tipo, /spreadsheetml/);
  assert.match(r.nombre, /GruaLink_servicios_.*\.xlsx/);

  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(r.buffer);
  const hoja = libro.getWorksheet("Servicios");
  // Una sola hoja: los trabajos adicionales van en columnas de la misma fila
  assert.strictEqual(libro.worksheets.length, 1);
  const titulos = hoja.getRow(1).values;
  const col = (t) => titulos.indexOf(t);

  // 3 servicios del cliente de prueba + encabezado + fila TOTAL
  assert.strictEqual(hoja.rowCount, 5);
  const filas = [2, 3, 4].map((n) => hoja.getRow(n));
  const porEstado = Object.fromEntries(filas.map((f) => [f.getCell(col("Estado")).value, f]));
  assert.ok(porEstado.Aprobado && porEstado.Anulado);

  // Fecha como fecha real de Excel (no texto)
  assert.ok(filas[0].getCell(col("Fecha")).value instanceof Date);
  // El anulado no lleva dinero
  assert.strictEqual(porEstado.Anulado.getCell(col("Valor calculado")).value, null);
  // Valor aprobado del servicio corregido y aprobado en esta corrida: 650.000
  const aprobados = filas.map((f) => f.getCell(col("Valor aprobado")).value).filter((v) => v !== null);
  assert.ok(aprobados.includes(650000));
  // Fila de totales con fórmula
  const total = hoja.getRow(5);
  assert.strictEqual(total.getCell(1).value, "TOTAL");
  assert.match(total.getCell(col("Valor aprobado")).value.formula, /SUBTOTAL\(9,/);

  // Trabajos adicionales en columnas: el servicio corregido lleva 2 cardanes (2 × 80.000)
  const cCant = col("Desmontar cardán (cant. evento)");
  const cValor = col("Desmontar cardán ($)");
  assert.ok(cCant > 0 && cValor === cCant + 1, `columnas de conceptos: ${titulos.join(" | ")}`);
  const conCardan = filas.find((f) => f.getCell(cCant).value !== null);
  assert.strictEqual(conCardan.getCell(cCant).value, 2);
  assert.strictEqual(conCardan.getCell(cValor).value, 160000);
  assert.strictEqual(conCardan.getCell(col("Total adicionales")).value, 160000);
  assert.match(total.getCell(cValor).value.formula, /SUBTOTAL\(9,/);

  // Promedio de grúas
  const p = await descargar(`/api/exportar/promedio-gruas?desde=${ids.ayer}&hasta=${ids.hoy}`, tk.admin);
  assert.strictEqual(p.status, 200);
  const libroP = new ExcelJS.Workbook();
  await libroP.xlsx.load(p.buffer);
  assert.strictEqual(libroP.getWorksheet("Promedio de grúas").rowCount, 3); // encabezado + 2 días
});

test("órdenes de servicio en PDF: masivo con filtros e individual", async () => {
  const descargar = async (ruta, token) => {
    const r = await fetch(`${base}${ruta}`, { headers: { Authorization: `Bearer ${token}` } });
    return { status: r.status, tipo: r.headers.get("content-type"), nombre: r.headers.get("content-disposition"), buffer: Buffer.from(await r.arrayBuffer()) };
  };
  const paginas = (buf) => Number(buf.toString("latin1").match(/\/Type \/Pages[\s\S]*?\/Count (\d+)/)?.[1]);

  // El operador no puede descargar órdenes
  assert.strictEqual((await descargar(`/api/exportar/ordenes/${ids.servicio}`, tk.op)).status, 403);

  // Masivo: los 3 servicios del cliente de prueba → 3 páginas
  const m = await descargar(`/api/exportar/ordenes?cliente_id=${ids.cliente}`, tk.admin);
  assert.strictEqual(m.status, 200);
  assert.match(m.tipo, /application\/pdf/);
  assert.match(m.nombre, /GruaLink_ordenes_.*\.pdf/);
  assert.strictEqual(m.buffer.subarray(0, 5).toString(), "%PDF-");
  assert.strictEqual(paginas(m.buffer), 3);

  // Individual (financiero): 1 página, nombre con el número de orden
  const u = await descargar(`/api/exportar/ordenes/${ids.servicio}`, tk.fin);
  assert.strictEqual(u.status, 200);
  assert.match(u.nombre, /Orden_\w+\.pdf/);
  assert.strictEqual(paginas(u.buffer), 1);

  // Sin resultados o id inválido
  assert.strictEqual((await descargar("/api/exportar/ordenes/999999999", tk.admin)).status, 404);
  assert.strictEqual((await descargar("/api/exportar/ordenes/abc", tk.admin)).status, 422);
  assert.strictEqual((await descargar("/api/exportar/ordenes?desde=2001-01-01&hasta=2001-01-02", tk.admin)).status, 404);
});

test("promedio de grúas por día", async () => {
  const r = await api("GET", `/api/dashboard/promedio-gruas?desde=${ids.ayer}&hasta=${ids.hoy}`, { token: tk.admin });
  assert.strictEqual(r.status, 200, JSON.stringify(r.datos));
  assert.strictEqual(r.datos.dias.length, 2);
  const hoy = r.datos.dias.find((d) => d.fecha === ids.hoy);
  assert.ok(hoy.en_operacion >= 1); // la grúa de prueba está en turno hoy
  assert.ok(hoy.total >= 1);
  assert.ok(hoy.disponibilidad >= 0 && hoy.disponibilidad <= 100);

  const largo = await api("GET", "/api/dashboard/promedio-gruas?desde=2024-01-01&hasta=2026-01-01", { token: tk.admin });
  assert.strictEqual(largo.datos.codigo, "RANGO_MUY_LARGO");
});

test("bitácora del servicio: historia completa en orden", async () => {
  const r = await api("GET", `/api/bitacora?entidad=servicios&registro_id=${ids.servicio}`, { token: tk.admin });
  const ops = r.datos.registros.map((b) => b.operacion).reverse();
  assert.deepStrictEqual(ops, ["crear", "finalizar", "autorizar_correccion", "actualizar", "aprobar"]);
});

test("aprobado: reabrir (vuelve a revisión) y anular, solo administrador y con motivo", async () => {
  const estado = (id, token, body) => api("PATCH", `/api/servicios/${id}/estado`, { token, body });

  // El financiero (solo consulta) no puede
  assert.strictEqual((await estado(ids.rescateServicio, tk.fin, { estado: "en_revision", motivo: "Intento" })).status, 403);

  // Reabrir exige motivo
  const sinMotivo = await estado(ids.rescateServicio, tk.admin, { estado: "en_revision" });
  assert.strictEqual(sinMotivo.datos.codigo, "MOTIVO_OBLIGATORIO");

  // Reabrir: vuelve a revisión y se quita la aprobación
  const re = await estado(ids.rescateServicio, tk.admin, { estado: "en_revision", motivo: "El cliente reportó km adicionales" });
  assert.strictEqual(re.status, 200, JSON.stringify(re.datos));
  assert.strictEqual(re.datos.servicio.estado, "en_revision");
  assert.strictEqual(re.datos.servicio.valor_aprobado, null);
  assert.strictEqual(re.datos.servicio.aprobado_por, null);

  // La bitácora guarda la aprobación anterior
  const bit = await api("GET", `/api/bitacora?entidad=servicios&registro_id=${ids.rescateServicio}&operacion=reabrir`, { token: tk.admin });
  const reg = bit.datos.registros[0];
  assert.strictEqual(reg.valores_anteriores.estado, "aprobado");
  assert.strictEqual(Number(reg.valores_anteriores.valor_aprobado), 900000);
  assert.strictEqual(reg.motivo, "El cliente reportó km adicionales");

  // Ya se puede corregir y aprobar otra vez
  const corr = await api("POST", `/api/servicios/${ids.rescateServicio}/corregir`, { token: tk.admin, body: { km_servicio: 5, motivo: "Km reales" } });
  assert.strictEqual(corr.status, 200, JSON.stringify(corr.datos));
  const ap = await api("POST", `/api/servicios/${ids.rescateServicio}/aprobar`, { token: tk.admin, body: { valor_aprobado: 950000, motivo: "Ajuste por km" } });
  assert.strictEqual(ap.datos.servicio.estado, "aprobado");
  assert.strictEqual(ap.datos.servicio.valor_aprobado, 950000);

  // Anular un aprobado: exige motivo y conserva los datos de la aprobación
  assert.strictEqual((await estado(ids.servicio, tk.admin, { estado: "anulado" })).datos.codigo, "MOTIVO_OBLIGATORIO");
  const an = await estado(ids.servicio, tk.admin, { estado: "anulado", motivo: "Servicio facturado por error" });
  assert.strictEqual(an.datos.servicio.estado, "anulado");
  assert.strictEqual(an.datos.servicio.valor_aprobado, 650000);

  // Un anulado ya no cambia
  assert.strictEqual((await estado(ids.servicio, tk.admin, { estado: "en_revision", motivo: "Reabrir anulado" })).datos.codigo, "TRANSICION_INVALIDA");
});

test("cierre: el operador finaliza su turno", async () => {
  const r = await api("POST", "/api/turnos/finalizar", { token: tk.op, body: { observaciones: "Fin de pruebas" } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.datos));
});
