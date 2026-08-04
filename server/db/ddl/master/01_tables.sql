-- ============================================================================
-- master/01_tables.sql
-- Tables reconstructed from the live catalog.
-- Generated from the live Neon database master schema. Do not hand-edit.
-- ============================================================================

CREATE TABLE "master"."accounting_profile" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "direction" text DEFAULT 'INBOUND'::text NOT NULL,
  "subledger_type" text DEFAULT 'AP'::text NOT NULL,
  "domain_hint" text,
  "icon_key" text,
  "color_token" text,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."accounting_profile" IS 'Identity table for accounting profiles. 1:N with control.acct_profile_config (versioned configuration). Referenced by master.company_code_supplier_profile.default_accounting_profile_id and master.company_code_customer_profile.default_accounting_profile_id. Engine 4.13 resolves profile_config at runtime via intent_to_accounting_profile_rule.';

COMMENT ON COLUMN "master"."accounting_profile"."direction" IS 'INBOUND=AP (supplier-facing), OUTBOUND=AR (customer-facing), BILATERAL=both sides.';

COMMENT ON COLUMN "master"."accounting_profile"."subledger_type" IS 'Must match the subledger_type on the corresponding acct_profile_config. AP for supplier flows, AR for customer flows, ASSET for fixed-asset profiles.';

COMMENT ON COLUMN "master"."accounting_profile"."domain_hint" IS 'Optional classification hint (OPEX/CAPEX/ADMIN/...). Informational only; actual routing is driven by business_intent via Engine 4.13 rules.';

CREATE TABLE "master"."address" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text,
  "name" text,
  "address_type" text,
  "attention_line" text,
  "line1" text,
  "line2" text,
  "line3" text,
  "city" text,
  "region" text,
  "postal_code" text,
  "country_code" text,
  "latitude" numeric(9,6),
  "longitude" numeric(9,6),
  "formatted_address" text,
  "tax_jurisdiction_id" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."address" IS 'ARCHETYPE=B;SCOPE=T. Normalised postal address record. Owns no owner — ownership is expressed by master.address_link rows. One address can be shared across multiple owners without duplication. address_type = what the place physically is. Business purpose (billing, shipping…) lives on address_link, not here.';

COMMENT ON COLUMN "master"."address"."address_type" IS 'Physical classification of the location. Lookup: master.address_type. Independent of the business purpose the address serves (see address_link.purpose).';

COMMENT ON COLUMN "master"."address"."attention_line" IS 'Addressee line printed before line1. E.g. "Attn: Accounts Payable".';

COMMENT ON COLUMN "master"."address"."line3" IS 'Third address line. Used in APAC addressing for building name, floor, unit number.';

COMMENT ON COLUMN "master"."address"."latitude" IS 'WGS84 decimal degrees. Populated asynchronously by geocoding.';

COMMENT ON COLUMN "master"."address"."longitude" IS 'WGS84 decimal degrees. Populated asynchronously by geocoding.';

COMMENT ON COLUMN "master"."address"."formatted_address" IS 'Single-string cache for display, print labels, and map rendering.';

CREATE TABLE "master"."address_link" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "owner_type" text NOT NULL,
  "owner_id" uuid NOT NULL,
  "address_id" uuid NOT NULL,
  "purpose" text NOT NULL,
  "role_qualifier" text,
  "is_primary" boolean DEFAULT false NOT NULL,
  "effective_from" date DEFAULT CURRENT_DATE NOT NULL,
  "effective_until" date,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."address_link" IS 'ARCHETYPE=C;SCOPE=T. Polymorphic M:N bridge: owner → address with business purpose and temporal validity. One address row can be shared by multiple owners without duplication. purpose is conceptually correlated with contact_link.purpose — joining on owner_type + owner_id + purpose pairs a delivery address with the relevant contact. No status lifecycle — temporal bridge; validity expressed via effective_from/effective_until.';

COMMENT ON COLUMN "master"."address_link"."owner_type" IS 'Polymorphic discriminator. FK to master.owner_type.code.';

COMMENT ON COLUMN "master"."address_link"."purpose" IS 'Canonical business role this owner → address relationship plays. Lookup: master.address_purpose (8 values: ship_to, bill_to, place_of_service, bill_from, remit_to, ship_from, correspondence, default). Reserved ''default'' = universal fallback resolved by fn_resolve_address(). Document address selections (PR/PO/GR/SE/PI) share this exact vocabulary.';

COMMENT ON COLUMN "master"."address_link"."role_qualifier" IS 'Optional sub-classification within purpose. Free text snake_case. Examples: purpose=correspondence + role_qualifier=legal_notice / tax_filing / account_statement / regulatory_filing / emergency. NULL means the role applies generically. Lookup-validated only if master.address_role_qualifier seed has the value (advisory).';

COMMENT ON COLUMN "master"."address_link"."is_primary" IS 'Canonical link when multiple addresses exist for the same owner+purpose. Enforced: at most one is_primary=true per owner+purpose per time period.';

COMMENT ON COLUMN "master"."address_link"."effective_from" IS 'Inclusive start date of validity. DEFAULT CURRENT_DATE.';

COMMENT ON COLUMN "master"."address_link"."effective_until" IS 'Exclusive end date. NULL = open-ended (currently active).';

CREATE TABLE "master"."asset" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "company_code_id" uuid NOT NULL,
  "description" text,
  "asset_class_id" uuid NOT NULL,
  "acquisition_date" date NOT NULL,
  "in_service_date" date,
  "acquisition_cost" numeric(18,4) NOT NULL,
  "currency_code" character(3) DEFAULT 'USD'::bpchar NOT NULL,
  "residual_value" numeric(18,4) DEFAULT 0 NOT NULL,
  "useful_life_months" integer NOT NULL,
  "cost_center_id" uuid,
  "profit_center_id" uuid,
  "project_id" uuid,
  "site_id" uuid,
  "location_description" text,
  "custodian_id" uuid,
  "supplier_id" uuid,
  "commitment_id" uuid,
  "barcode" text,
  "serial_number" text,
  "retired_at" timestamp with time zone,
  "retirement_type" text,
  "disposal_proceeds" numeric(18,4),
  "disposal_currency_code" character(3),
  "is_capitalized_from_wip" boolean DEFAULT false NOT NULL,
  "capitalized_at" timestamp with time zone,
  "warranty_expiry_date" date,
  "insured_value" numeric(18,4),
  "insurance_policy_ref" text,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = ANY (ARRAY['draft'::text, 'active'::text, 'suspended'::text]))) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."asset" IS 'ARCHETYPE=B;SCOPE=T. Core fixed asset register. One row per physical/intangible asset. Multi-tenant, multi-entity. Component relationships modeled solely in master.asset_component (no parent_asset_id on this table). All FKs to external tables (OU, cost center, supplier) are tenant-scoped composites. Non-standard active-set: is_active GENERATED AS (status IN (''draft'', ''active'', ''suspended'')).';

CREATE TABLE "master"."asset_assignment_history" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "company_code_id" uuid NOT NULL,
  "asset_id" uuid NOT NULL,
  "assignment_type" text NOT NULL,
  "from_value_id" uuid,
  "from_value_code" text,
  "to_value_id" uuid,
  "to_value_code" text,
  "effective_from" date DEFAULT CURRENT_DATE NOT NULL,
  "effective_to" date,
  "reason" text,
  "reference_doc_id" uuid,
  "reference_doc_type" text,
  "assigned_by" uuid NOT NULL,
  "assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."asset_assignment_history" IS 'ARCHETYPE=C;SCOPE=T. Full timeline of asset assignment changes: custodian, location, cost center, operating unit. Effective-dated with from/to values for audit trail. No status lifecycle — mutable history/timeline table.';

CREATE TABLE "master"."asset_book" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text DEFAULT ''::text NOT NULL,
  "name" text DEFAULT ''::text NOT NULL,
  "company_code_id" uuid NOT NULL,
  "asset_id" uuid NOT NULL,
  "book_type" text NOT NULL,
  "book_id" uuid,
  "depreciation_method" text NOT NULL,
  "useful_life_months" integer NOT NULL,
  "residual_value" numeric(18,4) DEFAULT 0 NOT NULL,
  "cost_basis" numeric(18,4) NOT NULL,
  "accumulated_depreciation" numeric(18,4) DEFAULT 0 NOT NULL,
  "depreciated_cost" numeric(18,4) GENERATED ALWAYS AS ((cost_basis - accumulated_depreciation)) STORED,
  "cumulative_revaluation" numeric(18,4) DEFAULT 0 NOT NULL,
  "cumulative_impairment" numeric(18,4) DEFAULT 0 NOT NULL,
  "carrying_amount" numeric(18,4) GENERATED ALWAYS AS ((((cost_basis + cumulative_revaluation) - cumulative_impairment) - accumulated_depreciation)) STORED,
  "depreciation_start_date" date,
  "last_depreciation_date" date,
  "next_depreciation_date" date,
  "last_revaluation_date" date,
  "last_impairment_date" date,
  "recoverable_amount" numeric(18,4),
  "convention" text,
  "bonus_depreciation_pct" numeric(5,2) DEFAULT 0,
  "prorate_basis" text DEFAULT 'monthly'::text NOT NULL,
  "salvage_value_locked" boolean DEFAULT false NOT NULL,
  "last_run_id" uuid,
  "currency_code" character(3) DEFAULT 'USD'::bpchar NOT NULL,
  "posted_at" timestamp with time zone,
  "posted_by" uuid,
  "override_acquisition_account" text,
  "override_accum_depr_account" text,
  "override_depr_expense_account" text,
  "override_gain_loss_account" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = ANY (ARRAY['draft'::text, 'active'::text, 'suspended'::text]))) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."asset_book" IS 'ARCHETYPE=B;SCOPE=T. Per-book depreciation profile. One row per (asset, book_type). carrying_amount is the authoritative generated column: cost_basis + cumulative_revaluation - cumulative_impairment - accumulated_depreciation. depreciated_cost is the narrower (cost_basis - accumulated_depreciation). Over-depreciation guard prevents accumulated_depreciation from exceeding depreciable base. Non-standard active-set: is_active GENERATED AS (status IN (''draft'', ''active'', ''suspended'')).';

CREATE TABLE "master"."asset_class" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "parent_id" uuid,
  "level_no" smallint DEFAULT 1 NOT NULL,
  "path" text,
  "is_leaf" boolean DEFAULT true NOT NULL,
  "gl_account_defaults" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "depreciation_defaults" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "asset_nature" text DEFAULT 'tangible'::text NOT NULL,
  "is_depreciable" boolean DEFAULT true NOT NULL,
  "is_componentization_required" boolean DEFAULT false NOT NULL,
  "is_asset_tag_required" boolean DEFAULT true NOT NULL,
  "is_serial_tracking_required" boolean DEFAULT false NOT NULL,
  "is_location_tracking_required" boolean DEFAULT true NOT NULL,
  "default_uom_code" text,
  "useful_life_override_policy" text DEFAULT 'allow'::text NOT NULL,
  "disposal_requires_approval" boolean DEFAULT true NOT NULL,
  "transfer_requires_approval" boolean DEFAULT false NOT NULL,
  "revaluation_allowed" boolean DEFAULT false NOT NULL,
  "impairment_tracking_required" boolean DEFAULT true NOT NULL,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."asset_class" IS 'ARCHETYPE=B;SCOPE=T. Hierarchical asset classification — identity, hierarchy, and governance only. GL mappings, depreciation parameters, and capitalization thresholds live in control.asset_class_book_policy. code is bare (PLANT, not ATHQ-AC-PLANT) — unique per tenant, shared across all company codes.';

CREATE TABLE "master"."asset_component" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "company_code_id" uuid NOT NULL,
  "parent_asset_id" uuid NOT NULL,
  "component_asset_id" uuid NOT NULL,
  "component_type" text NOT NULL,
  "pct_of_parent" numeric(7,4) NOT NULL,
  "allocated_cost" numeric(18,4) NOT NULL,
  "currency_code" character(3) DEFAULT 'USD'::bpchar NOT NULL,
  "useful_life_months" integer NOT NULL,
  "description" text,
  "effective_from" date DEFAULT CURRENT_DATE NOT NULL,
  "effective_to" date,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."asset_component" IS 'ARCHETYPE=B;SCOPE=T. IAS 16 component decomposition. SOLE authority for parent-child asset relationships — master.asset carries no parent_asset_id to avoid drift.';

CREATE TABLE "master"."atlas_knowledge_chunk" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "revision_id" uuid NOT NULL,
  "ordinal" integer NOT NULL,
  "character_start" integer NOT NULL,
  "character_end" integer NOT NULL,
  "checksum" text NOT NULL,
  "embedding_model" text,
  "index_status" text DEFAULT 'pending'::text NOT NULL,
  "index_reference" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE "master"."atlas_knowledge_chunk" IS 'ARCHETYPE=C;SCOPE=T. Chunk locator and index state; it intentionally stores no customer text.';

CREATE TABLE "master"."atlas_knowledge_revision" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "source_id" uuid NOT NULL,
  "source_version_id" text NOT NULL,
  "checksum" text NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "indexed_at" timestamp with time zone,
  "superseded_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE "master"."atlas_knowledge_revision" IS 'ARCHETYPE=C;SCOPE=T. Immutable source revision and checksum used to reject stale retrieval candidates.';

CREATE TABLE "master"."atlas_knowledge_source" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "source_kind" text NOT NULL,
  "source_id" text NOT NULL,
  "entity_code" text,
  "permission_code" text NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."atlas_knowledge_source" IS 'ARCHETYPE=C;SCOPE=T. Tenant-controlled Atlas retrieval source with required effective read permission.';

CREATE TABLE "master"."atlas_message" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "conversation_id" uuid NOT NULL,
  "plane" text NOT NULL,
  "sequence" bigint DEFAULT 0 NOT NULL,
  "role" text NOT NULL,
  "content_blocks" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "protected_content_ref" text,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "run_id" uuid,
  "parent_message_id" uuid,
  "result_cards" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "citation_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "tool_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "terminal_error_class" text,
  "terminal_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."atlas_message" IS 'ARCHETYPE=C;SCOPE=T;SUBTYPE=TERMINAL_IMMUTABLE. Ordered Atlas transcript message. Pending assistant content may be finalized once; terminal rows are immutable. Operational logs and metering rows must not duplicate content from this table.';

COMMENT ON COLUMN "master"."atlas_message"."sequence" IS 'Strictly monotonic per conversation. Allocated under an atlas_thread row lock.';

COMMENT ON COLUMN "master"."atlas_message"."content_blocks" IS 'Portable Atlas content blocks. Must be empty when protected_content_ref is used.';

COMMENT ON COLUMN "master"."atlas_message"."terminal_error_class" IS 'Safe bounded error classification only; never a raw provider error or prompt fragment.';

