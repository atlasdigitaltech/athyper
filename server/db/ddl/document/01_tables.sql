-- ============================================================================
-- document/01_tables.sql
-- Tables reconstructed from the live catalog.
-- Generated from the live Neon database document schema. Do not hand-edit.
-- ============================================================================

CREATE TABLE "document"."accounting_distribution" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "source_doc_type" text NOT NULL,
  "source_doc_id" uuid NOT NULL,
  "source_line_id" uuid NOT NULL,
  "distribution_no" smallint NOT NULL,
  "distribution_basis" text DEFAULT 'PERCENT'::text NOT NULL,
  "split_pct" numeric(7,4),
  "split_amount" numeric(18,4),
  "split_quantity" numeric(18,4),
  "distributed_amount" numeric(18,4) NOT NULL,
  "currency_code" character(3) NOT NULL,
  "amount_status" text DEFAULT 'PROVISIONAL'::text NOT NULL,
  "amount_calculated_at" timestamp with time zone,
  "amount_calculation_hash" text,
  "account_source" text DEFAULT 'PENDING'::text NOT NULL,
  "gl_account_id" uuid,
  "cost_center_id" uuid,
  "profit_center_id" uuid,
  "project_id" uuid,
  "dimension_set_id" uuid,
  "asset_id" uuid,
  "budget_allocation_id" uuid,
  "budget_check_result" text,
  "encumbrance_je_id" uuid,
  "description" text,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "document"."accounting_distribution" IS 'ARCHETYPE=C;SCOPE=T. Account assignment split proof layer. Pre-posting rows show how a commercial document line is split by amount, account derivation, dimensions, capex, and budget. Not the ledger; posted ledger evidence lives in document.journal_line.';

COMMENT ON COLUMN "document"."accounting_distribution"."distributed_amount" IS 'Assigned commercial amount for this split. For purchase invoice lines this reconciles to abs(net_amount - discount_amount) before posting.';

COMMENT ON COLUMN "document"."accounting_distribution"."gl_account_id" IS 'Resolved GL account for this account assignment split. Posting snapshots the result into document.journal_line.';

COMMENT ON COLUMN "document"."accounting_distribution"."tags" IS 'Operational tags. Part of the common child-carrier audit envelope.';

CREATE TABLE "document"."asset_transaction" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text DEFAULT ''::text NOT NULL,
  "name" text DEFAULT ''::text NOT NULL,
  "company_code_id" uuid NOT NULL,
  "asset_id" uuid NOT NULL,
  "asset_book_id" uuid,
  "book_type" text,
  "txn_type" text NOT NULL,
  "amount" numeric(18,4) NOT NULL,
  "currency_code" character(3) DEFAULT 'USD'::bpchar NOT NULL,
  "effective_date" date NOT NULL,
  "fiscal_year" smallint NOT NULL,
  "period_number" smallint NOT NULL,
  "from_values" jsonb,
  "to_values" jsonb,
  "reference_je_id" uuid,
  "depreciation_run_id" uuid,
  "depreciation_run_line_id" uuid,
  "reversal_of_id" uuid,
  "is_reversal" boolean DEFAULT false NOT NULL,
  "performed_by" uuid NOT NULL,
  "performed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "notes" text,
  "posted_at" timestamp with time zone,
  "posted_by" uuid,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = ANY (ARRAY['draft'::text, 'posted'::text]))) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "document"."asset_transaction" IS 'ARCHETYPE=B;SCOPE=T. Non-standard active-set: is_active GENERATED AS (status IN (''draft'',''posted'')). Asset lifecycle events. Links to asset_book_id (authoritative) and retains book_type as denormalized convenience. Consistency enforced by trigger.';

CREATE TABLE "document"."attendance_adjustment_request" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text DEFAULT ''::text NOT NULL,
  "employee_id" uuid NOT NULL,
  "attendance_day_id" uuid,
  "workflow_request_id" uuid,
  "requested_by" uuid,
  "reason_code" text,
  "reason_text" text,
  "requested_values" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "approved_values" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'approved'::text]))) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "document"."attendance_day" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "employee_id" uuid NOT NULL,
  "shift_assignment_id" uuid,
  "attendance_date" date NOT NULL,
  "scheduled_minutes" smallint DEFAULT 0 NOT NULL,
  "worked_minutes" smallint DEFAULT 0 NOT NULL,
  "paid_minutes" smallint DEFAULT 0 NOT NULL,
  "overtime_minutes" smallint DEFAULT 0 NOT NULL,
  "late_minutes" smallint DEFAULT 0 NOT NULL,
  "early_leave_minutes" smallint DEFAULT 0 NOT NULL,
  "absence_minutes" smallint DEFAULT 0 NOT NULL,
  "first_in_at" timestamp with time zone,
  "last_out_at" timestamp with time zone,
  "calculation_trace" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'open'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = ANY (ARRAY['open'::text, 'approved'::text, 'locked'::text]))) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "document"."bank_recon_case" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "company_code_id" uuid NOT NULL,
  "bank_account_id" uuid NOT NULL,
  "case_number" text NOT NULL,
  "case_type" text NOT NULL,
  "confidence_score" numeric(5,4) DEFAULT 1.0 NOT NULL,
  "status" text DEFAULT 'open'::text NOT NULL,
  "difference_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "currency_code" character(3) NOT NULL,
  "sign_off_je_id" uuid,
  "matched_at" timestamp with time zone,
  "signed_off_at" timestamp with time zone,
  "signed_off_by" uuid,
  "notes" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "document"."bank_recon_case" IS 'ARCHETYPE=B;SCOPE=T. Reconciliation case grouping payment_entry rows with bank_statement_line rows. Canonical M:N matching via bank_recon_case_line. difference_amount is signed: positive means books > bank; negative means bank > books. bank_charge and fx_difference cases get a JE posted at sign-off. FK constraints in 03_constraints.sql.';

CREATE TABLE "document"."bank_recon_case_line" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "bank_recon_case_id" uuid NOT NULL,
  "side" text NOT NULL,
  "payment_entry_id" uuid,
  "bank_statement_line_id" uuid,
  "amount" numeric(18,4) NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "document"."bank_recon_case_line" IS 'ARCHETYPE=D;SCOPE=T. Append-only M:N bridge between bank_recon_case and payment_entry (side=payment) or bank_statement_line (side=statement). Splits are expressed by multiple side=statement rows with partial amounts. Never updated or deleted — void the case to undo a match. FK constraints in 03_constraints.sql.';

CREATE TABLE "document"."bank_statement" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "company_code_id" uuid NOT NULL,
  "bank_account_id" uuid NOT NULL,
  "statement_ref" text,
  "period_start_date" date NOT NULL,
  "period_end_date" date NOT NULL,
  "opening_balance" numeric(18,4),
  "closing_balance" numeric(18,4),
  "currency_code" character(3) NOT NULL,
  "line_count" integer DEFAULT 0 NOT NULL,
  "source_format" text DEFAULT 'csv'::text NOT NULL,
  "source_hash" text,
  "status" text DEFAULT 'imported'::text NOT NULL,
  "sign_off_je_id" uuid,
  "signed_off_at" timestamp with time zone,
  "signed_off_by" uuid,
  "notes" text,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "document"."bank_statement" IS 'ARCHETYPE=B;SCOPE=T. One imported bank statement file per bank account period. Status lifecycle: imported→matching→signed_off→archived. Dedup via source_hash (SHA-256 of raw file). FK constraints in 03_constraints.sql.';

CREATE TABLE "document"."bank_statement_line" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "bank_statement_id" uuid NOT NULL,
  "line_no" integer NOT NULL,
  "transaction_date" date NOT NULL,
  "value_date" date,
  "description" text DEFAULT ''::text NOT NULL,
  "reference_number" text,
  "counterparty_name" text,
  "counterparty_account" text,
  "amount" numeric(18,4) NOT NULL,
  "running_balance" numeric(18,4),
  "currency_code" character(3) NOT NULL,
  "transaction_type" text DEFAULT 'payment'::text NOT NULL,
  "idempotency_key" text,
  "recon_status" text DEFAULT 'unmatched'::text NOT NULL,
  "recon_case_id" uuid,
  "raw_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone
);

COMMENT ON TABLE "document"."bank_statement_line" IS 'ARCHETYPE=D;SCOPE=T. One transaction row per imported bank statement line. amount sign: positive = credit to company account (money in), negative = debit (money out). recon_status and recon_case_id are mutable (updated by matching engine and manual reconciliation). idempotency_key: bank FITID when available; else SHA-256(raw_data)||'':''||line_no. FK constraints in 03_constraints.sql.';

CREATE TABLE "document"."book_posting_derivation" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "company_code_id" uuid NOT NULL,
  "source_journal_id" uuid NOT NULL,
  "posting_rule_id" uuid NOT NULL,
  "posting_rule_version" smallint NOT NULL,
  "target_journal_id" uuid,
  "idempotency_key" text NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "last_attempt_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "error_code" text,
  "error_message" text,
  "evidence_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "document"."book_posting_derivation" IS 'ARCHETYPE=E;SCOPE=T. Durable cross-book posting execution and audit ledger. One outcome per source journal, posting rule, and rule version; retries reuse idempotency_key.';

COMMENT ON COLUMN "document"."book_posting_derivation"."evidence_payload" IS 'Execution evidence including source/target books, matched filters, amount/account strategy, line count, and lineage depth.';

CREATE TABLE "document"."command_log" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "operation" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "status" text DEFAULT 'processing'::text NOT NULL,
  "result" jsonb,
  "error_code" text,
  "error_message" text,
  "principal_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);

COMMENT ON TABLE "document"."command_log" IS 'ARCHETYPE=INFRA;SCOPE=T. Idempotency log for AP invoice write operations. Callers insert with ON CONFLICT DO NOTHING; retry-safe by re-fetching existing row. Rows older than 30 days can be purged by a maintenance cron.';

CREATE TABLE "document"."commitment" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text DEFAULT ''::text NOT NULL,
  "name" text DEFAULT ''::text NOT NULL,
  "company_code_id" uuid NOT NULL,
  "requested_by" uuid NOT NULL,
  "workflow_request_id" uuid,
  "approved_at" timestamp with time zone,
  "approved_by" uuid,
  "commitment_type" text DEFAULT 'purchase_order'::text NOT NULL,
  "order_type" text,
  "party_type" text,
  "party_id" uuid,
  "parent_commitment_id" uuid,
  "release_sequence_no" smallint,
  "responsible_person_id" uuid,
  "document_date" date NOT NULL,
  "effective_date" date NOT NULL,
  "expiry_date" date,
  "currency_code" character(3) NOT NULL,
  "base_currency_code" character(3) NOT NULL,
  "total_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "scheduled_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "fulfilled_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "released_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "invoiced_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "paid_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "exchange_rate" numeric(18,10),
  "fx_rate_snapshot" jsonb,
  "fx_policy" text DEFAULT 'spot_on_event'::text NOT NULL,
  "budget_check_result" text,
  "encumbrance_je_id" uuid,
  "fiscal_year" smallint,
  "period_number" smallint,
  "payment_term_id" uuid,
  "renewal_terms" jsonb,
  "renewal_count" smallint DEFAULT 0 NOT NULL,
  "renewed_from_id" uuid,
  "row_version" bigint DEFAULT 1 NOT NULL,
  "version_number" integer DEFAULT 1 NOT NULL,
  "previous_version_id" uuid,
  "is_current_version" boolean DEFAULT true NOT NULL,
  "supersedes_at" timestamp with time zone,
  "is_provisional" boolean DEFAULT false NOT NULL,
  "draft_expires_at" timestamp with time zone,
  "draft_started_at" timestamp with time zone,
  "draft_started_by" uuid,
  "terminal_status" text,
  "status_source" text DEFAULT 'manual'::text NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = ANY (ARRAY['draft'::text, 'pending_approval'::text, 'approved'::text, 'active'::text, 'partially_fulfilled'::text]))) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "document"."commitment" IS 'ARCHETYPE=B;SCOPE=T. Non-standard active-set: is_active GENERATED AS (status IN (''draft'',''pending_approval'',''approved'',''active'',''partially_fulfilled'')). Rejected records remain revisable but are not operationally active. Commitment header: PO, contract, lease, subscription, standing order. Phase 1 reset folds the former commitment_procurement extension into the commitment header. code is the PO/commitment business identifier. Money flow is total, scheduled, released, fulfilled, invoiced, paid. Children: commitment_line, ledger.commitment_schedule, ledger.commitment_fulfillment.';

COMMENT ON COLUMN "document"."commitment"."fx_rate_snapshot" IS 'Explains how exchange_rate was resolved by fx.resolve_rate: identity, spot, commitment_fixed, reference_document, or manual_override.';

COMMENT ON COLUMN "document"."commitment"."fx_policy" IS 'FX policy for downstream P2P documents: spot_on_event, fixed_at_commitment, or manual_contract_rate.';

COMMENT ON COLUMN "document"."commitment"."is_provisional" IS 'True for create_mode=EARLY_DRAFT provisional rows. Provisional rows have status=draft and no business code until promoted by first Save.';

COMMENT ON COLUMN "document"."commitment"."draft_expires_at" IS 'Expiry target for abandoned provisional drafts. Cleanup applies only with safety predicates: is_provisional=true, status=draft, code empty.';

COMMENT ON COLUMN "document"."commitment"."draft_started_by" IS 'Principal that initiated the provisional draft; used to enforce one active provisional per tenant/entity/user.';

