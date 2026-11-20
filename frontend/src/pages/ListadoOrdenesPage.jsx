import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  CircularProgress,
  Container,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { listarServicios } from "../api/servicios.api";
import LayoutPrincipal from "../layouts/LayoutPrincipal";
import { ETIQUETAS_ESTADO } from "../utils/opciones";

const COLORES_ESTADO = {
  solicitado: "default",
  asignado: "info",
  en_desplazamiento: "info",
  en_servicio: "warning",
  finalizado: "primary",
  en_revision: "warning",
  aprobado: "success",
  anulado: "error",
};

const FILTROS_INICIALES = { desde: "", hasta: "", estado: "", buscar: "" };

export default function ListadoOrdenesPage() {
  const navigate = useNavigate();
  const [filtros, setFiltros] = useState(FILTROS_INICIALES);
  const [ordenes, setOrdenes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setCargando(true);
    setError("");
    const params = Object.fromEntries(
      Object.entries({
        desde: filtros.desde,
        hasta: filtros.hasta,
        estado: filtros.estado,
      }).filter(([, v]) => v),
    );
    listarServicios(params)
      .then(setOrdenes)
      .catch(() => setError("No se pudieron cargar las órdenes"))
      .finally(() => setCargando(false));
  }, [filtros.desde, filtros.hasta, filtros.estado]);

  const cambiar = (campo) => (e) =>
    setFiltros((prev) => ({ ...prev, [campo]: e.target.value }));

  const q = filtros.buscar.trim().toLowerCase();
  const visibles = ordenes.filter(
    (o) =>
      !q ||
      [o.numero_orden, o.placa_vehiculo, o.cliente_nombre, o.grua_numero].some((v) =>
        String(v ?? "")
          .toLowerCase()
          .includes(q),
      ),
  );

  return (
    <LayoutPrincipal>
      <Container maxWidth="sm" sx={{ py: 2 }}>
        <Stack sx={{ alignItems: "center", justifyContent: "space-between" }}
          direction="row"
         
         
          mb={2}
        >
          <Typography sx={{ fontWeight: 700 }} variant="h6">
            Órdenes de servicio
          </Typography>
          <Button
            variant="contained"
            size="small"
            onClick={() => navigate("/ordenes/nueva")}
          >
            Nueva
          </Button>
        </Stack>

        <Stack spacing={2} mb={2}>
          <TextField
            label="Buscar (orden, placa, cliente, grúa)"
            value={filtros.buscar}
            onChange={cambiar("buscar")}
            fullWidth
            size="small"
          />
          <Stack direction="row" spacing={1}>
            <TextField
              label="Desde"
              type="date"
              value={filtros.desde}
              onChange={cambiar("desde")}
              InputLabelProps={{ shrink: true }}
              size="small"
              fullWidth
            />
            <TextField
              label="Hasta"
              type="date"
              value={filtros.hasta}
              onChange={cambiar("hasta")}
              InputLabelProps={{ shrink: true }}
              size="small"
              fullWidth
            />
          </Stack>
          <TextField
            select
            label="Estado"
            value={filtros.estado}
            onChange={cambiar("estado")}
            size="small"
            fullWidth
          >
            <MenuItem value="">Todos</MenuItem>
            {Object.entries(ETIQUETAS_ESTADO).map(([valor, texto]) => (
              <MenuItem key={valor} value={valor}>
                {texto}
              </MenuItem>
            ))}
          </TextField>
        </Stack>

        {error && <Alert severity="error">{error}</Alert>}

        {cargando ? (
          <Box sx={{ display: "grid", placeItems: "center", py: 6 }}>
            <CircularProgress />
          </Box>
        ) : visibles.length === 0 ? (
          <Typography sx={{ textAlign: "center" }} color="text.secondary" py={4}>
            No hay órdenes con esos filtros
          </Typography>
        ) : (
          <Stack spacing={1.5}>
            {visibles.map((o) => (
              <Card key={o.id}>
                <CardActionArea onClick={() => navigate(`/ordenes/${o.id}`)}>
                  <CardContent>
                    <Stack sx={{ alignItems: "center", justifyContent: "space-between" }}
                      direction="row"
                     
                     
                    >
                      <Typography sx={{ fontWeight: 700 }}>{o.numero_orden}</Typography>
                      <Chip
                        size="small"
                        label={ETIQUETAS_ESTADO[o.estado] || o.estado}
                        color={COLORES_ESTADO[o.estado] || "default"}
                      />
                    </Stack>
                    <Typography variant="body2" color="text.secondary">
                      {o.cliente_nombre} · {o.placa_vehiculo} · {o.grua_numero}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {o.fecha_servicio?.slice(0, 10)} · {o.km_servicio} km
                    </Typography>
                  </CardContent>
                </CardActionArea>
              </Card>
            ))}
          </Stack>
        )}
      </Container>
    </LayoutPrincipal>
  );
}
