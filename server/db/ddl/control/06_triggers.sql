-- ============================================================================
-- control/06_triggers.sql
-- Concept: Governance Triggers — lifecycle, workflow, lookup, and policy automation triggers
-- Depends on: 04_tables/002_control.sql, 08_functions/002_control.sql
-- Convention: trg_<table>_<purpose>. DROP IF EXISTS before CREATE for idempotency.
-- ============================================================================

-- lookup_domain
DROP TRIGGER IF EXISTS trg_lookup_domain_updated_at ON control.lookup_domain;
CREATE TRIGGER trg_lookup_domain_updated_at BEFORE UPDATE ON control.lookup_domain FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_lookup_domain_status_changed ON control.lookup_domain;
CREATE TRIGGER trg_lookup_domain_status_changed BEFORE UPDATE ON control.lookup_domain FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

-- lookup_value
DROP TRIGGER IF EXISTS trg_lookup_value_updated_at ON control.lookup_value;
CREATE TRIGGER trg_lookup_value_updated_at BEFORE UPDATE ON control.lookup_value FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_lookup_value_status_changed ON control.lookup_value;
CREATE TRIGGER trg_lookup_value_status_changed BEFORE UPDATE ON control.lookup_value FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

-- lookup_value extensibility guard — tenant rows only into is_extensible=true domains
DROP TRIGGER IF EXISTS trg_lookup_value_extensibility ON control.lookup_value;
CREATE TRIGGER trg_lookup_value_extensibility BEFORE INSERT OR UPDATE ON control.lookup_value FOR EACH ROW EXECUTE FUNCTION control.trg_enforce_extensibility();


-- entity: auto-create 1:1 entity_publish_state row
DROP TRIGGER IF EXISTS trg_entity_ensure_publish_state ON control.entity;
CREATE TRIGGER trg_entity_ensure_publish_state
    AFTER INSERT ON control.entity
    FOR EACH ROW EXECUTE FUNCTION control.trg_ensure_entity_publish_state();

-- entity_version: keep entity_publish_state.latest_version_no current
DROP TRIGGER IF EXISTS trg_ev_bump_latest_version_no ON control.entity_version;
CREATE TRIGGER trg_ev_bump_latest_version_no
    AFTER INSERT ON control.entity_version
    FOR EACH ROW EXECUTE FUNCTION control.trg_ev_bump_latest_version_no();


-- entity_field: class-profile behavior defaults
DROP TRIGGER IF EXISTS trg_entity_field_flag_defaults ON control.entity_field;
CREATE TRIGGER trg_entity_field_flag_defaults
    BEFORE INSERT ON control.entity_field
    FOR EACH ROW EXECUTE FUNCTION control.trg_field_flag_defaults();


-- mfa_config
DROP TRIGGER IF EXISTS trg_mfa_config_updated_at ON control.mfa_config;
CREATE TRIGGER trg_mfa_config_updated_at BEFORE UPDATE ON control.mfa_config FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

-- mfa_config: validate contact_link channel type and principal ownership
DROP TRIGGER IF EXISTS trg_mfa_config_contact_link_guard ON control.mfa_config;
CREATE TRIGGER trg_mfa_config_contact_link_guard
    BEFORE INSERT OR UPDATE OF contact_link_id, method_type, principal_id, tenant_id
    ON control.mfa_config
    FOR EACH ROW EXECUTE FUNCTION control.trg_guard_mfa_contact_link();

-- mfa_config.method_type — lookup validation (replaces session-dependent CHECK)
DROP TRIGGER IF EXISTS trg_mfa_config_method_type_lookup ON control.mfa_config;
CREATE TRIGGER trg_mfa_config_method_type_lookup
    BEFORE INSERT OR UPDATE OF method_type ON control.mfa_config
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns('control.mfa_method_type', 'method_type');


-- Entity numbering config
DROP TRIGGER IF EXISTS trg_encfg_updated_at ON control.entity_numbering_config;
CREATE TRIGGER trg_encfg_updated_at
    BEFORE UPDATE ON control.entity_numbering_config
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_encfg_status_changed ON control.entity_numbering_config;
CREATE TRIGGER trg_encfg_status_changed
    BEFORE UPDATE ON control.entity_numbering_config
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

