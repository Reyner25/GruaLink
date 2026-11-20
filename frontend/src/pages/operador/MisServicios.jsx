/**
 * Mis servicios: lista de los servicios del operador (el backend solo
 * devuelve los suyos). Pestañas Todos / En curso / Finalizados y buscador.
 */
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Card, CardActionArea, Fab, InputAdornment, Stack, Tab, Tabs, TextField, Typography } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import EventIcon from "@mui/icons-material/Event";
import PersonIcon from "@mui/icons-material/Person";
import DirectionsBusIcon from "@mui/icons-material/DirectionsBus";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import AddIcon from "@mui/icons-material/Add";
import { useCargar } from "../../hooks/useCargar";
import { useTurno } from "../../context/TurnoContext";
import { listarServicios } from "../../api/servicios.api";
import { ESTADOS_ABIERTOS, formatoFecha, formatoHora } from "../../utils/formato";
import { BarraSuperior, Cargando, Contenido, ErrorCarga, EstadoServicio, MensajeRuta } from "../../components/operador/Comunes";

const FILTROS = {
  todos: () => true,
  curso: (s) => ESTADOS_ABIERTOS.includes(s.estado),
  finalizados: (s) => !ESTADOS_ABIERTOS.includes(s.estado),
};

function Linea({ icono, children }) {
  return (
    <Stack direction="row" spacing={1} sx={{ alignItems: "center", color: "text.secondary" }}>
      {icono}
      <Typography variant="body2" noWrap>
        {children}
      </Typography>
    </Stack>
  );
}

export default function MisServicios() {
  const navigate = useNavigate();
  const { turno } = useTurno();
  const [filtro, setFiltro] = useState("todos");
  const [buscar, setBuscar] = useState("");
  const { datos, cargando, error, recargar } = useCargar(() => listarServicios({ limite: 100 }), []);

  const q = buscar.trim().toLowerCase();
  const visibles = (datos || [])
    .filter(FILTROS[filtro])
    .filter((s) => !q || `${s.numero_orden} ${s.placa_vehiculo} ${s.cliente_nombre}`.toLowerCase().includes(q));

  const icono = { fontSize: 18 };

  return (
    <>
      <MensajeRuta />
      <BarraSuperior titulo="Mis servicios" />
      <Box sx={{ bgcolor: "background.paper", borderBottom: 1, borderColor: "divider" }}>
        <Tabs value={filtro} onChange={(_, v) => setFiltro(v)} variant="fullWidth">
          <Tab value="todos" label="Todos" />
          <Tab value="curso" label="En curso" />
          <Tab value="finalizados" label="Finalizados" />
        </Tabs>
      </Box>
      <Contenido>
        <TextField
          placeholder="Buscar por número, placa o cliente"
          value={buscar}
          onChange={(e) => setBuscar(e.target.value)}
          size="small"
          sx={{ bgcolor: "background.paper" }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment> } }}
        />
        {cargando && <Cargando />}
        {error && <ErrorCarga mensaje={error} onReintentar={recargar} />}
        {datos && visibles.length === 0 && (
          <Typography color="text.secondary" sx={{ textAlign: "center", py: 6 }}>
            No hay servicios para mostrar.
          </Typography>
        )}
        <Stack spacing={1.5}>
          {visibles.map((s) => (
            <Card key={s.id}>
              <CardActionArea onClick={() => navigate(`/app/servicios/${s.id}`)} sx={{ p: 1.5 }}>
                <Stack sx={{ alignItems: "center" }} direction="row" spacing={1}>
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
                      <Typography sx={{ fontWeight: 700 }}>#{s.numero_orden}</Typography>
                      <EstadoServicio estado={s.estado} />
                    </Stack>
                    <Linea icono={<EventIcon sx={icono} />}>
                      {formatoFecha(s.fecha_servicio)}
                      {s.inicio_servicio ? ` · ${formatoHora(s.inicio_servicio)}` : ""}
                    </Linea>
                    <Linea icono={<PersonIcon sx={icono} />}>{s.cliente_nombre}</Linea>
                    <Linea icono={<DirectionsBusIcon sx={icono} />}>
                      {s.placa_vehiculo} · {s.tipo_vehiculo}
                    </Linea>
                    <Linea icono={<LocalShippingIcon sx={icono} />}>Grúa {s.grua_numero}</Linea>
                  </Box>
                  <ChevronRightIcon color="action" />
                </Stack>
              </CardActionArea>
            </Card>
          ))}
        </Stack>
      </Contenido>

      {turno && (
        <Fab
          color="primary"
          aria-label="Nuevo servicio"
          onClick={() => navigate("/app/servicios/nuevo")}
          sx={{ position: "fixed", bottom: 84, right: "max(16px, calc(50vw - 224px))" }}
        >
          <AddIcon />
        </Fab>
      )}
    </>
  );
}
