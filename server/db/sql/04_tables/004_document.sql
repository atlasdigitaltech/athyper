-- 04_tables/004_document.sql
-- Depends on: 01_schemas, 04_tables/002_control.sql, 04_tables/003_master.sql
-- Document schema tables.

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
    'Live workflow process envelope. One row per running approval/review/watcher. '
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
    'Runtime stage instance. One row per template_stage per workflow_request. '
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
    'Self-service profile update request. entity_class=DOCUMENT. '
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
    'Render request + result. Status lifecycle: QUEUED→RENDERING→RENDERED→DELIVERED. '
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
    'Render execution record. Mutable status (PENDING→RETRYING→COMPLETED) — '
    'not append-only, belongs in document schema not log. '
    'One render_output may have multiple render_job rows (retries). '
    'created_by: session principal who enqueued the job.';


-- ============================================================================
-- JOURNAL ENTRY / LINE / LINE REFERENCE
-- ============================================================================

-- §JE  document.journal_entry — the posting event
-- Status lifecycle: draft → created → posted → reversed
-- All amounts cached from lines (trigger-synced on draft→created)
-- Immutable after posted (except status→reversed and reversed_by_id)
CREATE TABLE IF NOT EXISTS document.journal_entry (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,
    code             text         NOT NULL DEFAULT '',
    name             text         NOT NULL DEFAULT '',

    -- Company scope (Tier 1 UUID)
    company_code_id  uuid         NOT NULL,

    -- Book + Period (UUID FKs)
    book_id          uuid         NOT NULL,
    fiscal_period_id uuid         NOT NULL,
    fiscal_year      smallint     NOT NULL,
    period_number    smallint     NOT NULL,

    -- Numbering
    je_number        text         NOT NULL,

    -- Dates
    document_date    date         NOT NULL,
    posting_date     date         NOT NULL,

    -- Source document
    source_doc_type  text         NOT NULL,
    source_doc_id    uuid,

    -- Amounts (CACHED from lines — not authoritative)
    transaction_currency character(3) NOT NULL,
    base_currency    character(3)     NOT NULL,
    total_debit      numeric(18,4) NOT NULL DEFAULT 0,
    total_credit     numeric(18,4) NOT NULL DEFAULT 0,
    line_count       smallint     NOT NULL DEFAULT 0,

    -- Description
    description      text,

    -- Reversal chain
    is_reversal      boolean      NOT NULL DEFAULT false,
    reversal_of_id   uuid,
    reversed_by_id   uuid,

    -- Auto-reversal
    is_auto_reverse  boolean      NOT NULL DEFAULT false,
    auto_reverse_date date,

    -- Cross-book derivation
    derived_from_je_id   uuid,
    posting_rule_id      uuid,
    book_idempotency_key text,

    -- Closed-period support
    prior_period_flag      boolean  NOT NULL DEFAULT false,
    original_period_year   smallint,
    original_period_number smallint,
    close_override_id      uuid,

    -- Posting metadata
    posted_at        timestamptz,
    posted_by        uuid,

    -- Tags
    tags             jsonb        NOT NULL DEFAULT '[]'::jsonb,

    -- Metadata
    metadata         jsonb        NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status           text         NOT NULL DEFAULT 'draft',
    is_active        boolean      GENERATED ALWAYS AS (status IN ('draft', 'created', 'posted')) STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at       timestamptz  NOT NULL DEFAULT now(),
    created_by       uuid         NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,

    CONSTRAINT journal_entry_pkey PRIMARY KEY (id),
    CONSTRAINT journal_entry_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT journal_entry_tenant_number_uq
        UNIQUE (tenant_id, company_code_id, je_number),
    CONSTRAINT je_balanced_chk CHECK (total_debit = total_credit),
    CONSTRAINT je_doc_date_chk CHECK (document_date <= posting_date),
    CONSTRAINT je_auto_reverse_chk CHECK (NOT is_auto_reverse OR auto_reverse_date IS NOT NULL),
    CONSTRAINT je_no_self_ref CHECK (reversal_of_id IS DISTINCT FROM id),
    CONSTRAINT je_prior_period_chk CHECK (
        NOT prior_period_flag
        OR (original_period_year IS NOT NULL AND original_period_number IS NOT NULL)
    ),
    CONSTRAINT je_number_nonempty CHECK (btrim(je_number) <> '')
);

-- Idempotency for cross-book derived JEs
CREATE UNIQUE INDEX IF NOT EXISTS je_idempotency_uq
    ON document.journal_entry (tenant_id, book_idempotency_key)
    WHERE book_idempotency_key IS NOT NULL;

COMMENT ON TABLE document.journal_entry IS
    'Journal entry header. Status lifecycle: draft → created → posted → reversed. '
    'Amounts cached from lines (trigger-synced). Immutable after posted. '
    'document_date = business event date, posting_date = GL period assignment.';


-- §JL  document.journal_line — debit/credit lines
-- Dual-currency: transaction amounts (document currency) + base amounts
-- Strict polarity: exactly one side > 0.
-- Denormalized company_code_id, book_id, fiscal_period_id from header.
CREATE TABLE IF NOT EXISTS document.journal_line (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,

    -- Parent journal entry
    journal_entry_id uuid         NOT NULL,

    -- Denormalized from header (trigger-synced on INSERT)
    company_code_id  uuid         NOT NULL,
    book_id          uuid         NOT NULL,
    fiscal_period_id uuid         NOT NULL,
    fiscal_year      smallint     NOT NULL,
    period_number    smallint     NOT NULL,
    posting_date     date         NOT NULL,

    -- Line sequencing
    line_no          smallint     NOT NULL,

    -- Account
    gl_account_id    uuid         NOT NULL,

    -- Transaction amounts (document currency)
    transaction_currency character(3) NOT NULL,
    transaction_debit    numeric(18,4) NOT NULL DEFAULT 0,
    transaction_credit   numeric(18,4) NOT NULL DEFAULT 0,

    -- Base amounts (company functional currency)
    base_currency    character(3)     NOT NULL,
    base_debit       numeric(18,4) NOT NULL DEFAULT 0,
    base_credit      numeric(18,4) NOT NULL DEFAULT 0,
    exchange_rate    numeric(18,10),

    -- First-class dimensions
    cost_center_id   uuid,
    profit_center_id uuid,
    project_id       uuid,
    site_id          uuid,

    -- Composite dimensions
    dimension_set_id uuid,

    -- Party (counterparty)
    party_type       text,
    party_id         uuid,

    -- Subledger
    subledger_type   text,

    -- Narrative
    description      text,

    -- Source traceability
    source_doc_line_id uuid,

    -- Posting
    posted_at        timestamptz,
    posted_by        uuid,

    -- Audit
    created_at       timestamptz  NOT NULL DEFAULT now(),
    created_by       uuid         NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,

    -- Tags + metadata
    tags             jsonb        NOT NULL DEFAULT '[]'::jsonb,
    metadata         jsonb        NOT NULL DEFAULT '{}'::jsonb,

    CONSTRAINT journal_line_pkey PRIMARY KEY (id),
    CONSTRAINT journal_line_je_line_uq UNIQUE (tenant_id, journal_entry_id, line_no),
    CONSTRAINT jl_txn_nonneg_chk CHECK (transaction_debit >= 0 AND transaction_credit >= 0),
    CONSTRAINT jl_txn_polarity_chk CHECK (
        (transaction_debit > 0 AND transaction_credit = 0)
        OR (transaction_debit = 0 AND transaction_credit > 0)
    ),
    CONSTRAINT jl_base_nonneg_chk CHECK (base_debit >= 0 AND base_credit >= 0),
    CONSTRAINT jl_base_polarity_chk CHECK (
        (base_debit > 0 AND base_credit = 0)
        OR (base_debit = 0 AND base_credit > 0)
    ),
    CONSTRAINT jl_side_match_chk CHECK (
        (transaction_debit > 0 AND base_debit > 0)
        OR (transaction_credit > 0 AND base_credit > 0)
    ),
    CONSTRAINT jl_fx_rate_chk CHECK (
        transaction_currency = base_currency OR exchange_rate IS NOT NULL
    ),
    CONSTRAINT jl_party_chk CHECK (
        (party_type IS NULL AND party_id IS NULL)
        OR (party_type IS NOT NULL AND party_id IS NOT NULL)
    )
);

