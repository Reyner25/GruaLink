/**
 * Reporte "Bolsa de km" (clientes que se cobran por kilometraje mensual: Suma).
 *
 * Muestra, para un cliente y un mes: km acumulados, columna de la tabla que
 * se está aplicando, cuántos km faltan para la siguiente (más barata) y los
 * servicios del mes con su valor. Mientras el mes está abierto los valores
 * son PROVISIONALES: cada servicio nuevo puede cambiar la columna de todos.
 * Ver docs/PLAN-SUMA.md.
 */
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  MenuItem,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
} from "@mui/material";
import RouteIcon from "@mui/icons-material/Route";
import ViewColumnIcon from "@mui/icons-material/ViewColumn";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import RefreshIcon from "@mui/icons-material/Refresh";
import { useAuth } from "../../context/AuthContext";
import { useCargar } from "../../hooks/useCargar";
import { bolsaKmMes, clientesConBolsa, recalcularBolsaKm } from "../../api/admin.api";
import { puede } from "../../utils/roles";
import { formatoFecha, formatoMoneda, formatoNumero, hoy, mensajeError } from "../../utils/formato";
import { EncabezadoPagina, Indicador, Panel } from "../../components/admin/Comunes";
import { Cargando, ErrorCarga, EstadoServicio } from "../../components/operador/Comunes";

const rango = (c) => (c ? `${formatoNumero(Math.floor(c.desde))}${c.hasta === null ? " km o más" : ` a ${formatoNumero(c.hasta)} km`}` : "—");

export default function BolsaKm() {
  const { usuario } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [aviso, setAviso] = useState("");
  const clientes = useCargar(clientesConBolsa, []);
  const clienteId = params.get("cliente_id") || (clientes.datos?.[0]?.id ? String(clientes.datos[0].id) : "");
  const mes = params.get("mes") || hoy().slice(0, 7);
  const bolsa = useCargar(() => (clienteId ? bolsaKmMes(clienteId, mes) : Promise.resolve(null)), [clienteId, mes]);
  const mesAbierto = mes >= hoy().slice(0, 7);

  const cambiar = (campo, valor) => {
    const p = new URLSearchParams(params);
    p.set(campo, valor);
    setParams(p, { replace: true });
  };

  async function recalcular() {
    try {
      const r = await recalcularBolsaKm(clienteId, mes);
      setAviso(r.cambiaron ? `Se recalcularon ${r.cambiaron} servicio(s)` : "Los valores ya estaban al día");
      bolsa.recargar();
    } catch (err) {
      setAviso(mensajeError(err));
    }
  }

  const d = bolsa.datos;
  return (
    <>
      <EncabezadoPagina
        titulo="Bolsa de km"
        descripcion="Clientes que se cobran por kilometraje mensual: la suma de km del mes define la columna de la tabla."
        migas={[{ texto: "Reportes" }, { texto: "Bolsa de km" }]}
        acciones={
          clienteId &&
          puede(usuario, "servicios:corregir") && (
            <Button variant="outlined" startIcon={<RefreshIcon />} onClick={recalcular}>
              Recalcular mes
            </Button>
          )
        }
      />
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField select size="small" label="Cliente" value={clienteId} onChange={(e) => cambiar("cliente_id", e.target.value)} sx={{ minWidth: 220 }}>
              {(clientes.datos || []).map((c) => (
                <MenuItem key={c.id} value={String(c.id)}>
                  {c.nombre}
                </MenuItem>
              ))}
            </TextField>
            <TextField size="small" type="month" label="Mes" value={mes} onChange={(e) => e.target.value && cambiar("mes", e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          </Stack>
        </CardContent>
      </Card>

      {clientes.datos && clientes.datos.length === 0 && <Alert severity="info">Ningún cliente se cobra por bolsa de km. Se configura en Clientes → Modalidad de cobro.</Alert>}
      {(bolsa.cargando || clientes.cargando) && !d && <Cargando />}
      {bolsa.error && <ErrorCarga mensaje={bolsa.error} onReintentar={bolsa.recargar} />}
      {d && (
        <Stack spacing={3}>
          {mesAbierto && (
            <Alert severity="warning">
              Mes en curso: los valores son <b>provisionales</b>. Cada servicio nuevo suma km a la bolsa y puede cambiar la columna (y el valor) de todos los servicios
              del mes que no estén aprobados. Conviene aprobar los servicios de este cliente cuando termine el mes.
            </Alert>
          )}
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Indicador titulo="Km del mes (servicio + vacío)" valor={`${formatoNumero(d.km_mes)} km`} icono={<RouteIcon />} />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Indicador titulo="Columna aplicada" valor={rango(d.columna)} icono={<ViewColumnIcon />} color="secondary.main" />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Indicador
                titulo="Siguiente columna (más barata)"
                valor={d.siguiente ? `faltan ${formatoNumero(d.siguiente.faltan_km)} km` : "Ya está en la última"}
                detalle={d.siguiente ? `desde ${formatoNumero(Math.floor(d.siguiente.desde))} km` : null}
                icono={<TrendingDownIcon />}
                color="success.main"
              />
            </Grid>
          </Grid>

          <Panel titulo={`Servicios del mes (${d.servicios.length})`}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ "& th": { fontWeight: 700 } }}>
                    <TableCell>Orden</TableCell>
                    <TableCell>Fecha</TableCell>
                    <TableCell>Servicio</TableCell>
                    <TableCell>Bolsa</TableCell>
                    <TableCell align="right">Km (serv. + vacío)</TableCell>
                    <TableCell align="right">Valor calculado</TableCell>
                    <TableCell align="right">Valor aprobado</TableCell>
                    <TableCell>Estado</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {d.servicios.map((s) => {
                    const enBolsa = s.usa_bolsa_km && !s.fuera_disponibilidad && s.estado !== "anulado";
                    return (
                      <TableRow key={s.id} hover sx={{ cursor: "pointer" }} onClick={() => navigate(`/admin/servicios/${s.id}`)}>
                        <TableCell sx={{ fontWeight: 700 }}>#{s.numero_orden}</TableCell>
                        <TableCell>{formatoFecha(s.fecha_servicio)}</TableCell>
                        <TableCell>{s.tipo_servicio}</TableCell>
                        <TableCell>
                          {enBolsa ? (
                            <Chip size="small" label="Dentro" color="primary" variant="outlined" />
                          ) : (
                            <Chip size="small" label={s.fuera_disponibilidad ? "Fuera de disponibilidad" : s.estado === "anulado" ? "No suma" : "Tarifa general"} />
                          )}
                        </TableCell>
                        <TableCell align="right">{formatoNumero(s.km_bolsa)}</TableCell>
                        <TableCell align="right">{s.valor_calculado === null ? "A convenir" : formatoMoneda(s.valor_calculado)}</TableCell>
                        <TableCell align="right">{formatoMoneda(s.valor_aprobado)}</TableCell>
                        <TableCell>
                          <EstadoServicio estado={s.estado} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {d.servicios.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 4, color: "text.secondary" }}>
                        No hay servicios de este cliente en el mes.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Panel>
        </Stack>
      )}
      <Snackbar open={Boolean(aviso)} autoHideDuration={4000} onClose={() => setAviso("")} message={aviso} anchorOrigin={{ vertical: "top", horizontal: "center" }} />
    </>
  );
}
