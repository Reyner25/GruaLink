# GruaLink — Etapa 7: Preparación para producción

> Fecha: 23/11/2026 · Estado: **la aplicación está lista para instalarse**; falta decidir el servidor y publicarlo con HTTPS.

## 1. Qué se preparó (y se probó)

| Tema | Qué hace | Dónde |
|---|---|---|
| **Un solo servidor** | En producción la API también entrega la app web compilada: un solo proceso y un solo puerto | `backend/app.js` |
| **Validación al arrancar** | Si falta `DATABASE_URL`, la app compilada, etc., no arranca y dice qué falta. Avisa si la API usa el superusuario `postgres` | `backend/config/entorno.js` |
| **Estado del servicio** | `GET /api/salud` → `{"estado":"ok","base_de_datos":"ok"}` (sin sesión, para monitoreo) | `backend/app.js` |
| **Usuario de BD con permisos mínimos** | `grualink_app`: lee y escribe datos, **no** cambia estructura, **no** modifica ni borra la bitácora | `npm run crear-usuario-app` |
| **Sin usuarios de prueba** | `npm run seed` se niega a correr en producción. `npm run datos-iniciales` carga solo catálogos y tarifas | `backend/seeds/seed.js` |
| **Primer administrador** | `npm run crear-admin` pide nombre, correo y contraseña (oculta) | `backend/scripts/crear-admin.js` |
| **Limpieza de sesiones** | Cada hora borra las sesiones vencidas | `backend/services/mantenimiento.service.js` |
| **Errores** | Al cliente: mensaje genérico en errores 500 (sin códigos internos). Al registro del servidor: fecha, ruta, usuario y detalle | `backend/middlewares/errorHandler.js` |
| **Seguridad HTTP** | Helmet con CSP; HSTS y `upgrade-insecure-requests` solo con `SITIO_HTTPS=true`; sin `X-Powered-By`; `trust proxy` configurable | `backend/app.js` |
| **Caché** | `index.html` sin caché (las actualizaciones se ven de inmediato); `/assets/*` caché de un año (nombres con huella) | `backend/app.js` |
| **Respaldos** | Retención (conserva los últimos N), carpeta configurable, `respaldos.log`, tarea diaria de Windows | `scripts/respaldo.js`, `scripts/programar-respaldo.ps1` |
| **Apagado ordenado** | Termina peticiones en curso y cierra conexiones a la base | `backend/server.js` |

**Prueba realizada (23/11/2026):** GruaLink en modo producción, conectado con `grualink_app` a la base de pruebas: salud ✔, app web ✔, rutas de React ✔, caché ✔, CSP ✔, login ✔, listado ✔, Excel ✔, crear cliente ✔; `grualink_app` **no** pudo modificar ni borrar la bitácora, crear o borrar tablas ni tocar `schema_migrations` ✔. En el navegador, la app cargó sin errores de CSP. 53/53 pruebas automáticas.

## 2. Decisión pendiente: ¿dónde se instala?

Los operadores usan la app **desde el celular, fuera de la oficina**, así que el servidor debe ser accesible **desde internet con HTTPS**.

| Opción | A favor | En contra |
|---|---|---|
| **A. Servidor Windows de SOTRANDES** (en la oficina) | Los datos quedan en la empresa; sin costo mensual | Requiere IP pública o túnel, abrir puerto 443, certificado, y que el equipo esté siempre encendido |
| **B. Servidor en la nube** (VPS Linux, ~USD 6–12/mes) | Siempre disponible, IP pública, HTTPS sencillo con Caddy | Costo mensual; los datos salen de la oficina |
| **C. Túnel** (Cloudflare Tunnel) + servidor de la oficina | HTTPS sin abrir puertos ni IP pública | Depende de un tercero; configuración inicial |

La aplicación funciona igual en las tres. Los pasos de la sección 3 sirven para cualquiera; solo cambia cómo se publica con HTTPS (sección 4).

## 3. Instalación paso a paso (servidor Windows)

Todo en **PowerShell como administrador**, en el servidor.

1. Instalar **Node.js LTS**, **Git** y **PostgreSQL 18**.
2. Descargar el código (fuera de OneDrive):
   ```powershell
   cd C:\
   ```
   ```powershell
   git clone https://github.com/Reyner25/GruaLink.git
   ```
3. Crear la base vacía (en *SQL Shell (psql)*, como `postgres`):
   ```sql
   CREATE DATABASE "GruaLink";
   ```
4. Configurar `C:\GruaLink\backend\.env` (copiar de `.env.example`). Primero **solo** con el usuario dueño:
   ```text
   NODE_ENV=production
   PORT=4000
   DATABASE_URL=postgres://postgres:CLAVE_DUENO@localhost:5432/GruaLink
   SESSION_TTL_HORAS=12
   ```
5. Instalar dependencias y compilar la app web:
   ```powershell
   cd C:\GruaLink\backend; npm ci --omit=dev
   ```
   ```powershell
   cd C:\GruaLink\frontend; npm ci; npm run build
   ```
