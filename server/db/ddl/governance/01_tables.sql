-- ============================================================================
-- governance/01_tables.sql
-- Tables reconstructed from the live catalog.
-- Generated from the live Neon database governance schema. Do not hand-edit.
-- ============================================================================

CREATE TABLE "governance"."book_period_status" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "company_code_id" uuid NOT NULL,
  "book_id" uuid NOT NULL,
  "fiscal_year" smallint NOT NULL,
  "period_number" smallint NOT NULL,
  "opened_at" timestamp with time zone,
  "opened_by" uuid,
  "soft_closed_at" timestamp with time zone,
  "soft_closed_by" uuid,
  "hard_closed_at" timestamp with time zone,
  "hard_closed_by" uuid,
  "reopen_count" smallint DEFAULT 0 NOT NULL,
  "last_reopen_reason" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'future'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = ANY (ARRAY['open'::text, 'soft_close'::text]))) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "governance"."book_period_status" IS 'ARCHETYPE=B;SCOPE=T. Non-standard active-set: is_active GENERATED AS (status IN (''open'', ''soft_close'')). Per-book period gate. Same period can be open in STAT but closed in TAX. Posting requires BOTH fiscal_period.status AND book_period_status.status to allow posting.';

CREATE TABLE "governance"."comment_moderation" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "context_type" text NOT NULL,
  "comment_id" uuid NOT NULL,
  "is_hidden" boolean DEFAULT false NOT NULL,
  "hidden_reason" text,
  "hidden_at" timestamp with time zone,
  "hidden_by" uuid,
  "flag_count" integer DEFAULT 0 NOT NULL,
  "last_flagged_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "governance"."comment_moderation" IS 'ARCHETYPE=C;SCOPE=T. Aggregated moderation state per comment. One row per (tenant, context_type, comment_id). UPSERT pattern — updated by trigger on event.comment_flag changes. Kept separate from event.comment_flag for O(1) render-time moderation checks. context_type in document.comment_type lookup.';

COMMENT ON COLUMN "governance"."comment_moderation"."flag_count" IS 'Total accumulated flags for this comment across all reporters. Maintained by trg_sync_comment_moderation trigger on event.comment_flag.';

CREATE TABLE "governance"."cycle_carryforward_rule" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "cycle_type_id" uuid NOT NULL,
  "deviation_type" character varying(20) NOT NULL,
  "action" character varying(20) NOT NULL,
  "max_carry_count" smallint,
  "escalate_after_carries" smallint,
  "description" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "governance"."cycle_carryforward_rule" IS 'ARCHETYPE=C;SCOPE=T;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (no status/is_active GENERATED). Carryforward policy per cycle type and deviation type. Controls whether open deviations are force-closed, auto-carried, or expired at cycle boundary. P2-FIX: updated_at/updated_by added — rule config (action, thresholds) is mutable.';

CREATE TABLE "governance"."cycle_certification" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "entity_code" character varying(20) NOT NULL,
  "cycle_run_id" uuid NOT NULL,
  "cert_code" character varying(40) NOT NULL,
  "cert_version" smallint DEFAULT 1 NOT NULL,
  "cert_type" character varying(20) DEFAULT 'STANDARD'::character varying NOT NULL,
  "status" character varying(20) DEFAULT 'DRAFT'::character varying NOT NULL,
  "content_hash" character varying(64),
  "snapshot_payload" jsonb,
  "workflow_request_id" uuid,
  "controller_notes" text,
  "attestation_notes" text,
  "certified_by" uuid,
  "certified_at" timestamp with time zone,
  "attested_by" uuid,
  "attested_at" timestamp with time zone,
  "superseded_by_id" uuid,
  "supersession_reason" text,
  "revocation_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "governance"."cycle_certification" IS 'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Formal sign-off and attestation within a cycle run. Supports versioning, supersession, content hashing, and external approval workflow.';

CREATE TABLE "governance"."cycle_cross_dependency" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "predecessor_type_id" uuid NOT NULL,
  "predecessor_phase_id" uuid NOT NULL,
  "successor_type_id" uuid NOT NULL,
  "successor_phase_id" uuid NOT NULL,
  "is_hard" boolean DEFAULT true NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "description" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "governance"."cycle_cross_dependency" IS 'ARCHETYPE=C;SCOPE=T;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (no status/is_active GENERATED). Phase-to-phase dependencies across different cycle types. Used by governance.check_cross_cycle_gate() to block successor phase entry. P2-FIX: updated_at/updated_by added — is_active and description are mutable.';

