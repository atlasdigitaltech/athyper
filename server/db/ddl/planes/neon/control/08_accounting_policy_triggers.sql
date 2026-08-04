CREATE TRIGGER trg_accounting_profile_policy_00_validate
BEFORE INSERT OR UPDATE ON control.accounting_profile_policy
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_accounting_profile_policy();
CREATE TRIGGER trg_accounting_profile_policy_10_guard
BEFORE UPDATE OR DELETE ON control.accounting_profile_policy
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_accounting_policy_row();
CREATE TRIGGER trg_accounting_profile_policy_20_status
BEFORE UPDATE OF status ON control.accounting_profile_policy
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_accounting_profile_policy_90_updated
BEFORE UPDATE ON control.accounting_profile_policy
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_accounting_profile_event_00_guard
BEFORE INSERT OR UPDATE OR DELETE ON control.accounting_profile_event
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_accounting_profile_event();
CREATE TRIGGER trg_accounting_profile_entry_00_guard
BEFORE INSERT OR UPDATE OR DELETE ON control.accounting_profile_entry
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_accounting_profile_entry();

CREATE TRIGGER trg_accounting_profile_assignment_00_validate
BEFORE INSERT OR UPDATE ON control.accounting_profile_assignment
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_accounting_profile_assignment();
CREATE TRIGGER trg_accounting_profile_assignment_10_guard
BEFORE UPDATE OR DELETE ON control.accounting_profile_assignment
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_accounting_policy_row();
CREATE TRIGGER trg_accounting_profile_assignment_20_status
BEFORE UPDATE OF status ON control.accounting_profile_assignment
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_accounting_profile_assignment_90_updated
BEFORE UPDATE ON control.accounting_profile_assignment
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_posting_role_account_assignment_00_validate
BEFORE INSERT OR UPDATE ON control.posting_role_account_assignment
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_posting_role_account_assignment();
CREATE TRIGGER trg_posting_role_account_assignment_10_guard
BEFORE UPDATE OR DELETE ON control.posting_role_account_assignment
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_accounting_policy_row();
CREATE TRIGGER trg_posting_role_account_assignment_20_status
BEFORE UPDATE OF status ON control.posting_role_account_assignment
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_posting_role_account_assignment_90_updated
BEFORE UPDATE ON control.posting_role_account_assignment
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_cross_book_posting_policy_00_validate
BEFORE INSERT OR UPDATE ON control.cross_book_posting_policy
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_cross_book_posting_policy();
CREATE TRIGGER trg_cross_book_posting_policy_10_guard
BEFORE UPDATE OR DELETE ON control.cross_book_posting_policy
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_accounting_policy_row();
CREATE TRIGGER trg_cross_book_posting_policy_20_status
BEFORE UPDATE OF status ON control.cross_book_posting_policy
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
CREATE TRIGGER trg_cross_book_posting_policy_90_updated
BEFORE UPDATE ON control.cross_book_posting_policy
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();

CREATE TRIGGER trg_cross_book_account_assignment_00_guard
BEFORE INSERT OR UPDATE OR DELETE ON control.cross_book_account_assignment
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_cross_book_account_assignment();
