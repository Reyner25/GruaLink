/**
 * Controlador genérico para catálogos administrables.
 *
 * crearControladorCatalogo(servicio, opciones) devuelve los 4 manejadores
 * HTTP (listar, obtener, crear, actualizar).
 *
 * opciones:
 *   clave           nombre de la propiedad en la respuesta ("clientes")
 *   claveUno        nombre en singular ("cliente")
 *   filtrosQuery    { parametro: columna } filtros permitidos por query
 *   camposBusqueda  columnas donde busca ?buscar=
 *   presentar       función para quitar campos antes de responder
 *   validarCambio   reglas propias al actualizar (ver catalogoAdmin.service)
 */
function crearControladorCatalogo(servicio, opciones) {
  const {
    clave,
    claveUno,
    filtrosQuery = {},
    camposBusqueda = [],
    presentar = (fila) => fila,
    validarCambio,
  } = opciones;

  // Convierte "true"/"false" y números del query (que siempre llegan como texto)
  const convertir = (v) => (v === "true" ? true : v === "false" ? false : /^\d+$/.test(v) ? Number(v) : v);

  return {
    async listar(req, res, next) {
      try {
        const filtros = {};
        for (const [parametro, columna] of Object.entries(filtrosQuery)) {
          if (req.query[parametro] !== undefined) filtros[columna] = convertir(req.query[parametro]);
        }
        const filas = await servicio.listar({
          filtros,
          buscar: req.query.buscar,
          camposBusqueda,
          limite: Number(req.query.limite) || 100,
          pagina: Number(req.query.pagina) || 1,
        });
        res.json({ [clave]: filas.map(presentar) });
      } catch (err) {
        next(err);
      }
    },

    async obtener(req, res, next) {
      try {
        res.json({ [claveUno]: presentar(await servicio.obtener(Number(req.params.id))) });
      } catch (err) {
        next(err);
      }
    },

    async crear(req, res, next) {
      try {
        const creado = await servicio.crear({ datos: req.body, usuarioId: req.usuario.id });
        res.status(201).json({ [claveUno]: presentar(creado) });
      } catch (err) {
        next(err);
      }
    },

    async actualizar(req, res, next) {
      try {
        const { motivo, ...cambios } = req.body;
        const { actualizado } = await servicio.actualizar({
          id: Number(req.params.id),
          cambios,
          motivo,
          usuarioId: req.usuario.id,
          validarCambio: validarCambio && ((actual, c, client) => validarCambio(actual, c, client, req)),
        });
        res.json({ [claveUno]: presentar(actualizado) });
      } catch (err) {
        next(err);
      }
    },
  };
}

module.exports = { crearControladorCatalogo };
