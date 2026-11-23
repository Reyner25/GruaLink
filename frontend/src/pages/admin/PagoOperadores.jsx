/**
 * Reporte "Pago a operadores": cuánto se le paga a cada operador en un
 * periodo (por fecha del servicio), según las reglas de Tarifas → "Pago a
 * operadores".
 *  - Aprobado: pago definitivo (quedó guardado al aprobar el servicio).
 *  - Pendiente: servicios finalizados o en revisión, aún sin aprobar
 *    (provisional: puede cambiar si se corrige o se aprueba otro valor).
 * Exporta a Excel (resumen por operador + detalle por servicio).
 */
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Card,
  CardContent,
  Chip,
  Grid,
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
import PaymentsIcon from "@mui/icons-material/Payments";
import PendingActionsIcon from "@mui/icons-material/PendingActions";
import EngineeringIcon from "@mui/icons-material/Engineering";
import { useCargar } from "../../hooks/useCargar";
import { liquidacionOperadores, listarUsuarios } from "../../api/admin.api";
import { formatoFecha, formatoMoneda, hoy } from "../../utils/formato";
import { EncabezadoPagina, Indicador, Panel } from "../../components/admin/Comunes";
import BotonExportar from "../../components/admin/BotonExportar";
import { Cargando, ErrorCarga, EstadoServicio } from "../../components/operador/Comunes";

export default function PagoOperadores() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const desde = params.get("desde") || `${hoy().slice(0, 7)}-01`;
  const hasta = params.get("hasta") || hoy();
  const operadorId = params.get("operador_id") || "";
  const filtros = { desde, hasta, operador_id: operadorId };
  const { datos, cargando, error, recargar } = useCargar(() => liquidacionOperadores(filtros), [desde, hasta, operadorId]);

  // Lista de operadores para el filtro (el financiero no lista usuarios: sin filtro)
  const [operadores, setOperadores] = useState([]);
  useEffect(() => {
    let vigente = true;
    listarUsuarios({ rol: "operador" })
      .then((u) => vigente && setOperadores(u.filter((x) => x.rol === "operador")))
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, []);

  const cambiar = (campo, valor) => {
    const p = new URLSearchParams(params);
    if (valor) p.set(campo, valor);
    else p.delete(campo);
    setParams(p, { replace: true });
  };

  const totales = (datos?.operadores || []).reduce(
    (t, o) => ({ aprobado: t.aprobado + o.pago_aprobado, pendiente: t.pendiente + o.pago_pendiente }),
    { aprobado: 0, pendiente: 0 },
  );

  return (
    <>
      <EncabezadoPagina
        titulo="Pago a operadores"
        descripcion="Cuánto se le paga a cada operador, según las reglas de Tarifas → Pago a operadores."
        migas={[{ texto: "Reportes" }, { texto: "Pago a operadores" }]}
        acciones={<BotonExportar reporte="pago-operadores" filtros={filtros} />}
      />
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField size="small" type="date" label="Desde" value={desde} onChange={(e) => cambiar("desde", e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField size="small" type="date" label="Hasta" value={hasta} onChange={(e) => cambiar("hasta", e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            {operadores.length > 0 && (
              <TextField select size="small" label="Operador" value={operadorId} onChange={(e) => cambiar("operador_id", e.target.value)} sx={{ minWidth: 220 }}>
                <MenuItem value="">Todos</MenuItem>
                {operadores.map((o) => (
                  <MenuItem key={o.id} value={String(o.id)}>
                    {o.nombre}
                  </MenuItem>
                ))}
              </TextField>
            )}
          </Stack>
        </CardContent>
      </Card>

      {cargando && !datos && <Cargando />}
      {error && <ErrorCarga mensaje={error} onReintentar={recargar} />}
      {datos && (
        <Stack spacing={3}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Indicador titulo="Pago aprobado (definitivo)" valor={formatoMoneda(totales.aprobado)} icono={<PaymentsIcon />} color="success.main" />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Indicador titulo="Pendiente (sin aprobar)" valor={formatoMoneda(totales.pendiente)} detalle="Provisional" icono={<PendingActionsIcon />} color="warning.main" />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Indicador titulo="Operadores" valor={datos.operadores.length} icono={<EngineeringIcon />} />
            </Grid>
          </Grid>

          <Panel titulo="Por operador">
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ "& th": { fontWeight: 700 } }}>
                    <TableCell>Operador</TableCell>
                    <TableCell align="right">Servicios</TableCell>
                    <TableCell align="right">Aprobados</TableCell>
                    <TableCell align="right">Pago aprobado</TableCell>
                    <TableCell align="right">Pendiente</TableCell>
                    <TableCell align="right">Total</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {datos.operadores.map((o) => (
                    <TableRow key={o.operador_id} hover sx={{ cursor: "pointer" }} onClick={() => cambiar("operador_id", String(o.operador_id))}>
                      <TableCell sx={{ fontWeight: 600 }}>{o.operador}</TableCell>
                      <TableCell align="right">{o.servicios}</TableCell>
                      <TableCell align="right">{o.aprobados}</TableCell>
                      <TableCell align="right">{formatoMoneda(o.pago_aprobado)}</TableCell>
                      <TableCell align="right">{formatoMoneda(o.pago_pendiente)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>
                        {formatoMoneda(o.pago_total)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {datos.operadores.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 4, color: "text.secondary" }}>
                        No hay servicios finalizados en el periodo.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Panel>

          <Panel titulo={`Detalle por servicio (${datos.servicios.length})`}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ "& th": { fontWeight: 700 } }}>
                    <TableCell>Orden</TableCell>
                    <TableCell>Fecha</TableCell>
                    <TableCell>Operador</TableCell>
                    <TableCell>Cliente</TableCell>
                    <TableCell align="right">Valor del servicio</TableCell>
                    <TableCell align="right">Pago</TableCell>
                    <TableCell>Estado</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {datos.servicios.map((s) => (
                    <TableRow key={s.servicio_id} hover sx={{ cursor: "pointer" }} onClick={() => navigate(`/admin/servicios/${s.servicio_id}`)}>
                      <TableCell sx={{ fontWeight: 700 }}>#{s.numero_orden}</TableCell>
                      <TableCell>{formatoFecha(s.fecha_servicio)}</TableCell>
                      <TableCell>{s.operador}</TableCell>
                      <TableCell>{s.cliente}</TableCell>
                      <TableCell align="right">{s.valor_servicio === null ? "A convenir" : formatoMoneda(s.valor_servicio)}</TableCell>
                      <TableCell align="right">
                        {formatoMoneda(s.pago)}
                        {s.provisional && (
                          <Typography variant="caption" color="warning.main" component="div">
                            provisional
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <EstadoServicio estado={s.estado} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            {operadorId && (
              <Chip sx={{ mt: 2 }} label="Ver todos los operadores" onClick={() => cambiar("operador_id", "")} onDelete={() => cambiar("operador_id", "")} />
            )}
          </Panel>
        </Stack>
      )}
    </>
  );
}
