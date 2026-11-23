/**
 * Detalle de un servicio para el administrador / financiero.
 *
 * Muestra todo el servicio (incluidos los valores en $) y, según el estado,
 * las acciones del administrador:
 *   abierto ............ Corregir datos · Anular
 *   finalizado ......... Pasar a revisión · Corregir · Aprobar · Anular
 *   en revisión ........ Corregir · Aprobar · Devolver a finalizado · Anular
 *   aprobado ........... Reabrir (vuelve a revisión) · Anular — ambos con motivo
 *   anulado ............ (sin acciones: queda cerrado)
 * En todos los estados: descargar la orden en PDF.
 * El financiero solo ve (no tiene los permisos de las acciones).
 */
import { useState } from "react";
import { useParams } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Grid,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import VerifiedIcon from "@mui/icons-material/Verified";
import BlockIcon from "@mui/icons-material/Block";
import RateReviewIcon from "@mui/icons-material/RateReview";
import UndoIcon from "@mui/icons-material/Undo";
import LockOpenIcon from "@mui/icons-material/LockOpen";
import { useAuth } from "../../context/AuthContext";
import { useCargar } from "../../hooks/useCargar";
import { obtenerServicioDetalle } from "../../api/servicios.api";
import { obtenerCatalogos } from "../../api/catalogos.api";
import { cambiarEstadoServicio, consultarBitacora } from "../../api/admin.api";
import { puede } from "../../utils/roles";
import {
  cantidadConUnidad,
  duracion,
  ESTADOS_ABIERTOS,
  formatoFecha,
  formatoFechaHora,
  formatoMoneda,
  formatoNumero,
  mensajeError,
} from "../../utils/formato";
import { EncabezadoPagina, Panel } from "../../components/admin/Comunes";
import BotonExportar from "../../components/admin/BotonExportar";
import { DialogoAprobar, DialogoCorregir, DialogoMotivo } from "../../components/admin/DialogosServicio";
import { Cargando, ErrorCarga, EstadoServicio } from "../../components/operador/Comunes";

/**
 * Pago al operador: cómo se calculó cada parte (reglas de Tarifas → "Pago a
 * operadores"). Provisional hasta que el servicio se aprueba.
 */
