-- Stable Entity identity. Editable contract properties belong to rows keyed by
-- entity_change_set in subsequent authoring phases, never on this table.
CREATE TABLE metadata.entity (
    id                  uuid                        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid,
    module_id           uuid                        NOT NULL,
    entity_code         text                        NOT NULL,
    entity_class        metadata.entity_class_d     NOT NULL,
    ownership_model     metadata.entity_ownership_d NOT NULL,
    status              metadata.entity_status_d    NOT NULL DEFAULT 'draft',
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz                  NOT NULL DEFAULT now(),
    created_by          uuid                         NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT entity_pkey PRIMARY KEY (id),
    CONSTRAINT entity_tenant_id_uq UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT entity_scope_code_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, entity_code),
    CONSTRAINT entity_code_chk
        CHECK (entity_code ~ '^[a-z][a-z0-9_]{1,62}$'),
    CONSTRAINT entity_ownership_scope_chk CHECK (
        (ownership_model IN ('system', 'package') AND tenant_id IS NULL)
        OR
        (ownership_model IN ('tenant', 'overlay') AND tenant_id IS NOT NULL)
    ),
    CONSTRAINT entity_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT entity_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE metadata.entity IS
  'Stable Entity identity. Labels, fields, storage, surfaces, operations, policies, and version state are deliberately excluded.';
COMMENT ON COLUMN metadata.entity.tenant_id IS
  'NULL for system/package definitions; populated for tenant definitions and overlays.';

-- Mutable authoring workspace. The normalized authoring graph added in later
-- phases is owned by this identifier.
CREATE TABLE metadata.entity_change_set (
    id                    uuid                                NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid,
    entity_id             uuid                                NOT NULL,
    change_set_code       text                                NOT NULL,
    branch_code           text                                NOT NULL DEFAULT 'main',
    base_release_id       uuid,
    parent_change_set_id  uuid,
    status                metadata.entity_change_set_status_d NOT NULL DEFAULT 'draft',
    lock_version          bigint                              NOT NULL DEFAULT 0,
    title                 text                                NOT NULL,
    change_summary        text,
    change_reason_code    text,
    ticket_reference      text,
    submitted_at          timestamptz,
    submitted_by          uuid,
    reviewed_at           timestamptz,
    reviewed_by           uuid,
    approved_at           timestamptz,
    approved_by           uuid,
    rejected_at           timestamptz,
    rejected_by           uuid,
    rejection_reason      text,
    published_at          timestamptz,
    published_by          uuid,
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz                         NOT NULL DEFAULT now(),
    created_by            uuid                                NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT entity_change_set_pkey PRIMARY KEY (id),
    CONSTRAINT entity_change_set_tenant_id_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT entity_change_set_entity_code_uq
        UNIQUE (entity_id, change_set_code),
    CONSTRAINT entity_change_set_code_chk
        CHECK (change_set_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_change_set_branch_chk
        CHECK (branch_code ~ '^[a-z][a-z0-9_./-]{0,126}$'),
    CONSTRAINT entity_change_set_lock_version_chk CHECK (lock_version >= 0),
    CONSTRAINT entity_change_set_title_chk
        CHECK (btrim(title) <> '' AND length(title) <= 256),
    CONSTRAINT entity_change_set_summary_chk CHECK (
        change_summary IS NULL
        OR (btrim(change_summary) <> '' AND length(change_summary) <= 4000)
    ),
    CONSTRAINT entity_change_set_reason_code_chk CHECK (
        change_reason_code IS NULL
        OR change_reason_code ~ '^[a-z][a-z0-9_.-]{1,126}$'
    ),
    CONSTRAINT entity_change_set_ticket_chk CHECK (
        ticket_reference IS NULL
        OR (btrim(ticket_reference) <> '' AND length(ticket_reference) <= 256)
    ),
    CONSTRAINT entity_change_set_submitted_pair_chk
        CHECK ((submitted_at IS NULL) = (submitted_by IS NULL)),
    CONSTRAINT entity_change_set_reviewed_pair_chk
        CHECK ((reviewed_at IS NULL) = (reviewed_by IS NULL)),
    CONSTRAINT entity_change_set_approved_pair_chk
        CHECK ((approved_at IS NULL) = (approved_by IS NULL)),
    CONSTRAINT entity_change_set_rejected_pair_chk
        CHECK ((rejected_at IS NULL) = (rejected_by IS NULL)),
    CONSTRAINT entity_change_set_published_pair_chk
        CHECK ((published_at IS NULL) = (published_by IS NULL)),
    CONSTRAINT entity_change_set_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT entity_change_set_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL)),
    CONSTRAINT entity_change_set_decision_chk CHECK (
        (status = 'draft'
            AND approved_at IS NULL
            AND rejected_at IS NULL
            AND published_at IS NULL)
        OR (status = 'in_review'
            AND submitted_at IS NOT NULL
            AND approved_at IS NULL
            AND rejected_at IS NULL
            AND published_at IS NULL)
        OR (status = 'approved'
            AND submitted_at IS NOT NULL
            AND reviewed_at IS NOT NULL
            AND approved_at IS NOT NULL
            AND rejected_at IS NULL
            AND published_at IS NULL)
        OR (status = 'rejected'
            AND submitted_at IS NOT NULL
            AND reviewed_at IS NOT NULL
            AND rejected_at IS NOT NULL
            AND rejection_reason IS NOT NULL
            AND approved_at IS NULL
            AND published_at IS NULL)
        OR status = 'abandoned'
        OR (status = 'published'
            AND approved_at IS NOT NULL
            AND published_at IS NOT NULL)
    ),
    CONSTRAINT entity_change_set_rejection_reason_chk CHECK (
        rejection_reason IS NULL
        OR (btrim(rejection_reason) <> '' AND length(rejection_reason) <= 4000)
    ),
    CONSTRAINT entity_change_set_no_self_parent_chk
        CHECK (parent_change_set_id IS DISTINCT FROM id)
);

