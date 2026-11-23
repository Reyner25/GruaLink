/**
 * Crea el PRIMER administrador real (o restablece la contraseña de uno que
 * ya existe). Pensado para la instalación en producción, donde no hay
 * usuarios de prueba.
 *
 * Uso (desde la carpeta backend, en una terminal):
 *   npm run crear-admin
 *
 * Pide nombre, correo y contraseña. La contraseña NO se ve al escribirla y
 * no queda en el historial de comandos. Se guarda cifrada con bcrypt.
 * Después, los demás usuarios se crean desde el panel (Usuarios).
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });
const readline = require("readline");
const bcrypt = require("bcrypt");
const { pool, withTransaction } = require("../config/db");

// UNA sola interfaz para todas las preguntas: si se crea una por pregunta,
// el texto que llega de una vez (pegado) se pierde entre una y otra.
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
let ocultar = null; // texto de la pregunta cuya respuesta no debe verse

// Mientras se escribe una contraseña, solo se muestra la pregunta, no lo tecleado
rl._writeToOutput = (s) => {
  if (!ocultar || s.includes(ocultar)) rl.output.write(s);
};

// Cola de líneas: si llegan varias de una vez (texto pegado), se guardan
// y se entregan una por pregunta, en orden.
const cola = [];
let esperando = null;
rl.on("line", (linea) => {
  if (esperando) {
    const entregar = esperando;
    esperando = null;
    entregar(linea);
  } else cola.push(linea);
});
rl.on("close", () => esperando?.(null));

function preguntar(texto, { oculto = false } = {}) {
  return new Promise((resolver, rechazar) => {
    ocultar = oculto ? texto : null;
    rl.setPrompt(texto);
    rl.prompt();
    const responder = (linea) => {
      if (oculto) rl.output.write("\n");
      ocultar = null;
      if (linea === null) return rechazar(new Error("Se canceló la entrada de datos."));
      resolver(linea.trim());
    };
    if (cola.length) responder(cola.shift());
    else esperando = responder;
  });
}

const claveValida = (c) => c.length >= 8 && /[A-Za-z]/.test(c) && /\d/.test(c);

async function main() {
  console.log("Crear administrador de GruaLink\n");
  const nombre = await preguntar("Nombre completo: ");
  const email = (await preguntar("Correo (para iniciar sesión): ")).toLowerCase();
  if (!nombre || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Nombre o correo inválido.");

  const clave = await preguntar("Contraseña (mín. 8, con letra y número): ", { oculto: true });
  if (!claveValida(clave)) throw new Error("La contraseña debe tener mínimo 8 caracteres, con al menos una letra y un número.");
  if ((await preguntar("Repita la contraseña: ", { oculto: true })) !== clave) throw new Error("Las contraseñas no coinciden.");

  const hash = await bcrypt.hash(clave, 10);
  await withTransaction(async (client) => {
    const { rows: rol } = await client.query("SELECT id FROM roles WHERE nombre = 'administrador'");
    if (!rol[0]) throw new Error("No existe el rol 'administrador': ejecute primero 'npm run migrate'.");

    const { rows } = await client.query(
      `INSERT INTO usuarios (rol_id, nombre, email, password_hash, activo)
       VALUES ($1, $2, $3, $4, TRUE)
       ON CONFLICT (email) DO UPDATE
         SET password_hash = EXCLUDED.password_hash, activo = TRUE, rol_id = EXCLUDED.rol_id
       RETURNING id, (xmax = 0) AS nuevo`,
      [rol[0].id, nombre, email, hash],
    );
    await client.query(
      `INSERT INTO bitacora (usuario_id, entidad, registro_id, operacion, valores_nuevos, motivo)
       VALUES (NULL, 'usuarios', $1, $2, $3, 'Creado desde la consola (npm run crear-admin)')`,
      [rows[0].id, rows[0].nuevo ? "crear" : "actualizar", JSON.stringify({ email, rol: "administrador" })],
    );
    console.log(rows[0].nuevo ? `\n✔ Administrador creado: ${email}` : `\n✔ El usuario ${email} ya existía: ahora es administrador activo con la nueva contraseña.`);
  });
}

main()
  .catch((error) => {
    console.error("\n✖", error.message);
    process.exitCode = 1;
  })
  .finally(() => {
    rl.close();
    return pool.end();
  });
