/** Logo de texto "GruaLink" con ícono de grúa. */
import { Box, Stack, Typography } from "@mui/material";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";

export default function Marca({ tamano = "normal", lema = false }) {
  const grande = tamano === "grande";
  return (
    <Stack sx={{ alignItems: "center" }} direction="row" spacing={1}>
      <LocalShippingIcon sx={{ fontSize: grande ? 44 : 26, color: "#fff" }} />
      <Box>
        <Typography
          component="span"
          sx={{ fontWeight: 800, fontSize: grande ? "2rem" : "1.2rem", color: "#fff", lineHeight: 1 }}
        >
          Grua
          <Box component="span" sx={{ color: "secondary.main" }}>
            Link
          </Box>
        </Typography>
        {lema && (
          <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.75)" }}>
            En ruta, en buenas manos
          </Typography>
        )}
      </Box>
    </Stack>
  );
}