-- Entity numbering counter is hot state; no lifecycle triggers.


-- Entity flow lifecycle/audit triggers
DROP TRIGGER IF EXISTS trg_eflow_updated_at ON control.entity_flow;
CREATE TRIGGER trg_eflow_updated_at
    BEFORE UPDATE ON control.entity_flow
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_eflow_status_changed ON control.entity_flow;
CREATE TRIGGER trg_eflow_status_changed
    BEFORE UPDATE OF status ON control.entity_flow
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_efs_updated_at ON control.entity_flow_step;
CREATE TRIGGER trg_efs_updated_at
    BEFORE UPDATE ON control.entity_flow_step
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_efsec_updated_at ON control.entity_flow_section;
CREATE TRIGGER trg_efsec_updated_at
    BEFORE UPDATE ON control.entity_flow_section
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_eff_updated_at ON control.entity_flow_field;
CREATE TRIGGER trg_eff_updated_at
    BEFORE UPDATE ON control.entity_flow_field
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();


-- =============================================================================
-- OU + INTENT + CLASSIFICATION ENGINE — control schema triggers
-- =============================================================================

-- =============================================================================
-- §CCRR  control.commodity_code_to_category_rule
-- =============================================================================

DROP TRIGGER IF EXISTS trg_ccrr_updated_at ON control.commodity_code_to_category_rule;
CREATE TRIGGER trg_ccrr_updated_at
    BEFORE UPDATE ON control.commodity_code_to_category_rule
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_ccrr_status_changed ON control.commodity_code_to_category_rule;
CREATE TRIGGER trg_ccrr_status_changed
    BEFORE UPDATE OF status ON control.commodity_code_to_category_rule
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();


-- ── §BK5 bank_format_rule ───────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_bfr_updated_at ON control.bank_format_rule;
CREATE TRIGGER trg_bfr_updated_at BEFORE UPDATE ON control.bank_format_rule
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_bfr_status_changed ON control.bank_format_rule;
CREATE TRIGGER trg_bfr_status_changed BEFORE UPDATE ON control.bank_format_rule
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_bfr_payment_network_lookup ON control.bank_format_rule;
CREATE TRIGGER trg_bfr_payment_network_lookup
    BEFORE INSERT OR UPDATE OF payment_network ON control.bank_format_rule
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'control.bank_format_rule_payment_network', 'payment_network');

DROP TRIGGER IF EXISTS trg_bfr_direction_lookup ON control.bank_format_rule;
CREATE TRIGGER trg_bfr_direction_lookup
    BEFORE INSERT OR UPDATE OF direction ON control.bank_format_rule
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'control.bank_format_rule_direction', 'direction');

DROP TRIGGER IF EXISTS trg_bfr_acct_id_type_lookup ON control.bank_format_rule;
CREATE TRIGGER trg_bfr_acct_id_type_lookup
    BEFORE INSERT OR UPDATE OF account_id_type ON control.bank_format_rule
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'master.bank_account_id_type', 'account_id_type');

DROP TRIGGER IF EXISTS trg_bfr_bank_id_type_lookup ON control.bank_format_rule;
CREATE TRIGGER trg_bfr_bank_id_type_lookup
    BEFORE INSERT OR UPDATE OF bank_id_type ON control.bank_format_rule
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'control.bank_format_rule_bank_id_type', 'bank_id_type');


-- ── §PM2 payment_method_company_policy ──────────────────────────────────────

DROP TRIGGER IF EXISTS trg_pmcp_updated_at ON control.payment_method_company_policy;
CREATE TRIGGER trg_pmcp_updated_at BEFORE UPDATE ON control.payment_method_company_policy
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_pmcp_status_changed ON control.payment_method_company_policy;
CREATE TRIGGER trg_pmcp_status_changed BEFORE UPDATE ON control.payment_method_company_policy
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_pmcp_direction_lookup ON control.payment_method_company_policy;
CREATE TRIGGER trg_pmcp_direction_lookup
    BEFORE INSERT OR UPDATE OF direction ON control.payment_method_company_policy
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'master.payment_method_direction', 'direction');

