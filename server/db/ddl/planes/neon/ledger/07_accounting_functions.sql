CREATE OR REPLACE FUNCTION ledger.trg_reject_fact_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'ledger.% is append-only; create a reversal row instead', TG_TABLE_NAME
        USING ERRCODE = '55000';
END;
$$;

CREATE OR REPLACE FUNCTION ledger.trg_validate_accounting_coordinates()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_company_id uuid;
    v_period_id uuid;
    v_book_id uuid;
    v_account_id uuid;
    v_period_company uuid;
    v_period_start date;
    v_period_end date;
    v_dimension uuid;
BEGIN
    v_company_id := COALESCE(
        (v_row->>'company_code_id')::uuid,
        (v_row->>'consolidation_company_id')::uuid
    );
    v_period_id := (v_row->>'fiscal_period_id')::uuid;
    v_book_id := (v_row->>'ledger_book_id')::uuid;
    v_account_id := (v_row->>'gl_account_id')::uuid;

    IF v_period_id IS NOT NULL THEN
        SELECT company_code_id, start_date, end_date
          INTO v_period_company, v_period_start, v_period_end
          FROM master.fiscal_period
         WHERE tenant_id = NEW.tenant_id AND id = v_period_id;
        IF v_period_company IS DISTINCT FROM v_company_id THEN
            RAISE EXCEPTION 'fiscal period % belongs to company %, not %',
                v_period_id, v_period_company, v_company_id USING ERRCODE = '23514';
        END IF;
    END IF;

    IF v_book_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
          FROM master.company_code_book_assignment
         WHERE tenant_id = NEW.tenant_id
           AND company_code_id = v_company_id
           AND book_id = v_book_id
           AND status = 'active'
           AND (v_period_end IS NULL OR effective_from <= v_period_end)
           AND (effective_to IS NULL OR v_period_start IS NULL OR effective_to >= v_period_start)
    ) THEN
        RAISE EXCEPTION 'ledger book % is not actively assigned to company %',
            v_book_id, v_company_id USING ERRCODE = '23514';
    END IF;

    IF v_account_id IS NOT NULL AND NOT EXISTS (
        SELECT 1
          FROM master.company_code_gl_account
         WHERE tenant_id = NEW.tenant_id
           AND company_code_id = v_company_id
           AND gl_account_id = v_account_id
           AND status = 'active'
           AND posting_allowed
    ) THEN
        RAISE EXCEPTION 'GL account % is not posting-enabled for company %',
            v_account_id, v_company_id USING ERRCODE = '23514';
    END IF;

    v_dimension := (v_row->>'cost_center_id')::uuid;
    IF v_dimension IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM master.cost_center
         WHERE tenant_id = NEW.tenant_id AND id = v_dimension
           AND company_code_id = v_company_id
    ) THEN
        RAISE EXCEPTION 'cost center % does not belong to company %', v_dimension, v_company_id
            USING ERRCODE = '23514';
    END IF;

    v_dimension := (v_row->>'profit_center_id')::uuid;
    IF v_dimension IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM master.profit_center
         WHERE tenant_id = NEW.tenant_id AND id = v_dimension
           AND company_code_id = v_company_id
    ) THEN
        RAISE EXCEPTION 'profit center % does not belong to company %', v_dimension, v_company_id
            USING ERRCODE = '23514';
    END IF;

    v_dimension := (v_row->>'project_id')::uuid;
    IF v_dimension IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM master.project
         WHERE tenant_id = NEW.tenant_id AND id = v_dimension
           AND company_code_id = v_company_id
    ) THEN
        RAISE EXCEPTION 'project % does not belong to company %', v_dimension, v_company_id
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION ledger.trg_guard_gl_balance_projection()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id
       OR NEW.ledger_book_id IS DISTINCT FROM OLD.ledger_book_id
       OR NEW.fiscal_period_id IS DISTINCT FROM OLD.fiscal_period_id
       OR NEW.gl_account_id IS DISTINCT FROM OLD.gl_account_id
       OR NEW.currency_code IS DISTINCT FROM OLD.currency_code
       OR NEW.cost_center_id IS DISTINCT FROM OLD.cost_center_id
       OR NEW.profit_center_id IS DISTINCT FROM OLD.profit_center_id
       OR NEW.project_id IS DISTINCT FROM OLD.project_id
       OR NEW.dimension_set_id IS DISTINCT FROM OLD.dimension_set_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'GL balance coordinates and creation evidence are immutable'
            USING ERRCODE = '22000';
    END IF;
    IF NEW.last_applied_sequence <= OLD.last_applied_sequence
       OR NEW.last_idempotency_key = OLD.last_idempotency_key
       OR NEW.version_number <> OLD.version_number + 1
       OR NEW.last_posted_at < OLD.last_posted_at THEN
        RAISE EXCEPTION 'GL balance update must apply one newer, non-replayed posting event'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION ledger.trg_validate_commitment_fulfillment()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_header_company uuid;
    v_line_commitment uuid;
