DROP TRIGGER IF EXISTS trg_posting_role_alias_updated_at ON control.posting_role_alias;
CREATE TRIGGER trg_posting_role_alias_updated_at BEFORE UPDATE ON control.posting_role_alias
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
DROP TRIGGER IF EXISTS trg_posting_role_alias_status_changed ON control.posting_role_alias;
CREATE TRIGGER trg_posting_role_alias_status_changed BEFORE UPDATE ON control.posting_role_alias
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();

DROP TRIGGER IF EXISTS trg_pram_updated_at ON control.posting_role_account_map;
CREATE TRIGGER trg_pram_updated_at BEFORE UPDATE ON control.posting_role_account_map
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at();
DROP TRIGGER IF EXISTS trg_pram_status_changed ON control.posting_role_account_map;
CREATE TRIGGER trg_pram_status_changed BEFORE UPDATE ON control.posting_role_account_map
    FOR EACH ROW EXECUTE FUNCTION shared.trg_set_status_changed();
DROP TRIGGER IF EXISTS trg_pram_validate ON control.posting_role_account_map;
CREATE TRIGGER trg_pram_validate
    BEFORE INSERT OR UPDATE OF tenant_id, company_code_id, ledger_book_id,
        posting_role_code, gl_account_id, effective_from, effective_to, priority, status
    ON control.posting_role_account_map
    FOR EACH ROW EXECUTE FUNCTION control.trg_validate_posting_role_account_map();

