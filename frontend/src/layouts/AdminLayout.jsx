/**
 * Marco del panel ADMINISTRATIVO (administrador y financiero).
 *
 * - Menú lateral azul oscuro fijo en pantallas grandes; en pantallas
 *   angostas se abre con el botón ☰.
 * - Cada opción declara el permiso que necesita: si el usuario no lo tiene
 *   (ej. el financiero y "Bitácora"), la opción no aparece. El backend
 *   igual valida cada petición.
 * - Para agregar una pantalla nueva: agregarla a MENU y a las rutas de App.jsx.
 */
import { useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  AppBar,
  Avatar,
  Box,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import DashboardIcon from "@mui/icons-material/Dashboard";
import AssignmentIcon from "@mui/icons-material/Assignment";
import ScheduleIcon from "@mui/icons-material/Schedule";
import InsightsIcon from "@mui/icons-material/Insights";
import RouteIcon from "@mui/icons-material/Route";
import PaymentsIcon from "@mui/icons-material/Payments";
import HistoryEduIcon from "@mui/icons-material/HistoryEdu";
import LogoutIcon from "@mui/icons-material/Logout";
import PriceChangeIcon from "@mui/icons-material/PriceChange";
import BusinessIcon from "@mui/icons-material/Business";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import ListAltIcon from "@mui/icons-material/ListAlt";
import PeopleIcon from "@mui/icons-material/People";
import { useAuth } from "../context/AuthContext";
import { puede } from "../utils/roles";
import Marca from "../components/Marca";

const ANCHO_MENU = 250;

// permiso: null = cualquiera que entre al panel
const MENU = [
  { seccion: "Operación" },
  { texto: "Inicio", ruta: "/admin", icono: <DashboardIcon />, exacta: true },
  { texto: "Servicios", ruta: "/admin/servicios", icono: <AssignmentIcon /> },
  { texto: "Turnos", ruta: "/admin/turnos", icono: <ScheduleIcon />, permiso: "turnos:ver_todos" },
  { seccion: "Administración" },
  { texto: "Tarifas", ruta: "/admin/tarifas", icono: <PriceChangeIcon />, permiso: "tarifas:ver" },
  { texto: "Clientes", ruta: "/admin/clientes", icono: <BusinessIcon />, permiso: "clientes:ver" },
  { texto: "Grúas", ruta: "/admin/gruas", icono: <LocalShippingIcon />, permiso: "gruas:ver" },
  { texto: "Catálogos", ruta: "/admin/catalogos", icono: <ListAltIcon />, permiso: "catalogos:ver" },
  { texto: "Usuarios", ruta: "/admin/usuarios", icono: <PeopleIcon />, permiso: "usuarios:gestionar" },
  { seccion: "Reportes" },
  { texto: "Promedio de grúas", ruta: "/admin/reportes/promedio-gruas", icono: <InsightsIcon /> },
  { texto: "Bolsa de km (Suma)", ruta: "/admin/reportes/bolsa-km", icono: <RouteIcon />, permiso: "reportes:ver" },
  { texto: "Pago a operadores", ruta: "/admin/reportes/pago-operadores", icono: <PaymentsIcon />, permiso: "valores:ver" },
  { seccion: "Control" },
  { texto: "Bitácora", ruta: "/admin/bitacora", icono: <HistoryEduIcon />, permiso: "bitacora:ver" },
];

const ROLES = { administrador: "Administrador", financiero: "Financiero" };

export default function AdminLayout() {
  const theme = useTheme();
  const esAncho = useMediaQuery(theme.breakpoints.up("md"));
  const [abierto, setAbierto] = useState(false);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { usuario, cerrarSesion } = useAuth();

  const opciones = MENU.filter((o) => !o.permiso || puede(usuario, o.permiso));
  // Quitar títulos de sección que quedaron sin opciones debajo
  const visibles = opciones.filter((o, i) => !o.seccion || (opciones[i + 1] && !opciones[i + 1].seccion));

  async function salir() {
    await cerrarSesion();
    navigate("/login", { replace: true });
  }

  const menu = (
    <Box sx={{ width: ANCHO_MENU, height: "100%", display: "flex", flexDirection: "column", color: "#fff" }}>
      <Box sx={{ px: 2.5, py: 2.5 }}>
        <Marca lema />
      </Box>
      <Divider sx={{ borderColor: "rgba(255,255,255,0.12)" }} />
      <List sx={{ flexGrow: 1, py: 1 }}>
        {visibles.map((o) =>
          o.seccion ? (
            <ListSubheader
              key={o.seccion}
              disableSticky
              sx={{ bgcolor: "transparent", color: "rgba(255,255,255,0.5)", lineHeight: "32px", mt: 1 }}
            >
              {o.seccion}
            </ListSubheader>
          ) : (
            <ListItemButton
              key={o.ruta}
              selected={o.exacta ? pathname === o.ruta : pathname.startsWith(o.ruta)}
              onClick={() => {
                navigate(o.ruta);
                setAbierto(false);
              }}
              sx={{
                mx: 1,
                borderRadius: 2,
                "&.Mui-selected, &.Mui-selected:hover": { bgcolor: "primary.main" },
                "&:hover": { bgcolor: "rgba(255,255,255,0.08)" },
              }}
            >
              <ListItemIcon sx={{ color: "inherit", minWidth: 40 }}>{o.icono}</ListItemIcon>
              <ListItemText primary={o.texto} />
            </ListItemButton>
          ),
        )}
      </List>
      <Divider sx={{ borderColor: "rgba(255,255,255,0.12)" }} />
      <Typography variant="caption" sx={{ px: 2.5, py: 1.5, color: "rgba(255,255,255,0.5)" }}>
        GruaLink v1.0 · Sistema de gestión de grúas
      </Typography>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100dvh", bgcolor: "background.default" }}>
      <Drawer
        variant={esAncho ? "permanent" : "temporary"}
        open={esAncho || abierto}
        onClose={() => setAbierto(false)}
        sx={{
          width: esAncho ? ANCHO_MENU : 0,
          flexShrink: 0,
          "& .MuiDrawer-paper": { width: ANCHO_MENU, bgcolor: "primary.dark", border: 0 },
        }}
      >
        {menu}
      </Drawer>

      <Box sx={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <AppBar position="sticky" elevation={0} color="inherit" sx={{ borderBottom: 1, borderColor: "divider" }}>
          <Toolbar sx={{ gap: 1.5 }}>
            {!esAncho && (
              <IconButton edge="start" aria-label="Abrir menú" onClick={() => setAbierto(true)}>
                <MenuIcon />
              </IconButton>
            )}
            <Box sx={{ flexGrow: 1 }} />
            <Box sx={{ textAlign: "right", display: { xs: "none", sm: "block" } }}>
              <Typography variant="body2" sx={{ fontWeight: 600, lineHeight: 1.2 }}>
                {usuario?.nombre}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {ROLES[usuario?.rol] || usuario?.rol}
              </Typography>
            </Box>
            <Avatar sx={{ width: 36, height: 36, bgcolor: "primary.main" }}>{usuario?.nombre?.[0]}</Avatar>
            <IconButton aria-label="Cerrar sesión" title="Cerrar sesión" onClick={salir}>
              <LogoutIcon />
            </IconButton>
          </Toolbar>
        </AppBar>

        <Box component="main" sx={{ p: { xs: 2, md: 3 }, flexGrow: 1, maxWidth: 1400, width: "100%", mx: "auto" }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