CREATE TABLE "master"."atlas_support_session" (
  "id" uuid NOT NULL,
  "token_hash" text NOT NULL,
  "origin_tenant_id" uuid NOT NULL,
  "origin_principal_id" uuid NOT NULL,
  "origin_subject" text NOT NULL,
  "origin_auth_epoch" integer NOT NULL,
  "target_tenant_id" uuid NOT NULL,
  "shadow_principal_id" uuid NOT NULL,
  "shadow_auth_epoch" integer NOT NULL,
  "shadow_relationship_id" uuid NOT NULL,
  "plane" text DEFAULT 'admin'::text NOT NULL,
  "allowed_scopes" text[] NOT NULL,
  "ticket_id" text NOT NULL,
  "reason" text NOT NULL,
  "thread_id" uuid NOT NULL,
  "session_binding_hash" text NOT NULL,
  "issued_at" timestamp with time zone NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "ended_at" timestamp with time zone,
  "status" text DEFAULT 'active'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE "master"."atlas_support_session" IS 'Server-only, short-lived Atlas Admin support sessions. No prompt, response, or customer record content.';

CREATE TABLE "master"."atlas_support_session_audit" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "session_id" uuid NOT NULL,
  "event" text NOT NULL,
  "occurred_at" timestamp with time zone NOT NULL,
  "origin_principal_id" uuid NOT NULL,
  "target_tenant_id" uuid NOT NULL,
  "shadow_principal_id" uuid NOT NULL,
  "scope" text,
  "resource_hash" text,
  "safe_reason_code" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE "master"."atlas_support_session_audit" IS 'Append-only support access audit containing identifiers, scope and optional resource hash only.';

CREATE TABLE "master"."atlas_thread" (
  "conversation_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "plane" text NOT NULL,
  "owner_principal_id" uuid NOT NULL,
  "retention_policy_id" text,
  "expires_at" timestamp with time zone,
  "purge_after" timestamp with time zone,
  "legal_hold" boolean DEFAULT false NOT NULL,
  "legal_hold_reference" text,
  "summary_blocks" jsonb,
  "protected_summary_ref" text,
  "summary_version" integer DEFAULT 0 NOT NULL,
  "last_message_sequence" bigint DEFAULT 0 NOT NULL,
  "row_version" bigint DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."atlas_thread" IS 'ARCHETYPE=C;SCOPE=T. One-to-one Atlas state for a master.conversation. Principal-private by default. The plane and owner are immutable. Transcript ordering is controlled by last_message_sequence.';

COMMENT ON COLUMN "master"."atlas_thread"."retention_policy_id" IS 'Stable, versioned server-resolved retention policy identifier. Never accepted as client authority.';

COMMENT ON COLUMN "master"."atlas_thread"."protected_summary_ref" IS 'Opaque reference to protected summary content. Never a provider conversation identifier.';

COMMENT ON COLUMN "master"."atlas_thread"."row_version" IS 'Optimistic concurrency token incremented by a database trigger on every update.';

CREATE TABLE "master"."attachment" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "file_name" text NOT NULL,
  "original_filename" text,
  "content_type" text,
  "size_bytes" bigint,
  "sha256" text,
  "kind" text DEFAULT 'attachment'::text NOT NULL,
  "storage_bucket" text NOT NULL,
  "storage_key" text NOT NULL,
  "shard" smallint,
  "thumbnail_key" text,
  "preview_key" text,
  "preview_generated_at" timestamp with time zone,
  "is_preview_generation_failed" boolean DEFAULT false NOT NULL,
  "is_virus_scanned" boolean DEFAULT false NOT NULL,
  "version_no" smallint DEFAULT 1 NOT NULL,
  "parent_attachment_id" uuid,
  "reference_count" integer DEFAULT 1 NOT NULL,
  "is_current" boolean DEFAULT true NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "is_auto_delete_on_expiry" boolean DEFAULT false NOT NULL,
  "expires_at" timestamp with time zone,
  "retention_until" timestamp with time zone,
  "uploaded_by" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid,
  "extracted_text" text,
  "extracted_text_chars" integer,
  "text_extracted_at" timestamp with time zone,
  "text_extraction_status" text,
  "text_extraction_error" text,
  "pii_detected" boolean DEFAULT false NOT NULL,
  "pii_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "pii_scanned_at" timestamp with time zone
);

COMMENT ON COLUMN "master"."attachment"."sha256" IS 'SHA-256 hex digest for content-addressable dedup. reference_count incremented when a duplicate is detected.';

COMMENT ON COLUMN "master"."attachment"."kind" IS 'Functional classification. Lookup: master.attachment_kind. e.g. attachment, letterhead, template_asset, avatar, evidence.';

COMMENT ON COLUMN "master"."attachment"."storage_key" IS 'S3 object key. Stable across dedup — multiple attachment rows may share the same storage_key when reference_count > 1.';

COMMENT ON COLUMN "master"."attachment"."extracted_text" IS 'Plain text extracted by apache/tika. NULL until attachment-text-extract worker runs. Truncated at the worker-level cap to bound row size.';

COMMENT ON COLUMN "master"."attachment"."text_extraction_status" IS 'Extraction state: pending (enqueued, not yet run), extracted (success), skipped (unsupported mime or size cap), failed (terminal error after retries).';

COMMENT ON COLUMN "master"."attachment"."pii_types" IS 'JSONB array of matched PII category labels only — never the raw match. Populated alongside extracted_text by the tika-extract worker.';

CREATE TABLE "master"."attachment_comment" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "attachment_id" uuid NOT NULL,
  "parent_id" uuid,
  "author_id" uuid NOT NULL,
  "content" text NOT NULL,
  "mentions" jsonb,
  "edited_at" timestamp with time zone,
  "edited_by" uuid,
  "deleted_at" timestamp with time zone,
  "deleted_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."attachment_comment" IS 'ARCHETYPE=C;SCOPE=T. Threaded comments on attachments. Satellite of master.attachment — follows master.comment family pattern. fn_comment_parent_same_attachment() enforces thread integrity.';

COMMENT ON COLUMN "master"."attachment_comment"."mentions" IS 'JSON array of {user_id: uuid, ...} mention objects. Validated by document.fn_doc_validate_mentions() trigger.';

CREATE TABLE "master"."attachment_folder" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "name" text NOT NULL,
  "parent_id" uuid,
  "display_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."attachment_folder" IS 'ARCHETYPE=D;SCOPE=T. Virtual folder hierarchy for grouping entity_document_link rows. Scoped per (tenant, entity_type, entity_id). NULL folder_id in entity_document_link = uncategorized.';

CREATE TABLE "master"."auth_delegation" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "plane_code" text NOT NULL,
  "delegator_id" uuid NOT NULL,
  "delegate_id" uuid NOT NULL,
  "reason" text NOT NULL,
  "approval_ticket" text,
  "revoked_by" uuid,
  "revoked_at" timestamp with time zone,
  "revocation_reason" text,
  "status" text DEFAULT 'active'::text NOT NULL,
  "effective_from" timestamp with time zone DEFAULT now() NOT NULL,
  "effective_until" timestamp with time zone NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "master"."auth_delegation_grant" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "plane_code" text NOT NULL,
  "delegation_id" uuid NOT NULL,
  "permission_id" uuid NOT NULL,
  "scope_target_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

CREATE TABLE "master"."auth_deny_rule" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "plane_code" text NOT NULL,
  "permission_id" uuid NOT NULL,
  "scope_target_id" uuid NOT NULL,
  "subject_kind" text NOT NULL,
  "principal_id" uuid,
  "group_id" uuid,
  "policy_code" text,
  "policy_version" bigint,
  "precedence" smallint DEFAULT 100 NOT NULL,
  "reason" text NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "effective_from" timestamp with time zone DEFAULT now() NOT NULL,
  "effective_until" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "master"."auth_group" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "plane_code" text NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_system" boolean DEFAULT true NOT NULL,
  "managed_externally" boolean DEFAULT false NOT NULL,
  "source_type" text DEFAULT 'seed'::text NOT NULL,
  "source_ref" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "master"."auth_group_member" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "plane_code" text NOT NULL,
  "group_id" uuid NOT NULL,
  "principal_id" uuid NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "effective_from" timestamp with time zone DEFAULT now() NOT NULL,
  "effective_until" timestamp with time zone,
  "source_type" text DEFAULT 'seed'::text NOT NULL,
  "source_ref" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "master"."auth_group_role" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "plane_code" text NOT NULL,
  "group_id" uuid NOT NULL,
  "role_id" uuid NOT NULL,
  "scope_target_id" uuid NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "effective_from" timestamp with time zone DEFAULT now() NOT NULL,
  "effective_until" timestamp with time zone,
  "source_type" text DEFAULT 'seed'::text NOT NULL,
  "source_ref" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "master"."auth_override" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "plane_code" text NOT NULL,
  "principal_id" uuid NOT NULL,
  "permission_id" uuid NOT NULL,
  "scope_target_id" uuid NOT NULL,
  "reason" text NOT NULL,
  "approval_ticket" text NOT NULL,
  "approved_by" uuid NOT NULL,
  "approved_at" timestamp with time zone NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "effective_from" timestamp with time zone DEFAULT now() NOT NULL,
  "effective_until" timestamp with time zone NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "master"."auth_plane_membership" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "plane_code" text NOT NULL,
  "principal_id" uuid NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "effective_from" timestamp with time zone DEFAULT now() NOT NULL,
  "effective_until" timestamp with time zone,
  "source_type" text DEFAULT 'seed'::text NOT NULL,
  "source_ref" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "master"."auth_record_acl" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "plane_code" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "record_id" uuid NOT NULL,
  "permission_id" uuid NOT NULL,
  "subject_kind" text NOT NULL,
  "principal_id" uuid,
  "group_id" uuid,
  "reason" text NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "effective_from" timestamp with time zone DEFAULT now() NOT NULL,
  "effective_until" timestamp with time zone,
  "granted_by" uuid NOT NULL,
  "revoked_by" uuid,
  "revoked_at" timestamp with time zone,
  "revocation_reason" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "master"."auth_role" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "plane_code" text NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "role_kind" text DEFAULT 'system'::text NOT NULL,
  "version_no" bigint DEFAULT 1 NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "effective_from" timestamp with time zone DEFAULT now() NOT NULL,
  "effective_until" timestamp with time zone,
  "source_type" text DEFAULT 'seed'::text NOT NULL,
  "source_ref" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "master"."auth_role_permission" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "plane_code" text NOT NULL,
  "role_id" uuid NOT NULL,
  "permission_id" uuid NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "effective_from" timestamp with time zone DEFAULT now() NOT NULL,
  "effective_until" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

CREATE TABLE "master"."auth_scope_target" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "plane_code" text NOT NULL,
  "scope_kind" text NOT NULL,
  "tenant_scope_id" uuid,
  "company_code_id" uuid,
  "legal_entity_id" uuid,
  "operating_organization_id" uuid,
  "scope_key" text NOT NULL,
  "display_name" text NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "master"."bank_account" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text,
  "name" text,
  "bank_party_id" uuid,
  "account_holder_name" text NOT NULL,
  "account_id_type" text NOT NULL,
  "account_id_value" text NOT NULL,
  "account_last4" text,
  "currency_code" character(3) NOT NULL,
  "bic_override" text,
  "bank_name_override" text,
  "bank_country_override" character(2),
  "account_nature" text DEFAULT 'direct'::text NOT NULL,
  "provider_account_ref" text,
  "correspondent_bank_party_id" uuid,
  "is_verified" boolean DEFAULT false NOT NULL,
  "verified_at" timestamp with time zone,
  "verified_by" uuid,
  "verification_method" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."bank_account" IS 'ARCHETYPE=B;SCOPE=T. Unified bank account record — NO owner. Like master.address. One row per physical bank account. Ownership expressed by master.bank_account_link rows. Verification lives here (once per account, not duplicated per owner). Bank identity via bank_party_id or override fields for unregistered banks.';

COMMENT ON COLUMN "master"."bank_account"."bank_party_id" IS 'Reference to registered bank institution. When present, routing details (BIC, national code) resolved from bank_party. When NULL, use overrides.';

COMMENT ON COLUMN "master"."bank_account"."account_id_type" IS 'Canonical account identifier type. IBAN or LOCAL.';

COMMENT ON COLUMN "master"."bank_account"."account_id_value" IS 'Canonical account identifier value. IBAN number or local account number.';

COMMENT ON COLUMN "master"."bank_account"."account_last4" IS 'Last 4 characters of account identifier for display masking. Alphanumeric (A-Z, 0-9) to support IBAN-derived and local formats.';

COMMENT ON COLUMN "master"."bank_account"."account_nature" IS 'Nature of the account. Lookup: master.bank_account_nature. DIRECT = real account at the institution (DEFAULT for new rows). VIRTUAL = virtual identifier routed through provider pooled account. COLLECTION = virtual inbound-only account (Instarem pattern). SUB_ACCOUNT = sub-account under a master (some banks offer this).';

COMMENT ON COLUMN "master"."bank_account"."provider_account_ref" IS 'Provider-side account/wallet reference that groups multiple currency balances under one relationship. Examples: Wise profile ID (P-12345678), Instarem collection account ID, Payoneer account number. NULL for traditional bank accounts.';

COMMENT ON COLUMN "master"."bank_account"."correspondent_bank_party_id" IS 'The actual custodian bank behind a payment provider or aggregator. When bank_party_id = Wise and the USD balance is physically held at Community Federal Savings Bank, this FK points to the CFSB bank_party row. NULL when bank_party IS the custodian (traditional bank accounts).';

COMMENT ON COLUMN "master"."bank_account"."verification_method" IS 'How the bank details were verified. MICRO_DEPOSIT, BANK_LETTER, CANCELLED_CHEQUE, SUPPLIER_PORTAL, MANUAL, API_VALIDATION.';

CREATE TABLE "master"."bank_account_house_config" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "bank_account_link_id" uuid NOT NULL,
  "gl_account_id" uuid NOT NULL,
  "local_account_type" text,
  "account_nickname" text,
  "usage_type" text DEFAULT 'DISBURSEMENT'::text NOT NULL,
  "is_disbursement_enabled" boolean DEFAULT true NOT NULL,
  "is_collection_enabled" boolean DEFAULT false NOT NULL,
  "is_default_disbursement" boolean DEFAULT false NOT NULL,
  "is_default_collection" boolean DEFAULT false NOT NULL,
  "priority" smallint DEFAULT 0 NOT NULL,
  "is_manual_payment_allowed" boolean DEFAULT true NOT NULL,
  "is_payment_file_allowed" boolean DEFAULT true NOT NULL,
  "reconciliation_mode" text DEFAULT 'MANUAL'::text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."bank_account_house_config" IS 'ARCHETYPE=B;SCOPE=T. 1:1 extension of bank_account_link for house-bank operational config. Same pattern as contact_email extends contact_link. Only exists for links where owner_type = ''company_code''. Holds GL linkage, usage type, disbursement/collection flags, reconciliation mode — fields that are operationally irrelevant for supplier/customer/employee bank accounts. SAP T012K equivalent.';

COMMENT ON COLUMN "master"."bank_account_house_config"."gl_account_id" IS 'Link to the cash GL account (e.g. IFRS-A-CASH-USD). NOT NULL — every house bank must map to a postable cash GL. Validated by trigger against mv_company_postable_account.';

COMMENT ON COLUMN "master"."bank_account_house_config"."usage_type" IS 'Primary usage classification. DISBURSEMENT, COLLECTION, PAYROLL, TREASURY, ESCROW, PETTY_CASH.';

COMMENT ON COLUMN "master"."bank_account_house_config"."reconciliation_mode" IS 'How bank statement lines are matched. MANUAL, AUTO, SEMI_AUTO.';

CREATE TABLE "master"."bank_account_link" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "owner_type" text NOT NULL,
  "owner_id" uuid NOT NULL,
  "bank_account_id" uuid NOT NULL,
  "company_code_id" uuid,
  "purpose" text DEFAULT 'default'::text NOT NULL,
  "is_primary" boolean DEFAULT false NOT NULL,
  "effective_from" date DEFAULT CURRENT_DATE NOT NULL,
  "effective_until" date,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."bank_account_link" IS 'ARCHETYPE=C;SCOPE=T. Polymorphic M:N bridge: owner → bank_account with business purpose and temporal validity. Same pattern as master.address_link. One bank_account record can be shared by multiple owners without duplication. purpose conceptually correlates with address_link.purpose. No status lifecycle — temporal bridge; validity expressed via effective_from/effective_until.';

COMMENT ON COLUMN "master"."bank_account_link"."owner_type" IS 'Polymorphic discriminator. FK to master.owner_type.code. Values: ''business_partner'', ''company_code'', ''supplier'', ''customer'', ''employee''.';

COMMENT ON COLUMN "master"."bank_account_link"."company_code_id" IS 'Optional company-code scope. NULL = valid for all company codes. When set, this link is jurisdiction-specific. SAP LFB1 scoping.';

COMMENT ON COLUMN "master"."bank_account_link"."purpose" IS 'Business purpose of this link. Lookup: master.bank_account_link_purpose. default, disbursement, collection, payroll, refund, reimbursement, etc.';

COMMENT ON COLUMN "master"."bank_account_link"."is_primary" IS 'Canonical link when multiple exist for same owner+purpose. Enforced: at most one is_primary=true per owner+purpose per time period.';

COMMENT ON COLUMN "master"."bank_account_link"."effective_from" IS 'Inclusive start date of validity. DEFAULT CURRENT_DATE.';

COMMENT ON COLUMN "master"."bank_account_link"."effective_until" IS 'Exclusive end date. NULL = open-ended (currently active).';

CREATE TABLE "master"."bank_party" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "country_code" character(2) NOT NULL,
  "institution_type" text DEFAULT 'BANK'::text NOT NULL,
  "bic" text,
  "national_bank_code_type" text,
  "national_bank_code" text,
  "branch_code" text,
  "branch_name" text,
  "supports_swift" boolean DEFAULT false NOT NULL,
  "supports_local_clearing" boolean DEFAULT false NOT NULL,
  "supports_sepa" boolean DEFAULT false NOT NULL,
  "supports_ach" boolean DEFAULT false NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."bank_party" IS 'ARCHETYPE=B;SCOPE=T. Bank institution / branch registry. Reusable anchor for bank routing identity. Tenant-scoped, NOT company-scoped — one bank can serve multiple company codes. Address via address_link (owner_type=''bank_party''). SAP BNKA equivalent.';

CREATE TABLE "master"."brand_profile" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "palette" jsonb,
  "typography" jsonb,
  "spacing_scale" jsonb,
  "direction" text DEFAULT 'LTR'::text NOT NULL,
  "default_locale" text DEFAULT 'en'::text NOT NULL,
  "supported_locales" text[],
  "is_default" boolean DEFAULT false NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."brand_profile" IS 'ARCHETYPE=B;SCOPE=T. Tenant colour palette, typography, and locale settings. fn_enforce_single_default() ensures at most one active default per tenant. DEVIATION: is_active is a manual boolean (NOT GENERATED) — convert alongside status column stabilisation.';

COMMENT ON COLUMN "master"."brand_profile"."palette" IS 'Design-token colour map: primary, secondary, accent, surface, on-surface, etc.';

COMMENT ON COLUMN "master"."brand_profile"."typography" IS 'Font families, sizes, weights, and line-heights.';

COMMENT ON COLUMN "master"."brand_profile"."is_default" IS 'Partial unique index (is_default=true AND is_active=true) enforces single default.';

CREATE TABLE "master"."budget_allocation" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "budget_profile_id" uuid NOT NULL,
  "company_code_id" uuid NOT NULL,
  "fiscal_year" smallint NOT NULL,
  "currency_code" character(3) NOT NULL,
  "cost_center_id" uuid,
  "project_id" uuid,
  "gl_account_id" uuid,
  "profit_center_id" uuid,
  "dimension_set_id" uuid,
  "responsible_person_id" uuid,
  "allocated_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "reserved_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "consumed_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "released_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "available_amount" numeric(18,4) GENERATED ALWAYS AS ((((allocated_amount - reserved_amount) - consumed_amount) + released_amount)) STORED,
  "multi_year_strategy" text,
  "overspend_policy" text DEFAULT 'BLOCK'::text NOT NULL,
  "tolerance_pct" numeric(5,2) DEFAULT 0.00 NOT NULL,
  "requires_approval" boolean DEFAULT true NOT NULL,
  "approval_threshold" numeric(18,4),
  "is_carry_forward" boolean DEFAULT false NOT NULL,
  "carry_forward_from_id" uuid,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."budget_allocation" IS 'ARCHETYPE=B;SCOPE=T. Fund center authority: carves a slice of master.budget_profile to a specific cost center / project combination. This is the row that ledger.budget_balance, ledger.budget_transaction, and document.commitment draw against. available_amount = GENERATED (allocated - reserved - consumed + released). Effective overspend_policy = COALESCE(allocation.policy, profile.policy). multi_year_strategy NULL = inherit from budget_profile. Status lifecycle: draft → active → suspended → exhausted → closed | cancelled.';

COMMENT ON COLUMN "master"."budget_allocation"."multi_year_strategy" IS 'Allocation-level override of budget_profile.multi_year_strategy. NULL = inherit from parent profile. Values: CURRENT_YEAR_ONLY | HORIZON_SPREAD | FULL_RESERVE.';

CREATE TABLE "master"."budget_profile" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "company_code_id" uuid NOT NULL,
  "description" text,
  "fund_type" text DEFAULT 'OPERATING'::text NOT NULL,
  "fund_source" text DEFAULT 'INTERNAL'::text NOT NULL,
  "fund_category" text,
  "responsible_person_id" uuid,
  "currency_code" character(3) NOT NULL,
  "total_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "reserved_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "consumed_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "available_amount" numeric(18,4) GENERATED ALWAYS AS (((total_amount - reserved_amount) - consumed_amount)) STORED,
  "fiscal_year" smallint NOT NULL,
  "is_multi_year" boolean DEFAULT false NOT NULL,
  "valid_from" date,
  "valid_to" date,
  "multi_year_strategy" text DEFAULT 'CURRENT_YEAR_ONLY'::text NOT NULL,
  "is_replenishable" boolean DEFAULT false NOT NULL,
  "replenish_method" text,
  "replenish_frequency" text,
  "overspend_policy" text DEFAULT 'BLOCK'::text NOT NULL,
  "tolerance_pct" numeric(5,2) DEFAULT 0.00 NOT NULL,
  "requires_approval" boolean DEFAULT true NOT NULL,
  "approval_threshold" numeric(18,4),
  "parent_profile_id" uuid,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."budget_profile" IS 'ARCHETYPE=B;SCOPE=T. Approved budget envelope: operating budgets, capital programmes, grants, project funds. Top-level authority from which master.budget_allocation rows are carved per fund center. available_amount = GENERATED (total - reserved - consumed). reserved_amount/consumed_amount are aggregated upward from budget_allocation via trigger/service. multi_year_strategy: CURRENT_YEAR_ONLY | HORIZON_SPREAD | FULL_RESERVE. Status lifecycle: draft → active → suspended → closed | cancelled.';

COMMENT ON COLUMN "master"."budget_profile"."multi_year_strategy" IS 'Controls how commitments straddling fiscal-year boundaries reserve budget. CURRENT_YEAR_ONLY: reserve only in current year; cross-year reserved when year opens. HORIZON_SPREAD: spread proportionally across all affected fiscal years. FULL_RESERVE: reserve full value immediately against current budget.';

CREATE TABLE "master"."business_intent" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "domain" text NOT NULL,
  "subtype" text,
  "parent_id" uuid,
  "path" text,
  "depth" smallint DEFAULT 0 NOT NULL,
  "visibility" text DEFAULT 'STANDARD'::text NOT NULL,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" shared.active_inactive_archived_d DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS (((status)::text = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."business_intent" IS 'ARCHETYPE=B;SCOPE=T. Business intent purpose/domain ontology. Seeded records are domain-level only; commodity category buy/sell policies own posting, tax, approval, asset, and selection behavior. UNIQUE(tenant_id, id) enables tenant-composite parent FK.';

CREATE TABLE "master"."business_partner" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "display_name" text,
  "partner_category" text DEFAULT 'organization'::text NOT NULL,
  "legal_name" text,
  "legal_form" text,
  "registration_no" text,
  "registration_country_code" character(2),
  "tax_residence_country_code" character(2),
  "tax_jurisdiction_id" uuid,
  "website_url" text,
  "parent_business_partner_id" uuid,
  "description" text,
  "long_description" text,
  "aliases" text[] DEFAULT '{}'::text[] NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "business_types" text[] DEFAULT '{}'::text[] NOT NULL,
  "founded_year" smallint,
  "employee_count_band" text,
  "annual_revenue_band" text,
  "incorporation_date" date,
  "effective_from" date,
  "effective_until" date,
  "external_ref" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid,
  "level_no" smallint DEFAULT 1 NOT NULL,
  "path" text
);

COMMENT ON TABLE "master"."business_partner" IS 'ARCHETYPE=B;SCOPE=T. Canonical commercial identity — any party we do business with. Legal/registration/profile fields live here. Customer and Supplier are role tables: see master.customer, master.supplier. Network account linking: master.business_partner_network_link. Addresses via address_link (owner_type=''business_partner''). Identifiers via party_identifier (owner_type=''business_partner'').';

COMMENT ON COLUMN "master"."business_partner"."partner_category" IS 'Commercial classification: organization | individual | government | internal. Governs which tabs and workflows are available in the UI.';

COMMENT ON COLUMN "master"."business_partner"."legal_name" IS 'Full registered legal name. Used on invoices, contracts, tax certificates. May differ from trading name in business_partner.name.';

COMMENT ON COLUMN "master"."business_partner"."registration_no" IS 'Company registration / incorporation number. Free text — format varies by jurisdiction.';

COMMENT ON COLUMN "master"."business_partner"."parent_business_partner_id" IS 'Self-referential group hierarchy for multi-entity corporate groups. NULL = top-level.';

COMMENT ON COLUMN "master"."business_partner"."level_no" IS 'Depth in the corporate group hierarchy (1 = root / holding). Maintained by trigger trg_bp_hierarchy_path_sync.';

COMMENT ON COLUMN "master"."business_partner"."path" IS 'Materialized ancestor path: ''/root-id/parent-id/self-id''. Maintained by trigger trg_bp_hierarchy_path_sync.';

CREATE TABLE "master"."business_partner_network_capability" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "business_partner_id" uuid NOT NULL,
  "provider_code" text NOT NULL,
  "document_type_id" text NOT NULL,
  "document_direction" text DEFAULT 'both'::text NOT NULL,
  "profile_id" text,
  "profile_version" text,
  "is_supported" boolean DEFAULT true NOT NULL,
  "verified_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."business_partner_network_capability" IS 'ARCHETYPE=B;SCOPE=T. Document-type routing capabilities per BP network account. One row per (BP, provider, document_type, direction). Required for Peppol 4-corner routing (send/receive capability per document type). profile_id holds the BIS / UBL profile URN for the supported specification.';

CREATE TABLE "master"."business_partner_network_link" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "business_partner_id" uuid NOT NULL,
  "provider_code" text NOT NULL,
  "network_account_id" text NOT NULL,
  "external_party_id" text,
  "remote_tenant_id" uuid,
  "remote_business_partner_id" uuid,
  "connection_status" text DEFAULT 'not_linked'::text NOT NULL,
  "verification_status" text DEFAULT 'unverified'::text NOT NULL,
  "match_confidence" numeric(5,2),
  "sync_status" text DEFAULT 'pending'::text NOT NULL,
  "last_synced_at" timestamp with time zone,
  "invited_at" timestamp with time zone,
  "connected_at" timestamp with time zone,
  "network_snapshot" jsonb,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid,
  "invitation_token" text,
  "invitation_expires_at" timestamp with time zone,
  "invitation_message" text,
  "mesh_connection_code" text,
  "last_projected_at" timestamp with time zone,
  "projection_sequence_no" bigint
);

COMMENT ON TABLE "master"."business_partner_network_link" IS 'ARCHETYPE=B;SCOPE=T. External network account links for a business partner. One row per (BP, provider). Tracks connection, verification, and sync state. Full sync logs and network snapshots belong in the Network tab/drawer, not headers.';

COMMENT ON COLUMN "master"."business_partner_network_link"."provider_code" IS 'Network provider: athyper_network | ariba | peppol | tradeshift | custom.';

COMMENT ON COLUMN "master"."business_partner_network_link"."remote_tenant_id" IS 'Legacy same-platform peer tenant. For Mesh exchange connections, this is a projection concern and Mesh owns peer validation.';

COMMENT ON COLUMN "master"."business_partner_network_link"."connection_status" IS 'For provider_code=athyper_mesh this is a Mesh projection field, not Neon-owned connection truth.';

COMMENT ON COLUMN "master"."business_partner_network_link"."invitation_token" IS 'Deprecated for Mesh invitations. Mesh owns token generation/storage; Neon must not store plaintext invitation tokens after cutover.';

COMMENT ON COLUMN "master"."business_partner_network_link"."invitation_expires_at" IS 'Deprecated for Mesh invitations. Mesh.network_invitation owns expiry after cutover.';

COMMENT ON COLUMN "master"."business_partner_network_link"."invitation_message" IS 'Deprecated for Mesh invitations. Mesh.network_invitation owns invitation message after cutover.';

COMMENT ON COLUMN "master"."business_partner_network_link"."mesh_connection_code" IS 'Optional Mesh network_connection.connection_code captured by projection/backfill. Not a database FK because Mesh is physically separate.';

COMMENT ON COLUMN "master"."business_partner_network_link"."last_projected_at" IS 'Timestamp of the latest Mesh event projected into this Neon network-link shadow row.';

COMMENT ON COLUMN "master"."business_partner_network_link"."projection_sequence_no" IS 'Latest mesh.network_event.sequence_no applied to this row. Used for replay drift detection.';

CREATE TABLE "master"."business_partner_relation" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "from_bp_id" uuid NOT NULL,
  "to_bp_id" uuid NOT NULL,
  "relation_type" text NOT NULL,
  "custom_type" text,
  "direction" text DEFAULT 'directional'::text NOT NULL,
  "country_scope" character(2)[],
  "product_scope" text,
  "effective_from" date,
  "effective_until" date,
  "notes" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."business_partner_relation" IS 'ARCHETYPE=B;SCOPE=T. General commercial relationship between two business partners. Covers distributor/agent/JV/consortium/reseller links not handled by master.intercompany_trading_pair (which requires company-code routing). direction=bidirectional means one row covers both directions (A ↔ B). country_scope=NULL means global coverage.';

CREATE TABLE "master"."career_band" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "master"."career_level" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "career_band_id" uuid,
  "level_no" smallint DEFAULT 1 NOT NULL,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "master"."certification" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "owner_type" text NOT NULL,
  "owner_id" uuid NOT NULL,
  "certification_type_id" uuid,
  "custom_name" text,
  "certificate_number" text,
  "certified_by" text,
  "certified_location" text,
  "additional_info" text,
  "document_attachment_id" uuid,
  "effective_from" date,
  "effective_until" date,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid,
  "company_code_id" uuid,
  "site_id" uuid
);

COMMENT ON TABLE "master"."certification" IS 'ARCHETYPE=B;SCOPE=T. Polymorphic certification record for any party or entity. owner_type: business_partner | supplier | customer | company_code | employee | product. Distinct from document.wht_certificate (financial WHT instrument, not compliance cert).';

COMMENT ON COLUMN "master"."certification"."certification_type_id" IS 'Registered certification type FK. Exactly one of certification_type_id or custom_name must be set (enforced by cert_type_xor_custom CHECK). NULL when supplier uses the "not in list" freetext path.';

COMMENT ON COLUMN "master"."certification"."document_attachment_id" IS 'FK â†’ master.attachment. The uploaded certificate document (PDF, JPG, PNG).';

COMMENT ON COLUMN "master"."certification"."company_code_id" IS 'Optional: restricts certificate scope to one company code. NULL = applies to the entire owner party.';

COMMENT ON COLUMN "master"."certification"."site_id" IS 'Optional: restricts certificate scope to one physical site (e.g. ISO 9001 for Jakarta plant). NULL = applies to the entire owner party.';

