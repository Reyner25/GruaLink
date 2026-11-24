/**
 * Catálogos que alimentan los formularios: tipos de vehículo, tipos de
 * servicio y conceptos de cobro. No se borran: se desactivan.
 */
import { useState } from "react";
import { Card, Chip, Tab, Tabs } from "@mui/material";
import { useAuth } from "../../context/AuthContext";
import { puede } from "../../utils/roles";
import { UNIDADES_COBRO } from "../../utils/formato";
import { EncabezadoPagina } from "../../components/admin/Comunes";
import CrudCatalogo from "../../components/admin/CrudCatalogo";

const si = (valor, texto, color = "info") => (valor ? <Chip size="small" label={texto} color={color} /> : "—");
const activo = (f) => <Chip size="small" label={f.activo ? "Activo" : "Inactivo"} color={f.activo ? "success" : "default"} variant={f.activo ? "filled" : "outlined"} />;

const UNIDADES = Object.entries(UNIDADES_COBRO).map(([valor, texto]) => ({ valor, texto }));

export default function Catalogos() {
  const { usuario } = useAuth();
  const editar = puede(usuario, "catalogos:gestionar");
  const [pestana, setPestana] = useState("vehiculos");

  return (
    <>
      <EncabezadoPagina titulo="Catálogos" descripcion="Listas que usan el celular del operador y las tarifas." migas={[{ texto: "Catálogos" }]} />
      <Card sx={{ mb: 2 }}>
        <Tabs value={pestana} onChange={(_, v) => setPestana(v)} variant="scrollable">
          <Tab value="vehiculos" label="Tipos de vehículo" />
          <Tab value="servicios" label="Tipos de servicio" />
          <Tab value="conceptos" label="Conceptos de cobro" />
        </Tabs>
      </Card>

      {pestana === "vehiculos" && (
        <CrudCatalogo
          ruta="/tipos-vehiculo"
          clave="tipos_vehiculo"
          claveUno="tipo_vehiculo"
          titulo="Tipo de vehículo"
          puedeEditar={editar}
          columnas={[
            { campo: "nombre", titulo: "Nombre" },
            { campo: "es_otro", titulo: "Pide descripción", render: (f) => si(f.es_otro, "Sí (opción \"Otro\")") },
          ]}
          campos={[
            { campo: "nombre", etiqueta: "Nombre", tipo: "texto", requerido: true },
            { campo: "es_otro", etiqueta: "Es la opción \"Otro\" (el operador escribe cuál; valor a convenir)", tipo: "booleano", porDefecto: false },
          ]}
        />
      )}

      {pestana === "servicios" && (
        <CrudCatalogo
          ruta="/tipos-servicio"
          clave="tipos_servicio"
          claveUno="tipo_servicio"
          titulo="Tipo de servicio"
          puedeEditar={editar}
          columnas={[
            { campo: "nombre", titulo: "Nombre" },
            { campo: "valor_a_convenir", titulo: "Valor", render: (f) => (f.valor_a_convenir ? "A convenir" : "Por tarifa") },
            { campo: "es_rescate", titulo: "Rescate", render: (f) => si(f.es_rescate, "Rescate", "warning") },
            { campo: "activo", titulo: "Estado", render: activo },
          ]}
          campos={[
            { campo: "nombre", etiqueta: "Nombre", tipo: "texto", requerido: true },
            { campo: "valor_a_convenir", etiqueta: "Valor a convenir (lo define el administrador al aprobar)", tipo: "booleano", porDefecto: false },
            { campo: "es_rescate", etiqueta: "Los servicios de este tipo son rescates", tipo: "booleano", porDefecto: false },
            { campo: "activo", etiqueta: "Activo", tipo: "booleano" },
          ]}
        />
      )}

      {pestana === "conceptos" && (
        <CrudCatalogo
          ruta="/conceptos"
          clave="conceptos"
          claveUno="concepto"
          titulo="Concepto"
          puedeEditar={editar}
          columnas={[
            { campo: "nombre", titulo: "Nombre" },
            { campo: "unidad_cobro", titulo: "Se cobra", render: (f) => UNIDADES_COBRO[f.unidad_cobro] || f.unidad_cobro },
            {
              campo: "la_reporta_operador",
              titulo: "Quién lo registra",
              render: (f) =>
                f.es_recargo_nocturno ? (
                  <Chip
                    size="small"
                    color="info"
                    label="Automático (horario en Tarifas → Precios de conceptos)"
                  />
                ) : f.la_reporta_operador ? (
                  "Operador (celular)"
                ) : (
                  <Chip size="small" label="Solo administrador" color="warning" />
                ),
            },
            { campo: "activo", titulo: "Estado", render: activo },
          ]}
          campos={[
            { campo: "nombre", etiqueta: "Nombre", tipo: "texto", requerido: true },
            { campo: "descripcion", etiqueta: "Descripción", tipo: "texto", nulable: true },
            {
              campo: "unidad_cobro",
              etiqueta: "Se cobra",
              tipo: "select",
              requerido: true,
              opciones: UNIDADES,
              opcionesNumericas: false,
              porDefecto: "evento",
              ayuda: "No se puede cambiar si el concepto ya se usó en servicios",
            },
            { campo: "la_reporta_operador", etiqueta: "El operador lo puede marcar en el celular", tipo: "booleano", porDefecto: true },
            { campo: "activo", etiqueta: "Activo", tipo: "booleano" },
          ]}
        />
      )}
    </>
  );
}
