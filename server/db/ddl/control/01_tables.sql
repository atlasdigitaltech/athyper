-- ============================================================================
-- control/01_tables.sql
-- Tables reconstructed from the live catalog.
-- Generated from the live Neon control schema. Do not hand-edit.
-- ============================================================================

CREATE TABLE "control"."acct_profile_book_rule" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "profile_config_id" uuid NOT NULL,
  "book_code" text NOT NULL,
  "posting_method" text DEFAULT 'MIRROR'::text NOT NULL,
  "account_mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "applies_to_events" text[],
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

COMMENT ON TABLE "control"."acct_profile_book_rule" IS 'ARCHETYPE=B;SCOPE=T. Engine 4.13: per-book posting behaviour. MIRROR = same entries as primary; EXCLUDE = skip book entirely; REMAP = substitute accounts via account_mapping JSONB.';

CREATE TABLE "control"."acct_profile_commitment_config" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "profile_config_id" uuid NOT NULL,
  "creates_commitment" boolean DEFAULT true NOT NULL,
  "commitment_type" text DEFAULT 'ONE_TIME'::text NOT NULL,
  "releases_commitment_on" text,
  "encumbrance_behavior" text DEFAULT 'STANDARD'::text NOT NULL,
  "multi_year_strategy" text DEFAULT 'CURRENT_YEAR_ONLY'::text NOT NULL,
  "advance_pct" numeric(5,2),
  "advance_recovery_method" text,
  "retention_pct" numeric(5,2),
  "retention_release_event" text,
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

COMMENT ON TABLE "control"."acct_profile_commitment_config" IS 'ARCHETYPE=B;SCOPE=T. Engine 4.13: commitment behaviour for profiles that create encumbrances. Optional 1:1 child of acct_profile_config. Includes advance/retention percentages.';

CREATE TABLE "control"."acct_profile_config" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "accounting_profile_id" uuid NOT NULL,
  "direction" text DEFAULT 'INBOUND'::text NOT NULL,
  "profile_type" text DEFAULT 'STANDARD'::text NOT NULL,
  "subledger_type" text DEFAULT 'AP'::text NOT NULL,
  "applicable_flow_codes" text[] DEFAULT '{NON_PO}'::text[] NOT NULL,
  "applicable_doc_types" text[] DEFAULT '{}'::text[] NOT NULL,
  "recognition_timing" text DEFAULT 'IMMEDIATE'::text NOT NULL,
  "deferral_schedule_type" text,
  "deferral_periods" smallint,
  "auto_reverse" boolean DEFAULT false NOT NULL,
  "reversal_period_offset" smallint DEFAULT 1 NOT NULL,
  "tax_treatment" text DEFAULT 'STANDARD'::text NOT NULL,
  "default_tax_code" text,
  "default_tax_group_id" uuid,
  "is_reverse_charge" boolean DEFAULT false NOT NULL,
  "matching_type" text DEFAULT 'NONE'::text NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "effective_from" date DEFAULT CURRENT_DATE NOT NULL,
  "effective_to" date,
  "supersedes_id" uuid,
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

COMMENT ON TABLE "control"."acct_profile_config" IS 'ARCHETYPE=B;SCOPE=T. Non-standard active-set: status has values draft/active/superseded/inactive but is_active GENERATED AS (status = ''active'') — only ''active'' activates. Engine 4.13: core profile configuration; 1:1 extension of master.accounting_profile. Versioned + effective-dated. status: draft → active → superseded | inactive. UNIQUE (tenant_id, id) required: children use composite FK for row-level tenant scoping.';

COMMENT ON COLUMN "control"."acct_profile_config"."default_tax_group_id" IS 'FK → control.tax_group (tenant-composite). Replaces free-text default_tax_code. Fallback tax group when no scoped tax_rate_schedule matches.';

CREATE TABLE "control"."acct_profile_dimension_rule" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "profile_config_id" uuid NOT NULL,
  "dimension_type_id" uuid NOT NULL,
  "derive_source" text NOT NULL,
  "fixed_value_id" uuid,
  "fallback_source" text,
  "fallback_value_id" uuid,
  "behavior" text DEFAULT 'DERIVE_IF_MISSING'::text NOT NULL,
  "is_required" boolean DEFAULT false NOT NULL,
  "applies_to_events" text[],
  "applies_to_books" text[],
  "priority" smallint DEFAULT 0 NOT NULL,
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

COMMENT ON TABLE "control"."acct_profile_dimension_rule" IS 'ARCHETYPE=B;SCOPE=T. Engine 4.13: dimension derivation rules per profile. Controls how dimensions are stamped on JE lines. Priority determines evaluation order when multiple rules apply.';

CREATE TABLE "control"."acct_profile_entry_template" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "profile_event_id" uuid NOT NULL,
  "line_seq" smallint NOT NULL,
  "description" text NOT NULL,
  "posting_side" text NOT NULL,
  "account_source" text DEFAULT 'FIXED'::text NOT NULL,
  "account_code" text,
  "account_lookup_key" text,
  "account_fallback" text,
  "amount_source" text DEFAULT 'DOCUMENT_TOTAL'::text NOT NULL,
  "amount_formula" text,
  "amount_percentage" numeric(8,4),
  "is_balancing_line" boolean DEFAULT false NOT NULL,
  "component_bucket" text,
  "condition_type_id" uuid,
  "component_term_types" text[],
  "cost_effect_filter" text[],
  "posting_pattern_filter" text[],
  "distribution_behavior" text,
  "capitalization_behavior" text,
  "override_cost_center" text,
  "override_profit_center" text,
  "override_dimension_set_id" uuid,
  "applies_to_doc_types" text[],
  "sort_order" smallint DEFAULT 0 NOT NULL,
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

COMMENT ON TABLE "control"."acct_profile_entry_template" IS 'ARCHETYPE=B;SCOPE=T. Engine 4.13: Dr/Cr line templates per event. 21 amount_source values. is_balancing_line=true: line aggregates split AP/AR accounting lines. account_source: FIXED | FROM_INTENT | FROM_CATEGORY | POSTING_ROLE. POSTING_ROLE requires account_lookup_key (carries posting_role_code).';

CREATE TABLE "control"."acct_profile_event" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "profile_config_id" uuid NOT NULL,
  "event_code" text NOT NULL,
  "event_name" text NOT NULL,
  "creates_je" boolean DEFAULT true NOT NULL,
  "reverses_event" text,
  "is_auto_reverse" boolean DEFAULT false NOT NULL,
  "auto_reverse_offset" smallint DEFAULT 1 NOT NULL,
  "commitment_action" text DEFAULT 'NONE'::text NOT NULL,
  "commitment_amount_source" text,
  "fires_paired_profile" boolean DEFAULT false NOT NULL,
  "event_seq" smallint DEFAULT 0 NOT NULL,
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

COMMENT ON TABLE "control"."acct_profile_event" IS 'ARCHETYPE=B;SCOPE=T. Engine 4.13: profile × lifecycle event bridge. fires_paired_profile=true triggers COGS entry generation via acct_profile_revenue_config. UNIQUE (tenant_id, id) required: acct_profile_entry_template uses composite FK.';

CREATE TABLE "control"."acct_profile_revenue_config" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "profile_config_id" uuid NOT NULL,
  "revenue_recognition_method" text DEFAULT 'POINT_IN_TIME'::text NOT NULL,
  "variable_consideration" text,
  "standalone_selling_price_method" text,
  "paired_profile_id" uuid,
  "fires_paired_on_event" text DEFAULT 'FULFILLMENT'::text NOT NULL,
  "deferral_account_code" text,
  "unbilled_ar_account_code" text,
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

COMMENT ON TABLE "control"."acct_profile_revenue_config" IS 'ARCHETYPE=B;SCOPE=T. Engine 4.13: revenue recognition config for OUTBOUND profiles. Includes COGS pairing via paired_profile_id → master.accounting_profile. fires_paired_on_event gates COGS entry generation.';

CREATE TABLE "control"."acct_profile_settlement_config" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "profile_config_id" uuid NOT NULL,
  "settlement_method" text DEFAULT 'PAYMENT'::text NOT NULL,
  "settlement_tolerance" numeric(5,2) DEFAULT 0.00 NOT NULL,
  "discount_model" text,
  "discount_curve_type" text,
  "discount_apr" numeric(8,4),
  "discount_min_days" smallint,
  "discount_min_amount" numeric(18,4),
  "scf_financier_id" uuid,
  "scf_split_pct" numeric(5,2),
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

COMMENT ON TABLE "control"."acct_profile_settlement_config" IS 'ARCHETYPE=B;SCOPE=T. Engine 4.13: settlement + dynamic discounting for profiles with special payment terms. Only exists for non-standard settlement. Includes SCF financing config.';

CREATE TABLE "control"."ai_action_policy" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "action_code" text NOT NULL,
  "doc_class" text,
  "autonomy_level" text DEFAULT 'suggest'::text NOT NULL,
  "min_confidence_for_auto" numeric(5,4),
  "requires_human_confirmation" boolean DEFAULT true NOT NULL,
  "override_policy_definition_id" uuid,
  "is_active" boolean DEFAULT true NOT NULL,
  "effective_from" timestamp with time zone DEFAULT now() NOT NULL,
  "effective_to" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."ai_action_policy" IS 'ARCHETYPE=C;SCOPE=T;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (no status/is_active GENERATED). R8: Atlas AI autonomy ceiling per tenant × action_code × doc_class. autonomy_level is the hard ceiling — runtime never exceeds it regardless of confidence. Layered lookup: (tenant, action, doc_class) → (tenant, action, NULL) → platform default. disabled=feature off; suggest=L1 surface only; assist=L2 pre-fill+confirm; auto=L3 act. min_confidence_for_auto: NULL defers to ai_confidence_threshold row for the same scope.';

COMMENT ON COLUMN "control"."ai_action_policy"."action_code" IS 'Stable action identifier. E.g. classify, extract, suggest, autofill, approve, fx_rate.';

COMMENT ON COLUMN "control"."ai_action_policy"."doc_class" IS 'Document class this policy applies to. NULL = applies to all classes for this action.';

CREATE TABLE "control"."ai_confidence_threshold" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "action_code" text NOT NULL,
  "doc_class" text,
  "model_id" text,
  "min_for_suggest" numeric(5,4) DEFAULT 0.5000 NOT NULL,
  "min_for_assist" numeric(5,4) DEFAULT 0.7000 NOT NULL,
  "min_for_auto" numeric(5,4) DEFAULT 0.9000 NOT NULL,
  "drift_alert_below" numeric(5,4),
  "drift_window_hours" smallint DEFAULT 24 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."ai_confidence_threshold" IS 'ARCHETYPE=C;SCOPE=T;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (no status/is_active GENERATED). R8: tiered confidence thresholds governing Atlas AI autonomy levels. Three gate values (suggest ≤ assist ≤ auto) map to L1/L2/L3 autonomy. drift_alert_below: trigger drift alert when rolling-window avg confidence drops below this threshold. Layered lookup: (tenant, action, doc_class, model) → (tenant, action, doc_class, NULL) → (tenant, action, NULL, NULL).';

COMMENT ON COLUMN "control"."ai_confidence_threshold"."model_id" IS 'Model version identifier (e.g. atlas-classifier-v3). NULL = applies to all models.';

COMMENT ON COLUMN "control"."ai_confidence_threshold"."drift_window_hours" IS 'Lookback window for rolling-average confidence used in drift detection.';

CREATE TABLE "control"."ai_drift_baseline" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "action_code" text NOT NULL,
  "doc_class" text,
  "model_id" text NOT NULL,
  "baseline_date" date DEFAULT CURRENT_DATE NOT NULL,
  "sample_size" integer NOT NULL,
  "mean_confidence" numeric(7,6) NOT NULL,
  "std_dev_confidence" numeric(7,6) NOT NULL,
  "p5_confidence" numeric(7,6),
  "p95_confidence" numeric(7,6),
  "feature_stats" jsonb,
  "is_current" boolean DEFAULT false NOT NULL,
  "superseded_at" timestamp with time zone,
  "superseded_by_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."ai_drift_baseline" IS 'ARCHETYPE=C;SCOPE=T;DEVIATION. Manual is_current boolean NOT NULL DEFAULT false (no status/is_active GENERATED). R8: statistical reference distributions for Atlas AI drift monitoring. One row per (tenant, action_code, doc_class, model_id, baseline_date). is_current=true marks the active reference for live drift comparison. superseded_by_id forms a history chain when baselines are refreshed. feature_stats holds per-field distributional stats for multivariate drift detection.';

COMMENT ON COLUMN "control"."ai_drift_baseline"."model_id" IS 'Model version that produced this baseline. Baselines are model-version-specific.';

COMMENT ON COLUMN "control"."ai_drift_baseline"."is_current" IS 'True for the single active baseline per (tenant, action_code, doc_class, model_id). Partial unique index adb_current_uq enforces at most one current baseline per scope.';

CREATE TABLE "control"."asset_class_book_policy" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "company_code_id" uuid NOT NULL,
  "asset_class_id" uuid NOT NULL,
  "book_code" text NOT NULL,
  "capitalization_threshold" numeric(18,4) DEFAULT 0 NOT NULL,
  "capitalization_currency" character(3),
  "priority" smallint DEFAULT 50 NOT NULL,
  "effective_from" date DEFAULT CURRENT_DATE NOT NULL,
  "effective_to" date,
  "is_depreciable" boolean DEFAULT true NOT NULL,
  "depreciation_method" text,
  "useful_life_months" integer,
  "residual_value_mode" text DEFAULT 'zero'::text NOT NULL,
  "residual_value_amount" numeric(18,4),
  "residual_value_pct" numeric(9,4),
  "convention" text,
  "prorate_basis" text DEFAULT 'monthly'::text NOT NULL,
  "depreciation_start_rule" text DEFAULT 'in_service_date'::text NOT NULL,
  "method_params" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "allow_manual_life_override" boolean DEFAULT false NOT NULL,
  "allow_manual_residual_override" boolean DEFAULT false NOT NULL,
  "allow_manual_method_override" boolean DEFAULT false NOT NULL,
  "acquisition_posting_role_code" text,
  "accum_depr_posting_role_code" text,
  "depr_expense_posting_role_code" text,
  "gain_loss_posting_role_code" text,
  "impairment_expense_posting_role_code" text,
  "impairment_reserve_posting_role_code" text,
  "revaluation_surplus_posting_role_code" text,
  "revaluation_loss_posting_role_code" text,
  "cwip_posting_role_code" text,
  "capitalization_event_code" text DEFAULT 'CAPITALIZE'::text NOT NULL,
  "disposal_event_code" text DEFAULT 'DISPOSE'::text NOT NULL,
  "depreciation_event_code" text DEFAULT 'DEPRECIATE'::text NOT NULL,
  "impairment_event_code" text DEFAULT 'IMPAIR'::text NOT NULL,
  "revaluation_event_code" text DEFAULT 'REVALUE'::text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid,
  "class_clearing_posting_role_code" text,
  "expense_low_value_posting_role_code" text
);

COMMENT ON TABLE "control"."asset_class_book_policy" IS 'ARCHETYPE=B;SCOPE=T. Effective-dated depreciation + posting-role policy per (asset_class, book). Carries capitalization_threshold/currency (moved from master.asset_class — varies per company functional currency). book_code = actual ledger_book.code, validated by trigger. UNIQUE on (..., effective_from) enables true versioning. Resolved via control.resolve_asset_class_book_policy() at asset_book creation.';

COMMENT ON COLUMN "control"."asset_class_book_policy"."class_clearing_posting_role_code" IS 'Posting role used when PIL.asset_class_id IS NOT NULL but AD.asset_id IS NULL (class known, master.asset record not yet created — capitalized later at settlement). Convention: <CLASS_CODE>_PENDING_CAPITALIZATION_CLEARING.';

COMMENT ON COLUMN "control"."asset_class_book_policy"."expense_low_value_posting_role_code" IS 'Posting role used when PIL.asset_class_id IS NOT NULL and line amount is under asset_class.capitalization_threshold (expensed rather than capitalised). Convention: <CLASS_CODE>_LOW_VALUE_EXPENSE.';

CREATE TABLE "control"."asset_class_book_policy_template" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid,
  "template_code" text NOT NULL,
  "framework" text DEFAULT 'IFRS'::text NOT NULL,
  "asset_class_code" text NOT NULL,
  "book_category" text NOT NULL,
  "capitalization_threshold_multiplier" numeric(9,4) DEFAULT 1 NOT NULL,
  "priority" smallint DEFAULT 50 NOT NULL,
  "effective_from" date DEFAULT CURRENT_DATE NOT NULL,
  "effective_to" date,
  "is_depreciable" boolean DEFAULT true NOT NULL,
  "depreciation_method" text,
  "useful_life_months" integer,
  "useful_life_min_months" integer,
  "useful_life_max_months" integer,
  "residual_value_mode" text DEFAULT 'zero'::text NOT NULL,
  "residual_value_amount" numeric(18,4),
  "residual_value_pct" numeric(9,4),
  "convention" text,
  "prorate_basis" text DEFAULT 'monthly'::text NOT NULL,
  "depreciation_start_rule" text DEFAULT 'in_service_date'::text NOT NULL,
  "method_params" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "source_note" text,
  "allow_manual_life_override" boolean DEFAULT false NOT NULL,
  "allow_manual_residual_override" boolean DEFAULT false NOT NULL,
  "allow_manual_method_override" boolean DEFAULT false NOT NULL,
  "acquisition_posting_role_code" text,
  "accum_depr_posting_role_code" text,
  "depr_expense_posting_role_code" text,
  "gain_loss_posting_role_code" text,
  "impairment_expense_posting_role_code" text,
  "impairment_reserve_posting_role_code" text,
  "revaluation_surplus_posting_role_code" text,
  "revaluation_loss_posting_role_code" text,
  "cwip_posting_role_code" text,
  "capitalization_event_code" text DEFAULT 'CAPITALIZE'::text NOT NULL,
  "disposal_event_code" text DEFAULT 'DISPOSE'::text NOT NULL,
  "depreciation_event_code" text DEFAULT 'DEPRECIATE'::text NOT NULL,
  "impairment_event_code" text DEFAULT 'IMPAIR'::text NOT NULL,
  "revaluation_event_code" text DEFAULT 'REVALUE'::text NOT NULL,
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

COMMENT ON TABLE "control"."asset_class_book_policy_template" IS 'ARCHETYPE=B;SCOPE=G. Platform/tenant template for asset_class_book_policy onboarding. tenant_id=NULL rows are platform global defaults; tenant rows may override. book_category is resolved to a real assigned ledger_book.code by control.provision_asset_policies(). Useful-life min/default/max and source_note capture best-practice policy guidance without adding a separate reference table.';

