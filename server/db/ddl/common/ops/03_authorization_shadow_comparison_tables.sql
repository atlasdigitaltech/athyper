CREATE TABLE ops.authorization_shadow_comparison (
    id                         uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                  uuid        NOT NULL,
    plane_code                 text        NOT NULL,
    entity_code                text        NOT NULL,
    source_entity_operation_id uuid        NOT NULL,
    source_release_hash        text        NOT NULL,
    source_artifact_hash       text        NOT NULL,
    request_id                 text        NOT NULL,
    cohort_code               text        NOT NULL DEFAULT 'legacy_baseline',
    correlation_id             uuid,
    principal_id               uuid        NOT NULL,
    comparison_status          text        NOT NULL,
    legacy_decision            text        NOT NULL,
    legacy_reason              text        NOT NULL,
    legacy_fingerprint         text        NOT NULL,
    candidate_decision         text,
    candidate_reason           text,
    candidate_fingerprint      text,
    candidate_error            text,
    observed_at                timestamptz NOT NULL,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    created_by                 uuid        NOT NULL,

    CONSTRAINT authorization_shadow_comparison_pkey PRIMARY KEY (id),
    CONSTRAINT authorization_shadow_comparison_tenant_id_uq UNIQUE (tenant_id,id),
    CONSTRAINT authorization_shadow_comparison_plane_chk CHECK (plane_code IN ('neon','mesh')),
    CONSTRAINT authorization_shadow_comparison_entity_chk CHECK (entity_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT authorization_shadow_comparison_release_hash_chk CHECK (source_release_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT authorization_shadow_comparison_artifact_hash_chk CHECK (source_artifact_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT authorization_shadow_comparison_request_chk CHECK (btrim(request_id) <> '' AND length(request_id) <= 256),
    CONSTRAINT authorization_shadow_comparison_cohort_chk CHECK (cohort_code ~ '^[a-z][a-z0-9_]{1,62}$'),
    CONSTRAINT authorization_shadow_comparison_status_chk CHECK (comparison_status IN ('match','mismatch','candidate_error')),
    CONSTRAINT authorization_shadow_comparison_decision_chk CHECK (
        legacy_decision IN ('allow','deny') AND (candidate_decision IS NULL OR candidate_decision IN ('allow','deny'))),
    CONSTRAINT authorization_shadow_comparison_reason_chk CHECK (
        btrim(legacy_reason) <> '' AND length(legacy_reason) <= 128
        AND (candidate_reason IS NULL OR (btrim(candidate_reason) <> '' AND length(candidate_reason) <= 128))),
    CONSTRAINT authorization_shadow_comparison_fingerprint_chk CHECK (
        legacy_fingerprint ~ '^[a-f0-9]{64}$'
        AND (candidate_fingerprint IS NULL OR candidate_fingerprint ~ '^[a-f0-9]{64}$')),
    CONSTRAINT authorization_shadow_comparison_shape_chk CHECK (
        (comparison_status IN ('match','mismatch')
          AND candidate_decision IS NOT NULL AND candidate_reason IS NOT NULL
          AND candidate_fingerprint IS NOT NULL AND candidate_error IS NULL)
        OR (comparison_status='candidate_error'
          AND candidate_decision IS NULL AND candidate_reason IS NULL
          AND candidate_fingerprint IS NULL AND candidate_error IS NOT NULL
          AND btrim(candidate_error) <> '' AND length(candidate_error) <= 1000)),
    CONSTRAINT authorization_shadow_comparison_semantics_chk CHECK (
        comparison_status <> 'match'
        OR (legacy_decision=candidate_decision AND legacy_reason=candidate_reason)),
    CONSTRAINT authorization_shadow_comparison_time_chk CHECK (observed_at <= created_at + interval '5 minutes'),
    CONSTRAINT authorization_shadow_comparison_actor_chk CHECK (created_by=principal_id)
);

COMMENT ON TABLE ops.authorization_shadow_comparison IS
  'Append-only, non-authorizing comparison evidence between legacy and candidate authorization decisions. Plane/release/artifact coordinates prevent cross-release qualification.';
