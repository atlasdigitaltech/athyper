DROP TRIGGER IF EXISTS trg_bank_interface_nonsecret_config ON control.bank_interface_profile;
CREATE TRIGGER trg_bank_interface_nonsecret_config
    BEFORE INSERT OR UPDATE OF config ON control.bank_interface_profile
    FOR EACH ROW EXECUTE FUNCTION control.guard_bank_interface_nonsecret_config();

DROP TRIGGER IF EXISTS trg_fx_policy_scope ON control.fx_policy;
CREATE TRIGGER trg_fx_policy_scope
    BEFORE INSERT OR UPDATE OF tenant_id, company_code_id, ledger_book_id, status
    ON control.fx_policy
    FOR EACH ROW EXECUTE FUNCTION control.guard_fx_policy_scope();

DROP TRIGGER IF EXISTS trg_fx_policy_immutable ON control.fx_policy;
CREATE TRIGGER trg_fx_policy_immutable
    BEFORE UPDATE OR DELETE ON control.fx_policy
    FOR EACH ROW EXECUTE FUNCTION control.guard_fx_policy_immutable();