CREATE TABLE "control"."atlas_conversation_retention_policy" (
  "tenant_id" uuid NOT NULL,
  "retention_days" integer NOT NULL,
  "revision" integer DEFAULT 1 NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "effective_from" timestamp with time zone DEFAULT now() NOT NULL,
  "effective_to" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."atlas_conversation_retention_policy" IS 'ARCHETYPE=C;SCOPE=T. Server-resolved tenant retention override for Atlas transcripts. The runtime additionally enforces the platform minimum and maximum.';

CREATE TABLE "control"."atlas_tenant_provider_credential" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "provider_id" text NOT NULL,
  "encrypted_secret" text NOT NULL,
  "key_version" integer NOT NULL,
  "rotation_epoch" integer DEFAULT 1 NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "activated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON COLUMN "control"."atlas_tenant_provider_credential"."encrypted_secret" IS 'AES-256-GCM encrypted payload only. Plaintext provider credentials are forbidden.';

CREATE TABLE "control"."atlas_tenant_provider_credential_epoch" (
  "tenant_id" uuid NOT NULL,
  "provider_id" text NOT NULL,
  "rotation_epoch" integer DEFAULT 1 NOT NULL,
  "revoked" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "control"."auth_entitlement_target_policy" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "plane_code" control.auth_plane_code NOT NULL,
  "target_kind" text NOT NULL,
  "module_id" uuid,
  "feature_id" uuid,
  "allow_override" boolean DEFAULT false NOT NULL,
  "policy_version" bigint NOT NULL,
  "reason" text NOT NULL,
  "approval_ticket" text NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "effective_from" timestamp with time zone DEFAULT now() NOT NULL,
  "effective_until" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

CREATE TABLE "control"."auth_permission" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "category_id" uuid NOT NULL,
  "canonical_code" text NOT NULL,
  "plane_code" control.auth_plane_code NOT NULL,
  "entity_id" uuid,
  "operation_code" text,
  "module_id" uuid,
  "feature_id" uuid,
  "risk_tier" text DEFAULT 'low'::text NOT NULL,
  "requires_mfa" boolean DEFAULT false NOT NULL,
  "requires_sod" boolean DEFAULT false NOT NULL,
  "is_shareable" boolean DEFAULT false NOT NULL,
  "is_delegable" boolean DEFAULT false NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "effective_from" timestamp with time zone DEFAULT now() NOT NULL,
  "effective_until" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."auth_permission" IS 'Seed-owned canonical exact permission catalog. Entity-bound permissions bind one entity/operation tuple; generic verb-only authority is forbidden.';

CREATE TABLE "control"."auth_permission_scope_policy" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "permission_id" uuid NOT NULL,
  "scope_kind" text NOT NULL,
  "propagation_mode" text DEFAULT 'none'::text NOT NULL,
  "requires_resource_scope" boolean DEFAULT false NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "effective_from" timestamp with time zone DEFAULT now() NOT NULL,
  "effective_until" timestamp with time zone,
  "policy_version" integer NOT NULL,
  "provenance_ref" text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."auth_permission_scope_policy" IS 'Canonical permission/scope-kind policy with a sealed four-value scope vocabulary.';

CREATE TABLE "control"."bank_format_rule" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "country_code" character(2) NOT NULL,
  "payment_network" text NOT NULL,
  "direction" text DEFAULT 'BOTH'::text NOT NULL,
  "currency_code" character(3),
  "account_id_type" text NOT NULL,
  "bank_id_type" text NOT NULL,
  "is_account_id_required" boolean DEFAULT true NOT NULL,
  "is_bank_id_required" boolean DEFAULT true NOT NULL,
  "is_bic_allowed" boolean DEFAULT true NOT NULL,
  "is_bic_required" boolean DEFAULT false NOT NULL,
  "is_branch_code_required" boolean DEFAULT false NOT NULL,
  "is_national_bank_code_required" boolean DEFAULT false NOT NULL,
  "account_pattern" text,
  "bank_id_pattern" text,
  "branch_code_pattern" text,
  "iban_country_prefix" character(2),
  "is_checksum_validated" boolean DEFAULT false NOT NULL,
  "validation_schema" jsonb,
  "priority" smallint DEFAULT 0 NOT NULL,
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

COMMENT ON TABLE "control"."bank_format_rule" IS 'ARCHETYPE=B;SCOPE=G. Country + payment rail validation policy for bank account identifiers. Platform default (tenant_id IS NULL) + tenant override. Determines required fields, patterns, and validation for each country/rail combo.';

CREATE TABLE "control"."bank_interface_profile" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "interface_type" text NOT NULL,
  "payment_network" text,
  "file_format_code" text,
  "provider_code" text,
  "message_version" text,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "supports_remittance_advice" boolean DEFAULT false NOT NULL,
  "supports_acknowledgement" boolean DEFAULT false NOT NULL,
  "supports_status_pull" boolean DEFAULT false NOT NULL,
  "supports_return_file" boolean DEFAULT false NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid,
  "credential_provider" text,
  "credential_reference" text,
  "credential_version" text,
  "credential_status" text DEFAULT 'not_configured'::text NOT NULL,
  "credential_last_validated_at" timestamp with time zone,
  "credential_rotated_at" timestamp with time zone,
  "last_connection_test_at" timestamp with time zone,
  "last_connection_test_status" text DEFAULT 'not_tested'::text NOT NULL,
  "last_connection_test_code" text,
  "last_connection_test_latency_ms" integer
);

COMMENT ON TABLE "control"."bank_interface_profile" IS 'ARCHETYPE=B;SCOPE=T. Describes HOW a payment message is produced: file format, API provider, message version, capabilities. config jsonb is non-secret; credentials live in the platform secret provider.';

COMMENT ON COLUMN "control"."bank_interface_profile"."interface_type" IS 'Delivery mechanism. Lookup: control.bank_interface_profile_type. FILE, API, CHECK_PRINT, MANUAL.';

COMMENT ON COLUMN "control"."bank_interface_profile"."payment_network" IS 'Payment rail. Reuses control.bank_format_rule_payment_network vocabulary.';

COMMENT ON COLUMN "control"."bank_interface_profile"."file_format_code" IS 'File/message format. Lookup: control.bank_interface_file_format. PAIN_001, NACHA_CCD, NACHA_PPD, MT101, etc.';

COMMENT ON COLUMN "control"."bank_interface_profile"."provider_code" IS 'Execution provider identifier. Examples: WISE_API, STRIPE_API, HDFC_H2H.';

COMMENT ON COLUMN "control"."bank_interface_profile"."config" IS 'Non-secret provider routing and capability configuration only. Secret-shaped keys are rejected by a database trigger.';

COMMENT ON COLUMN "control"."bank_interface_profile"."credential_reference" IS 'Opaque reference into the platform secret provider. The referenced secret is never returned by Finance or generic Entity APIs.';

COMMENT ON COLUMN "control"."bank_interface_profile"."credential_status" IS 'Read-only credential health projection maintained by governed test/rotate commands.';

COMMENT ON COLUMN "control"."bank_interface_profile"."last_connection_test_code" IS 'Non-sensitive provider result code. Response bodies, tokens and credential material are never persisted.';

CREATE TABLE "control"."blueprint_registry" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "category" text NOT NULL,
  "industry_vertical" text[],
  "framework" text,
  "base_version" text DEFAULT '1.0.0'::text NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "dependencies" text[],
  "seed_files" text[],
  "description" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."blueprint_registry" IS 'ARCHETYPE=B_LITE;SCOPE=N;PENDING_ACTIVE_SET. Catalogue of available blueprint packs selectable during tenant provisioning. Platform-global (no tenant_id). system-seeded rows have created_by = ''00000000-0000-0000-0000-000000000000''. R6: migrated from seed file into main DDL bundle.';

COMMENT ON COLUMN "control"."blueprint_registry"."code" IS 'Stable identifier used as FK target and in dependency arrays. E.g. ''base'', ''pack_utilities'', ''coa_ifrs''.';

COMMENT ON COLUMN "control"."blueprint_registry"."category" IS 'Tier model: base=universal prerequisite (always first); foundation=always-apply data (tax/payments/assets/bank); coa_framework=select exactly one accounting framework; industry_pack=select one or more vertical taxonomies; module_pack=optional subscription-gated feature packs.';

COMMENT ON COLUMN "control"."blueprint_registry"."dependencies" IS 'Ordered list of blueprint codes that must be applied before this one.';

COMMENT ON COLUMN "control"."blueprint_registry"."seed_files" IS 'Ordered relative file paths under 900_seed_data/ for the runner to execute.';

CREATE TABLE "control"."blueprint_tenant_application" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "blueprint_code" text NOT NULL,
  "applied_version" text NOT NULL,
  "applied_at" timestamp with time zone DEFAULT now() NOT NULL,
  "applied_by" uuid,
  "status" text DEFAULT 'applied'::text NOT NULL,
  "error_detail" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."blueprint_tenant_application" IS 'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Audit log of blueprint packs applied per tenant. applied_by: principal who triggered provisioning (NULL for automated runs). created_by: audit trail — use system sentinel for automated inserts. applied_version: snapshot of blueprint version at time of application; survives future registry updates. R6: migrated from seed file into main DDL bundle.';

COMMENT ON COLUMN "control"."blueprint_tenant_application"."blueprint_code" IS 'References control.blueprint_registry.code.';

COMMENT ON COLUMN "control"."blueprint_tenant_application"."applied_version" IS 'Snapshot of blueprint base_version at time of application.';

COMMENT ON COLUMN "control"."blueprint_tenant_application"."applied_by" IS 'Principal who triggered provisioning. NULL when applied by automation.';

CREATE TABLE "control"."book_posting_rule" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "company_code_id" uuid NOT NULL,
  "rule_code" text NOT NULL,
  "rule_name" text NOT NULL,
  "description" text,
  "source_book_id" uuid NOT NULL,
  "target_book_id" uuid NOT NULL,
  "scope_doc_type" text,
  "scope_intent_code" text,
  "scope_account_class" text,
  "scope_subledger_type" text,
  "account_strategy" text DEFAULT 'same'::text NOT NULL,
  "account_mapping" jsonb,
  "target_profile_id" uuid,
  "amount_strategy" text DEFAULT 'mirror'::text NOT NULL,
  "amount_multiplier" numeric(10,6) DEFAULT 1.0,
  "amount_formula" jsonb,
  "recognition_timing" text DEFAULT 'simultaneous'::text NOT NULL,
  "recognition_lag_periods" smallint DEFAULT 0,
  "priority" smallint DEFAULT 0 NOT NULL,
  "version" smallint DEFAULT 1 NOT NULL,
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

COMMENT ON TABLE "control"."book_posting_rule" IS 'ARCHETYPE=B;SCOPE=T. Cross-book derivation rules. When a JE posts to source_book, these rules auto-derive JEs for target_book. Strategies: same/map/profile for accounts, mirror/multiply/formula/suppress for amounts, simultaneous/deferred/on_close for timing.';

CREATE TABLE "control"."budget_check_config" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "book_id" uuid,
  "account_pattern" text,
  "period_scope" text DEFAULT 'fiscal_year'::text NOT NULL,
  "ou_scope" text DEFAULT 'exact'::text NOT NULL,
  "commitment_netting" text DEFAULT 'actuals_plus_committed'::text NOT NULL,
  "warn_at_pct" numeric(5,2) DEFAULT 80 NOT NULL,
  "block_at_pct" numeric(5,2) DEFAULT 100 NOT NULL,
  "override_policy_definition_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."budget_check_config" IS 'ARCHETYPE=C;SCOPE=T. R11: typed dimensional budget-check configuration referenced by policy_rule (action=''budget_check''). Declares dimension scope (book, account, period, OU), netting mode (actuals vs committed vs forecast), warn/block thresholds, and an override approval path. Keeps dimensional semantics out of policy_rule.conditions JSON.';

CREATE TABLE "control"."commodity_category_buy_policy" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "commodity_category_id" uuid NOT NULL,
  "business_intent_id" uuid NOT NULL,
  "company_code_id" uuid,
  "scope_type" text DEFAULT 'TENANT'::text NOT NULL,
  "scope_id" uuid,
  "mapping_mode" text DEFAULT 'ALLOW'::text NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "is_selectable" boolean DEFAULT true NOT NULL,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "default_gl_account_id" uuid,
  "default_tax_group_id" uuid,
  "default_asset_class_id" uuid,
  "default_asset_profile_code" text,
  "default_budget_profile_id" uuid,
  "is_asset_tag_required" boolean,
  "capex_screening_threshold" numeric(18,4),
  "capex_screening_currency" character(3),
  "override_visibility" text,
  "override_is_classification_required" boolean,
  "override_is_hs_required" boolean,
  "override_is_regulated" boolean,
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

COMMENT ON TABLE "control"."commodity_category_buy_policy" IS 'ARCHETYPE=B;SCOPE=T. Buy-side policy mapping commodity_category + business_intent + scope. Controls allowed/default/selectable intents and buy-side GL, asset, budget, capex defaults.';

CREATE TABLE "control"."commodity_category_inventory_policy" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "commodity_category_id" uuid NOT NULL,
  "company_code_id" uuid,
  "scope_type" text DEFAULT 'TENANT'::text NOT NULL,
  "scope_id" uuid,
  "mapping_mode" text DEFAULT 'ALLOW'::text NOT NULL,
  "stocking_status" text DEFAULT 'stocked'::text NOT NULL,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "valuation_method" text,
  "default_inventory_gl_account_id" uuid,
  "default_wip_gl_account_id" uuid,
  "default_cogs_gl_account_id" uuid,
  "default_price_variance_gl_account_id" uuid,
  "default_reorder_point" numeric(18,4),
  "default_reorder_qty" numeric(18,4),
  "default_safety_stock" numeric(18,4),
  "override_lot_tracking_required" boolean,
  "override_serial_tracking_required" boolean,
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

COMMENT ON TABLE "control"."commodity_category_inventory_policy" IS 'ARCHETYPE=B;SCOPE=T. Inventory policy mapping commodity_category + operational scope. Controls stockability, valuation, replenishment, and inventory posting defaults.';

CREATE TABLE "control"."commodity_category_sell_policy" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "commodity_category_id" uuid NOT NULL,
  "business_intent_id" uuid NOT NULL,
  "company_code_id" uuid,
  "scope_type" text DEFAULT 'TENANT'::text NOT NULL,
  "scope_id" uuid,
  "mapping_mode" text DEFAULT 'ALLOW'::text NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "is_selectable" boolean DEFAULT true NOT NULL,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "default_revenue_gl_account_id" uuid,
  "default_deferred_revenue_gl_account_id" uuid,
  "default_unbilled_ar_gl_account_id" uuid,
  "default_tax_group_id" uuid,
  "default_accounting_profile_id" uuid,
  "paired_cogs_profile_id" uuid,
  "revenue_recognition_method" text,
  "variable_consideration" text,
  "standalone_selling_price_method" text,
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

COMMENT ON TABLE "control"."commodity_category_sell_policy" IS 'ARCHETYPE=B;SCOPE=T. Sell-side policy mapping commodity_category + business_intent + scope. Controls allowed/default/selectable intents and revenue, deferral, tax, and recognition defaults.';

CREATE TABLE "control"."commodity_classification_config" (
  "tenant_id" uuid NOT NULL,
  "primary_commodity_domain" text,
  "trade_commodity_domain" text,
  "is_commodity_code_required" boolean DEFAULT false NOT NULL,
  "is_trade_code_required" boolean DEFAULT false NOT NULL,
  "is_required_for_regulated" boolean DEFAULT true NOT NULL,
  "primary_industry_domain" text,
  "is_auto_classify_enabled" boolean DEFAULT true NOT NULL,
  "is_auto_crosswalk_enabled" boolean DEFAULT true NOT NULL,
  "min_confidence_auto" numeric(5,2) DEFAULT 90.00 NOT NULL,
  "min_confidence_suggest" numeric(5,2) DEFAULT 60.00 NOT NULL,
  "crosswalk_strategy" text DEFAULT 'BEST_MATCH'::text NOT NULL,
  "cross_border_triggers" jsonb DEFAULT '["SUPPLIER_COUNTRY_MISMATCH", "SHIP_TO_MISMATCH", "IMPORT_TAX", "CUSTOMS_REQUIRED"]'::jsonb NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."commodity_classification_config" IS 'ARCHETYPE=C;SCOPE=T. Per-tenant AI classification preferences. Singleton (PK = tenant_id). Phase 2: add company_code_id for company-specific overrides; precedence: company row → tenant row → platform defaults. crosswalk_strategy: EXACT_ONLY | BEST_MATCH | AI_ASSISTED.';

CREATE TABLE "control"."commodity_classification_to_intent_rule" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "classification_source" text DEFAULT 'COMMODITY_CATEGORY'::text NOT NULL,
  "classification_id" uuid NOT NULL,
  "direction" text,
  "condition_type" text NOT NULL,
  "condition_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "applies_to_flows" text[],
  "resolved_intent_id" uuid NOT NULL,
  "resolved_domain" text,
  "explanation_template" text NOT NULL,
  "confidence" numeric(3,2) DEFAULT 1.00 NOT NULL,
  "priority" integer DEFAULT 50 NOT NULL,
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

COMMENT ON TABLE "control"."commodity_classification_to_intent_rule" IS 'ARCHETYPE=B;SCOPE=T. Engine 4.13: classification → intent resolution. All 16 condition types runtime-implemented. Does NOT modify existing category_intent_rule. Effective-dated for auditability.';

CREATE TABLE "control"."commodity_code_to_category_rule" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "commodity_domain_code" text NOT NULL,
  "match_mode" text DEFAULT 'RANGE'::text NOT NULL,
  "code_from" text NOT NULL,
  "code_to" text,
  "code_level" smallint,
  "commodity_category_id" uuid NOT NULL,
  "priority" smallint DEFAULT 0 NOT NULL,
  "confidence" numeric(5,2) DEFAULT 100.00 NOT NULL,
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

COMMENT ON TABLE "control"."commodity_code_to_category_rule" IS 'ARCHETYPE=B;SCOPE=T. Code → commodity_category reverse-routing. match_mode governs strategy: EXACT, RANGE (default), PREFIX, CROSSWALK. Deterministic: UNIQUE(tenant, domain, code_from, priority) WHERE active prevents same-priority collisions. Tie-break: highest priority → exact over range → narrowest range → newest created_at. Replaces legacy spend_category_commodity_map and commodity_to_spend_category_rule.';

COMMENT ON COLUMN "control"."commodity_code_to_category_rule"."match_mode" IS 'Routing match strategy. Runtime resolver MUST implement all 4 modes: EXACT: code_from only, code_to must be NULL. Direct equality. RANGE: code_from..code_to inclusive lexical range (default). PREFIX: code_from is a prefix → match WHERE input LIKE code_from || ''%''. CROSSWALK: resolve input via shared.commodity_crosswalk first, then re-match. Priority: EXACT > PREFIX > RANGE > CROSSWALK. Resolver implementation: application layer.';

CREATE TABLE "control"."company_fiscal_calendar_assignment" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "company_code_id" uuid NOT NULL,
  "fiscal_calendar_config_id" uuid NOT NULL,
  "effective_fiscal_year_from" smallint NOT NULL,
  "effective_fiscal_year_to" smallint,
  "priority" smallint DEFAULT 0 NOT NULL,
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

COMMENT ON TABLE "control"."company_fiscal_calendar_assignment" IS 'ARCHETYPE=B;SCOPE=T. Effective fiscal-year assignment of a reusable calendar version to a company code.';

CREATE TABLE "control"."connector_type" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "category" text NOT NULL,
  "description" text,
  "icon_key" text,
  "config_schema" jsonb NOT NULL,
  "auth_types" text[] DEFAULT '{}'::text[] NOT NULL,
  "capabilities" text[] DEFAULT '{}'::text[] NOT NULL,
  "health_check_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "is_system" boolean DEFAULT false NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."connector_type" IS 'ARCHETYPE=B_LITE;SCOPE=N;PENDING_ACTIVE_SET. Integration connector type catalog. config_schema (JSON Schema) drives UI form generation automatically — no frontend changes needed to add a new connector type. is_system = true entries are platform-seeded and cannot be deleted by tenants.';

CREATE TABLE "control"."content_quota" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "kind" text NOT NULL,
  "max_items" bigint,
  "max_storage_bytes" bigint,
  "warn_at_pct" integer DEFAULT 80 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."content_quota" IS 'ARCHETYPE=C;SCOPE=T;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (no status/is_active GENERATED). Per-tenant per-kind content item and storage quotas. max_items / max_storage_bytes = NULL means unlimited. Use kind = ''*'' for a catch-all default for the tenant.';

CREATE TABLE "control"."cron_schedule" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "handler_type" text NOT NULL,
  "cron_expression" text NOT NULL,
  "timezone" text DEFAULT 'UTC'::text NOT NULL,
  "target_queue" text NOT NULL,
  "payload_template" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "priority" smallint DEFAULT 0 NOT NULL,
  "max_retries" smallint DEFAULT 3 NOT NULL,
  "concurrency_limit" smallint,
  "effective_from" timestamp with time zone,
  "effective_until" timestamp with time zone,
  "is_enabled" boolean DEFAULT true NOT NULL,
  "lock_key" text,
  "last_run_at" timestamp with time zone,
  "next_run_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."cron_schedule" IS 'ARCHETYPE=C;SCOPE=G;DEVIATION. Manual is_enabled boolean NOT NULL DEFAULT true (no status/is_active GENERATED). Runtime-configurable BullMQ scheduled jobs. NULL tenant_id = platform-global. Code-based cron-registry.ts entries win on conflict. Scheduler polls every 60 s for runtime changes without restart.';

COMMENT ON COLUMN "control"."cron_schedule"."payload_template" IS 'Job data template. Supports {{tenant_id}} and {{now}} interpolation at enqueue time.';

COMMENT ON COLUMN "control"."cron_schedule"."lock_key" IS 'Redis SETNX key for leader-election in multi-instance deployments. NULL = no leader lock (idempotent jobs only).';

CREATE TABLE "control"."dimension_policy" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "policy_code" text NOT NULL,
  "policy_version" smallint DEFAULT 1 NOT NULL,
  "description" text,
  "dimension_type_id" uuid NOT NULL,
  "company_code_id" uuid,
  "scope_account_class" text,
  "scope_account_id" uuid,
  "scope_subledger_type" text,
  "scope_book_id" uuid,
  "scope_doc_type" text,
  "behavior" text DEFAULT 'OPTIONAL'::text NOT NULL,
  "fixed_value_id" uuid,
  "derive_source" text,
  "depends_on_type_id" uuid,
  "mutually_exclusive_with" uuid,
  "priority" smallint DEFAULT 0 NOT NULL,
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

COMMENT ON TABLE "control"."dimension_policy" IS 'ARCHETYPE=B;SCOPE=T. Dimension validation / governance rules. Purpose: "Department is REQUIRED on Expense accounts." Evaluated at posting time to enforce dimension completeness. Does NOT derive values — derivation lives in acct_profile_dimension_rule. Precedence: exact company match → tenant-global → no rule. Allowed values listed in child table dimension_policy_allowed_value.';

CREATE TABLE "control"."dimension_policy_allowed_value" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "policy_id" uuid NOT NULL,
  "dimension_value_id" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "control"."dimension_policy_allowed_value" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. Allowed dimension values for a policy. Replaces uuid[] column on dimension_policy. Indexable and FK-validated. Cascade deletes when parent policy is removed.';

CREATE TABLE "control"."document_lookup" (
  "lookup_code" text NOT NULL,
  "child_entity" text NOT NULL,
  "base_filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "description" text,
  "status" text DEFAULT 'active'::text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."document_lookup" IS 'ARCHETYPE=B;SCOPE=N. Document-runtime lookup registry. Replaces the generic entity-by-name lookup pattern with allow-listed codes whose base_filters are server-authoritative. Cleanup-plan v5 §4.6.';

COMMENT ON COLUMN "control"."document_lookup"."base_filters" IS 'JSONB filter dict applied BEFORE merging caller extras. Caller cannot bypass these — they always win on key conflict. Example: {"term_type":"discount","status":"active"} for pi_discount_condition_types.';

CREATE TABLE "control"."entity" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid,
  "module_id" text NOT NULL,
  "name" text NOT NULL,
  "slug" text,
  "entity_short" text,
  "entity_code" text NOT NULL,
  "entity_class" text DEFAULT 'MASTER'::text NOT NULL,
  "ownership_model" text DEFAULT 'system'::text NOT NULL,
  "kind" text DEFAULT 'ent'::text NOT NULL,
  "backing_type" text DEFAULT 'table'::text NOT NULL,
  "runtime_enabled" boolean DEFAULT false NOT NULL,
  "primary_key" text,
  "tenant_column" text,
  "read_capability" text DEFAULT 'none'::text NOT NULL,
  "write_capability" text DEFAULT 'none'::text NOT NULL,
  "governance_level" text DEFAULT 'full'::text NOT NULL,
  "security_tier" text DEFAULT 'config'::text NOT NULL,
  "mutability" text DEFAULT 'controlled'::text NOT NULL,
  "mapping_mode" text DEFAULT 'exclusive'::text NOT NULL,
  "engine_tag" text,
  "table_schema" text DEFAULT 'master'::text NOT NULL,
  "table_name" text NOT NULL,
  "label_singular" text,
  "label_plural" text,
  "description" text,
  "icon_key" text,
  "color_token" text,
  "display_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "feature_flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "create_mode" text DEFAULT 'FORM_ONLY'::text NOT NULL,
  "draft_ttl_hours" integer,
  "numbering_strategy" text DEFAULT 'none'::text NOT NULL,
  "data_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "identity_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "search_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "composite_indexes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "discriminator_column" text,
  "discriminator_value" text,
  "is_partition_child" boolean DEFAULT false NOT NULL,
  "partition_parent_id" uuid,
  "partition_key" text,
  "partition_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "external_source_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "provisioned_at" timestamp with time zone,
  "provisioned_by" uuid,
  "status" text DEFAULT 'DRAFT'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = ANY (ARRAY['ACTIVE'::text, 'DEPRECATED'::text]))) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid,
  "concurrency_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "plane_eligibility" text[] DEFAULT ARRAY['neon'::text] NOT NULL
);

