# GruaLink — Etapa 2: Base de datos (PostgreSQL)

> Fecha: 20/11/2026 · Estado: **terminada y probada** (8/8 pruebas pasan)

## 1. Qué aprendimos del Excel actual

Archivo revisado: `REGISTRO TOTAL SERVICIOS DE GRUAS VIGENTE.xlsx` (7.745 servicios, hojas SERVICIOS, TB TARIFAS, Tfa trans, tablero dinámico y tiempos de maniobra).

| Hallazgo en el Excel | Decisión en GruaLink |
|---|---|
| Columnas **Entra / Sale / Termina turno** se repiten en cada servicio | Son el **turno del operador** → nueva tabla `turnos_operador` (un registro por jornada) |
| Un mismo operador usa **distintas grúas** en distintos días | La grúa se elige **al iniciar el turno** (no hay asignación fija). Una grúa no puede estar en dos turnos activos |
| La tarifa cambia por **tipo de servicio**: remolque, remolque parte trasera, servicio fallido, rescate ("a convenir") | Nueva tabla `tipos_servicio`; las tarifas ahora dependen de él |
| Existe la lista **"Clientes generales"** | Tarifa con `cliente_id = NULL` = aplica a cualquier cliente sin tarifa propia |
| Solo **La Rolita** cobra por rangos de km (menor a 15 km, 15–20, …) | Se mantiene el modelo de rangos `km_desde / km_hasta`; el resto usa 0 → sin límite |
| Cardán, persiana, cámaras, kit antiderrames, recargo nocturno, hora standby, reiniciada: **precio distinto por cliente** | Catálogo `conceptos_tarifa` + precios en `precios_concepto` (por cliente y vigencia) |
| Los números de orden en papel **no son una sola serie**: cada grúa recibe un talonario con su propio rango (en nov-2026 van en ~20.500; hay rangos sueltos hasta 50.846) | GruaLink lleva **su propia numeración desde 1** (decisión de SOTRANDES, 20/11/2026 — migración 006). Si se importa el histórico, el número de talonario irá en una columna aparte, no en `numero_orden` |
| **% Porcentaje Op Grúa** = 6 % del total para SUMA, SOTRAMAC y TRANSAMBIENTAL; 8 % de (tarifa + persiana + rescate) + $20.000 si hubo cardán, para el resto | **Aún no se programa.** Se implementará en la Etapa 3 con esta regla, después de que la confirmes |
| Columnas de facturación (# factura, solicitud de compra, galones, factura tercero) | Fuera del alcance del operador. Se tratarán en el módulo administrativo |

## 2. Migraciones aplicadas (`backend/migrations/`)

| Archivo | Qué resuelve |
|---|---|
| `000_estado_base.sql` | Documenta el esquema que ya existía (incluida la columna `clientes.nombre_comercial`). En tu base no cambió nada |
| `001_turnos_operador.sql` | Tabla de turnos + índices únicos parciales: **un turno activo por operador y por grúa**. `servicios.turno_id` |
| `002_tipos_servicio_y_tarifas.sql` | `tipos_servicio`, `tarifas.tipo_servicio_id`, tarifas de clientes generales, **restricción que prohíbe rangos superpuestos** |
| `003_precios_concepto.sql` | Precios de conceptos por cliente y vigencia. Se quitaron `valor` y vigencias de `conceptos_tarifa` (estaba vacía; igual se copian antes de borrar) |
| `004_servicios_y_bitacora.sql` | Secuencia del número de orden, `observaciones_entrega`, `aprobado_por/en`, nuevas operaciones de bitácora, índices de sesiones |
| `005_historial_estado_gruas.sql` | Historial de estados de grúas, necesario para el reporte "Promedio de grúas" |
| `006_numeracion_orden_desde_1.sql` | Corrige la 004: la numeración digital arranca en **1** (antes 10000, que chocaba con talonarios en papel ya usados) |
| `007_vehiculo_otro_y_rescate.sql` | Tipo de vehículo "Otro" (con descripción), rescate según el tipo de servicio, conceptos que solo registra el administrador |
| `008_bitacora_reabrir.sql` | Nueva operación de bitácora `reabrir` (servicio aprobado que vuelve a revisión). No cambia datos |
| `010_bolsa_km_mensual.sql` | Cobro por bolsa de km mensual (Suma): `clientes.modalidad_cobro`, `tipos_servicio.usa_bolsa_km`, tabla `tarifas_bolsa_km` (sin superposición) y en servicios `fuera_disponibilidad`, `tarifa_bolsa_id`, `bolsa_km_mes`. Ver `docs/PLAN-SUMA.md` |
| `009_recargo_nocturno_automatico.sql` | `clientes.recargo_nocturno_desde` (hora de corte propia; vacío = 20:40) y `conceptos_tarifa.es_recargo_nocturno` (cuál concepto agrega el sistema solo) |

**Tarifas 2026** (archivo "Tarifas clientes 2026"): están en `PLANES_2026` de `backend/seeds/seed.js` y se cargan con `npm run datos-iniciales` (también en producción). Nunca sobrescribe un valor existente: si la base tiene uno distinto, lo lista al final. Suma queda pendiente (cobro por bolsa mensual de km).

Antes de migrar se sacó un respaldo completo en `respaldos/` (excluida del repositorio).

## 3. Comandos

Todos se ejecutan en **PowerShell**, dentro de la carpeta `backend`:

```powershell
cd backend
```

```powershell
npm run migrate -- --ver
```
Muestra las migraciones pendientes sin aplicarlas.

```powershell
npm run migrate
```
Aplica las migraciones pendientes. Cada archivo corre en una transacción: si falla, no queda a medias.

```powershell
npm run seed
```
Carga los datos de prueba: usuarios, tarifas 2026 y conceptos. Se puede repetir sin duplicar.

```powershell
npm test
```
Corre las pruebas de las restricciones. No dejan datos: todo se deshace al final.

**Usuarios de prueba** (contraseña en `backend/seeds/seed.js`, constante `PASSWORD_PRUEBA`):
`operador1@grualink.test`, `operador2@grualink.test`, `financiero@grualink.test`.

## 4. Cómo crear una migración nueva

1. Crea `backend/migrations/006_descripcion_corta.sql`.
2. Escribe al inicio un comentario con **qué problema resuelve**.
3. Ejecuta `npm run migrate`.
4. **Nunca edites una migración ya aplicada**: crea una nueva que corrija la anterior.

## 5. Preguntas que siguen abiertas

| # | Pregunta |
|---|---|
| P1 | ¿El operador registra el servicio al recibirlo o cuando ya lo terminó? (En el Excel se registra al final, con todas las horas) |
| P8 | Km facturables: ¿km de servicio, o servicio + vacío? (La columna "Tal K x serv" del Excel suma ambos) |
| P11 | ¿Confirmas la fórmula del porcentaje del operador descrita arriba? |
| P12 | ¿El operador debe ver valores en pesos? |
| — | ¿A qué tipo de vehículo aplican los rangos de km de La Rolita? (El seed los cargó para busetón, como ejemplo) |
| — | SOTRAMAC y TRANSAMBIENTAL (Cartagena) no están en la tabla `clientes`: falta su NIT para crearlos |
