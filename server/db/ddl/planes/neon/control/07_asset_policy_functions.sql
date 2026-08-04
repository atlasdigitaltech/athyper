CREATE OR REPLACE FUNCTION control.trg_validate_asset_class_book_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, control, master
AS $$
DECLARE
    v_book_currency character(3);
    v_asset_nature master.asset_nature_d;
BEGIN
    SELECT asset_class.asset_nature
      INTO v_asset_nature
      FROM master.asset_class
     WHERE tenant_id = NEW.tenant_id
       AND id = NEW.asset_class_id;

    IF v_asset_nature IS NULL THEN
        RAISE EXCEPTION 'asset class does not exist in tenant'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_asset_nature IN ('land', 'cwip')
       AND NEW.depreciation_method <> 'no_depreciation' THEN
        RAISE EXCEPTION 'land and CWIP policies must use no_depreciation'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT COALESCE(assignment.override_currency_code, book.base_currency_code)
      INTO v_book_currency
      FROM master.company_code_book_assignment AS assignment
      JOIN master.ledger_book AS book
        ON book.tenant_id = assignment.tenant_id
       AND book.id = assignment.book_id
     WHERE assignment.tenant_id = NEW.tenant_id
       AND assignment.company_code_id = NEW.company_code_id
       AND assignment.book_id = NEW.ledger_book_id
       AND assignment.status = 'active'
       AND assignment.effective_from <= NEW.effective_from
       AND (assignment.effective_to IS NULL OR assignment.effective_to >= NEW.effective_from)
     ORDER BY assignment.priority DESC, assignment.effective_from DESC
     LIMIT 1;

    IF v_book_currency IS NULL THEN
        RAISE EXCEPTION 'ledger book is not actively assigned to this company on policy effective_from'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF NEW.capitalization_threshold > 0
       AND NEW.capitalization_currency <> v_book_currency THEN
        RAISE EXCEPTION 'capitalization currency % must equal assigned ledger-book currency %',
            NEW.capitalization_currency, v_book_currency
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;
