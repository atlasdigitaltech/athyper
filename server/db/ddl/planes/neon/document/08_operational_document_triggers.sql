DO $$
DECLARE v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'asset_transaction','fx_revaluation_run','intercompany_agreement',
        'intercompany_transaction','ic_elimination','match_exception','netting_batch',
        'obligation_horizon','payment_remittance_output','wht_certificate',
        'import_request','import_request_chunk','render_output','user_profile_update_request'
    ] LOOP
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE ON document.%I FOR EACH ROW EXECUTE FUNCTION document.trg_guard_creation_evidence()',
            v_table || '_05_creation_guard',v_table
        );
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE ON document.%I FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()',
            v_table || '_90_updated_at',v_table
        );
    END LOOP;

    FOREACH v_table IN ARRAY ARRAY[
        'asset_transaction','fx_revaluation_run','intercompany_agreement',
        'intercompany_transaction','ic_elimination','netting_batch',
        'obligation_horizon','import_request_chunk','render_output','user_profile_update_request'
    ] LOOP
        EXECUTE format(
            'CREATE TRIGGER %I BEFORE UPDATE OF status ON document.%I FOR EACH ROW EXECUTE FUNCTION document.trg_stamp_status_evidence()',
            v_table || '_20_status_evidence',v_table
        );
    END LOOP;
END $$;

CREATE TRIGGER import_request_chunk_10_guard
BEFORE UPDATE ON document.import_request_chunk
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_import_request_chunk();

CREATE TRIGGER render_output_10_state
BEFORE UPDATE OF status ON document.render_output
FOR EACH ROW EXECUTE FUNCTION document.trg_guard_render_output_state();

CREATE TRIGGER asset_transaction_10_coordinates
BEFORE INSERT OR UPDATE OF tenant_id,company_code_id,asset_id,asset_book_id,book_type,depreciation_run_id,depreciation_run_line_id
ON document.asset_transaction FOR EACH ROW
EXECUTE FUNCTION document.trg_validate_asset_transaction();

CREATE TRIGGER match_exception_80_rollup
AFTER INSERT OR UPDATE OR DELETE ON document.match_exception
FOR EACH ROW EXECUTE FUNCTION document.trg_rollup_match_exceptions();

CREATE TRIGGER payment_term_discount_result_10_immutable
BEFORE UPDATE OR DELETE ON document.payment_term_discount_result
FOR EACH ROW EXECUTE FUNCTION document.trg_reject_update();
