-- ============================================================================
-- Principal-private Atlas conversation RLS.
--
-- Every Atlas repository transaction must set:
--   app.current_tenant_id
--   app.current_principal_id
--   app.current_atlas_plane
-- Missing or wrong scope fails closed.
-- ============================================================================

-- Tighten the generic envelope only for Atlas rows. Existing non-Atlas
-- conversation behavior remains tenant scoped for compatibility.
DROP POLICY IF EXISTS tenant_read ON master.conversation;
CREATE POLICY tenant_read ON master.conversation
    FOR SELECT
    USING (
        shared.current_tenant_id_soft() IS NOT NULL
        AND tenant_id = shared.current_tenant_id_soft()
        AND (
            type <> 'atlas_agent'
            OR master.fn_atlas_conversation_access(tenant_id, id, false)
        )
    );

DROP POLICY IF EXISTS tenant_insert ON master.conversation;
CREATE POLICY tenant_insert ON master.conversation
    FOR INSERT
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND (
            type <> 'atlas_agent'
            OR (
                created_by =
                    nullif(current_setting('app.current_principal_id', true), '')::uuid
                AND nullif(
                    current_setting('app.current_atlas_plane', true),
                    ''
                ) IN ('neon', 'mesh', 'admin')
            )
        )
    );

DROP POLICY IF EXISTS tenant_update ON master.conversation;
CREATE POLICY tenant_update ON master.conversation
    FOR UPDATE
    USING (
        tenant_id = shared.current_tenant_id()
        AND (
            type <> 'atlas_agent'
            OR master.fn_atlas_conversation_access(tenant_id, id, true)
        )
    )
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND (
            type <> 'atlas_agent'
            OR master.fn_atlas_conversation_access(tenant_id, id, true)
        )
    );

-- The application role receives conversation DML only for Atlas persistence.
-- This restrictive policy prevents that grant from broadening generic
-- conversation write authority.
DROP POLICY IF EXISTS atlas_app_write_scope ON master.conversation;
DROP POLICY IF EXISTS atlas_app_insert_scope ON master.conversation;
DROP POLICY IF EXISTS atlas_app_update_scope ON master.conversation;
CREATE POLICY atlas_app_insert_scope ON master.conversation
    AS RESTRICTIVE
    FOR INSERT
    TO athyperapp
    WITH CHECK (type = 'atlas_agent');
CREATE POLICY atlas_app_update_scope ON master.conversation
    AS RESTRICTIVE
    FOR UPDATE
    TO athyperapp
    USING (type = 'atlas_agent')
    WITH CHECK (type = 'atlas_agent');

DROP POLICY IF EXISTS atlas_maintenance_read ON master.conversation;
DROP POLICY IF EXISTS atlas_maintenance_write ON master.conversation;
CREATE POLICY atlas_maintenance_read ON master.conversation
    FOR SELECT TO athyperadmin_atlas_maintenance
    USING (type = 'atlas_agent');
CREATE POLICY atlas_maintenance_write ON master.conversation
    FOR ALL TO athyperadmin_atlas_maintenance
    USING (type = 'atlas_agent')
    WITH CHECK (type = 'atlas_agent');


-- Hide Atlas membership rosters from tenant-wide readers. Active participants
-- can read the roster; revoked participants immediately lose visibility.
DROP POLICY IF EXISTS tenant_read ON master.conversation_participant;
CREATE POLICY tenant_read ON master.conversation_participant
    FOR SELECT
    USING (
        shared.current_tenant_id_soft() IS NOT NULL
        AND tenant_id = shared.current_tenant_id_soft()
        AND (
            NOT master.fn_is_atlas_conversation(tenant_id, conversation_id)
            OR master.fn_atlas_conversation_access(
                tenant_id,
                conversation_id,
                false
            )
        )
    );

