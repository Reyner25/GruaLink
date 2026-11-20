/**
 * Listado de servicios para el administrador / financiero.
 * Filtros en la URL (se pueden compartir). Clic en una fila → detalle,
 * donde se revisa, corrige y aprueba.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Button,
  Card,
  InputAdornment,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { useCargar } from "../../hooks/useCargar";
import { listarServiciosAdmin } from "../../api/admin.api";
import { formatoFecha, formatoHora, formatoMoneda } from "../../utils/formato";
import { EncabezadoPagina } from "../../components/admin/Comunes";
import Filtros from "../../components/admin/Filtros";
import { useFiltrosUrl } from "../../hooks/useFiltrosUrl";
import { Cargando, ErrorCarga, EstadoServicio } from "../../components/operador/Comunes";

const POR_PAGINA = 50;

export default function Servicios() {
  const navigate = useNavigate();
  const { filtros, cambiar, limpiar } = useFiltrosUrl();
  const [pagina, setPagina] = useState(1);
  const [buscar, setBuscar] = useState("");
  const clave = JSON.stringify(filtros);
  const { datos, cargando, error, recargar } = useCargar(
    () => listarServiciosAdmin({ ...filtros, limite: POR_PAGINA, pagina }),
    [clave, pagina],
  );

  // Al cambiar un filtro se vuelve a la página 1
  const cambiarFiltro = (campo, valor) => {
    setPagina(1);
    cambiar(campo, valor);
  };

  const q = buscar.trim().toLowerCase();
  const filas = (datos || []).filter(
    (s) => !q || `${s.numero_orden} ${s.placa_vehiculo} ${s.cliente_nombre} ${s.tipo_vehiculo}`.toLowerCase().includes(q),
  );

  return (
    <>
      <EncabezadoPagina titulo="Servicios" descripcion="Revisión, corrección y aprobación de los servicios registrados." migas={[{ texto: "Servicios" }]} />
      <Filtros filtros={filtros} cambiar={cambiarFiltro} limpiar={limpiar} />

      <Card>
        <Box sx={{ p: 2 }}>
          <TextField
            size="small"
            placeholder="Buscar en esta página por orden, placa, cliente o vehículo"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            sx={{ maxWidth: 480 }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }}
          />
        </Box>
        {cargando && !datos && <Cargando />}
        {error && (
          <Box sx={{ p: 2 }}>
            <ErrorCarga mensaje={error} onReintentar={recargar} />
          </Box>
        )}
        {datos && (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ "& th": { fontWeight: 700, bgcolor: "background.default" } }}>
                  <TableCell>Orden</TableCell>
                  <TableCell>Fecha</TableCell>
                  <TableCell>Cliente</TableCell>
                  <TableCell>Vehículo</TableCell>
                  <TableCell>Servicio</TableCell>
                  <TableCell>Grúa</TableCell>
                  <TableCell align="right">Valor calculado</TableCell>
                  <TableCell align="right">Valor aprobado</TableCell>
                  <TableCell>Estado</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filas.map((s) => (
                  <TableRow key={s.id} hover onClick={() => navigate(`/admin/servicios/${s.id}`)} sx={{ cursor: "pointer" }}>
                    <TableCell sx={{ fontWeight: 700 }}>#{s.numero_orden}</TableCell>
                    <TableCell>
                      {formatoFecha(s.fecha_servicio)}
                      <Typography variant="caption" color="text.secondary" component="div">
                        {s.inicio_servicio ? formatoHora(s.inicio_servicio) : ""}
                      </Typography>
                    </TableCell>
                    <TableCell>{s.cliente_nombre}</TableCell>
                    <TableCell>
                      {s.placa_vehiculo}
                      <Typography variant="caption" color="text.secondary" component="div">
                        {s.tipo_vehiculo}
                      </Typography>
                    </TableCell>
                    <TableCell>{s.tipo_servicio}</TableCell>
                    <TableCell>{s.grua_numero}</TableCell>
                    <TableCell align="right">{s.valor_calculado === null ? "A convenir" : formatoMoneda(s.valor_calculado)}</TableCell>
                    <TableCell align="right">{formatoMoneda(s.valor_aprobado)}</TableCell>
                    <TableCell>
                      <EstadoServicio estado={s.estado} />
                    </TableCell>
                  </TableRow>
                ))}
                {filas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} align="center" sx={{ py: 4, color: "text.secondary" }}>
                      No hay servicios con estos filtros.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        <Stack direction="row" spacing={1} sx={{ p: 2, justifyContent: "flex-end", alignItems: "center" }}>
          <Typography variant="body2" color="text.secondary">
            Página {pagina}
          </Typography>
          <Button size="small" disabled={pagina === 1 || cargando} onClick={() => setPagina((p) => p - 1)}>
            Anterior
          </Button>
          <Button size="small" disabled={(datos?.length || 0) < POR_PAGINA || cargando} onClick={() => setPagina((p) => p + 1)}>
            Siguiente
          </Button>
        </Stack>
      </Card>
    </>
  );
}
