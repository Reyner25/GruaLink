-- =============================================================================
-- 013: columna PROVISIONAL de la bolsa de km, configurable por cliente
-- =============================================================================
-- Mientras el mes está abierto, los servicios de un cliente por bolsa de km
-- (Suma) se calculan con una columna provisional. Antes estaba fija en el
-- código (1500–1800 km). Ahora se elige en Tarifas → "Bolsa de km".
-- Se guarda un número de km que cae en la columna elegida (ej. 1800 → la
-- columna 1500–1800). NULL = 1800 (valor por defecto).
-- No modifica datos existentes.
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS bolsa_km_provisional NUMERIC(10,2)
  CHECK (bolsa_km_provisional IS NULL OR bolsa_km_provisional >= 0);
UPDATE clientes SET bolsa_km_provisional = 1800
WHERE modalidad_cobro = 'bolsa_km_mensual' AND bolsa_km_provisional IS NULL;
