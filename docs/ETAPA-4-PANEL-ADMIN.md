# GruaLink — Etapa 4: Panel administrativo

> Fecha: 23/11/2026 · Estado: **construido y probado en el navegador** (administrador y financiero)

## 1. Qué hay en `/admin`

| Menú | Ruta | Quién | Qué hace |
|---|---|---|---|
| Inicio | `/admin` | admin, financiero | Indicadores reales (SQL): flota hoy, servicios del periodo, valor calculado/aprobado, tiempo de reacción, servicios por día y por cliente. Filtros por fecha, cliente, grúa, operador y estado (guardados en la URL) |
| Servicios | `/admin/servicios` | admin, financiero | Listado con filtros y paginación |
| — detalle | `/admin/servicios/:id` | admin (acciones) · financiero (solo ver) | Datos, tiempos, km, valores y bitácora. Acciones: **Pasar a revisión · Corregir · Aprobar · Devolver · Anular**; en aprobados: **Reabrir · Anular**; siempre: **Orden en PDF** |
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
- **Servicios aprobados (23/11/2026)**: el administrador puede, siempre con **motivo obligatorio**:
  - **Reabrir** → vuelve a *En revisión*; se quitan valor aprobado, quién y cuándo (dejan de sumar como aprobado). Luego se corrige y se aprueba de nuevo. La bitácora guarda la aprobación anterior (operación `reabrir`).
  - **Anular** → queda *Anulado* y deja de sumar; se conservan los datos de la aprobación como historia.
  - El financiero no puede (solo consulta). Un servicio **anulado** sigue siendo definitivo. No existe borrar servicios.

## 5. Limpieza

Se borraron las pantallas del panel anterior (`PanelPage`, `ListadoOrdenesPage`, `DetalleOrdenPage`, `MonitoreoPage`, `InicioPage`, `OrdenServicioPage`, `LayoutPrincipal`, `components/ordenes/*`) y archivos sobrantes de la plantilla de Vite. Siguen en el historial de git (commit `092a53d` y anteriores).

## 5.1 Recargo nocturno (23/11/2026; horario editable y control manual desde el 24/11/2026)

- **Automático**: se cobra si el servicio **termina** después de la hora de corte y antes de la hora de fin de la madrugada (hora de Colombia).
- **Horario** (desde el 24/11/2026): *Tarifas → Precios de conceptos*, en la fila "Recargo nocturno" de cada precio. Clientes generales = horario general (20:40 a 06:00); en el precio de un cliente se pone solo si tiene horario propio (La Rolita 19:00); vacío = usa el general. Se puede cambiar aunque el precio ya esté en uso (el valor no). Ya no está en Clientes ni en Catálogos.
- Límites: con corte 20:40, 20:40 exacto no lleva recargo y 20:41 sí; con fin 06:00, 05:59 sí y 06:00 no.
- **El administrador decide** al corregir: *Recargo nocturno* = Automático (según la hora) · Aplicar siempre · No aplicar. En el detalle se indica cuando lo decidió el administrador.
- Precio: el del concepto "Recargo nocturno" del cliente (o el general).
- Código: `esNocturno` y `aplicarRecargoNocturno` en `backend/services/tarifa.service.js`. Los cambios de horario aplican a los servicios que se calculen o corrijan después.

## 5.1.1 Corrección completa del servicio (24/11/2026)

En *Corregir* el administrador puede cambiar **todos** los datos:
- **Servicio:** cliente (empresa), tipo de servicio, tipo de vehículo (y cuál, si es "Otro"), grúa y fecha.
- **Horas:** solicitud, inicio y fin.
- **Vehículo y ubicación:** placa, número, origen y destino.
- **Kilómetros**, y si va fuera de la disponibilidad (Suma).
- **Trabajos adicionales.**
- **Valores:** tarifa básica manual (reemplaza la de la tabla; desactivarla vuelve a la automática) y recargo nocturno.
- **Entrega y observaciones.**

Al cambiar el cliente se recalcula con su tarifa y sus precios. El motivo es obligatorio y todo queda en la bitácora con los valores anteriores y nuevos.

## 5.1.3 Cobro mensual a las empresas (24/11/2026)

*Reportes → Cobro* (también el botón **Cobro** en *Servicios*). Administrador y financiero.