COMMENT ON TABLE document.journal_line IS
    'Journal entry debit/credit lines. Dual-currency: transaction + base amounts. '
    'Strict polarity: exactly one side > 0. Denormalized header fields for query perf.';


-- §JLR  document.journal_line_reference — allocation / application tracking
CREATE TABLE IF NOT EXISTS document.journal_line_reference (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,

    -- Parent line
    journal_line_id  uuid         NOT NULL,

    -- Reference target (polymorphic)
    ref_type         text         NOT NULL,
    ref_doc_type     text         NOT NULL,
    ref_doc_id       uuid         NOT NULL,
    ref_doc_line_id  uuid,
    ref_doc_number   text,

    -- Allocation amount
    allocated_amount numeric(18,4) NOT NULL,
    currency_code    character(3) NOT NULL,
    base_amount      numeric(18,4),

    -- Settlement tracking
    is_full_settlement boolean    NOT NULL DEFAULT false,
    settlement_date  date,

    -- Narrative
    description      text,

    -- Metadata
    metadata         jsonb        NOT NULL DEFAULT '{}'::jsonb,

    -- Audit
    created_at       timestamptz  NOT NULL DEFAULT now(),
    created_by       uuid         NOT NULL,

    CONSTRAINT journal_line_reference_pkey PRIMARY KEY (id),
    CONSTRAINT jlr_amount_pos_chk CHECK (allocated_amount > 0)
);

-- G3: Widened uniqueness — include ref_doc_line_id for line-level allocation.
-- Old: UNIQUE (tenant_id, journal_line_id, ref_doc_type, ref_doc_id)
--   Problem: one JE line can't allocate to two lines of the same invoice.
-- New: adds COALESCE(ref_doc_line_id, sentinel) so (JE-line, INV-001, line-1)
--   and (JE-line, INV-001, line-2) are distinct rows.
CREATE UNIQUE INDEX IF NOT EXISTS jlr_line_ref_uq
    ON document.journal_line_reference (
        tenant_id,
        journal_line_id,
        ref_doc_type,
        ref_doc_id,
        COALESCE(ref_doc_line_id, '00000000-0000-0000-0000-000000000000')
    );

COMMENT ON TABLE document.journal_line_reference IS
    'Allocation/application tracking. 1:N child of journal_line. Handles payment '
    'allocation, credit note application, netting, advance clearing, PO matching, '
    'and asset capitalization.';


-- =============================================================================
-- =============================================================================
-- §AT  ASSET TRANSACTION & DEPRECIATION TABLES
-- =============================================================================
-- =============================================================================


-- =============================================================================
-- §AT1  document.asset_transaction — asset lifecycle events
-- =============================================================================
-- Capitalize, depreciate, revalue, impair, dispose, transfer, retire, adjust.
-- asset_book_id is the authoritative book link. book_type is denormalized
-- convenience. Consistency enforced by document.trg_asset_txn_book_guard().

CREATE TABLE IF NOT EXISTS document.asset_transaction (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,
    code             text         NOT NULL DEFAULT '',
    name             text         NOT NULL DEFAULT '',

    -- Company scope (Tier 1 UUID)
    company_code_id  uuid         NOT NULL,

    -- Table-specific (asset + book linkage)
    asset_id                 uuid         NOT NULL,
    asset_book_id            uuid,
    book_type                text,
    txn_type                 text         NOT NULL,

    -- Table-specific (amounts)
    amount                   numeric(18,4) NOT NULL,
    currency_code            character(3) NOT NULL DEFAULT 'USD',

    -- Table-specific (period alignment)
    effective_date           date         NOT NULL,
    fiscal_year              smallint     NOT NULL,
    period_number            smallint     NOT NULL,

    -- Table-specific (audit state capture)
    from_values              jsonb,
    to_values                jsonb,

    -- Table-specific (linkage)
    reference_je_id          uuid,
    depreciation_run_id      uuid,
    depreciation_run_line_id uuid,

    -- Table-specific (reversal support)
    reversal_of_id           uuid,
    is_reversal              boolean      NOT NULL DEFAULT false,

    -- Table-specific (actor tracking)
    performed_by             uuid         NOT NULL,
    performed_at             timestamptz  NOT NULL DEFAULT now(),
    notes                    text,

    -- Table-specific (posting)
    posted_at                timestamptz,
    posted_by                uuid,

    -- Tags & Metadata
    tags             jsonb        NOT NULL DEFAULT '[]'::jsonb,
    metadata         jsonb        NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status           text         NOT NULL DEFAULT 'draft',
    is_active        boolean      GENERATED ALWAYS AS (status IN ('draft', 'posted')) STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at       timestamptz  NOT NULL DEFAULT now(),
    created_by       uuid         NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,

    CONSTRAINT asset_txn_pkey           PRIMARY KEY (id),
    CONSTRAINT asset_txn_tenant_id_uq   UNIQUE (tenant_id, id),
    CONSTRAINT asset_txn_reversal_chk   CHECK (
        (is_reversal = false AND reversal_of_id IS NULL)
        OR (is_reversal = true AND reversal_of_id IS NOT NULL)
    )
);

COMMENT ON TABLE document.asset_transaction IS
    'Asset lifecycle events. Links to asset_book_id (authoritative) and retains '
    'book_type as denormalized convenience. Consistency enforced by trigger.';


-- =============================================================================
-- §AT2  document.depreciation_run — batch depreciation run header
-- =============================================================================
-- Idempotency enforced via conditional unique index on idempotency_key.

CREATE TABLE IF NOT EXISTS document.depreciation_run (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,
    code             text         NOT NULL DEFAULT '',
    name             text         NOT NULL DEFAULT '',

    -- Company scope (Tier 1 UUID)
    company_code_id  uuid         NOT NULL,

    -- Table-specific
    book_type                text         NOT NULL,
    book_id                  uuid,
    fiscal_year              smallint     NOT NULL,
    period_number            smallint     NOT NULL,

    -- Table-specific (run metrics)
    asset_count              integer      NOT NULL DEFAULT 0,
    total_amount             numeric(18,4) NOT NULL DEFAULT 0,
    currency_code            character(3) NOT NULL DEFAULT 'USD',
    error_count              integer      NOT NULL DEFAULT 0,
    error_log                jsonb,

    -- Table-specific (timing)
    started_at               timestamptz,
    completed_at             timestamptz,

    -- Table-specific (linkage)
    reference_je_id          uuid,

    -- Table-specific (reversal)
    reversal_of_id           uuid,
    is_reversal              boolean      NOT NULL DEFAULT false,

    -- Table-specific (actor)
    run_by                   uuid         NOT NULL,

    -- Table-specific (idempotency)
    idempotency_key          text,

    -- Table-specific (posting)
    posted_at                timestamptz,
    posted_by                uuid,

    -- Metadata
    metadata         jsonb        NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status           text         NOT NULL DEFAULT 'planned',
    is_active        boolean      GENERATED ALWAYS AS (status IN ('planned', 'running')) STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at       timestamptz  NOT NULL DEFAULT now(),
    created_by       uuid         NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,

    CONSTRAINT depreciation_run_pkey           PRIMARY KEY (id),
    CONSTRAINT depreciation_run_tenant_id_uq   UNIQUE (tenant_id, id),
    CONSTRAINT depreciation_run_period_book_uq
        UNIQUE (tenant_id, company_code_id, book_type, fiscal_year, period_number, is_reversal),
    CONSTRAINT depreciation_run_reversal_chk   CHECK (
        (is_reversal = false AND reversal_of_id IS NULL)
        OR (is_reversal = true AND reversal_of_id IS NOT NULL)
    ),
    CONSTRAINT depreciation_run_error_count_pos CHECK (error_count >= 0)
);