BEGIN
    SELECT company_code_id INTO v_header_company
      FROM document.commitment
     WHERE tenant_id = NEW.tenant_id AND id = NEW.commitment_id;
    SELECT commitment_id INTO v_line_commitment
      FROM document.commitment_line
     WHERE tenant_id = NEW.tenant_id AND id = NEW.commitment_line_id;
    IF v_header_company IS DISTINCT FROM NEW.company_code_id
       OR v_line_commitment IS DISTINCT FROM NEW.commitment_id THEN
        RAISE EXCEPTION 'commitment fulfillment header/line/company coordinates are inconsistent'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION ledger.trg_validate_inventory_reversal()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE v_original ledger.inventory_movement%ROWTYPE;
BEGIN
    IF NEW.reverses_movement_id IS NULL THEN RETURN NEW; END IF;
    SELECT * INTO v_original FROM ledger.inventory_movement
     WHERE tenant_id = NEW.tenant_id AND id = NEW.reverses_movement_id;
    IF v_original.id IS NULL
       OR v_original.company_code_id IS DISTINCT FROM NEW.company_code_id
       OR v_original.item_id IS DISTINCT FROM NEW.item_id
       OR v_original.warehouse_id IS DISTINCT FROM NEW.warehouse_id
       OR v_original.uom_code IS DISTINCT FROM NEW.uom_code
       OR v_original.currency_code IS DISTINCT FROM NEW.currency_code
       OR NEW.quantity <> -v_original.quantity
       OR NEW.inventory_value <> -v_original.inventory_value THEN
        RAISE EXCEPTION 'inventory reversal must exactly negate the original position movement'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION ledger.trg_validate_inventory_warehouse()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_row jsonb := to_jsonb(NEW);
    v_company_id uuid;
    v_source_company uuid;
    v_destination_company uuid;
    v_negative_allowed boolean;
    v_source_warehouse_id uuid := (to_jsonb(NEW)->>'source_warehouse_id')::uuid;
    v_destination_warehouse_id uuid := (to_jsonb(NEW)->>'destination_warehouse_id')::uuid;
    v_movement_type text := to_jsonb(NEW)->>'movement_type';
    v_quantity_on_hand numeric := (to_jsonb(NEW)->>'quantity_on_hand')::numeric;
