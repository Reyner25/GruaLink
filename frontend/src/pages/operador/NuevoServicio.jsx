/**
 * Registro de un nuevo servicio, en 4 pasos:
 *   1. Cliente   2. Vehículo   3. Servicio   4. Resumen y confirmación
 *
 * - Se valida cada paso antes de avanzar (y el backend vuelve a validar todo).
 * - El borrador se guarda en el celular: si se cierra la app o se pierde la
 *   señal, al volver el formulario sigue lleno.
 * - El operador NO envía: número de orden, grúa, operador, estado ni valores.
 *   El backend los pone (la grúa sale del turno activo).
 * - Al guardar, se ofrece finalizar el servicio de una vez (paso operativo).
 */
import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Alert, Button, Card, CardContent, Stack, Typography } from "@mui/material";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { useAuth } from "../../context/AuthContext";
import { useTurno } from "../../context/TurnoContext";
import { useCargar } from "../../hooks/useCargar";
import { obtenerCatalogos } from "../../api/catalogos.api";
import { crearServicio } from "../../api/servicios.api";
import { aInputFechaHora, deInputFechaHora, erroresPorCampo, hoy, mensajeError } from "../../utils/formato";
import { BarraAcciones, BarraSuperior, Cargando, Contenido, ErrorCarga } from "../../components/operador/Comunes";
import { IndicadorPasos, PasoCliente, PasoResumen, PasoServicio, PasoVehiculo } from "../../components/operador/PasosServicio";

const PASOS = ["Cliente", "Vehículo", "Servicio", "Resumen"];

// En qué paso está cada campo (para llevar al operador al error que devolvió el servidor)
const PASO_DE_CAMPO = {
  cliente_id: 0,
  tipo_vehiculo_id: 1,
  tipo_vehiculo_otro: 1,
  placa_vehiculo: 1,
  numero_vehiculo: 1,
  fecha_servicio: 2,
  hora_solicitud: 2,
  tipo_servicio_id: 2,
  inicio_servicio: 2,
};

const formularioVacio = () => ({
  cliente_id: null,
  tipo_vehiculo_id: null,
  placa_vehiculo: "",
  numero_vehiculo: "",
  obs_vehiculo: "",
  fecha_servicio: hoy(),
  hora_solicitud: aInputFechaHora(),
  tipo_servicio_id: null,
  tipo_vehiculo_otro: "", // solo si el tipo de vehículo es "Otro"
  origen: "",
  destino: "",
  inicio_servicio: "",
  obs_servicio: "",
});

// ---- Borrador en el celular (localStorage). Si falla, la app sigue funcionando. ----
const claveBorrador = (usuarioId) => `grualink_borrador_servicio_${usuarioId}`;
function leerBorrador(usuarioId) {
  try {
    const texto = localStorage.getItem(claveBorrador(usuarioId));
    return texto ? { ...formularioVacio(), ...JSON.parse(texto) } : null;
  } catch {
    return null;
  }
}
// Solo vale la pena guardar si el operador ya escribió algo importante
const tieneDatos = (f) => Boolean(f.cliente_id || f.tipo_vehiculo_id || f.placa_vehiculo.trim());

function guardarBorrador(usuarioId, form) {
  try {
    if (!tieneDatos(form)) return localStorage.removeItem(claveBorrador(usuarioId));
    localStorage.setItem(claveBorrador(usuarioId), JSON.stringify(form));
  } catch {
    /* sin espacio o modo privado: se ignora */
  }
}
function borrarBorrador(usuarioId) {
  try {
    localStorage.removeItem(claveBorrador(usuarioId));
  } catch {
    /* se ignora */
  }
}