COMMENT ON TABLE document.depreciation_run IS
    'Batch depreciation run header. Idempotency enforced via conditional '
    'unique index on (tenant_id, company_code_id, idempotency_key).';


-- =============================================================================
-- §AT3  document.depreciation_run_line — per-asset run detail
-- =============================================================================
-- Asset/book mismatch prevented by composite FK (tenant_id, asset_book_id, asset_id)
-- referencing master.asset_book (tenant_id, id, asset_id).
-- This table is immutable after creation (log.trg_prevent_mutation).

CREATE TABLE IF NOT EXISTS document.depreciation_run_line (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,

    -- Table-specific
    run_id                   uuid         NOT NULL,
    asset_id                 uuid         NOT NULL,
    asset_book_id            uuid         NOT NULL,

    -- Table-specific (calculated amounts)
    depreciation_amount      numeric(18,4) NOT NULL,
    currency_code            character(3) NOT NULL DEFAULT 'USD',

    -- Table-specific (book values at time of calculation — snapshot)
    cost_basis_at_run        numeric(18,4) NOT NULL,
    accum_depr_before        numeric(18,4) NOT NULL,
    accum_depr_after         numeric(18,4) NOT NULL,
    nbv_after                numeric(18,4) NOT NULL,

    -- Table-specific (method applied)
    depreciation_method      text         NOT NULL,
    useful_life_months       integer      NOT NULL,
    remaining_life_months    integer      NOT NULL,

    -- Table-specific (linkage to asset_transaction)
    asset_transaction_id     uuid,

    -- Table-specific (status)
    line_status              text         NOT NULL DEFAULT 'calculated',
    error_message            text,

    -- Audit (immutable — no updated_at)
    created_at       timestamptz  NOT NULL DEFAULT now(),
    created_by       uuid         NOT NULL,

    CONSTRAINT depreciation_run_line_pkey           PRIMARY KEY (id),
    CONSTRAINT depreciation_run_line_tenant_id_uq   UNIQUE (tenant_id, id),
    CONSTRAINT depreciation_run_line_run_asset_uq   UNIQUE (run_id, asset_book_id),
    CONSTRAINT depreciation_run_line_amount_pos     CHECK (depreciation_amount >= 0)
);

COMMENT ON TABLE document.depreciation_run_line IS
    'Per-asset line detail within a depreciation run. Reconcilable to run header total. '
    'Asset/book mismatch prevented by composite FK (tenant_id, asset_book_id, asset_id). '
    'Immutable after creation — log.trg_prevent_mutation blocks UPDATE/DELETE.';


-- =============================================================================
-- §AT4  document.depreciation_schedule — planned month-by-month projection
-- =============================================================================
-- Supports versioning and plan-vs-actual via generated variance_amount.

CREATE TABLE IF NOT EXISTS document.depreciation_schedule (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,

    -- Table-specific
    asset_book_id            uuid         NOT NULL,
    schedule_version         smallint     NOT NULL DEFAULT 1,

    -- Table-specific (period identification)
    fiscal_year              smallint     NOT NULL,
    period_number            smallint     NOT NULL,
    period_date              date         NOT NULL,

    -- Table-specific (planned amounts)
    schedule_amount          numeric(18,4) NOT NULL,
    cumulative_amount        numeric(18,4) NOT NULL,
    opening_nbv              numeric(18,4) NOT NULL,
    closing_nbv              numeric(18,4) NOT NULL,
    currency_code            character(3) NOT NULL DEFAULT 'USD',

    -- Table-specific (actual — populated after depreciation run)
    actual_amount            numeric(18,4),
    actual_run_line_id       uuid,
    variance_amount          numeric(18,4) GENERATED ALWAYS AS
                                 (CASE WHEN actual_amount IS NOT NULL
                                       THEN actual_amount - schedule_amount
                                       ELSE NULL END) STORED,

    -- Table-specific (flags)
    is_final_period          boolean      NOT NULL DEFAULT false,
    notes                    text,

    -- Audit
    created_at       timestamptz  NOT NULL DEFAULT now(),
    created_by       uuid         NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,

    CONSTRAINT depreciation_schedule_pkey PRIMARY KEY (id),
    CONSTRAINT depreciation_schedule_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT depreciation_schedule_book_ver_period_uq
        UNIQUE (asset_book_id, schedule_version, fiscal_year, period_number),
    CONSTRAINT depreciation_schedule_amount_pos CHECK (schedule_amount >= 0),
    CONSTRAINT depreciation_schedule_cum_pos   CHECK (cumulative_amount >= 0)
);

COMMENT ON TABLE document.depreciation_schedule IS
    'Planned month-by-month depreciation projection per asset_book. '
    'Supports versioning and plan-vs-actual via generated variance_amount.';

-- ============================================================================
-- Engine 4.13: Unified Transaction Resolution Engine additions
-- ============================================================================