CREATE TABLE "document"."commitment_line" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "company_code_id" uuid NOT NULL,
  "commitment_id" uuid NOT NULL,
  "line_no" smallint NOT NULL,
  "requisition_line_id" uuid,
  "parent_contract_line_id" uuid,
  "item_id" uuid,
  "item_description" text NOT NULL,
  "procurement_type" text DEFAULT 'goods'::text NOT NULL,
  "line_type" text DEFAULT 'noncatalog'::text NOT NULL,
  "commodity_category_id" uuid,
  "business_intent_id" uuid,
  "classification_decision" jsonb,
  "asset_class_id" uuid,
  "uom_code" text NOT NULL,
  "quantity" numeric(18,4) NOT NULL,
  "unit_price" numeric(18,4) DEFAULT 0 NOT NULL,
  "price_unit" numeric(18,4) DEFAULT 1 NOT NULL,
  "currency_code" character(3) NOT NULL,
  "net_amount" numeric(18,4) GENERATED ALWAYS AS (((quantity * unit_price) / NULLIF(price_unit, (0)::numeric))) STORED,
  "tax_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "withholding_tax_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "gross_amount" numeric(18,4) GENERATED ALWAYS AS (((((quantity * unit_price) / NULLIF(price_unit, (0)::numeric)) + tax_amount) - withholding_tax_amount)) STORED,
  "over_delivery_tolerance" numeric(5,2) DEFAULT 0,
  "under_delivery_tolerance" numeric(5,2) DEFAULT 0,
  "tax_group_id" uuid,
  "withholding_tax_group_id" uuid,
  "to_tax_jurisdiction_id" uuid,
  "from_tax_jurisdiction_id" uuid,
  "required_by_date" date,
  "site_id" uuid,
  "warehouse_id" uuid,
  "storage_location" text,
  "shipto_address_id" uuid,
  "billto_address_id" uuid,
  "billfrom_address_id" uuid,
  "supplier_id" uuid,
  "shipfrom_address_id" uuid,
  "remitto_address_id" uuid,
  "received_quantity" numeric(18,4) DEFAULT 0 NOT NULL,
  "invoiced_quantity" numeric(18,4) DEFAULT 0 NOT NULL,
  "released_quantity" numeric(18,4) DEFAULT 0 NOT NULL,
  "released_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'open'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "document"."commitment_line" IS 'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Commitment origination line items. Phase 1 reset keeps classification and item-nature here, moves legal addresses to line scope, and drops legacy line metadata/version columns.';

CREATE TABLE "document"."commitment_release_allocation" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "parent_commitment_id" uuid NOT NULL,
  "parent_line_id" uuid NOT NULL,
  "release_commitment_id" uuid NOT NULL,
  "release_line_id" uuid NOT NULL,
  "released_quantity" numeric(18,4) DEFAULT 0 NOT NULL,
  "released_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "currency_code" character(3) NOT NULL,
  "released_at" timestamp with time zone DEFAULT now() NOT NULL,
  "released_by" uuid NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "document"."commitment_release_allocation" IS 'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Tracks qty/amount drawn from parent BLANKET_PO or FRAMEWORK_AGREEMENT line by each release PO line. Source of truth for release exhaustion checks.';

CREATE TABLE "document"."compensation_assignment" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text DEFAULT ''::text NOT NULL,
  "employee_id" uuid NOT NULL,
  "employment_id" uuid,
  "pay_group_id" uuid NOT NULL,
  "pay_structure_id" uuid,
  "currency_code" character(3) NOT NULL,
  "base_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "annualized_amount" numeric(18,4),
  "effective_from" date NOT NULL,
  "effective_until" date,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "document"."compensation_change" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text DEFAULT ''::text NOT NULL,
  "employee_id" uuid NOT NULL,
  "compensation_assignment_id" uuid,
  "workflow_request_id" uuid,
  "change_reason" text,
  "effective_date" date NOT NULL,
  "old_values" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "new_values" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'approved'::text]))) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "document"."delivery_note" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text DEFAULT ''::text NOT NULL,
  "name" text DEFAULT ''::text NOT NULL,
  "company_code_id" uuid NOT NULL,
  "delivery_note_number" text NOT NULL,
  "commitment_id" uuid NOT NULL,
  "supplier_id" uuid NOT NULL,
  "supplier_delivery_note_no" text,
  "supplier_dispatch_date" date,
  "bill_of_lading_no" text,
  "tracking_number" text,
  "delivery_date" date DEFAULT CURRENT_DATE NOT NULL,
  "expected_arrival_date" date,
  "actual_arrival_date" date,
  "delivery_site_id" uuid NOT NULL,
  "delivery_warehouse_id" uuid,
  "carrier_name" text,
  "transport_mode" text,
  "requires_inspection" boolean DEFAULT false NOT NULL,
  "inspection_status" text,
  "is_fully_receipted" boolean DEFAULT false NOT NULL,
  "currency_code" character(3) NOT NULL,
  "total_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "notes" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "row_version" bigint DEFAULT 1 NOT NULL,
  "version_number" integer DEFAULT 1 NOT NULL,
  "previous_version_id" uuid,
  "is_current_version" boolean DEFAULT true NOT NULL,
  "supersedes_at" timestamp with time zone,
  "terminal_status" text,
  "status_source" text DEFAULT 'manual'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "document"."delivery_note" IS 'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Logistics delivery note from supplier. Not approvable. Drives receipt creation on arrival.';

CREATE TABLE "document"."delivery_note_line" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "company_code_id" uuid NOT NULL,
  "delivery_note_id" uuid NOT NULL,
  "line_no" smallint NOT NULL,
  "commitment_line_id" uuid NOT NULL,
  "item_id" uuid,
  "item_description" text NOT NULL,
  "procurement_type" text DEFAULT 'goods'::text NOT NULL,
  "line_type" text DEFAULT 'noncatalog'::text NOT NULL,
  "uom_code" text NOT NULL,
  "shipped_quantity" numeric(18,4) NOT NULL,
  "received_quantity" numeric(18,4) DEFAULT 0 NOT NULL,
  "damaged_quantity" numeric(18,4) DEFAULT 0 NOT NULL,
  "rejected_quantity" numeric(18,4) DEFAULT 0 NOT NULL,
  "accepted_quantity" numeric(18,4) GENERATED ALWAYS AS (((received_quantity - damaged_quantity) - rejected_quantity)) STORED,
  "lot_number" text,
  "serial_numbers" text[],
  "batch_number" text,
  "expiry_date" date,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "document"."delivery_note_line" IS 'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Delivery note line items. accepted_quantity GENERATED (received - damaged - rejected). Tracks lot/batch/serial.';

CREATE TABLE "document"."depreciation_run" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text DEFAULT ''::text NOT NULL,
  "name" text DEFAULT ''::text NOT NULL,
  "company_code_id" uuid NOT NULL,
  "book_type" text NOT NULL,
  "book_id" uuid,
  "fiscal_year" smallint NOT NULL,
  "period_number" smallint NOT NULL,
  "asset_count" integer DEFAULT 0 NOT NULL,
  "total_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "currency_code" character(3) DEFAULT 'USD'::bpchar NOT NULL,
  "error_count" integer DEFAULT 0 NOT NULL,
  "error_log" jsonb,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "reference_je_id" uuid,
  "reversal_of_id" uuid,
  "is_reversal" boolean DEFAULT false NOT NULL,
  "run_by" uuid NOT NULL,
  "idempotency_key" text,
  "posted_at" timestamp with time zone,
  "posted_by" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'planned'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = ANY (ARRAY['planned'::text, 'running'::text]))) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "document"."depreciation_run" IS 'ARCHETYPE=B;SCOPE=T. Non-standard active-set: is_active GENERATED AS (status IN (''planned'',''running'')). Batch depreciation run header. Idempotency enforced via conditional unique index on (tenant_id, company_code_id, idempotency_key).';

CREATE TABLE "document"."depreciation_run_line" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "run_id" uuid NOT NULL,
  "asset_id" uuid NOT NULL,
  "asset_book_id" uuid NOT NULL,
  "depreciation_amount" numeric(18,4) NOT NULL,
  "currency_code" character(3) DEFAULT 'USD'::bpchar NOT NULL,
  "cost_basis_at_run" numeric(18,4) NOT NULL,
  "accum_depr_before" numeric(18,4) NOT NULL,
  "accum_depr_after" numeric(18,4) NOT NULL,
  "nbv_after" numeric(18,4) NOT NULL,
  "depreciation_method" text NOT NULL,
  "useful_life_months" integer NOT NULL,
  "remaining_life_months" integer NOT NULL,
  "asset_transaction_id" uuid,
  "line_status" text DEFAULT 'calculated'::text NOT NULL,
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "document"."depreciation_run_line" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=SNAPSHOT. Per-asset line detail within a depreciation run. Reconcilable to run header total. Asset/book mismatch prevented by composite FK (tenant_id, asset_book_id, asset_id). Immutable after creation — log.trg_prevent_mutation blocks UPDATE/DELETE.';

CREATE TABLE "document"."depreciation_schedule" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "asset_book_id" uuid NOT NULL,
  "schedule_version" smallint DEFAULT 1 NOT NULL,
  "fiscal_year" smallint NOT NULL,
  "period_number" smallint NOT NULL,
  "period_date" date NOT NULL,
  "schedule_amount" numeric(18,4) NOT NULL,
  "cumulative_amount" numeric(18,4) NOT NULL,
  "opening_nbv" numeric(18,4) NOT NULL,
  "closing_nbv" numeric(18,4) NOT NULL,
  "currency_code" character(3) DEFAULT 'USD'::bpchar NOT NULL,
  "actual_amount" numeric(18,4),
  "actual_run_line_id" uuid,
  "variance_amount" numeric(18,4) GENERATED ALWAYS AS (
CASE
    WHEN (actual_amount IS NOT NULL) THEN (actual_amount - schedule_amount)
    ELSE NULL::numeric
END) STORED,
  "is_final_period" boolean DEFAULT false NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "document"."depreciation_schedule" IS 'ARCHETYPE=C;SCOPE=T. Planned month-by-month depreciation projection per asset_book. Supports versioning and plan-vs-actual via generated variance_amount.';

CREATE TABLE "document"."doc_attachment" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" uuid NOT NULL,
  "filename" text NOT NULL,
  "content_type" text DEFAULT 'application/octet-stream'::text NOT NULL,
  "size_bytes" bigint DEFAULT 0 NOT NULL,
  "data_base64" text DEFAULT ''::text NOT NULL,
  "uploaded_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "document"."doc_attachment" IS 'ARCHETYPE=C;SCOPE=T. Inline document file attachments. Base64 content in data_base64. entity_type = document entity name slug; entity_id = document PK.';

COMMENT ON COLUMN "document"."doc_attachment"."data_base64" IS 'Base64-encoded file content. Empty string for metadata-only records (e.g. after migration to S3-backed master.attachment).';

CREATE TABLE "document"."employee_tax_declaration" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text DEFAULT ''::text NOT NULL,
  "employee_id" uuid NOT NULL,
  "employment_id" uuid,
  "tax_year" smallint NOT NULL,
  "country_code" character(2) NOT NULL,
  "workflow_request_id" uuid,
  "submitted_at" timestamp with time zone,
  "approved_at" timestamp with time zone,
  "approved_by" uuid,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'approved'::text]))) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "document"."employee_tax_declaration_line" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "employee_tax_declaration_id" uuid NOT NULL,
  "line_no" smallint NOT NULL,
  "declaration_code" text NOT NULL,
  "amount" numeric(18,4),
  "quantity" numeric(18,4),
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "document"."forecast_scenario" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "company_code_id" uuid NOT NULL,
  "description" text,
  "scenario_type" text DEFAULT 'EXPECTED'::text NOT NULL,
  "scenario_purpose" text DEFAULT 'BUDGET'::text NOT NULL,
  "fiscal_year" smallint NOT NULL,
  "period_from" smallint DEFAULT 1 NOT NULL,
  "period_to" smallint DEFAULT 12 NOT NULL,
  "planning_model_id" uuid,
  "responsible_person_id" uuid,
  "base_currency_code" character(3) NOT NULL,
  "total_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "line_count" smallint DEFAULT 0 NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "based_on_scenario_id" uuid,
  "is_baseline" boolean DEFAULT false NOT NULL,
  "variance_to_baseline" numeric(18,4),
  "confidence_level" numeric(3,2),
  "approved_at" timestamp with time zone,
  "approved_by" uuid,
  "published_at" timestamp with time zone,
  "published_by" uuid,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = ANY (ARRAY['draft'::text, 'in_review'::text, 'approved'::text, 'published'::text]))) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "document"."forecast_scenario" IS 'ARCHETYPE=B;SCOPE=T. Non-standard active-set: is_active GENERATED AS (status IN (''draft'',''in_review'',''approved'',''published'')). What-if forecast scenario envelope. Contains control.forecast_line items. scenario_type: EXPECTED, BEST_CASE, WORST_CASE, etc. for side-by-side comparison. Versioned per (tenant, company, code). Links to master.planning_model for driver-based forecasts. ';

