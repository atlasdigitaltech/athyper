-- Plane-local policy catalog required by common services, including Atlas AI.
-- This file is applied to Athyper, Neon, and Mesh.

CREATE TABLE control.policy_definition (
    id               uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid,
    module_id        uuid,
    entity_type      text        NOT NULL,
    name             text        NOT NULL,
    description      text,
    priority         smallint    NOT NULL DEFAULT 100,
    evaluation_mode  text        NOT NULL DEFAULT 'first_match',
    effective_from   date        NOT NULL DEFAULT CURRENT_DATE,
    effective_until  date,
    version_no       integer     NOT NULL DEFAULT 1,
    status           text        NOT NULL DEFAULT 'active',
    is_active        boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    created_at       timestamptz NOT NULL DEFAULT now(),
    created_by       uuid        NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,

    CONSTRAINT pdef_pkey PRIMARY KEY (id)
);

COMMENT ON TABLE control.policy_definition IS
    'Plane-local policy container shared by common services. tenant_id=NULL denotes a platform-global policy.';

COMMENT ON COLUMN control.policy_definition.module_id IS
    'Optional plane module scope. NULL denotes a cross-module policy.';
