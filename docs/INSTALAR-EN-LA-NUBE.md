# GruaLink — Instalación en Azure (empezando por la prueba gratuita)

> Decisión (24/11/2026): GruaLink se instala en una **máquina virtual Linux de Microsoft Azure**.
> Se empieza con la **cuenta gratuita de Azure** y, cuando termine, se pasa a **pago por uso** sin reinstalar nada.
> Dentro de la máquina, todo se instala con **un solo script**: [`deploy/linux/instalar.sh`](../deploy/linux/instalar.sh).

## Instalación actual (25/11/2026)

| Dato | Valor |
|---|---|
| Suscripción | "Azure subscription 1" — **prueba gratuita**, con límite de gasto activado |
| Grupo de recursos | `rg-grualink` |
| Máquina | `vm-grualink` · Ubuntu 24.04 · **B2ats_v2** (2 vCPU, 1 GB) · SSD Premium 64 GB · región **West US 2** |
| Dirección | **https://grualink-sotrandes.westus2.cloudapp.azure.com** (IP fija 20.94.200.182) |
| Acceso SSH | usuario `azureuser` con la llave `%USERPROFILE%\.ssh\grualink_azure`, solo desde la IP de la oficina |
| Certificado HTTPS | Let's Encrypt (Caddy lo renueva solo) |

Se creó con Azure CLI. En East US 2, South Central US, Central US y East US no había capacidad para los tamaños gratuitos (error `SkuNotAvailable`); West US 2 sí la tenía. Por eso, en esta guía, donde dice `eastus2` use `westus2`.

Para entrar al servidor desde la oficina:

```powershell
ssh -i "$env:USERPROFILE\.ssh\grualink_azure" azureuser@grualink-sotrandes.westus2.cloudapp.azure.com
```

## Resumen del camino