COMMENT ON TABLE "control"."entity" IS 'ARCHETYPE=B;SCOPE=G. Non-standard active-set: is_active GENERATED AS (status = ANY(ARRAY[''ACTIVE'',''DEPRECATED''])). Central registry of every table/view in the platform. ownership_model discriminator: system (platform), tenant (custom), package, overlay. Tenant tables: document.t_<tenant_short>_<entity_code> — enforced by CHECK. composite_indexes: replaces control.index_def (eliminated). provisioned_at/by: replaces control.entity_extension (eliminated). engine_tag: replaces control.engine (eliminated) — free-text annotation.';

COMMENT ON COLUMN "control"."entity"."ownership_model" IS 'system   → platform entity (document.invoice, master.principal). tenant   → custom entity created by tenant (document.t_acme_purchase_order). package  → installed module entity. overlay  → overlay-derived virtual entity (no physical table).';

COMMENT ON COLUMN "control"."entity"."create_mode" IS 'Create UX/runtime contract: FORM_ONLY creates on first save; EARLY_DRAFT initiates a provisional row; SOURCE_DOCUMENT_CREATE creates from source selection; DIRECT_CREATE is reserved.';

COMMENT ON COLUMN "control"."entity"."draft_ttl_hours" IS 'TTL for EARLY_DRAFT provisional rows. NULL means no generic cleanup policy.';

COMMENT ON COLUMN "control"."entity"."numbering_strategy" IS 'Business number strategy: none, manual, auto, or auto_or_manual. EARLY_DRAFT auto numbers on promotion/save, not draft initiation.';

COMMENT ON COLUMN "control"."entity"."composite_indexes" IS 'Custom composite index declarations. Single-field indexes auto-derived from entity_field flags at compile time. Each: {name: text, is_unique: bool, method: btree|gin|gist|hash, columns: [col_name,...], where_clause: optional partial filter}.';

COMMENT ON COLUMN "control"."entity"."provisioned_at" IS 'Set when provision_tenant_extensions() executes CREATE TABLE for tenant entities. NULL = not yet provisioned (status=DRAFT). Only populated for ownership_model=tenant.';

COMMENT ON COLUMN "control"."entity"."concurrency_policy" IS 'Concurrency strategy for this entity. Example: {"strategy":"lease_plus_version","rollout":"optional","version_column":"row_version","lock_ttl_seconds":300,"heartbeat_seconds":30} strategy: none | version_only | lease_plus_version. rollout: observe (log, never block) | optional (enforce only when client sends token) | enforced (always require token + version). children: array of child entity_codes that share this aggregate''s lock. references_excluded: master records referenced but not owned by this aggregate (supplier, etc.).';

COMMENT ON COLUMN "control"."entity"."plane_eligibility" IS 'Which product planes (neon|admin|mesh) may compile a descriptor for this entity. Defaults to neon. Admin meta-entities tag [''admin'']; mesh-facing entities add ''mesh''.';

CREATE TABLE "control"."entity_action_rule" (
  "entity_code" text NOT NULL,
  "status" text NOT NULL,
  "action_code" text NOT NULL,
  "capability" text NOT NULL,
  "required_permission" text,
  "reason" text,
  "description" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid,
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid,
  "entity_version_id" uuid
);

COMMENT ON TABLE "control"."entity_action_rule" IS 'ARCHETYPE=B;SCOPE=N. Document-runtime action capability registry. Deny-by-default per amendment 9: missing row for (entity, status, action_code) is rejected at affordance resolution. Combined client-side with lifecycle state mask + RBAC; ANY denial wins. Cleanup-plan v5 §3.7.';

COMMENT ON COLUMN "control"."entity_action_rule"."action_code" IS 'Convention <SURFACE>.<VERB>. PC.ADD, PC.REPLACE, PC.OVERRIDE, PC.DELETE, AD.ADD, AD.EDIT, AD.DELETE, HEADER.SUBMIT, HEADER.APPROVE, …';

