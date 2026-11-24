# GruaLink — Tarifa de SUMA por bolsa de kilometraje mensual

> Estado: **implementado el 23/11/2026** (migración 010), con las **decisiones provisionales** de la sección 0. Fuente: `202611 Tarifa de Suma.xlsx` (hoja "SUMA 2026").

## 0. Cómo quedó implementado

**Uso:**
- *Clientes → Modalidad de cobro*: "Bolsa de km mensual" (Suma ya viene así).
- *Corregir*: interruptor **"Fuera de la disponibilidad"**. Lo marca el administrador.
- *Reportes → Bolsa de km (Suma)*: km del mes, columna aplicada, cuántos km faltan para la siguiente, servicios del mes y botón "Recalcular mes".
- *Detalle del servicio*: muestra la bolsa y la columna con que se calculó.
- *Excel*: columnas "Fuera de disponibilidad" y "Bolsa km del mes".
- **Modificar la tabla** (24/11/2026): *Tarifas → Bolsa de km (Suma)*. Muestra la tabla como en el Excel. Clic en una celda para cambiar su forma (fijo, por km, a convenir) y su valor. Las celdas que ya cobraron servicios quedan con candado. "Nueva vigencia" copia la tabla desde una fecha (ej. 2027) para cambiar valores sin tocar lo ya cobrado. "Editar vigencia" cambia las fechas: si la tabla no se ha usado, el inicio y el fin (o se puede borrar); si ya cobró servicios, solo la fecha final, y no antes del último servicio cobrado. Dos vigencias no pueden cruzarse. Ahí mismo se elige la **columna provisional** del mes abierto; al cambiarla se recalculan los servicios no aprobados del mes en curso. Todo queda en la bitácora. Los rangos (columnas y filas) son los del Excel y no se editan desde el panel.

**Reglas:**
- Remolque y remolque parte trasera **dentro de la disponibilidad**:
  - El valor sale de la tabla.
  - Los km son **servicio + vacío**.
  - La bolsa son los km del mes calendario: suman los no anulados y los que están dentro de la disponibilidad.
  - Los adicionales se registran **sin cobro** y no hay recargo nocturno.
- **Fuera de la disponibilidad**, o servicio fallido: **tarifa y precios de Clientes generales**, con adicionales y recargo nocturno automático (20:40 a 6:00). Sus km no suman a la bolsa.
- **Mes abierto** (decidido el 23/11/2026): mientras no se sabe en qué bolsa caerá el mes, los servicios se calculan con la **columna provisional** (1500–1800 km por defecto; se cambia en Tarifas → Bolsa de km).
- **Al terminar el mes**, el mantenimiento horario (`cerrarMesesPendientes`) recalcula esos servicios con la **columna real**. Si el servidor estuvo apagado, se pone al día solo.
- En meses cerrados, cada vez que un servicio se finaliza, se corrige, se anula o se reabre, los demás **no aprobados** se **recalculan solos**. Cada recálculo queda en la bitácora.
- Los **aprobados conservan su valor**. Por eso conviene aprobar los servicios de Suma después del cierre del mes; si se aprueban antes, sale un aviso.

**Decisiones PROVISIONALES** (preguntas sin responder; se cambian fácil):

| Tema | Se hizo así | Dónde se cambia |
|---|---|---|
| Km que cuentan | Servicio + vacío, para la fila y para la bolsa (como dice el Excel) | `calcularPorBolsa` en `tarifa.service.js` y `kmBolsaMes` en `tarifa.model.js` |
| Valor con el mes abierto | **Decidido:** columna provisional hasta el cierre del mes (1500–1800 por defecto) | Tarifas → Bolsa de km |
| Bolsa < 600 o > 2.400 km | Columna más cercana (600–900 / 2100–2400) | `BOLSA_SUMA.columnas` en `seeds/seed.js` |
| Límite de columna | El tope queda incluido: 1.800 km → 1500–1800 | Ídem |
| Aprobar antes de fin de mes | Se permite, con aviso: el valor queda fijo | `DialogoAprobar` |
| Quién marca "fuera de la disponibilidad" | El administrador, en Corregir | Si debe ser automático por hora, se agrega |
| Servicio fallido de Suma | Tarifa general | `tipos_servicio.usa_bolsa_km` |
| Vigencia de la tabla | Todo 2026 | `VIGENCIA_2026` en el seed |