CREATE TABLE "document"."fx_revaluation_run" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "company_code_id" uuid NOT NULL,
  "book_id" uuid NOT NULL,
  "fiscal_year" smallint NOT NULL,
  "period_number" smallint NOT NULL,
  "revaluation_date" date NOT NULL,
  "posting_date" date,
  "rate_type_used" text DEFAULT 'PERIOD_END'::text NOT NULL,
  "rate_source" text DEFAULT 'MANUAL'::text NOT NULL,
  "functional_currency" character(3) NOT NULL,
  "total_unrealized_gain" numeric(18,4) DEFAULT 0 NOT NULL,
  "total_unrealized_loss" numeric(18,4) DEFAULT 0 NOT NULL,
  "net_amount" numeric(18,4) GENERATED ALWAYS AS ((total_unrealized_gain - total_unrealized_loss)) STORED,
  "line_count" integer DEFAULT 0 NOT NULL,
  "revaluation_je_id" uuid,
  "reversal_je_id" uuid,
  "is_auto_reversed" boolean DEFAULT true NOT NULL,
  "auto_reverse_date" date,
  "idempotency_key" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = ANY (ARRAY['draft'::text, 'calculated'::text, 'posted'::text]))) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "document"."fx_revaluation_run" IS 'ARCHETYPE=B;SCOPE=T. Non-standard active-set: is_active GENERATED AS (status IN (''draft'',''calculated'',''posted'')). Period-end FX revaluation run header. net_amount GENERATED. Lines stored in ledger.fx_revaluation_line (immutable). Auto-reversal creates a reversal JE on auto_reverse_date (first day of next period).';

CREATE TABLE "document"."hr_case" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "employee_id" uuid,
  "case_type" text DEFAULT 'general'::text NOT NULL,
  "priority" text DEFAULT 'normal'::text NOT NULL,
  "assigned_to" uuid,
  "opened_at" timestamp with time zone DEFAULT now() NOT NULL,
  "closed_at" timestamp with time zone,
  "resolution_summary" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'open'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = ANY (ARRAY['open'::text, 'in_progress'::text, 'pending'::text]))) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "document"."ic_elimination" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text DEFAULT ''::text NOT NULL,
  "name" text DEFAULT ''::text NOT NULL,
  "company_code_id" uuid NOT NULL,
  "elimination_code" text NOT NULL,
  "source_company_code_id" uuid NOT NULL,
  "counterparty_company_code_id" uuid NOT NULL,
  "elimination_type" text NOT NULL,
  "consolidation_group" text NOT NULL,
  "book_id" uuid NOT NULL,
  "fiscal_year" smallint NOT NULL,
  "period_number" smallint NOT NULL,
  "elimination_date" date NOT NULL,
  "posting_date" date NOT NULL,
  "elimination_amount" numeric(18,4) NOT NULL,
  "currency_code" character(3) NOT NULL,
  "functional_currency_code" character(3) NOT NULL,
  "exchange_rate" numeric(18,10),
  "functional_amount" numeric(18,4),
  "line_count" smallint DEFAULT 0 NOT NULL,
  "ic_transaction_id" uuid,
  "je_id" uuid,
  "reversal_je_id" uuid,
  "decision_score" numeric(5,4),
  "approval_route" text DEFAULT 'STANDARD'::text NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'calculated'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = ANY (ARRAY['calculated'::text, 'approved'::text, 'posted'::text]))) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "approved_at" timestamp with time zone,
  "approved_by" uuid,
  "posted_at" timestamp with time zone,
  "posted_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "document"."ic_elimination" IS 'ARCHETYPE=B;SCOPE=T. Non-standard active-set: is_active GENERATED AS (status IN (''calculated'',''approved'',''posted'')). IC elimination operational document. Produces a JE (source_doc_type = ic_elimination). AI-assisted: decision_score (0-1) drives approval_route (AUTO/STANDARD/ENHANCED/MANUAL). Children: ledger.ic_elimination_line. Status: calculated → approved → posted → reversed | rejected | cancelled.';

CREATE TABLE "document"."import_request" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "entity_name" text NOT NULL,
  "file_ref" text NOT NULL,
  "file_name" text NOT NULL,
  "file_size_bytes" bigint,
  "file_format" text DEFAULT 'csv'::text NOT NULL,
  "mapping_config" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "import_mode" text DEFAULT 'create'::text NOT NULL,
  "options" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "total_rows" integer,
  "processed_rows" integer DEFAULT 0 NOT NULL,
  "success_count" integer DEFAULT 0 NOT NULL,
  "error_count" integer DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'uploaded'::text NOT NULL,
  "error_summary" jsonb,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "submitted_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "document"."import_request" IS 'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Bulk import submission. id = uploadToken returned to client. File stored in object storage at file_ref. Status: uploaded → processing → completed | failed | cancelled.';

CREATE TABLE "document"."import_request_chunk" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "import_request_id" uuid NOT NULL,
  "chunk_index" smallint NOT NULL,
  "row_start" integer NOT NULL,
  "row_end" integer NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "success_count" integer DEFAULT 0 NOT NULL,
  "error_count" integer DEFAULT 0 NOT NULL,
  "errors_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "job_id" text,
  "attempt_no" smallint DEFAULT 1 NOT NULL,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "duration_ms" integer
);

COMMENT ON TABLE "document"."import_request_chunk" IS 'ARCHETYPE=E;SCOPE=T. Independently retryable batch of rows within an import request. Each chunk becomes one BullMQ job on the jobs-import queue. errors_json: [{row_number, field, error_code, message}] per failed row.';

CREATE TABLE "document"."intercompany_agreement" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text DEFAULT ''::text NOT NULL,
  "name" text DEFAULT ''::text NOT NULL,
  "company_code_id" uuid NOT NULL,
  "agreement_number" text NOT NULL,
  "source_company_code_id" uuid NOT NULL,
  "dest_company_code_id" uuid NOT NULL,
  "agreement_type" text NOT NULL,
  "description" text,
  "transfer_pricing_method" text NOT NULL,
  "markup_pct" numeric(7,4),
  "arm_length_basis" text,
  "currency_code" character(3) NOT NULL,
  "base_currency_code" character(3),
  "annual_value" numeric(18,4),
  "total_value" numeric(18,4),
  "effective_from" date NOT NULL,
  "effective_to" date,
  "priority" smallint DEFAULT 0 NOT NULL,
  "conflict_strategy" text DEFAULT 'HIGHEST_PRIORITY'::text NOT NULL,
  "version" smallint DEFAULT 1 NOT NULL,
  "supersedes_id" uuid,
  "cost_center_id" uuid,
  "profit_center_id" uuid,
  "project_id" uuid,
  "site_id" uuid,
  "dimension_set_id" uuid,
  "agreement_owner_id" uuid,
  "approved_at" timestamp with time zone,
  "approved_by" uuid,
  "workflow_request_id" uuid,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = ANY (ARRAY['draft'::text, 'active'::text]))) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "document"."intercompany_agreement" IS 'ARCHETYPE=B;SCOPE=T. Non-standard active-set: is_active GENERATED AS (status IN (''draft'',''active'')). IC transfer pricing agreement between two company codes. OECD methods: CUP, COST_PLUS, RESALE_MINUS, TNMM, PROFIT_SPLIT, COMPARABLE_PROFIT. Conflict resolution via priority + conflict_strategy. Version chain via supersedes_id. Status: draft → active → suspended|superseded|expired|cancelled.';

CREATE TABLE "document"."intercompany_transaction" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text DEFAULT ''::text NOT NULL,
  "name" text DEFAULT ''::text NOT NULL,
  "company_code_id" uuid NOT NULL,
  "ic_txn_number" text NOT NULL,
  "source_company_code_id" uuid NOT NULL,
  "dest_company_code_id" uuid NOT NULL,
  "txn_type" text NOT NULL,
  "document_date" date NOT NULL,
  "posting_date" date NOT NULL,
  "currency_code" character(3) NOT NULL,
  "amount" numeric(18,4) NOT NULL,
  "agreement_id" uuid,
  "transfer_price" numeric(18,4),
  "arm_length_price" numeric(18,4),
  "pricing_variance" numeric(18,4) GENERATED ALWAYS AS ((transfer_price - arm_length_price)) STORED,
  "base_currency_code" character(3) NOT NULL,
  "exchange_rate" numeric(18,10),
  "base_amount" numeric(18,4),
  "source_je_id" uuid,
  "dest_je_id" uuid,
  "mirror_txn_id" uuid,
  "is_mirror" boolean DEFAULT false NOT NULL,
  "match_status" text DEFAULT 'UNMATCHED'::text NOT NULL,
  "matched_at" timestamp with time zone,
  "discrepancy_amount" numeric(18,4),
  "discrepancy_reason" text,
  "netting_batch_id" uuid,
  "fiscal_year" smallint NOT NULL,
  "period_number" smallint,
  "cost_center_id" uuid,
  "profit_center_id" uuid,
  "project_id" uuid,
  "site_id" uuid,
  "dimension_set_id" uuid,
  "description" text,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = ANY (ARRAY['draft'::text, 'created'::text, 'posted'::text, 'netted'::text]))) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "posted_at" timestamp with time zone,
  "posted_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "document"."intercompany_transaction" IS 'ARCHETYPE=B;SCOPE=T. Non-standard active-set: is_active GENERATED AS (status IN (''draft'',''created'',''posted'',''netted'')). IC billing event between two company codes. Dual-currency (transaction + base). pricing_variance GENERATED (transfer_price - arm_length_price). Mirror transactions auto-created on counterparty side (is_mirror = true). Status: draft → created → posted → netted → settled | disputed | reversed.';

CREATE TABLE "document"."invoice_match_case" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "company_code_id" uuid NOT NULL,
  "purchase_invoice_id" uuid NOT NULL,
  "commitment_id" uuid,
  "match_type" text DEFAULT 'three_way'::text NOT NULL,
  "match_result" text DEFAULT 'pending'::text NOT NULL,
  "total_quantity_variance" numeric(18,4) DEFAULT 0 NOT NULL,
  "total_price_variance" numeric(18,4) DEFAULT 0 NOT NULL,
  "total_amount_variance" numeric(18,4) DEFAULT 0 NOT NULL,
  "has_exceptions" boolean DEFAULT false NOT NULL,
  "exception_count" smallint DEFAULT 0 NOT NULL,
  "matched_at" timestamp with time zone,
  "matched_by" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "document"."invoice_match_case" IS 'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Three-way match result envelope per invoice. One row per invoice (1:1 UNIQUE). Exceptions tracked in document.match_exception.';

CREATE TABLE "document"."invoice_tax_snapshot" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "purchase_invoice_id" uuid NOT NULL,
  "invoice_line_id" uuid,
  "tax_group_id" uuid NOT NULL,
  "tax_component_code" text NOT NULL,
  "tax_rate_schedule_id" uuid,
  "tax_base_amount" numeric(18,4) NOT NULL,
  "tax_rate" numeric(7,4) NOT NULL,
  "tax_amount" numeric(18,4) NOT NULL,
  "currency_code" character(3) NOT NULL,
  "is_recoverable" boolean DEFAULT true NOT NULL,
  "is_withholding" boolean DEFAULT false NOT NULL,
  "tax_section_code" text,
  "jurisdiction_id" uuid,
  "wht_basis" text,
  "captured_at" timestamp with time zone DEFAULT now() NOT NULL,
  "captured_by" uuid NOT NULL
);

COMMENT ON TABLE "document"."invoice_tax_snapshot" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=SNAPSHOT. Frozen tax determination at invoice time. Create only where legal/regulatory requirements mandate it. Otherwise posted tax facts in ledger.tax_calculation are authoritative. WS-SNAPSHOT: tax_section_code + jurisdiction_id + wht_basis are snapshot copies (NOT FKs) so historical determinations stay stable across upstream schedule/jurisdiction mutations.';

CREATE TABLE "document"."journal_entry" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text DEFAULT ''::text NOT NULL,
  "name" text DEFAULT ''::text NOT NULL,
  "company_code_id" uuid NOT NULL,
  "book_id" uuid NOT NULL,
  "fiscal_period_id" uuid NOT NULL,
  "fiscal_year" smallint NOT NULL,
  "period_number" smallint NOT NULL,
  "je_number" text NOT NULL,
  "document_date" date NOT NULL,
  "posting_date" date NOT NULL,
  "source_doc_type" text NOT NULL,
  "source_doc_id" uuid,
  "transaction_currency" character(3) NOT NULL,
  "base_currency" character(3) NOT NULL,
  "total_debit" numeric(18,4) DEFAULT 0 NOT NULL,
  "total_credit" numeric(18,4) DEFAULT 0 NOT NULL,
  "line_count" smallint DEFAULT 0 NOT NULL,
  "description" text,
  "is_reversal" boolean DEFAULT false NOT NULL,
  "reversal_of_id" uuid,
  "reversed_by_id" uuid,
  "is_auto_reverse" boolean DEFAULT false NOT NULL,
  "auto_reverse_date" date,
  "derived_from_je_id" uuid,
  "posting_rule_id" uuid,
  "book_idempotency_key" text,
  "prior_period_flag" boolean DEFAULT false NOT NULL,
  "original_period_year" smallint,
  "original_period_number" smallint,
  "close_override_id" uuid,
  "posted_at" timestamp with time zone,
  "posted_by" uuid,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = ANY (ARRAY['draft'::text, 'created'::text, 'pending_approval'::text, 'approved'::text, 'posted'::text]))) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "document"."journal_entry" IS 'ARCHETYPE=B;SCOPE=T. Non-standard active-set: is_active GENERATED AS (status IN (''draft'',''created'',''posted'')). Journal entry header. Status lifecycle: draft → created → posted → reversed. Amounts cached from lines (trigger-synced). Immutable after posted. document_date = business event date, posting_date = GL period assignment.';

