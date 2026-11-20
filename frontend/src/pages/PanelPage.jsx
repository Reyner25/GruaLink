import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Container,
  Grid,
  Stack,
  Typography,
  CircularProgress,
  Alert,
  LinearProgress,
} from "@mui/material";
import { listarServicios } from "../api/servicios.api";
import LayoutPrincipal from "../layouts/LayoutPrincipal";
import { ETIQUETAS_ESTADO } from "../utils/opciones";

function Kpi({ titulo, valor, detalle, color }) {
  return (
    <Card>
      <CardContent>
        <Typography variant="body2" color="text.secondary">
          {titulo}
        </Typography>
        <Typography variant="h4" sx={{ fontWeight: 700, color }}>
          {valor}
        </Typography>
        {detalle && (
          <Typography variant="caption" color="text.secondary">
            {detalle}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

export default function PanelPage() {
  const [servicios, setServicios] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    listarServicios({ limite: 200 })
      .then(setServicios)
      .catch(() => setError("No se pudieron cargar los indicadores"));
  }, []);

  const indicadores = useMemo(() => {
    if (!servicios) return null;
    const total = servicios.length;
    const porEstado = Object.keys(ETIQUETAS_ESTADO).reduce((acc, e) => {
      acc[e] = servicios.filter((s) => s.estado === e).length;
      return acc;
    }, {});
    const kmTotal = servicios.reduce(
      (suma, s) => suma + Number(s.km_servicio || 0),
      0,
    );
    const valorTotal = servicios.reduce(
      (suma, s) => suma + Number(s.valor_calculado || 0),
      0,
    );
    return {
      total,
      porEstado,
      kmTotal,
      valorTotal,
      promedio: total ? valorTotal / total : 0,
    };
  }, [servicios]);

  if (error)
    return (
      <LayoutPrincipal>
        <Container sx={{ py: 3 }}>
          <Alert severity="error">{error}</Alert>
        </Container>
      </LayoutPrincipal>
    );

  if (!indicadores) {
    return (
      <LayoutPrincipal>
        <Box sx={{ display: "grid", placeItems: "center", py: 10 }}>
          <CircularProgress />
        </Box>
      </LayoutPrincipal>
    );
  }

  const { total, porEstado, kmTotal, valorTotal, promedio } = indicadores;
  const formato = (n) =>
    n.toLocaleString("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    });

  return (
    <LayoutPrincipal>
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Typography sx={{ fontWeight: 700 }} variant="h5" gutterBottom>
          Panel de control
        </Typography>
        <Typography color="text.secondary" gutterBottom>
          Indicadores de servicios registrados
        </Typography>

        <Grid container spacing={2} sx={{ mt: 1, mb: 3 }}>
          <Grid item xs={12} sm={6} md={3}>
            <Kpi
              titulo="Total de servicios"
              valor={total}
              color="primary.main"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Kpi
              titulo="Km del servicio"
              valor={kmTotal.toFixed(1)}
              detalle="Suma de todas las órdenes"
              color="success.main"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Kpi
              titulo="Valor calculado"
              valor={formato(valorTotal)}
              detalle="Solo tarifa básica"
              color="secondary.main"
            />
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <Kpi
              titulo="Promedio por servicio"
              valor={formato(promedio)}
              color="warning.main"
            />
          </Grid>
        </Grid>

        <Card>
          <CardContent>
            <Typography sx={{ fontWeight: 600 }} variant="subtitle1" gutterBottom>
              Servicios por estado
            </Typography>
            <Stack spacing={1.5}>
              {Object.entries(ETIQUETAS_ESTADO).map(([clave, texto]) => {
                const cantidad = porEstado[clave];
                const pct = total ? (cantidad / total) * 100 : 0;
                return (
                  <Box key={clave}>
                    <Stack sx={{ justifyContent: "space-between" }} direction="row">
                      <Typography variant="body2">{texto}</Typography>
                      <Typography sx={{ fontWeight: 600 }} variant="body2">
                        {cantidad}
                      </Typography>
                    </Stack>
                    <LinearProgress
                      variant="determinate"
                      value={pct}
                      sx={{ height: 8, borderRadius: 4 }}
                    />
                  </Box>
                );
              })}
            </Stack>
          </CardContent>
        </Card>
      </Container>
    </LayoutPrincipal>
  );
}
