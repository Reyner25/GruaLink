# GruaLink — Etapa 3: Backend

> Fecha: 20/11/2026 · Estado: **terminada y probada** (49/49 pruebas pasan)
> Parte 1 (secciones 1–7): núcleo del operador. Parte 2 (sección 8): administrador.

## 1. Cómo está organizado el código (MVC)

Una petición recorre siempre el mismo camino:

```text
routes/        ¿Qué URL? ¿Qué permiso pide?          turno.routes.js
  └ middlewares/   ¿Hay sesión? ¿Tiene el permiso?   auth.js, permisos.js
  └ validators/    ¿Los datos son válidos?           turno.validator.js
  └ controllers/   Traduce HTTP ↔ negocio            turno.controller.js
      └ services/  REGLAS DE NEGOCIO (aquí se piensa) turno.service.js
          └ models/  SOLO SQL parametrizado           turno.model.js
      └ views/     Qué campos ve cada rol            serializers.js
middlewares/errorHandler.js  convierte cualquier error en una respuesta clara
```

**Regla para editar:** si quieres cambiar *qué se valida* → `validators/`. *Qué regla de negocio aplica* → `services/`. *Qué consulta se hace* → `models/`. *Quién puede* → `middlewares/permisos.js` (único lugar con los permisos de cada rol).

## 2. Endpoints nuevos o cambiados

### Autenticación — `/api/auth`
| Método | Ruta | Quién | Qué hace |
|---|---|---|---|
| POST | `/login` | todos | `{email, password}` → `{token, usuario{…, permisos}}` |
| POST | `/logout` | sesión | cierra la sesión |
| GET | `/yo` | sesión | usuario actual con sus permisos (para recargar la app) |

### Turnos — `/api/turnos`
| Método | Ruta | Quién | Qué hace |
|---|---|---|---|
| GET | `/activo` | operador | turno activo o `null` |
| GET | `/gruas-disponibles` | operador | grúas activas con `en_uso` |
| POST | `/iniciar` | operador | `{grua_id, observaciones?}` — hora del servidor |
| POST | `/finalizar` | operador | `{observaciones?, justificacion?}` — justificación obligatoria si hay servicios abiertos |
| GET | `/` | operador (propios) · admin (todos) | historial `?desde&hasta&pagina` |
| POST | `/:id/cerrar` | admin | cierra un turno olvidado `{motivo}` |

### Servicios — `/api/servicios`
| Método | Ruta | Quién | Qué hace |
|---|---|---|---|
| POST | `/` | operador con turno activo | crea el servicio → estado `en_servicio` |
| POST | `/:id/finalizar` | operador dueño | hora fin, km, entrega, conceptos → calcula valores → `finalizado` (una sola vez) |
| GET | `/` | operador (propios) · admin/financiero (todos) | listado con filtros |
| GET | `/:id` | dueño · admin · financiero | detalle + conceptos |
| PATCH | `/:id/estado` | admin | revisión / aprobación / anulación |

### Catálogos — `/api/catalogos`
Ahora devuelve también `tipos_servicio` y `conceptos` (sin precios), y el NIT y teléfono de cada cliente.

## 3. Reglas de negocio implementadas

| Regla | Dónde |
|---|---|
| El operador, la grúa, el turno, el número de orden, el estado y los valores en $ los pone **el servidor**. Si el celular los envía, se descartan (lista blanca) | `validators/comun.js`, `services/servicio.service.js` |
| Sin turno activo no se registran servicios | `servicio.service.js` |
| La grúa del servicio es la del turno | `servicio.service.js` |
| Un operador / una grúa no pueden tener dos turnos activos | BD + `turno.service.js` |
| Un servicio solo se finaliza una vez, aun con dos clics simultáneos (`SELECT … FOR UPDATE`) | `servicio.service.js` |
| Tarifa: primero la del cliente; si no tiene, "Clientes generales". Si hay dos que aplican → error, nunca al azar | `tarifa.service.js` |
| Conceptos: precio del cliente o general; total = valor × cantidad (admite 1,5 horas) | `tarifa.service.js` |
| Rescate ("a convenir"): no se calcula; queda `requiere_valor_manual` para el admin | `tarifa.service.js` |
| El operador nunca recibe valores en $ en las respuestas | `views/serializers.js` |
| Horas no pueden estar en el futuro (tolerancia 10 min); fin ≥ inicio | `servicio.service.js` |
| Todo queda en bitácora: iniciar/finalizar/cerrar turno, crear/finalizar servicio, cambios de estado | servicios |
| Errores de PostgreSQL traducidos a mensajes claros (duplicado, superposición, etc.) | `middlewares/errorHandler.js` |
| Login: límite por IP **+ correo**; misma demora exista o no el correo | `app.js`, `auth.controller.js` |
| Fechas `DATE` llegan como `"2026-11-20"` (antes se corrían un día por la zona horaria); conexión en hora de Colombia | `config/db.js` |

### Reglas PROVISIONALES (marcadas en el código, a confirmar)