BEGIN
    SELECT s.company_code_id, w.is_negative_stock_allowed
      INTO v_company_id, v_negative_allowed
      FROM master.warehouse w
      JOIN master.site s ON s.tenant_id = w.tenant_id AND s.id = w.site_id
     WHERE w.tenant_id = NEW.tenant_id
       AND w.id = NEW.warehouse_id
       AND w.status = 'active';

    IF v_company_id IS NULL OR v_company_id IS DISTINCT FROM NEW.company_code_id THEN
        RAISE EXCEPTION 'warehouse % is not active for company %',
            NEW.warehouse_id, NEW.company_code_id USING ERRCODE = '23514';
    END IF;

    IF TG_TABLE_NAME = 'inventory_balance'
       AND v_quantity_on_hand < 0
       AND NOT v_negative_allowed THEN
        RAISE EXCEPTION 'warehouse % does not allow negative stock', NEW.warehouse_id
            USING ERRCODE = '23514';
    END IF;

    IF TG_TABLE_NAME = 'inventory_movement' AND v_source_warehouse_id IS NOT NULL THEN
        SELECT s.company_code_id INTO v_source_company
          FROM master.warehouse w
          JOIN master.site s ON s.tenant_id = w.tenant_id AND s.id = w.site_id
         WHERE w.tenant_id = NEW.tenant_id AND w.id = v_source_warehouse_id
           AND w.status = 'active';
        SELECT s.company_code_id INTO v_destination_company
          FROM master.warehouse w
          JOIN master.site s ON s.tenant_id = w.tenant_id AND s.id = w.site_id
         WHERE w.tenant_id = NEW.tenant_id AND w.id = v_destination_warehouse_id
           AND w.status = 'active';
        IF v_source_company IS DISTINCT FROM NEW.company_code_id
           OR v_destination_company IS DISTINCT FROM NEW.company_code_id
           OR (v_movement_type = 'transfer_out' AND NEW.warehouse_id <> v_source_warehouse_id)
           OR (v_movement_type = 'transfer_in' AND NEW.warehouse_id <> v_destination_warehouse_id) THEN
            RAISE EXCEPTION 'inventory transfer warehouses must be active in the same company and match movement direction'
                USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION ledger.trg_guard_inventory_balance_projection()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id
       OR NEW.item_id IS DISTINCT FROM OLD.item_id
       OR NEW.warehouse_id IS DISTINCT FROM OLD.warehouse_id
       OR NEW.lot_number IS DISTINCT FROM OLD.lot_number
       OR NEW.serial_number IS DISTINCT FROM OLD.serial_number
       OR NEW.currency_code IS DISTINCT FROM OLD.currency_code
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION 'inventory balance coordinates and creation evidence are immutable'
            USING ERRCODE = '22000';
    END IF;
    IF NEW.last_applied_sequence <= OLD.last_applied_sequence
       OR NEW.last_idempotency_key = OLD.last_idempotency_key
       OR NEW.version_number <> OLD.version_number + 1
       OR NEW.last_movement_at < OLD.last_movement_at THEN
        RAISE EXCEPTION 'inventory balance update must apply one newer, non-replayed movement'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION ledger.trg_validate_valuation_layer()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE v_receipt ledger.inventory_movement%ROWTYPE;
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT * INTO v_receipt FROM ledger.inventory_movement
         WHERE tenant_id = NEW.tenant_id AND id = NEW.receipt_movement_id;
        IF v_receipt.id IS NULL OR v_receipt.quantity <= 0
           OR v_receipt.company_code_id IS DISTINCT FROM NEW.company_code_id
           OR v_receipt.item_id IS DISTINCT FROM NEW.item_id
           OR v_receipt.warehouse_id IS DISTINCT FROM NEW.warehouse_id
           OR v_receipt.currency_code IS DISTINCT FROM NEW.currency_code
           OR v_receipt.valuation_method::text IS DISTINCT FROM NEW.valuation_method::text
           OR v_receipt.quantity IS DISTINCT FROM NEW.original_quantity
           OR v_receipt.inventory_value IS DISTINCT FROM NEW.original_value THEN
            RAISE EXCEPTION 'valuation layer must reproduce its positive receipt movement'
                USING ERRCODE = '23514';
        END IF;
    ELSE
        IF NEW.id IS DISTINCT FROM OLD.id
           OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
           OR NEW.company_code_id IS DISTINCT FROM OLD.company_code_id
           OR NEW.item_id IS DISTINCT FROM OLD.item_id
           OR NEW.warehouse_id IS DISTINCT FROM OLD.warehouse_id
           OR NEW.valuation_method IS DISTINCT FROM OLD.valuation_method
           OR NEW.receipt_movement_id IS DISTINCT FROM OLD.receipt_movement_id
           OR NEW.layer_date IS DISTINCT FROM OLD.layer_date
           OR NEW.original_quantity IS DISTINCT FROM OLD.original_quantity
           OR NEW.original_value IS DISTINCT FROM OLD.original_value
           OR NEW.currency_code IS DISTINCT FROM OLD.currency_code
           OR NEW.created_at IS DISTINCT FROM OLD.created_at
           OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
            RAISE EXCEPTION 'valuation layer identity and original receipt evidence are immutable'
                USING ERRCODE = '22000';
        END IF;
        IF NEW.remaining_quantity > OLD.remaining_quantity
           OR NEW.remaining_value > OLD.remaining_value
           OR NEW.version_number <> OLD.version_number + 1 THEN
            RAISE EXCEPTION 'valuation layer may only be consumed monotonically'
                USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION ledger.trg_validate_tax_calculation_reversal()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE v_original ledger.tax_calculation%ROWTYPE;
