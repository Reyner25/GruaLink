require("dotenv").config({ path: "../.env" });

const { pool } = require("./db");

async function probarConexion() {
  try {
    console.log("DATABASE_URL cargada:", Boolean(process.env.DATABASE_URL));

    console.log("Probando conexión con PostgreSQL...");

    const resultado = await pool.query(`
      SELECT
        current_database() AS base_datos,
        current_user AS usuario,
        NOW() AS fecha_hora
    `);

    console.log("Conexion exitosa con PostgreSQL");
    console.table(resultado.rows);
  } catch (error) {
    console.error("Error completo:", error);
    console.error("Codigo:", error.code);
    console.error("Mensaje:", error.message);
  } finally {
    await pool.end();
  }
}

probarConexion();
