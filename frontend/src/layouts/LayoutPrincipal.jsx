import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  AppBar,
  Avatar,
  Box,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
  Divider,
  BottomNavigation,
  BottomNavigationAction,
  Paper,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import DashboardIcon from "@mui/icons-material/Dashboard";
import AssignmentIcon from "@mui/icons-material/Assignment";
import BuildIcon from "@mui/icons-material/Build";
import HomeIcon from "@mui/icons-material/Home";
import LogoutIcon from "@mui/icons-material/Logout";
import { useAuth } from "../context/AuthContext";

const ANCHO_MENU = 240;

// Cada opción indica qué roles la ven
const OPCIONES = [
  {
    texto: "Inicio",
    ruta: "/",
    icono: <HomeIcon />,
    roles: ["operador", "administrador", "financiero"],
  },
  // El operador usa la app móvil (/app); este menú es solo para administración.
  {
    texto: "Servicios",
    ruta: "/ordenes",
    icono: <AssignmentIcon />,
    roles: ["administrador", "financiero"],
  },
  {
    texto: "Panel de control",
    ruta: "/panel",
    icono: <DashboardIcon />,
    roles: ["administrador", "financiero"],
  },
  {
    texto: "Monitoreo",
    ruta: "/monitoreo",
    icono: <BuildIcon />,
    roles: ["administrador"],
  },
];

export default function LayoutPrincipal({ children }) {
  const [, setAbierto] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const theme = useTheme();
  const esMovil = useMediaQuery(theme.breakpoints.down("md"));
  const { usuario, cerrarSesion } = useAuth();

  async function salir() {
    await cerrarSesion();
    navigate("/login", { replace: true });
  }

  const opciones = OPCIONES.filter((op) => op.roles.includes(usuario?.rol));

  const contenidoMenu = (
    <Box
      sx={{
        width: ANCHO_MENU,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        color: "#fff",
      }}
    >
      <Box sx={{ p: 2.5 }}>
        <Typography variant="h6" sx={{ fontWeight: 700 }}>
          Grua
          <Box component="span" sx={{ color: "secondary.main" }}>
            Link
          </Box>
        </Typography>
        <Typography variant="caption" sx={{ opacity: 0.7 }}>
          En ruta, en buenas manos
        </Typography>
      </Box>
      <Divider sx={{ borderColor: "rgba(255,255,255,0.12)" }} />
      <List sx={{ flexGrow: 1 }}>
        {opciones.map((op) => {
          const activa = location.pathname === op.ruta;
          return (
            <ListItemButton
              key={op.ruta}
              selected={activa}
              onClick={() => {
                navigate(op.ruta);
                setAbierto(false);
              }}
              sx={{
                mx: 1,
                borderRadius: 2,
                color: "#fff",
                "&.Mui-selected": { bgcolor: "primary.main" },
                "&.Mui-selected:hover": { bgcolor: "primary.main" },
              }}
            >
              <ListItemIcon sx={{ color: "inherit", minWidth: 40 }}>
                {op.icono}
              </ListItemIcon>
              <ListItemText primary={op.texto} />
            </ListItemButton>
          );
        })}
      </List>
      <Divider sx={{ borderColor: "rgba(255,255,255,0.12)" }} />
      <ListItemButton
        onClick={salir}
        sx={{ color: "#fff", m: 1, borderRadius: 2 }}
      >
        <ListItemIcon sx={{ color: "inherit", minWidth: 40 }}>
          <LogoutIcon />
        </ListItemIcon>
        <ListItemText primary="Cerrar sesión" />
      </ListItemButton>
    </Box>
  );

  const barraSuperior = (
    <AppBar position="sticky" elevation={0} sx={{ bgcolor: "primary.dark" }}>
      <Toolbar sx={{ gap: 1 }}>
        {!esMovil && (
          <IconButton color="inherit" onClick={() => setAbierto(true)}>
            <MenuIcon />
          </IconButton>
        )}
        {esMovil && (
          <Typography variant="h6" sx={{ flexGrow: 1, color: "#fff" }}>
            Grua
            <Box component="span" sx={{ color: "secondary.main" }}>
              Link
            </Box>
          </Typography>
        )}
        <Box sx={{ flexGrow: 1 }} />
        <Typography
          variant="body2"
          sx={{ display: { xs: "none", sm: "block" } }}
        >
          {usuario?.nombre}
        </Typography>
        <Avatar
          sx={{ width: 32, height: 32, bgcolor: "primary.main", fontSize: 14 }}
        >
          {usuario?.nombre?.[0]}
        </Avatar>
        {/* Siempre visible: en pantallas angostas el menú lateral no se muestra */}
        <IconButton color="inherit" aria-label="Cerrar sesión" title="Cerrar sesión" onClick={salir}>
          <LogoutIcon />
        </IconButton>
      </Toolbar>
    </AppBar>
  );

  if (esMovil) {
    const valorNav =
      opciones.find((op) => op.ruta === location.pathname)?.ruta || false;
    return (
      <Box sx={{ minHeight: "100vh", bgcolor: "background.default", pb: 9 }}>
        {barraSuperior}
        {children}
        <Paper
          sx={{ position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 10 }}
          elevation={3}
        >
          <BottomNavigation
            showLabels
            value={valorNav}
            onChange={(_, ruta) => navigate(ruta)}
          >
            {opciones.slice(0, 4).map((op) => (
              <BottomNavigationAction
                key={op.ruta}
                label={op.texto}
                value={op.ruta}
                icon={op.icono}
              />
            ))}
          </BottomNavigation>
        </Paper>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        display: "flex",
        minHeight: "100vh",
        bgcolor: "background.default",
      }}
    >
      <Drawer
        variant="permanent"
        sx={{
          width: ANCHO_MENU,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: ANCHO_MENU,
            bgcolor: "primary.dark",
            border: 0,
          },
        }}
      >
        {contenidoMenu}
      </Drawer>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        {barraSuperior}
        {children}
      </Box>
    </Box>
  );
}
