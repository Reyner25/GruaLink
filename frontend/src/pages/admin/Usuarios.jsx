/**
 * Administración de usuarios (solo administrador).
 * - La contraseña se pide al crear y se cambia con su propio botón;
 *   nunca se muestra ni viaja de vuelta desde el servidor.
 * - Desactivar un usuario cierra sus sesiones abiertas (lo hace el backend).
 * - No se borran usuarios: sus servicios y turnos siguen apuntando a ellos.
 */
import { useState } from "react";
import { Alert, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack, TextField, Tooltip } from "@mui/material";
import KeyIcon from "@mui/icons-material/Key";
import { cambiarPasswordUsuario } from "../../api/admin.api";
import { formatoFechaHora, mensajeError } from "../../utils/formato";
import { EncabezadoPagina } from "../../components/admin/Comunes";
import CrudCatalogo from "../../components/admin/CrudCatalogo";

const ROLES = [
  { valor: "operador", texto: "Operador de grúa" },
  { valor: "administrador", texto: "Administrador" },
  { valor: "financiero", texto: "Financiero (solo consulta)" },
];
const TEXTO_ROL = Object.fromEntries(ROLES.map((r) => [r.valor, r.texto]));
const AYUDA_CLAVE = "Mínimo 8 caracteres, con al menos una letra y un número";

function DialogoPassword({ usuario, onCerrar, onListo }) {
  const [clave, setClave] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const valida = clave.length >= 8 && /[A-Za-z]/.test(clave) && /\d/.test(clave);

  async function guardar() {
    setEnviando(true);
    setError("");
    try {
      await cambiarPasswordUsuario(usuario.id, clave);
      onListo();
    } catch (err) {
      setError(mensajeError(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Dialog open onClose={() => !enviando && onCerrar()} maxWidth="xs" fullWidth>
      <DialogTitle>Cambiar contraseña · {usuario.nombre}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <TextField type="password" label="Nueva contraseña" value={clave} onChange={(e) => setClave(e.target.value)} helperText={AYUDA_CLAVE} autoComplete="new-password" />
          <TextField
            type="password"
            label="Repetir contraseña"
            value={confirmar}
            onChange={(e) => setConfirmar(e.target.value)}
            error={confirmar !== "" && confirmar !== clave}
            helperText={confirmar !== "" && confirmar !== clave ? "No coincide" : " "}
            autoComplete="new-password"
          />
          <Alert severity="info">El usuario tendrá que volver a iniciar sesión en todos sus equipos.</Alert>
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCerrar} disabled={enviando}>
          Cancelar
        </Button>
        <Button variant="contained" onClick={guardar} disabled={enviando || !valida || clave !== confirmar}>
          Cambiar
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function Usuarios() {
  const [dialogo, setDialogo] = useState(null); // { usuario, recargar }
  return (
    <>
      <EncabezadoPagina titulo="Usuarios" descripcion="Operadores, administradores y usuarios de consulta." migas={[{ texto: "Usuarios" }]} />
      <CrudCatalogo
        ruta="/usuarios"
        clave="usuarios"
        claveUno="usuario"
        titulo="Usuario"
        buscarEn={["nombre", "email"]}
        columnas={[
          { campo: "nombre", titulo: "Nombre" },
          { campo: "email", titulo: "Correo" },
          { campo: "rol", titulo: "Rol", render: (f) => TEXTO_ROL[f.rol] || f.rol },
          {
            campo: "activo",
            titulo: "Estado",
            render: (f) => <Chip size="small" label={f.activo ? "Activo" : "Inactivo"} color={f.activo ? "success" : "default"} variant={f.activo ? "filled" : "outlined"} />,
          },
          { campo: "ultimo_login", titulo: "Último ingreso", render: (f) => formatoFechaHora(f.ultimo_login) },
        ]}
        campos={[
          { campo: "nombre", etiqueta: "Nombre completo", tipo: "texto", requerido: true },
          { campo: "email", etiqueta: "Correo (para iniciar sesión)", tipo: "email", requerido: true },
          { campo: "rol", etiqueta: "Rol", tipo: "select", requerido: true, opciones: ROLES, opcionesNumericas: false, porDefecto: "operador" },
          { campo: "password", etiqueta: "Contraseña", tipo: "password", requerido: true, soloCrear: true, ayuda: AYUDA_CLAVE },
          { campo: "activo", etiqueta: "Activo (puede iniciar sesión)", tipo: "booleano" },
        ]}
        accionesFila={(f, recargar) => (
          <Tooltip title="Cambiar contraseña">
            <IconButton size="small" aria-label="Cambiar contraseña" onClick={() => setDialogo({ usuario: f, recargar })}>
              <KeyIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      />
      {dialogo && (
        <DialogoPassword
          usuario={dialogo.usuario}
          onCerrar={() => setDialogo(null)}
          onListo={() => {
            dialogo.recargar();
            setDialogo(null);
          }}
        />
      )}
    </>
  );
}
