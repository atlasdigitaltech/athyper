CREATE OR REPLACE FUNCTION document.trg_increment_row_version()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
BEGIN
    NEW.row_version := OLD.row_version + 1;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_company_period()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document, master
AS $$
DECLARE
    v_company uuid := (to_jsonb(NEW)->>'company_code_id')::uuid;
    v_period  uuid := nullif(to_jsonb(NEW)->>'fiscal_period_id', '')::uuid;
BEGIN
    IF v_period IS NULL THEN
        RETURN NEW;
    END IF;
    IF NOT EXISTS (
        SELECT 1
          FROM master.fiscal_period p
         WHERE p.tenant_id = NEW.tenant_id
           AND p.id = v_period
           AND p.company_code_id = v_company
    ) THEN
        RAISE EXCEPTION 'Fiscal period does not belong to the document company'
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_commitment_terminal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
BEGIN
    IF OLD.status IN ('closed','cancelled','expired') THEN
        RAISE EXCEPTION 'Terminal commitment cannot be modified'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_invoice_terminal()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
BEGIN
    IF OLD.status IN ('posted','cancelled','rejected') THEN
        RAISE EXCEPTION 'Posted or terminal purchase invoice cannot be modified'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_journal_posted()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
BEGIN
    IF OLD.status = 'posted' THEN
        RAISE EXCEPTION 'Posted journal entry is immutable; create a reversal journal'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_payment_posted()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
BEGIN
    IF OLD.status IN ('posted','transmitted','cleared') AND (
        NEW.id IS DISTINCT FROM OLD.id
        OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
        OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id
        OR NEW.payment_number IS DISTINCT FROM OLD.payment_number
        OR NEW.payment_type IS DISTINCT FROM OLD.payment_type
        OR NEW.payment_direction IS DISTINCT FROM OLD.payment_direction
        OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
        OR NEW.payment_method_code IS DISTINCT FROM OLD.payment_method_code
        OR NEW.bank_account_id IS DISTINCT FROM OLD.bank_account_id
        OR NEW.document_date IS DISTINCT FROM OLD.document_date
        OR NEW.posting_date IS DISTINCT FROM OLD.posting_date
        OR NEW.value_date IS DISTINCT FROM OLD.value_date
        OR NEW.currency_code IS DISTINCT FROM OLD.currency_code
        OR NEW.base_currency_code IS DISTINCT FROM OLD.base_currency_code
        OR NEW.exchange_rate IS DISTINCT FROM OLD.exchange_rate
        OR NEW.payment_amount IS DISTINCT FROM OLD.payment_amount
        OR NEW.base_amount IS DISTINCT FROM OLD.base_amount
        OR NEW.bank_currency_code IS DISTINCT FROM OLD.bank_currency_code
        OR NEW.bank_exchange_rate IS DISTINCT FROM OLD.bank_exchange_rate
        OR NEW.bank_currency_amount IS DISTINCT FROM OLD.bank_currency_amount
        OR NEW.fiscal_period_id IS DISTINCT FROM OLD.fiscal_period_id
        OR NEW.journal_entry_id IS DISTINCT FROM OLD.journal_entry_id
        OR NEW.reversal_of_payment_id IS DISTINCT FROM OLD.reversal_of_payment_id
        OR NEW.created_at IS DISTINCT FROM OLD.created_at
        OR NEW.created_by IS DISTINCT FROM OLD.created_by
    ) THEN
        RAISE EXCEPTION 'Posted payment financial identity is immutable; create a reversal payment'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_commitment_line()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE
    v_parent document.commitment%ROWTYPE;
