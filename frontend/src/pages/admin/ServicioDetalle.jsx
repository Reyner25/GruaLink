/**
 * Detalle de un servicio para el administrador / financiero.
 *
 * Muestra todo el servicio (incluidos los valores en $), el pago al operador,
 * el historial (bitácora) y las acciones según el estado y los permisos.
 * El financiero solo ve (no tiene los permisos de las acciones).
 *
 * Las piezas están en components/admin/servicio/:
 *   AccionesServicio (botones + diálogos) · DatosServicio / TiemposServicio ·
 *   ValoresServicio · PagoOperadorPanel · BitacoraServicio
 */
import { useState } from "react";
import { useParams } from "react-router-dom";
import { Alert, Card, CardContent, Grid, Snackbar, Stack, Typography } from "@mui/material";
import { useAuth } from "../../context/AuthContext";
import { useCargar } from "../../hooks/useCargar";
import { obtenerServicioDetalle } from "../../api/servicios.api";
import { obtenerCatalogos } from "../../api/catalogos.api";
import { puede } from "../../utils/roles";
import { formatoFecha, sinKilometros } from "../../utils/formato";
import { EncabezadoPagina, Panel } from "../../components/admin/Comunes";
import { Cargando, ErrorCarga, EstadoServicio } from "../../components/operador/Comunes";
import AccionesServicio from "../../components/admin/servicio/AccionesServicio";
import BitacoraServicio from "../../components/admin/servicio/BitacoraServicio";
import { DatosServicio, TiemposServicio } from "../../components/admin/servicio/DatosServicio";
import PagoOperadorPanel from "../../components/admin/servicio/PagoOperadorPanel";
import ValoresServicio from "../../components/admin/servicio/ValoresServicio";

export default function ServicioDetalle() {
  const { id } = useParams();
  const { usuario } = useAuth();
  const detalle = useCargar(() => obtenerServicioDetalle(id), [id]);
  const catalogos = useCargar(obtenerCatalogos, []);
  const [aviso, setAviso] = useState(null);
  const [version, setVersion] = useState(0); // al cambiar, se recarga la bitácora
  const [errorAccion, setErrorAccion] = useState("");

  if (detalle.cargando && !detalle.datos) return <Cargando />;
  if (detalle.error) return <ErrorCarga mensaje={detalle.error} onReintentar={detalle.recargar} />;

  const { servicio: s, conceptos, pago_operador: pago } = detalle.datos;
  const revisable = ["finalizado", "en_revision"].includes(s.estado);

  function terminar(mensaje) {
    setAviso(mensaje);
    setVersion((v) => v + 1);
    detalle.recargar();
  }

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
        acciones={<AccionesServicio servicio={s} conceptos={conceptos} catalogos={catalogos.datos} onListo={terminar} onError={setErrorAccion} />}
      />
      {errorAccion && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErrorAccion("")}>
          {errorAccion}
        </Alert>
      )}
      {revisable && sinKilometros(s) && (
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
            <DatosServicio servicio={s} />
            <TiemposServicio servicio={s} />
            <ValoresServicio servicio={s} conceptos={conceptos} />
            {pago && <PagoOperadorPanel pago={pago} operador={s.operador_nombre} />}
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          {puede(usuario, "bitacora:ver") ? (
            <Panel titulo="Historial (bitácora)">
              <BitacoraServicio
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

      <Snackbar open={Boolean(aviso)} autoHideDuration={4000} onClose={() => setAviso(null)} anchorOrigin={{ vertical: "top", horizontal: "center" }}>
        <Alert severity="success" variant="filled" onClose={() => setAviso(null)}>
          {aviso}
        </Alert>
      </Snackbar>
    </>
  );
}
