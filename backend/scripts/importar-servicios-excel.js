/**
 * Carga a GruaLink los servicios del Excel "REGISTRO TOTAL SERVICIOS DE GRÚAS"
 * (el formato que se manejaba antes del sistema).
 *
 * Uso (desde backend/):
 *   node scripts/importar-servicios-excel.js <archivo.xlsx>             → PRUEBA: muestra lo que haría y lo deshace
 *   node scripts/importar-servicios-excel.js <archivo.xlsx> --aplicar   → carga de verdad (todo o nada)
 *
 * Reglas acordadas con SOTRANDES (26/11/2026):
 *  - El número de orden lo asigna GruaLink (consecutivo, en orden de fecha y hora).
 *    La OS física del Excel queda en las observaciones ("OS física 19768").
 *  - Los valores los calcula GruaLink con las tarifas vigentes, los km y los
 *    trabajos adicionales del Excel (el Excel trae el VALOR de cada adicional:
 *    se convierte en cantidad dividiendo por el precio del cliente).
 *  - Recargo nocturno: se aplica si el Excel lo cobró (no por la hora).
 *  - Suma: los servicios con adicionales cobrados van "fuera de la
 *    disponibilidad" (tarifa de clientes generales); los demás por la bolsa de km.
 *  - Quedan APROBADOS con el valor calculado, salvo: anulados, "a convenir"
 *    (sin valor: los aprueba el administrador) y Suma del mes en curso (se
 *    aprueban después del cierre del mes, cuando se recalculan con la columna real).
 *  - Clientes que no existen se crean "por servicio" con NIT temporal (PENDIENTE-n).
 *  - Todo queda en la bitácora a nombre del primer administrador activo.
 */
require("dotenv").config({ quiet: true });
const path = require("path");
const ExcelJS = require("exceljs");
const { pool, withTransaction } = require("../config/db");
const ServicioModel = require("../models/servicio.model");
const CatalogosModel = require("../models/catalogos.model");
const BitacoraModel = require("../models/bitacora.model");
const BolsaKm = require("../services/bolsaKm.service");
const PagoOperador = require("../services/pagoOperador.service");
const { calcular, columnasCalculadas } = require("../services/servicio/valores");

const APLICAR = process.argv.includes("--aplicar");
const ARCHIVO = process.argv.slice(2).find((a) => !a.startsWith("--"));
const MOTIVO = "Carga inicial desde el Excel de servicios (oct-nov 2026)";

// ---------- Equivalencias Excel → GruaLink ----------
const CLIENTES = {
  suma: "SUMA",
  "masivo capital": "MASIVO CAPITAL",
  "capital bus": "CAPITALBUS",
  "la rolita": "La Rolita",
  "emasivo 10": "EMASIVO 10",
  "bogota movil": "BOGOTA MOVIL",
  "si18 a": "SI18 - NORTE",
  "si18 s": "SI18 - SUBA",
  "si18 m": "SI18 - CALLE 80",
};
// Clientes nuevos (se crean si no existen): nombre en el Excel → razón social
const CLIENTES_NUEVOS = {
  sotrandes: "SOTRANDES",
  scania: "SCANIA",
  "e-somos alimentacion": "E-SOMOS ALIMENTACION",
  "cesar gaviria": "CESAR GAVIRIA",
};
const VEHICULOS = { padron: "Padrón", buseton: "Busetón", buseta: "Buseta", articulado: "Articulado", biarticulado: "Biarticulado" };
const OPERADORES = { "camilo cardenas": "camilo.cardenas" }; // nombre en el Excel → nombre del usuario (si difiere)

const quitarTildes = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
const valorCelda = (x) => (x && typeof x === "object" && !(x instanceof Date) ? (x.result !== undefined ? x.result : x.text ?? null) : x);
// Las horas del Excel llegan como fechas del 30/12/1899 en UTC: la hora UTC es la hora de Colombia escrita
const hhmm = (d) => (d instanceof Date ? d.toISOString().slice(11, 16) : null);
const sumarDia = (fecha, dias) => new Date(Date.parse(`${fecha}T12:00:00Z`) + dias * 86400000).toISOString().slice(0, 10);
const enColombia = (fecha, hora) => (hora ? `${fecha}T${hora}:00-05:00` : null);
const num = (v) => Number(v) || 0;