- Se elige el **mes** (por defecto, el anterior). Entran los servicios **aprobados** del mes; opcional **"Incluir servicios sin aprobar"** (finalizados y en revisión, con el valor calculado; salen en amarillo).
- Pantalla: por empresa, servicios, subtotal, IVA 19 % y total, y TOTAL GENERAL.
- **Cobro en Excel**: igual al archivo que se enviaba ("AAAAMM Servicios de gruas cobro"):
  - Hoja **RESUMEN**, con fórmulas a las hojas de cada empresa.
  - **Una hoja por empresa**, con el título "SERVICIO DE GRÚA PRESTADOS A …" y estas columnas: placa de la grúa, orden, vehículo, tipo, empresa, operador, fecha, horas, origen, destino, tarifa, cardán/eje/tubo, persiana, cámaras, recargo nocturno, M. rescate, total a cobrar y observaciones. Al final van Sub Total, IVA 19 % y Total.
  - **Suma**: columna **KM** y resumen por grúa.
  - Si hay stand-by, kit o reiniciada, se agrega la columna "Otros adicionales".
  - Si se aprobó un valor distinto al calculado, el total es el aprobado y la observación lo indica.
- Por empresa: su **Excel** y sus **órdenes de servicio en PDF** (los mismos servicios del cobro).
- API: `GET /api/cobro`, `GET /api/exportar/cobro`, `GET /api/exportar/cobro-ordenes` (mes, cliente_id, incluir_sin_aprobar). Código: `backend/services/cobro.service.js`.

## 5.1.2 Tarifas en Excel (24/11/2026)

Botón *Tarifas en Excel* en *Tarifas*, con los filtros de la pantalla (cliente y vigentes el). Trae 4 hojas: Tarifa básica, Precios de conceptos, Pago a operadores y Bolsa de km (Suma). Lo pueden usar el administrador y el financiero. API: `GET /api/exportar/tarifas`.

## 5.3 Turnos de los operadores (24/11/2026)

Menú **Turnos** (solo administrador, permiso `turnos:ver_todos`). Muestra los turnos **reales**, tal como los registran los operadores en el celular. No hay horario programado (decisión del usuario).

- **En turno ahora:** operador, grúa, hora de inicio, cuánto lleva y servicios del turno. Si lleva más de 12 h, aparece la marca "¿Olvidó cerrarlo?". El botón **Cerrar turno** lo cierra con motivo obligatorio y queda en la bitácora.
- **Filtros:** fechas (por inicio del turno, hora de Colombia), operador, grúa y estado (en turno · finalizado · cerrado por admin.).
- **Indicadores y resumen por operador:** turnos, horas trabajadas, promedio por turno, turno más largo, servicios (sin contar anulados) y turnos que tuvo que cerrar el administrador.
- **Historial:** inicio, fin, duración, servicios y estado. Al pasar el mouse sobre el estado se ven las observaciones. Muestra hasta 200 turnos; el Excel trae todos.
- **Excel:** `GET /api/exportar/turnos`, con los mismos filtros.
- **API:** `GET /api/turnos` (ahora con `grua_id`, `estado`, duración y servicios por turno), `GET /api/turnos/en-curso`, `GET /api/turnos/resumen`, `POST /api/turnos/:id/cerrar` (ya existía).
- Sin cambios en la base de datos.

## 5.2 Pago al operador (23/11/2026, antes P11)

**Configuración:** *Tarifas → Pago a operadores*. Reglas con vigencia, igual que las tarifas: una regla usada no se modifica, solo se cierra su vigencia y se crea otra. Para cada parte del servicio se usa la regla propia del cliente y, si no tiene, la de **Cualquier otra empresa**.

| Cliente | Parte | Regla inicial |
|---|---|---|
| Cualquier otra empresa | Tarifa básica (incluye fallido y parte trasera) | 8 % |
| | Servicios a convenir (rescate) | 8 % del aprobado sin adicionales |
| | Desmontar cardán | **$20.000 fijos, una vez por servicio** |
| | Persiana | 8 % |
| | Cámaras, recargo nocturno, stand-by, kit antiderrames, reiniciada | No se paga |
| SUMA | Todo el valor del servicio | **6 %** (reemplaza a todas las demás partes) |

- **Base:** el **valor aprobado**. Antes de aprobar, el pago es provisional, calculado con el valor calculado. Si se aprueba con descuento, las partes en % bajan en la misma proporción; el fijo del cardán no cambia.
- **Al aprobar**, el pago queda guardado (`servicios.valor_operador` y `pago_operador_detalle`) y no cambia aunque después se modifiquen las reglas. Al reabrir el servicio se borra y se recalcula en la nueva aprobación.
- **Dónde se ve:**
  - *Detalle del servicio*: panel "Pago al operador" con cada parte, su regla, la base y el pago.
  - *Reportes → Pago a operadores*: por periodo y operador, separa aprobado (definitivo) de pendiente (provisional). Exporta a Excel con resumen por operador y detalle por servicio.