function PagoOperador({ pago, operador }) {
  return (
    <Panel
      titulo="Pago al operador"
      accion={
        pago.anulado ? (
          <Chip size="small" label="Anulado: no se paga" />
        ) : (
          <Chip size="small" label={pago.provisional ? "Provisional (sin aprobar)" : "Definitivo (aprobado)"} color={pago.provisional ? "warning" : "success"} />
        )
      }
    >
      <Table size="small">
        <TableHead>
          <TableRow sx={{ "& th": { fontWeight: 700 } }}>
            <TableCell>Parte</TableCell>
            <TableCell>Regla</TableCell>
            <TableCell align="right">Base</TableCell>
            <TableCell align="right">Pago</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {pago.detalle.map((d, i) => (
            <TableRow key={i}>
              <TableCell>{d.parte}</TableCell>
              <TableCell>{d.regla}</TableCell>
              <TableCell align="right">{d.base === null ? "—" : formatoMoneda(d.base)}</TableCell>
              <TableCell align="right">{formatoMoneda(d.pago)}</TableCell>
            </TableRow>
          ))}
          <TableRow sx={{ "& td": { fontWeight: 700 } }}>
            <TableCell colSpan={3}>Total para {operador}</TableCell>
            <TableCell align="right">{formatoMoneda(pago.valor)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </Panel>
  );
}

/** Par "etiqueta: valor" en dos columnas. */
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

const OPERACIONES = {
  crear: "Creado",
  finalizar: "Finalizado por el operador",
  actualizar: "Cambio de estado",
  autorizar_correccion: "Corrección",
  aprobar: "Aprobado",
  anular: "Anulado",
  reabrir: "Reabierto (se quitó la aprobación)",
};

// Nombres legibles para los campos que aparecen en la bitácora
const CAMPOS = {
  estado: "Estado",
  km_vacio: "Km en vacío",
  km_servicio: "Km en servicio",
  km_facturables: "Km facturables",
  valor_tarifa_basica: "Tarifa básica",
  valor_conceptos: "Conceptos",
  valor_calculado: "Valor calculado",
  valor_aprobado: "Valor aprobado",
  placa_vehiculo: "Placa",
  numero_vehiculo: "N.º vehículo",
  origen: "Origen",
  destino: "Destino",
  conceptos: "Trabajos adicionales",
};
const ES_DINERO = ["valor_tarifa_basica", "valor_conceptos", "valor_calculado", "valor_aprobado"];

const ES_NUMERO = ["km_vacio", "km_servicio", "km_facturables"];

// nombres: { concepto_id: "Desmontar cardán" } para mostrar nombres en vez de números
function valorLegible(campo, v, nombres = {}) {
  if (v === null || v === undefined) return "—";
  if (ES_DINERO.includes(campo)) return formatoMoneda(v);
  if (ES_NUMERO.includes(campo)) return formatoNumero(v);
  if (campo === "conceptos")
    return v.map((c) => `${nombres[c.concepto_id] || `#${c.concepto_id}`} × ${formatoNumero(c.cantidad)}`).join(", ") || "ninguno";
  return String(v);
}

function Bitacora({ servicioId, version, nombresConceptos }) {
  const { datos, cargando, error } = useCargar(() => consultarBitacora({ entidad: "servicios", registro_id: servicioId, limite: 100 }), [servicioId, version]);
  if (cargando && !datos) return <Cargando />;
  if (error) return <Alert severity="error">{error}</Alert>;
  return (
    <Stack spacing={2} divider={<Divider flexItem />}>
      {(datos || []).map((b) => {
        const cambios = b.operacion === "crear" || b.operacion === "finalizar" ? [] : Object.keys(b.valores_nuevos || {}).filter((c) => CAMPOS[c]);
        return (
          <Box key={b.id}>
            <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap" }}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {OPERACIONES[b.operacion] || b.operacion}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {formatoFechaHora(b.creado_en)} · {b.usuario_nombre || "Sistema"}
              </Typography>
            </Stack>
            {b.motivo && (
              <Typography variant="body2" color="text.secondary">
                Motivo: {b.motivo}
              </Typography>
            )}
            {cambios.map((c) => (
              <Typography key={c} variant="caption" component="div">
                {CAMPOS[c]}: {valorLegible(c, b.valores_anteriores?.[c], nombresConceptos)} →{" "}
                <b>{valorLegible(c, b.valores_nuevos[c], nombresConceptos)}</b>
              </Typography>
            ))}
          </Box>
        );
      })}
    </Stack>
  );
}

export default function ServicioDetalle() {
  const { id } = useParams();
  const { usuario } = useAuth();
  const detalle = useCargar(() => obtenerServicioDetalle(id), [id]);
  const catalogos = useCargar(obtenerCatalogos, []);
  const [dialogo, setDialogo] = useState(null); // "corregir" | "aprobar" | "anular" | "devolver" | "reabrir"
  const [aviso, setAviso] = useState(null);
  const [version, setVersion] = useState(0);
  const [errorAccion, setErrorAccion] = useState("");

  if (detalle.cargando && !detalle.datos) return <Cargando />;
  if (detalle.error) return <ErrorCarga mensaje={detalle.error} onReintentar={detalle.recargar} />;

  const { servicio: s, conceptos, pago_operador: pago } = detalle.datos;
  const abierto = ESTADOS_ABIERTOS.includes(s.estado);
  const revisable = ["finalizado", "en_revision"].includes(s.estado);
  const aprobado = s.estado === "aprobado";
  const cerradoDefinitivo = aprobado || s.estado === "anulado";
  const puedeCambiarEstado = puede(usuario, "servicios:cambiar_estado");

  function terminar(mensaje) {
    setDialogo(null);
    setAviso(mensaje);
    setVersion((v) => v + 1);
    detalle.recargar();
  }

  async function pasarARevision() {
    setErrorAccion("");
    try {
      await cambiarEstadoServicio(s.id, "en_revision");
      terminar("El servicio pasó a revisión");
    } catch (err) {
      setErrorAccion(mensajeError(err));
    }
  }

  const accionesRevision = !cerradoDefinitivo && (
    <>
      {s.estado === "finalizado" && puede(usuario, "servicios:cambiar_estado") && (
        <Button startIcon={<RateReviewIcon />} onClick={pasarARevision}>
          Pasar a revisión
        </Button>
      )}
      {s.estado === "en_revision" && puede(usuario, "servicios:cambiar_estado") && (
        <Button startIcon={<UndoIcon />} onClick={() => setDialogo("devolver")}>
          Devolver
        </Button>
      )}
      {puede(usuario, "servicios:corregir") && (
        <Button variant="outlined" startIcon={<EditIcon />} onClick={() => setDialogo("corregir")} disabled={!catalogos.datos}>
          Corregir
        </Button>
      )}
      {revisable && puede(usuario, "servicios:aprobar") && (
        <Button variant="contained" color="success" startIcon={<VerifiedIcon />} onClick={() => setDialogo("aprobar")}>
          Aprobar
        </Button>
      )}
      {puede(usuario, "servicios:cambiar_estado") && (
        <Button color="error" startIcon={<BlockIcon />} onClick={() => setDialogo("anular")}>
          Anular
        </Button>
      )}
    </>
  );

  // Aprobado: solo el administrador puede reabrirlo o anularlo (con motivo)
  const accionesAprobado = aprobado && puedeCambiarEstado && (
    <>
      <Button startIcon={<LockOpenIcon />} onClick={() => setDialogo("reabrir")}>
        Reabrir
      </Button>
      <Button color="error" startIcon={<BlockIcon />} onClick={() => setDialogo("anular")}>
        Anular
      </Button>
    </>
  );

  // El PDF de la orden se puede descargar siempre (también aprobados y anulados)
  const acciones = (
    <>
      <BotonExportar reporte={`ordenes/${s.id}`} tipo="pdf" texto="Orden en PDF" variant="outlined" />
      {accionesRevision}
      {accionesAprobado}
    </>
  );

  const sinKm = Number(s.km_servicio) === 0 && Number(s.km_vacio) === 0;
  const reaccion = s.hora_solicitud && s.inicio_servicio ? duracion(s.hora_solicitud, s.inicio_servicio) : null;

  return (
    <>
      <EncabezadoPagina
        titulo={
          <Stack direction="row" spacing={1.5} component="span" sx={{ alignItems: "center" }}>
            <span>Orden #{s.numero_orden}</span>
            <EstadoServicio estado={s.estado} size="medium" />
          </Stack>
        }
        descripcion={`${s.cliente_nombre} · ${s.placa_vehiculo} · ${formatoFecha(s.fecha_servicio)}`}
        migas={[{ texto: "Servicios", ruta: "/admin/servicios" }, { texto: `#${s.numero_orden}` }]}
        acciones={acciones}
      />
      {errorAccion && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErrorAccion("")}>
          {errorAccion}
        </Alert>
      )}
      {revisable && sinKm && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Este servicio no tiene kilómetros registrados. Los km los carga el administrador con <b>Corregir</b>; el valor se recalcula solo.
        </Alert>
      )}
      {revisable && s.valor_calculado === null && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Servicio <b>a convenir</b> (rescate o vehículo "Otro"): el valor se define al aprobar.
        </Alert>
      )}

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Stack spacing={2}>
            <Panel titulo="Datos del servicio">
              <Grid container columnSpacing={3}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Dato etiqueta="Cliente">
                    {s.cliente_nombre} <Typography variant="caption" color="text.secondary">NIT {s.cliente_nit}</Typography>
                  </Dato>
                  <Dato etiqueta="Vehículo">
                    {s.placa_vehiculo} · {s.tipo_vehiculo}
                    {s.numero_vehiculo ? ` · N.º ${s.numero_vehiculo}` : ""}
                  </Dato>
                  <Dato etiqueta="Tipo de servicio">
                    {s.tipo_servicio}
                  </Dato>
                  <Dato etiqueta="Origen">{s.origen}</Dato>
                  <Dato etiqueta="Destino">{s.destino}</Dato>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Dato etiqueta="Operador">{s.operador_nombre}</Dato>
                  <Dato etiqueta="Grúa">
                    {s.grua_numero} · {s.grua_placa}
                  </Dato>
                  <Dato etiqueta="Fecha del servicio">{formatoFecha(s.fecha_servicio)}</Dato>
                  <Dato etiqueta="Registrado">{formatoFechaHora(s.creado_en)}</Dato>
                  <Dato etiqueta="Observaciones">
                    <span style={{ whiteSpace: "pre-line" }}>{s.observaciones}</span>
                  </Dato>
                </Grid>
              </Grid>
            </Panel>

            <Panel titulo="Tiempos, kilómetros y entrega">
              <Grid container columnSpacing={3}>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <Dato etiqueta="Hora de solicitud">{formatoFechaHora(s.hora_solicitud)}</Dato>
                  <Dato etiqueta="Inicio">{formatoFechaHora(s.inicio_servicio)}</Dato>
                  <Dato etiqueta="Fin">{formatoFechaHora(s.fin_servicio)}</Dato>
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <Dato etiqueta="Tiempo de reacción">{reaccion}</Dato>
                  <Dato etiqueta="Duración del servicio">{s.inicio_servicio && s.fin_servicio ? duracion(s.inicio_servicio, s.fin_servicio) : null}</Dato>
                  <Dato etiqueta="Kilómetros">
                    {sinKm ? <Chip size="small" color="warning" label="Sin registrar" /> : `${formatoNumero(s.km_vacio)} vacío · ${formatoNumero(s.km_servicio)} servicio`}
                  </Dato>
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <Dato etiqueta="Entrega">{abierto ? null : s.entregado_sin_novedad ? "Sin novedad" : "Con novedad"}</Dato>
                  <Dato etiqueta="Recibe">{[s.recibe_nombre, s.recibe_documento].filter(Boolean).join(" · ")}</Dato>
                  <Dato etiqueta="Observaciones de entrega">{s.observaciones_entrega}</Dato>
                </Grid>
              </Grid>
            </Panel>

            <Panel titulo="Valores">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Concepto</TableCell>
                    <TableCell align="right">Cantidad</TableCell>
                    <TableCell align="right">Valor unitario</TableCell>
                    <TableCell align="right">Total</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <TableRow>
                    <TableCell>
                      Tarifa básica{" "}
                      <Typography variant="caption" color="text.secondary">
                        ({formatoNumero(s.km_facturables ?? 0)} km facturables)
                      </Typography>
                      {s.cliente_modalidad_cobro === "bolsa_km_mensual" && (
                        <Typography variant="caption" color="text.secondary" component="div">
                          {s.tarifa_bolsa_id && s.bolsa_km_mes === null
                            ? `Bolsa de km: mes abierto → columna PROVISIONAL 1.500–1.800 km (al terminar el mes se recalcula con la columna real)${
                                s.bolsa_forma === "por_km" ? ` · menos de 10 km: ${formatoMoneda(s.bolsa_valor)} por km` : ""
                              }`
                            : s.tarifa_bolsa_id
                            ? `Bolsa de km: ${formatoNumero(s.bolsa_km_mes)} km en el mes → columna ${formatoNumero(Math.floor(s.bolsa_columna_desde))}${
                                s.bolsa_columna_hasta === null ? " km o más" : `–${formatoNumero(s.bolsa_columna_hasta)} km`
                              }${s.bolsa_forma === "por_km" ? ` · menos de 10 km: ${formatoMoneda(s.bolsa_valor)} por km` : ""}`
                            : s.fuera_disponibilidad
                              ? "Fuera de la disponibilidad: tarifa de Clientes generales"
                              : "No va en la bolsa: tarifa de Clientes generales"}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">1</TableCell>
                    <TableCell align="right">{s.valor_tarifa_basica === null ? "A convenir" : formatoMoneda(s.valor_tarifa_basica)}</TableCell>
                    <TableCell align="right">{s.valor_tarifa_basica === null ? "—" : formatoMoneda(s.valor_tarifa_basica)}</TableCell>
                  </TableRow>
                  {conceptos.map((c) => (
                    <TableRow key={c.concepto_id}>
                      <TableCell>
                        {c.nombre}
                        {c.es_recargo_nocturno && (
                          <Typography variant="caption" color="text.secondary" component="div">
                            Automático: el servicio terminó en horario nocturno
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">{cantidadConUnidad(c.cantidad, c.unidad_cobro)}</TableCell>
                      <TableCell align="right">{formatoMoneda(c.valor_unitario)}</TableCell>
                      <TableCell align="right">{formatoMoneda(c.total)}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow sx={{ "& td": { fontWeight: 700 } }}>
                    <TableCell colSpan={3}>Valor calculado</TableCell>
                    <TableCell align="right">{s.valor_calculado === null ? "A convenir" : formatoMoneda(s.valor_calculado)}</TableCell>
                  </TableRow>
                  <TableRow sx={{ "& td": { fontWeight: 700, color: "success.main", borderBottom: 0 } }}>
                    <TableCell colSpan={3}>
                      Valor aprobado
                      {s.aprobado_en && (
                        <Typography variant="caption" color="text.secondary" component="div">
                          {formatoFechaHora(s.aprobado_en)}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">{formatoMoneda(s.valor_aprobado)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </Panel>

            {pago && <PagoOperador pago={pago} operador={s.operador_nombre} />}
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          {puede(usuario, "bitacora:ver") ? (
            <Panel titulo="Historial (bitácora)">
              <Bitacora
                servicioId={s.id}
                version={version}
                nombresConceptos={Object.fromEntries((catalogos.datos?.conceptos || []).map((c) => [c.id, c.nombre]))}
              />
            </Panel>
          ) : (
            <Card>
              <CardContent>
                <Typography color="text.secondary">El historial de cambios lo consulta el administrador.</Typography>
              </CardContent>
            </Card>
          )}
        </Grid>
      </Grid>

      {dialogo === "corregir" && catalogos.datos && (
        <DialogoCorregir
          abierto
          onCerrar={() => setDialogo(null)}
          onListo={terminar}
          servicio={s}
          conceptosActuales={conceptos}
          catalogoConceptos={catalogos.datos.conceptos}
        />
      )}
      {dialogo === "aprobar" && <DialogoAprobar abierto onCerrar={() => setDialogo(null)} onListo={terminar} servicio={s} />}
      {dialogo === "anular" && (
        <DialogoMotivo
          abierto
          onCerrar={() => setDialogo(null)}
          onListo={terminar}
          servicio={s}
          estado="anulado"
          titulo="Anular"
          textoBoton="Anular servicio"
          color="error"
          explicacion={
            aprobado
              ? `Este servicio ya está APROBADO por ${formatoMoneda(s.valor_aprobado)}. Al anularlo deja de sumar en los reportes. No se puede deshacer.`
              : "El servicio deja de sumar en los reportes. No se puede deshacer."
          }
        />
      )}
      {dialogo === "reabrir" && (
        <DialogoMotivo
          abierto
          onCerrar={() => setDialogo(null)}
          onListo={terminar}
          servicio={s}
          estado="en_revision"
          titulo="Reabrir"
          textoBoton="Reabrir servicio"
          color="warning"
          explicacion={`El servicio vuelve a "En revisión" y se quita la aprobación (${formatoMoneda(s.valor_aprobado)}). Luego podrá corregirlo y aprobarlo de nuevo. La aprobación anterior queda en la bitácora.`}
        />
      )}
      {dialogo === "devolver" && (
        <DialogoMotivo
          abierto
          onCerrar={() => setDialogo(null)}
          onListo={terminar}
          servicio={s}
          estado="finalizado"
          titulo="Devolver a finalizado"
          textoBoton="Devolver"
          obligatorio={false}
        />
      )}

      <Snackbar open={Boolean(aviso)} autoHideDuration={4000} onClose={() => setAviso(null)} anchorOrigin={{ vertical: "top", horizontal: "center" }}>
        <Alert severity="success" variant="filled" onClose={() => setAviso(null)}>
          {aviso}
        </Alert>
      </Snackbar>
    </>
  );
}
