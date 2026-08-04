CREATE TRIGGER certification_type_updated_at
  BEFORE UPDATE ON master.certification_type
  FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER certification_updated_at
  BEFORE UPDATE ON master.certification
  FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER certification_status_changed
  BEFORE UPDATE ON master.certification
  FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER certification_validate_type_scope
  BEFORE INSERT OR UPDATE OF tenant_id, certification_type_id
  ON master.certification
  FOR EACH ROW EXECUTE FUNCTION master.trg_validate_certification_type_scope();
