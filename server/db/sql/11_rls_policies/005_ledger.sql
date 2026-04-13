-- 11_rls_policies/005_ledger.sql
-- Ledger schema RLS policies.
-- Depends on: 04_tables/005_ledger.sql
--
-- Tables covered:
--   §1  ledger.gl_balance                 — mutable period-level balance store
--   §2  ledger.asset_revaluation_reserve  — append-only revaluation/impairment ledger

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
