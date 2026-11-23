-- =============================================================================
-- 009: recargo nocturno AUTOMÁTICO
-- =============================================================================
-- Regla (23/11/2026, tarifas 2026): el recargo nocturno se cobra solo si el
-- servicio TERMINA después de la hora de corte del cliente y antes de las
-- 6:00 a. m. Hora de corte: 20:40 para clientes generales; cada cliente
-- puede tener la suya (La Rolita: 19:00).
--
-- 1. clientes.recargo_nocturno_desde: hora de corte del cliente.
--    NULL = usa la hora general (20:40, definida en services/tarifa.service.js).
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS recargo_nocturno_desde TIME;

-- 2. conceptos_tarifa.es_recargo_nocturno: cuál concepto es el recargo (el
--    sistema lo agrega solo; no depende del nombre). Solo puede haber uno.
ALTER TABLE conceptos_tarifa ADD COLUMN IF NOT EXISTS es_recargo_nocturno BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE conceptos_tarifa SET es_recargo_nocturno = TRUE WHERE nombre = 'Recargo nocturno';
CREATE UNIQUE INDEX IF NOT EXISTS uq_conceptos_un_recargo_nocturno
  ON conceptos_tarifa ((TRUE)) WHERE es_recargo_nocturno;
