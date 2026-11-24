/**
 * ADMINISTRACIÓN de la tabla de la bolsa de km (Tarifas → "Bolsa de km").
 *
 * La tabla de un cliente tiene VIGENCIAS (como las tarifas): cada vigencia es
 * un juego completo de celdas (columnas de km del mes × filas de km del
 * servicio) con la misma fecha de inicio.
 *
 * Reglas:
 *  - Una celda que YA COBRÓ algún servicio no se modifica (así siempre se
 *    sabe con qué valor se cobró). Las demás se pueden corregir.
 *  - Para cambiar valores en uso se crea una NUEVA VIGENCIA copiando la
 *    actual desde una fecha; la anterior se cierra el día antes. No se puede
 *    empezar antes del último servicio cobrado con la anterior.
 *  - La VIGENCIA se puede editar: sin uso, inicio y fin (o borrarla); en
 *    uso, solo el fin y no antes del último servicio cobrado con ella.
 *  - La columna provisional (mes abierto) se elige por cliente; al cambiarla
 *    se recalculan los servicios del mes en curso que no estén aprobados.
 *  - Todo queda en la bitácora.
 */
const { pool, withTransaction } = require("../config/db");
const BitacoraModel = require("../models/bitacora.model");
const { errorNegocio } = require("../utils/errores");
const BolsaKm = require("./bolsaKm.service");

// "2026-11-24" → "24/11/2026" para los mensajes
const fechaTexto = (iso) => String(iso).slice(0, 10).split("-").reverse().join("/");

const USADA = "EXISTS (SELECT 1 FROM servicios s WHERE s.tarifa_bolsa_id = b.id)";

async function versiones(clienteId) {
  const { rows } = await pool.query(
    `SELECT b.vigente_desde::text AS vigente_desde, max(b.vigente_hasta)::text AS vigente_hasta,
            count(*)::int AS celdas, bool_or(${USADA}) AS usada,
            bool_and(b.vigente_desde <= current_date AND (b.vigente_hasta IS NULL OR b.vigente_hasta >= current_date)) AS vigente_hoy
     FROM tarifas_bolsa_km b WHERE b.cliente_id = $1
     GROUP BY b.vigente_desde ORDER BY b.vigente_desde DESC`,
    [clienteId],
  );
  return rows;
}

/**
 * Tabla de una vigencia (por defecto la vigente hoy o, si no hay, la más
 * reciente), lista para mostrarla como en el Excel.
 */
async function tabla({ clienteId, vigenteDesde }) {
  const { rows: cli } = await pool.query(
    "SELECT id, COALESCE(nombre_comercial, razon_social) AS nombre, modalidad_cobro, bolsa_km_provisional FROM clientes WHERE id = $1",
    [clienteId],
  );
  if (!cli[0]) throw errorNegocio(404, "NO_ENCONTRADO", "El cliente no existe");
  const lista = await versiones(clienteId);
  const elegida = vigenteDesde ? lista.find((v) => v.vigente_desde === vigenteDesde) : lista.find((v) => v.vigente_hoy) || lista[0];
  if (vigenteDesde && !elegida) throw errorNegocio(404, "NO_ENCONTRADO", "No existe una tabla con esa vigencia");

  let celdas = [];
  if (elegida) {
    ({ rows: celdas } = await pool.query(
      `SELECT b.id, b.bolsa_km_desde, b.bolsa_km_hasta, b.km_desde, b.km_hasta, b.forma, b.valor, ${USADA} AS usada
       FROM tarifas_bolsa_km b
       WHERE b.cliente_id = $1 AND b.vigente_desde = $2
       ORDER BY b.bolsa_km_desde, b.km_desde`,
      [clienteId, elegida.vigente_desde],
    ));
  }
  const clave = (d, h) => `${d}|${h}`;
  const unicos = (pares) => [...new Map(pares.map(([d, h]) => [clave(d, h), { desde: d, hasta: h }])).values()].sort((a, b) => a.desde - b.desde);
  return {
    cliente: cli[0],
    versiones: lista,
    vigencia: elegida || null,
    columnas: unicos(celdas.map((c) => [c.bolsa_km_desde, c.bolsa_km_hasta])),
    filas: unicos(celdas.map((c) => [c.km_desde, c.km_hasta])),
    celdas,
  };
}

function validarForma(forma, valor) {
  if (!["fijo", "por_km", "a_convenir"].includes(forma)) throw errorNegocio(422, "FORMA_INVALIDA", "Forma de cobro inválida");
  if (forma === "a_convenir" && valor !== null && valor !== undefined) {
    throw errorNegocio(422, "VALOR_SOBRA", "\"A convenir\" no lleva valor: deje el valor vacío");
  }
  if (forma !== "a_convenir" && !(typeof valor === "number" && valor >= 0)) {
    throw errorNegocio(422, "VALOR_OBLIGATORIO", "Indique el valor en pesos");
  }
}