CREATE TABLE "master"."certification_type" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "issuing_body" text,
  "category" text,
  "description" text,
  "is_custom" boolean DEFAULT false NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."certification_type" IS 'ARCHETYPE=A;SCOPE=P+T. Certification type registry. Platform-seeded (tenant_id IS NULL): ISO, HALAL, ESG standards. Tenant-custom (tenant_id IS NOT NULL, is_custom = true): tenant-specific types.';

COMMENT ON COLUMN "master"."certification_type"."tenant_id" IS 'NULL = platform-wide standard available to all tenants. UUID = tenant-scoped custom type.';

CREATE TABLE "master"."change_reason_code" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "category" text NOT NULL,
  "severity" text DEFAULT 'normal'::text NOT NULL,
  "is_system" boolean DEFAULT false NOT NULL,
  "sort_order" smallint DEFAULT 100 NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."change_reason_code" IS 'ARCHETYPE=L;SCOPE=T. Controlled reason lookup for high-risk audit-log entries. log.audit_log.reason_code FKs here. System-seeded base set ships with the platform; tenants may add their own reasons (is_system=false).';

COMMENT ON COLUMN "master"."change_reason_code"."code" IS 'Stable identifier used by code paths to require/select a reason. Lowercase, no spaces.';

COMMENT ON COLUMN "master"."change_reason_code"."category" IS 'Which kind of mutation this reason explains: workflow / accounting / financial / snapshot.';

COMMENT ON COLUMN "master"."change_reason_code"."severity" IS 'normal | elevated | critical — drives downstream surfacing (compliance reports, dashboards, re-approval gates).';

CREATE TABLE "master"."chart_of_account" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "framework" text,
  "country_code" character(2),
  "account_range" text DEFAULT '1000-9999'::text,
  "version" integer DEFAULT 1 NOT NULL,
  "is_locked" boolean DEFAULT false NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid,
  "base_currency_id" uuid,
  "account_level_count" smallint,
  "is_default" boolean DEFAULT false NOT NULL
);

COMMENT ON TABLE "master"."chart_of_account" IS 'ARCHETYPE=B;SCOPE=T. Shared accounting structure header. Contains GL accounts as hierarchical children.';

CREATE TABLE "master"."comment" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "context_type" text DEFAULT 'entity'::text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "comment_intent" text DEFAULT 'general'::text NOT NULL,
  "commenter_id" uuid NOT NULL,
  "comment_text" text NOT NULL,
  "mentions" jsonb,
  "content_format" text DEFAULT 'plain'::text NOT NULL,
  "content_json" jsonb,
  "content_html" text,
  "attachment_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "parent_comment_id" uuid,
  "thread_depth" smallint DEFAULT 0 NOT NULL,
  "visibility" text DEFAULT 'public'::text NOT NULL,
  "deleted_at" timestamp with time zone,
  "deleted_by" uuid,
  "archived_at" timestamp with time zone,
  "archived_by" uuid,
  "retention_until" timestamp with time zone,
  "retention_policy_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid,
  "status" text DEFAULT 'open'::text NOT NULL
);

COMMENT ON TABLE "master"."comment" IS 'ARCHETYPE=C;SCOPE=T. Threaded comments on any entity. Renamed from entity_comment. Absorbs attachment_comment via context_type=''attachment''. context_type validated via document.comment_type lookup (extensible). Soft-delete: filter deleted_at IS NULL in all production queries. Thread depth capped at 5 (CHECK + hierarchy trigger).';

COMMENT ON COLUMN "master"."comment"."context_type" IS 'Comment surface discriminator. Lookup: document.comment_type. entity=any business entity, attachment=file, approval=approval instance, chat_message=conversation message.';

COMMENT ON COLUMN "master"."comment"."comment_intent" IS 'Semantic role (lookup: document.comment_intent). Orthogonal to context_type. Set by entity_flow_field.metadata.target when a flow writes the comment.';

COMMENT ON COLUMN "master"."comment"."mentions" IS 'JSON array of @-mention objects: [{user_id: uuid, display_name: text}]. Validated by trg_validate_comment_mentions trigger.';

COMMENT ON COLUMN "master"."comment"."content_format" IS 'Serialization format: plain (legacy), rich_json (TipTap doc), sanitized_html.';

COMMENT ON COLUMN "master"."comment"."content_json" IS 'TipTap ProseMirror document JSON. Canonical source of truth for rich comments.';

COMMENT ON COLUMN "master"."comment"."content_html" IS 'TipTap-serialized HTML generated from content_json on the client. Safe to render — produced by TipTap serializer, not from raw user HTML.';

COMMENT ON COLUMN "master"."comment"."attachment_refs" IS 'Ordered inline/block attachment references: [{attachment_id, mode}]. mode: inline_image | file_chip. Reserved for v2 inline-image support.';

COMMENT ON COLUMN "master"."comment"."thread_depth" IS 'Nesting depth. 0=root, 1=reply, max 5. Enforced by CHECK constraint AND trg_comment_hierarchy_guard trigger.';

CREATE TABLE "master"."comment_draft" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "principal_id" uuid NOT NULL,
  "context_type" text DEFAULT 'entity'::text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "parent_comment_id" uuid,
  "draft_text" text NOT NULL,
  "content_json" jsonb,
  "content_html" text,
  "attachment_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "visibility" text DEFAULT 'public'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."comment_draft" IS 'ARCHETYPE=C;SCOPE=T. Auto-saved pre-submit comment drafts. One row per (principal, entity, parent_comment_id). Deleted on submit or discard. Not a comment — never referenced by other tables. context_type validated via document.comment_type lookup.';

CREATE TABLE "master"."comment_feed_cursor" (
  "id" uuid DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "principal_id" uuid NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "last_read_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone
);

COMMENT ON TABLE "master"."comment_feed_cursor" IS 'ARCHETYPE=C;SCOPE=T. Per-principal watermark for comment thread read tracking. One row per (tenant, principal, entity). Upserted on thread open. Enables O(1) unread-count queries without scanning activity_log.';

COMMENT ON COLUMN "master"."comment_feed_cursor"."last_read_at" IS 'Timestamp of the last time this principal opened the comment thread. Comments created after this timestamp are counted as unread.';

CREATE TABLE "master"."comment_mention" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "context_type" text NOT NULL,
  "comment_id" uuid NOT NULL,
  "mentioned_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "master"."comment_mention" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. @-mention extraction table. One row per (comment, mentioned principal). Populated by trigger on master.comment INSERT/UPDATE. Enables O(1) "who was mentioned in this comment" queries. context_type mirrors master.comment.context_type.';

CREATE TABLE "master"."comment_reaction" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "context_type" text NOT NULL,
  "comment_id" uuid NOT NULL,
  "principal_id" uuid NOT NULL,
  "reaction_type" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "master"."comment_reaction" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. Emoji reactions on comments. One row per (principal, comment, reaction_type). Unique constraint prevents duplicate reactions. reaction_type in document.reaction_type lookup (extensible — tenants add custom emoji). context_type mirrors master.comment.context_type.';

CREATE TABLE "master"."commodity_category" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "parent_id" uuid,
  "root_category_id" uuid NOT NULL,
  "level_no" smallint,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "buy_allowed" boolean DEFAULT false NOT NULL,
  "sell_allowed" boolean DEFAULT false NOT NULL,
  "inventory_allowed" boolean DEFAULT false NOT NULL,
  "is_classification_required" boolean DEFAULT false NOT NULL,
  "is_hs_required" boolean DEFAULT false NOT NULL,
  "is_regulated" boolean DEFAULT false NOT NULL,
  "allowed_classification_domains" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "uom_code" text,
  "sales_revenue_recognition_method" text DEFAULT 'POINT_IN_TIME'::text NOT NULL,
  "sales_variable_consideration" text,
  "sales_standalone_selling_price_method" text,
  "is_stockable" boolean DEFAULT false NOT NULL,
  "is_consumable" boolean DEFAULT false NOT NULL,
  "default_valuation_method" text,
  "is_lot_tracking_allowed" boolean DEFAULT false NOT NULL,
  "is_lot_tracking_required" boolean DEFAULT false NOT NULL,
  "is_serial_tracking_allowed" boolean DEFAULT false NOT NULL,
  "is_serial_tracking_required" boolean DEFAULT false NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."commodity_category" IS 'ARCHETYPE=B;SCOPE=T. Shared commodity taxonomy: what the product/item/service is. Base buy, sell, inventory, classification, sales, and stock behavior lives on this table. Scoped intent, GL, asset, tax, revenue, and warehouse overrides live in control.commodity_category_*_policy tables. External standards such as UNSPSC, HS, and NAICS are linked through master.commodity_classification with owner_type=commodity_category.';

CREATE TABLE "master"."commodity_classification" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "owner_type" text NOT NULL,
  "owner_id" uuid NOT NULL,
  "classification_type" text NOT NULL,
  "domain_code" text NOT NULL,
  "code_id" uuid NOT NULL,
  "mapping_type" text DEFAULT 'exact'::text NOT NULL,
  "confidence" numeric(5,2),
  "provenance" text DEFAULT 'manual'::text NOT NULL,
  "is_primary" boolean DEFAULT false NOT NULL,
  "description" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."commodity_classification" IS 'ARCHETYPE=B;SCOPE=T. Unified M:N bridge mapping any tenant entity to any system classification code in any domain (UNSPSC, HS, NAICS, ISIC, GICS, SITC). Polymorphic owner_type + owner_id → entity, polymorphic classification_type → commodity_code or industry_code. EXCLUDE constraint ensures at most one primary per (entity, type, domain).';

CREATE TABLE "master"."company_code" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "display_name" text,
  "legal_entity_id" uuid NOT NULL,
  "description" text,
  "functional_currency" character(3) NOT NULL,
  "country_code" character(2),
  "fiscal_year_start_month" smallint DEFAULT 1 NOT NULL,
  "fiscal_year_variant" text DEFAULT 'calendar'::text,
  "default_ledger_book_id" uuid,
  "regulatory_framework" text,
  "timezone_code" text,
  "locale_code" text,
  "date_format" text,
  "week_start" smallint,
  "tax_registration_number" text,
  "tax_jurisdiction_id" uuid,
  "is_intercompany_enabled" boolean DEFAULT false NOT NULL,
  "external_ref" text,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid,
  "reporting_currency" character(3),
  "group_currency" character(3),
  "local_currency_id" uuid,
  "accounting_currency_id" uuid,
  "chart_of_account_id" uuid,
  "company_code_type" text
);

COMMENT ON TABLE "master"."company_code" IS 'ARCHETYPE=B;SCOPE=T. Accounting / posting / balancing unit within a legal entity. Addresses via master.address_link (owner_type=''company_code''). Contacts via master.contact_link (owner_type=''company_code'').';

COMMENT ON COLUMN "master"."company_code"."reporting_currency" IS 'Group / consolidation reporting currency. NULL = inherit from legal_entity.reporting_currency. Explicit value required for company codes that report in a currency different from their LE.';

COMMENT ON COLUMN "master"."company_code"."group_currency" IS 'Hard currency for parallel valuation (e.g. USD peg for HK subsidiaries). NULL = not applicable.';

CREATE TABLE "master"."company_code_book_assignment" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "company_code_id" uuid NOT NULL,
  "book_id" uuid NOT NULL,
  "alternate_coa_prefix" text,
  "override_currency_code" character(3),
  "effective_from" date DEFAULT CURRENT_DATE NOT NULL,
  "effective_to" date,
  "priority" smallint DEFAULT 0 NOT NULL,
  "conflict_strategy" text DEFAULT 'highest_priority'::text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."company_code_book_assignment" IS 'ARCHETYPE=B;SCOPE=T. Bridge: which books each company_code uses. Controls which ledger books receive journal entries for a given company. Temporal with effective dates.';

CREATE TABLE "master"."company_code_chart_assignment" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text DEFAULT ''::text NOT NULL,
  "name" text DEFAULT ''::text NOT NULL,
  "company_code_id" uuid NOT NULL,
  "chart_of_account_id" uuid NOT NULL,
  "assignment_type" text DEFAULT 'operating'::text NOT NULL,
  "is_primary" boolean DEFAULT false NOT NULL,
  "effective_from" date,
  "effective_to" date,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."company_code_chart_assignment" IS 'ARCHETYPE=B;SCOPE=T. Bridge table linking company_code to chart_of_account with assignment type (operating/local/group).';

CREATE TABLE "master"."company_code_customer_profile" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "company_code_id" uuid NOT NULL,
  "credit_limit" numeric(18,4),
  "credit_limit_currency_code" character(3),
  "credit_rating" text,
  "is_blocked" boolean DEFAULT false NOT NULL,
  "block_reason" text,
  "default_accounting_profile_id" uuid,
  "tax_group_id" uuid,
  "default_receipt_method_id" uuid,
  "default_dimension_set_id" uuid,
  "payment_term_id" uuid,
  "currency_code" character(3),
  "statement_cycle_code" text,
  "dunning_policy_id" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."company_code_customer_profile" IS 'ARCHETYPE=B;SCOPE=T. Company-specific AR settings per customer. One customer can have different credit limits, payment terms, and GL accounts per company_code. SAP KNB1 equivalent.';

COMMENT ON COLUMN "master"."company_code_customer_profile"."default_accounting_profile_id" IS 'FK to master.accounting_profile. AP postings resolve via posting roles. Supersedes ar_gl_account_id.';

COMMENT ON COLUMN "master"."company_code_customer_profile"."default_receipt_method_id" IS 'Default collection/receipt method. Direction must be INBOUND or BOTH.';

CREATE TABLE "master"."company_code_dimension_default" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "company_code_id" uuid NOT NULL,
  "dimension_type_id" uuid NOT NULL,
  "dimension_value_id" uuid NOT NULL,
  "is_mandatory" boolean DEFAULT false NOT NULL,
  "allow_override" boolean DEFAULT true NOT NULL,
  "effective_from" date DEFAULT CURRENT_DATE NOT NULL,
  "effective_to" date,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" shared.active_inactive_d DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS (((status)::text = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."company_code_dimension_default" IS 'ARCHETYPE=B;SCOPE=T. Company code dimension defaults. Temporal: EXCLUDE prevents overlapping active defaults for the same (company_code, dimension_type). Multiple rows allowed for history + future. Full company_code_id match validated at runtime by master.validate_dimension_company_scope() during posting.';

CREATE TABLE "master"."company_code_gl_account" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text DEFAULT ''::text NOT NULL,
  "name" text DEFAULT ''::text NOT NULL,
  "company_code_id" uuid NOT NULL,
  "gl_account_id" uuid NOT NULL,
  "posting_allowed" boolean DEFAULT true NOT NULL,
  "blocked_for_manual" boolean DEFAULT false NOT NULL,
  "blocked_for_auto" boolean DEFAULT false NOT NULL,
  "requires_cost_center" boolean DEFAULT false NOT NULL,
  "requires_profit_center" boolean DEFAULT false NOT NULL,
  "requires_project" boolean DEFAULT false NOT NULL,
  "default_cost_center_id" uuid,
  "default_site_id" uuid,
  "tax_category" text,
  "reconciliation_type" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."company_code_gl_account" IS 'ARCHETYPE=B;SCOPE=T. Per-company posting controls for GL accounts. Controls posting permissions, dimension requirements, and default assignments.';

CREATE TABLE "master"."company_code_supplier_profile" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "supplier_id" uuid NOT NULL,
  "company_code_id" uuid NOT NULL,
  "is_blocked" boolean DEFAULT false NOT NULL,
  "block_reason" text,
  "currency_code" character(3),
  "default_accounting_profile_id" uuid,
  "payment_term_id" uuid,
  "payment_method_id" uuid,
  "preferred_remittance_bank_link_id" uuid,
  "tax_group_id" uuid,
  "default_wht_tax_group_id" uuid,
  "default_dimension_set_id" uuid,
  "invoice_hold_policy_id" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."company_code_supplier_profile" IS 'ARCHETYPE=B;SCOPE=T. Company-specific AP settings per supplier. One supplier can have different payment terms, methods, tax defaults, accounting profile, and control gates per company_code. SAP LFB1 equivalent.';

COMMENT ON COLUMN "master"."company_code_supplier_profile"."default_accounting_profile_id" IS 'FK to master.accounting_profile. AP postings resolve via posting roles. Supplier-specific GL exceptions live in control.supplier_posting_override.';

COMMENT ON COLUMN "master"."company_code_supplier_profile"."payment_method_id" IS 'FK to master.payment_method. Direction must be OUTBOUND or BOTH.';

COMMENT ON COLUMN "master"."company_code_supplier_profile"."preferred_remittance_bank_link_id" IS 'FK to master.bank_account_link. Must belong to same supplier and compatible company scope.';

COMMENT ON COLUMN "master"."company_code_supplier_profile"."default_wht_tax_group_id" IS 'FK to control.tax_group. Group should contain WHT components only.';

CREATE TABLE "master"."condition_type" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "term_type" text NOT NULL,
  "term_sub_type" text,
  "default_basis" text NOT NULL,
  "default_rate" numeric(20,10),
  "default_amount" numeric(18,4),
  "default_apportion_basis" text,
  "is_taxable" boolean DEFAULT false NOT NULL,
  "is_apportionable" boolean DEFAULT true NOT NULL,
  "applies_to_classes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "default_cost_effect" text DEFAULT 'NO_COST_EFFECT'::text NOT NULL,
  "default_posting_pattern" text DEFAULT 'MEMO_ONLY'::text NOT NULL,
  "default_distribution_policy" text DEFAULT 'INHERIT_LINE'::text NOT NULL,
  "default_capitalization_policy" text DEFAULT 'FOLLOW_LINE'::text NOT NULL,
  "default_posting_role_code" text,
  "is_system" boolean DEFAULT false NOT NULL,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."condition_type" IS 'ARCHETYPE=B;SCOPE=T. PC-facing pricing-component condition catalog (term picker source). System-seeded base set (is_system=true, tenant_id NULL) covers procurement charges (freight, insurance, customs duty), tax kinds (VAT/GST/HST/PST/Sales/Use), withholding, retentions, and the principal_marker. Tenants can add custom rows via standard CRUD with is_system=false. Tax/withholding jurisdictional internals live in master.tax_type + control.tax_rate_schedule + control.tax_group; master.tax_type.condition_type_id back-points here.';

CREATE TABLE "master"."contact_email" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "contact_link_id" uuid NOT NULL,
  "local_part" text,
  "domain" text,
  "is_disposable" boolean DEFAULT false NOT NULL,
  "mx_checked_at" timestamp with time zone,
  "mx_valid" boolean,
  "bounce_count" integer DEFAULT 0 NOT NULL,
  "last_bounce_at" timestamp with time zone,
  "last_bounce_reason" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."contact_email" IS 'ARCHETYPE=C;SCOPE=T. 1:1 extension of contact_link for channel_type=email. Deliverability metadata and parsed components.';

CREATE TABLE "master"."contact_link" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text,
  "name" text,
  "owner_type" text NOT NULL,
  "owner_id" uuid NOT NULL,
  "channel_type" text NOT NULL,
  "value" text NOT NULL,
  "purpose" text,
  "role_qualifier" text,
  "is_primary" boolean DEFAULT false NOT NULL,
  "is_verified" boolean DEFAULT false NOT NULL,
  "verified_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."contact_link" IS 'ARCHETYPE=B;SCOPE=T. Polymorphic canonical address store. One row per owner+channel+purpose+role_qualifier. Detail in contact_email/contact_phone.';

COMMENT ON COLUMN "master"."contact_link"."purpose" IS 'Canonical business role this contact channel plays. Lookup: master.contact_link_purpose (15 values across auth, business, generic). Auth bucket (login/recovery/mfa/verification) is reserved for principal/employee. Business bucket mirrors address vocabulary (bill_to/remit_to/bill_from/ship_to/ship_from/place_of_service/correspondence). Generic: support/notification/marketing/default. Organizational owners may use default, correspondence, or notification purposes with controlled role qualifiers. Reserved ''default'' = universal fallback resolved by fn_resolve_contact().';

COMMENT ON COLUMN "master"."contact_link"."role_qualifier" IS 'Optional sub-classification within purpose. Free text snake_case. Examples: purpose=correspondence + role_qualifier=legal_notice / tax_filing / account_statement / payslip / emergency. NULL means the role applies generically. Lookup-validated against master.contact_role_qualifier (advisory only). FORBIDDEN on auth purposes (login/recovery/mfa/verification) — see contact_link_auth_no_qualifier_chk.';

CREATE TABLE "master"."contact_marketing_consent" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "owner_type" text NOT NULL,
  "owner_id" uuid NOT NULL,
  "status" text NOT NULL,
  "status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "status_changed_by" uuid,
  "channel_scope" text[],
  "consent_source" text,
  "evidence_url" text,
  "consent_text" text,
  "consent_locale" text,
  "captured_ip" inet,
  "captured_ua" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."contact_marketing_consent" IS 'ARCHETYPE=B;SCOPE=T. Marketing consent state per owner. Send-path MUST check this BEFORE resolving any contact_link with purpose=marketing. Status=opted_in is the ONLY value that permits sending. Consent provenance is a legal record — updates always set status_changed_at; do not hard-delete (use status=opted_out or status=unknown). Polymorphic owner key matches contact_link / address_link.';

COMMENT ON COLUMN "master"."contact_marketing_consent"."owner_type" IS 'Polymorphic discriminator. FK to master.owner_type.code. Typical values: business_partner, customer, supplier, employee, principal.';

COMMENT ON COLUMN "master"."contact_marketing_consent"."status" IS 'Consent state. Lookup: master.marketing_consent_status. Marketing send-path must check status = ''opted_in'' before resolving a marketing-purpose contact.';

COMMENT ON COLUMN "master"."contact_marketing_consent"."channel_scope" IS 'Channel-specific scope. NULL = umbrella (all marketing channels). Non-null array = partial: e.g. ARRAY[''email''] means email-only opt-out, phone-marketing still allowed under jurisdiction-specific rules.';

COMMENT ON COLUMN "master"."contact_marketing_consent"."evidence_url" IS 'URL to double-opt-in confirmation evidence (e.g. tracked email click, signed PDF).';

COMMENT ON COLUMN "master"."contact_marketing_consent"."consent_text" IS 'EXACT text the owner agreed to at capture time. Required for GDPR/CASL audits.';

CREATE TABLE "master"."contact_phone" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "contact_link_id" uuid NOT NULL,
  "e164" text,
  "calling_code" text,
  "national_number" text,
  "carrier_hint" text,
  "line_type" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."contact_phone" IS 'ARCHETYPE=C;SCOPE=T. 1:1 extension of contact_link for phone/sms/whatsapp. E.164 decomposition and carrier metadata.';

CREATE TABLE "master"."content_item" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "title" text NOT NULL,
  "kind" text DEFAULT 'page'::text NOT NULL,
  "parent_id" uuid,
  "locale_code" text DEFAULT 'en'::text NOT NULL,
  "slug" text NOT NULL,
  "summary" text,
  "current_version_id" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'DRAFT'::text NOT NULL,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid,
  "preview_text" text,
  "preview_html" text,
  "preview_generated_at" timestamp with time zone
);

COMMENT ON TABLE "master"."content_item" IS 'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Versioned content header. Body snapshots in snapshot.content_item_version. current_version_id → snapshot.content_item_version via DEFERRABLE FK (06_constraints). Lifecycle mirrors master.template: UPPERCASE status, no is_active. Multilingual: slug uniqueness includes locale_code. Multiple locales for one logical content item are modelled as sibling rows sharing the same code.';

