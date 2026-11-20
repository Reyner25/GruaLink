-- =====================================================================
-- 006 · NUMERACIÓN DIGITAL DE ÓRDENES DESDE 1
-- Problema que resuelve:
--   La migración 004 hizo arrancar la secuencia en 10000, suponiendo que las
--   órdenes en papel llegaban hasta ~9.500. Al revisar el Excel completo se vio
--   que eso solo era cierto a comienzos de 2025 (en nov-2026 van en ~20.500) y,
--   además, que NO existe una sola serie: a cada grúa se le entrega un
--   talonario con su propio rango.
--
-- Decisión de SOTRANDES (20/11/2026):
--   GruaLink lleva su PROPIA numeración, independiente de los talonarios,
--   empezando desde el principio. La primera orden digital será la número 1.
--
-- Nota para el futuro:
--   Si algún día se importan los servicios históricos del Excel, su número de
--   talonario NO debe ir en servicios.numero_orden (chocaría con la numeración
--   digital, que es UNIQUE). Se guardará en una columna aparte, por ejemplo
--   numero_remision_papel, en una migración nueva.
-- =====================================================================

-- START WITH 1  : cambia el valor de inicio guardado en la secuencia
--                 (el que usaría un futuro "RESTART" sin número).
-- RESTART WITH 1: reinicia el contador: el próximo nextval() devolverá 1.
--                 (START solo no basta: no mueve el contador actual.)
-- MINVALUE 1    : deja explícito que no existen órdenes 0 ni negativas.
ALTER SEQUENCE servicios_numero_orden_seq
  MINVALUE 1
  START WITH 1
  RESTART WITH 1;
