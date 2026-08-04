CREATE OR REPLACE FUNCTION document.trg_validate_bank_statement()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document, master
AS $$
DECLARE v_account_currency character(3);
BEGIN
    SELECT currency_code INTO v_account_currency
      FROM master.bank_account
     WHERE tenant_id = NEW.tenant_id AND id = NEW.bank_account_id;
    IF FOUND AND v_account_currency <> NEW.currency_code THEN
        RAISE EXCEPTION 'Bank statement currency must match the bank account currency'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM master.bank_account_link l
         WHERE l.tenant_id = NEW.tenant_id
           AND l.bank_account_id = NEW.bank_account_id
           AND (l.company_code_id = NEW.company_code_id
                OR (l.owner_type = 'company_code' AND l.owner_id = NEW.company_code_id))
           AND l.effective_from <= NEW.period_end_date
           AND (l.effective_until IS NULL OR l.effective_until > NEW.period_start_date)
    ) THEN
        RAISE EXCEPTION 'Bank account is not linked to the statement company for this period'
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_manage_bank_statement_state()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE
    v_actor uuid := nullif(current_setting('app.current_principal_id', true), '')::uuid;
    v_line_count integer;
    v_open_count integer;
    v_net numeric(20,4);
BEGIN
    IF TG_OP='INSERT' AND NEW.status<>'imported' THEN
        RAISE EXCEPTION 'Bank statement must be created as imported' USING ERRCODE='check_violation';
    END IF;
    IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NOT (
        (OLD.status='imported' AND NEW.status IN ('matching','rejected')) OR
        (OLD.status='matching' AND NEW.status IN ('reconciled','rejected')) OR
        (OLD.status='reconciled' AND NEW.status IN ('matching','signed_off')) OR
        (OLD.status='signed_off' AND NEW.status='archived')
    ) THEN
        RAISE EXCEPTION 'Invalid bank statement status transition: % -> %',OLD.status,NEW.status USING ERRCODE='check_violation';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status IN ('archived', 'rejected') AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'Finalized bank statement is immutable'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF TG_OP='UPDATE' AND OLD.status='signed_off' AND NEW.status='archived'
       AND (to_jsonb(NEW)-ARRAY['status','status_changed_at','status_changed_by','updated_at','updated_by'])
           IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','status_changed_at','status_changed_by','updated_at','updated_by']) THEN
        RAISE EXCEPTION 'Archiving cannot alter signed-off bank statement facts' USING ERRCODE='check_violation';
    END IF;
    IF NEW.status IN ('reconciled', 'signed_off')
       AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
        SELECT count(*),
               count(*) FILTER (WHERE recon_status NOT IN ('matched', 'excluded')),
               coalesce(sum(amount), 0)
          INTO v_line_count, v_open_count, v_net
          FROM document.bank_statement_line
         WHERE tenant_id = NEW.tenant_id AND bank_statement_id = NEW.id;
        IF v_line_count = 0 OR v_open_count > 0 THEN
            RAISE EXCEPTION 'Reconciled bank statement requires lines and no unresolved reconciliation statuses'
                USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.opening_balance + v_net <> NEW.closing_balance THEN
            RAISE EXCEPTION 'Bank statement opening balance plus signed line amounts must equal closing balance'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    IF NEW.status = 'signed_off' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
        IF v_actor IS NULL THEN
            RAISE EXCEPTION 'Current principal context is required to sign off a bank statement'
                USING ERRCODE = 'insufficient_privilege';
        END IF;
        NEW.signed_off_at := statement_timestamp();
        NEW.signed_off_by := v_actor;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_bank_statement_line()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE v_header_status document.bank_statement_status_d;
