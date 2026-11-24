/**
 * La tabla de bolsa de km como en el Excel:
 *   columnas = km de TODOS los servicios del mes · filas = km de cada servicio.
 * Las celdas que ya cobraron servicios llevan candado y no se pueden tocar.
 *
 *   tabla: { columnas, filas, celdas } de la API
 *   columnaProvisional: la columna resaltada (la que se usa con el mes abierto)
 *   onElegir({ celda, columna, fila }): clic en una celda editable (null = no editable)
 */
import { Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography } from "@mui/material";
import LockIcon from "@mui/icons-material/Lock";
import { n, textoCelda, textoColumna, textoFila } from "./textosBolsa";

export default function CuadriculaBolsa({ tabla, columnaProvisional, onElegir }) {
  const celda = (col, fila) => tabla.celdas.find((c) => n(c.bolsa_km_desde) === n(col.desde) && n(c.km_desde) === n(fila.desde));
  return (
    <TableContainer>
      <Table size="small" sx={{ "& td, & th": { whiteSpace: "nowrap" } }}>
        <TableHead>
          <TableRow sx={{ "& th": { fontWeight: 700 } }}>
            <TableCell>Km del servicio \ Km del mes</TableCell>
            {tabla.columnas.map((c) => (
              <TableCell key={c.desde} align="right" sx={c === columnaProvisional ? { bgcolor: "warning.light" } : undefined}>
                {textoColumna(c)}
                {c === columnaProvisional && (
                  <Typography variant="caption" component="div">
                    provisional
                  </Typography>
                )}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {tabla.filas.map((f) => (
            <TableRow key={f.desde}>
              <TableCell sx={{ fontWeight: 600 }}>{textoFila(f)}</TableCell>
              {tabla.columnas.map((col) => {
                const c = celda(col, f);
                if (!c) {
                  return (
                    <TableCell key={col.desde} align="right">
                      —
                    </TableCell>
                  );
                }
                const clicable = Boolean(onElegir) && !c.usada;
                return (
                  <TableCell
                    key={col.desde}
                    align="right"
                    onClick={clicable ? () => onElegir({ celda: c, columna: col, fila: f }) : undefined}
                    sx={{ cursor: clicable ? "pointer" : "default", "&:hover": clicable ? { bgcolor: "action.hover" } : undefined }}
                  >
                    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
                      {c.usada && (
                        <Tooltip title="Ya cobró servicios: no se modifica">
                          <LockIcon sx={{ fontSize: 14, color: "text.disabled" }} />
                        </Tooltip>
                      )}
                      {textoCelda(c)}
                    </Box>
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