COMMENT ON COLUMN "control"."entity_action_rule"."capability" IS '''allowed'': UI shows the affordance enabled. ''denied'': UI shows the affordance disabled (with `reason` tooltip when set). ''requires_permission'': caller must hold `required_permission` in their session.';

COMMENT ON COLUMN "control"."entity_action_rule"."reason" IS 'Tooltip text rendered alongside the disabled affordance. Free-form, short enough to fit a tooltip (e.g. "Action denied in approval status").';

CREATE TABLE "control"."entity_class_profile" (
  "class_key" text NOT NULL,
  "label" text NOT NULL,
  "description" text NOT NULL,
  "valid_governance_levels" text[] NOT NULL,
  "default_governance_level" text DEFAULT 'full'::text NOT NULL,
  "valid_mutability" text[] DEFAULT ARRAY['locked'::text, 'controlled'::text, 'extensible'::text] NOT NULL,
  "default_mutability" text DEFAULT 'controlled'::text NOT NULL,
  "default_security_tier" text DEFAULT 'config'::text NOT NULL,
  "expected_system_columns" text[] DEFAULT '{}'::text[] NOT NULL,
  "field_flag_rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "security_tiers" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "compliance_profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "cache_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "sort_order" smallint DEFAULT 0 NOT NULL
);

COMMENT ON TABLE "control"."entity_class_profile" IS 'ARCHETYPE=F;SCOPE=N. Platform-global governance rules per entity class. Immutable — seeded at install. Absorbs entity_field_flag_standard (field_flag_rules), security_tier_profile (security_tiers), audit_policy (compliance_profile.audit_rules). No tenant_id — these are platform constants.';

COMMENT ON COLUMN "control"."entity_class_profile"."field_flag_rules" IS 'Pattern rules for auto-setting field behaviour flags on INSERT into entity_field. Evaluated by trg_field_flag_defaults. Each rule: {match_mode: name|data_type|origin|format, pattern: text (exact or LIKE with % wildcard), priority: smallint (lower fires first), is_searchable, is_filterable, is_sortable, is_groupable, is_aggregatable: bool|null, cardinality: one|many|zero_or_one|null}. class_key=''*'' = wildcard (applies to all classes, lower priority than class-specific).';

COMMENT ON COLUMN "control"."entity_class_profile"."security_tiers" IS 'Per-tier security requirements. Keyed by tier_key. {platform_critical: {min_governance: ''full'', is_created_by_required: true, is_updated_by_required: true, is_change_reason_required: true, is_change_approval_required: true, is_audit_on_read: true}, ...}';

COMMENT ON COLUMN "control"."entity_class_profile"."compliance_profile" IS 'Linting rules, required field patterns, and audit disposition rules. {linting_rules: [...], required_field_patterns: [...], audit_rules: {default_disposition: required|sampled|disabled, by_category: {event_category: {disposition, sample_rate}}}}. Tenant entity-level overrides via entity_policy.audit_mode.';

COMMENT ON COLUMN "control"."entity_class_profile"."cache_policy" IS 'Typed entity-list cache defaults and prefetch constraints for this class. Resolution precedence is entity display_config.list_cache, class cache_policy, platform default.';

CREATE TABLE "control"."entity_contract_transition" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid,
  "entity_id" uuid NOT NULL,
  "entity_version_id" uuid NOT NULL,
  "transition" text NOT NULL,
  "principal_id" uuid NOT NULL,
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
  "before_hash" text,
  "after_hash" text,
  "contract_diff" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "reason" text,
  "ticket_reference" text,
  "request_key" text,
  "source_version_id" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);

COMMENT ON TABLE "control"."entity_contract_transition" IS 'Append-only evidence for every Contract workflow transition, including principal, hashes and canonical diff.';

CREATE TABLE "control"."entity_field" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid,
  "entity_version_id" uuid,
  "name" text NOT NULL,
  "column_name" text DEFAULT ''::text NOT NULL,
  "projection_alias_of" text,
  "label" text,
  "description" text,
  "data_type" text NOT NULL,
  "ui_type" text,
  "format" text,
  "unit" text,
  "cardinality" text DEFAULT 'one'::text NOT NULL,
  "origin" text DEFAULT 'business'::text NOT NULL,
  "is_required" boolean DEFAULT false NOT NULL,
  "is_unique" boolean DEFAULT false NOT NULL,
  "unique_scope" text,
  "is_searchable" boolean DEFAULT false NOT NULL,
  "is_filterable" boolean DEFAULT false NOT NULL,
  "is_sortable" boolean DEFAULT false NOT NULL,
  "is_groupable" boolean DEFAULT false NOT NULL,
  "is_aggregatable" boolean DEFAULT false NOT NULL,
  "is_read_only" boolean DEFAULT false NOT NULL,
  "is_deprecated" boolean DEFAULT false NOT NULL,
  "is_computed" boolean DEFAULT false NOT NULL,
  "is_write_once" boolean DEFAULT false NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "runtime_enabled" boolean DEFAULT true NOT NULL,
  "is_primary_amount" boolean DEFAULT false NOT NULL,
  "is_primary_currency" boolean DEFAULT false NOT NULL,
  "compute_mode" text,
  "compute_expr" jsonb,
  "enum_config" jsonb,
  "enum_domain_code" text,
  "enum_kind" text,
  "reference_config" jsonb,
  "fk_target_entity_id" uuid,
  "fk_target_field" text,
  "fk_on_delete" text,
  "fk_on_update" text,
  "fk_relationship_class" text,
  "json_config" jsonb,
  "money_config" jsonb,
  "datetime_config" jsonb,
  "temporal_kind" text,
  "display_mode" text,
  "affects_posting_period" boolean DEFAULT false NOT NULL,
  "group_key" text,
  "filter_config" jsonb,
  "ui_hint" jsonb,
  "visibility" jsonb,
  "editability" jsonb,
  "lookup_config" jsonb,
  "lookup_profile" jsonb,
  "child_entity_name" text,
  "child_fk_field" text,
  "collection_behavior" jsonb,
  "validation" jsonb,
  "constraints" jsonb,
  "default_value" jsonb,
  "provisioned_at" timestamp with time zone,
  "provisioned_by" uuid,
  "applies_to_classes" text[] DEFAULT '{}'::text[],
  "synonym_cluster" text,
  "is_required_default" boolean DEFAULT false NOT NULL,
  "is_filterable_default" boolean DEFAULT false NOT NULL,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid,
  "semantic_roles" text[] DEFAULT '{}'::text[] NOT NULL,
  "type_config" jsonb DEFAULT '{"kind": "scalar"}'::jsonb NOT NULL,
  "defaults" jsonb
);

COMMENT ON TABLE "control"."entity_field" IS 'ARCHETYPE=C;SCOPE=G;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (not GENERATED). All fields in the platform — canonical, versioned, and custom. entity_version_id IS NULL: canonical/standard fields (replaces entity_canonical_field). entity_version_id IS NOT NULL: version-specific fields. origin=business + column_name~cus_: custom tenant fields (replaces field_extension). provisioned_at/by populated after ALTER TABLE ADD COLUMN for custom fields. runtime_enabled controls descriptor eligibility without collapsing registered metadata. enum_domain_code replaces enum_set_code (FK to control.lookup_domain).';

COMMENT ON COLUMN "control"."entity_field"."semantic_roles" IS 'Canonical semantic role set. Replaces is_primary_amount, is_primary_currency, and ui_hint semantic markers.';

COMMENT ON COLUMN "control"."entity_field"."type_config" IS 'Strict discriminated value contract. Structure belongs to entity_relation; presentation belongs to surfaces.';

COMMENT ON COLUMN "control"."entity_field"."defaults" IS 'Cascade semantics. Drives form runtime on-create default fill, BFF inheritance projection, and UI override-detection chip rendering. Replaces ~30 hypothetical per-field origin columns on document tables. See docs/specs/purchase_invoice_field_design.md §4.';

CREATE TABLE "control"."entity_field_surface" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid,
  "entity_surface_id" uuid NOT NULL,
  "entity_field_id" uuid NOT NULL,
  "visible_override" boolean,
  "required_override" boolean,
  "readonly_override" boolean,
  "sort_order" smallint,
  "column_span" smallint,
  "density" text,
  "renderer_key" text,
  "editor_key" text,
  "visibility_expr" jsonb,
  "editability_expr" jsonb,
  "renderer_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."entity_field_surface" IS 'ARCHETYPE=C;SCOPE=G. Field behavior inside a runtime surface. Nullable override booleans inherit from entity_field when NULL. Use this for mode/surface-specific visibility, ordering, density, renderer/editor overrides; keep intrinsic invariants on control.entity_field.';

COMMENT ON COLUMN "control"."entity_field_surface"."visible_override" IS 'NULL = inherit compiler visibility; true/false force visibility for this field in this surface.';

COMMENT ON COLUMN "control"."entity_field_surface"."required_override" IS 'NULL = inherit entity_field.is_required; true/false override required state for this surface.';

COMMENT ON COLUMN "control"."entity_field_surface"."readonly_override" IS 'NULL = inherit entity_field.is_read_only/editability; true/false override readonly state for this surface.';

CREATE TABLE "control"."entity_flow" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid,
  "entity_version_id" uuid NOT NULL,
  "flow_code" text NOT NULL,
  "label" text NOT NULL,
  "description" text,
  "icon_key" text,
  "trigger_context" text NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "version_no" integer DEFAULT 1 NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "effective_from" timestamp with time zone,
  "effective_to" timestamp with time zone,
  "supersedes_flow_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."entity_flow" IS 'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Named intake experience bound to an entity_version. Versioned and tenant-overrideable. config jsonb carries cross-step concerns: summary panel, input modes, dedup index binding, assist rules, and layout.';

CREATE TABLE "control"."entity_flow_field" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid,
  "flow_step_id" uuid NOT NULL,
  "entity_field_id" uuid NOT NULL,
  "mode" text NOT NULL,
  "derivation_mode" text,
  "visible_when" jsonb,
  "required_when" jsonb,
  "default_source" text,
  "derive_expression" text,
  "override_permission" text,
  "override_requires_note" boolean DEFAULT false NOT NULL,
  "summary_role" text,
  "ui_variant" text,
  "format" text,
  "span" smallint DEFAULT 1 NOT NULL,
  "help_text" text,
  "placeholder" text,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid,
  "section_key" text,
  "display_size" text
);

COMMENT ON TABLE "control"."entity_flow_field" IS 'ARCHETYPE=A;SCOPE=T. Per-flow, per-step rendering behavior for a canonical field. derivation_mode encodes the three-state model: derived_locked, derived_overrideable, manual. mode is the render role. visible_when/required_when run as JSONLogic over the in-progress draft.';

CREATE TABLE "control"."entity_flow_section" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid,
  "flow_step_id" uuid NOT NULL,
  "section_key" text NOT NULL,
  "label" text NOT NULL,
  "description" text,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "collapse_default" boolean DEFAULT false NOT NULL,
  "visible_when" jsonb,
  "reveal_behavior" text DEFAULT 'honor_default'::text NOT NULL,
  "icon_key" text,
  "help_text" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid,
  "section_type" text DEFAULT 'fields'::text NOT NULL,
  "entity_code" text,
  "payload_key" text,
  "field_codes" jsonb,
  "min_rows" smallint,
  "max_rows" smallint,
  "default_row" jsonb,
  "permission_code" text,
  "restricted_view_only" boolean DEFAULT false NOT NULL
);

COMMENT ON TABLE "control"."entity_flow_section" IS 'Collapsible/conditional section groupings within a flow step. Each section has a label, collapse default, optional visibility rule, and reveal behavior. Fields bind to sections via entity_flow_field.section_key.';

CREATE TABLE "control"."entity_flow_step" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid,
  "flow_id" uuid NOT NULL,
  "step_key" text NOT NULL,
  "label" text NOT NULL,
  "description" text,
  "icon_key" text,
  "sort_order" smallint NOT NULL,
  "skip_when" jsonb,
  "advance_rule" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "layout_hint" text DEFAULT 'two_column'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."entity_flow_step" IS 'ARCHETYPE=A;SCOPE=T. Ordered stages within a flow. skip_when makes steps conditionally vanish (JSONLogic over draft). advance_rule gates progression — required_fields list + optional predicate.';

CREATE TABLE "control"."entity_lifecycle" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid,
  "entity_name" text NOT NULL,
  "lifecycle_id" uuid NOT NULL,
  "conditions" jsonb,
  "priority" smallint DEFAULT 100 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid,
  "entity_version_id" uuid
);

COMMENT ON TABLE "control"."entity_lifecycle" IS 'ARCHETYPE=C;SCOPE=G. Binds lifecycle state machines to entity types. conditions: JSONLogic expression — if NULL, always applies. Multiple lifecycles per entity resolved by priority (lower = higher). Moved from association.entity_lifecycle to control.*. P2-FIX: updated_at/updated_by added — bindings are rebindable.';

CREATE TABLE "control"."entity_lifecycle_state_mask" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid,
  "entity_name" text NOT NULL,
  "record_status" text NOT NULL,
  "can_edit" boolean DEFAULT true NOT NULL,
  "can_delete" boolean DEFAULT true NOT NULL,
  "can_transition_to" text[],
  "disabled_reason" text,
  "applies_to_planes" text[] DEFAULT ARRAY['neon'::text, 'admin'::text, 'mesh'::text] NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid,
  "entity_version_id" uuid,
  "lifecycle_state_id" uuid
);

COMMENT ON TABLE "control"."entity_lifecycle_state_mask" IS 'ARCHETYPE=C;SCOPE=B. Per-status capability mask — the 5th authorization gate after permission/operation/policy/plan. Resolved during descriptor compile. Replaces hardcoded EDITABLE_STATUSES constant in runtime-canvas. NULL tenant_id = platform default; tenant override wins when both present.';

CREATE TABLE "control"."entity_numbering_config" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid,
  "entity_id" uuid NOT NULL,
  "number_field" text NOT NULL,
  "company_code_id" uuid,
  "prefix" text DEFAULT ''::text NOT NULL,
  "prefix_configurable" boolean DEFAULT true NOT NULL,
  "separator" text DEFAULT '-'::text NOT NULL,
  "segments" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "reset_strategy" text DEFAULT 'yearly'::text NOT NULL,
  "uniqueness_scope" text DEFAULT 'tenant'::text NOT NULL,
  "max_length" smallint,
  "allowed_chars" text DEFAULT 'upper_alnum_dash'::text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" shared.active_inactive_d DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS (((status)::text = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid,
  "entity_version_id" uuid
);

COMMENT ON TABLE "control"."entity_numbering_config" IS 'ARCHETYPE=B;SCOPE=G/T. Canonical entity numbering policy. tenant_id=NULL is the platform default; tenant rows override. Segments define the rendered number while entity_numbering_counter stores mutable sequence state.';

COMMENT ON COLUMN "control"."entity_numbering_config"."number_field" IS 'Logical control.entity_field.name that receives the generated number, e.g. document_no or code.';

COMMENT ON COLUMN "control"."entity_numbering_config"."segments" IS 'JSONB array of segment descriptors: tenant_code, company_code, branch_code, year, fiscal_year, period, quarter, sequence, static.';

COMMENT ON COLUMN "control"."entity_numbering_config"."allowed_chars" IS 'Named set such as upper_alnum_dash, alnum_dash, any, or a PostgreSQL regular expression.';

CREATE TABLE "control"."entity_numbering_counter" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid,
  "config_id" uuid NOT NULL,
  "company_code_id" uuid,
  "scope_key" text DEFAULT ''::text NOT NULL,
  "fiscal_year" smallint DEFAULT 0 NOT NULL,
  "period_number" smallint DEFAULT 0 NOT NULL,
  "quarter_number" smallint DEFAULT 0 NOT NULL,
  "last_value" bigint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."entity_numbering_counter" IS 'Runtime-only numbering state protected by forced RLS. Metadata publish, clone, import, and rollback must not mutate it.';

COMMENT ON COLUMN "control"."entity_numbering_counter"."last_value" IS 'Runtime-only state. Metadata publication, clone, import, and rollback must never modify this value.';

CREATE TABLE "control"."entity_operation" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid,
  "entity_name" text NOT NULL,
  "permission_code" text NOT NULL,
  "surface" text DEFAULT 'BOTH'::text NOT NULL,
  "placement" text DEFAULT 'TOOLBAR'::text NOT NULL,
  "handler_type" text DEFAULT 'API'::text NOT NULL,
  "handler_target" text,
  "execution_target" text,
  "is_record_required" boolean DEFAULT false NOT NULL,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "label_override" text,
  "icon_override" text,
  "tcode_alias" text,
  "is_enabled" boolean DEFAULT true NOT NULL,
  "selection_config" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid,
  "entity_version_id" uuid,
  "operation_code" text,
  "label" text,
  "icon" text,
  "intent" text DEFAULT 'neutral'::text NOT NULL,
  "confirmation" jsonb DEFAULT '{"code": null, "required": false}'::jsonb NOT NULL,
  "reason_required" boolean DEFAULT false NOT NULL,
  "record_required" boolean,
  "plane_filter" text[],
  "entity_id_v2" uuid,
  "entity_version_id_v2" uuid,
  "operation_code_v2" text,
  "permission_id_v2" uuid,
  "v2_publication_status" text,
  "v2_effective_from" timestamp with time zone,
  "v2_effective_until" timestamp with time zone,
  "v2_operation_kind" text,
  "v2_idempotency_mode" text,
  "v2_risk_tier" text,
  "v2_requires_mfa" boolean,
  "v2_requires_sod" boolean,
  "v2_is_shareable" boolean,
  "v2_is_delegable" boolean
);

COMMENT ON TABLE "control"."entity_operation" IS 'ARCHETYPE=C;SCOPE=G;DEVIATION. Manual is_enabled boolean NOT NULL DEFAULT true (not GENERATED). Registers operations on entity types with UI placement config. permission_code replaces operation_code — FK to control.auth_permission.canonical_code. Moved from association.entity_operation to control.*.';

COMMENT ON COLUMN "control"."entity_operation"."handler_target" IS 'UI interaction target only: route, inline/modal name, or flow:<flow_code>.';

COMMENT ON COLUMN "control"."entity_operation"."execution_target" IS 'Server execution command, independent of UI interaction; lifecycle operations use lifecycle:<operation_code>.';

COMMENT ON COLUMN "control"."entity_operation"."plane_filter" IS 'Per-operation override of entity.plane_eligibility. NULL = inherit parent. Use when an entity surfaces in multiple planes but specific operations are plane-bound.';

COMMENT ON COLUMN "control"."entity_operation"."entity_version_id_v2" IS 'Optional canonical entity version. A composite FK proves it belongs to entity_id_v2; NULL means the current entity contract.';

COMMENT ON COLUMN "control"."entity_operation"."operation_code_v2" IS 'Canonical stable operation identity. Deliberately separate from legacy operation_code, which was derived from permission_code.';

COMMENT ON COLUMN "control"."entity_operation"."permission_id_v2" IS 'Exact FK to control.auth_permission for the canonical path. NULL keeps the legacy row outside v2.';

COMMENT ON COLUMN "control"."entity_operation"."v2_publication_status" IS 'NULL = legacy-only; draft/published/suspended/retired = explicit Wave 1 lifecycle.';

CREATE TABLE "control"."entity_policy" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "entity_id" uuid NOT NULL,
  "entity_version_id" uuid,
  "access_mode" text DEFAULT 'default_deny'::text NOT NULL,
  "company_scope_mode" text DEFAULT 'none'::text NOT NULL,
  "audit_mode" text DEFAULT 'enabled'::text NOT NULL,
  "retention_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "default_filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "cache_flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "field_scope_eval_order" text DEFAULT 'row_first'::text NOT NULL,
  "extended_scope" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."entity_policy" IS 'ARCHETYPE=C;SCOPE=T. Canonical row-scope surface for entity-level access, audit, and retention policy. R10: company_scope_mode (none/single/subtree/full) is the primary LE/OU row-scope axis. field_scope_eval_order defines composition order vs field_security_policy:   row_first (default) → row predicate filters first, then field masking on survivors;   field_first → field masking nulls columns before row predicate runs;   parallel → both predicates evaluated independently and ANDed. extended_scope carries dept/project/cost-centre axis constraints beyond LE/OU. entity_version_id IS NULL: policy applies to all versions of the entity. audit_mode overrides entity_class_profile.compliance_profile.audit_rules at the entity level. Moved from association.entity_policy to control.*.';

CREATE TABLE "control"."entity_publish_state" (
  "entity_id" uuid NOT NULL,
  "tenant_id" uuid,
  "published_version_id" uuid,
  "current_draft_version_id" uuid,
  "latest_version_no" integer DEFAULT 0 NOT NULL,
  "last_compiled_at" timestamp with time zone,
  "last_compiled_hash" text,
  "last_schema_change_at" timestamp with time zone,
  "catalog_status" text DEFAULT 'NOT_BUILT'::text NOT NULL,
  "catalog_compiled_at" timestamp with time zone,
  "catalog_compiled_hash" text,
  "catalog_diagnostics" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "execution_status" text DEFAULT 'NOT_APPLICABLE'::text NOT NULL,
  "execution_compiled_at" timestamp with time zone,
  "execution_compiled_hash" text,
  "execution_diagnostics" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "provenance" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status_summary" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "source_layer" text DEFAULT 'platform'::text NOT NULL,
  "source_ref" text,
  "applied_precedence" smallint DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid,
  "contract_hash" text,
  "materialized_hash" text,
  "admin_compiled_hash" text,
  "neon_compiled_hash" text,
  "mesh_compiled_hash" text,
  "readiness_status" text DEFAULT 'NOT_READY'::text NOT NULL,
  "readiness_diagnostics" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "ready_at" timestamp with time zone
);

COMMENT ON TABLE "control"."entity_publish_state" IS 'ARCHETYPE=C;SCOPE=G. 1:1 companion to control.entity. Holds compile/publish tracking columns that were previously duplicated in entity (removed by this migration). Separated to avoid update contention during frequent compile cycles. R4: source_layer/source_ref/applied_precedence expose the blueprint/overlay merge order:   platform(0) < blueprint(1-99, by application order) < overlay(100).   Higher applied_precedence wins on conflict. source_ref names the contributing pack/overlay.   Admins can query this table to see "this entity came from blueprint X, overridden by overlay Y." Auto-created by trg_fn_ensure_entity_publish_state on entity INSERT. catalog_* tracks the all-entity metadata artifact; execution_* tracks the API-eligible artifact.';

CREATE TABLE "control"."entity_relation" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid,
  "entity_version_id" uuid NOT NULL,
  "name" text NOT NULL,
  "relation_kind" text NOT NULL,
  "target_entity" text NOT NULL,
  "resolution_kind" text DEFAULT 'fk'::text NOT NULL,
  "fk_field" text,
  "target_key" text DEFAULT 'id'::text NOT NULL,
  "source_type_field" text,
  "source_type_value" text,
  "source_id_field" text,
  "source_line_field" text,
  "runtime_role" text,
  "on_delete" text DEFAULT 'restrict'::text NOT NULL,
  "record_filter" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "ui_behavior" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid,
  "relation_code" text,
  "target_entity_code" text,
  "source_field" text,
  "target_field" text,
  "polymorphic_type_field" text,
  "polymorphic_type_value" text,
  "polymorphic_id_field" text,
  "mutation_owner" text DEFAULT 'read_only'::text NOT NULL,
  "mutation_permissions" text[] DEFAULT '{}'::text[] NOT NULL
);

COMMENT ON TABLE "control"."entity_relation" IS 'ARCHETYPE=C;SCOPE=G. FK/join relationship declarations per entity version. relation_kind: belongs_to (many-to-one), has_many (one-to-many), m2m (many-to-many). Renamed from association.relation + moved to control.*. P2-FIX: updated_at/updated_by added — relation config is editable.';

CREATE TABLE "control"."entity_scope_binding" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "entity_id" uuid NOT NULL,
  "entity_operation_id" uuid NOT NULL,
  "permission_id" uuid NOT NULL,
  "plane_code" text NOT NULL,
  "scope_policy_id" uuid NOT NULL,
  "scope_kind" text NOT NULL,
  "binding_kind" text NOT NULL,
  "source_column" text,
  "resolver_key" text,
  "binding_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "effective_from" timestamp with time zone DEFAULT now() NOT NULL,
  "effective_until" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."entity_scope_binding" IS 'Typed resource-to-scope extraction for one exact operation permission. It replaces permission-code parsing and unchecked polymorphic scope IDs.';

CREATE TABLE "control"."entity_surface" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid,
  "entity_id" uuid NOT NULL,
  "mode" text NOT NULL,
  "surface_key" text NOT NULL,
  "kind" text NOT NULL,
  "placement" text DEFAULT 'main'::text NOT NULL,
  "parent_surface_id" uuid,
  "slot_key" text,
  "label" text,
  "icon_key" text,
  "group_keys" text[] DEFAULT '{}'::text[] NOT NULL,
  "relation_name" text,
  "renderer_key" text,
  "composer_key" text,
  "strategy_key" text,
  "column_count" smallint,
  "print_span" text,
  "density" text,
  "required_permissions" text[] DEFAULT '{}'::text[] NOT NULL,
  "visibility_expr" jsonb,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "is_enabled" boolean DEFAULT true NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid,
  "entity_version_id" uuid,
  "v2_mode" text,
  "v2_kind" text
);

COMMENT ON TABLE "control"."entity_surface" IS 'ARCHETYPE=C;SCOPE=G. Normalized runtime surface declarations for create/edit/view/list/print. tenant_id NULL rows are platform defaults; tenant rows override the same entity_id + mode + surface_key. kind is the semantic surface category; renderer_key is the concrete renderer override. config is renderer-specific payload only, not generic layout or permission metadata.';

COMMENT ON COLUMN "control"."entity_surface"."mode" IS 'Runtime mode: create, edit, view, list, or print.';

COMMENT ON COLUMN "control"."entity_surface"."kind" IS 'Semantic surface category consumed by the descriptor compiler and runtime registry.';

COMMENT ON COLUMN "control"."entity_surface"."placement" IS 'Mount placement. action_only participates in dispatch without rendering; mount_only is side-effect/provider style.';

COMMENT ON COLUMN "control"."entity_surface"."parent_surface_id" IS 'Optional parent surface for sidecars and slots, e.g. payment terms mounted inside a document header.';

COMMENT ON COLUMN "control"."entity_surface"."required_permissions" IS 'Permission codes required to render this surface. Empty array means no extra surface-level permission gate.';

CREATE TABLE "control"."entity_version" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid,
  "entity_id" uuid NOT NULL,
  "version_no" integer NOT NULL,
  "version_hash" text,
  "status" text DEFAULT 'DRAFT'::text NOT NULL,
  "is_effective" boolean GENERATED ALWAYS AS ((status = 'EFFECTIVE'::text)) STORED,
  "label" text,
  "change_summary" text,
  "change_type" text,
  "is_working_copy" boolean DEFAULT false NOT NULL,
  "derived_from_version_id" uuid,
  "supersedes_version_id" uuid,
  "effective_from" timestamp with time zone,
  "effective_to" timestamp with time zone,
  "lock_version" integer DEFAULT 0 NOT NULL,
  "lifecycle_instance_id" uuid,
  "behaviors" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid,
  "locked_after_effective" boolean DEFAULT true NOT NULL,
  "emergency_override_at" timestamp with time zone,
  "emergency_override_by" uuid,
  "emergency_override_reason" text,
  "emergency_override_ticket" text,
  "contract_schema_version" text,
  "contract_document" jsonb,
  "contract_hash" text,
  "validation_status" text DEFAULT 'NOT_VALIDATED'::text NOT NULL,
  "validation_diagnostics" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "validated_at" timestamp with time zone,
  "validated_by" uuid,
  "base_version_id" uuid,
  "submitted_at" timestamp with time zone,
  "submitted_by" uuid,
  "reviewed_at" timestamp with time zone,
  "reviewed_by" uuid,
  "published_at" timestamp with time zone,
  "published_by" uuid,
  "approval_break_glass" boolean DEFAULT false NOT NULL,
  "approval_break_glass_reason" text,
  "approval_break_glass_ticket" text,
  "projection_hash" text,
  "projected_at" timestamp with time zone,
  "projected_by" uuid
);

COMMENT ON TABLE "control"."entity_version" IS 'ARCHETYPE=B_LITE;SCOPE=G;DEVIATION. DEVIATION: lifecycle column is is_effective GENERATED AS (status = ''EFFECTIVE''), not is_active. Versioned entity definitions. Moved from snapshot.* to control.* — versions are actively managed through DRAFT→EFFECTIVE lifecycle. entity_field rows (entity_version_id IS NOT NULL) belong to a specific version. entity_field rows (entity_version_id IS NULL) are canonical/standard fields. UNIQUE(entity_id, version_no) — no duplicate version numbers per entity.';

COMMENT ON COLUMN "control"."entity_version"."change_type" IS 'Business change category only: structural, behavioral, governance, label, or fix.';

COMMENT ON COLUMN "control"."entity_version"."locked_after_effective" IS 'D14. When true (default) and status=EFFECTIVE, the trg_ev_block_mutation trigger rejects UPDATE/DELETE unless the emergency_override_* fields are populated with a CAB ticket.';

COMMENT ON COLUMN "control"."entity_version"."emergency_override_ticket" IS 'CAB or incident ticket reference. Mandatory whenever emergency_override_at is set. Audited via log.descriptor_cache_invalidation with reason=''emergency_override''.';

COMMENT ON COLUMN "control"."entity_version"."contract_document" IS 'Immutable canonical Contract JSON for this entity version. Studio authors this column; projections are generated.';

COMMENT ON COLUMN "control"."entity_version"."contract_hash" IS 'SHA-256 of canonical Contract JSON. Used with lock_version for optimistic concurrency and publication identity.';

COMMENT ON COLUMN "control"."entity_version"."validation_diagnostics" IS 'Machine-readable validation diagnostics; an array of path/code/message objects.';

COMMENT ON COLUMN "control"."entity_version"."projection_hash" IS 'Canonical Contract v2.1 hash most recently projected transactionally into version-owned control tables.';

CREATE TABLE "control"."entity_version_contract" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "entity_version_id" uuid NOT NULL,
  "tenant_id" uuid,
  "catalog_enabled" boolean DEFAULT true NOT NULL,
  "api_exposure" text DEFAULT 'CATALOG_ONLY'::text NOT NULL,
  "backing_type" text DEFAULT 'table'::text NOT NULL,
  "table_schema" text NOT NULL,
  "table_name" text NOT NULL,
  "key_strategy" text DEFAULT 'single'::text NOT NULL,
  "primary_key" text,
  "tenant_column" text,
  "read_capability" text DEFAULT 'none'::text NOT NULL,
  "write_capability" text DEFAULT 'none'::text NOT NULL,
  "read_handler" text,
  "write_handler" text,
  "source_kind" text DEFAULT 'derived'::text NOT NULL,
  "contract_hash" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid,
  "contract_version" smallint DEFAULT 2 NOT NULL,
  "runtime_enabled" boolean DEFAULT false NOT NULL,
  "create_mode" text DEFAULT 'FORM_ONLY'::text NOT NULL,
  "draft_ttl_hours" integer,
  "governance_level" text DEFAULT 'full'::text NOT NULL,
  "security_tier" text DEFAULT 'config'::text NOT NULL,
  "mutability" text DEFAULT 'controlled'::text NOT NULL,
  "identity_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "search_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "data_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "concurrency_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "storage_config" jsonb DEFAULT '{}'::jsonb NOT NULL
);

COMMENT ON TABLE "control"."entity_version_contract" IS 'Meta Entity Contract v2 runtime/storage owner. Legacy control.entity runtime fields are migration inputs only.';

COMMENT ON COLUMN "control"."entity_version_contract"."primary_key" IS 'Explicit single-column runtime key. Composite keys remain catalog-valid but API-ineligible until supported.';

COMMENT ON COLUMN "control"."entity_version_contract"."tenant_column" IS 'Nullable physical row-scope column. NULL is valid for global entities and is distinct from metadata tenant ownership.';

CREATE TABLE "control"."feature_flag" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "flag_type" text DEFAULT 'release_gate'::text NOT NULL,
  "is_enabled" boolean DEFAULT false NOT NULL,
  "tenant_overrides" jsonb,
  "rollout_pct" smallint,
  "expires_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."feature_flag" IS 'ARCHETYPE=C;SCOPE=N;DEVIATION. No tenant_id; manual is_enabled boolean (no status/is_active GENERATED). Platform feature flag registry. Redis cache-first (60s TTL), DB fallback. flag_type discriminator: release_gate (temporary on/off for phased releases), capability_toggle (permanent feature switch with no planned expiry), experiment (A/B test or percentage rollout). is_enabled = global default. tenant_overrides = per-tenant map. rollout_pct = 0–100 stable-hash rollout when no tenant override present.';

COMMENT ON COLUMN "control"."feature_flag"."code" IS 'Machine-readable flag identifier. Convention: snake_case module prefix + flag name. E.g. notifications_v2, pdf_rendering_async, policy_simulator_ui.';

COMMENT ON COLUMN "control"."feature_flag"."tenant_overrides" IS 'JSON object mapping tenant UUID → boolean. Overrides is_enabled for specific tenants.';

COMMENT ON COLUMN "control"."feature_flag"."rollout_pct" IS 'Percentage of tenants for which the flag is enabled when no explicit override exists. Uses stable djb2 hash of (code + tenantId) % 100 for deterministic per-tenant rollout.';

CREATE TABLE "control"."field_group" (
  "group_key" text NOT NULL,
  "label" text NOT NULL,
  "description" text,
  "applies_to_classes" text[] DEFAULT '{}'::text[] NOT NULL,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "columns" smallint DEFAULT 3 NOT NULL,
  "page_span" text DEFAULT 'half'::text NOT NULL,
  "ui_intent" text
);

COMMENT ON TABLE "control"."field_group" IS 'ARCHETYPE=F;SCOPE=N. Logical UI sections grouping canonical fields. Used by field_group_member to assign canonical fields to display sections. Renamed from control.entity_field_group.';

CREATE TABLE "control"."field_group_member" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "group_key" text NOT NULL,
  "entity_field_id" uuid NOT NULL,
  "is_required" boolean DEFAULT false NOT NULL,
  "sort_order" smallint DEFAULT 0 NOT NULL
);

COMMENT ON TABLE "control"."field_group_member" IS 'ARCHETYPE=C;SCOPE=N;DEVIATION. No audit columns (no created_by/updated_at). Assigns canonical entity_field rows (entity_version_id IS NULL) to field_group sections. entity_field_id replaces field_name text FK from backup — cleaner uuid reference. Moved from association.field_group_member to control.*.';

CREATE TABLE "control"."field_security_policy" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "entity_id" uuid NOT NULL,
  "field_path" text NOT NULL,
  "policy_type" text NOT NULL,
  "role_list" text[] DEFAULT '{}'::text[],
  "abac_condition" jsonb,
  "mask_strategy" text DEFAULT 'null'::text NOT NULL,
  "mask_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "scope" text DEFAULT 'global'::text NOT NULL,
  "scope_ref" text,
  "priority" smallint DEFAULT 100 NOT NULL,
  "pii_classification" text,
  "privacy_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."field_security_policy" IS 'ARCHETYPE=C;SCOPE=T;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (not GENERATED). Field-level PII classification and masking policies. mask_strategy: null (return NULL), partial (last 4 chars), hash (SHA-256), encrypt (AES-256), tokenise (replace with token). priority: lower fires first when multiple policies match.';

CREATE TABLE "control"."finance_posting_rollout_policy" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "company_code_id" uuid,
  "rollout_mode" text DEFAULT 'observe'::text NOT NULL,
  "effective_from" date DEFAULT CURRENT_DATE NOT NULL,
  "reason" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."finance_posting_rollout_policy" IS 'Stage F rollout control. Company policy overrides tenant policy. Existing tenants default to observe; enforce blocks production posting without current four-domain finance certification.';

CREATE TABLE "control"."fiscal_calendar_config" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "calendar_type" text DEFAULT 'monthly'::text NOT NULL,
  "version_no" integer DEFAULT 1 NOT NULL,
  "fiscal_year_label_rule" text DEFAULT 'start_year'::text NOT NULL,
  "year_start_rule" text DEFAULT 'fixed_date'::text NOT NULL,
  "anchor_month" smallint DEFAULT 1 NOT NULL,
  "anchor_day" smallint DEFAULT 1 NOT NULL,
  "week_start_day" smallint DEFAULT 1 NOT NULL,
  "periods_per_year" smallint DEFAULT 12 NOT NULL,
  "leap_week_rule" text DEFAULT 'none'::text NOT NULL,
  "effective_from" date,
  "effective_to" date,
  "supersedes_id" uuid,
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

COMMENT ON TABLE "control"."fiscal_calendar_config" IS 'ARCHETYPE=C;SCOPE=T. Versioned reusable fiscal calendar header. Rules define monthly, week-based, 13-period, or irregular calendars.';

CREATE TABLE "control"."fiscal_calendar_period_rule" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "fiscal_calendar_config_id" uuid NOT NULL,
  "sequence_no" smallint NOT NULL,
  "period_number" smallint NOT NULL,
  "period_type" text DEFAULT 'normal'::text NOT NULL,
  "name_template" text DEFAULT 'Period {period}'::text NOT NULL,
  "duration_unit" text DEFAULT 'month'::text NOT NULL,
  "duration_value" smallint DEFAULT 1 NOT NULL,
  "anchor" text DEFAULT 'sequence'::text NOT NULL,
  "quarter_number" smallint,
  "absorbs_leap_week" boolean DEFAULT false NOT NULL,
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

COMMENT ON TABLE "control"."fiscal_calendar_period_rule" IS 'ARCHETYPE=C;SCOPE=T. Ordered period construction rules for one fiscal calendar version. Adjustment semantics come from period_type, not period number.';

CREATE TABLE "control"."forecast_budget_bridge" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "name" text NOT NULL,
  "fiscal_year" smallint NOT NULL,
  "budget_period_type" text DEFAULT 'annual'::text NOT NULL,
  "planning_driver_version_id" uuid,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "locked_at" timestamp with time zone,
  "locked_by" uuid,
  "approved_at" timestamp with time zone,
  "approved_by" uuid,
  "superseded_by_id" uuid,
  "superseded_at" timestamp with time zone,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."forecast_budget_bridge" IS 'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. H3 P2-hygiene: planning → budget baseline link. Connects a planning_driver_version snapshot to a named annual/quarterly/monthly budget. Lifecycle: draft → locked → approved; superseded_by_id chains history on revision. GL period-close gate reads status=approved before allowing entries.';

COMMENT ON COLUMN "control"."forecast_budget_bridge"."budget_period_type" IS 'Granularity of the budget: annual (one amount), quarterly (4 slices), monthly (12 slices). Slice amounts are stored in a companion amounts table (Phase 2 extension).';

COMMENT ON COLUMN "control"."forecast_budget_bridge"."planning_driver_version_id" IS 'FK → control.planning_driver_version (ON DELETE SET NULL). NULL when baseline is created standalone (no driver version yet pinned).';

CREATE TABLE "control"."forecast_line" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "scenario_id" uuid NOT NULL,
  "line_no" smallint NOT NULL,
  "gl_account_id" uuid,
  "commodity_category_id" uuid,
  "intent_id" uuid,
  "cost_center_id" uuid,
  "profit_center_id" uuid,
  "project_id" uuid,
  "budget_allocation_id" uuid,
  "dimension_set_id" uuid,
  "company_code_id" uuid,
  "fiscal_year" smallint NOT NULL,
  "period_from" smallint DEFAULT 1 NOT NULL,
  "period_to" smallint DEFAULT 12 NOT NULL,
  "currency_code" character(3) NOT NULL,
  "total_amount" numeric(18,4) DEFAULT 0 NOT NULL,
  "period_amounts" jsonb,
  "spread_method" text DEFAULT 'EVEN'::text NOT NULL,
  "driver_id" uuid,
  "planning_driver_assumption_id" uuid,
  "is_driver_calculated" boolean DEFAULT false NOT NULL,
  "prior_year_amount" numeric(18,4),
  "variance_amount" numeric(18,4) GENERATED ALWAYS AS ((total_amount - COALESCE(prior_year_amount, (0)::numeric))) STORED,
  "variance_pct" numeric(8,4),
  "confidence" numeric(3,2) DEFAULT 1.00 NOT NULL,
  "probability_weight" numeric(5,4) DEFAULT 1.0000 NOT NULL,
  "description" text,
  "justification" text,
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

COMMENT ON TABLE "control"."forecast_line" IS 'ARCHETYPE=B;SCOPE=T. Individual forecast line within a scenario. One line = one account + dimension combination for a period range. period_amounts JSONB for per-period breakdown. variance_amount = GENERATED (total - prior_year). Driver-linked lines (is_driver_calculated) are recalculated when assumptions change. budget_allocation_id narrows to a specific fund center.';

CREATE TABLE "control"."formula_expression" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "module_code" text DEFAULT 'PAYROLL'::text NOT NULL,
  "formula_kind" text DEFAULT 'payroll'::text NOT NULL,
  "description" text,
  "input_schema" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "output_schema" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "default_rounding" jsonb DEFAULT '{}'::jsonb NOT NULL,
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

COMMENT ON TABLE "control"."formula_expression" IS 'ARCHETYPE=B;SCOPE=T. Versioned formula header for payroll and People calculations. Policy rules remain for eligibility/routing; payroll math uses formula_expression_version.';

CREATE TABLE "control"."formula_expression_version" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "formula_expression_id" uuid NOT NULL,
  "version_no" integer NOT NULL,
  "expression_language" text DEFAULT 'jsonlogic'::text NOT NULL,
  "expression_body" jsonb NOT NULL,
  "input_defaults" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "output_mapping" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "rounding_config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "effective_from" date DEFAULT CURRENT_DATE NOT NULL,
  "effective_until" date,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_effective" boolean GENERATED ALWAYS AS ((status = 'effective'::text)) STORED,
  "published_at" timestamp with time zone,
  "published_by" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."formula_expression_version" IS 'ARCHETYPE=C;SCOPE=T. Immutable payroll formula version. Payroll result lines snapshot this version and evaluation trace.';

CREATE TABLE "control"."fx_policy" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "company_code_id" uuid,
  "ledger_book_id" uuid,
  "transaction_context" text DEFAULT 'general'::text NOT NULL,
  "effective_from" date DEFAULT CURRENT_DATE NOT NULL,
  "effective_to" date,
  "priority" smallint DEFAULT 100 NOT NULL,
  "default_rate_type" text DEFAULT 'SPOT'::text NOT NULL,
  "revaluation_rate_type" text DEFAULT 'PERIOD_END'::text NOT NULL,
  "pivot_currency_code" character(3),
  "allow_inverse" boolean DEFAULT true NOT NULL,
  "allow_triangulation" boolean DEFAULT false NOT NULL,
  "preferred_sources" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "maximum_rate_age_days" integer,
  "missing_rate_behavior" text DEFAULT 'block'::text NOT NULL,
  "manual_override_allowed" boolean DEFAULT false NOT NULL,
  "manual_override_approval_required" boolean DEFAULT false NOT NULL,
  "auto_reverse_revaluation" boolean DEFAULT true NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "version_no" integer DEFAULT 1 NOT NULL,
  "supersedes_id" uuid,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."fx_policy" IS 'ARCHETYPE=B;SCOPE=T. Effective-dated FX resolution policy. NULL Company and Book is Tenant scope; Company scope overrides Tenant; Company+Book overrides Company. Triangulation is disabled unless an explicit pivot is configured.';

COMMENT ON COLUMN "control"."fx_policy"."preferred_sources" IS 'Ordered array of source codes. This is routing policy, not provider credential storage.';

CREATE TABLE "control"."hook_action_registry" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid,
  "action_key" text NOT NULL,
  "label" text NOT NULL,
  "description" text,
  "handler_type" text DEFAULT 'built_in'::text NOT NULL,
  "handler_config" jsonb,
  "default_contract_role" text DEFAULT 'extension'::text NOT NULL,
  "default_safety_level" text DEFAULT 'replaceable'::text NOT NULL,
  "origin" text DEFAULT 'system'::text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."hook_action_registry" IS 'ARCHETYPE=C;SCOPE=G;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (not GENERATED). Registry of all hook actions the lifecycle engine can execute. Platform seeds system actions (origin=''system'', tenant_id=NULL). Tenants register custom actions (origin=''tenant''). control.lifecycle_transition_hook.action references action_key here. handler_type: built_in (platform code), emit_event (outbox), webhook (HTTP). L16: webhook handler_type added. L10: required safety_level added. P2-FIX: updated_at/updated_by added — actions are toggled (is_active) and config edited.';

COMMENT ON COLUMN "control"."hook_action_registry"."handler_type" IS '''built_in'' — handled by platform code identified by action_key. ''emit_event'' — inserts a row into event.outbox with the hook config as payload. ''webhook'' — makes an HTTP call to the URL in handler_config.url.';

