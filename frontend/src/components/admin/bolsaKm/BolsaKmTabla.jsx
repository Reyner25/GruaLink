/**
 * Tarifas → "Bolsa de kilómetros": la tabla de los clientes que se cobran por
 * kilometraje mensual (Suma), igual que en el Excel.
 *
 *  - Clic en una celda (administrador) → cambiar forma y valor (DialogoCelda).
 *    Las celdas que ya cobraron servicios están bloqueadas (candado).
 *  - "Nueva vigencia": copia la tabla desde una fecha (ej. 2027) para cambiar
 *    valores sin tocar lo ya cobrado; la anterior se cierra el día antes.
 *  - "Editar vigencia": cambiar las fechas (sin uso: inicio y fin, o borrar;
 *    en uso: solo la fecha final).
 *  - Columna provisional: la que se usa mientras el mes está abierto.
 *  - "Tabla para otro cliente": copia esta tabla a un cliente nuevo por bolsa
 *    (después se ajustan sus valores y se cambia su modalidad en Clientes).
 *
 * Piezas: CuadriculaBolsa (la tabla), DialogoCelda, DialogosVigencia, textosBolsa.
 */
import { useState } from "react";
import { Alert, Button, Card, CardContent, MenuItem, Snackbar, Stack, TextField, Typography } from "@mui/material";
import LockIcon from "@mui/icons-material/Lock";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import EventIcon from "@mui/icons-material/Event";
import PersonAddIcon from "@mui/icons-material/PersonAddAlt";
import { useCargar } from "../../../hooks/useCargar";
import { cambiarProvisionalBolsa, clientesConBolsa, tablaBolsaKm } from "../../../api/admin.api";
import { mensajeError } from "../../../utils/formato";
import { Cargando, ErrorCarga } from "../../operador/Comunes";
import CuadriculaBolsa from "./CuadriculaBolsa";
import DialogoCelda from "./DialogoCelda";
import { DialogoEditarVigencia, DialogoNuevaVigencia, DialogoTablaOtroCliente } from "./DialogosVigencia";
import { kmDeColumna, n, textoColumna, textoVigencia } from "./textosBolsa";