- **Quién lo ve:** administrador y financiero. El operador **no** ve valores (P12).
- **Código:** `backend/services/pagoOperador.service.js` (cálculo y liquidación), `migrations/011_pago_operador.sql`, rutas `/api/pago-operador` (reglas) y `/api/liquidacion-operadores`.
- **Pendiente:** "Eje" y "Tubo de admisión" no existen como conceptos. Si se crean en *Catálogos*, hay que agregarles su regla ($20.000 fijo). Ojo: cada concepto con fijo suma su propio bono.

## 6. Exportar a Excel (23/11/2026)

Botón **"Exportar a Excel"** en *Inicio*, *Servicios* y *Promedio de grúas*. Exporta **todos** los registros del filtro actual (no solo la página visible).

| Endpoint | Hojas | Notas |
|---|---|---|
| `GET /api/exportar/servicios` (mismos filtros del dashboard) | **Una sola hoja "Servicios"**: una fila por servicio (orden, fechas, cliente, operador, grúa, vehículo, tiempos de reacción y duración, km, valores, aprobación, entrega, observaciones) y los **trabajos adicionales en columnas**: por cada concepto usado en el periodo, `<concepto> (cant. …)` y `<concepto> ($)`, más "Total adicionales" | Máx. 20.000 filas. Los anulados no llevan valores (igual que el dashboard); sí sus cantidades |
| `GET /api/exportar/promedio-gruas?desde&hasta` | **Promedio de grúas** por día | Máx. 1 año |

Características del archivo:
- Fechas y horas como **fechas reales de Excel** (se pueden ordenar y filtrar), en **hora de Colombia** (verificado contra la base).
- Valores con formato **$ #.###**, encabezado azul oscuro congelado, **filtros de Excel** activados.
- Fila **TOTAL** con `SUBTOTAL(9, …)`: suma solo las filas visibles cuando se filtra en Excel.
- Permisos: administrador y financiero (`reportes:ver`). El operador recibe 403.

Código: `backend/services/excel.service.js` (genérico: `crearExcel({ titulo, hojas })` sirve para cualquier reporte nuevo), `backend/models/exportar.model.js`, `backend/routes/exportar.routes.js`, `frontend/src/components/admin/BotonExportar.jsx`.

Librería nueva: **ExcelJS 4.4.0** (MIT). `npm audit` reporta 2 avisos moderados en `uuid` (dependencia interna de ExcelJS para identificadores del archivo; no recibe datos del usuario) y 2 en `nodemon` (solo desarrollo). Revisar en la Etapa 7.

## 6.1 Órdenes de servicio en PDF (23/11/2026)

| Dónde | Qué descarga |
|---|---|
| *Servicios* → botón **"Órdenes en PDF"** | **Todas** las órdenes del filtro actual, una por página (máx. 500 por archivo) — `GET /api/exportar/ordenes` (mismos filtros que el Excel) |
| *Servicios* → ícono PDF en cada fila | La orden de ese servicio — `GET /api/exportar/ordenes/:id` |
| *Detalle del servicio* → **"Orden en PDF"** | La orden de ese servicio (también aprobados y anulados) |

Cada orden (tamaño carta): encabezado con N.º de orden, fecha y estado; datos del servicio (cliente, NIT, tipo, operador, grúa); vehículo; recorrido y tiempos (origen, destino, horas, reacción, duración, km); trabajos adicionales (máx. 8 renglones, el resto se indica); valores (tarifa básica, adicionales, calculado, **aprobado** y quién lo aprobó); entrega; observaciones; firmas del operador y de quien recibe; pie con fecha de generación y "Página X de Y". Los **anulados** llevan la marca de agua "ANULADO". Los textos largos se cortan con "…" para que cada orden quepa en una página.

- El dinero solo aparece si el usuario tiene `valores:ver` (hoy: administrador y financiero).
- Permisos: `reportes:ver`. El operador recibe 403.
- Código: `backend/services/pdf.service.js` (diseño de la orden), rutas en `backend/routes/exportar.routes.js`. Librería **PDFKit 0.20.2** (MIT), con las fuentes estándar del PDF (no requiere instalar fuentes).

## 7. Pendiente / ideas

- Reportes por operador y por cliente en pantalla propia (el backend ya tiene `/api/dashboard/por/operador` y `/por/cliente`).
- ~~Cierre de turnos olvidados desde el panel~~: hecho en Turnos (sección 5.3).
- ~~Pantalla de configuración (porcentaje del operador, recargo nocturno)~~: hecho en Tarifas → Pago a operadores y Clientes → Recargo nocturno desde.
