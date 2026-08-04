DO $$
DECLARE
    v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'comment_flag','notification_message','notification_delivery','outbox','channel_consent_event',
        'command_execution'
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

ALTER TABLE event.notification_inbox_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE event.notification_inbox_state FORCE ROW LEVEL SECURITY;

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
