-- 11_rls_policies/009_snapshot.sql
-- Snapshot schema RLS policies.
-- Depends on: 04_tables/009_snapshot.sql


-- =============================================================================
-- §6  DOCUMENT · PRINT · BRANDING  —  snapshot RLS policies
-- =============================================================================

-- ── snapshot.template_version ──────────────────────────────────────────────
-- FORCE ROW LEVEL SECURITY — writes by publishing pipeline only (run as athyperadmin).
ALTER TABLE snapshot.template_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshot.template_version FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read    ON snapshot.template_version;
DROP POLICY IF EXISTS admin_read     ON snapshot.template_version;
DROP POLICY IF EXISTS admin_write    ON snapshot.template_version;
-- Tenants may only read their own versions
CREATE POLICY tenant_read ON snapshot.template_version
    FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
-- Admin full access (publishing pipeline runs as athyperadmin)
CREATE POLICY admin_read  ON snapshot.template_version FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write ON snapshot.template_version FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);
