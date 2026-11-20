-- =====================================================================
-- 001 · TURNOS DE OPERADORES
-- Problema que resuelve:
--   En el Excel, cada fila de servicio repite "Entra", "Sale" y "Termina turno".
--   Es decir, el turno se escribe una y otra vez por cada servicio y no hay
--   forma confiable de saber quién estaba trabajando, con qué grúa y cuándo
--   terminó su jornada. Esta tabla guarda UN registro por jornada.
--
--   OJO: servicios.fin_turno_real NO es lo mismo. Ese campo viene del Excel
--   ("Termina turno") y se deja intacto por compatibilidad; la jornada real
--   del operador ahora vive en esta tabla.
-- =====================================================================

CREATE TABLE turnos_operador (
  id SERIAL PRIMARY KEY,
  operador_id INT NOT NULL REFERENCES usuarios(id),
  grua_id INT NOT NULL REFERENCES gruas(id),
  inicio TIMESTAMPTZ NOT NULL DEFAULT now(),   -- hora del SERVIDOR, no del celular
  fin TIMESTAMPTZ,
  observaciones_inicio TEXT,
  observaciones_cierre TEXT,
  estado VARCHAR(20) NOT NULL DEFAULT 'activo'
    CHECK (estado IN ('activo', 'finalizado', 'cerrado_admin')),
  cerrado_por INT REFERENCES usuarios(id),     -- se llena si un admin cerró el turno

  -- Un turno activo NO tiene hora de fin; uno cerrado SIEMPRE la tiene
  CONSTRAINT turno_activo_sin_fin CHECK ((estado = 'activo') = (fin IS NULL)),
  CONSTRAINT turno_fin_despues_inicio CHECK (fin IS NULL OR fin >= inicio)
);

-- Regla 1: un operador no puede tener dos turnos activos al mismo tiempo.
-- Es un índice ÚNICO PARCIAL: solo cuenta las filas con estado = 'activo'.
-- Aunque lleguen dos peticiones al mismo tiempo, PostgreSQL rechaza la segunda.
CREATE UNIQUE INDEX ux_turno_activo_por_operador
  ON turnos_operador (operador_id) WHERE estado = 'activo';

-- Regla 2: una grúa no puede estar en dos turnos activos al mismo tiempo.
-- (Regla provisional: si se confirma que una grúa puede llevar dos operadores,
--  basta con borrar este índice en una nueva migración.)
CREATE UNIQUE INDEX ux_turno_activo_por_grua
  ON turnos_operador (grua_id) WHERE estado = 'activo';

CREATE INDEX idx_turnos_operador_inicio ON turnos_operador (operador_id, inicio DESC);

-- Cada servicio queda ligado a la jornada en la que se hizo.
-- Es opcional (NULL) para no romper los servicios que ya existen.
ALTER TABLE servicios ADD COLUMN turno_id INT REFERENCES turnos_operador(id);
CREATE INDEX idx_servicios_turno ON servicios (turno_id);