| Fase | Qué incluye | Costo |
|---|---|---|
| **1. Prueba gratuita (primeros 30 días)** | USD 200 de crédito para usar en cualquier servicio, más los servicios gratis | USD 0 (no se cobra nada si no se pasa a pago por uso) |
| **2. Meses 1 a 12** (después de pasar a pago por uso) | Siguen gratis, dentro de sus límites, los servicios "gratis 12 meses". Entre ellos, **750 horas al mes** de una máquina virtual pequeña (B1s, B2ats v2 o B2pts v2), que alcanza para tenerla encendida todo el mes | Solo lo que pase de los límites gratis (normalmente la IP pública y pocos centavos de tráfico) |
| **3. Desde el mes 13** | Lo mismo, con tarifa normal | Aprox. USD 10–20/mes (máquina + disco + IP). Confírmelo en la [calculadora de precios](https://azure.microsoft.com/pricing/calculator/) |

> Microsoft cambia de vez en cuando los servicios gratis. Antes de crear algo, revise la página oficial de la [cuenta gratuita de Azure](https://azure.microsoft.com/pricing/purchase-options/azure-account) y, ya dentro, la lista **Servicios gratuitos** del portal.

### ¿Por qué una máquina virtual y no los servicios "administrados" de Azure?

| | **Máquina virtual Ubuntu** (elegido) | App Service + Azure Database for PostgreSQL |
|---|---|---|
| ¿Gratis en la prueba? | Sí: 750 h/mes de B1s / B2ats v2 durante 12 meses | Solo en parte. La base tiene horas gratis, pero el App Service gratis (F1) no sirve para producción |
| PostgreSQL 18 con `btree_gist` | Sí, lo instala el script | Hay que revisar qué versión ofrece Azure y permitir la extensión a mano |
| Respaldos, tareas y la app web en el mismo lugar | Sí: es lo mismo que ya está probado (systemd + Caddy) | Hay que adaptar respaldos y tareas |
| Costo después del año gratis | Bajo (~USD 10–20/mes) | Más alto (~USD 30–60/mes) |

Si algún día crece mucho, se puede mover la base a Azure Database for PostgreSQL (ver sección 10).

---

## 1. Crear la cuenta gratuita de Azure (lo hace usted)

1. Entre a <https://azure.microsoft.com/free> y pulse **Comenzar gratis**.
2. Use una cuenta de **la empresa** (por ejemplo, un correo de sistemas de SOTRANDES), no una personal. Así la suscripción queda a nombre de la empresa si usted cambia de cargo.
3. Azure pide un **teléfono** y una **tarjeta de crédito** solo para verificar la identidad. Durante la prueba **no se cobra**: la cuenta tiene un *límite de gasto* y, si el crédito se acaba, Azure detiene los recursos en vez de cobrar.
4. Al terminar, entra al portal: <https://portal.azure.com>.

> El crédito de USD 200 dura **30 días**. Lo que no se use se pierde. Para GruaLink no hace falta gastarlo: la máquina virtual pequeña es gratis.

## 2. Poner una alerta de gastos (5 minutos, muy recomendado)

Así nadie se lleva sorpresas cuando la cuenta pase a pago por uso.

1. En el buscador del portal escriba **Presupuestos** (*Budgets*) → **Agregar**.
2. Ámbito: su suscripción. Nombre: `presupuesto-grualink`. Período: **mensual**. Monto: **USD 15**.
3. Alertas al **50 %, 80 % y 100 %**, con su correo.

## 3. Crear la máquina virtual

En el portal: **Máquinas virtuales** → **Crear** → **Máquina virtual de Azure**.

### Pestaña "Datos básicos"

| Campo | Valor |
|---|---|
| Suscripción | La de la prueba gratuita |
| Grupo de recursos | **Crear nuevo** → `rg-grualink` (agrupa todo lo de GruaLink) |
| Nombre de la máquina | `vm-grualink` |
| Región | **(US) East US 2** o **(US) South Central US**. No hay región en Colombia (ver la nota de datos personales abajo) |
| Opciones de disponibilidad | Sin redundancia de infraestructura |
| Tipo de seguridad | Inicio seguro (*Trusted launch*), el que viene |
| Imagen | **Ubuntu Server 24.04 LTS – x64 Gen2** |
| Tamaño | **B2ats_v2** (2 vCPU, 1 GB). Si no aparece en la región, use **B1s** (1 vCPU, 1 GB). Debe decir *"Apto para servicios gratuitos"*. **No** elija B2pts v2: es ARM y no es la arquitectura con la que se probó |
| Tipo de autenticación | **Clave pública SSH** |
| Nombre de usuario | `azureuser` |
| Origen de la clave SSH | Generar un nuevo par de claves → nombre `grualink-clave` |
| Puertos de entrada públicos | Permitir el puerto seleccionado → **SSH (22)** (HTTP y HTTPS se abren en el paso 4) |

> 1 GB de RAM alcanza para GruaLink con pocos usuarios. El script crea 2 GB de memoria de intercambio para poder compilar la app web.

### Pestaña "Discos"

- Tipo de disco del sistema: **SSD Premium** de **64 GB** (P6). La cuenta gratis incluye dos discos P6 de 64 GB durante 12 meses. Si elige otro tipo o tamaño, se cobra.
- Marque **Eliminar con la máquina virtual**.

### Pestaña "Redes"

- Red virtual y subred: las que crea por defecto.
- IP pública: la nueva que propone. Marque **Eliminar la IP pública y la NIC cuando se elimine la máquina virtual**.

### Pestaña "Administración"

- **Apagado automático: desactivado.** Si queda activo, GruaLink se apaga todas las noches y los operadores del turno nocturno no pueden trabajar.

### Crear

**Revisar y crear** → **Crear**. Al terminar, Azure ofrece **Descargar la clave privada**: guarde el archivo `grualink-clave.pem` en `C:\Users\<usted>\.ssh\`.

> **No pierda ese archivo ni lo comparta.** Es la llave para entrar al servidor. Guarde una copia en un lugar seguro de la empresa (no en el repositorio).

## 4. Red: IP fija, nombre y puertos

Entre a la máquina `vm-grualink` en el portal.

### 4.1 IP fija y un nombre gratuito de Azure

1. **Información general** → clic en la **dirección IP pública** → **Configuración**.
2. Asignación: **Estática** (así la IP no cambia si la máquina se reinicia).
3. **Etiqueta de nombre DNS:** `grualink-sotrandes`.
4. **Guardar.**

Ahora la máquina tiene un nombre como `grualink-sotrandes.eastus2.cloudapp.azure.com`. Con ese nombre se puede instalar **ya**, con HTTPS, sin esperar el subdominio de la empresa.

### 4.2 Abrir HTTP y HTTPS, y proteger SSH

**Redes** → **Configuración de red** → **Crear regla de puerto** → **Regla de puerto de entrada**:

| Regla | Origen | Puerto | Protocolo | Acción | Nombre |
|---|---|---|---|---|---|
| Web | Any | `80,443` | Any (TCP y UDP: HTTP/3) | Permitir | `Permitir-Web` |

Luego edite la regla de **SSH** que ya existe: en **Origen** elija **Mi dirección IP**. Así solo se puede entrar al servidor desde la oficina. Si cambia de red, por ejemplo en casa, agregue esa IP en la misma regla.

> GruaLink tiene **dos** firewalls: este de Azure (*grupo de seguridad de red*) y `ufw` dentro de la máquina, que configura el script. PostgreSQL y el puerto 4000 no se abren en ninguno.

## 5. Instalar GruaLink (un comando)

Desde PowerShell en su equipo, conéctese con la llave:

```powershell
ssh -i "$env:USERPROFILE\.ssh\grualink-clave.pem" azureuser@grualink-sotrandes.eastus2.cloudapp.azure.com
```

(La primera vez pregunta si confía en el servidor: escriba `yes`. Si Windows reclama permisos de la llave, vea la sección 11.)

Ya en el servidor (Linux), descargue y ejecute el instalador con el **nombre del paso 4.1**:

```bash
curl -fsSL https://raw.githubusercontent.com/Reyner25/GruaLink/main/deploy/linux/instalar.sh -o instalar.sh
```
```bash
sudo bash instalar.sh grualink-sotrandes.eastus2.cloudapp.azure.com
```

Tarda entre 10 y 15 minutos (la máquina es pequeña). Si acaba de crear la máquina, el script primero espera a que Azure termine de configurarla (*cloud-init*).

Al final pide **nombre, correo y contraseña del primer administrador** (la contraseña no se ve al escribirla). Lo que hace, en orden:

1. Zona horaria de Colombia, memoria de intercambio y actualizaciones del sistema.
2. **Firewall** `ufw`: solo SSH, HTTP y HTTPS.
3. Actualizaciones de seguridad automáticas.
4. Node.js 24, PostgreSQL 18 y Caddy, desde sus repositorios oficiales.
5. Usuario de Linux `grualink` (sin acceso por SSH) y el código en `/opt/grualink`.
6. Base `GruaLink` con dos usuarios de **contraseña aleatoria**:
   - `grualink_dueno`: migraciones y respaldos.
   - `grualink_app`: permisos mínimos; es el que usa la API.
7. El archivo `/opt/grualink/backend/.env`. Solo lo pueden leer `grualink` y root.
8. Dependencias, compilación de la app web, migraciones, permisos, catálogos y tarifas iniciales.
9. Servicios del sistema:
   - `grualink`: arranca solo y se reinicia si falla.
   - `grualink-respaldo.timer`: respaldo diario a las 23:30.
10. Caddy con HTTPS (certificado gratuito que se renueva solo).
11. Creación del primer administrador.

> **Aviso esperado en Azure:** el script puede decir *"apunta a 20.x.x.x. Si esa no es la IP pública de este servidor…"*. Es normal: dentro de Azure la máquina solo ve su IP privada (10.x.x.x). Basta con que esa IP sea la **IP pública** que muestra el portal.

Abra `https://grualink-sotrandes.eastus2.cloudapp.azure.com`, ingrese con el administrador y cree los demás usuarios en **Usuarios**.

> El script se puede volver a ejecutar sin peligro: no borra datos ni cambia contraseñas que ya existen.

## 6. Usar el subdominio de la empresa (cuando lo tengan)

1. En el administrador del dominio de SOTRANDES, cree un registro **DNS**:

   | Tipo | Nombre | Valor |
   |---|---|---|
   | CNAME | `grualink` | `grualink-sotrandes.eastus2.cloudapp.azure.com` |

   (También sirve un registro **A** con la IP pública estática.)
2. Espere a que propague (de minutos a unas horas). Compruébelo desde PowerShell:

   ```powershell
   Resolve-DnsName grualink.sotrandes.com
   ```
3. En el servidor, vuelva a ejecutar el instalador con el nombre nuevo. Solo cambia la configuración de HTTPS; los datos no se tocan:

   ```bash
   sudo bash instalar.sh grualink.sotrandes.com
   ```

Desde ahí la dirección oficial es `https://grualink.sotrandes.com`. Avise a los operadores para que la guarden en el celular.

## 7. (Opcional) Llevar los datos que ya están en desarrollo

Solo si quiere conservar lo que se ha registrado en la base de desarrollo. **Hágalo recién instalado**, porque reemplaza todo el contenido de la base del servidor.

En su equipo (PowerShell), cree el respaldo y súbalo al servidor:

```powershell
cd backend; npm run respaldo
```
```powershell
scp -i "$env:USERPROFILE\.ssh\grualink-clave.pem" ..\respaldos\grualink_AAAAMMDD_HHMM.dump azureuser@grualink-sotrandes.eastus2.cloudapp.azure.com:/tmp/
```

En el servidor:

```bash
sudo systemctl stop grualink
cd /opt/grualink/backend && sudo chmod 644 /tmp/grualink_*.dump
sudo -u grualink -H node scripts/restaurar.js /tmp/grualink_AAAAMMDD_HHMM.dump
sudo -u grualink -H node scripts/crear-usuario-app.js --solo-permisos
sudo -u grualink -H node scripts/crear-admin.js
sudo systemctl start grualink
sudo rm /tmp/grualink_*.dump
```

El respaldo trae los **usuarios de prueba** (`@grualink.test`): desactívelos en el panel → **Usuarios**. El `crear-admin` del final se repite porque la restauración reemplaza también los usuarios.

## 8. Uso diario y mantenimiento

Conéctese con `ssh -i … azureuser@<sitio>` (sección 5). Los comandos con `sudo` no piden contraseña al usuario `azureuser`.

| Qué | Comando (en el servidor) |
|---|---|
| ¿Está funcionando? | Abrir `https://<sitio>/api/salud` |
| Estado del servicio | `systemctl status grualink` |
| Ver el registro (errores) | `journalctl -u grualink -f` (Ctrl+C para salir) |
| Reiniciar | `sudo systemctl restart grualink` |
| Respaldo ahora | `sudo systemctl start grualink-respaldo` |
| Ver respaldos | `sudo ls -lh /var/backups/grualink` |
| Próximo respaldo | `systemctl list-timers grualink-respaldo.timer` |
| **Actualizar a la última versión** | `sudo bash /opt/grualink/deploy/linux/actualizar.sh` |
| Olvidó la contraseña del admin | `cd /opt/grualink/backend && sudo -u grualink -H node scripts/crear-admin.js` (mismo correo) |

`actualizar.sh` hace un respaldo, descarga la versión nueva de GitHub, aplica las migraciones y los permisos, compila la app, reinicia y verifica que responda.

### Copia de los respaldos fuera del servidor (importante)

Los respaldos diarios quedan **en la misma máquina**. Si la máquina se borra, se pierden con ella. Cada semana, descargue una copia a OneDrive o al servidor de la oficina.

1. En el servidor, deje una copia del último respaldo donde `azureuser` la pueda leer:

   ```bash
   sudo bash -c 'f=$(ls -t /var/backups/grualink/*.dump | head -1); install -o azureuser -m 600 "$f" /home/azureuser/'
   ```
2. En su equipo (PowerShell), descárguela:

   ```powershell
   scp -i "$env:USERPROFILE\.ssh\grualink-clave.pem" "azureuser@grualink-sotrandes.eastus2.cloudapp.azure.com:~/grualink_*.dump" "$env:USERPROFILE\Documents\RespaldosGruaLink\"
   ```
3. En el servidor, borre la copia temporal:

   ```bash
   rm ~/grualink_*.dump
   ```

Además, cada mes **pruebe restaurar** uno de esos respaldos en su equipo (`npm run restaurar -- <archivo>`).

> **Cuando ya estén en pago por uso**, conviene activar también **Azure Backup** para la máquina (portal → `vm-grualink` → **Copia de seguridad**). Guarda una copia diaria de la máquina completa y cuesta aprox. USD 5–10/mes. No reemplaza la copia semanal fuera de Azure.

## 9. Al terminar la prueba gratuita (día 30)

Azure avisa por correo unos días antes. Para que GruaLink **siga funcionando**:

1. Portal → **Suscripciones** → la suscripción de prueba → **Actualizar** (*Upgrade*) a **pago por uso**.
2. Se conserva todo: la máquina, la IP, los datos y el nombre. No hay que reinstalar nada.
3. Revise que el presupuesto del paso 2 siga activo.

> **Si no la actualiza**, Azure deshabilita la suscripción: la máquina se apaga y GruaLink deja de responder. Pasado un tiempo, Azure borra los recursos. Por eso, antes del día 30, tenga también una copia del respaldo fuera del servidor (sección 8).

Después de pasar a pago por uso, la máquina B2ats v2 / B1s y sus discos siguen **gratis hasta cumplir 12 meses** desde que creó la cuenta, dentro de los límites. Desde el mes 13 se cobran con la tarifa normal (ver el resumen al inicio).

## 10. Cuando haga falta crecer

| Necesidad | Qué hacer |
|---|---|
| La app se pone lenta (muchos operadores a la vez) | Portal → `vm-grualink` → **Tamaño** → elegir uno con más memoria, por ejemplo **B2s** (4 GB). Se reinicia en 2–3 minutos y no hay que reinstalar. Deja de ser gratis |
| Más disco | Portal → **Discos** → aumentar el tamaño (con la máquina apagada) |
| Base de datos administrada por Azure | Crear **Azure Database for PostgreSQL – servidor flexible**, permitir la extensión `btree_gist` (parámetro `azure.extensions`), restaurar un respaldo y cambiar `DATABASE_URL`/`DATABASE_URL_ADMIN` en el `.env`. Revise antes que Azure ofrezca PostgreSQL 18 |
| Copias automáticas de la máquina | Azure Backup (sección 8) |

## 11. Si algo falla

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| `ssh` dice *"UNPROTECTED PRIVATE KEY FILE"* | Windows dejó la llave con permisos para otros usuarios | En PowerShell: `icacls "$env:USERPROFILE\.ssh\grualink-clave.pem" /inheritance:r /grant:r "$($env:USERNAME):R"` |
| `ssh` se queda esperando (*timed out*) | Su IP no está permitida en la regla SSH (cambió de red) | Portal → `vm-grualink` → **Redes** → regla SSH → **Origen: Mi dirección IP** |
| No puedo entrar de ninguna forma | Firewall o llave perdida | Portal → `vm-grualink` → **Consola serie**, o **Restablecer contraseña** (permite poner una llave nueva) |
| El navegador dice "no seguro" o no carga | Faltan los puertos 80/443 en Azure, o el nombre aún no apunta a la máquina | Revise la regla `Permitir-Web` (paso 4.2); `journalctl -u caddy -n 50` |
| Error 502 | GruaLink no está corriendo | `journalctl -u grualink -n 50` |
| `instalar.sh` se detuvo con ✖ | El mensaje dice el paso | Corregir y volver a ejecutar el script (retoma donde iba) |
| Al crear la máquina: `SkuNotAvailable` | La región no tiene capacidad para ese tamaño (pasa seguido con las pruebas gratuitas) | Probar el otro tamaño gratuito (B1s) o otra región de EE. UU. (West US 2 funcionó el 25/11/2026) |
| GruaLink dejó de responder a fin de mes | La prueba terminó sin actualizar, o se acabó el crédito | Sección 9 |
| Llegó un cobro inesperado | Se creó algo que no es gratis (otro tamaño, otro disco, Azure Backup…) | Portal → **Administración de costos** → **Análisis de costos**, agrupado por recurso |

## 12. Notas

- **Protección de datos (Ley 1581 de 2012):** GruaLink guarda nombres, placas y teléfonos. Un servidor fuera de Colombia implica una transferencia internacional de datos personales. Estados Unidos está en la lista de países con nivel adecuado de protección de la SIC. Si eligen otra región (por ejemplo Brasil), confírmenlo con el responsable de datos o el área jurídica de SOTRANDES **antes de cargar datos reales**.
- **El repositorio de GitHub es público:** cualquiera puede ver el código. No contiene contraseñas ni datos. Si prefieren hacerlo privado, el servidor necesitará una *deploy key* de solo lectura para descargarlo. Avíseme y lo ajusto.
- El script está escrito para Ubuntu 24.04 (x64). Se revisó su sintaxis, pero la primera ejecución real será en la máquina de Azure. Si algo falla, el mensaje indica en qué paso, y se puede corregir y volver a ejecutar.
- La misma guía sirve para otro proveedor (DigitalOcean, AWS Lightsail, Hetzner…): cambian los pasos 1 a 4. El script es el mismo; en esos proveedores se entra como `root` en vez de `azureuser`.
