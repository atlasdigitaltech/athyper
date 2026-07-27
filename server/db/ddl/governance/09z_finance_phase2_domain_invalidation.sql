-- Stage F extends certification invalidation from the foundation shell to all
-- four Phase 2 domains. Shared-definition changes conservatively supersede all
-- Company certifications in the tenant; Company policy changes remain scoped.

CREATE OR REPLACE FUNCTION governance.trg_invalidate_finance_setup_certification()
RETURNS trigger LANGUAGE plpgsql VOLATILE
SET search_path=governance,master,control,pg_temp AS $$
DECLARE
  v_row jsonb:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  v_tenant_id uuid:=(v_row->>'tenant_id')::uuid;
  v_actor_id uuid:=COALESCE(NULLIF(v_row->>'updated_by','')::uuid,NULLIF(v_row->>'status_changed_by','')::uuid,NULLIF(v_row->>'created_by','')::uuid);
  v_company_id uuid;v_definition_id uuid;
BEGIN
  CASE TG_ARGV[0]
    WHEN 'tenant' THEN
      FOR v_company_id IN SELECT id FROM master.company_code WHERE tenant_id=v_tenant_id LOOP
        PERFORM governance.invalidate_finance_setup_certification(v_tenant_id,v_company_id,v_actor_id,TG_ARGV[1]);
      END LOOP;
    WHEN 'company' THEN
      PERFORM governance.invalidate_finance_setup_certification(v_tenant_id,(v_row->>'id')::uuid,v_actor_id,TG_ARGV[1]);
    WHEN 'company_direct' THEN
      PERFORM governance.invalidate_finance_setup_certification(v_tenant_id,(v_row->>'company_code_id')::uuid,v_actor_id,TG_ARGV[1]);
    WHEN 'company_optional' THEN
      IF NULLIF(v_row->>'company_code_id','') IS NULL THEN
        FOR v_company_id IN SELECT id FROM master.company_code WHERE tenant_id=v_tenant_id LOOP
          PERFORM governance.invalidate_finance_setup_certification(v_tenant_id,v_company_id,v_actor_id,TG_ARGV[1]);
        END LOOP;
      ELSE
        PERFORM governance.invalidate_finance_setup_certification(v_tenant_id,(v_row->>'company_code_id')::uuid,v_actor_id,TG_ARGV[1]);
      END IF;
    WHEN 'legal_entity' THEN
      FOR v_company_id IN SELECT id FROM master.company_code WHERE tenant_id=v_tenant_id AND legal_entity_id=(v_row->>'id')::uuid LOOP
        PERFORM governance.invalidate_finance_setup_certification(v_tenant_id,v_company_id,v_actor_id,TG_ARGV[1]);
      END LOOP;
    WHEN 'chart' THEN
      FOR v_company_id IN SELECT company_code_id FROM master.company_code_chart_assignment WHERE tenant_id=v_tenant_id AND chart_of_account_id=(v_row->>'id')::uuid LOOP
        PERFORM governance.invalidate_finance_setup_certification(v_tenant_id,v_company_id,v_actor_id,TG_ARGV[1]);
      END LOOP;
    WHEN 'gl_account' THEN
      FOR v_company_id IN SELECT company_code_id FROM master.company_code_chart_assignment WHERE tenant_id=v_tenant_id AND chart_of_account_id=(v_row->>'chart_of_account_id')::uuid LOOP
        PERFORM governance.invalidate_finance_setup_certification(v_tenant_id,v_company_id,v_actor_id,TG_ARGV[1]);
      END LOOP;
    WHEN 'book' THEN
      FOR v_company_id IN SELECT company_code_id FROM master.company_code_book_assignment WHERE tenant_id=v_tenant_id AND book_id=(v_row->>'id')::uuid LOOP
        PERFORM governance.invalidate_finance_setup_certification(v_tenant_id,v_company_id,v_actor_id,TG_ARGV[1]);
      END LOOP;
    WHEN 'calendar' THEN
      FOR v_company_id IN SELECT company_code_id FROM control.company_fiscal_calendar_assignment WHERE tenant_id=v_tenant_id AND fiscal_calendar_config_id=(v_row->>'id')::uuid LOOP
        PERFORM governance.invalidate_finance_setup_certification(v_tenant_id,v_company_id,v_actor_id,TG_ARGV[1]);
      END LOOP;
    WHEN 'calendar_rule' THEN
      v_definition_id:=(v_row->>'fiscal_calendar_config_id')::uuid;
      FOR v_company_id IN SELECT company_code_id FROM control.company_fiscal_calendar_assignment WHERE tenant_id=v_tenant_id AND fiscal_calendar_config_id=v_definition_id LOOP
        PERFORM governance.invalidate_finance_setup_certification(v_tenant_id,v_company_id,v_actor_id,TG_ARGV[1]);
      END LOOP;
    ELSE RAISE EXCEPTION 'Unknown finance certification invalidation scope: %',TG_ARGV[0];
  END CASE;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;RETURN NEW;
END $$;

-- Currency and FX
DROP TRIGGER IF EXISTS trg_fin_ready_fx_policy ON control.fx_policy;
CREATE TRIGGER trg_fin_ready_fx_policy AFTER INSERT OR UPDATE OR DELETE ON control.fx_policy FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('company_optional','FX policy changed');
-- Rates are operational health, not setup evidence. Keep the historical DROP
-- so an upgrade removes the Stage F trigger without rewriting any rate data.
DROP TRIGGER IF EXISTS trg_fin_ready_fx_rate ON master.fx_rate;

