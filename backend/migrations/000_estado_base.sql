-- =====================================================================
-- 000 · ESTADO BASE
-- Problema que resuelve:
--   La base de datos se creó a mano y no había registro de su estructura.
--   Este archivo documenta el esquema inicial. Usa "IF NOT EXISTS", así que:
--     - en la base actual NO cambia nada (las tablas ya existen);
--     - en un computador nuevo crea todo desde cero.
-- =====================================================================

CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  rol_id INT NOT NULL REFERENCES roles(id),
  nombre VARCHAR(120) NOT NULL,
  email VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  ultimo_login TIMESTAMPTZ,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sesiones_activas (
  id UUID PRIMARY KEY,
  usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_en TIMESTAMPTZ NOT NULL,
  creada_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clientes (
  id SERIAL PRIMARY KEY,
  razon_social VARCHAR(200) NOT NULL,
  nit VARCHAR(20) NOT NULL UNIQUE,
  telefono VARCHAR(30),
  email VARCHAR(160),
  direccion VARCHAR(255),
  activo BOOLEAN NOT NULL DEFAULT TRUE
);
-- Esta columna ya existía en la base real, pero no en el esquema documentado
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS nombre_comercial VARCHAR(120);

CREATE TABLE IF NOT EXISTS gruas (
  id SERIAL PRIMARY KEY,
  placa VARCHAR(10) NOT NULL UNIQUE,
  numero_interno VARCHAR(20) NOT NULL UNIQUE,
  estado VARCHAR(20) NOT NULL DEFAULT 'activa'
    CHECK (estado IN ('activa','inactiva','mantenimiento'))
);

CREATE TABLE IF NOT EXISTS tipos_vehiculo (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(60) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS tarifas (
  id SERIAL PRIMARY KEY,
  cliente_id INT NOT NULL REFERENCES clientes(id),
  tipo_vehiculo_id INT NOT NULL REFERENCES tipos_vehiculo(id),
  km_desde NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (km_desde >= 0),
  km_hasta NUMERIC(8,2) CHECK (km_hasta IS NULL OR km_hasta > km_desde),
  valor NUMERIC(12,2) NOT NULL CHECK (valor >= 0),
  vigente_desde DATE NOT NULL,
  vigente_hasta DATE,
  CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde)
);
CREATE INDEX IF NOT EXISTS idx_tarifas_busqueda
  ON tarifas (cliente_id, tipo_vehiculo_id, vigente_desde);

CREATE TABLE IF NOT EXISTS conceptos_tarifa (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL UNIQUE,
  descripcion TEXT,
  unidad_cobro VARCHAR(20) NOT NULL
    CHECK (unidad_cobro IN ('evento','hora','km','porcentaje','cantidad')),
  valor NUMERIC(12,2) NOT NULL CHECK (valor >= 0),
  vigente_desde DATE NOT NULL,
  vigente_hasta DATE,
  activo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS servicios (
  id SERIAL PRIMARY KEY,
  numero_orden VARCHAR(20) NOT NULL UNIQUE,
  grua_id INT NOT NULL REFERENCES gruas(id),
  operador_id INT NOT NULL REFERENCES usuarios(id),
  cliente_id INT NOT NULL REFERENCES clientes(id),
  tipo_vehiculo_id INT NOT NULL REFERENCES tipos_vehiculo(id),
  placa_vehiculo VARCHAR(10) NOT NULL,
  numero_vehiculo VARCHAR(20),
  fecha_servicio DATE NOT NULL,
  hora_solicitud TIMESTAMPTZ,
  ingreso_programado TIMESTAMPTZ,
  salida_programada TIMESTAMPTZ,
  fin_turno_real TIMESTAMPTZ,
  inicio_servicio TIMESTAMPTZ,
  fin_servicio TIMESTAMPTZ,
  origen VARCHAR(255),
  destino VARCHAR(255),
  km_vacio NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (km_vacio >= 0),
  km_servicio NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (km_servicio >= 0),
  km_facturables NUMERIC(8,2),
  es_rescate BOOLEAN NOT NULL DEFAULT FALSE,
  entregado_sin_novedad BOOLEAN NOT NULL DEFAULT FALSE,
  recibe_nombre VARCHAR(120),
  recibe_documento VARCHAR(30),
  observaciones TEXT,
  tarifa_id INT REFERENCES tarifas(id),
  valor_tarifa_basica NUMERIC(12,2),
  valor_conceptos NUMERIC(12,2) NOT NULL DEFAULT 0,
  valor_calculado NUMERIC(12,2),
  valor_aprobado NUMERIC(12,2),
  porcentaje_operador NUMERIC(5,2),
  estado VARCHAR(30) NOT NULL DEFAULT 'solicitado'
    CHECK (estado IN ('solicitado','asignado','en_desplazamiento','en_servicio',
                      'finalizado','en_revision','aprobado','anulado')),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  cerrado_en TIMESTAMPTZ,
  CHECK (fin_servicio IS NULL OR inicio_servicio IS NULL OR fin_servicio >= inicio_servicio)
);
CREATE INDEX IF NOT EXISTS idx_servicios_fecha ON servicios (fecha_servicio);
CREATE INDEX IF NOT EXISTS idx_servicios_cliente_estado ON servicios (cliente_id, estado);
CREATE INDEX IF NOT EXISTS idx_servicios_grua ON servicios (grua_id, fecha_servicio);
CREATE INDEX IF NOT EXISTS idx_servicios_operador ON servicios (operador_id, fecha_servicio);

CREATE TABLE IF NOT EXISTS servicio_conceptos (
  id SERIAL PRIMARY KEY,
  servicio_id INT NOT NULL REFERENCES servicios(id) ON DELETE CASCADE,
  concepto_id INT NOT NULL REFERENCES conceptos_tarifa(id),
  cantidad NUMERIC(10,2) NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  valor_unitario NUMERIC(12,2) NOT NULL CHECK (valor_unitario >= 0),
  total NUMERIC(12,2) NOT NULL CHECK (total >= 0),
  UNIQUE (servicio_id, concepto_id)
);

CREATE TABLE IF NOT EXISTS bitacora (
  id BIGSERIAL PRIMARY KEY,
  usuario_id INT REFERENCES usuarios(id),
  entidad VARCHAR(60) NOT NULL,
  registro_id INT NOT NULL,
  operacion VARCHAR(20) NOT NULL
    CHECK (operacion IN ('crear','actualizar','anular','autorizar_correccion')),
  valores_anteriores JSONB,
  valores_nuevos JSONB,
  motivo TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bitacora_entidad ON bitacora (entidad, registro_id);

-- Roles iniciales (no se duplican si ya existen)
INSERT INTO roles (nombre) VALUES ('administrador'), ('operador'), ('financiero')
ON CONFLICT (nombre) DO NOTHING;
