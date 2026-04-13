-- ============================================================================
-- 10_views/005_ledger.sql
-- Ledger schema views.
-- Depends on: 04_tables/005_ledger.sql
-- Views:
--   §V1  ledger.v_trial_balance          — net balances per account/period
--   §V2  ledger.v_asset_reserve_summary  — latest running balance per asset/book
-- ============================================================================


-- ============================================================================
-- §V1  ledger.v_trial_balance
-- Exposes opening, period, and closing net amounts (debit − credit) alongside
-- the raw debit/credit buckets from gl_balance.
-- Intended for trial balance reports and period-end reconciliation.
-- ============================================================================
CREATE OR REPLACE VIEW ledger.v_trial_balance AS
SELECT
    b.id,
    b.tenant_id,
    b.company_code_id,
    b.gl_account_id,
    b.book_id,
    b.fiscal_year,
    b.period_number,
    b.currency_code,

    -- Dimension attributes
    b.cost_center_id,
    b.profit_center_id,
    b.project_id,
    b.dimension_set_id,

    -- Opening
    b.opening_debit,
    b.opening_credit,
    (b.opening_debit  - b.opening_credit)  AS opening_net,

    -- Period movement
    b.period_debit,
    b.period_credit,
    (b.period_debit   - b.period_credit)   AS period_net,

    -- Closing (GENERATED columns + computed net)
    b.closing_debit,
    b.closing_credit,
    (b.closing_debit  - b.closing_credit)  AS closing_net,

    -- Concurrency / traceability
    b.version,
    b.last_je_id,
    b.last_posted_at

FROM ledger.gl_balance b;

COMMENT ON VIEW ledger.v_trial_balance IS
    'Ledger trial balance: raw debit/credit buckets plus derived net amounts '
    '(opening_net, period_net, closing_net = debit − credit). '
    'RLS on the underlying gl_balance table enforces tenant isolation.';


-- ============================================================================
-- §V2  ledger.v_asset_reserve_summary
-- Running balance per (tenant, company, asset, book_type, currency).
-- Aggregates the append-only asset_revaluation_reserve ledger into a
-- single current-balance row per asset/book combination.
-- ============================================================================
CREATE OR REPLACE VIEW ledger.v_asset_reserve_summary AS
WITH ranked AS (
    SELECT
        r.*,
        ROW_NUMBER() OVER (
            PARTITION BY r.tenant_id, r.asset_id, r.asset_book_id, r.currency_code
            ORDER BY r.posted_at DESC, r.id DESC
        ) AS rn
    FROM ledger.asset_revaluation_reserve r
)
SELECT
    r.tenant_id,
    r.company_code_id,
    r.asset_id,
    r.asset_book_id,
    r.book_type,
    r.currency_code,

    -- Latest reserve balance (last posted row carries the running total)
    max(r.balance_after) FILTER (WHERE r.rn = 1) AS current_reserve_balance,

    -- Aggregate movement totals
    sum(r.movement_amount)                      AS total_movement,
    sum(r.movement_amount)
        FILTER (WHERE r.reserve_type = 'REVALUATION_SURPLUS')  AS total_revaluation_surplus,
    sum(r.movement_amount)
        FILTER (WHERE r.reserve_type = 'IMPAIRMENT_LOSS')      AS total_impairment_loss,

    -- Activity metadata
    count(*)                                    AS transaction_count,
    min(r.effective_date)                       AS first_movement_date,
    max(r.effective_date)                       AS last_movement_date,
    max(r.posted_at)                            AS last_posted_at

FROM ranked r
GROUP BY
    r.tenant_id,
    r.company_code_id,
    r.asset_id,
    r.asset_book_id,
    r.book_type,
    r.currency_code;

COMMENT ON VIEW ledger.v_asset_reserve_summary IS
    'Current reserve balance per (asset, book_type, currency) derived from '
    'the append-only asset_revaluation_reserve ledger. '
    'current_reserve_balance = balance_after from the most recent posted row. '
    'RLS on the underlying table enforces tenant isolation.';
