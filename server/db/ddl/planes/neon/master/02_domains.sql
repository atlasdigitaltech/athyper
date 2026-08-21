-- Sealed principal/IAM/UI protocol values.
-- These domains are identical in Athyper, Neon, and Mesh.
-- Extensible registry keys (event_code, preference_code, surface_code) remain
-- text with strict format checks because their values are module-owned.
DO $$
DECLARE
  v_domain text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'master' AND t.typname = 'principal_type_d'
  ) THEN
    CREATE DOMAIN master.principal_type_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'master' AND t.typname = 'principal_provisioning_source_d'
  ) THEN
    CREATE DOMAIN master.principal_provisioning_source_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'master' AND t.typname = 'principal_status_d'
  ) THEN
    CREATE DOMAIN master.principal_status_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'master' AND t.typname = 'identity_provider_d'
  ) THEN
    CREATE DOMAIN master.identity_provider_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'master' AND t.typname = 'identity_binding_status_d'
  ) THEN
    CREATE DOMAIN master.identity_binding_status_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'master' AND t.typname = 'ui_appearance_mode_d'
  ) THEN
    CREATE DOMAIN master.ui_appearance_mode_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'master' AND t.typname = 'ui_density_d'
  ) THEN
    CREATE DOMAIN master.ui_density_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'master' AND t.typname = 'saved_view_scope_d'
  ) THEN
    CREATE DOMAIN master.saved_view_scope_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'master' AND t.typname = 'notification_channel_d'
  ) THEN
    CREATE DOMAIN master.notification_channel_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'master' AND t.typname = 'notification_digest_frequency_d'
  ) THEN
    CREATE DOMAIN master.notification_digest_frequency_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'master' AND t.typname = 'template_status_d'
  ) THEN
    CREATE DOMAIN master.template_status_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'master' AND t.typname = 'template_engine_d'
  ) THEN
    CREATE DOMAIN master.template_engine_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'master' AND t.typname = 'print_paper_size_d'
  ) THEN
    CREATE DOMAIN master.print_paper_size_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'master' AND t.typname = 'print_orientation_d'
  ) THEN
    CREATE DOMAIN master.print_orientation_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'master' AND t.typname = 'print_margin_d'
  ) THEN
    CREATE DOMAIN master.print_margin_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'master' AND t.typname = 'legal_entity_type_d'
  ) THEN
    CREATE DOMAIN master.legal_entity_type_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'master' AND t.typname = 'organization_status_d'
  ) THEN
    CREATE DOMAIN master.organization_status_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'master' AND t.typname = 'tax_jurisdiction_type_d'
  ) THEN
    CREATE DOMAIN master.tax_jurisdiction_type_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'master' AND t.typname = 'tax_identity_status_d'
  ) THEN
    CREATE DOMAIN master.tax_identity_status_d AS text;
  END IF;

  FOREACH v_domain IN ARRAY ARRAY[
    'accounting_profile_direction_d',
    'accounting_subledger_d',
    'asset_assignment_type_d',
    'asset_class_status_d',
    'asset_component_type_d',
    'asset_nature_d',
    'asset_prorate_basis_d',
    'asset_retirement_type_d',
    'asset_status_d',
    'bank_account_id_type_d',
    'bank_account_nature_d',
    'bank_account_status_d',
    'bank_institution_type_d',
    'bank_reconciliation_mode_d',
    'bank_relationship_role_d',
    'bank_verification_method_d',
    'book_conflict_strategy_d',
    'business_day_convention_d',
    'business_partner_category_d',
    'business_partner_status_d',
    'buying_model_d',
    'chart_assignment_type_d',
    'company_code_dimension_d',
    'customer_status_d',
    'customer_type_d',
    'depreciation_convention_d',
    'depreciation_method_d',
    'dimension_scope_d',
    'finance_setup_status_d',
    'fiscal_period_status_d',
    'fiscal_period_type_d',
    'fn_resolve_d',
    'fx_rate_source_d',
    'fx_rate_status_d',
    'fx_rate_type_d',
    'gl_account_class_d',
    'gl_node_type_d',
    'house_bank_usage_d',
    'ledger_book_category_d',
    'ledger_close_mode_d',
    'normal_balance_d',
    'operating_organization_domain_d',
    'payment_term_applicability_d',
    'payment_term_application_scope_d',
    'payment_term_base_event_d',
    'payment_term_basis_mode_d',
    'payment_term_calc_mode_d',
    'payment_term_clause_type_d',
    'payment_term_d',
    'payment_term_discount_basis_d',
    'payment_term_discount_selection_d',
    'payment_term_due_rule_d',
    'payment_term_flexibility_d',
    'payment_term_rounding_method_d',
    'payment_term_status_d',
    'pricing_apportion_basis_d',
    'pricing_basis_d',
    'pricing_capitalization_policy_d',
    'pricing_condition_origin_d',
    'pricing_condition_status_d',
    'pricing_cost_effect_d',
    'pricing_distribution_policy_d',
    'pricing_posting_pattern_d',
    'pricing_term_sub_type_d',
    'pricing_term_type_d',
    'selling_model_d',
    'supplier_status_d',
    'supplier_type_d',
    'tax_class_d',
    'tax_section_code_mode_d'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'master' AND t.typname = v_domain
    ) THEN
      EXECUTE format('CREATE DOMAIN master.%I AS text', v_domain);
    END IF;
  END LOOP;
