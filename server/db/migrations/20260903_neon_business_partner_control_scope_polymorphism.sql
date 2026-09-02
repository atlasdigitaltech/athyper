BEGIN;

-- The scope validator is shared by qualification, preference, and block
-- records. Table-specific fields must be read through the trigger row's JSON
-- shape or PostgreSQL resolves a missing NEW field before branch short-circuit.
CREATE OR REPLACE FUNCTION control.trg_validate_business_partner_control_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control, master
AS $$
DECLARE v_role master.partner_role_d;
BEGIN
  IF TG_TABLE_NAME='business_partner_qualification' THEN v_role:=NEW.partner_role;
  ELSIF TG_TABLE_NAME='supplier_preference_designation' THEN v_role:='supplier';
  ELSIF NEW.partner_role_scope<>'all' THEN v_role:=NEW.partner_role_scope::text::master.partner_role_d;END IF;
  IF v_role='supplier' AND NOT EXISTS(SELECT 1 FROM master.supplier WHERE tenant_id=NEW.tenant_id AND business_partner_id=NEW.business_partner_id AND status<>'archived') THEN RAISE EXCEPTION 'Business partner % has no supplier role',NEW.business_partner_id USING ERRCODE='check_violation';
  ELSIF v_role='customer' AND NOT EXISTS(SELECT 1 FROM master.customer WHERE tenant_id=NEW.tenant_id AND business_partner_id=NEW.business_partner_id AND status<>'archived') THEN RAISE EXCEPTION 'Business partner % has no customer role',NEW.business_partner_id USING ERRCODE='check_violation';END IF;
  IF NEW.operating_organization_id IS NOT NULL AND NEW.company_code_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM master.operating_organization_company_assignment assignment
    WHERE assignment.tenant_id=NEW.tenant_id AND assignment.operating_organization_id=NEW.operating_organization_id AND assignment.company_code_id=NEW.company_code_id
      AND assignment.status='active' AND assignment.effective_from<=COALESCE(NEW.effective_from,CURRENT_DATE)
      AND(assignment.effective_until IS NULL OR assignment.effective_until>COALESCE(NEW.effective_from,CURRENT_DATE))
      AND(TG_TABLE_NAME<>'supplier_preference_designation' OR assignment.effective_until IS NULL OR(NEW.effective_until IS NOT NULL AND assignment.effective_until>=NEW.effective_until))
  ) THEN RAISE EXCEPTION 'Company code % does not actively participate in operating organization %',NEW.company_code_id,NEW.operating_organization_id USING ERRCODE='check_violation';END IF;
  IF TG_TABLE_NAME='business_partner_qualification' AND(to_jsonb(NEW)->>'commodity_capability_id') IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM master.business_partner_commodity_capability capability WHERE capability.tenant_id=NEW.tenant_id
      AND capability.id=(to_jsonb(NEW)->>'commodity_capability_id')::uuid AND capability.business_partner_id=NEW.business_partner_id
      AND capability.partner_role=(to_jsonb(NEW)->>'partner_role')::master.partner_role_d
  ) THEN RAISE EXCEPTION 'Commodity capability does not belong to the selected partner role' USING ERRCODE='check_violation';END IF;
  IF TG_TABLE_NAME='supplier_preference_designation' AND NOT EXISTS(
    SELECT 1 FROM master.supplier supplier WHERE supplier.tenant_id=NEW.tenant_id AND supplier.id=(to_jsonb(NEW)->>'supplier_id')::uuid
      AND supplier.business_partner_id=NEW.business_partner_id AND supplier.status<>'archived'
  ) THEN RAISE EXCEPTION 'Supplier does not belong to the selected business partner' USING ERRCODE='check_violation';END IF;
  IF TG_TABLE_NAME='supplier_preference_designation' AND NOT EXISTS(
    SELECT 1 FROM master.business_partner_operating_organization_assignment assignment WHERE assignment.tenant_id=NEW.tenant_id
      AND assignment.business_partner_id=NEW.business_partner_id AND assignment.operating_organization_id=NEW.operating_organization_id
      AND assignment.partner_role='supplier' AND assignment.status='active' AND assignment.effective_from<=NEW.effective_from
      AND(assignment.effective_until IS NULL OR assignment.effective_until>NEW.effective_from)
      AND(assignment.effective_until IS NULL OR(NEW.effective_until IS NOT NULL AND assignment.effective_until>=NEW.effective_until))
  ) THEN RAISE EXCEPTION 'Supplier is not actively assigned to the selected operating organization at effective start' USING ERRCODE='check_violation';END IF;
  IF TG_TABLE_NAME='supplier_preference_designation' AND(to_jsonb(NEW)->>'commodity_category_id') IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM master.business_partner_commodity_capability capability WHERE capability.tenant_id=NEW.tenant_id
      AND capability.business_partner_id=NEW.business_partner_id AND capability.partner_role='supplier'
      AND capability.commodity_category_id=(to_jsonb(NEW)->>'commodity_category_id')::uuid AND capability.status='active'
      AND capability.effective_from<=NEW.effective_from AND(capability.effective_until IS NULL OR capability.effective_until>NEW.effective_from)
      AND(capability.effective_until IS NULL OR(NEW.effective_until IS NOT NULL AND capability.effective_until>=NEW.effective_until))
  ) THEN RAISE EXCEPTION 'Supplier has no active capability for the selected commodity category at effective start' USING ERRCODE='check_violation';END IF;
  IF TG_TABLE_NAME='business_partner_qualification' AND(to_jsonb(NEW)->>'risk_assessment_id') IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM master.party_risk_assessment assessment WHERE assessment.tenant_id=NEW.tenant_id
      AND assessment.id=(to_jsonb(NEW)->>'risk_assessment_id')::uuid AND assessment.business_partner_id=NEW.business_partner_id
  ) THEN RAISE EXCEPTION 'Risk assessment does not belong to the selected business partner' USING ERRCODE='check_violation';END IF;
  RETURN NEW;
END;
$$;

COMMIT;
