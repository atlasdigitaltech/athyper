CREATE TRIGGER trg_contact_person_05_normalize
BEFORE INSERT OR UPDATE OF contact_name, business_title, department_name
ON master.contact_person
FOR EACH ROW EXECUTE FUNCTION master.trg_normalize_contact_person();

CREATE TRIGGER trg_contact_person_10_owner
BEFORE INSERT OR UPDATE OF tenant_id, owner_type_id, owner_id
ON master.contact_person
FOR EACH ROW EXECUTE FUNCTION master.trg_validate_contact_person_owner();

CREATE TRIGGER trg_contact_person_15_guard
BEFORE UPDATE ON master.contact_person
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_contact_person_identity();

CREATE TRIGGER trg_contact_person_20_status
BEFORE UPDATE OF status ON master.contact_person
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_contact_person_30_updated
BEFORE UPDATE ON master.contact_person
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_contact_person_role_05_validate
BEFORE INSERT OR UPDATE OF tenant_id, role_code
ON master.contact_person_role
FOR EACH ROW EXECUTE FUNCTION master.trg_validate_contact_person_role();

CREATE TRIGGER trg_contact_person_role_10_guard
BEFORE UPDATE ON master.contact_person_role
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_contact_person_role();

CREATE TRIGGER trg_contact_person_role_30_updated
BEFORE UPDATE ON master.contact_person_role
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
