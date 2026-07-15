-- Tenant isolation for webhook subscription configuration.

ALTER TABLE event.webhook_subscription ENABLE ROW LEVEL SECURITY;
ALTER TABLE event.webhook_subscription FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read ON event.webhook_subscription;
DROP POLICY IF EXISTS tenant_insert ON event.webhook_subscription;
DROP POLICY IF EXISTS tenant_update ON event.webhook_subscription;
DROP POLICY IF EXISTS tenant_delete ON event.webhook_subscription;
DROP POLICY IF EXISTS admin_read ON event.webhook_subscription;
DROP POLICY IF EXISTS admin_write ON event.webhook_subscription;

CREATE POLICY tenant_read ON event.webhook_subscription
    FOR SELECT USING (
        shared.current_tenant_id_soft() IS NOT NULL
        AND tenant_id = shared.current_tenant_id_soft()
    );
CREATE POLICY tenant_insert ON event.webhook_subscription
    FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON event.webhook_subscription
    FOR UPDATE USING (tenant_id = shared.current_tenant_id())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON event.webhook_subscription
    FOR DELETE USING (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read ON event.webhook_subscription
    FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write ON event.webhook_subscription
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
