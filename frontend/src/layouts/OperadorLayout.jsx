/**
 * Marco de la app móvil del operador.
 *
 * - Ancho máximo de un celular (en computador se ve centrado como un teléfono).
 * - Navegación inferior: Inicio · Servicios · Historial · Perfil.
 * - En los formularios (nuevo servicio, finalizar, iniciar turno) se oculta
 *   la navegación inferior para dar espacio y evitar salir por error.
 * - Comparte el turno activo con todas las pantallas (TurnoProvider).
 */
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { BottomNavigation, BottomNavigationAction, Box, Paper } from "@mui/material";
import HomeIcon from "@mui/icons-material/Home";
import ListAltIcon from "@mui/icons-material/ListAlt";
import HistoryIcon from "@mui/icons-material/History";
import PersonIcon from "@mui/icons-material/Person";
import { TurnoProvider } from "../context/TurnoContext";

const ANCHO_MAXIMO = 480;

const PESTANAS = [
  { valor: "/app", texto: "Inicio", icono: <HomeIcon /> },
  { valor: "/app/servicios", texto: "Servicios", icono: <ListAltIcon /> },
  { valor: "/app/turnos", texto: "Historial", icono: <HistoryIcon /> },
  { valor: "/app/perfil", texto: "Perfil", icono: <PersonIcon /> },
];

// Pantallas de formulario: sin navegación inferior
const ES_FORMULARIO = /\/(nuevo|finalizar|iniciar)$/;

export default function OperadorLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const mostrarNavegacion = !ES_FORMULARIO.test(pathname);

  // La pestaña activa es la de prefijo más largo que coincide con la ruta
  const activa =
    [...PESTANAS].sort((a, b) => b.valor.length - a.valor.length).find((p) => pathname.startsWith(p.valor))?.valor ||
    false;

  return (
    <TurnoProvider>
      <Box sx={{ bgcolor: { xs: "background.default", sm: "#DDE4EE" }, minHeight: "100dvh" }}>
        <Box
          sx={{
            maxWidth: ANCHO_MAXIMO,
            mx: "auto",
            minHeight: "100dvh",
            bgcolor: "background.default",
            display: "flex",
            flexDirection: "column",
            pb: mostrarNavegacion ? "72px" : 0,
            boxShadow: { sm: "0 0 24px rgba(11,31,58,0.12)" },
          }}
        >
          <Outlet />
        </Box>

        {mostrarNavegacion && (
          <Paper
            elevation={6}
            sx={{ position: "fixed", bottom: 0, left: 0, right: 0, maxWidth: ANCHO_MAXIMO, mx: "auto", zIndex: 10 }}
          >
            <BottomNavigation showLabels value={activa} onChange={(_, ruta) => navigate(ruta)} sx={{ height: 64 }}>
              {PESTANAS.map((p) => (
                <BottomNavigationAction key={p.valor} value={p.valor} label={p.texto} icon={p.icono} />
              ))}
            </BottomNavigation>
          </Paper>
        )}
      </Box>
    </TurnoProvider>
  );
}