COMMENT ON TABLE metadata.entity_change_set IS
  'Mutable Entity authoring workspace. Only draft/rejected work may be edited; approved/published work is sealed by triggers.';
COMMENT ON COLUMN metadata.entity_change_set.lock_version IS
  'Optimistic-concurrency token incremented by the database on substantive updates.';

-- Append-only publication header. Contract JSON remains in the referenced
-- snapshot.entity_contract_revision.
CREATE TABLE metadata.entity_release (
    id                       uuid                           NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid,
    entity_id                uuid                           NOT NULL,
    change_set_id            uuid                           NOT NULL,
    revision_id              uuid                           NOT NULL,
    release_no               bigint                         NOT NULL,
    version_label            text,
    release_kind             metadata.entity_release_kind_d NOT NULL DEFAULT 'publish',
    supersedes_release_id    uuid,
    rollback_of_release_id   uuid,
    contract_schema_code     text                           NOT NULL,
    contract_schema_version  text                           NOT NULL,
    contract_hash            text                           NOT NULL,
    revision_hash            text                           NOT NULL,
    release_hash             text                           NOT NULL,
    compatibility_level      metadata.compatibility_level_d NOT NULL,
    target_planes            text[]                         NOT NULL,
    minimum_runtime_version  text,
    signature_algorithm      text,
    signing_key_id           text,
    contract_signature       text,
    audit_event_id           uuid,
    publication_reason       text,
    ticket_reference         text,
    correlation_id           uuid,
    published_at             timestamptz                    NOT NULL DEFAULT now(),
    published_by             uuid                           NOT NULL,

    CONSTRAINT entity_release_pkey PRIMARY KEY (id),
    CONSTRAINT entity_release_tenant_id_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, id),
    CONSTRAINT entity_release_coordinate_uq
        UNIQUE NULLS NOT DISTINCT (tenant_id, entity_id, release_no),
    CONSTRAINT entity_release_no_chk CHECK (release_no >= 1),
    CONSTRAINT entity_release_version_label_chk CHECK (
        version_label IS NULL
        OR version_label ~ '^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$'
    ),
    CONSTRAINT entity_release_schema_code_chk
        CHECK (contract_schema_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT entity_release_schema_version_chk
        CHECK (contract_schema_version ~ '^[0-9]+\.[0-9]+(?:\.[0-9]+)?$'),
    CONSTRAINT entity_release_contract_hash_chk
        CHECK (contract_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT entity_release_revision_hash_chk
        CHECK (revision_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT entity_release_hash_chk
        CHECK (release_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT entity_release_target_planes_chk CHECK (
        cardinality(target_planes) BETWEEN 1 AND 3
        AND array_position(target_planes, NULL) IS NULL
        AND target_planes <@ ARRAY['athyper', 'neon', 'mesh']::text[]
    ),
    CONSTRAINT entity_release_minimum_runtime_chk CHECK (
        minimum_runtime_version IS NULL
        OR minimum_runtime_version ~ '^[0-9]+\.[0-9]+(?:\.[0-9]+)?(?:-[0-9A-Za-z.-]+)?$'
    ),
    CONSTRAINT entity_release_signature_chk CHECK (
        (signature_algorithm IS NULL
            AND signing_key_id IS NULL
            AND contract_signature IS NULL)
        OR (signature_algorithm IS NOT NULL
            AND btrim(signature_algorithm) <> ''
            AND signing_key_id IS NOT NULL
            AND btrim(signing_key_id) <> ''
            AND contract_signature IS NOT NULL
            AND btrim(contract_signature) <> '')
    ),
    CONSTRAINT entity_release_reason_chk CHECK (
        publication_reason IS NULL
        OR (btrim(publication_reason) <> '' AND length(publication_reason) <= 4000)
    ),
    CONSTRAINT entity_release_ticket_chk CHECK (
        ticket_reference IS NULL
        OR (btrim(ticket_reference) <> '' AND length(ticket_reference) <= 256)
    ),
    CONSTRAINT entity_release_kind_chk CHECK (
        (release_kind = 'publish' AND rollback_of_release_id IS NULL)
        OR (release_kind = 'rollback' AND rollback_of_release_id IS NOT NULL)
        OR (release_kind = 'retire' AND rollback_of_release_id IS NULL)
    ),
    CONSTRAINT entity_release_first_or_successor_chk CHECK (
        (release_no = 1 AND supersedes_release_id IS NULL AND release_kind = 'publish')
        OR (release_no > 1 AND supersedes_release_id IS NOT NULL)
    ),
    CONSTRAINT entity_release_no_self_reference_chk CHECK (
        supersedes_release_id IS DISTINCT FROM id
        AND rollback_of_release_id IS DISTINCT FROM id
    )
);

COMMENT ON TABLE metadata.entity_release IS
  'Append-only official Entity publication, rollback, or retirement event. The latest release row derives current publication status.';
COMMENT ON COLUMN metadata.entity_release.audit_event_id IS
  'Canonical audit.audit_log identifier. No FK is possible because audit evidence uses a time-partitioned composite primary key.';
COMMENT ON COLUMN metadata.entity_release.contract_signature IS
  'Optional detached signature of release_hash using signature_algorithm and signing_key_id.';