BEGIN
    SELECT status INTO v_header_status FROM document.bank_statement
     WHERE tenant_id = NEW.tenant_id AND id = NEW.bank_statement_id;
    IF v_header_status IN ('signed_off', 'archived', 'rejected') THEN
        RAISE EXCEPTION 'Lines of a finalized bank statement are immutable'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF NEW.tenant_id <> OLD.tenant_id OR NEW.bank_statement_id <> OLD.bank_statement_id
           OR NEW.line_no <> OLD.line_no OR NEW.transaction_date <> OLD.transaction_date
           OR NEW.value_date IS DISTINCT FROM OLD.value_date OR NEW.description <> OLD.description
           OR NEW.reference_number IS DISTINCT FROM OLD.reference_number
           OR NEW.counterparty_name IS DISTINCT FROM OLD.counterparty_name
           OR NEW.counterparty_account IS DISTINCT FROM OLD.counterparty_account
           OR NEW.amount <> OLD.amount OR NEW.running_balance IS DISTINCT FROM OLD.running_balance
           OR NEW.currency_code <> OLD.currency_code OR NEW.transaction_type <> OLD.transaction_type
           OR NEW.idempotency_key <> OLD.idempotency_key OR NEW.raw_data <> OLD.raw_data
           OR NEW.created_at <> OLD.created_at OR NEW.created_by <> OLD.created_by THEN
            RAISE EXCEPTION 'Imported bank-statement facts and creation evidence are immutable'
                USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.recon_status IS DISTINCT FROM OLD.recon_status AND pg_trigger_depth() < 2 THEN
            IF NOT (
                NEW.recon_status IN ('excluded', 'unmatched')
                AND OLD.recon_status IN ('excluded', 'unmatched')
                AND NOT EXISTS (
                    SELECT 1 FROM document.bank_recon_case_line l
                    JOIN document.bank_recon_case c
                      ON c.tenant_id=l.tenant_id AND c.id=l.bank_recon_case_id
                   WHERE l.tenant_id=NEW.tenant_id AND l.bank_statement_line_id=NEW.id
                     AND c.status <> 'voided'
                )
            ) THEN
                RAISE EXCEPTION 'Reconciliation status is maintained from active reconciliation cases'
                    USING ERRCODE = 'check_violation';
            END IF;
        END IF;
    ELSE
        IF NEW.currency_code <> (
            SELECT currency_code FROM document.bank_statement
             WHERE tenant_id=NEW.tenant_id AND id=NEW.bank_statement_id
        ) THEN
            RAISE EXCEPTION 'Bank-statement line currency must match its header'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.refresh_bank_reconciliation_projections(
    p_tenant_id uuid,
    p_case_id uuid
)
RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE v_book numeric(20,4); v_bank numeric(20,4); v_line record; v_alloc numeric(20,4); v_amount numeric(20,4);
BEGIN
    SELECT coalesce(sum(amount) FILTER (WHERE side='payment'),0),
           coalesce(sum(amount) FILTER (WHERE side='statement'),0)
      INTO v_book, v_bank
      FROM document.bank_recon_case_line
     WHERE tenant_id=p_tenant_id AND bank_recon_case_id=p_case_id;
    UPDATE document.bank_recon_case
       SET book_amount=v_book, bank_amount=v_bank
     WHERE tenant_id=p_tenant_id AND id=p_case_id
       AND (book_amount IS DISTINCT FROM v_book OR bank_amount IS DISTINCT FROM v_bank);

    FOR v_line IN
        SELECT DISTINCT bank_statement_line_id AS id
          FROM document.bank_recon_case_line
         WHERE tenant_id=p_tenant_id AND bank_recon_case_id=p_case_id
           AND bank_statement_line_id IS NOT NULL
    LOOP
        SELECT abs(amount) INTO v_amount FROM document.bank_statement_line
         WHERE tenant_id=p_tenant_id AND id=v_line.id;
        SELECT coalesce(sum(l.amount),0) INTO v_alloc
          FROM document.bank_recon_case_line l
          JOIN document.bank_recon_case c ON c.tenant_id=l.tenant_id AND c.id=l.bank_recon_case_id
         WHERE l.tenant_id=p_tenant_id AND l.bank_statement_line_id=v_line.id
           AND c.status <> 'voided';
        UPDATE document.bank_statement_line
           SET recon_status = CASE WHEN v_alloc=0 THEN 'unmatched'
                                   WHEN v_alloc<v_amount THEN 'partially_matched'
                                   ELSE 'matched' END
         WHERE tenant_id=p_tenant_id AND id=v_line.id
           AND recon_status IS DISTINCT FROM CASE WHEN v_alloc=0 THEN 'unmatched'
                                                  WHEN v_alloc<v_amount THEN 'partially_matched'
                                                  ELSE 'matched' END;
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_bank_recon_line()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE
    v_case document.bank_recon_case%ROWTYPE;
    v_source_amount numeric(20,4);
    v_currency character(3);
    v_company uuid;
    v_existing numeric(20,4);
