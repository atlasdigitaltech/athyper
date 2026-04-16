-- ============================================================================
-- event/08_rls.sql
-- Concept: Event RLS — outbox and webhook tenant isolation policies
-- Depends on: 04_tables/007_event.sql and sub-tables, 05_pre_constraint_functions/001_shared.sql
-- Unified outbox: tenant can read own events. Admin full access.
-- Insert allowed for tenant sessions (triggers fire in tenant context).
-- Update restricted to admin (workers run as athyperadmin).
-- ============================================================================

ALTER TABLE event.outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE event.outbox FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read   ON event.outbox;
DROP POLICY IF EXISTS tenant_insert ON event.outbox;
DROP POLICY IF EXISTS admin_read    ON event.outbox;
DROP POLICY IF EXISTS admin_write   ON event.outbox;

-- Tenant sessions can read own outbox events (observability)
CREATE POLICY tenant_read   ON event.outbox FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());

-- Tenant sessions can insert (triggers fire in tenant context)
CREATE POLICY tenant_insert ON event.outbox FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());

-- Admin: full read (cross-tenant monitoring)
CREATE POLICY admin_read    ON event.outbox FOR SELECT TO athyperadmin USING (true);

-- Admin: full DML (workers claim/complete/fail events as admin)
CREATE POLICY admin_write   ON event.outbox FOR ALL TO athyperadmin USING (true) WITH CHECK (true);


-- ============================================================================
-- NOTIFICATION TABLES
-- ============================================================================

-- —— notification_message (operational — mutable) —————————————————————————
ALTER TABLE event.notification_message ENABLE ROW LEVEL SECURITY;
ALTER TABLE event.notification_message FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON event.notification_message;
DROP POLICY IF EXISTS tenant_insert ON event.notification_message;
DROP POLICY IF EXISTS tenant_update ON event.notification_message;
DROP POLICY IF EXISTS admin_read    ON event.notification_message;
DROP POLICY IF EXISTS admin_write   ON event.notification_message;

CREATE POLICY tenant_read   ON event.notification_message
    FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON event.notification_message
    FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
-- Delivery worker (running as tenant session) updates counters and status
CREATE POLICY tenant_update ON event.notification_message
    FOR UPDATE USING     (tenant_id = shared.current_tenant_id())
              WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON event.notification_message
    FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON event.notification_message
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);


-- —— notification_delivery (operational — mutable, partitioned) ———————————
ALTER TABLE event.notification_delivery ENABLE ROW LEVEL SECURITY;
ALTER TABLE event.notification_delivery FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON event.notification_delivery;
DROP POLICY IF EXISTS tenant_insert ON event.notification_delivery;
DROP POLICY IF EXISTS tenant_update ON event.notification_delivery;
DROP POLICY IF EXISTS admin_read    ON event.notification_delivery;
DROP POLICY IF EXISTS admin_write   ON event.notification_delivery;

CREATE POLICY tenant_read   ON event.notification_delivery
    FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON event.notification_delivery
    FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
-- Delivery worker updates status, attempt_count, timestamps
CREATE POLICY tenant_update ON event.notification_delivery
    FOR UPDATE USING     (tenant_id = shared.current_tenant_id())
              WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON event.notification_delivery
    FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON event.notification_delivery
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);


-- —— digest_staging (operational work queue — mutable) ————————————————————
ALTER TABLE event.digest_staging ENABLE ROW LEVEL SECURITY;
ALTER TABLE event.digest_staging FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON event.digest_staging;
DROP POLICY IF EXISTS tenant_insert ON event.digest_staging;
DROP POLICY IF EXISTS tenant_update ON event.digest_staging;
DROP POLICY IF EXISTS admin_read    ON event.digest_staging;
DROP POLICY IF EXISTS admin_write   ON event.digest_staging;

CREATE POLICY tenant_read   ON event.digest_staging
    FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON event.digest_staging
    FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
-- Digest worker stamps delivered_at when batch is assembled
CREATE POLICY tenant_update ON event.digest_staging
    FOR UPDATE USING     (tenant_id = shared.current_tenant_id())
              WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON event.digest_staging
    FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON event.digest_staging
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