-- §13  obligation_horizon — multi-year demand signal (child of document.commitment)
--      obligation_tier = lifecycle progression (PLANNED → FORECAST → RESERVED → COMMITTED → CONSUMED).
--      status = operational state (active | cancelled | superseded).
--      variance_to_original = computed delta from baseline; NULL when original_amount not yet set.
CREATE TABLE IF NOT EXISTS document.obligation_horizon (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,

    -- Parent document
    commitment_id           uuid        NOT NULL,
    schedule_id             uuid,

    -- Fiscal scope
    fiscal_year             smallint    NOT NULL,
    period_from             smallint    NOT NULL DEFAULT 1,
    period_to               smallint    NOT NULL DEFAULT 12,

    -- Obligation state
    obligation_tier         text        NOT NULL DEFAULT 'PLANNED',
    amount                  numeric(18,4) NOT NULL,
    original_amount         numeric(18,4),
    currency_code           text        NOT NULL,

    -- Budget linkage
    fp_id                   uuid,
    intent_id               uuid,
    company_code_id         uuid,

    -- Spread
    spread_method           text        NOT NULL DEFAULT 'EVEN',
    period_amounts          jsonb,
    confidence              numeric(3,2) NOT NULL DEFAULT 1.00,
    source_type             text        NOT NULL DEFAULT 'CONTRACT',

    -- Escalation
    escalation_formula      jsonb,
    escalation_applied_at   timestamptz,

    -- FX
    contract_currency_code  text,
    contract_amount         numeric(18,4),
    exchange_rate           numeric(12,6),
    rate_type               text,

    -- Retention
    retention_pct           numeric(5,2),
    retention_release_date  date,

    -- Amendment tracking
    amendment_count         smallint    NOT NULL DEFAULT 0,
    variance_to_original    numeric(18,4) GENERATED ALWAYS AS (amount - original_amount) STORED,

    -- Lifecycle events (timestamps; not replacements for status)
    promoted_at             timestamptz,
    reserved_at             timestamptz,
    funding_txn_id          uuid,

    -- Metadata
    metadata                jsonb       NOT NULL DEFAULT '{}',

    -- Lifecycle
    status            text             NOT NULL DEFAULT 'active',
    is_active         boolean          GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT oh_pkey              PRIMARY KEY (id),
    CONSTRAINT oh_status_chk        CHECK (status IN ('active','cancelled','superseded')),
    CONSTRAINT oh_tier_chk          CHECK (obligation_tier IN (
        'PLANNED','FORECAST','RESERVED','COMMITTED','CONSUMED')),
    CONSTRAINT oh_spread_chk        CHECK (spread_method IN (
        'EVEN','FRONT_LOADED','BACK_LOADED','MILESTONE','CUSTOM')),
    CONSTRAINT oh_source_chk        CHECK (source_type IN (
        'CONTRACT','PO','SUBSCRIPTION','LEASE','FORECAST_MODEL','MANUAL')),
    CONSTRAINT oh_period_range_chk  CHECK (
        period_from BETWEEN 1 AND 12
        AND period_to BETWEEN 1 AND 12
        AND period_from <= period_to),
    CONSTRAINT oh_confidence_chk    CHECK (confidence BETWEEN 0 AND 1),
    CONSTRAINT oh_amount_chk        CHECK (amount >= 0),
    CONSTRAINT oh_retention_chk     CHECK (retention_pct IS NULL OR retention_pct BETWEEN 0 AND 100),
    CONSTRAINT oh_amendment_chk     CHECK (amendment_count >= 0)
);

COMMENT ON TABLE document.obligation_horizon IS
    'Engine 4.13: multi-year demand signal. '
    'obligation_tier: PLANNED → FORECAST → RESERVED → COMMITTED → CONSUMED. '
    'Created on contract signing; advanced by budget lifecycle events. '
    'Child of document.commitment. variance_to_original = GENERATED (amount - original_amount).';


-- ============================================================================
-- TAX + FX ENGINE — Document schema tables
-- ============================================================================

-- ── document.fx_revaluation_run ──────────────────────────────────────────────
-- Period-end FX revaluation run header. Lines in ledger.fx_revaluation_line.
CREATE TABLE IF NOT EXISTS document.fx_revaluation_run (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,

    -- Table-specific
    company_code_id         uuid            NOT NULL,
    book_id                 uuid            NOT NULL,
    fiscal_year             smallint        NOT NULL,
    period_number           smallint        NOT NULL,
    revaluation_date        date            NOT NULL,
    posting_date            date,
    rate_type_used          text            NOT NULL DEFAULT 'PERIOD_END',
    rate_source             text            NOT NULL DEFAULT 'MANUAL',
    functional_currency     character(3)    NOT NULL,
    total_unrealized_gain   numeric(18,4)   NOT NULL DEFAULT 0,
    total_unrealized_loss   numeric(18,4)   NOT NULL DEFAULT 0,
    net_amount              numeric(18,4)   GENERATED ALWAYS AS (
                                total_unrealized_gain - total_unrealized_loss
                            ) STORED,
    line_count              integer         NOT NULL DEFAULT 0,
    revaluation_je_id       uuid,
    reversal_je_id          uuid,
    is_auto_reversed        boolean         NOT NULL DEFAULT true,
    auto_reverse_date       date,
    idempotency_key         text,

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                  text            NOT NULL DEFAULT 'draft',
    is_active               boolean         GENERATED ALWAYS AS (
                                status IN ('draft','calculated','posted')
                            ) STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT fxrr_pkey            PRIMARY KEY (id),
    CONSTRAINT fxrr_tenant_id_uq    UNIQUE (tenant_id, id),
    CONSTRAINT fxrr_status_chk      CHECK (status IN (
        'draft','calculated','posted','reversed','cancelled')),
    CONSTRAINT fxrr_gain_nonneg     CHECK (total_unrealized_gain >= 0),
    CONSTRAINT fxrr_loss_nonneg     CHECK (total_unrealized_loss >= 0),
    CONSTRAINT fxrr_period_chk      CHECK (period_number BETWEEN 1 AND 16),
    CONSTRAINT fxrr_reverse_chk     CHECK (NOT is_auto_reversed OR auto_reverse_date IS NOT NULL)
);
COMMENT ON TABLE document.fx_revaluation_run IS
    'Period-end FX revaluation run header. net_amount GENERATED. '
    'Lines stored in ledger.fx_revaluation_line (immutable). '
    'Auto-reversal creates a reversal JE on auto_reverse_date (first day of next period).';