BEGIN
    SELECT * INTO v_case FROM document.bank_recon_case
     WHERE tenant_id=NEW.tenant_id AND id=NEW.bank_recon_case_id;
    IF v_case.status <> 'open' THEN
        RAISE EXCEPTION 'Reconciliation lines can only be added to an open case'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;

    IF NEW.side='payment' THEN
        PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text || ':payment:' || NEW.payment_entry_id::text,0));
        SELECT abs(coalesce(bank_currency_amount,payment_amount)),
               coalesce(bank_currency_code,currency_code), company_code_id
          INTO v_source_amount,v_currency,v_company
          FROM document.payment_entry
         WHERE tenant_id=NEW.tenant_id AND id=NEW.payment_entry_id;
        SELECT coalesce(sum(l.amount),0) INTO v_existing
          FROM document.bank_recon_case_line l
          JOIN document.bank_recon_case c ON c.tenant_id=l.tenant_id AND c.id=l.bank_recon_case_id
         WHERE l.tenant_id=NEW.tenant_id AND l.payment_entry_id=NEW.payment_entry_id
           AND c.status <> 'voided';
        IF EXISTS (
            SELECT 1 FROM document.bank_recon_case_line l
            JOIN document.bank_recon_case c ON c.tenant_id=l.tenant_id AND c.id=l.bank_recon_case_id
             WHERE l.tenant_id=NEW.tenant_id AND l.payment_entry_id=NEW.payment_entry_id
               AND l.bank_recon_case_id<>NEW.bank_recon_case_id AND c.status<>'voided'
        ) THEN RAISE EXCEPTION 'Payment is already allocated to another active reconciliation case' USING ERRCODE='unique_violation'; END IF;
    ELSE
        PERFORM pg_advisory_xact_lock(hashtextextended(NEW.tenant_id::text || ':statement:' || NEW.bank_statement_line_id::text,0));
        SELECT abs(l.amount),l.currency_code,s.company_code_id
          INTO v_source_amount,v_currency,v_company
          FROM document.bank_statement_line l
          JOIN document.bank_statement s ON s.tenant_id=l.tenant_id AND s.id=l.bank_statement_id
         WHERE l.tenant_id=NEW.tenant_id AND l.id=NEW.bank_statement_line_id;
        SELECT coalesce(sum(l.amount),0) INTO v_existing
          FROM document.bank_recon_case_line l
          JOIN document.bank_recon_case c ON c.tenant_id=l.tenant_id AND c.id=l.bank_recon_case_id
         WHERE l.tenant_id=NEW.tenant_id AND l.bank_statement_line_id=NEW.bank_statement_line_id
           AND c.status <> 'voided';
        IF EXISTS (
            SELECT 1 FROM document.bank_recon_case_line l
            JOIN document.bank_recon_case c ON c.tenant_id=l.tenant_id AND c.id=l.bank_recon_case_id
             WHERE l.tenant_id=NEW.tenant_id AND l.bank_statement_line_id=NEW.bank_statement_line_id
               AND l.bank_recon_case_id<>NEW.bank_recon_case_id AND c.status<>'voided'
        ) THEN RAISE EXCEPTION 'Statement line is already allocated to another active reconciliation case' USING ERRCODE='unique_violation'; END IF;
    END IF;
    IF v_company <> v_case.company_code_id OR v_currency <> v_case.currency_code THEN
        RAISE EXCEPTION 'Reconciliation source company and currency must match its case'
            USING ERRCODE = 'check_violation';
    END IF;
    IF v_existing + NEW.amount > v_source_amount THEN
        RAISE EXCEPTION 'Active reconciliation allocations exceed the source amount'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_after_bank_recon_line()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