## 1. Cómo funciona (lo que entendí)

1. Durante el mes se suman los km de **todos** los servicios de Suma: esa es la **bolsa del mes**.
2. La bolsa elige **la columna** de la tabla:

   | Bolsa del mes (km) | 600–900 | 900–1200 | 1200–1500 | 1500–1800 | 1800–2100 | 2100–2400 |
   |---|---|---|---|---|---|---|

   A más km en el mes, más barato cada servicio.
3. Los km de **cada servicio** eligen **la fila** (rangos de 5 km): < 10, 10,1–15, 15,1–20 … 90,1–95, > 95.
4. El valor del servicio es la celda (fila, columna):
   - **< 10 km:** "según distancia" = km del servicio × $/km de esa columna.
   - **10,1 a 95 km:** el valor fijo "$/servicio".
   - **> 95 km:** a convenir; lo define el administrador al aprobar.

**Ejemplo:** en noviembre Suma suma 1.879 km → columna **1800–2100**. Un servicio de 18 km (fila 15,1–20) vale **$427.741**; uno de 8 km vale 8 × $25.657 = **$205.256**.

**Consecuencia clave:** el valor de un servicio de Suma **no se conoce hasta que termina el mes**. Cada servicio nuevo puede cambiar la columna y, con ella, el valor de *todos* los servicios del mes. Hace falta una **liquidación mensual**.

### Decisión (23/11/2026): dos clases de servicio para Suma

| | **Dentro de la disponibilidad** | **Fuera de la disponibilidad** |
|---|---|---|
| Cómo se cobra | Tabla de bolsa de km (arriba) | **Tarifa de Clientes generales** (por tipo de vehículo y servicio), como cualquier cliente sin tarifa propia |
| Cardán, persiana, cámaras, kit, stand-by, reiniciada | **No se cobran** | Se cobran a **precio general** |
| Recargo nocturno | **No** | Sí (automático) |
| ¿Sus km suman a la bolsa del mes? | Sí | Por confirmar (pregunta B) |

En el Excel, la franja *"lleguen a patios después de las 23:00 o empiecen después de las 22:00, y los que se realicen entre 13:00 y 15:00"* corresponde, al parecer, a **"fuera de la disponibilidad"** (pregunta A).

## 2. Hallazgos en el Excel

- La tabla tiene 6 columnas × 18 filas, es decir 108 valores. Es coherente: $/servicio = $/km × tope del rango (ej. 24.831 × 15 = 372.465 ≈ $372.463).
- Encabezado: **"Kms (servicio + vacío)"**. Para Suma los km cuentan servicio **más** vacío. Para los demás clientes solo cuenta el km en servicio.
- Fila 90,1–95, columnas 2100–2400 y 1800–2100: el $/km (10.819 y 11.014) **no** coincide con el $/servicio (1.229.261 y 1.251.635). Se usaría el $/servicio, así que no afecta.
- Celda E9 escrita "621,212" (con coma): se interpreta $621.212.
- **Recargo nocturno de Suma:** su regla es distinta a la general. Aplica a servicios que *lleguen a patios después de las 23:00 o empiecen después de las 22:00*. El Excel no trae el valor.
- **"Servicio adicional":** aplica a la misma franja y además *entre 13:00 y 15:00*. No es claro qué es ni cuánto vale.
- El archivo de tarifas 2026 que cargamos antes traía para Suma solo una columna (la 1500–1800).

## 3. ¿Es un cambio grande?

**Mediano y aislado.** No cambia cómo se cobra a los demás clientes. Se agrega una "modalidad de cobro" nueva solo para los clientes que la tengan.

### Base de datos (una migración, 010)

| Cambio | Para qué |
|---|---|
| `clientes.modalidad_cobro` (`por_servicio` por defecto · `bolsa_km_mensual`) | Saber qué clientes se cobran por bolsa |
| Tabla nueva `tarifas_bolsa_km` (cliente, vigencia, bolsa desde/hasta, km desde/hasta, forma: fijo · por km · a convenir, valor) | Las 108 celdas de la tabla. Con restricción que impide rangos superpuestos, como las tarifas actuales |
| Tabla nueva `liquidaciones_bolsa` (cliente, mes, km del mes, columna aplicada, estado abierta/cerrada, quién y cuándo la cerró, total) | Saber cómo se liquidó cada mes y bloquearlo al cerrarlo |
| `servicios.liquidacion_id` (opcional) | Saber en qué liquidación quedó cada servicio |
| `servicios.fuera_disponibilidad` (sí/no) | Servicio de Suma que se cobra con la tarifa general y con adicionales |

