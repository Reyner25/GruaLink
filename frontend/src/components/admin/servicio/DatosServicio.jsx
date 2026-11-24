/**
 * Paneles de solo lectura del detalle de un servicio:
 *   DatosServicio  cliente, vehículo, tipo, origen/destino, operador, grúa…
 *   TiemposServicio horas, tiempo de reacción y duración, km y entrega
 */
import { Box, Chip, Grid, Typography } from "@mui/material";
import { duracion, ESTADOS_ABIERTOS, formatoFecha, formatoFechaHora, formatoNumero, sinKilometros } from "../../../utils/formato";
import { Panel } from "../Comunes";

/** Par "etiqueta: valor". Si no hay valor muestra "—". */
function Dato({ etiqueta, children }) {
  return (
    <Box sx={{ py: 0.75 }}>
      <Typography variant="caption" color="text.secondary" component="div">
        {etiqueta}
      </Typography>
      <Typography variant="body2" component="div" sx={{ wordBreak: "break-word" }}>
        {children === null || children === undefined || children === "" ? "—" : children}
      </Typography>
    </Box>
  );
}

const Columna = ({ ancho = 6, children }) => <Grid size={{ xs: 12, sm: ancho }}>{children}</Grid>;

export function DatosServicio({ servicio: s }) {
  return (
    <Panel titulo="Datos del servicio">
      <Grid container columnSpacing={3}>
        <Columna>
          <Dato etiqueta="Cliente">
            {s.cliente_nombre} <Typography variant="caption" color="text.secondary">NIT {s.cliente_nit}</Typography>
          </Dato>
          <Dato etiqueta="Vehículo">
            {s.placa_vehiculo} · {s.tipo_vehiculo}
            {s.numero_vehiculo ? ` · N.º ${s.numero_vehiculo}` : ""}
          </Dato>
          <Dato etiqueta="Tipo de servicio">{s.tipo_servicio}</Dato>
          <Dato etiqueta="Origen">{s.origen}</Dato>
          <Dato etiqueta="Destino">{s.destino}</Dato>
        </Columna>
        <Columna>
          <Dato etiqueta="Operador">{s.operador_nombre}</Dato>
          <Dato etiqueta="Grúa">
            {s.grua_numero} · {s.grua_placa}
          </Dato>
          <Dato etiqueta="Fecha del servicio">{formatoFecha(s.fecha_servicio)}</Dato>
          <Dato etiqueta="Registrado">{formatoFechaHora(s.creado_en)}</Dato>
          <Dato etiqueta="Observaciones">
            <span style={{ whiteSpace: "pre-line" }}>{s.observaciones}</span>
          </Dato>
        </Columna>
      </Grid>
    </Panel>
  );
}

export function TiemposServicio({ servicio: s }) {
  const abierto = ESTADOS_ABIERTOS.includes(s.estado);
  return (
    <Panel titulo="Tiempos, kilómetros y entrega">
      <Grid container columnSpacing={3}>
        <Columna ancho={4}>
          <Dato etiqueta="Hora de solicitud">{formatoFechaHora(s.hora_solicitud)}</Dato>
          <Dato etiqueta="Inicio">{formatoFechaHora(s.inicio_servicio)}</Dato>
          <Dato etiqueta="Fin">{formatoFechaHora(s.fin_servicio)}</Dato>
        </Columna>
        <Columna ancho={4}>
          <Dato etiqueta="Tiempo de reacción">{s.hora_solicitud && s.inicio_servicio ? duracion(s.hora_solicitud, s.inicio_servicio) : null}</Dato>
          <Dato etiqueta="Duración del servicio">{s.inicio_servicio && s.fin_servicio ? duracion(s.inicio_servicio, s.fin_servicio) : null}</Dato>
          <Dato etiqueta="Kilómetros">
            {sinKilometros(s) ? <Chip size="small" color="warning" label="Sin registrar" /> : `${formatoNumero(s.km_vacio)} vacío · ${formatoNumero(s.km_servicio)} servicio`}
          </Dato>
        </Columna>
        <Columna ancho={4}>
          <Dato etiqueta="Entrega">{abierto ? null : s.entregado_sin_novedad ? "Sin novedad" : "Con novedad"}</Dato>
          <Dato etiqueta="Recibe">{[s.recibe_nombre, s.recibe_documento].filter(Boolean).join(" · ")}</Dato>
          <Dato etiqueta="Observaciones de entrega">{s.observaciones_entrega}</Dato>
        </Columna>
      </Grid>
    </Panel>
  );
}