BEGIN
    PERFORM document.refresh_bank_reconciliation_projections(NEW.tenant_id,NEW.bank_recon_case_id);
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_manage_bank_recon_case()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE v_actor uuid:=nullif(current_setting('app.current_principal_id',true),'')::uuid; v_journal document.journal_entry%ROWTYPE;
BEGIN
    IF TG_OP='INSERT' AND NEW.status<>'open' THEN RAISE EXCEPTION 'Reconciliation case must be created open' USING ERRCODE='check_violation'; END IF;
    IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NOT (
        (OLD.status='open' AND NEW.status IN ('matched','voided')) OR
        (OLD.status='matched' AND NEW.status IN ('open','signed_off','voided'))
    ) THEN RAISE EXCEPTION 'Invalid reconciliation case status transition: % -> %',OLD.status,NEW.status USING ERRCODE='check_violation'; END IF;
    IF TG_OP='UPDATE' AND (NEW.book_amount IS DISTINCT FROM OLD.book_amount OR NEW.bank_amount IS DISTINCT FROM OLD.bank_amount)
       AND pg_trigger_depth()<2 THEN
        RAISE EXCEPTION 'Reconciliation totals are database-maintained from case lines'
            USING ERRCODE='check_violation';
    END IF;
    IF TG_OP='UPDATE' AND OLD.status IN ('signed_off','voided') AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'Signed-off or voided reconciliation case is immutable'
            USING ERRCODE='object_not_in_prerequisite_state';
    END IF;
    IF NEW.status='matched' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
        IF NEW.book_amount=0 OR NEW.bank_amount=0 THEN RAISE EXCEPTION 'Matched case requires both book and bank allocations' USING ERRCODE='check_violation'; END IF;
        IF NEW.case_type IN ('exact_match','amount_match') AND NEW.book_amount-NEW.bank_amount<>0 THEN RAISE EXCEPTION 'Exact and amount matches must balance' USING ERRCODE='check_violation'; END IF;
        NEW.matched_at:=statement_timestamp();
    END IF;
    IF NEW.status='signed_off' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
        IF TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'matched' OR v_actor IS NULL THEN RAISE EXCEPTION 'Only a matched case with actor context can be signed off' USING ERRCODE='check_violation'; END IF;
        IF NEW.book_amount-NEW.bank_amount<>0 AND NEW.sign_off_journal_entry_id IS NULL THEN RAISE EXCEPTION 'Non-zero reconciliation difference requires an adjustment journal' USING ERRCODE='check_violation'; END IF;
        IF NEW.sign_off_journal_entry_id IS NOT NULL THEN
            SELECT * INTO v_journal FROM document.journal_entry WHERE tenant_id=NEW.tenant_id AND id=NEW.sign_off_journal_entry_id;
            IF FOUND AND (v_journal.company_code_id<>NEW.company_code_id OR v_journal.transaction_currency_code<>NEW.currency_code OR v_journal.source_entity_type<>'document.bank_recon_case' OR v_journal.source_entity_id IS DISTINCT FROM NEW.id OR v_journal.status<>'posted') THEN
                RAISE EXCEPTION 'Adjustment journal must be posted for this reconciliation case, company, and currency' USING ERRCODE='check_violation';
            END IF;
        END IF;
        NEW.signed_off_at:=statement_timestamp(); NEW.signed_off_by:=v_actor;
    END IF;
    IF NEW.status='voided' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
        IF OLD.status='signed_off' OR v_actor IS NULL OR NEW.void_reason IS NULL THEN RAISE EXCEPTION 'Unsigned case and actor/reason are required to void reconciliation' USING ERRCODE='check_violation'; END IF;
        NEW.voided_at:=statement_timestamp(); NEW.voided_by:=v_actor;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_depreciation_run()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=pg_catalog,document,master
