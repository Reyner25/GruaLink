import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// A qué backend se envían las peticiones /api.
// Por defecto, el backend de desarrollo (puerto 4000).
// Para probar contra el backend de PRUEBAS se define GRUALINK_API
// (ver .claude/launch.json, configuración "frontend-pruebas").
const API = process.env.GRUALINK_API || "http://localhost:4000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.GRUALINK_PUERTO) || 5173,
    // Si el puerto está ocupado, fallar en vez de abrir otro en silencio
    // (así no queda un frontend conectado al backend equivocado)
    strictPort: true,
    proxy: {
      // Redirige /api al backend y evita problemas de CORS en desarrollo
      "/api": API,
    },
  },
});
