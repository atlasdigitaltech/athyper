-- ============================================================================
-- master/01j_tables_party_risk.sql
-- Concept: Evidence-driven risk assessment platform for business partners
-- Depends on: 01h_tables_business_partner.sql (master.business_partner,
--                master.supplier, master.customer)
--             01i_tables_party_master.sql (master.supplier_qualification,
--                master.customer_qualification)
--
-- Design rule:
--   Signal (evidence) → Assessment → Dimension scores → Drivers → Mitigation
--   Every score is traceable to source evidence + model version + dimension.
--   Assessment contexts are separate concerns:
--     organization | supplier_role | customer_role | project_engagement
--
--   supplier_qualification.risk_tier is a denormalized read of the latest
--   approved supplier_role assessment. Same for customer_qualification.
--   Write to qualification only via the assessment approval path.
--
-- Tables:
--   §RK1  master.risk_dimension           — dimension taxonomy registry
--   §RK2  master.risk_driver_registry     — known driver type definitions
--   §RK3  master.risk_source              — signal origin registry
--   §RK4  master.risk_model               — scoring model + band thresholds
--   §RK5  master.risk_model_dimension     — model ↔ dimension weights (junction)
--   §RK6  master.party_risk_evidence      — immutable incoming signal records
--   §RK7  master.party_risk_assessment    — interpreted risk result per context
--   §RK8  master.party_risk_dimension_score — per-dimension score within assessment
--   §RK9  master.party_risk_driver        — dimension score ↔ evidence linkage
--   §RK10 master.party_risk_mitigation    — mitigation / response actions
--   §RK11 master.party_risk_review_event  — assessment lifecycle audit trail
--
-- FKs       → 03_constraints.sql
-- Indexes   → inline below
-- RLS       → 08_rls.sql
-- ============================================================================


-- ============================================================================
-- No drop guards here — risk tables accumulate evidence, assessments, and
-- audit history that must survive re-runs in all environments.
-- To wipe and recreate in dev/test use: master/_dev_reset_risk_tables.sql
-- ============================================================================


-- ============================================================================
-- §RK1  master.risk_dimension — dimension taxonomy registry
-- Platform-wide lookup. Defines the axes along which risk is measured.
-- Dimensions are owned by the platform; tenant-specific additions go in
-- metadata/config, not new rows (use is_system_defined = false for custom).
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.risk_dimension (
    code                    text        NOT NULL,
    name                    text        NOT NULL,
    description             text,

    -- Classification
    category                text        NOT NULL,
        -- 'esg' | 'credit' | 'compliance' | 'operational' |
        -- 'reputational' | 'data_quality' | 'engagement'

    applicable_contexts     text[]      NOT NULL DEFAULT '{}',
        -- subset of: organization | supplier_role | customer_role | project_engagement

    -- Scoring behaviour
    is_knockout             boolean     NOT NULL DEFAULT false,
        -- true = critical on this dimension forces overall critical regardless of weights

    -- UI
    ordinal                 smallint    NOT NULL DEFAULT 0,
    is_system_defined       boolean     NOT NULL DEFAULT true,
    status                  text        NOT NULL DEFAULT 'active',

    CONSTRAINT rd_pkey              PRIMARY KEY (code),
    CONSTRAINT rd_category_chk      CHECK (category IN (
                                        'esg', 'credit', 'compliance', 'operational',
                                        'reputational', 'data_quality', 'engagement')),
    CONSTRAINT rd_status_chk        CHECK (status IN ('active', 'deprecated'))
);

COMMENT ON TABLE master.risk_dimension IS
    'ARCHETYPE=L. Platform risk dimension taxonomy. Axes along which party risk is measured. '
    'Dimensions are independent of context — weight per context is defined in risk_model_dimension.';
COMMENT ON COLUMN master.risk_dimension.is_knockout IS
    'If true: a critical band on this dimension forces the overall assessment to critical, '
    'regardless of weighted average. Used for sanctions, OFAC hits, hard blocks.';


-- ============================================================================
-- §RK2  master.risk_driver_registry — known driver type definitions
-- Platform-defined driver codes that map to dimensions with default severity.
-- Drivers in assessments reference these codes; custom/ad-hoc drivers can
-- omit driver_code (nullable FK in party_risk_driver).
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.risk_driver_registry (
    code                        text    NOT NULL,
    name                        text    NOT NULL,
    description                 text,

    default_dimension_code      text,       -- FK → risk_dimension.code
    default_severity            text        NOT NULL DEFAULT 'medium',
        -- 'critical' | 'high' | 'medium' | 'low' | 'info'

    applicable_evidence_types   text[]  NOT NULL DEFAULT '{}',
        -- ['score','certificate','finding','alert','questionnaire','sanction_hit',...]

    is_knockout                 boolean NOT NULL DEFAULT false,
    is_system_defined           boolean NOT NULL DEFAULT true,

    CONSTRAINT rdr_pkey             PRIMARY KEY (code),
    CONSTRAINT rdr_severity_chk     CHECK (default_severity IN (
                                        'critical', 'high', 'medium', 'low', 'info'))
);