AS $$
DECLARE v_period master.fiscal_period%ROWTYPE; v_book master.ledger_book%ROWTYPE; v_effective_currency character(3); v_original document.depreciation_run%ROWTYPE;
BEGIN
    SELECT * INTO v_period FROM master.fiscal_period WHERE tenant_id=NEW.tenant_id AND id=NEW.fiscal_period_id;
    SELECT * INTO v_book FROM master.ledger_book WHERE tenant_id=NEW.tenant_id AND id=NEW.ledger_book_id;
    IF FOUND AND v_period.company_code_id<>NEW.company_code_id THEN RAISE EXCEPTION 'Depreciation fiscal period must belong to the run company' USING ERRCODE='check_violation'; END IF;
    IF NOT EXISTS (
        SELECT 1 FROM master.company_code_book_assignment a
         WHERE a.tenant_id=NEW.tenant_id AND a.company_code_id=NEW.company_code_id AND a.book_id=NEW.ledger_book_id
           AND a.status='active' AND a.effective_from<=v_period.end_date
           AND (a.effective_to IS NULL OR a.effective_to>=v_period.start_date)
    ) THEN RAISE EXCEPTION 'Ledger book is not actively assigned to the run company and fiscal period' USING ERRCODE='foreign_key_violation'; END IF;
    SELECT coalesce(a.override_currency_code,v_book.base_currency_code) INTO v_effective_currency
      FROM master.company_code_book_assignment a
     WHERE a.tenant_id=NEW.tenant_id AND a.company_code_id=NEW.company_code_id AND a.book_id=NEW.ledger_book_id
       AND a.status='active' AND a.effective_from<=v_period.end_date AND (a.effective_to IS NULL OR a.effective_to>=v_period.start_date)
     ORDER BY a.priority DESC,a.effective_from DESC LIMIT 1;
    IF v_effective_currency<>NEW.currency_code THEN RAISE EXCEPTION 'Depreciation run currency must match the effective company book currency' USING ERRCODE='check_violation'; END IF;
    IF NEW.reversal_of_run_id IS NOT NULL THEN
        SELECT * INTO v_original FROM document.depreciation_run WHERE tenant_id=NEW.tenant_id AND id=NEW.reversal_of_run_id;
        IF FOUND AND (v_original.status<>'posted' OR v_original.company_code_id<>NEW.company_code_id OR v_original.ledger_book_id<>NEW.ledger_book_id OR v_original.fiscal_period_id<>NEW.fiscal_period_id OR v_original.currency_code<>NEW.currency_code) THEN
            RAISE EXCEPTION 'Depreciation reversal must mirror a posted run in the same accounting coordinates' USING ERRCODE='check_violation';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_manage_depreciation_run()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=pg_catalog,document,ledger
AS $$
DECLARE v_actor uuid:=nullif(current_setting('app.current_principal_id',true),'')::uuid; v_bad integer; v_journal document.journal_entry%ROWTYPE;
BEGIN
    IF TG_OP='INSERT' AND NEW.status<>'planned' THEN RAISE EXCEPTION 'Depreciation run must be created planned' USING ERRCODE='check_violation'; END IF;
    IF TG_OP='UPDATE' AND OLD.status IN ('posted','failed','cancelled') AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'Finalized depreciation run is immutable' USING ERRCODE='object_not_in_prerequisite_state';
    END IF;
    IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NOT (
        (OLD.status='planned' AND NEW.status IN ('running','cancelled')) OR
        (OLD.status='running' AND NEW.status IN ('calculated','failed','cancelled')) OR
        (OLD.status='calculated' AND NEW.status IN ('posted','failed','cancelled'))
    ) THEN RAISE EXCEPTION 'Invalid depreciation run status transition: % -> %',OLD.status,NEW.status USING ERRCODE='check_violation'; END IF;
    IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND v_actor IS NULL THEN
        RAISE EXCEPTION 'Current principal context is required for depreciation transitions' USING ERRCODE='insufficient_privilege';
    END IF;
    IF NEW.status='running' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN NEW.started_at:=statement_timestamp(); NEW.started_by:=v_actor; END IF;
    IF NEW.status IN ('calculated','failed') AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
        NEW.completed_at:=statement_timestamp(); NEW.completed_by:=v_actor;
    END IF;
    IF NEW.status='calculated' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
        SELECT count(*) FILTER (WHERE status='error') INTO v_bad FROM document.depreciation_run_line WHERE tenant_id=NEW.tenant_id AND run_id=NEW.id;
        IF NOT EXISTS (SELECT 1 FROM document.depreciation_run_line WHERE tenant_id=NEW.tenant_id AND run_id=NEW.id) OR v_bad>0 THEN
            RAISE EXCEPTION 'Calculated depreciation run requires lines without errors' USING ERRCODE='check_violation';
        END IF;
    END IF;
    IF NEW.status='posted' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
        IF NEW.reference_journal_entry_id IS NULL THEN RAISE EXCEPTION 'Posted depreciation run requires its journal entry' USING ERRCODE='check_violation'; END IF;
        IF NOT EXISTS (SELECT 1 FROM ledger.book_period_status b WHERE b.tenant_id=NEW.tenant_id AND b.ledger_book_id=NEW.ledger_book_id AND b.fiscal_period_id=NEW.fiscal_period_id AND b.status='open') THEN
            RAISE EXCEPTION 'Depreciation can only post to an open ledger-book period' USING ERRCODE='object_not_in_prerequisite_state';
        END IF;
        SELECT * INTO v_journal FROM document.journal_entry WHERE tenant_id=NEW.tenant_id AND id=NEW.reference_journal_entry_id;
        IF FOUND AND (v_journal.company_code_id<>NEW.company_code_id OR v_journal.ledger_book_id<>NEW.ledger_book_id OR v_journal.fiscal_period_id<>NEW.fiscal_period_id OR v_journal.transaction_currency_code<>NEW.currency_code OR v_journal.source_entity_type<>'document.depreciation_run' OR v_journal.source_entity_id IS DISTINCT FROM NEW.id OR v_journal.status<>'posted') THEN
            RAISE EXCEPTION 'Depreciation journal must be posted for this run and its accounting coordinates' USING ERRCODE='check_violation';
        END IF;
        SELECT count(*) FILTER (WHERE status<>'calculated') INTO v_bad FROM document.depreciation_run_line WHERE tenant_id=NEW.tenant_id AND run_id=NEW.id;
        IF NOT EXISTS (SELECT 1 FROM document.depreciation_run_line WHERE tenant_id=NEW.tenant_id AND run_id=NEW.id) OR v_bad>0 THEN RAISE EXCEPTION 'Only a fully calculated depreciation run can post' USING ERRCODE='check_violation'; END IF;
        NEW.posted_at:=statement_timestamp(); NEW.posted_by:=v_actor;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_depreciation_line()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=pg_catalog,document,master