async function actualizarCelda({ id, forma, valor, motivo, usuarioId }) {
  validarForma(forma, valor);
  return withTransaction(async (client) => {
    const { rows } = await client.query(`SELECT b.*, ${USADA} AS usada FROM tarifas_bolsa_km b WHERE b.id = $1 FOR UPDATE OF b`, [id]);
    const actual = rows[0];
    if (!actual) throw errorNegocio(404, "NO_ENCONTRADO", "La celda no existe");
    if (actual.usada) {
      throw errorNegocio(
        409,
        "CELDA_EN_USO",
        "Esta celda ya se usó para cobrar servicios: no se puede cambiar. Cree una nueva vigencia (copia de la tabla) desde la fecha en que rige el valor nuevo.",
      );
    }
    const nuevoValor = forma === "a_convenir" ? null : valor;
    const { rows: act } = await client.query("UPDATE tarifas_bolsa_km SET forma = $2, valor = $3 WHERE id = $1 RETURNING *", [id, forma, nuevoValor]);
    await BitacoraModel.registrar(client, {
      usuarioId,
      entidad: "tarifas_bolsa_km",
      registroId: id,
      operacion: "actualizar",
      anteriores: { forma: actual.forma, valor: actual.valor },
      nuevos: { forma, valor: nuevoValor },
      motivo,
    });
    return act[0];
  });
}

/**
 * Nueva vigencia: copia todas las celdas de "copiarDe" con inicio "vigenteDesde"
 * (sin fin). Si la vigencia copiada seguía abierta en esa fecha, se cierra el
 * día anterior.
 */
async function nuevaVigencia({ clienteId, copiarDe, vigenteDesde, motivo, usuarioId }) {
  if (vigenteDesde <= copiarDe) {
    throw errorNegocio(422, "VIGENCIA_INVALIDA", "La nueva vigencia debe empezar después de la que se copia");
  }
  return withTransaction(async (client) => {
    const { rows: origen } = await client.query(
      "SELECT * FROM tarifas_bolsa_km WHERE cliente_id = $1 AND vigente_desde = $2 ORDER BY bolsa_km_desde, km_desde FOR UPDATE",
      [clienteId, copiarDe],
    );
    if (!origen.length) throw errorNegocio(404, "NO_ENCONTRADO", "No existe la tabla que se quiere copiar");

    // ¿Hay servicios cobrados con la tabla anterior desde la nueva fecha?
    const { rows: uso } = await client.query(
      `SELECT max(s.fecha_servicio)::text AS ultima FROM servicios s
       WHERE s.tarifa_bolsa_id = ANY($1::int[]) AND s.fecha_servicio >= $2`,
      [origen.map((c) => c.id), vigenteDesde],
    );
    if (uso[0].ultima) {
      throw errorNegocio(
        409,
        "CIERRE_ANTES_DE_USO",
        `Hay servicios hasta el ${fechaTexto(uso[0].ultima)} cobrados con la tabla actual: la nueva vigencia debe empezar después de esa fecha`,
      );
    }
    // Cerrar la anterior el día antes, si seguía vigente en la nueva fecha
    await client.query(
      `UPDATE tarifas_bolsa_km SET vigente_hasta = $3::date - 1
       WHERE cliente_id = $1 AND vigente_desde = $2 AND (vigente_hasta IS NULL OR vigente_hasta >= $3::date)`,
      [clienteId, copiarDe, vigenteDesde],
    );
    let primera = null;
    for (const c of origen) {
      const { rows } = await client.query(
        `INSERT INTO tarifas_bolsa_km (cliente_id, bolsa_km_desde, bolsa_km_hasta, km_desde, km_hasta, forma, valor, vigente_desde, vigente_hasta)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL) RETURNING id`,
        [clienteId, c.bolsa_km_desde, c.bolsa_km_hasta, c.km_desde, c.km_hasta, c.forma, c.valor, vigenteDesde],
      );
      primera ??= rows[0].id;
    }
    await BitacoraModel.registrar(client, {
      usuarioId,
      entidad: "tarifas_bolsa_km",
      registroId: primera,
      operacion: "crear",
      nuevos: { cliente_id: clienteId, vigente_desde: vigenteDesde, celdas: origen.length, copia_de: copiarDe },
      motivo,
    });
    return { vigente_desde: vigenteDesde, celdas: origen.length };
  });
}

// Celdas de una vigencia, bloqueadas, con su uso
async function celdasDeVigencia(client, clienteId, vigenteDesde) {
  const { rows } = await client.query(
    `SELECT b.id, b.vigente_desde::text AS vigente_desde, b.vigente_hasta::text AS vigente_hasta
     FROM tarifas_bolsa_km b WHERE b.cliente_id = $1 AND b.vigente_desde = $2 FOR UPDATE`,
    [clienteId, vigenteDesde],
  );
  if (!rows.length) throw errorNegocio(404, "NO_ENCONTRADO", "No existe una tabla con esa vigencia");
  const { rows: uso } = await client.query(
    "SELECT min(fecha_servicio)::text AS primera, max(fecha_servicio)::text AS ultima FROM servicios WHERE tarifa_bolsa_id = ANY($1::int[])",
    [rows.map((r) => r.id)],
  );
  return { ids: rows.map((r) => r.id), actual: rows[0], primeraUso: uso[0].primera, ultimaUso: uso[0].ultima };
}