COMMENT ON COLUMN "master"."content_item"."code" IS 'Stable internal key. Never changes when title or slug is updated.';

COMMENT ON COLUMN "master"."content_item"."kind" IS 'Content functional category. Lookup: master.content_item_kind. e.g. page, article, snippet, announcement.';

COMMENT ON COLUMN "master"."content_item"."locale_code" IS 'BCP 47 locale tag (e.g. en, fr, ar). Part of slug uniqueness key.';

COMMENT ON COLUMN "master"."content_item"."slug" IS 'URL-visible path segment. Format: lowercase alphanumeric + hyphens/underscores. Unique per (tenant_id, parent_id, locale_code).';

COMMENT ON COLUMN "master"."content_item"."summary" IS 'Short plain-text excerpt for listings and search results. Not versioned.';

COMMENT ON COLUMN "master"."content_item"."current_version_id" IS 'Points to the active snapshot. NULL until first version is saved. FK is DEFERRABLE INITIALLY DEFERRED — item + first version can be inserted atomically in a single transaction.';

COMMENT ON COLUMN "master"."content_item"."preview_text" IS 'Plain-text excerpt generated by the cms-preview worker from the current version body_json. Max ~500 chars. NULL until first version is processed. Used for search snippets.';

COMMENT ON COLUMN "master"."content_item"."preview_html" IS 'HTML snippet (first 3 rendered paragraphs) generated by the cms-preview worker. NULL until first version is processed. Used for embed/preview cards.';

COMMENT ON COLUMN "master"."content_item"."preview_generated_at" IS 'Timestamp when the cms-preview worker last wrote preview_text/preview_html. NULL = preview pending. Use to detect stale previews after version updates.';

CREATE TABLE "master"."content_item_link" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "source_content_item_id" uuid NOT NULL,
  "target_content_item_id" uuid NOT NULL,
  "relation_type" text DEFAULT 'related'::text NOT NULL,
  "display_order" integer DEFAULT 0 NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "master"."content_item_link" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. Directional cross-reference graph between content items. relation_type is extensible via master.content_item_link_relation_type lookup.';

COMMENT ON COLUMN "master"."content_item_link"."relation_type" IS 'Link classification. Lookup: master.content_item_link_relation_type. e.g. related, embed, see_also.';

COMMENT ON COLUMN "master"."content_item_link"."display_order" IS 'Sort order for rendering outbound links from source item.';

CREATE TABLE "master"."conversation" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "type" text DEFAULT 'dm'::text NOT NULL,
  "title" text,
  "entity_type" text,
  "entity_id" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "deleted_at" timestamp with time zone,
  "deleted_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."conversation" IS 'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Messaging conversation envelope. type validated via master.conversation_type lookup. entity_type + entity_id optionally anchor a conversation to a business entity. Participants tracked in master.conversation_participant.';

CREATE TABLE "master"."conversation_participant" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "conversation_id" uuid NOT NULL,
  "principal_id" uuid NOT NULL,
  "role" text DEFAULT 'member'::text NOT NULL,
  "last_read_message_id" uuid,
  "last_read_at" timestamp with time zone,
  "joined_at" timestamp with time zone DEFAULT now() NOT NULL,
  "left_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."conversation_participant" IS 'ARCHETYPE=C;SCOPE=T. Conversation membership roster with read cursor. One row per (conversation, principal). last_read_message_id + last_read_at enable unread message counts. left_at IS NULL = currently active member.';

CREATE TABLE "master"."cost_center" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "company_code_id" uuid NOT NULL,
  "parent_id" uuid,
  "level_no" smallint DEFAULT 1 NOT NULL,
  "path" text,
  "node_type" text DEFAULT 'posting'::text NOT NULL,
  "description" text,
  "cost_center_category" text DEFAULT 'admin'::text NOT NULL,
  "profit_center_id" uuid,
  "responsible_person_id" uuid,
  "site_id" uuid,
  "currency_code" character(3),
  "is_statistical" boolean DEFAULT false NOT NULL,
  "valid_from" date,
  "valid_to" date,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."cost_center" IS 'ARCHETYPE=B;SCOPE=T. Responsibility center for cost tracking. Hierarchical tree scoped to a company_code.';

CREATE TABLE "master"."customer" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "business_partner_id" uuid NOT NULL,
  "customer_code" text NOT NULL,
  "customer_type" text DEFAULT 'corporate'::text NOT NULL,
  "account_manager_id" uuid,
  "is_key_account" boolean DEFAULT false NOT NULL,
  "risk_rating" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."customer" IS 'ARCHETYPE=B;SCOPE=T. AR role of a business partner. Thin role table — legal/identity fields on master.business_partner. Company-specific AR settings (credit, payment, GL) in company_code_customer_profile. Classifications via commodity_classification bridge.';

COMMENT ON COLUMN "master"."customer"."business_partner_id" IS 'Parent business partner (identity anchor). 1:1 per tenant (one BP can have one customer role).';

COMMENT ON COLUMN "master"."customer"."customer_code" IS 'AR-facing serial code. Format: CUS-{CC}-{seq}. Unique per tenant.';

CREATE TABLE "master"."customer_app_index" (
  "id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "business_partner_id" uuid NOT NULL,
  "customer_code" text NOT NULL,
  "customer_type" text,
  "customer_status" text DEFAULT 'active'::text NOT NULL,
  "is_key_account" boolean DEFAULT false NOT NULL,
  "risk_rating" text,
  "business_partner_code" text,
  "name" text,
  "display_name" text,
  "legal_name" text,
  "legal_form" text,
  "registration_no" text,
  "registration_country_code" text,
  "aliases" text[],
  "business_types" text[] DEFAULT '{}'::text[] NOT NULL,
  "search_text" text DEFAULT ''::text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "master"."customer_block" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "block_type" text NOT NULL,
  "block_reason" text NOT NULL,
  "blocked_at" timestamp with time zone DEFAULT now() NOT NULL,
  "blocked_by" uuid,
  "lifted_at" timestamp with time zone,
  "lifted_by" uuid,
  "lift_reason" text,
  "is_active" boolean GENERATED ALWAYS AS ((lifted_at IS NULL)) STORED,
  "notes" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."customer_block" IS 'ARCHETYPE=B;SCOPE=T. Credit / AR blocks placed on a customer. block_type: credit | invoice | collection | delivery | all. is_active=true while lifted_at IS NULL. Mirrors master.supplier_block pattern. Source of truth for company_code_customer_profile.is_blocked sync (trigger).';

COMMENT ON COLUMN "master"."customer_block"."is_active" IS 'Computed: true while lifted_at IS NULL. Lift = set lifted_at + lifted_by + lift_reason.';

CREATE TABLE "master"."customer_qualification" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "credit_status" text DEFAULT 'not_assessed'::text NOT NULL,
  "credit_limit_band" text,
  "credit_score" integer,
  "credit_rating" text,
  "dso_days" smallint,
  "payment_behavior" text,
  "has_overdue_history" boolean DEFAULT false NOT NULL,
  "kyc_status" text DEFAULT 'not_started'::text NOT NULL,
  "aml_sanctions_status" text DEFAULT 'not_checked'::text NOT NULL,
  "beneficial_owner_check_status" text,
  "kyc_check_date" date,
  "kyc_expiry_date" date,
  "is_dunning_eligible" boolean DEFAULT true NOT NULL,
  "is_statement_eligible" boolean DEFAULT true NOT NULL,
  "dunning_hold_reason" text,
  "last_credit_review_date" date,
  "next_credit_review_date" date,
  "reviewer_id" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."customer_qualification" IS 'ARCHETYPE=B;SCOPE=T. Customer credit, KYC/AML, and AR risk qualification. One row per (tenant, customer). Core AR finance control gate. credit_status=blocked prevents new credit exposure.';

COMMENT ON COLUMN "master"."customer_qualification"."credit_status" IS 'Credit decision gate: not_assessed | approved | conditional | on_hold | blocked.';

COMMENT ON COLUMN "master"."customer_qualification"."dso_days" IS 'Days Sales Outstanding — recomputed by AR analytics worker from ledger aging.';

CREATE TABLE "master"."dashboard" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "owner_principal_id" uuid,
  "scope" text NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "surface_code" text,
  "is_default" boolean DEFAULT false NOT NULL,
  "is_home" boolean DEFAULT false NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "deleted_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."dashboard" IS 'ARCHETYPE=B;SCOPE=T. Dashboard header/container. Similar to saved_view but for named landing pages. Widgets belong to dashboards (via dashboard_widget), not directly to principals. Scope: personal, shared, system. is_home = landing dashboard when no explicit default. Lifecycle: active → archived. deleted_at only set when status = archived.';

COMMENT ON COLUMN "master"."dashboard"."surface_code" IS 'Optional surface binding. NULL = dashboard is surface-agnostic (home screen). When set, dashboard appears only on that surface.';

COMMENT ON COLUMN "master"."dashboard"."is_home" IS 'Landing dashboard shown after login when principal_ui_profile.default_dashboard_id is NULL. Partial unique index enforces at most one active home per owner+scope.';

CREATE TABLE "master"."dashboard_widget" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "dashboard_id" uuid NOT NULL,
  "widget_code" text NOT NULL,
  "widget_type_code" text NOT NULL,
  "title" text,
  "description" text,
  "x_pos" smallint DEFAULT 0 NOT NULL,
  "y_pos" smallint DEFAULT 0 NOT NULL,
  "width_units" smallint DEFAULT 4 NOT NULL,
  "height_units" smallint DEFAULT 3 NOT NULL,
  "breakpoint_code" text,
  "ordinal_no" smallint DEFAULT 0 NOT NULL,
  "config_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "data_source_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "is_visible" boolean DEFAULT true NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."dashboard_widget" IS 'ARCHETYPE=C;SCOPE=T. Dashboard widget instances. Child of master.dashboard. Layout normalized: x_pos, y_pos, width_units, height_units for CSS Grid / react-grid-layout. Natural key = (dashboard_id, widget_code, breakpoint_code) NULLS NOT DISTINCT — same widget_code appears once per breakpoint for responsive layout. breakpoint_code NULL = layout applies at all breakpoints.';

COMMENT ON COLUMN "master"."dashboard_widget"."widget_code" IS 'Machine-stable key unique within parent dashboard per breakpoint. Used for client-side reconciliation and update targeting.';

COMMENT ON COLUMN "master"."dashboard_widget"."breakpoint_code" IS 'Lookup: ui.breakpoint. NULL = applies at all breakpoints. Same widget_code may have rows for each breakpoint_code value.';

COMMENT ON COLUMN "master"."dashboard_widget"."config_json" IS 'Widget-specific configuration. Schema varies by widget_type_code.';

COMMENT ON COLUMN "master"."dashboard_widget"."data_source_json" IS 'Data source binding (API endpoint, saved_view ref, query params). Schema varies by widget_type_code.';

CREATE TABLE "master"."designation" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "master"."dimension_set" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text DEFAULT ''::text NOT NULL,
  "name" text DEFAULT ''::text NOT NULL,
  "set_hash" text NOT NULL,
  "signature" text NOT NULL,
  "dimension_count" smallint NOT NULL,
  "display_label" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."dimension_set" IS 'ARCHETYPE=B;SCOPE=T. Content-addressed dimension combination cache. Keyed by SHA-256 hash of sorted (type_id:value_id) pairs. Immutable after creation. One row per unique combination — deduplication via hash lookup.';

CREATE TABLE "master"."dimension_set_item" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "dimension_set_id" uuid NOT NULL,
  "dimension_type_id" uuid NOT NULL,
  "dimension_value_id" uuid NOT NULL,
  "ordinal" smallint NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "master"."dimension_set_item" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. Component pairs of a dimension set. IMMUTABLE after creation — UPDATE and DELETE blocked by triggers. One value per type per set. Validate at usage time that values are compatible with the transaction company_code_id (global values or same company).';

CREATE TABLE "master"."dimension_type" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "category" text DEFAULT 'CUSTOM'::text NOT NULL,
  "is_hierarchical" boolean DEFAULT false NOT NULL,
  "max_depth" smallint,
  "is_balanced" boolean DEFAULT false NOT NULL,
  "is_multi_allowed" boolean DEFAULT false NOT NULL,
  "is_company_scoped_allowed" boolean DEFAULT false NOT NULL,
  "requires_effective_dating" boolean DEFAULT false NOT NULL,
  "source_entity_name" text,
  "source_table" text,
  "source_code_column" text DEFAULT 'code'::text,
  "source_name_column" text DEFAULT 'name'::text,
  "icon" text,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" shared.active_inactive_archived_d DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS (((status)::text = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."dimension_type" IS 'ARCHETYPE=B;SCOPE=T. Dimension catalog. Tenant-global — no company scoping. SYSTEM types map to dedicated master tables (cost_center, profit_center, project). STANDARD/CUSTOM types carry values in master.dimension_value. Hierarchy flags control tree structure capability. is_company_scoped_allowed gates per-company values at the value level.';

CREATE TABLE "master"."dimension_value" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "dimension_type_id" uuid NOT NULL,
  "company_code_id" uuid,
  "parent_id" uuid,
  "level_no" smallint DEFAULT 1 NOT NULL,
  "path_key" text,
  "effective_from" date,
  "effective_to" date,
  "is_posting_allowed" boolean DEFAULT true NOT NULL,
  "is_budgeting_allowed" boolean DEFAULT true NOT NULL,
  "is_planning_allowed" boolean DEFAULT true NOT NULL,
  "source_entity_name" text,
  "source_record_id" uuid,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "tags" text[],
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."dimension_value" IS 'ARCHETYPE=B;SCOPE=T. Typed dimension values. One value per type per code (per company if scoped). NULL company_code_id = tenant-global. non-NULL = company-specific. Dual uniqueness enforced via partial indexes in 07_indexes (global vs company-scoped). Hierarchy via parent_id + level_no + path_key. Effective-dating enforced by policy when type.requires_effective_dating = true.';

CREATE TABLE "master"."document" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "tags" text[],
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."document" IS 'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Document envelope registry. Lightweight master entity — code + tags. No financial data. Referenced by document.* tables and master.entity_document_link.';

CREATE TABLE "master"."employee" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "principal_id" uuid,
  "employee_number" text NOT NULL,
  "first_name" text NOT NULL,
  "last_name" text NOT NULL,
  "display_name" text,
  "email" text,
  "phone" text,
  "employment_type" text DEFAULT 'full_time'::text NOT NULL,
  "department" text,
  "title" text,
  "manager_id" uuid,
  "company_code_id" uuid,
  "hire_date" date,
  "termination_date" date,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid,
  "person_id" uuid
);

COMMENT ON TABLE "master"."employee" IS 'ARCHETYPE=B;SCOPE=T. Internal workforce. principal_id links to login identity (1:1 optional). Party for expense claims, payroll, advances. manager_id = self-ref hierarchy.';

CREATE TABLE "master"."employee_leave_enrollment" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "employee_id" uuid NOT NULL,
  "leave_plan_id" uuid NOT NULL,
  "effective_from" date NOT NULL,
  "effective_until" date,
  "opening_balance" numeric(12,4) DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "master"."employee_statutory_enrollment" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "employee_id" uuid NOT NULL,
  "statutory_scheme_id" uuid NOT NULL,
  "member_number" text,
  "effective_from" date NOT NULL,
  "effective_until" date,
  "contribution_category" text,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "master"."employment" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "person_id" uuid NOT NULL,
  "employee_id" uuid,
  "legal_entity_id" uuid NOT NULL,
  "company_code_id" uuid NOT NULL,
  "employment_number" text NOT NULL,
  "employment_type" text DEFAULT 'full_time'::text NOT NULL,
  "employment_status" text DEFAULT 'active'::text NOT NULL,
  "hire_date" date NOT NULL,
  "service_date" date,
  "probation_end_date" date,
  "termination_date" date,
  "termination_reason" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "master"."entity_document_link" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "attachment_id" uuid NOT NULL,
  "link_kind" text DEFAULT 'related'::text NOT NULL,
  "display_order" integer DEFAULT 0 NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "folder_id" uuid
);

COMMENT ON TABLE "master"."entity_document_link" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. Polymorphic many-to-many: any entity type → attachment. Canonical sole model for entity-to-document associations. Pattern: master.address_link. entity_id is text for polymorphic PK support.';

COMMENT ON COLUMN "master"."entity_document_link"."entity_type" IS 'Fully-qualified entity type string. e.g. ''document.purchase_invoice''.';

COMMENT ON COLUMN "master"."entity_document_link"."entity_id" IS 'Entity PK as text — cast to uuid where applicable. text type allows linking to composite-key or non-uuid entities.';

CREATE TABLE "master"."external_reference" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "owner_entity" text NOT NULL,
  "owner_id" uuid NOT NULL,
  "source_system" text NOT NULL,
  "external_id" text NOT NULL,
  "external_code" text,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "valid_from" date,
  "valid_until" date,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "master"."filter_preset" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "principal_id" uuid NOT NULL,
  "entity_code" text NOT NULL,
  "name" text NOT NULL,
  "filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "is_shared" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone,
  "created_by" uuid NOT NULL,
  "updated_by" uuid
);

CREATE TABLE "master"."fiscal_period" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "company_code_id" uuid NOT NULL,
  "fiscal_year" smallint NOT NULL,
  "period_number" smallint NOT NULL,
  "period_type" text DEFAULT 'normal'::text NOT NULL,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "fiscal_calendar_config_id" uuid,
  "calendar_version_no" integer,
  "generation_key" text,
  "generated_at" timestamp with time zone,
  "is_adjustment" boolean GENERATED ALWAYS AS ((period_type = 'adjustment'::text)) STORED,
  "opened_at" timestamp with time zone,
  "opened_by" uuid,
  "soft_closed_at" timestamp with time zone,
  "soft_closed_by" uuid,
  "hard_closed_at" timestamp with time zone,
  "hard_closed_by" uuid,
  "sort_order" smallint DEFAULT 0 NOT NULL,
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

COMMENT ON TABLE "master"."fiscal_period" IS 'ARCHETYPE=B;SCOPE=T. Fiscal period gate per company_code. Period 0 = opening balance, 1-12 = normal, 13-16 = adjustment. Status lifecycle: future -> open -> soft_close -> hard_close. Non-standard active-set: is_active GENERATED AS (status IN (''open'', ''soft_close'')).';

CREATE TABLE "master"."fx_rate" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "from_currency" character(3) NOT NULL,
  "to_currency" character(3) NOT NULL,
  "rate" numeric(18,10) NOT NULL,
  "inverse_rate" numeric(18,10) GENERATED ALWAYS AS (
CASE
    WHEN (rate > (0)::numeric) THEN round((1.0 / rate), 10)
    ELSE NULL::numeric
END) STORED,
  "rate_type" text NOT NULL,
  "effective_date" date NOT NULL,
  "effective_time" time without time zone,
  "source" text DEFAULT 'MANUAL'::text NOT NULL,
  "source_reference" text,
  "version_no" integer DEFAULT 1 NOT NULL,
  "supersedes_id" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."fx_rate" IS 'ARCHETYPE=B;SCOPE=T. Immutable, append-only exchange rate store. Corrections create a successor linked by supersedes_id; multiple active sources may coexist. inverse_rate is GENERATED. Triangulation via master.get_fx_rate().';

CREATE TABLE "master"."gl_account" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "chart_of_account_id" uuid NOT NULL,
  "parent_id" uuid,
  "level_no" smallint DEFAULT 1 NOT NULL,
  "path" text,
  "description" text,
  "account_class" text NOT NULL,
  "node_type" text DEFAULT 'posting'::text NOT NULL,
  "normal_balance" text NOT NULL,
  "subledger_type" text,
  "currency_code" character(3),
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid,
  "account_type_id" uuid,
  "is_reconciling" boolean DEFAULT false NOT NULL,
  "is_blocked" boolean DEFAULT false NOT NULL,
  "posting_level" text
);

COMMENT ON TABLE "master"."gl_account" IS 'ARCHETYPE=B;SCOPE=T. Natural account within a chart_of_account. Hierarchical tree with account_class grouping. Trigger enforces parent-child account_class consistency.';

CREATE TABLE "master"."holiday_calendar" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "country_code" character(2),
  "company_code_id" uuid,
  "legal_entity_id" uuid,
  "site_id" uuid,
  "weekend_pattern" text DEFAULT 'SAT_SUN'::text NOT NULL,
  "weekend_days" smallint[],
  "description" text,
  "is_default" boolean DEFAULT false NOT NULL,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" shared.active_inactive_archived_d DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS (((status)::text = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."holiday_calendar" IS 'ARCHETYPE=B;SCOPE=T. Tenant business calendar. Dimensional scope: tenant-wide, per-country, per-company, per-site. weekend_pattern avoids 52 HOLIDAY rows for weekends. CUSTOM requires weekend_days array.';

CREATE TABLE "master"."holiday_calendar_day" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "holiday_calendar_id" uuid NOT NULL,
  "calendar_year" smallint NOT NULL,
  "holiday_date" date NOT NULL,
  "name" text NOT NULL,
  "day_type" text DEFAULT 'HOLIDAY'::text NOT NULL,
  "observance_type" text DEFAULT 'MANDATORY'::text NOT NULL,
  "is_half_day" boolean DEFAULT false NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."holiday_calendar_day" IS 'ARCHETYPE=C;SCOPE=T. Individual holiday/override dates. HOLIDAY=non-working, WORKING_OVERRIDE=normally off but working, BLACKOUT=special closure.';

CREATE TABLE "master"."intercompany_trading_pair" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "source_company_code_id" uuid NOT NULL,
  "counterparty_company_code_id" uuid NOT NULL,
  "counterparty_supplier_profile_id" uuid,
  "mirror_customer_profile_id" uuid,
  "requires_agreement" boolean DEFAULT true NOT NULL,
  "auto_create_mirror_transaction" boolean DEFAULT false NOT NULL,
  "auto_create_mirror_invoice" boolean DEFAULT false NOT NULL,
  "settlement_mode" text DEFAULT 'open_item'::text NOT NULL,
  "valid_from" date,
  "valid_until" date,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."intercompany_trading_pair" IS 'ARCHETYPE=B;SCOPE=T. Operational intercompany trading route between two company codes. One row per directed pair: source_company_code buys from counterparty_company_code. The reverse trade direction requires a separate row. Resolves: which supplier profile does the source use for the counterparty? Which customer profile does the counterparty use for the source (mirror)? Commercial pricing and TP method live in document.intercompany_agreement, linked at transaction time by source_cc + counterparty_cc + date lookup.';

COMMENT ON COLUMN "master"."intercompany_trading_pair"."source_company_code_id" IS 'The BUYING company code — the one posting the AP invoice / PO.';

COMMENT ON COLUMN "master"."intercompany_trading_pair"."counterparty_company_code_id" IS 'The SELLING company code — the one whose BP appears as a supplier.';

COMMENT ON COLUMN "master"."intercompany_trading_pair"."counterparty_supplier_profile_id" IS 'company_code_supplier_profile(source_cc, supplier-for-counterparty). NULL until the profile is created; required before AP invoices can post.';

COMMENT ON COLUMN "master"."intercompany_trading_pair"."mirror_customer_profile_id" IS 'company_code_customer_profile(counterparty_cc, customer-for-source). NULL if auto_create_mirror_invoice = false or profile not yet created.';

