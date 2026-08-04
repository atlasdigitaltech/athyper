CREATE TRIGGER tenant_usage_counter_updated_at
BEFORE UPDATE ON runtime_meta.tenant_usage_counter
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