CREATE TABLE "document"."journal_line" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "journal_entry_id" uuid NOT NULL,
  "company_code_id" uuid NOT NULL,
  "book_id" uuid NOT NULL,
  "fiscal_period_id" uuid NOT NULL,
  "fiscal_year" smallint NOT NULL,
  "period_number" smallint NOT NULL,
  "posting_date" date NOT NULL,
  "line_no" smallint NOT NULL,
  "gl_account_id" uuid NOT NULL,
  "transaction_currency" character(3) NOT NULL,
  "transaction_debit" numeric(18,4) DEFAULT 0 NOT NULL,
  "transaction_credit" numeric(18,4) DEFAULT 0 NOT NULL,
  "base_currency" character(3) NOT NULL,
  "base_debit" numeric(18,4) DEFAULT 0 NOT NULL,
  "base_credit" numeric(18,4) DEFAULT 0 NOT NULL,
  "exchange_rate" numeric(18,10),
  "fx_rate_snapshot" jsonb,
  "cost_center_id" uuid,
  "profit_center_id" uuid,
  "project_id" uuid,
  "site_id" uuid,
  "dimension_set_id" uuid,
  "party_type" text,
  "party_id" uuid,
  "subledger_type" text,
  "description" text,
  "source_doc_line_id" uuid,
  "posted_at" timestamp with time zone,
  "posted_by" uuid,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "document"."journal_line" IS 'ARCHETYPE=C;SCOPE=T. Journal entry debit/credit lines. Dual-currency: transaction + base amounts. Strict polarity: exactly one side > 0. Denormalized header fields for query perf.';

COMMENT ON COLUMN "document"."journal_line"."fx_rate_snapshot" IS 'Explains how journal_line.exchange_rate was resolved or inherited. Source-generated JE lines inherit source document FX; standalone JE lines use fx.resolve_rate.';

CREATE TABLE "document"."journal_line_reference" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "journal_line_id" uuid NOT NULL,
  "ref_type" text NOT NULL,
  "ref_doc_type" text NOT NULL,
  "ref_doc_id" uuid NOT NULL,
  "ref_doc_line_id" uuid,
  "ref_doc_number" text,
  "pricing_component_id" uuid,
  "accounting_distribution_id" uuid,
  "condition_type_id" uuid,
  "component_bucket" text,
  "posting_role_code" text,
  "policy_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "allocated_amount" numeric(18,4) NOT NULL,
  "currency_code" character(3) NOT NULL,
  "base_amount" numeric(18,4),
  "is_full_settlement" boolean DEFAULT false NOT NULL,
  "settlement_date" date,
  "description" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "document"."journal_line_reference" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. Allocation/application tracking. 1:N child of journal_line. Handles payment allocation, credit note application, netting, advance clearing, PO matching, and asset capitalization.';

CREATE TABLE "document"."leave_balance_entry" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "employee_id" uuid NOT NULL,
  "leave_plan_id" uuid,
  "leave_type_id" uuid NOT NULL,
  "entry_date" date NOT NULL,
  "period_start" date,
  "period_end" date,
  "quantity_delta" numeric(12,4) NOT NULL,
  "balance_after" numeric(12,4),
  "source_doc_type" text NOT NULL,
  "source_doc_id" uuid,
  "description" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "document"."leave_request" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text DEFAULT ''::text NOT NULL,
  "employee_id" uuid NOT NULL,
  "leave_type_id" uuid NOT NULL,
  "leave_plan_id" uuid,
  "workflow_request_id" uuid,
  "start_date" date NOT NULL,
  "end_date" date NOT NULL,
  "start_half" text,
  "end_half" text,
  "requested_quantity" numeric(12,4) NOT NULL,
  "approved_quantity" numeric(12,4),
  "reason" text,
  "attachment_required" boolean DEFAULT false NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'approved'::text]))) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "document"."match_exception" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "invoice_match_case_id" uuid NOT NULL,
  "invoice_line_id" uuid NOT NULL,
  "exception_type" text NOT NULL,
  "exception_subtype" text,
  "expected_value" numeric(18,4),
  "actual_value" numeric(18,4),
  "variance_amount" numeric(18,4) NOT NULL,
  "variance_pct" numeric(7,4),
  "currency_code" character(3) NOT NULL,
  "tolerance_pct" numeric(5,2),
  "tolerance_amount" numeric(18,4),
  "is_within_tolerance" boolean DEFAULT false NOT NULL,
  "resolution_type" text,
  "resolution_notes" text,
  "resolved_by" uuid,
  "resolved_at" timestamp with time zone,
  "workflow_request_id" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'open'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "document"."match_exception" IS 'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Per-line match variances requiring resolution. Clean matches are tracked on purchase_invoice_line.match_status + matched_quantity only.';

CREATE TABLE "document"."netting_batch" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text DEFAULT ''::text NOT NULL,
  "name" text DEFAULT ''::text NOT NULL,
  "company_code_id" uuid NOT NULL,
  "batch_number" text NOT NULL,
  "company_code_a_id" uuid NOT NULL,
  "company_code_b_id" uuid NOT NULL,
  "batch_date" date NOT NULL,
  "cut_off_date" date NOT NULL,
  "settlement_date" date,
  "currency_code" character(3) NOT NULL,
  "gross_amount_a_to_b" numeric(18,4) DEFAULT 0 NOT NULL,
  "gross_amount_b_to_a" numeric(18,4) DEFAULT 0 NOT NULL,
  "gross_amount" numeric(18,4) GENERATED ALWAYS AS ((gross_amount_a_to_b + gross_amount_b_to_a)) STORED,
  "net_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "net_direction" text DEFAULT 'ZERO'::text NOT NULL,
  "txn_count" integer DEFAULT 0 NOT NULL,
  "settlement_je_id" uuid,
  "fiscal_year" smallint NOT NULL,
  "period_number" smallint,
  "idempotency_key" text,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = ANY (ARRAY['draft'::text, 'calculated'::text, 'approved'::text]))) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "settled_at" timestamp with time zone,
  "settled_by" uuid,
  "approved_at" timestamp with time zone,
  "approved_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "document"."netting_batch" IS 'ARCHETYPE=B;SCOPE=T. Non-standard active-set: is_active GENERATED AS (status IN (''draft'',''calculated'',''approved'')). Bilateral IC netting batch header. gross_amount GENERATED (a_to_b + b_to_a). net_amount = |a_to_b - b_to_a|; net_direction indicates payer. Status: draft → calculated → approved → settled | cancelled.';

CREATE TABLE "document"."obligation_horizon" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "commitment_id" uuid NOT NULL,
  "schedule_id" uuid,
  "fiscal_year" smallint NOT NULL,
  "period_from" smallint DEFAULT 1 NOT NULL,
  "period_to" smallint DEFAULT 12 NOT NULL,
  "obligation_tier" text DEFAULT 'PLANNED'::text NOT NULL,
  "amount" numeric(18,4) NOT NULL,
  "original_amount" numeric(18,4),
  "currency_code" text NOT NULL,
  "fp_id" uuid,
  "intent_id" uuid,
  "company_code_id" uuid,
  "spread_method" text DEFAULT 'EVEN'::text NOT NULL,
  "period_amounts" jsonb,
  "confidence" numeric(3,2) DEFAULT 1.00 NOT NULL,
  "source_type" text DEFAULT 'CONTRACT'::text NOT NULL,
  "escalation_formula" jsonb,
  "escalation_applied_at" timestamp with time zone,
  "contract_currency_code" text,
  "contract_amount" numeric(18,4),
  "exchange_rate" numeric(12,6),
  "rate_type" text,
  "retention_pct" numeric(5,2),
  "retention_release_date" date,
  "amendment_count" smallint DEFAULT 0 NOT NULL,
  "variance_to_original" numeric(18,4) GENERATED ALWAYS AS ((amount - original_amount)) STORED,
  "promoted_at" timestamp with time zone,
  "reserved_at" timestamp with time zone,
  "funding_txn_id" uuid,
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

COMMENT ON TABLE "document"."obligation_horizon" IS 'ARCHETYPE=B;SCOPE=T. Engine 4.13: multi-year demand signal. obligation_tier: PLANNED → FORECAST → RESERVED → COMMITTED → CONSUMED. Created on contract signing; advanced by budget lifecycle events. Child of document.commitment. variance_to_original = GENERATED (amount - original_amount).';

CREATE TABLE "document"."offboarding_case" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "employee_id" uuid NOT NULL,
  "target_exit_date" date NOT NULL,
  "reason_code" text,
  "checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "workflow_request_id" uuid,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = ANY (ARRAY['draft'::text, 'active'::text]))) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "document"."onboarding_case" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "person_id" uuid,
  "employee_id" uuid,
  "target_start_date" date,
  "checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "workflow_request_id" uuid,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = ANY (ARRAY['draft'::text, 'active'::text]))) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "document"."operating_organization_resource_company" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "resource_owner_id" uuid NOT NULL,
  "company_code_id" uuid NOT NULL,
  "participation_role" text DEFAULT 'participant'::text NOT NULL,
  "allocation_percent" numeric(7,4),
  "allocation_amount" numeric(18,4),
  "output_type" text,
  "status" text DEFAULT 'active'::text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "document"."operating_organization_resource_company" IS 'Participant Company Code allocations for federated procurement awards and sales quotations. Legal output documents remain Company Code-owned.';

CREATE TABLE "document"."operating_organization_resource_owner" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "operating_organization_id" uuid NOT NULL,
  "domain" text NOT NULL,
  "resource_type" text NOT NULL,
  "resource_id" uuid NOT NULL,
  "ownership_role" text DEFAULT 'owner'::text NOT NULL,
  "central_company_code_id" uuid,
  "principal_seller_company_id" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "document"."operating_organization_resource_owner" IS 'Operating Organization ownership for procurement and sales orchestration resources. This table does not replace Company Code ownership on legal transactions.';

COMMENT ON COLUMN "document"."operating_organization_resource_owner"."central_company_code_id" IS 'Explicit central buying company for a procurement resource; required by application when central buying is selected.';

COMMENT ON COLUMN "document"."operating_organization_resource_owner"."principal_seller_company_id" IS 'Explicit principal selling company for a sales resource; required by application when principal-seller mode is selected.';

CREATE TABLE "document"."party_advance_balance" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "company_code_id" uuid NOT NULL,
  "supplier_id" uuid NOT NULL,
  "currency_code" text DEFAULT ''::text NOT NULL,
  "advance_balance" numeric(18,4) DEFAULT 0 NOT NULL,
  "retention_balance" numeric(18,4) DEFAULT 0 NOT NULL,
  "advance_invoice_count" integer DEFAULT 0 NOT NULL,
  "retention_invoice_count" integer DEFAULT 0 NOT NULL,
  "last_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL
);

COMMENT ON TABLE "document"."party_advance_balance" IS 'ARCHETYPE=BALANCE;SCOPE=T. Running advance/retention balance per supplier + company + currency. Populated on posted financial events only (invoice posting/reversal in advance-balance.service.ts).';

CREATE TABLE "document"."payment_entry" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text DEFAULT ''::text NOT NULL,
  "name" text DEFAULT ''::text NOT NULL,
  "company_code_id" uuid NOT NULL,
  "payment_number" text NOT NULL,
  "payment_type" text DEFAULT 'standard'::text NOT NULL,
  "payment_direction" text DEFAULT 'OUTBOUND'::text NOT NULL,
  "supplier_id" uuid,
  "supplier_name" text NOT NULL,
  "payment_method_id" uuid NOT NULL,
  "bank_account_id" uuid,
  "supplier_bank_link_id" uuid,
  "payment_reference" text,
  "bank_reference" text,
  "check_number" text,
  "document_date" date DEFAULT CURRENT_DATE NOT NULL,
  "posting_date" date DEFAULT CURRENT_DATE NOT NULL,
  "value_date" date DEFAULT CURRENT_DATE NOT NULL,
  "currency_code" character(3) NOT NULL,
  "base_currency_code" character(3) NOT NULL,
  "exchange_rate" numeric(18,10),
  "fx_rate_snapshot" jsonb,
  "payment_amount" numeric(18,4) NOT NULL,
  "base_amount" numeric(18,4),
  "payment_currency_code" character(3),
  "payment_exchange_rate" numeric(18,10),
  "payment_fx_rate_snapshot" jsonb,
  "payment_currency_amount" numeric(18,4),
  "fiscal_year" smallint NOT NULL,
  "period_number" smallint NOT NULL,
  "payment_je_id" uuid,
  "is_posted" boolean DEFAULT false NOT NULL,
  "posted_at" timestamp with time zone,
  "posted_by" uuid,
  "is_reversal" boolean DEFAULT false NOT NULL,
  "reversal_of_id" uuid,
  "reversal_reason" text,
  "workflow_request_id" uuid,
  "approved_at" timestamp with time zone,
  "approved_by" uuid,
  "payment_run_id" uuid,
  "is_batch_payment" boolean DEFAULT false NOT NULL,
  "is_printed" boolean DEFAULT false NOT NULL,
  "is_transmitted" boolean DEFAULT false NOT NULL,
  "transmission_status" text,
  "is_voided" boolean DEFAULT false NOT NULL,
  "voided_at" timestamp with time zone,
  "voided_by" uuid,
  "void_reason" text,
  "cleared_date" date,
  "line_count" smallint DEFAULT 0 NOT NULL,
  "notes" text,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = ANY (ARRAY['draft'::text, 'pending_approval'::text, 'approved'::text, 'posted'::text, 'transmitted'::text, 'printed'::text]))) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid,
  "bank_statement_line_id" uuid
);

