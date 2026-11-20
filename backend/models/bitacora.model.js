const { pool } = require("../config/db");

const BitacoraModel = {
  // Siempre dentro de la transacción de la operación que se registra:
  // si la operación falla, tampoco queda el registro en bitácora.
  async registrar(client, { usuarioId, entidad, registroId, operacion, anteriores, nuevos, motivo }) {
    await client.query(
      `INSERT INTO bitacora (usuario_id, entidad, registro_id, operacion,
                             valores_anteriores, valores_nuevos, motivo)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        usuarioId,
        entidad,
        registroId,
        operacion,
        anteriores ? JSON.stringify(anteriores) : null,
        nuevos ? JSON.stringify(nuevos) : null,
        motivo || null,
      ],
    );
  },

  // Consulta para el administrador (solo lectura: la bitácora nunca se edita)
  async listar({ entidad, registroId, usuarioId, operacion, desde, hasta, limite = 50, pagina = 1 }) {
    const condiciones = [];
    const valores = [];
    const agregar = (sql, valor) => {
      if (valor === undefined) return;
      valores.push(valor);
      condiciones.push(sql.replace("?", `$${valores.length}`));
    };
    agregar("b.entidad = ?", entidad);
    agregar("b.registro_id = ?", registroId);
    agregar("b.usuario_id = ?", usuarioId);
    agregar("b.operacion = ?", operacion);
    agregar("b.creado_en >= ?::date", desde);
    agregar("b.creado_en < ?::date + 1", hasta);

    const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";
    valores.push(limite, (pagina - 1) * limite);
    const { rows } = await pool.query(
      `SELECT b.id, b.creado_en, b.entidad, b.registro_id, b.operacion,
              b.valores_anteriores, b.valores_nuevos, b.motivo,
              b.usuario_id, u.nombre AS usuario_nombre
       FROM bitacora b
       LEFT JOIN usuarios u ON u.id = b.usuario_id
       ${where}
       ORDER BY b.creado_en DESC, b.id DESC
       LIMIT $${valores.length - 1} OFFSET $${valores.length}`,
      valores,
    );
    return rows;
  },
};

module.exports = BitacoraModel;
