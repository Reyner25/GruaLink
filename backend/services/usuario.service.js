/**
 * Administración de usuarios.
 *
 * Reglas:
 *  - La contraseña se guarda cifrada con bcrypt; nunca se devuelve ni se
 *    escribe en la bitácora.
 *  - El correo es único (sin distinguir mayúsculas).
 *  - Un administrador no puede desactivarse ni quitarse el rol a sí mismo
 *    (evita quedarse sin acceso al sistema).
 *  - No se puede desactivar a un operador con turno activo: primero se cierra.
 *  - Al desactivar o cambiar la contraseña, se cierran sus sesiones abiertas.
 *  - No hay borrado: los usuarios se desactivan (sus servicios siguen
 *    apuntando a ellos).
 */
const bcrypt = require("bcrypt");
const { withTransaction } = require("../config/db");
const UsuarioModel = require("../models/usuario.model");
const TurnoModel = require("../models/turno.model");
const BitacoraModel = require("../models/bitacora.model");
const { crearServicioCatalogo } = require("./crudConBitacora.service");
const { errorNegocio } = require("../utils/errores");

const RONDAS_BCRYPT = 10;
const base = crearServicioCatalogo({
  modelo: UsuarioModel,
  entidad: "usuarios",
  nombre: "usuario",
  ocultar: ["password_hash", "ultimo_login"],
});

async function rolId(nombre, client) {
  const id = await UsuarioModel.idRol(nombre, { client });
  if (!id) throw errorNegocio(422, "ROL_INVALIDO", `El rol "${nombre}" no existe`);
  return id;
}

const UsuarioService = {
  listar: base.listar,
  obtener: base.obtener,
  roles: () => UsuarioModel.roles(),

  async crear({ datos, usuarioId }) {
    return withTransaction(async (client) => {
      if (await UsuarioModel.emailEnUso(datos.email, { client })) {
        throw errorNegocio(409, "EMAIL_EN_USO", "Ya existe un usuario con ese correo");
      }
      const creado = await UsuarioModel.crear(client, {
        nombre: datos.nombre,
        email: datos.email,
        rol_id: await rolId(datos.rol, client),
        password_hash: await bcrypt.hash(datos.password, RONDAS_BCRYPT),
        activo: datos.activo ?? true,
      });
      await BitacoraModel.registrar(client, {
        usuarioId,
        entidad: "usuarios",
        registroId: creado.id,
        operacion: "crear",
        nuevos: creado, // el modelo nunca trae password_hash
      });
      return creado;
    });
  },

  async actualizar({ id, cambios, usuarioId, motivo }) {
    const { rol, ...resto } = cambios;
    let cerrar = false;

    const resultado = await base.actualizar({
      id,
      usuarioId,
      motivo,
      cambios: resto,
      validarCambio: async (actual, c, client) => {
        const esElMismo = actual.id === usuarioId;
        if (esElMismo && c.activo === false) {
          throw errorNegocio(409, "NO_AUTODESACTIVAR", "No puede desactivar su propio usuario");
        }
        if (esElMismo && rol && rol !== actual.rol) {
          throw errorNegocio(409, "NO_AUTOCAMBIO_ROL", "No puede cambiar su propio rol");
        }
        if (c.email && (await UsuarioModel.emailEnUso(c.email, { excluirId: actual.id, client }))) {
          throw errorNegocio(409, "EMAIL_EN_USO", "Ya existe un usuario con ese correo");
        }
        if (c.activo === false && actual.activo) {
          const turno = await TurnoModel.obtenerActivo(actual.id, { client });
          if (turno) {
            throw errorNegocio(409, "USUARIO_EN_TURNO", "El usuario tiene un turno activo. Ciérrelo antes de desactivarlo.");
          }
          cerrar = true;
        }
        // El rol llega como nombre ("operador"); en la tabla se guarda su id
        if (rol) c.rol_id = await rolId(rol, client);
        if (cerrar) await UsuarioModel.cerrarSesiones(actual.id, { client });
      },
    });
    return resultado;
  },

  async cambiarPassword({ id, password, usuarioId, motivo }) {
    return withTransaction(async (client) => {
      const actual = await UsuarioModel.obtenerPorId(id, { client, bloquear: true });
      if (!actual) throw errorNegocio(404, "NO_ENCONTRADO", "El usuario no existe");
      await UsuarioModel.actualizar(client, id, { password_hash: await bcrypt.hash(password, RONDAS_BCRYPT) });
      await UsuarioModel.cerrarSesiones(id, { client });
      await BitacoraModel.registrar(client, {
        usuarioId,
        entidad: "usuarios",
        registroId: id,
        operacion: "actualizar",
        nuevos: { password: "cambiada" }, // nunca la contraseña real
        motivo: motivo || "Cambio de contraseña",
      });
    });
  },
};

module.exports = UsuarioService;
