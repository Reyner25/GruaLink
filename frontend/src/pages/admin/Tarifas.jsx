/**
 * Tarifas (administrador edita; financiero consulta).
 *
 * Pestaña "Tarifa básica": precio por cliente (o Clientes generales),
 *   tipo de servicio, tipo de vehículo, rango de km y vigencia.
 * Pestaña "Precios de conceptos": cardán, persiana, stand-by… por cliente.
 *
 * Reglas que aplica el backend y que aquí se reflejan:
 *  - No pueden existir dos tarifas que se crucen (mismo cliente, servicio,
 *    vehículo, rango de km y vigencia): el servidor responde "se superpone".
 *  - Una tarifa YA USADA en servicios no se modifica ni se borra: solo se le
 *    puede poner fecha de fin (vigente hasta). Para cambiar el precio, se
 *    cierra la actual y se crea una nueva desde el día siguiente.
 */
import { useState } from "react";
import { Card, Chip, MenuItem, Tab, Tabs, TextField, Tooltip } from "@mui/material";
import { useAuth } from "../../context/AuthContext";
import { useCargar } from "../../hooks/useCargar";
import { obtenerCatalogos } from "../../api/catalogos.api";
import { formatoFecha, formatoMoneda, formatoNumero, hoy, UNIDADES_COBRO } from "../../utils/formato";
import { puede } from "../../utils/roles";
import { EncabezadoPagina } from "../../components/admin/Comunes";
import CrudCatalogo from "../../components/admin/CrudCatalogo";
import { Cargando, ErrorCarga } from "../../components/operador/Comunes";

const GENERALES = "Clientes generales";
const BLOQUEO = "Bloqueado: ya se usó en servicios (solo se puede cerrar la vigencia)";

const vigencia = (f) => `${formatoFecha(f.vigente_desde)} – ${f.vigente_hasta ? formatoFecha(f.vigente_hasta) : "sin fin"}`;
const uso = (f) =>
  f.usada ? (
    <Tooltip title={`Usada en servicios hasta el ${formatoFecha(f.ultima_fecha_uso)}: solo se puede cerrar su vigencia`}>
      <Chip size="small" label="En uso" color="info" />
    </Tooltip>
  ) : (
    <Chip size="small" label="Sin uso" variant="outlined" />
  );
// En una tarifa usada, todos los campos quedan bloqueados salvo "vigente hasta"
const bloqueadaSiUsada = (fila) => Boolean(fila?.usada);

/** Filtros comunes: cliente y fecha de vigencia. */
function FiltrosTarifa({ filtros, setFiltros, clientes }) {
  return (
    <>
      <TextField
        select
        size="small"
        label="Cliente"
        value={filtros.cliente_id}
        onChange={(e) => setFiltros((f) => ({ ...f, cliente_id: e.target.value }))}
        sx={{ minWidth: 220 }}
      >
        <MenuItem value="">Todos</MenuItem>
        <MenuItem value="generales">{GENERALES}</MenuItem>
        {clientes.map((c) => (
          <MenuItem key={c.id} value={String(c.id)}>
            {c.nombre}
          </MenuItem>
        ))}
      </TextField>
      <TextField
        size="small"
        type="date"
        label="Vigentes el"
        value={filtros.vigente_en}
        onChange={(e) => setFiltros((f) => ({ ...f, vigente_en: e.target.value }))}
        slotProps={{ inputLabel: { shrink: true } }}
      />
    </>
  );
}