// ---------- Lectura del Excel ----------
async function leerExcel(archivo) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(archivo);
  const ws = wb.worksheets[0];
  const filas = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const v = ws.getRow(r).values.slice(1).map(valorCelda);
    if (v.every((x) => x === null || x === undefined || x === "")) continue;
    const [, placaGrua, os, numVeh, tipo, cliente, operador, , , , fecha, sol, , ini, fin, , origen, destino, , kmVacio, kmServicio, cardan, persiana, camaras, recargoStandby, rescateKit, obs] = v;
    filas.push({
      fila: r,
      placaGrua: String(placaGrua).trim(),
      osFisica: String(os).trim(),
      numeroVehiculo: String(numVeh ?? "").trim().toUpperCase(),
      tipo: String(tipo ?? "").trim(),
      cliente: String(cliente ?? "").trim(),
      operador: String(operador ?? "").trim(),
      fecha: fecha.toISOString().slice(0, 10),
      sol: hhmm(sol),
      ini: hhmm(ini),
      fin: hhmm(fin),
      origen: origen ? String(origen).trim() : null,
      destino: destino ? String(destino).trim() : null,
      kmVacio: num(kmVacio),
      kmServicio: num(kmServicio),
      montos: { cardan: num(cardan), persiana: num(persiana), camaras: num(camaras), recargoStandby: num(recargoStandby), rescateKit: num(rescateKit) },
      obs: obs ? String(obs).trim() : "",
    });
  }
  return filas;
}

// ---------- Catálogos de la base ----------
async function cargarCatalogos(client) {
  const uno = async (sql, p) => (await client.query(sql, p)).rows;
  const clientes = await uno("SELECT id, COALESCE(nombre_comercial, razon_social) AS nombre, modalidad_cobro FROM clientes");
  const gruas = await uno("SELECT id, placa FROM gruas");
  const usuarios = await uno("SELECT u.id, u.nombre FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE r.nombre = 'operador'");
  const tipos = await uno("SELECT id, nombre, es_otro FROM tipos_vehiculo");
  const servicios = await uno("SELECT id, nombre FROM tipos_servicio");
  const conceptos = await uno("SELECT id, nombre, es_recargo_nocturno FROM conceptos_tarifa");
  const admin = (await uno(
    `SELECT u.id FROM usuarios u JOIN roles r ON r.id = u.rol_id WHERE r.nombre = 'administrador' AND u.activo
     ORDER BY (u.email LIKE '%@grualink.test'), u.id LIMIT 1`,
  ))[0];
  const concepto = (nombre) => conceptos.find((c) => c.nombre === nombre)?.id;
  return {
    clientes, gruas, usuarios, tipos, servicios, admin,
    conceptoId: {
      cardan: concepto("Desmontar cardán"),
      persiana: concepto("Quitar persiana"),
      camara: concepto("Quitar cámara de freno"),
      standby: concepto("Hora standby / disponibilidad"),
      kit: concepto("Uso de kit antiderrames"),
      recargo: conceptos.find((c) => c.es_recargo_nocturno)?.id,
    },
  };
}

// Precio de un concepto para el cliente en la fecha (el propio o el general)
async function precio(client, conceptoId, clienteId, fecha) {
  const { rows } = await client.query(
    `SELECT valor FROM precios_concepto
     WHERE concepto_id = $1 AND (cliente_id = $2 OR cliente_id IS NULL)
       AND vigente_desde <= $3 AND (vigente_hasta IS NULL OR vigente_hasta >= $3)
     ORDER BY cliente_id NULLS LAST LIMIT 1`,
    [conceptoId, clienteId, fecha],
  );
  return rows[0] ? Number(rows[0].valor) : null;
}

/**
 * Convierte los VALORES del Excel en conceptos con cantidad.
 * Devuelve { conceptos, recargo (true/false), problemas[] }.
 */
