-- ============================================================================
-- snapshot/01_tables.sql
-- Tables reconstructed from the live catalog.
-- Generated from the live Neon database snapshot schema. Do not hand-edit.
-- ============================================================================

CREATE TABLE "snapshot"."content_item_version" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "content_item_id" uuid NOT NULL,
  "version" integer NOT NULL,
  "body_json" jsonb NOT NULL,
  "body_format" text DEFAULT 'slate'::text NOT NULL,
  "change_summary" text,
  "checksum" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "snapshot"."content_item_version" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=SNAPSHOT. Immutable body snapshot per content item version. UPDATE and DELETE blocked by snapshot.trg_content_item_version_immutable trigger. Pattern mirrors snapshot.template_version. checksum prevents saving an identical body under a new version number.';

COMMENT ON COLUMN "snapshot"."content_item_version"."version" IS 'Monotonically increasing per (tenant_id, content_item_id). Starts at 1.';

COMMENT ON COLUMN "snapshot"."content_item_version"."body_json" IS 'Rich-text document tree. Format declared in body_format.';

COMMENT ON COLUMN "snapshot"."content_item_version"."body_format" IS 'Sealed: slate | prosemirror | html | markdown.';

COMMENT ON COLUMN "snapshot"."content_item_version"."checksum" IS 'SHA-256 of body_json. Unique per (tenant, content_item) — prevents saving a duplicate body as a new version.';

CREATE TABLE "snapshot"."document_snapshot" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "document_code" text,
  "version_number" integer DEFAULT 1 NOT NULL,
  "gate_event" text NOT NULL,
  "gate_event_kind" text NOT NULL,
  "activity_log_id" uuid,
  "header_json" jsonb NOT NULL,
  "lines_json" jsonb,
  "components_json" jsonb,
  "distributions_json" jsonb,
  "schedules_json" jsonb,
  "related_json" jsonb,
  "payload_hash" text NOT NULL,
  "previous_snapshot_id" uuid,
  "chain_seq" integer DEFAULT 1 NOT NULL,
  "captured_at" timestamp with time zone DEFAULT now() NOT NULL,
  "captured_by" uuid NOT NULL,
  "capture_source" text DEFAULT 'transition_hook'::text NOT NULL
)
PARTITION BY RANGE (captured_at);

COMMENT ON TABLE "snapshot"."document_snapshot" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY_PARTITIONED. Generic P2P / approvable document snapshot. Captures full graph (header + lines + components + distributions + schedules + related) at lifecycle gate events. Append-only — UPDATE/DELETE blocked by snapshot.trg_document_snapshot_immutable. Partitioned by captured_at; default partition catches all until a range strategy is configured. Hash chain (previous_snapshot_id + chain_seq + payload_hash) enables tamper detection — verified by snapshot.fn_verify_chain().';

COMMENT ON COLUMN "snapshot"."document_snapshot"."entity_type" IS 'Polymorphic entity code — e.g. ''purchase_invoice'', ''commitment'', ''receipt'', ''service_sheet''.';

COMMENT ON COLUMN "snapshot"."document_snapshot"."gate_event_kind" IS 'Sealed taxonomy: authoring_lock | commitment | fulfillment | financial_post | match_decision | amendment_baseline | reversal.';

COMMENT ON COLUMN "snapshot"."document_snapshot"."activity_log_id" IS 'log.activity_log row that triggered this snapshot. NO FK — activity_log has composite PK (id, created_at) due to partitioning; we store the id alone and LEFT JOIN in views.';

COMMENT ON COLUMN "snapshot"."document_snapshot"."payload_hash" IS 'SHA-256 hex of the canonical JSON payload (jsonb_to_text with sorted keys). Used by snapshot.fn_verify_chain() to detect tampering or storage corruption.';

COMMENT ON COLUMN "snapshot"."document_snapshot"."previous_snapshot_id" IS 'Prior snapshot in this entity''s chain (NULL for the first snapshot). NOT a tenant-scoped FK — chains span partition boundaries and the PK includes captured_at.';

CREATE TABLE "snapshot"."entity_compiled" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid,
  "entity_version_id" uuid NOT NULL,
  "artifact_kind" text DEFAULT 'execution'::text NOT NULL,
  "compiled_json" jsonb NOT NULL,
  "compiled_hash" text NOT NULL,
  "compliance_report" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "compliance_score" numeric(5,2),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "snapshot"."entity_compiled" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=SNAPSHOT. Compiled entity artifact for catalog metadata or API execution. Append-only — trg_fn_ec_immutable blocks UPDATE/DELETE. One artifact per tenant scope, entity version, and artifact_kind. catalog includes every valid effective entity; execution is API-eligible only. compliance_score: 0–100 linting quality score.';

