CREATE TRIGGER book_period_status_identity_guard
BEFORE INSERT OR UPDATE ON ledger.book_period_status
FOR EACH ROW EXECUTE FUNCTION ledger.trg_guard_book_period_identity();
CREATE TRIGGER book_period_status_status_changed
BEFORE UPDATE OF status ON ledger.book_period_status
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER book_period_status_updated_at
BEFORE UPDATE ON ledger.book_period_status
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