CREATE TABLE "governance"."cycle_deviation" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "entity_code" character varying(20) NOT NULL,
  "cycle_run_id" uuid NOT NULL,
  "deviation_type" character varying(20) NOT NULL,
  "scope" character varying(20) DEFAULT 'TASK'::character varying NOT NULL,
  "task_id" uuid,
  "task_template_id" uuid,
  "task_code" character varying(50),
  "task_category" character varying(30),
  "deviation_code" character varying(50),
  "title" character varying(200) NOT NULL,
  "description" text,
  "reason_code" character varying(30) NOT NULL,
  "reason_subcode" character varying(30),
  "reason_detail" text,
  "severity" character varying(20) DEFAULT 'MEDIUM'::character varying NOT NULL,
  "impact_type" character varying(30) DEFAULT 'PROCESS'::character varying NOT NULL,
  "impact_amount" numeric(18,4),
  "impact_currency" character varying(3),
  "status" character varying(20) DEFAULT 'OPEN'::character varying NOT NULL,
  "applies_to_phase_id" uuid,
  "workflow_request_id" uuid,
  "requested_by" uuid NOT NULL,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "decision_notes" text,
  "assigned_to" uuid,
  "assigned_at" timestamp with time zone,
  "resolved_by" uuid,
  "resolved_at" timestamp with time zone,
  "resolution_notes" text,
  "revocation_reason" text,
  "evidence_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "effective_from" date DEFAULT CURRENT_DATE NOT NULL,
  "effective_to" date,
  "carried_from_id" uuid,
  "carry_count" smallint DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "governance"."cycle_deviation" IS 'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Unified exception/override/waiver within a cycle run. Supports approval workflow via document.workflow_request, carryforward lineage, and scope-specific integrity constraints.';

COMMENT ON COLUMN "governance"."cycle_deviation"."evidence_payload" IS 'Structured proof supporting the deviation: exception reports, override justifications, waiver approvals. Validated by governance.trg_validate_domain_data() if schema defined.';

CREATE TABLE "governance"."cycle_phase" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "cycle_type_id" uuid NOT NULL,
  "phase_code" character varying(30) NOT NULL,
  "phase_name" character varying(100) NOT NULL,
  "sort_order" smallint NOT NULL,
  "description" text,
  "is_gate_enforced" boolean DEFAULT true NOT NULL,
  "min_readiness_pct" numeric(5,2),
  "target_hours_from_start" integer,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "governance"."cycle_phase" IS 'ARCHETYPE=C;SCOPE=T;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (no status/is_active GENERATED). Ordered phases within a cycle type. sort_order determines sequence. Gates can be enforced per phase with min_readiness_pct thresholds.';

CREATE TABLE "governance"."cycle_run" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "entity_code" character varying(20) NOT NULL,
  "cycle_type_id" uuid NOT NULL,
  "fiscal_year" smallint NOT NULL,
  "period_number" smallint NOT NULL,
  "run_number" smallint DEFAULT 1 NOT NULL,
  "status" character varying(30) DEFAULT 'PLANNED'::character varying NOT NULL,
  "current_phase_id" uuid,
  "period_end_date" date NOT NULL,
  "cycle_start_date" date NOT NULL,
  "cycle_target_date" date NOT NULL,
  "phase_targets" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "started_at" timestamp with time zone,
  "started_by" uuid,
  "completed_at" timestamp with time zone,
  "completed_by" uuid,
  "certified_at" timestamp with time zone,
  "certified_by" uuid,
  "cancelled_at" timestamp with time zone,
  "cancelled_by" uuid,
  "notes" text,
  "domain_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "governance"."cycle_run" IS 'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Runtime cycle instance. One run per (entity, type, fiscal_year, period, run_number). domain_data validated against cycle_type.run_data_schema by trigger.';

COMMENT ON COLUMN "governance"."cycle_run"."domain_data" IS 'Extensible JSONB payload validated against cycle_type.run_data_schema by governance.trg_validate_domain_data(). Holds cycle-specific context such as reporting_currency, consolidation_scope, and special instructions.';