BEGIN
    IF TG_OP = 'DELETE' THEN
        SELECT * INTO v_parent
          FROM document.commitment
         WHERE tenant_id = OLD.tenant_id AND id = OLD.commitment_id;
        IF v_parent.status NOT IN ('draft','pending_approval','rejected') THEN
            RAISE EXCEPTION 'Commitment lines are editable only before approval'
                USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;
        RETURN OLD;
    END IF;
    SELECT * INTO v_parent
      FROM document.commitment
     WHERE tenant_id = NEW.tenant_id AND id = NEW.commitment_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unknown commitment' USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_parent.company_code_id <> NEW.company_code_id
       OR v_parent.currency_code <> NEW.currency_code THEN
        RAISE EXCEPTION 'Commitment line company and currency must match its header'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.site_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM master.site s
         WHERE s.tenant_id = NEW.tenant_id
           AND s.id = NEW.site_id
           AND s.company_code_id = NEW.company_code_id
    ) THEN
        RAISE EXCEPTION 'Commitment line site must belong to its company code'
            USING ERRCODE = 'check_violation';
    END IF;
    IF v_parent.status NOT IN ('draft','pending_approval','rejected') THEN
        RAISE EXCEPTION 'Commitment lines are editable only before approval'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_sync_commitment_total()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE
    v_tenant uuid := COALESCE(NEW.tenant_id, OLD.tenant_id);
    v_parent uuid := COALESCE(NEW.commitment_id, OLD.commitment_id);
BEGIN
    UPDATE document.commitment c
       SET total_amount = COALESCE((
               SELECT sum(l.gross_amount)
                 FROM document.commitment_line l
                WHERE l.tenant_id = v_tenant AND l.commitment_id = v_parent
           ), 0),
           updated_at = now(),
           updated_by = COALESCE(
               nullif(current_setting('app.current_principal_id', true), '')::uuid,
               c.updated_by,
               c.created_by
           )
     WHERE c.tenant_id = v_tenant AND c.id = v_parent;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_release_allocation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM document.commitment_line parent_line
          JOIN document.commitment_line release_line
            ON release_line.tenant_id = parent_line.tenant_id
         WHERE parent_line.tenant_id = NEW.tenant_id
           AND parent_line.id = NEW.parent_line_id
           AND parent_line.commitment_id = NEW.parent_commitment_id
           AND release_line.id = NEW.release_line_id
           AND release_line.commitment_id = NEW.release_commitment_id
           AND parent_line.currency_code = NEW.currency_code
           AND release_line.currency_code = NEW.currency_code
    ) THEN
        RAISE EXCEPTION 'Release allocation lines must belong to their stated headers and currency'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_purchase_invoice_line()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE
    v_parent document.purchase_invoice%ROWTYPE;
BEGIN
    IF TG_OP = 'DELETE' THEN
        SELECT * INTO v_parent
          FROM document.purchase_invoice
         WHERE tenant_id = OLD.tenant_id AND id = OLD.purchase_invoice_id;
        IF v_parent.status NOT IN ('proforma','draft','pending_approval') THEN
            RAISE EXCEPTION 'Invoice lines are editable only before approval'
                USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;
        RETURN OLD;
    END IF;
    SELECT * INTO v_parent
      FROM document.purchase_invoice
     WHERE tenant_id = NEW.tenant_id AND id = NEW.purchase_invoice_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unknown purchase invoice' USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_parent.company_code_id <> NEW.company_code_id
       OR v_parent.currency_code <> NEW.currency_code THEN
        RAISE EXCEPTION 'Invoice line company and currency must match its header'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.site_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM master.site s
         WHERE s.tenant_id = NEW.tenant_id
           AND s.id = NEW.site_id
           AND s.company_code_id = NEW.company_code_id
    ) THEN
        RAISE EXCEPTION 'Invoice line site must belong to its company code'
            USING ERRCODE = 'check_violation';
    END IF;
    IF v_parent.status NOT IN ('proforma','draft','pending_approval') THEN
        RAISE EXCEPTION 'Invoice lines are editable only before approval'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF NEW.commitment_line_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
          FROM document.commitment_line l
         WHERE l.tenant_id = NEW.tenant_id
           AND l.id = NEW.commitment_line_id
           AND l.commitment_id = v_parent.commitment_id
    ) THEN
        RAISE EXCEPTION 'Invoice commitment line must belong to the header commitment'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_sync_purchase_invoice_total()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE
    v_tenant uuid := COALESCE(NEW.tenant_id, OLD.tenant_id);
    v_parent uuid := COALESCE(NEW.purchase_invoice_id, OLD.purchase_invoice_id);
