-- ============================================================================
-- document/01_tables_core.sql
-- Concept: Workflow & Render — workflow envelopes, render pipeline tables
-- Depends on: 04_tables/002_control.sql, 04_tables/003a_master_identity.sql
-- Scope: Platform / Workflow / Render document tables
-- Domain: workflow_request, workflow_stage, user_profile_update_request,
--         render_output, render_job
-- Load order: 004 (base document tables — no cross-document FK deps)
-- ============================================================================

-- =============================================================================
-- §6  document.workflow_request — live workflow envelope
-- =============================================================================
-- One row per running workflow process. The envelope for an approval,
-- review, or watcher workflow on a specific entity.
-- workflow_type and template are captured at creation and version-pinned:
--   template_snapshot jsonb = compiled_json from workflow_template at creation time.
--   Subsequent template changes do not affect in-flight requests.
-- A08: entity_id is TEXT (polymorphic — matches lifecycle engine convention).
-- Renamed from document.approval_instance (backup).

CREATE TABLE IF NOT EXISTS document.workflow_request (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,

    -- Workflow type (lookup: work_request.workflow_type)
    workflow_type           text        NOT NULL DEFAULT 'approval',

    -- Definition reference (which policy triggered this)
    workflow_definition_id  uuid,

    -- Template reference + version-pinned snapshot
    workflow_template_id    uuid,
    template_snapshot       jsonb,

    -- Subject (A08: entity_id = TEXT — polymorphic)
    entity_type             text        NOT NULL,
    entity_id               text        NOT NULL,
    entity_version_id       uuid,
    -- Version-pinned entity state at submission time
    entity_snapshot         jsonb,

    -- Request context
    requested_by            uuid        NOT NULL,
    requested_at            timestamptz NOT NULL DEFAULT now(),

    -- Final outcome
    status                  text        NOT NULL DEFAULT 'pending',
    decision                text,
    decided_by              uuid,
    decided_at              timestamptz,
    reason                  text,

    -- Metadata
    metadata                jsonb       NOT NULL DEFAULT '{}',

    -- Correlation
    correlation_id          uuid,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT wreq_pkey                PRIMARY KEY (id),
    CONSTRAINT wreq_tenant_id_uq        UNIQUE (tenant_id, id),
    CONSTRAINT wreq_entity_chk          CHECK (
        btrim(entity_type) <> '' AND btrim(entity_id) <> ''
    ),
    CONSTRAINT wreq_status_chk          CHECK (status IN (
        'pending', 'approved', 'rejected', 'escalated', 'canceled'
    )),
    CONSTRAINT wreq_decision_chk        CHECK (decision IS NULL OR decision IN (
        'approve', 'reject', 'escalate'
    )),
    CONSTRAINT wreq_decided_consistency CHECK (
        decision IS NULL
        OR (
            status NOT IN ('pending', 'escalated')
            AND decided_at IS NOT NULL
            AND decided_by IS NOT NULL
        )
    ),
    CONSTRAINT wreq_snapshot_chk        CHECK (
        entity_snapshot IS NULL OR jsonb_typeof(entity_snapshot) = 'object'
    ),
    CONSTRAINT wreq_template_snap_chk   CHECK (
        template_snapshot IS NULL OR jsonb_typeof(template_snapshot) = 'object'
    )
    -- workflow_type: 09_triggers — control.trg_validate_lookup_columns('work_request.workflow_type')
);

COMMENT ON TABLE  document.workflow_request IS
    'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Live workflow process envelope. One row per running approval/review/watcher. '
    'entity_id=TEXT (polymorphic — A08). '
    'entity_snapshot: version-pinned entity state at submission time. '
    'template_snapshot: version-pinned compiled_json from workflow_template. '
    'In-flight requests survive template changes. '
    'workflow_type validated via work_request.workflow_type lookup. '
    'Renamed from document.approval_instance (backup).';