| # | Regla provisional | Para cambiarla |
|---|---|---|
| P3 | El operador **elige** la grúa al iniciar turno | `turno.service.js` |
| P8 | Km facturables = km de servicio (sin vacío) | `kmFacturables()` en `tarifa.service.js` |
| P9 | El operador puede reportar conceptos (cardán, persiana, stand-by…) al finalizar; el precio lo pone el servidor | `servicio.validator.js` |
| P10 | Conceptos "porcentaje" se rechazan | `tarifa.service.js` |
| P11 | `porcentaje_operador` aún no se calcula | — |
| P12 | El operador no ve valores | `serializers.js` |
| P13 | Fecha del servicio entre el día de inicio del turno y hoy | `servicio.service.js` |

## 4. Pruebas

Las pruebas corren sobre una **base aparte** (`GruaLink_test`) para no gastar números de orden ni ensuciar la de desarrollo.

Todos los comandos en **PowerShell**, dentro de `backend`:

```powershell
npm run test:preparar
```
Crea la base de pruebas, aplica migraciones y seed. Una vez, y de nuevo cada vez que haya una migración nueva.

```powershell
npm test
```
Corre las 33 pruebas: 8 de restricciones de BD + 25 de la API (login, turnos, servicios, permisos, cálculo de tarifas, finalización simultánea, bitácora).

**Usuarios de prueba** (contraseña en `seeds/seed.js`, `PASSWORD_PRUEBA`): `admin@grualink.test`, `operador1@grualink.test`, `operador2@grualink.test`, `financiero@grualink.test`.

> Las pruebas usan las tarifas 2026 del seed: en 2027 habrá que actualizar las vigencias del seed.

## 5. Impacto en el frontend actual

El formulario actual (`frontend/src/pages/OrdenServicioPage.jsx`) **ya no funciona** con esta API: envía `grua_id` y km al crear y no envía `tipo_servicio_id` ni tiene turno. Es esperado: la interfaz móvil del operador se construye nueva en la Etapa 5 con el flujo turno → crear → finalizar.

## 6. Archivos

**Nuevos:** `app.js`, `utils/errores.js`, `validators/comun.js`, `validators/auth.validator.js`, `validators/turno.validator.js`, `models/turno.model.js`, `models/grua.model.js`, `services/turno.service.js`, `controllers/turno.controller.js`, `routes/turno.routes.js`, `tests/entorno.js`, `tests/preparar-db-test.js`, `tests/api.operador.test.js`.

**Modificados:** `server.js` (solo arranca), `config/db.js`, `middlewares/{auth,permisos,errorHandler}.js`, `controllers/{auth,servicio,catalogos}.controller.js`, `models/{servicio,tarifa,catalogos,usuario}.model.js`, `services/{servicio,tarifa}.service.js`, `validators/servicio.validator.js`, `views/serializers.js`, `routes/{index,auth,servicio,catalogos}.routes.js`, `seeds/seed.js` (admin de prueba + catálogos base), `tests/db.restricciones.test.js` (usa la base de pruebas), `package.json` (`test:preparar`).

## 7. (Parte 1 terminada)

---

## 8. Parte 2 — Módulos del administrador

### 8.1 Piezas reutilizables (para no repetir código)

| Archivo | Qué hace | Cuándo usarlo |
|---|---|---|
| `models/crud.model.js` | `crearModeloCrud({tabla, columnas, select, orden})` → listar / obtenerPorId / crear / actualizar con SQL parametrizado y lista blanca de columnas | Cualquier tabla nueva sencilla |
| `services/catalogoAdmin.service.js` | `crearServicioCatalogo({modelo, entidad})` → igual, pero en transacción y **con bitácora automática** (solo los campos que cambiaron) | Junto con el anterior |
| `controllers/catalogoAdmin.controller.js` | `crearControladorCatalogo(servicio, {clave, …})` → los 4 manejadores HTTP | Junto con los anteriores |
| `validators/comun.js` | `texto`, `textoNulable`, `booleano`, `entero`, `dinero`, `fecha`, `motivo`, `alMenosUnCampo` | En cualquier validador |
| `utils/diferencias.js` | Compara antes/después para la bitácora | Correcciones, ediciones |

**Ejemplo — agregar un catálogo nuevo "patios":** 1) migración `007_patios.sql`; 2) en `models/catalogosAdmin.model.js` un `crearModeloCrud({ tabla: "patios", columnas: ["nombre","activo"] })`; 3) en `services/catalogosAdmin.service.js` un `crearServicioCatalogo(...)`; 4) reglas en `validators/catalogoAdmin.validator.js`; 5) un `routerCatalogo(...)` en `routes/catalogosAdmin.routes.js` y montarlo en `routes/index.js`.

### 8.2 Endpoints del administrador