DROP TRIGGER IF EXISTS trg_pmcp_validate_bank_link ON control.payment_method_company_policy;
CREATE TRIGGER trg_pmcp_validate_bank_link
    BEFORE INSERT OR UPDATE OF bank_account_link_id, company_code_id
    ON control.payment_method_company_policy
    FOR EACH ROW EXECUTE FUNCTION control.trg_pmcp_validate_bank_link_company();

-- ── §PM3 bank_interface_profile ─────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_bip_updated_at ON control.bank_interface_profile;
CREATE TRIGGER trg_bip_updated_at BEFORE UPDATE ON control.bank_interface_profile
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_bip_status_changed ON control.bank_interface_profile;
CREATE TRIGGER trg_bip_status_changed BEFORE UPDATE ON control.bank_interface_profile
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_bip_type_lookup ON control.bank_interface_profile;
CREATE TRIGGER trg_bip_type_lookup
    BEFORE INSERT OR UPDATE OF interface_type ON control.bank_interface_profile
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'control.bank_interface_profile_type', 'interface_type');

DROP TRIGGER IF EXISTS trg_bip_network_lookup ON control.bank_interface_profile;
CREATE TRIGGER trg_bip_network_lookup
    BEFORE INSERT OR UPDATE OF payment_network ON control.bank_interface_profile
    FOR EACH ROW WHEN (NEW.payment_network IS NOT NULL)
    EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'control.bank_format_rule_payment_network', 'payment_network');

DROP TRIGGER IF EXISTS trg_bip_format_lookup ON control.bank_interface_profile;
CREATE TRIGGER trg_bip_format_lookup
    BEFORE INSERT OR UPDATE OF file_format_code ON control.bank_interface_profile
    FOR EACH ROW WHEN (NEW.file_format_code IS NOT NULL)
    EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'control.bank_interface_file_format', 'file_format_code');

-- ── §PM4 payment_method_interface_binding ───────────────────────────────────

DROP TRIGGER IF EXISTS trg_pmib_updated_at ON control.payment_method_interface_binding;
CREATE TRIGGER trg_pmib_updated_at BEFORE UPDATE ON control.payment_method_interface_binding
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_pmib_status_changed ON control.payment_method_interface_binding;
CREATE TRIGGER trg_pmib_status_changed BEFORE UPDATE ON control.payment_method_interface_binding
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_pmib_direction_lookup ON control.payment_method_interface_binding;
CREATE TRIGGER trg_pmib_direction_lookup
    BEFORE INSERT OR UPDATE OF direction ON control.payment_method_interface_binding
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'master.payment_method_direction', 'direction');

DROP TRIGGER IF EXISTS trg_pmib_network_lookup ON control.payment_method_interface_binding;
CREATE TRIGGER trg_pmib_network_lookup
    BEFORE INSERT OR UPDATE OF payment_network ON control.payment_method_interface_binding
    FOR EACH ROW WHEN (NEW.payment_network IS NOT NULL)
    EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'control.bank_format_rule_payment_network', 'payment_network');

-- ── §PM5 payment_settlement_rule ────────────────────────────────────────────

DROP TRIGGER IF EXISTS trg_psr_updated_at ON control.payment_settlement_rule;
CREATE TRIGGER trg_psr_updated_at BEFORE UPDATE ON control.payment_settlement_rule
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_psr_status_changed ON control.payment_settlement_rule;
CREATE TRIGGER trg_psr_status_changed BEFORE UPDATE ON control.payment_settlement_rule
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_psr_direction_lookup ON control.payment_settlement_rule;
CREATE TRIGGER trg_psr_direction_lookup
    BEFORE INSERT OR UPDATE OF direction ON control.payment_settlement_rule
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'master.payment_method_direction', 'direction');

DROP TRIGGER IF EXISTS trg_psr_clearing_role_lookup ON control.payment_settlement_rule;
CREATE TRIGGER trg_psr_clearing_role_lookup
    BEFORE INSERT OR UPDATE OF clearing_posting_role_code ON control.payment_settlement_rule
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'control.payment_settlement_posting_role', 'clearing_posting_role_code');