-- ══════════════════════════════════════════════════════════════════════════════
-- BUDGET · COMMITMENT · PLANNING ENGINE — Document tables
-- ══════════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- §CMT1  document.commitment — commitment header
-- ============================================================================
-- Legal/financial obligation: PO, contract, lease, subscription, standing order.
-- Draws budget from master.budget_allocation. Children: commitment_schedule,
-- commitment_fulfillment. Tracks encumbrance JE linkage.
-- ============================================================================
CREATE TABLE IF NOT EXISTS document.commitment (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    code                    text            NOT NULL DEFAULT '',
    name                    text            NOT NULL DEFAULT '',

    -- Company scope
    company_code_id         uuid            NOT NULL,

    -- Numbering
    commitment_number       text            NOT NULL,

    -- Classification
    commitment_type         text            NOT NULL DEFAULT 'PURCHASE_ORDER',
    commitment_subtype      text,
    description             text,

    -- Counterparty (polymorphic)
    party_type              text,
    party_id                uuid,
    party_name              text,

    -- Dates
    document_date           date            NOT NULL,
    effective_date          date            NOT NULL,
    expiry_date             date,

    -- Amounts
    currency_code           character(3)    NOT NULL,
    base_currency_code      character(3)    NOT NULL,
    total_amount            numeric(18,4)   NOT NULL DEFAULT 0,
    scheduled_amount        numeric(18,4)   NOT NULL DEFAULT 0,
    fulfilled_amount        numeric(18,4)   NOT NULL DEFAULT 0,
    released_amount         numeric(18,4)   NOT NULL DEFAULT 0,
    outstanding_amount      numeric(18,4)   GENERATED ALWAYS AS (
                                total_amount - fulfilled_amount - released_amount
                            ) STORED,
    exchange_rate           numeric(18,10),

    -- Budget linkage
    budget_allocation_id    uuid,
    intent_id               uuid,
    budget_check_result     text,

    -- Encumbrance
    encumbrance_type        text            NOT NULL DEFAULT 'STANDARD',
    is_encumbered           boolean         NOT NULL DEFAULT false,
    encumbrance_je_id       uuid,

    -- Fiscal scope
    fiscal_year             smallint        NOT NULL,
    period_number           smallint,

    -- Dimensions
    cost_center_id          uuid,
    profit_center_id        uuid,
    project_id              uuid,
    site_id                 uuid,
    dimension_set_id        uuid,

    -- Organisational
    requested_by            uuid,

    -- Advance / Retention
    advance_pct             numeric(5,2),
    advance_amount          numeric(18,4),
    retention_pct           numeric(5,2),
    retention_amount        numeric(18,4),

    -- Renewal
    is_auto_renew           boolean         NOT NULL DEFAULT false,
    renewal_terms           jsonb,
    renewal_count           smallint        NOT NULL DEFAULT 0,
    renewed_from_id         uuid,

    -- Amendment tracking
    amendment_count         smallint        NOT NULL DEFAULT 0,
    original_amount         numeric(18,4),
    variance_to_original    numeric(18,4)   GENERATED ALWAYS AS (
                                total_amount - COALESCE(original_amount, total_amount)
                            ) STORED,

    -- Line count (trigger-synced)
    schedule_count          smallint        NOT NULL DEFAULT 0,

    -- Approval
    approved_at             timestamptz,
    approved_by             uuid,
    workflow_request_id     uuid,

    -- Close / Cancellation
    closed_at               timestamptz,
    closed_by               uuid,
    close_reason            text,

    -- Tags
    tags                    jsonb           NOT NULL DEFAULT '[]'::jsonb,

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                  text            NOT NULL DEFAULT 'draft',
    is_active               boolean         GENERATED ALWAYS AS (
                                status IN ('draft','pending_approval','approved','active','partially_fulfilled')
                            ) STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT cmt_pkey                 PRIMARY KEY (id),
    CONSTRAINT cmt_tenant_id_uq         UNIQUE (tenant_id, id),
    CONSTRAINT cmt_tenant_number_uq     UNIQUE (tenant_id, company_code_id, commitment_number),
    CONSTRAINT cmt_number_nonempty      CHECK (btrim(commitment_number) <> ''),
    CONSTRAINT cmt_status_chk           CHECK (status IN (
        'draft','pending_approval','approved','active','partially_fulfilled',
        'fully_fulfilled','closed','cancelled','expired','suspended')),
    CONSTRAINT cmt_type_chk             CHECK (commitment_type IN (
        'PURCHASE_ORDER','CONTRACT','LEASE','SUBSCRIPTION','STANDING_ORDER',
        'BLANKET_PO','FRAMEWORK_AGREEMENT','GRANT_AWARD','INTERNAL_ORDER')),
    CONSTRAINT cmt_encumbrance_chk      CHECK (encumbrance_type IN (
        'NONE','STANDARD','PRE_ENCUMBRANCE','STATISTICAL_ONLY')),
    CONSTRAINT cmt_check_chk            CHECK (budget_check_result IS NULL OR budget_check_result IN (
        'PASSED','WARNED','OVERRIDE','BLOCKED','EXEMPT')),
    CONSTRAINT cmt_amount_nonneg        CHECK (total_amount >= 0),
    CONSTRAINT cmt_fulfilled_nonneg     CHECK (fulfilled_amount >= 0),
    CONSTRAINT cmt_released_nonneg      CHECK (released_amount >= 0),
    CONSTRAINT cmt_fulfilled_lte_total  CHECK (fulfilled_amount <= total_amount),
    CONSTRAINT cmt_date_chk             CHECK (expiry_date IS NULL OR expiry_date >= effective_date),
    CONSTRAINT cmt_advance_chk          CHECK (advance_pct IS NULL OR advance_pct BETWEEN 0 AND 100),
    CONSTRAINT cmt_retention_chk        CHECK (retention_pct IS NULL OR retention_pct BETWEEN 0 AND 100),
    CONSTRAINT cmt_period_chk           CHECK (period_number IS NULL OR period_number BETWEEN 1 AND 16),
    CONSTRAINT cmt_amendment_chk        CHECK (amendment_count >= 0),
    CONSTRAINT cmt_renewal_chk          CHECK (renewal_count >= 0),
    CONSTRAINT cmt_party_chk            CHECK (
        (party_type IS NULL AND party_id IS NULL)
        OR (party_type IS NOT NULL AND party_id IS NOT NULL)),
    CONSTRAINT cmt_no_self_renew        CHECK (renewed_from_id IS DISTINCT FROM id)
);

COMMENT ON TABLE document.commitment IS
    'Commitment header: PO, contract, lease, subscription, standing order. '
    'outstanding_amount = GENERATED (total - fulfilled - released). '
    'Draws budget from master.budget_allocation (budget_allocation_id). '
    'budget_check_result: PASSED | WARNED | OVERRIDE | BLOCKED | EXEMPT. '
    'Status lifecycle: draft → pending_approval → approved → active → '
    'partially_fulfilled → fully_fulfilled → closed | cancelled | expired. '
    'Children: ledger.commitment_schedule, ledger.commitment_fulfillment.';


-- ============================================================================
-- §CMT2  document.forecast_scenario — what-if forecast scenario envelope
-- ============================================================================
-- Contains forecast_line items for one version of a forward-looking projection.
-- Multiple scenarios enable side-by-side comparison (best/worst/expected).
-- ============================================================================
CREATE TABLE IF NOT EXISTS document.forecast_scenario (
    -- Identity
    id                      uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid            NOT NULL,
    code                    text            NOT NULL,
    name                    text            NOT NULL,

    -- Company scope
    company_code_id         uuid            NOT NULL,

    -- Classification
    description             text,
    scenario_type           text            NOT NULL DEFAULT 'EXPECTED',
    scenario_purpose        text            NOT NULL DEFAULT 'BUDGET',

    -- Fiscal scope
    fiscal_year             smallint        NOT NULL,
    period_from             smallint        NOT NULL DEFAULT 1,
    period_to               smallint        NOT NULL DEFAULT 12,

    -- Model linkage (optional — for driver-based forecasts)
    planning_model_id       uuid,

    -- Ownership
    responsible_person_id   uuid,

    -- Currency
    base_currency_code      character(3)    NOT NULL,

    -- Totals (trigger-synced from lines)
    total_amount            numeric(18,4)   NOT NULL DEFAULT 0,
    line_count              smallint        NOT NULL DEFAULT 0,

    -- Versioning
    version                 integer         NOT NULL DEFAULT 1,
    based_on_scenario_id    uuid,
    is_baseline             boolean         NOT NULL DEFAULT false,

    -- Comparison
    variance_to_baseline    numeric(18,4),
    confidence_level        numeric(3,2),

    -- Approval
    approved_at             timestamptz,
    approved_by             uuid,
    published_at            timestamptz,
    published_by            uuid,

    -- Tags
    tags                    jsonb           NOT NULL DEFAULT '[]'::jsonb,

    -- Metadata
    metadata                jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status                  text            NOT NULL DEFAULT 'draft',
    is_active               boolean         GENERATED ALWAYS AS (
                                status IN ('draft','in_review','approved','published')
                            ) STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,

    -- Audit
    created_at              timestamptz     NOT NULL DEFAULT now(),
    created_by              uuid            NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT fs_pkey                  PRIMARY KEY (id),
    CONSTRAINT fs_tenant_id_uq          UNIQUE (tenant_id, id),
    CONSTRAINT fs_tenant_code_ver_uq    UNIQUE (tenant_id, company_code_id, code, version),
    CONSTRAINT fs_code_nonempty         CHECK (btrim(code) <> ''),
    CONSTRAINT fs_name_nonempty         CHECK (btrim(name) <> ''),
    CONSTRAINT fs_status_chk            CHECK (status IN (
        'draft','in_review','approved','published','superseded','archived','cancelled')),
    CONSTRAINT fs_type_chk              CHECK (scenario_type IN (
        'EXPECTED','BEST_CASE','WORST_CASE','STRETCH','CONSERVATIVE',
        'BASELINE','WHAT_IF','SENSITIVITY')),
    CONSTRAINT fs_purpose_chk           CHECK (scenario_purpose IN (
        'BUDGET','FORECAST','REFORECAST','PROJECTION','STRATEGIC','SCENARIO_ANALYSIS')),
    CONSTRAINT fs_period_range_chk      CHECK (
        period_from BETWEEN 1 AND 16
        AND period_to BETWEEN 1 AND 16
        AND period_from <= period_to),
    CONSTRAINT fs_version_chk           CHECK (version >= 1),
    CONSTRAINT fs_confidence_chk        CHECK (confidence_level IS NULL OR confidence_level BETWEEN 0 AND 1),
    CONSTRAINT fs_no_self_base          CHECK (based_on_scenario_id IS DISTINCT FROM id)
);

