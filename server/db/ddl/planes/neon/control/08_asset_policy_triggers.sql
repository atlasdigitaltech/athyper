CREATE TRIGGER asset_class_book_policy_identity_guard
BEFORE UPDATE ON control.asset_class_book_policy
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_control_identity();

CREATE TRIGGER asset_class_book_policy_status_changed
BEFORE UPDATE OF status ON control.asset_class_book_policy
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

CREATE TRIGGER asset_class_book_policy_updated_at
BEFORE UPDATE ON control.asset_class_book_policy
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER asset_class_book_policy_validate
BEFORE INSERT OR UPDATE ON control.asset_class_book_policy
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_asset_class_book_policy();