AS $$
DECLARE v_run document.depreciation_run%ROWTYPE; v_book master.asset_book%ROWTYPE; v_schedule document.depreciation_schedule%ROWTYPE; v_original document.depreciation_run_line%ROWTYPE;
BEGIN
    SELECT * INTO v_run FROM document.depreciation_run WHERE tenant_id=NEW.tenant_id AND id=NEW.run_id;
    IF TG_OP='INSERT' AND v_run.status<>'running' THEN RAISE EXCEPTION 'Depreciation lines can only be calculated while the run is running' USING ERRCODE='object_not_in_prerequisite_state'; END IF;
    SELECT * INTO v_book FROM master.asset_book WHERE tenant_id=NEW.tenant_id AND id=NEW.asset_book_id;
    IF FOUND AND (v_book.asset_id<>NEW.asset_id OR v_book.company_code_id<>v_run.company_code_id OR v_book.ledger_book_id<>v_run.ledger_book_id OR v_book.currency_code<>NEW.currency_code OR v_book.depreciation_method<>NEW.depreciation_method OR v_book.useful_life_months<>NEW.useful_life_months) THEN
        RAISE EXCEPTION 'Depreciation line must match its asset-book and run coordinates' USING ERRCODE='check_violation';
    END IF;
    IF NEW.depreciation_schedule_id IS NOT NULL THEN
        SELECT * INTO v_schedule FROM document.depreciation_schedule WHERE tenant_id=NEW.tenant_id AND id=NEW.depreciation_schedule_id;
        IF FOUND AND (v_schedule.asset_id<>NEW.asset_id OR v_schedule.asset_book_id<>NEW.asset_book_id OR v_schedule.fiscal_period_id<>v_run.fiscal_period_id OR v_schedule.currency_code<>NEW.currency_code) THEN
            RAISE EXCEPTION 'Depreciation line schedule must match its asset book, fiscal period, and currency' USING ERRCODE='check_violation';
        END IF;
    END IF;
    IF NEW.reversal_of_line_id IS NOT NULL THEN
        SELECT * INTO v_original FROM document.depreciation_run_line WHERE tenant_id=NEW.tenant_id AND id=NEW.reversal_of_line_id;
        IF FOUND AND (v_run.reversal_of_run_id IS DISTINCT FROM v_original.run_id OR v_original.asset_id<>NEW.asset_id OR v_original.asset_book_id<>NEW.asset_book_id OR v_original.depreciation_amount<>NEW.depreciation_amount) THEN
            RAISE EXCEPTION 'Depreciation reversal line must mirror a line of the reversed run' USING ERRCODE='check_violation';
        END IF;
    ELSIF v_run.reversal_of_run_id IS NOT NULL THEN
        RAISE EXCEPTION 'Every line in a reversal run must reference its original line' USING ERRCODE='check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_depreciation_line()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
