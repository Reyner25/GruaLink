/**
 * Identidad visual de GruaLink (basada en las maquetas):
 * azul oscuro para barras y menú, azul para acciones, fondos claros.
 */
import { createTheme } from "@mui/material/styles";

const tema = createTheme({
  palette: {
    primary: { main: "#1565D8", dark: "#0B1F3A", light: "#E8F0FC", contrastText: "#FFFFFF" },
    secondary: { main: "#F5B800", contrastText: "#0B1F3A" },
    success: { main: "#1B9E5A", light: "#E7F6EE" },
    warning: { main: "#F59E0B", light: "#FEF5E7" },
    error: { main: "#E53935" },
    info: { main: "#0288D1" },
    background: { default: "#F3F6FB", paper: "#FFFFFF" },
    text: { primary: "#0B1F3A", secondary: "#5B6B82" },
  },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: '"Segoe UI", Roboto, Arial, sans-serif',
    h5: { fontWeight: 700 },
    h6: { fontWeight: 600 },
    button: { fontWeight: 600 },
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: { textTransform: "none", fontWeight: 600, borderRadius: 10 },
        // Botones grandes: se usan con guantes y en movimiento
        sizeLarge: { minHeight: 52, fontSize: "1rem" },
      },
    },
    MuiCard: {
      styleOverrides: { root: { boxShadow: "0 1px 3px rgba(11,31,58,0.08)" } },
    },
    MuiTextField: {
      defaultProps: { fullWidth: true },
    },
    MuiInputBase: {
      // 16px evita que el iPhone haga zoom al tocar un campo
      styleOverrides: { input: { fontSize: 16 } },
    },
  },
});

export default tema;
