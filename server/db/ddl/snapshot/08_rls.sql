-- ============================================================================
-- snapshot/08_rls.sql
-- Concept: Snapshot RLS — compiled entity isolation policies
-- Depends on: 04_tables/009_snapshot.sql, 05_pre_constraint_functions/001_shared.sql
-- ============================================================================


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
    FOR SELECT USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
-- Admin full access (publishing pipeline runs as athyperadmin)
CREATE POLICY admin_read  ON snapshot.template_version FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write ON snapshot.template_version FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- =============================================================================
-- §8  snapshot.document_snapshot — tenant-scoped read; write via athyperadmin only
-- =============================================================================
-- Writes happen through snapshot.fn_capture_full() (SECURITY INVOKER) from
-- transition hook handlers running under athyperadmin context. Tenants may only
-- SELECT their own snapshots.

ALTER TABLE snapshot.document_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE snapshot.document_snapshot FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read  ON snapshot.document_snapshot;
DROP POLICY IF EXISTS admin_read   ON snapshot.document_snapshot;
DROP POLICY IF EXISTS admin_write  ON snapshot.document_snapshot;
CREATE POLICY tenant_read ON snapshot.document_snapshot
    FOR SELECT USING (
        shared.current_tenant_id_soft() IS NOT NULL
        AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY admin_read  ON snapshot.document_snapshot FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write ON snapshot.document_snapshot FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);
