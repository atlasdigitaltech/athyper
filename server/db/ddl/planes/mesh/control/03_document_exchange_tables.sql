-- Runtime document catalog projected from Athyper Entity Studio. Entity IDs are
-- published coordinates: PostgreSQL cannot enforce an FK across plane databases.
CREATE TABLE control.network_document_type (
    id                       uuid                                   NOT NULL DEFAULT shared.uuidv7(),
    code                     text                                   NOT NULL,
    name                     text                                   NOT NULL,
    description              text,
    direction_scope          control.network_document_direction_d   NOT NULL DEFAULT 'both',
    entity_id                uuid                                   NOT NULL,
    entity_code              text                                   NOT NULL,
    entity_version_policy    control.entity_version_policy_d        NOT NULL DEFAULT 'latest_published',
    pinned_entity_version_id uuid,
    pinned_contract_hash     text,
    metadata                 jsonb                                  NOT NULL DEFAULT '{}'::jsonb,
    status                   control.network_document_type_status_d NOT NULL DEFAULT 'draft',
    is_active                boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at        timestamptz,
    status_changed_by        uuid,
    created_at               timestamptz                            NOT NULL DEFAULT now(),
    created_by               uuid                                   NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,

    CONSTRAINT network_document_type_pkey PRIMARY KEY (id),
    CONSTRAINT network_document_type_code_uq UNIQUE (code),
    CONSTRAINT network_document_type_code_chk
        CHECK (code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT network_document_type_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT network_document_type_entity_code_chk
        CHECK (entity_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT network_document_type_version_policy_chk CHECK (
        (entity_version_policy = 'latest_published'
            AND pinned_entity_version_id IS NULL
            AND pinned_contract_hash IS NULL)
        OR
        (entity_version_policy = 'pinned'
            AND pinned_entity_version_id IS NOT NULL
            AND pinned_contract_hash IS NOT NULL)
    ),
    CONSTRAINT network_document_type_contract_hash_chk CHECK (
        pinned_contract_hash IS NULL
        OR pinned_contract_hash ~ '^[a-f0-9]{64}$'
    ),
    CONSTRAINT network_document_type_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT network_document_type_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT network_document_type_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.network_document_type IS
  'Mesh document-type catalog linked to an Entity Studio publication by stable entity identity. A pinned row freezes one published version; latest_published is resolved and frozen by each envelope.';
COMMENT ON COLUMN control.network_document_type.entity_id IS
  'Stable Entity Studio identity published from Athyper. This is deliberately not a cross-database FK.';