CREATE TABLE "snapshot"."entity_compiled_overlay" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "entity_version_id" uuid NOT NULL,
  "overlay_set" jsonb NOT NULL,
  "overlay_hash" text NOT NULL,
  "base_compiled_hash" text NOT NULL,
  "compiled_json" jsonb NOT NULL,
  "compiled_hash" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "snapshot"."entity_compiled_overlay" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=SNAPSHOT. Compiled overlay delta for a specific entity version + overlay set. Append-only. Applied on top of snapshot.entity_compiled at serve time. overlay_set: jsonb array of overlay_ids included in this compilation.';

CREATE TABLE "snapshot"."entity_plane_compiled" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid,
  "entity_version_id" uuid NOT NULL,
  "plane_key" text NOT NULL,
  "contract_hash" text NOT NULL,
  "materialized_hash" text NOT NULL,
  "compiled_json" jsonb NOT NULL,
  "compiled_hash" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "snapshot"."entity_plane_compiled" IS 'Immutable Admin, Neon and Mesh descriptor artifacts produced inside the metadata publication transaction.';

CREATE TABLE "snapshot"."lifecycle_route" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "lifecycle_id" uuid NOT NULL,
  "compiled_json" jsonb NOT NULL,
  "compiled_hash" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "snapshot"."lifecycle_route" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=SNAPSHOT. Pre-compiled full route graph for a lifecycle. Used by UI to render ''what happens next'' state visualisation. Recompiled by fn_lifecycle_child_changed when definition changes (replace, not in-place UPDATE — no updated_* columns). UNIQUE(tenant_id, lifecycle_id) — one route map per lifecycle.';

CREATE TABLE "snapshot"."lifecycle_version" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "lifecycle_id" uuid NOT NULL,
  "version" integer NOT NULL,
  "definition" jsonb NOT NULL,
  "compiled_hash" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "snapshot"."lifecycle_version" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=SNAPSHOT. Immutable compiled snapshots of lifecycle definitions. document.workflow_instance pins to lifecycle_version_id — in-flight workflows continue on the version active when they started. advance_workflow_state() reads definition jsonb (one row, no joins). Append-only: trg_lv_immutable blocks UPDATE and DELETE.';

COMMENT ON COLUMN "snapshot"."lifecycle_version"."definition" IS 'Fully denormalised lifecycle definition. Structure: {states:[{id,code,name,is_terminal,is_initial,sort_order,config}], transitions:[{id,from,to,operation_code,is_active,config}], hooks:[{id,timing,action,config,origin,contract_role,safety_level,sort_order}], gates:{transition_id:{required_operations,conditions,threshold_rules}}, timers:{state_code:{policy_code,rules:[...]}}}.';

CREATE TABLE "snapshot"."status_route" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "entity_name" text NOT NULL,
  "compiled_json" jsonb NOT NULL,
  "compiled_hash" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "snapshot"."status_route" IS 'ARCHETYPE=C;SCOPE=T. Mutable compiled cache — not a D-snapshot. Recompiled in-place. Simplified compiled status transition map for Pattern A/B entities. One row per (tenant, entity_name) — fastest possible lookup for status validation. Read by control.validate_status_transition() on every entity status UPDATE. Read by control.guard_terminal_immutability() to block field edits. Read by control.guard_deletable_states() to block DELETE. Recompiled by snapshot.compile_status_route() when lifecycle definition changes. updated_at/updated_by: mutable (recompiled in-place, not appended).';

CREATE TABLE "snapshot"."template_version" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "template_id" uuid NOT NULL,
  "version" integer NOT NULL,
  "content_html" text,
  "content_json" jsonb,
  "header_html" text,
  "footer_html" text,
  "styles_css" text,
  "variables_schema" jsonb,
  "assets_manifest" jsonb,
  "checksum" text NOT NULL,
  "effective_from" date,
  "effective_to" date,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "snapshot"."template_version" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=SNAPSHOT. Immutable point-in-time snapshot of template content per version. UPDATE and DELETE blocked by trg_fn_template_version_immutable trigger. GiST temporal index supports ''which version was effective on date X?'' queries.';

COMMENT ON COLUMN "snapshot"."template_version"."variables_schema" IS 'JSON Schema for template variables. Validated by fn_validate_variables_schema().';

COMMENT ON COLUMN "snapshot"."template_version"."checksum" IS 'SHA-256 or similar hash of content. Unique per (tenant, template) — prevents duplicate version content being published.';

CREATE TABLE "snapshot"."document_snapshot_default"
  PARTITION OF "snapshot"."document_snapshot"
  DEFAULT;
