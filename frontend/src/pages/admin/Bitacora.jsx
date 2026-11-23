/**
 * Consulta de la bitácora (solo administrador): quién hizo qué, cuándo,
 * con qué motivo y qué valores cambiaron. Es de solo lectura.
 */
import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Box,
  Button,
  Card,
  CardContent,
  Link,
  MenuItem,
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
import { useCargar } from "../../hooks/useCargar";
import { consultarBitacora } from "../../api/admin.api";
import { formatoFechaHora, hoy } from "../../utils/formato";
import { EncabezadoPagina } from "../../components/admin/Comunes";
import { Cargando, ErrorCarga } from "../../components/operador/Comunes";

const ENTIDADES = {
  servicios: "Servicios",
  turnos_operador: "Turnos",
  clientes: "Clientes",
  gruas: "Grúas",
  usuarios: "Usuarios",
  tarifas: "Tarifas",
  precios_concepto: "Precios de conceptos",
  conceptos_tarifa: "Conceptos",
  tipos_vehiculo: "Tipos de vehículo",
  tipos_servicio: "Tipos de servicio",
};
const OPERACIONES = ["crear", "actualizar", "finalizar", "aprobar", "anular", "autorizar_correccion", "reabrir", "iniciar_turno", "finalizar_turno", "cerrar_turno"];
const POR_PAGINA = 50;

// Resumen corto de qué cambió: "km_servicio: 0 → 17.5"
function resumenCambios(b) {
  const nuevos = b.valores_nuevos || {};
  if (b.operacion === "crear" || b.operacion === "finalizar") return "";
  return Object.keys(nuevos)
    .filter((k) => !["conceptos"].includes(k) && typeof nuevos[k] !== "object")
    .slice(0, 4)
    .map((k) => `${k}: ${b.valores_anteriores?.[k] ?? "—"} → ${nuevos[k] ?? "—"}`)
    .join(" · ");
}

export default function Bitacora() {
  const [filtros, setFiltros] = useState({ entidad: "", operacion: "", desde: "", hasta: hoy() });
  const [pagina, setPagina] = useState(1);
  const { datos, cargando, error, recargar } = useCargar(
    () => consultarBitacora({ ...filtros, limite: POR_PAGINA, pagina }),
    [JSON.stringify(filtros), pagina],
  );
  const cambiar = (campo, valor) => {
    setPagina(1);
    setFiltros((f) => ({ ...f, [campo]: valor }));
  };

  return (
    <>
      <EncabezadoPagina titulo="Bitácora" descripcion="Registro de todas las operaciones importantes. Solo lectura." migas={[{ texto: "Bitácora" }]} />
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" useFlexGap sx={{ flexWrap: "wrap", gap: 1.5 }}>
            <TextField select size="small" label="Qué" value={filtros.entidad} onChange={(e) => cambiar("entidad", e.target.value)} sx={{ minWidth: 180 }}>
              <MenuItem value="">Todo</MenuItem>
              {Object.entries(ENTIDADES).map(([v, t]) => (
                <MenuItem key={v} value={v}>
                  {t}
                </MenuItem>
              ))}
            </TextField>
            <TextField select size="small" label="Operación" value={filtros.operacion} onChange={(e) => cambiar("operacion", e.target.value)} sx={{ minWidth: 200 }}>
              <MenuItem value="">Todas</MenuItem>
              {OPERACIONES.map((o) => (
                <MenuItem key={o} value={o}>
                  {o.replace(/_/g, " ")}
                </MenuItem>
              ))}
            </TextField>
            <TextField size="small" type="date" label="Desde" value={filtros.desde} onChange={(e) => cambiar("desde", e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField size="small" type="date" label="Hasta" value={filtros.hasta} onChange={(e) => cambiar("hasta", e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          </Stack>
        </CardContent>
      </Card>

      <Card>
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
                  <TableCell>Fecha</TableCell>
                  <TableCell>Usuario</TableCell>
                  <TableCell>Qué</TableCell>
                  <TableCell>Operación</TableCell>
                  <TableCell>Cambios</TableCell>
                  <TableCell>Motivo</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {datos.map((b) => (
                  <TableRow key={b.id} hover>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{formatoFechaHora(b.creado_en)}</TableCell>
                    <TableCell>{b.usuario_nombre || "Sistema"}</TableCell>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>
                      {b.entidad === "servicios" ? (
                        <Link component={RouterLink} to={`/admin/servicios/${b.registro_id}`}>
                          Servicio {b.registro_id}
                        </Link>
                      ) : (
                        `${ENTIDADES[b.entidad] || b.entidad} ${b.registro_id}`
                      )}
                    </TableCell>
                    <TableCell>{b.operacion.replace(/_/g, " ")}</TableCell>
                    <TableCell>
                      <Typography variant="caption">{resumenCambios(b)}</Typography>
                    </TableCell>
                    <TableCell>{b.motivo}</TableCell>
                  </TableRow>
                ))}
                {datos.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4, color: "text.secondary" }}>
                      Sin registros con estos filtros.
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
          <Button size="small" disabled={pagina === 1} onClick={() => setPagina((p) => p - 1)}>
            Anterior
          </Button>
          <Button size="small" disabled={(datos?.length || 0) < POR_PAGINA} onClick={() => setPagina((p) => p + 1)}>
            Siguiente
          </Button>
        </Stack>
      </Card>
    </>
  );
}
