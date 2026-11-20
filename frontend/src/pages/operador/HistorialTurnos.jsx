/**
 * Historial de turnos del operador (solo los suyos: lo filtra el backend).
 * Pestañas: Hoy · Semana · Mes.
 */
import { useState } from "react";
import { Box, Card, CardContent, Stack, Tab, Tabs, Typography } from "@mui/material";
import { useCargar } from "../../hooks/useCargar";
import { historialTurnos } from "../../api/turnos.api";
import { duracion, formatoFecha, formatoHora, hoy } from "../../utils/formato";
import { BarraSuperior, Cargando, Contenido, ErrorCarga, EstadoTurno } from "../../components/operador/Comunes";

// Fecha "desde" de cada pestaña (AAAA-MM-DD, hora de Colombia)
function desdeHace(dias) {
  const d = new Date(`${hoy()}T12:00:00`);
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}
const RANGOS = { hoy: 0, semana: 6, mes: 30 };

export default function HistorialTurnos() {
  const [rango, setRango] = useState("semana");
  const { datos: turnos, cargando, error, recargar } = useCargar(
    () => historialTurnos({ desde: desdeHace(RANGOS[rango]), limite: 100 }),
    [rango],
  );

  return (
    <>
      <BarraSuperior titulo="Historial de turnos" />
      <Box sx={{ bgcolor: "background.paper", borderBottom: 1, borderColor: "divider" }}>
        <Tabs value={rango} onChange={(_, v) => setRango(v)} variant="fullWidth">
          <Tab value="hoy" label="Hoy" />
          <Tab value="semana" label="Semana" />
          <Tab value="mes" label="Mes" />
        </Tabs>
      </Box>
      <Contenido>
        {cargando && <Cargando />}
        {error && <ErrorCarga mensaje={error} onReintentar={recargar} />}
        {turnos && turnos.length === 0 && (
          <Typography color="text.secondary" sx={{ textAlign: "center", py: 6 }}>
            No hay turnos en este periodo.
          </Typography>
        )}
        <Stack spacing={1.5}>
          {(turnos || []).map((t) => (
            <Card key={t.id}>
              <CardContent sx={{ pb: "16px !important" }}>
                <Stack sx={{ alignItems: "flex-start", justifyContent: "space-between" }} direction="row">
                  <Box>
                    <Typography sx={{ fontWeight: 700 }}>{formatoFecha(t.inicio)}</Typography>
                    <Typography variant="body2">
                      {formatoHora(t.inicio)} – {t.fin ? formatoHora(t.fin) : "en curso"} · {duracion(t.inicio, t.fin || new Date())}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Grúa {t.grua_numero} · {t.grua_placa}
                    </Typography>
                  </Box>
                  <EstadoTurno estado={t.estado} />
                </Stack>
                {t.observaciones_cierre && (
                  <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1, whiteSpace: "pre-line" }}>
                    {t.observaciones_cierre}
                  </Typography>
                )}
              </CardContent>
            </Card>
          ))}
        </Stack>
      </Contenido>
    </>
  );
}
