CREATE TRIGGER trg_network_document_type_10_guard
BEFORE INSERT OR UPDATE OR DELETE ON control.network_document_type
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_network_document_type();

CREATE TRIGGER trg_network_document_type_20_status_changed
BEFORE UPDATE OF status ON control.network_document_type
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER trg_network_document_type_90_updated_at
BEFORE UPDATE ON control.network_document_type
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
