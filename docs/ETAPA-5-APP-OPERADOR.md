# GruaLink — Etapa 5: App móvil del operador

> Fecha: 20/11/2026 · Estado: **construida y probada de punta a punta en el navegador (tamaño celular)**

## 0. Resultado de la prueba manual (20/11/2026)

Flujo recorrido en el navegador, contra la base de pruebas: login → inicio de turno → nuevo servicio (4 pasos) → recuperar borrador tras recargar → guardar (Orden #7) → finalizar con km y trabajos adicionales → detalle bloqueado → mis servicios, historial, perfil → finalizar turno con un servicio abierto (pide justificación) → inicio "sin turno". Valores verificados por API como administrador (ej. $393.000 + 1,5 h × $108.000 = $555.000) y ocultos para el operador.

| Problema encontrado | Corrección |
|---|---|
| **"Nuevo servicio" quedaba en blanco**: un `useEffect(() => window.scrollTo(0, 0))` devolvía un valor y React desmontaba la página | El efecto se escribe con llaves `{ }` (no devuelve nada). Regla: un `useEffect` solo puede devolver nada o una función |
| Se aceptaba una **hora de inicio anterior a la de solicitud** (tiempo de reacción negativo) | Validado en el celular y en el servidor (crear, finalizar y corregir) + prueba automática |
| La placa se mostraba "WCS 473" en el resumen | Se normaliza al escribir (mayúsculas, sin espacios ni guiones) |
| Decimales con punto ("1.5 hora") | `formatoNumero` / `cantidadConUnidad`: "1,5 horas", "7,5 km" |
| Casillas de trabajos y lista "Tipo de servicio" sin nombre accesible | `aria-label` e `id` |
| El panel administrativo anterior no tenía "Cerrar sesión" en pantallas angostas | Botón de salida siempre visible en la barra superior |

Pendiente de revisar con el navegador visible: al elegir el **tipo de servicio** el menú no se cerró en la prueba automatizada (probablemente porque el navegador de pruebas estaba oculto y no corren las animaciones). Si te pasa en tu celular, avísame.

## 1. Cómo se organiza

La app del operador vive en el mismo proyecto `frontend/`, bajo la ruta **`/app`**, con su propio diseño móvil (no es el escritorio reducido). Después del login, cada rol va a lo suyo:

| Rol | Entra a |
|---|---|
| operador | `/app` (esta app) |
| administrador, financiero | `/panel` (pantallas anteriores; se rehacen en la Etapa 4) |

```text
frontend/src/
├── api/                    client.js · auth.api.js · turnos.api.js · servicios.api.js · catalogos.api.js
├── context/
│   ├── AuthContext.jsx     sesión; valida el token guardado con /auth/yo al abrir la app
│   └── TurnoContext.jsx    turno activo compartido por todas las pantallas de /app
├── hooks/useCargar.js      carga datos con estado cargando / error / recargar
├── utils/formato.js        fechas y horas en hora de Colombia, estados, mensajes de error
├── utils/roles.js          a dónde va cada rol después del login
├── routes/RutaProtegida.jsx
├── layouts/OperadorLayout.jsx   marco móvil + navegación inferior
├── components/
│   ├── Marca.jsx                  logo GruaLink
│   └── operador/
│       ├── Comunes.jsx            barra superior, chips de estado, cargando, errores, filas de datos
│       └── PasosServicio.jsx      pasos del formulario de servicio
└── pages/
    ├── LoginPage.jsx              (común)
    └── operador/                  las 9 pantallas
```

## 2. Pantallas

| Ruta | Pantalla | Qué hace |
|---|---|---|
| `/login` | Iniciar sesión | Correo, contraseña (con botón para ver), mensajes claros |
| `/app` | Inicio | Saludo, **estado del turno** (verde = activo con grúa y duración; amarillo = sin turno), accesos, **servicios pendientes por finalizar** |
| `/app/turno/iniciar` | Inicio de turno | Elegir grúa (las ocupadas aparecen deshabilitadas), observaciones. Hora = servidor |
| `/app/turno/finalizar` | Fin de turno | Resumen del turno; si hay servicios abiertos de este turno, los lista y exige justificación; confirmación |
| `/app/turnos` | Historial | Pestañas Hoy / Semana / Mes |
| `/app/servicios` | Mis servicios | Pestañas Todos / En curso / Finalizados, buscador, botón + |
| `/app/servicios/nuevo` | Nuevo servicio | 4 pasos: Cliente → Vehículo → Servicio → Resumen. Al guardar muestra el **número de orden** y ofrece "Finalizar ahora" |
| `/app/servicios/:id` | Detalle | Solo lectura. Si está abierto: botón "Finalizar servicio" |
| `/app/servicios/:id/finalizar` | Finalizar servicio | Hora fin, km (vacío/servicio), **trabajos adicionales** con cantidad (+/−, horas de 0,5 en 0,5), entrega, quién recibe; confirmación |
| `/app/perfil` | Perfil | Datos y cerrar sesión (avisa si el turno sigue activo: cerrar sesión no cierra el turno) |

## 3. Decisiones de diseño para la operación en campo

- **Botones grandes** (52 px), textos de 16 px (evita el zoom automático del iPhone), tipo de vehículo con botones en vez de lista desplegable.
- **Borrador automático**: el formulario de nuevo servicio se guarda en el celular mientras se llena. Si se cierra la app o se reinicia el teléfono, al volver aparece "Recuperamos el servicio que estabas llenando" (con opción de descartar).
- **Sin doble envío**: los botones de guardar se bloquean mientras se envía, y el backend además impide finalizar dos veces.
- **Errores del servidor llevados al paso correcto**: si el backend rechaza un campo (ej. placa), el formulario vuelve al paso donde está ese campo y lo marca en rojo.
- **Sin señal**: si no hay conexión, el mensaje lo dice claramente y hay botón "Reintentar". La sesión no se borra por falta de internet (solo si el servidor dice que expiró).
- **El operador nunca ve valores en $**: el backend no los envía; la app solo muestra los trabajos realizados y sus cantidades.
- **Hora de Colombia** en todas las fechas, sin importar la configuración del celular.

## 4. Cómo correr la app

Dos terminales de **PowerShell**:

```powershell
cd backend
npm run dev
```

```powershell
cd frontend
npm run dev
```

Abrir `http://localhost:5173` e ingresar con un operador de prueba (`operador1@grualink.test`; contraseña en `backend/seeds/seed.js`).

**Probar desde un celular en la misma red Wi-Fi:** en `frontend` ejecutar `npm run dev -- --host` y abrir en el celular la dirección "Network" que muestra Vite (ej. `http://192.168.1.20:5173`).

**Probar sin gastar números de orden de la base de desarrollo:** el archivo `.claude/launch.json` incluye `backend-pruebas` (puerto **4001**, base `GruaLink_test`) y `frontend-pruebas` (puerto **5180**, conectado al 4001). Así nunca se mezclan con los servidores de desarrollo (4000 y 5173).

| Uso | Backend | Frontend | Base de datos |
|---|---|---|---|
| Desarrollo (el tuyo) | 4000 | 5173 | `GruaLink` |
| Pruebas | 4001 | 5180 | `GruaLink_test` (solo usuarios `@grualink.test`) |

`vite.config.js` usa `strictPort`: si el 5173 está ocupado, Vite **falla con un mensaje** en vez de abrir otro puerto en silencio. (Antes abría el 5174 y terminaba conectado al backend equivocado.)

## 5. Cambios fuera de `/app`

- `LoginPage.jsx`: rediseño móvil; redirige según el rol.
- `App.jsx`: rutas `/app/*` para el operador; las pantallas anteriores quedan **solo para administrador/financiero**. Se quitó la ruta `/ordenes/nueva` (el formulario anterior ya no funcionaba con la API: no tenía turno ni tipo de servicio). Los archivos anteriores **no se borraron**.
- `LayoutPrincipal.jsx`: menú solo para administración ("Servicios" en vez de "Nueva orden" / "Mis servicios").
- `MonitoreoPage`, `ListadoOrdenesPage`, `DetalleOrdenPage`: usan los nuevos nombres de campo (`cliente_nombre`, `grua_numero`).
- **MUI 9**: ya no acepta estilos como props sueltas (`alignItems="center"`, `fontWeight={700}`…). Se movieron a `sx={{ … }}` en todos los archivos. Regla para el futuro: **todo estilo va dentro de `sx`**.
- Backend: el listado de servicios ahora incluye `turno_id` (para saber qué servicios abiertos son del turno actual).

## 6. Pendiente

- **Verificación visual** en celular / navegador de todo el flujo (ver lista de comprobación abajo).
- `npm run lint` marca un aviso en `ListadoOrdenesPage.jsx` (pantalla anterior de administración): se resuelve al rehacerla en la Etapa 4.
- Opcional, fase posterior: convertir la app en **PWA** (instalable en el celular con ícono propio) y modo sin conexión (P14).

### Lista de comprobación manual

1. Login como operador → llega a `/app` con aviso amarillo "No has iniciado tu turno".
2. Iniciar turno con una grúa → aviso verde con hora y grúa.
3. Nuevo servicio: pasar los 4 pasos; cerrar la pestaña a mitad de camino y volver (debe recuperar el borrador).
4. Guardar → aparece "Orden #N"; "Finalizar servicio ahora" → llenar km y un trabajo adicional → finalizar.
5. Ver el detalle: bloqueado, sin valores en $.
6. Crear otro servicio y dejarlo abierto → finalizar turno pide justificación.
7. Historial muestra el turno; Perfil → cerrar sesión.
