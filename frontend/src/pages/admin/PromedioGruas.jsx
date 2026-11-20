/**
 * Reporte "Promedio de grúas": por cada día, cuántas grúas estuvieron en
 * operación (con turno), en mantenimiento o inactivas, y el % de
 * disponibilidad. Sale de GET /api/dashboard/promedio-gruas.
 */
import { useSearchParams } from "react-router-dom";
import { Card, CardContent, Grid, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField } from "@mui/material";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import BuildIcon from "@mui/icons-material/Build";
import CancelIcon from "@mui/icons-material/Cancel";
import PercentIcon from "@mui/icons-material/Percent";
import { useCargar } from "../../hooks/useCargar";
import { promedioGruas } from "../../api/admin.api";
import { formatoFecha, formatoNumero, hoy } from "../../utils/formato";
import { EncabezadoPagina, Indicador, Panel } from "../../components/admin/Comunes";
import GraficoBarras from "../../components/admin/GraficoBarras";
import { Cargando, ErrorCarga } from "../../components/operador/Comunes";

function haceDias(n) {
  const d = new Date(`${hoy()}T12:00:00`);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

export default function PromedioGruas() {
  const [params, setParams] = useSearchParams();
  const desde = params.get("desde") || haceDias(6);
  const hasta = params.get("hasta") || hoy();
  const { datos, cargando, error, recargar } = useCargar(() => promedioGruas({ desde, hasta }), [desde, hasta]);

  const cambiar = (campo, valor) => {
    const p = new URLSearchParams(params);
    p.set(campo, valor);
    setParams(p, { replace: true });
  };

  return (
    <>
      <EncabezadoPagina
        titulo="Promedio de grúas"
        descripcion="Grúas en operación, en mantenimiento e inactivas por día, y su disponibilidad."
        migas={[{ texto: "Reportes" }, { texto: "Promedio de grúas" }]}
      />
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction="row" spacing={1.5}>
            <TextField size="small" type="date" label="Desde" value={desde} onChange={(e) => cambiar("desde", e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField size="small" type="date" label="Hasta" value={hasta} onChange={(e) => cambiar("hasta", e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          </Stack>
        </CardContent>
      </Card>

      {cargando && !datos && <Cargando />}
      {error && <ErrorCarga mensaje={error} onReintentar={recargar} />}
      {datos && (
        <Stack spacing={3}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
              <Indicador titulo="Promedio en operación" valor={formatoNumero(datos.promedio.en_operacion)} detalle="grúas con turno por día" icono={<LocalShippingIcon />} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
              <Indicador titulo="Promedio en mantenimiento" valor={formatoNumero(datos.promedio.mantenimiento)} icono={<BuildIcon />} color="warning.main" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
              <Indicador titulo="Promedio inactivas" valor={formatoNumero(datos.promedio.inactivas)} icono={<CancelIcon />} color="error.main" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
              <Indicador titulo="Disponibilidad promedio" valor={`${formatoNumero(datos.promedio.disponibilidad)} %`} icono={<PercentIcon />} color="success.main" />
            </Grid>
          </Grid>

          <Panel titulo="Grúas en operación por día">
            <GraficoBarras
              datos={datos.dias.map((d) => ({
                etiqueta: formatoFecha(d.fecha).slice(0, 5),
                valor: d.en_operacion,
                detalle: `${d.mantenimiento} en mantenimiento · ${formatoNumero(d.disponibilidad)} % disponibilidad`,
              }))}
            />
          </Panel>

          <Panel titulo="Detalle del promedio de grúas">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ "& th": { fontWeight: 700 } }}>
                  <TableCell>Fecha</TableCell>
                  <TableCell align="right">Total de grúas</TableCell>
                  <TableCell align="right">En operación</TableCell>
                  <TableCell align="right">Mantenimiento</TableCell>
                  <TableCell align="right">Inactivas</TableCell>
                  <TableCell align="right">% Disponibilidad</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {datos.dias.map((d) => (
                  <TableRow key={d.fecha} hover>
                    <TableCell>{formatoFecha(d.fecha)}</TableCell>
                    <TableCell align="right">{d.total}</TableCell>
                    <TableCell align="right">{d.en_operacion}</TableCell>
                    <TableCell align="right">{d.mantenimiento}</TableCell>
                    <TableCell align="right">{d.inactivas}</TableCell>
                    <TableCell align="right">{formatoNumero(d.disponibilidad)} %</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        </Stack>
      )}
    </>
  );
}
