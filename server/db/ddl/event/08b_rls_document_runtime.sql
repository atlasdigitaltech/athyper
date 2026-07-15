-- ============================================================================
-- event/08b_rls_document_runtime.sql
-- Concept: Tenant isolation for document runtime correctness primitives
--
-- Application routes use these tables through the same tenant-scoped database
-- transaction as existing document writers. Workspace authorization and event
-- projection are still enforced in the runtime service; RLS prevents a cross-
-- tenant query from becoming a data leak.
-- ============================================================================

ALTER TABLE event.document_runtime_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE event.document_runtime_idempotency FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read ON event.document_runtime_idempotency;
DROP POLICY IF EXISTS tenant_insert ON event.document_runtime_idempotency;
DROP POLICY IF EXISTS tenant_update ON event.document_runtime_idempotency;
DROP POLICY IF EXISTS admin_write ON event.document_runtime_idempotency;
CREATE POLICY tenant_read ON event.document_runtime_idempotency FOR SELECT
    USING (
        shared.current_tenant_id_soft() IS NOT NULL
        AND tenant_id = shared.current_tenant_id_soft()
        AND principal_id = nullif(current_setting('app.current_principal_id', true), '')::uuid
    );
CREATE POLICY tenant_insert ON event.document_runtime_idempotency FOR INSERT
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND principal_id = nullif(current_setting('app.current_principal_id', true), '')::uuid
    );
CREATE POLICY tenant_update ON event.document_runtime_idempotency FOR UPDATE
    USING (
        tenant_id = shared.current_tenant_id()
        AND principal_id = nullif(current_setting('app.current_principal_id', true), '')::uuid
    ) WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND principal_id = nullif(current_setting('app.current_principal_id', true), '')::uuid
    );
CREATE POLICY admin_write ON event.document_runtime_idempotency FOR ALL TO athyperadmin
    USING (true) WITH CHECK (true);

ALTER TABLE event.document_runtime_document_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE event.document_runtime_document_version FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read ON event.document_runtime_document_version;
DROP POLICY IF EXISTS tenant_insert ON event.document_runtime_document_version;
DROP POLICY IF EXISTS tenant_update ON event.document_runtime_document_version;
DROP POLICY IF EXISTS admin_write ON event.document_runtime_document_version;
CREATE POLICY tenant_read ON event.document_runtime_document_version FOR SELECT
    USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON event.document_runtime_document_version FOR INSERT
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON event.document_runtime_document_version FOR UPDATE
    USING (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_write ON event.document_runtime_document_version FOR ALL TO athyperadmin
    USING (true) WITH CHECK (true);

ALTER TABLE event.document_runtime_node_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE event.document_runtime_node_version FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read ON event.document_runtime_node_version;
DROP POLICY IF EXISTS tenant_insert ON event.document_runtime_node_version;
DROP POLICY IF EXISTS tenant_update ON event.document_runtime_node_version;
DROP POLICY IF EXISTS admin_write ON event.document_runtime_node_version;
CREATE POLICY tenant_read ON event.document_runtime_node_version FOR SELECT
    USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON event.document_runtime_node_version FOR INSERT
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON event.document_runtime_node_version FOR UPDATE
    USING (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_write ON event.document_runtime_node_version FOR ALL TO athyperadmin
    USING (true) WITH CHECK (true);

ALTER TABLE event.document_runtime_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE event.document_runtime_event FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read ON event.document_runtime_event;
DROP POLICY IF EXISTS tenant_insert ON event.document_runtime_event;
DROP POLICY IF EXISTS admin_write ON event.document_runtime_event;
CREATE POLICY tenant_read ON event.document_runtime_event FOR SELECT
    USING (shared.current_tenant_id_soft() IS NOT NULL AND tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON event.document_runtime_event FOR INSERT
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_write ON event.document_runtime_event FOR ALL TO athyperadmin
    USING (true) WITH CHECK (true);
