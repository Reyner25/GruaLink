/**
 * Pantalla de inicio del operador.
 *
 * Muestra:
 *  - Estado del turno (activo con grúa y hora, o aviso de que no ha iniciado).
 *  - Accesos: nuevo servicio, mis servicios, historial, perfil.
 *  - Servicios pendientes de finalizar (los abiertos del operador).
 *
 * "Nuevo servicio" se desactiva sin turno: el backend también lo impide.
 */
import { useNavigate } from "react-router-dom";
import { Alert, Box, Button, Card, CardActionArea, CardContent, Chip, Stack, Typography } from "@mui/material";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutlineOutlined";
import ListAltIcon from "@mui/icons-material/ListAlt";
import HistoryIcon from "@mui/icons-material/History";
import PersonOutlineIcon from "@mui/icons-material/PersonOutlineOutlined";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { useAuth } from "../../context/AuthContext";
import { useTurno } from "../../context/TurnoContext";
import { useCargar } from "../../hooks/useCargar";
import { listarServicios } from "../../api/servicios.api";
import { duracion, ESTADOS_ABIERTOS, formatoHora } from "../../utils/formato";
import { Cargando, Contenido, ErrorCarga, EstadoServicio, MensajeRuta } from "../../components/operador/Comunes";
import Marca from "../../components/Marca";

function TarjetaAccion({ icono, titulo, detalle, onClick, deshabilitada }) {
  return (
    <Card sx={{ height: "100%", opacity: deshabilitada ? 0.5 : 1 }}>
      <CardActionArea onClick={onClick} disabled={deshabilitada} sx={{ height: "100%", p: 2 }}>
        <Box sx={{ color: "primary.main", mb: 1 }}>{icono}</Box>
        <Typography sx={{ fontWeight: 700 }}>{titulo}</Typography>
        <Typography variant="caption" color="text.secondary">
          {detalle}
        </Typography>
      </CardActionArea>
    </Card>
  );
}

function TarjetaTurno() {
  const navigate = useNavigate();
  const { turno, cargando, error, recargarTurno } = useTurno();

  if (cargando) return <Cargando texto="Consultando tu turno…" />;
  if (error) return <ErrorCarga mensaje={error} onReintentar={recargarTurno} />;

  if (!turno) {
    return (
      <Card sx={{ bgcolor: "warning.light", border: 1, borderColor: "warning.main" }}>
        <CardContent>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", mb: 2 }}>
            <WarningAmberIcon color="warning" fontSize="large" />
            <Box>
              <Typography sx={{ fontWeight: 700 }}>No has iniciado tu turno</Typography>
              <Typography variant="body2" color="text.secondary">
                Debes iniciarlo para registrar servicios.
              </Typography>
            </Box>
          </Stack>
          <Button variant="contained" size="large" fullWidth onClick={() => navigate("/app/turno/iniciar")}>
            Iniciar turno
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card sx={{ bgcolor: "success.light", border: 1, borderColor: "success.main" }}>
      <CardContent>
        <Stack sx={{ alignItems: "center" }} direction="row" spacing={1.5}>
          <AccessTimeIcon color="success" fontSize="large" />
          <Box sx={{ flexGrow: 1 }}>
            <Typography sx={{ fontWeight: 700 }}>Turno en curso</Typography>
            <Typography variant="body2">
              Desde las {formatoHora(turno.inicio)} · {duracion(turno.inicio)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Grúa {turno.grua_numero} · {turno.grua_placa}
            </Typography>
          </Box>
        </Stack>
        <Button
          variant="outlined"
          color="success"
          fullWidth
          sx={{ mt: 2, bgcolor: "background.paper" }}
          onClick={() => navigate("/app/turno/finalizar")}
        >
          Finalizar turno
        </Button>
      </CardContent>
    </Card>
  );
}

function ServiciosPendientes() {
  const navigate = useNavigate();
  const { datos, cargando, error, recargar } = useCargar(() => listarServicios({ limite: 30 }), []);
  if (cargando) return null;
  if (error) return <ErrorCarga mensaje={error} onReintentar={recargar} />;

  const abiertos = (datos || []).filter((s) => ESTADOS_ABIERTOS.includes(s.estado));
  if (abiertos.length === 0) return null;

  return (
    <Box>
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
        Pendientes por finalizar ({abiertos.length})
      </Typography>
      <Stack spacing={1}>
        {abiertos.map((s) => (
          <Card key={s.id}>
            <CardActionArea onClick={() => navigate(`/app/servicios/${s.id}`)} sx={{ p: 1.5 }}>
              <Stack sx={{ alignItems: "center" }} direction="row" spacing={1}>
                <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                  <Stack sx={{ alignItems: "center" }} direction="row" spacing={1}>
                    <Typography sx={{ fontWeight: 700 }}>#{s.numero_orden}</Typography>
                    <EstadoServicio estado={s.estado} />
                  </Stack>
                  <Typography variant="body2" noWrap>
                    {s.cliente_nombre} · {s.placa_vehiculo}
                  </Typography>
                </Box>
                <ChevronRightIcon color="action" />
              </Stack>
            </CardActionArea>
          </Card>
        ))}
      </Stack>
    </Box>
  );
}

export default function InicioOperador() {
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const { turno } = useTurno();
  const primerNombre = usuario?.nombre?.split(" ")[0] || "";

  return (
    <>
      <MensajeRuta />
      <Box sx={{ bgcolor: "primary.dark", color: "#fff", px: 2, pt: 2, pb: 3 }}>
        <Marca />
        <Typography variant="h5" sx={{ mt: 2 }}>
          ¡Hola, {primerNombre}!
        </Typography>
        <Chip
          size="small"
          label={turno ? "Tu turno está activo" : "Sin turno activo"}
          color={turno ? "success" : "warning"}
          sx={{ mt: 1 }}
        />
      </Box>

      <Contenido>
        <TarjetaTurno />

        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
          <TarjetaAccion
            icono={<AddCircleOutlineIcon fontSize="large" />}
            titulo="Nuevo servicio"
            detalle={turno ? "Registrar servicio de grúa" : "Requiere turno activo"}
            deshabilitada={!turno}
            onClick={() => navigate("/app/servicios/nuevo")}
          />
          <TarjetaAccion
            icono={<ListAltIcon fontSize="large" />}
            titulo="Mis servicios"
            detalle="Ver servicios registrados"
            onClick={() => navigate("/app/servicios")}
          />
          <TarjetaAccion
            icono={<HistoryIcon fontSize="large" />}
            titulo="Historial"
            detalle="Mis turnos anteriores"
            onClick={() => navigate("/app/turnos")}
          />
          <TarjetaAccion
            icono={<PersonOutlineIcon fontSize="large" />}
            titulo="Perfil"
            detalle="Mi información"
            onClick={() => navigate("/app/perfil")}
          />
        </Box>

        {!turno && (
          <Alert severity="info" variant="outlined">
            Recuerda: la hora de inicio y fin del turno la registra el sistema automáticamente.
          </Alert>
        )}

        <ServiciosPendientes />
      </Contenido>
    </>
  );
}