COMMENT ON COLUMN "master"."intercompany_trading_pair"."requires_agreement" IS 'When true, an active document.intercompany_agreement must exist for the (source_cc, counterparty_cc, doc_date) before the AP invoice can be posted.';

COMMENT ON COLUMN "master"."intercompany_trading_pair"."settlement_mode" IS 'open_item | netting | cash | none. open_item: both AP and AR remain open until explicitly matched. netting: net balance cleared via IC clearing account on settlement run. cash: physical bank transfer required. none: memo entry only.';

CREATE TABLE "master"."item" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "company_code_id" uuid NOT NULL,
  "product_id" uuid,
  "commodity_category_id" uuid,
  "valuation_method" text NOT NULL,
  "standard_cost" numeric(18,4),
  "reorder_point" numeric(18,4),
  "reorder_qty" numeric(18,4),
  "safety_stock" numeric(18,4),
  "has_lot_tracking" boolean DEFAULT false NOT NULL,
  "has_serial_tracking" boolean DEFAULT false NOT NULL,
  "uom_code" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."item" IS 'ARCHETYPE=B;SCOPE=T. Company-level inventory configuration. Dual-path entry: Path A (product-centric): product_id set, commodity category inherited from product. Path B (item-centric): commodity_category_id set, no product (MRO, utilities, facilities). Both paths may coexist (product with explicit commodity category override). UNIQUE(tenant, company, code) universal; partial UNIQUE(tenant, company, product) for Path A.';

CREATE TABLE "master"."job" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "job_family_id" uuid,
  "job_function_id" uuid,
  "career_band_id" uuid,
  "career_level_id" uuid,
  "pay_grade_id" uuid,
  "designation_id" uuid,
  "description" text,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "master"."job_family" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "master"."job_function" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "job_family_id" uuid,
  "description" text,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "master"."label" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "entity" text NOT NULL,
  "code" text NOT NULL,
  "locale_code" text NOT NULL,
  "tenant_id" uuid,
  "name" text NOT NULL,
  "description" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" shared.ref_status_d DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS (((status)::text = 'active'::text)) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."label" IS 'ARCHETYPE=B_LITE;SCOPE=G. Localisation labels keyed by (entity, code, locale_code). Replaces hardcoded name/description columns across reference tables. locale_code references shared.locale(code). Entity/code pair validity enforced by master.trg_label_validate() via master.label_entity_type. tenant_id IS NULL = global/platform label; IS NOT NULL = tenant override.';

COMMENT ON COLUMN "master"."label"."entity" IS 'Logical entity identifier; must have a row in master.label_entity_type.';

COMMENT ON COLUMN "master"."label"."code" IS 'PK value of the source row in the registered source table.';

COMMENT ON COLUMN "master"."label"."locale_code" IS 'BCP 47 locale tag; normalised by fn_trg_label_validate() on write.';

COMMENT ON COLUMN "master"."label"."metadata" IS 'Reserved for future extension (e.g. translator notes, source flags).';

COMMENT ON COLUMN "master"."label"."status" IS 'active = in use; deprecated = soft-removed.';

CREATE TABLE "master"."label_entity_type" (
  "entity" text NOT NULL,
  "source_schema" text NOT NULL,
  "source_table" text NOT NULL,
  "pk_column" text DEFAULT 'code'::text NOT NULL,
  "name_column" text DEFAULT 'name'::text NOT NULL,
  "description" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."label_entity_type" IS 'ARCHETYPE=F;SCOPE=N. Registry mapping entity identifiers to their source table and label columns. PK is entity (text code). No tenant_id — system-wide routing contract. Enables generic label synchronisation without hard-coding table paths.';

CREATE TABLE "master"."leave_plan" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "leave_type_id" uuid NOT NULL,
  "country_code" character(2),
  "legal_entity_id" uuid,
  "company_code_id" uuid,
  "accrual_frequency" text DEFAULT 'monthly'::text NOT NULL,
  "carry_forward_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "master"."leave_plan_rule" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "leave_plan_id" uuid NOT NULL,
  "rule_code" text NOT NULL,
  "priority" smallint DEFAULT 100 NOT NULL,
  "eligibility_condition" jsonb,
  "entitlement_quantity" numeric(12,4),
  "accrual_formula_version_id" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "master"."leave_type" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "leave_category" text DEFAULT 'annual'::text NOT NULL,
  "unit" text DEFAULT 'day'::text NOT NULL,
  "is_paid" boolean DEFAULT true NOT NULL,
  "requires_attachment" boolean DEFAULT false NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "master"."ledger_book" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "category" text DEFAULT 'statutory'::text NOT NULL,
  "reporting_standard" text,
  "base_currency_code" character(3) DEFAULT 'USD'::bpchar NOT NULL,
  "is_primary" boolean DEFAULT false NOT NULL,
  "is_auto_post" boolean DEFAULT true NOT NULL,
  "is_approval_required" boolean DEFAULT false NOT NULL,
  "is_manual_je_allowed" boolean DEFAULT true NOT NULL,
  "is_reversal_allowed" boolean DEFAULT true NOT NULL,
  "close_mode" text DEFAULT 'unified'::text NOT NULL,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "color_code" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."ledger_book" IS 'ARCHETYPE=B;SCOPE=T. Ledger book definition. Tenant-level (not company-scoped). Assigned to company_codes via master.company_code_book_assignment.';

CREATE TABLE "master"."legal_entity" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "display_name" text,
  "legal_name" text,
  "legal_form" text,
  "registration_no" text,
  "registration_country_code" character(2),
  "tax_registration_number" text,
  "tax_residence_country_code" character(2),
  "incorporation_date" date,
  "website_url" text,
  "entity_type" text NOT NULL,
  "parent_entity_id" uuid,
  "consolidation_method" text DEFAULT 'full'::text NOT NULL,
  "ownership_pct" numeric(5,2),
  "regulatory_framework" text,
  "country_code" character(2) NOT NULL,
  "functional_currency" character(3) NOT NULL,
  "reporting_currency" character(3) NOT NULL,
  "effective_from" date,
  "effective_until" date,
  "description" text,
  "long_description" text,
  "aliases" text[] DEFAULT '{}'::text[] NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "business_types" text[] DEFAULT '{}'::text[] NOT NULL,
  "founded_year" smallint,
  "employee_count_band" text,
  "annual_revenue_band" text,
  "external_ref" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid,
  "level_no" smallint DEFAULT 1 NOT NULL,
  "path" text
);

COMMENT ON TABLE "master"."legal_entity" IS 'ARCHETYPE=B;SCOPE=T. Statutory / registered body. IAM org membership boundary: IdP org maps here via master.legal_entity_identity_binding. Group structure with consolidation hierarchy. Addresses via master.address_link (owner_type=''legal_entity'').';

COMMENT ON COLUMN "master"."legal_entity"."level_no" IS 'Depth in the consolidation hierarchy (1 = root / top-level entity). Maintained by trigger trg_le_hierarchy_path_sync.';

COMMENT ON COLUMN "master"."legal_entity"."path" IS 'Materialized ancestor path: ''/root-id/parent-id/self-id''. Enables O(1) subtree queries. Maintained by trigger trg_le_hierarchy_path_sync.';

CREATE TABLE "master"."legal_entity_business_partner_link" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "legal_entity_id" uuid NOT NULL,
  "business_partner_id" uuid NOT NULL,
  "relationship_type" text NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."legal_entity_business_partner_link" IS 'ARCHETYPE=B;SCOPE=T. Identity bridge between a statutory legal entity and a business_partner record. Primary use: self_bp — maps each LE to its own internal BP so it can appear as a transacting party. Intercompany AP/AR control is in master.intercompany_trading_pair. Normal external-supplier flows do not need this table.';

COMMENT ON COLUMN "master"."legal_entity_business_partner_link"."business_partner_id" IS 'FK to master.business_partner(tenant_id, id). Added in 03_constraints.sql (load-order safe).';

COMMENT ON COLUMN "master"."legal_entity_business_partner_link"."relationship_type" IS 'self_bp: LE''s own canonical BP identity (partner_category must be ''internal''). network_identity: external portal / EDI / e-invoicing identity.';

COMMENT ON COLUMN "master"."legal_entity_business_partner_link"."is_active" IS 'Generated: status = ''active''. At most one active self_bp per legal entity (partial unique index).';

CREATE TABLE "master"."legal_entity_identity_binding" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "legal_entity_id" uuid NOT NULL,
  "provider_code" text NOT NULL,
  "realm_key" text NOT NULL,
  "subject_id" text NOT NULL,
  "org_alias" text NOT NULL,
  "org_name" text,
  "org_path" text,
  "synced_at" timestamp with time zone,
  "sync_status" text DEFAULT 'pending'::text NOT NULL,
  "sync_error_message" text,
  "sync_retry_count" smallint DEFAULT 0 NOT NULL,
  "idp_snapshot" jsonb,
  "provider_attributes" jsonb,
  "idp_enabled" boolean DEFAULT true NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."legal_entity_identity_binding" IS 'ARCHETYPE=B;SCOPE=T. IAM / IdP organisation to legal entity binding. One row per (legal_entity, provider). Supports multiple IdP providers (Keycloak, Azure AD, Okta, Google, SAML, OIDC). X-Org header: tenant_code--legal_entity_code. Mirrors principal_identity_binding pattern — no user-specific fields. sync_status tracks IdP sync health only, not business lifecycle.';

COMMENT ON COLUMN "master"."legal_entity_identity_binding"."subject_id" IS 'IdP organisation UUID / org ID. Unique per (provider, realm). Provider-neutral naming.';

COMMENT ON COLUMN "master"."legal_entity_identity_binding"."org_alias" IS 'Organisation alias from the IdP (e.g. athyper--ATHQ-LE). Unique per (provider, realm).';

COMMENT ON COLUMN "master"."legal_entity_identity_binding"."sync_status" IS 'IdP sync health: pending | synced | drift | error | disabled. Not a business lifecycle — master.legal_entity.status governs business state.';

CREATE TABLE "master"."legal_entity_network_account" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "legal_entity_id" uuid NOT NULL,
  "provider_code" text NOT NULL,
  "account_code" text NOT NULL,
  "account_role" text NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "valid_from" timestamp with time zone DEFAULT now() NOT NULL,
  "valid_until" timestamp with time zone,
  "sync_status" text DEFAULT 'pending'::text NOT NULL,
  "last_synced_at" timestamp with time zone,
  "mesh_account_ref" text,
  "provider_snapshot" jsonb,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid,
  "mesh_account_id" uuid
);

COMMENT ON TABLE "master"."legal_entity_network_account" IS 'ARCHETYPE=B;SCOPE=T. Local mapping from legal entity to external business network account. Neon stores the business meaning of the account code; Mesh stores network_account, network_connection, document envelope, and exchange events.';

COMMENT ON COLUMN "master"."legal_entity_network_account"."account_code" IS 'External account/address code. For Athyper Mesh this is the canonical BNA-* account_code from mesh.network_account.';

COMMENT ON COLUMN "master"."legal_entity_network_account"."is_default" IS 'Default account for a provider and role. Partial unique indexes enforce one default buyer and one default supplier per LE/provider.';

COMMENT ON COLUMN "master"."legal_entity_network_account"."mesh_account_ref" IS 'Deprecated. Do not write new data. Use account_code for the BNA code and mesh_account_id for the Mesh UUID reference.';

COMMENT ON COLUMN "master"."legal_entity_network_account"."mesh_account_id" IS 'Optional Mesh network_account.id captured by projection/backfill. Not a database FK because Mesh is physically separate.';

CREATE TABLE "master"."letterhead" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "company_code_id" uuid,
  "logo_storage_key" text,
  "header_html" text,
  "footer_html" text,
  "watermark_text" text,
  "watermark_opacity" numeric(3,2) DEFAULT 0.15 NOT NULL,
  "default_fonts" jsonb,
  "page_margins" jsonb,
  "is_default" boolean DEFAULT false NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."letterhead" IS 'ARCHETYPE=B;SCOPE=T. Reusable page header/footer/watermark definitions for PDF rendering. NULL company_code_id = applies to all company codes in tenant. page_margins validated by document.trg_validate_page_margins() trigger. DEVIATION: is_active is a manual boolean (NOT GENERATED) — convert alongside status column stabilisation.';

COMMENT ON COLUMN "master"."letterhead"."company_code_id" IS 'Scope restriction. NULL = tenant-wide default. References master.company_code.';

CREATE TABLE "master"."lifecycle_instance" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "entity_name" text NOT NULL,
  "entity_id" text NOT NULL,
  "lifecycle_id" uuid NOT NULL,
  "state_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" uuid NOT NULL
);

COMMENT ON TABLE "master"."lifecycle_instance" IS 'ARCHETYPE=C;SCOPE=T. Current state of a specific entity within a lifecycle. One row per (entity_name, entity_id, lifecycle_id). Updated atomically with log.entity_lifecycle_log on every state transition. Lightweight alternative to document.workflow_instance for simple entities. L06: UNIQUE constraint added. L11: entity_id=TEXT. Renamed from control.entity_lifecycle_instance + moved to master.*.';

COMMENT ON COLUMN "master"."lifecycle_instance"."entity_id" IS 'TEXT — polymorphic entity key. May be a UUID string, composite key, or external reference. Consistent with event.lifecycle_timer_schedule.entity_id.';

CREATE TABLE "master"."multipart_upload" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "upload_id" text NOT NULL,
  "storage_bucket" text NOT NULL,
  "storage_key" text NOT NULL,
  "file_name" text NOT NULL,
  "content_type" text,
  "size_bytes" bigint,
  "part_etags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text DEFAULT 'initiated'::text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "completed_at" timestamp with time zone,
  "aborted_at" timestamp with time zone,
  "attachment_id" uuid,
  "initiated_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."multipart_upload" IS 'ARCHETYPE=E;SCOPE=T. S3 multipart upload tracker. One row per in-flight upload. part_etags is jsonb array of {part_number: N, etag: "..."} objects. On completion: attachment row is created, attachment_id is set, status=completed. Cleanup job removes expired aborted/failed rows.';

COMMENT ON COLUMN "master"."multipart_upload"."part_etags" IS 'Array of {part_number: integer, etag: text} objects. Validated by trg_validate_part_etags trigger (array with required keys).';

CREATE TABLE "master"."network_provider" (
  "code" text NOT NULL,
  "name" text NOT NULL,
  "network_type" text DEFAULT 'b2b_portal'::text NOT NULL,
  "is_platform" boolean DEFAULT false NOT NULL,
  "participant_id_pattern" text,
  "website_url" text,
  "description" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."network_provider" IS 'ARCHETYPE=A;SCOPE=P. Extensible registry of B2B network providers. Platform-seeded (is_platform=true): athyper_network (legacy Neon business-network grouping), athyper_mesh (read-only Mesh BNA exchange shadow), peppol, ariba, tradeshift, custom. Tenant-added providers: INSERT a new row (is_platform=false). Replaces hardcoded CHECK constraint on business_partner_network_link.provider_code.';

CREATE TABLE "master"."notification" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "message_id" uuid,
  "sender_id" uuid,
  "recipient_id" uuid NOT NULL,
  "channel" text DEFAULT 'in_app'::text NOT NULL,
  "category" text,
  "priority" text DEFAULT 'normal'::text NOT NULL,
  "title" text NOT NULL,
  "body" text,
  "icon" text,
  "action_url" text,
  "entity_type" text,
  "entity_id" uuid,
  "is_read" boolean DEFAULT false NOT NULL,
  "read_at" timestamp with time zone,
  "is_dismissed" boolean DEFAULT false NOT NULL,
  "dismissed_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
)
PARTITION BY RANGE (created_at);

COMMENT ON TABLE "master"."notification" IS 'ARCHETYPE=C;SCOPE=T. Per-recipient inbox entry. Intended grain: one row per (message_id, recipient_id, channel). DB enforces within each partition via notif_msg_recipient_channel_uidx (includes created_at as required by PG partitioned-table rules). Cross-partition dedup is an application responsibility (INSERT ... ON CONFLICT DO NOTHING). is_read / is_dismissed are mutable — updated by the recipient only (RLS-enforced). channel, priority, category all lookup-validated (extensible). Partitioned monthly.';

COMMENT ON COLUMN "master"."notification"."title" IS 'Denormalised at dispatch time — survives template retirement.';

CREATE TABLE "master"."operating_organization" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "domain" text NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "display_name" text,
  "description" text,
  "parent_id" uuid,
  "effective_from" date,
  "effective_until" date,
  "scope_version" bigint DEFAULT 1 NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."operating_organization" IS 'ARCHETYPE=B;SCOPE=T. Tenant-owned cross-company orchestration boundary. The domain distinguishes procurement and sales behavior. Company codes retain legal, financial, and accounting ownership.';

COMMENT ON COLUMN "master"."operating_organization"."domain" IS 'Sealed domain: procurement or sales. Domain is immutable after creation.';

COMMENT ON COLUMN "master"."operating_organization"."parent_id" IS 'Optional same-tenant navigation hierarchy. Does not imply RBAC inheritance in v1.';

COMMENT ON COLUMN "master"."operating_organization"."scope_version" IS 'Monotonic version bumped by authorization-relevant organization or membership changes.';

CREATE TABLE "master"."operating_organization_company" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "operating_organization_id" uuid NOT NULL,
  "company_code_id" uuid NOT NULL,
  "participation_role" text DEFAULT 'participant'::text NOT NULL,
  "effective_from" date DEFAULT CURRENT_DATE NOT NULL,
  "effective_until" date,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."operating_organization_company" IS 'ARCHETYPE=B_LITE;SCOPE=T. Effective-dated Company Code membership in an Operating Organization. Participation roles are validated against the parent domain.';

CREATE TABLE "master"."org_unit" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "unit_type" text NOT NULL,
  "parent_id" uuid,
  "legal_entity_id" uuid,
  "company_code_id" uuid,
  "cost_center_id" uuid,
  "manager_employee_id" uuid,
  "level_no" smallint DEFAULT 1 NOT NULL,
  "path" text,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "valid_from" date,
  "valid_to" date,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "master"."organization_tax_registration" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "legal_entity_id" uuid NOT NULL,
  "company_code_id" uuid,
  "jurisdiction_id" uuid NOT NULL,
  "registration_type" text NOT NULL,
  "registration_number" text NOT NULL,
  "filing_frequency" text,
  "effective_from" date DEFAULT CURRENT_DATE NOT NULL,
  "effective_to" date,
  "is_primary" boolean DEFAULT false NOT NULL,
  "certificate_attachment_id" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."organization_tax_registration" IS 'ARCHETYPE=B;SCOPE=T. Effective-dated statutory registration owned by a Legal Entity and optionally applicable only to one Company Code. Replaces the single-number Company limitation for multi-jurisdiction VAT/GST/WHT operations.';

CREATE TABLE "master"."owner_type" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "code" text NOT NULL,
  "tenant_id" uuid,
  "name" text NOT NULL,
  "description" text,
  "category" text,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "schema_name" text,
  "table_name" text,
  "pk_column" text DEFAULT 'id'::text NOT NULL,
  "supports_address" boolean DEFAULT true NOT NULL,
  "supports_contact" boolean DEFAULT true NOT NULL,
  "allowed_address_purposes" text[] DEFAULT '{}'::text[] NOT NULL,
  "allowed_contact_purposes" text[] DEFAULT '{}'::text[] NOT NULL,
  "is_system" boolean DEFAULT true NOT NULL,
  "is_extensible_by_tenant" boolean DEFAULT false NOT NULL,
  "is_tenant_scoped" boolean DEFAULT true NOT NULL,
  "tenant_column" text DEFAULT 'tenant_id'::text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."owner_type" IS 'ARCHETYPE=B;SCOPE=G. Polymorphic routing contract. One row per entity type that can own addresses and contact links. Encodes the schema/table backing each owner_type code, plus advisory allowed_*_purposes arrays used by UI to filter dropdowns. PK is surrogate uuid (id). Uniqueness of code is per-namespace: system codes (tenant_id IS NULL) are globally unique; tenant codes (tenant_id IS NOT NULL) are unique per tenant. Two tenants CAN register the same code independently. fn_valid_owner_type() resolves by code + session tenant at runtime. System rows (is_system=true) map to real master.* tables. Tenant rows (is_system=false) allow custom entity types without schema changes.';

COMMENT ON COLUMN "master"."owner_type"."code" IS 'Logical key. System rows: globally unique. Tenant rows: unique per tenant. Stored as-is in contact_link.owner_type and address_link.owner_type. Lowercase snake_case.';

COMMENT ON COLUMN "master"."owner_type"."schema_name" IS 'PostgreSQL schema that contains the backing table (e.g. master).';

COMMENT ON COLUMN "master"."owner_type"."table_name" IS 'PostgreSQL table that stores entities of this type (e.g. customer).';

COMMENT ON COLUMN "master"."owner_type"."allowed_address_purposes" IS 'Advisory: purpose codes from master.address_purpose valid for this owner type. Used by UI to filter purpose dropdown. Not enforced by DB.';

COMMENT ON COLUMN "master"."owner_type"."allowed_contact_purposes" IS 'Advisory: purpose codes from master.contact_link_purpose valid for contact_link rows of this owner type. Used by UI. Not enforced by DB.';

CREATE TABLE "master"."party_contact_person" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "party_type" text NOT NULL,
  "party_id" uuid NOT NULL,
  "company_code_id" uuid,
  "contact_name" text NOT NULL,
  "business_title" text,
  "contact_role" text,
  "is_primary" boolean DEFAULT false NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."party_contact_person" IS 'ARCHETYPE=B;SCOPE=T. Named contact person (individual) for any party. party_type: business_partner | supplier | customer | company_code. Company-level channel contacts (email/phone) remain in master.contact_link. Roles assigned via master.party_contact_role.';

COMMENT ON COLUMN "master"."party_contact_person"."company_code_id" IS 'Optional scope â€” NULL means contact applies to all company codes of this party. Set when a contact is specific to one operating entity in a supplier group.';

CREATE TABLE "master"."party_contact_role" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "party_contact_person_id" uuid NOT NULL,
  "role_code" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "master"."party_contact_role" IS 'ARCHETYPE=B;SCOPE=T. Role assignments for a named contact person. Multi-role: one person can have main_contact + logistics + it simultaneously. role_code lookup: master.party_contact_role.';

CREATE TABLE "master"."party_governance_relation" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "party_type" text NOT NULL,
  "party_id" uuid NOT NULL,
  "relation_type" text NOT NULL,
  "member_name" text NOT NULL,
  "member_type" text DEFAULT 'individual'::text NOT NULL,
  "company_name" text,
  "member_business_partner_id" uuid,
  "member_country_code" character(2),
  "business_title" text,
  "ownership_pct" numeric(7,4),
  "share_class" text,
  "voting_pct" numeric(7,4),
  "beneficial_ownership_pct" numeric(7,4),
  "directness" text,
  "control_nature" text,
  "authority_scope" text,
  "authority_limit_amount" numeric(18,4),
  "authority_limit_currency_code" character(3),
  "appointed_date" date,
  "end_of_term" date,
  "kyc_status" text DEFAULT 'not_started'::text NOT NULL,
  "sanctions_status" text DEFAULT 'not_checked'::text NOT NULL,
  "pep_status" text DEFAULT 'unknown'::text NOT NULL,
  "last_screened_at" timestamp with time zone,
  "evidence_status" text DEFAULT 'missing'::text NOT NULL,
  "evidence_attachment_id" uuid,
  "source_of_wealth" text,
  "last_reviewed_at" timestamp with time zone,
  "next_review_at" date,
  "reviewed_by" uuid,
  "notes" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."party_governance_relation" IS 'ARCHETYPE=B;SCOPE=T. Governance structure for any party. party_type: business_partner | supplier | customer | legal_entity. relation_type covers ownership, beneficial ownership, leadership, authority, audit, and advisory roles. Covers individuals, organizations, trusts, public float, and external parties.';

