-- ============================================================================
-- governance/01_tables.sql
-- Concept: Period Close & Compliance — cycles, tasks, certifications, legal holds
-- Depends on: 04_tables/003b_master_finance.sql, 04_tables/002_control.sql
-- Governance schema tables.
-- ============================================================================

-- ============================================================================
-- §11  governance.comment_moderation — aggregated moderation state
-- ============================================================================
CREATE TABLE IF NOT EXISTS governance.comment_moderation (
    -- Identity
    id              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id       uuid        NOT NULL,

    -- Subject (one row per comment)
    context_type    text        NOT NULL,
    comment_id      uuid        NOT NULL,

    -- Moderation state (mutable — UPSERT on flag events)
    is_hidden       boolean     NOT NULL DEFAULT false,
    hidden_reason   text,
    hidden_at       timestamptz,
    hidden_by       uuid,

    -- Counters (maintained by trigger)
    flag_count      integer     NOT NULL DEFAULT 0,
    last_flagged_at timestamptz,

    -- Audit
    created_at      timestamptz NOT NULL DEFAULT now(),
    created_by      uuid        NOT NULL,
    updated_at      timestamptz,
    updated_by      uuid,

    CONSTRAINT gmod_pkey        PRIMARY KEY (id),
    CONSTRAINT gmod_unique      UNIQUE (tenant_id, context_type, comment_id),
    CONSTRAINT gmod_count_chk   CHECK (flag_count >= 0),
    CONSTRAINT gmod_hidden_chk  CHECK (
        (is_hidden = false AND hidden_at IS NULL AND hidden_by IS NULL)
        OR (is_hidden = true AND hidden_at IS NOT NULL AND hidden_by IS NOT NULL)
    )
    -- context_type: 09_triggers — control.trg_validate_lookup_columns('master.comment_type')
);

COMMENT ON TABLE  governance.comment_moderation IS
    'ARCHETYPE=C;SCOPE=T. Aggregated moderation state per comment. One row per (tenant, context_type, comment_id). '
    'UPSERT pattern — updated by trigger on event.comment_flag changes. '
    'Kept separate from event.comment_flag for O(1) render-time moderation checks. '
    'context_type in master.comment_type lookup.';
COMMENT ON COLUMN governance.comment_moderation.flag_count IS
    'Total accumulated flags for this comment across all reporters. '
    'Maintained by trg_sync_comment_moderation trigger on event.comment_flag.';


-- ============================================================================
-- §BPS  governance.book_period_status — per-book period gate
-- ============================================================================
-- Same period can be open in STAT but closed in TAX.
-- Posting checks BOTH fiscal_period.status AND book_period_status.status.
-- ============================================================================

CREATE TABLE IF NOT EXISTS governance.book_period_status (
    -- Identity
    id               uuid         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid         NOT NULL,

    -- Company scope (Tier 1 UUID)
    company_code_id  uuid         NOT NULL,

    -- Book + Period
    book_id          uuid         NOT NULL,
    fiscal_year      smallint     NOT NULL,
    period_number    smallint     NOT NULL,

    -- Close timestamps
    opened_at        timestamptz,
    opened_by        uuid,
    soft_closed_at   timestamptz,
    soft_closed_by   uuid,
    hard_closed_at   timestamptz,
    hard_closed_by   uuid,

    -- Reopen tracking
    reopen_count     smallint     NOT NULL DEFAULT 0,
    last_reopen_reason text,

    -- Metadata
    metadata         jsonb        NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    status           text         NOT NULL DEFAULT 'future',
    is_active        boolean      GENERATED ALWAYS AS (status IN ('open', 'soft_close')) STORED,
    status_changed_at timestamptz,
    status_changed_by uuid,

    -- Audit
    created_at       timestamptz  NOT NULL DEFAULT now(),
    created_by       uuid         NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,

    CONSTRAINT book_period_status_pkey PRIMARY KEY (id),
    CONSTRAINT book_period_status_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT book_period_status_composite_uq
        UNIQUE (tenant_id, company_code_id, book_id, fiscal_year, period_number),
    CONSTRAINT bps_period_range_chk CHECK (period_number BETWEEN 0 AND 16),
    CONSTRAINT bps_reopen_count_chk CHECK (reopen_count >= 0)
);

COMMENT ON TABLE governance.book_period_status IS
    'ARCHETYPE=B;SCOPE=T. Non-standard active-set: is_active GENERATED AS (status IN (''open'', ''soft_close'')). Per-book period gate. Same period can be open in STAT but closed in TAX. '
    'Posting requires BOTH fiscal_period.status AND book_period_status.status '
    'to allow posting.';


-- ============================================================================
-- GENERIC GOVERNANCE CYCLE MODEL
-- ============================================================================
-- 11 tables implementing a reusable cycle-based governance framework.
-- Supports ordered phases, parallel tasks via intra-cycle DAG, hybrid JSONB
-- domain_data, cross-cycle dependencies, deviation carryforward, and
-- external approval integration via document.workflow_request.
--
-- Lifecycle state machines:
--   cycle_run:    PLANNED → OPEN → IN_PROGRESS → PHASE_GATE → COMPLETED → CERTIFIED → CLOSED
--   cycle_task:   PENDING → IN_PROGRESS → COMPLETED | FAILED | DEVIATED | BLOCKED
--   cycle_deviation: OPEN → PENDING_APPROVAL → APPROVED → APPLIED → RESOLVED | ACCEPTED
--   cycle_certification: DRAFT → PENDING_REVIEW → CERTIFIED → ATTESTED → SUPERSEDED | REVOKED


