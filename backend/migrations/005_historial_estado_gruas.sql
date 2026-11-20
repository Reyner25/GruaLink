-- =====================================================================
-- 005 · HISTORIAL DE ESTADO DE LAS GRÚAS
-- Problema que resuelve:
--   El reporte "Promedio de grúas" necesita saber cuántas grúas estaban en
--   mantenimiento o inactivas CADA DÍA del pasado. gruas.estado solo dice el
--   estado de HOY. Esta tabla guarda cada cambio de estado con su fecha.
--
--   "En operación" no se guarda aquí: se calcula a partir de turnos_operador
--   (una grúa está en operación si tiene un turno ese día).
-- =====================================================================

CREATE TABLE gruas_estado_historial (
  id BIGSERIAL PRIMARY KEY,
  grua_id INT NOT NULL REFERENCES gruas(id),
  estado VARCHAR(20) NOT NULL
    CHECK (estado IN ('activa', 'inactiva', 'mantenimiento')),
  desde TIMESTAMPTZ NOT NULL DEFAULT now(),
  usuario_id INT REFERENCES usuarios(id),
  motivo TEXT
);

CREATE INDEX idx_gruas_historial ON gruas_estado_historial (grua_id, desde);

-- Punto de partida: el estado actual de cada grúa
INSERT INTO gruas_estado_historial (grua_id, estado, motivo)
SELECT id, estado, 'Estado inicial al crear el historial' FROM gruas;
