# GruaLink — Etapa 4: Panel administrativo

> Fecha: 23/11/2026 · Estado: **construido y probado en el navegador** (administrador y financiero)

## 1. Qué hay en `/admin`

| Menú | Ruta | Quién | Qué hace |
|---|---|---|---|
| Inicio | `/admin` | admin, financiero | Indicadores reales (SQL): flota hoy, servicios del periodo, valor calculado/aprobado, tiempo de reacción, servicios por día y por cliente. Filtros por fecha, cliente, grúa, operador y estado (guardados en la URL) |
| Servicios | `/admin/servicios` | admin, financiero | Listado con filtros y paginación |
| — detalle | `/admin/servicios/:id` | admin (acciones) · financiero (solo ver) | Datos, tiempos, km, valores y bitácora. Acciones: **Pasar a revisión · Corregir · Aprobar · Devolver · Anular** |
| Tarifas | `/admin/tarifas` | admin edita · financiero ve | Pestañas *Tarifa básica* y *Precios de conceptos*. Filtro por cliente y "vigentes el" |
| Clientes | `/admin/clientes` | admin edita · financiero ve | Crear, editar, desactivar |
| Grúas | `/admin/gruas` | admin edita · financiero ve | Crear, editar, **cambiar estado** con motivo, historial de estados, quién la usa ahora |
| Catálogos | `/admin/catalogos` | admin edita · financiero ve | Tipos de vehículo (incluida la opción "Otro"), tipos de servicio (a convenir / rescate), conceptos (quién los registra) |
| Usuarios | `/admin/usuarios` | solo admin | Crear con rol y contraseña, editar, desactivar, cambiar contraseña |
| Promedio de grúas | `/admin/reportes/promedio-gruas` | admin, financiero | Por día: en operación, mantenimiento, inactivas, % disponibilidad |
| Bitácora | `/admin/bitacora` | solo admin | Quién hizo qué, cuándo, motivo y valores antes → después |

Las direcciones del panel anterior (`/panel`, `/ordenes`, `/monitoreo`) redirigen al nuevo.

## 2. Flujo de revisión de un servicio (lo que hace el administrador)

1. **Inicio → "Servicios por revisar"** (o Servicios filtrado por *Finalizado*).
2. Abrir el servicio. Si aparece "sin kilómetros registrados", **Corregir**:
   - km en vacío y en servicio (en La Rolita definen el rango de tarifa),
   - stand-by y recargo nocturno (solo los aplica el administrador),
   - placa, número, origen, destino.
   - Motivo obligatorio. El valor **se recalcula** y la corrección queda en la bitácora.
3. **Aprobar**: valor sugerido = calculado. Si se aprueba un valor distinto, el motivo es obligatorio. Los servicios *a convenir* (rescate o vehículo "Otro") exigen escribir el valor.
4. **Anular** (con motivo) si es un duplicado o un error; **Devolver** si estaba en revisión y hay que revisarlo de nuevo.

## 3. Cómo está hecho (para editar el código)

```text
frontend/src/
├── layouts/AdminLayout.jsx         menú lateral (MENU: agregar opciones aquí)
├── api/admin.api.js                llamadas del panel (incluye listar/crear/actualizar genéricos)
├── hooks/useFiltrosUrl.js          filtros guardados en la URL
├── components/admin/
│   ├── Comunes.jsx                 EncabezadoPagina, Indicador, Panel
│   ├── Filtros.jsx                 barra de filtros (fecha, cliente, grúa, operador, estado)
│   ├── GraficoBarras.jsx           gráfico de barras sin librerías externas
│   ├── DialogosServicio.jsx        Corregir · Aprobar · Anular/Devolver
│   └── CrudCatalogo.jsx            ★ tabla administrable reutilizable
└── pages/admin/                    Dashboard, Servicios, ServicioDetalle, Tarifas,
                                    Clientes, Gruas, Catalogos, Usuarios,
                                    PromedioGruas, Bitacora
```

### `CrudCatalogo`: agregar una tabla administrable nueva

Cada pantalla solo **describe** el recurso; el componente lista, busca, crea, edita y (si se permite) borra:

