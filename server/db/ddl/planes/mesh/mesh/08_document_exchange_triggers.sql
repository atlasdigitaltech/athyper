CREATE TRIGGER trg_document_envelope_10_validate
BEFORE INSERT ON mesh.document_envelope
FOR EACH ROW EXECUTE FUNCTION mesh.trg_validate_document_envelope();

CREATE TRIGGER trg_document_envelope_20_guard
BEFORE UPDATE OR DELETE ON mesh.document_envelope
FOR EACH ROW EXECUTE FUNCTION mesh.trg_guard_document_envelope();

CREATE TRIGGER trg_document_envelope_30_status_changed
BEFORE UPDATE OF status ON mesh.document_envelope
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_document_envelope_90_updated_at
BEFORE UPDATE ON mesh.document_envelope
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_document_payload_20_guard
BEFORE UPDATE OR DELETE ON mesh.document_payload
FOR EACH ROW EXECUTE FUNCTION mesh.trg_guard_document_payload();

CREATE TRIGGER trg_document_payload_10_participant
BEFORE INSERT ON mesh.document_payload
FOR EACH ROW EXECUTE FUNCTION mesh.trg_validate_document_child_participant();

CREATE TRIGGER trg_document_payload_90_updated_at
BEFORE UPDATE ON mesh.document_payload
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_document_event_10_participant
BEFORE INSERT ON mesh.document_event
FOR EACH ROW EXECUTE FUNCTION mesh.trg_validate_document_child_participant();

CREATE TRIGGER trg_document_event_90_append_only
BEFORE UPDATE OR DELETE ON mesh.document_event
FOR EACH ROW EXECUTE FUNCTION mesh.trg_guard_append_only_document_child();

CREATE TRIGGER trg_document_acknowledgement_10_participant
BEFORE INSERT ON mesh.document_acknowledgement
FOR EACH ROW EXECUTE FUNCTION mesh.trg_validate_document_child_participant();

CREATE TRIGGER trg_document_acknowledgement_90_append_only
BEFORE UPDATE OR DELETE ON mesh.document_acknowledgement
FOR EACH ROW EXECUTE FUNCTION mesh.trg_guard_append_only_document_child();
