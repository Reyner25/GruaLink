import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import { obtenerServicio } from "../api/servicios.api";
import LayoutPrincipal from "../layouts/LayoutPrincipal";
import { ETIQUETAS_ESTADO } from "../utils/opciones";

const CAMPOS = [
  ["Cliente", (s) => s.cliente_nombre],
  ["Placa del vehículo", (s) => s.placa_vehiculo],
  ["Número del vehículo", (s) => s.numero_vehiculo],
  ["Fecha del servicio", (s) => s.fecha_servicio?.slice(0, 10)],
  ["Origen", (s) => s.origen],
  ["Destino", (s) => s.destino],
  ["Km en vacío", (s) => s.km_vacio],
  ["Km del servicio", (s) => s.km_servicio],
  ["Km facturables", (s) => s.km_facturables],
  ["Observaciones", (s) => s.observaciones],
];

export default function DetalleOrdenPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [servicio, setServicio] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    obtenerServicio(id)
      .then(setServicio)
      .catch((err) =>
        setError(err.response?.data?.error || "No se pudo cargar la orden"),
      );
  }, [id]);

  return (
    <LayoutPrincipal>
      <Container maxWidth="sm" sx={{ py: 2 }}>
        <Button onClick={() => navigate("/ordenes")} sx={{ mb: 1 }}>
          ← Volver
        </Button>

        {error && <Alert severity="error">{error}</Alert>}
        {!servicio && !error && (
          <Box sx={{ display: "grid", placeItems: "center", py: 6 }}>
            <CircularProgress />
          </Box>
        )}

        {servicio && (
          <Card>
            <CardContent>
              <Stack sx={{ alignItems: "center", justifyContent: "space-between" }}
                direction="row"
               
               
                mb={2}
              >
                <Typography sx={{ fontWeight: 700 }} variant="h6">
                  {servicio.numero_orden}
                </Typography>
                <Chip
                  label={ETIQUETAS_ESTADO[servicio.estado] || servicio.estado}
                />
              </Stack>
              <Stack spacing={1.5} divider={<Divider flexItem />}>
                {CAMPOS.map(([etiqueta, valor]) => (
                  <Box key={etiqueta}>
                    <Typography variant="caption" color="text.secondary">
                      {etiqueta}
                    </Typography>
                    <Typography>{valor(servicio) ?? "—"}</Typography>
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        )}
      </Container>
    </LayoutPrincipal>
  );
}