DROP TRIGGER IF EXISTS trg_psr_settlement_role_lookup ON control.payment_settlement_rule;
CREATE TRIGGER trg_psr_settlement_role_lookup
    BEFORE INSERT OR UPDATE OF settlement_posting_role_code ON control.payment_settlement_rule
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'control.payment_settlement_posting_role', 'settlement_posting_role_code');

DROP TRIGGER IF EXISTS trg_psr_bank_fee_role_lookup ON control.payment_settlement_rule;
CREATE TRIGGER trg_psr_bank_fee_role_lookup
    BEFORE INSERT OR UPDATE OF bank_fee_posting_role_code ON control.payment_settlement_rule
    FOR EACH ROW WHEN (NEW.bank_fee_posting_role_code IS NOT NULL)
    EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'control.payment_settlement_posting_role', 'bank_fee_posting_role_code');

DROP TRIGGER IF EXISTS trg_psr_discount_role_lookup ON control.payment_settlement_rule;
CREATE TRIGGER trg_psr_discount_role_lookup
    BEFORE INSERT OR UPDATE OF discount_posting_role_code ON control.payment_settlement_rule
    FOR EACH ROW WHEN (NEW.discount_posting_role_code IS NOT NULL)
    EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'control.payment_settlement_posting_role', 'discount_posting_role_code');

DROP TRIGGER IF EXISTS trg_psr_fx_gain_role_lookup ON control.payment_settlement_rule;
CREATE TRIGGER trg_psr_fx_gain_role_lookup
    BEFORE INSERT OR UPDATE OF fx_gain_posting_role_code ON control.payment_settlement_rule
    FOR EACH ROW WHEN (NEW.fx_gain_posting_role_code IS NOT NULL)
    EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'control.payment_settlement_posting_role', 'fx_gain_posting_role_code');

DROP TRIGGER IF EXISTS trg_psr_fx_loss_role_lookup ON control.payment_settlement_rule;
CREATE TRIGGER trg_psr_fx_loss_role_lookup
    BEFORE INSERT OR UPDATE OF fx_loss_posting_role_code ON control.payment_settlement_rule
    FOR EACH ROW WHEN (NEW.fx_loss_posting_role_code IS NOT NULL)
    EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'control.payment_settlement_posting_role', 'fx_loss_posting_role_code');

DROP TRIGGER IF EXISTS trg_psr_chargeback_role_lookup ON control.payment_settlement_rule;
CREATE TRIGGER trg_psr_chargeback_role_lookup
    BEFORE INSERT OR UPDATE OF chargeback_posting_role_code ON control.payment_settlement_rule
    FOR EACH ROW WHEN (NEW.chargeback_posting_role_code IS NOT NULL)
    EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'control.payment_settlement_posting_role', 'chargeback_posting_role_code');

DROP TRIGGER IF EXISTS trg_psr_suspense_role_lookup ON control.payment_settlement_rule;
CREATE TRIGGER trg_psr_suspense_role_lookup
    BEFORE INSERT OR UPDATE OF suspense_posting_role_code ON control.payment_settlement_rule
    FOR EACH ROW WHEN (NEW.suspense_posting_role_code IS NOT NULL)
    EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'control.payment_settlement_posting_role', 'suspense_posting_role_code');


-- =============================================================================
-- §ACBPT  control.asset_class_book_policy_template
-- =============================================================================

DROP TRIGGER IF EXISTS trg_acbpt_updated_at ON control.asset_class_book_policy_template;
CREATE TRIGGER trg_acbpt_updated_at BEFORE UPDATE ON control.asset_class_book_policy_template
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_acbpt_status_changed ON control.asset_class_book_policy_template;
CREATE TRIGGER trg_acbpt_status_changed BEFORE UPDATE ON control.asset_class_book_policy_template
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_acbpt_book_category_lookup ON control.asset_class_book_policy_template;
CREATE TRIGGER trg_acbpt_book_category_lookup
    BEFORE INSERT OR UPDATE OF book_category ON control.asset_class_book_policy_template
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'master.ledger_book_category', 'book_category');