-- ============================================================================
-- §CT  governance.cycle_type — cycle type definitions (root entity)
-- ============================================================================
CREATE TABLE IF NOT EXISTS governance.cycle_type (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,

    -- Definition
    type_code               varchar(30) NOT NULL,
    type_name               varchar(150) NOT NULL,
    description             text,
    frequency               varchar(20) NOT NULL DEFAULT 'MONTHLY',
    domain                  varchar(30) NOT NULL,
    clean_cycle_policy      jsonb       NOT NULL DEFAULT '{}'::jsonb,
    approval_policies       jsonb                DEFAULT '{}'::jsonb,
    run_data_schema         jsonb,
    task_data_schema        jsonb,

    -- Lifecycle
    is_active               boolean     NOT NULL DEFAULT true,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT ctyp_pkey           PRIMARY KEY (id),
    CONSTRAINT ctyp_code_uq        UNIQUE (tenant_id, type_code),
    CONSTRAINT ctyp_tenant_id_uq   UNIQUE (tenant_id, id),
    CONSTRAINT ctyp_frequency_chk  CHECK (
        frequency IN ('DAILY','WEEKLY','BIWEEKLY','SEMI_MONTHLY',
                      'MONTHLY','QUARTERLY','SEMI_ANNUAL','ANNUAL','AD_HOC')),
    CONSTRAINT ctyp_domain_chk     CHECK (
        domain IN ('FINANCE','HR','INVENTORY','WAREHOUSE','PROCUREMENT',
                   'PROJECT','SUPPLIER','SAFETY','COMPLIANCE','CUSTOM'))
);

COMMENT ON TABLE governance.cycle_type IS
    'ARCHETYPE=C;SCOPE=T;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (no status/is_active GENERATED). Governance cycle type definitions. Root entity for the cycle model. '
    'Each type defines phases, task categories, templates, and policies.';


-- ============================================================================
-- §CP  governance.cycle_phase — ordered phases per cycle type
-- ============================================================================
CREATE TABLE IF NOT EXISTS governance.cycle_phase (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,

    -- Parent
    cycle_type_id           uuid        NOT NULL,

    -- Definition
    phase_code              varchar(30) NOT NULL,
    phase_name              varchar(100) NOT NULL,
    sort_order              smallint    NOT NULL,
    description             text,
    is_gate_enforced        boolean     NOT NULL DEFAULT true,
    min_readiness_pct       numeric(5,2),
    target_hours_from_start integer,

    -- Lifecycle
    is_active               boolean     NOT NULL DEFAULT true,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT cph_pkey              PRIMARY KEY (id),
    CONSTRAINT cph_code_uq           UNIQUE (tenant_id, cycle_type_id, phase_code),
    CONSTRAINT cph_order_uq          UNIQUE (tenant_id, cycle_type_id, sort_order),
    CONSTRAINT cph_tenant_type_id_uq UNIQUE (tenant_id, cycle_type_id, id),
    CONSTRAINT cph_type_fk           FOREIGN KEY (tenant_id, cycle_type_id)
        REFERENCES governance.cycle_type (tenant_id, id)
);

COMMENT ON TABLE governance.cycle_phase IS
    'ARCHETYPE=C;SCOPE=T;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (no status/is_active GENERATED). Ordered phases within a cycle type. sort_order determines sequence. '
    'Gates can be enforced per phase with min_readiness_pct thresholds.';


-- ============================================================================
-- §TCAT  governance.cycle_task_category — task categories per cycle type
-- ============================================================================
CREATE TABLE IF NOT EXISTS governance.cycle_task_category (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,

    -- Parent
    cycle_type_id           uuid        NOT NULL,

    -- Definition
    category_code           varchar(30) NOT NULL,
    category_name           varchar(100) NOT NULL,
    sort_order              smallint    NOT NULL DEFAULT 0,
    color_code              varchar(7),

    -- Lifecycle
    is_active               boolean     NOT NULL DEFAULT true,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT ctcat_pkey              PRIMARY KEY (id),
    CONSTRAINT ctcat_code_uq           UNIQUE (tenant_id, cycle_type_id, category_code),
    CONSTRAINT ctcat_tenant_type_id_uq UNIQUE (tenant_id, cycle_type_id, id),
    CONSTRAINT ctcat_type_fk           FOREIGN KEY (tenant_id, cycle_type_id)
        REFERENCES governance.cycle_type (tenant_id, id)
);

COMMENT ON TABLE governance.cycle_task_category IS
    'ARCHETYPE=C;SCOPE=T;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (no status/is_active GENERATED). Registered task categories per cycle type (e.g. SUBLEDGER, TAX, CASH). '
    'FK-enforced on cycle_task_template.category_id. '
    'P2-FIX: updated_at/updated_by added — category metadata (name, sort, color) is mutable.';


