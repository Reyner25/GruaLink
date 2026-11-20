/**
 * Modelo de grúas.
 * - Consultas para el operador (grúas disponibles para iniciar turno).
 * - CRUD para el administrador (crearModeloCrud) + historial de estados.
 */
const { pool } = require("../config/db");
const { crearModeloCrud } = require("./crud.model");

// Cada grúa con el turno activo que la está usando (si hay)
const SELECT_ADMIN = `
  SELECT g.id, g.placa, g.numero_interno, g.estado,
         t.id AS turno_activo_id, u.nombre AS operador_en_turno, t.inicio AS turno_inicio
  FROM gruas g
  LEFT JOIN turnos_operador t ON t.grua_id = g.id AND t.estado = 'activo'
  LEFT JOIN usuarios u ON u.id = t.operador_id`;

const crud = crearModeloCrud({
  tabla: "gruas",
  columnas: ["placa", "numero_interno"], // el estado se cambia SOLO con cambiarEstado()
  select: SELECT_ADMIN,
  orden: "numero_interno",
});

const GruaModel = {
  ...crud,

  /**
   * Grúas activas para elegir al iniciar turno.
   * en_uso = TRUE si ya tiene un turno activo (otro operador la está usando).
   */
  async listarParaTurno() {
    const { rows } = await pool.query(
      `SELECT g.id, g.placa, g.numero_interno,
              EXISTS (SELECT 1 FROM turnos_operador t
                      WHERE t.grua_id = g.id AND t.estado = 'activo') AS en_uso
       FROM gruas g
       WHERE g.estado = 'activa'
       ORDER BY g.numero_interno`,
    );
    return rows;
  },

  // Cambia el estado y deja el registro en el historial (misma transacción)
  async cambiarEstado(client, id, { estado, usuarioId, motivo }) {
    await client.query("UPDATE gruas SET estado = $2 WHERE id = $1", [id, estado]);
    await client.query(
      `INSERT INTO gruas_estado_historial (grua_id, estado, usuario_id, motivo)
       VALUES ($1, $2, $3, $4)`,
      [id, estado, usuarioId, motivo || null],
    );
    return crud.obtenerPorId(id, { client });
  },

  async historial(id) {
    const { rows } = await pool.query(
      `SELECT h.id, h.estado, h.desde, h.motivo, u.nombre AS usuario
       FROM gruas_estado_historial h
       LEFT JOIN usuarios u ON u.id = h.usuario_id
       WHERE h.grua_id = $1
       ORDER BY h.desde DESC, h.id DESC`,
      [id],
    );
    return rows;
  },
};

module.exports = GruaModel;
