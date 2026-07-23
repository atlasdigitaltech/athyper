DROP TRIGGER IF EXISTS trg_otr_scope ON master.organization_tax_registration;
CREATE TRIGGER trg_otr_scope BEFORE INSERT OR UPDATE OF tenant_id,legal_entity_id,company_code_id
    ON master.organization_tax_registration FOR EACH ROW EXECUTE FUNCTION master.guard_organization_tax_registration_scope();
DROP TRIGGER IF EXISTS trg_otr_updated_at ON master.organization_tax_registration;
CREATE TRIGGER trg_otr_updated_at BEFORE UPDATE ON master.organization_tax_registration
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
