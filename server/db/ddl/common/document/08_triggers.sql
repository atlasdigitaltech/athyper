CREATE TRIGGER work_item_identity_guard
BEFORE UPDATE ON document.work_item
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_work_item_identity();
CREATE TRIGGER work_item_status_changed
BEFORE UPDATE OF status ON document.work_item
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER work_item_updated_at
BEFORE UPDATE ON document.work_item
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