// Validación del lado del celular (rápida, para no esperar al servidor)
function validarPaso(paso, form, { fechaMinima, catalogos }) {
  const e = {};
  if (paso === 0 && !form.cliente_id) e.cliente_id = "Seleccione un cliente";
  if (paso === 1) {
    const tipo = catalogos.tipos.find((t) => t.id === form.tipo_vehiculo_id);
    if (!form.tipo_vehiculo_id) e.tipo_vehiculo_id = "Seleccione el tipo de vehículo";
    else if (tipo?.es_otro && form.tipo_vehiculo_otro.trim().length < 2)
      e.tipo_vehiculo_otro = "Escriba qué tipo de vehículo es";
    const placa = form.placa_vehiculo.replace(/[\s-]/g, "");
    if (!/^[A-Za-z0-9]{3,10}$/.test(placa)) e.placa_vehiculo = "Placa inválida (solo letras y números)";
  }
  if (paso === 2) {
    if (!form.fecha_servicio) e.fecha_servicio = "La fecha es obligatoria";
    else if (form.fecha_servicio < fechaMinima || form.fecha_servicio > hoy())
      e.fecha_servicio = "Debe estar entre el inicio de tu turno y hoy";
    if (!form.tipo_servicio_id) e.tipo_servicio_id = "Seleccione el tipo de servicio";
    const ahora = Date.now() + 10 * 60000;
    if (form.hora_solicitud && new Date(form.hora_solicitud) > ahora) e.hora_solicitud = "No puede estar en el futuro";
    if (form.inicio_servicio && new Date(form.inicio_servicio) > ahora) e.inicio_servicio = "No puede estar en el futuro";
    if (form.hora_solicitud && form.inicio_servicio && form.inicio_servicio < form.hora_solicitud)
      e.inicio_servicio = "Es anterior a la hora de solicitud";
  }
  return e;
}

// Arma lo que se envía a la API (solo los campos que el backend acepta)
function armarPayload(form) {
  const observaciones = [
    form.obs_vehiculo.trim() && `Vehículo: ${form.obs_vehiculo.trim()}`,
    form.obs_servicio.trim() && form.obs_servicio.trim(),
  ]
    .filter(Boolean)
    .join("\n");
  return {
    cliente_id: form.cliente_id,
    tipo_vehiculo_id: form.tipo_vehiculo_id,
    tipo_vehiculo_otro: form.tipo_vehiculo_otro.trim() || null, // el servidor lo ignora si no es "Otro"
    tipo_servicio_id: form.tipo_servicio_id,
    placa_vehiculo: form.placa_vehiculo,
    numero_vehiculo: form.numero_vehiculo.trim() || null,
    fecha_servicio: form.fecha_servicio,
    hora_solicitud: deInputFechaHora(form.hora_solicitud),
    inicio_servicio: deInputFechaHora(form.inicio_servicio),
    origen: form.origen.trim() || null,
    destino: form.destino.trim() || null,
    // es_rescate ya no se envía: el servidor lo deduce del tipo de servicio
    observaciones: observaciones || null,
  };
}