COMMENT ON TABLE "document"."payment_entry" IS 'ARCHETYPE=B;SCOPE=T. Non-standard active-set: is_active GENERATED AS (status IN (''draft'',''pending_approval'',''approved'',''posted'',''transmitted'',''printed'')). Approvable AP payment. Accounting driven by control.payment_settlement_rule posting roles. Settlement posting: Dr AP Trade Payable → Cr Bank + optional Cr Discount Income + Dr/Cr FX.';

COMMENT ON COLUMN "document"."payment_entry"."fx_rate_snapshot" IS 'Explains how document-currency exchange_rate was resolved by fx.resolve_rate for payment accounting.';

COMMENT ON COLUMN "document"."payment_entry"."payment_fx_rate_snapshot" IS 'Explains how payment_exchange_rate was resolved by fx.resolve_rate for payment/bank currency settlement.';

COMMENT ON COLUMN "document"."payment_entry"."bank_statement_line_id" IS 'Shortcut FK to the bank_statement_line this payment was matched against. NULL until reconciled. Set alongside cleared_date during reconciliation. Canonical M:N matching record is in bank_recon_case_line. payment_entry.status stays ''posted'' — this column (not status) signals reconciliation.';

CREATE TABLE "document"."payment_entry_allocation" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "payment_entry_id" uuid NOT NULL,
  "line_no" smallint NOT NULL,
  "purchase_invoice_id" uuid,
  "commitment_id" uuid,
  "currency_code" character(3) NOT NULL,
  "allocated_amount" numeric(18,4) NOT NULL,
  "discount_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "withholding_tax_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "advance_recovery_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "retention_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "net_payment_amount" numeric(18,4) GENERATED ALWAYS AS (((((allocated_amount - discount_amount) - withholding_tax_amount) - advance_recovery_amount) - retention_amount)) STORED,
  "base_currency_code" character(3),
  "exchange_rate" numeric(18,10),
  "base_amount" numeric(18,4),
  "fx_gain_loss" numeric(18,4) DEFAULT 0 NOT NULL,
  "is_discount_taken" boolean DEFAULT false NOT NULL,
  "discount_due_date" date,
  "payment_term_application_id" uuid,
  "notes" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "document"."payment_entry_allocation" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. Invoice/commitment allocation lines for a payment. net_payment_amount GENERATED. Append-only — void and re-allocate to correct.';

CREATE TABLE "document"."payment_remittance_output" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "company_code_id" uuid NOT NULL,
  "remittance_number" text NOT NULL,
  "payment_entry_id" uuid NOT NULL,
  "supplier_id" uuid NOT NULL,
  "currency_code" character(3) NOT NULL,
  "total_amount" numeric(18,4) NOT NULL,
  "net_remitted" numeric(18,4) NOT NULL,
  "delivery_method" text DEFAULT 'EMAIL'::text NOT NULL,
  "delivered_at" timestamp with time zone,
  "delivery_status" text DEFAULT 'pending'::text NOT NULL,
  "render_output_id" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "document"."payment_remittance_output" IS 'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Remittance advice output record per payment. Links to document.render_output for PDF generation. Delivery status tracked separately.';

CREATE TABLE "document"."payment_term_application" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "invoice_id" uuid NOT NULL,
  "invoice_line_id" uuid,
  "commitment_id" uuid,
  "payment_term_id" uuid,
  "clause_id" uuid,
  "term_snapshot" jsonb,
  "clause_snapshot" jsonb,
  "application_status" text DEFAULT 'APPLIED'::text NOT NULL,
  "clause_type" text NOT NULL,
  "clause_code" text NOT NULL,
  "calculated_basis_amount" numeric(18,4) NOT NULL,
  "default_pct" numeric(5,2),
  "applied_pct" numeric(5,2),
  "default_amount" numeric(18,4) NOT NULL,
  "applied_amount" numeric(18,4) NOT NULL,
  "is_user_editable" boolean DEFAULT false NOT NULL,
  "evaluation_sequence_no" integer NOT NULL,
  "running_total_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "remaining_balance_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "is_effective" boolean DEFAULT true NOT NULL,
  "reversed_by_application_id" uuid,
  "superseded_by_application_id" uuid,
  "system_reason_code" text,
  "manual_override_reason" text,
  "workflow_request_id" uuid,
  "override_requested_by" uuid,
  "override_requested_at" timestamp with time zone,
  "override_decision" text,
  "override_decided_by" uuid,
  "override_decided_at" timestamp with time zone,
  "schedule_id" uuid,
  "base_event_date" date,
  "days_applied" smallint,
  "resolved_due_date" date,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid,
  "pricing_component_id" uuid
);

COMMENT ON TABLE "document"."payment_term_application" IS 'ARCHETYPE=C;SCOPE=T. Invoice × clause evaluation result. One row per invoice × clause (× line) evaluation.';

COMMENT ON COLUMN "document"."payment_term_application"."pricing_component_id" IS 'Link to the PC row that originated this PTA evaluation (when applicable). NULL for clause-driven PTA rows (existing flow). NOT NULL for PC-driven rows created by retention-advance-seeder at submit. See docs/specs/pta_pab_retention_advance_overlap.md.';

CREATE TABLE "document"."payment_term_discount_result" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "payment_id" uuid NOT NULL,
  "invoice_id" uuid NOT NULL,
  "commitment_id" uuid,
  "payment_term_id" uuid,
  "discount_tier_id" uuid,
  "allocated_payment_amount" numeric(18,4) NOT NULL,
  "qualification_date" date NOT NULL,
  "qualified_tier_no" smallint,
  "qualified_days_actual" smallint NOT NULL,
  "discount_basis_amount" numeric(18,4) NOT NULL,
  "discount_pct" numeric(5,2),
  "discount_amount" numeric(18,4) NOT NULL,
  "application_status" text NOT NULL,
  "is_reversal" boolean DEFAULT false NOT NULL,
  "reverses_id" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "document"."payment_term_discount_result" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. Settlement-time discount realization. Reversals use is_reversal + reverses_id (append-only).';

CREATE TABLE "document"."payroll_period" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "pay_group_id" uuid NOT NULL,
  "period_year" smallint NOT NULL,
  "period_number" smallint NOT NULL,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "pay_date" date NOT NULL,
  "status" text DEFAULT 'open'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = ANY (ARRAY['open'::text, 'processing'::text]))) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "document"."payroll_result" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "payroll_run_id" uuid NOT NULL,
  "payroll_run_employee_id" uuid NOT NULL,
  "employee_id" uuid NOT NULL,
  "currency_code" character(3) NOT NULL,
  "gross_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "employee_deduction_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "employer_contribution_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "net_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "calculation_trace" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "render_output_id" uuid,
  "status" text DEFAULT 'calculated'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = ANY (ARRAY['calculated'::text, 'approved'::text, 'posted'::text]))) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "document"."payroll_result_line" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "payroll_result_id" uuid NOT NULL,
  "line_no" smallint NOT NULL,
  "pay_component_id" uuid NOT NULL,
  "component_type" text NOT NULL,
  "quantity" numeric(18,4),
  "rate" numeric(18,8),
  "amount" numeric(18,4) NOT NULL,
  "currency_code" character(3) NOT NULL,
  "formula_expression_version_id" uuid,
  "evaluated_inputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "evaluated_outputs" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "evaluation_trace" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "cost_center_id" uuid,
  "profit_center_id" uuid,
  "project_id" uuid,
  "site_id" uuid,
  "gl_role" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "document"."payroll_run" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "payroll_period_id" uuid NOT NULL,
  "run_type" text DEFAULT 'regular'::text NOT NULL,
  "run_no" smallint DEFAULT 1 NOT NULL,
  "calculation_started_at" timestamp with time zone,
  "calculation_completed_at" timestamp with time zone,
  "approved_at" timestamp with time zone,
  "approved_by" uuid,
  "posted_journal_entry_id" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = ANY (ARRAY['draft'::text, 'calculated'::text, 'approved'::text, 'posted'::text]))) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "document"."payroll_run_employee" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "payroll_run_id" uuid NOT NULL,
  "employee_id" uuid NOT NULL,
  "inclusion_reason" text,
  "exclusion_reason" text,
  "status" text DEFAULT 'included'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = ANY (ARRAY['included'::text, 'calculated'::text]))) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "document"."people_request" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text DEFAULT ''::text NOT NULL,
  "employee_id" uuid NOT NULL,
  "request_type" text NOT NULL,
  "target_entity" text,
  "target_id" uuid,
  "workflow_request_id" uuid,
  "requested_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "approved_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'approved'::text]))) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "document"."policy_acknowledgment" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "employee_id" uuid NOT NULL,
  "policy_code" text NOT NULL,
  "policy_version" text NOT NULL,
  "acknowledged_at" timestamp with time zone DEFAULT now() NOT NULL,
  "acknowledgment_channel" text DEFAULT 'self_service'::text NOT NULL,
  "evidence_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "document"."pricing_component" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "company_code_id" uuid NOT NULL,
  "source_doc_type" text NOT NULL,
  "source_doc_id" uuid NOT NULL,
  "source_line_id" uuid,
  "term_type" text NOT NULL,
  "condition_type_id" uuid NOT NULL,
  "sequence" integer DEFAULT 100 NOT NULL,
  "basis" text NOT NULL,
  "rate_value" numeric(20,10),
  "amount_value" numeric(18,4),
  "base_for_calculation" numeric(18,4),
  "computed_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "computed_base_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "entry_level" text NOT NULL,
  "apportion_basis" text,
  "is_apportioned" boolean DEFAULT false NOT NULL,
  "is_apportioned_from_id" uuid,
  "origin" text NOT NULL,
  "ref_source_doc_type" text,
  "ref_source_doc_id" uuid,
  "ref_source_line_id" uuid,
  "ref_value" numeric(18,4),
  "tax_group_id" uuid,
  "is_inclusive" boolean,
  "recoverable_pct" numeric(7,4),
  "tax_section_code" text,
  "currency_code" character(3) NOT NULL,
  "base_currency_code" character(3) NOT NULL,
  "exchange_rate" numeric(20,10) DEFAULT 1.0 NOT NULL,
  "superseded_by_id" uuid,
  "superseded_at" timestamp with time zone,
  "superseded_by_user" uuid,
  "row_version" bigint DEFAULT 1 NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "document"."pricing_component" IS 'ARCHETYPE=B;SCOPE=T. Polymorphic pricing-component engine. Replaces flat discount/charge/tax/withholding/retention columns on parent docs. Source key (source_doc_type, source_doc_id, source_line_id) reuses the AD pattern. v1.2: NO dimension columns and NO budget_allocation_id — PC inherits these from source PIL at apportion/posting time. Per-type validation trigger enforces FK integrity to the correct parent. Supersede chain preserves in-draft history; no status column. Header-scope rows apportion to line-scope rows at submit time (apportion_basis required only when actual apportionment occurs). Parent flat amount columns become trigger-maintained read caches in P4.';

COMMENT ON COLUMN "document"."pricing_component"."superseded_by_id" IS 'Compatibility-only legacy replacement-chain pointer. Do not expose as a business lifecycle field; PC history is recorded through log.audit_log and lifecycle snapshots.';

COMMENT ON COLUMN "document"."pricing_component"."superseded_at" IS 'Compatibility-only legacy replacement timestamp. Do not expose as a business lifecycle field.';

COMMENT ON COLUMN "document"."pricing_component"."superseded_by_user" IS 'Compatibility-only legacy replacement actor. Do not expose as a business lifecycle field.';

CREATE TABLE "document"."purchase_invoice" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text DEFAULT ''::text NOT NULL,
  "name" text DEFAULT ''::text NOT NULL,
  "company_code_id" uuid NOT NULL,
  "requested_by" uuid NOT NULL,
  "workflow_request_id" uuid,
  "approved_at" timestamp with time zone,
  "approved_by" uuid,
  "row_version" bigint DEFAULT 1 NOT NULL,
  "version_number" integer DEFAULT 1 NOT NULL,
  "previous_version_id" uuid,
  "is_current_version" boolean DEFAULT true NOT NULL,
  "supersedes_at" timestamp with time zone,
  "terminal_status" text,
  "status_source" text DEFAULT 'manual'::text NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = ANY (ARRAY['draft'::text, 'pending_approval'::text, 'approved'::text, 'posted'::text, 'partially_paid'::text, 'on_hold'::text]))) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "invoice_source" text DEFAULT 'po_based'::text NOT NULL,
  "invoice_type" text DEFAULT 'standard'::text NOT NULL,
  "supplier_id" uuid,
  "commitment_id" uuid,
  "supplier_invoice_number" text,
  "supplier_invoice_date" date,
  "posting_date" date DEFAULT CURRENT_DATE NOT NULL,
  "received_date" date DEFAULT CURRENT_DATE NOT NULL,
  "baseline_date" date,
  "due_date" date,
  "tax_mode" text DEFAULT 'exclusive'::text NOT NULL,
  "match_type" text DEFAULT 'three_way'::text NOT NULL,
  "match_status" text DEFAULT 'unmatched'::text NOT NULL,
  "currency_code" character(3) NOT NULL,
  "base_currency_code" character(3) NOT NULL,
  "exchange_rate" numeric(18,10),
  "fx_rate_snapshot" jsonb,
  "total_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "tax_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "withholding_tax_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "payable_amount" numeric(18,4) GENERATED ALWAYS AS ((((total_amount - withholding_tax_amount) - advance_deduction_amount) - retention_amount)) STORED,
  "retention_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "advance_deduction_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "paid_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "outstanding_amount" numeric(18,4) GENERATED ALWAYS AS (((((total_amount - withholding_tax_amount) - advance_deduction_amount) - retention_amount) - paid_amount)) STORED,
  "payment_term_id" uuid,
  "fiscal_year" smallint NOT NULL,
  "period_number" smallint NOT NULL,
  "budget_check_result" text,
  "ap_je_id" uuid,
  "tax_mode_source" text DEFAULT 'tax_group'::text NOT NULL
);