COMMENT ON COLUMN document.workflow_request.entity_snapshot IS
    'Copy of entity payload at request submission time. '
    'Assignees see what was submitted, not the current (possibly edited) state. '
    'Controlled by workflow_template.behaviors.capture_entity_snapshot.';
COMMENT ON COLUMN document.workflow_request.template_snapshot IS
    'compiled_json from workflow_template at request creation time. '
    'Version-pins the workflow — template changes do not affect in-flight requests.';


-- =============================================================================
-- §7  document.workflow_stage — live stage instance
-- =============================================================================
-- One row per template_stage per workflow_request. Created upfront when the
-- workflow_request is created. Work items are created only when stage → ACTIVE.
-- A06: quorum captured at creation (version-pinned from template_stage).
-- A12: template_stage_id FK links back to control.workflow_template_stage.
-- Moved from control.* (backup) to document.* — it is an operational record.
-- Renamed from document.approval_stage (backup).

CREATE TABLE IF NOT EXISTS document.workflow_stage (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,

    -- Parent request
    workflow_request_id     uuid        NOT NULL,

    -- Template lineage (A12: trace back to template stage)
    template_stage_id       uuid,

    -- Stage definition (captured at creation — version-pinned)
    stage_no                smallint    NOT NULL,
    name                    text,

    -- Execution mode (captured from template at creation)
    mode                    text        NOT NULL DEFAULT 'serial',

    -- Quorum (A06: captured at creation — version-pinned)
    quorum                  jsonb,

    -- SLA
    sla_policy_id           uuid,

    -- Stage lifecycle
    status                  text        NOT NULL DEFAULT 'pending',
    started_at              timestamptz,
    completed_at            timestamptz,

    -- Outcome (set when stage completes)
    outcome                 text,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT wstg_pkey            PRIMARY KEY (id),
    CONSTRAINT wstg_tenant_id_uq    UNIQUE (tenant_id, id),
    -- One stage per stage_no per request
    CONSTRAINT wstg_stage_no_uq     UNIQUE (workflow_request_id, stage_no),
    CONSTRAINT wstg_stage_no_chk    CHECK (stage_no > 0),
    CONSTRAINT wstg_mode_chk        CHECK (mode IN ('serial', 'parallel')),
    CONSTRAINT wstg_status_chk      CHECK (status IN (
        'pending', 'active', 'completed', 'skipped', 'canceled'
    )),
    CONSTRAINT wstg_started_chk     CHECK (
        status = 'pending'
        OR (status IN ('active', 'completed', 'skipped') AND started_at IS NOT NULL)
    ),
    CONSTRAINT wstg_completed_chk   CHECK (
        status NOT IN ('completed', 'skipped', 'canceled') OR completed_at IS NOT NULL
    ),
    CONSTRAINT wstg_quorum_chk      CHECK (
        quorum IS NULL OR jsonb_typeof(quorum) = 'object'
    )
);

COMMENT ON TABLE  document.workflow_stage IS
    'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Runtime stage instance. One row per template_stage per workflow_request. '
    'Created upfront — work_items created only when stage status → active. '
    'mode + quorum captured at creation (version-pinned — A06). '
    'template_stage_id links back to control.workflow_template_stage (A12). '
    'Moved from control.* to document.*. Renamed from approval_stage (backup).';
COMMENT ON COLUMN document.workflow_stage.quorum IS
    'Captured from workflow_template_stage.quorum at request creation. '
    'Version-pinned — template quorum changes do not affect in-flight stages.';
COMMENT ON COLUMN document.workflow_stage.outcome IS
    'Stage-level outcome when completed: approved | rejected | escalated | skipped.';


-- =============================================================================
-- §8  document.user_profile_update_request — self-service profile change
-- =============================================================================
-- Self-service profile update request. entity_class=DOCUMENT.
-- allow_on_behalf_of=false — self-service only (principal_id = created_by).
-- Requestor submits changes to own profile fields, locale/contact,
-- IAM group membership, or OU assignment. Routed to supervisor for approval.
-- ATH-DP-UPUPR-001 v3.0.

