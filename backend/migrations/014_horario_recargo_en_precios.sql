-- =============================================================================
-- 014: el horario del recargo nocturno se maneja en TARIFAS → Precios de conceptos
-- =============================================================================
-- Pedido del 24/11/2026: la hora del recargo nocturno no debe estar en
-- Clientes sino en Tarifas, junto al precio del concepto "Recargo nocturno".
-- Cada fila de precio del recargo (Clientes generales o un cliente) lleva su
-- horario: se cobra si el servicio termina después de "recargo_desde" y antes
-- de "recargo_hasta" (madrugada). Si el precio de un cliente no tiene horario,
-- se usa el del precio general.
--
-- Se copian los horarios que ya existían:
--   - general: el del concepto (Catálogos, migración 012) → precio general
--   - por cliente: clientes.recargo_nocturno_desde (ej. La Rolita 19:00) →
--     precio del recargo de ese cliente (si no tenía precio propio, se crea
--     uno con el mismo valor del general para no perder la hora).
-- Las columnas antiguas (clientes.recargo_nocturno_desde y las del concepto)
-- quedan como respaldo y ya no se editan desde el panel.

ALTER TABLE precios_concepto ADD COLUMN IF NOT EXISTS recargo_desde TIME;
ALTER TABLE precios_concepto ADD COLUMN IF NOT EXISTS recargo_hasta TIME;

-- Precio general del recargo ← horario del concepto
UPDATE precios_concepto p
SET recargo_desde = COALESCE(p.recargo_desde, ct.recargo_desde, '20:40'),
    recargo_hasta = COALESCE(p.recargo_hasta, ct.recargo_hasta, '06:00')
FROM conceptos_tarifa ct
WHERE ct.id = p.concepto_id AND ct.es_recargo_nocturno AND p.cliente_id IS NULL;

-- Clientes con hora propia y SIN precio propio del recargo: se crea su precio
-- (mismo valor del general vigente) para guardar ahí la hora
INSERT INTO precios_concepto (concepto_id, cliente_id, valor, vigente_desde, vigente_hasta)
SELECT g.concepto_id, c.id, g.valor, g.vigente_desde, g.vigente_hasta
FROM clientes c
JOIN conceptos_tarifa ct ON ct.es_recargo_nocturno
JOIN precios_concepto g ON g.concepto_id = ct.id AND g.cliente_id IS NULL
WHERE c.recargo_nocturno_desde IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM precios_concepto p WHERE p.concepto_id = ct.id AND p.cliente_id = c.id);

-- Precio del recargo de cada cliente ← su hora propia
UPDATE precios_concepto p
SET recargo_desde = COALESCE(p.recargo_desde, c.recargo_nocturno_desde)
FROM clientes c, conceptos_tarifa ct
WHERE p.cliente_id = c.id AND ct.id = p.concepto_id AND ct.es_recargo_nocturno
  AND c.recargo_nocturno_desde IS NOT NULL;