COMMENT ON TABLE "document"."purchase_invoice" IS 'ARCHETYPE=B;SCOPE=T. Phase 1 reset AP invoice header. name is the operational headline; description, posting flags, reversal flags, subtotal/discount/freight/misc fields, and header dimensions are removed.';

COMMENT ON COLUMN "document"."purchase_invoice"."row_version" IS 'Optimistic concurrency version. Incremented by trg_pi_row_version on every UPDATE (including header syncs triggered by trg_pil_sync_header on line changes). Callers that hold a document edit lock must pass expected_row_version in the request body. A WHERE row_version = :expected rejects stale saves → 409 Conflict. See control.record_edit_lock for the document edit lock that pairs with this column.';

COMMENT ON COLUMN "document"."purchase_invoice"."fx_rate_snapshot" IS 'Explains how exchange_rate was resolved by fx.resolve_rate: identity, spot, commitment_fixed, reference_document, or manual_override.';

CREATE TABLE "document"."purchase_invoice_line" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "company_code_id" uuid NOT NULL,
  "purchase_invoice_id" uuid NOT NULL,
  "line_no" smallint NOT NULL,
  "commitment_line_id" uuid,
  "receipt_line_id" uuid,
  "service_sheet_line_id" uuid,
  "item_id" uuid,
  "item_description" text NOT NULL,
  "procurement_type" text DEFAULT 'goods'::text NOT NULL,
  "line_type" text DEFAULT 'noncatalog'::text NOT NULL,
  "commodity_category_id" uuid,
  "business_intent_id" uuid,
  "classification_decision" jsonb,
  "asset_class_id" uuid,
  "uom_code" text NOT NULL,
  "quantity" numeric(18,4) NOT NULL,
  "unit_price" numeric(18,4) NOT NULL,
  "price_unit" numeric(18,4) DEFAULT 1 NOT NULL,
  "currency_code" character(3) NOT NULL,
  "net_amount" numeric(18,4) GENERATED ALWAYS AS (((quantity * unit_price) / NULLIF(price_unit, (0)::numeric))) STORED,
  "tax_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "withholding_tax_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "gross_amount" numeric(18,4) GENERATED ALWAYS AS (((((quantity * unit_price) / NULLIF(price_unit, (0)::numeric)) + tax_amount) - withholding_tax_amount)) STORED,
  "required_by_date" date,
  "tax_group_id" uuid,
  "withholding_tax_group_id" uuid,
  "to_tax_jurisdiction_id" uuid,
  "from_tax_jurisdiction_id" uuid,
  "site_id" uuid,
  "warehouse_id" uuid,
  "storage_location" text,
  "shipto_address_id" uuid,
  "billto_address_id" uuid,
  "billfrom_address_id" uuid,
  "supplier_id" uuid,
  "shipfrom_address_id" uuid,
  "remitto_address_id" uuid,
  "matched_quantity" numeric(18,4) DEFAULT 0 NOT NULL,
  "match_status" text DEFAULT 'unmatched'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid,
  "source_binding" jsonb,
  "row_version" bigint DEFAULT 1 NOT NULL
);

COMMENT ON TABLE "document"."purchase_invoice_line" IS 'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Purchase invoice origination lines. Phase 1 reset removes line status, notes, metadata, row_version, discount fields, and tax-resolution audit columns.';

COMMENT ON COLUMN "document"."purchase_invoice_line"."classification_decision" IS 'ARCHETYPE=D;SCOPE=T. IntentResolutionService pipeline output (ClassificationDecision v1). Keys: version, status, source, suggestions, selected, resolved, policy, explanations, overrides, blockers. Empty object on legacy rows. Written by the /lines/preview (mode=save) hook; read by the Classify tab.';

COMMENT ON COLUMN "document"."purchase_invoice_line"."source_binding" IS 'Source-adapter provenance metadata. Shape: { sourceType, sourceDocType?, sourceDocId?, sourceLineId?, sourceRef?, matchType? }. Populated by the @athyper/runtime-add-item framework at line-insert time. NULL for lines created outside the framework (e.g., historical imports, legacy create flows). See packages/shared/runtime-domain/runtime-contracts/src/source-adapter.ts SourceBindingSchema for the full Zod schema.';

COMMENT ON COLUMN "document"."purchase_invoice_line"."row_version" IS 'Optimistic concurrency version. Incremented by trg_pil_row_version on every UPDATE. Pairs with bulk PATCH /api/finance/ap/invoices/:id/lines: each line carries an expected_row_version; mismatch → 409 RESOURCE_VERSION_CONFLICT. Without this, two concurrent grid-edit sessions silently last-write-wins.';

CREATE TABLE "document"."purchase_order_confirmation" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text DEFAULT ''::text NOT NULL,
  "name" text DEFAULT ''::text NOT NULL,
  "company_code_id" uuid NOT NULL,
  "confirmation_number" text NOT NULL,
  "commitment_id" uuid,
  "supplier_id" uuid NOT NULL,
  "supplier_reference_number" text,
  "supplier_confirmation_date" date,
  "confirmation_type" text DEFAULT 'FULL_CONFIRM'::text NOT NULL,
  "document_date" date DEFAULT CURRENT_DATE NOT NULL,
  "currency_code" character(3) NOT NULL,
  "confirmed_total_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "amendment_commitment_id" uuid,
  "notes" text,
  "source_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'received'::text NOT NULL,
  "row_version" bigint DEFAULT 1 NOT NULL,
  "version_number" integer DEFAULT 1 NOT NULL,
  "previous_version_id" uuid,
  "is_current_version" boolean DEFAULT true NOT NULL,
  "supersedes_at" timestamp with time zone,
  "terminal_status" text,
  "status_source" text DEFAULT 'manual'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "document"."purchase_order_confirmation" IS 'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Supplier acknowledgement of a PO. Not approvable. Supplier change proposals route approval through a commitment amendment, not this table.';

CREATE TABLE "document"."purchase_order_confirmation_line" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "confirmation_id" uuid NOT NULL,
  "line_no" smallint NOT NULL,
  "commitment_line_id" uuid NOT NULL,
  "procurement_type" text DEFAULT 'goods'::text NOT NULL,
  "line_type" text DEFAULT 'noncatalog'::text NOT NULL,
  "confirmed_quantity" numeric(18,4) NOT NULL,
  "confirmed_unit_price" numeric(18,4) NOT NULL,
  "confirmed_delivery_date" date,
  "quantity_variance" numeric(18,4) DEFAULT 0 NOT NULL,
  "price_variance" numeric(18,4) DEFAULT 0 NOT NULL,
  "line_status" text DEFAULT 'confirmed'::text NOT NULL,
  "supplier_notes" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "row_version" bigint DEFAULT 1 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "document"."purchase_order_confirmation_line" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. Per-line supplier confirmation values and variances. Append-only — new confirmation supersedes prior via parent confirmation_id.';

CREATE TABLE "document"."purchase_requisition" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text DEFAULT ''::text NOT NULL,
  "name" text DEFAULT ''::text NOT NULL,
  "company_code_id" uuid NOT NULL,
  "requisition_number" text NOT NULL,
  "requisition_type" text DEFAULT 'standard'::text NOT NULL,
  "description" text,
  "priority" text DEFAULT 'normal'::text NOT NULL,
  "requested_by" uuid NOT NULL,
  "responsible_person_id" uuid,
  "document_date" date DEFAULT CURRENT_DATE NOT NULL,
  "required_by_date" date,
  "suggested_supplier_ids" uuid[],
  "currency_code" character(3) NOT NULL,
  "base_currency_code" character(3) NOT NULL,
  "exchange_rate" numeric(18,10),
  "fx_rate_snapshot" jsonb,
  "total_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "budget_check_result" text,
  "encumbrance_je_id" uuid,
  "fiscal_year" smallint NOT NULL,
  "period_number" smallint,
  "approved_at" timestamp with time zone,
  "approved_by" uuid,
  "workflow_request_id" uuid,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = ANY (ARRAY['draft'::text, 'pending_approval'::text, 'approved'::text, 'partially_converted'::text]))) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "row_version" bigint DEFAULT 1 NOT NULL,
  "version_number" integer DEFAULT 1 NOT NULL,
  "previous_version_id" uuid,
  "is_current_version" boolean DEFAULT true NOT NULL,
  "supersedes_at" timestamp with time zone,
  "terminal_status" text,
  "status_source" text DEFAULT 'manual'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "document"."purchase_requisition" IS 'ARCHETYPE=B;SCOPE=T. Non-standard active-set: is_active GENERATED AS (status IN (''draft'',''pending_approval'',''approved'',''partially_converted'')). Internal purchase request. Approvable document. Pre-encumbrance at approval reserves budget before PO. Status: draft → pending_approval → approved → partially_converted → fully_converted.';

COMMENT ON COLUMN "document"."purchase_requisition"."fx_rate_snapshot" IS 'Explains how exchange_rate was resolved by fx.resolve_rate for request/base estimates.';

CREATE TABLE "document"."purchase_requisition_line" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "purchase_requisition_id" uuid NOT NULL,
  "line_no" smallint NOT NULL,
  "item_id" uuid,
  "item_description" text NOT NULL,
  "procurement_type" text DEFAULT 'goods'::text NOT NULL,
  "line_type" text DEFAULT 'noncatalog'::text NOT NULL,
  "commodity_category_id" uuid,
  "business_intent_id" uuid,
  "classification_decision" jsonb,
  "asset_class_id" uuid,
  "uom_code" text NOT NULL,
  "quantity" numeric(18,4) NOT NULL,
  "unit_price" numeric(18,4) DEFAULT 0 NOT NULL,
  "price_unit" numeric(18,4) DEFAULT 1 NOT NULL,
  "currency_code" character(3) NOT NULL,
  "net_amount" numeric(18,4) GENERATED ALWAYS AS (((quantity * unit_price) / NULLIF(price_unit, (0)::numeric))) STORED,
  "tax_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "withholding_tax_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "gross_amount" numeric(18,4) GENERATED ALWAYS AS (((((quantity * unit_price) / NULLIF(price_unit, (0)::numeric)) + tax_amount) - withholding_tax_amount)) STORED,
  "tax_group_id" uuid,
  "withholding_tax_group_id" uuid,
  "to_tax_jurisdiction_id" uuid,
  "from_tax_jurisdiction_id" uuid,
  "required_by_date" date,
  "site_id" uuid,
  "warehouse_id" uuid,
  "storage_location" text,
  "shipto_address_id" uuid,
  "billto_address_id" uuid,
  "billfrom_address_id" uuid,
  "supplier_id" uuid,
  "shipfrom_address_id" uuid,
  "remitto_address_id" uuid,
  "suggested_supplier_ids" uuid[],
  "over_delivery_tolerance" numeric(5,2) DEFAULT 0,
  "under_delivery_tolerance" numeric(5,2) DEFAULT 0,
  "committed_quantity" numeric(18,4) DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'open'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "document"."purchase_requisition_line" IS 'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Purchase requisition line items. Phase 1 reset uses unit_price/net_amount and committed_quantity; remaining quantity is derived by views or services.';

COMMENT ON COLUMN "document"."purchase_requisition_line"."classification_decision" IS 'ARCHETYPE=D;SCOPE=T. Same shape as purchase_invoice_line.classification_decision. Written by the resolver on PR line save. Empty object on legacy rows.';

CREATE TABLE "document"."receipt" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text DEFAULT ''::text NOT NULL,
  "name" text DEFAULT ''::text NOT NULL,
  "company_code_id" uuid NOT NULL,
  "requested_by" uuid NOT NULL,
  "commitment_id" uuid,
  "delivery_note_id" uuid,
  "supplier_id" uuid NOT NULL,
  "received_date" date DEFAULT CURRENT_DATE NOT NULL,
  "posting_date" date DEFAULT CURRENT_DATE NOT NULL,
  "currency_code" character(3) NOT NULL,
  "base_currency_code" character(3) NOT NULL,
  "exchange_rate" numeric(18,10),
  "fx_rate_snapshot" jsonb,
  "total_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "fiscal_year" smallint NOT NULL,
  "period_number" smallint NOT NULL,
  "accrual_je_id" uuid,
  "workflow_request_id" uuid,
  "approved_at" timestamp with time zone,
  "approved_by" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = ANY (ARRAY['draft'::text, 'pending_approval'::text, 'approved'::text, 'posted'::text]))) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "row_version" bigint DEFAULT 1 NOT NULL,
  "version_number" integer DEFAULT 1 NOT NULL,
  "previous_version_id" uuid,
  "is_current_version" boolean DEFAULT true NOT NULL,
  "supersedes_at" timestamp with time zone,
  "terminal_status" text,
  "status_source" text DEFAULT 'manual'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid,
  "source_summary" jsonb DEFAULT '{}'::jsonb NOT NULL
);

COMMENT ON TABLE "document"."receipt" IS 'ARCHETYPE=B;SCOPE=T. Non-standard active-set: is_active GENERATED AS (status IN (''draft'',''pending_approval'',''approved'',''posted'')). Approvable receipt (formerly goods_receipt). On posting: ledger.inventory_movement (RECEIPT), ledger.inventory_valuation_layer, GR/IR accrual JE, ledger.commitment_fulfillment. Updates commitment_line.received_quantity cache via trigger.';