COMMENT ON COLUMN "master"."party_governance_relation"."member_business_partner_id" IS 'Optional link to an existing business partner when the governance member is modeled in BP master.';

COMMENT ON COLUMN "master"."party_governance_relation"."ownership_pct" IS 'Ownership percentage (0.0000-100.0000). Populated for relation_type = shareholder | ubo. NULL for non-ownership roles (director, signatory, etc.).';

COMMENT ON COLUMN "master"."party_governance_relation"."voting_pct" IS 'Voting control percentage, which can differ from economic ownership.';

COMMENT ON COLUMN "master"."party_governance_relation"."beneficial_ownership_pct" IS 'Ultimate beneficial ownership percentage when different from direct legal ownership.';

COMMENT ON COLUMN "master"."party_governance_relation"."end_of_term" IS 'NULL = currently serving / no fixed end date. Populated when resigned, term expired, or replaced.';

COMMENT ON COLUMN "master"."party_governance_relation"."next_review_at" IS 'Next scheduled governance/KYC review date for BP 360 governance monitoring.';

CREATE TABLE "master"."party_identifier" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "owner_type" text NOT NULL,
  "owner_id" uuid NOT NULL,
  "scheme" text NOT NULL,
  "value" text NOT NULL,
  "issuing_authority" text,
  "issued_at" date,
  "valid_until" date,
  "is_verified" boolean DEFAULT false NOT NULL,
  "verified_at" timestamp with time zone,
  "is_primary" boolean DEFAULT false NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."party_identifier" IS 'ARCHETYPE=B;SCOPE=T. External / third-party identifiers for any party. Polymorphic: owner_type = business_partner | supplier | customer | legal_entity | company_code. Schemes: duns, lei, gln, ariba_anid, peppol_id, uen, ssm_no, crn, custom.';

COMMENT ON COLUMN "master"."party_identifier"."scheme" IS 'Identifier scheme code (lookup: master.party_identifier_scheme). Governs format validation applied by trigger.';

COMMENT ON COLUMN "master"."party_identifier"."is_primary" IS 'At most one primary per (owner, scheme). Enforced by partial unique index.';

CREATE TABLE "master"."party_risk_assessment" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "subject_type" text NOT NULL,
  "subject_id" uuid NOT NULL,
  "business_partner_id" uuid NOT NULL,
  "assessment_context" text NOT NULL,
  "model_code" text NOT NULL,
  "model_version" text NOT NULL,
  "overall_score" numeric(5,2),
  "risk_band" text DEFAULT 'unknown'::text NOT NULL,
  "is_override" boolean DEFAULT false NOT NULL,
  "override_reason" text,
  "override_score" numeric(5,2),
  "status" text DEFAULT 'draft'::text NOT NULL,
  "assessed_at" timestamp with time zone,
  "assessed_by" uuid,
  "approved_at" timestamp with time zone,
  "approved_by" uuid,
  "next_review_at" date,
  "review_frequency" text,
  "version" integer DEFAULT 1 NOT NULL,
  "superseded_by" uuid,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."party_risk_assessment" IS 'ARCHETYPE=B;SCOPE=T. Interpreted risk result per (subject, context). One approved row per (tenant, subject_type, subject_id, assessment_context) enforced by partial unique index. Versioned: approval creates new row, old row → status=superseded. is_override=true requires override_reason.';

COMMENT ON COLUMN "master"."party_risk_assessment"."assessment_context" IS 'Separates risk concerns: organization = entity-level; supplier_role = procurement risk; customer_role = AR/credit risk; project_engagement = per-engagement risk. The same BP can be low organization risk but high project_engagement risk.';

COMMENT ON COLUMN "master"."party_risk_assessment"."is_override" IS 'True when a risk manager manually sets the band regardless of computed score. override_reason is mandatory. Captured in party_risk_review_event.event_type=overridden.';

CREATE TABLE "master"."party_risk_dimension_score" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "assessment_id" uuid NOT NULL,
  "dimension_code" text NOT NULL,
  "raw_score" numeric(5,2),
  "weighted_score" numeric(5,2),
  "weight_applied" numeric(5,4),
  "risk_band" text DEFAULT 'unknown'::text NOT NULL,
  "knockout_hit" boolean DEFAULT false NOT NULL,
  "driver_count" integer DEFAULT 0 NOT NULL,
  "coverage_pct" numeric(5,2),
  "is_incomplete" boolean DEFAULT false NOT NULL,
  "notes" text
);

COMMENT ON TABLE "master"."party_risk_dimension_score" IS 'ARCHETYPE=B;SCOPE=T. Per-dimension score within an assessment. Provides the explainability layer: assessment.overall_score = Σ(weighted_score). Each row traces to evidence via party_risk_driver.dimension_score_id.';

COMMENT ON COLUMN "master"."party_risk_dimension_score"."knockout_hit" IS 'True when this dimension triggered a model knockout rule, forcing the overall assessment to critical regardless of the weighted average.';

CREATE TABLE "master"."party_risk_driver" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "assessment_id" uuid NOT NULL,
  "dimension_score_id" uuid,
  "evidence_id" uuid,
  "dimension_code" text NOT NULL,
  "driver_code" text,
  "severity" text DEFAULT 'medium'::text NOT NULL,
  "impact_score" numeric(5,2),
  "is_knockout" boolean DEFAULT false NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "source_entity" text,
  "source_record_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid
);

COMMENT ON TABLE "master"."party_risk_driver" IS 'ARCHETYPE=B;SCOPE=T. The "why" layer of an assessment. Each driver traces to either party_risk_evidence (evidence_id) or an internal entity record (source_entity + source_record_id). e.g. "Low ESG score" → evidence_id=EcoVadis record; "Missing billing address" → source_entity=master.business_partner.';

COMMENT ON COLUMN "master"."party_risk_driver"."driver_code" IS 'Optional FK to risk_driver_registry. Null = ad-hoc driver with no registry entry. Registry entries provide default dimension and severity for common drivers.';

CREATE TABLE "master"."party_risk_evidence" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "subject_type" text NOT NULL,
  "subject_id" uuid NOT NULL,
  "business_partner_id" uuid NOT NULL,
  "source_code" text NOT NULL,
  "source_reference" text,
  "evidence_type" text NOT NULL,
  "evidence_date" date,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL,
  "valid_from" date,
  "valid_until" date,
  "title" text NOT NULL,
  "summary" text,
  "raw_payload" jsonb,
  "normalized_payload" jsonb,
  "confidence_score" numeric(5,2),
  "status" text DEFAULT 'active'::text NOT NULL,
  "superseded_by" uuid,
  "ingested_by" uuid,
  "ingested_via" text,
  "tags" text[] DEFAULT '{}'::text[] NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."party_risk_evidence" IS 'ARCHETYPE=B;SCOPE=T. Immutable incoming risk signals. Append-only — records are never deleted. Status transitions: active → superseded | ignored | disputed | expired. raw_payload = exact provider response (write once). normalized_payload = system interpretation (may be re-processed).';

COMMENT ON COLUMN "master"."party_risk_evidence"."business_partner_id" IS 'Always set regardless of subject_type. Enables BP-level queries across all evidence types (engagement, role-specific, etc.) without joins.';

COMMENT ON COLUMN "master"."party_risk_evidence"."superseded_by" IS 'Points to the newer evidence record that replaced this one. Set automatically when a fresher signal from the same source arrives.';

CREATE TABLE "master"."party_risk_mitigation" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "business_partner_id" uuid NOT NULL,
  "assessment_id" uuid,
  "driver_id" uuid,
  "mitigation_type" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "due_date" date,
  "completed_at" timestamp with time zone,
  "assigned_to" uuid,
  "approved_by" uuid,
  "approved_at" timestamp with time zone,
  "evidence_note" text,
  "evidence_url" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."party_risk_mitigation" IS 'ARCHETYPE=B;SCOPE=T. Mitigation and response actions for identified risks. Scope: assessment-level (address overall risk) or driver-specific (address one cause). Types: waiver (accept risk), corrective_action (fix it), monitoring (watch it), escalation (involve senior), rejection (decline BP), conditional_approval (proceed with conditions).';

COMMENT ON COLUMN "master"."party_risk_mitigation"."evidence_url" IS 'URL or reference to proof of completion (e.g. ESG policy document, updated certificate). Required when closing a corrective_action type mitigation.';

CREATE TABLE "master"."party_risk_review_event" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "assessment_id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "actor_id" uuid,
  "actor_type" text DEFAULT 'system'::text NOT NULL,
  "prior_status" text,
  "new_status" text NOT NULL,
  "prior_risk_band" text,
  "new_risk_band" text,
  "comment" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE "master"."party_risk_review_event" IS 'ARCHETYPE=I;SCOPE=T. Immutable lifecycle audit trail for risk assessments. No updates after insert. Records every status transition, manual approval, override (with band change), and scheduled review trigger. event_type=overridden captures manual band changes; event_type=approved captures the final review sign-off.';

COMMENT ON COLUMN "master"."party_risk_review_event"."actor_id" IS 'Null when system-triggered (scheduled re-score, evidence ingestion, expiry). Populated for all user-initiated and API-initiated actions.';

CREATE TABLE "master"."party_tax_profile" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "owner_type" text DEFAULT 'business_partner'::text NOT NULL,
  "owner_id" uuid NOT NULL,
  "country_code" character(2) NOT NULL,
  "penalty_information" text,
  "discount_information" text,
  "global_location_number" text,
  "tax_classification" text,
  "taxation_type" text,
  "tax_id" text,
  "state_tax_id" text,
  "sales_tax_id" text,
  "service_tax_id" text,
  "regional_tax_id" text,
  "vat_id" text,
  "vat_registered" boolean DEFAULT false NOT NULL,
  "vat_registration_doc_id" uuid,
  "has_tax_clearance" boolean DEFAULT false NOT NULL,
  "tax_clearance_number" text,
  "tax_clearance_doc_id" uuid,
  "tax_clearance_expiry_date" date,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."party_tax_profile" IS 'ARCHETYPE=B;SCOPE=T. Country-specific tax registration per business partner. Unique per (owner_type, owner_id, country). Supplier and customer roles read this through their parent business_partner_id.';

COMMENT ON COLUMN "master"."party_tax_profile"."global_location_number" IS 'GS1 Global Location Number (GLN). 13-digit numeric string. Identifies a physical or legal location in the GS1 system.';

COMMENT ON COLUMN "master"."party_tax_profile"."vat_registration_doc_id" IS 'FK -> master.attachment. Uploaded VAT/GST registration certificate document.';

COMMENT ON COLUMN "master"."party_tax_profile"."tax_clearance_doc_id" IS 'FK -> master.attachment. Official tax clearance certificate document.';

CREATE TABLE "master"."pay_component" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "component_type" text NOT NULL,
  "value_type" text DEFAULT 'amount'::text NOT NULL,
  "taxable_behavior" text DEFAULT 'taxable'::text NOT NULL,
  "is_recurring" boolean DEFAULT true NOT NULL,
  "is_employer_cost" boolean DEFAULT false NOT NULL,
  "formula_expression_id" uuid,
  "default_gl_role" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "master"."pay_grade" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "grade_set" text,
  "min_amount" numeric(18,4),
  "midpoint_amount" numeric(18,4),
  "max_amount" numeric(18,4),
  "currency_code" character(3),
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "master"."pay_group" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "legal_entity_id" uuid,
  "company_code_id" uuid NOT NULL,
  "pay_frequency" text DEFAULT 'monthly'::text NOT NULL,
  "currency_code" character(3) NOT NULL,
  "country_code" character(2),
  "calendar_id" uuid,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "master"."pay_structure" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "pay_group_id" uuid,
  "currency_code" character(3) NOT NULL,
  "effective_from" date DEFAULT CURRENT_DATE NOT NULL,
  "effective_until" date,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "master"."pay_structure_line" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "pay_structure_id" uuid NOT NULL,
  "pay_component_id" uuid NOT NULL,
  "line_no" smallint NOT NULL,
  "default_amount" numeric(18,4),
  "default_rate" numeric(18,8),
  "formula_expression_id" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "master"."payment_method" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "direction" text DEFAULT 'BOTH'::text NOT NULL,
  "instrument_mode" text NOT NULL,
  "requires_bank_account" boolean DEFAULT true NOT NULL,
  "requires_counterparty_bank" boolean DEFAULT true NOT NULL,
  "requires_bank_interface" boolean DEFAULT true NOT NULL,
  "requires_reference_number" boolean DEFAULT false NOT NULL,
  "supports_batch" boolean DEFAULT true NOT NULL,
  "supports_partial" boolean DEFAULT false NOT NULL,
  "supports_reversal" boolean DEFAULT true NOT NULL,
  "supports_file_generation" boolean DEFAULT true NOT NULL,
  "supports_real_time_api" boolean DEFAULT false NOT NULL,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."payment_method" IS 'ARCHETYPE=B;SCOPE=T. User-facing payment method catalog. Stable reference data describing logical payment instruments with capability flags. Each row answers: "what can this method do?" Not "is it allowed here?" (that is company policy) or "how is it executed?" (that is bank_interface_profile).';

COMMENT ON COLUMN "master"."payment_method"."direction" IS 'Payment direction scope. Lookup: master.payment_method_direction. OUTBOUND (disbursement), INBOUND (collection), BOTH.';

COMMENT ON COLUMN "master"."payment_method"."instrument_mode" IS 'Instrument classification. Lookup: master.payment_method_instrument_mode. BANK_TRANSFER, CHECK, CASH, CARD, GATEWAY, DIRECT_DEBIT, NETTING, OFFSET, UPI, WALLET_TRANSFER.';

CREATE TABLE "master"."payment_term" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "applicable_to" text DEFAULT 'BOTH'::text NOT NULL,
  "base_event" text DEFAULT 'INVOICE_DATE'::text NOT NULL,
  "due_rule_type" text DEFAULT 'NET_DAYS'::text NOT NULL,
  "due_days" smallint,
  "due_day_of_month" smallint,
  "grace_days" smallint DEFAULT 0 NOT NULL,
  "due_date_flexibility" text DEFAULT 'FIXED'::text NOT NULL,
  "business_day_convention" text,
  "holiday_calendar_id" uuid,
  "month_offset" smallint DEFAULT 0 NOT NULL,
  "term_category" text DEFAULT 'standard'::text NOT NULL,
  "installment_count" smallint,
  "version" smallint DEFAULT 1 NOT NULL,
  "supersedes_payment_term_id" uuid,
  "is_current_version" boolean DEFAULT true NOT NULL,
  "effective_from" date,
  "effective_to" date,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."payment_term" IS 'ARCHETYPE=B;SCOPE=T. Payment term master: executable net-days rule + container for clause children. Versioned per (tenant, code, version). Supersedes chain for audit trail.';

CREATE TABLE "master"."payment_term_clause" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "payment_term_id" uuid NOT NULL,
  "clause_code" text NOT NULL,
  "clause_type" text NOT NULL,
  "sequence_no" smallint NOT NULL,
  "settles_clause_code" text,
  "application_scope" text DEFAULT 'HEADER'::text NOT NULL,
  "basis_amount_mode" text DEFAULT 'GROSS'::text NOT NULL,
  "calc_mode" text DEFAULT 'PERCENT'::text NOT NULL,
  "default_pct" numeric(5,2),
  "default_amount" numeric(18,4),
  "currency_code" character(3),
  "flexibility_mode" text DEFAULT 'FIXED'::text NOT NULL,
  "min_pct" numeric(5,2),
  "max_pct" numeric(5,2),
  "min_amount" numeric(18,4),
  "max_amount" numeric(18,4),
  "cumulative_cap_pct" numeric(5,2),
  "cumulative_cap_amount" numeric(18,4),
  "trigger_event" text,
  "release_event" text,
  "release_delay_days" smallint,
  "recovery_start_after_pct" numeric(5,2),
  "recovery_end_before_pct" numeric(5,2),
  "recovery_method" text,
  "partial_release_pct" numeric(5,2),
  "partial_release_event" text,
  "rounding_method" text DEFAULT 'ROUND_HALF_UP'::text,
  "rounding_scale" smallint,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."payment_term_clause" IS 'ARCHETYPE=C;SCOPE=T. Unified deduction/release clause. clause_type: ADVANCE, ADVANCE_RECOVERY, RETENTION, RETENTION_RELEASE. FIX-3: bounds enforce min/max_pct for PERCENT, min/max_amount for FIXED_AMOUNT. is_active is a manual boolean (not GENERATED) — no status column on this table.';

CREATE TABLE "master"."payment_term_discount_tier" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "payment_term_id" uuid NOT NULL,
  "tier_no" smallint NOT NULL,
  "qualify_within_days" smallint NOT NULL,
  "discount_pct" numeric(5,2),
  "discount_fixed" numeric(18,4),
  "currency_code" character(3),
  "discount_basis_mode" text DEFAULT 'GROSS'::text NOT NULL,
  "min_invoice_amount" numeric(18,4),
  "is_best_only" boolean DEFAULT true NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."payment_term_discount_tier" IS 'ARCHETYPE=C;SCOPE=T. Early-payment discount tiers. Settlement-time only — not an invoice deduction.';

CREATE TABLE "master"."person" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "person_number" text,
  "first_name" text NOT NULL,
  "middle_name" text,
  "last_name" text NOT NULL,
  "display_name" text,
  "preferred_name" text,
  "primary_email" text,
  "primary_phone" text,
  "country_code" character(2),
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."person" IS 'ARCHETYPE=B;SCOPE=T. Controlled PII root for a natural person. master.employee remains the platform worker/party record.';

CREATE TABLE "master"."person_sensitive_profile" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "person_id" uuid NOT NULL,
  "date_of_birth" date,
  "gender" text,
  "marital_status" text,
  "nationality_country_code" character(2),
  "national_id_type" text,
  "national_id_token" text,
  "tax_identifier_token" text,
  "passport_number_token" text,
  "emergency_contact" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "protected_attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."person_sensitive_profile" IS 'ARCHETYPE=C;SCOPE=T. Sensitive person attributes isolated from the worker record for stricter field-level policy.';

CREATE TABLE "master"."planning_model" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "company_code_id" uuid NOT NULL,
  "description" text,
  "model_type" text DEFAULT 'DRIVER_BASED'::text NOT NULL,
  "planning_horizon" text DEFAULT 'ANNUAL'::text NOT NULL,
  "granularity" text DEFAULT 'MONTHLY'::text NOT NULL,
  "base_currency_code" character(3) NOT NULL,
  "fiscal_year_from" smallint NOT NULL,
  "fiscal_year_to" smallint NOT NULL,
  "responsible_person_id" uuid,
  "version" integer DEFAULT 1 NOT NULL,
  "is_current" boolean DEFAULT true NOT NULL,
  "based_on_model_id" uuid,
  "auto_recalculate" boolean DEFAULT false NOT NULL,
  "lock_on_approval" boolean DEFAULT true NOT NULL,
  "allows_overrides" boolean DEFAULT true NOT NULL,
  "approved_at" timestamp with time zone,
  "approved_by" uuid,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = ANY (ARRAY['draft'::text, 'active'::text, 'in_review'::text]))) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."planning_model" IS 'ARCHETYPE=B;SCOPE=T. Planning model definition: driver-based, top-down, bottom-up, or zero-based. Versioned per (tenant, code). is_current flags the active version. Aggregates drivers (control.planning_driver) → outputs (ledger.planning_output). Status lifecycle: draft → active → in_review → approved → locked → archived. Non-standard active-set: is_active GENERATED AS (status IN (''draft'',''active'',''in_review'')).';

CREATE TABLE "master"."position" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "legal_entity_id" uuid,
  "company_code_id" uuid NOT NULL,
  "org_unit_id" uuid,
  "job_id" uuid,
  "reports_to_position_id" uuid,
  "cost_center_id" uuid,
  "profit_center_id" uuid,
  "site_id" uuid,
  "position_type" text DEFAULT 'regular'::text NOT NULL,
  "headcount_capacity" numeric(10,2) DEFAULT 1 NOT NULL,
  "valid_from" date,
  "valid_to" date,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "master"."principal" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "principal_type" text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "is_locked" boolean DEFAULT false NOT NULL,
  "is_service_account" boolean DEFAULT false NOT NULL,
  "auth_epoch" integer DEFAULT 0 NOT NULL,
  "login_email" text,
  "external_ref" text,
  "principal_source" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."principal" IS 'ARCHETYPE=B;SCOPE=T. Universal actor: users, service accounts, bots. Core identity only — see principal_profile for display data, contact_link for addresses.';

COMMENT ON COLUMN "master"."principal"."auth_epoch" IS 'Trigger-maintained security cache epoch. Incremented by trg_principal_bump_auth_epoch and related triggers on security-critical mutations. Session service checks this on every cache hit — mismatch forces immediate re-resolution. Never write directly.';

COMMENT ON COLUMN "master"."principal"."login_email" IS 'Trigger-maintained cache of verified primary login email. Source of truth: contact_link. Never write directly.';

COMMENT ON COLUMN "master"."principal"."external_ref" IS 'Opaque correlation key from upstream HR/IAM system. Unique per tenant when populated. Used for identity reconciliation.';

COMMENT ON COLUMN "master"."principal"."principal_source" IS 'How this principal was created. Sealed platform enum (inline CHECK). Values: internal, scim, saml_jit, oidc_jit, support_jit, invite_jit, import, api.';

CREATE TABLE "master"."principal_identity_binding" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "principal_id" uuid NOT NULL,
  "realm_key" text DEFAULT 'athyper'::text NOT NULL,
  "provider_code" text NOT NULL,
  "subject_id" text NOT NULL,
  "username" text,
  "issuer" text,
  "audience" text,
  "client_id" text,
  "federation_link" text,
  "created_at_millis" bigint,
  "not_before" bigint,
  "service_client_id" text,
  "required_actions" text[] DEFAULT '{}'::text[] NOT NULL,
  "synced_at" timestamp with time zone,
  "sync_status" shared.keycloak_sync_status_d DEFAULT 'pending'::text NOT NULL,
  "sync_error_message" text,
  "sync_retry_count" smallint DEFAULT 0 NOT NULL,
  "idp_snapshot" jsonb,
  "provider_attributes" jsonb,
  "idp_enabled" boolean DEFAULT true NOT NULL,
  "idp_email_verified" boolean DEFAULT false NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."principal_identity_binding" IS 'ARCHETYPE=C;SCOPE=T. IdP/Keycloak shadow table. One row per (principal, provider). Separated from principal_profile: "who is this person in the product" vs "how is this actor represented in IAM". Multi-IdP ready. sync_status is protocol/IAM health — not a business lifecycle status.';

COMMENT ON COLUMN "master"."principal_identity_binding"."realm_key" IS 'IAM realm that issued this identity subject. Native product-plane users use the unified athyper realm; platform-control is reserved for support/admin realm access.';

COMMENT ON COLUMN "master"."principal_identity_binding"."provider_code" IS 'Identity provider code. Sealed enum (inline CHECK). Adding a new IdP requires code changes in the sync adapter — not business-extensible.';