CREATE TABLE "control"."intake_idempotency" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "entity_code" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "result_payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone DEFAULT (now() + '01:00:00'::interval) NOT NULL
);

COMMENT ON TABLE "control"."intake_idempotency" IS 'Composite intake submit fingerprints. Prevents duplicate records on network retries. Rows expire after 60 minutes and are pruned by the maintenance job.';

CREATE TABLE "control"."intent_profile_override" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "company_code_id" uuid,
  "intent_id" uuid NOT NULL,
  "direction" text,
  "flow_code" text,
  "override_profile_config_id" uuid NOT NULL,
  "reason" text NOT NULL,
  "regulatory_reference" text,
  "approved_by" uuid,
  "approved_at" timestamp with time zone,
  "effective_from" date DEFAULT CURRENT_DATE NOT NULL,
  "effective_to" date,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'pending_approval'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."intent_profile_override" IS 'ARCHETYPE=B;SCOPE=T. Engine 4.13: standing regulatory overrides (IFRS/ASC references). Governance-gated: status=active only after approved_by is set. Takes precedence over intent_to_accounting_profile_rule at runtime.';

CREATE TABLE "control"."intent_to_accounting_profile_rule" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "direction" text,
  "intent_id" uuid,
  "intent_domain" text,
  "flow_code" text,
  "company_code_id" uuid,
  "doc_type" text,
  "currency_code" text,
  "min_amount" numeric(18,4),
  "max_amount" numeric(18,4),
  "is_cross_border" boolean,
  "is_intercompany" boolean,
  "commodity_domain" text,
  "commitment_type" text,
  "counterparty_tier" text,
  "contract_value_min" numeric(18,4),
  "contract_value_max" numeric(18,4),
  "revenue_type" text,
  "resolved_profile_config_id" uuid NOT NULL,
  "explanation_template" text NOT NULL,
  "confidence" numeric(3,2) DEFAULT 1.00 NOT NULL,
  "priority" integer DEFAULT 50 NOT NULL,
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

