-- =============================================================================
-- 012: horario del recargo nocturno editable y ajustes manuales del servicio
-- =============================================================================
-- Pedido del 24/11/2026:
--  1. La hora a partir de la cual se cobra el recargo nocturno (y hasta qué
--     hora de la madrugada) se edita en Catálogos → Conceptos → "Recargo
--     nocturno". Antes estaba fija en el código (20:40 a 06:00). Cada cliente
--     puede seguir teniendo su propia hora de inicio (clientes.recargo_nocturno_desde).
--  2. El administrador puede, al corregir un servicio:
--     - poner una TARIFA BÁSICA MANUAL (reemplaza la de la tabla de tarifas);
--     - decidir si se cobra el recargo nocturno: automático (por la hora de
--       fin), siempre o nunca.
-- No modifica datos existentes.

-- 1. Horario general del recargo, en el concepto marcado como recargo
ALTER TABLE conceptos_tarifa ADD COLUMN IF NOT EXISTS recargo_desde TIME;
ALTER TABLE conceptos_tarifa ADD COLUMN IF NOT EXISTS recargo_hasta TIME;
UPDATE conceptos_tarifa
SET recargo_desde = COALESCE(recargo_desde, '20:40'), recargo_hasta = COALESCE(recargo_hasta, '06:00')
WHERE es_recargo_nocturno;

-- 2. Ajustes manuales del administrador en cada servicio
--    tarifa_basica_manual: NULL = automática (tabla de tarifas o bolsa de km)
--    recargo_nocturno: 'auto' = según la hora de fin · 'si' = siempre · 'no' = nunca
ALTER TABLE servicios ADD COLUMN IF NOT EXISTS tarifa_basica_manual NUMERIC(12,2)
  CHECK (tarifa_basica_manual IS NULL OR tarifa_basica_manual >= 0);
ALTER TABLE servicios ADD COLUMN IF NOT EXISTS recargo_nocturno VARCHAR(5) NOT NULL DEFAULT 'auto';
ALTER TABLE servicios DROP CONSTRAINT IF EXISTS servicios_recargo_nocturno_check;
ALTER TABLE servicios ADD CONSTRAINT servicios_recargo_nocturno_check CHECK (recargo_nocturno IN ('auto', 'si', 'no'));
