CREATE TRIGGER trg_business_partner_qualification_10_lookup
BEFORE INSERT OR UPDATE OF qualification_type_code
ON control.business_partner_qualification
FOR EACH ROW
EXECUTE FUNCTION control.trg_validate_business_partner_control_lookup();

CREATE TRIGGER trg_business_partner_qualification_20_scope
BEFORE INSERT OR UPDATE OF tenant_id, business_partner_id, partner_role,
    operating_organization_id, company_code_id, commodity_capability_id,
    risk_assessment_id
ON control.business_partner_qualification
FOR EACH ROW
EXECUTE FUNCTION control.trg_validate_business_partner_control_scope();

CREATE TRIGGER trg_business_partner_qualification_30_guard
BEFORE INSERT OR UPDATE
ON control.business_partner_qualification
FOR EACH ROW
EXECUTE FUNCTION control.trg_guard_business_partner_qualification();

CREATE TRIGGER trg_business_partner_qualification_40_updated
BEFORE UPDATE ON control.business_partner_qualification
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_business_partner_block_10_operation_lookup
BEFORE INSERT OR UPDATE OF operation_code
ON control.business_partner_block
FOR EACH ROW
EXECUTE FUNCTION control.trg_validate_business_partner_control_lookup('operation');

CREATE TRIGGER trg_business_partner_block_20_reason_lookup
BEFORE INSERT OR UPDATE OF reason_code
ON control.business_partner_block
FOR EACH ROW
EXECUTE FUNCTION control.trg_validate_business_partner_control_lookup('reason');

CREATE TRIGGER trg_business_partner_block_30_scope
BEFORE INSERT OR UPDATE OF tenant_id, business_partner_id, partner_role_scope,
    operating_organization_id, company_code_id
ON control.business_partner_block
FOR EACH ROW
EXECUTE FUNCTION control.trg_validate_business_partner_control_scope();

CREATE TRIGGER trg_business_partner_block_40_guard
BEFORE INSERT OR UPDATE
ON control.business_partner_block
FOR EACH ROW
EXECUTE FUNCTION control.trg_guard_business_partner_block();

CREATE TRIGGER trg_business_partner_block_50_updated
BEFORE UPDATE ON control.business_partner_block
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
