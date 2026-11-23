-- =============================================================================
-- 011: PAGO AL OPERADOR (antes pregunta P11)
-- =============================================================================
-- Reglas (23/11/2026):
--  - SUMA: 6 % del valor del servicio.
--  - Cualquier otra empresa: 8 % de la tarifa, la persiana y el rescate
--    (a convenir); $20.000 fijos una vez por servicio si hay cardán; no se
--    pagan cámaras, recargo nocturno, stand-by, kit antiderrames ni reiniciada.
--  - Base: el valor APROBADO (antes de aprobar, el pago es provisional).
--
-- Las reglas se administran en Tarifas → "Pago a operadores", con vigencia
-- (como las tarifas): para cambiar un porcentaje se cierra la regla vigente y
-- se crea otra. No modifica datos existentes.

-- 1. Reglas de pago. cliente_id NULL = "Cualquier otra empresa" (general).
--    Para cada parte gana la regla propia del cliente; si no tiene, la general.
--    Una regla 'total' (Suma) reemplaza a todas las demás partes.
--    componente: 'total'            → todo el valor del servicio (ej. Suma 6 %)
--                'tarifa_basica'    → la tarifa básica
--                'valor_a_convenir' → servicios sin tarifa (rescate): valor aprobado sin adicionales
--                'concepto'         → un trabajo adicional (concepto_id)
--    forma: 'porcentaje' (valor = %) · 'fijo_servicio' (valor en $, una vez
--           por servicio si el concepto está) · 'no_paga'
CREATE TABLE IF NOT EXISTS reglas_pago_operador (
  id SERIAL PRIMARY KEY,
  cliente_id INT REFERENCES clientes(id),
  componente VARCHAR(20) NOT NULL CHECK (componente IN ('total', 'tarifa_basica', 'valor_a_convenir', 'concepto')),
  concepto_id INT REFERENCES conceptos_tarifa(id),
  forma VARCHAR(16) NOT NULL CHECK (forma IN ('porcentaje', 'fijo_servicio', 'no_paga')),
  valor NUMERIC(12,2),
  vigente_desde DATE NOT NULL,
  vigente_hasta DATE CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((componente = 'concepto') = (concepto_id IS NOT NULL)),
  CHECK (
    (forma = 'no_paga' AND valor IS NULL)
    OR (forma = 'porcentaje' AND valor BETWEEN 0 AND 100)
    OR (forma = 'fijo_servicio' AND valor >= 0)
  ),
  -- Una sola regla vigente por cliente + componente (+ concepto) a la vez
  EXCLUDE USING gist (
    (COALESCE(cliente_id, 0)) WITH =,
    componente WITH =,
    (COALESCE(concepto_id, 0)) WITH =,
    daterange(vigente_desde, vigente_hasta, '[]') WITH &&
  )
);

-- 2. En cada servicio APROBADO se guarda lo que se le paga al operador y el
--    detalle (qué regla se aplicó a cada parte). Antes de aprobar se calcula
--    al vuelo (provisional). Si el servicio se reabre, se borra.
ALTER TABLE servicios ADD COLUMN IF NOT EXISTS valor_operador NUMERIC(12,2);
ALTER TABLE servicios ADD COLUMN IF NOT EXISTS pago_operador_detalle JSONB;
