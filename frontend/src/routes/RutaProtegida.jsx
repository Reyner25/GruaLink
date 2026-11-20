/**
 * Protege una ruta: exige sesión y, opcionalmente, ciertos roles.
 * OJO: esto solo es comodidad visual. La seguridad real está en el backend,
 * que valida sesión y permisos en cada petición.
 */
import { Navigate, useLocation } from "react-router-dom";
import { Box, CircularProgress } from "@mui/material";
import { useAuth } from "../context/AuthContext";
import { inicioPorRol } from "../utils/roles";

export default function RutaProtegida({ children, roles }) {
  const { usuario, validando } = useAuth();
  const location = useLocation();

  if (validando) {
    return (
      <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <CircularProgress />
      </Box>
    );
  }
  if (!usuario) return <Navigate to="/login" replace state={{ desde: location.pathname }} />;
  if (roles && !roles.includes(usuario.rol)) return <Navigate to={inicioPorRol(usuario.rol)} replace />;
  return children;
}
