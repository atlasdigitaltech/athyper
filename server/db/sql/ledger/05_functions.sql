-- ============================================================================
-- ledger/05_functions.sql
-- Concept: Ledger Logic — GL posting and balance calculation functions
-- Depends on: 04_tables/005_ledger.sql, 08_functions/004_document.sql
-- Functions:
--   §F1  ledger.upsert_gl_balance — atomic period-balance accumulation for PostingService
-- ============================================================================


-- ============================================================================
-- §F1  ledger.upsert_gl_balance
-- Atomic accumulate-or-insert for a single GL balance row.
--
-- Contract:
--   • Adds p_period_debit / p_period_credit to the existing period buckets.
--   • Inserts a new row with those values if no matching row exists.
--   • opening_debit / opening_credit are never touched by this function;
--     they are managed exclusively by period-close roll-forward logic.
--   • Returns the id of the affected row.
--
-- Concurrency note:
--   The unique index gl_balance_composite_uq uses COALESCE expressions, which
--   prevents PostgreSQL's ON CONFLICT syntax from referencing it directly.
--   This function uses an UPDATE-then-INSERT pattern.  Callers that require
--   strict serialisability must hold an advisory lock or run under
--   REPEATABLE READ / SERIALIZABLE isolation.
-- ============================================================================
CREATE OR REPLACE FUNCTION ledger.upsert_gl_balance(
    p_tenant_id          uuid,
    p_company_code_id    uuid,
    p_gl_account_id      uuid,
    p_book_id            uuid,
    p_fiscal_year        smallint,
    p_period_number      smallint,
    p_currency_code      character(3),
    p_period_debit       numeric(18,4)  DEFAULT 0,
    p_period_credit      numeric(18,4)  DEFAULT 0,
    p_last_je_id         uuid           DEFAULT NULL,
    p_created_by         uuid           DEFAULT NULL,
    p_cost_center_id     uuid           DEFAULT NULL,
    p_profit_center_id   uuid           DEFAULT NULL,
    p_project_id         uuid           DEFAULT NULL,
    p_dimension_set_id   uuid           DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ledger, shared, pg_temp
AS $$
DECLARE
    v_sentinel  constant uuid := '00000000-0000-0000-0000-000000000000';
    v_id        uuid;
BEGIN
    -- Input guards
    IF p_tenant_id IS NULL OR p_company_code_id IS NULL
       OR p_gl_account_id IS NULL OR p_book_id IS NULL THEN
        RAISE EXCEPTION 'ledger.upsert_gl_balance: tenant_id, company_code_id, '
                        'gl_account_id, book_id are all required';
    END IF;
    IF p_period_debit < 0 OR p_period_credit < 0 THEN
        RAISE EXCEPTION 'ledger.upsert_gl_balance: period_debit and period_credit '
                        'must be non-negative (got % / %)', p_period_debit, p_period_credit;
    END IF;

    -- Attempt to accumulate into an existing row.
    UPDATE ledger.gl_balance
    SET
        period_debit   = period_debit  + p_period_debit,
        period_credit  = period_credit + p_period_credit,
        version        = version + 1,
        last_je_id     = COALESCE(p_last_je_id, last_je_id),
        last_posted_at = now(),
        updated_at     = now(),
        updated_by     = p_created_by
    WHERE tenant_id        = p_tenant_id
      AND company_code_id  = p_company_code_id
      AND gl_account_id    = p_gl_account_id
      AND book_id          = p_book_id
      AND fiscal_year      = p_fiscal_year
      AND period_number    = p_period_number
      AND currency_code    = p_currency_code
      AND COALESCE(cost_center_id,   v_sentinel) = COALESCE(p_cost_center_id,   v_sentinel)
      AND COALESCE(profit_center_id, v_sentinel) = COALESCE(p_profit_center_id, v_sentinel)
      AND COALESCE(project_id,       v_sentinel) = COALESCE(p_project_id,       v_sentinel)
      AND COALESCE(dimension_set_id, v_sentinel) = COALESCE(p_dimension_set_id, v_sentinel)
    RETURNING id INTO v_id;

    -- No existing row — insert fresh.
    IF NOT FOUND THEN
        INSERT INTO ledger.gl_balance (
            tenant_id,
            company_code_id,
            gl_account_id,
            book_id,
            fiscal_year,
            period_number,
            currency_code,
            period_debit,
            period_credit,
            cost_center_id,
            profit_center_id,
            project_id,
            dimension_set_id,
            last_je_id,
            last_posted_at,
            created_by
        )
        VALUES (
            p_tenant_id,
            p_company_code_id,
            p_gl_account_id,
            p_book_id,
            p_fiscal_year,
            p_period_number,
            p_currency_code,
            p_period_debit,
            p_period_credit,
            p_cost_center_id,
            p_profit_center_id,
            p_project_id,
            p_dimension_set_id,
            p_last_je_id,
            now(),
            p_created_by
        )
        RETURNING id INTO v_id;
    END IF;

    RETURN v_id;
END;
$$;

COMMENT ON FUNCTION ledger.upsert_gl_balance IS
    'Atomic period-balance accumulation for PostingService. '
    'Adds period_debit/credit to an existing balance row, or inserts one. '
    'opening_* columns are not touched — managed by period-close roll-forward only. '
    'Uses UPDATE-then-INSERT (not ON CONFLICT) due to COALESCE expressions in the unique index.';


-- ============================================================================
-- §  ledger.calculate_tax
-- Pure tax computation. p_prec REQUIRED — raises if NULL.
--
-- Rounding methods:
--   ROUND_HALF_UP   — commercial rounding (2.5→3). Implemented via FLOOR+0.5 trick.
--   ROUND_HALF_EVEN — banker's rounding (2.5→2, 3.5→4). TRUE implementation:
--                     checks fractional part = 0.5 exactly, rounds to nearest even.
--                     PostgreSQL's native ROUND() is half-away-from-zero, NOT half-even.
--                     Using ROUND() for this branch is a compliance bug; this function
--                     implements it correctly via FLOOR + MOD parity check.
--   ROUND_DOWN      — truncation toward zero.
--   ROUND_UP        — ceiling away from zero.
--
-- minimum_unit rounding (e.g. CHF 0.05) respects the selected method throughout.
--
-- Returns JSONB: {tax_amount, exact_amount, rounding_adjustment,
--                 base_amount, rate_value, rate_kind, rounding_method, precision_used}
-- ============================================================================
CREATE OR REPLACE FUNCTION ledger.calculate_tax(
    p_base      numeric(18,4),
    p_rate      numeric(18,6),
    p_kind      text          DEFAULT 'PERCENT',
    p_qty       numeric(18,4) DEFAULT 1,
    p_method    text          DEFAULT 'ROUND_HALF_UP',
    p_prec      smallint      DEFAULT NULL,
    p_min_unit  numeric       DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_exact     numeric;
    v_rounded   numeric;
    v_prec      smallint;
    v_scale     numeric;
BEGIN
    -- p_prec is REQUIRED. Caller must resolve from shared.currency.minor_units
    -- or control.rounding_rule.precision_digits before calling.
    -- Silently defaulting to 2 would hide currency mismatches (JPY, KWD, etc.).
    IF p_prec IS NULL THEN
        RAISE EXCEPTION
            'ledger.calculate_tax: p_prec (precision) must not be NULL. '
            'Resolve from shared.currency.minor_units or '
            'control.rounding_rule.precision_digits before calling.'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;

    v_prec  := p_prec;
    v_scale := POWER(10, v_prec);

    -- Raw tax amount before rounding
    v_exact := CASE p_kind
        WHEN 'PERCENT'  THEN p_base * p_rate / 100.0
        WHEN 'FIXED'    THEN p_rate
        WHEN 'PER_UNIT' THEN p_rate * p_qty
        ELSE 0
    END;

    -- ── Primary rounding ─────────────────────────────────────────────────────
    v_rounded := CASE p_method

        WHEN 'ROUND_HALF_UP' THEN
            -- Commercial rounding: 2.5 → 3, -2.5 → -3 (away from zero)
            CASE WHEN v_exact >= 0
                THEN FLOOR(v_exact * v_scale + 0.5) / v_scale
                ELSE CEIL( v_exact * v_scale - 0.5) / v_scale
            END

        WHEN 'ROUND_HALF_EVEN' THEN
            -- True banker's rounding. PostgreSQL ROUND() is half-away-from-zero,
            -- which is INCORRECT for this method.
            -- When the scaled value is exactly half-way (fractional part = 0.5),
            -- round to the nearest even integer at scale level.
            -- FLOOR() of a negative half (e.g. -2.5 → floor=-3) still yields frac=0.5
            -- via (-2.5 - (-3) = 0.5), so a single branch covers both signs.
            CASE
                WHEN (v_exact * v_scale - FLOOR(v_exact * v_scale)) = 0.5
                THEN (CASE WHEN MOD(FLOOR(v_exact * v_scale)::bigint, 2) = 0
                           THEN FLOOR(v_exact * v_scale)       -- floor is even → stay
                           ELSE FLOOR(v_exact * v_scale) + 1   -- floor is odd  → step up
                      END) / v_scale
                ELSE ROUND(v_exact, v_prec)  -- non-halfway: standard rounding is correct
            END

        WHEN 'ROUND_DOWN' THEN
            TRUNC(v_exact, v_prec)

        WHEN 'ROUND_UP' THEN
            -- Ceiling away from zero
            CASE WHEN v_exact >= 0
                THEN CEIL( v_exact * v_scale) / v_scale
                ELSE FLOOR(v_exact * v_scale) / v_scale
            END

        ELSE ROUND(v_exact, v_prec)
    END;

    -- ── minimum_unit rounding (e.g. CHF 0.05, SEK 0.50) ─────────────────────
    -- Applies the same method as the primary rounding to ensure consistency.
    IF p_min_unit IS NOT NULL AND p_min_unit > 0 THEN
        v_rounded := CASE p_method

            WHEN 'ROUND_HALF_UP' THEN
                CASE WHEN v_rounded >= 0
                    THEN FLOOR(v_rounded / p_min_unit + 0.5) * p_min_unit
                    ELSE CEIL( v_rounded / p_min_unit - 0.5) * p_min_unit
                END

            WHEN 'ROUND_HALF_EVEN' THEN
                -- Same FLOOR + MOD parity logic applied at the min_unit granularity.
                CASE
                    WHEN (v_rounded / p_min_unit - FLOOR(v_rounded / p_min_unit)) = 0.5
                    THEN (CASE WHEN MOD(FLOOR(v_rounded / p_min_unit)::bigint, 2) = 0
                               THEN FLOOR(v_rounded / p_min_unit)
                               ELSE FLOOR(v_rounded / p_min_unit) + 1
                          END) * p_min_unit
                    ELSE ROUND(v_rounded / p_min_unit) * p_min_unit
                END

            WHEN 'ROUND_DOWN' THEN
                TRUNC(v_rounded / p_min_unit) * p_min_unit

            WHEN 'ROUND_UP' THEN
                CASE WHEN v_rounded >= 0
                    THEN CEIL( v_rounded / p_min_unit) * p_min_unit
                    ELSE FLOOR(v_rounded / p_min_unit) * p_min_unit
                END

            ELSE ROUND(v_rounded / p_min_unit) * p_min_unit
        END;
    END IF;

    RETURN jsonb_build_object(
        'tax_amount',           v_rounded,
        'exact_amount',         ROUND(v_exact, v_prec + 4),
        'rounding_adjustment',  v_rounded - ROUND(v_exact, v_prec + 4),
        'base_amount',          p_base,
        'rate_value',           p_rate,
        'rate_kind',            p_kind,
        'rounding_method',      p_method,
        'precision_used',       v_prec
    );
END;
$$;

COMMENT ON FUNCTION ledger.calculate_tax IS
    'Pure tax computation. p_prec REQUIRED — raises if NULL (no silent fallback). '
    'ROUND_HALF_UP  = commercial (2.5→3, FLOOR+0.5). '
    'ROUND_HALF_EVEN = TRUE banker''s rounding (2.5→2, 3.5→4) via FLOOR+MOD parity. '
    '  PostgreSQL native ROUND() is half-away-from-zero, NOT half-even — '
    '  using it for ROUND_HALF_EVEN is a compliance bug; this function corrects that. '
    'minimum_unit rounding (CHF 0.05, SEK 0.50) applies the same method consistently.';


-- ══════════════════════════════════════════════════════════════════════════════
-- INVENTORY MANAGEMENT ENGINE — Ledger functions
-- ══════════════════════════════════════════════════════════════════════════════

-- ============================================================================
-- §INV-F1  ledger.trg_guard_inventory_company_consistency
-- Guards against cross-company inventory records.
-- ============================================================================
CREATE OR REPLACE FUNCTION ledger.trg_guard_inventory_company_consistency()
RETURNS trigger
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ledger, master, pg_temp
AS $$
DECLARE
    v_item_company_id      uuid;
    v_warehouse_company_id uuid;
BEGIN
    -- Short-circuit on UPDATE when company/item/warehouse are unchanged
    IF TG_OP = 'UPDATE'
       AND OLD.company_code_id = NEW.company_code_id
       AND OLD.item_id         = NEW.item_id
       AND OLD.warehouse_id    = NEW.warehouse_id
    THEN
        RETURN NEW;
    END IF;

    -- (1) Verify item belongs to the stated company
    SELECT company_code_id
      INTO v_item_company_id
      FROM master.item
     WHERE tenant_id = NEW.tenant_id
       AND id        = NEW.item_id;

    IF v_item_company_id IS DISTINCT FROM NEW.company_code_id THEN
        RAISE EXCEPTION
            'Inventory company mismatch on table %: '
            'item.company_code_id = % but NEW.company_code_id = % '
            '(tenant_id=%, item_id=%)',
            TG_TABLE_NAME,
            v_item_company_id,
            NEW.company_code_id,
            NEW.tenant_id,
            NEW.item_id
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    -- (2) Verify warehouse belongs to the stated company (via site)
    SELECT s.company_code_id
      INTO v_warehouse_company_id
      FROM master.warehouse w
      JOIN master.site      s
        ON s.tenant_id = w.tenant_id
       AND s.id        = w.site_id
     WHERE w.tenant_id = NEW.tenant_id
       AND w.id        = NEW.warehouse_id;

    IF v_warehouse_company_id IS DISTINCT FROM NEW.company_code_id THEN
        RAISE EXCEPTION
            'Inventory company mismatch on table %: '
            'warehouse site.company_code_id = % but NEW.company_code_id = % '
            '(tenant_id=%, warehouse_id=%)',
            TG_TABLE_NAME,
            v_warehouse_company_id,
            NEW.company_code_id,
            NEW.tenant_id,
            NEW.warehouse_id
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION ledger.trg_guard_inventory_company_consistency() IS
    'Trigger function — enforces company_code_id alignment between the inventory '
    'row and both its item and its warehouse (via site). '
    'Fires BEFORE INSERT OR UPDATE on inventory_balance, inventory_movement, '
    'inventory_valuation_layer. Short-circuits on UPDATE when key columns unchanged.';