async function conceptosDeMontos(client, cat, montos, clienteTarifa, fecha) {
  const conceptos = [];
  const problemas = [];
  const porCantidad = async (monto, clave, nombre) => {
    if (!monto) return;
    const p = await precio(client, cat.conceptoId[clave], clienteTarifa, fecha);
    const cantidad = p ? Math.round((monto / p) * 2) / 2 : 0; // medias unidades
    if (!p || cantidad <= 0 || Math.abs(cantidad * p - monto) > 1) problemas.push(`${nombre} $${monto} no cuadra con el precio $${p}`);
    else conceptos.push({ concepto_id: cat.conceptoId[clave], cantidad });
  };
  // Un valor en la columna de cardán igual al precio de la PERSIANA es una persiana
  // anotada en la columna equivocada (caso OS 20343, confirmado por SOTRANDES)
  let { cardan, persiana } = montos;
  if (cardan) {
    const pCardan = await precio(client, cat.conceptoId.cardan, clienteTarifa, fecha);
    const pPersiana = await precio(client, cat.conceptoId.persiana, clienteTarifa, fecha);
    if (pCardan && cardan % pCardan !== 0 && pPersiana && cardan % pPersiana === 0) {
      persiana += cardan;
      cardan = 0;
    }
  }
  await porCantidad(cardan, "cardan", "Cardán");
  await porCantidad(persiana, "persiana", "Persiana");
  await porCantidad(montos.camaras, "camara", "Cámaras");
  await porCantidad(montos.rescateKit, "kit", "Kit/rescate");

  // "Recargo Nocturno / Hora StandBy": recargo (0 o 1) + horas de stand-by (de a media hora)
  let recargo = false;
  if (montos.recargoStandby) {
    const r = await precio(client, cat.conceptoId.recargo, clienteTarifa, fecha);
    const s = await precio(client, cat.conceptoId.standby, clienteTarifa, fecha);
    let encontrado = null;
    for (const a of [1, 0]) {
      const resto = montos.recargoStandby - a * (r ?? Infinity);
      if (resto < -1) continue;
      const horas = s ? Math.round((resto / s) * 2) / 2 : 0;
      if (Math.abs(resto - horas * (s ?? 0)) <= 1 && (a || horas > 0)) {
        encontrado = { a, horas };
        break;
      }
    }
    if (!encontrado) problemas.push(`Recargo/stand-by $${montos.recargoStandby} no cuadra (recargo $${r}, stand-by $${s}/h)`);
    else {
      recargo = encontrado.a === 1;
      if (encontrado.horas > 0) conceptos.push({ concepto_id: cat.conceptoId.standby, cantidad: encontrado.horas });
    }
  }
  return { conceptos, recargo, problemas };
}

