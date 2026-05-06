-- ============================================================================
-- ledger/08_rls.sql
-- Concept: Ledger RLS — GL balance and posting isolation policies
-- Depends on: 04_tables/005_ledger.sql, 05_pre_constraint_functions/001_shared.sql
-- Tables covered:
--   §1  ledger.gl_balance                 — mutable period-level balance store
--   §2  ledger.asset_revaluation_reserve  — append-only revaluation/impairment ledger
-- ============================================================================

-- ============================================================================
-- LEDGER POSTING PATH — ledger tables
-- ============================================================================

-- ── ledger.gl_balance ────────────────────────────────────────────────────────
ALTER TABLE ledger.gl_balance ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.gl_balance FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON ledger.gl_balance;
DROP POLICY IF EXISTS tenant_insert ON ledger.gl_balance;
DROP POLICY IF EXISTS tenant_update ON ledger.gl_balance;
DROP POLICY IF EXISTS tenant_delete ON ledger.gl_balance;
DROP POLICY IF EXISTS admin_read    ON ledger.gl_balance;
DROP POLICY IF EXISTS admin_write   ON ledger.gl_balance;
CREATE POLICY tenant_read   ON ledger.gl_balance FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON ledger.gl_balance FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON ledger.gl_balance FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON ledger.gl_balance FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON ledger.gl_balance FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON ledger.gl_balance FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- ── ledger.asset_revaluation_reserve (append-only) ───────────────────────────
-- No tenant UPDATE or DELETE — append-only invariant enforced at policy level.
-- Immutability trigger (log.trg_prevent_mutation) is the second line of defence.
-- Explicit deny policies ensure attempts are rejected rather than silently returning 0 rows.
ALTER TABLE ledger.asset_revaluation_reserve ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.asset_revaluation_reserve FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read        ON ledger.asset_revaluation_reserve;
DROP POLICY IF EXISTS tenant_insert      ON ledger.asset_revaluation_reserve;
DROP POLICY IF EXISTS tenant_deny_update ON ledger.asset_revaluation_reserve;
DROP POLICY IF EXISTS tenant_deny_delete ON ledger.asset_revaluation_reserve;
DROP POLICY IF EXISTS admin_read         ON ledger.asset_revaluation_reserve;
DROP POLICY IF EXISTS admin_write        ON ledger.asset_revaluation_reserve;
CREATE POLICY tenant_read        ON ledger.asset_revaluation_reserve FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert      ON ledger.asset_revaluation_reserve FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_deny_update ON ledger.asset_revaluation_reserve FOR UPDATE USING (false);
CREATE POLICY tenant_deny_delete ON ledger.asset_revaluation_reserve FOR DELETE USING (false);
CREATE POLICY admin_read         ON ledger.asset_revaluation_reserve FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write        ON ledger.asset_revaluation_reserve FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- ── ledger.tax_calculation (append-only) ─────────────────────────────────────
-- Phase 3: immutable tax audit trail written at invoice posting.
-- No UPDATE or DELETE — reversal uses a new row with reverses_calculation_id.
ALTER TABLE ledger.tax_calculation ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.tax_calculation FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read        ON ledger.tax_calculation;
DROP POLICY IF EXISTS tenant_insert      ON ledger.tax_calculation;
DROP POLICY IF EXISTS tenant_deny_update ON ledger.tax_calculation;
DROP POLICY IF EXISTS tenant_deny_delete ON ledger.tax_calculation;
DROP POLICY IF EXISTS admin_read         ON ledger.tax_calculation;
DROP POLICY IF EXISTS admin_write        ON ledger.tax_calculation;
CREATE POLICY tenant_read        ON ledger.tax_calculation FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert      ON ledger.tax_calculation FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_deny_update ON ledger.tax_calculation FOR UPDATE USING (false);
CREATE POLICY tenant_deny_delete ON ledger.tax_calculation FOR DELETE USING (false);
CREATE POLICY admin_read         ON ledger.tax_calculation FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write        ON ledger.tax_calculation FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- ── ledger.tax_credit_movement (append-only) ─────────────────────────────────
-- Phase 3: input-tax / WHT movement ledger written at posting and reversal.
-- Append-only — reversals are new rows, not mutations.
ALTER TABLE ledger.tax_credit_movement ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger.tax_credit_movement FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read        ON ledger.tax_credit_movement;
DROP POLICY IF EXISTS tenant_insert      ON ledger.tax_credit_movement;
DROP POLICY IF EXISTS tenant_deny_update ON ledger.tax_credit_movement;
DROP POLICY IF EXISTS tenant_deny_delete ON ledger.tax_credit_movement;
DROP POLICY IF EXISTS admin_read         ON ledger.tax_credit_movement;
DROP POLICY IF EXISTS admin_write        ON ledger.tax_credit_movement;
CREATE POLICY tenant_read        ON ledger.tax_credit_movement FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert      ON ledger.tax_credit_movement FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_deny_update ON ledger.tax_credit_movement FOR UPDATE USING (false);
CREATE POLICY tenant_deny_delete ON ledger.tax_credit_movement FOR DELETE USING (false);
CREATE POLICY admin_read         ON ledger.tax_credit_movement FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write        ON ledger.tax_credit_movement FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);
