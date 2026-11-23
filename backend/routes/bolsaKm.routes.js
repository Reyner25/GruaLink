/**
 * Bolsa de kilometraje mensual (Suma)  →  /api/bolsa-km
 *
 *  GET  /clientes                 clientes que se cobran por bolsa
 *  GET  /?cliente_id&mes=AAAA-MM   km del mes, columna aplicada, cuánto falta
 *                                 para la siguiente y los servicios del mes
 *  POST /recalcular {cliente_id, mes}   vuelve a calcular el mes (normalmente
 *                                 no hace falta: se recalcula solo)
 */
const { Router } = require("express");
const { query, body } = require("express-validator");
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

module.exports = router;
