-- Neon party-risk foundation.
--
-- Ownership is intentionally split by semantics, not by UI surface:
--   * platform taxonomies/models/sources remain master reference catalogs;
--   * interpreted party-risk records remain master business state;
--   * governance continues to own close cycles, certifications, legal holds,
--     moderation, and report packs. It does not duplicate these tables.

CREATE TABLE master.risk_dimension (
    code                    text        NOT NULL,
    name                    text        NOT NULL,
    description             text,
    category                text        NOT NULL,
    applicable_contexts     text[]      NOT NULL DEFAULT '{}'::text[],
    is_knockout             boolean     NOT NULL DEFAULT false,
    ordinal                 smallint    NOT NULL DEFAULT 0,
    is_system_defined       boolean     NOT NULL DEFAULT true,
    status                  text        NOT NULL DEFAULT 'active',

    CONSTRAINT risk_dimension_pkey PRIMARY KEY (code),
    CONSTRAINT risk_dimension_code_chk
        CHECK (code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT risk_dimension_name_chk
        CHECK (btrim(name) <> '' AND length(name) <= 240),
    CONSTRAINT risk_dimension_category_chk
        CHECK (category IN (
            'esg', 'credit', 'compliance', 'operational',
            'reputational', 'data_quality', 'engagement'
        )),
    CONSTRAINT risk_dimension_contexts_chk
        CHECK (applicable_contexts <@ ARRAY[
            'organization', 'supplier_role', 'customer_role',
            'project_engagement'
        ]::text[]),
    CONSTRAINT risk_dimension_ordinal_chk CHECK (ordinal >= 0),
    CONSTRAINT risk_dimension_status_chk
        CHECK (status IN ('active', 'deprecated'))
);

COMMENT ON TABLE master.risk_dimension IS
  'Platform risk taxonomy used by all Neon tenants. Model-specific weights and knockout behavior belong to risk_model_dimension.';

CREATE TABLE master.risk_driver_registry (
    code                      text        NOT NULL,
    name                      text        NOT NULL,
    description               text,
    default_dimension_code    text,
    default_severity          text        NOT NULL DEFAULT 'medium',
    applicable_evidence_types text[]      NOT NULL DEFAULT '{}'::text[],
    is_knockout               boolean     NOT NULL DEFAULT false,
    is_system_defined         boolean     NOT NULL DEFAULT true,

    CONSTRAINT risk_driver_registry_pkey PRIMARY KEY (code),
    CONSTRAINT risk_driver_registry_code_chk
        CHECK (code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT risk_driver_registry_name_chk
        CHECK (btrim(name) <> '' AND length(name) <= 240),
    CONSTRAINT risk_driver_registry_severity_chk
        CHECK (default_severity IN ('critical', 'high', 'medium', 'low', 'info'))
);

COMMENT ON TABLE master.risk_driver_registry IS
  'Reusable risk-driver definitions. Assessment drivers may remain ad hoc by leaving driver_code NULL.';

CREATE TABLE master.risk_model (
    code                    text        NOT NULL,
    version                 text        NOT NULL,
    name                    text        NOT NULL,
    description             text,
    applicable_context      text        NOT NULL,
    scoring_algorithm       text        NOT NULL DEFAULT 'weighted_average',
    risk_band_thresholds    jsonb       NOT NULL DEFAULT
        '{"low":[75,100],"medium":[50,74],"high":[25,49],"critical":[0,24]}'::jsonb,
    config                  jsonb       NOT NULL DEFAULT '{}'::jsonb,
    effective_from          date        NOT NULL DEFAULT CURRENT_DATE,
    effective_until         date,
    status                  text        NOT NULL DEFAULT 'active',

    CONSTRAINT risk_model_pkey PRIMARY KEY (code, version),
    CONSTRAINT risk_model_code_chk
        CHECK (code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT risk_model_version_chk
        CHECK (btrim(version) <> '' AND length(version) <= 64),
    CONSTRAINT risk_model_name_chk
        CHECK (btrim(name) <> '' AND length(name) <= 240),
    CONSTRAINT risk_model_context_chk
        CHECK (applicable_context IN (
            'organization', 'supplier_role', 'customer_role',
            'project_engagement', 'universal'
        )),
    CONSTRAINT risk_model_algorithm_chk
        CHECK (scoring_algorithm IN (
            'weighted_average', 'rule_based', 'ml_model', 'manual'
        )),
    CONSTRAINT risk_model_thresholds_object_chk
        CHECK (jsonb_typeof(risk_band_thresholds) = 'object'),
    CONSTRAINT risk_model_config_object_chk
        CHECK (jsonb_typeof(config) = 'object'),
    CONSTRAINT risk_model_dates_chk
        CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT risk_model_status_chk
        CHECK (status IN ('active', 'deprecated', 'experimental'))
);

COMMENT ON TABLE master.risk_model IS
  'Version-pinned risk scoring model. Active versions are immutable; publish a new version instead of changing historical interpretation.';

CREATE TABLE master.risk_model_dimension (
    model_code              text          NOT NULL,
    model_version           text          NOT NULL,
    dimension_code          text          NOT NULL,
    weight                  numeric(5,4)  NOT NULL,
    is_required             boolean       NOT NULL DEFAULT true,
    is_knockout             boolean       NOT NULL DEFAULT false,
    ordinal                 smallint      NOT NULL DEFAULT 0,

    CONSTRAINT risk_model_dimension_pkey
        PRIMARY KEY (model_code, model_version, dimension_code),
    CONSTRAINT risk_model_dimension_weight_chk
        CHECK (weight BETWEEN 0 AND 1),
    CONSTRAINT risk_model_dimension_ordinal_chk CHECK (ordinal >= 0)
);

COMMENT ON TABLE master.risk_model_dimension IS
  'Dimension weight and behavior within one immutable risk-model version.';

CREATE TABLE master.risk_source (
    code                    text        NOT NULL,
    name                    text        NOT NULL,
    description             text,
    source_type             text        NOT NULL,
    provider_category       text        NOT NULL,
    trust_level             smallint    NOT NULL DEFAULT 3,
    refresh_mode            text        NOT NULL DEFAULT 'manual',
    status                  text        NOT NULL DEFAULT 'active',

    CONSTRAINT risk_source_pkey PRIMARY KEY (code),
    CONSTRAINT risk_source_code_chk
        CHECK (code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT risk_source_name_chk
        CHECK (btrim(name) <> '' AND length(name) <= 240),
    CONSTRAINT risk_source_type_chk
        CHECK (source_type IN (
            'external_provider', 'internal_system', 'manual', 'workflow'
        )),
    CONSTRAINT risk_source_provider_category_chk
        CHECK (provider_category IN (
            'esg', 'credit', 'sanctions', 'project', 'compliance', 'identity'
        )),
    CONSTRAINT risk_source_trust_chk CHECK (trust_level BETWEEN 1 AND 5),
    CONSTRAINT risk_source_refresh_chk
        CHECK (refresh_mode IN ('api', 'file', 'manual', 'event')),
    CONSTRAINT risk_source_status_chk
        CHECK (status IN ('active', 'deprecated', 'disabled'))
);

COMMENT ON TABLE master.risk_source IS
  'Platform registry of risk-signal origins. Tenant enablement and source policy live in control.risk_source_config.';

CREATE TABLE master.party_risk_assessment (
    id                    uuid          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid          NOT NULL,
    subject_type          text          NOT NULL,
    subject_id            uuid          NOT NULL,
    business_partner_id   uuid          NOT NULL,
    assessment_context    text          NOT NULL,
    model_code            text          NOT NULL,
    model_version         text          NOT NULL,
    overall_score         numeric(5,2),
    risk_band             text          NOT NULL DEFAULT 'unknown',
    is_override           boolean       NOT NULL DEFAULT false,
    override_reason       text,
    override_score        numeric(5,2),
    status                text          NOT NULL DEFAULT 'draft',
    assessed_at           timestamptz,
    assessed_by           uuid,
    approved_at           timestamptz,
    approved_by           uuid,
    next_review_at        date,
    review_frequency      text,
    version               integer       NOT NULL DEFAULT 1,
    superseded_by         uuid,
    notes                 text,
    created_at            timestamptz   NOT NULL DEFAULT now(),
    created_by            uuid          NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT party_risk_assessment_pkey PRIMARY KEY (id),
    CONSTRAINT party_risk_assessment_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT party_risk_assessment_subject_type_chk
        CHECK (subject_type IN (
            'business_partner', 'supplier', 'customer', 'project_engagement'
        )),
    CONSTRAINT party_risk_assessment_context_chk
        CHECK (assessment_context IN (
            'organization', 'supplier_role', 'customer_role', 'project_engagement'
        )),
    CONSTRAINT party_risk_assessment_subject_context_chk CHECK (
        (subject_type = 'business_partner' AND assessment_context = 'organization')
        OR (subject_type = 'supplier' AND assessment_context = 'supplier_role')
        OR (subject_type = 'customer' AND assessment_context = 'customer_role')
        OR (
            subject_type = 'project_engagement'
            AND assessment_context = 'project_engagement'
        )
    ),
    CONSTRAINT party_risk_assessment_score_chk
        CHECK (overall_score IS NULL OR overall_score BETWEEN 0 AND 100),
    CONSTRAINT party_risk_assessment_band_chk
        CHECK (risk_band IN ('critical', 'high', 'medium', 'low', 'unknown')),
    CONSTRAINT party_risk_assessment_override_chk CHECK (
        NOT is_override
        OR (
            override_reason IS NOT NULL
            AND btrim(override_reason) <> ''
            AND override_score BETWEEN 0 AND 100
        )
    ),
    CONSTRAINT party_risk_assessment_status_chk
        CHECK (status IN (
            'draft', 'pending_review', 'approved', 'superseded', 'archived'
        )),
    CONSTRAINT party_risk_assessment_approved_band_chk
        CHECK (status <> 'approved' OR risk_band <> 'unknown'),
    CONSTRAINT party_risk_assessment_review_frequency_chk
        CHECK (
            review_frequency IS NULL
            OR review_frequency IN ('monthly', 'quarterly', 'annually', 'on_event')
        ),
    CONSTRAINT party_risk_assessment_version_chk CHECK (version >= 1),
    CONSTRAINT party_risk_assessment_superseded_chk
        CHECK (superseded_by IS NULL OR status = 'superseded'),
    CONSTRAINT party_risk_assessment_approval_pair_chk
        CHECK ((approved_at IS NULL) = (approved_by IS NULL)),
    CONSTRAINT party_risk_assessment_assessment_pair_chk
        CHECK ((assessed_at IS NULL) = (assessed_by IS NULL)),
    CONSTRAINT party_risk_assessment_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.party_risk_assessment IS
  'Versioned interpreted party-risk result. One approved row per subject and assessment context is enforced by a partial unique index.';

CREATE TABLE master.party_risk_dimension_score (
    id                    uuid          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid          NOT NULL,
    assessment_id         uuid          NOT NULL,
    dimension_code        text          NOT NULL,
    raw_score             numeric(5,2),
    weighted_score        numeric(5,2),
    weight_applied        numeric(5,4),
    risk_band             text          NOT NULL DEFAULT 'unknown',
    knockout_hit          boolean       NOT NULL DEFAULT false,
    driver_count          integer       NOT NULL DEFAULT 0,
    coverage_pct          numeric(5,2),
    is_incomplete         boolean       NOT NULL DEFAULT false,
    notes                 text,

    CONSTRAINT party_risk_dimension_score_pkey PRIMARY KEY (id),
    CONSTRAINT party_risk_dimension_score_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT party_risk_dimension_score_assessment_dimension_uq
        UNIQUE (tenant_id, assessment_id, dimension_code),
    CONSTRAINT party_risk_dimension_score_raw_chk
        CHECK (raw_score IS NULL OR raw_score BETWEEN 0 AND 100),
    CONSTRAINT party_risk_dimension_score_weighted_chk
        CHECK (weighted_score IS NULL OR weighted_score BETWEEN 0 AND 100),
    CONSTRAINT party_risk_dimension_score_weight_chk
        CHECK (weight_applied IS NULL OR weight_applied BETWEEN 0 AND 1),
    CONSTRAINT party_risk_dimension_score_band_chk
        CHECK (risk_band IN ('critical', 'high', 'medium', 'low', 'unknown')),
    CONSTRAINT party_risk_dimension_score_driver_count_chk CHECK (driver_count >= 0),
    CONSTRAINT party_risk_dimension_score_coverage_chk
        CHECK (coverage_pct IS NULL OR coverage_pct BETWEEN 0 AND 100)
);

COMMENT ON TABLE master.party_risk_dimension_score IS
  'Explainable per-dimension score inside one party-risk assessment.';

CREATE TABLE master.party_risk_evidence (
    id                    uuid          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid          NOT NULL,
    subject_type          text          NOT NULL,
    subject_id            uuid          NOT NULL,
    business_partner_id   uuid          NOT NULL,
    source_code           text          NOT NULL,
    source_reference      text,
    evidence_type         text          NOT NULL,
    evidence_date         date,
    received_at           timestamptz   NOT NULL DEFAULT now(),
    valid_from            date,
    valid_until           date,
    title                 text          NOT NULL,
    summary               text,
    raw_payload           jsonb,
    normalized_payload    jsonb,
    confidence_score      numeric(5,2),
    status                text          NOT NULL DEFAULT 'active',
    superseded_by         uuid,
    ingested_by           uuid,
    ingested_via          text,
    created_at            timestamptz   NOT NULL DEFAULT now(),
    created_by            uuid          NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT party_risk_evidence_pkey PRIMARY KEY (id),
    CONSTRAINT party_risk_evidence_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT party_risk_evidence_subject_type_chk
        CHECK (subject_type IN (
            'business_partner', 'supplier', 'customer', 'project_engagement'
        )),
    CONSTRAINT party_risk_evidence_type_chk
        CHECK (evidence_type IN (
            'score', 'certificate', 'finding', 'alert', 'questionnaire',
            'engagement', 'sanction_hit', 'manual_override'
        )),
    CONSTRAINT party_risk_evidence_title_chk
        CHECK (btrim(title) <> '' AND length(title) <= 500),
    CONSTRAINT party_risk_evidence_validity_chk
        CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from),
    CONSTRAINT party_risk_evidence_payloads_chk CHECK (
        (raw_payload IS NULL OR jsonb_typeof(raw_payload) IN ('object', 'array'))
        AND (
            normalized_payload IS NULL
            OR jsonb_typeof(normalized_payload) IN ('object', 'array')
        )
    ),
    CONSTRAINT party_risk_evidence_confidence_chk
        CHECK (confidence_score IS NULL OR confidence_score BETWEEN 0 AND 100),
    CONSTRAINT party_risk_evidence_status_chk
        CHECK (status IN ('active', 'superseded', 'ignored', 'disputed', 'expired')),
    CONSTRAINT party_risk_evidence_superseded_chk
        CHECK (superseded_by IS NULL OR status = 'superseded'),
    CONSTRAINT party_risk_evidence_ingested_via_chk
        CHECK (
            ingested_via IS NULL
            OR ingested_via IN ('api', 'file_import', 'manual', 'workflow')
        ),
    CONSTRAINT party_risk_evidence_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.party_risk_evidence IS
  'Append-oriented incoming risk signal. Provider raw_payload becomes immutable once written; normalized_payload may be reprocessed.';

CREATE TABLE master.party_risk_driver (
    id                    uuid          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid          NOT NULL,
    assessment_id         uuid          NOT NULL,
    dimension_score_id    uuid,
    evidence_id           uuid,
    dimension_code        text          NOT NULL,
    driver_code           text,
    severity              text          NOT NULL DEFAULT 'medium',
    impact_score          numeric(5,2),
    is_knockout           boolean       NOT NULL DEFAULT false,
    title                 text          NOT NULL,
    description           text,
    source_entity         text,
    source_record_id      uuid,
    created_at            timestamptz   NOT NULL DEFAULT now(),
    created_by            uuid,

    CONSTRAINT party_risk_driver_pkey PRIMARY KEY (id),
    CONSTRAINT party_risk_driver_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT party_risk_driver_severity_chk
        CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
    CONSTRAINT party_risk_driver_impact_chk
        CHECK (impact_score IS NULL OR impact_score BETWEEN 0 AND 100),
    CONSTRAINT party_risk_driver_title_chk
        CHECK (btrim(title) <> '' AND length(title) <= 500),
    CONSTRAINT party_risk_driver_source_chk CHECK (
        evidence_id IS NOT NULL
        OR (source_entity IS NOT NULL AND source_record_id IS NOT NULL)
    )
);

COMMENT ON TABLE master.party_risk_driver IS
  'Explainability layer describing why an assessment received its score or band.';

CREATE TABLE master.party_risk_mitigation (
    id                    uuid          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid          NOT NULL,
    business_partner_id   uuid          NOT NULL,
    assessment_id         uuid,
    driver_id             uuid,
    mitigation_type       text          NOT NULL,
    title                 text          NOT NULL,
    description           text,
    status                text          NOT NULL DEFAULT 'draft',
    due_date              date,
    completed_at          timestamptz,
    assigned_to           uuid,
    approved_by           uuid,
    approved_at           timestamptz,
    evidence_note         text,
    evidence_url          text,
    created_at            timestamptz   NOT NULL DEFAULT now(),
    created_by            uuid          NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT party_risk_mitigation_pkey PRIMARY KEY (id),
    CONSTRAINT party_risk_mitigation_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT party_risk_mitigation_scope_chk
        CHECK (assessment_id IS NOT NULL OR driver_id IS NOT NULL),
    CONSTRAINT party_risk_mitigation_type_chk
        CHECK (mitigation_type IN (
            'waiver', 'corrective_action', 'monitoring', 'escalation',
            'rejection', 'conditional_approval'
        )),
    CONSTRAINT party_risk_mitigation_title_chk
        CHECK (btrim(title) <> '' AND length(title) <= 500),
    CONSTRAINT party_risk_mitigation_status_chk
        CHECK (status IN (
            'draft', 'pending_approval', 'approved', 'in_progress',
            'completed', 'overdue', 'cancelled'
        )),
    CONSTRAINT party_risk_mitigation_completed_chk
        CHECK (completed_at IS NULL OR status = 'completed'),
    CONSTRAINT party_risk_mitigation_approved_pair_chk
        CHECK ((approved_by IS NULL) = (approved_at IS NULL)),
    CONSTRAINT party_risk_mitigation_evidence_url_chk
        CHECK (evidence_url IS NULL OR evidence_url ~* '^https?://'),
    CONSTRAINT party_risk_mitigation_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.party_risk_mitigation IS
  'Risk acceptance, correction, monitoring, escalation, rejection, or conditional-approval action.';

CREATE TABLE master.party_risk_review_event (
    id                    uuid          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid          NOT NULL,
    assessment_id         uuid          NOT NULL,
    event_type            text          NOT NULL,
    actor_id              uuid,
    actor_type            text          NOT NULL DEFAULT 'system',
    prior_status          text,
    new_status            text          NOT NULL,
    prior_risk_band       text,
    new_risk_band         text,
    comment               text,
    metadata              jsonb         NOT NULL DEFAULT '{}'::jsonb,
    created_at            timestamptz   NOT NULL DEFAULT now(),

    CONSTRAINT party_risk_review_event_pkey PRIMARY KEY (id),
    CONSTRAINT party_risk_review_event_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT party_risk_review_event_type_chk
        CHECK (event_type IN (
            'created', 'submitted', 'approved', 'rejected', 'overridden',
            'superseded', 'archived', 'scheduled_review'
        )),
    CONSTRAINT party_risk_review_event_actor_type_chk
        CHECK (actor_type IN ('user', 'system', 'api')),
    CONSTRAINT party_risk_review_event_actor_chk
        CHECK ((actor_type = 'system') OR actor_id IS NOT NULL),
    CONSTRAINT party_risk_review_event_new_status_chk
        CHECK (new_status IN (
            'draft', 'pending_review', 'approved', 'superseded', 'archived'
        )),
    CONSTRAINT party_risk_review_event_bands_chk CHECK (
        (prior_risk_band IS NULL OR prior_risk_band IN (
            'critical', 'high', 'medium', 'low', 'unknown'
        ))
        AND
        (new_risk_band IS NULL OR new_risk_band IN (
            'critical', 'high', 'medium', 'low', 'unknown'
        ))
    ),
    CONSTRAINT party_risk_review_event_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object')
);

COMMENT ON TABLE master.party_risk_review_event IS
  'Immutable assessment lifecycle and review audit trail.';
