import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Container,
  Stack,
  Step,
  StepLabel,
  Stepper,
  Typography,
} from "@mui/material";
import { obtenerCatalogos } from "../api/catalogos.api";
import { crearServicio } from "../api/servicios.api";
import LayoutPrincipal from "../layouts/LayoutPrincipal";
import PasoCliente from "../components/ordenes/PasoCliente";
import PasoVehiculo from "../components/ordenes/PasoVehiculo";
import PasoResumen from "../components/ordenes/PasoResumen";
import { FECHA_HOY } from "../utils/opciones";

const PASOS = ["Cliente", "Vehículo", "Resumen"];

const FORM_INICIAL = {
  cliente_id: "",
  grua_id: "",
  fecha_servicio: FECHA_HOY(),
  tipo_vehiculo_id: "",
  placa_vehiculo: "",
  numero_vehiculo: "",
  origen: "",
  destino: "",
  km_vacio: "",
  km_servicio: "",
  observaciones: "",
};

// Valida solo los campos del paso indicado
function validarPaso(paso, form) {
  const e = {};
  if (paso === 0) {
    if (!form.cliente_id) e.cliente_id = "Seleccione un cliente";
    if (!form.grua_id) e.grua_id = "Seleccione una grúa";
    if (!form.fecha_servicio) e.fecha_servicio = "La fecha es obligatoria";
  }
  if (paso === 1) {
    if (!form.tipo_vehiculo_id)
      e.tipo_vehiculo_id = "Seleccione el tipo de vehículo";
    if (!form.placa_vehiculo.trim())
      e.placa_vehiculo = "La placa es obligatoria";
    if (form.km_servicio === "" || Number(form.km_servicio) < 0)
      e.km_servicio = "Ingrese los kilómetros del servicio (0 o más)";
    if (form.km_vacio !== "" && Number(form.km_vacio) < 0)
      e.km_vacio = "No puede ser negativo";
  }
  return e;
}

export default function OrdenServicioPage() {
  const [catalogos, setCatalogos] = useState(null);
  const [paso, setPaso] = useState(0);
  const [form, setForm] = useState(FORM_INICIAL);
  const [errores, setErrores] = useState({});
  const [mensaje, setMensaje] = useState(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    obtenerCatalogos()
      .then(setCatalogos)
      .catch(() =>
        setMensaje({
          tipo: "error",
          texto: "No se pudieron cargar los catálogos",
        }),
      );
  }, []);

  const cambiar = (campo) => (e) => {
    setForm((prev) => ({ ...prev, [campo]: e.target.value }));
    setErrores((prev) => ({ ...prev, [campo]: undefined }));
  };

  function siguiente() {
    const nuevos = validarPaso(paso, form);
    setErrores(nuevos);
    if (Object.keys(nuevos).length === 0) setPaso((p) => p + 1);
  }

  function anterior() {
    setErrores({});
    setPaso((p) => p - 1);
  }

  async function guardar() {
    setMensaje(null);
    setEnviando(true);
    try {
      const payload = {
        cliente_id: Number(form.cliente_id),
        grua_id: Number(form.grua_id),
        tipo_vehiculo_id: Number(form.tipo_vehiculo_id),
        placa_vehiculo: form.placa_vehiculo.trim().toUpperCase(),
        numero_vehiculo: form.numero_vehiculo.trim() || null,
        fecha_servicio: form.fecha_servicio,
        origen: form.origen.trim() || null,
        destino: form.destino.trim() || null,
        km_vacio: form.km_vacio === "" ? 0 : Number(form.km_vacio),
        km_servicio: Number(form.km_servicio),
        observaciones: form.observaciones.trim() || null,
      };
      const { regla } = await crearServicio(payload);
      setMensaje({
        tipo: "success",
        texto: `Orden registrada. Regla aplicada: ${regla}`,
      });
      setForm({ ...FORM_INICIAL, fecha_servicio: form.fecha_servicio });
      setPaso(0);
    } catch (err) {
      setMensaje({
        tipo: "error",
        texto: err.response?.data?.error || "No fue posible registrar la orden",
      });
    } finally {
      setEnviando(false);
    }
  }

  if (!catalogos) {
    return (
      <LayoutPrincipal>
        <Box sx={{ display: "grid", placeItems: "center", py: 8 }}>
          {mensaje ? (
            <Alert severity={mensaje.tipo}>{mensaje.texto}</Alert>
          ) : (
            <CircularProgress />
          )}
        </Box>
      </LayoutPrincipal>
    );
  }

  return (
    <LayoutPrincipal>
      <Container maxWidth="sm" sx={{ py: 2 }}>
        <Typography variant="h6" gutterBottom>
          Nuevo servicio
        </Typography>

        <Stepper activeStep={paso} alternativeLabel sx={{ mb: 3 }}>
          {PASOS.map((texto) => (
            <Step key={texto}>
              <StepLabel>{texto}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {mensaje && (
          <Alert severity={mensaje.tipo} sx={{ mb: 2 }}>
            {mensaje.texto}
          </Alert>
        )}

        <Card>
          <CardContent sx={{ p: 3 }}>
            {paso === 0 && (
              <PasoCliente
                form={form}
                catalogos={catalogos}
                errores={errores}
                onChange={cambiar}
              />
            )}
            {paso === 1 && (
              <PasoVehiculo
                form={form}
                catalogos={catalogos}
                errores={errores}
                onChange={cambiar}
              />
            )}
            {paso === 2 && <PasoResumen form={form} catalogos={catalogos} />}

            <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
              <Button
                variant="outlined"
                onClick={anterior}
                disabled={paso === 0 || enviando}
                fullWidth
              >
                Atrás
              </Button>
              {paso < PASOS.length - 1 ? (
                <Button variant="contained" onClick={siguiente} fullWidth>
                  Siguiente
                </Button>
              ) : (
                <Button
                  variant="contained"
                  onClick={guardar}
                  disabled={enviando}
                  fullWidth
                >
                  {enviando ? "Guardando…" : "Confirmar y guardar"}
                </Button>
              )}
            </Stack>
          </CardContent>
        </Card>
      </Container>
    </LayoutPrincipal>
  );
}
