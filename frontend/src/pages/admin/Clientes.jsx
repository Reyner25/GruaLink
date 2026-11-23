/**
 * Administración de clientes. No se borran: se desactivan (los servicios
 * históricos siguen apuntando a ellos).
 */
import { Chip } from "@mui/material";
import { useAuth } from "../../context/AuthContext";
import { puede } from "../../utils/roles";
import { EncabezadoPagina } from "../../components/admin/Comunes";
import CrudCatalogo from "../../components/admin/CrudCatalogo";

const activo = (f) => <Chip size="small" label={f.activo ? "Activo" : "Inactivo"} color={f.activo ? "success" : "default"} variant={f.activo ? "filled" : "outlined"} />;

export default function Clientes() {
  const { usuario } = useAuth();
  return (
    <>
      <EncabezadoPagina titulo="Clientes" descripcion="Empresas a las que se les presta el servicio de grúa." migas={[{ texto: "Clientes" }]} />
      <CrudCatalogo
        ruta="/clientes"
        clave="clientes"
        claveUno="cliente"
        titulo="Cliente"
        puedeEditar={puede(usuario, "catalogos:gestionar")}
        buscarEn={["nombre_comercial", "razon_social", "nit"]}
        columnas={[
          { campo: "nombre_comercial", titulo: "Nombre comercial", render: (f) => f.nombre_comercial || f.razon_social },
          { campo: "razon_social", titulo: "Razón social" },
          { campo: "nit", titulo: "NIT" },
          { campo: "telefono", titulo: "Teléfono" },
          { campo: "email", titulo: "Correo" },
          { campo: "modalidad_cobro", titulo: "Cobro", render: (f) => (f.modalidad_cobro === "bolsa_km_mensual" ? <Chip size="small" label="Bolsa de km" color="secondary" /> : "Por servicio") },
          { campo: "recargo_nocturno_desde", titulo: "Recargo nocturno", render: (f) => (f.recargo_nocturno_desde ? `desde ${f.recargo_nocturno_desde.slice(0, 5)}` : "20:40 (general)") },
          { campo: "activo", titulo: "Estado", render: activo },
        ]}
        campos={[
          { campo: "razon_social", etiqueta: "Razón social", tipo: "texto", requerido: true },
          { campo: "nit", etiqueta: "NIT", tipo: "texto", requerido: true, ayuda: "Solo números; opcional guion y dígito de verificación (900123456-7)" },
          { campo: "nombre_comercial", etiqueta: "Nombre comercial", tipo: "texto", nulable: true, ayuda: "Nombre corto que verá el operador en el celular" },
          { campo: "telefono", etiqueta: "Teléfono", tipo: "texto", nulable: true },
          { campo: "email", etiqueta: "Correo electrónico", tipo: "email", nulable: true },
          { campo: "direccion", etiqueta: "Dirección", tipo: "texto", nulable: true },
          {
            campo: "modalidad_cobro",
            etiqueta: "Modalidad de cobro",
            tipo: "select",
            opcionesNumericas: false,
            porDefecto: "por_servicio",
            opciones: [
              { valor: "por_servicio", texto: "Por servicio (tarifas normales)" },
              { valor: "bolsa_km_mensual", texto: "Bolsa de km mensual (como Suma)" },
            ],
            ayuda: "Bolsa de km: el valor depende de los km de todos sus servicios del mes (tabla propia, ver Reportes → Bolsa de km)",
          },
          {
            campo: "recargo_nocturno_desde",
            etiqueta: "Recargo nocturno desde",
            tipo: "hora",
            nulable: true,
            ayuda: "Si el servicio termina después de esta hora (y antes de las 6:00 a. m.) se cobra el recargo nocturno. Vacío = 20:40 (general)",
          },
          { campo: "activo", etiqueta: "Activo (aparece en el celular)", tipo: "booleano" },
        ]}
      />
    </>
  );
}