COMMENT ON TABLE "control"."intent_to_accounting_profile_rule" IS 'ARCHETYPE=B;SCOPE=T. Engine 4.13: multi-predicate profile matching. NULL predicate = wildcard. First match by ascending priority wins. Effective-dated. resolved_profile_config_id → control.acct_profile_config (composite FK in 06_constraints).';

CREATE TABLE "control"."lifecycle" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "version_no" integer DEFAULT 1 NOT NULL,
  "definition_hash" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."lifecycle" IS 'ARCHETYPE=C;SCOPE=G;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (not GENERATED). State machine definition. Root record for a named lifecycle. tenant_id=NULL = platform-global (visible to all tenants). version_no incremented on child table changes. definition_hash NULLed to signal stale compiled snapshots. Replaces control.lifecycle (backup).';

COMMENT ON COLUMN "control"."lifecycle"."tenant_id" IS 'NULL = platform-global lifecycle. All tenants can bind entities to global lifecycles. Non-null = tenant-custom lifecycle. Unique per (tenant_id, code) NULLS NOT DISTINCT.';

COMMENT ON COLUMN "control"."lifecycle"."definition_hash" IS 'SHA-256 hex of the compiled lifecycle definition. Set by compile functions. NULLed by fn_lifecycle_child_changed trigger when any child row changes. NULL = definition is stale, snapshot.lifecycle_version needs recompile.';

COMMENT ON COLUMN "control"."lifecycle"."config" IS 'Extended metadata: {ui_color, icon_key, entity_types: [...], initial_state_code, allow_parallel_instances: bool}.';

CREATE TABLE "control"."lifecycle_hook_override" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "target_hook_id" uuid NOT NULL,
  "override_kind" text NOT NULL,
  "replacement_action" text,
  "replacement_config" jsonb,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "reason" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."lifecycle_hook_override" IS 'ARCHETYPE=C;SCOPE=T;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (not GENERATED). Tenant customisation of lifecycle hooks. suppress: disable a replaceable hook entirely. replace: swap the hook action with a different one. add_before/add_after: inject behaviour around the original hook. Hooks with safety_level=''required'' cannot be overridden — enforced by trg_lho_safety_guard trigger which checks the target hook''s safety_level. Replaces association.lifecycle_hook_override (backup). P2-FIX: updated_at/updated_by added — overrides are toggled and edited.';

CREATE TABLE "control"."lifecycle_state" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid,
  "lifecycle_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "is_initial" boolean DEFAULT false NOT NULL,
  "is_terminal" boolean DEFAULT false NOT NULL,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "state_flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."lifecycle_state" IS 'ARCHETYPE=C;SCOPE=G. States (nodes) within a lifecycle. is_initial=true: trigger enforces exactly one per lifecycle. is_terminal=true: guard_terminal_immutability() blocks field edits on entities in this state. config: {ui_color, icon_key, sla_minutes, require_reason_on_entry: bool}.';

COMMENT ON COLUMN "control"."lifecycle_state"."is_initial" IS 'Exactly one state per lifecycle must be initial. Enforced by trg_ls_single_initial trigger (UNIQUE filtered index alternative).';

COMMENT ON COLUMN "control"."lifecycle_state"."is_terminal" IS 'No outbound transitions permitted. control.guard_terminal_immutability() reads snapshot.status_route.terminal_states to block non-status field edits on entities in terminal states.';

CREATE TABLE "control"."lifecycle_timer_policy" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "rules" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."lifecycle_timer_policy" IS 'ARCHETYPE=C;SCOPE=G. Named escalation timer rule sets. Attached to lifecycle states via lifecycle_state.config.timer_policy_code. rules: array of {after_minutes, action, notify_roles, transition_to, message_template_key}. Replaces control.lifecycle_timer_policy (backup). L07: UNIQUE(tenant_id, code) added. L15: rules jsonb_typeof=array enforced.';

COMMENT ON COLUMN "control"."lifecycle_timer_policy"."rules" IS 'Array of timer rules. Each element: {after_minutes: integer (required),  action: escalate|notify|auto_transition|auto_cancel (required),  notify_roles: [''manager'',''owner''] (optional),  transition_to: ''state_code'' (required for auto_transition),  message_template_key: ''approval_overdue'' (optional)}.';

CREATE TABLE "control"."lifecycle_transition" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid,
  "lifecycle_id" uuid NOT NULL,
  "from_state_id" uuid NOT NULL,
  "to_state_id" uuid NOT NULL,
  "operation_code" text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."lifecycle_transition" IS 'ARCHETYPE=C;SCOPE=G;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (not GENERATED). Allowed state transitions (directed edges). No self-loops (from <> to). No duplicate edges per lifecycle. operation_code maps to control.auth_permission.canonical_code for authorization. L18: trg_lt_cross_lifecycle_guard ensures from/to states belong to this lifecycle_id. Replaces association.lifecycle_transition (backup). P2-FIX: updated_at/updated_by added — is_active and config are mutable.';

COMMENT ON COLUMN "control"."lifecycle_transition"."tenant_id" IS 'Inherited from parent lifecycle. NULL = platform-global lifecycle. P4-REVIEWED: No NULLS NOT DISTINCT needed on the transition unique key (lifecycle_id, from_state_id, to_state_id) — lifecycle_id already encodes tenant scope via control.lifecycle UNIQUE (tenant_id, code). Two transitions cannot share the same edge within the same lifecycle regardless of tenant_id.';

COMMENT ON COLUMN "control"."lifecycle_transition"."operation_code" IS 'The permission code required to fire this transition. E.g. ''approve'', ''submit'', ''reject'', ''cancel''. Validated against control.auth_permission.canonical_code at INSERT time.';

CREATE TABLE "control"."lifecycle_transition_execution" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "execution_token" text NOT NULL,
  "hook_action_key" text NOT NULL,
  "transition_id" uuid NOT NULL,
  "source_doc_type" text NOT NULL,
  "source_doc_id" uuid NOT NULL,
  "transition_event_seq" bigint DEFAULT 1 NOT NULL,
  "status" text DEFAULT 'completed'::text NOT NULL,
  "payload_hash" text,
  "error_message" text,
  "error_code" text,
  "principal_id" uuid,
  "executed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "duration_ms" integer,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);

COMMENT ON TABLE "control"."lifecycle_transition_execution" IS 'SCOPE=T. Idempotency carrier for lifecycle transition hooks. Each row records one hook handler run keyed by (execution_token, hook_action_key). Handlers enter under INSERT ... ON CONFLICT DO NOTHING RETURNING id — empty return means a prior firing already completed this hook for this transition × source-doc × event-seq, and the handler must no-op. Single new control-plane table (documented exception to the no-new-tables lock; see plan §2.5).';

COMMENT ON COLUMN "control"."lifecycle_transition_execution"."execution_token" IS 'sha256 hex of (transition_id || '':'' || source_doc_id || '':'' || transition_event_seq). Same transition fired twice for the same revision yields the same token.';

COMMENT ON COLUMN "control"."lifecycle_transition_execution"."hook_action_key" IS 'Hook action that ran. Examples: snapshot.capture, activity_log.write, transaction_flow.dispatch, ledger.materialize_gl_balance, ledger.commitment_consume, notification.publish, workflow.start.';

COMMENT ON COLUMN "control"."lifecycle_transition_execution"."transition_event_seq" IS 'Monotonic per (transition_id, source_doc_id). Bumped when the same transition genuinely fires again on the same source doc (e.g., reverse → re-approve cycle).';

CREATE TABLE "control"."lifecycle_transition_gate" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid,
  "transition_id" uuid NOT NULL,
  "required_operations" jsonb,
  "workflow_definition_id" uuid,
  "conditions" jsonb,
  "threshold_rules" jsonb,
  "resolves_via" text DEFAULT 'workflow'::text NOT NULL,
  "policy_rule_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."lifecycle_transition_gate" IS 'ARCHETYPE=C;SCOPE=G. Preconditions evaluated before a transition fires. One gate per transition (UNIQUE on transition_id) — all conditions combined in one row. R2b: resolves_via is the canonical resolution-path discriminator:   workflow (default) → gate blocks until workflow_definition reaches APPROVED terminal state (async).   policy → gate evaluates policy_rule synchronously; ALLOW fires, DENY blocks, WARN escalates. Both paths honour required_operations, conditions, and threshold_rules as additional guards. required_operations: [{code: ''review'', completed_by: ''any''}] workflow_definition_id: FK → control.workflow_definition; required when resolves_via=workflow. policy_rule_id: FK → control.policy_rule; required when resolves_via=policy. conditions: JSONLogic/CEL expression evaluated against entity payload. threshold_rules: [{field: ''amount'', op: ''>='', value: 10000}]. P2-FIX: updated_at/updated_by added — gate conditions are refined over time.';

CREATE TABLE "control"."lifecycle_transition_hook" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid,
  "transition_id" uuid NOT NULL,
  "timing" text DEFAULT 'after'::text NOT NULL,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "action" text NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "origin" text DEFAULT 'system'::text NOT NULL,
  "layer_rank" smallint DEFAULT 10 NOT NULL,
  "contract_role" text DEFAULT 'extension'::text NOT NULL,
  "safety_level" text DEFAULT 'replaceable'::text NOT NULL,
  "overlay_id" uuid,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."lifecycle_transition_hook" IS 'ARCHETYPE=C;SCOPE=G;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (not GENERATED). Side effects executed before or after a transition commits. timing: before (can veto by raising exception) | after (cannot veto). safety_level: required (cannot suppress) | narrowable | replaceable. contract_role: contract (platform promise) | extension (optional). Execution order: sort_order within origin layer, then layer_rank across origins. L10: required safety_level added. L13: timing simplified to before/after. Replaces association.lifecycle_transition_hook (backup). P2-FIX: updated_at/updated_by added — hooks are toggled and config edited.';

COMMENT ON COLUMN "control"."lifecycle_transition_hook"."timing" IS '''before'' — fires before transition commits. Can veto by RAISE EXCEPTION. ''after''  — fires after transition commits. Cannot veto (transition is done). Replaces ambiguous on_enter/on_exit/on_success/on_failure from backup (L13).';

COMMENT ON COLUMN "control"."lifecycle_transition_hook"."action" IS 'References control.hook_action_registry.action_key. Validated by trg_lth_action_registry_guard trigger on INSERT/UPDATE.';

COMMENT ON COLUMN "control"."lifecycle_transition_hook"."safety_level" IS '''required''    — cannot be suppressed or replaced by any override. ''narrowable''  — config can be restricted but hook cannot be disabled. ''replaceable'' — can be fully suppressed or replaced by lifecycle_hook_override. L10: ''required'' is new — not present in backup. Used for compliance-critical hooks.';

CREATE TABLE "control"."lookup_domain" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "source_schema" text NOT NULL,
  "is_extensible" boolean DEFAULT false NOT NULL,
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

COMMENT ON TABLE "control"."lookup_domain" IS 'ARCHETYPE=B;SCOPE=N. Registry of named lookup domains. Each domain groups lookup values under a unique code. is_extensible=true allows tenant extensions.';

CREATE TABLE "control"."lookup_value" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "domain_code" text NOT NULL,
  "description" text,
  "category" text,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "is_system" boolean DEFAULT true NOT NULL,
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

COMMENT ON TABLE "control"."lookup_value" IS 'ARCHETYPE=B;SCOPE=G. Lookup code+label pairs keyed by domain_code. Global rows: tenant_id IS NULL, is_system=true. Tenant extensions: tenant_id IS NOT NULL, is_system=false.';

CREATE TABLE "control"."match_tolerance_config" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid,
  "company_code_id" uuid,
  "entity_name" text DEFAULT 'purchase_invoice'::text NOT NULL,
  "match_type" text NOT NULL,
  "tolerance_type" text NOT NULL,
  "tolerance_value" numeric(10,4) NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid DEFAULT '00000000-0000-0000-0000-000000000000'::uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."match_tolerance_config" IS 'Per-company or tenant-wide AP matching tolerances. Resolution: company-specific > tenant-wide > global (tenant_id IS NULL). quantity_pct and price_pct are percentages (3.00 = 3%). amount_abs is absolute currency. match_type also carries PO-side tolerances: commitment_delivery (over/under) and commitment_price (catalog/supplier price variance).';

CREATE TABLE "control"."metadata_change_application_log" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "change_request_id" uuid NOT NULL,
  "entity_code" text NOT NULL,
  "applied_by" uuid NOT NULL,
  "applied_at" timestamp with time zone DEFAULT now() NOT NULL,
  "compiler_run_id" uuid,
  "entities_recompiled" text[],
  "duration_ms" integer,
  "result" text DEFAULT 'success'::text NOT NULL,
  "error_detail" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "control"."metadata_change_application_log" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. H4 P2-hygiene: append-only audit of EntityCompilerService.invalidate() runs. One row per application event triggered by an approved metadata_change_request. duration_ms + entities_recompiled enable performance monitoring of compiler runs. error_detail captures structured compiler errors for partial/failed outcomes. Immutable — no updated_at column or trigger.';

COMMENT ON COLUMN "control"."metadata_change_application_log"."compiler_run_id" IS 'Correlation ID passed into EntityCompilerService.invalidate(). Allows joining multiple log rows that were part of the same batch recompile.';

COMMENT ON COLUMN "control"."metadata_change_application_log"."entities_recompiled" IS 'All entity_codes whose descriptors were invalidated and recompiled in this run. May include more than the change_request.entity_code when cascading dependencies exist.';

CREATE TABLE "control"."metadata_change_request" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "entity_code" text NOT NULL,
  "change_type" text NOT NULL,
  "payload" jsonb NOT NULL,
  "status" text DEFAULT 'submitted'::text NOT NULL,
  "submitted_by" uuid NOT NULL,
  "reviewed_by" uuid,
  "reviewed_at" timestamp with time zone,
  "review_note" text,
  "applied_at" timestamp with time zone,
  "workflow_request_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."metadata_change_request" IS 'ARCHETYPE=B_LITE;SCOPE=T;PENDING_ACTIVE_SET. Metadata Studio change request log. Tracks field/entity definition changes that require approval before becoming effective. Lifecycle: submitted → pending_review → approved → applied | rejected. workflow_request_id populated in Phase 3.4 when WorkflowEngine is wired.';

COMMENT ON COLUMN "control"."metadata_change_request"."payload" IS 'Serialised ChangeRequestPayload. Structure: {entityCode, changeType, fieldName?, before?, after?, rationale?}. before/after hold the field definition snapshots for diffs in the review UI.';

COMMENT ON COLUMN "control"."metadata_change_request"."applied_at" IS 'Timestamp when EntityCompilerService.invalidate() was called and the change was promoted to status=applied. NULL until approval + application.';

COMMENT ON COLUMN "control"."metadata_change_request"."workflow_request_id" IS 'FK to document.workflow_request (no DB-level FK — cross-schema, nullable). Populated by MetadataApprovalBridge.submit() when WorkflowEngine is wired (Phase 3.4). NULL in Phase 2 (skeleton mode) — changes are approved directly.';

CREATE TABLE "control"."mfa_config" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "principal_id" uuid NOT NULL,
  "method_type" text NOT NULL,
  "is_enabled" boolean DEFAULT false NOT NULL,
  "is_verified" boolean DEFAULT false NOT NULL,
  "is_primary" boolean DEFAULT false NOT NULL,
  "enrolled_at" timestamp with time zone,
  "verified_at" timestamp with time zone,
  "last_used_at" timestamp with time zone,
  "contact_link_id" uuid,
  "authority" text DEFAULT 'keycloak'::text NOT NULL,
  "user_label" text,
  "keycloak_credential_id" text,
  "keycloak_synced_at" timestamp with time zone,
  "keycloak_sync_status" shared.idp_sync_status_d DEFAULT 'pending'::text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."mfa_config" IS 'ARCHETYPE=C;SCOPE=T. Metadata-only mirror of Keycloak MFA enrollment. Keycloak owns credentials and verification. One row per (tenant, principal, method_type). Replaces OTP instance tables.';

COMMENT ON COLUMN "control"."mfa_config"."authority" IS 'MFA authority for this mirror row. Phase 5 requires keycloak; credentials and verification remain in Keycloak.';

COMMENT ON COLUMN "control"."mfa_config"."metadata" IS 'Safe Keycloak mirror metadata only. Never store OTP secrets, recovery codes, WebAuthn public keys, counters or provider tokens.';

CREATE TABLE "control"."notification_provider" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "channel" text NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "adapter_key" text NOT NULL,
  "priority" smallint DEFAULT 1 NOT NULL,
  "is_enabled" boolean DEFAULT true NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "rate_limit" jsonb,
  "health" text DEFAULT 'healthy'::text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."notification_provider" IS 'ARCHETYPE=C;SCOPE=N. Channel provider registry. One row per adapter per channel. health updated by health-check worker. channel vocabulary: control.lookup_domain notification.channel.';

COMMENT ON COLUMN "control"."notification_provider"."adapter_key" IS 'Stable code identifying the adapter implementation (e.g. sendgrid_v3, twilio_sms).';

COMMENT ON COLUMN "control"."notification_provider"."config" IS 'Adapter configuration (API keys, endpoint URLs). Stored encrypted at rest.';

COMMENT ON COLUMN "control"."notification_provider"."rate_limit" IS 'Optional rate-limit policy: {per_minute: N, per_hour: N, burst: N}.';

