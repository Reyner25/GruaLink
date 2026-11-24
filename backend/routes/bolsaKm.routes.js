/**
 * Bolsa de kilometraje mensual (Suma)  →  /api/bolsa-km
 *
 *  GET  /clientes                 clientes que se cobran por bolsa
 *  GET  /?cliente_id&mes=AAAA-MM   km del mes, columna aplicada, cuánto falta
 *                                 para la siguiente y los servicios del mes
 *  GET   /tabla?cliente_id&vigente_desde   tabla de una vigencia (Tarifas → Bolsa de km)
 *  PATCH /celdas/:id {forma, valor, motivo}   corregir una celda (si no se ha usado)
 *  POST  /versiones {cliente_id, copiar_de, vigente_desde, motivo}   nueva vigencia (copia)
 *  PATCH /provisional {cliente_id, bolsa_km_provisional}   columna provisional del mes abierto
 *  POST /recalcular {cliente_id, mes}   vuelve a calcular el mes (normalmente
 *                                 no hace falta: se recalcula solo)
 */
const { Router } = require("express");
const { query, body, param } = require("express-validator");
const { autenticar } = require("../middlewares/auth");
const { requierePermiso } = require("../middlewares/permisos");
const { resultadoValidacion } = require("../validators/comun");
const { pool, withTransaction } = require("../config/db");
const BolsaKm = require("../services/bolsaKm.service");
const { errorNegocio } = require("../utils/errores");

const mesValido = (regla) => regla.matches(/^\d{4}-(0[1-9]|1[0-2])$/).withMessage("Mes inválido (AAAA-MM)");

const router = Router();
router.use(autenticar);

router.get("/clientes", requierePermiso("reportes:ver"), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, COALESCE(nombre_comercial, razon_social) AS nombre FROM clientes
       WHERE modalidad_cobro = 'bolsa_km_mensual' ORDER BY 2`,
    );
    res.json({ clientes: rows });
  } catch (err) {
    next(err);
  }
});

router.get(
  "/",
  requierePermiso("reportes:ver"),
  query("cliente_id").isInt({ min: 1 }).withMessage("Cliente inválido"),
  mesValido(query("mes")),
  resultadoValidacion,
  async (req, res, next) => {
    try {
      const clienteId = Number(req.query.cliente_id);
      const { mes } = req.query;
      const resumen = await BolsaKm.resumenMes({ clienteId, mes });
      const { rows: servicios } = await pool.query(
        `SELECT s.id, s.numero_orden, s.fecha_servicio::text AS fecha_servicio, s.estado,
                ts.nombre AS tipo_servicio, ts.usa_bolsa_km, s.fuera_disponibilidad,
                s.km_servicio, s.km_vacio, s.km_servicio + s.km_vacio AS km_bolsa,
                s.valor_calculado, s.valor_aprobado, s.placa_vehiculo
         FROM servicios s
         LEFT JOIN tipos_servicio ts ON ts.id = s.tipo_servicio_id
         WHERE s.cliente_id = $1 AND to_char(s.fecha_servicio, 'YYYY-MM') = $2
         ORDER BY s.fecha_servicio, s.id`,
        [clienteId, mes],
      );
      res.json({ ...resumen, servicios });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/recalcular",
  requierePermiso("servicios:corregir"),
  body("cliente_id").isInt({ min: 1 }).toInt(),
  mesValido(body("mes")),
  resultadoValidacion,
  async (req, res, next) => {
    try {
      const { cliente_id: clienteId, mes } = req.body;
      const cambiaron = await withTransaction(async (client) => {
        if (!(await BolsaKm.esBolsa(client, clienteId))) {
          throw errorNegocio(422, "CLIENTE_SIN_BOLSA", "Este cliente no se cobra por bolsa de km");
        }
        return BolsaKm.recalcularMes(client, { clienteId, fecha: `${mes}-01`, usuarioId: req.usuario.id });
      });
      res.json({ cambiaron });
    } catch (err) {
      next(err);
    }
  },
);

// ---------- Administración de la tabla (Tarifas → "Bolsa de km") ----------
const BolsaTabla = require("../services/bolsaTabla.service");
const fecha = (regla) => regla.isISO8601({ strict: true }).withMessage("Fecha inválida");

router.get(
  "/tabla",
  requierePermiso("tarifas:ver", "tarifas:gestionar"),
  query("cliente_id").isInt({ min: 1 }).withMessage("Cliente inválido"),
  fecha(query("vigente_desde").optional()),
  resultadoValidacion,
  async (req, res, next) => {
    try {
      res.json(await BolsaTabla.tabla({ clienteId: Number(req.query.cliente_id), vigenteDesde: req.query.vigente_desde }));
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  "/celdas/:id",
  requierePermiso("tarifas:gestionar"),
  param("id").isInt({ min: 1 }),
  body("forma").isIn(["fijo", "por_km", "a_convenir"]).withMessage("Forma de cobro: fijo, por_km o a_convenir"),
  body("valor")
    .optional({ values: "undefined" })
    .custom((v) => v === null || (typeof v === "number" && v >= 0 && v <= 999999999))
    .withMessage("Valor inválido"),
  body("motivo").optional({ values: "null" }).isString().trim().isLength({ max: 500 }),
  resultadoValidacion,
  async (req, res, next) => {
    try {
      const { forma, valor = null, motivo } = req.body;
      res.json({ celda: await BolsaTabla.actualizarCelda({ id: Number(req.params.id), forma, valor, motivo, usuarioId: req.usuario.id }) });
    } catch (err) {
      next(err);
    }
  },
);

router.post(
  "/versiones",
  requierePermiso("tarifas:gestionar"),
  body("cliente_id").isInt({ min: 1 }).toInt(),
  fecha(body("copiar_de")),
  fecha(body("vigente_desde")),
  body("motivo").isString().trim().isLength({ min: 5, max: 500 }).withMessage("El motivo es obligatorio (mínimo 5 caracteres)"),
  resultadoValidacion,
  async (req, res, next) => {
    try {
      const { cliente_id: clienteId, copiar_de: copiarDe, vigente_desde: vigenteDesde, motivo } = req.body;
      res.status(201).json(await BolsaTabla.nuevaVigencia({ clienteId, copiarDe, vigenteDesde, motivo, usuarioId: req.usuario.id }));
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  "/provisional",
  requierePermiso("tarifas:gestionar"),
  body("cliente_id").isInt({ min: 1 }).toInt(),
  body("bolsa_km_provisional").isFloat({ min: 0, max: 99999999 }).withMessage("Km inválidos").toFloat(),
  resultadoValidacion,
  async (req, res, next) => {
    try {
      res.json(
        await BolsaTabla.cambiarProvisional({ clienteId: req.body.cliente_id, km: req.body.bolsa_km_provisional, usuarioId: req.usuario.id }),
      );
    } catch (err) {
      next(err);
    }
  },
);

module.exports = router;
