DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperapp') THEN
    GRANT SELECT ON
      control.accounting_profile_policy_catalog,
      control.v_authorization_v2_deferred_constraints,
      master.v_business_partner_address,
      master.v_business_partner_app_index,
      master.v_business_partner_bank_account,
      master.v_business_partner_role_summary,
      master.v_company_code_address,
      master.v_contact_summary,
      master.v_effective_principal_ui,
      master.v_resolved_address,
      master.v_resolved_identity,
      master.v_site_address,
      master.v_supplier_address,
      master.v_supplier_bank_account,
      master.business_partner_governance_summary,
      master.entity_commodity_assignment,
      document.purchase_order,
      document.v_ap_invoice_summary,
      document.v_ap_settlement_graph,
      document.v_ap_settlement_summary,
      document.v_commitment_line_pricing_summary,
      document.v_current_accounting_distribution,
      document.v_current_pricing_component,
      document.v_current_schedule_line,
      document.v_invoice_retention_release_schedule,
      ledger.v_trial_balance,
      ledger.v_asset_reserve_summary
    TO athyperapp;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
    GRANT SELECT ON
      control.accounting_profile_policy_catalog,
      control.v_authorization_v2_deferred_constraints,
      master.v_business_partner_address,
      master.v_business_partner_app_index,
      master.v_business_partner_bank_account,
      master.v_business_partner_role_summary,
      master.v_company_code_address,
      master.v_contact_summary,
      master.v_effective_principal_ui,
      master.v_resolved_address,
      master.v_resolved_identity,
      master.v_site_address,
      master.v_supplier_address,
      master.v_supplier_bank_account,
      master.business_partner_governance_summary,
      master.entity_commodity_assignment,
      document.purchase_order,
      document.v_ap_invoice_summary,
      document.v_ap_settlement_graph,
      document.v_ap_settlement_summary,
      document.v_commitment_line_pricing_summary,
      document.v_current_accounting_distribution,
      document.v_current_pricing_component,
      document.v_current_schedule_line,
      document.v_invoice_retention_release_schedule,
      ledger.v_trial_balance,
      ledger.v_asset_reserve_summary
    TO athyperadmin;
  END IF;
END;
$$;