END $$;

ALTER DOMAIN master.principal_type_d DROP CONSTRAINT IF EXISTS principal_type_d_check;
ALTER DOMAIN master.principal_type_d ADD CONSTRAINT principal_type_d_check
    CHECK (VALUE IN (
        'user',
        'service_account',
        'bot',
        'integration',
        'support'
    ));
COMMENT ON DOMAIN master.principal_type_d IS
  'Application actor class. Tenant/admin distinctions belong to authz roles, not principal type.';

ALTER DOMAIN master.principal_provisioning_source_d DROP CONSTRAINT IF EXISTS principal_provisioning_source_d_check;
ALTER DOMAIN master.principal_provisioning_source_d ADD CONSTRAINT principal_provisioning_source_d_check
    CHECK (VALUE IN (
        'internal',
        'jit',
        'sync',
        'import',
        'api'
    ));
COMMENT ON DOMAIN master.principal_provisioning_source_d IS
  'How the application principal was provisioned.';

ALTER DOMAIN master.principal_status_d DROP CONSTRAINT IF EXISTS principal_status_d_check;
ALTER DOMAIN master.principal_status_d ADD CONSTRAINT principal_status_d_check
    CHECK (VALUE IN ('active', 'suspended', 'deactivated'));

ALTER DOMAIN master.identity_provider_d DROP CONSTRAINT IF EXISTS identity_provider_d_check;
ALTER DOMAIN master.identity_provider_d ADD CONSTRAINT identity_provider_d_check
    CHECK (VALUE IN (
        'keycloak',
        'oidc',
        'saml',
        'microsoft',
        'google',
        'okta',
        'ldap',
        'github'
    ));
COMMENT ON DOMAIN master.identity_provider_d IS
  'Sealed IAM adapter identifier. Adding a provider requires a corresponding trusted adapter.';

ALTER DOMAIN master.identity_binding_status_d DROP CONSTRAINT IF EXISTS identity_binding_status_d_check;
ALTER DOMAIN master.identity_binding_status_d ADD CONSTRAINT identity_binding_status_d_check
    CHECK (VALUE IN ('active', 'disabled', 'revoked'));

ALTER DOMAIN master.ui_appearance_mode_d DROP CONSTRAINT IF EXISTS ui_appearance_mode_d_check;
ALTER DOMAIN master.ui_appearance_mode_d ADD CONSTRAINT ui_appearance_mode_d_check
    CHECK (VALUE IN ('light', 'dark', 'system'));

ALTER DOMAIN master.ui_density_d DROP CONSTRAINT IF EXISTS ui_density_d_check;
ALTER DOMAIN master.ui_density_d ADD CONSTRAINT ui_density_d_check
    CHECK (VALUE IN ('compact', 'comfortable', 'spacious'));

ALTER DOMAIN master.saved_view_scope_d DROP CONSTRAINT IF EXISTS saved_view_scope_d_check;
ALTER DOMAIN master.saved_view_scope_d ADD CONSTRAINT saved_view_scope_d_check
    CHECK (VALUE IN ('personal', 'shared', 'system'));
COMMENT ON DOMAIN master.saved_view_scope_d IS
  'Saved-view visibility and ownership class. Personal rows require an owner; shared and system rows do not.';

ALTER DOMAIN master.notification_channel_d DROP CONSTRAINT IF EXISTS notification_channel_d_check;
ALTER DOMAIN master.notification_channel_d ADD CONSTRAINT notification_channel_d_check
    CHECK (VALUE IN (
        'in_app',
        'email',
        'sms',
        'push',
        'webhook',
        'whatsapp'
    ));

ALTER DOMAIN master.notification_digest_frequency_d DROP CONSTRAINT IF EXISTS notification_digest_frequency_d_check;
ALTER DOMAIN master.notification_digest_frequency_d ADD CONSTRAINT notification_digest_frequency_d_check
    CHECK (VALUE IN (
        'hourly_digest',
        'daily_digest',
        'weekly_digest'
    ));
COMMENT ON DOMAIN master.notification_digest_frequency_d IS
  'Digest override. NULL on a preference means immediate/default routing.';

ALTER DOMAIN master.template_status_d DROP CONSTRAINT IF EXISTS template_status_d_check;
ALTER DOMAIN master.template_status_d ADD CONSTRAINT template_status_d_check
    CHECK (VALUE IN ('draft', 'review', 'published', 'archived'));

ALTER DOMAIN master.template_engine_d DROP CONSTRAINT IF EXISTS template_engine_d_check;
ALTER DOMAIN master.template_engine_d ADD CONSTRAINT template_engine_d_check
    CHECK (VALUE IN ('handlebars'));

