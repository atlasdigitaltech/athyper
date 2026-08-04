DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY['notification_delivery_claim','digest_staging','webhook_subscription'] LOOP
        EXECUTE format('ALTER TABLE event.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE event.%I FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format('CREATE POLICY notification_tenant_access ON event.%I FOR ALL USING (tenant_id = shared.current_tenant_id_soft()) WITH CHECK (tenant_id = shared.current_tenant_id())', v_table);
        EXECUTE format('CREATE POLICY notification_seed_write ON event.%I FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true)', v_table);
    END LOOP;
END;
$$;

ALTER TABLE event.push_subscription ENABLE ROW LEVEL SECURITY;
ALTER TABLE event.push_subscription FORCE ROW LEVEL SECURITY;
CREATE POLICY push_subscription_self_access ON event.push_subscription FOR ALL TO athyperapp
    USING (tenant_id = shared.current_tenant_id_soft() AND principal_id = nullif(current_setting('app.current_principal_id', true), '')::uuid)
    WITH CHECK (tenant_id = shared.current_tenant_id() AND principal_id = nullif(current_setting('app.current_principal_id', true), '')::uuid);
CREATE POLICY push_subscription_worker_read ON event.push_subscription FOR SELECT TO athyperapp
    USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY push_subscription_seed_write ON event.push_subscription FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

ALTER TABLE event.whatsapp_consent ENABLE ROW LEVEL SECURITY;
ALTER TABLE event.whatsapp_consent FORCE ROW LEVEL SECURITY;
CREATE POLICY whatsapp_consent_self_access ON event.whatsapp_consent FOR ALL TO athyperapp
    USING (tenant_id = shared.current_tenant_id_soft() AND principal_id = nullif(current_setting('app.current_principal_id', true), '')::uuid)
    WITH CHECK (tenant_id = shared.current_tenant_id() AND principal_id = nullif(current_setting('app.current_principal_id', true), '')::uuid);
CREATE POLICY whatsapp_consent_seed_write ON event.whatsapp_consent FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