DROP TRIGGER IF EXISTS trg_acbpt_depr_method_lookup ON control.asset_class_book_policy_template;
CREATE TRIGGER trg_acbpt_depr_method_lookup
    BEFORE INSERT OR UPDATE OF depreciation_method ON control.asset_class_book_policy_template
    FOR EACH ROW WHEN (NEW.depreciation_method IS NOT NULL)
    EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'master.depreciation_method', 'depreciation_method');

DROP TRIGGER IF EXISTS trg_acbpt_convention_lookup ON control.asset_class_book_policy_template;
CREATE TRIGGER trg_acbpt_convention_lookup
    BEFORE INSERT OR UPDATE OF convention ON control.asset_class_book_policy_template
    FOR EACH ROW WHEN (NEW.convention IS NOT NULL)
    EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'master.depreciation_convention', 'convention');

DROP TRIGGER IF EXISTS trg_acbpt_prorate_lookup ON control.asset_class_book_policy_template;
CREATE TRIGGER trg_acbpt_prorate_lookup
    BEFORE INSERT OR UPDATE OF prorate_basis ON control.asset_class_book_policy_template
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'master.asset_prorate_basis', 'prorate_basis');

DROP TRIGGER IF EXISTS trg_acbpt_start_rule_lookup ON control.asset_class_book_policy_template;
CREATE TRIGGER trg_acbpt_start_rule_lookup
    BEFORE INSERT OR UPDATE OF depreciation_start_rule ON control.asset_class_book_policy_template
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'control.depreciation_start_rule', 'depreciation_start_rule');

DROP TRIGGER IF EXISTS trg_acbpt_residual_mode_lookup ON control.asset_class_book_policy_template;
CREATE TRIGGER trg_acbpt_residual_mode_lookup
    BEFORE INSERT OR UPDATE OF residual_value_mode ON control.asset_class_book_policy_template
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'control.residual_value_mode', 'residual_value_mode');

DROP TRIGGER IF EXISTS trg_acbpt_posting_roles_validate ON control.asset_class_book_policy_template;
CREATE TRIGGER trg_acbpt_posting_roles_validate
    BEFORE INSERT OR UPDATE ON control.asset_class_book_policy_template
    FOR EACH ROW EXECUTE FUNCTION control.trg_acbp_validate_posting_roles();


-- =============================================================================
-- §ACP1  control.asset_class_book_policy
-- =============================================================================

-- updated_at / status_changed
DROP TRIGGER IF EXISTS trg_acbp_updated_at ON control.asset_class_book_policy;
CREATE TRIGGER trg_acbp_updated_at BEFORE UPDATE ON control.asset_class_book_policy
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_acbp_status_changed ON control.asset_class_book_policy;
CREATE TRIGGER trg_acbp_status_changed BEFORE UPDATE ON control.asset_class_book_policy
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

-- Lookup validations
DROP TRIGGER IF EXISTS trg_acbp_depr_method_lookup ON control.asset_class_book_policy;
CREATE TRIGGER trg_acbp_depr_method_lookup
    BEFORE INSERT OR UPDATE OF depreciation_method ON control.asset_class_book_policy
    FOR EACH ROW WHEN (NEW.depreciation_method IS NOT NULL)
    EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'master.depreciation_method', 'depreciation_method');

DROP TRIGGER IF EXISTS trg_acbp_convention_lookup ON control.asset_class_book_policy;
CREATE TRIGGER trg_acbp_convention_lookup
    BEFORE INSERT OR UPDATE OF convention ON control.asset_class_book_policy
    FOR EACH ROW WHEN (NEW.convention IS NOT NULL)
    EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'master.depreciation_convention', 'convention');

DROP TRIGGER IF EXISTS trg_acbp_prorate_lookup ON control.asset_class_book_policy;
CREATE TRIGGER trg_acbp_prorate_lookup
    BEFORE INSERT OR UPDATE OF prorate_basis ON control.asset_class_book_policy
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'master.asset_prorate_basis', 'prorate_basis');

DROP TRIGGER IF EXISTS trg_acbp_start_rule_lookup ON control.asset_class_book_policy;
CREATE TRIGGER trg_acbp_start_rule_lookup
    BEFORE INSERT OR UPDATE OF depreciation_start_rule ON control.asset_class_book_policy
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'control.depreciation_start_rule', 'depreciation_start_rule');

