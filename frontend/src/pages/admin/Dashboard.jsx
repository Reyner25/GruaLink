/**
 * Inicio del panel administrativo: indicadores REALES calculados en
 * PostgreSQL (GET /api/dashboard/resumen), nunca en el navegador.
 *
 * - Flota: estado ACTUAL de las grúas (no depende de los filtros).
 * - Servicios y valores: según los filtros (fechas, cliente, grúa…).
 * - Por defecto muestra el mes en curso.
 */
import { useNavigate } from "react-router-dom";
import { Box, Button, Grid, LinearProgress, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import BuildIcon from "@mui/icons-material/Build";
import CancelIcon from "@mui/icons-material/Cancel";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import AssignmentIcon from "@mui/icons-material/Assignment";
import RateReviewIcon from "@mui/icons-material/RateReview";
import PaidIcon from "@mui/icons-material/Paid";
import VerifiedIcon from "@mui/icons-material/Verified";
import TimerIcon from "@mui/icons-material/Timer";
import { useCargar } from "../../hooks/useCargar";
import { dashboardAgrupado, resumenDashboard } from "../../api/admin.api";
import { formatoMoneda, formatoNumero, hoy } from "../../utils/formato";
import { EncabezadoPagina, Indicador, Panel } from "../../components/admin/Comunes";
import Filtros from "../../components/admin/Filtros";
import { useFiltrosUrl } from "../../hooks/useFiltrosUrl";
import GraficoBarras from "../../components/admin/GraficoBarras";
import BotonExportar from "../../components/admin/BotonExportar";
import { Cargando, ErrorCarga } from "../../components/operador/Comunes";

const inicioDeMes = () => `${hoy().slice(0, 8)}01`;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const etiquetaDia = (fecha) => `${Number(fecha.slice(8, 10))} ${MESES[Number(fecha.slice(5, 7)) - 1]}`;

/** Una fila "nombre · barra proporcional · valor" (top clientes / operadores). */
function Ranking({ filas, total, campo = "servicios" }) {
  if (!filas.length) return <Typography color="text.secondary">Sin datos en el periodo</Typography>;
  return (
    <Stack spacing={1.5}>
      {filas.slice(0, 6).map((f) => (
        <Box key={f.id}>
          <Stack direction="row" sx={{ justifyContent: "space-between" }}>
            <Typography variant="body2" noWrap sx={{ pr: 1 }}>
              {f.nombre}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {f[campo]}
            </Typography>
          </Stack>
          <LinearProgress variant="determinate" value={total ? (f[campo] / total) * 100 : 0} sx={{ height: 6, borderRadius: 3 }} />
        </Box>
      ))}
    </Stack>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { filtros, cambiar, limpiar } = useFiltrosUrl({ desde: inicioDeMes(), hasta: hoy() });
  const clave = JSON.stringify(filtros);
  const resumen = useCargar(() => resumenDashboard(filtros), [clave]);
  const porCliente = useCargar(() => dashboardAgrupado("cliente", filtros), [clave]);

  return (
    <>
      <EncabezadoPagina
        titulo="Panel de control"
        descripcion="Resumen de la operación de grúas en el periodo seleccionado."
        acciones={
          <>
            <BotonExportar reporte="servicios" filtros={filtros} variant="outlined" />
            <Button variant="contained" onClick={() => navigate(`/admin/servicios?estado=finalizado`)}>
              Servicios por revisar
            </Button>
          </>
        }
      />
      <Filtros filtros={filtros} cambiar={cambiar} limpiar={limpiar} />

      {resumen.cargando && !resumen.datos && <Cargando />}
      {resumen.error && <ErrorCarga mensaje={resumen.error} onReintentar={resumen.recargar} />}

      {resumen.datos && <ContenidoDashboard datos={resumen.datos} porCliente={porCliente.datos || []} navigate={navigate} />}
    </>
  );
}

function ContenidoDashboard({ datos, porCliente, navigate }) {
  const { flota, servicios: s, por_dia: porDia } = datos;
  const pct = (n) => (flota.total ? `${formatoNumero((n / flota.total) * 100)} % del total` : "");

  return (
    <Stack spacing={3}>
      {/* Flota (estado actual) */}
      <Box>
        <Typography variant="overline" color="text.secondary">
          Flota hoy
        </Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <Indicador titulo="Total de grúas" valor={flota.total} detalle={`${flota.en_turno} en turno ahora`} icono={<LocalShippingIcon />} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <Indicador titulo="Grúas activas" valor={flota.activas} detalle={pct(flota.activas)} icono={<CheckCircleIcon />} color="success.main" />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <Indicador titulo="En mantenimiento" valor={flota.mantenimiento} detalle={pct(flota.mantenimiento)} icono={<BuildIcon />} color="warning.main" />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <Indicador titulo="Inactivas" valor={flota.inactivas} detalle={pct(flota.inactivas)} icono={<CancelIcon />} color="error.main" />
          </Grid>
        </Grid>
      </Box>

      {/* Servicios del periodo */}
      <Box>
        <Typography variant="overline" color="text.secondary">
          Servicios del periodo
        </Typography>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <Indicador titulo="Servicios registrados" valor={s.total} detalle={`${s.anulados} anulados`} icono={<AssignmentIcon />} />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <Indicador
              titulo="En ejecución / pendientes"
              valor={s.en_ejecucion + s.pendientes}
              detalle={`${s.en_ejecucion} en ejecución · ${s.pendientes} pendientes`}
              icono={<AccessTimeIcon />}
              color="info.main"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <Indicador
              titulo="Por revisar"
              valor={s.finalizados + s.en_revision}
              detalle={`${s.finalizados} finalizados · ${s.en_revision} en revisión`}
              icono={<RateReviewIcon />}
              color="warning.main"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
            <Indicador titulo="Aprobados" valor={s.aprobados} icono={<VerifiedIcon />} color="success.main" />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
            <Indicador titulo="Valor calculado" valor={formatoMoneda(s.valor_calculado)} detalle="Sin anulados" icono={<PaidIcon />} color="primary.dark" />
          </Grid>
          <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
            <Indicador titulo="Valor aprobado" valor={formatoMoneda(s.valor_aprobado)} detalle="Solo aprobados" icono={<PaidIcon />} color="success.main" />
          </Grid>
          <Grid size={{ xs: 12, sm: 12, lg: 4 }}>
            <Indicador
              titulo="Tiempo de reacción promedio"
              valor={s.reaccion_promedio_min === null ? "—" : `${s.reaccion_promedio_min} min`}
              detalle="Desde la solicitud hasta el inicio"
              icono={<TimerIcon />}
              color="primary.main"
            />
          </Grid>
        </Grid>
      </Box>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Panel titulo="Servicios por día">
            <GraficoBarras
              datos={porDia.map((d) => ({ etiqueta: etiquetaDia(d.fecha), valor: d.servicios, detalle: formatoMoneda(d.valor_calculado) }))}
            />
          </Panel>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Panel titulo="Servicios por cliente">
            <Ranking filas={porCliente} total={Math.max(...porCliente.map((f) => f.servicios), 0)} />
          </Panel>
        </Grid>
      </Grid>

      {/* Vista en tabla de la serie diaria (accesible y exportable a ojo) */}
      {porDia.length > 0 && (
        <Panel titulo="Detalle por día">
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Fecha</TableCell>
                  <TableCell align="right">Servicios</TableCell>
                  <TableCell align="right">Valor calculado</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {porDia.map((d) => (
                  <TableRow key={d.fecha} hover>
                    <TableCell>{etiquetaDia(d.fecha)}</TableCell>
                    <TableCell align="right">{d.servicios}</TableCell>
                    <TableCell align="right">{formatoMoneda(d.valor_calculado)}</TableCell>
                    <TableCell align="right">
                      <Button size="small" onClick={() => navigate(`/admin/servicios?desde=${d.fecha}&hasta=${d.fecha}`)}>
                        Ver
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </Panel>
      )}
    </Stack>
  );
}
