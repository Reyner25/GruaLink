/**
 * Perfil del operador: sus datos y cerrar sesión.
 * Si tiene un turno activo, se le advierte antes de salir
 * (cerrar sesión NO cierra el turno).
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Avatar, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from "@mui/material";
import EmailIcon from "@mui/icons-material/Email";
import BadgeIcon from "@mui/icons-material/Badge";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import LogoutIcon from "@mui/icons-material/Logout";
import { useAuth } from "../../context/AuthContext";
import { useTurno } from "../../context/TurnoContext";
import { BarraSuperior, Contenido, FilaDato } from "../../components/operador/Comunes";

export default function Perfil() {
  const navigate = useNavigate();
  const { usuario, cerrarSesion } = useAuth();
  const { turno } = useTurno();
  const [confirmar, setConfirmar] = useState(false);

  async function salir() {
    await cerrarSesion();
    navigate("/login", { replace: true });
  }

  return (
    <>
      <BarraSuperior titulo="Mi perfil" />
      <Contenido>
        <Stack spacing={1} sx={{ alignItems: "center", py: 2 }}>
          <Avatar sx={{ width: 72, height: 72, bgcolor: "primary.main", fontSize: 32 }}>{usuario?.nombre?.[0]}</Avatar>
          <Typography variant="h6">{usuario?.nombre}</Typography>
        </Stack>
        <Card>
          <CardContent>
            <FilaDato icono={<EmailIcon />} etiqueta="Correo" valor={usuario?.email} />
            <FilaDato icono={<BadgeIcon />} etiqueta="Rol" valor="Operador de grúa" />
            <FilaDato icono={<LocalShippingIcon />} etiqueta="Grúa del turno actual" valor={turno ? `${turno.grua_numero} · ${turno.grua_placa}` : "Sin turno activo"} />
          </CardContent>
        </Card>
        <Typography variant="body2" color="text.secondary">
          Para cambiar tus datos o tu contraseña, comunícate con el administrador.
        </Typography>
        <Button variant="contained" color="error" size="large" startIcon={<LogoutIcon />} onClick={() => setConfirmar(true)}>
          Cerrar sesión
        </Button>
      </Contenido>

      <Dialog open={confirmar} onClose={() => setConfirmar(false)}>
        <DialogTitle>¿Cerrar sesión?</DialogTitle>
        <DialogContent>
          {turno ? (
            <Alert severity="warning">
              Tu turno sigue activo. Cerrar sesión NO finaliza el turno: si terminaste tu jornada, finalízalo primero.
            </Alert>
          ) : (
            <Typography>Tendrás que ingresar de nuevo tu correo y contraseña.</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmar(false)}>Cancelar</Button>
          {turno && (
            <Button onClick={() => navigate("/app/turno/finalizar")}>Finalizar turno</Button>
          )}
          <Button variant="contained" color="error" onClick={salir}>
            Cerrar sesión
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
