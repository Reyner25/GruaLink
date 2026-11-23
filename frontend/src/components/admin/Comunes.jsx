/**
 * Piezas visuales del panel administrativo.
 */
import { Box, Breadcrumbs, Card, CardContent, Link, Stack, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import HomeIcon from "@mui/icons-material/Home";

/** Título de la página con migas de pan ("Inicio / Servicios") y acciones a la derecha. */
export function EncabezadoPagina({ titulo, descripcion, migas = [], acciones }) {
  return (
    <Box sx={{ mb: 3 }}>
      {migas.length > 0 && (
        <Breadcrumbs sx={{ mb: 1, fontSize: 14 }}>
          <Link component={RouterLink} to="/admin" color="inherit" sx={{ display: "flex" }} aria-label="Inicio">
            <HomeIcon fontSize="small" />
          </Link>
          {migas.map((m) =>
            m.ruta ? (
              <Link key={m.texto} component={RouterLink} to={m.ruta} color="inherit" underline="hover">
                {m.texto}
              </Link>
            ) : (
              <Typography key={m.texto} color="text.secondary" sx={{ fontSize: 14 }}>
                {m.texto}
              </Typography>
            ),
          )}
        </Breadcrumbs>
      )}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}>
        <Box>
          <Typography variant="h5" component="h1">
            {titulo}
          </Typography>
          {descripcion && <Typography color="text.secondary">{descripcion}</Typography>}
        </Box>
        {acciones && (
          <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: "wrap" }}>
            {acciones}
          </Stack>
        )}
      </Stack>
    </Box>
  );
}

/** Tarjeta de indicador: ícono de color, título, valor grande y detalle. */
export function Indicador({ titulo, valor, detalle, icono, color = "primary.main" }) {
  return (
    <Card sx={{ height: "100%" }}>
      <CardContent sx={{ display: "flex", gap: 2, alignItems: "center" }}>
        {icono && (
          <Box
            sx={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              bgcolor: color,
              color: "#fff",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            {icono}
          </Box>
        )}
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" color="text.secondary" noWrap>
            {titulo}
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 700, lineHeight: 1.3 }} noWrap>
            {valor}
          </Typography>
          {detalle && (
            <Typography variant="caption" color="text.secondary">
              {detalle}
            </Typography>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

/** Tarjeta con título para agrupar contenido (gráficos, tablas). */
export function Panel({ titulo, accion, children, sx }) {
  return (
    <Card sx={{ height: "100%", ...sx }}>
      <CardContent>
        {(titulo || accion) && (
          <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {titulo}
            </Typography>
            {accion}
          </Stack>
        )}
        {children}
      </CardContent>
    </Card>
  );
}
