-- =====================================================================
-- 003 · PRECIOS DE CONCEPTOS ADICIONALES POR CLIENTE
-- Problema que resuelve (hoja "TB TARIFAS" del Excel):
--   Un mismo concepto tiene precios distintos según el cliente y el año:
--     "Desmontar cardán"  Clientes generales $92.400 · CAPITALBUS $88.000
--                         SOTRAMAC $46.100 ...
--   La tabla conceptos_tarifa tenía UN solo valor y "nombre" UNIQUE, así que
--   era imposible guardar varios precios del mismo concepto.
--
-- Solución (separar el QUÉ del CUÁNTO):
--   conceptos_tarifa  -> catálogo: QUÉ se cobra y en qué unidad (evento, hora...)
--   precios_concepto  -> CUÁNTO vale, para qué cliente (NULL = clientes
--                        generales) y desde/hasta qué fecha.
--
-- Cambio en columnas existentes (justificación):
--   conceptos_tarifa.valor, vigente_desde y vigente_hasta pasan a
--   precios_concepto. Antes de borrarlas, sus datos se copian como precios de
--   "clientes generales", así que no se pierde información.
-- =====================================================================

CREATE TABLE precios_concepto (
  id SERIAL PRIMARY KEY,
  concepto_id INT NOT NULL REFERENCES conceptos_tarifa(id),
  cliente_id INT REFERENCES clientes(id),          -- NULL = clientes generales
  valor NUMERIC(12,2) NOT NULL CHECK (valor >= 0),
  vigente_desde DATE NOT NULL,
  vigente_hasta DATE,
  CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde),

  -- Un concepto no puede tener dos precios vigentes a la vez para el mismo cliente
  CONSTRAINT precios_concepto_sin_superposicion EXCLUDE USING gist (
    concepto_id WITH =,
    (COALESCE(cliente_id, 0)) WITH =,
    daterange(vigente_desde, vigente_hasta, '[]') WITH &&
  )
);

-- Copiar los valores actuales (si hubiera) antes de quitar las columnas
INSERT INTO precios_concepto (concepto_id, cliente_id, valor, vigente_desde, vigente_hasta)
SELECT id, NULL, valor, vigente_desde, vigente_hasta FROM conceptos_tarifa;

ALTER TABLE conceptos_tarifa
  DROP COLUMN valor,
  DROP COLUMN vigente_desde,
  DROP COLUMN vigente_hasta;
