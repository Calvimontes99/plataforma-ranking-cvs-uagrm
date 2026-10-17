CREATE TABLE departamentos (
    id UUID PRIMARY KEY,
    codigo VARCHAR(30) NOT NULL UNIQUE,
    nombre VARCHAR(150) NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE vacantes (
    id UUID PRIMARY KEY,
    departamento_id UUID NOT NULL REFERENCES departamentos(id),
    titulo VARCHAR(180) NOT NULL,
    descripcion TEXT NOT NULL,
    cupo_total INTEGER NOT NULL CHECK (cupo_total >= 0),
    cupo_disponible INTEGER NOT NULL CHECK (cupo_disponible >= 0 AND cupo_disponible <= cupo_total),
    salario_presupuestado NUMERIC(15,2) NOT NULL CHECK (salario_presupuestado >= 0),
    moneda VARCHAR(3) NOT NULL,
    estado VARCHAR(30) NOT NULL,
    fecha_apertura TIMESTAMPTZ,
    fecha_cierre TIMESTAMPTZ,
    version BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE vacante_habilidades_requeridas (
    vacante_id UUID NOT NULL REFERENCES vacantes(id) ON DELETE CASCADE,
    habilidad VARCHAR(120) NOT NULL,
    PRIMARY KEY (vacante_id, habilidad)
);

CREATE TABLE vacante_habilidades_preferidas (
    vacante_id UUID NOT NULL REFERENCES vacantes(id) ON DELETE CASCADE,
    habilidad VARCHAR(120) NOT NULL,
    PRIMARY KEY (vacante_id, habilidad)
);

CREATE TABLE etapas_seleccion (
    id UUID PRIMARY KEY,
    vacante_id UUID NOT NULL REFERENCES vacantes(id) ON DELETE CASCADE,
    nombre VARCHAR(120) NOT NULL,
    orden INTEGER NOT NULL CHECK (orden > 0),
    obligatoria BOOLEAN NOT NULL,
    UNIQUE (vacante_id, orden)
);

CREATE TABLE preaprobaciones (
    id UUID PRIMARY KEY,
    vacante_id UUID NOT NULL REFERENCES vacantes(id),
    postulacion_id UUID NOT NULL,
    candidato_id UUID NOT NULL,
    ranking_id UUID NOT NULL,
    score DOUBLE PRECISION NOT NULL CHECK (score >= 0 AND score <= 100),
    creada_en TIMESTAMPTZ NOT NULL,
    UNIQUE (vacante_id, postulacion_id)
);

CREATE TABLE contratos (
    id UUID PRIMARY KEY,
    saga_id UUID NOT NULL UNIQUE,
    vacante_id UUID NOT NULL REFERENCES vacantes(id),
    postulacion_id UUID NOT NULL,
    candidato_id UUID NOT NULL,
    terminos TEXT NOT NULL,
    creado_en TIMESTAMPTZ NOT NULL
);

CREATE TABLE outbox_events (
    id UUID PRIMARY KEY,
    aggregate_type VARCHAR(100) NOT NULL,
    aggregate_id UUID NOT NULL,
    event_type VARCHAR(160) NOT NULL,
    payload JSONB NOT NULL,
    routing_key VARCHAR(160) NOT NULL,
    status VARCHAR(20) NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    occurred_at TIMESTAMPTZ NOT NULL,
    published_at TIMESTAMPTZ,
    last_error VARCHAR(1000)
);

CREATE INDEX idx_vacantes_estado ON vacantes(estado);
CREATE INDEX idx_preaprobaciones_vacante ON preaprobaciones(vacante_id);
CREATE INDEX idx_outbox_pending ON outbox_events(status, occurred_at);

INSERT INTO departamentos (id, codigo, nombre, activo)
VALUES ('00000000-0000-0000-0000-000000000001', 'GENERAL', 'Departamento General', TRUE)
ON CONFLICT DO NOTHING;