export default function Tarifas() {
  const { usuario } = useAuth();
  const editar = puede(usuario, "tarifas:gestionar");
  const [pestana, setPestana] = useState("basica");
  const [filtros, setFiltros] = useState({ cliente_id: "", vigente_en: hoy() });
  const catalogos = useCargar(obtenerCatalogos, []);

  if (catalogos.cargando && !catalogos.datos) return <Cargando />;
  if (catalogos.error) return <ErrorCarga mensaje={catalogos.error} onReintentar={catalogos.recargar} />;
  const { clientes, tipos, tipos_servicio: tiposServicio, conceptos } = catalogos.datos;

  const bloqueable = (campo) => ({ ...campo, deshabilitado: bloqueadaSiUsada, ayudaBloqueado: BLOQUEO });
  const campoCliente = bloqueable({
    campo: "cliente_id",
    etiqueta: "Cliente",
    tipo: "select",
    nulable: true,
    opciones: [{ valor: "", texto: GENERALES }, ...clientes.map((c) => ({ valor: c.id, texto: c.nombre }))],
    ayuda: "Clientes generales = precio para cualquier cliente sin tarifa propia",
  });
  const camposVigencia = [
    bloqueable({ campo: "vigente_desde", etiqueta: "Vigente desde", tipo: "fecha", requerido: true }),
    {
      campo: "vigente_hasta",
      etiqueta: "Vigente hasta",
      tipo: "fecha",
      nulable: true,
      ayuda: "Vacío = sin fecha de fin. Para cambiar un precio en uso, ponga aquí el último día y cree una tarifa nueva.",
    },
  ];
  const barra = <FiltrosTarifa filtros={filtros} setFiltros={setFiltros} clientes={clientes} />;

  return (
    <>
      <EncabezadoPagina
        titulo="Tarifas"
        descripcion="Precios por cliente, tipo de servicio, tipo de vehículo y rango de kilómetros."
        migas={[{ texto: "Tarifas" }]}
      />
      <Card sx={{ mb: 2 }}>
        <Tabs value={pestana} onChange={(_, v) => setPestana(v)}>
          <Tab value="basica" label="Tarifa básica" />
          <Tab value="conceptos" label="Precios de conceptos" />
        </Tabs>
      </Card>

      {pestana === "basica" && (
        <CrudCatalogo
          ruta="/tarifas"
          clave="tarifas"
          claveUno="tarifa"
          titulo="Tarifa"
          textoNuevo="Nueva tarifa"
          puedeEditar={editar}
          permitirBorrar
          puedeBorrarFila={(f) => !f.usada}
          filtros={filtros}
          barraExtra={barra}
          columnas={[
            { campo: "cliente_nombre", titulo: "Cliente" },
            { campo: "tipo_servicio", titulo: "Servicio" },
            { campo: "tipo_vehiculo", titulo: "Vehículo" },
            { campo: "km", titulo: "Rango km", render: (f) => `${formatoNumero(f.km_desde)} – ${f.km_hasta === null ? "∞" : formatoNumero(f.km_hasta)}` },
            { campo: "valor", titulo: "Valor", alinear: "right", render: (f) => formatoMoneda(f.valor) },
            { campo: "vigencia", titulo: "Vigencia", render: vigencia },
            { campo: "usada", titulo: "Uso", render: uso },
          ]}
          campos={[
            campoCliente,
            bloqueable({
              campo: "tipo_servicio_id",
              etiqueta: "Tipo de servicio",
              tipo: "select",
              requerido: true,
              opciones: tiposServicio.map((t) => ({ valor: t.id, texto: t.nombre })),
            }),
            bloqueable({
              campo: "tipo_vehiculo_id",
              etiqueta: "Tipo de vehículo",
              tipo: "select",
              requerido: true,
              opciones: tipos.filter((t) => !t.es_otro).map((t) => ({ valor: t.id, texto: t.nombre })),
            }),
            bloqueable({ campo: "km_desde", etiqueta: "Km desde", tipo: "numero", porDefecto: "0" }),
            bloqueable({
              campo: "km_hasta",
              etiqueta: "Km hasta",
              tipo: "numero",
              nulable: true,
              ayuda: "Vacío = sin límite. Rangos sin cruzarse: 0 a 14,99 · 15 a 19,99 …",
            }),
            bloqueable({ campo: "valor", etiqueta: "Valor", tipo: "dinero", requerido: true }),
            ...camposVigencia,
          ]}
        />
      )}

      {pestana === "conceptos" && (
        <CrudCatalogo
          ruta="/precios-concepto"
          clave="precios"
          claveUno="precio"
          titulo="Precio"
          puedeEditar={editar}
          permitirBorrar
          puedeBorrarFila={(f) => !f.usada}
          filtros={filtros}
          barraExtra={barra}
          columnas={[
            { campo: "concepto", titulo: "Concepto" },
            { campo: "unidad_cobro", titulo: "Unidad", render: (f) => UNIDADES_COBRO[f.unidad_cobro] || f.unidad_cobro },
            { campo: "cliente_nombre", titulo: "Cliente" },
            { campo: "valor", titulo: "Valor", alinear: "right", render: (f) => formatoMoneda(f.valor) },
            { campo: "vigencia", titulo: "Vigencia", render: vigencia },
            { campo: "usada", titulo: "Uso", render: uso },
          ]}
          campos={[
            bloqueable({
              campo: "concepto_id",
              etiqueta: "Concepto",
              tipo: "select",
              requerido: true,
              opciones: conceptos.map((c) => ({ valor: c.id, texto: `${c.nombre} (${UNIDADES_COBRO[c.unidad_cobro]})` })),
            }),
            campoCliente,
            bloqueable({ campo: "valor", etiqueta: "Valor unitario", tipo: "dinero", requerido: true }),
            ...camposVigencia,
          ]}
        />
      )}
    </>
  );
}
