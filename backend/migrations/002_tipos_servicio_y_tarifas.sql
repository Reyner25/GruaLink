-- =====================================================================
-- 002 · TIPOS DE SERVICIO Y REGLAS DE TARIFAS
-- Problema que resuelve (visto en la hoja "TB TARIFAS" del Excel):
--   1. El precio NO depende solo del cliente y del tipo de vehículo; también
--      del TIPO DE SERVICIO. Ejemplo para un busetón de "Clientes generales":
--        Remolque normal ............... $410.000
--        Remolque parte trasera ........ $1.023.000
--        Servicio fallido .............. $181.000
--   2. Existe una lista de "Clientes generales": precios que aplican a
--      cualquier cliente que no tenga tarifa propia. Para representarla,
--      tarifas.cliente_id ahora puede ser NULL (NULL = clientes generales).
--   3. Se impide que dos tarifas se superpongan (mismo cliente, vehículo,
--      tipo de servicio, rango de km y vigencia).
-- =====================================================================

-- ---------- 1. Catálogo de tipos de servicio ----------
CREATE TABLE tipos_servicio (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL UNIQUE,
  -- TRUE cuando el precio es "A convenir" (ej. rescate): no se calcula
  -- automáticamente, el administrador lo define al revisar el servicio.
  valor_a_convenir BOOLEAN NOT NULL DEFAULT FALSE,
  activo BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO tipos_servicio (nombre, valor_a_convenir) VALUES
  ('Remolque', FALSE),
  ('Remolque parte trasera', FALSE),
  ('Servicio fallido', FALSE),
  ('Rescate', TRUE);

-- ---------- 2. Las tarifas ahora dependen del tipo de servicio ----------
ALTER TABLE tarifas ADD COLUMN tipo_servicio_id INT REFERENCES tipos_servicio(id);

-- Las tarifas existentes eran de remolque normal
UPDATE tarifas
SET tipo_servicio_id = (SELECT id FROM tipos_servicio WHERE nombre = 'Remolque')
WHERE tipo_servicio_id IS NULL;

ALTER TABLE tarifas ALTER COLUMN tipo_servicio_id SET NOT NULL;

-- ---------- 3. Tarifas de "Clientes generales" (cliente_id NULL) ----------
ALTER TABLE tarifas ALTER COLUMN cliente_id DROP NOT NULL;

-- El servicio guarda qué tipo de servicio fue (NULL en los registros viejos)
ALTER TABLE servicios ADD COLUMN tipo_servicio_id INT REFERENCES tipos_servicio(id);

-- ---------- 4. Prohibir rangos superpuestos ----------
-- btree_gist permite usar "=" junto con "&&" (se superpone) en una restricción.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Cómo leerla: "no pueden existir dos filas con el mismo cliente, vehículo y
-- tipo de servicio CUYOS rangos de km se crucen Y cuyas vigencias se crucen".
--   COALESCE(cliente_id, 0): trata a "clientes generales" (NULL) como un valor,
--     porque en SQL NULL = NULL no es verdadero y no se compararían.
--   numrange(..., '[]'): rango de km con ambos extremos incluidos (0 a 10 km).
--   daterange(..., '[]'): vigencia con ambas fechas incluidas. hasta NULL = sin fin.
ALTER TABLE tarifas ADD CONSTRAINT tarifas_sin_superposicion
  EXCLUDE USING gist (
    (COALESCE(cliente_id, 0)) WITH =,
    tipo_vehiculo_id WITH =,
    tipo_servicio_id WITH =,
    numrange(km_desde, km_hasta, '[]') WITH &&,
    daterange(vigente_desde, vigente_hasta, '[]') WITH &&
  );

DROP INDEX IF EXISTS idx_tarifas_busqueda;
CREATE INDEX idx_tarifas_busqueda
  ON tarifas (cliente_id, tipo_vehiculo_id, tipo_servicio_id, vigente_desde);