ALTER DOMAIN master.print_paper_size_d DROP CONSTRAINT IF EXISTS print_paper_size_d_check;
ALTER DOMAIN master.print_paper_size_d ADD CONSTRAINT print_paper_size_d_check
    CHECK (VALUE IN ('A3', 'A4', 'A5', 'B4', 'Letter', 'Legal'));

ALTER DOMAIN master.print_orientation_d DROP CONSTRAINT IF EXISTS print_orientation_d_check;
ALTER DOMAIN master.print_orientation_d ADD CONSTRAINT print_orientation_d_check
    CHECK (VALUE IN ('portrait', 'landscape'));

ALTER DOMAIN master.print_margin_d DROP CONSTRAINT IF EXISTS print_margin_d_check;
ALTER DOMAIN master.print_margin_d ADD CONSTRAINT print_margin_d_check
    CHECK (VALUE IN ('none', 'narrow', 'normal', 'wide'));

ALTER DOMAIN master.legal_entity_type_d DROP CONSTRAINT IF EXISTS legal_entity_type_d_check;
ALTER DOMAIN master.legal_entity_type_d ADD CONSTRAINT legal_entity_type_d_check
    CHECK (VALUE IN ('company', 'group', 'division', 'legal_entity'));

ALTER DOMAIN master.organization_status_d DROP CONSTRAINT IF EXISTS organization_status_d_check;
ALTER DOMAIN master.organization_status_d ADD CONSTRAINT organization_status_d_check
    CHECK (VALUE IN (
        'active',
        'inactive',
        'draft',
        'retired',
        'archived'
    ));

ALTER DOMAIN master.tax_jurisdiction_type_d DROP CONSTRAINT IF EXISTS tax_jurisdiction_type_d_check;
ALTER DOMAIN master.tax_jurisdiction_type_d ADD CONSTRAINT tax_jurisdiction_type_d_check
    CHECK (VALUE IN (
        'country',
        'state',
        'province',
        'county',
        'city',
        'district',
        'special_zone',
        'supranational',
        'treaty'
    ));

ALTER DOMAIN master.tax_identity_status_d DROP CONSTRAINT IF EXISTS tax_identity_status_d_check;
ALTER DOMAIN master.tax_identity_status_d ADD CONSTRAINT tax_identity_status_d_check
    CHECK (VALUE IN ('active', 'inactive', 'draft', 'retired', 'archived'));

CREATE DOMAIN master.partner_role_d AS text
    CHECK (VALUE IN ('supplier', 'customer'));

CREATE DOMAIN master.partner_extension_status_d AS text
    CHECK (VALUE IN ('draft', 'active', 'inactive', 'archived'));

CREATE DOMAIN master.governance_member_type_d AS text
    CHECK (VALUE IN (
        'individual', 'organization', 'trust', 'public_float', 'other'
    ));

CREATE DOMAIN master.intercompany_settlement_mode_d AS text
    CHECK (VALUE IN ('open_item', 'netting', 'cash', 'none'));

CREATE DOMAIN master.intercompany_mirror_mode_d AS text
    CHECK (VALUE IN ('manual', 'automatic', 'disabled'));

CREATE DOMAIN master.product_type_d AS text
    CHECK (VALUE IN ('good', 'service', 'digital', 'bundle'));

CREATE DOMAIN master.catalog_record_status_d AS text
    CHECK (VALUE IN ('draft', 'active', 'inactive', 'archived'));

CREATE DOMAIN master.catalog_direction_d AS text
    CHECK (VALUE IN ('buy', 'sell', 'internal'));

CREATE DOMAIN master.bom_type_d AS text
    CHECK (VALUE IN ('production', 'assembly', 'sales_kit', 'engineering'));

CREATE DOMAIN master.bom_status_d AS text
    CHECK (VALUE IN ('draft', 'review', 'released', 'retired'));

CREATE DOMAIN master.classification_mapping_d AS text
    CHECK (VALUE IN ('exact', 'broader', 'narrower', 'related'));

CREATE DOMAIN master.classification_provenance_d AS text
    CHECK (VALUE IN ('manual', 'supplier', 'verified', 'inferred', 'imported'));

CREATE DOMAIN master.project_type_d AS text
    CHECK (VALUE IN ('internal', 'customer', 'capital', 'research', 'implementation'));

CREATE DOMAIN master.project_status_d AS text
    CHECK (VALUE IN ('draft', 'planned', 'active', 'on_hold', 'completed', 'closed', 'cancelled'));

CREATE DOMAIN master.project_wbs_type_d AS text
    CHECK (VALUE IN ('summary', 'control_account', 'work_package'));

CREATE DOMAIN master.project_item_type_d AS text
    CHECK (VALUE IN ('material', 'service', 'asset', 'expense', 'deliverable'));

CREATE DOMAIN master.project_record_status_d AS text
    CHECK (VALUE IN ('draft', 'active', 'inactive', 'closed', 'cancelled'));

CREATE DOMAIN master.compensation_assignment_status_d AS text
    CHECK (VALUE IN ('planned','active','superseded','cancelled'));
