CREATE TRIGGER warehouse_10_identity_guard
BEFORE UPDATE ON master.warehouse
FOR EACH ROW EXECUTE FUNCTION master.trg_guard_warehouse_identity();

CREATE TRIGGER warehouse_20_type_lookup
BEFORE INSERT OR UPDATE OF warehouse_type ON master.warehouse
FOR EACH ROW EXECUTE FUNCTION master.trg_validate_warehouse_type();

CREATE TRIGGER warehouse_30_status_changed
BEFORE UPDATE OF status ON master.warehouse
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER warehouse_90_updated
BEFORE UPDATE ON master.warehouse
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
