CREATE TRIGGER numbering_policy_10_validate
BEFORE INSERT OR UPDATE ON control.numbering_policy
FOR EACH ROW EXECUTE FUNCTION control.trg_validate_numbering_policy();

CREATE TRIGGER numbering_policy_20_guard
BEFORE UPDATE ON control.numbering_policy
FOR EACH ROW EXECUTE FUNCTION control.trg_guard_numbering_policy();

CREATE TRIGGER numbering_policy_90_updated_at
BEFORE UPDATE ON control.numbering_policy
FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