-- ============================================================================
-- §TPL  governance.cycle_task_template — reusable task definitions
-- ============================================================================
CREATE TABLE IF NOT EXISTS governance.cycle_task_template (
    -- Identity
    id                       uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid        NOT NULL,
    entity_code              varchar(20) NOT NULL,

    -- Parents
    cycle_type_id            uuid        NOT NULL,
    phase_id                 uuid        NOT NULL,
    category_id              uuid        NOT NULL,

    -- Definition
    task_code                varchar(50) NOT NULL,
    task_name                varchar(150) NOT NULL,
    description              text,
    completion_mode          varchar(10) NOT NULL DEFAULT 'MANUAL',
    system_check_handler     varchar(100),
    is_mandatory             boolean     NOT NULL DEFAULT true,
    is_waivable              boolean     NOT NULL DEFAULT false,
    severity                 varchar(10),
    sort_order               smallint    NOT NULL DEFAULT 0,
    sla_hours                integer,
    estimated_duration_min   integer,
    reminder_lead_hours      integer,
    default_owner_role       text,
    default_owner_user_id    uuid,
    is_auto_start_when_ready boolean     NOT NULL DEFAULT false,
    orchestration_group      text,
    blueprint_filter         varchar(5)[],

    -- Lifecycle
    is_active                boolean     NOT NULL DEFAULT true,

    -- Audit
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid        NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,

    CONSTRAINT ctpl_pkey               PRIMARY KEY (id),
    CONSTRAINT ctpl_code_uq            UNIQUE (tenant_id, entity_code, cycle_type_id, task_code),
    CONSTRAINT ctpl_type_fk            FOREIGN KEY (tenant_id, cycle_type_id)
        REFERENCES governance.cycle_type (tenant_id, id),
    CONSTRAINT ctpl_phase_fk           FOREIGN KEY (tenant_id, cycle_type_id, phase_id)
        REFERENCES governance.cycle_phase (tenant_id, cycle_type_id, id),
    CONSTRAINT ctpl_category_fk        FOREIGN KEY (tenant_id, cycle_type_id, category_id)
        REFERENCES governance.cycle_task_category (tenant_id, cycle_type_id, id),
    CONSTRAINT ctpl_completion_mode_chk CHECK (completion_mode IN ('MANUAL','SYSTEM','HYBRID')),
    CONSTRAINT ctpl_system_handler_chk  CHECK (completion_mode = 'MANUAL' OR system_check_handler IS NOT NULL),
    CONSTRAINT ctpl_severity_chk        CHECK (severity IS NULL OR severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
    CONSTRAINT ctpl_sla_positive_chk    CHECK (sla_hours IS NULL OR sla_hours > 0),
    CONSTRAINT ctpl_dur_positive_chk    CHECK (estimated_duration_min IS NULL OR estimated_duration_min > 0)
);

COMMENT ON TABLE governance.cycle_task_template IS
    'ARCHETYPE=C;SCOPE=T;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (no status/is_active GENERATED). Reusable task definitions within a cycle type. Templates are materialized '
    'into cycle_task instances when a cycle_run is opened.';


-- ============================================================================
-- §TDEP  governance.cycle_task_dependency — intra-cycle DAG between templates
-- ============================================================================
CREATE TABLE IF NOT EXISTS governance.cycle_task_dependency (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,

    -- Scope
    cycle_type_id           uuid        NOT NULL,
    entity_code             varchar(20) NOT NULL,

    -- Edge
    predecessor_template_id uuid        NOT NULL REFERENCES governance.cycle_task_template(id),
    successor_template_id   uuid        NOT NULL REFERENCES governance.cycle_task_template(id),
    dependency_type         varchar(20) NOT NULL DEFAULT 'FINISH_TO_START',
    is_hard                 boolean     NOT NULL DEFAULT true,

    -- Lifecycle
    is_active               boolean     NOT NULL DEFAULT true,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT ctdep_pkey          PRIMARY KEY (id),
    CONSTRAINT ctdep_no_self_chk   CHECK (predecessor_template_id <> successor_template_id),
    CONSTRAINT ctdep_dep_type_chk  CHECK (dependency_type IN ('FINISH_TO_START','FINISH_TO_FINISH')),
    CONSTRAINT ctdep_edge_uq       UNIQUE (tenant_id, cycle_type_id, entity_code, predecessor_template_id, successor_template_id),
    CONSTRAINT ctdep_type_fk       FOREIGN KEY (tenant_id, cycle_type_id)
        REFERENCES governance.cycle_type (tenant_id, id)
);

COMMENT ON TABLE governance.cycle_task_dependency IS
    'ARCHETYPE=C;SCOPE=T;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (no status/is_active GENERATED). Intra-cycle directed acyclic graph (DAG) between task templates. '
    'Cycle detection enforced by trg_check_dep_cycle trigger.';


-- ============================================================================
-- §CRUN  governance.cycle_run — runtime cycle instance
-- ============================================================================
CREATE TABLE IF NOT EXISTS governance.cycle_run (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    entity_code             varchar(20) NOT NULL,

    -- Type + Period
    cycle_type_id           uuid        NOT NULL,
    fiscal_year             smallint    NOT NULL,
    period_number           smallint    NOT NULL,
    run_number              smallint    NOT NULL DEFAULT 1,

    -- Lifecycle
    status                  varchar(30) NOT NULL DEFAULT 'PLANNED',
    current_phase_id        uuid,

    -- Dates
    period_end_date         date        NOT NULL,
    cycle_start_date        date        NOT NULL,
    cycle_target_date       date        NOT NULL,
    phase_targets           jsonb       NOT NULL DEFAULT '[]'::jsonb,

    -- Execution timestamps
    started_at              timestamptz,
    started_by              uuid,
    completed_at            timestamptz,
    completed_by            uuid,
    certified_at            timestamptz,
    certified_by            uuid,
    cancelled_at            timestamptz,
    cancelled_by            uuid,

    -- Domain
    notes                   text,
    domain_data             jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT crun_pkey           PRIMARY KEY (id),
    CONSTRAINT crun_natural_uq     UNIQUE (tenant_id, entity_code, cycle_type_id, fiscal_year, period_number, run_number),
    CONSTRAINT crun_tenant_id_uq   UNIQUE (tenant_id, id),
    CONSTRAINT crun_type_fk        FOREIGN KEY (tenant_id, cycle_type_id)
        REFERENCES governance.cycle_type (tenant_id, id),
    CONSTRAINT crun_phase_fk       FOREIGN KEY (tenant_id, cycle_type_id, current_phase_id)
        REFERENCES governance.cycle_phase (tenant_id, cycle_type_id, id),
    CONSTRAINT crun_status_chk     CHECK (
        status IN ('PLANNED','OPEN','IN_PROGRESS','PHASE_GATE','COMPLETED',
                   'CERTIFIED','CLOSED','REOPENED','CANCELLED')),
    CONSTRAINT crun_dates_chk      CHECK (cycle_start_date <= cycle_target_date)
);

COMMENT ON TABLE governance.cycle_run IS
    'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Runtime cycle instance. One run per (entity, type, fiscal_year, period, run_number). '
    'domain_data validated against cycle_type.run_data_schema by trigger.';
COMMENT ON COLUMN governance.cycle_run.domain_data IS
    'Extensible JSONB payload validated against cycle_type.run_data_schema by '
    'governance.trg_validate_domain_data(). Holds cycle-specific context such as '
    'reporting_currency, consolidation_scope, and special instructions.';


-- ============================================================================
-- §CTSK  governance.cycle_task — materialized task instance
-- ============================================================================
CREATE TABLE IF NOT EXISTS governance.cycle_task (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    entity_code             varchar(20) NOT NULL,

    -- Parents
    cycle_run_id            uuid        NOT NULL,
    template_id             uuid        NOT NULL REFERENCES governance.cycle_task_template(id),
    phase_id                uuid        NOT NULL,
    category_id             uuid        NOT NULL,

    -- Definition (copied from template)
    task_code               varchar(50) NOT NULL,
    is_mandatory            boolean     NOT NULL DEFAULT true,

    -- Assignment
    assigned_to             uuid,
    assigned_role           text,

    -- Lifecycle
    status                  varchar(20) NOT NULL DEFAULT 'PENDING',
    due_at                  timestamptz,

    -- Completion
    completed_by            uuid,
    completed_at            timestamptz,
    completion_notes        text,
    evidence_payload        jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Failure
    failure_reason          text,
    failed_at               timestamptz,

    -- Runtime
    execution_meta          jsonb       NOT NULL DEFAULT '{}'::jsonb,
    domain_data             jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT ctsk_pkey              PRIMARY KEY (id),
    CONSTRAINT ctsk_natural_uq        UNIQUE (tenant_id, cycle_run_id, task_code),
    CONSTRAINT ctsk_run_fk            FOREIGN KEY (tenant_id, cycle_run_id)
        REFERENCES governance.cycle_run (tenant_id, id),
    CONSTRAINT ctsk_status_chk        CHECK (status IN ('PENDING','IN_PROGRESS','COMPLETED','BLOCKED','FAILED','DEVIATED')),
    CONSTRAINT ctsk_completion_chk    CHECK (status <> 'COMPLETED' OR (completed_by IS NOT NULL AND completed_at IS NOT NULL)),
    CONSTRAINT ctsk_completion_cln_chk CHECK (status = 'COMPLETED' OR completed_by IS NULL),
    CONSTRAINT ctsk_failure_chk       CHECK (status <> 'FAILED' OR (failure_reason IS NOT NULL AND failed_at IS NOT NULL)),
    CONSTRAINT ctsk_failure_cln_chk   CHECK (status = 'FAILED' OR failure_reason IS NULL)
);

COMMENT ON TABLE governance.cycle_task IS
    'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Materialized task instance within a cycle run. Created from templates by '
    'governance.materialize_cycle_tasks(). domain_data validated by trigger.';
COMMENT ON COLUMN governance.cycle_task.domain_data IS
    'Extensible JSONB payload validated against cycle_task_template.task_data_schema. '
    'Holds task-specific context: checklist items, calculation parameters, scope filters.';
COMMENT ON COLUMN governance.cycle_task.evidence_payload IS
    'Structured proof of task completion. Contents vary by task_code: '
    'e.g. reconciliation_report, sign-off screenshots, balance confirmations. '
    'Validated by governance.trg_validate_domain_data() if evidence_schema is set on template.';
COMMENT ON COLUMN governance.cycle_task.execution_meta IS
    'Runtime execution metadata: retry counts, worker_id, timing metrics, error traces. '
    'Written by the task execution engine, not by users.';


-- ============================================================================
-- §CDEV  governance.cycle_deviation — unified exception/override/waiver
-- ============================================================================
CREATE TABLE IF NOT EXISTS governance.cycle_deviation (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    entity_code             varchar(20) NOT NULL,

    -- Parent
    cycle_run_id            uuid        NOT NULL,

    -- Classification
    deviation_type          varchar(20) NOT NULL,
    scope                   varchar(20) NOT NULL DEFAULT 'TASK',

    -- Scope references
    task_id                 uuid        REFERENCES governance.cycle_task(id),
    task_template_id        uuid        REFERENCES governance.cycle_task_template(id),
    task_code               varchar(50),
    task_category           varchar(30),
    deviation_code          varchar(50),

    -- Description
    title                   varchar(200) NOT NULL,
    description             text,

    -- Reason
    reason_code             varchar(30) NOT NULL,
    reason_subcode          varchar(30),
    reason_detail           text,

    -- Impact
    severity                varchar(20) NOT NULL DEFAULT 'MEDIUM',
    impact_type             varchar(30) NOT NULL DEFAULT 'PROCESS',
    impact_amount           numeric(18,4),
    impact_currency         varchar(3),

    -- Lifecycle
    status                  varchar(20) NOT NULL DEFAULT 'OPEN',
    applies_to_phase_id     uuid        REFERENCES governance.cycle_phase(id),

    -- Workflow approval
    workflow_request_id     uuid,

    -- Actors
    requested_by            uuid        NOT NULL,
    requested_at            timestamptz NOT NULL DEFAULT now(),
    decision_notes          text,
    assigned_to             uuid,
    assigned_at             timestamptz,
    resolved_by             uuid,
    resolved_at             timestamptz,
    resolution_notes        text,
    revocation_reason       text,

    -- Evidence
    evidence_payload        jsonb       NOT NULL DEFAULT '{}'::jsonb,

    -- Effectivity
    effective_from          date        NOT NULL DEFAULT CURRENT_DATE,
    effective_to            date,

    -- Carryforward lineage
    carried_from_id         uuid        REFERENCES governance.cycle_deviation(id),
    carry_count             smallint    NOT NULL DEFAULT 0,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT cdev_pkey              PRIMARY KEY (id),
    CONSTRAINT cdev_run_fk            FOREIGN KEY (tenant_id, cycle_run_id)
        REFERENCES governance.cycle_run (tenant_id, id),
    CONSTRAINT cdev_type_chk          CHECK (deviation_type IN ('EXCEPTION','OVERRIDE','WAIVER')),
    CONSTRAINT cdev_scope_chk         CHECK (scope IN ('TASK','CATEGORY','GATE','PERIOD')),
    CONSTRAINT cdev_severity_chk      CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
    CONSTRAINT cdev_impact_type_chk   CHECK (impact_type IN ('TASK_BLOCKER','GATE_BLOCKER','DATA_QUALITY','PROCESS','EXTERNAL','IMMATERIAL')),
    CONSTRAINT cdev_status_chk        CHECK (
        status IN ('OPEN','PENDING_APPROVAL','APPROVED','REJECTED','APPLIED',
                   'RESOLVED','ACCEPTED','DEFERRED','EXPIRED','REVOKED','CARRIED_FORWARD')),
    CONSTRAINT cdev_cat_ref_chk       CHECK (scope <> 'CATEGORY' OR task_category IS NOT NULL),
    CONSTRAINT cdev_decision_chk      CHECK (status NOT IN ('APPROVED','REJECTED') OR decision_notes IS NOT NULL),
    CONSTRAINT cdev_resolution_chk    CHECK (status NOT IN ('RESOLVED','ACCEPTED') OR resolution_notes IS NOT NULL),
    CONSTRAINT cdev_task_scope_chk    CHECK (scope <> 'TASK' OR task_id IS NOT NULL OR task_template_id IS NOT NULL),
    CONSTRAINT cdev_gate_scope_chk    CHECK (scope <> 'GATE' OR applies_to_phase_id IS NOT NULL)
);

COMMENT ON TABLE governance.cycle_deviation IS
    'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Unified exception/override/waiver within a cycle run. Supports approval '
    'workflow via document.workflow_request, carryforward lineage, and '
    'scope-specific integrity constraints.';
COMMENT ON COLUMN governance.cycle_deviation.evidence_payload IS
    'Structured proof supporting the deviation: exception reports, override justifications, '
    'waiver approvals. Validated by governance.trg_validate_domain_data() if schema defined.';


-- ============================================================================
-- §CCERT  governance.cycle_certification — formal sign-off / attestation
-- ============================================================================
CREATE TABLE IF NOT EXISTS governance.cycle_certification (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    entity_code             varchar(20) NOT NULL,

    -- Parent
    cycle_run_id            uuid        NOT NULL,

    -- Definition
    cert_code               varchar(40) NOT NULL,
    cert_version            smallint    NOT NULL DEFAULT 1,
    cert_type               varchar(20) NOT NULL DEFAULT 'STANDARD',

    -- Lifecycle
    status                  varchar(20) NOT NULL DEFAULT 'DRAFT',
    content_hash            varchar(64),
    snapshot_payload        jsonb,

    -- Workflow approval
    workflow_request_id     uuid,

    -- Review
    controller_notes        text,
    attestation_notes       text,

    -- Actors
    certified_by            uuid,
    certified_at            timestamptz,
    attested_by             uuid,
    attested_at             timestamptz,

    -- Supersession
    superseded_by_id        uuid        REFERENCES governance.cycle_certification(id),
    supersession_reason     text,
    revocation_reason       text,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT ccert_pkey          PRIMARY KEY (id),
    CONSTRAINT ccert_natural_uq    UNIQUE (tenant_id, cycle_run_id, cert_code, cert_version),
    CONSTRAINT ccert_run_fk        FOREIGN KEY (tenant_id, cycle_run_id)
        REFERENCES governance.cycle_run (tenant_id, id),
    CONSTRAINT ccert_type_chk      CHECK (cert_type IN ('STANDARD','WITH_EXCEPTIONS','QUALIFIED','INTERIM')),
    CONSTRAINT ccert_status_chk    CHECK (status IN ('DRAFT','PENDING_REVIEW','CERTIFIED','ATTESTED','SUPERSEDED','REVOKED'))
);

COMMENT ON TABLE governance.cycle_certification IS
    'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Formal sign-off and attestation within a cycle run. Supports versioning, '
    'supersession, content hashing, and external approval workflow.';


-- ============================================================================
-- §CXDEP  governance.cycle_cross_dependency — phase-to-phase across types
-- ============================================================================
CREATE TABLE IF NOT EXISTS governance.cycle_cross_dependency (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,

    -- Predecessor
    predecessor_type_id     uuid        NOT NULL,
    predecessor_phase_id    uuid        NOT NULL,

    -- Successor
    successor_type_id       uuid        NOT NULL,
    successor_phase_id      uuid        NOT NULL,

    -- Config
    is_hard                 boolean     NOT NULL DEFAULT true,
    is_active               boolean     NOT NULL DEFAULT true,
    description             text,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT cxdep_pkey          PRIMARY KEY (id),
    CONSTRAINT cxdep_edge_uq       UNIQUE (tenant_id, predecessor_type_id, predecessor_phase_id, successor_type_id, successor_phase_id),
    CONSTRAINT cxdep_no_self_chk   CHECK (predecessor_type_id <> successor_type_id OR predecessor_phase_id <> successor_phase_id),
    CONSTRAINT cxdep_pred_phase_fk FOREIGN KEY (tenant_id, predecessor_type_id, predecessor_phase_id)
        REFERENCES governance.cycle_phase (tenant_id, cycle_type_id, id),
    CONSTRAINT cxdep_succ_phase_fk FOREIGN KEY (tenant_id, successor_type_id, successor_phase_id)
        REFERENCES governance.cycle_phase (tenant_id, cycle_type_id, id)
);

COMMENT ON TABLE governance.cycle_cross_dependency IS
    'ARCHETYPE=C;SCOPE=T;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (no status/is_active GENERATED). Phase-to-phase dependencies across different cycle types. Used by '
    'governance.check_cross_cycle_gate() to block successor phase entry. '
    'P2-FIX: updated_at/updated_by added — is_active and description are mutable.';


-- ============================================================================
-- §CCFR  governance.cycle_carryforward_rule — carryforward config per type
-- ============================================================================
CREATE TABLE IF NOT EXISTS governance.cycle_carryforward_rule (
    -- Identity
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,

    -- Parent
    cycle_type_id           uuid        NOT NULL,

    -- Rule
    deviation_type          varchar(20) NOT NULL,
    action                  varchar(20) NOT NULL,
    max_carry_count         smallint,
    escalate_after_carries  smallint,
    description             text,

    -- Lifecycle
    is_active               boolean     NOT NULL DEFAULT true,

    -- Audit
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT ccfr_pkey           PRIMARY KEY (id),
    CONSTRAINT ccfr_rule_uq        UNIQUE (tenant_id, cycle_type_id, deviation_type),
    CONSTRAINT ccfr_type_fk        FOREIGN KEY (tenant_id, cycle_type_id)
        REFERENCES governance.cycle_type (tenant_id, id),
    CONSTRAINT ccfr_dev_type_chk   CHECK (deviation_type IN ('EXCEPTION','OVERRIDE','WAIVER')),
    CONSTRAINT ccfr_action_chk     CHECK (action IN ('FORCE_CLOSE','AUTO_CARRY','EXPIRE')),
    CONSTRAINT ccfr_max_count_chk  CHECK (max_carry_count IS NULL OR max_carry_count > 0)
);

COMMENT ON TABLE governance.cycle_carryforward_rule IS
    'ARCHETYPE=C;SCOPE=T;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (no status/is_active GENERATED). Carryforward policy per cycle type and deviation type. Controls whether '
    'open deviations are force-closed, auto-carried, or expired at cycle boundary. '
    'P2-FIX: updated_at/updated_by added — rule config (action, thresholds) is mutable.';


-- =============================================================================
-- §RP  governance.report_pack — Phase 4.4 report delivery
-- =============================================================================
-- Tracks generated report packs for governance cycles.
-- Each row represents a requested report bundle for a cycle run.
-- Files are stored in object storage (S3/MinIO).
-- The download endpoint generates a time-limited presigned URL from storage_key.
--
-- Phase 4.4 delivery contract (A12):
--   GET /api/governance/report-packs/:id/download → 302 redirect to presigned URL
--   Initial implementation uses HTML stub (format='html').
--   Upgrades to PDF format after Phase 5.1 rendering pipeline ships.

CREATE TABLE IF NOT EXISTS governance.report_pack (
    -- Identity
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,

    -- Subject
    cycle_run_id        uuid        NOT NULL,

    -- Report spec
    report_type         text        NOT NULL DEFAULT 'cycle_summary',
    format              text        NOT NULL DEFAULT 'html',

    -- Generation status
    status              text        NOT NULL DEFAULT 'pending',

    -- Storage
    storage_key         text,               -- S3/MinIO object key; NULL until generated
    file_size_bytes     bigint,
    content_type        text        NOT NULL DEFAULT 'text/html',

    -- Generation metadata
    generated_at        timestamptz,
    error_message       text,

    -- Audit
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT rp_pkey          PRIMARY KEY (id),
    CONSTRAINT rp_tenant_uq     UNIQUE (tenant_id, id),
    CONSTRAINT rp_status_chk    CHECK (status IN ('pending', 'generating', 'ready', 'failed')),
    CONSTRAINT rp_format_chk    CHECK (format IN ('html', 'pdf', 'xlsx')),
    CONSTRAINT rp_type_chk      CHECK (report_type IN (
        'cycle_summary', 'deviation_summary', 'certification_summary',
        'task_status', 'compliance_dashboard'
    )),
    CONSTRAINT rp_storage_chk   CHECK (
        (status IN ('pending', 'generating', 'failed')) OR storage_key IS NOT NULL
    )
);

COMMENT ON TABLE governance.report_pack IS
    'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Generated report bundle for a governance cycle run. '
    'storage_key = S3/MinIO object key populated after generation. '
    'Download via GET /governance/report-packs/:id/download → presigned URL. '
    'Phase 4.4: HTML stub. Upgrades to PDF after Phase 5.1 renderer ships.';
COMMENT ON COLUMN governance.report_pack.storage_key IS
    'S3/MinIO object key. Format: reports/{tenantId}/{cycleRunId}/{id}.{format}. '
    'NULL while status is pending/generating/failed.';
COMMENT ON COLUMN governance.report_pack.format IS
    'Output format. html (Phase 4.4 stub), pdf (Phase 5.1+), xlsx (optional).';


-- ============================================================================
-- §CCERT-IMM  Certification snapshot immutability (Phase 6 hardening)
-- ============================================================================
-- Once a cycle_certification reaches CERTIFIED, ATTESTED, or SUPERSEDED status,
-- snapshot_payload and content_hash are frozen. Any UPDATE to those columns
-- raises an exception — create a superseding certification instead.
-- The status column may still advance (CERTIFIED → ATTESTED → SUPERSEDED);
-- only the evidence payload columns are locked.
-- ============================================================================

CREATE OR REPLACE FUNCTION governance.trg_certification_snapshot_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.status IN ('CERTIFIED', 'ATTESTED', 'SUPERSEDED') THEN
        IF OLD.snapshot_payload IS DISTINCT FROM NEW.snapshot_payload THEN
            RAISE EXCEPTION
                'governance.cycle_certification.snapshot_payload is immutable once '
                'status = %. Create a superseding certification instead.',
                OLD.status
            USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;
        IF OLD.content_hash IS DISTINCT FROM NEW.content_hash THEN
            RAISE EXCEPTION
                'governance.cycle_certification.content_hash is immutable once '
                'status = %.',
                OLD.status
            USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ccert_snapshot_immutable ON governance.cycle_certification;
CREATE TRIGGER trg_ccert_snapshot_immutable
    BEFORE UPDATE ON governance.cycle_certification
    FOR EACH ROW EXECUTE FUNCTION governance.trg_certification_snapshot_immutable();

COMMENT ON FUNCTION governance.trg_certification_snapshot_immutable() IS
    'Prevents modification of snapshot_payload and content_hash once a '
    'cycle_certification has reached CERTIFIED, ATTESTED, or SUPERSEDED. '
    'Evidence integrity: once signed off the audit evidence is frozen in place.';


-- ============================================================================
-- §LH  governance.legal_hold — legal hold registry
-- ============================================================================
-- Active holds block partition archive workers from detaching / moving
-- partitions to cold storage. The archive worker cross-references
-- governance.legal_hold before any DETACH CONCURRENTLY operation.
--
-- Lifecycle:
--   legal_hold.status: active → released | expired

CREATE TABLE IF NOT EXISTS governance.legal_hold (
    -- Identity
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,

    -- Hold definition
    hold_name           varchar(200) NOT NULL,
    hold_code           varchar(60)  NOT NULL,           -- slugified, used in UI + API
    description         text,
    custodian_id        uuid         NOT NULL,           -- principal_id of hold owner

    -- Scope (at least one scope dimension must be set)
    scope_entity_type   varchar(50),                     -- e.g. 'journal_entry', NULL = all types
    scope_entity_id_lo  uuid,                            -- optional range start (entity id)
    scope_entity_id_hi  uuid,                            -- optional range end  (entity id)
    scope_date_from     timestamptz,                     -- inclusive start of time range
    scope_date_to       timestamptz,                     -- inclusive end of time range
    scope_log_schemas   text[],                          -- NULL = all log schemas; otherwise ['log','audit']

    -- Lifecycle
    status              text         NOT NULL DEFAULT 'active',

    -- Effectivity
    effective_from      timestamptz  NOT NULL DEFAULT now(),
    effective_to        timestamptz,                     -- NULL = indefinite

    -- Release
    release_date        timestamptz,
    release_reason      text,
    released_by         uuid,

    -- Audit
    created_at          timestamptz  NOT NULL DEFAULT now(),
    created_by          uuid         NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT lh_pkey          PRIMARY KEY (id),
    CONSTRAINT lh_tenant_uq     UNIQUE (tenant_id, id),
    CONSTRAINT lh_code_uq       UNIQUE (tenant_id, hold_code),
    CONSTRAINT lh_status_chk    CHECK (status IN ('active', 'released', 'expired')),
    CONSTRAINT lh_scope_chk     CHECK (
        scope_entity_type IS NOT NULL
        OR scope_date_from IS NOT NULL
        OR scope_log_schemas IS NOT NULL
    ),
    CONSTRAINT lh_date_range_chk CHECK (
        scope_date_from IS NULL OR scope_date_to IS NULL OR scope_date_from <= scope_date_to
    ),
    CONSTRAINT lh_effectivity_chk CHECK (
        effective_to IS NULL OR effective_from <= effective_to
    ),
    CONSTRAINT lh_release_chk   CHECK (
        (status <> 'released') OR (release_date IS NOT NULL AND released_by IS NOT NULL AND release_reason IS NOT NULL)
    )
);

COMMENT ON TABLE governance.legal_hold IS
    'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Legal hold registry. Active holds block the partition archive worker from '
    'detaching / archiving log partitions whose time range overlaps the hold scope. '
    'status: active (blocking) → released (manually lifted) | expired (effective_to passed).';

COMMENT ON COLUMN governance.legal_hold.hold_code IS
    'Slugified hold identifier. Used in API paths and UI labels. '
    'Must be unique per tenant. Pattern: [a-z0-9-]{1,60}.';

COMMENT ON COLUMN governance.legal_hold.scope_entity_type IS
    'If set, only audit rows for this entity type are in scope. '
    'NULL means all entity types are in scope.';

COMMENT ON COLUMN governance.legal_hold.scope_log_schemas IS
    'Array of log schema names covered by this hold (e.g. {''log'',''audit''}). '
    'NULL means all log schemas.';

COMMENT ON COLUMN governance.legal_hold.custodian_id IS
    'Principal ID of the responsible custodian. Must be a valid master.principal.id. '
    'No FK enforced here — principal may be deleted; legal hold remains.';


-- ============================================================================
-- §LHM  governance.legal_hold_manifest — partitions blocked by a hold
-- ============================================================================
-- Populated by the archive worker when it encounters a partition that
-- would be archived but is blocked by an active hold.
-- Also pre-populated via POST /api/governance/legal-holds/:id/manifest/refresh.

CREATE TABLE IF NOT EXISTS governance.legal_hold_manifest (
    -- Identity
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,

    -- Parent hold
    legal_hold_id       uuid        NOT NULL,

    -- Blocked partition
    partition_schema    text        NOT NULL,            -- e.g. 'log'
    partition_table     text        NOT NULL,            -- e.g. 'audit_log_2024_01'
    partition_range_lo  timestamptz NOT NULL,            -- inclusive
    partition_range_hi  timestamptz NOT NULL,            -- exclusive

    -- Status
    is_released         boolean     NOT NULL DEFAULT false,
    released_at         timestamptz,

    -- Audit
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT lhm_pkey          PRIMARY KEY (id),
    CONSTRAINT lhm_tenant_uq     UNIQUE (tenant_id, id),
    CONSTRAINT lhm_unique        UNIQUE (tenant_id, legal_hold_id, partition_schema, partition_table),
    CONSTRAINT lhm_hold_fk       FOREIGN KEY (tenant_id, legal_hold_id)
        REFERENCES governance.legal_hold (tenant_id, id)
        ON DELETE CASCADE,
    CONSTRAINT lhm_range_chk     CHECK (partition_range_lo < partition_range_hi),
    CONSTRAINT lhm_release_chk   CHECK (
        (is_released = false AND released_at IS NULL)
        OR (is_released = true AND released_at IS NOT NULL)
    )
);

COMMENT ON TABLE governance.legal_hold_manifest IS
    'ARCHETYPE=C;SCOPE=T;DEVIATION. Manual is_released boolean NOT NULL DEFAULT false (no status/is_active GENERATED). Inventory of log partitions blocked by a legal hold. '
    'One row per (hold, partition). Populated by the archive worker or on-demand '
    'via POST /api/governance/legal-holds/:id/manifest/refresh. '
    'is_released is set true when the hold is lifted and the partition is free to archive. '
    'CASCADE DELETE from legal_hold cleans up manifest rows when hold is hard-deleted '
    '(soft-delete via status=released is preferred for audit trail).';

CREATE INDEX IF NOT EXISTS lh_tenant_status_idx
    ON governance.legal_hold (tenant_id, status)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS lhm_hold_idx
    ON governance.legal_hold_manifest (tenant_id, legal_hold_id);

CREATE INDEX IF NOT EXISTS lhm_partition_idx
    ON governance.legal_hold_manifest (partition_schema, partition_table, is_released);
