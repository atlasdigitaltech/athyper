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

CREATE TRIGGER trg_address_05_normalize
BEFORE INSERT OR UPDATE OF
    address_type, address_kind, street_name, house_number, house_number_suffix,
    building_name, floor, room, entrance, unit,
    line1, line2, line3,
    city, dependent_locality, region, state_region_code, postal_code,
    po_box, po_box_postal_code, po_box_city, delivery_service_type, delivery_service_number,
    country_code, timezone_code, normalization_version, format_version, formatted_address
ON master.address
FOR EACH ROW EXECUTE FUNCTION master.trg_normalize_address();

CREATE TRIGGER trg_address_10_postal_validation
BEFORE INSERT OR UPDATE OF country_code, postal_code
ON master.address
FOR EACH ROW EXECUTE FUNCTION master.trg_validate_address_postal_code();

CREATE TRIGGER trg_address_20_identity_immutable
BEFORE UPDATE
ON master.address
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_address_identity();

CREATE TRIGGER trg_address_link_05_usage_guard
BEFORE INSERT OR UPDATE OF
    usage_status, usage_denied_reason_code, usage_denied_at, usage_denied_by
ON master.address_link
FOR EACH ROW EXECUTE FUNCTION master.trg_validate_address_link_usage();

CREATE TRIGGER trg_address_event_immutable
BEFORE UPDATE OR DELETE ON master.address_event
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_address_event_immutable();

CREATE TRIGGER trg_address_link_10_active_address_guard
BEFORE INSERT OR UPDATE OF address_id, usage_status
ON master.address_link
FOR EACH ROW EXECUTE FUNCTION master.trg_validate_address_link_target_status();

SELECT audit.install_schema_row_triggers('master');