```jsx
<CrudCatalogo
  ruta="/clientes" clave="clientes" claveUno="cliente" titulo="Cliente"
  columnas={[{ campo: "nit", titulo: "NIT" }]}
  campos={[{ campo: "nit", etiqueta: "NIT", tipo: "texto", requerido: true }]}
/>
```

- Tipos de campo: `texto`, `email`, `password`, `numero` (acepta coma decimal), `dinero` (acepta puntos de miles), `fecha`, `booleano`, `select`.
- `nulable: true` → vacío se envía como `null`. `soloCrear: true` → solo al crear (ej. contraseña).
- `deshabilitado(fila)` + `ayudaBloqueado` → bloquear campos (ej. tarifas ya usadas).
- Al editar se envían **solo los campos que cambiaron** + motivo opcional (va a la bitácora).

### Reglas de diseño aplicadas

- Todo estilo va en `sx={{ … }}` (MUI 9 no acepta props sueltas como `alignItems`).
- Los botones se muestran según los **permisos** que envía el backend (`puede(usuario, "servicios:aprobar")`), pero la seguridad real está en el backend.
- Colores de estado con texto o ícono, nunca solo color. Gráfico de una serie = un color, sin leyenda, con tooltip y tabla de detalle.

## 4. Cambio de regla en el backend

- **Anular después de finalizar**: ahora un servicio *finalizado* o *en revisión* también se puede anular (con motivo). Caso real del Excel: "ANULADA, SE CAMBIA POR OS …". Se revierte en `TRANSICIONES` de `backend/services/servicio.service.js`.

## 5. Limpieza

Se borraron las pantallas del panel anterior (`PanelPage`, `ListadoOrdenesPage`, `DetalleOrdenPage`, `MonitoreoPage`, `InicioPage`, `OrdenServicioPage`, `LayoutPrincipal`, `components/ordenes/*`) y archivos sobrantes de la plantilla de Vite. Siguen en el historial de git (commit `092a53d` y anteriores).

## 6. Exportar a Excel (23/11/2026)

Botón **"Exportar a Excel"** en *Inicio*, *Servicios* y *Promedio de grúas*. Exporta **todos** los registros del filtro actual (no solo la página visible).

| Endpoint | Hojas | Notas |
|---|---|---|
| `GET /api/exportar/servicios` (mismos filtros del dashboard) | **Servicios** (una fila por servicio, 35 columnas: orden, fechas, cliente, operador, grúa, vehículo, tiempos de reacción y duración, km, valores, aprobación, entrega, observaciones) y **Trabajos adicionales** (detalle de conceptos) | Máx. 20.000 filas. Los anulados no llevan valores (igual que el dashboard) |
| `GET /api/exportar/promedio-gruas?desde&hasta` | **Promedio de grúas** por día | Máx. 1 año |

Características del archivo:
- Fechas y horas como **fechas reales de Excel** (se pueden ordenar y filtrar), en **hora de Colombia** (verificado contra la base).
- Valores con formato **$ #.###**, encabezado azul oscuro congelado, **filtros de Excel** activados.
- Fila **TOTAL** con `SUBTOTAL(9, …)`: suma solo las filas visibles cuando se filtra en Excel.
- Permisos: administrador y financiero (`reportes:ver`). El operador recibe 403.

Código: `backend/services/excel.service.js` (genérico: `crearExcel({ titulo, hojas })` sirve para cualquier reporte nuevo), `backend/models/exportar.model.js`, `backend/routes/exportar.routes.js`, `frontend/src/components/admin/BotonExportar.jsx`.

Librería nueva: **ExcelJS 4.4.0** (MIT). `npm audit` reporta 2 avisos moderados en `uuid` (dependencia interna de ExcelJS para identificadores del archivo; no recibe datos del usuario) y 2 en `nodemon` (solo desarrollo). Revisar en la Etapa 7.

## 7. Pendiente / ideas

- Reportes por operador y por cliente en pantalla propia (el backend ya tiene `/api/dashboard/por/operador` y `/por/cliente`).
- Cierre de turnos olvidados desde el panel (el backend ya tiene `POST /api/turnos/:id/cerrar`).
- Pantalla de configuración (porcentaje del operador, horas de corte del recargo nocturno) cuando se definan P11 y P17.