BEGIN
    IF TG_OP='DELETE' OR pg_trigger_depth()<2 OR NEW.status IS NOT DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'Depreciation run lines are append-only; only posting may advance line status internally' USING ERRCODE='object_not_in_prerequisite_state';
    END IF;
    IF NEW.status<>'posted'
       OR (to_jsonb(NEW)-ARRAY['status','posted_at','posted_by'])
          IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','posted_at','posted_by'])
       OR NEW.posted_at IS NULL OR NEW.posted_by IS NULL THEN
        RAISE EXCEPTION 'Invalid depreciation line mutation' USING ERRCODE='check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_depreciation_schedule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=pg_catalog,document,master
AS $$
DECLARE v_book master.asset_book%ROWTYPE; v_period master.fiscal_period%ROWTYPE; v_line document.depreciation_run_line%ROWTYPE;
BEGIN
    SELECT * INTO v_book FROM master.asset_book WHERE tenant_id=NEW.tenant_id AND id=NEW.asset_book_id;
    SELECT * INTO v_period FROM master.fiscal_period WHERE tenant_id=NEW.tenant_id AND id=NEW.fiscal_period_id;
    IF v_book.asset_id<>NEW.asset_id OR v_book.company_code_id<>v_period.company_code_id OR v_book.currency_code<>NEW.currency_code THEN
        RAISE EXCEPTION 'Depreciation schedule must match asset-book, company fiscal period, and currency' USING ERRCODE='check_violation';
    END IF;
    IF NEW.actual_run_line_id IS NOT NULL THEN
        SELECT * INTO v_line FROM document.depreciation_run_line WHERE tenant_id=NEW.tenant_id AND id=NEW.actual_run_line_id;
        IF FOUND AND (v_line.depreciation_schedule_id IS DISTINCT FROM NEW.id OR v_line.status<>'posted') THEN
            RAISE EXCEPTION 'Actual depreciation evidence must be a posted line for this schedule' USING ERRCODE='check_violation';
        END IF;
    END IF;
    IF TG_OP='UPDATE' AND OLD.status IN ('posted','cancelled') AND pg_trigger_depth()<2 AND NEW IS DISTINCT FROM OLD THEN
        RAISE EXCEPTION 'Posted or cancelled depreciation schedule is immutable' USING ERRCODE='object_not_in_prerequisite_state';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_post_depreciation_run()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=pg_catalog,document
AS $$
DECLARE v_line document.depreciation_run_line%ROWTYPE;
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status AND NEW.status='posted' THEN
        UPDATE document.depreciation_run_line
           SET status='posted', posted_at=NEW.posted_at, posted_by=NEW.posted_by
         WHERE tenant_id=NEW.tenant_id AND run_id=NEW.id AND status='calculated';
        FOR v_line IN SELECT * FROM document.depreciation_run_line WHERE tenant_id=NEW.tenant_id AND run_id=NEW.id AND status='posted' LOOP
            IF v_line.depreciation_schedule_id IS NOT NULL THEN
                UPDATE document.depreciation_schedule
                   SET actual_amount = CASE WHEN v_line.reversal_of_line_id IS NULL THEN v_line.depreciation_amount ELSE actual_amount-v_line.depreciation_amount END,
                       actual_run_line_id=v_line.id,
                       status='posted'
                 WHERE tenant_id=NEW.tenant_id AND id=v_line.depreciation_schedule_id;
            END IF;
        END LOOP;
    END IF;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_after_bank_recon_case_state()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,document AS $$
DECLARE v_line record;
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        FOR v_line IN SELECT DISTINCT bank_statement_line_id AS id FROM document.bank_recon_case_line WHERE tenant_id=NEW.tenant_id AND bank_recon_case_id=NEW.id AND bank_statement_line_id IS NOT NULL LOOP
            PERFORM document.refresh_bank_reconciliation_projections(NEW.tenant_id,NEW.id);
            EXIT;
        END LOOP;
    END IF;
    RETURN NULL;
END;
$$;