BEGIN
    UPDATE document.purchase_invoice h
       SET net_amount = COALESCE((
               SELECT sum(l.net_amount)
                 FROM document.purchase_invoice_line l
                WHERE l.tenant_id = v_tenant AND l.purchase_invoice_id = v_parent
           ), 0),
           tax_amount = COALESCE((
               SELECT sum(l.tax_amount)
                 FROM document.purchase_invoice_line l
                WHERE l.tenant_id = v_tenant AND l.purchase_invoice_id = v_parent
           ), 0),
           withholding_tax_amount = COALESCE((
               SELECT sum(l.withholding_tax_amount)
                 FROM document.purchase_invoice_line l
                WHERE l.tenant_id = v_tenant AND l.purchase_invoice_id = v_parent
           ), 0),
           updated_at = now(),
           updated_by = COALESCE(
               nullif(current_setting('app.current_principal_id', true), '')::uuid,
               h.updated_by,
               h.created_by
           )
     WHERE h.tenant_id = v_tenant AND h.id = v_parent;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_invoice_match_case()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM document.purchase_invoice i
         WHERE i.tenant_id = NEW.tenant_id
           AND i.id = NEW.purchase_invoice_id
           AND i.company_code_id = NEW.company_code_id
           AND (NEW.commitment_id IS NULL OR i.commitment_id = NEW.commitment_id)
    ) THEN
        RAISE EXCEPTION 'Match case company/commitment must match its invoice'
            USING ERRCODE = 'check_violation';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_distribution_posted()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
BEGIN
    IF OLD.amount_status = 'posted' THEN
        RAISE EXCEPTION 'Posted accounting distribution is immutable'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_term_application()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document, master
AS $$
BEGIN
    IF NEW.purchase_invoice_line_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM document.purchase_invoice_line l
         WHERE l.tenant_id = NEW.tenant_id
           AND l.id = NEW.purchase_invoice_line_id
           AND l.purchase_invoice_id = NEW.purchase_invoice_id
    ) THEN
        RAISE EXCEPTION 'Payment-term application line must belong to its invoice'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.payment_term_clause_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM master.payment_term_clause c
         WHERE c.tenant_id = NEW.tenant_id
           AND c.id = NEW.payment_term_clause_id
           AND c.payment_term_id = NEW.payment_term_id
    ) THEN
        RAISE EXCEPTION 'Payment-term clause must belong to the selected payment term'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_payment_allocation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE
    v_payment document.payment_entry%ROWTYPE;
BEGIN
    SELECT * INTO v_payment
      FROM document.payment_entry
     WHERE tenant_id = NEW.tenant_id AND id = NEW.payment_entry_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unknown payment entry' USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_payment.status NOT IN ('draft','pending_approval','approved') THEN
        RAISE EXCEPTION 'Payment allocations are immutable after posting'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF NEW.purchase_invoice_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM document.purchase_invoice i
         WHERE i.tenant_id = NEW.tenant_id
           AND i.id = NEW.purchase_invoice_id
           AND i.company_code_id = v_payment.company_code_id
           AND i.supplier_id = v_payment.supplier_id
           AND i.currency_code = NEW.currency_code
    ) THEN
        RAISE EXCEPTION 'Payment allocation invoice must match payment company, supplier and currency'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_journal_line()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE
    v_header document.journal_entry%ROWTYPE;
