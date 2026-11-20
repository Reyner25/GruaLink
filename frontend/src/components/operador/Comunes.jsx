/**
 * Piezas visuales pequeñas que usan todas las pantallas del operador.
 */
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Alert, AppBar, Box, Button, Chip, CircularProgress, IconButton, Snackbar, Stack, Toolbar, Typography } from "@mui/material";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { ESTADOS_SERVICIO, ESTADOS_TURNO } from "../../utils/formato";

/** Barra azul oscuro superior con título y botón "atrás" opcional. */
export function BarraSuperior({ titulo, atras, accion }) {
  const navigate = useNavigate();
  return (
    <AppBar position="sticky" elevation={0} sx={{ bgcolor: "primary.dark" }}>
      <Toolbar sx={{ gap: 1, minHeight: 56 }}>
        {atras && (
          <IconButton
            edge="start"
            color="inherit"
            aria-label="Volver"
            onClick={() => (typeof atras === "string" ? navigate(atras) : navigate(-1))}
          >
            <ArrowBackIcon />
          </IconButton>
        )}
        <Typography variant="h6" component="h1" sx={{ flexGrow: 1, fontSize: "1.1rem" }} noWrap>
          {titulo}
        </Typography>
        {accion}
      </Toolbar>
    </AppBar>
  );
}

/** Contenido de la página con márgenes cómodos para el celular. */
export function Contenido({ children, sx }) {
  return <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2, ...sx }}>{children}</Box>;
}

export function EstadoServicio({ estado, size = "small" }) {
  const e = ESTADOS_SERVICIO[estado] || { texto: estado, color: "default" };
  return <Chip size={size} label={e.texto} color={e.color} variant={e.color === "default" ? "outlined" : "filled"} />;
}

export function EstadoTurno({ estado }) {
  const e = ESTADOS_TURNO[estado] || { texto: estado, color: "default" };
  return <Chip size="small" label={e.texto} color={e.color} variant={e.color === "default" ? "outlined" : "filled"} />;
}

export function Cargando({ texto = "Cargando…" }) {
  return (
    <Stack spacing={2} sx={{ alignItems: "center", py: 8 }}>
      <CircularProgress />
      <Typography color="text.secondary">{texto}</Typography>
    </Stack>
  );
}

/** Error con botón para reintentar (útil cuando falla la señal). */
export function ErrorCarga({ mensaje, onReintentar }) {
  return (
    <Alert
      severity="error"
      action={
        onReintentar && (
          <Button color="inherit" size="small" onClick={onReintentar}>
            Reintentar
          </Button>
        )
      }
    >
      {mensaje}
    </Alert>
  );
}

/** Fila "ícono · etiqueta · valor" para resúmenes y detalles. */
export function FilaDato({ icono, etiqueta, valor }) {
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start", py: 1 }}>
      <Box sx={{ color: "primary.main", mt: 0.25, display: "flex" }}>{icono}</Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" component="div">
          {etiqueta}
        </Typography>
        <Typography variant="body1" sx={{ wordBreak: "break-word" }}>
          {valor === null || valor === undefined || valor === "" ? "—" : valor}
        </Typography>
      </Box>
    </Stack>
  );
}

/** Título de sección dentro de un formulario o detalle. */
export function TituloSeccion({ children }) {
  return (
    <Typography variant="subtitle1" sx={{ fontWeight: 700, mt: 1 }}>
      {children}
    </Typography>
  );
}

/**
 * Muestra un aviso de éxito que otra pantalla dejó al navegar:
 *   navigate("/app", { state: { mensaje: "Turno iniciado" } })
 */
export function MensajeRuta() {
  const { state } = useLocation();
  const [abierto, setAbierto] = useState(Boolean(state?.mensaje));
  if (!state?.mensaje) return null;
  return (
    <Snackbar
      open={abierto}
      autoHideDuration={4000}
      onClose={() => setAbierto(false)}
      anchorOrigin={{ vertical: "top", horizontal: "center" }}
    >
      <Alert severity="success" variant="filled" onClose={() => setAbierto(false)} sx={{ width: "100%" }}>
        {state.mensaje}
      </Alert>
    </Snackbar>
  );
}

/** Barra fija inferior con botones (Atrás / Siguiente…) para formularios. */
export function BarraAcciones({ children }) {
  return (
    <Box
      sx={{
        position: "sticky",
        bottom: 0,
        bgcolor: "background.default",
        borderTop: 1,
        borderColor: "divider",
        p: 2,
        display: "flex",
        gap: 1.5,
        mt: "auto",
      }}
    >
      {children}
    </Box>
  );
}