-- Tax
DROP TRIGGER IF EXISTS trg_fin_ready_tax_group ON control.tax_group;
CREATE TRIGGER trg_fin_ready_tax_group AFTER INSERT OR UPDATE OR DELETE ON control.tax_group FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('tenant','Tax Group changed');
DROP TRIGGER IF EXISTS trg_fin_ready_tax_group_version ON control.tax_group_version;
CREATE TRIGGER trg_fin_ready_tax_group_version AFTER INSERT OR UPDATE OR DELETE ON control.tax_group_version FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('tenant','Tax Group version changed');
DROP TRIGGER IF EXISTS trg_fin_ready_tax_group_component ON control.tax_group_component;
CREATE TRIGGER trg_fin_ready_tax_group_component AFTER INSERT OR UPDATE OR DELETE ON control.tax_group_component FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('tenant','Tax Group component changed');
DROP TRIGGER IF EXISTS trg_fin_ready_tax_resolution_rule ON control.tax_resolution_rule;
CREATE TRIGGER trg_fin_ready_tax_resolution_rule AFTER INSERT OR UPDATE OR DELETE ON control.tax_resolution_rule FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('tenant','Tax Resolution rule changed');
DROP TRIGGER IF EXISTS trg_fin_ready_wht_threshold ON control.wht_threshold_config;
CREATE TRIGGER trg_fin_ready_wht_threshold AFTER INSERT OR UPDATE OR DELETE ON control.wht_threshold_config FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('tenant','WHT threshold changed');
DROP TRIGGER IF EXISTS trg_fin_ready_tax_registration ON master.organization_tax_registration;
CREATE TRIGGER trg_fin_ready_tax_registration AFTER INSERT OR UPDATE OR DELETE ON master.organization_tax_registration FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('tenant','Tax registration changed');

-- Payments and settlement
DROP TRIGGER IF EXISTS trg_fin_ready_payment_term ON master.payment_term;
CREATE TRIGGER trg_fin_ready_payment_term AFTER INSERT OR UPDATE OR DELETE ON master.payment_term FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('tenant','Payment Term changed');
DROP TRIGGER IF EXISTS trg_fin_ready_payment_term_clause ON master.payment_term_clause;
CREATE TRIGGER trg_fin_ready_payment_term_clause AFTER INSERT OR UPDATE OR DELETE ON master.payment_term_clause FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('tenant','Payment Term clause changed');
DROP TRIGGER IF EXISTS trg_fin_ready_payment_term_discount ON master.payment_term_discount_tier;
CREATE TRIGGER trg_fin_ready_payment_term_discount AFTER INSERT OR UPDATE OR DELETE ON master.payment_term_discount_tier FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('tenant','Payment Term discount changed');
DROP TRIGGER IF EXISTS trg_fin_ready_payment_policy ON control.payment_method_company_policy;
CREATE TRIGGER trg_fin_ready_payment_policy AFTER INSERT OR UPDATE OR DELETE ON control.payment_method_company_policy FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('company_direct','Company payment policy changed');
DROP TRIGGER IF EXISTS trg_fin_ready_interface_binding ON control.payment_method_interface_binding;
CREATE TRIGGER trg_fin_ready_interface_binding AFTER INSERT OR UPDATE OR DELETE ON control.payment_method_interface_binding FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('company_optional','Payment interface binding changed');
DROP TRIGGER IF EXISTS trg_fin_ready_settlement_rule ON control.payment_settlement_rule;
CREATE TRIGGER trg_fin_ready_settlement_rule AFTER INSERT OR UPDATE OR DELETE ON control.payment_settlement_rule FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('company_direct','Settlement accounting rule changed');

-- Banking and Treasury. These definitions can be reused across Companies, so
-- ambiguous ownership is handled conservatively at tenant scope.
DROP TRIGGER IF EXISTS trg_fin_ready_bank_interface ON control.bank_interface_profile;
CREATE TRIGGER trg_fin_ready_bank_interface AFTER INSERT OR UPDATE OR DELETE ON control.bank_interface_profile FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('tenant','Bank interface changed');
DROP TRIGGER IF EXISTS trg_fin_ready_bank_party ON master.bank_party;
CREATE TRIGGER trg_fin_ready_bank_party AFTER INSERT OR UPDATE OR DELETE ON master.bank_party FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('tenant','Bank Party changed');
DROP TRIGGER IF EXISTS trg_fin_ready_bank_account ON master.bank_account;
CREATE TRIGGER trg_fin_ready_bank_account AFTER INSERT OR UPDATE OR DELETE ON master.bank_account FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('tenant','Bank Account changed');
DROP TRIGGER IF EXISTS trg_fin_ready_bank_link ON master.bank_account_link;
CREATE TRIGGER trg_fin_ready_bank_link AFTER INSERT OR UPDATE OR DELETE ON master.bank_account_link FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('company_optional','Bank Account Company link changed');
DROP TRIGGER IF EXISTS trg_fin_ready_house_bank ON master.bank_account_house_config;
CREATE TRIGGER trg_fin_ready_house_bank AFTER INSERT OR UPDATE OR DELETE ON master.bank_account_house_config FOR EACH ROW EXECUTE FUNCTION governance.trg_invalidate_finance_setup_certification('tenant','House Bank configuration changed');
