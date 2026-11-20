-- =====================================================================
-- 007 · TIPO DE VEHÍCULO "OTRO", RESCATE SEGÚN EL TIPO DE SERVICIO
--       Y CONCEPTOS QUE SOLO APLICA EL ADMINISTRADOR
--
-- Problema 1 (pedido por SOTRANDES, 20/11/2026):
--   En el Excel se atienden vehículos que no están en la lista (volqueta,
--   camión, tractocamión, van, microbús…). El operador necesita la opción
--   "Otro" y escribir cuál es.
--   Solución:
--     - tipos_vehiculo.es_otro: marca el tipo "Otro" (el que pide descripción).
--     - servicios.tipo_vehiculo_otro: qué vehículo era (ej. "Volqueta").
--   Regla provisional: un vehículo "Otro" no tiene tarifa propia, así que el
--   servicio queda "a convenir" y el administrador define el valor al aprobar.
--
-- Problema 2:
--   El operador marcaba a mano "¿Corresponde a un rescate?" aunque ya había
--   elegido el tipo de servicio "Rescate" (información repetida que podía
--   quedar contradictoria).
--   Solución: tipos_servicio.es_rescate. El servidor llena servicios.es_rescate
--   a partir del tipo de servicio; el operador ya no lo marca.
-- =====================================================================

-- ---------- 1. Vehículo "Otro" ----------
ALTER TABLE tipos_vehiculo ADD COLUMN es_otro BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO tipos_vehiculo (nombre, es_otro) VALUES ('Otro', TRUE)
ON CONFLICT (nombre) DO UPDATE SET es_otro = TRUE;

ALTER TABLE servicios ADD COLUMN tipo_vehiculo_otro VARCHAR(60);

-- ---------- 2. Rescate según el tipo de servicio ----------
ALTER TABLE tipos_servicio ADD COLUMN es_rescate BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE tipos_servicio SET es_rescate = TRUE WHERE nombre = 'Rescate';

-- Los servicios ya guardados quedan coherentes con su tipo
UPDATE servicios s
SET es_rescate = ts.es_rescate
FROM tipos_servicio ts
WHERE ts.id = s.tipo_servicio_id;

-- ---------- 3. Conceptos que NO reporta el operador ----------
-- Problema (pedido por SOTRANDES, 20/11/2026): la hora stand-by y el recargo
-- nocturno no los debe marcar el operador; los aplica el administrador (o, a
-- futuro, el sistema automáticamente según la hora de corte de cada cliente).
-- Solución: conceptos_tarifa.la_reporta_operador. Si es FALSE, el concepto no
-- aparece en el celular y el servidor lo rechaza si un operador lo envía.
-- El administrador lo agrega con la corrección autorizada del servicio.
ALTER TABLE conceptos_tarifa ADD COLUMN la_reporta_operador BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE conceptos_tarifa SET la_reporta_operador = FALSE
WHERE nombre IN ('Hora standby / disponibilidad', 'Recargo nocturno');