CREATE TABLE "control"."notification_routing_rule" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "event_type" text NOT NULL,
  "entity_type" text,
  "lifecycle_state" text,
  "workflow_phase" text,
  "condition_expr" jsonb,
  "template_key" text NOT NULL,
  "channels" text[] NOT NULL,
  "priority" text DEFAULT 'normal'::text NOT NULL,
  "recipient_rules" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "sla_minutes" smallint,
  "dedup_window_ms" integer DEFAULT 300000 NOT NULL,
  "is_enabled" boolean DEFAULT true NOT NULL,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."notification_routing_rule" IS 'ARCHETYPE=C;SCOPE=G. Event-driven notification routing rules. tenant_id=NULL = platform global rule. channels[] references notification.channel lookup codes. priority validated via notification.priority lookup. R9: workflow_phase discriminator — NULL = any phase; in_workflow = approval-request / SLA-nearing notifications while WF is open; post_workflow = completion / rejection notifications after terminal WF state.';

COMMENT ON COLUMN "control"."notification_routing_rule"."recipient_rules" IS 'JSONB recipient resolution rules: {actor: true, ou_members: true, role: "approver", explicit_ids: [uuid,...]}.';

COMMENT ON COLUMN "control"."notification_routing_rule"."dedup_window_ms" IS 'Suppress duplicate messages for same (event_type, entity_id, recipient) within this window. Default 5 minutes (300000 ms).';

CREATE TABLE "control"."notification_template" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid,
  "template_key" text NOT NULL,
  "channel" text NOT NULL,
  "locale" text DEFAULT 'en'::text NOT NULL,
  "version" smallint DEFAULT 1 NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "subject" text,
  "body_text" text,
  "body_html" text,
  "body_json" jsonb,
  "variables_schema" jsonb,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."notification_template" IS 'ARCHETYPE=B_LITE;SCOPE=G;PENDING_ACTIVE_SET. Versioned message templates per (template_key, channel, locale). tenant_id=NULL = platform default. Tenant rows override platform defaults. channel validated via notification.channel lookup.';

COMMENT ON COLUMN "control"."notification_template"."template_key" IS 'Stable identifier shared across channel/locale variants (e.g. approval_requested, kpi_breach, invoice_due).';

COMMENT ON COLUMN "control"."notification_template"."body_json" IS 'Structured body for rich push/in-app notifications (action buttons, images).';

COMMENT ON COLUMN "control"."notification_template"."variables_schema" IS 'JSON Schema for template variable validation at dispatch time.';

CREATE TABLE "control"."outbox_routing_rule" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid,
  "event_type" text NOT NULL,
  "topic" text NOT NULL,
  "handler_id" uuid,
  "condition_expr" jsonb,
  "is_enabled" boolean DEFAULT true NOT NULL,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."outbox_routing_rule" IS 'ARCHETYPE=C;SCOPE=G. R5: business-event → outbox-topic dispatch map. Makes routing inspectable and tenant-overridable. One row per routing path; fan-out via multiple rows. tenant_id=NULL = platform-global. Tenant rows override for matching event_type+topic. handler_id references hook_action_registry(id) for emit_event handlers. Evaluated sort_order ASC — first enabled match per event_type+topic wins.';

CREATE TABLE "control"."overlay" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "overlay_key" text NOT NULL,
  "description" text,
  "base_entity_id" uuid NOT NULL,
  "base_version_id" uuid,
  "priority" integer DEFAULT 100 NOT NULL,
  "conflict_mode" text DEFAULT 'fail'::text NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."overlay" IS 'ARCHETYPE=C;SCOPE=T;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (not GENERATED). Tenant customisation sets applied on top of base entity versions. overlay_change rows define the individual operations. conflict_mode: fail (error on conflict), overwrite (last wins), merge (deep merge). Used by snapshot.entity_compiled_overlay for pre-compiled overlay deltas.';

CREATE TABLE "control"."overlay_change" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "overlay_id" uuid NOT NULL,
  "change_order" integer NOT NULL,
  "kind" text NOT NULL,
  "path" text NOT NULL,
  "value" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "control"."overlay_change" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. Individual operations within an overlay, applied in change_order sequence. Moved from association.overlay_change to control.*. UNIQUE(overlay_id, change_order) — deterministic application order. kind: addField|removeField|modifyField|tweakPolicy|overrideValidation|overrideUi|addIndex|removeIndex|tweakRelation.';

CREATE TABLE "control"."parameter_definition" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "code" text NOT NULL,
  "namespace" text NOT NULL,
  "display_name" text NOT NULL,
  "description" text,
  "owner_model" text DEFAULT 'product'::text NOT NULL,
  "control_level" text DEFAULT 'system_controlled'::text NOT NULL,
  "tenant_visibility" text DEFAULT 'readonly'::text NOT NULL,
  "data_type" text NOT NULL,
  "unit" text,
  "default_value" jsonb NOT NULL,
  "product_value" jsonb,
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

COMMENT ON TABLE "control"."parameter_definition" IS 'ARCHETYPE=B;SCOPE=N. Product-owned runtime parameter catalog. Tenants can view active non-hidden rows and override rows with tenant_visibility=configurable.';

COMMENT ON COLUMN "control"."parameter_definition"."control_level" IS 'system_controlled = product-owned read-only; tenant_configurable = product-owned with tenant override; tenant_owned = future tenant-authored parameter class.';

COMMENT ON COLUMN "control"."parameter_definition"."runtime_reload" IS 'How a changed value takes effect: immediate, next_request, next_login, restart, or external_provider.';

CREATE TABLE "control"."payment_method_company_policy" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "company_code_id" uuid NOT NULL,
  "payment_method_id" uuid NOT NULL,
  "direction" text DEFAULT 'OUTBOUND'::text NOT NULL,
  "currency_code" character(3),
  "bank_account_link_id" uuid,
  "min_amount" numeric(18,4),
  "max_amount" numeric(18,4),
  "is_default" boolean DEFAULT false NOT NULL,
  "is_manual_allowed" boolean DEFAULT true NOT NULL,
  "is_file_allowed" boolean DEFAULT true NOT NULL,
  "is_api_allowed" boolean DEFAULT false NOT NULL,
  "requires_dual_approval" boolean DEFAULT false NOT NULL,
  "cutoff_time_local" time without time zone,
  "timezone_code" text,
  "priority" smallint DEFAULT 0 NOT NULL,
  "effective_from" date DEFAULT CURRENT_DATE NOT NULL,
  "effective_until" date,
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

COMMENT ON TABLE "control"."payment_method_company_policy" IS 'ARCHETYPE=B;SCOPE=T. Runtime eligibility and defaulting per company + method + direction. Answers: is this method allowed? For which currency/amount range? Which house bank? File or manual? Cutoff time?';

COMMENT ON COLUMN "control"."payment_method_company_policy"."bank_account_link_id" IS 'Preferred/forced house-bank link for this policy. FK to master.bank_account_link. When set, must belong to the same company_code_id (validated by trigger).';

CREATE TABLE "control"."payment_method_interface_binding" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "company_code_id" uuid,
  "payment_method_id" uuid NOT NULL,
  "bank_account_link_id" uuid,
  "currency_code" character(3),
  "direction" text DEFAULT 'OUTBOUND'::text NOT NULL,
  "counterparty_country_code" character(2),
  "payment_network" text,
  "bank_interface_profile_id" uuid NOT NULL,
  "priority" smallint DEFAULT 0 NOT NULL,
  "effective_from" date DEFAULT CURRENT_DATE NOT NULL,
  "effective_until" date,
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

COMMENT ON TABLE "control"."payment_method_interface_binding" IS 'ARCHETYPE=B;SCOPE=T. Bridges payment method to bank_interface_profile. Routes the same method to different interfaces by company, bank, currency, direction, counterparty country, and payment network. Priority-based resolution.';

CREATE TABLE "control"."payment_settlement_rule" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "company_code_id" uuid NOT NULL,
  "payment_method_id" uuid NOT NULL,
  "direction" text DEFAULT 'OUTBOUND'::text NOT NULL,
  "book_code" text DEFAULT 'statutory'::text NOT NULL,
  "clearing_posting_role_code" text NOT NULL,
  "settlement_posting_role_code" text NOT NULL,
  "bank_fee_posting_role_code" text,
  "discount_posting_role_code" text,
  "fx_gain_posting_role_code" text,
  "fx_loss_posting_role_code" text,
  "chargeback_posting_role_code" text,
  "suspense_posting_role_code" text,
  "effective_from" date DEFAULT CURRENT_DATE NOT NULL,
  "effective_until" date,
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

COMMENT ON TABLE "control"."payment_settlement_rule" IS 'ARCHETYPE=B;SCOPE=T. Posting-role-based settlement accounting for payment execution. Outputs role codes, NOT GL accounts — the existing accounting engine (resolve_posting_role_account) handles role → GL resolution per company/book.';

CREATE TABLE "control"."planning_driver" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "planning_model_id" uuid NOT NULL,
  "description" text,
  "driver_type" text DEFAULT 'QUANTITY'::text NOT NULL,
  "driver_category" text,
  "data_type" text DEFAULT 'NUMERIC'::text NOT NULL,
  "uom_code" text,
  "aggregation_method" text DEFAULT 'SUM'::text NOT NULL,
  "time_allocation" text DEFAULT 'PERIOD_END'::text NOT NULL,
  "is_input" boolean DEFAULT true NOT NULL,
  "is_derived" boolean DEFAULT false NOT NULL,
  "default_value" numeric(18,4),
  "min_value" numeric(18,4),
  "max_value" numeric(18,4),
  "depends_on_drivers" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "version" integer DEFAULT 1 NOT NULL,
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

COMMENT ON TABLE "control"."planning_driver" IS 'ARCHETYPE=B;SCOPE=T. Named business metric feeding planning model calculations: headcount, cost/unit, inflation, occupancy, etc. Input drivers are user-entered; derived drivers are formula-calculated (see control.planning_driver_formula). depends_on_drivers[] tracks topological ordering for recalculation. NOTE: uuid[] FK integrity is enforced at the service layer, not the DB.';

CREATE TABLE "control"."planning_driver_assumption" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "driver_id" uuid NOT NULL,
  "scenario_id" uuid,
  "assumption_name" text NOT NULL,
  "fiscal_year" smallint NOT NULL,
  "period_from" smallint DEFAULT 1 NOT NULL,
  "period_to" smallint DEFAULT 12 NOT NULL,
  "assumption_value" numeric(18,4) NOT NULL,
  "period_values" jsonb,
  "company_code_id" uuid,
  "cost_center_id" uuid,
  "project_id" uuid,
  "growth_rate" numeric(8,4),
  "growth_method" text,
  "confidence" numeric(3,2) DEFAULT 1.00 NOT NULL,
  "source" text DEFAULT 'MANUAL'::text NOT NULL,
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

COMMENT ON TABLE "control"."planning_driver_assumption" IS 'ARCHETYPE=B;SCOPE=T. Concrete value assumptions for input planning drivers. E.g. headcount = 150, inflation = 3.5%. scenario_id links to document.forecast_scenario for what-if modelling (NULL = global/default). Dimensional scope narrows applicability.';

CREATE TABLE "control"."planning_driver_formula" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "driver_id" uuid NOT NULL,
  "formula_type" text DEFAULT 'EXPRESSION'::text NOT NULL,
  "expression" text,
  "formula_json" jsonb,
  "input_driver_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
  "rounding_mode" text DEFAULT 'HALF_UP'::text NOT NULL,
  "decimal_places" smallint DEFAULT 2 NOT NULL,
  "condition_expression" text,
  "fallback_value" numeric(18,4),
  "version" integer DEFAULT 1 NOT NULL,
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

COMMENT ON TABLE "control"."planning_driver_formula" IS 'ARCHETYPE=B;SCOPE=T. Calculation formula for derived planning drivers. EXPRESSION = arithmetic string referencing driver codes. LOOKUP_TABLE = interpolation via formula_json. CONDITIONAL = expression with condition guard. Versioned (driver_id, version) + effective-dated.';

CREATE TABLE "control"."planning_driver_version" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "driver_id" uuid NOT NULL,
  "version_number" integer NOT NULL,
  "version_label" text,
  "assumptions_snapshot" jsonb NOT NULL,
  "computed_output" jsonb,
  "snapshot_reason" text DEFAULT 'MANUAL'::text NOT NULL,
  "triggered_by" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL
);

COMMENT ON TABLE "control"."planning_driver_version" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=SNAPSHOT. IMMUTABLE (insert-only) point-in-time snapshot of driver assumptions. Used for audit trail, comparison, and rollback during planning cycles. log.trg_prevent_mutation() should be applied to enforce immutability.';

CREATE TABLE "control"."policy_definition" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid,
  "module_id" uuid,
  "entity_type" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "priority" smallint DEFAULT 100 NOT NULL,
  "evaluation_mode" text DEFAULT 'first_match'::text NOT NULL,
  "effective_from" date DEFAULT CURRENT_DATE NOT NULL,
  "effective_until" date,
  "version_no" integer DEFAULT 1 NOT NULL,
  "status" text DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."policy_definition" IS 'ARCHETYPE=B_LITE;SCOPE=G. Policy & Rules Engine: top-level policy container. tenant_id=NULL = platform-global. evaluation_mode: first_match (stop at first hit) | accumulate (merge all) | all (collect all outcomes). version_no bumped on every update so consumers can detect stale cached copies.';

COMMENT ON COLUMN "control"."policy_definition"."module_id" IS 'FK → shared.module. Scopes the policy to a module (finance, procurement, …). NULL = cross-module / universal policy. Logged in log.policy_evaluation_log.module_id.';

COMMENT ON COLUMN "control"."policy_definition"."priority" IS 'Evaluation order across definitions for the same entity_type. Lower value = evaluated first. Used when multiple definitions match.';

CREATE TABLE "control"."policy_rule" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "policy_id" uuid NOT NULL,
  "priority" smallint DEFAULT 10 NOT NULL,
  "conditions" jsonb,
  "action" text NOT NULL,
  "score" numeric(5,4),
  "confidence" numeric(5,4),
  "explanation" text,
  "approvers" jsonb,
  "sla_hours" smallint,
  "budget_check_config_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."policy_rule" IS 'ARCHETYPE=C;SCOPE=N. Individual rule within a policy_definition. conditions: JSONLogic expression evaluated against entity payload (null = always matches). action: allow | deny | warn | require_workflow | escalate. score/confidence are 0.0–1.0 fractions. approvers/sla_hours used when action=require_workflow to override workflow template defaults.';

COMMENT ON COLUMN "control"."policy_rule"."conditions" IS 'JSONLogic expression. Evaluated with the full entity payload as data context. null = unconditional match (use with low priority as a catch-all).';

COMMENT ON COLUMN "control"."policy_rule"."approvers" IS 'Approver override list for require_workflow action. Format: [{type: principal|role|team, value: uuid|code}]. Passed as overrideApprovers to WorkflowEngine.createRequest().';

CREATE TABLE "control"."policy_rule_version" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "policy_rule_id" uuid NOT NULL,
  "policy_id" uuid NOT NULL,
  "version_no" integer NOT NULL,
  "rule_snapshot" jsonb NOT NULL,
  "effective_from" timestamp with time zone DEFAULT now() NOT NULL,
  "effective_until" timestamp with time zone,
  "published_by" uuid,
  "published_at" timestamp with time zone DEFAULT now() NOT NULL
);

COMMENT ON TABLE "control"."policy_rule_version" IS 'ARCHETYPE=D;SCOPE=T;SUBTYPE=APPEND_ONLY. Append-only audit trail for policy rule changes. A new row is inserted BEFORE each UPDATE to control.policy_rule via trg_version_policy_rule. rule_snapshot captures the full row state that was REPLACED by the update (i.e. the previous version). effective_until is set on the previous version when a new edit comes in.';

COMMENT ON COLUMN "control"."policy_rule_version"."rule_snapshot" IS 'Full JSONB snapshot of the control.policy_rule row as it existed before the superseding update. Enables diff views between versions.';

COMMENT ON COLUMN "control"."policy_rule_version"."effective_until" IS 'Timestamp when this version was superseded. NULL = this is the current version. Set by the trigger on the PREVIOUS version row when a new edit is applied.';

CREATE TABLE "control"."policy_test_case" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "policy_definition_id" uuid NOT NULL,
  "test_name" character varying(150) NOT NULL,
  "description" text,
  "input_payload" jsonb NOT NULL,
  "expected_outcome" jsonb NOT NULL,
  "last_run_at" timestamp with time zone,
  "last_run_passed" boolean,
  "last_run_result" jsonb,
  "last_run_ms" integer,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."policy_test_case" IS 'ARCHETYPE=C;SCOPE=T;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (no status/is_active GENERATED). Persisted simulation test cases for a policy definition. Used by the simulation harness (POST /api/policy/definitions/:id/test) to run batch assertions and surface pass/fail results. last_run_* columns are updated on each execution, enabling a "last run" status badge in the UI.';

COMMENT ON COLUMN "control"."policy_test_case"."input_payload" IS 'The entity data context to feed into the policy engine. Shape must match the entity_type targeted by the parent policy_definition.';

COMMENT ON COLUMN "control"."policy_test_case"."expected_outcome" IS 'Expected evaluation result. Compared against actual outcome during test runs. Minimum shape: { "action": "approve" | "reject" | "review" | ... }. May also include score_min/score_max bounds for scoring policies.';

