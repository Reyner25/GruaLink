/**
 * Punto de entrada: carga el .env y arranca la API.
 * Uso:  npm run dev   (se reinicia solo al guardar cambios)
 *       npm start     (producción)
 */
require("dotenv").config({ quiet: true });
const { crearApp } = require("./app");

const PORT = process.env.PORT || 4000;

crearApp().listen(PORT, () => {
  console.log(`API escuchando en puerto ${PORT}`);
});