CREATE TABLE "governance"."cycle_task" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "entity_code" character varying(20) NOT NULL,
  "cycle_run_id" uuid NOT NULL,
  "template_id" uuid NOT NULL,
  "phase_id" uuid NOT NULL,
  "category_id" uuid NOT NULL,
  "task_code" character varying(50) NOT NULL,
  "is_mandatory" boolean DEFAULT true NOT NULL,
  "assigned_to" uuid,
  "assigned_role" text,
  "status" character varying(20) DEFAULT 'PENDING'::character varying NOT NULL,
  "due_at" timestamp with time zone,
  "completed_by" uuid,
  "completed_at" timestamp with time zone,
  "completion_notes" text,
  "evidence_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "failure_reason" text,
  "failed_at" timestamp with time zone,
  "execution_meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "domain_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "governance"."cycle_task" IS 'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Materialized task instance within a cycle run. Created from templates by governance.materialize_cycle_tasks(). domain_data validated by trigger.';

COMMENT ON COLUMN "governance"."cycle_task"."evidence_payload" IS 'Structured proof of task completion. Contents vary by task_code: e.g. reconciliation_report, sign-off screenshots, balance confirmations. Validated by governance.trg_validate_domain_data() if evidence_schema is set on template.';

COMMENT ON COLUMN "governance"."cycle_task"."execution_meta" IS 'Runtime execution metadata: retry counts, worker_id, timing metrics, error traces. Written by the task execution engine, not by users.';

COMMENT ON COLUMN "governance"."cycle_task"."domain_data" IS 'Extensible JSONB payload validated against cycle_task_template.task_data_schema. Holds task-specific context: checklist items, calculation parameters, scope filters.';

CREATE TABLE "governance"."cycle_task_category" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "cycle_type_id" uuid NOT NULL,
  "category_code" character varying(30) NOT NULL,
  "category_name" character varying(100) NOT NULL,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "color_code" character varying(7),
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "governance"."cycle_task_category" IS 'ARCHETYPE=C;SCOPE=T;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (no status/is_active GENERATED). Registered task categories per cycle type (e.g. SUBLEDGER, TAX, CASH). FK-enforced on cycle_task_template.category_id. P2-FIX: updated_at/updated_by added — category metadata (name, sort, color) is mutable.';

CREATE TABLE "governance"."cycle_task_dependency" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "cycle_type_id" uuid NOT NULL,
  "entity_code" character varying(20) NOT NULL,
  "predecessor_template_id" uuid NOT NULL,
  "successor_template_id" uuid NOT NULL,
  "dependency_type" character varying(20) DEFAULT 'FINISH_TO_START'::character varying NOT NULL,
  "is_hard" boolean DEFAULT true NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "governance"."cycle_task_dependency" IS 'ARCHETYPE=C;SCOPE=T;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (no status/is_active GENERATED). Intra-cycle directed acyclic graph (DAG) between task templates. Cycle detection enforced by trg_check_dep_cycle trigger.';

CREATE TABLE "governance"."cycle_task_template" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "entity_code" character varying(20) NOT NULL,
  "cycle_type_id" uuid NOT NULL,
  "phase_id" uuid NOT NULL,
  "category_id" uuid NOT NULL,
  "task_code" character varying(50) NOT NULL,
  "task_name" character varying(150) NOT NULL,
  "description" text,
  "completion_mode" character varying(10) DEFAULT 'MANUAL'::character varying NOT NULL,
  "system_check_handler" character varying(100),
  "is_mandatory" boolean DEFAULT true NOT NULL,
  "is_waivable" boolean DEFAULT false NOT NULL,
  "severity" character varying(10),
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "sla_hours" integer,
  "estimated_duration_min" integer,
  "reminder_lead_hours" integer,
  "default_owner_role" text,
  "default_owner_user_id" uuid,
  "is_auto_start_when_ready" boolean DEFAULT false NOT NULL,
  "orchestration_group" text,
  "blueprint_filter" character varying(5)[],
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "governance"."cycle_task_template" IS 'ARCHETYPE=C;SCOPE=T;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (no status/is_active GENERATED). Reusable task definitions within a cycle type. Templates are materialized into cycle_task instances when a cycle_run is opened.';

CREATE TABLE "governance"."cycle_type" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "type_code" character varying(30) NOT NULL,
  "type_name" character varying(150) NOT NULL,
  "description" text,
  "frequency" character varying(20) DEFAULT 'MONTHLY'::character varying NOT NULL,
  "domain" character varying(30) NOT NULL,
  "clean_cycle_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "approval_policies" jsonb DEFAULT '{}'::jsonb,
  "run_data_schema" jsonb,
  "task_data_schema" jsonb,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "governance"."cycle_type" IS 'ARCHETYPE=C;SCOPE=T;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (no status/is_active GENERATED). Governance cycle type definitions. Root entity for the cycle model. Each type defines phases, task categories, templates, and policies.';