export default function BolsaKmTabla({ editar }) {
  const clientes = useCargar(clientesConBolsa, []);
  const [clienteElegido, setClienteElegido] = useState("");
  const [vigenciaElegida, setVigenciaElegida] = useState("");
  // El elegido solo vale si sigue en la lista (al borrar su única tabla, un cliente que no es por bolsa sale de ella)
  const enLista = clientes.datos?.some((c) => String(c.id) === clienteElegido);
  const clienteId = (enLista && clienteElegido) || (clientes.datos?.[0] ? String(clientes.datos[0].id) : "");
  const tabla = useCargar(() => (clienteId ? tablaBolsaKm(clienteId, vigenciaElegida || undefined) : Promise.resolve(null)), [clienteId, vigenciaElegida]);
  const [dialogo, setDialogo] = useState(null); // { tipo: "celda", celda, columna, fila } | { tipo: "nueva" } | { tipo: "editar" } | { tipo: "otroCliente" }
  const [aviso, setAviso] = useState("");

  if (clientes.cargando && !clientes.datos) return <Cargando />;
  if (clientes.error) return <ErrorCarga mensaje={clientes.error} onReintentar={clientes.recargar} />;
  if (clientes.datos.length === 0) {
    return <Alert severity="info">Ningún cliente se cobra por bolsa de kilómetros. Se configura en Clientes → Modalidad de cobro.</Alert>;
  }

  const t = tabla.datos;
  const elegido = clientes.datos.find((c) => String(c.id) === clienteId);
  const provisional = t?.cliente.bolsa_km_provisional ?? 1800;
  const columnaProvisional = t?.columnas.find((c) => n(c.desde) <= n(provisional) && (c.hasta === null || n(c.hasta) >= n(provisional)));

  // Al terminar un diálogo: aviso, (opcional) cambiar de vigencia y recargar
  function terminar(mensaje, { vigencia } = {}) {
    setDialogo(null);
    setAviso(mensaje);
    if (vigencia !== undefined) setVigenciaElegida(vigencia || "");
    tabla.recargar();
    clientes.recargar(); // un cliente puede entrar o salir de la lista
  }

  async function guardarProvisional(valorKm) {
    try {
      const r = await cambiarProvisionalBolsa(Number(clienteId), Number(valorKm));
      setAviso(`Columna provisional guardada${r.recalculados ? `; se recalcularon ${r.recalculados} servicio(s) del mes en curso` : ""}`);
      tabla.recargar();
    } catch (err) {
      setAviso(mensajeError(err));
    }
  }

  const propsVigencia = { clienteId: Number(clienteId), vigencia: t?.vigencia, onCerrar: () => setDialogo(null) };

  return (
    <>
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} useFlexGap sx={{ flexWrap: "wrap", alignItems: { md: "center" } }}>
            <TextField
              select
              size="small"
              label="Cliente"
              value={clienteId}
              onChange={(e) => {
                setClienteElegido(e.target.value);
                setVigenciaElegida("");
              }}
              sx={{ minWidth: 180 }}
            >
              {clientes.datos.map((c) => (
                <MenuItem key={c.id} value={String(c.id)}>
                  {c.nombre}
                  {!c.por_bolsa && " (aún no se cobra por bolsa)"}
                </MenuItem>
              ))}
            </TextField>
            {t?.vigencia && (
              <TextField select size="small" label="Vigencia" value={t.vigencia.vigente_desde} onChange={(e) => setVigenciaElegida(e.target.value)} sx={{ minWidth: 300 }}>
                {t.versiones.map((v) => (
                  <MenuItem key={v.vigente_desde} value={v.vigente_desde}>
                    {textoVigencia(v)}
                  </MenuItem>
                ))}
              </TextField>
            )}
            {t?.columnas.length > 0 && (
              <TextField
                select
                size="small"
                label="Columna provisional (mes abierto)"
                value={columnaProvisional ? String(kmDeColumna(columnaProvisional)) : ""}
                onChange={(e) => guardarProvisional(e.target.value)}
                disabled={!editar}
                sx={{ minWidth: 260 }}
                helperText="Se usa hasta que termina el mes"
              >
                {t.columnas.map((c) => (
                  <MenuItem key={c.desde} value={String(kmDeColumna(c))}>
                    {textoColumna(c)} km
                  </MenuItem>
                ))}
              </TextField>
            )}
            {editar && t?.vigencia && (
              <Stack direction="row" spacing={1} sx={{ ml: { md: "auto" } }}>
                <Button variant="outlined" startIcon={<EventIcon />} onClick={() => setDialogo({ tipo: "editar" })}>
                  Editar vigencia
                </Button>
                <Button variant="outlined" startIcon={<ContentCopyIcon />} onClick={() => setDialogo({ tipo: "nueva" })}>
                  Nueva vigencia
                </Button>
                <Button variant="outlined" startIcon={<PersonAddIcon />} onClick={() => setDialogo({ tipo: "otroCliente" })}>
                  Tabla para otro cliente
                </Button>
              </Stack>
            )}
          </Stack>
        </CardContent>
      </Card>

      {elegido && !elegido.por_bolsa && t?.vigencia && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {elegido.nombre} ya tiene tabla, pero todavía se cobra por servicio. Ajuste los valores de su tabla y luego, en <b>Clientes</b>, cambie su modalidad de
          cobro a "Bolsa de kilómetros mensual".
        </Alert>
      )}
      {tabla.cargando && !t && <Cargando />}
      {tabla.error && <ErrorCarga mensaje={tabla.error} onReintentar={tabla.recargar} />}
      {t && !t.vigencia && <Alert severity="info">Este cliente aún no tiene tabla de bolsa de kilómetros.</Alert>}
      {t?.vigencia && (
        <Card>
          <CardContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Columnas: km de todos los servicios del mes (servicio + vacío). Filas: km de cada servicio. {editar && "Clic en una celda para cambiarla. "}
              <LockIcon sx={{ fontSize: 14, verticalAlign: "middle" }} /> = ya cobró servicios: para cambiarla cree una nueva vigencia.
            </Typography>
            <CuadriculaBolsa tabla={t} columnaProvisional={columnaProvisional} onElegir={editar ? (elegida) => setDialogo({ tipo: "celda", ...elegida }) : null} />
          </CardContent>
        </Card>
      )}

      {dialogo?.tipo === "celda" && (
        <DialogoCelda celda={dialogo.celda} columna={dialogo.columna} fila={dialogo.fila} onCerrar={() => setDialogo(null)} onListo={(m) => terminar(m)} />
      )}
      {dialogo?.tipo === "editar" && t?.vigencia && (
        // Si cambió el inicio se muestra la misma tabla con su nueva fecha; si se borró, la vigente
        <DialogoEditarVigencia {...propsVigencia} onListo={(mensaje, desde) => terminar(mensaje, { vigencia: desde })} />
      )}
      {dialogo?.tipo === "nueva" && t?.vigencia && (
        <DialogoNuevaVigencia {...propsVigencia} onListo={(desde) => terminar("Nueva vigencia creada: ya puede cambiar sus celdas", { vigencia: desde })} />
      )}
      {dialogo?.tipo === "otroCliente" && t?.vigencia && (
        <DialogoTablaOtroCliente
          origen={{ clienteId: Number(clienteId), nombre: elegido?.nombre }}
          vigencia={t.vigencia}
          onCerrar={() => setDialogo(null)}
          onListo={(nuevoId) => {
            setDialogo(null);
            setAviso("Tabla creada: ajuste sus valores y cambie la modalidad del cliente en Clientes");
            clientes.recargar();
            setClienteElegido(String(nuevoId));
            setVigenciaElegida("");
          }}
        />
      )}
      <Snackbar open={Boolean(aviso)} autoHideDuration={5000} onClose={() => setAviso("")} message={aviso} anchorOrigin={{ vertical: "top", horizontal: "center" }} />
    </>
  );
}
