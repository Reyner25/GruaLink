# GruaLink — Instalación en la nube (VPS)

> Decisión (23/11/2026): GruaLink se instala en un **servidor virtual (VPS) Linux en la nube**.
> Todo lo necesario se instala con **un solo script**: [`deploy/linux/instalar.sh`](../deploy/linux/instalar.sh).

## ¿Por qué VPS y no "hosting"?

| | Hosting compartido | **VPS** (elegido) | Plataforma administrada (Render, Railway…) |
|---|---|---|---|
| ¿Sirve para GruaLink? | **No**: está hecho para PHP/MySQL; no deja un proceso Node corriendo ni trae PostgreSQL 18 con `btree_gist` | **Sí**: servidor Linux completo | Sí |
| Costo aprox. | — | USD 6–12/mes | USD 20–40/mes (app + base) |
| Control (respaldos, versión de PostgreSQL) | — | Total | Limitado |
| Trabajo de administración | — | Bajo: el script instala todo y las actualizaciones de seguridad son automáticas | Muy bajo |

## 1. Contratar el VPS (lo hace usted)

Cualquier proveedor sirve (DigitalOcean, AWS Lightsail, Vultr, Hetzner, Linode…). Elija:

- **Sistema:** Ubuntu **24.04 LTS** (soporte hasta 2029).
- **Tamaño:** **2 GB de RAM**, 1 vCPU, 25 GB o más de disco. Con 1 GB también funciona (el script crea memoria de intercambio), pero compilar la app web es más lento.
- **Región:** la más cercana a Colombia que ofrezca el proveedor (Miami, Nueva York/Virginia, Bogotá o São Paulo si existen).
- **Acceso:** con **llave SSH** en vez de contraseña, si el proveedor lo permite.
- **Respaldos del proveedor:** actívelos si cuestan poco (normalmente +20 %). Son una copia del servidor completo, además de los respaldos diarios de la base que hace GruaLink.

> **Protección de datos (Ley 1581 de 2012):** GruaLink guarda nombres, placas y teléfonos. Un servidor fuera de Colombia implica una transferencia internacional de datos personales. Estados Unidos está en la lista de países con nivel adecuado de protección de la SIC, pero confírmelo con el responsable de datos o el área jurídica de SOTRANDES antes de cargar datos reales.

## 2. Apuntar el subdominio al servidor

En el administrador del dominio de la empresa, cree un registro **DNS tipo A**:

| Tipo | Nombre | Valor |
|---|---|---|
| A | `grualink` | IP pública del VPS |

Así `grualink.sotrandes.com` (o el que elijan) apunta al servidor. Puede tardar desde minutos hasta unas horas en propagarse. **Hágalo antes del paso 3**: Caddy necesita que el dominio ya apunte al servidor para obtener el certificado HTTPS.

## 3. Instalar (un comando)

Desde PowerShell en su equipo, conéctese al servidor:

```powershell
ssh root@IP_DEL_SERVIDOR
```

Ya en el servidor (Linux), descargue y ejecute el instalador con **su** subdominio:

```bash
curl -fsSL https://raw.githubusercontent.com/Reyner25/GruaLink/main/deploy/linux/instalar.sh -o instalar.sh
```
```bash
sudo bash instalar.sh grualink.sotrandes.com
```

Tarda entre 5 y 10 minutos. Al final pide **nombre, correo y contraseña del primer administrador** (la contraseña no se ve al escribirla). Lo que hace, en orden:

1. Zona horaria de Colombia, memoria de intercambio y actualizaciones del sistema.
2. **Firewall**: solo SSH, HTTP y HTTPS. PostgreSQL y el puerto 4000 **no** quedan expuestos a internet.
3. Actualizaciones de seguridad automáticas.
4. Node.js 24, PostgreSQL 18 y Caddy, desde sus repositorios oficiales.
5. Usuario de Linux `grualink` (sin acceso por SSH) y el código en `/opt/grualink`.
6. Base `GruaLink` con dos usuarios de **contraseña aleatoria**:
   - `grualink_dueno`: migraciones y respaldos.
   - `grualink_app`: permisos mínimos; es el que usa la API.
7. El archivo `/opt/grualink/backend/.env`. Solo lo pueden leer `grualink` y root.
8. Instalación de dependencias, compilación de la app web, migraciones, permisos, catálogos y tarifas iniciales.
9. Servicios del sistema:
   - `grualink`: arranca solo y se reinicia si falla.
   - `grualink-respaldo.timer`: respaldo diario a las 23:30.
