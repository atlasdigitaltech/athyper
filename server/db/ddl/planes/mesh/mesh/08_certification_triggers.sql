CREATE TRIGGER mesh_certification_type_updated_at
  BEFORE UPDATE ON mesh.certification_type
  FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER mesh_certification_updated_at
  BEFORE UPDATE ON mesh.certification
  FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER mesh_certification_status_changed
  BEFORE UPDATE ON mesh.certification
  FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER mesh_certification_validate_type_scope
  BEFORE INSERT OR UPDATE OF tenant_id, certification_type_id
  ON mesh.certification
  FOR EACH ROW EXECUTE FUNCTION mesh.trg_validate_certification_type_scope();