COMMENT ON COLUMN "document"."receipt"."commitment_id" IS 'Optional source hint for simple 1:1 PO receipts. Multi-PO receiving is modeled at receipt_line source columns.';

COMMENT ON COLUMN "document"."receipt"."fx_rate_snapshot" IS 'Explains how exchange_rate was resolved by fx.resolve_rate; fixed-rate commitments are inherited, otherwise posting-date spot is used.';

COMMENT ON COLUMN "document"."receipt"."source_summary" IS 'Derived source summary for source-document creation flows, e.g. distinct source PO ids/supplier/delivery context. Not the source of truth.';

CREATE TABLE "document"."receipt_line" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "company_code_id" uuid NOT NULL,
  "receipt_id" uuid NOT NULL,
  "line_no" smallint NOT NULL,
  "commitment_line_id" uuid NOT NULL,
  "delivery_note_line_id" uuid,
  "source_doc_entity" text DEFAULT 'purchase_order'::text NOT NULL,
  "source_doc_id" uuid,
  "source_line_id" uuid,
  "source_schedule_id" uuid,
  "source_line_version" bigint,
  "item_id" uuid NOT NULL,
  "item_description" text NOT NULL,
  "procurement_type" text DEFAULT 'goods'::text NOT NULL,
  "line_type" text DEFAULT 'noncatalog'::text NOT NULL,
  "uom_code" text NOT NULL,
  "received_quantity" numeric(18,4) NOT NULL,
  "accepted_quantity" numeric(18,4) NOT NULL,
  "rejected_quantity" numeric(18,4) DEFAULT 0 NOT NULL,
  "unit_price" numeric(18,4) NOT NULL,
  "price_unit" numeric(18,4) DEFAULT 1 NOT NULL,
  "currency_code" character(3) NOT NULL,
  "net_amount" numeric(18,4) GENERATED ALWAYS AS (((accepted_quantity * unit_price) / NULLIF(price_unit, (0)::numeric))) STORED,
  "tax_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "withholding_tax_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "gross_amount" numeric(18,4) GENERATED ALWAYS AS (((((accepted_quantity * unit_price) / NULLIF(price_unit, (0)::numeric)) + tax_amount) - withholding_tax_amount)) STORED,
  "tax_group_id" uuid,
  "withholding_tax_group_id" uuid,
  "to_tax_jurisdiction_id" uuid,
  "from_tax_jurisdiction_id" uuid,
  "site_id" uuid,
  "warehouse_id" uuid NOT NULL,
  "storage_location" text,
  "shipto_address_id" uuid,
  "billto_address_id" uuid,
  "billfrom_address_id" uuid,
  "supplier_id" uuid,
  "shipfrom_address_id" uuid,
  "remitto_address_id" uuid,
  "lot_number" text,
  "serial_numbers" jsonb,
  "batch_number" text,
  "expiry_date" date,
  "inventory_movement_id" uuid,
  "asset_class_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "document"."receipt_line" IS 'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Receipt line items. net_amount GENERATED (accepted_quantity × unit_price). Populated with inventory_movement_id + fulfillment_id at posting.';

COMMENT ON COLUMN "document"."receipt_line"."commitment_line_id" IS 'Legacy/canonical PO commitment-line source for PO-based receiving. Kept required for current PO receipt flow.';

COMMENT ON COLUMN "document"."receipt_line"."source_doc_entity" IS 'Source entity code for source-document creation. Defaults to purchase_order; future flows may use polymorphic sources.';

COMMENT ON COLUMN "document"."receipt_line"."source_doc_id" IS 'Source document id, e.g. purchase_order id. Line-level to support multi-PO receipts.';

COMMENT ON COLUMN "document"."receipt_line"."source_line_id" IS 'Source line id, e.g. commitment_line id for PO receiving.';

COMMENT ON COLUMN "document"."receipt_line"."source_schedule_id" IS 'Optional source schedule id when receiving against a delivery schedule.';

COMMENT ON COLUMN "document"."receipt_line"."source_line_version" IS 'Optimistic concurrency token captured from source line during source selection and checked at receipt submit.';

CREATE TABLE "document"."render_job" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "output_id" uuid NOT NULL,
  "job_queue_id" text,
  "trace_id" text,
  "status" text DEFAULT 'PENDING'::text NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "max_attempts" integer DEFAULT 3 NOT NULL,
  "error_code" text,
  "error_detail" text,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "duration_ms" bigint,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL,
  "updated_at" timestamp with time zone
);

COMMENT ON TABLE "document"."render_job" IS 'ARCHETYPE=C;SCOPE=T. Render execution record. Mutable status (PENDING→RETRYING→COMPLETED) — not append-only, belongs in document schema not log. One render_output may have multiple render_job rows (retries). created_by: session principal who enqueued the job.';

CREATE TABLE "document"."render_output" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "template_version_id" uuid,
  "letterhead_id" uuid,
  "brand_profile_id" uuid,
  "entity_name" text NOT NULL,
  "entity_id" text NOT NULL,
  "operation" text NOT NULL,
  "variant" text DEFAULT 'default'::text NOT NULL,
  "locale" text DEFAULT 'en'::text NOT NULL,
  "timezone" text DEFAULT 'UTC'::text NOT NULL,
  "status" text DEFAULT 'QUEUED'::text NOT NULL,
  "storage_bucket" text,
  "storage_key" text,
  "storage_version_id" text,
  "mime_type" text DEFAULT 'application/pdf'::text,
  "size_bytes" bigint,
  "checksum" text,
  "manifest_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "manifest_version" integer DEFAULT 1 NOT NULL,
  "input_payload_hash" text,
  "replaces_output_id" uuid,
  "error_code" text,
  "error_message" text,
  "rendered_at" timestamp with time zone,
  "delivered_at" timestamp with time zone,
  "archived_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "revoked_by" uuid,
  "revoke_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "document"."render_output" IS 'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Render request + result. Status lifecycle: QUEUED→RENDERING→RENDERED→DELIVERED. Idempotency index prevents same render being queued twice concurrently. manifest_json validated by document.trg_validate_manifest_json() trigger.';

COMMENT ON COLUMN "document"."render_output"."entity_id" IS 'Entity PK as text — supports uuid and non-uuid entity keys (polymorphic).';

COMMENT ON COLUMN "document"."render_output"."manifest_json" IS 'Render request manifest. Must be JSON object with entity_name key. Validated by document.trg_validate_manifest_json() trigger.';

CREATE TABLE "document"."sales_opportunity" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "customer_id" uuid NOT NULL,
  "operating_organization_id" uuid NOT NULL,
  "selling_model" text DEFAULT 'federated'::text NOT NULL,
  "principal_seller_company_id" uuid,
  "requested_by" uuid NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "document"."sales_opportunity_company" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "opportunity_id" uuid NOT NULL,
  "company_code_id" uuid NOT NULL,
  "participation_role" text DEFAULT 'participant'::text NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "document"."sales_order" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "quotation_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "company_code_id" uuid NOT NULL,
  "customer_id" uuid NOT NULL,
  "order_date" date NOT NULL,
  "currency_code" character(3) NOT NULL,
  "total_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "document"."sales_order_intercompany_fulfillment" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "sales_order_id" uuid NOT NULL,
  "selling_company_code_id" uuid NOT NULL,
  "fulfillment_company_code_id" uuid NOT NULL,
  "allocation_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "currency_code" character(3) NOT NULL,
  "status" text DEFAULT 'planned'::text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "document"."sales_quotation" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "opportunity_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "customer_id" uuid NOT NULL,
  "operating_organization_id" uuid NOT NULL,
  "selling_model" text DEFAULT 'federated'::text NOT NULL,
  "principal_seller_company_id" uuid,
  "requested_by" uuid NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "document"."sales_quotation_allocation" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "quotation_id" uuid NOT NULL,
  "company_code_id" uuid NOT NULL,
  "allocation_percent" numeric(7,4),
  "allocation_amount" numeric(18,4),
  "output_sales_order_id" uuid,
  "status" text DEFAULT 'planned'::text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "document"."sales_quotation_company" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "quotation_id" uuid NOT NULL,
  "company_code_id" uuid NOT NULL,
  "participation_role" text DEFAULT 'participant'::text NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "document"."schedule_line" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "source_doc_type" text NOT NULL,
  "source_doc_id" uuid NOT NULL,
  "source_line_id" uuid NOT NULL,
  "schedule_no" smallint NOT NULL,
  "schedule_kind" text DEFAULT 'delivery'::text NOT NULL,
  "scheduled_quantity" numeric(18,4) NOT NULL,
  "scheduled_amount" numeric(18,4),
  "scheduled_date" date NOT NULL,
  "currency_code" character(3),
  "fulfilled_quantity" numeric(18,4) DEFAULT 0 NOT NULL,
  "fulfilled_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "remaining_quantity" numeric(18,4) GENERATED ALWAYS AS ((scheduled_quantity - fulfilled_quantity)) STORED,
  "fulfillment_status" text DEFAULT 'open'::text NOT NULL,
  "row_version" bigint DEFAULT 1 NOT NULL,
  "version_number" integer DEFAULT 1 NOT NULL,
  "previous_version_id" uuid,
  "is_current_version" boolean DEFAULT true NOT NULL,
  "supersedes_at" timestamp with time zone,
  "terminal_status" text,
  "status_source" text DEFAULT 'manual'::text NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "document"."schedule_line" IS 'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Polymorphic schedule carrier — mirrors pricing_component pattern. source_doc_type IN (purchase_requisition_line, commitment_line, purchase_invoice_line). fulfilled_quantity is a trigger-synced cache; source of truth is downstream line aggregates (receipt_line / service_sheet_line / purchase_invoice_line). Versioning: supersede on amendment (is_current_version flip), retire on PO cancel/short_close.';

COMMENT ON COLUMN "document"."schedule_line"."source_doc_type" IS 'Polymorphic source type. Same enum as accounting_distribution.source_doc_type / pricing_component.source_doc_type (sans receipt/service_sheet lines — schedules attach only to authoring documents).';

COMMENT ON COLUMN "document"."schedule_line"."fulfilled_quantity" IS 'Cached running total of consumed quantity. Derived by trg_schedule_line_fulfilled from downstream lines: receipt_line + service_sheet_line + purchase_invoice_line aggregated by (source_doc_type, source_line_id). Not authoritative — recompute on demand.';

COMMENT ON COLUMN "document"."schedule_line"."is_current_version" IS 'True for the active row; false for superseded rows kept as history. PO approve dispatcher reads ONLY rows with is_current_version=true AND terminal_status IS NULL.';

COMMENT ON COLUMN "document"."schedule_line"."terminal_status" IS 'Compatibility/internal schedule retirement marker. Parent document lifecycle controls editability; current reads should use v_current_schedule_line.';

COMMENT ON COLUMN "document"."schedule_line"."status_source" IS 'Compatibility/internal schedule state provenance. Parent document lifecycle controls editability.';

COMMENT ON COLUMN "document"."schedule_line"."status" IS 'Compatibility/internal schedule state. Parent document lifecycle controls editability; do not expose as an independent child lifecycle.';

COMMENT ON COLUMN "document"."schedule_line"."tags" IS 'Operational tags. Part of the common child-carrier audit envelope.';

CREATE TABLE "document"."seed_gift" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "company_code_id" uuid NOT NULL,
  "gift_code" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "recipient_name" text,
  "recipient_email" text,
  "gift_type" text DEFAULT 'prototype'::text NOT NULL,
  "gift_value" numeric(18,2),
  "currency_code" character(3) DEFAULT 'MYR'::bpchar NOT NULL,
  "source_ref" text,
  "source_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = ANY (ARRAY['draft'::text, 'active'::text]))) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "document"."seed_gift" IS 'ARCHETYPE=B;SCOPE=T. Prototype Neon-only gift seed entity. Intended for Athyper Group Holdings (company_code ATHQ) live database demos with import and attachment support.';

COMMENT ON COLUMN "document"."seed_gift"."company_code_id" IS 'Prototype scope owner. Must resolve to company_code ATHQ while the ATHQ-only guard in document.trg_seed_gift_athq_only is active.';

COMMENT ON COLUMN "document"."seed_gift"."source_payload" IS 'Original or derived live-source payload captured during prototype import.';

CREATE TABLE "document"."service_sheet" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text DEFAULT ''::text NOT NULL,
  "name" text DEFAULT ''::text NOT NULL,
  "company_code_id" uuid NOT NULL,
  "requested_by" uuid NOT NULL,
  "service_sheet_number" text NOT NULL,
  "commitment_id" uuid NOT NULL,
  "supplier_id" uuid NOT NULL,
  "service_date" date DEFAULT CURRENT_DATE NOT NULL,
  "posting_date" date DEFAULT CURRENT_DATE NOT NULL,
  "service_period_from" date NOT NULL,
  "service_period_to" date NOT NULL,
  "currency_code" character(3) NOT NULL,
  "base_currency_code" character(3) NOT NULL,
  "exchange_rate" numeric(18,10),
  "fx_rate_snapshot" jsonb,
  "total_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "fiscal_year" smallint NOT NULL,
  "period_number" smallint NOT NULL,
  "accrual_je_id" uuid,
  "accepted_by" uuid,
  "accepted_at" timestamp with time zone,
  "workflow_request_id" uuid,
  "approved_at" timestamp with time zone,
  "approved_by" uuid,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = ANY (ARRAY['draft'::text, 'pending_acceptance'::text, 'accepted'::text, 'pending_approval'::text, 'approved'::text, 'posted'::text]))) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "row_version" bigint DEFAULT 1 NOT NULL,
  "version_number" integer DEFAULT 1 NOT NULL,
  "previous_version_id" uuid,
  "is_current_version" boolean DEFAULT true NOT NULL,
  "supersedes_at" timestamp with time zone,
  "terminal_status" text,
  "status_source" text DEFAULT 'manual'::text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "document"."service_sheet" IS 'ARCHETYPE=B;SCOPE=T. Non-standard active-set: is_active GENERATED AS (status IN (''draft'',''pending_acceptance'',''accepted'',''pending_approval'',''approved'',''posted'')). Approvable service sheet (formerly service_entry_sheet). Two-step: acceptance by requestor (pending_acceptance→accepted), then finance approval (pending_approval→approved). On posting: accrual JE (Dr Expense, Cr SES Clearing) + ledger.commitment_fulfillment.';