BEGIN
    IF NEW.reverses_calculation_id IS NULL THEN RETURN NEW; END IF;
    SELECT * INTO v_original FROM ledger.tax_calculation
     WHERE tenant_id = NEW.tenant_id AND id = NEW.reverses_calculation_id;
    IF v_original.id IS NULL
       OR v_original.company_code_id IS DISTINCT FROM NEW.company_code_id
       OR v_original.ledger_book_id IS DISTINCT FROM NEW.ledger_book_id
       OR v_original.jurisdiction_id IS DISTINCT FROM NEW.jurisdiction_id
       OR v_original.tax_type_id IS DISTINCT FROM NEW.tax_type_id
       OR v_original.currency_code IS DISTINCT FROM NEW.currency_code
       OR NEW.taxable_base_amount <> -v_original.taxable_base_amount
       OR NEW.tax_amount <> -v_original.tax_amount
       OR NEW.rounding_adjustment <> -v_original.rounding_adjustment THEN
        RAISE EXCEPTION 'tax reversal must exactly negate the original tax calculation'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION ledger.trg_validate_tax_credit_reversal()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE v_original ledger.tax_credit_movement%ROWTYPE;
BEGIN
    IF NEW.reverses_movement_id IS NULL THEN RETURN NEW; END IF;
    SELECT * INTO v_original FROM ledger.tax_credit_movement
     WHERE tenant_id = NEW.tenant_id AND id = NEW.reverses_movement_id;
    IF v_original.id IS NULL
       OR v_original.company_code_id IS DISTINCT FROM NEW.company_code_id
       OR v_original.ledger_book_id IS DISTINCT FROM NEW.ledger_book_id
       OR v_original.jurisdiction_id IS DISTINCT FROM NEW.jurisdiction_id
       OR v_original.tax_type_id IS DISTINCT FROM NEW.tax_type_id
       OR v_original.tax_bucket IS DISTINCT FROM NEW.tax_bucket
       OR v_original.currency_code IS DISTINCT FROM NEW.currency_code
       OR NEW.amount <> -v_original.amount THEN
        RAISE EXCEPTION 'tax-credit reversal must exactly negate the original bucket movement'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION ledger.trg_validate_asset_reserve()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_asset_id uuid;
    v_company_id uuid;
    v_book_id uuid;