CREATE TABLE "control"."polymorphic_child_binding" (
  "binding_code" text NOT NULL,
  "parent_entity_code" text NOT NULL,
  "child_entity_code" text NOT NULL,
  "binding_kind" text NOT NULL,
  "fk_field" text,
  "source_doc_type_value" text,
  "source_doc_id_field" text,
  "source_line_id_field" text,
  "description" text,
  "status" text DEFAULT 'active'::text NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."polymorphic_child_binding" IS 'ARCHETYPE=B;SCOPE=N. Document-runtime child binding registry. Authoritative source for "is <child> a child of <parent>?". The generic /api/document-runtime/binding/<code>/records/<parent_id> route resolves a binding here and forwards with the computed filter. Cleanup-plan v5 §4.5.';

COMMENT ON COLUMN "control"."polymorphic_child_binding"."binding_code" IS 'Stable descriptor reference (e.g. "purchase_invoice__pricing_component"). Surfaces in control.entity_surface.config reference this code; renaming is a breaking change.';

COMMENT ON COLUMN "control"."polymorphic_child_binding"."binding_kind" IS '''fk'': child rows reference parent via fk_field. ''polymorphic'': child rows are keyed by source_doc_type + source_doc_id (common pattern for accounting_distribution, pricing_component).';

CREATE TABLE "control"."posting_role_account_map" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "company_code_id" uuid NOT NULL,
  "ledger_book_id" uuid NOT NULL,
  "posting_role_code" text NOT NULL,
  "gl_account_id" uuid NOT NULL,
  "effective_from" date DEFAULT CURRENT_DATE NOT NULL,
  "effective_to" date,
  "priority" smallint DEFAULT 100 NOT NULL,
  "version_no" integer DEFAULT 1 NOT NULL,
  "supersedes_id" uuid,
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

COMMENT ON TABLE "control"."posting_role_account_map" IS 'ARCHETYPE=B;SCOPE=T. Effective-dated posting-role to GL-account assignment per company and ledger book. Higher priority wins; equal-priority active ranges may not overlap.';

CREATE TABLE "control"."posting_role_alias" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid,
  "alias_code" text NOT NULL,
  "canonical_role_code" text NOT NULL,
  "source_domain_code" text,
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

COMMENT ON TABLE "control"."posting_role_alias" IS 'ARCHETYPE=B;SCOPE=G. Compatibility aliases from legacy or tenant role codes to finance.posting_role codes.';

CREATE TABLE "control"."rate_table" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "rate_table_kind" text DEFAULT 'statutory'::text NOT NULL,
  "country_code" character(2),
  "currency_code" character(3),
  "description" text,
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

COMMENT ON TABLE "control"."rate_table" IS 'ARCHETYPE=B;SCOPE=T. Versioned rate table header for statutory bands, allowances, contribution rates, and payroll constants.';

CREATE TABLE "control"."rate_table_row" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "rate_table_id" uuid NOT NULL,
  "row_key" text,
  "effective_from" date DEFAULT CURRENT_DATE NOT NULL,
  "effective_until" date,
  "sequence_no" integer DEFAULT 1 NOT NULL,
  "range_from" numeric(18,4),
  "range_until" numeric(18,4),
  "key_values" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "rate_value" numeric(18,8),
  "amount_value" numeric(18,4),
  "cap_amount" numeric(18,4),
  "floor_amount" numeric(18,4),
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."rate_table_row" IS 'ARCHETYPE=C;SCOPE=T. Effective-dated rate/band rows used by formula versions.';

CREATE TABLE "control"."record_edit_lock" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "aggregate_entity_name" text NOT NULL,
  "aggregate_record_id" text NOT NULL,
  "locked_by" uuid NOT NULL,
  "lock_token" text NOT NULL,
  "session_id" text,
  "acquired_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "last_heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
  "lock_reason" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);

COMMENT ON TABLE "control"."record_edit_lock" IS 'SCOPE=T. Pessimistic document edit lock — one active lock per aggregate root. Acquired on Edit (POST /api/records/:entity/:id/lock), renewed every 30 s by heartbeat, released on Save or Cancel. Stale locks are evicted by jobs-stale-lock sweep. RLS: tenant_read + tenant_write/update/delete; admin full access via athyperadmin.';

COMMENT ON COLUMN "control"."record_edit_lock"."lock_token" IS 'Opaque random UUID issued to the client on acquire. Must be presented on save, heartbeat, and release calls. Prevents one principal from stealing another session''s lock.';

COMMENT ON COLUMN "control"."record_edit_lock"."session_id" IS 'Optional browser tab/session identifier stored for admin diagnostics. Not used for access control — the lock_token is the authoritative credential.';

COMMENT ON COLUMN "control"."record_edit_lock"."expires_at" IS 'Wall-clock expiry derived from now() + interval at acquire/renew time. Always set by the DB (not app server) to avoid clock drift across API pods.';

CREATE TABLE "control"."rounding_rule" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "method" text DEFAULT 'ROUND_HALF_UP'::text NOT NULL,
  "precision_digits" smallint,
  "minimum_unit" numeric(18,6),
  "gl_variance_approval_required" boolean DEFAULT false NOT NULL,
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

COMMENT ON TABLE "control"."rounding_rule" IS 'ARCHETYPE=B;SCOPE=T. Rounding configuration per tenant. precision_digits NULL = runtime reads shared.currency.minor_units. Explicit value overrides currency default. minimum_unit for coinage gaps (CHF 0.05). gl_variance_approval_required: regulated environments (IFRS statutory audit) may require explicit GL sign-off when rounding generates a variance journal entry; blocks period-close gate until approved by a finance controller.';

CREATE TABLE "control"."setup_domain" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "setup_workspace_id" uuid NOT NULL,
  "owner_module_id" uuid NOT NULL,
  "code" text NOT NULL,
  "route_segment" text NOT NULL,
  "label" text NOT NULL,
  "description" text,
  "icon_key" text,
  "sort_order" smallint DEFAULT 0 NOT NULL,
  "contributing_module_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "required_module_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "required_permissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "supported_scope_types" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'ACTIVE'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'ACTIVE'::text)) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."setup_domain" IS 'ARCHETYPE=A;SCOPE=N. Setup domain registry. The owning module is relational; contributors, requirements, scopes, and nested sections are contract-validated JSONB.';

COMMENT ON COLUMN "control"."setup_domain"."sections" IS 'Ordered SetupSectionContract array. Sections have no independent lifecycle and therefore remain embedded in their domain.';

CREATE TABLE "control"."setup_workspace" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "workspace_id" uuid NOT NULL,
  "code" text NOT NULL,
  "route_slug" text NOT NULL,
  "label" text NOT NULL,
  "description" text,
  "schema_version" text DEFAULT '1.0'::text NOT NULL,
  "scope_policies" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "capabilities" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "config" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'ACTIVE'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'ACTIVE'::text)) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."setup_workspace" IS 'ARCHETYPE=A;SCOPE=N. Workspace-level setup surface registry. JSONB scope policies and capabilities are validated by the SetupWorkspaceContract application schema.';

COMMENT ON COLUMN "control"."setup_workspace"."scope_policies" IS 'Ordered SetupScopePolicyContract array. Friendly route segments resolve to canonical internal scope types such as company_code.';

CREATE TABLE "control"."supplier_posting_override" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "supplier_profile_id" uuid NOT NULL,
  "posting_role_code" text NOT NULL,
  "gl_account_id" uuid NOT NULL,
  "book_code" text DEFAULT 'PRIMARY'::text NOT NULL,
  "effective_from" date DEFAULT CURRENT_DATE NOT NULL,
  "effective_to" date,
  "reason" text,
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

COMMENT ON TABLE "control"."supplier_posting_override" IS 'ARCHETYPE=B;SCOPE=T. Exceptional AP posting-role GL overrides for a supplier-company profile. Use only for non-standard AP account assignment; commodity intent/default policy lives in commodity_category_buy_policy.';

CREATE TABLE "control"."tax_group" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "is_compound" boolean DEFAULT false NOT NULL,
  "jurisdiction_id" uuid,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" shared.active_inactive_d DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS (((status)::text = 'active'::text)) STORED,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid,
  "rounding_rule_id" uuid
);

COMMENT ON TABLE "control"."tax_group" IS 'ARCHETYPE=B;SCOPE=T. Named collection of tax rate schedules applied as a unit to documents. is_compound=true: components apply sequentially (each base = previous subtotal). jurisdiction_id scopes the bundle (e.g. TG-IN-TN-GST-18-IN → TJ-IN-TN). PC-facing handle: pricing_component.tax_group_id and tax_resolution_rule.resolved_tax_group_id point here.';

COMMENT ON COLUMN "control"."tax_group"."rounding_rule_id" IS 'Tax rounding policy selected by the Tax Group aggregate. NULL is not a runtime fallback; readiness reports unresolved rounding.';

CREATE TABLE "control"."tax_group_component" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "tax_group_id" uuid NOT NULL,
  "tax_rate_schedule_id" uuid NOT NULL,
  "calculation_seq" smallint NOT NULL,
  "rate_override" numeric(18,6),
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" shared.active_inactive_d DEFAULT 'active'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS (((status)::text = 'active'::text)) STORED,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid,
  "tax_group_version_id" uuid
);

COMMENT ON TABLE "control"."tax_group_component" IS 'ARCHETYPE=B_LITE;SCOPE=T. Bridge: tax_group → tax_rate_schedule. calculation_seq orders evaluation. rate_override allows group-level rate substitution without touching the global schedule. FK to tax_rate_schedule uses tenant-composite for cross-tenant isolation.';

COMMENT ON COLUMN "control"."tax_group_component"."tax_group_version_id" IS 'Owning aggregate version. NULL identifies legacy components used only when no effective Tax Group Version exists.';

CREATE TABLE "control"."tax_group_version" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "tax_group_id" uuid NOT NULL,
  "version_no" integer NOT NULL,
  "effective_from" date DEFAULT CURRENT_DATE NOT NULL,
  "effective_to" date,
  "is_compound" boolean DEFAULT false NOT NULL,
  "rounding_rule_id" uuid NOT NULL,
  "description" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" text DEFAULT 'draft'::text NOT NULL,
  "is_active" boolean GENERATED ALWAYS AS ((status = 'active'::text)) STORED,
  "supersedes_id" uuid,
  "status_changed_at" timestamp with time zone,
  "status_changed_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."tax_group_version" IS 'ARCHETYPE=B;SCOPE=T. Effective Tax Group contract version. Stable tax_group IDs remain referenced by documents and resolution rules; runtime selects exactly one effective active version and its ordered components.';

CREATE TABLE "control"."tax_rate_schedule" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "jurisdiction_id" uuid NOT NULL,
  "tax_type_id" uuid NOT NULL,
  "tax_direction" text NOT NULL,
  "component_code" text,
  "rate_kind" text DEFAULT 'PERCENT'::text NOT NULL,
  "rate_value" numeric(18,6) NOT NULL,
  "rate_currency" character(3),
  "recoverability_mode" text DEFAULT 'NONE'::text NOT NULL,
  "recoverability_percent" numeric(5,2),
  "reverse_charge_mode" text DEFAULT 'NONE'::text NOT NULL,
  "calculation_basis" text DEFAULT 'LINE_NET'::text NOT NULL,
  "wht_basis" text,
  "description" text,
  "effective_from" date NOT NULL,
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

COMMENT ON TABLE "control"."tax_rate_schedule" IS 'ARCHETYPE=B;SCOPE=T. Atomic tax rate. Identity: (jurisdiction + tax_type + direction + component + effective dates). Scope-based resolution lives in control.tax_resolution_rule. tax_code eliminated. trs_tenant_id_uq enables tenant-composite FK from tax_group_component and tax_calculation. Temporal EXCLUDE prevents overlapping active rates with same natural identity.';

CREATE TABLE "control"."tax_resolution_rule" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "resolved_tax_group_id" uuid NOT NULL,
  "scope_billto_jurisdiction_id" uuid,
  "scope_shipto_jurisdiction_id" uuid,
  "scope_billfrom_jurisdiction_id" uuid,
  "scope_shipfrom_jurisdiction_id" uuid,
  "scope_counterparty_tax_status" text,
  "scope_commodity_category_id" uuid,
  "scope_supplier_industry_code" text,
  "scope_doc_entity_codes" text[],
  "requires_shipto_shipfrom_match" boolean DEFAULT false NOT NULL,
  "requires_shipto_shipfrom_mismatch" boolean DEFAULT false NOT NULL,
  "priority" smallint DEFAULT 100 NOT NULL,
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

COMMENT ON TABLE "control"."tax_resolution_rule" IS 'ARCHETYPE=B;SCOPE=T. Phase 3c tax-group resolver matrix. 4 jurisdictional scope axes: billto/shipto (BUYER context), billfrom/shipfrom (SELLER context). Bill-side derives from owner tax registration (legal); ship-side from address jurisdiction (geographic). scope_doc_entity_codes (text[]) lets a single rule cover multiple entities. shipto/shipfrom match/mismatch predicates drive intra-state vs inter-state GST routing. NULL scope = wildcard. Resolver picks highest priority active rule.';

CREATE TABLE "control"."transaction_event_catalog" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "code" text NOT NULL,
  "label" text NOT NULL,
  "description" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."transaction_event_catalog" IS 'ARCHETYPE=C;SCOPE=N;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (not GENERATED). R1: canonical registry of transaction lifecycle event codes. Platform-global (no tenant_id). transaction_flow_template.event_code and acct_profile_event.event_code reference this table via FK (03_constraints.sql §TEC-REF). is_active=false deprecates a code without violating child-table FKs.';

CREATE TABLE "control"."transaction_flow_template" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid,
  "flow_code" text NOT NULL,
  "direction" text NOT NULL,
  "event_code" text NOT NULL,
  "event_name" text NOT NULL,
  "event_seq" smallint NOT NULL,
  "is_mandatory" boolean DEFAULT true NOT NULL,
  "creates_je" boolean DEFAULT true NOT NULL,
  "reverses_prior" text,
  "commitment_action" text DEFAULT 'NONE'::text NOT NULL,
  "description" text,
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

COMMENT ON TABLE "control"."transaction_flow_template" IS 'ARCHETYPE=B;SCOPE=G. Engine 4.13: canonical lifecycle events per transaction flow. System-seeded (tenant_id IS NULL), tenant-overridable (tenant_id = UUID). 15 flows, 38 event codes. Uniqueness enforced by tft_flow_event_uq partial index.';

CREATE TABLE "control"."wht_threshold_config" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "jurisdiction_id" uuid NOT NULL,
  "tax_type_id" uuid NOT NULL,
  "section_code" text,
  "threshold_amount" numeric(18,4) NOT NULL,
  "threshold_currency" character(3) NOT NULL,
  "reset_period" text DEFAULT 'fiscal_year'::text NOT NULL,
  "per_transaction" boolean DEFAULT false NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "effective_from" date DEFAULT CURRENT_DATE NOT NULL,
  "effective_to" date,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."wht_threshold_config" IS 'ARCHETYPE=C;SCOPE=T;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (no status column). R7-A: per-supplier WHT activation thresholds (India TDS, Philippines EWT, etc.). per_transaction=false: WHT only activates after supplier YTD payments exceed threshold_amount in reset_period — accumulation tracked in aggregate.wht_supplier_accumulator. per_transaction=true: WHT applies per-payment regardless of prior payments.';

CREATE TABLE "control"."workflow_definition" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "entity_type" text NOT NULL,
  "rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "effective_from" timestamp with time zone DEFAULT now() NOT NULL,
  "effective_to" timestamp with time zone,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."workflow_definition" IS 'ARCHETYPE=C;SCOPE=T;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (not GENERATED). Policy: when is a workflow required for an entity? rules jsonb array: [{condition: jsonlogic, template_code, workflow_type}]. First match wins. NULL condition = always applies. Referenced by control.lifecycle_transition_gate.workflow_definition_id; when a gate has this FK set, the engine starts a workflow_definition-governed approval and blocks the transition until the request reaches an APPROVED terminal state. Replaces control.approval_definition (backup).';

COMMENT ON COLUMN "control"."workflow_definition"."rules" IS 'Array of policy rules. Each: {condition: {jsonlogic expression against entity payload — null=always},  template_code: workflow_template.code,  workflow_type: lookup work_request.workflow_type,  priority: integer — lower fires first}.';

CREATE TABLE "control"."workflow_sla_policy" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "timers" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "escalation_chain" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."workflow_sla_policy" IS 'ARCHETYPE=C;SCOPE=G. SLA timer and escalation chain for workflow stages. tenant_id=NULL = platform-global control. timers: [{after_minutes, action: reminder|escalate|auto_approve|auto_reject, notify_roles, message_template_key}]. escalation_chain: ordered escalation targets when action=escalate. Replaces control.approval_sla_policy (backup). A05: UNIQUE(tenant_id, code).';

COMMENT ON COLUMN "control"."workflow_sla_policy"."timers" IS 'Ordered timer rules. Each: {after_minutes: integer (from work_item.assigned_at or stage.started_at),  action: reminder|escalate|auto_approve|auto_reject,  notify_roles: [role_code,...],  message_template_key: notification.template key}.';

CREATE TABLE "control"."workflow_template" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "behaviors" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "sla_policy_id" uuid,
  "version_no" integer DEFAULT 1 NOT NULL,
  "compiled_json" jsonb,
  "compiled_hash" text,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."workflow_template" IS 'ARCHETYPE=C;SCOPE=G;DEVIATION. Manual is_active boolean NOT NULL DEFAULT true (not GENERATED). Workflow blueprint. tenant_id=NULL = platform-global template. Defines stages, assignee rules, and behaviour switches. compiled_json: denormalised stages + rules snapshot (version-pinned at workflow_request creation). compiled_hash: nulled by trg_fn_template_child_changed when stages/rules change. Replaces control.approval_template (backup).';

COMMENT ON COLUMN "control"."workflow_template"."behaviors" IS 'Workflow behaviour flags: {allow_self_approval: bool, require_all_stages: bool,  allow_reassignment: bool, capture_entity_snapshot: bool,  require_reason_on_reject: bool, notify_requester: bool,  early_reject_on_quorum_fail: bool}.';

COMMENT ON COLUMN "control"."workflow_template"."compiled_json" IS 'Full denormalised snapshot of template + all stages + all rules. Consumed at workflow_request creation to version-pin the workflow. Structure: {stages:[{stage_no,name,mode,quorum,sla_policy_id,rules:[...]}], behaviors:{...}}.';

CREATE TABLE "control"."workflow_template_rule" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid,
  "workflow_template_id" uuid NOT NULL,
  "stage_no" smallint,
  "priority" smallint DEFAULT 100 NOT NULL,
  "conditions" jsonb,
  "assign_to" jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."workflow_template_rule" IS 'ARCHETYPE=C;SCOPE=G. Assignee resolution rules. Priority-ordered — first matching rule wins. stage_no=NULL means rule applies to all stages in the template. A02: UNIQUE(template_id, stage_no, priority) — no ordering ambiguity. assign_to types: principal (uuid), role (code), team (code), ou (uuid — any member), requester_manager (dynamic). Replaces control.approval_template_rule (backup). P2-FIX: updated_at/updated_by added — rules are reordered and conditions edited.';

COMMENT ON COLUMN "control"."workflow_template_rule"."assign_to" IS 'Assignment target. Examples: {type: ''principal'', value: ''uuid''}, {type: ''role'', value: ''finance_manager''}, {type: ''team'', value: ''approvals_team''}, {type: ''ou'', value: ''uuid'', level: 2}, {type: ''requester_manager''}.';

CREATE TABLE "control"."workflow_template_stage" (
  "id" uuid DEFAULT shared.uuidv7() NOT NULL,
  "tenant_id" uuid,
  "workflow_template_id" uuid NOT NULL,
  "stage_no" smallint NOT NULL,
  "name" text,
  "description" text,
  "mode" text DEFAULT 'serial'::text NOT NULL,
  "quorum" jsonb,
  "sla_policy_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_by" uuid NOT NULL,
  "updated_at" timestamp with time zone,
  "updated_by" uuid
);

COMMENT ON TABLE "control"."workflow_template_stage" IS 'ARCHETYPE=C;SCOPE=G. Stage definition within a workflow template. A01: UNIQUE(workflow_template_id, stage_no). mode: serial (one work_item at a time) | parallel (all assigned at once). quorum: {strategy: count|percent|unanimous, required: N}. NULL quorum = unanimous. Replaces control.approval_template_stage (backup).';

COMMENT ON COLUMN "control"."workflow_template_stage"."quorum" IS 'Quorum rule for this stage. {strategy: ''count'', required: 2} = any 2 assignees must complete positively. {strategy: ''percent'', required: 50} = majority must complete positively. {strategy: ''unanimous''} or NULL = all assignees must complete positively. Captured into document.workflow_stage.quorum at runtime (A06 — version-pinned).';