DROP TRIGGER IF EXISTS trg_acbp_residual_mode_lookup ON control.asset_class_book_policy;
CREATE TRIGGER trg_acbp_residual_mode_lookup
    BEFORE INSERT OR UPDATE OF residual_value_mode ON control.asset_class_book_policy
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'control.residual_value_mode', 'residual_value_mode');

-- Book code validation: ensures book_code exists in ledger_book AND is assigned
-- to the policy's company_code_id via company_code_book_assignment.
DROP TRIGGER IF EXISTS trg_acbp_book_code_validate ON control.asset_class_book_policy;
CREATE TRIGGER trg_acbp_book_code_validate
    BEFORE INSERT OR UPDATE OF book_code, company_code_id ON control.asset_class_book_policy
    FOR EACH ROW EXECUTE FUNCTION control.trg_acbp_validate_book_code();

-- Class-policy consistency: land/cwip → is_depreciable = false
DROP TRIGGER IF EXISTS trg_acbp_class_consistency ON control.asset_class_book_policy;
CREATE TRIGGER trg_acbp_class_consistency
    BEFORE INSERT OR UPDATE OF is_depreciable, asset_class_id ON control.asset_class_book_policy
    FOR EACH ROW EXECUTE FUNCTION control.trg_acbp_class_consistency();

-- Posting role code format validation
DROP TRIGGER IF EXISTS trg_acbp_posting_roles_validate ON control.asset_class_book_policy;
CREATE TRIGGER trg_acbp_posting_roles_validate
    BEFORE INSERT OR UPDATE ON control.asset_class_book_policy
    FOR EACH ROW EXECUTE FUNCTION control.trg_acbp_validate_posting_roles();


-- ── Policy rule versioning trigger ──────────────────────────────────────────
-- BEFORE UPDATE on control.policy_rule:
--   1. Close the current open version (effective_until = now()).
--   2. Insert a snapshot of the OLD row as a new policy_rule_version row.
-- Routes should SET LOCAL app.principal_id = '<uuid>' before each UPDATE.

CREATE OR REPLACE FUNCTION control.trg_fn_version_policy_rule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_next_version integer;
  v_principal_id uuid;