DROP POLICY IF EXISTS tenant_insert ON master.conversation_participant;
CREATE POLICY tenant_insert ON master.conversation_participant
    FOR INSERT
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND (
            NOT master.fn_is_atlas_conversation(tenant_id, conversation_id)
            OR (
                created_by =
                    nullif(current_setting('app.current_principal_id', true), '')::uuid
                AND nullif(
                    current_setting('app.current_atlas_plane', true),
                    ''
                ) IN ('neon', 'mesh', 'admin')
                AND (
                    (
                        principal_id =
                            nullif(
                                current_setting('app.current_principal_id', true),
                                ''
                            )::uuid
                        AND role = 'owner'
                    )
                    OR master.fn_atlas_conversation_access(
                        tenant_id,
                        conversation_id,
                        true
                    )
                )
            )
        )
    );

DROP POLICY IF EXISTS tenant_update ON master.conversation_participant;
CREATE POLICY tenant_update ON master.conversation_participant
    FOR UPDATE
    USING (
        tenant_id = shared.current_tenant_id()
        AND (
            NOT master.fn_is_atlas_conversation(tenant_id, conversation_id)
            OR master.fn_atlas_conversation_access(
                tenant_id,
                conversation_id,
                true
            )
            OR (
                principal_id =
                    nullif(current_setting('app.current_principal_id', true), '')::uuid
                AND master.fn_atlas_conversation_access(
                    tenant_id,
                    conversation_id,
                    false
                )
            )
        )
    )
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND (
            NOT master.fn_is_atlas_conversation(tenant_id, conversation_id)
            OR master.fn_atlas_conversation_access(
                tenant_id,
                conversation_id,
                true
            )
            OR principal_id =
                nullif(current_setting('app.current_principal_id', true), '')::uuid
        )
    );

DROP POLICY IF EXISTS atlas_app_write_scope
    ON master.conversation_participant;
DROP POLICY IF EXISTS atlas_app_insert_scope
    ON master.conversation_participant;
DROP POLICY IF EXISTS atlas_app_update_scope
    ON master.conversation_participant;
CREATE POLICY atlas_app_insert_scope ON master.conversation_participant
    AS RESTRICTIVE
    FOR INSERT
    TO athyperapp
    WITH CHECK (
        master.fn_is_atlas_conversation(tenant_id, conversation_id)
    );
CREATE POLICY atlas_app_update_scope ON master.conversation_participant
    AS RESTRICTIVE
    FOR UPDATE
    TO athyperapp
    USING (
        master.fn_is_atlas_conversation(tenant_id, conversation_id)
    )
    WITH CHECK (
        master.fn_is_atlas_conversation(tenant_id, conversation_id)
    );


ALTER TABLE master.atlas_thread ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.atlas_thread FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read ON master.atlas_thread;
DROP POLICY IF EXISTS tenant_insert ON master.atlas_thread;
DROP POLICY IF EXISTS tenant_update ON master.atlas_thread;
DROP POLICY IF EXISTS tenant_delete ON master.atlas_thread;
DROP POLICY IF EXISTS admin_read ON master.atlas_thread;
DROP POLICY IF EXISTS admin_write ON master.atlas_thread;
DROP POLICY IF EXISTS atlas_maintenance_read ON master.atlas_thread;
DROP POLICY IF EXISTS atlas_maintenance_write ON master.atlas_thread;

CREATE POLICY tenant_read ON master.atlas_thread
    FOR SELECT
    USING (
        master.fn_atlas_conversation_access(
            tenant_id,
            conversation_id,
            false
        )
    );

CREATE POLICY tenant_insert ON master.atlas_thread
    FOR INSERT
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND owner_principal_id =
            nullif(current_setting('app.current_principal_id', true), '')::uuid
        AND created_by = owner_principal_id
        AND plane = nullif(
            current_setting('app.current_atlas_plane', true),
            ''
        )
    );

CREATE POLICY tenant_update ON master.atlas_thread
    FOR UPDATE
    USING (
        master.fn_atlas_conversation_access(
            tenant_id,
            conversation_id,
            true
        )
    )
    WITH CHECK (
        master.fn_atlas_conversation_access(
            tenant_id,
            conversation_id,
            true
        )
    );

