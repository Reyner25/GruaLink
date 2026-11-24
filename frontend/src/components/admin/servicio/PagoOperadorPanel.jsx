/**
 * Pago al operador: cómo se calculó cada parte (reglas de Tarifas → "Pago a
 * operadores"). Provisional hasta que el servicio se aprueba.
 */
import { Chip, Table, TableBody, TableCell, TableHead, TableRow } from "@mui/material";
import { formatoMoneda } from "../../../utils/formato";
import { Panel } from "../Comunes";

export default function PagoOperadorPanel({ pago, operador }) {
  const estado = pago.anulado ? (
    <Chip size="small" label="Anulado: no se paga" />
  ) : (
    <Chip size="small" label={pago.provisional ? "Provisional (sin aprobar)" : "Definitivo (aprobado)"} color={pago.provisional ? "warning" : "success"} />
  );
  return (
    <Panel titulo="Pago al operador" accion={estado}>
      <Table size="small">
        <TableHead>
          <TableRow sx={{ "& th": { fontWeight: 700 } }}>
            <TableCell>Parte</TableCell>
            <TableCell>Regla</TableCell>
            <TableCell align="right">Base</TableCell>
            <TableCell align="right">Pago</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {pago.detalle.map((d, i) => (
            <TableRow key={i}>
              <TableCell>{d.parte}</TableCell>
              <TableCell>{d.regla}</TableCell>
              <TableCell align="right">{d.base === null ? "—" : formatoMoneda(d.base)}</TableCell>
              <TableCell align="right">{formatoMoneda(d.pago)}</TableCell>
            </TableRow>
          ))}
          <TableRow sx={{ "& td": { fontWeight: 700 } }}>
            <TableCell colSpan={3}>Total para {operador}</TableCell>
            <TableCell align="right">{formatoMoneda(pago.valor)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Panel>
  );
}