export default function NuevoServicio() {
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const { turno, cargando: cargandoTurno } = useTurno();
  const { datos: catalogos, cargando, error, recargar } = useCargar(obtenerCatalogos, []);

  const [paso, setPaso] = useState(0);
  const [form, setForm] = useState(() => leerBorrador(usuario.id) || formularioVacio());
  const [hayBorrador] = useState(() => Boolean(leerBorrador(usuario.id)));
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState("");
  const [creado, setCreado] = useState(null);

  // Guarda el borrador cada vez que cambia algo
  useEffect(() => {
    if (!creado) guardarBorrador(usuario.id, form);
  }, [form, creado, usuario.id]);

  // Al cambiar de paso, volver arriba
  // OJO: con llaves { } para que el efecto NO devuelva nada.
  // Si un useEffect devuelve algo que no es una función, React falla y la
  // página queda en blanco (fue el error de esta pantalla).
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [paso]);

  if (cargandoTurno) return <Cargando />;
  if (!turno && !creado) return <Navigate to="/app" replace />;

  const fechaMinima = turno ? new Date(turno.inicio).toLocaleDateString("en-CA", { timeZone: "America/Bogota" }) : hoy();

  function cambiar(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
    setErrores((e) => ({ ...e, [campo]: undefined }));
  }

  function siguiente() {
    const e = validarPaso(paso, form, { fechaMinima, catalogos });
    setErrores(e);
    if (Object.keys(e).length === 0) setPaso((p) => p + 1);
  }

  function descartarBorrador() {
    borrarBorrador(usuario.id);
    setForm(formularioVacio());
    setPaso(0);
    setErrores({});
  }

  async function guardar() {
    setEnviando(true);
    setErrorEnvio("");
    try {
      const { servicio } = await crearServicio(armarPayload(form));
      borrarBorrador(usuario.id);
      setCreado(servicio);
    } catch (err) {
      const porCampo = erroresPorCampo(err);
      setErrores(porCampo);
      setErrorEnvio(mensajeError(err));
      // Llevar al primer paso que tiene un error
      const pasosConError = Object.keys(porCampo).map((c) => PASO_DE_CAMPO[c]).filter((p) => p !== undefined);
      if (pasosConError.length) setPaso(Math.min(...pasosConError));
    } finally {
      setEnviando(false);
    }
  }

  // ---------- Pantalla de confirmación ----------
  if (creado) {
    return (
      <>
        <BarraSuperior titulo="Servicio registrado" />
        <Contenido>
          <Card>
            <CardContent>
              <Stack spacing={1} sx={{ alignItems: "center", py: 2 }}>
                <CheckCircleIcon color="success" sx={{ fontSize: 64 }} />
                <Typography variant="h6">Orden #{creado.numero_orden}</Typography>
                <Typography sx={{ textAlign: "center" }} color="text.secondary">
                  {creado.cliente_nombre} · {creado.placa_vehiculo}
                </Typography>
                <Typography sx={{ textAlign: "center" }} variant="body2" color="text.secondary">
                  El servicio quedó en estado «En servicio». Cuando termines, regístralo como finalizado.
                </Typography>
              </Stack>
            </CardContent>
          </Card>
          <Button variant="contained" size="large" endIcon={<ArrowForwardIcon />} onClick={() => navigate(`/app/servicios/${creado.id}/finalizar`)}>
            Finalizar servicio ahora
          </Button>
          <Button variant="outlined" size="large" onClick={() => navigate("/app")}>
            Volver al inicio
          </Button>
        </Contenido>
      </>
    );
  }

  return (
    <>
      <BarraSuperior titulo={`Nuevo servicio · Paso ${paso + 1} de ${PASOS.length}`} atras="/app" />
      <IndicadorPasos pasos={PASOS} actual={paso} />

      {cargando && <Cargando texto="Cargando listas…" />}
      {error && (
        <Contenido>
          <ErrorCarga mensaje={error} onReintentar={recargar} />
        </Contenido>
      )}

      {catalogos && (
        <Contenido>
          {hayBorrador && paso === 0 && (
            <Alert
              severity="info"
              action={
                <Button color="inherit" size="small" onClick={descartarBorrador}>
                  Descartar
                </Button>
              }
            >
              Recuperamos el servicio que estabas llenando.
            </Alert>
          )}

          {paso === 0 && <PasoCliente form={form} cambiar={cambiar} errores={errores} catalogos={catalogos} />}
          {paso === 1 && <PasoVehiculo form={form} cambiar={cambiar} errores={errores} catalogos={catalogos} />}
          {paso === 2 && (
            <PasoServicio form={form} cambiar={cambiar} errores={errores} catalogos={catalogos} fechaMinima={fechaMinima} fechaMaxima={hoy()} />
          )}
          {paso === 3 && <PasoResumen form={form} catalogos={catalogos} turno={turno} />}

          {errorEnvio && <Alert severity="error">{errorEnvio}</Alert>}
        </Contenido>
      )}

      <BarraAcciones>
        <Button variant="outlined" size="large" sx={{ flex: 1 }} disabled={paso === 0 || enviando} onClick={() => setPaso((p) => p - 1)}>
          Atrás
        </Button>
        {paso < PASOS.length - 1 ? (
          <Button variant="contained" size="large" sx={{ flex: 2 }} disabled={!catalogos} onClick={siguiente} endIcon={<ArrowForwardIcon />}>
            Siguiente
          </Button>
        ) : (
          <Button variant="contained" size="large" sx={{ flex: 2 }} disabled={enviando} onClick={guardar}>
            {enviando ? "Guardando…" : "Confirmar y guardar"}
          </Button>
        )}
      </BarraAcciones>
    </>
  );
}
