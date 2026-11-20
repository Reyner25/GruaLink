/**
 * Consultas genéricas para tablas sencillas (clientes, tipos de vehículo,
 * tipos de servicio, conceptos, grúas, usuarios…).
 *
 * crearModeloCrud({ tabla, columnas, select, orden }) devuelve un objeto con
 * listar / obtenerPorId / crear / actualizar ya escritos con SQL parametrizado.
 *
 * SEGURIDAD: "tabla" y "columnas" vienen SIEMPRE del código (nunca del
 * usuario), por eso se pueden poner dentro del texto SQL. Los VALORES van
 * siempre como parámetros ($1, $2…).
 */
const { pool } = require("../config/db");

function crearModeloCrud({ tabla, columnas, select = `SELECT * FROM ${tabla}`, orden = "id" }) {
  // Solo se escriben columnas de la lista blanca
  const filtrar = (datos) => columnas.filter((col) => datos[col] !== undefined);

  return {
    tabla,

    /**
     * filtros: { columna: valor } con igualdad exacta.
     * buscar:  texto para buscar con ILIKE en "camposBusqueda".
     */
    async listar({ filtros = {}, buscar, camposBusqueda = [], limite = 100, pagina = 1 } = {}) {
      const condiciones = [];
      const valores = [];
      for (const [col, valor] of Object.entries(filtros)) {
        if (valor === undefined) continue;
        valores.push(valor);
        condiciones.push(`${col} = $${valores.length}`);
      }
      if (buscar && camposBusqueda.length) {
        valores.push(`%${buscar}%`);
        condiciones.push(`(${camposBusqueda.map((c) => `${c} ILIKE $${valores.length}`).join(" OR ")})`);
      }
      const where = condiciones.length ? `WHERE ${condiciones.join(" AND ")}` : "";
      valores.push(limite, (pagina - 1) * limite);
      const { rows } = await pool.query(
        `SELECT * FROM (${select}) AS t ${where}
         ORDER BY ${orden}
         LIMIT $${valores.length - 1} OFFSET $${valores.length}`,
        valores,
      );
      return rows;
    },

    async obtenerPorId(id, { client = pool, bloquear = false } = {}) {
      // FOR UPDATE sobre la tabla base: bloquea la fila mientras se modifica
      if (bloquear) await client.query(`SELECT id FROM ${tabla} WHERE id = $1 FOR UPDATE`, [id]);
      const { rows } = await client.query(`SELECT * FROM (${select}) AS t WHERE id = $1`, [id]);
      return rows[0] || null;
    },

    async crear(client, datos) {
      const cols = filtrar(datos);
      const { rows } = await client.query(
        `INSERT INTO ${tabla} (${cols.join(", ")})
         VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")})
         RETURNING id`,
        cols.map((c) => datos[c]),
      );
      return this.obtenerPorId(rows[0].id, { client });
    },

    async actualizar(client, id, cambios) {
      const cols = filtrar(cambios);
      if (cols.length > 0) {
        await client.query(
          `UPDATE ${tabla} SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(", ")} WHERE id = $1`,
          [id, ...cols.map((c) => cambios[c])],
        );
      }
      return this.obtenerPorId(id, { client });
    },
  };
}

module.exports = { crearModeloCrud };
