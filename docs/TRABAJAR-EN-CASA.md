# Trabajar en GruaLink desde otro computador (casa)

> Código → **GitHub** (`https://github.com/Reyner25/GruaLink`) · Datos → **respaldo** en OneDrive (`respaldos/`)

El código y los datos viajan por caminos distintos a propósito:

| Qué | Cómo viaja | Por qué |
|---|---|---|
| Código (backend, frontend, migraciones, docs) | GitHub (`git push` / `git pull`) | Historial de cambios, sin conflictos |
| Datos de la base (clientes, servicios, usuarios) | Archivo `.dump` en `respaldos/` (OneDrive) | Tiene datos reales: **nunca** va a GitHub |
| Contraseñas (`backend/.env`) | **No viaja**: se crea en cada equipo | Cada PostgreSQL tiene su propia clave |

## 1. Instalar en el computador de casa (una sola vez)

- **Node.js** (versión LTS) — nodejs.org
- **Git** — git-scm.com
- **PostgreSQL 18 o más nuevo** — postgresql.org. ⚠ El respaldo se hizo con PostgreSQL 18: una versión **anterior** (17, 16…) no lo puede restaurar. Al instalarlo anote la contraseña del usuario `postgres`.

## 2. Descargar el código (una sola vez)

Recomendado: en una carpeta **fuera de OneDrive** (OneDrive se pone lento con `node_modules` y sincronizaría tu `.env` de casa con el de la oficina).

```powershell
cd C:\
```
```powershell
git clone https://github.com/Reyner25/GruaLink.git
```

## 3. Crear la base de datos vacía

En **SQL Shell (psql)** (viene con PostgreSQL), conectado como `postgres`:

```sql
CREATE DATABASE "GruaLink";
```

## 4. Configurar `backend/.env`

Copiar `backend/.env.example` como `backend/.env` y cambiar la línea de conexión con **la contraseña de PostgreSQL de casa**:

```text
DATABASE_URL=postgres://postgres:TU_CLAVE_DE_CASA@localhost:5432/GruaLink
```

## 5. Instalar dependencias

```powershell
cd C:\GruaLink\backend
```
```powershell
npm install
```
```powershell
cd C:\GruaLink\frontend
```
```powershell
npm install
```

## 6. Restaurar los datos de la oficina

1. Desde OneDrive, copiar el respaldo más reciente (`respaldos\grualink_AAAAMMDD_HHMM.dump`) a `C:\GruaLink\respaldos\`.
2. Restaurar (escriba **SI** cuando lo pida):

```powershell
cd C:\GruaLink\backend
```
```powershell
npm run restaurar -- ..\respaldos\grualink_20261120_1615.dump
```

Después de restaurar **no** hace falta `npm run migrate` ni `npm run seed`: el respaldo ya trae todo. Los usuarios y contraseñas son los mismos de la oficina.

> Alternativa sin datos de la oficina: en vez del paso 6, correr `npm run migrate` y `npm run seed` (base con datos de prueba).

## 7. Arrancar

Dos terminales:

```powershell
cd C:\GruaLink\backend; npm run dev
```
```powershell
cd C:\GruaLink\frontend; npm run dev
```

Abrir `http://localhost:5173`.

## Rutina diaria entre oficina y casa

**Al terminar en un equipo:**

```powershell
git add -A; git commit -m "Qué cambié"; git push
```

Y si cambiaron datos que quieres llevar al otro equipo:

```powershell
cd backend; npm run respaldo
```

(el archivo nuevo queda en `respaldos/` y OneDrive lo sincroniza)

**Al empezar en el otro equipo:**

```powershell
git pull
```

Si hay migraciones nuevas: `cd backend; npm run migrate`. Si trajiste un respaldo nuevo: `npm run restaurar -- ..\respaldos\<archivo>.dump`.

> ⚠ Restaurar **reemplaza** los datos del equipo donde se ejecuta. Si trabajaste datos en casa y los quieres conservar, saca un `npm run respaldo` antes.

## Si algo falla

| Mensaje | Causa probable |
|---|---|
| `pg_restore: error: unsupported version` | PostgreSQL de casa más viejo que 18 |
| `password authentication failed` | La clave en `backend/.env` no es la de tu PostgreSQL de casa |
| `database "GruaLink" does not exist` | Falta el paso 3 (las comillas importan: `"GruaLink"` con mayúsculas) |
| `pg_restore no se reconoce` / `ENOENT` | PostgreSQL instalado en otra ruta: agregar en `.env` la línea `PG_BIN=C:\ruta\a\PostgreSQL\18\bin` |
| Login "Credenciales inválidas" | El backend no está corriendo, o está apuntando a otra base |
