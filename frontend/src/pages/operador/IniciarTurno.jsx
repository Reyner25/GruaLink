/**
 * Inicio de turno.
 * El operador elige la grúa (provisional, P3) y escribe observaciones.
 * La fecha y hora de inicio las pone el SERVIDOR.
 * Las grúas que otro operador ya está usando aparecen deshabilitadas.
 */
import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Alert, Box, Button, Card, CardActionArea, Chip, Radio, Stack, TextField, Typography } from "@mui/material";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import { useTurno } from "../../context/TurnoContext";
import { useCargar } from "../../hooks/useCargar";
import { gruasDisponibles, iniciarTurno } from "../../api/turnos.api";
import { formatoFechaHora, mensajeError } from "../../utils/formato";
import { BarraAcciones, BarraSuperior, Cargando, Contenido, ErrorCarga, TituloSeccion } from "../../components/operador/Comunes";

export default function IniciarTurno() {
  const navigate = useNavigate();
  const { turno, actualizarTurno } = useTurno();
  const { datos: gruas, cargando, error, recargar } = useCargar(gruasDisponibles, []);
  const [gruaId, setGruaId] = useState(null);
  const [observaciones, setObservaciones] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState("");

  if (turno) return <Navigate to="/app" replace />;

  async function confirmar() {
    setEnviando(true);
    setErrorEnvio("");
    try {
      const nuevo = await iniciarTurno({ grua_id: gruaId, observaciones: observaciones.trim() || undefined });
      actualizarTurno(nuevo);
      navigate("/app", { replace: true, state: { mensaje: `Turno iniciado a las ${formatoFechaHora(nuevo.inicio)}` } });
    } catch (err) {
      setErrorEnvio(mensajeError(err));
      recargar(); // por si otro operador tomó la grúa
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <BarraSuperior titulo="Inicio de turno" atras="/app" />
      <Contenido>
        <Stack spacing={1} sx={{ alignItems: "center", py: 1 }}>
          <AccessTimeIcon color="primary" sx={{ fontSize: 48 }} />
          <Typography variant="h6">Registrar inicio de turno</Typography>
          <Typography sx={{ textAlign: "center" }} variant="body2" color="text.secondary">
            La fecha y hora de inicio las registra el sistema al confirmar.
          </Typography>
        </Stack>

        <TituloSeccion>Grúa con la que trabajarás</TituloSeccion>
        {cargando && <Cargando texto="Cargando grúas…" />}
        {error && <ErrorCarga mensaje={error} onReintentar={recargar} />}
        {gruas && gruas.length === 0 && <Alert severity="warning">No hay grúas activas. Comunícate con el administrador.</Alert>}

        <Stack spacing={1}>
          {(gruas || []).map((g) => {
            const elegida = gruaId === g.id;
            return (
              <Card key={g.id} sx={{ border: 2, borderColor: elegida ? "primary.main" : "transparent", opacity: g.en_uso ? 0.55 : 1 }}>
                <CardActionArea disabled={g.en_uso} onClick={() => setGruaId(g.id)} sx={{ p: 1.5 }}>
                  <Stack sx={{ alignItems: "center" }} direction="row" spacing={1.5}>
                    <Radio checked={elegida} disabled={g.en_uso} sx={{ p: 0 }} inputProps={{ "aria-label": `Grúa ${g.numero_interno}` }} />
                    <LocalShippingIcon color={g.en_uso ? "disabled" : "primary"} />
                    <Box sx={{ flexGrow: 1 }}>
                      <Typography sx={{ fontWeight: 700 }}>Grúa {g.numero_interno}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Placa {g.placa}
                      </Typography>
                    </Box>
                    {g.en_uso && <Chip size="small" label="En uso" />}
                  </Stack>
                </CardActionArea>
              </Card>
            );
          })}
        </Stack>

        <TextField
          label="Observaciones (opcional)"
          placeholder="Ej: combustible, novedades de la grúa…"
          multiline
          minRows={3}
          value={observaciones}
          onChange={(e) => setObservaciones(e.target.value)}
          slotProps={{ htmlInput: { maxLength: 1000 } }}
        />

        {errorEnvio && <Alert severity="error">{errorEnvio}</Alert>}
      </Contenido>

      <BarraAcciones>
        <Button variant="contained" size="large" fullWidth disabled={!gruaId || enviando} onClick={confirmar}>
          {enviando ? "Registrando…" : "Registrar inicio de turno"}
        </Button>
      </BarraAcciones>
    </>
  );
}