BEGIN
    SELECT asset_id, company_code_id, ledger_book_id
      INTO v_asset_id, v_company_id, v_book_id
      FROM master.asset_book
     WHERE tenant_id = NEW.tenant_id AND id = NEW.asset_book_id;
    IF v_asset_id IS DISTINCT FROM NEW.asset_id
       OR v_company_id IS DISTINCT FROM NEW.company_code_id
       OR v_book_id IS DISTINCT FROM NEW.ledger_book_id THEN
        RAISE EXCEPTION 'asset reserve coordinates conflict with the authoritative asset book'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION ledger.trg_validate_fx_run_group()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM ledger.fx_revaluation_line
         WHERE tenant_id = NEW.tenant_id AND run_id = NEW.run_id
           AND (company_code_id, ledger_book_id, fiscal_period_id, functional_currency_code)
               IS DISTINCT FROM
               (NEW.company_code_id, NEW.ledger_book_id, NEW.fiscal_period_id, NEW.functional_currency_code)
    ) THEN
        RAISE EXCEPTION 'FX run lines must share company, book, period and functional currency'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION ledger.trg_validate_ic_group()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM ledger.ic_elimination_line
         WHERE tenant_id = NEW.tenant_id AND elimination_id = NEW.elimination_id
           AND (
               elimination_type, consolidation_company_id, source_company_code_id,
               counterparty_company_code_id, ledger_book_id, fiscal_period_id,
               currency_code, functional_currency_code
           ) IS DISTINCT FROM (
               NEW.elimination_type, NEW.consolidation_company_id, NEW.source_company_code_id,
               NEW.counterparty_company_code_id, NEW.ledger_book_id, NEW.fiscal_period_id,
               NEW.currency_code, NEW.functional_currency_code
           )
    ) THEN
        RAISE EXCEPTION 'intercompany elimination group coordinates are inconsistent'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION ledger.trg_assert_ic_group_balanced()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_debit numeric(20,4);
    v_credit numeric(20,4);
    v_functional_debit numeric(20,4);
    v_functional_credit numeric(20,4);
    v_count bigint;
BEGIN
    SELECT count(*), sum(debit_amount), sum(credit_amount),
           sum(functional_debit), sum(functional_credit)
      INTO v_count, v_debit, v_credit, v_functional_debit, v_functional_credit
      FROM ledger.ic_elimination_line
     WHERE tenant_id = NEW.tenant_id AND elimination_id = NEW.elimination_id;
    IF v_count < 2 OR v_debit <> v_credit OR v_functional_debit <> v_functional_credit THEN
        RAISE EXCEPTION 'intercompany elimination % is not balanced in transaction and functional currency',
            NEW.elimination_id USING ERRCODE = '23514';
    END IF;
    RETURN NULL;
END;
$$;
CREATE OR REPLACE FUNCTION ledger.trg_guard_cross_book_posting_execution()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
    v_effective_from date;
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT effective_from
          INTO v_effective_from
          FROM control.cross_book_posting_policy
         WHERE tenant_id = NEW.tenant_id
           AND id = NEW.cross_book_posting_policy_id;
        IF v_effective_from IS NULL
           OR v_effective_from <> NEW.posting_policy_effective_from THEN
            RAISE EXCEPTION 'cross-book policy revision snapshot does not match the selected policy'
                USING ERRCODE = 'foreign_key_violation';
        END IF;
        RETURN NEW;
    END IF;

    IF ROW(
        NEW.id, NEW.tenant_id, NEW.company_code_id,
        NEW.source_journal_entry_id, NEW.cross_book_posting_policy_id,
        NEW.posting_policy_effective_from, NEW.idempotency_key,
        NEW.created_at, NEW.created_by
    ) IS DISTINCT FROM ROW(
        OLD.id, OLD.tenant_id, OLD.company_code_id,
        OLD.source_journal_entry_id, OLD.cross_book_posting_policy_id,
        OLD.posting_policy_effective_from, OLD.idempotency_key,
        OLD.created_at, OLD.created_by
    ) THEN
        RAISE EXCEPTION 'cross-book execution identity and creation evidence are immutable'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF OLD.status IN ('succeeded','cancelled') AND NEW.status <> OLD.status THEN
        RAISE EXCEPTION 'completed cross-book execution status is immutable'
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
    IF (OLD.status = 'pending' AND NEW.status NOT IN ('pending','processing','cancelled'))
       OR (OLD.status = 'processing' AND NEW.status NOT IN ('processing','succeeded','failed','cancelled'))
       OR (OLD.status = 'failed' AND NEW.status NOT IN ('failed','processing','cancelled')) THEN
        RAISE EXCEPTION 'invalid cross-book execution transition: % -> %', OLD.status, NEW.status
            USING ERRCODE = 'invalid_parameter_value';
    END IF;
    RETURN NEW;
END;
$$;