CREATE TABLE IF NOT EXISTS document.user_profile_update_request (

    -- ── Identity ──────────────────────────────────────────────────────────
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid        NOT NULL,
    code                  text        NOT NULL,
    name                  text        NOT NULL,

    -- ── Requestor (platform contract — trigger-populated) ─────────────────
    created_by            uuid        NOT NULL,
    requested_by          uuid        NOT NULL,

    -- ── Subject (UPUPR-specific) ──────────────────────────────────────────
    principal_id          uuid        NOT NULL,
    principal_snapshot    jsonb,

    -- ── Request data ──────────────────────────────────────────────────────
    request_scope         text[]      NOT NULL DEFAULT '{}',
    priority              text        NOT NULL DEFAULT 'normal',
    change_reason         text,
    requested_changes     jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- ── Routing ───────────────────────────────────────────────────────────
    workflow_request_id   uuid,

    -- ── Lifecycle ─────────────────────────────────────────────────────────
    status                text        NOT NULL DEFAULT 'draft',
    is_active             boolean     GENERATED ALWAYS AS (
        status IN ('draft','submitted','awaiting_approval','revision_requested')
    ) STORED,
    status_changed_at     timestamptz,
    status_changed_by     uuid,

    -- ── Metadata ──────────────────────────────────────────────────────────
    metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- ── Audit ─────────────────────────────────────────────────────────────
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz,
    updated_by            uuid,

    -- ── 8 Constraints ─────────────────────────────────────────────────────
    CONSTRAINT upupr_pkey            PRIMARY KEY (id),
    CONSTRAINT upupr_tenant_code_uq  UNIQUE (tenant_id, code),
    CONSTRAINT upupr_tenant_id_uq    UNIQUE (tenant_id, id),
    CONSTRAINT upupr_code_nonempty   CHECK (btrim(code) <> ''),
    CONSTRAINT upupr_code_fmt        CHECK (code !~ '\s'),
    CONSTRAINT upupr_name_nonempty   CHECK (btrim(name) <> ''),
    CONSTRAINT upupr_no_behalf_chk   CHECK (requested_by = created_by),
    CONSTRAINT upupr_subject_chk     CHECK (principal_id = created_by)
);

COMMENT ON TABLE document.user_profile_update_request IS
    'ARCHETYPE=B;SCOPE=T. Non-standard active-set: is_active GENERATED AS (status IN (''draft'',''submitted'',''awaiting_approval'',''revision_requested'')). Self-service profile update request. entity_class=DOCUMENT. '
    'allow_on_behalf_of=false — self-service only (principal_id = created_by). '
    'Requestor submits changes to own profile fields, locale/contact, '
    'IAM group membership, or OU assignment. Routed to supervisor for approval. '
    'ATH-DP-UPUPR-001 v3.0.';


-- =============================================================================
-- §9  DOCUMENT · PRINT · BRANDING  —  document tables
-- =============================================================================
-- Depends on: master.tenant, snapshot.template_version

-- ── §9.1  document.render_output ───────────────────────────────────────────
-- Render request record — mutable status lifecycle (QUEUED → RENDERED → DELIVERED).
-- Idempotency unique index prevents duplicate concurrent renders.

