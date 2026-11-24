/**
 * Rutas de tarifas.
 *
 *  /api/tarifas            tarifa BÁSICA (cliente + vehículo + tipo de servicio + km)
 *  /api/precios-concepto   precio de cada concepto adicional por cliente
 *  /api/pago-operador      reglas de pago al operador (% de la tarifa, fijo por cardán…)
 *
 * Para ambas:
 *  GET    /        ?cliente_id=<id>|generales  ?vigente_en=AAAA-MM-DD  (+ filtros propios)
 *  GET    /:id
 *  POST   /        crear
 *  PATCH  /:id     corregir (si no se ha usado) o cerrar vigencia (si ya se usó)
 *  DELETE /:id     borrar (solo si nunca se usó) { motivo }
 *
 * Consulta: administrador y financiero · Modificación: administrador
 */
const { Router } = require("express");
const { body, query } = require("express-validator");
const { autenticar } = require("../middlewares/auth");
const { requierePermiso } = require("../middlewares/permisos");
const c = require("../validators/comun");
const { TarifaAdminService, PrecioConceptoService, ReglaPagoService } = require("../services/tarifaAdmin.service");

// cliente_id: número o null (null = Clientes generales)
const clienteId = (opcional) => {
  let regla = body("cliente_id");
  if (opcional) regla = regla.optional({ values: "undefined" });
  return regla
    .custom((v) => v === null || (Number.isInteger(v) && v > 0))
    .withMessage("Cliente inválido (use null para Clientes generales)");
};

const kmNulable = body("km_hasta")
  .optional({ values: "undefined" })
  .custom((v) => v === null || (typeof v === "number" && v > 0 && v < 1000000))
  .withMessage("Km final inválido (número o null = sin límite)");

const camposTarifa = (opcional) => [
  clienteId(opcional),
  c.entero("tipo_vehiculo_id", { opcional, mensaje: "Tipo de vehículo inválido" }),
  c.entero("tipo_servicio_id", { opcional, mensaje: "Tipo de servicio inválido" }),
  body("km_desde").optional({ values: "undefined" }).isFloat({ min: 0, max: 999999 }).withMessage("Km inicial inválido").toFloat(),
  kmNulable,
  c.dinero("valor", { opcional }),
  c.fecha("vigente_desde", { opcional }),
  c.fecha("vigente_hasta", { opcional: true, nulable: true }),
];

// Hora "HH:MM" o null (horario del recargo nocturno)
const horaNulable = (campo) =>
  body(campo)
    .optional({ values: "undefined" })
    .customSanitizer((v) => (typeof v === "string" ? v.trim().slice(0, 5) || null : v))
    .custom((v) => v === null || (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)))
    .withMessage("Hora inválida (formato HH:MM, ej. 19:00)");

const camposPrecio = (opcional) => [
  c.entero("concepto_id", { opcional, mensaje: "Concepto inválido" }),
  clienteId(opcional),
  c.dinero("valor", { opcional }),
  c.fecha("vigente_desde", { opcional }),
  c.fecha("vigente_hasta", { opcional: true, nulable: true }),
  // Solo en el precio del "Recargo nocturno": se cobra si el servicio termina después de "desde" y antes de "hasta"
  horaNulable("recargo_desde"),
  horaNulable("recargo_hasta"),
];

const filtrosListado = [
  query("cliente_id").optional().custom((v) => v === "generales" || /^\d+$/.test(v)),
  query("vigente_en").optional().isISO8601({ strict: true }),
  query("tipo_vehiculo_id").optional().isInt({ min: 1 }),
  query("tipo_servicio_id").optional().isInt({ min: 1 }),
  query("concepto_id").optional().isInt({ min: 1 }),
  ...c.paginacion(),
];