CREATE TABLE "governance"."legal_hold" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "hold_name" character varying(200) NOT NULL,
  "hold_code" character varying(60) NOT NULL,
  "description" text,
  "custodian_id" uuid NOT NULL,
  "scope_entity_type" character varying(50),
  "scope_entity_id_lo" uuid,
  "scope_entity_id_hi" uuid,
  "scope_date_from" timestamp with time zone,
  "scope_date_to" timestamp with time zone,
  "scope_log_schemas" text[],
  "status" text DEFAULT 'active'::text NOT NULL,
  "effective_from" timestamp with time zone DEFAULT now() NOT NULL,
  "effective_to" timestamp with time zone,
  "release_date" timestamp with time zone,
  "release_reason" text,
  "released_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "governance"."legal_hold" IS 'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Legal hold registry. Active holds block the partition archive worker from detaching / archiving log partitions whose time range overlaps the hold scope. status: active (blocking) → released (manually lifted) | expired (effective_to passed).';

COMMENT ON COLUMN "governance"."legal_hold"."hold_code" IS 'Slugified hold identifier. Used in API paths and UI labels. Must be unique per tenant. Pattern: [a-z0-9-]{1,60}.';

COMMENT ON COLUMN "governance"."legal_hold"."custodian_id" IS 'Principal ID of the responsible custodian. Must be a valid master.principal.id. No FK enforced here — principal may be deleted; legal hold remains.';

COMMENT ON COLUMN "governance"."legal_hold"."scope_entity_type" IS 'If set, only audit rows for this entity type are in scope. NULL means all entity types are in scope.';

COMMENT ON COLUMN "governance"."legal_hold"."scope_log_schemas" IS 'Array of log schema names covered by this hold (e.g. {''log'',''audit''}). NULL means all log schemas.';

CREATE TABLE "governance"."legal_hold_manifest" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "legal_hold_id" uuid NOT NULL,
  "partition_schema" text NOT NULL,
  "partition_table" text NOT NULL,
  "partition_range_lo" timestamp with time zone NOT NULL,
  "partition_range_hi" timestamp with time zone NOT NULL,
  "is_released" boolean DEFAULT false NOT NULL,
  "released_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "governance"."legal_hold_manifest" IS 'ARCHETYPE=C;SCOPE=T;DEVIATION. Manual is_released boolean NOT NULL DEFAULT false (no status/is_active GENERATED). Inventory of log partitions blocked by a legal hold. One row per (hold, partition). Populated by the archive worker or on-demand via POST /api/governance/legal-holds/:id/manifest/refresh. is_released is set true when the hold is lifted and the partition is free to archive. CASCADE DELETE from legal_hold cleans up manifest rows when hold is hard-deleted (soft-delete via status=released is preferred for audit trail).';

CREATE TABLE "governance"."preserved_identity_migration_receipt_v2" (
  "manifest_id" text NOT NULL,
  "plane_code" text NOT NULL,
  "source_snapshot_sha256" text NOT NULL,
  "manifest_sha256" text NOT NULL,
  "identity_count" integer NOT NULL,
  "inserted_count" integer NOT NULL,
  "exact_match_count" integer NOT NULL,
  "approval_ticket" text NOT NULL,
  "applied_at" timestamp with time zone DEFAULT now() NOT NULL,
  "applied_by" text DEFAULT SESSION_USER NOT NULL
);

CREATE TABLE "governance"."report_pack" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "cycle_run_id" uuid NOT NULL,
  "report_type" text DEFAULT 'cycle_summary'::text NOT NULL,
  "format" text DEFAULT 'html'::text NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "storage_key" text,
  "file_size_bytes" bigint,
  "content_type" text DEFAULT 'text/html'::text NOT NULL,
  "generated_at" timestamp with time zone,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "governance"."report_pack" IS 'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Generated report bundle for a governance cycle run. storage_key = S3/MinIO object key populated after generation. Download via GET /governance/report-packs/:id/download → presigned URL. Phase 4.4: HTML stub. Upgrades to PDF after Phase 5.1 renderer ships.';

COMMENT ON COLUMN "governance"."report_pack"."format" IS 'Output format. html (Phase 4.4 stub), pdf (Phase 5.1+), xlsx (optional).';

COMMENT ON COLUMN "governance"."report_pack"."storage_key" IS 'S3/MinIO object key. Format: reports/{tenantId}/{cycleRunId}/{id}.{format}. NULL while status is pending/generating/failed.';