COMMENT ON TABLE master.risk_driver_registry IS
    'ARCHETYPE=L. Pre-defined risk driver types. party_risk_driver.driver_code is a nullable '
    'FK here — ad-hoc drivers (e.g. "unusual contract scope") do not need a registry entry.';


-- ============================================================================
-- §RK3  master.risk_source — platform-wide signal origin registry
-- Pure lookup — no tenant_id, no credentials. Every source here is visible
-- to all tenants. Tenant-specific API config and enablement flags live in
-- master.tenant_risk_source_config (§RK3b) which is fully tenant-scoped.
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.risk_source (
    code                text        NOT NULL,
    name                text        NOT NULL,
    description         text,

    source_type         text        NOT NULL,
        -- 'external_provider' | 'internal_system' | 'manual' | 'workflow'

    provider_category   text        NOT NULL,
        -- 'esg' | 'credit' | 'sanctions' | 'project' | 'compliance' | 'identity'

    trust_level         smallint    NOT NULL DEFAULT 3,
        -- 1 (low) – 5 (authoritative); default for tenants without a custom config

    refresh_mode        text        NOT NULL DEFAULT 'manual',
        -- 'api' | 'file' | 'manual' | 'event'

    status              text        NOT NULL DEFAULT 'active',

    CONSTRAINT rks_pkey             PRIMARY KEY (code),
    CONSTRAINT rks_source_type_chk  CHECK (source_type IN (
                                        'external_provider', 'internal_system',
                                        'manual', 'workflow')),
    CONSTRAINT rks_provider_cat_chk CHECK (provider_category IN (
                                        'esg', 'credit', 'sanctions', 'project',
                                        'compliance', 'identity')),
    CONSTRAINT rks_trust_chk        CHECK (trust_level BETWEEN 1 AND 5),
    CONSTRAINT rks_refresh_chk      CHECK (refresh_mode IN ('api', 'file', 'manual', 'event')),
    CONSTRAINT rks_status_chk       CHECK (status IN ('active', 'deprecated', 'disabled'))
);

COMMENT ON TABLE master.risk_source IS
    'ARCHETYPE=L. Platform-wide registry of risk signal origins (EcoVadis, D&B, OFAC, etc.). '
    'No tenant_id — all sources are globally visible. '
    'Tenant API credentials and enablement flags live in tenant_risk_source_config.';
COMMENT ON COLUMN master.risk_source.trust_level IS
    '1 = low trust (manual one-off); 5 = authoritative (regulated provider). '
    'Tenant can override via tenant_risk_source_config.custom_trust_level.';


