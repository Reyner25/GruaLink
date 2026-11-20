-- =====================================================================
-- 004 · AJUSTES A SERVICIOS Y BITÁCORA
-- =====================================================================

-- ---------- 1. Número de orden consecutivo ----------
-- Problema: el código generaba "OS-<milisegundos>", que no es consecutivo.
-- En el Excel las órdenes en papel llegan hasta ~9.500, así que la numeración
-- digital empieza en 10000 para no chocar con las de papel.
-- (Valor provisional: si SOTRANDES quiere otro número inicial, se cambia con
--  ALTER SEQUENCE servicios_numero_orden_seq RESTART WITH <número>;)
CREATE SEQUENCE servicios_numero_orden_seq START WITH 10000;

-- ---------- 2. Campos nuevos del servicio ----------
-- Observaciones al entregar el vehículo (distintas de las observaciones generales)
ALTER TABLE servicios ADD COLUMN observaciones_entrega TEXT;
-- Quién aprobó el servicio y cuándo (facilita los reportes; también queda en bitácora)
ALTER TABLE servicios ADD COLUMN aprobado_por INT REFERENCES usuarios(id);
ALTER TABLE servicios ADD COLUMN aprobado_en TIMESTAMPTZ;

-- ---------- 3. Más operaciones en la bitácora ----------
-- Problema: solo se permitían 4 operaciones; faltaban las de turnos y aprobación.
ALTER TABLE bitacora DROP CONSTRAINT IF EXISTS bitacora_operacion_check;
ALTER TABLE bitacora ADD CONSTRAINT bitacora_operacion_check
  CHECK (operacion IN (
    'crear', 'actualizar', 'anular', 'autorizar_correccion',
    'aprobar', 'finalizar', 'iniciar_turno', 'finalizar_turno', 'cerrar_turno'
  ));

-- ---------- 4. Sesiones ----------
-- Acelera "cerrar todas las sesiones de un usuario" y la limpieza de vencidas
CREATE INDEX IF NOT EXISTS idx_sesiones_usuario ON sesiones_activas (usuario_id);
CREATE INDEX IF NOT EXISTS idx_sesiones_expira ON sesiones_activas (expira_en);