-- No tenant DELETE. Soft-delete the parent conversation; an admin-owned purge
-- worker performs deterministic hard deletion after purge_after and legal-hold
-- checks.
CREATE POLICY admin_read ON master.atlas_thread
    FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write ON master.atlas_thread
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
CREATE POLICY atlas_maintenance_read ON master.atlas_thread
    FOR SELECT TO athyperadmin_atlas_maintenance USING (true);
CREATE POLICY atlas_maintenance_write ON master.atlas_thread
    FOR UPDATE TO athyperadmin_atlas_maintenance
    USING (true) WITH CHECK (true);


ALTER TABLE master.atlas_message ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.atlas_message FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read ON master.atlas_message;
DROP POLICY IF EXISTS tenant_insert ON master.atlas_message;
DROP POLICY IF EXISTS tenant_update ON master.atlas_message;
DROP POLICY IF EXISTS tenant_delete ON master.atlas_message;
DROP POLICY IF EXISTS admin_read ON master.atlas_message;
DROP POLICY IF EXISTS admin_write ON master.atlas_message;

CREATE POLICY tenant_read ON master.atlas_message
    FOR SELECT
    USING (
        master.fn_atlas_conversation_access(
            tenant_id,
            conversation_id,
            false
        )
    );

CREATE POLICY tenant_insert ON master.atlas_message
    FOR INSERT
    WITH CHECK (
        master.fn_atlas_conversation_access(
            tenant_id,
            conversation_id,
            true
        )
        AND plane = nullif(
            current_setting('app.current_atlas_plane', true),
            ''
        )
        AND created_by =
            nullif(current_setting('app.current_principal_id', true), '')::uuid
    );

CREATE POLICY tenant_update ON master.atlas_message
    FOR UPDATE
    USING (
        master.fn_atlas_conversation_access(
            tenant_id,
            conversation_id,
            true
        )
        AND created_by =
            nullif(current_setting('app.current_principal_id', true), '')::uuid
    )
    WITH CHECK (
        master.fn_atlas_conversation_access(
            tenant_id,
            conversation_id,
            true
        )
        AND created_by =
            nullif(current_setting('app.current_principal_id', true), '')::uuid
    );

-- No tenant DELETE: terminal messages are append-only until governed purge.
CREATE POLICY admin_read ON master.atlas_message
    FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write ON master.atlas_message
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);


ALTER TABLE event.atlas_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE event.atlas_run FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read ON event.atlas_run;
DROP POLICY IF EXISTS tenant_insert ON event.atlas_run;
DROP POLICY IF EXISTS tenant_update ON event.atlas_run;
DROP POLICY IF EXISTS tenant_delete ON event.atlas_run;
DROP POLICY IF EXISTS admin_read ON event.atlas_run;
DROP POLICY IF EXISTS admin_write ON event.atlas_run;

CREATE POLICY tenant_read ON event.atlas_run
    FOR SELECT
    USING (
        master.fn_atlas_conversation_access(
            tenant_id,
            conversation_id,
            false
        )
    );

CREATE POLICY tenant_insert ON event.atlas_run
    FOR INSERT
    WITH CHECK (
        master.fn_atlas_conversation_access(
            tenant_id,
            conversation_id,
            true
        )
        AND plane = nullif(
            current_setting('app.current_atlas_plane', true),
            ''
        )
        AND principal_id =
            nullif(current_setting('app.current_principal_id', true), '')::uuid
        AND created_by = principal_id
        AND status = 'started'
        AND metering_run_id IS NULL
    );

CREATE POLICY tenant_update ON event.atlas_run
    FOR UPDATE
    USING (
        master.fn_atlas_conversation_access(
            tenant_id,
            conversation_id,
            true
        )
        AND principal_id =
            nullif(current_setting('app.current_principal_id', true), '')::uuid
    )
    WITH CHECK (
        master.fn_atlas_conversation_access(
            tenant_id,
            conversation_id,
            true
        )
        AND principal_id =
            nullif(current_setting('app.current_principal_id', true), '')::uuid
    );

-- No tenant DELETE: terminal rows remain until governed thread purge.
CREATE POLICY admin_read ON event.atlas_run
    FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write ON event.atlas_run
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
