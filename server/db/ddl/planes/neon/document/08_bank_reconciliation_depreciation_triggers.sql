DO $$
DECLARE v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'bank_statement','bank_statement_line','bank_recon_case','bank_recon_case_line',
        'depreciation_run','depreciation_run_line','depreciation_schedule'
    ] LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_00_created_by BEFORE INSERT ON document.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION document.trg_set_commerce_created_by()',v_table
        );
    END LOOP;

    FOREACH v_table IN ARRAY ARRAY[
        'bank_statement','bank_statement_line','bank_recon_case',
        'depreciation_run','depreciation_run_line','depreciation_schedule'
    ] LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_05_creation_guard BEFORE UPDATE ON document.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence()',v_table
        );
    END LOOP;

    FOREACH v_table IN ARRAY ARRAY[
        'bank_statement','bank_recon_case','depreciation_run','depreciation_schedule'
    ] LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_20_status_evidence BEFORE UPDATE ON document.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION document.trg_stamp_status_evidence()',v_table
        );
    END LOOP;

    FOREACH v_table IN ARRAY ARRAY[
        'bank_statement','bank_statement_line','bank_recon_case',
        'depreciation_run','depreciation_schedule'
    ] LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_90_updated_at BEFORE UPDATE ON document.%1$I '
            'FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()',v_table
        );
    END LOOP;
END;
$$;

CREATE TRIGGER trg_bank_statement_10_contract
BEFORE INSERT OR UPDATE OF tenant_id,company_code_id,bank_account_id,period_start_date,period_end_date,currency_code
ON document.bank_statement FOR EACH ROW EXECUTE FUNCTION document.trg_validate_bank_statement();
CREATE TRIGGER trg_bank_statement_15_state
BEFORE INSERT OR UPDATE ON document.bank_statement
FOR EACH ROW EXECUTE FUNCTION document.trg_manage_bank_statement_state();

CREATE TRIGGER trg_bank_statement_line_15_guard
BEFORE INSERT OR UPDATE ON document.bank_statement_line
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_bank_statement_line();
CREATE TRIGGER trg_bank_statement_line_15_delete
BEFORE DELETE ON document.bank_statement_line
FOR EACH ROW EXECUTE FUNCTION document.trg_reject_update();

CREATE TRIGGER trg_bank_recon_case_15_state
BEFORE INSERT OR UPDATE ON document.bank_recon_case
FOR EACH ROW EXECUTE FUNCTION document.trg_manage_bank_recon_case();
CREATE TRIGGER trg_bank_recon_case_80_projection
AFTER UPDATE OF status ON document.bank_recon_case
FOR EACH ROW EXECUTE FUNCTION document.trg_after_bank_recon_case_state();

CREATE TRIGGER trg_bank_recon_case_line_10_contract
BEFORE INSERT ON document.bank_recon_case_line
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_bank_recon_line();
CREATE TRIGGER trg_bank_recon_case_line_15_immutable
BEFORE UPDATE OR DELETE ON document.bank_recon_case_line
FOR EACH ROW EXECUTE FUNCTION document.trg_reject_update();
CREATE TRIGGER trg_bank_recon_case_line_80_projection
AFTER INSERT ON document.bank_recon_case_line
FOR EACH ROW EXECUTE FUNCTION document.trg_after_bank_recon_line();

CREATE TRIGGER trg_depreciation_run_10_contract
BEFORE INSERT OR UPDATE OF tenant_id,company_code_id,ledger_book_id,fiscal_period_id,currency_code,reversal_of_run_id
ON document.depreciation_run FOR EACH ROW EXECUTE FUNCTION document.trg_validate_depreciation_run();
CREATE TRIGGER trg_depreciation_run_15_state
BEFORE INSERT OR UPDATE ON document.depreciation_run
FOR EACH ROW EXECUTE FUNCTION document.trg_manage_depreciation_run();
CREATE TRIGGER trg_depreciation_run_80_post
AFTER UPDATE OF status ON document.depreciation_run
FOR EACH ROW EXECUTE FUNCTION document.trg_post_depreciation_run();

CREATE TRIGGER trg_depreciation_run_line_10_contract
BEFORE INSERT OR UPDATE ON document.depreciation_run_line
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_depreciation_line();
CREATE TRIGGER trg_depreciation_run_line_15_immutable
BEFORE UPDATE OR DELETE ON document.depreciation_run_line
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_depreciation_line();

CREATE TRIGGER trg_depreciation_schedule_15_contract
BEFORE INSERT OR UPDATE ON document.depreciation_schedule
FOR EACH ROW EXECUTE FUNCTION document.trg_validate_depreciation_schedule();
