/**
 * Detalle de un servicio (solo lectura para el operador).
 * Si el servicio sigue abierto, ofrece el botón "Finalizar servicio".
 * No muestra valores en pesos: el backend no se los envía al operador.
 */
import { useNavigate, useParams } from "react-router-dom";
import { Alert, Button, Card, CardContent, Chip, Divider, Stack, Typography } from "@mui/material";
import EventIcon from "@mui/icons-material/Event";
import PersonIcon from "@mui/icons-material/Person";
import DirectionsBusIcon from "@mui/icons-material/DirectionsBus";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import PlaceIcon from "@mui/icons-material/Place";
import FlagIcon from "@mui/icons-material/Flag";
import BuildIcon from "@mui/icons-material/Build";
import TimerIcon from "@mui/icons-material/Timer";
import RouteIcon from "@mui/icons-material/Route";
import AssignmentIndIcon from "@mui/icons-material/AssignmentInd";
import NotesIcon from "@mui/icons-material/Notes";
import LockIcon from "@mui/icons-material/Lock";
import { useCargar } from "../../hooks/useCargar";
import { obtenerServicioDetalle } from "../../api/servicios.api";
import { cantidadConUnidad, duracion, ESTADOS_ABIERTOS, formatoFecha, formatoFechaHora, formatoNumero } from "../../utils/formato";
import { BarraAcciones, BarraSuperior, Cargando, Contenido, ErrorCarga, EstadoServicio, FilaDato, MensajeRuta, TituloSeccion } from "../../components/operador/Comunes";

export default function DetalleServicio() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { datos, cargando, error, recargar } = useCargar(() => obtenerServicioDetalle(id), [id]);

  if (cargando) return <Cargando />;
  if (error) {
    return (
      <>
        <BarraSuperior titulo="Detalle del servicio" atras="/app/servicios" />
        <Contenido>
          <ErrorCarga mensaje={error} onReintentar={recargar} />
        </Contenido>
      </>
    );
  }

  const { servicio: s, conceptos } = datos;
  const abierto = ESTADOS_ABIERTOS.includes(s.estado);

  return (
    <>
      <MensajeRuta />
      <BarraSuperior titulo="Detalle del servicio" atras="/app/servicios" />
      <Contenido sx={{ pb: abierto ? 2 : 4 }}>
        <Card>
          <CardContent>
            <Stack sx={{ alignItems: "center", justifyContent: "space-between" }} direction="row">
              <Typography variant="h6">#{s.numero_orden}</Typography>
              <EstadoServicio estado={s.estado} size="medium" />
            </Stack>
            <FilaDato icono={<EventIcon />} etiqueta="Fecha del servicio" valor={formatoFecha(s.fecha_servicio)} />
            <FilaDato icono={<PersonIcon />} etiqueta="Cliente" valor={s.cliente_nombre} />
            <FilaDato icono={<DirectionsBusIcon />} etiqueta="Vehículo" valor={`${s.placa_vehiculo} · ${s.tipo_vehiculo}${s.numero_vehiculo ? ` · N.º ${s.numero_vehiculo}` : ""}`} />
            <FilaDato icono={<BuildIcon />} etiqueta="Tipo de servicio" valor={s.tipo_servicio} />
            <FilaDato icono={<LocalShippingIcon />} etiqueta="Grúa" valor={`${s.grua_numero} · ${s.grua_placa}`} />
            <FilaDato icono={<PlaceIcon />} etiqueta="Origen" valor={s.origen} />
            <FilaDato icono={<FlagIcon />} etiqueta="Destino" valor={s.destino} />
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <TituloSeccion>Tiempos</TituloSeccion>
            <FilaDato icono={<EventIcon />} etiqueta="Hora de solicitud" valor={formatoFechaHora(s.hora_solicitud)} />
            <FilaDato icono={<EventIcon />} etiqueta="Inicio" valor={formatoFechaHora(s.inicio_servicio)} />
            <FilaDato icono={<EventIcon />} etiqueta="Fin" valor={formatoFechaHora(s.fin_servicio)} />
            {s.inicio_servicio && s.fin_servicio && (
              <FilaDato icono={<TimerIcon />} etiqueta="Duración" valor={duracion(s.inicio_servicio, s.fin_servicio)} />
            )}
            {!abierto && (
              <FilaDato
                icono={<RouteIcon />}
                etiqueta="Kilómetros"
                // Los km los registra el administrador en la revisión
                valor={
                  Number(s.km_vacio) || Number(s.km_servicio)
                    ? `${formatoNumero(s.km_vacio)} km en vacío · ${formatoNumero(s.km_servicio)} km en servicio`
                    : "Los registra el administrador"
                }
              />
            )}
          </CardContent>
        </Card>

        {!abierto && (
          <Card>
            <CardContent>
              <TituloSeccion>Entrega</TituloSeccion>
              <Chip
                sx={{ my: 1 }}
                color={s.entregado_sin_novedad ? "success" : "warning"}
                label={s.entregado_sin_novedad ? "Entregado sin novedad" : "Entregado con novedad"}
              />
              <FilaDato icono={<AssignmentIndIcon />} etiqueta="Recibe" valor={[s.recibe_nombre, s.recibe_documento].filter(Boolean).join(" · ")} />
              <FilaDato icono={<NotesIcon />} etiqueta="Observaciones de entrega" valor={s.observaciones_entrega} />
              {conceptos.length > 0 && (
                <>
                  <Divider sx={{ my: 1 }} />
                  <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                    Trabajos adicionales
                  </Typography>
                  {conceptos.map((c) => (
                    <Stack key={c.concepto_id} direction="row" sx={{ justifyContent: "space-between", py: 0.5 }}>
                      <Typography variant="body2">{c.nombre}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        {cantidadConUnidad(c.cantidad, c.unidad_cobro)}
                      </Typography>
                    </Stack>
                  ))}
                </>
              )}
            </CardContent>
          </Card>
        )}

        {s.observaciones && (
          <Card>
            <CardContent>
              <FilaDato icono={<NotesIcon />} etiqueta="Observaciones" valor={<span style={{ whiteSpace: "pre-line" }}>{s.observaciones}</span>} />
            </CardContent>
          </Card>
        )}

        {!abierto && (
          <Alert severity="info" icon={<LockIcon />}>
            Este servicio ya fue cerrado y no se puede modificar. Si hay un error, informa al administrador.
          </Alert>
        )}
      </Contenido>

      {abierto && (
        <BarraAcciones>
          <Button variant="contained" size="large" fullWidth onClick={() => navigate(`/app/servicios/${s.id}/finalizar`)}>
            Finalizar servicio
          </Button>
        </BarraAcciones>
      )}
    </>
  );
}