10. Caddy con HTTPS para el subdominio.
11. Creación del primer administrador.

Abra `https://grualink.sotrandes.com`, ingrese con el administrador y cree los demás usuarios en **Usuarios**.

> El script se puede volver a ejecutar sin peligro: no borra datos ni cambia contraseñas que ya existen.

## 4. (Opcional) Llevar los datos que ya están en desarrollo

Solo si quiere conservar lo que se ha registrado en la base de desarrollo. **Hágalo recién instalado**, porque reemplaza todo el contenido de la base del servidor.

En su equipo (PowerShell), cree el respaldo y súbalo al servidor:

```powershell
cd backend; npm run respaldo
```
```powershell
scp ..\respaldos\grualink_AAAAMMDD_HHMM.dump root@IP_DEL_SERVIDOR:/tmp/
```

En el servidor:

```bash
sudo systemctl stop grualink
cd /opt/grualink/backend && chmod 644 /tmp/grualink_*.dump
sudo -u grualink -H node scripts/restaurar.js /tmp/grualink_AAAAMMDD_HHMM.dump
sudo -u grualink -H node scripts/crear-usuario-app.js --solo-permisos
sudo -u grualink -H node scripts/crear-admin.js
sudo systemctl start grualink
rm /tmp/grualink_*.dump
```

El respaldo trae los **usuarios de prueba** (`@grualink.test`): desactívelos en el panel → **Usuarios**. El `crear-admin` del final se repite porque la restauración reemplaza también los usuarios.

## 5. Uso diario y mantenimiento

| Qué | Comando (en el servidor) |
|---|---|
| ¿Está funcionando? | Abrir `https://<sitio>/api/salud` |
| Estado del servicio | `systemctl status grualink` |
| Ver el registro (errores) | `journalctl -u grualink -f` (Ctrl+C para salir) |
| Reiniciar | `sudo systemctl restart grualink` |
| Respaldo ahora | `sudo systemctl start grualink-respaldo` |
| Ver respaldos | `sudo ls -lh /var/backups/grualink` y `respaldos.log` |
| Próximo respaldo | `systemctl list-timers grualink-respaldo.timer` |
| **Actualizar a la última versión** | `sudo bash /opt/grualink/deploy/linux/actualizar.sh` |
| Olvidó la contraseña del admin | `cd /opt/grualink/backend && sudo -u grualink -H node scripts/crear-admin.js` (mismo correo) |

`actualizar.sh` hace un respaldo, descarga la versión nueva de GitHub, aplica las migraciones y los permisos, compila la app, reinicia y verifica que responda.

### Copia de los respaldos fuera del servidor (importante)

Los respaldos diarios quedan **en el mismo servidor**. Si el servidor se pierde, se pierden con él. Descargue una copia periódicamente, por ejemplo cada semana, a OneDrive o al servidor de la oficina. Desde PowerShell:

```powershell
scp "root@IP_DEL_SERVIDOR:/var/backups/grualink/grualink_*.dump" "$env:USERPROFILE\Documents\RespaldosGruaLink\"
```

Además, cada mes **pruebe restaurar** uno de esos respaldos en su equipo (sección 4 en sentido inverso: `npm run restaurar -- <archivo>`).

## 6. Si algo falla

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| El navegador dice "no seguro" o no carga | El DNS aún no apunta al servidor, o Caddy no obtuvo el certificado | `getent hosts grualink.sotrandes.com` debe mostrar la IP del VPS; `journalctl -u caddy -n 50` |
| Error 502 | GruaLink no está corriendo | `journalctl -u grualink -n 50` |
| `instalar.sh` se detuvo con ✖ | El mensaje dice el paso | Corregir y volver a ejecutar el script (retoma donde iba) |
| No puedo entrar por SSH | Firewall | Use la consola web del proveedor. El script deja abierto el puerto de SSH que esté configurado |

## 7. Notas

- **El repositorio de GitHub es público:** cualquiera puede ver el código. No contiene contraseñas ni datos, pero si prefieren hacerlo privado, el servidor necesitará una *deploy key* de solo lectura para descargarlo. Avíseme y lo ajusto.
- El script está escrito para Ubuntu 24.04. Se revisó su sintaxis, pero la primera ejecución real será en el VPS. Si algo falla, el mensaje indica en qué paso, y se puede corregir y volver a ejecutar.
