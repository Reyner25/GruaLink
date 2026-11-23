-- =============================================================================
-- 008: operación "reabrir" en la bitácora
-- =============================================================================
-- Nueva regla (23/11/2026): un servicio APROBADO se puede
--   - REABRIR: vuelve a "en revisión" para corregirlo y aprobarlo de nuevo, o
--   - ANULAR,
-- siempre por el administrador y con motivo obligatorio.
-- La anulación ya existía como operación ("anular"); se agrega "reabrir" para
-- que en la bitácora se distinga claramente de un cambio de estado normal.
-- No cambia datos: solo amplía la lista de operaciones permitidas.
ALTER TABLE bitacora DROP CONSTRAINT IF EXISTS bitacora_operacion_check;
ALTER TABLE bitacora ADD CONSTRAINT bitacora_operacion_check
  CHECK (operacion IN (
    'crear', 'actualizar', 'anular', 'autorizar_correccion',
    'aprobar', 'finalizar', 'iniciar_turno', 'finalizar_turno', 'cerrar_turno',
    'reabrir'
  ));