6. Crear la estructura y los catálogos:
   ```powershell
   cd C:\GruaLink\backend; npm run migrate
   ```
   ```powershell
   npm run datos-iniciales
   ```
   > ¿Llevar los datos de desarrollo? En vez de `datos-iniciales`, `npm run restaurar -- <respaldo.dump>`. **Ojo:** trae los usuarios de prueba; desactívelos en el panel → Usuarios.
7. Crear el usuario de permisos mínimos y el administrador real:
   ```powershell
   npm run crear-usuario-app
   ```
   ```powershell
   npm run crear-admin
   ```
8. Cambiar el `.env` a las dos conexiones (lo imprime el paso anterior):
   ```text
   DATABASE_URL=postgres://grualink_app:CLAVE_APP@localhost:5432/GruaLink
   DATABASE_URL_ADMIN=postgres://postgres:CLAVE_DUENO@localhost:5432/GruaLink
   ```
9. Probar:
   ```powershell
   npm start
   ```
   Abrir `http://localhost:4000` e ingresar con el administrador. Debe decir `GruaLink PRODUCCIÓN escuchando en puerto 4000`.
10. Dejarlo como **servicio de Windows** (arranca solo al encender el equipo). Opción sencilla con NSSM (nssm.cc):
    ```powershell
    nssm install GruaLink "C:\Program Files\nodejs\node.exe" "C:\GruaLink\backend\server.js"
    ```
    ```powershell
    nssm set GruaLink AppDirectory C:\GruaLink\backend
    ```
    ```powershell
    nssm set GruaLink AppStdout C:\GruaLink\logs\grualink.log
    ```
    ```powershell
    nssm set GruaLink AppStderr C:\GruaLink\logs\grualink-errores.log
    ```
    ```powershell
    nssm start GruaLink
    ```
11. Programar el respaldo diario (configure antes `RESPALDOS_DIR` en el `.env`, idealmente otro disco):
    ```powershell
    cd C:\GruaLink\backend; powershell -ExecutionPolicy Bypass -File .\scripts\programar-respaldo.ps1
    ```

## 4. Publicar con HTTPS

GruaLink escucha en `http://localhost:4000`; delante va un **proxy inverso** que pone el certificado HTTPS. Luego, en el `.env`:

```text
TRUST_PROXY=1
SITIO_HTTPS=true
```

- **Caddy** (recomendado; obtiene y renueva el certificado solo). `Caddyfile`:
  ```text
  grualink.sotrandes.com {
      reverse_proxy localhost:4000
  }
  ```
- **IIS** con *URL Rewrite* + *ARR* (si la empresa ya usa IIS), con certificado de win-acme.
- **Cloudflare Tunnel** (opción C): `cloudflared tunnel` apuntando a `http://localhost:4000`.

Se necesita un **dominio o subdominio** (ej. `grualink.sotrandes.com`) apuntando al servidor.

## 5. Actualizar a una versión nueva

```powershell
cd C:\GruaLink\backend; npm run respaldo
```
```powershell
cd C:\GruaLink; git pull
```
```powershell
cd backend; npm ci --omit=dev; npm run migrate
```
```powershell
cd ..\frontend; npm ci; npm run build
```
```powershell
nssm restart GruaLink
```
Si la migración agregó tablas: `cd ..\backend; npm run crear-usuario-app` (Enter para no cambiar la clave) para darle permisos a `grualink_app`.

## 6. Mantenimiento

| Qué | Cómo |
|---|---|
| ¿Está funcionando? | Abrir `https://<sitio>/api/salud` |
| Errores | `C:\GruaLink\logs\grualink-errores.log` |
| Respaldos | `respaldos.log` en la carpeta de respaldos. **Probar restaurar** un respaldo en otro equipo cada mes |
| Restaurar | `npm run respaldo` (por seguridad) → `npm run restaurar -- <archivo>` → `npm run crear-usuario-app` |
| Olvido de contraseña del admin | `npm run crear-admin` con el mismo correo (restablece la contraseña) |
| Dependencias | `npm audit` cada cierto tiempo. Hoy: 2 avisos moderados en `uuid` (interno de ExcelJS, sin datos del usuario) y 2 en `nodemon` (solo desarrollo, no se instala con `--omit=dev`) |

## 7. Lista de verificación antes de abrir a los operadores

- [ ] HTTPS funcionando y `SITIO_HTTPS=true`
- [ ] `DATABASE_URL` con `grualink_app` (el arranque no muestra el aviso de superusuario)
- [ ] No existen usuarios `@grualink.test` activos
- [ ] Tarifas 2026 revisadas en el panel (las iniciales vienen del Excel: generales, CAPITALBUS y La Rolita)
- [ ] Clientes y grúas reales cargados
- [ ] Respaldo diario programado y **una restauración de prueba** hecha
- [ ] Cada operador creado con su usuario y probado en su celular
- [ ] Decididas P11 (porcentaje del operador) y P17 (recargo nocturno)