BEGIN
    IF TG_OP = 'DELETE' THEN
        SELECT * INTO v_header
          FROM document.journal_entry
         WHERE tenant_id = OLD.tenant_id AND id = OLD.journal_entry_id;
        IF v_header.status NOT IN ('draft','pending_approval','approved') THEN
            RAISE EXCEPTION 'Journal lines are immutable after posting'
                USING ERRCODE = 'object_not_in_prerequisite_state';
        END IF;
        RETURN OLD;
    END IF;
    SELECT * INTO v_header
      FROM document.journal_entry
     WHERE tenant_id = NEW.tenant_id AND id = NEW.journal_entry_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Unknown journal entry' USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_header.status NOT IN ('draft','pending_approval','approved') THEN
        RAISE EXCEPTION 'Journal lines are immutable after posting'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF v_header.transaction_currency_code <> NEW.transaction_currency_code
       OR v_header.base_currency_code <> NEW.base_currency_code THEN
        RAISE EXCEPTION 'Journal-line currencies must match the journal header'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_sync_journal_total()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document
AS $$
DECLARE
    v_tenant uuid := COALESCE(NEW.tenant_id, OLD.tenant_id);
    v_parent uuid := COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);
BEGIN
    UPDATE document.journal_entry h
       SET total_debit = COALESCE((
               SELECT sum(l.base_debit) FROM document.journal_line l
                WHERE l.tenant_id = v_tenant AND l.journal_entry_id = v_parent
           ), 0),
           total_credit = COALESCE((
               SELECT sum(l.base_credit) FROM document.journal_line l
                WHERE l.tenant_id = v_tenant AND l.journal_entry_id = v_parent
           ), 0),
           line_count = (
               SELECT count(*) FROM document.journal_line l
                WHERE l.tenant_id = v_tenant AND l.journal_entry_id = v_parent
           ),
           updated_at = now(),
           updated_by = COALESCE(
               nullif(current_setting('app.current_principal_id', true), '')::uuid,
               h.updated_by,
               h.created_by
           )
     WHERE h.tenant_id = v_tenant AND h.id = v_parent;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_validate_journal_posting()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, document, master, ledger
AS $$
DECLARE
    v_period master.fiscal_period%ROWTYPE;
BEGIN
    IF NEW.status <> 'posted' OR OLD.status = 'posted' THEN
        RETURN NEW;
    END IF;
    SELECT * INTO v_period
      FROM master.fiscal_period p
     WHERE p.tenant_id = NEW.tenant_id
       AND p.id = NEW.fiscal_period_id
       AND p.company_code_id = NEW.company_code_id;
    IF NOT FOUND OR NEW.posting_date NOT BETWEEN v_period.start_date AND v_period.end_date THEN
        RAISE EXCEPTION 'Journal posting date is outside the selected company fiscal period'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM master.company_code_book_assignment a
         WHERE a.tenant_id = NEW.tenant_id
           AND a.company_code_id = NEW.company_code_id
           AND a.book_id = NEW.ledger_book_id
           AND a.status = 'active'
           AND NEW.posting_date >= a.effective_from
           AND (a.effective_to IS NULL OR NEW.posting_date <= a.effective_to)
    ) THEN
        RAISE EXCEPTION 'Ledger book is not active for the journal company and posting date'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM ledger.book_period_status gate
         WHERE gate.tenant_id = NEW.tenant_id
           AND gate.ledger_book_id = NEW.ledger_book_id
           AND gate.fiscal_period_id = NEW.fiscal_period_id
           AND gate.status IN ('open','soft_close')
    ) THEN
        RAISE EXCEPTION 'Ledger book period is not open for posting'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF NEW.line_count < 2 OR NEW.total_debit <= 0 OR NEW.total_debit <> NEW.total_credit THEN
        RAISE EXCEPTION 'Posted journal requires at least two balanced non-zero lines'
            USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.posted_at IS NULL OR NEW.posted_by IS NULL THEN
        RAISE EXCEPTION 'Posted journal requires posting evidence'
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
END;
$$;