CREATE TABLE IF NOT EXISTS document.render_output (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,

    -- Render inputs (cross-schema FKs in 06_constraints)
    template_version_id uuid,
    letterhead_id       uuid,
    brand_profile_id    uuid,

    -- Polymorphic entity context
    entity_name         text        NOT NULL,
    entity_id           text        NOT NULL,   -- text: polymorphic entity PK

    -- Render parameters
    operation           text        NOT NULL,
    variant             text        NOT NULL DEFAULT 'default',
    locale              text        NOT NULL DEFAULT 'en',
    timezone            text        NOT NULL DEFAULT 'UTC',

    -- Output storage
    status              text        NOT NULL DEFAULT 'QUEUED',
    storage_bucket      text,
    storage_key         text,
    storage_version_id  text,
    mime_type           text                 DEFAULT 'application/pdf',
    size_bytes          bigint,
    checksum            text,

    -- Request tracking
    manifest_json       jsonb       NOT NULL DEFAULT '{}'::jsonb,
    manifest_version    integer     NOT NULL DEFAULT 1,
    input_payload_hash  text,
    replaces_output_id  uuid,

    -- Error tracking
    error_code          text,
    error_message       text,

    -- Lifecycle timestamps
    rendered_at         timestamptz,
    delivered_at        timestamptz,
    archived_at         timestamptz,
    revoked_at          timestamptz,
    revoked_by          uuid,
    revoke_reason       text,

    -- Audit
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT render_output_pkey               PRIMARY KEY (id),
    CONSTRAINT render_output_tenant_id_uq       UNIQUE (tenant_id, id),
    CONSTRAINT render_output_status_chk         CHECK (status IN (
        'QUEUED', 'RENDERING', 'RENDERED', 'DELIVERED',
        'FAILED', 'ARCHIVED', 'REVOKED'
    )),
    CONSTRAINT render_output_size_chk           CHECK (
        size_bytes IS NULL OR size_bytes >= 0
    ),
    CONSTRAINT render_output_entity_name_chk    CHECK (btrim(entity_name) <> ''),
    CONSTRAINT render_output_entity_id_chk      CHECK (btrim(entity_id) <> ''),
    CONSTRAINT render_output_operation_chk      CHECK (btrim(operation) <> ''),
    CONSTRAINT render_output_manifest_ver_chk   CHECK (manifest_version >= 1)
    -- template_version_id, letterhead_id, brand_profile_id FKs in 06_constraints
);

COMMENT ON TABLE  document.render_output IS
    'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Render request + result. Status lifecycle: QUEUED→RENDERING→RENDERED→DELIVERED. '
    'Idempotency index prevents same render being queued twice concurrently. '
    'manifest_json validated by document.trg_validate_manifest_json() trigger.';
COMMENT ON COLUMN document.render_output.entity_id IS
    'Entity PK as text — supports uuid and non-uuid entity keys (polymorphic).';
COMMENT ON COLUMN document.render_output.manifest_json IS
    'Render request manifest. Must be JSON object with entity_name key. '
    'Validated by document.trg_validate_manifest_json() trigger.';


-- ── §9.2  document.render_job ──────────────────────────────────────────────
-- Individual render execution record.
-- Mutable status (PENDING → RETRYING → COMPLETED) — NOT append-only.

CREATE TABLE IF NOT EXISTS document.render_job (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,

    -- Parent render request
    output_id       uuid        NOT NULL,

    -- Queue context
    job_queue_id    text,
    trace_id        text,

    -- Execution lifecycle
    status          text        NOT NULL DEFAULT 'PENDING',
    attempts        integer     NOT NULL DEFAULT 0,
    max_attempts    integer     NOT NULL DEFAULT 3,

    -- Error detail
    error_code      text,
    error_detail    text,

    -- Timing
    started_at      timestamptz,
    completed_at    timestamptz,
    duration_ms     bigint,

    -- Audit
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000',
    updated_at      timestamptz,

    CONSTRAINT render_job_pkey              PRIMARY KEY (id),
    CONSTRAINT render_job_status_chk        CHECK (status IN (
        'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'RETRYING'
    )),
    CONSTRAINT render_job_attempts_pos      CHECK (attempts >= 0),
    CONSTRAINT render_job_max_pos           CHECK (max_attempts > 0),
    CONSTRAINT render_job_attempts_cap      CHECK (attempts <= max_attempts),
    CONSTRAINT render_job_duration_pos      CHECK (
        duration_ms IS NULL OR duration_ms >= 0
    )
);

COMMENT ON TABLE document.render_job IS
    'ARCHETYPE=C;SCOPE=T. Render execution record. Mutable status (PENDING→RETRYING→COMPLETED) — '
    'not append-only, belongs in document schema not log. '
    'One render_output may have multiple render_job rows (retries). '
    'created_by: session principal who enqueued the job.';
