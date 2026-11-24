/**
 * Reportes → "Cobro": el cobro mensual que se envía a cada empresa.
 *
 *  - Elija el mes. Por defecto entran solo los servicios APROBADOS; se pueden
 *    incluir los finalizados / en revisión sin aprobar (salen marcados en
 *    amarillo en el Excel).
 *  - "Cobro en Excel": el archivo con la hoja RESUMEN y una hoja por empresa,
 *    igual al que se enviaba ("AAAAMM Servicios de gruas cobro").
 *  - Por empresa: su Excel y sus órdenes de servicio en PDF.
 */
import { useSearchParams } from "react-router-dom";
import {
  Alert,
  Card,
  CardContent,
  Chip,
  FormControlLabel,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
} from "@mui/material";
import { useCargar } from "../../hooks/useCargar";
import { resumenCobro } from "../../api/admin.api";
import { formatoMoneda, hoy } from "../../utils/formato";
import { EncabezadoPagina, Panel } from "../../components/admin/Comunes";
import BotonExportar from "../../components/admin/BotonExportar";
import { Cargando, ErrorCarga } from "../../components/operador/Comunes";

// Mes anterior al actual (el que normalmente se cobra)
function mesAnterior() {
  const [a, m] = hoy().slice(0, 7).split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
}

export default function Cobro() {
  const [params, setParams] = useSearchParams();
  const mes = params.get("mes") || mesAnterior();
  const incluir = params.get("incluir_sin_aprobar") === "true";
  const filtros = { mes, incluir_sin_aprobar: incluir ? "true" : "false" };
  const { datos, cargando, error, recargar } = useCargar(() => resumenCobro(filtros), [mes, incluir]);

  const cambiar = (campo, valor) => {
    const p = new URLSearchParams(params);
    if (valor) p.set(campo, valor);
    else p.delete(campo);
    setParams(p, { replace: true });
  };

  const empresas = datos?.empresas || [];
  const suma = (campo) => empresas.reduce((t, e) => t + e[campo], 0);
  const sinAprobar = suma("sin_aprobar");

  return (
    <>
      <EncabezadoPagina
        titulo="Cobro"
        descripcion="Cobro mensual a cada empresa: resumen, detalle por empresa y órdenes de servicio."
        migas={[{ texto: "Reportes" }, { texto: "Cobro" }]}
        acciones={<BotonExportar reporte="cobro" filtros={filtros} texto="Cobro en Excel" />}
      />
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: { sm: "center" } }}>
            <TextField size="small" type="month" label="Mes a cobrar" value={mes} onChange={(e) => e.target.value && cambiar("mes", e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            <FormControlLabel
              control={<Switch checked={incluir} onChange={(e) => cambiar("incluir_sin_aprobar", e.target.checked ? "true" : "")} />}
              label="Incluir servicios sin aprobar"
            />
          </Stack>
        </CardContent>
      </Card>

      {cargando && !datos && <Cargando />}
      {error && <ErrorCarga mensaje={error} onReintentar={recargar} />}
      {datos && (
        <Stack spacing={2}>
          {incluir && sinAprobar > 0 && (
            <Alert severity="warning">
              Incluye {sinAprobar} servicio(s) sin aprobar: en el Excel salen en amarillo y su valor es el calculado (puede cambiar al aprobarlos).
            </Alert>
          )}
          <Panel titulo={`Resumen de facturación por empresa (${empresas.length})`}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ "& th": { fontWeight: 700 } }}>
                    <TableCell>Empresa</TableCell>
                    <TableCell align="right">Servicios</TableCell>
                    <TableCell align="right">Subtotal</TableCell>
                    <TableCell align="right">IVA {Math.round((datos.iva || 0.19) * 100)}%</TableCell>
                    <TableCell align="right">Total</TableCell>
                    <TableCell align="right">Descargar</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {empresas.map((e) => (
                    <TableRow key={e.cliente_id}>
                      <TableCell sx={{ fontWeight: 600 }}>
                        {e.cliente}
                        {e.sin_aprobar > 0 && <Chip size="small" color="warning" label={`${e.sin_aprobar} sin aprobar`} sx={{ ml: 1 }} />}
                      </TableCell>
                      <TableCell align="right">{e.cantidad}</TableCell>
                      <TableCell align="right">{formatoMoneda(e.subtotal)}</TableCell>
                      <TableCell align="right">{formatoMoneda(e.iva)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700 }}>
                        {formatoMoneda(e.total)}
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                        <BotonExportar reporte="cobro" filtros={{ ...filtros, cliente_id: e.cliente_id }} texto={`Cobro de ${e.cliente} en Excel`} compacto />
                        <BotonExportar reporte="cobro-ordenes" filtros={{ ...filtros, cliente_id: e.cliente_id }} tipo="pdf" texto={`Órdenes de ${e.cliente} en PDF`} compacto />
                      </TableCell>
                    </TableRow>
                  ))}
                  {empresas.length > 0 && (
                    <TableRow sx={{ "& td": { fontWeight: 700 } }}>
                      <TableCell>TOTAL GENERAL</TableCell>
                      <TableCell align="right">{suma("cantidad")}</TableCell>
                      <TableCell align="right">{formatoMoneda(suma("subtotal"))}</TableCell>
                      <TableCell align="right">{formatoMoneda(suma("iva"))}</TableCell>
                      <TableCell align="right">{formatoMoneda(suma("total"))}</TableCell>
                      <TableCell />
                    </TableRow>
                  )}
                  {empresas.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} align="center" sx={{ py: 4, color: "text.secondary" }}>
                        No hay servicios {incluir ? "" : "aprobados "}para cobrar en este mes.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Panel>
        </Stack>
      )}
    </>
  );
}
