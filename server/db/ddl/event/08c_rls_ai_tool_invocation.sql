-- ============================================================================
-- Atlas governed-tool invocation isolation.
--
-- Invocation authorization snapshots can disclose permission/profile shape,
-- so they are stricter than transcript reads: only the immutable thread owner
-- may read or transition a tenant row. There is no tenant DELETE policy.
-- ============================================================================

ALTER TABLE event.ai_tool_invocation ENABLE ROW LEVEL SECURITY;
ALTER TABLE event.ai_tool_invocation FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read ON event.ai_tool_invocation;
DROP POLICY IF EXISTS tenant_insert ON event.ai_tool_invocation;
DROP POLICY IF EXISTS tenant_update ON event.ai_tool_invocation;
DROP POLICY IF EXISTS tenant_delete ON event.ai_tool_invocation;
DROP POLICY IF EXISTS admin_read ON event.ai_tool_invocation;
DROP POLICY IF EXISTS admin_write ON event.ai_tool_invocation;

CREATE POLICY tenant_read ON event.ai_tool_invocation
    FOR SELECT TO athyperapp
    USING (
        master.fn_atlas_conversation_access(
            tenant_id,
            thread_id,
            true
        )
        AND plane = nullif(
            current_setting('app.current_atlas_plane', true),
            ''
        )
        AND principal_id =
            nullif(current_setting('app.current_principal_id', true), '')::uuid
    );

CREATE POLICY tenant_insert ON event.ai_tool_invocation
    FOR INSERT TO athyperapp
    WITH CHECK (
        master.fn_atlas_conversation_access(
            tenant_id,
            thread_id,
            true
        )
        AND plane = nullif(
            current_setting('app.current_atlas_plane', true),
            ''
        )
        AND principal_id =
            nullif(current_setting('app.current_principal_id', true), '')::uuid
        AND created_by = principal_id
        AND status = 'proposed'
        AND updated_by IS NULL
    );

CREATE POLICY tenant_update ON event.ai_tool_invocation
    FOR UPDATE TO athyperapp
    USING (
        master.fn_atlas_conversation_access(
            tenant_id,
            thread_id,
            true
        )
        AND plane = nullif(
            current_setting('app.current_atlas_plane', true),
            ''
        )
        AND principal_id =
            nullif(current_setting('app.current_principal_id', true), '')::uuid
    )
    WITH CHECK (
        master.fn_atlas_conversation_access(
            tenant_id,
            thread_id,
            true
        )
        AND plane = nullif(
            current_setting('app.current_atlas_plane', true),
            ''
        )
        AND principal_id =
            nullif(current_setting('app.current_principal_id', true), '')::uuid
        AND updated_by =
            nullif(current_setting('app.current_principal_id', true), '')::uuid
    );

-- No tenant DELETE: governed thread purge owns hard deletion.
CREATE POLICY admin_read ON event.ai_tool_invocation
    FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write ON event.ai_tool_invocation
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
