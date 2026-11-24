/**
 * Panel "Valores" del detalle de un servicio: tarifa básica (con la
 * explicación de cómo se obtuvo), trabajos adicionales, valor calculado y
 * valor aprobado.
 */
import { Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { cantidadConUnidad, formatoFechaHora, formatoMoneda, formatoNumero } from "../../../utils/formato";
import { Panel } from "../Comunes";

const rangoColumna = (s) =>
  `${formatoNumero(Math.floor(s.bolsa_columna_desde))}${s.bolsa_columna_hasta === null ? " km o más" : `–${formatoNumero(s.bolsa_columna_hasta)} km`}`;

// Clientes por bolsa de km: de dónde salió la tarifa básica
function textoBolsa(s) {
  const porKm = s.bolsa_forma === "por_km" ? ` · menos de 10 km: ${formatoMoneda(s.bolsa_valor)} por km` : "";
  if (s.tarifa_bolsa_id && s.bolsa_km_mes === null) {
    return `Bolsa de kilómetros: mes abierto → columna PROVISIONAL ${rangoColumna(s)} (al terminar el mes se recalcula con la columna real)${porKm}`;
  }
  if (s.tarifa_bolsa_id) return `Bolsa de kilómetros: ${formatoNumero(s.bolsa_km_mes)} km en el mes → columna ${rangoColumna(s)}${porKm}`;
  return s.fuera_disponibilidad ? "Fuera de la disponibilidad: tarifa de Clientes generales" : "No va en la bolsa: tarifa de Clientes generales";
}

function Nota({ children, color = "text.secondary" }) {
  return (
    <Typography variant="caption" color={color} component="div">
      {children}
    </Typography>
  );
}

export default function ValoresServicio({ servicio: s, conceptos }) {
  const aConvenir = s.valor_tarifa_basica === null;
  return (
    <Panel titulo="Valores">
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Concepto</TableCell>
            <TableCell align="right">Cantidad</TableCell>
            <TableCell align="right">Valor unitario</TableCell>
            <TableCell align="right">Total</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          <TableRow>
            <TableCell>
              Tarifa básica{" "}
              <Typography variant="caption" color="text.secondary">
                ({formatoNumero(s.km_facturables ?? 0)} km facturables)
              </Typography>
              {s.tarifa_basica_manual !== null && s.tarifa_basica_manual !== undefined && <Nota color="warning.main">Tarifa manual (puesta por el administrador)</Nota>}
              {s.recargo_nocturno === "no" && <Nota>Recargo nocturno: no se aplica (decisión del administrador)</Nota>}
              {s.cliente_modalidad_cobro === "bolsa_km_mensual" && <Nota>{textoBolsa(s)}</Nota>}
            </TableCell>
            <TableCell align="right">1</TableCell>
            <TableCell align="right">{aConvenir ? "A convenir" : formatoMoneda(s.valor_tarifa_basica)}</TableCell>
            <TableCell align="right">{aConvenir ? "—" : formatoMoneda(s.valor_tarifa_basica)}</TableCell>
          </TableRow>
          {conceptos.map((c) => (
            <TableRow key={c.concepto_id}>
              <TableCell>
                {c.nombre}
                {c.es_recargo_nocturno && (
                  <Nota>{s.recargo_nocturno === "si" ? "Aplicado por el administrador" : "Automático: el servicio terminó en horario nocturno"}</Nota>
                )}
              </TableCell>
              <TableCell align="right">{cantidadConUnidad(c.cantidad, c.unidad_cobro)}</TableCell>
              <TableCell align="right">{formatoMoneda(c.valor_unitario)}</TableCell>
              <TableCell align="right">{formatoMoneda(c.total)}</TableCell>
            </TableRow>
          ))}
          <TableRow sx={{ "& td": { fontWeight: 700 } }}>
            <TableCell colSpan={3}>Valor calculado</TableCell>
            <TableCell align="right">{s.valor_calculado === null ? "A convenir" : formatoMoneda(s.valor_calculado)}</TableCell>
          </TableRow>
          <TableRow sx={{ "& td": { fontWeight: 700, color: "success.main", borderBottom: 0 } }}>
            <TableCell colSpan={3}>
              Valor aprobado
              {s.aprobado_en && <Nota>{formatoFechaHora(s.aprobado_en)}</Nota>}
            </TableCell>
            <TableCell align="right">{formatoMoneda(s.valor_aprobado)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Panel>
  );
}