COMMENT ON COLUMN "master"."principal_identity_binding"."subject_id" IS 'IdP-specific principal identifier (Keycloak UUID, Azure OID, etc.).';

COMMENT ON COLUMN "master"."principal_identity_binding"."issuer" IS 'Issuer URL observed for this IdP subject, when captured from token or sync API.';

COMMENT ON COLUMN "master"."principal_identity_binding"."audience" IS 'Expected JWT audience/client audience for this binding, when relevant.';

COMMENT ON COLUMN "master"."principal_identity_binding"."client_id" IS 'IdP client id associated with this binding, when relevant.';

COMMENT ON COLUMN "master"."principal_identity_binding"."sync_status" IS 'Sync health. Sealed protocol enum (inline CHECK): pending, synced, drift, error, disabled.';

COMMENT ON COLUMN "master"."principal_identity_binding"."idp_snapshot" IS 'Full user representation JSON from provider API. Non-canonical — audit only.';

CREATE TABLE "master"."principal_notification_preference" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "principal_id" uuid NOT NULL,
  "plane_key" text NOT NULL,
  "event_code" text NOT NULL,
  "channel" text NOT NULL,
  "is_enabled" boolean,
  "frequency_code" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."principal_notification_preference" IS 'ARCHETYPE=B;SCOPE=T. Per-user notification opt-in/out by event_code + channel. NULL is_enabled = inherit routing rule default. NULL frequency_code = immediate delivery (no digest batching). high/urgent priorities are never downshifted to digest. Precedence: routing rule → principal preference → digest frequency.';

COMMENT ON COLUMN "master"."principal_notification_preference"."plane_key" IS 'Trusted plane for which this preference is effective.';

COMMENT ON COLUMN "master"."principal_notification_preference"."event_code" IS 'Matches control.notification_routing_rule.event_type. Identifies the notification trigger.';

COMMENT ON COLUMN "master"."principal_notification_preference"."channel" IS 'Lookup: notification.channel (in_app, email, sms, push, webhook).';

COMMENT ON COLUMN "master"."principal_notification_preference"."is_enabled" IS 'NULL = inherit routing rule. false = suppress all deliveries for this event+channel.';

COMMENT ON COLUMN "master"."principal_notification_preference"."frequency_code" IS 'Lookup: notification.digest_frequency. NULL = immediate. Only honoured for digest-eligible priorities.';

CREATE TABLE "master"."principal_profile" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "principal_id" uuid NOT NULL,
  "given_name" text,
  "family_name" text,
  "preferred_name" text,
  "display_name" text,
  "avatar_url" text,
  "locale" text,
  "timezone" text,
  "keycloak_id" text,
  "keycloak_username" text,
  "keycloak_created_at_millis" bigint,
  "keycloak_federation_link" text,
  "keycloak_not_before" bigint,
  "keycloak_required_actions" text[] DEFAULT '{}'::text[] NOT NULL,
  "keycloak_service_client_id" text,
  "keycloak_synced_at" timestamp with time zone,
  "keycloak_sync_status" text DEFAULT 'pending'::text NOT NULL,
  "enabled_date" timestamp with time zone,
  "disabled_date" timestamp with time zone,
  "idp_snapshot" jsonb,
  "attributes" jsonb,
  "default_company_code_id" uuid,
  "default_cost_center_id" uuid,
  "default_profit_center_id" uuid,
  "default_project_id" uuid,
  "default_dimension_set_id" uuid,
  "default_budget_allocation_id" uuid,
  "employee_id" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid,
  "supervisor_id" uuid,
  "supervisor_source" text
);

COMMENT ON TABLE "master"."principal_profile" IS 'ARCHETYPE=C;SCOPE=T. 1:1 with principal. Display profile, Keycloak binding, IdP snapshot (audit only). Working-context defaults (company, cost center, etc.) pre-populate document headers.';

COMMENT ON COLUMN "master"."principal_profile"."default_company_code_id" IS 'Working-context default company code. Pre-populates document headers. NULL = user must always choose.';

COMMENT ON COLUMN "master"."principal_profile"."default_cost_center_id" IS 'Working-context default cost center for expense allocation.';

COMMENT ON COLUMN "master"."principal_profile"."default_profit_center_id" IS 'Working-context default profit center for revenue allocation.';

COMMENT ON COLUMN "master"."principal_profile"."default_project_id" IS 'Working-context default project for line-item dimensioning.';

COMMENT ON COLUMN "master"."principal_profile"."default_dimension_set_id" IS 'Composite dimension default. FK to master.dimension_set. Supplies additional dimension axes beyond CC/PC/project.';

COMMENT ON COLUMN "master"."principal_profile"."default_budget_allocation_id" IS 'FUTURE ANCHOR — no FK target yet. Default budget envelope for commitment creation. FK will be added when budget allocation entity is created.';

COMMENT ON COLUMN "master"."principal_profile"."employee_id" IS 'Optional FK bridge to master.employee. Allows principal -> employee navigation without joining through principal_id. NULL for non-employees.';

CREATE TABLE "master"."principal_relationship" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "from_tenant_id" uuid NOT NULL,
  "from_principal_id" uuid NOT NULL,
  "to_tenant_id" uuid NOT NULL,
  "to_principal_id" uuid NOT NULL,
  "relationship_type" text NOT NULL,
  "verification_status" text DEFAULT 'unverified'::text NOT NULL,
  "verified_method" text,
  "verified_at" timestamp with time zone,
  "verified_by" uuid,
  "requested_at" timestamp with time zone,
  "requested_by" uuid,
  "approved_at" timestamp with time zone,
  "approved_by" uuid,
  "effective_from" timestamp with time zone DEFAULT now() NOT NULL,
  "effective_until" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."principal_relationship" IS 'ARCHETYPE=B;SCOPE=N. Principal correlation table for same-human, duplicate, merge, transfer, and support-shadow relationships. Correlation only; it never grants access by itself.';

COMMENT ON COLUMN "master"."principal_relationship"."relationship_type" IS 'Correlation intent such as same_human, duplicate_candidate, merged_into, transfer_requested, or support_shadow_for.';

CREATE TABLE "master"."principal_ui_preference" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "principal_id" uuid NOT NULL,
  "preference_code" text NOT NULL,
  "surface_code" text,
  "preference_value" jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."principal_ui_preference" IS 'ARCHETYPE=C;SCOPE=T. Narrow extension table for low-frequency, module-specific principal settings. Controlled key-value overlay — preference_code registered in ui.preference_code domain. Natural key (tenant_id, principal_id, preference_code, surface_code) UNIQUE NULLS NOT DISTINCT. Must NOT store saved-view payloads, dashboard layouts, recents, or search history. Small override values only (≤8 KB per row).';

COMMENT ON COLUMN "master"."principal_ui_preference"."preference_code" IS 'Lookup: ui.preference_code. Registered preference key. Prevents uncatalogued key proliferation.';

COMMENT ON COLUMN "master"."principal_ui_preference"."surface_code" IS 'Lookup: ui.surface_code. NULL = global (not surface-scoped). When set, the preference applies only to that UI surface.';

COMMENT ON COLUMN "master"."principal_ui_preference"."preference_value" IS 'JSONB payload. Size-capped at 8 KB to prevent misuse as a document store.';

CREATE TABLE "master"."principal_ui_profile" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "principal_id" uuid NOT NULL,
  "locale_code" text,
  "language_code" text,
  "timezone_code" text,
  "date_format" text,
  "number_format" text,
  "week_start" smallint,
  "appearance_mode" text,
  "density_code" text,
  "home_workspace_code" text,
  "home_module_code" text,
  "default_company_code_id" uuid,
  "default_book_id" uuid,
  "default_dashboard_id" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."principal_ui_profile" IS 'ARCHETYPE=C;SCOPE=T. 1:1 principal-level UI defaults. Mirrors master.tenant_profile at user level. All columns nullable — NULL = inherit from tenant_profile → platform default. Resolution: platform → tenant_profile → principal_ui_profile → preference → artifact. Does NOT store ephemeral session state (last tab, scroll, recents).';

COMMENT ON COLUMN "master"."principal_ui_profile"."locale_code" IS 'BCP-47 locale. FK: shared.locale(code). Overrides tenant_profile.locale_code.';

COMMENT ON COLUMN "master"."principal_ui_profile"."language_code" IS 'FK: shared.language(code). UI language. Overrides tenant_profile.language_code.';

COMMENT ON COLUMN "master"."principal_ui_profile"."timezone_code" IS 'IANA timezone. FK: shared.timezone(code). Overrides tenant_profile.timezone_code.';

COMMENT ON COLUMN "master"."principal_ui_profile"."date_format" IS 'strftime-style format string. NULL = inherit from tenant_profile.';

COMMENT ON COLUMN "master"."principal_ui_profile"."number_format" IS 'Decimal/thousands separator style. NULL = inherit from tenant_profile.';

COMMENT ON COLUMN "master"."principal_ui_profile"."week_start" IS '0=Sunday … 6=Saturday. NULL = inherit from tenant_profile.';

COMMENT ON COLUMN "master"."principal_ui_profile"."appearance_mode" IS 'Lookup: ui.appearance_mode. Visual theme mode (light, dark, system).';

COMMENT ON COLUMN "master"."principal_ui_profile"."density_code" IS 'Lookup: ui.density. Information density (compact, comfortable, spacious).';

COMMENT ON COLUMN "master"."principal_ui_profile"."home_workspace_code" IS 'FK: shared.workspace(code). Landing workspace after login.';

COMMENT ON COLUMN "master"."principal_ui_profile"."home_module_code" IS 'FK: shared.module(code). Landing module within the home workspace.';

COMMENT ON COLUMN "master"."principal_ui_profile"."default_book_id" IS 'FK: master.ledger_book(tenant_id, id). Default ledger book for journal entry creation. NULL = use primary book per company_code_book_assignment.';

COMMENT ON COLUMN "master"."principal_ui_profile"."default_dashboard_id" IS 'FK: master.dashboard(tenant_id, id). Default dashboard shown on home screen. NULL = tenant or system default dashboard.';

CREATE TABLE "master"."print_profile" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "paper_size" text DEFAULT 'A4'::text NOT NULL,
  "orientation" text DEFAULT 'portrait'::text NOT NULL,
  "color_mode" text DEFAULT 'color'::text NOT NULL,
  "quality_dpi" integer DEFAULT 300 NOT NULL,
  "output_format" text DEFAULT 'pdf'::text NOT NULL,
  "duplex" text DEFAULT 'none'::text NOT NULL,
  "margins" text DEFAULT 'normal'::text NOT NULL,
  "compression" text DEFAULT 'medium'::text NOT NULL,
  "header_footer" boolean DEFAULT true NOT NULL,
  "background_graphics" boolean DEFAULT true NOT NULL,
  "watermark_enabled" boolean DEFAULT false NOT NULL,
  "watermark_text" text,
  "encrypt_pdf" boolean DEFAULT false NOT NULL,
  "archive_after_render" boolean DEFAULT true NOT NULL,
  "email_after_render" boolean DEFAULT false NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."print_profile" IS 'ARCHETYPE=B;SCOPE=T. Named render output preset. Bundles paper, DPI, colour, compression, and post-render action settings for reference in render_output.manifest_json. Exactly one active default per tenant enforced by master_print_profile_default_uq partial index + fn_enforce_single_default(). Module 8 — PDF/HTML Generation & Print Services.';

COMMENT ON COLUMN "master"."print_profile"."paper_size" IS 'ISO/ANSI paper size: A3, A4, A5, B4, Letter, Legal.';

COMMENT ON COLUMN "master"."print_profile"."color_mode" IS 'Renderer colour mode: color (full CMYK), grayscale, bw (true black-and-white).';

COMMENT ON COLUMN "master"."print_profile"."quality_dpi" IS 'Render resolution in dots per inch. Common values: 72 (screen), 150 (draft), 300 (print), 600 (high-quality).';

COMMENT ON COLUMN "master"."print_profile"."output_format" IS 'Primary output: pdf (default), html (email/web), png (thumbnail/preview).';

COMMENT ON COLUMN "master"."print_profile"."duplex" IS 'Printer duplex binding: none (simplex), long (long-edge bind), short (short-edge bind).';

COMMENT ON COLUMN "master"."print_profile"."compression" IS 'PDF stream compression level: none → low → medium → high.';

COMMENT ON COLUMN "master"."print_profile"."watermark_enabled" IS 'When true, watermark_text must not be NULL (enforced by pp_watermark_text_chk).';

COMMENT ON COLUMN "master"."print_profile"."encrypt_pdf" IS 'Encrypt output PDF with AES-256. Decryption key managed by vault.';

COMMENT ON COLUMN "master"."print_profile"."archive_after_render" IS 'Write rendered output to object storage after successful render.';

COMMENT ON COLUMN "master"."print_profile"."email_after_render" IS 'Send rendered output to the document''s primary email recipient after delivery.';

COMMENT ON COLUMN "master"."print_profile"."is_default" IS 'Partial unique index ensures at most one active default per tenant.';

COMMENT ON COLUMN "master"."print_profile"."metadata" IS 'Freeform extension payload for tenant-specific renderer hints.';

CREATE TABLE "master"."procurement_organization_profile" (
  "tenant_id" uuid NOT NULL,
  "operating_organization_id" uuid NOT NULL,
  "organization_type" text NOT NULL,
  "buying_model_default" text DEFAULT 'federated'::text NOT NULL,
  "default_currency" character(3),
  "default_lead_company_id" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid,
  "central_buyer_company_id" uuid
);

COMMENT ON TABLE "master"."procurement_organization_profile" IS 'ARCHETYPE=B_LITE;SCOPE=T. Procurement behavior for an Operating Organization whose domain is procurement.';

COMMENT ON COLUMN "master"."procurement_organization_profile"."central_buyer_company_id" IS 'Required when buying_model_default is central_buyer. Explicit legal company responsible for central buying and intercompany handling.';

CREATE TABLE "master"."product" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "sku" text,
  "commodity_category_id" uuid,
  "product_type" text DEFAULT 'physical'::text NOT NULL,
  "unit_of_measure" text,
  "base_price" numeric(18,4),
  "currency_code" character(3),
  "is_taxable" boolean DEFAULT true NOT NULL,
  "tax_code" text,
  "default_tax_group_id" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."product" IS 'ARCHETYPE=B;SCOPE=T. Tenant-level sellable catalog object. SKU optional (partial unique). commodity_category_id -> commodity_category. Classifications via commodity_classification bridge.';

COMMENT ON COLUMN "master"."product"."default_tax_group_id" IS 'FK → control.tax_group (tenant-composite). Replaces free-text tax_code. Resolution order: product -> commodity_category -> scoped tax_rate_schedule.';

CREATE TABLE "master"."profit_center" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "company_code_id" uuid NOT NULL,
  "parent_id" uuid,
  "level_no" smallint DEFAULT 1 NOT NULL,
  "path" text,
  "node_type" text DEFAULT 'posting'::text NOT NULL,
  "description" text,
  "profit_center_type" text DEFAULT 'revenue'::text NOT NULL,
  "segment_code" text,
  "responsible_person_id" uuid,
  "currency_code" character(3),
  "valid_from" date,
  "valid_to" date,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."profit_center" IS 'ARCHETYPE=B;SCOPE=T. Responsibility center for P&L. Hierarchical tree scoped to a company_code.';

CREATE TABLE "master"."project" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "company_code_id" uuid NOT NULL,
  "description" text,
  "project_type" text NOT NULL,
  "parent_project_id" uuid,
  "level_no" smallint DEFAULT 1 NOT NULL,
  "path" text,
  "responsible_person_id" uuid,
  "is_cross_company" boolean DEFAULT false NOT NULL,
  "funding_profile_id" uuid,
  "default_cost_center_id" uuid,
  "planned_cost" numeric(18,4),
  "actual_cost" numeric(18,4) DEFAULT 0 NOT NULL,
  "currency_code" character(3) NOT NULL,
  "planned_start" date,
  "planned_end" date,
  "actual_start" date,
  "actual_end" date,
  "settlement_type" text DEFAULT 'cost_center'::text,
  "settlement_target_id" uuid,
  "valid_from" date,
  "valid_to" date,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."project" IS 'ARCHETYPE=B;SCOPE=T. Project header with hierarchical structure. Scoped to company_code.';

CREATE TABLE "master"."project_item" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "project_id" uuid NOT NULL,
  "company_code_id" uuid NOT NULL,
  "parent_item_id" uuid,
  "level_no" smallint DEFAULT 1 NOT NULL,
  "path" text,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "description" text,
  "item_type" text NOT NULL,
  "allow_time_entry" boolean DEFAULT false NOT NULL,
  "allow_expense_claim" boolean DEFAULT false NOT NULL,
  "allow_supplier_cost" boolean DEFAULT false NOT NULL,
  "allow_material_usage" boolean DEFAULT false NOT NULL,
  "allow_billable" boolean DEFAULT false NOT NULL,
  "capitalizable_default" boolean DEFAULT false NOT NULL,
  "planned_cost" numeric(18,4),
  "actual_cost" numeric(18,4) DEFAULT 0 NOT NULL,
  "currency_code" character(3),
  "default_cost_center_id" uuid,
  "planned_start" date,
  "planned_end" date,
  "actual_start" date,
  "actual_end" date,
  "completion_pct" numeric(5,2) DEFAULT 0 NOT NULL,
  "milestone_date" date,
  "is_milestone_reached" boolean DEFAULT false NOT NULL,
  "milestone_reached_at" timestamp with time zone,
  "milestone_reached_by" uuid,
  "responsible_person_id" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."project_item" IS 'ARCHETYPE=B;SCOPE=T. WBS element (phase / task / milestone) within a project. Trigger enforces company_code_id consistency with parent project.';

CREATE TABLE "master"."record_bookmark" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "principal_id" uuid NOT NULL,
  "entity_code" text NOT NULL,
  "record_id" uuid NOT NULL,
  "display_name" text,
  "record_code" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "master"."risk_dimension" (
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "category" text NOT NULL,
  "applicable_contexts" text[] DEFAULT '{}'::text[] NOT NULL,
  "is_knockout" boolean DEFAULT false NOT NULL,
  "ordinal" smallint DEFAULT 0 NOT NULL,
  "is_system_defined" boolean DEFAULT true NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL
);

COMMENT ON TABLE "master"."risk_dimension" IS 'ARCHETYPE=L. Platform risk dimension taxonomy. Axes along which party risk is measured. Dimensions are independent of context — weight per context is defined in risk_model_dimension.';

COMMENT ON COLUMN "master"."risk_dimension"."is_knockout" IS 'If true: a critical band on this dimension forces the overall assessment to critical, regardless of weighted average. Used for sanctions, OFAC hits, hard blocks.';

CREATE TABLE "master"."risk_driver_registry" (
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "default_dimension_code" text,
  "default_severity" text DEFAULT 'medium'::text NOT NULL,
  "applicable_evidence_types" text[] DEFAULT '{}'::text[] NOT NULL,
  "is_knockout" boolean DEFAULT false NOT NULL,
  "is_system_defined" boolean DEFAULT true NOT NULL
);

COMMENT ON TABLE "master"."risk_driver_registry" IS 'ARCHETYPE=L. Pre-defined risk driver types. party_risk_driver.driver_code is a nullable FK here — ad-hoc drivers (e.g. "unusual contract scope") do not need a registry entry.';

CREATE TABLE "master"."risk_model" (
  "code" text NOT NULL,
  "version" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "applicable_context" text NOT NULL,
  "scoring_algorithm" text DEFAULT 'weighted_average'::text NOT NULL,
  "risk_band_thresholds" jsonb DEFAULT '{"low": [75, 100], "high": [25, 49], "medium": [50, 74], "critical": [0, 24]}'::jsonb NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "effective_from" date DEFAULT CURRENT_DATE NOT NULL,
  "effective_until" date,
  "status" text DEFAULT 'active'::text NOT NULL
);

COMMENT ON TABLE "master"."risk_model" IS 'ARCHETYPE=L. Risk scoring model registry. Each (code, version) is immutable once active. Assessments pin to model_code + model_version — past assessments are never re-scored when the model changes. Deprecate old versions; create new ones.';

COMMENT ON COLUMN "master"."risk_model"."risk_band_thresholds" IS 'Score → band mapping. Lower score = higher risk. Format: {"band_name":[min_inclusive, max_inclusive]}. Scores are 0–100.';

CREATE TABLE "master"."risk_model_dimension" (
  "model_code" text NOT NULL,
  "model_version" text NOT NULL,
  "dimension_code" text NOT NULL,
  "weight" numeric(5,4) NOT NULL,
  "is_required" boolean DEFAULT true NOT NULL,
  "is_knockout" boolean DEFAULT false NOT NULL,
  "ordinal" smallint DEFAULT 0 NOT NULL
);

COMMENT ON TABLE "master"."risk_model_dimension" IS 'ARCHETYPE=L. Per-model dimension weights and behaviour overrides. Weight sum = 1.0 per (model_code, model_version) enforced at application layer. is_knockout here overrides risk_dimension.is_knockout for this specific model.';

CREATE TABLE "master"."risk_source" (
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "source_type" text NOT NULL,
  "provider_category" text NOT NULL,
  "trust_level" smallint DEFAULT 3 NOT NULL,
  "refresh_mode" text DEFAULT 'manual'::text NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL
);

COMMENT ON TABLE "master"."risk_source" IS 'ARCHETYPE=L. Platform-wide registry of risk signal origins (EcoVadis, D&B, OFAC, etc.). No tenant_id — all sources are globally visible. Tenant API credentials and enablement flags live in tenant_risk_source_config.';

COMMENT ON COLUMN "master"."risk_source"."trust_level" IS '1 = low trust (manual one-off); 5 = authoritative (regulated provider). Tenant can override via tenant_risk_source_config.custom_trust_level.';

CREATE TABLE "master"."sales_organization_profile" (
  "tenant_id" uuid NOT NULL,
  "operating_organization_id" uuid NOT NULL,
  "organization_type" text NOT NULL,
  "selling_model_default" text DEFAULT 'federated'::text NOT NULL,
  "default_currency" character(3),
  "default_booking_company_id" uuid,
  "default_invoicing_company_id" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid,
  "principal_seller_company_id" uuid
);

COMMENT ON TABLE "master"."sales_organization_profile" IS 'ARCHETYPE=B_LITE;SCOPE=T. Sales behavior for an Operating Organization whose domain is sales.';

COMMENT ON COLUMN "master"."sales_organization_profile"."principal_seller_company_id" IS 'Required when selling is principal_seller mode. Explicit legal seller responsible for intercompany fulfillment.';

CREATE TABLE "master"."saved_view" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "owner_principal_id" uuid,
  "scope" text NOT NULL,
  "surface_code" text NOT NULL,
  "entity_key" text,
  "plane_key" text DEFAULT 'neon'::text NOT NULL,
  "target" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "is_pinned" boolean DEFAULT false NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "state_json" jsonb NOT NULL,
  "state_hash" text,
  "version" integer DEFAULT 1 NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "deleted_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."saved_view" IS 'ARCHETYPE=B;SCOPE=T. Named grid/list/query presets. Durable artifact in master. Scope: personal (owner only), shared (all tenant users), system (platform-seeded). state_json holds filter/sort/column state; state_hash enables dedup. version supports optimistic concurrency. Lifecycle: active → archived. deleted_at only set when status = archived. Phase 1: single mutable row per view — no version history table yet.';