| Ruta | Métodos | Notas |
|---|---|---|
| `/api/clientes` | GET, GET /:id, POST, PATCH /:id | `?buscar=` `?activo=`. NIT normalizado. No se borra: `activo:false` |
| `/api/tipos-vehiculo`, `/api/tipos-servicio`, `/api/conceptos` | igual | Concepto ya usado: no se cambia su unidad de cobro |
| `/api/gruas` | GET, GET /:id, GET /:id/historial, POST, PATCH /:id, **POST /:id/estado** | Estado con motivo → historial. No a taller si está en turno |
| `/api/usuarios` | GET /roles, GET, GET /:id, POST, PATCH /:id, **POST /:id/password** | Nunca devuelve la contraseña. Desactivar cierra sus sesiones |
| `/api/tarifas`, `/api/precios-concepto` | GET, GET /:id, POST, PATCH /:id, DELETE /:id | `?cliente_id=<id>\|generales` `?vigente_en=`. Usadas: solo cerrar vigencia |
| `/api/servicios/:id/estado` | PATCH | en_revision, devolver a finalizado, anular (motivo obligatorio) |
| `/api/servicios/:id/aprobar` | POST | `{valor_aprobado?, motivo?}` |
| `/api/servicios/:id/corregir` | POST | `{…campos, conceptos?, motivo}` → recalcula |
| `/api/turnos?operador_id=` | GET | Historial de todos los operadores |
| `/api/dashboard/resumen` | GET | Flota + totales + serie diaria. Filtros: desde, hasta, cliente_id, grua_id, operador_id, estado |
| `/api/dashboard/por/:agrupacion` | GET | `cliente` · `grua` · `operador` |
| `/api/dashboard/promedio-gruas` | GET | Por día: total, en operación, mantenimiento, inactivas, % disponibilidad (máx. 1 año) |
| `/api/bitacora` | GET | Filtros: entidad, registro_id, usuario_id, operacion, desde, hasta |

Consulta (GET) de clientes, grúas, tarifas y dashboard: administrador **y financiero**. Modificaciones, usuarios y bitácora: **solo administrador**.

### 8.3 Reglas de negocio nuevas

| Regla | Dónde |
|---|---|
| **Tarifas usadas no se tocan**: si un servicio ya se calculó con una tarifa (o precio de concepto), solo se puede cerrar su vigencia, nunca antes del último servicio que la usó. Para cambiar el precio: cerrar y crear una nueva. Las no usadas se corrigen o borran libremente | `services/tarifaAdmin.service.js` |
| **Aprobar**: solo finalizado/en revisión. Sin valor → se aprueba el calculado. "A convenir" → valor obligatorio. Valor distinto del calculado → motivo obligatorio | `servicio.service.js → aprobar` |
| **Corregir**: solo administrador, motivo obligatorio, no en aprobados/anulados. Si ya estaba finalizado se **recalcula** (tarifa y conceptos vigentes en la fecha del servicio). Bitácora `autorizar_correccion` con valores anteriores y nuevos, incluidos los conceptos | `servicio.service.js → corregir` |
| **Anular**: motivo obligatorio | `servicio.service.js → cambiarEstado` |
| Grúa en turno activo no pasa a mantenimiento/inactiva; operador en turno no se desactiva | `grua.service.js`, `usuario.service.js` |
| Un administrador no se desactiva ni se cambia el rol a sí mismo | `usuario.service.js` |
| Contraseñas: mínimo 8 caracteres con letra y número; nunca en respuestas ni bitácora | `routes/usuario.routes.js`, `usuario.service.js` |
| Dashboard: todo con `COUNT/SUM/GROUP BY` en PostgreSQL. Los anulados no suman dinero. Tiempo de reacción = inicio − solicitud | `models/dashboard.model.js` |
| "Promedio de grúas": en operación = grúas con turno ese día; mantenimiento/inactivas = último estado del historial al final del día | `models/dashboard.model.js` |

### 8.4 Detalle técnico a tener en cuenta

- **"Usado" en precios de concepto** se detecta por coincidencia (mismo concepto, cliente, vigencia y valor unitario cobrado), porque `servicio_conceptos` guarda el valor cobrado y no el id del precio. Si en el futuro se quiere exactitud total, se agrega `servicio_conceptos.precio_id` en una migración.
- **`porcentaje_operador`** sigue sin calcularse (P11): la columna es `NUMERIC(5,2)` (porcentaje), pero en el Excel es un valor en pesos. Hay que decidir qué se guarda antes de programarlo.
- **Dashboard de la flota** (activas/mantenimiento/inactivas/en turno) es el estado **actual**; las cifras por fecha están en "promedio de grúas".

### 8.5 Pruebas

`tests/api.admin.test.js`: 16 pruebas nuevas — permisos por rol, CRUD con bitácora, historial de grúas, usuarios (contraseña nunca expuesta, sesiones cerradas al desactivar), tarifas (superposición, protección de tarifas usadas), flujo completo servicio → corrección → revisión → aprobación, rescate a convenir, anulación, dashboard con cifras exactas, promedio de grúas y orden de la bitácora. Se pueden repetir: cada corrida crea sus datos con un sufijo único.

```powershell
npm test
```

### 8.6 Siguiente

**Etapa 5 — interfaz móvil del operador** (recomendada antes del panel admin) o **Etapa 4 — panel administrativo**. El backend de ambas ya está listo.
