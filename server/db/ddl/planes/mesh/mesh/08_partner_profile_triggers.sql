CREATE TRIGGER trg_network_account_profile_guard
BEFORE UPDATE ON mesh.network_account_profile
FOR EACH ROW EXECUTE FUNCTION mesh.trg_guard_network_identity();
CREATE TRIGGER trg_network_account_profile_status
BEFORE UPDATE OF status ON mesh.network_account_profile
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_network_account_profile_updated
BEFORE UPDATE ON mesh.network_account_profile
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_network_account_commodity_capability_role
BEFORE INSERT OR UPDATE OF tenant_id, network_account_id, trade_role
ON mesh.network_account_commodity_capability
FOR EACH ROW EXECUTE FUNCTION mesh.trg_validate_profile_trade_role();
CREATE TRIGGER trg_network_account_commodity_capability_guard
BEFORE UPDATE ON mesh.network_account_commodity_capability
FOR EACH ROW EXECUTE FUNCTION mesh.trg_guard_network_identity();
CREATE TRIGGER trg_network_account_commodity_capability_status
BEFORE UPDATE OF status ON mesh.network_account_commodity_capability
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_network_account_commodity_capability_updated
BEFORE UPDATE ON mesh.network_account_commodity_capability
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_network_account_tax_registration_validate
BEFORE INSERT OR UPDATE OF registration_type_code, registration_number
ON mesh.network_account_tax_registration
FOR EACH ROW EXECUTE FUNCTION mesh.trg_validate_tax_registration_type();
CREATE TRIGGER trg_network_account_tax_registration_guard
BEFORE UPDATE ON mesh.network_account_tax_registration
FOR EACH ROW EXECUTE FUNCTION mesh.trg_guard_network_identity();
CREATE TRIGGER trg_network_account_tax_registration_status
BEFORE UPDATE OF status ON mesh.network_account_tax_registration
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_network_account_tax_registration_updated
BEFORE UPDATE ON mesh.network_account_tax_registration
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_mesh_bank_party_normalize
BEFORE INSERT OR UPDATE OF code, name, bic ON mesh.bank_party
FOR EACH ROW EXECUTE FUNCTION mesh.trg_normalize_bank_identity();
CREATE TRIGGER trg_mesh_bank_party_status
BEFORE UPDATE OF status ON mesh.bank_party
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_mesh_bank_party_updated
BEFORE UPDATE ON mesh.bank_party
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_mesh_bank_account_normalize
BEFORE INSERT OR UPDATE OF code, name, account_holder_name,
    account_id_value, bic_override
ON mesh.bank_account
FOR EACH ROW EXECUTE FUNCTION mesh.trg_normalize_bank_identity();
CREATE TRIGGER trg_mesh_bank_account_guard
BEFORE UPDATE ON mesh.bank_account
FOR EACH ROW EXECUTE FUNCTION mesh.trg_guard_bank_account_identity();
CREATE TRIGGER trg_mesh_bank_account_status
BEFORE UPDATE OF status ON mesh.bank_account
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_mesh_bank_account_updated
BEFORE UPDATE ON mesh.bank_account
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_mesh_bank_account_link_guard
BEFORE UPDATE ON mesh.bank_account_link
FOR EACH ROW EXECUTE FUNCTION mesh.trg_guard_network_identity();
CREATE TRIGGER trg_mesh_bank_account_link_updated
BEFORE UPDATE ON mesh.bank_account_link
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_bank_account_disclosure_validate
BEFORE INSERT OR UPDATE OF owner_tenant_id, owner_account_id,
    network_relationship_id, recipient_tenant_id, recipient_account_id, purpose
ON mesh.bank_account_disclosure
FOR EACH ROW EXECUTE FUNCTION mesh.trg_validate_bank_disclosure();
CREATE TRIGGER trg_bank_account_disclosure_guard
BEFORE UPDATE ON mesh.bank_account_disclosure
FOR EACH ROW EXECUTE FUNCTION mesh.trg_guard_bank_disclosure();
CREATE TRIGGER trg_bank_account_disclosure_updated
BEFORE UPDATE ON mesh.bank_account_disclosure
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