COMMENT ON COLUMN "master"."saved_view"."entity_key" IS 'Optional discriminator when a surface hosts multiple entity types. e.g. surface=document_list, entity_key=purchase_order.';

COMMENT ON COLUMN "master"."saved_view"."plane_key" IS 'Owning user experience. Prevents a saved target from being interpreted by a different plane.';

COMMENT ON COLUMN "master"."saved_view"."target" IS 'Typed target envelope: plane, surface, optional entityCode/routeName/parameters.';

COMMENT ON COLUMN "master"."saved_view"."state_hash" IS 'SHA-256 of canonical state_json. Enables dedup and change detection. Computed by application layer on write.';

COMMENT ON COLUMN "master"."saved_view"."version" IS 'Optimistic concurrency version. Incremented on every write. Client sends current version; server rejects stale updates.';

CREATE TABLE "master"."scoped_setting" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "scope_kind" text NOT NULL,
  "scope_id" text NOT NULL,
  "section_code" text NOT NULL,
  "setting_key" text NOT NULL,
  "setting_value" jsonb NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."scoped_setting" IS 'Versioned non-personal settings overrides resolved after platform defaults and tenant settings.';

CREATE TABLE "master"."shift_type" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "start_time" time without time zone NOT NULL,
  "end_time" time without time zone NOT NULL,
  "break_minutes" smallint DEFAULT 0 NOT NULL,
  "paid_minutes" smallint,
  "is_overnight" boolean DEFAULT false NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "master"."site" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "company_code_id" uuid NOT NULL,
  "description" text,
  "site_type" text NOT NULL,
  "parent_site_id" uuid,
  "level_no" smallint DEFAULT 1 NOT NULL,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "country_code" character(2) NOT NULL,
  "timezone_code" text,
  "manager_id" uuid,
  "capacity_uom" text,
  "capacity_value" numeric(12,2),
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."site" IS 'ARCHETYPE=B;SCOPE=T. Physical location (plant, office, store, branch, yard, depot). Address data via master.address_link, not inline columns. country_code is operational context for tax/timezone, not postal.';

CREATE TABLE "master"."statutory_scheme" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "country_code" character(2) NOT NULL,
  "scheme_type" text NOT NULL,
  "employee_component_id" uuid,
  "employer_component_id" uuid,
  "rate_table_id" uuid,
  "formula_expression_id" uuid,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "master"."supplier" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "business_partner_id" uuid NOT NULL,
  "supplier_code" text NOT NULL,
  "supplier_type" text DEFAULT 'general'::text NOT NULL,
  "account_manager_id" uuid,
  "commodity_category_id" uuid,
  "payment_term_id" uuid,
  "payment_method_id" uuid,
  "is_payment_ready" boolean DEFAULT false NOT NULL,
  "payment_ready_at" timestamp with time zone,
  "payment_ready_by" uuid,
  "payment_ready_reason" text,
  "anticipated_risk_tier" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."supplier" IS 'ARCHETYPE=B;SCOPE=T. AP role of a business partner. Thin role table — legal/identity fields on master.business_partner. Company-specific AP settings (payment, banking, GL) in company_code_supplier_profile. Classifications via commodity_classification bridge.';

COMMENT ON COLUMN "master"."supplier"."business_partner_id" IS 'Parent business partner (identity anchor). 1:1 per tenant (one BP can have one supplier role).';

COMMENT ON COLUMN "master"."supplier"."supplier_code" IS 'AP-facing serial code. Format: SUP-{CC}-{seq}. Unique per tenant.';

COMMENT ON COLUMN "master"."supplier"."payment_term_id" IS 'Default payment term for AP invoices. Can be overridden per company_code_supplier_profile.';

COMMENT ON COLUMN "master"."supplier"."payment_method_id" IS 'Default payment method. Can be overridden per company_code_supplier_profile.';

CREATE TABLE "master"."supplier_app_index" (
  "id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "supplier_id" uuid NOT NULL,
  "business_partner_id" uuid NOT NULL,
  "supplier_code" text NOT NULL,
  "supplier_type" text,
  "supplier_status" text DEFAULT 'active'::text NOT NULL,
  "is_payment_ready" boolean DEFAULT false NOT NULL,
  "business_partner_code" text,
  "name" text,
  "display_name" text,
  "legal_name" text,
  "legal_form" text,
  "registration_no" text,
  "registration_country_code" text,
  "tax_residence_country_code" text,
  "partner_category" text,
  "aliases" text[],
  "business_types" text[] DEFAULT '{}'::text[] NOT NULL,
  "search_text" text DEFAULT ''::text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "master"."supplier_block" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "supplier_id" uuid NOT NULL,
  "block_type" text NOT NULL,
  "block_reason" text NOT NULL,
  "blocked_at" timestamp with time zone DEFAULT now() NOT NULL,
  "blocked_by" uuid,
  "lifted_at" timestamp with time zone,
  "lifted_by" uuid,
  "lift_reason" text,
  "is_active" boolean GENERATED ALWAYS AS ((lifted_at IS NULL)) STORED,
  "notes" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."supplier_block" IS 'ARCHETYPE=B;SCOPE=T. Procurement/invoice/payment blocks placed on a supplier. block_type: procurement | invoice | payment | all. is_active=true while lifted_at IS NULL. Lifting is an update (set lifted_at/by/reason).';

COMMENT ON COLUMN "master"."supplier_block"."block_type" IS 'Scope of the block: procurement=PO creation blocked, invoice=invoice receipt blocked, payment=payment run blocked, all=all operations blocked.';

COMMENT ON COLUMN "master"."supplier_block"."is_active" IS 'Computed: true while lifted_at IS NULL (block still in effect). When a block is lifted, set lifted_at, lifted_by, and lift_reason.';

CREATE TABLE "master"."supplier_commodity_category" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "supplier_id" uuid NOT NULL,
  "commodity_category_id" uuid NOT NULL,
  "is_primary" boolean DEFAULT false NOT NULL,
  "effective_from" date,
  "effective_until" date,
  "notes" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."supplier_commodity_category" IS 'ARCHETYPE=B;SCOPE=T. Tenant-level commodity category memberships per supplier. Allows a supplier to be approved for multiple commodity categories before company-code eligibility is configured via control.commodity_category_buy_policy. is_primary: matches supplier.commodity_category_id (the dominant category). Enforced at most one active primary per supplier.';

CREATE TABLE "master"."supplier_qualification" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "supplier_id" uuid NOT NULL,
  "onboarding_status" text DEFAULT 'pending'::text NOT NULL,
  "profile_completeness_pct" smallint,
  "onboarding_approved_at" timestamp with time zone,
  "onboarding_approved_by" uuid,
  "is_approved_supplier" boolean DEFAULT false NOT NULL,
  "is_preferred_supplier" boolean DEFAULT false NOT NULL,
  "is_blocked" boolean DEFAULT false NOT NULL,
  "block_reason" text,
  "block_start_date" date,
  "risk_tier" text,
  "sanctions_status" text DEFAULT 'not_checked'::text NOT NULL,
  "aml_kyc_status" text DEFAULT 'not_started'::text NOT NULL,
  "sanctions_check_date" date,
  "kyc_expiry_date" date,
  "sourcing_event_count" integer DEFAULT 0 NOT NULL,
  "bid_count" integer DEFAULT 0 NOT NULL,
  "awarded_count" integer DEFAULT 0 NOT NULL,
  "delivery_score" numeric(5,2),
  "quality_score" numeric(5,2),
  "sla_score" numeric(5,2),
  "score_period_start" date,
  "score_period_end" date,
  "last_review_date" date,
  "next_review_date" date,
  "reviewed_by" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."supplier_qualification" IS 'ARCHETYPE=B;SCOPE=T. Supplier qualification, risk, and performance record. One row per (tenant, supplier). Covers onboarding, procurement approval, KYC/AML, performance scores. is_blocked=true gates supplier from appearing on new purchase orders.';

COMMENT ON COLUMN "master"."supplier_qualification"."profile_completeness_pct" IS 'Computed percentage of required onboarding fields completed (0–100). Updated by onboarding workflow.';

COMMENT ON COLUMN "master"."supplier_qualification"."is_blocked" IS 'Hard procurement block. block_reason IS NOT NULL required when is_blocked=true.';

CREATE TABLE "master"."tax_jurisdiction" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "country_code" character(2) NOT NULL,
  "state_region_code" text,
  "city_code" text,
  "jurisdiction_type" text NOT NULL,
  "authority_name" text,
  "registration_required" boolean DEFAULT false NOT NULL,
  "wht_section_required" boolean DEFAULT false NOT NULL,
  "filing_frequency" text,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" shared.active_inactive_archived_d DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS (((status)::text = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."tax_jurisdiction" IS 'ARCHETYPE=B;SCOPE=T. Tax authority registry (flat, non-hierarchical). country_code → shared.country; (country_code, state_region_code) → shared.state_region. city_code is free-form (reserved for municipal jurisdictions). jurisdiction_type / filing_frequency validated against control.lookup_value. Referenced by company_code.tax_jurisdiction_id.';

CREATE TABLE "master"."tax_type" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "condition_type_id" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" shared.active_inactive_d DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS (((status)::text = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."tax_type" IS 'ARCHETYPE=B;SCOPE=T. Jurisdictional tax kind (tax-engine internal classifier). Each row pairs a jurisdictional code (e.g. IN-CGST, AE-VAT) with a condition_type kind via condition_type_id. Term-type / category is read from the linked condition_type row — not duplicated here. Recoverability / WHT detection live on control.tax_rate_schedule.';

CREATE TABLE "master"."team" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "leader_id" uuid NOT NULL,
  "team_type" text DEFAULT 'functional'::text NOT NULL,
  "effective_from" date DEFAULT CURRENT_DATE NOT NULL,
  "effective_to" date,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."team" IS 'ARCHETYPE=B;SCOPE=T. Data scope resolver for scope=team permission evaluation. team_type: functional (permanent), project (time-bound), virtual (cross-functional).';

CREATE TABLE "master"."team_member" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "team_id" uuid NOT NULL,
  "principal_id" uuid NOT NULL,
  "role_in_team" text,
  "joined_at" timestamp with time zone DEFAULT now() NOT NULL,
  "left_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "master"."team_member" IS 'ARCHETYPE=C;SCOPE=T. Team membership. left_at preserved for history. Active members: left_at IS NULL. Uniqueness enforced by partial index team_member_active_uidx (WHERE left_at IS NULL) — allows re-joining after leaving.';

CREATE TABLE "master"."template" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "kind" text NOT NULL,
  "engine" text DEFAULT 'HANDLEBARS'::text NOT NULL,
  "current_version_id" uuid,
  "is_rtl_supported" boolean DEFAULT false NOT NULL,
  "is_letterhead_required" boolean DEFAULT false NOT NULL,
  "allowed_operations" text[],
  "supported_locales" text[],
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'DRAFT'::text NOT NULL,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."template" IS 'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Template registry. Tracks engine, lifecycle status, and current live version. current_version_id → snapshot.template_version via DEFERRABLE FK (06_constraints).';

COMMENT ON COLUMN "master"."template"."kind" IS 'Template functional category. e.g. INVOICE, STATEMENT, REPORT, NOTIFICATION.';

COMMENT ON COLUMN "master"."template"."current_version_id" IS 'Points to the currently active template version. FK is DEFERRABLE INITIALLY DEFERRED — template + first version can be inserted atomically in a single transaction.';

CREATE TABLE "master"."template_binding" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "template_id" uuid NOT NULL,
  "entity_name" text NOT NULL,
  "operation" text NOT NULL,
  "variant" text DEFAULT 'default'::text NOT NULL,
  "priority" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "master"."template_binding" IS 'ARCHETYPE=C;SCOPE=T. Maps (entity_name, operation, variant) to a template with priority-based resolution. resolve_template_binding() returns highest-priority active binding. is_active is a manual boolean — no status column, no update tracking.';

COMMENT ON COLUMN "master"."template_binding"."entity_name" IS 'Polymorphic entity type string. e.g. ''document.purchase_invoice'', ''document.credit_note''.';

COMMENT ON COLUMN "master"."template_binding"."priority" IS 'Higher value = wins resolution when multiple active bindings match the same key. Partial unique index prevents duplicate (template, entity, op, variant) per active binding.';

CREATE TABLE "master"."tenant" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "display_name" text NOT NULL,
  "realm_key" text DEFAULT 'neon'::text NOT NULL,
  "tenant_type" text DEFAULT 'customer'::text NOT NULL,
  "region" text,
  "subscription" text DEFAULT 'base'::text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'provisioning'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."tenant" IS 'ARCHETYPE=B;SCOPE=N. Multi-tenant root entity. PK: uuidv7 id. realm_key is the home/onboarding identity realm. Plane-specific access is authorised by identity bindings, auth groups, network memberships, and admin grants.';

COMMENT ON COLUMN "master"."tenant"."tenant_type" IS 'Plane-aware tenant classification. Examples: platform_internal, platform_owner, customer, partner, partner_prospect, supplier_prospect.';

CREATE TABLE "master"."tenant_identity_domain" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "provider_id" uuid NOT NULL,
  "domain" text NOT NULL,
  "verification_status" text DEFAULT 'pending'::text NOT NULL,
  "verification_method" text,
  "verified_at" timestamp with time zone,
  "enabled" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."tenant_identity_domain" IS 'Verified email-domain routing hints. A domain match selects an authentication route only; it never grants tenant membership.';

CREATE TABLE "master"."tenant_identity_provider" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "keycloak_alias" text NOT NULL,
  "realm_key" text DEFAULT 'athyper'::text NOT NULL,
  "protocol" text NOT NULL,
  "provider_type" text NOT NULL,
  "display_name" text NOT NULL,
  "configuration_ref" text NOT NULL,
  "feature_gate" text DEFAULT 'core'::text NOT NULL,
  "login_mode" text DEFAULT 'optional'::text NOT NULL,
  "first_login_policy" text DEFAULT 'existing-users-only'::text NOT NULL,
  "mfa_trust_policy" text DEFAULT 'never'::text NOT NULL,
  "allowed_planes" text[] DEFAULT ARRAY['neon'::text] NOT NULL,
  "enabled" boolean DEFAULT false NOT NULL,
  "configuration_version" integer DEFAULT 1 NOT NULL,
  "activated_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."tenant_identity_provider" IS 'Tenant IdP routing metadata. Secrets and provider credentials remain in Keycloak or the secret manager.';

CREATE TABLE "master"."tenant_parameter_definition" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "namespace" text NOT NULL,
  "display_name" text NOT NULL,
  "description" text,
  "data_type" text NOT NULL,
  "unit" text,
  "default_value" jsonb NOT NULL,
  "min_value" jsonb,
  "max_value" jsonb,
  "allowed_values" jsonb,
  "runtime_reload" text DEFAULT 'next_request'::text NOT NULL,
  "cache_ttl_seconds" integer DEFAULT 300 NOT NULL,
  "is_security_sensitive" boolean DEFAULT false NOT NULL,
  "is_runtime_reloadable" boolean DEFAULT true NOT NULL,
  "is_enabled" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."tenant_parameter_definition" IS 'ARCHETYPE=B;SCOPE=T. Tenant-owned custom parameter definitions. Product-owned definitions live in control.parameter_definition.';

CREATE TABLE "master"."tenant_parameter_value" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "parameter_code" text NOT NULL,
  "override_enabled" boolean DEFAULT false NOT NULL,
  "value" jsonb,
  "reason" text,
  "effective_from" timestamp with time zone DEFAULT now() NOT NULL,
  "effective_to" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."tenant_parameter_value" IS 'ARCHETYPE=C;SCOPE=T. Tenant override values for product-owned or tenant-owned parameters. override_enabled=false means resolved value falls back to product/default.';

COMMENT ON COLUMN "master"."tenant_parameter_value"."override_enabled" IS 'Tenant override switch. When false the row is retained for audit/history but runtime ignores value.';

CREATE TABLE "master"."tenant_profile" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "country_code" character(2),
  "currency_code" character(3),
  "locale_code" text,
  "timezone_code" text,
  "fiscal_year_start_month" smallint,
  "date_format" text,
  "number_format" text,
  "week_start" smallint,
  "language_code" text,
  "reporting_currency_code" character(3),
  "weekend_days" smallint[],
  "default_brand_profile_id" uuid,
  "default_letterhead_id" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."tenant_profile" IS 'ARCHETYPE=C;SCOPE=T. 1:1 extension of master.tenant. Per-tenant locale and fiscal defaults. All columns nullable — NULL means "use platform default". country_code / currency_code / locale_code / timezone_code FK-validated against shared.* reference tables.';

COMMENT ON COLUMN "master"."tenant_profile"."country_code" IS 'ISO 3166-1 alpha-2. FK: shared.country(code). Drives default address format, tax jurisdiction inference.';

COMMENT ON COLUMN "master"."tenant_profile"."currency_code" IS 'ISO 4217 alpha-3. FK: shared.currency(code). Default currency for document creation and reporting.';

COMMENT ON COLUMN "master"."tenant_profile"."locale_code" IS 'IETF BCP-47 locale code. FK: shared.locale(code). Drives number, date, and currency formatting in UI and exports.';

COMMENT ON COLUMN "master"."tenant_profile"."timezone_code" IS 'IANA timezone. FK: shared.timezone(code). Used for fiscal period boundary calculations and notification scheduling.';

COMMENT ON COLUMN "master"."tenant_profile"."fiscal_year_start_month" IS '1=January … 12=December. NULL = January (calendar year). Used by ledger.fiscal_period generation.';

COMMENT ON COLUMN "master"."tenant_profile"."date_format" IS 'strftime-style format string e.g. ''%d %b %Y''. NULL = DD Mon YYYY.';

COMMENT ON COLUMN "master"."tenant_profile"."number_format" IS 'Decimal/thousands separator style e.g. ''1,234.56'' or ''1.234,56''. NULL = system default derived from locale_code.';

COMMENT ON COLUMN "master"."tenant_profile"."week_start" IS '0=Sunday, 1=Monday … 6=Saturday. NULL = Monday (ISO week). Affects weekly digest scheduling and calendar display.';

COMMENT ON COLUMN "master"."tenant_profile"."language_code" IS 'FK to shared.language(code). Primary tenant language for UI and document generation. NULL = platform default (en).';

COMMENT ON COLUMN "master"."tenant_profile"."reporting_currency_code" IS 'Group/management reporting currency. Distinct from currency_code which is the default transaction currency. NULL = same as currency_code.';

COMMENT ON COLUMN "master"."tenant_profile"."weekend_days" IS 'Days of the week that are non-working. 0=Sun ... 6=Sat. GCC example: {4,5} (Fri+Sat). ISO example: {0,6} (Sat+Sun). Trigger-normalized to sorted unique. NULL = {0,6}.';

COMMENT ON COLUMN "master"."tenant_profile"."default_brand_profile_id" IS 'FK to master.brand_profile. Tenant-wide default brand for document rendering. NULL = no branding applied.';

COMMENT ON COLUMN "master"."tenant_profile"."default_letterhead_id" IS 'FK to master.letterhead. Tenant-wide default page header/footer. NULL = plain letterhead.';

CREATE TABLE "master"."tenant_relationship" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "from_tenant_id" uuid NOT NULL,
  "to_tenant_id" uuid NOT NULL,
  "relationship_type" text NOT NULL,
  "relationship_direction" text DEFAULT 'outbound'::text NOT NULL,
  "scopes" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "external_ref" text,
  "invited_email" text,
  "invited_at" timestamp with time zone,
  "accepted_at" timestamp with time zone,
  "effective_from" timestamp with time zone DEFAULT now() NOT NULL,
  "effective_until" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."tenant_relationship" IS 'ARCHETYPE=B;SCOPE=N. Explicit tenant-to-tenant relationship anchor for customer-partner, customer-supplier, implementation, and platform support relationships. Access is granted through access_grant/delegation_grant, not this table alone.';

COMMENT ON COLUMN "master"."tenant_relationship"."from_tenant_id" IS 'Initiating/source tenant for the relationship.';

COMMENT ON COLUMN "master"."tenant_relationship"."to_tenant_id" IS 'Target tenant for the relationship.';

COMMENT ON COLUMN "master"."tenant_relationship"."scopes" IS 'Relationship-level scopes such as modules, document families, support levels, or onboarding privileges.';

CREATE TABLE "master"."tenant_risk_source_config" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "source_code" text NOT NULL,
  "is_enabled" boolean DEFAULT true NOT NULL,
  "custom_trust_level" smallint,
  "api_config" jsonb,
  "status" text DEFAULT 'active'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."tenant_risk_source_config" IS 'ARCHETYPE=B;SCOPE=T. Per-tenant configuration for a platform risk source. api_config holds provider API credentials — encrypt at application layer. custom_trust_level overrides the platform default when set. If no row exists for (tenant, source_code), platform defaults from risk_source apply.';

CREATE TABLE "master"."trusted_device" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "principal_id" uuid NOT NULL,
  "device_token_hash" text NOT NULL,
  "user_agent" text,
  "ip_address" inet,
  "device_name" text,
  "is_revoked" boolean DEFAULT false NOT NULL,
  "revoked_at" timestamp with time zone,
  "expires_at" timestamp with time zone NOT NULL,
  "last_seen_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."trusted_device" IS 'ARCHETYPE=C;SCOPE=T. Step-up MFA suppression tokens. One row per trusted browser session. App-owned — not a Keycloak credential. Cookie holds raw token; only SHA-256 hash stored. is_revoked flag (not standard status) controls active/inactive state.';

COMMENT ON COLUMN "master"."trusted_device"."device_token_hash" IS 'SHA-256 hex digest of the opaque random 32-byte cookie value. Never store the raw token.';

COMMENT ON COLUMN "master"."trusted_device"."device_name" IS 'User-assigned label for this device (e.g. "Work laptop"). NULL if not set.';

CREATE TABLE "master"."warehouse" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "site_id" uuid NOT NULL,
  "description" text,
  "warehouse_type" text DEFAULT 'finished_goods'::text NOT NULL,
  "manager_id" uuid,
  "is_negative_stock_allowed" boolean DEFAULT false NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "master"."warehouse" IS 'ARCHETYPE=B;SCOPE=T. Inventory storage location within a site. Address inherited from parent site.';

CREATE TABLE "master"."work_assignment" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "employee_id" uuid NOT NULL,
  "employment_id" uuid,
  "position_id" uuid,
  "org_unit_id" uuid,
  "job_id" uuid,
  "manager_employee_id" uuid,
  "company_code_id" uuid NOT NULL,
  "cost_center_id" uuid,
  "profit_center_id" uuid,
  "site_id" uuid,
  "assignment_type" text DEFAULT 'primary'::text NOT NULL,
  "fte" numeric(5,4) DEFAULT 1 NOT NULL,
  "effective_from" date NOT NULL,
  "effective_until" date,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "master"."work_pattern" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "pattern_type" text DEFAULT 'weekly'::text NOT NULL,
  "cycle_length_days" smallint DEFAULT 7 NOT NULL,
  "weekly_hours" numeric(8,2),
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "master"."work_pattern_day" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "work_pattern_id" uuid NOT NULL,
  "day_no" smallint NOT NULL,
  "is_working_day" boolean DEFAULT true NOT NULL,
  "start_time" time without time zone,
  "end_time" time without time zone,
  "break_minutes" smallint DEFAULT 0 NOT NULL,
  "planned_minutes" smallint DEFAULT 0 NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "master"."notification_default"
  PARTITION OF "master"."notification"
  DEFAULT;