COMMENT ON TABLE document.forecast_scenario IS
    'What-if forecast scenario envelope. Contains control.forecast_line items. '
    'scenario_type: EXPECTED, BEST_CASE, WORST_CASE, etc. for side-by-side comparison. '
    'Versioned per (tenant, company, code). Links to master.planning_model for driver-based forecasts. '
    'Status lifecycle: draft → in_review → approved → published → superseded | archived.';


-- ══════════════════════════════════════════════════════════════════════════════
-- INVENTORY MANAGEMENT ENGINE — Document tables
-- ══════════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- §ST1  document.stocktake — physical inventory count header
-- ============================================================================
CREATE TABLE IF NOT EXISTS document.stocktake (
    -- Identity
    id                  uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid            NOT NULL,

    -- Company scope
    company_code_id     uuid            NOT NULL,

    -- Scope
    warehouse_id        uuid            NOT NULL,

    -- Document header
    reference_no        text,
    stocktake_date      date            NOT NULL,

    -- Denormalised line aggregates (maintained by trg_stl_denorm_counts trigger)
    total_line_count    integer         NOT NULL DEFAULT 0,
    variance_line_count integer         NOT NULL DEFAULT 0,

    -- GL linkage (set on completion within posting transaction)
    variance_je_id      uuid,

    -- Completion audit
    completed_at        timestamptz,
    completed_by        uuid,

    -- Metadata
    metadata            jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status              text            NOT NULL DEFAULT 'planned',
    is_active           boolean         GENERATED ALWAYS AS (status IN ('planned', 'in_progress')) STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,

    -- Audit
    created_at          timestamptz     NOT NULL DEFAULT now(),
    created_by          uuid            NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT st_pkey              PRIMARY KEY (id),
    CONSTRAINT st_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT st_status_chk        CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
    CONSTRAINT st_completed_chk     CHECK (
                                        status <> 'completed'
                                        OR (completed_at IS NOT NULL AND completed_by IS NOT NULL)
                                    ),
    CONSTRAINT st_variance_je_chk   CHECK (variance_je_id IS NULL OR status = 'completed'),
    CONSTRAINT st_line_count_chk    CHECK (total_line_count >= 0 AND variance_line_count >= 0),
    CONSTRAINT st_reference_no_chk  CHECK (reference_no IS NULL OR btrim(reference_no) <> '')
);

COMMENT ON TABLE document.stocktake IS
    'Physical inventory count header. Lifecycle: planned → in_progress → completed | cancelled. '
    'Lines remain editable while status is planned/in_progress; immutable thereafter (app-layer). '
    'Financial impact recorded as ADJUSTMENT rows in ledger.inventory_movement at completion. '
    'total_line_count / variance_line_count maintained by trg_stl_denorm_counts trigger.';


-- ============================================================================
-- §ST2  document.stocktake_line — physical count lines
-- ============================================================================
CREATE TABLE IF NOT EXISTS document.stocktake_line (
    -- Identity
    id                  uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid            NOT NULL,

    -- Parent linkage
    stocktake_id        uuid            NOT NULL,
    line_no             smallint        NOT NULL,

    -- Position key
    item_id             uuid            NOT NULL,
    warehouse_id        uuid            NOT NULL,   -- denormalised from header
    lot_number          text,
    serial_number       text,

    -- Count quantities
    system_qty          numeric(18,4)   NOT NULL,
    counted_qty         numeric(18,4)   NOT NULL,
    variance_qty        numeric(18,4)   GENERATED ALWAYS AS (counted_qty - system_qty) STORED,

    -- Valuation
    unit_cost           numeric(18,4)   NOT NULL,
    variance_value      numeric(18,4)   GENERATED ALWAYS AS ((counted_qty - system_qty) * unit_cost) STORED,
    currency_code       character(3)    NOT NULL,

    -- Posting linkage (set when parent stocktake completes)
    posted_at           timestamptz,
    posted_by           uuid,

    -- Metadata
    metadata            jsonb           NOT NULL DEFAULT '{}'::jsonb,

    -- Audit
    created_at          timestamptz     NOT NULL DEFAULT now(),
    created_by          uuid            NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT stl_pkey             PRIMARY KEY (id),
    CONSTRAINT stl_tenant_id_uq     UNIQUE (tenant_id, id),
    CONSTRAINT stl_line_uq          UNIQUE (stocktake_id, line_no),
    CONSTRAINT stl_line_no_chk      CHECK (line_no > 0),
    CONSTRAINT stl_system_qty_chk   CHECK (system_qty >= 0),
    CONSTRAINT stl_unit_cost_chk    CHECK (unit_cost >= 0),
    CONSTRAINT stl_currency_chk     CHECK (btrim(currency_code::text) <> ''),
    CONSTRAINT stl_posting_pair_chk CHECK ((posted_at IS NULL) = (posted_by IS NULL))
);

COMMENT ON TABLE document.stocktake_line IS
    'Physical count lines for a stocktake document. Editable while parent status is '
    'planned/in_progress; immutable once parent reaches completed (enforced at app layer). '
    'variance_qty = GENERATED (counted - system). variance_value = GENERATED (variance × unit_cost). '
    'warehouse_id denormalised from parent header for direct indexed variance queries.';


