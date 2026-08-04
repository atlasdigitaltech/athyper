DO $$
BEGIN
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
        GRANT SELECT,INSERT,UPDATE ON
            document.asset_transaction,
            document.fx_revaluation_run,
            document.ic_elimination,
            document.match_exception,
            document.netting_batch,
            document.obligation_horizon,
            document.payment_remittance_output,
            document.wht_certificate,
            document.import_request,
            document.import_request_chunk,
            document.intercompany_agreement,
            document.intercompany_transaction,
            document.render_output,
            document.user_profile_update_request
        TO athyperapp;
        GRANT SELECT,INSERT ON document.payment_term_discount_result TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_validate_asset_transaction() TO athyperapp;
        GRANT EXECUTE ON FUNCTION document.trg_rollup_match_exceptions() TO athyperapp;
    END IF;

    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
        GRANT ALL PRIVILEGES ON
            document.asset_transaction,
            document.fx_revaluation_run,
            document.ic_elimination,
            document.match_exception,
            document.netting_batch,
            document.obligation_horizon,
            document.payment_remittance_output,
            document.payment_term_discount_result,
            document.wht_certificate,
            document.import_request,
            document.import_request_chunk,
            document.intercompany_agreement,
            document.intercompany_transaction,
            document.render_output,
            document.user_profile_update_request
        TO athyperadmin;
        GRANT EXECUTE ON FUNCTION document.trg_validate_asset_transaction() TO athyperadmin;
        GRANT EXECUTE ON FUNCTION document.trg_rollup_match_exceptions() TO athyperadmin;
    END IF;
END $$;