/**
 * Cambiar la vigencia de una tabla (todas sus celdas a la vez).
 *  - Sin uso: se pueden cambiar inicio y fin.
 *  - En uso: solo el fin, y no antes del último servicio cobrado con ella.
 *  - No puede cruzarse con otra vigencia del mismo cliente (la base lo impide → 409).
 * nuevoHasta: fecha, null (= sin fin) o undefined (= no cambia).
 */
async function editarVigencia({ clienteId, vigenteDesde, nuevoDesde, nuevoHasta, motivo, usuarioId }) {
  return withTransaction(async (client) => {
    const { ids, actual, ultimaUso } = await celdasDeVigencia(client, clienteId, vigenteDesde);
    const desde = nuevoDesde ?? actual.vigente_desde;
    const hasta = nuevoHasta === undefined ? actual.vigente_hasta : nuevoHasta;

    if (desde !== actual.vigente_desde && ultimaUso) {
      throw errorNegocio(
        409,
        "VIGENCIA_EN_USO",
        "Esta tabla ya cobró servicios: no se puede cambiar su fecha de inicio, solo la de fin. Para valores nuevos cree una nueva vigencia.",
      );
    }
    if (hasta && hasta < desde) throw errorNegocio(422, "VIGENCIA_INVALIDA", "La fecha final es anterior a la inicial");
    if (hasta && ultimaUso && hasta < ultimaUso) {
      throw errorNegocio(409, "CIERRE_ANTES_DE_USO", `Hay servicios hasta el ${fechaTexto(ultimaUso)} cobrados con esta tabla: la fecha final no puede ser anterior`);
    }
    if (desde === actual.vigente_desde && hasta === actual.vigente_hasta) {
      throw errorNegocio(422, "SIN_CAMBIOS", "Las fechas son iguales a las actuales");
    }

    await client.query("UPDATE tarifas_bolsa_km SET vigente_desde = $2, vigente_hasta = $3 WHERE id = ANY($1::int[])", [ids, desde, hasta]);
    await BitacoraModel.registrar(client, {
      usuarioId,
      entidad: "tarifas_bolsa_km",
      registroId: ids[0],
      operacion: "actualizar",
      anteriores: { cliente_id: clienteId, vigente_desde: actual.vigente_desde, vigente_hasta: actual.vigente_hasta },
      nuevos: { cliente_id: clienteId, vigente_desde: desde, vigente_hasta: hasta },
      motivo,
    });
    return { vigente_desde: desde, vigente_hasta: hasta };
  });
}

// Borrar una tabla que nunca se usó (ej. creada por error)
async function borrarVigencia({ clienteId, vigenteDesde, motivo, usuarioId }) {
  return withTransaction(async (client) => {
    const { ids, actual, ultimaUso } = await celdasDeVigencia(client, clienteId, vigenteDesde);
    if (ultimaUso) {
      throw errorNegocio(409, "VIGENCIA_EN_USO", "Esta tabla ya cobró servicios: no se puede borrar, solo cerrar su vigencia");
    }
    await client.query("DELETE FROM tarifas_bolsa_km WHERE id = ANY($1::int[])", [ids]);
    await BitacoraModel.registrar(client, {
      usuarioId,
      entidad: "tarifas_bolsa_km",
      registroId: ids[0],
      operacion: "anular",
      anteriores: { cliente_id: clienteId, vigente_desde: actual.vigente_desde, vigente_hasta: actual.vigente_hasta, celdas: ids.length },
      motivo,
    });
  });
}

/**
 * Columna provisional del cliente (mientras el mes está abierto). "km" es un
 * valor que cae en la columna elegida. Recalcula el mes en curso.
 */
async function cambiarProvisional({ clienteId, km, usuarioId }) {
  return withTransaction(async (client) => {
    const { rows } = await client.query("SELECT bolsa_km_provisional, modalidad_cobro FROM clientes WHERE id = $1 FOR UPDATE", [clienteId]);
    if (!rows[0]) throw errorNegocio(404, "NO_ENCONTRADO", "El cliente no existe");
    if (rows[0].modalidad_cobro !== "bolsa_km_mensual") throw errorNegocio(422, "CLIENTE_SIN_BOLSA", "Este cliente no se cobra por bolsa de km");
    await client.query("UPDATE clientes SET bolsa_km_provisional = $2 WHERE id = $1", [clienteId, km]);
    await BitacoraModel.registrar(client, {
      usuarioId,
      entidad: "clientes",
      registroId: clienteId,
      operacion: "actualizar",
      anteriores: { bolsa_km_provisional: rows[0].bolsa_km_provisional },
      nuevos: { bolsa_km_provisional: km },
      motivo: "Columna provisional de la bolsa de km",
    });
    const { rows: hoy } = await client.query("SELECT current_date::text AS d");
    const recalculados = await BolsaKm.recalcularMes(client, { clienteId, fecha: hoy[0].d, usuarioId, forzar: true });
    return { bolsa_km_provisional: km, recalculados };
  });
}

module.exports = { versiones, tabla, actualizarCelda, nuevaVigencia, editarVigencia, borrarVigencia, cambiarProvisional };
