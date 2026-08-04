CREATE TRIGGER lookup_domain_updated_at
  BEFORE UPDATE ON control.lookup_domain
  FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER lookup_domain_status_changed
  BEFORE UPDATE ON control.lookup_domain
  FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER lookup_value_updated_at
  BEFORE UPDATE ON control.lookup_value
  FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
CREATE TRIGGER lookup_value_status_changed
  BEFORE UPDATE ON control.lookup_value
  FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER lookup_value_extensibility
  BEFORE INSERT OR UPDATE OF tenant_id, domain_code, is_system
  ON control.lookup_value
  FOR EACH ROW EXECUTE FUNCTION control.trg_enforce_lookup_extensibility();
