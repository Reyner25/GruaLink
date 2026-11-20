import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Box,
  Chip,
  CircularProgress,
  Container,
  InputAdornment,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  Button,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { listarServicios } from "../api/servicios.api";
import LayoutPrincipal from "../layouts/LayoutPrincipal";
import { ETIQUETAS_ESTADO } from "../utils/opciones";

export default function MonitoreoPage() {
  const navigate = useNavigate();
  const [servicios, setServicios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [buscar, setBuscar] = useState("");

  useEffect(() => {
    listarServicios({ limite: 200 })
      .then(setServicios)
      .catch(() => setError("No se pudo cargar el monitoreo"))
      .finally(() => setCargando(false));
  }, []);

  const q = buscar.trim().toLowerCase();
  const visibles = servicios.filter(
    (s) =>
      !q ||
      [s.numero_orden, s.placa_vehiculo, s.cliente_nombre, s.grua_numero].some((v) =>
        String(v ?? "")
          .toLowerCase()
          .includes(q),
      ),
  );

  return (
    <LayoutPrincipal>
      <Container maxWidth="lg" sx={{ py: 3 }}>
        <Typography sx={{ fontWeight: 700 }} variant="h5" gutterBottom>
          Monitoreo de servicios
        </Typography>

        <TextField
          placeholder="Buscar por número, placa, cliente o grúa"
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          fullWidth
          size="small"
          sx={{ mb: 2, bgcolor: "background.paper" }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
        />

        {error && <Alert severity="error">{error}</Alert>}

        {cargando ? (
          <Box sx={{ display: "grid", placeItems: "center", py: 8 }}>
            <CircularProgress />
          </Box>
        ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: "primary.dark" }}>
                  {[
                    "Orden",
                    "Fecha",
                    "Cliente",
                    "Grúa",
                    "Placa",
                    "Km",
                    "Estado",
                    "",
                  ].map((h) => (
                    <TableCell key={h} sx={{ color: "#fff", fontWeight: 600 }}>
                      {h}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {visibles.map((s) => (
                  <TableRow key={s.id} hover>
                    <TableCell>{s.numero_orden}</TableCell>
                    <TableCell>{s.fecha_servicio?.slice(0, 10)}</TableCell>
                    <TableCell>{s.cliente_nombre}</TableCell>
                    <TableCell>{s.grua_numero}</TableCell>
                    <TableCell>{s.placa_vehiculo}</TableCell>
                    <TableCell>{s.km_servicio}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={ETIQUETAS_ESTADO[s.estado] || s.estado}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        size="small"
                        onClick={() => navigate(`/ordenes/${s.id}`)}
                      >
                        Ver
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {visibles.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} align="center">
                      Sin resultados
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Container>
    </LayoutPrincipal>
  );
}
