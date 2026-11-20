/**
 * Se importa en la PRIMERA línea de cada archivo de pruebas.
 * Fija NODE_ENV=test antes de cargar config/db.js, para que las pruebas usen
 * la base "<nombre>_test" y nunca la de desarrollo.
 * (En Windows no se puede escribir "NODE_ENV=test npm test" en package.json.)
 */
process.env.NODE_ENV = "test";
require("dotenv").config({ quiet: true });