COMMENT ON COLUMN "document"."service_sheet"."fx_rate_snapshot" IS 'Explains how exchange_rate was resolved by fx.resolve_rate; fixed-rate commitments are inherited, otherwise posting-date spot is used.';

CREATE TABLE "document"."service_sheet_line" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "company_code_id" uuid NOT NULL,
  "service_sheet_id" uuid NOT NULL,
  "line_no" smallint NOT NULL,
  "commitment_line_id" uuid NOT NULL,
  "item_id" uuid,
  "item_description" text NOT NULL,
  "procurement_type" text DEFAULT 'services'::text NOT NULL,
  "line_type" text DEFAULT 'noncatalog'::text NOT NULL,
  "uom_code" text NOT NULL,
  "quantity" numeric(18,4) NOT NULL,
  "unit_price" numeric(18,4) NOT NULL,
  "price_unit" numeric(18,4) DEFAULT 1 NOT NULL,
  "currency_code" character(3) NOT NULL,
  "net_amount" numeric(18,4) GENERATED ALWAYS AS (((quantity * unit_price) / NULLIF(price_unit, (0)::numeric))) STORED,
  "completion_pct" numeric(5,2),
  "milestone_name" text,
  "tax_group_id" uuid,
  "tax_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "withholding_tax_group_id" uuid,
  "withholding_tax_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "to_tax_jurisdiction_id" uuid,
  "from_tax_jurisdiction_id" uuid,
  "gross_amount" numeric(18,4) GENERATED ALWAYS AS (((((quantity * unit_price) / NULLIF(price_unit, (0)::numeric)) + tax_amount) - withholding_tax_amount)) STORED,
  "site_id" uuid,
  "warehouse_id" uuid,
  "storage_location" text,
  "shipto_address_id" uuid,
  "billto_address_id" uuid,
  "billfrom_address_id" uuid,
  "supplier_id" uuid,
  "shipfrom_address_id" uuid,
  "remitto_address_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "document"."service_sheet_line" IS 'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Service sheet line items. net_amount GENERATED (quantity × unit_price). Populated with fulfillment_id at posting.';

CREATE TABLE "document"."shift_assignment" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text DEFAULT ''::text NOT NULL,
  "employee_id" uuid NOT NULL,
  "shift_type_id" uuid NOT NULL,
  "work_date" date NOT NULL,
  "planned_start_at" timestamp with time zone NOT NULL,
  "planned_end_at" timestamp with time zone NOT NULL,
  "source_type" text DEFAULT 'schedule'::text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'scheduled'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = ANY (ARRAY['scheduled'::text, 'worked'::text, 'adjusted'::text]))) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "document"."sourcing_event" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "operating_organization_id" uuid NOT NULL,
  "event_type" text DEFAULT 'rfp'::text NOT NULL,
  "buying_model" text DEFAULT 'federated'::text NOT NULL,
  "central_buyer_company_id" uuid,
  "requested_by" uuid NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "open_at" timestamp with time zone,
  "close_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "document"."sourcing_event_award" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "sourcing_event_id" uuid NOT NULL,
  "supplier_id" uuid NOT NULL,
  "award_status" text DEFAULT 'recommended'::text NOT NULL,
  "recommendation_note" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "document"."sourcing_event_award_allocation" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "award_id" uuid NOT NULL,
  "company_code_id" uuid NOT NULL,
  "allocation_percent" numeric(7,4),
  "allocation_amount" numeric(18,4),
  "output_commitment_id" uuid,
  "status" text DEFAULT 'planned'::text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "document"."sourcing_event_company" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "sourcing_event_id" uuid NOT NULL,
  "company_code_id" uuid NOT NULL,
  "participation_role" text DEFAULT 'participant'::text NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "document"."sourcing_event_demand" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "sourcing_event_id" uuid NOT NULL,
  "purchase_requisition_line_id" uuid NOT NULL,
  "demand_company_code_id" uuid NOT NULL,
  "requested_quantity" numeric(18,4),
  "requested_amount" numeric(18,4),
  "status" text DEFAULT 'included'::text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "document"."sourcing_event_intercompany_allocation" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "award_allocation_id" uuid NOT NULL,
  "source_company_code_id" uuid NOT NULL,
  "beneficiary_company_code_id" uuid NOT NULL,
  "commitment_id" uuid NOT NULL,
  "allocation_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "currency_code" character(3),
  "status" text DEFAULT 'planned'::text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "document"."stocktake" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text DEFAULT ''::text NOT NULL,
  "name" text DEFAULT ''::text NOT NULL,
  "company_code_id" uuid NOT NULL,
  "warehouse_id" uuid NOT NULL,
  "reference_no" text,
  "stocktake_date" date NOT NULL,
  "total_line_count" integer DEFAULT 0 NOT NULL,
  "variance_line_count" integer DEFAULT 0 NOT NULL,
  "variance_je_id" uuid,
  "completed_at" timestamp with time zone,
  "completed_by" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'planned'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = ANY (ARRAY['planned'::text, 'in_progress'::text]))) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "document"."stocktake" IS 'ARCHETYPE=B;SCOPE=T. Non-standard active-set: is_active GENERATED AS (status IN (''planned'',''in_progress'')). Physical inventory count header. Lifecycle: planned → in_progress → completed | cancelled. Lines remain editable while status is planned/in_progress; immutable thereafter (app-layer). Financial impact recorded as ADJUSTMENT rows in ledger.inventory_movement at completion. total_line_count / variance_line_count maintained by trg_stl_denorm_counts trigger.';

CREATE TABLE "document"."stocktake_line" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "stocktake_id" uuid NOT NULL,
  "line_no" smallint NOT NULL,
  "item_id" uuid NOT NULL,
  "warehouse_id" uuid NOT NULL,
  "lot_number" text,
  "serial_number" text,
  "system_qty" numeric(18,4) NOT NULL,
  "counted_qty" numeric(18,4) NOT NULL,
  "variance_qty" numeric(18,4) GENERATED ALWAYS AS ((counted_qty - system_qty)) STORED,
  "unit_cost" numeric(18,4) NOT NULL,
  "variance_value" numeric(18,4) GENERATED ALWAYS AS (((counted_qty - system_qty) * unit_cost)) STORED,
  "currency_code" character(3) NOT NULL,
  "posted_at" timestamp with time zone,
  "posted_by" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "document"."stocktake_line" IS 'ARCHETYPE=C;SCOPE=T. Physical count lines for a stocktake document. Editable while parent status is planned/in_progress; immutable once parent reaches completed (enforced at app layer). variance_qty = GENERATED (counted - system). variance_value = GENERATED (variance × unit_cost). warehouse_id denormalised from parent header for direct indexed variance queries.';

CREATE TABLE "document"."supplier_rebuild_orphan_quarantine" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "detected_at" timestamp with time zone DEFAULT now() NOT NULL,
  "source_schema" text DEFAULT 'document'::text NOT NULL,
  "source_table" text NOT NULL,
  "source_id" uuid NOT NULL,
  "tenant_id" uuid,
  "stale_supplier_id" uuid NOT NULL,
  "action_taken" text NOT NULL,
  "notes" text
);

COMMENT ON TABLE "document"."supplier_rebuild_orphan_quarantine" IS 'Append-only audit of orphan supplier_id rows detected at master.supplier rebuild. Operators consult this table when the rebuild guard reports SUPPLIER_REBUILD_BLOCKED. Triage path: delete orphan row OR resurrect the missing supplier OR set app.rebuild_force=true to override.';

CREATE TABLE "document"."time_punch" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "employee_id" uuid NOT NULL,
  "shift_assignment_id" uuid,
  "punch_at" timestamp with time zone NOT NULL,
  "punch_type" text NOT NULL,
  "source_type" text DEFAULT 'manual'::text NOT NULL,
  "device_ref" text,
  "geo_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "raw_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'accepted'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'accepted'::text)) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

CREATE TABLE "document"."user_profile_update_request" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "created_by" uuid NOT NULL,
  "requested_by" uuid NOT NULL,
  "principal_id" uuid NOT NULL,
  "principal_snapshot" jsonb,
  "request_scope" text[] DEFAULT '{}'::text[] NOT NULL,
  "priority" text DEFAULT 'normal'::text NOT NULL,
  "change_reason" text,
  "requested_changes" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "workflow_request_id" uuid,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = ANY (ARRAY['draft'::text, 'submitted'::text, 'awaiting_approval'::text, 'revision_requested'::text]))) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "document"."user_profile_update_request" IS 'ARCHETYPE=B;SCOPE=T. Non-standard active-set: is_active GENERATED AS (status IN (''draft'',''submitted'',''awaiting_approval'',''revision_requested'')). Self-service profile update request. entity_class=DOCUMENT. allow_on_behalf_of=false — self-service only (principal_id = created_by). Requestor submits changes to own profile fields, locale/contact, IAM group membership, or OU assignment. Routed to supervisor for approval. ATH-DP-UPUPR-001 v3.0.';

CREATE TABLE "document"."wht_certificate" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text DEFAULT ''::text NOT NULL,
  "name" text DEFAULT ''::text NOT NULL,
  "company_code_id" uuid NOT NULL,
  "counterparty_id" uuid NOT NULL,
  "tax_type_id" uuid NOT NULL,
  "section_code" text,
  "certificate_no" text NOT NULL,
  "certificate_series" text,
  "period_from" date NOT NULL,
  "period_to" date NOT NULL,
  "gross_amount" numeric(18,4) NOT NULL,
  "wht_amount" numeric(18,4) NOT NULL,
  "currency_code" character(3) NOT NULL,
  "source_transaction_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "issued_at" timestamp with time zone,
  "issued_by" uuid,
  "voided_at" timestamp with time zone,
  "voided_by" uuid,
  "void_reason" text,
  "superseded_by_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "document"."wht_certificate" IS 'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. R7-C: WHT certificate lifecycle (India Form 16A, Philippines BIR 2307, etc.). Issued by company to supplier documenting WHT deducted in period_from–period_to. Corrections: void existing cert (status=voided, void_reason) then create new cert with superseded_by_id pointing back to the voided cert. source_transaction_ids: payment / JE UUIDs contributing WHT to this certificate.';

CREATE TABLE "document"."workflow_request" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "workflow_type" text DEFAULT 'approval'::text NOT NULL,
  "workflow_definition_id" uuid,
  "workflow_template_id" uuid,
  "template_snapshot" jsonb,
  "entity_type" text NOT NULL,
  "entity_id" text NOT NULL,
  "entity_version_id" uuid,
  "entity_snapshot" jsonb,
  "requested_by" uuid NOT NULL,
  "requested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "decision" text,
  "decided_by" uuid,
  "decided_at" timestamp with time zone,
  "reason" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "correlation_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "document"."workflow_request" IS 'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Live workflow process envelope. One row per running approval/review/watcher. entity_id=TEXT (polymorphic — A08). entity_snapshot: version-pinned entity state at submission time. template_snapshot: version-pinned compiled_json from workflow_template. In-flight requests survive template changes. workflow_type validated via work_request.workflow_type lookup. Renamed from document.approval_instance (backup).';

COMMENT ON COLUMN "document"."workflow_request"."template_snapshot" IS 'compiled_json from workflow_template at request creation time. Version-pins the workflow — template changes do not affect in-flight requests.';

COMMENT ON COLUMN "document"."workflow_request"."entity_snapshot" IS 'Copy of entity payload at request submission time. Assignees see what was submitted, not the current (possibly edited) state. Controlled by workflow_template.behaviors.capture_entity_snapshot.';

CREATE TABLE "document"."workflow_stage" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "workflow_request_id" uuid NOT NULL,
  "template_stage_id" uuid,
  "stage_no" smallint NOT NULL,
  "name" text,
  "mode" text DEFAULT 'serial'::text NOT NULL,
  "quorum" jsonb,
  "sla_policy_id" uuid,
  "status" text DEFAULT 'pending'::text NOT NULL,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "outcome" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "document"."workflow_stage" IS 'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Runtime stage instance. One row per template_stage per workflow_request. Created upfront — work_items created only when stage status → active. mode + quorum captured at creation (version-pinned — A06). template_stage_id links back to control.workflow_template_stage (A12). Moved from control.* to document.*. Renamed from approval_stage (backup).';

COMMENT ON COLUMN "document"."workflow_stage"."quorum" IS 'Captured from workflow_template_stage.quorum at request creation. Version-pinned — template quorum changes do not affect in-flight stages.';

COMMENT ON COLUMN "document"."workflow_stage"."outcome" IS 'Stage-level outcome when completed: approved | rejected | escalated | skipped.';