function crearRouter(servicio, { clave, claveUno, campos, filtros }) {
  const ctrl = {
    async listar(req, res, next) {
      try {
        const f = {};
        for (const col of filtros) if (req.query[col]) f[col] = Number(req.query[col]);
        const filas = await servicio.listar({
          filtros: f,
          clienteId: req.query.cliente_id,
          vigenteEn: req.query.vigente_en,
          limite: Number(req.query.limite) || 500,
          pagina: Number(req.query.pagina) || 1,
        });
        res.json({ [clave]: filas });
      } catch (err) {
        next(err);
      }
    },
    async obtener(req, res, next) {
      try {
        res.json({ [claveUno]: await servicio.obtener(Number(req.params.id)) });
      } catch (err) {
        next(err);
      }
    },
    async crear(req, res, next) {
      try {
        res.status(201).json({ [claveUno]: await servicio.crear({ datos: req.body, usuarioId: req.usuario.id }) });
      } catch (err) {
        next(err);
      }
    },
    async actualizar(req, res, next) {
      try {
        const { motivo, ...cambios } = req.body;
        const fila = await servicio.actualizar({ id: Number(req.params.id), cambios, motivo, usuarioId: req.usuario.id });
        res.json({ [claveUno]: fila });
      } catch (err) {
        next(err);
      }
    },
    async eliminar(req, res, next) {
      try {
        await servicio.eliminar({ id: Number(req.params.id), motivo: req.body.motivo, usuarioId: req.usuario.id });
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  };

  const router = Router();
  router.use(autenticar);
  const ver = requierePermiso("tarifas:ver", "tarifas:gestionar");
  const gestionar = requierePermiso("tarifas:gestionar");

  router.get("/", ver, ...filtrosListado, c.resultadoValidacion, ctrl.listar);
  router.get("/:id", ver, c.idParam(), c.resultadoValidacion, ctrl.obtener);
  router.post("/", gestionar, ...campos(false), c.resultadoValidacion, ctrl.crear);
  router.patch("/:id", gestionar, c.idParam(), ...campos(true), c.motivo(), c.resultadoValidacion, c.alMenosUnCampo, ctrl.actualizar);
  router.delete("/:id", gestionar, c.idParam(), c.motivo(true), c.resultadoValidacion, ctrl.eliminar);
  return router;
}

const tarifas = crearRouter(TarifaAdminService, {
  clave: "tarifas",
  claveUno: "tarifa",
  campos: camposTarifa,
  filtros: ["tipo_vehiculo_id", "tipo_servicio_id"],
});

const preciosConcepto = crearRouter(PrecioConceptoService, {
  clave: "precios",
  claveUno: "precio",
  campos: camposPrecio,
  filtros: ["concepto_id"],
});

// ---------- Pago a operadores (/api/pago-operador) ----------
const COMPONENTES = ["total", "tarifa_basica", "valor_a_convenir", "concepto"];
const FORMAS = ["porcentaje", "fijo_servicio", "no_paga"];
const camposReglaPago = (opcional) => [
  clienteId(opcional),
  (opcional ? body("componente").optional({ values: "undefined" }) : body("componente")).isIn(COMPONENTES).withMessage("Indique a qué aplica la regla"),
  body("concepto_id")
    .optional({ values: "undefined" })
    .custom((v) => v === null || (Number.isInteger(v) && v > 0))
    .withMessage("Concepto inválido"),
  (opcional ? body("forma").optional({ values: "undefined" }) : body("forma")).isIn(FORMAS).withMessage("Indique cómo se paga"),
  body("valor")
    .optional({ values: "undefined" })
    .custom((v) => v === null || (typeof v === "number" && v >= 0 && v <= 99999999))
    .withMessage("Valor inválido"),
  c.fecha("vigente_desde", { opcional }),
  c.fecha("vigente_hasta", { opcional: true, nulable: true }),
];

const reglasPagoOperador = crearRouter(ReglaPagoService, {
  clave: "reglas",
  claveUno: "regla",
  campos: camposReglaPago,
  filtros: [],
});

module.exports = { tarifas, preciosConcepto, reglasPagoOperador };
