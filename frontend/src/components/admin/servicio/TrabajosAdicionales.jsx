/**
 * Tabla para marcar los trabajos adicionales de un servicio y su cantidad
 * (diálogo Corregir). El precio lo pone el sistema según el cliente y la fecha.
 *
 *   valores: { concepto_id: "cantidad" } de los marcados
 *   onCambiar(id, cantidad | null): null = desmarcar
 */
import { Checkbox, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { UNIDADES_COBRO } from "../../../utils/formato";
import { numeroValido } from "./formularioCorreccion";

export default function TrabajosAdicionales({ catalogo, valores, onCambiar }) {
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell padding="checkbox" />
          <TableCell>Concepto</TableCell>
          <TableCell sx={{ width: 160 }}>Cantidad</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {catalogo.map((c) => {
          const valor = valores[c.id];
          const marcado = valor !== undefined;
          return (
            <TableRow key={c.id}>
              <TableCell padding="checkbox">
                <Checkbox checked={marcado} onChange={() => onCambiar(c.id, marcado ? null : "1")} slotProps={{ input: { "aria-label": c.nombre } }} />
              </TableCell>
              <TableCell>
                {c.nombre}
                <Typography variant="caption" color="text.secondary" component="div">
                  {UNIDADES_COBRO[c.unidad_cobro]}
                  {!c.la_reporta_operador && " · solo administrador"}
                </Typography>
              </TableCell>
              <TableCell>
                {marcado && (
                  <TextField
                    size="small"
                    value={valor}
                    onChange={(e) => onCambiar(c.id, e.target.value.replace(/[^\d.,]/g, ""))}
                    error={!numeroValido(valor, { min: 0.01, max: 999 })}
                    slotProps={{ htmlInput: { inputMode: "decimal", "aria-label": `Cantidad ${c.nombre}` } }}
                  />
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