BEGIN
  SELECT COALESCE(MAX(version_no), 0) + 1
    INTO v_next_version
    FROM control.policy_rule_version
   WHERE policy_rule_id = OLD.id;

  BEGIN
    v_principal_id := current_setting('app.principal_id', true)::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_principal_id := NULL;
  END;

  UPDATE control.policy_rule_version
     SET effective_until = now(),
         updated_at      = now()
   WHERE policy_rule_id = OLD.id
     AND effective_until IS NULL;

  INSERT INTO control.policy_rule_version (
    tenant_id,
    policy_rule_id,
    policy_id,
    version_no,
    rule_snapshot,
    effective_from,
    effective_until,
    published_by,
    published_at
  ) VALUES (
    OLD.tenant_id,
    OLD.id,
    OLD.policy_id,
    v_next_version,
    to_jsonb(OLD),
    COALESCE(OLD.updated_at, OLD.created_at, now()),
    now(),
    v_principal_id,
    now()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_version_policy_rule ON control.policy_rule;

CREATE TRIGGER trg_version_policy_rule
  BEFORE UPDATE ON control.policy_rule
  FOR EACH ROW
  EXECUTE FUNCTION control.trg_fn_version_policy_rule();

COMMENT ON FUNCTION control.trg_fn_version_policy_rule() IS
  'BEFORE UPDATE trigger on control.policy_rule. Closes the previous '
  'policy_rule_version row (sets effective_until) and inserts a snapshot '
  'of the OLD row as a new version. Enables full rule change audit trail.';


-- ─── D. Entity binding validation (P1) ──────────────────────────────────────
-- Validates entity_name / target_entity against control.entity.entity_code.
-- Prevents orphaned lifecycle, operation, and relation rows at write time.
-- Functions defined in 08_functions/002_control.sql §Entity binding validators.

-- entity_lifecycle: validate entity_name on insert/update
DROP TRIGGER IF EXISTS trg_el_validate_entity_binding ON control.entity_lifecycle;
CREATE TRIGGER trg_el_validate_entity_binding
    BEFORE INSERT OR UPDATE OF entity_name
    ON control.entity_lifecycle
    FOR EACH ROW EXECUTE FUNCTION control.trg_fn_validate_entity_binding();

-- entity_operation: validate entity_name on insert/update
DROP TRIGGER IF EXISTS trg_eo_validate_entity_binding ON control.entity_operation;
CREATE TRIGGER trg_eo_validate_entity_binding
    BEFORE INSERT OR UPDATE OF entity_name
    ON control.entity_operation
    FOR EACH ROW EXECUTE FUNCTION control.trg_fn_validate_entity_binding();

-- entity_relation: validate target_entity on insert/update
DROP TRIGGER IF EXISTS trg_er_validate_target_entity ON control.entity_relation;
CREATE TRIGGER trg_er_validate_target_entity
    BEFORE INSERT OR UPDATE OF target_entity
    ON control.entity_relation
    FOR EACH ROW EXECUTE FUNCTION control.trg_fn_validate_target_entity();


-- =============================================================================
-- §R5  updated_at maintenance for outbox_routing_rule
-- =============================================================================

DROP TRIGGER IF EXISTS trg_orr_updated_at ON control.outbox_routing_rule;
CREATE TRIGGER trg_orr_updated_at
    BEFORE UPDATE ON control.outbox_routing_rule
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();


-- =============================================================================
-- §R11  updated_at maintenance for budget_check_config
-- =============================================================================

DROP TRIGGER IF EXISTS trg_bcc_updated_at ON control.budget_check_config;
CREATE TRIGGER trg_bcc_updated_at
    BEFORE UPDATE ON control.budget_check_config
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();


-- =============================================================================
-- §R7-A  updated_at maintenance for wht_threshold_config
-- =============================================================================

DROP TRIGGER IF EXISTS trg_wtc_updated_at ON control.wht_threshold_config;
CREATE TRIGGER trg_wtc_updated_at
    BEFORE UPDATE ON control.wht_threshold_config
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();


-- =============================================================================
-- §TEC  updated_at maintenance for transaction_event_catalog
-- =============================================================================
-- R1: new catalog table — updated_at trigger follows schema convention.

DROP TRIGGER IF EXISTS trg_tec_updated_at ON control.transaction_event_catalog;
CREATE TRIGGER trg_tec_updated_at
    BEFORE UPDATE ON control.transaction_event_catalog
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();


-- =============================================================================
-- §PROV  updated_at maintenance for blueprint tables
-- =============================================================================
-- R6: blueprint_registry and blueprint_tenant_application migrated from seed
-- file into main DDL; updated_at triggers added here to match schema convention.

DROP TRIGGER IF EXISTS trg_br_updated_at ON control.blueprint_registry;
CREATE TRIGGER trg_br_updated_at
    BEFORE UPDATE ON control.blueprint_registry
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_tba_updated_at ON control.blueprint_tenant_application;
CREATE TRIGGER trg_tba_updated_at
    BEFORE UPDATE ON control.blueprint_tenant_application
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();


-- =============================================================================
-- §R8  updated_at maintenance for AI control tables
-- =============================================================================

DROP TRIGGER IF EXISTS trg_aap_updated_at ON control.ai_action_policy;
CREATE TRIGGER trg_aap_updated_at
    BEFORE UPDATE ON control.ai_action_policy
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_act_updated_at ON control.ai_confidence_threshold;
CREATE TRIGGER trg_act_updated_at
    BEFORE UPDATE ON control.ai_confidence_threshold
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_adb_updated_at ON control.ai_drift_baseline;
CREATE TRIGGER trg_adb_updated_at
    BEFORE UPDATE ON control.ai_drift_baseline
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

DROP TRIGGER IF EXISTS trg_fbb_updated_at ON control.forecast_budget_bridge;
CREATE TRIGGER trg_fbb_updated_at
    BEFORE UPDATE ON control.forecast_budget_bridge
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
