-- =============================================================================
-- 010: cobro por BOLSA DE KILOMETRAJE MENSUAL (cliente Suma)
-- =============================================================================
-- Ver docs/PLAN-SUMA.md. Resumen:
--  - El cliente se cobra por bolsa: los km de todos sus servicios del mes
--    eligen la COLUMNA de la tabla; los km de cada servicio, la FILA.
--  - Servicios "fuera de la disponibilidad": tarifa de Clientes generales y
--    con trabajos adicionales y recargo nocturno.
-- No modifica ni borra datos existentes.

-- 1. Modalidad de cobro del cliente
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS modalidad_cobro VARCHAR(20) NOT NULL DEFAULT 'por_servicio';
ALTER TABLE clientes DROP CONSTRAINT IF EXISTS clientes_modalidad_cobro_check;
ALTER TABLE clientes ADD CONSTRAINT clientes_modalidad_cobro_check
  CHECK (modalidad_cobro IN ('por_servicio', 'bolsa_km_mensual'));

-- 2. Tipos de servicio que se cobran con la bolsa (remolques). Los demás
--    (servicio fallido, rescate) se cobran como siempre.
ALTER TABLE tipos_servicio ADD COLUMN IF NOT EXISTS usa_bolsa_km BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE tipos_servicio SET usa_bolsa_km = TRUE WHERE nombre IN ('Remolque', 'Remolque parte trasera');

-- 3. Tabla de la bolsa: una fila por celda (columna de bolsa × rango de km)
--    forma: 'fijo' = valor por servicio; 'por_km' = valor × km del servicio;
--           'a_convenir' = sin valor (el administrador lo define al aprobar)
CREATE TABLE IF NOT EXISTS tarifas_bolsa_km (
  id SERIAL PRIMARY KEY,
  cliente_id INT NOT NULL REFERENCES clientes(id),
  bolsa_km_desde NUMERIC(10,2) NOT NULL CHECK (bolsa_km_desde >= 0),
  bolsa_km_hasta NUMERIC(10,2) CHECK (bolsa_km_hasta IS NULL OR bolsa_km_hasta >= bolsa_km_desde),
  km_desde NUMERIC(8,2) NOT NULL CHECK (km_desde >= 0),
  km_hasta NUMERIC(8,2) CHECK (km_hasta IS NULL OR km_hasta >= km_desde),
  forma VARCHAR(12) NOT NULL CHECK (forma IN ('fijo', 'por_km', 'a_convenir')),
  valor NUMERIC(12,2) CHECK (valor IS NULL OR valor >= 0),
  vigente_desde DATE NOT NULL,
  vigente_hasta DATE CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((forma = 'a_convenir') = (valor IS NULL)),
  -- Ninguna celda se superpone con otra del mismo cliente y vigencia
  EXCLUDE USING gist (
    cliente_id WITH =,
    numrange(bolsa_km_desde, bolsa_km_hasta, '[]') WITH &&,
    numrange(km_desde, km_hasta, '[]') WITH &&,
    daterange(vigente_desde, vigente_hasta, '[]') WITH &&
  )
);
CREATE INDEX IF NOT EXISTS idx_tarifas_bolsa_cliente ON tarifas_bolsa_km (cliente_id, vigente_desde);

-- 4. En cada servicio: si está fuera de la disponibilidad y con qué celda y
--    bolsa del mes se calculó (para mostrarlo y auditarlo)
ALTER TABLE servicios ADD COLUMN IF NOT EXISTS fuera_disponibilidad BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE servicios ADD COLUMN IF NOT EXISTS tarifa_bolsa_id INT REFERENCES tarifas_bolsa_km(id);
ALTER TABLE servicios ADD COLUMN IF NOT EXISTS bolsa_km_mes NUMERIC(10,2);