-- ══════════════════════════════════════════════════════════════════════════════
-- IC ENGINE — Document tables
-- ══════════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- §ICA1  document.intercompany_agreement — IC transfer pricing rulebook
-- ============================================================================
CREATE TABLE IF NOT EXISTS document.intercompany_agreement (
    id                          uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid            NOT NULL,
    code                        text            NOT NULL DEFAULT '',
    name                        text            NOT NULL DEFAULT '',
    company_code_id             uuid            NOT NULL,
    agreement_number            text            NOT NULL,
    source_company_code_id      uuid            NOT NULL,
    dest_company_code_id        uuid            NOT NULL,
    agreement_type              text            NOT NULL,
    description                 text,
    transfer_pricing_method     text            NOT NULL,
    markup_pct                  numeric(7,4),
    arm_length_basis            text,
    currency_code               character(3)    NOT NULL,
    base_currency_code          character(3),
    annual_value                numeric(18,4),
    total_value                 numeric(18,4),
    effective_from              date            NOT NULL,
    effective_to                date,
    priority                    smallint        NOT NULL DEFAULT 0,
    conflict_strategy           text            NOT NULL DEFAULT 'HIGHEST_PRIORITY',
    version                     smallint        NOT NULL DEFAULT 1,
    supersedes_id               uuid,
    cost_center_id              uuid,
    profit_center_id            uuid,
    project_id                  uuid,
    site_id                     uuid,
    dimension_set_id            uuid,
    agreement_owner_id          uuid,
    approved_at                 timestamptz,
    approved_by                 uuid,
    workflow_request_id         uuid,
    tags                        jsonb           NOT NULL DEFAULT '[]'::jsonb,
    metadata                    jsonb           NOT NULL DEFAULT '{}'::jsonb,
    status                      text            NOT NULL DEFAULT 'draft',
    is_active                   boolean         GENERATED ALWAYS AS (
                                    status IN ('draft', 'active')
                                ) STORED,
    status_changed_at           timestamptz,
    status_changed_by           uuid,
    created_at                  timestamptz     NOT NULL DEFAULT now(),
    created_by                  uuid            NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT ica_pkey              PRIMARY KEY (id),
    CONSTRAINT ica_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT ica_tenant_number_uq  UNIQUE (tenant_id, company_code_id, agreement_number),
    CONSTRAINT ica_number_nonempty   CHECK (btrim(agreement_number) <> ''),
    CONSTRAINT ica_entity_chk        CHECK (source_company_code_id IS DISTINCT FROM dest_company_code_id),
    CONSTRAINT ica_agreement_type_chk CHECK (agreement_type IN (
        'GOODS','SERVICES','LOAN','ROYALTY','MANAGEMENT_FEE','COST_SHARING','OTHER')),
    CONSTRAINT ica_tp_method_chk     CHECK (transfer_pricing_method IN (
        'CUP','COST_PLUS','RESALE_MINUS','TNMM','PROFIT_SPLIT','COMPARABLE_PROFIT','OTHER')),
    CONSTRAINT ica_markup_chk        CHECK (markup_pct IS NULL OR markup_pct BETWEEN -100 AND 1000),
    CONSTRAINT ica_conflict_chk      CHECK (conflict_strategy IN (
        'HIGHEST_PRIORITY','MOST_SPECIFIC','ERROR_ON_CONFLICT')),
    CONSTRAINT ica_effective_date_chk CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT ica_no_self_supersede CHECK (supersedes_id IS DISTINCT FROM id),
    CONSTRAINT ica_status_chk        CHECK (status IN (
        'draft','active','suspended','superseded','expired','cancelled')),
    CONSTRAINT ica_priority_chk      CHECK (priority >= 0),
    CONSTRAINT ica_version_chk       CHECK (version >= 1)
);

COMMENT ON TABLE document.intercompany_agreement IS
    'IC transfer pricing agreement between two company codes. '
    'OECD methods: CUP, COST_PLUS, RESALE_MINUS, TNMM, PROFIT_SPLIT, COMPARABLE_PROFIT. '
    'Conflict resolution via priority + conflict_strategy. '
    'Version chain via supersedes_id. Status: draft → active → suspended|superseded|expired|cancelled.';


-- ============================================================================
-- §ICA2  document.intercompany_transaction — bilateral IC billing events
-- ============================================================================
CREATE TABLE IF NOT EXISTS document.intercompany_transaction (
    id                          uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid            NOT NULL,
    code                        text            NOT NULL DEFAULT '',
    name                        text            NOT NULL DEFAULT '',
    company_code_id             uuid            NOT NULL,
    ic_txn_number               text            NOT NULL,
    source_company_code_id      uuid            NOT NULL,
    dest_company_code_id        uuid            NOT NULL,
    txn_type                    text            NOT NULL,
    document_date               date            NOT NULL,
    posting_date                date            NOT NULL,
    currency_code               character(3)    NOT NULL,
    amount                      numeric(18,4)   NOT NULL,
    agreement_id                uuid,
    transfer_price              numeric(18,4),
    arm_length_price            numeric(18,4),
    pricing_variance            numeric(18,4)   GENERATED ALWAYS AS (
                                    transfer_price - arm_length_price
                                ) STORED,
    base_currency_code          character(3)    NOT NULL,
    exchange_rate               numeric(18,10),
    base_amount                 numeric(18,4),
    source_je_id                uuid,
    dest_je_id                  uuid,
    mirror_txn_id               uuid,
    is_mirror                   boolean         NOT NULL DEFAULT false,
    match_status                text            NOT NULL DEFAULT 'UNMATCHED',
    matched_at                  timestamptz,
    discrepancy_amount          numeric(18,4),
    discrepancy_reason          text,
    netting_batch_id            uuid,
    fiscal_year                 smallint        NOT NULL,
    period_number               smallint,
    cost_center_id              uuid,
    profit_center_id            uuid,
    project_id                  uuid,
    site_id                     uuid,
    dimension_set_id            uuid,
    description                 text,
    tags                        jsonb           NOT NULL DEFAULT '[]'::jsonb,
    metadata                    jsonb           NOT NULL DEFAULT '{}'::jsonb,
    status                      text            NOT NULL DEFAULT 'draft',
    is_active                   boolean         GENERATED ALWAYS AS (
                                    status IN ('draft','created','posted','netted')
                                ) STORED,
    status_changed_at           timestamptz,
    status_changed_by           uuid,
    posted_at                   timestamptz,
    posted_by                   uuid,
    created_at                  timestamptz     NOT NULL DEFAULT now(),
    created_by                  uuid            NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT ict_pkey              PRIMARY KEY (id),
    CONSTRAINT ict_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT ict_tenant_number_uq  UNIQUE (tenant_id, company_code_id, ic_txn_number),
    CONSTRAINT ict_number_nonempty   CHECK (btrim(ic_txn_number) <> ''),
    CONSTRAINT ict_entity_chk        CHECK (source_company_code_id IS DISTINCT FROM dest_company_code_id),
    CONSTRAINT ict_type_chk          CHECK (txn_type IN (
        'RECHARGE','PURCHASE','SALE','LOAN_DRAWDOWN','LOAN_REPAYMENT',
        'ROYALTY','MANAGEMENT_FEE','COST_ALLOCATION','DIVIDEND','OTHER')),
    CONSTRAINT ict_doc_date_chk      CHECK (document_date <= posting_date),
    CONSTRAINT ict_amount_positive   CHECK (amount > 0),
    CONSTRAINT ict_match_status_chk  CHECK (match_status IN (
        'UNMATCHED','MATCHED','DISPUTED','PARTIALLY_MATCHED')),
    CONSTRAINT ict_status_chk        CHECK (status IN (
        'draft','created','posted','netted','settled','disputed','cancelled','reversed')),
    CONSTRAINT ict_no_self_mirror    CHECK (mirror_txn_id IS DISTINCT FROM id),
    CONSTRAINT ict_fx_rate_chk       CHECK (currency_code = base_currency_code OR exchange_rate IS NOT NULL),
    CONSTRAINT ict_period_chk        CHECK (period_number IS NULL OR period_number BETWEEN 1 AND 16)
);

COMMENT ON TABLE document.intercompany_transaction IS
    'IC billing event between two company codes. Dual-currency (transaction + base). '
    'pricing_variance GENERATED (transfer_price - arm_length_price). '
    'Mirror transactions auto-created on counterparty side (is_mirror = true). '
    'Status: draft → created → posted → netted → settled | disputed | reversed.';