-- ============================================================================
-- §RK3b  master.tenant_risk_source_config — tenant-specific source settings
-- One row per (tenant, source). Holds API credentials, custom trust level,
-- and per-tenant enablement. api_config is sensitive — encrypt at app layer.
-- If no row exists for a (tenant, source_code), platform defaults apply.
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.tenant_risk_source_config (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    source_code         text        NOT NULL,   -- FK → risk_source.code

    -- Per-tenant overrides
    is_enabled          boolean     NOT NULL DEFAULT true,
    custom_trust_level  smallint,
        -- overrides risk_source.trust_level when set (1–5)

    -- Credentials / endpoint config (sensitive — encrypt before write)
    api_config          jsonb,

    -- Lifecycle
    status              text        NOT NULL DEFAULT 'active',

    -- Audit
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT trsc_pkey            PRIMARY KEY (id),
    CONSTRAINT trsc_tenant_uq       UNIQUE (tenant_id, id),
    CONSTRAINT trsc_source_uq       UNIQUE (tenant_id, source_code),
    CONSTRAINT trsc_trust_chk       CHECK (custom_trust_level IS NULL
                                        OR custom_trust_level BETWEEN 1 AND 5),
    CONSTRAINT trsc_status_chk      CHECK (status IN ('active', 'disabled')),
    CONSTRAINT trsc_audit_pair_chk  CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE INDEX IF NOT EXISTS trsc_tenant_idx
    ON master.tenant_risk_source_config (tenant_id, source_code)
    WHERE is_enabled = true;

COMMENT ON TABLE master.tenant_risk_source_config IS
    'ARCHETYPE=B;SCOPE=T. Per-tenant configuration for a platform risk source. '
    'api_config holds provider API credentials — encrypt at application layer. '
    'custom_trust_level overrides the platform default when set. '
    'If no row exists for (tenant, source_code), platform defaults from risk_source apply.';


-- ============================================================================
-- §RK4  master.risk_model — scoring model + band configuration
-- A model defines the scoring algorithm, risk band thresholds, and which
-- contexts it applies to. Assessments are pinned to (model_code, model_version).
-- Changing a model does not retroactively alter past assessments.
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.risk_model (
    code                    text        NOT NULL,
    version                 text        NOT NULL,   -- '1.0', '2.1', 'v2026-04'
    name                    text        NOT NULL,
    description             text,

    applicable_context      text        NOT NULL,
        -- 'organization' | 'supplier_role' | 'customer_role' |
        -- 'project_engagement' | 'universal'

    scoring_algorithm       text        NOT NULL DEFAULT 'weighted_average',
        -- 'weighted_average' | 'rule_based' | 'ml_model' | 'manual'

    -- Score 0–100; lower = higher risk (EcoVadis / D&B convention)
    -- Thresholds: {"critical":[0,24],"high":[25,49],"medium":[50,74],"low":[75,100]}
    risk_band_thresholds    jsonb       NOT NULL DEFAULT
        '{"critical":[0,24],"high":[25,49],"medium":[50,74],"low":[75,100]}'::jsonb,

    config                  jsonb       NOT NULL DEFAULT '{}'::jsonb,

    effective_from          date        NOT NULL DEFAULT CURRENT_DATE,
    effective_until         date,

    status                  text        NOT NULL DEFAULT 'active',

    CONSTRAINT rm_pkey              PRIMARY KEY (code, version),
    CONSTRAINT rm_context_chk       CHECK (applicable_context IN (
                                        'organization', 'supplier_role', 'customer_role',
                                        'project_engagement', 'universal')),
    CONSTRAINT rm_algorithm_chk     CHECK (scoring_algorithm IN (
                                        'weighted_average', 'rule_based',
                                        'ml_model', 'manual')),
    CONSTRAINT rm_status_chk        CHECK (status IN ('active', 'deprecated', 'experimental')),
    CONSTRAINT rm_dates_chk         CHECK (effective_until IS NULL
                                        OR effective_until > effective_from)
);

COMMENT ON TABLE master.risk_model IS
    'ARCHETYPE=L. Risk scoring model registry. Each (code, version) is immutable once active. '
    'Assessments pin to model_code + model_version — past assessments are never re-scored '
    'when the model changes. Deprecate old versions; create new ones.';
COMMENT ON COLUMN master.risk_model.risk_band_thresholds IS
    'Score → band mapping. Lower score = higher risk. '
    'Format: {"band_name":[min_inclusive, max_inclusive]}. Scores are 0–100.';


-- ============================================================================
-- §RK5  master.risk_model_dimension — model ↔ dimension weight junction
-- Each model version declares which dimensions it scores and at what weight.
-- Weights across all dimensions for a given (model_code, model_version)
-- must sum to 1.0 — enforced at application layer, not DB constraint.
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.risk_model_dimension (
    model_code          text            NOT NULL,
    model_version       text            NOT NULL,
    dimension_code      text            NOT NULL,

    weight              numeric(5,4)    NOT NULL,
        -- 0.0000 – 1.0000; all rows per (model_code, model_version) must sum to 1

    is_required         boolean         NOT NULL DEFAULT true,
        -- true = missing evidence → assessment marked incomplete, not scored unknown

    is_knockout         boolean         NOT NULL DEFAULT false,
        -- overrides risk_dimension.is_knockout for this specific model/context

    ordinal             smallint        NOT NULL DEFAULT 0,

    CONSTRAINT rmd_pkey         PRIMARY KEY (model_code, model_version, dimension_code),
    CONSTRAINT rmd_weight_chk   CHECK (weight BETWEEN 0 AND 1)
);

COMMENT ON TABLE master.risk_model_dimension IS
    'ARCHETYPE=L. Per-model dimension weights and behaviour overrides. '
    'Weight sum = 1.0 per (model_code, model_version) enforced at application layer. '
    'is_knockout here overrides risk_dimension.is_knockout for this specific model.';


-- ============================================================================
-- §RK6  master.party_risk_evidence — immutable incoming signal records
-- Append-only store of all external and internal risk signals.
-- Records are never deleted; status transitions manage lifecycle.
-- raw_payload = exact provider response (written once).
-- normalized_payload = system interpretation (may be updated on re-processing).
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.party_risk_evidence (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,

    -- Subject (what this evidence is about)
    subject_type        text        NOT NULL,
        -- 'business_partner' | 'supplier' | 'customer' | 'project_engagement'
    subject_id          uuid        NOT NULL,
    business_partner_id uuid        NOT NULL,
        -- always set regardless of subject_type; enables fast BP-level queries

    -- Source
    source_code         text        NOT NULL,   -- FK → risk_source.code
    source_reference    text,                  -- provider's own record / batch ID

    -- Evidence classification
    evidence_type       text        NOT NULL,
        -- 'score' | 'certificate' | 'finding' | 'alert' |
        -- 'questionnaire' | 'engagement' | 'sanction_hit' | 'manual_override'

    -- Temporal validity
    evidence_date       date,           -- date the signal was generated at source
    received_at         timestamptz NOT NULL DEFAULT now(),
    valid_from          date,
    valid_until         date,

    -- Content
    title               text        NOT NULL,
    summary             text,
    raw_payload         jsonb,          -- exact provider response (never modify after write)
    normalized_payload  jsonb,          -- system-normalized interpretation
    confidence_score    numeric(5,2),   -- 0–100; influenced by source.trust_level

    -- Lifecycle
    status              text        NOT NULL DEFAULT 'active',
        -- 'active' | 'superseded' | 'ignored' | 'disputed' | 'expired'
    superseded_by       uuid,           -- FK → party_risk_evidence.id

    -- Attribution
    ingested_by         uuid,           -- null if automated; user_id if manual
    ingested_via        text,           -- 'api' | 'file_import' | 'manual' | 'workflow'
    tags                text[]      NOT NULL DEFAULT '{}',

    -- Audit
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT pre_pkey                 PRIMARY KEY (id),
    CONSTRAINT pre_tenant_uq            UNIQUE (tenant_id, id),
    CONSTRAINT pre_subject_type_chk     CHECK (subject_type IN (
                                            'business_partner', 'supplier',
                                            'customer', 'project_engagement')),
    CONSTRAINT pre_evidence_type_chk    CHECK (evidence_type IN (
                                            'score', 'certificate', 'finding', 'alert',
                                            'questionnaire', 'engagement',
                                            'sanction_hit', 'manual_override')),
    CONSTRAINT pre_status_chk           CHECK (status IN (
                                            'active', 'superseded', 'ignored',
                                            'disputed', 'expired')),
    CONSTRAINT pre_confidence_chk       CHECK (confidence_score IS NULL
                                            OR confidence_score BETWEEN 0 AND 100),
    CONSTRAINT pre_superseded_chk       CHECK (superseded_by IS NULL
                                            OR status = 'superseded'),
    CONSTRAINT pre_ingested_via_chk     CHECK (ingested_via IS NULL OR ingested_via IN (
                                            'api', 'file_import', 'manual', 'workflow')),
    CONSTRAINT pre_audit_pair_chk       CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE INDEX IF NOT EXISTS pre_bp_idx
    ON master.party_risk_evidence (tenant_id, business_partner_id, status);
CREATE INDEX IF NOT EXISTS pre_subject_idx
    ON master.party_risk_evidence (tenant_id, subject_type, subject_id);
CREATE INDEX IF NOT EXISTS pre_source_date_idx
    ON master.party_risk_evidence (source_code, evidence_date DESC);
CREATE INDEX IF NOT EXISTS pre_active_pidx
    ON master.party_risk_evidence (tenant_id, business_partner_id)
    WHERE status = 'active';

-- Idempotency guard: same provider record cannot be imported twice for the same BP.
-- Partial: NULL source_reference (manual/non-referenced evidence) is exempt.
-- Partial: superseded rows are exempt so replacements can share the same reference.
CREATE UNIQUE INDEX IF NOT EXISTS pre_source_ref_uq
    ON master.party_risk_evidence (tenant_id, business_partner_id, source_code, source_reference)
    WHERE source_reference IS NOT NULL AND status <> 'superseded';

COMMENT ON TABLE master.party_risk_evidence IS
    'ARCHETYPE=B;SCOPE=T. Immutable incoming risk signals. Append-only — records are '
    'never deleted. Status transitions: active → superseded | ignored | disputed | expired. '
    'raw_payload = exact provider response (write once). '
    'normalized_payload = system interpretation (may be re-processed).';
COMMENT ON COLUMN master.party_risk_evidence.business_partner_id IS
    'Always set regardless of subject_type. Enables BP-level queries across all '
    'evidence types (engagement, role-specific, etc.) without joins.';
COMMENT ON COLUMN master.party_risk_evidence.superseded_by IS
    'Points to the newer evidence record that replaced this one. '
    'Set automatically when a fresher signal from the same source arrives.';


-- ============================================================================
-- §RK7  master.party_risk_assessment — interpreted risk result per context
-- One active approved row per (tenant, subject, context) enforced by partial unique index.
-- Assessments are versioned: status → superseded links to the replacement.
-- is_override captures manual band changes with mandatory reason.
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.party_risk_assessment (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,

    -- Subject
    subject_type        text        NOT NULL,
    subject_id          uuid        NOT NULL,
    business_partner_id uuid        NOT NULL,

    -- Context (separate concern from subject_type)
    assessment_context  text        NOT NULL,
        -- 'organization' | 'supplier_role' | 'customer_role' | 'project_engagement'

    -- Model (pinned — changing model creates a new assessment)
    model_code          text        NOT NULL,
    model_version       text        NOT NULL,

    -- Result
    overall_score       numeric(5,2),   -- 0–100; null = incomplete assessment
    risk_band           text        NOT NULL DEFAULT 'unknown',
        -- 'critical' | 'high' | 'medium' | 'low' | 'unknown'

    -- Manual override (sets band regardless of computed score)
    is_override         boolean     NOT NULL DEFAULT false,
    override_reason     text,
    override_score      numeric(5,2),   -- the overridden score applied

    -- Lifecycle
    status              text        NOT NULL DEFAULT 'draft',
        -- 'draft' | 'pending_review' | 'approved' | 'superseded' | 'archived'
    assessed_at         timestamptz,
    assessed_by         uuid,           -- null = system-scored
    approved_at         timestamptz,
    approved_by         uuid,

    -- Review cadence
    next_review_at      date,
    review_frequency    text,
        -- 'monthly' | 'quarterly' | 'annually' | 'on_event'

    -- Versioning
    version             integer     NOT NULL DEFAULT 1,
    superseded_by       uuid,           -- FK → party_risk_assessment.id

    notes               text,

    -- Audit
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT pra_pkey                 PRIMARY KEY (id),
    CONSTRAINT pra_tenant_uq            UNIQUE (tenant_id, id),
    CONSTRAINT pra_subject_type_chk     CHECK (subject_type IN (
                                            'business_partner', 'supplier',
                                            'customer', 'project_engagement')),
    CONSTRAINT pra_context_chk          CHECK (assessment_context IN (
                                            'organization', 'supplier_role',
                                            'customer_role', 'project_engagement')),
    -- Enforced binding: subject_type and assessment_context must be a valid pair.
    -- Prevents e.g. business_partner subject with supplier_role context.
    CONSTRAINT pra_subject_context_matrix_chk CHECK (
        (subject_type = 'business_partner'   AND assessment_context = 'organization')     OR
        (subject_type = 'supplier'           AND assessment_context = 'supplier_role')    OR
        (subject_type = 'customer'           AND assessment_context = 'customer_role')    OR
        (subject_type = 'project_engagement' AND assessment_context = 'project_engagement')
    ),
    CONSTRAINT pra_risk_band_chk        CHECK (risk_band IN (
                                            'critical', 'high', 'medium', 'low', 'unknown')),
    -- An approved assessment must carry a resolved band; unknown is only valid while scoring.
    CONSTRAINT pra_approved_band_chk    CHECK (status <> 'approved' OR risk_band <> 'unknown'),
    CONSTRAINT pra_status_chk           CHECK (status IN (
                                            'draft', 'pending_review', 'approved',
                                            'superseded', 'archived')),
    CONSTRAINT pra_override_reason_chk  CHECK (NOT is_override OR override_reason IS NOT NULL),
    CONSTRAINT pra_score_chk            CHECK (overall_score IS NULL
                                            OR overall_score BETWEEN 0 AND 100),
    CONSTRAINT pra_override_score_chk   CHECK (override_score IS NULL
                                            OR override_score BETWEEN 0 AND 100),
    CONSTRAINT pra_review_freq_chk      CHECK (review_frequency IS NULL OR review_frequency IN (
                                            'monthly', 'quarterly', 'annually', 'on_event')),
    CONSTRAINT pra_superseded_chk       CHECK (superseded_by IS NULL
                                            OR status = 'superseded'),
    CONSTRAINT pra_version_chk          CHECK (version >= 1),
    CONSTRAINT pra_audit_pair_chk       CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

-- Exactly one approved assessment per subject per context at any time.
CREATE UNIQUE INDEX IF NOT EXISTS pra_active_context_uq
    ON master.party_risk_assessment (tenant_id, subject_type, subject_id, assessment_context)
    WHERE status = 'approved';

CREATE INDEX IF NOT EXISTS pra_bp_idx
    ON master.party_risk_assessment (tenant_id, business_partner_id, assessment_context);
CREATE INDEX IF NOT EXISTS pra_review_pidx
    ON master.party_risk_assessment (tenant_id, next_review_at)
    WHERE status = 'approved' AND next_review_at IS NOT NULL;

COMMENT ON TABLE master.party_risk_assessment IS
    'ARCHETYPE=B;SCOPE=T. Interpreted risk result per (subject, context). '
    'One approved row per (tenant, subject_type, subject_id, assessment_context) '
    'enforced by partial unique index. Versioned: approval creates new row, '
    'old row → status=superseded. is_override=true requires override_reason.';
COMMENT ON COLUMN master.party_risk_assessment.assessment_context IS
    'Separates risk concerns: organization = entity-level; supplier_role = procurement risk; '
    'customer_role = AR/credit risk; project_engagement = per-engagement risk. '
    'The same BP can be low organization risk but high project_engagement risk.';
COMMENT ON COLUMN master.party_risk_assessment.is_override IS
    'True when a risk manager manually sets the band regardless of computed score. '
    'override_reason is mandatory. Captured in party_risk_review_event.event_type=overridden.';


-- ============================================================================
-- §RK8  master.party_risk_dimension_score — per-dimension score within assessment
-- One row per (assessment, dimension). Provides the explainability layer:
-- overall_score = Σ(weighted_score) across all dimensions in the model.
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.party_risk_dimension_score (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    assessment_id       uuid        NOT NULL,   -- FK → party_risk_assessment
    dimension_code      text        NOT NULL,   -- FK → risk_dimension

    -- Score
    raw_score           numeric(5,2),   -- unweighted dimension score (0–100)
    weighted_score      numeric(5,2),   -- raw_score × weight_applied
    weight_applied      numeric(5,4),   -- from risk_model_dimension.weight

    risk_band           text        NOT NULL DEFAULT 'unknown',
        -- band of this dimension in isolation

    -- Knockout
    knockout_hit        boolean     NOT NULL DEFAULT false,
        -- true = this dimension triggered a knockout → overall forced to critical

    -- Coverage
    driver_count        integer     NOT NULL DEFAULT 0,
    coverage_pct        numeric(5,2),   -- % of required evidence present (0–100)
    is_incomplete       boolean     NOT NULL DEFAULT false,
        -- true = required evidence missing; score computed with available data only

    notes               text,

    CONSTRAINT prds_pkey                PRIMARY KEY (id),
    CONSTRAINT prds_tenant_uq           UNIQUE (tenant_id, id),
    CONSTRAINT prds_assessment_dim_uq   UNIQUE (assessment_id, dimension_code),
    CONSTRAINT prds_risk_band_chk       CHECK (risk_band IN (
                                            'critical', 'high', 'medium', 'low', 'unknown')),
    CONSTRAINT prds_raw_score_chk       CHECK (raw_score IS NULL
                                            OR raw_score BETWEEN 0 AND 100),
    CONSTRAINT prds_weight_chk          CHECK (weight_applied IS NULL
                                            OR weight_applied BETWEEN 0 AND 1),
    CONSTRAINT prds_driver_cnt_chk      CHECK (driver_count >= 0),
    CONSTRAINT prds_coverage_chk        CHECK (coverage_pct IS NULL
                                            OR coverage_pct BETWEEN 0 AND 100)
);

CREATE INDEX IF NOT EXISTS prds_assessment_idx
    ON master.party_risk_dimension_score (assessment_id);

COMMENT ON TABLE master.party_risk_dimension_score IS
    'ARCHETYPE=B;SCOPE=T. Per-dimension score within an assessment. '
    'Provides the explainability layer: assessment.overall_score = Σ(weighted_score). '
    'Each row traces to evidence via party_risk_driver.dimension_score_id.';
COMMENT ON COLUMN master.party_risk_dimension_score.knockout_hit IS
    'True when this dimension triggered a model knockout rule, forcing the '
    'overall assessment to critical regardless of the weighted average.';


-- ============================================================================
-- §RK9  master.party_risk_driver — evidence ↔ dimension linkage
-- The "why" layer. Every significant driver that moved a dimension score
-- is recorded here. Drivers MUST trace to either:
--   (a) a risk evidence record (evidence_id), or
--   (b) an internal entity record (source_entity + source_record_id)
-- This constraint is enforced by prdr_source_chk.
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.party_risk_driver (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    assessment_id       uuid        NOT NULL,   -- FK → party_risk_assessment
    dimension_score_id  uuid,                   -- FK → party_risk_dimension_score (nullable)
    evidence_id         uuid,                   -- FK → party_risk_evidence (nullable)

    -- Classification
    dimension_code      text        NOT NULL,
    driver_code         text,                   -- FK → risk_driver_registry (nullable)

    -- Impact
    severity            text        NOT NULL DEFAULT 'medium',
        -- 'critical' | 'high' | 'medium' | 'low' | 'info'
    impact_score        numeric(5,2),   -- 0–100; how much this driver shifts the dimension
    is_knockout         boolean     NOT NULL DEFAULT false,

    -- Content
    title               text        NOT NULL,
    description         text,

    -- Internal source trace (when evidence_id is null — e.g. "missing billing address")
    source_entity       text,       -- e.g. 'master.supplier_qualification'
    source_record_id    uuid,

    -- Attribution
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid,       -- null = system-generated

    CONSTRAINT prd_pkey             PRIMARY KEY (id),
    CONSTRAINT prd_tenant_uq        UNIQUE (tenant_id, id),
    CONSTRAINT prd_severity_chk     CHECK (severity IN (
                                        'critical', 'high', 'medium', 'low', 'info')),
    CONSTRAINT prd_impact_score_chk CHECK (impact_score IS NULL
                                        OR impact_score BETWEEN 0 AND 100),
    -- Every driver must trace to either external evidence OR an internal record
    CONSTRAINT prd_source_chk       CHECK (
                                        evidence_id IS NOT NULL
                                        OR (source_entity IS NOT NULL AND source_record_id IS NOT NULL)
                                    )
);

CREATE INDEX IF NOT EXISTS prd_assessment_idx
    ON master.party_risk_driver (assessment_id);
CREATE INDEX IF NOT EXISTS prd_evidence_idx
    ON master.party_risk_driver (evidence_id)
    WHERE evidence_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS prd_dimension_score_idx
    ON master.party_risk_driver (dimension_score_id)
    WHERE dimension_score_id IS NOT NULL;

COMMENT ON TABLE master.party_risk_driver IS
    'ARCHETYPE=B;SCOPE=T. The "why" layer of an assessment. '
    'Each driver traces to either party_risk_evidence (evidence_id) '
    'or an internal entity record (source_entity + source_record_id). '
    'e.g. "Low ESG score" → evidence_id=EcoVadis record; '
    '"Missing billing address" → source_entity=master.business_partner.';
COMMENT ON COLUMN master.party_risk_driver.driver_code IS
    'Optional FK to risk_driver_registry. Null = ad-hoc driver with no registry entry. '
    'Registry entries provide default dimension and severity for common drivers.';


-- ============================================================================
-- §RK10 master.party_risk_mitigation — mitigation / response actions
-- The response layer. Scope is either assessment-level (address overall risk)
-- or driver-specific (address a single cause). At least one of assessment_id
-- or driver_id must be set — enforced by prm_scope_chk.
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.party_risk_mitigation (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    business_partner_id uuid        NOT NULL,

    -- Scope
    assessment_id       uuid,   -- FK → party_risk_assessment (nullable)
    driver_id           uuid,   -- FK → party_risk_driver (nullable)

    -- Mitigation type
    mitigation_type     text        NOT NULL,
        -- 'waiver' | 'corrective_action' | 'monitoring' |
        -- 'escalation' | 'rejection' | 'conditional_approval'

    -- Content
    title               text        NOT NULL,
    description         text,

    -- Lifecycle
    status              text        NOT NULL DEFAULT 'draft',
        -- 'draft' | 'pending_approval' | 'approved' |
        -- 'in_progress' | 'completed' | 'overdue' | 'cancelled'
    due_date            date,
    completed_at        timestamptz,

    -- Assignments
    assigned_to         uuid,
    approved_by         uuid,
    approved_at         timestamptz,

    -- Closure evidence
    evidence_note       text,
    evidence_url        text,

    -- Audit
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT prm_pkey             PRIMARY KEY (id),
    CONSTRAINT prm_tenant_uq        UNIQUE (tenant_id, id),
    CONSTRAINT prm_type_chk         CHECK (mitigation_type IN (
                                        'waiver', 'corrective_action', 'monitoring',
                                        'escalation', 'rejection', 'conditional_approval')),
    CONSTRAINT prm_status_chk       CHECK (status IN (
                                        'draft', 'pending_approval', 'approved',
                                        'in_progress', 'completed', 'overdue', 'cancelled')),
    CONSTRAINT prm_scope_chk        CHECK (assessment_id IS NOT NULL OR driver_id IS NOT NULL),
    CONSTRAINT prm_approved_pair_chk CHECK ((approved_by IS NULL) = (approved_at IS NULL)),
    CONSTRAINT prm_completed_chk    CHECK (completed_at IS NULL OR status = 'completed'),
    CONSTRAINT prm_audit_pair_chk   CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE INDEX IF NOT EXISTS prm_bp_idx
    ON master.party_risk_mitigation (tenant_id, business_partner_id, status);
CREATE INDEX IF NOT EXISTS prm_assessment_idx
    ON master.party_risk_mitigation (assessment_id)
    WHERE assessment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS prm_overdue_pidx
    ON master.party_risk_mitigation (tenant_id, due_date)
    WHERE status IN ('approved', 'in_progress') AND due_date IS NOT NULL;

COMMENT ON TABLE master.party_risk_mitigation IS
    'ARCHETYPE=B;SCOPE=T. Mitigation and response actions for identified risks. '
    'Scope: assessment-level (address overall risk) or driver-specific (address one cause). '
    'Types: waiver (accept risk), corrective_action (fix it), monitoring (watch it), '
    'escalation (involve senior), rejection (decline BP), conditional_approval (proceed with conditions).';
COMMENT ON COLUMN master.party_risk_mitigation.evidence_url IS
    'URL or reference to proof of completion (e.g. ESG policy document, updated certificate). '
    'Required when closing a corrective_action type mitigation.';


-- ============================================================================
-- §RK11 master.party_risk_review_event — assessment lifecycle audit trail
-- Immutable event log. No updates after insert.
-- Records every status transition, approval, override, and scheduled review.
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.party_risk_review_event (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    assessment_id       uuid        NOT NULL,   -- FK → party_risk_assessment

    -- Event
    event_type          text        NOT NULL,
        -- 'created' | 'submitted' | 'approved' | 'rejected' |
        -- 'overridden' | 'superseded' | 'archived' | 'scheduled_review'

    -- Actor
    actor_id            uuid,           -- null if system-triggered
    actor_type          text        NOT NULL DEFAULT 'system',
        -- 'user' | 'system' | 'api'

    -- State transition
    prior_status        text,
    new_status          text        NOT NULL,
    prior_risk_band     text,
    new_risk_band       text,

    -- Detail
    comment             text,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Immutable timestamp
    created_at          timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT prre_pkey            PRIMARY KEY (id),
    CONSTRAINT prre_tenant_uq       UNIQUE (tenant_id, id),
    CONSTRAINT prre_event_type_chk  CHECK (event_type IN (
                                        'created', 'submitted', 'approved', 'rejected',
                                        'overridden', 'superseded', 'archived',
                                        'scheduled_review')),
    CONSTRAINT prre_actor_type_chk  CHECK (actor_type IN ('user', 'system', 'api')),
    CONSTRAINT prre_new_status_chk  CHECK (new_status IN (
                                        'draft', 'pending_review', 'approved',
                                        'superseded', 'archived')),
    CONSTRAINT prre_risk_band_chk   CHECK (new_risk_band IS NULL OR new_risk_band IN (
                                        'critical', 'high', 'medium', 'low', 'unknown'))
);

CREATE INDEX IF NOT EXISTS prre_assessment_idx
    ON master.party_risk_review_event (assessment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS prre_tenant_idx
    ON master.party_risk_review_event (tenant_id, created_at DESC);

COMMENT ON TABLE master.party_risk_review_event IS
    'ARCHETYPE=I;SCOPE=T. Immutable lifecycle audit trail for risk assessments. '
    'No updates after insert. Records every status transition, manual approval, '
    'override (with band change), and scheduled review trigger. '
    'event_type=overridden captures manual band changes; '
    'event_type=approved captures the final review sign-off.';
COMMENT ON COLUMN master.party_risk_review_event.actor_id IS
    'Null when system-triggered (scheduled re-score, evidence ingestion, expiry). '
    'Populated for all user-initiated and API-initiated actions.';
