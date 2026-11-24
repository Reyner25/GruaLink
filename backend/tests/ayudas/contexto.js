/**
 * Preparación común de las pruebas de la API (operador, revisión, bolsa de km,
 * reportes). Cada archivo de pruebas es INDEPENDIENTE: empieza con la base de
 * servicios vacía y crea sus propios datos, así se puede correr uno solo:
 *
 *   node --test tests/api.revision.test.js
 *
 * Uso:
 *   const ctx = require("./ayudas/contexto");
 *   before(() => ctx.preparar({ turnoOperador1: true }));
 *   after(() => ctx.terminar());
 *   ... ctx.api("POST", "/api/servicios", { token: ctx.tokens.op1, body: ctx.datosServicio() })
 *
 * Requisito: "npm run test:preparar" (una vez).
 * Ojo: dependen de las tarifas 2026 del seed (vigentes hasta 31/12/2026).
 */
require("../entorno");
const assert = require("node:assert");
const { pool } = require("../../config/db");
const { crearApp } = require("../../app");

const PASSWORD = "Grualink2026*"; // PASSWORD_PRUEBA de seeds/seed.js

let servidor;
const ctx = {
  pool,
  base: "",
  tokens: {},
  ids: {},
};

// ---------- Peticiones ----------

ctx.api = async function api(metodo, ruta, { token, body } = {}) {
  const respuesta = await fetch(`${ctx.base}${ruta}`, {
    method: metodo,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const texto = await respuesta.text();
  return { status: respuesta.status, datos: texto ? JSON.parse(texto) : null };
};

// Descarga un archivo (Excel/PDF): devuelve la respuesta y el contenido
ctx.descargar = async function descargar(ruta, token) {
  const r = await fetch(`${ctx.base}${ruta}`, { headers: { Authorization: `Bearer ${token}` } });
  return { r, status: r.status, buffer: Buffer.from(await r.arrayBuffer()) };
};

async function login(email) {
  const r = await ctx.api("POST", "/api/auth/login", { body: { email, password: PASSWORD } });
  assert.strictEqual(r.status, 200, JSON.stringify(r.datos));
  return r.datos.token;
}

ctx.idDe = async function idDe(sql, valor) {
  const { rows } = await pool.query(sql, [valor]);
  assert.ok(rows[0], `No encontrado: ${valor}`);
  return rows[0].id;
};

ctx.fecha = async (expresion) => (await pool.query(`SELECT (${expresion})::date::text AS d`)).rows[0].d;

// ---------- Datos de un servicio ----------

ctx.haceMinutos = (min) => new Date(Date.now() - min * 60000).toISOString();

ctx.datosServicio = (extra = {}) => ({
  cliente_id: ctx.ids.bogotaMovil,
  tipo_vehiculo_id: ctx.ids.articulado,
  tipo_servicio_id: ctx.ids.remolque,
  placa_vehiculo: "wcs 473",
  fecha_servicio: ctx.ids.hoy,
  hora_solicitud: ctx.haceMinutos(90),
  inicio_servicio: ctx.haceMinutos(60),
  origen: "Portal Tunal",
  destino: "Patio Prosperidad",
  ...extra,
});

ctx.datosFinalizar = (extra = {}) => ({
  fin_servicio: ctx.haceMinutos(5),
  entregado_sin_novedad: true,
  recibe_nombre: "Jefe de patio",
  ...extra,
});

/**
 * Crea y finaliza un servicio del operador 1 (necesita turno activo).
 * Devuelve su id. "corregir": cambios del administrador después de finalizar.
 */
ctx.servicioFinalizado = async ({ servicio = {}, finalizar = {}, corregir } = {}) => {
  const c = await ctx.api("POST", "/api/servicios", { token: ctx.tokens.op1, body: ctx.datosServicio(servicio) });
  assert.strictEqual(c.status, 201, JSON.stringify(c.datos));
  const id = c.datos.servicio.id;
  const f = await ctx.api("POST", `/api/servicios/${id}/finalizar`, { token: ctx.tokens.op1, body: ctx.datosFinalizar(finalizar) });
  assert.strictEqual(f.status, 200, JSON.stringify(f.datos));
  if (corregir) {
    const r = await ctx.api("POST", `/api/servicios/${id}/corregir`, { token: ctx.tokens.admin, body: { motivo: "Datos de la prueba", ...corregir } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.datos));
  }
  return id;
};

// Detalle del servicio como lo ve el administrador (con valores)
ctx.verAdmin = async (id) => (await ctx.api("GET", `/api/servicios/${id}`, { token: ctx.tokens.admin })).datos;

ctx.recargoNocturnoActivo = (activo) => pool.query("UPDATE conceptos_tarifa SET activo = $1 WHERE es_recargo_nocturno", [activo]);

// ---------- Preparación y cierre ----------

/**
 * Base de servicios vacía, API en un puerto libre, sesiones de los cuatro
 * usuarios de prueba e ids de los catálogos que usan las pruebas.
 * turnoOperador1: deja al operador 1 con un turno activo en la grúa G1.
 */
ctx.preparar = async ({ turnoOperador1 = false } = {}) => {
  await pool.query(`TRUNCATE servicio_conceptos, servicios, turnos_operador, bitacora, sesiones_activas RESTART IDENTITY CASCADE`);
  await pool.query("ALTER SEQUENCE servicios_numero_orden_seq RESTART WITH 1");
  await pool.query("UPDATE gruas SET estado = 'activa'");

  servidor = crearApp().listen(0);
  ctx.base = `http://127.0.0.1:${servidor.address().port}`;

  const t = ctx.tokens;
  t.op1 = await login("operador1@grualink.test");
  t.op2 = await login("operador2@grualink.test");
  t.admin = await login("admin@grualink.test");
  t.fin = await login("financiero@grualink.test");

  const ids = ctx.ids;
  const id = ctx.idDe;
  ids.op1 = await id("SELECT id FROM usuarios WHERE email = $1", "operador1@grualink.test");
  ids.grua1 = await id("SELECT id FROM gruas WHERE numero_interno = $1", "G1");
  ids.grua2 = await id("SELECT id FROM gruas WHERE numero_interno = $1", "G2");
  ids.bogotaMovil = await id("SELECT id FROM clientes WHERE nombre_comercial = $1", "BOGOTA MOVIL");
  ids.capitalbus = await id("SELECT id FROM clientes WHERE nombre_comercial = $1", "CAPITALBUS");
  ids.laRolita = await id("SELECT id FROM clientes WHERE nombre_comercial = $1", "La Rolita");
  ids.suma = await id("SELECT id FROM clientes WHERE nit = $1", "900364615");
  ids.articulado = await id("SELECT id FROM tipos_vehiculo WHERE nombre = $1", "Articulado");
  ids.buseton = await id("SELECT id FROM tipos_vehiculo WHERE nombre = $1", "Busetón");
  ids.otro = await id("SELECT id FROM tipos_vehiculo WHERE nombre = $1", "Otro");
  ids.remolque = await id("SELECT id FROM tipos_servicio WHERE nombre = $1", "Remolque");
  ids.rescate = await id("SELECT id FROM tipos_servicio WHERE nombre = $1", "Rescate");
  ids.cardan = await id("SELECT id FROM conceptos_tarifa WHERE nombre = $1", "Desmontar cardán");
  ids.standby = await id("SELECT id FROM conceptos_tarifa WHERE nombre = $1", "Hora standby / disponibilidad");
  ids.camara = await id("SELECT id FROM conceptos_tarifa WHERE nombre = $1", "Quitar cámara de freno");
  ids.recargo = await id("SELECT id FROM conceptos_tarifa WHERE es_recargo_nocturno = $1", true);
  ids.hoy = await ctx.fecha("current_date");
  ids.ayer = await ctx.fecha("current_date - 1");
  // Día 15 del mes anterior (para probar meses cerrados)
  ids.mesAnterior = await ctx.fecha("date_trunc('month', current_date) - interval '1 month' + interval '14 days'");

  // Los servicios de prueba terminan "hace 5 minutos": si las pruebas se corren
  // de noche, el recargo nocturno automático cambiaría los valores esperados.
  // Se desactiva aquí; la prueba del recargo lo activa con horas fijas.
  await ctx.recargoNocturnoActivo(false);

  if (turnoOperador1) {
    const r = await ctx.api("POST", "/api/turnos/iniciar", { token: t.op1, body: { grua_id: ids.grua1 } });
    assert.strictEqual(r.status, 201, JSON.stringify(r.datos));
  }
};

/**
 * Cierra los turnos que quedaron activos (otras pruebas abren turnos
 * directamente en la base), reactiva el recargo y apaga la API.
 */
ctx.terminar = async () => {
  try {
    const { rows } = await pool.query("SELECT id FROM turnos_operador WHERE estado = 'activo'");
    for (const { id } of rows) {
      await ctx.api("POST", `/api/turnos/${id}/cerrar`, { token: ctx.tokens.admin, body: { motivo: "Fin de las pruebas" } });
    }
    await ctx.recargoNocturnoActivo(true);
  } finally {
    servidor?.close();
    await pool.end();
  }
};

module.exports = ctx;