No se borran ni se modifican tablas existentes.

### Código

| Parte | Qué se hace |
|---|---|
| `tarifa.service.js` | Rama nueva "bolsa": km facturables = servicio + vacío, fila por km y columna por la bolsa del mes. La lógica actual no cambia |
| `liquidacion.service.js` (nuevo) | Sumar los km del mes, elegir la columna y **recalcular todos los servicios del mes** en una transacción, con bitácora. Cerrar el mes |
| Recargo nocturno | Generalizar la regla por cliente para soportar la de Suma (inicio > 22:00 **o** llegada > 23:00) |
| Panel → **Liquidación Suma** (nueva) | Mes; km acumulados; columna actual; **cuántos km faltan para la siguiente columna**; servicios con su valor; botón **Liquidar y cerrar mes** |
| Panel → Tarifas | Ver la matriz de Suma (se carga desde el seed, como las demás) |
| Excel y PDF | Columna "Bolsa aplicada" y estado de la liquidación |
| Pruebas | Cálculo por bolsa, cambio de columna al pasar un umbral, < 10 km por distancia, > 95 a convenir, cierre del mes |

**Tamaño estimado:** parecido al de "Exportar a Excel" más el de "Reabrir aprobados", unas 2 o 3 sesiones de trabajo. Se haría por fases:
1. Base de datos y carga de la tabla.
2. Cálculo y liquidación con pruebas.
3. Pantalla de liquidación.
4. Recargo de Suma.
5. Excel y PDF.

## 4. Preguntas antes de implementar

### Nuevas (por la decisión de "fuera de la disponibilidad")

- **A. ¿Cómo se sabe que un servicio está fuera de la disponibilidad?**
  - Automático por la hora: empieza después de las 22:00, llega a patio después de las 23:00, o se hace entre 13:00 y 15:00.
  - O lo marca el operador o el administrador en cada servicio.
- **B.** Los km de los servicios **fuera** de la disponibilidad, ¿suman a la bolsa del mes? Propongo que **no**.
- **C.** Dentro de la disponibilidad, si el operador registra un cardán o una persiana, ¿se guarda para el registro sin cobrarlo, o el sistema no deja registrarlo?
- **D.** Fuera de la disponibilidad, ¿el recargo nocturno sigue la regla general (termina después de las 20:40 y antes de las 6:00, a $86.500)?

### Siguen pendientes (las preguntas 6 a 9 quedan resueltas por la decisión)

1. **Km que cuentan.** El Excel dice "servicio + vacío". ¿La **fila** de cada servicio y la **bolsa** del mes se calculan con servicio + vacío? En tu mensaje mencionaste "km en servicio".
2. **Mientras el mes está abierto**, ¿qué valor ve el administrador en un servicio de Suma?
   - a) Provisional, con la columna que lleva el mes hasta hoy (puede cambiar).
   - b) Provisional, con la columna del mes anterior.
   - c) "Pendiente de liquidación", sin valor, hasta cerrar el mes.
3. **Bolsa fuera de la tabla:** si en el mes hay menos de 600 km o más de 2.400 km, ¿qué columna se usa? ¿La más cercana, o queda a convenir?
4. **Límites de columna:** 1.800 km exactos, ¿van en 1500–1800 o en 1800–2100? Propongo "hasta" incluido (1.800 → 1500–1800), como los rangos por servicio ("10,1 a 15").
5. **Aprobación:** ¿se pueden aprobar servicios de Suma antes de cerrar el mes? Si después del cierre se reabre o se agrega un servicio de ese mes, ¿se vuelve a liquidar el mes completo?
6. Dentro de la disponibilidad, ¿la tabla aplica a **todos** los tipos de vehículo y de servicio? Un **servicio fallido** dentro de la disponibilidad, ¿cómo se cobra?
10. **Mes:** ¿es el mes calendario de la fecha del servicio? ¿Los anulados no suman km? (Propongo que no sumen.)
11. **Vigencia:** el archivo se llama "202611". ¿La tabla rige todo 2026 o desde noviembre de 2026?
