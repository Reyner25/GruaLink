# GruaLink — Cómo está organizado el código

> Actualizado: 24/11/2026. Léalo antes de agregar un módulo nuevo: cada pieza tiene un lugar fijo, y seguir el mismo camino mantiene el proyecto fácil de leer.

## 1. Backend (Node + Express 5 + PostgreSQL)

Cada petición pasa por las mismas capas, siempre en este orden:

```text
routes/  →  middlewares/  →  validators/  →  controllers/  →  services/  →  models/  →  PostgreSQL
 (URL)      (sesión y         (reglas de      (HTTP ↔          (reglas de     (solo SQL)
            permisos)          los datos)      negocio)         negocio)
                                                    ↓
                                              views/serializers.js (oculta el dinero al operador)
```

| Carpeta | Qué va ahí | Qué NO va ahí |
|---|---|---|
| `routes/` | La URL, el permiso y la lista de validaciones. Una línea por ruta | Lógica, SQL, armar respuestas |
| `middlewares/` | `autenticar`, `requierePermiso`, manejo de errores | — |
| `validators/` | Reglas de express-validator y funciones `leer…(req.query)` que convierten los filtros a números | Consultas a la base |
| `controllers/` | Lee `req`, llama al servicio y responde (`res.json`, archivo) | Reglas de negocio, SQL |
| `services/` | Reglas de negocio, transacciones, bitácora, Excel y PDF | `req` / `res` |
| `models/` | Consultas SQL (con parámetros `$1`) | Reglas de negocio |
| `utils/` | Piezas pequeñas compartidas: `errorNegocio`, `diferencias`, `textos` (nombres de estados y unidades para reportes) | — |
| `migrations/` | Cambios de la base, numerados (`015_….sql`). Nunca se edita una ya aplicada | — |

### Módulos grandes divididos en carpetas

- **Servicios de grúa** (`services/servicio.service.js` es la puerta de entrada):
  - `services/servicio/operador.js`: crear y finalizar (celular).
  - `services/servicio/revision.js`: cambiar estado, aprobar y corregir (administrador).
  - `services/servicio/reglas.js`: transiciones de estado y validaciones de horas y catálogos.
  - `services/servicio/valores.js`: cálculo de valores, igual al finalizar y al corregir.
- **Descargas**:
  - `routes/exportar.routes.js` → `controllers/exportar.controller.js` → `services/exportar.service.js`. El servicio decide qué columnas lleva cada archivo.
  - `services/excel.service.js` y `services/pdf.service.js` les dan el formato.
- **Reportes en pantalla**:
  - `routes/reportes.routes.js` (dashboard, bitácora, cobro y liquidación) → `controllers/reportes.controller.js`.

### Agregar un módulo nuevo (ejemplo: "mantenimientos de grúa")

1. **Base de datos:**
   1. `migrations/015_mantenimientos.sql` (explicar el cambio antes de aplicarlo).
   2. `npm run migrate`.
   3. `npm run test:preparar`.
2. **Modelo:** `models/mantenimiento.model.js`, solo SQL. Si es una tabla sencilla, use `crearModeloCrud` (`models/crud.model.js`).
3. **Servicio:** `services/mantenimiento.service.js`, con las reglas, la transacción y la bitácora. Si es una tabla sencilla, use `crearServicioCatalogo` (`services/crudConBitacora.service.js`).
4. **Validaciones:** `validators/mantenimiento.validator.js`, usando las piezas de `validators/comun.js` (`texto`, `fecha`, `dinero`, `motivo`…).
5. **Controlador:** `controllers/mantenimiento.controller.js`. Si es una tabla sencilla, use `crearControladorCatalogo`.
6. **Ruta:**
   1. `routes/mantenimiento.routes.js`.
   2. Una línea en `routes/index.js`.
   3. El permiso en `middlewares/permisos.js` (`PERMISOS_POR_ROL`).
7. **Pruebas:**
   1. `tests/api.mantenimiento.test.js`, con `before(() => ctx.preparar(...))` de `tests/ayudas/contexto.js`.
   2. Cada archivo de pruebas crea sus propios datos.

## 2. Frontend (React + Vite + MUI 9)

```text
frontend/src/
├── api/            llamadas a la API (una función por endpoint)
├── context/        sesión del usuario (AuthContext)
├── hooks/          useCargar (cargar datos), useEnviar (guardar en diálogos), useFiltrosUrl
├── utils/          formato (moneda, fechas, números), roles (puede(usuario, permiso))
├── layouts/        AdminLayout (menú del panel), layout del operador
├── pages/admin/    una pantalla por opción del menú (arma la página con componentes)
├── pages/operador/ app del celular
└── components/
    ├── admin/servicio/   piezas del detalle de un servicio (diálogos, paneles, acciones)
    ├── admin/bolsaKm/    tabla de la bolsa de kilómetros y sus diálogos
    ├── admin/            Comunes, Filtros, CrudCatalogo, BotonExportar, GraficoBarras
    └── operador/         Comunes (Cargando, ErrorCarga, EstadoServicio), PasosServicio
```

Reglas:

- **Una pantalla grande se divide en una carpeta** de componentes (como `admin/servicio/`). La lógica sin pantalla va en un `.js` aparte; por ejemplo, `formularioCorreccion.js` calcula qué campos cambiaron.
- Los archivos `.jsx` exportan **solo componentes**. Las funciones y constantes compartidas van en un `.js`, porque así lo pide el recargado rápido de Vite y lo revisa ESLint.
- Los diálogos que guardan algo usan `useEnviar()` (estado "Guardando…" y mensaje de error).
- Los estilos van en `sx={{ … }}`.
- Los botones se muestran según `puede(usuario, "permiso")`. La seguridad real está en el backend.

## 3. Pruebas y calidad

| Qué | Comando | Dónde |
|---|---|---|
| Pruebas del backend (API real contra la base de pruebas) | `cd backend; npm test` | `backend/tests/*.test.js` |
| Un solo archivo de pruebas | `node --test tests/api.revision.test.js` | — |
| Revisar el frontend | `cd frontend; npm run lint` | — |
| Automático en GitHub | En cada push a `main` y en cada pull request | `.github/workflows/pruebas.yml` (pestaña **Actions**) |

Archivos de pruebas de la API, cada uno independiente:

| Archivo | Qué prueba |
|---|---|
| `api.operador.test.js` | Login, turnos y el flujo del celular |
| `api.revision.test.js` | Corregir, recargo nocturno, aprobar, pago al operador y PDF |
| `api.bolsaKm.test.js` | Bolsa de km de Suma y su tabla en Tarifas |
| `api.reportes.test.js` | Panel de turnos, dashboard y cobro mensual |
| `api.admin.test.js` | Catálogos, usuarios y tarifas |
| `db.restricciones.test.js` | Reglas que protege la propia base de datos |

> Las pruebas dependen de las **tarifas 2026** del seed (vigentes hasta el 31/12/2026). Antes de enero de 2027 hay que cargar las tarifas 2027 en `seeds/seed.js` (o mover las fechas de las pruebas). Si no, las pruebas empezarán a fallar el 1 de enero.
