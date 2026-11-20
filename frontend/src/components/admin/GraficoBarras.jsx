/**
 * Gráfico de barras verticales simple (una sola serie), hecho con MUI.
 * Sin librerías externas.
 *
 * Reglas de diseño (guía de visualización):
 *  - Una serie = un solo color; sin leyenda (el título de la tarjeta lo nombra).
 *  - Barras con extremo superior redondeado (4px) y separación entre barras.
 *  - Cuadrícula tenue; el valor exacto aparece al pasar el mouse (tooltip).
 *  - Cada barra tiene aria-label para lectores de pantalla.
 *
 * datos: [{ etiqueta: "21 nov", valor: 12, detalle: "$ 4.500.000" }]
 */
import { Box, Stack, Tooltip, Typography } from "@mui/material";

const ALTO = 220;

// Escala "bonita": 0, 5, 10, 15… según el máximo
function marcasEje(maximo) {
  if (maximo <= 0) return [0, 1];
  const paso = Math.pow(10, Math.floor(Math.log10(maximo)));
  const opciones = [1, 2, 5, 10].map((m) => m * paso);
  const elegido = opciones.find((p) => maximo / p <= 5) || opciones.at(-1);
  const tope = Math.ceil(maximo / elegido) * elegido;
  const marcas = [];
  for (let v = 0; v <= tope; v += elegido) marcas.push(v);
  return marcas;
}

export default function GraficoBarras({ datos, color = "primary.main", vacio = "Sin datos en el periodo" }) {
  if (!datos.length) {
    return (
      <Typography color="text.secondary" sx={{ py: 6, textAlign: "center" }}>
        {vacio}
      </Typography>
    );
  }
  const marcas = marcasEje(Math.max(...datos.map((d) => d.valor)));
  const tope = marcas.at(-1);
  // Con muchos días, mostrar solo algunas etiquetas para que no se encimen
  const cadaCuanto = Math.ceil(datos.length / 12);

  return (
    <Box sx={{ display: "flex", gap: 1 }}>
      {/* Eje Y */}
      <Box sx={{ position: "relative", width: 32, height: ALTO, flexShrink: 0 }}>
        {marcas.map((m) => (
          <Typography
            key={m}
            variant="caption"
            color="text.secondary"
            sx={{ position: "absolute", right: 0, bottom: `${(m / tope) * 100}%`, transform: "translateY(50%)" }}
          >
            {m}
          </Typography>
        ))}
      </Box>

      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        {/* Área de barras con cuadrícula tenue */}
        <Box sx={{ position: "relative", height: ALTO, borderBottom: 1, borderColor: "divider" }}>
          {marcas.slice(1).map((m) => (
            <Box
              key={m}
              sx={{ position: "absolute", left: 0, right: 0, bottom: `${(m / tope) * 100}%`, borderTop: "1px dashed", borderColor: "divider" }}
            />
          ))}
          <Stack direction="row" sx={{ position: "absolute", inset: 0, alignItems: "flex-end", gap: "2px" }}>
            {datos.map((d) => (
              <Tooltip
                key={d.etiqueta}
                arrow
                title={
                  <Box>
                    <b>{d.etiqueta}</b>
                    <div>{d.valor} servicio(s)</div>
                    {d.detalle && <div>{d.detalle}</div>}
                  </Box>
                }
              >
                {/* Zona de toque más alta que la barra: fácil de señalar */}
                <Box
                  role="img"
                  aria-label={`${d.etiqueta}: ${d.valor}`}
                  sx={{ flex: 1, height: "100%", display: "flex", alignItems: "flex-end", cursor: "default", maxWidth: 48, mx: "auto" }}
                >
                  <Box
                    sx={{
                      width: "70%",
                      mx: "auto",
                      height: `${(d.valor / tope) * 100}%`,
                      minHeight: d.valor > 0 ? 2 : 0,
                      bgcolor: color,
                      borderRadius: "4px 4px 0 0",
                      transition: "opacity .15s",
                      "&:hover": { opacity: 0.8 },
                    }}
                  />
                </Box>
              </Tooltip>
            ))}
          </Stack>
        </Box>
        {/* Eje X */}
        <Stack direction="row" sx={{ gap: "2px", mt: 0.5 }}>
          {datos.map((d, i) => (
            <Typography
              key={d.etiqueta}
              variant="caption"
              color="text.secondary"
              sx={{ flex: 1, textAlign: "center", maxWidth: 48, mx: "auto", whiteSpace: "nowrap", overflow: "hidden" }}
            >
              {i % cadaCuanto === 0 ? d.etiqueta : ""}
            </Typography>
          ))}
        </Stack>
      </Box>
    </Box>
  );
}
