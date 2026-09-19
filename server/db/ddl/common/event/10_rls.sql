DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'comment_flag','notification_message','notification_delivery','notification_provider_event','notification_message_attachment','outbox','channel_consent_event',
        'command_execution','integration_delivery','integration_inbound_receipt'
    ]
    LOOP
        EXECUTE format('ALTER TABLE event.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE event.%I FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format(
            'CREATE POLICY tenant_access ON event.%I FOR ALL '
            'USING (tenant_id = shared.current_tenant_id_soft()) '
            'WITH CHECK (tenant_id = shared.current_tenant_id())', v_table
        );
        EXECUTE format(
            'CREATE POLICY seed_write ON event.%I FOR ALL TO CURRENT_USER '
            'USING (true) WITH CHECK (true)', v_table
        );
    END LOOP;
END;
$$;

CREATE POLICY outbox_jobs_access ON event.outbox
    FOR ALL TO athyper_jobs_service
    USING (true) WITH CHECK (true);

ALTER TABLE event.notification_email_suppression ENABLE ROW LEVEL SECURITY;
ALTER TABLE event.notification_email_suppression FORCE ROW LEVEL SECURITY;
CREATE POLICY notification_email_suppression_tenant_read ON event.notification_email_suppression FOR SELECT TO athyperapp
  USING (tenant_id IS NULL OR tenant_id=shared.current_tenant_id_soft());
CREATE POLICY notification_email_suppression_tenant_write ON event.notification_email_suppression FOR ALL TO athyperapp
  USING (tenant_id=shared.current_tenant_id_soft()) WITH CHECK (scope='tenant' AND tenant_id=shared.current_tenant_id());
CREATE POLICY notification_email_suppression_admin_access ON event.notification_email_suppression FOR ALL TO athyperadmin
  USING (true) WITH CHECK (true);

ALTER TABLE event.notification_inbox_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE event.notification_inbox_state FORCE ROW LEVEL SECURITY;
ALTER TABLE event.notification_outbox_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE event.notification_outbox_state FORCE ROW LEVEL SECURITY;
CREATE POLICY notification_outbox_state_tenant_access ON event.notification_outbox_state FOR ALL TO athyperapp
  USING (tenant_id=shared.current_tenant_id()) WITH CHECK (tenant_id=shared.current_tenant_id());
CREATE POLICY notification_outbox_state_seed_write ON event.notification_outbox_state FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

CREATE POLICY notification_inbox_recipient_read
    ON event.notification_inbox_state
    FOR SELECT
    USING (
        tenant_id = shared.current_tenant_id_soft()
        AND principal_id = nullif(current_setting('app.current_principal_id', true), '')::uuid
    );

CREATE POLICY notification_inbox_tenant_insert
    ON event.notification_inbox_state
    FOR INSERT
    WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY notification_inbox_recipient_update
    ON event.notification_inbox_state
    FOR UPDATE
    USING (
        tenant_id = shared.current_tenant_id_soft()
        AND principal_id = nullif(current_setting('app.current_principal_id', true), '')::uuid
    )
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND principal_id = nullif(current_setting('app.current_principal_id', true), '')::uuid
    );

CREATE POLICY notification_inbox_seed_write
    ON event.notification_inbox_state
    FOR ALL TO CURRENT_USER
    USING (true)
    WITH CHECK (true);

ALTER TABLE event.authorization_invalidation_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE event.authorization_invalidation_outbox FORCE ROW LEVEL SECURITY;
CREATE POLICY authorization_invalidation_tenant_access ON event.authorization_invalidation_outbox
    FOR ALL USING (tenant_id = shared.current_tenant_id_soft()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY authorization_invalidation_seed_write ON event.authorization_invalidation_outbox
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

ALTER TABLE event.descriptor_invalidation_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE event.descriptor_invalidation_outbox FORCE ROW LEVEL SECURITY;

ALTER TABLE event.invalidation_dead_letter ENABLE ROW LEVEL SECURITY;
ALTER TABLE event.invalidation_dead_letter FORCE ROW LEVEL SECURITY;
CREATE POLICY invalidation_dead_letter_admin_access ON event.invalidation_dead_letter
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

CREATE POLICY descriptor_invalidation_local_access
    ON event.descriptor_invalidation_outbox
    FOR ALL TO athyperapp
    USING (
        tenant_id IS NULL
        OR tenant_id = shared.current_tenant_id_soft()
    )
    WITH CHECK (
        tenant_id IS NULL
        OR tenant_id = shared.current_tenant_id()
    );

CREATE POLICY descriptor_invalidation_admin_access
    ON event.descriptor_invalidation_outbox
    FOR ALL TO athyperadmin
    USING (true)
    WITH CHECK (true);

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