// ---------- Carga ----------
async function importar() {
  if (!ARCHIVO) throw new Error("Indique el archivo: node scripts/importar-servicios-excel.js <archivo.xlsx> [--aplicar]");
  const filas = await leerExcel(path.resolve(ARCHIVO));
  const informe = { problemas: [], creados: 0, aprobados: 0, sinAprobar: [], anulados: 0, clientesNuevos: [], valorTotal: 0, porCliente: {} };

  const hecho = await withTransaction(async (client) => {
    const { rows: previos } = await client.query("SELECT count(*)::int AS n FROM servicios WHERE observaciones LIKE '%[Carga Excel]%'");
    if (previos[0].n > 0) throw new Error(`Ya hay ${previos[0].n} servicios cargados desde el Excel: no se carga dos veces`);

    // Números de orden seguidos: el consecutivo sigue a la última orden que exista
    // (una carga de prueba deshecha gasta números, aunque no deje servicios)
    await client.query(
      `SELECT setval('servicios_numero_orden_seq',
              COALESCE((SELECT max(numero_orden::bigint) FROM servicios WHERE numero_orden ~ '^[0-9]+$'), 0) + 1, false)`,
    );

    let cat = await cargarCatalogos(client);
    if (!cat.admin) throw new Error("No hay un administrador activo para la bitácora");
    const usuarioId = cat.admin.id;

    // Clientes nuevos
    let pendiente = 1;
    for (const [clave, razon] of Object.entries(CLIENTES_NUEVOS)) {
      if (!filas.some((f) => quitarTildes(f.cliente) === clave)) continue;
      if (cat.clientes.some((c) => quitarTildes(c.nombre) === quitarTildes(razon))) continue;
      let nit;
      do nit = `PENDIENTE-${pendiente++}`;
      while ((await client.query("SELECT 1 FROM clientes WHERE nit = $1", [nit])).rows[0]);
      const { rows } = await client.query(
        "INSERT INTO clientes (razon_social, nombre_comercial, nit, modalidad_cobro, activo) VALUES ($1, $1, $2, 'por_servicio', TRUE) RETURNING *",
        [razon, nit],
      );
      await BitacoraModel.registrar(client, { usuarioId, entidad: "clientes", registroId: rows[0].id, operacion: "crear", nuevos: rows[0], motivo: MOTIVO });
      informe.clientesNuevos.push(`${razon} (NIT ${nit})`);
    }
    cat = await cargarCatalogos(client);

    const clientePorNombre = (nombre) => cat.clientes.find((c) => quitarTildes(c.nombre) === quitarTildes(nombre));
    const remolque = cat.servicios.find((s) => s.nombre === "Remolque");
    const fallido = cat.servicios.find((s) => s.nombre === "Servicio fallido");
    const otro = cat.tipos.find((t) => t.es_otro);

    // Anulados: toman cliente y vehículo de la orden que los reemplaza ("SE CAMBIA POR OS 20651")
    const porOs = new Map(filas.map((f) => [f.osFisica, f]));

    // Orden cronológico → números de orden consecutivos
    const ordenadas = [...filas].sort((a, b) => (a.fecha + (a.ini || "00:00")).localeCompare(b.fecha + (b.ini || "00:00")) || a.fila - b.fila);

    for (const f of ordenadas) {
      const anulado = /^anulad/i.test(f.cliente) || /^anulad/i.test(f.obs);
      const base = anulado ? porOs.get(f.obs.match(/OS\s*(\d+)/i)?.[1]) || f : f;
      const clave = quitarTildes(base.cliente);
      const cliente = clientePorNombre(CLIENTES[clave] || CLIENTES_NUEVOS[clave] || base.cliente);
      const grua = cat.gruas.find((g) => g.placa === f.placaGrua);
      const nombreOperador = OPERADORES[quitarTildes(f.operador)] || f.operador;
      const operador = cat.usuarios.find((u) => quitarTildes(u.nombre) === quitarTildes(nombreOperador));
      const tipoExcel = quitarTildes(base.tipo);
      const tipoVeh = VEHICULOS[tipoExcel] ? cat.tipos.find((t) => t.nombre === VEHICULOS[tipoExcel]) : otro;
      const faltan = [!cliente && `cliente "${base.cliente}"`, !grua && `grúa ${f.placaGrua}`, !operador && `operador "${f.operador}"`].filter(Boolean);
      if (faltan.length) {
        informe.problemas.push(`Fila ${f.fila} (OS ${f.osFisica}): no se encontró ${faltan.join(", ")}`);
        continue;
      }

      const tipoServ = /servicio fallido/i.test(f.obs) ? fallido : remolque;
      const porBolsa = cliente.modalidad_cobro === "bolsa_km_mensual";
      const tieneAdicionales = Object.values(f.montos).some((m) => m > 0);
      const fueraDisponibilidad = porBolsa && tieneAdicionales;

      // Horas: si el fin es antes del inicio, terminó al día siguiente; si la solicitud es después del inicio, fue el día anterior
      const inicio = anulado ? null : enColombia(f.fecha, f.ini);
      const fin = anulado ? null : enColombia(f.fin < f.ini ? sumarDia(f.fecha, 1) : f.fecha, f.fin);
      const solicitud = anulado ? null : enColombia(f.sol > f.ini ? sumarDia(f.fecha, -1) : f.fecha, f.sol);

      const numeroOrden = await ServicioModel.siguienteNumeroOrden(client);
      const nota = `[Carga Excel] OS física ${f.osFisica}`;
      const id = await ServicioModel.crear(client, {
        numero_orden: numeroOrden,
        grua_id: grua.id,
        operador_id: operador.id,
        turno_id: null,
        cliente_id: cliente.id,
        tipo_vehiculo_id: tipoVeh.id,
        tipo_vehiculo_otro: tipoVeh.es_otro ? base.tipo : null,
        tipo_servicio_id: tipoServ.id,
        placa_vehiculo: anulado ? "ANULADA" : base.numeroVehiculo,
        numero_vehiculo: anulado ? "ANULADA" : base.numeroVehiculo,
        fecha_servicio: f.fecha,
        hora_solicitud: solicitud,
        inicio_servicio: inicio,
        origen: anulado ? null : f.origen,
        destino: anulado ? null : f.destino,
        es_rescate: false,
        observaciones: [f.obs, nota].filter(Boolean).join("\n"),
        estado: anulado ? "anulado" : "finalizado",
      });
      await BitacoraModel.registrar(client, { usuarioId, entidad: "servicios", registroId: id, operacion: "crear", nuevos: { numero_orden: numeroOrden, os_fisica: f.osFisica }, motivo: MOTIVO });
      informe.creados++;

      if (anulado) {
        await BitacoraModel.registrar(client, { usuarioId, entidad: "servicios", registroId: id, operacion: "anular", anteriores: { estado: "finalizado" }, nuevos: { estado: "anulado" }, motivo: f.obs });
        informe.anulados++;
        continue;
      }

      const clienteTarifa = porBolsa ? null : cliente.id; // Suma fuera de disponibilidad: precios generales
      const { conceptos, recargo, problemas } = await conceptosDeMontos(client, cat, f.montos, clienteTarifa, f.fecha);
      for (const p of problemas) informe.problemas.push(`Fila ${f.fila} (OS ${f.osFisica}, orden ${numeroOrden}, ${cliente.nombre}): ${p}`);

      const ajustes = { km_vacio: f.kmVacio, km_servicio: f.kmServicio, fuera_disponibilidad: fueraDisponibilidad, recargo_nocturno: recargo ? "si" : "no" };
      await ServicioModel.corregir(client, id, ajustes);
      const servicio = { id, cliente_id: cliente.id, fecha_servicio: f.fecha, km_servicio: f.kmServicio, km_vacio: f.kmVacio, fuera_disponibilidad: fueraDisponibilidad, tarifa_basica_manual: null, recargo_nocturno: ajustes.recargo_nocturno };
      let valores;
      try {
        valores = await calcular(client, { servicio, tipoVehiculo: await CatalogosModel.tipoVehiculo(tipoVeh.id, { client }), tipoServicio: await CatalogosModel.tipoServicio(tipoServ.id, { client }), conceptos, finServicio: fin });
      } catch (err) {
        if (err.codigo !== "TARIFA_NO_ENCONTRADA" && !/tarifa/i.test(err.message)) throw err;
        // Sin tarifa: queda finalizado SIN valor ("a convenir") para que el administrador lo defina
        informe.sinTarifa ??= {};
        const combo = `${cliente.nombre} · ${tipoVeh.nombre} · ${tipoServ.nombre}`;
        informe.sinTarifa[combo] = (informe.sinTarifa[combo] || 0) + 1;
        await ServicioModel.finalizar(client, id, { inicio_servicio: inicio, fin_servicio: fin, km_vacio: f.kmVacio, km_servicio: f.kmServicio, entregado_sin_novedad: true, valor_calculado: null, estado: "finalizado" });
        continue;
      }
      await ServicioModel.finalizar(client, id, {
        inicio_servicio: inicio,
        fin_servicio: fin,
        km_vacio: f.kmVacio,
        km_servicio: f.kmServicio,
        entregado_sin_novedad: true,
        ...columnasCalculadas(valores),
        estado: "finalizado",
      });
      await ServicioModel.insertarConceptos(client, id, valores.conceptos);
    }

    // Bolsa de km: los meses cerrados se recalculan con la columna real
    for (const c of cat.clientes.filter((x) => x.modalidad_cobro === "bolsa_km_mensual")) {
      const meses = [...new Set(filas.map((f) => f.fecha.slice(0, 7)))];
      for (const mes of meses) await BolsaKm.recalcularMes(client, { clienteId: c.id, fecha: `${mes}-01`, usuarioId });
    }

    // Aprobar: todo lo finalizado con valor, salvo bolsa de km del mes en curso
    const { rows: porAprobar } = await client.query(
      `SELECT s.id, s.numero_orden, s.valor_calculado, s.fecha_servicio::text AS fecha, c.modalidad_cobro,
              COALESCE(c.nombre_comercial, c.razon_social) AS cliente,
              date_trunc('month', s.fecha_servicio) = date_trunc('month', current_date) AS mes_abierto
       FROM servicios s JOIN clientes c ON c.id = s.cliente_id
       WHERE s.estado = 'finalizado' AND s.observaciones LIKE '%[Carga Excel]%' ORDER BY s.id`,
    );
    for (const s of porAprobar) {
      if (s.valor_calculado === null) {
        informe.sinAprobar.push(`Orden ${s.numero_orden} (${s.cliente}, ${s.fecha}): a convenir, el administrador define el valor`);
        continue;
      }
      if (s.modalidad_cobro === "bolsa_km_mensual" && s.mes_abierto) {
        informe.sinAprobar.push(`Orden ${s.numero_orden} (${s.cliente}, ${s.fecha}): bolsa de km del mes en curso`);
        continue;
      }
      await ServicioModel.aprobar(client, s.id, { estado: "aprobado", valor_aprobado: s.valor_calculado, aprobado_por: usuarioId, aprobado_en: new Date() });
      const pago = await PagoOperador.guardarAlAprobar(client, s.id);
      await BitacoraModel.registrar(client, {
        usuarioId, entidad: "servicios", registroId: s.id, operacion: "aprobar",
        anteriores: { estado: "finalizado" }, nuevos: { estado: "aprobado", valor_aprobado: s.valor_calculado, valor_operador: pago.valor }, motivo: MOTIVO,
      });
      informe.aprobados++;
    }

    // Resumen por cliente y mes (sin anulados)
    const { rows: resumen } = await client.query(
      `SELECT COALESCE(c.nombre_comercial, c.razon_social) AS cliente, to_char(s.fecha_servicio, 'YYYY-MM') AS mes,
              count(*)::int AS servicios, COALESCE(sum(s.valor_calculado), 0)::numeric AS valor
       FROM servicios s JOIN clientes c ON c.id = s.cliente_id
       WHERE s.observaciones LIKE '%[Carga Excel]%' AND s.estado <> 'anulado'
       GROUP BY 1, 2 ORDER BY 2, 1`,
    );
    informe.porCliente = resumen;
    informe.valorTotal = resumen.reduce((t, r) => t + Number(r.valor), 0);
    const { rows: rango } = await client.query("SELECT min(numero_orden::int) AS desde, max(numero_orden::int) AS hasta FROM servicios WHERE observaciones LIKE '%[Carga Excel]%'");
    informe.ordenes = rango[0];

    if (!APLICAR) throw Object.assign(new Error("PRUEBA"), { prueba: true });
    return true;
  }).catch((err) => {
    if (err.prueba) return false;
    throw err;
  });

  const pesos = (v) => `$${Math.round(v).toLocaleString("es-CO")}`;
  console.log(`\n${hecho ? "✔ CARGA APLICADA" : "Vista previa (no se guardó nada; use --aplicar para cargar)"}`);
  console.log(`Filas del Excel: ${filas.length} · servicios creados: ${informe.creados} · aprobados: ${informe.aprobados} · anulados: ${informe.anulados} · sin aprobar: ${informe.sinAprobar.length}`);
  if (informe.ordenes) console.log(`Números de orden asignados: ${informe.ordenes.desde} a ${informe.ordenes.hasta}`);
  if (informe.clientesNuevos.length) console.log(`Clientes nuevos: ${informe.clientesNuevos.join(", ")}`);
  console.log("\nPor cliente y mes (valor calculado, sin anulados):");
  for (const r of informe.porCliente) console.log(`  ${r.mes}  ${r.cliente.padEnd(22)} ${String(r.servicios).padStart(4)} servicios  ${pesos(r.valor).padStart(14)}`);
  console.log(`  TOTAL ${pesos(informe.valorTotal)}`);
  if (informe.sinTarifa) {
    console.log("\n⚠ Sin tarifa en GruaLink (quedan sin valor, por aprobar):");
    for (const [combo, n] of Object.entries(informe.sinTarifa)) console.log(`  ${combo}: ${n} servicio(s)`);
  }
  if (informe.sinAprobar.length) console.log(`\nSin aprobar (${informe.sinAprobar.length}):\n  ${informe.sinAprobar.join("\n  ")}`);
  if (informe.problemas.length) console.log(`\n⚠ Para revisar (${informe.problemas.length}):\n  ${informe.problemas.join("\n  ")}`);
}

importar()
  .catch((err) => {
    console.error("✖", err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
