/**
 * Inicio de sesión (común a todos los roles).
 * Diseñado primero para celular; en computador se ve centrado.
 * Después del login, cada rol va a su pantalla (inicioPorRol).
 */
import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Alert, Box, Button, Card, CardContent, IconButton, InputAdornment, TextField, Typography } from "@mui/material";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import { useAuth } from "../context/AuthContext";
import { inicioPorRol } from "../utils/roles";
import { mensajeError } from "../utils/formato";
import Marca from "../components/Marca";

export default function LoginPage() {
  const { usuario, iniciarSesion } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verClave, setVerClave] = useState(false);
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  // Si ya hay sesión, no mostrar el login
  if (usuario) return <Navigate to={inicioPorRol(usuario.rol)} replace />;

  async function ingresar(e) {
    e.preventDefault();
    setError("");
    setCargando(true);
    try {
      const datos = await iniciarSesion(email.trim(), password);
      navigate(inicioPorRol(datos.rol), { replace: true });
    } catch (err) {
      setError(mensajeError(err, "No fue posible iniciar sesión"));
    } finally {
      setCargando(false);
    }
  }

  return (
    <Box
      sx={{
        minHeight: "100dvh",
        bgcolor: "primary.dark",
        backgroundImage: "linear-gradient(180deg, #0B1F3A 0%, #12325E 55%, #F3F6FB 55%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        p: 2,
        gap: 4,
      }}
    >
      <Marca tamano="grande" lema />

      <Card sx={{ width: "100%", maxWidth: 400, borderRadius: 4 }}>
        <CardContent component="form" onSubmit={ingresar} noValidate sx={{ display: "flex", flexDirection: "column", gap: 2, p: 3 }}>
          <Box>
            <Typography variant="h6">Iniciar sesión</Typography>
            <Typography variant="body2" color="text.secondary">
              Accede a tu cuenta para continuar
            </Typography>
          </Box>

          {error && <Alert severity="error">{error}</Alert>}

          <TextField
            label="Correo electrónico"
            type="email"
            autoComplete="username"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <EmailOutlinedIcon />
                  </InputAdornment>
                ),
              },
            }}
          />
          <TextField
            label="Contraseña"
            type={verClave ? "text" : "password"}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <LockOutlinedIcon />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label={verClave ? "Ocultar contraseña" : "Mostrar contraseña"}
                      onClick={() => setVerClave((v) => !v)}
                      edge="end"
                    >
                      {verClave ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
          <Button type="submit" variant="contained" size="large" disabled={cargando || !email || !password}>
            {cargando ? "Ingresando…" : "Iniciar sesión"}
          </Button>
          <Typography sx={{ textAlign: "center" }} variant="caption" color="text.secondary">
            ¿Olvidaste tu contraseña? Comunícate con el administrador.
          </Typography>
        </CardContent>
      </Card>

      <Typography variant="caption" color="text.secondary">
        © GruaLink v1.0 · SOTRANDES S.A.
      </Typography>
    </Box>
  );
}
