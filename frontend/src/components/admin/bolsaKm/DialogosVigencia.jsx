/**
 * Diálogos de las vigencias de la tabla de bolsa de km:
 *   DialogoNuevaVigencia   copia la tabla desde una fecha (ej. tarifas 2027)
 *   DialogoEditarVigencia  cambia las fechas; sin uso también se puede borrar
 *   DialogoTablaOtroCliente copia la tabla a otro cliente (cliente nuevo por bolsa)
 */
import { useState } from "react";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField } from "@mui/material";
import { borrarVigenciaBolsa, crearTablaBolsa, editarVigenciaBolsa, nuevaVigenciaBolsa } from "../../../api/admin.api";
import { obtenerCatalogos } from "../../../api/catalogos.api";
import { useCargar } from "../../../hooks/useCargar";
import { useEnviar } from "../../../hooks/useEnviar";
import { formatoFecha, hoy } from "../../../utils/formato";

const fechaProps = { inputLabel: { shrink: true } };

export function DialogoNuevaVigencia({ clienteId, vigencia, onCerrar, onListo }) {
  const [desde, setDesde] = useState("");
  const [motivo, setMotivo] = useState("");
  const { enviando, error, enviar } = useEnviar();

  const crear = () =>
    enviar(async () => {
      await nuevaVigenciaBolsa({ cliente_id: clienteId, copiar_de: vigencia.vigente_desde, vigente_desde: desde, motivo: motivo.trim() });
      onListo(desde);
    });

  return (
    <Dialog open onClose={() => !enviando && onCerrar()} maxWidth="xs" fullWidth>
      <DialogTitle>Nueva vigencia de la tabla</DialogTitle>
      <DialogContent dividers>
        <Alert severity="info" sx={{ mb: 2 }}>
          Se copia la tabla que rige desde el {formatoFecha(vigencia.vigente_desde)} con todos sus valores. Después puede cambiar las celdas de la copia. La tabla
          actual se cierra el día anterior a la nueva fecha; lo ya cobrado no cambia.
        </Alert>
        <Stack spacing={2}>
          <TextField type="date" label="Rige desde *" value={desde} onChange={(e) => setDesde(e.target.value)} slotProps={{ ...fechaProps, htmlInput: { min: hoy() } }} />
          <TextField label="Motivo *" value={motivo} onChange={(e) => setMotivo(e.target.value)} helperText="Ej.: tarifas Suma 2027" />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCerrar} disabled={enviando}>
          Cancelar
        </Button>
        <Button variant="contained" onClick={crear} disabled={enviando || !desde || motivo.trim().length < 5}>
          {enviando ? "Creando…" : "Crear copia"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Tabla para OTRO cliente: copia la tabla que se está viendo (columnas, filas
 * y valores) a otro cliente. Después se ajustan sus celdas y, en Clientes, se
 * cambia su modalidad de cobro a "Bolsa de kilómetros mensual".
 *   origen: { clienteId, nombre } del cliente cuya tabla se copia
 *   onListo(clienteId): id del cliente que recibió la tabla
 */
export function DialogoTablaOtroCliente({ origen, vigencia, onCerrar, onListo }) {
  const catalogos = useCargar(obtenerCatalogos, []);
  const [clienteId, setClienteId] = useState("");
  const [desde, setDesde] = useState(vigencia.vigente_desde);
  const [motivo, setMotivo] = useState("");
  const { enviando, error, enviar } = useEnviar();
  const opciones = (catalogos.datos?.clientes || []).filter((c) => c.id !== origen.clienteId);

  const crear = () =>
    enviar(async () => {
      await crearTablaBolsa({ cliente_id: Number(clienteId), copiar_de_cliente: origen.clienteId, copiar_de: vigencia.vigente_desde, vigente_desde: desde, motivo: motivo.trim() });
      onListo(Number(clienteId));
    });

  return (
    <Dialog open onClose={() => !enviando && onCerrar()} maxWidth="xs" fullWidth>
      <DialogTitle>Tabla para otro cliente</DialogTitle>
      <DialogContent dividers>
        <Alert severity="info" sx={{ mb: 2 }}>
          Se copia la tabla de <b>{origen.nombre}</b> (vigencia desde el {formatoFecha(vigencia.vigente_desde)}) con sus columnas, filas y valores. Después
          ajuste las celdas con los valores del nuevo cliente y, en <b>Clientes</b>, cambie su modalidad de cobro a "Bolsa de kilómetros mensual".
        </Alert>
        <Stack spacing={2}>
          <TextField select label="Cliente que recibe la tabla *" value={clienteId} onChange={(e) => setClienteId(e.target.value)} disabled={!catalogos.datos}>
            {opciones.map((c) => (
              <MenuItem key={c.id} value={String(c.id)}>
                {c.nombre}
              </MenuItem>
            ))}
          </TextField>
          <TextField type="date" label="Rige desde *" value={desde} onChange={(e) => setDesde(e.target.value)} slotProps={fechaProps} />
          <TextField label="Motivo *" value={motivo} onChange={(e) => setMotivo(e.target.value)} helperText="Ej.: contrato por bolsa de km (mínimo 5 caracteres)" />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCerrar} disabled={enviando}>
          Cancelar
        </Button>
        <Button variant="contained" onClick={crear} disabled={enviando || !clienteId || !desde || motivo.trim().length < 5}>
          {enviando ? "Creando…" : "Crear tabla"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Sin uso: inicio y fin (o borrarla).
 * En uso: solo el fin (no antes del último servicio cobrado con ella).
 * onListo(mensaje, vigenteDesde): vigenteDesde = la fecha de inicio que queda (null si se borró)
 */
export function DialogoEditarVigencia({ clienteId, vigencia, onCerrar, onListo }) {
  const [desde, setDesde] = useState(vigencia.vigente_desde);
  const [hasta, setHasta] = useState(vigencia.vigente_hasta || "");
  const [motivo, setMotivo] = useState("");
  const { enviando, error, enviar } = useEnviar();
  const enUso = vigencia.usada;
  const motivoOk = motivo.trim().length >= 5;

  const borrar = () =>
    enviar(async () => {
      await borrarVigenciaBolsa({ cliente_id: clienteId, vigente_desde: vigencia.vigente_desde, motivo: motivo.trim() });
      onListo("Vigencia borrada", null);
    });

  const guardar = () =>
    enviar(async () => {
      const r = await editarVigenciaBolsa({
        cliente_id: clienteId,
        vigente_desde: vigencia.vigente_desde,
        ...(desde !== vigencia.vigente_desde ? { nuevo_desde: desde } : {}),
        nuevo_hasta: hasta || null,
        motivo: motivo.trim(),
      });
      onListo("Vigencia actualizada", r.vigente_desde);
    });

  return (
    <Dialog open onClose={() => !enviando && onCerrar()} maxWidth="xs" fullWidth>
      <DialogTitle>Editar vigencia</DialogTitle>
      <DialogContent dividers>
        {enUso && (
          <Alert severity="info" sx={{ mb: 2 }}>
            Esta tabla ya cobró servicios: solo se puede cambiar la fecha final (no antes del último servicio cobrado). Para valores nuevos use "Nueva vigencia".
          </Alert>
        )}
        <Stack spacing={2}>
          <TextField type="date" label="Rige desde *" value={desde} onChange={(e) => setDesde(e.target.value)} disabled={enUso} slotProps={fechaProps} />
          <TextField type="date" label="Rige hasta" value={hasta} onChange={(e) => setHasta(e.target.value)} helperText="Vacío = sin fecha final" slotProps={fechaProps} />
          <TextField label="Motivo *" value={motivo} onChange={(e) => setMotivo(e.target.value)} helperText="Queda en la bitácora (mínimo 5 caracteres)" />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        {!enUso && (
          <Button color="error" onClick={borrar} disabled={enviando || !motivoOk} sx={{ mr: "auto" }}>
            Borrar esta vigencia
          </Button>
        )}
        <Button onClick={onCerrar} disabled={enviando}>
          Cancelar
        </Button>
        <Button variant="contained" onClick={guardar} disabled={enviando || !desde || !motivoOk}>
          {enviando ? "Guardando…" : "Guardar"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
