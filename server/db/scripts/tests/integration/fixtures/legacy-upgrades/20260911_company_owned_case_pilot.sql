BEGIN;
-- Storage for the separately published company-owned setup-request entity.
-- This migration creates no cases, permission definitions, grants or activation.
ALTER TABLE document.entity_case ADD COLUMN owner_company_code_id uuid;
ALTER TABLE document.entity_case ADD CONSTRAINT entity_case_company_owner_fk
 FOREIGN KEY(tenant_id,owner_company_code_id) REFERENCES master.company_code(tenant_id,id) ON DELETE RESTRICT;
ALTER TABLE document.entity_case ADD CONSTRAINT entity_case_company_pilot_owner_chk
 CHECK ((entity_code='master.business_partner_company_setup_request') = (owner_company_code_id IS NOT NULL));
CREATE OR REPLACE FUNCTION document.trg_company_owned_case() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
DECLARE payload jsonb;
BEGIN
 IF TG_OP='UPDATE' AND OLD.entity_code='master.business_partner_company_setup_request' AND
    (NEW.tenant_id,NEW.id,NEW.entity_code,NEW.owner_company_code_id,NEW.target_entity_id)
    IS DISTINCT FROM (OLD.tenant_id,OLD.id,OLD.entity_code,OLD.owner_company_code_id,OLD.target_entity_id) THEN
   RAISE EXCEPTION 'COMPANY_CASE_OWNER_IMMUTABLE' USING ERRCODE='check_violation';
 END IF;
 IF TG_OP='UPDATE' AND OLD.entity_code<>NEW.entity_code AND NEW.entity_code='master.business_partner_company_setup_request' THEN
   RAISE EXCEPTION 'COMPANY_CASE_RECLASSIFICATION_FORBIDDEN' USING ERRCODE='check_violation';
 END IF;
 IF NEW.entity_code<>'master.business_partner_company_setup_request' THEN RETURN NEW; END IF;
 SELECT payload_json INTO STRICT payload FROM snapshot.entity_snapshot
 WHERE tenant_id=NEW.tenant_id AND snapshot_id=NEW.current_snapshot_id;
 IF NEW.owner_company_code_id IS NULL OR NEW.target_entity_id IS NULL
    OR payload->>'companyCodeId' IS DISTINCT FROM NEW.owner_company_code_id::text
    OR NEW.operation_code IS DISTINCT FROM 'configure_company' THEN
   RAISE EXCEPTION 'COMPANY_CASE_SNAPSHOT_OWNER_MISMATCH' USING ERRCODE='check_violation';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM master.business_partner WHERE tenant_id=NEW.tenant_id AND id=NEW.target_entity_id)
    OR NOT EXISTS(SELECT 1 FROM master.company_code WHERE tenant_id=NEW.tenant_id AND id=NEW.owner_company_code_id AND status='active' AND is_active)
    OR NOT EXISTS(SELECT 1 FROM master.operating_organization o
      JOIN master.operating_organization_company_assignment a ON a.tenant_id=o.tenant_id AND a.operating_organization_id=o.id
      WHERE o.tenant_id=NEW.tenant_id AND o.id::text=payload->>'operatingOrganizationId' AND o.status='active'
       AND a.company_code_id=NEW.owner_company_code_id AND a.status='active'
       AND a.effective_from<=current_date AND (a.effective_until IS NULL OR a.effective_until>current_date)) THEN
   RAISE EXCEPTION 'COMPANY_CASE_CATALOG_INCOMPATIBLE' USING ERRCODE='check_violation';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER company_owned_case BEFORE INSERT OR UPDATE ON document.entity_case
 FOR EACH ROW EXECUTE FUNCTION document.trg_company_owned_case();
COMMIT;