-- ============================================================================
-- §ICA3  document.netting_batch — settlement netting header
-- ============================================================================
CREATE TABLE IF NOT EXISTS document.netting_batch (
    id                          uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid            NOT NULL,
    company_code_id             uuid            NOT NULL,
    batch_number                text            NOT NULL,
    company_code_a_id           uuid            NOT NULL,
    company_code_b_id           uuid            NOT NULL,
    batch_date                  date            NOT NULL,
    cut_off_date                date            NOT NULL,
    settlement_date             date,
    currency_code               character(3)    NOT NULL,
    gross_amount_a_to_b         numeric(18,4)   NOT NULL DEFAULT 0,
    gross_amount_b_to_a         numeric(18,4)   NOT NULL DEFAULT 0,
    gross_amount                numeric(18,4)   GENERATED ALWAYS AS (
                                    gross_amount_a_to_b + gross_amount_b_to_a
                                ) STORED,
    net_amount                  numeric(18,4)   NOT NULL DEFAULT 0,
    net_direction               text            NOT NULL DEFAULT 'ZERO',
    txn_count                   integer         NOT NULL DEFAULT 0,
    settlement_je_id            uuid,
    fiscal_year                 smallint        NOT NULL,
    period_number               smallint,
    idempotency_key             text,
    tags                        jsonb           NOT NULL DEFAULT '[]'::jsonb,
    metadata                    jsonb           NOT NULL DEFAULT '{}'::jsonb,
    status                      text            NOT NULL DEFAULT 'draft',
    is_active                   boolean         GENERATED ALWAYS AS (
                                    status IN ('draft','calculated','approved')
                                ) STORED,
    status_changed_at           timestamptz,
    status_changed_by           uuid,
    settled_at                  timestamptz,
    settled_by                  uuid,
    approved_at                 timestamptz,
    approved_by                 uuid,
    created_at                  timestamptz     NOT NULL DEFAULT now(),
    created_by                  uuid            NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT nb_pkey               PRIMARY KEY (id),
    CONSTRAINT nb_tenant_id_uq       UNIQUE (tenant_id, id),
    CONSTRAINT nb_tenant_number_uq   UNIQUE (tenant_id, company_code_id, batch_number),
    CONSTRAINT nb_number_nonempty    CHECK (btrim(batch_number) <> ''),
    CONSTRAINT nb_entity_chk         CHECK (company_code_a_id IS DISTINCT FROM company_code_b_id),
    CONSTRAINT nb_direction_chk      CHECK (net_direction IN ('A_TO_B','B_TO_A','ZERO')),
    CONSTRAINT nb_gross_a_nonneg     CHECK (gross_amount_a_to_b >= 0),
    CONSTRAINT nb_gross_b_nonneg     CHECK (gross_amount_b_to_a >= 0),
    CONSTRAINT nb_net_nonneg         CHECK (net_amount >= 0),
    CONSTRAINT nb_txn_count_nonneg   CHECK (txn_count >= 0),
    CONSTRAINT nb_cutoff_chk         CHECK (cut_off_date <= batch_date),
    CONSTRAINT nb_settlement_chk     CHECK (settlement_date IS NULL OR settlement_date >= batch_date),
    CONSTRAINT nb_status_chk         CHECK (status IN (
        'draft','calculated','approved','settled','cancelled')),
    CONSTRAINT nb_period_chk         CHECK (period_number IS NULL OR period_number BETWEEN 1 AND 16)
);

COMMENT ON TABLE document.netting_batch IS
    'Bilateral IC netting batch header. gross_amount GENERATED (a_to_b + b_to_a). '
    'net_amount = |a_to_b - b_to_a|; net_direction indicates payer. '
    'Status: draft → calculated → approved → settled | cancelled.';


-- ============================================================================
-- §ICA4  document.ic_elimination — consolidation elimination document
-- ============================================================================
CREATE TABLE IF NOT EXISTS document.ic_elimination (
    id                              uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                       uuid            NOT NULL,
    company_code_id                 uuid            NOT NULL,
    elimination_code                text            NOT NULL,
    source_company_code_id          uuid            NOT NULL,
    counterparty_company_code_id    uuid            NOT NULL,
    elimination_type                text            NOT NULL,
    consolidation_group             text            NOT NULL,
    book_id                         uuid            NOT NULL,
    fiscal_year                     smallint        NOT NULL,
    period_number                   smallint        NOT NULL,
    elimination_date                date            NOT NULL,
    posting_date                    date            NOT NULL,
    elimination_amount              numeric(18,4)   NOT NULL,
    currency_code                   character(3)    NOT NULL,
    functional_currency_code        character(3)    NOT NULL,
    exchange_rate                   numeric(18,10),
    functional_amount               numeric(18,4),
    line_count                      smallint        NOT NULL DEFAULT 0,
    ic_transaction_id               uuid,
    je_id                           uuid,
    reversal_je_id                  uuid,
    decision_score                  numeric(5,4),
    approval_route                  text            NOT NULL DEFAULT 'STANDARD',
    tags                            jsonb           NOT NULL DEFAULT '[]'::jsonb,
    metadata                        jsonb           NOT NULL DEFAULT '{}'::jsonb,
    status                          text            NOT NULL DEFAULT 'calculated',
    is_active                       boolean         GENERATED ALWAYS AS (
                                        status IN ('calculated','approved','posted')
                                    ) STORED,
    status_changed_at               timestamptz,
    status_changed_by               uuid,
    approved_at                     timestamptz,
    approved_by                     uuid,
    posted_at                       timestamptz,
    posted_by                       uuid,
    created_at                      timestamptz     NOT NULL DEFAULT now(),
    created_by                      uuid            NOT NULL,
    updated_at                      timestamptz,
    updated_by                      uuid,

    CONSTRAINT ice_pkey              PRIMARY KEY (id),
    CONSTRAINT ice_tenant_id_uq      UNIQUE (tenant_id, id),
    CONSTRAINT ice_tenant_code_uq    UNIQUE (tenant_id, company_code_id, elimination_code),
    CONSTRAINT ice_code_nonempty     CHECK (btrim(elimination_code) <> ''),
    CONSTRAINT ice_entity_chk        CHECK (source_company_code_id IS DISTINCT FROM counterparty_company_code_id),
    CONSTRAINT ice_type_chk          CHECK (elimination_type IN (
        'REVENUE_EXPENSE','RECEIVABLE_PAYABLE','INVENTORY_MARKUP',
        'IC_PROFIT','MINORITY_INTEREST','INVESTMENT','DIVIDEND','LOAN','OTHER')),
    CONSTRAINT ice_approval_chk      CHECK (approval_route IN ('AUTO','STANDARD','ENHANCED','MANUAL')),
    CONSTRAINT ice_score_chk         CHECK (decision_score IS NULL OR decision_score BETWEEN 0 AND 1),
    CONSTRAINT ice_amount_positive   CHECK (elimination_amount > 0),
    CONSTRAINT ice_date_chk          CHECK (elimination_date <= posting_date),
    CONSTRAINT ice_status_chk        CHECK (status IN (
        'calculated','approved','posted','reversed','rejected','cancelled')),
    CONSTRAINT ice_period_chk        CHECK (period_number BETWEEN 1 AND 16),
    CONSTRAINT ice_fx_rate_chk       CHECK (currency_code = functional_currency_code OR exchange_rate IS NOT NULL),
    CONSTRAINT ice_no_self_je        CHECK (je_id IS DISTINCT FROM reversal_je_id)
);

COMMENT ON TABLE document.ic_elimination IS
    'IC elimination operational document. Produces a JE (source_doc_type = ic_elimination). '
    'AI-assisted: decision_score (0-1) drives approval_route (AUTO/STANDARD/ENHANCED/MANUAL). '
    'Children: ledger.ic_elimination_line. '
    'Status: calculated → approved → posted → reversed | rejected | cancelled.';
