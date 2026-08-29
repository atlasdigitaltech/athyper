BEGIN;

DO $guard$ BEGIN
  IF current_database()<>'athyper_neon' OR current_setting('app.database_plane',true)<>'neon' THEN
    RAISE EXCEPTION 'Supplier preference scope coverage migration requires the NEON plane';
  END IF;
END $guard$;

CREATE OR REPLACE FUNCTION control.trg_validate_supplier_preference_scope() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,control,master AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM master.supplier supplier WHERE supplier.tenant_id=NEW.tenant_id AND supplier.id=NEW.supplier_id AND supplier.business_partner_id=NEW.business_partner_id AND supplier.status<>'archived') THEN RAISE EXCEPTION 'Supplier does not belong to the selected business partner' USING ERRCODE='check_violation'; END IF;
  IF NOT EXISTS (SELECT 1 FROM master.business_partner_operating_organization_assignment assignment WHERE assignment.tenant_id=NEW.tenant_id AND assignment.business_partner_id=NEW.business_partner_id AND assignment.operating_organization_id=NEW.operating_organization_id AND assignment.partner_role='supplier' AND assignment.status='active' AND assignment.effective_from<=NEW.effective_from AND (assignment.effective_until IS NULL OR (NEW.effective_until IS NOT NULL AND assignment.effective_until>=NEW.effective_until))) THEN RAISE EXCEPTION 'Supplier assignment does not cover the full preference effective range' USING ERRCODE='check_violation'; END IF;
  IF NEW.company_code_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM master.operating_organization_company_assignment assignment WHERE assignment.tenant_id=NEW.tenant_id AND assignment.operating_organization_id=NEW.operating_organization_id AND assignment.company_code_id=NEW.company_code_id AND assignment.status='active' AND assignment.effective_from<=NEW.effective_from AND (assignment.effective_until IS NULL OR (NEW.effective_until IS NOT NULL AND assignment.effective_until>=NEW.effective_until))) THEN RAISE EXCEPTION 'Organization-company assignment does not cover the full preference effective range' USING ERRCODE='check_violation'; END IF;
  IF NEW.commodity_category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM master.business_partner_commodity_capability capability WHERE capability.tenant_id=NEW.tenant_id AND capability.business_partner_id=NEW.business_partner_id AND capability.partner_role='supplier' AND capability.commodity_category_id=NEW.commodity_category_id AND capability.status='active' AND capability.effective_from<=NEW.effective_from AND (capability.effective_until IS NULL OR (NEW.effective_until IS NOT NULL AND capability.effective_until>=NEW.effective_until))) THEN RAISE EXCEPTION 'Commodity capability does not cover the full preference effective range' USING ERRCODE='check_violation'; END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION control.trg_validate_supplier_preference_scope() FROM PUBLIC;

COMMIT;
