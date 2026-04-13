-- 11_rls_policies/003b_master_ui_principal.sql
-- RLS policies for the five UI principal tables defined in
-- 04_tables/003e_master_ui_principal.sql.
-- Depends on: 04_tables/003e_master_ui_principal.sql,
--             05_pre_constraint_functions/001_shared.sql (shared.current_tenant_id_soft,
--                                                         shared.current_tenant_id)
-- Idempotent: DROP POLICY IF EXISTS before CREATE POLICY.
--
-- ── Column reference ──────────────────────────────────────────────────────────
-- saved_view:   scope column (text), owner_principal_id (uuid)
-- dashboard:    scope column (text), owner_principal_id (uuid)
-- dashboard_widget: no scope; access follows parent dashboard
--
-- ── Policy summary ────────────────────────────────────────────────────────────
--
-- principal_ui_profile   — owner-only (principal_id = session principal)
-- principal_ui_preference — owner read+write+delete
-- saved_view             — personal scope → owner read/write;
--                          shared/system scope → tenant read, creator writes
-- dashboard              — same as saved_view
-- dashboard_widget       — read/write/delete follow parent dashboard ownership
--
-- SECURITY DEFINER functions (fn_resolve_principal_ui, fn_set_principal_ui_preference)
-- run as athyperadmin → admin_write policy applies → no RLS friction.
-- These policies govern direct athyperapp DML paths.


-- ════════════════════════════════════════════════════════════════════════════
-- master.principal_ui_profile
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE master.principal_ui_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.principal_ui_profile FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read   ON master.principal_ui_profile;
DROP POLICY IF EXISTS tenant_insert ON master.principal_ui_profile;
DROP POLICY IF EXISTS tenant_update ON master.principal_ui_profile;
DROP POLICY IF EXISTS owner_read    ON master.principal_ui_profile;
DROP POLICY IF EXISTS owner_write   ON master.principal_ui_profile;
DROP POLICY IF EXISTS admin_read    ON master.principal_ui_profile;
DROP POLICY IF EXISTS admin_write   ON master.principal_ui_profile;

-- Principal sees only their own UI profile row
CREATE POLICY tenant_read ON master.principal_ui_profile
    FOR SELECT USING (
        tenant_id    = shared.current_tenant_id_soft()
        AND principal_id = nullif(current_setting('app.current_principal_id', true), '')::uuid
    );

-- Principal may only insert their own row
CREATE POLICY tenant_insert ON master.principal_ui_profile
    FOR INSERT WITH CHECK (
        tenant_id    = shared.current_tenant_id()
        AND principal_id = nullif(current_setting('app.current_principal_id', true), '')::uuid
    );

-- Principal may only update their own row
CREATE POLICY tenant_update ON master.principal_ui_profile
    FOR UPDATE
    USING (
        tenant_id    = shared.current_tenant_id()
        AND principal_id = nullif(current_setting('app.current_principal_id', true), '')::uuid
    )
    WITH CHECK (
        tenant_id    = shared.current_tenant_id()
        AND principal_id = nullif(current_setting('app.current_principal_id', true), '')::uuid
    );

CREATE POLICY admin_read  ON master.principal_ui_profile FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write ON master.principal_ui_profile FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- ════════════════════════════════════════════════════════════════════════════
-- master.principal_ui_preference
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE master.principal_ui_preference ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.principal_ui_preference FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read   ON master.principal_ui_preference;
DROP POLICY IF EXISTS tenant_insert ON master.principal_ui_preference;
DROP POLICY IF EXISTS tenant_update ON master.principal_ui_preference;
DROP POLICY IF EXISTS tenant_delete ON master.principal_ui_preference;
DROP POLICY IF EXISTS owner_read    ON master.principal_ui_preference;
DROP POLICY IF EXISTS owner_write   ON master.principal_ui_preference;
DROP POLICY IF EXISTS admin_read    ON master.principal_ui_preference;
DROP POLICY IF EXISTS admin_write   ON master.principal_ui_preference;

CREATE POLICY tenant_read ON master.principal_ui_preference
    FOR SELECT USING (
        tenant_id    = shared.current_tenant_id_soft()
        AND principal_id = nullif(current_setting('app.current_principal_id', true), '')::uuid
    );

CREATE POLICY tenant_insert ON master.principal_ui_preference
    FOR INSERT WITH CHECK (
        tenant_id    = shared.current_tenant_id()
        AND principal_id = nullif(current_setting('app.current_principal_id', true), '')::uuid
    );

CREATE POLICY tenant_update ON master.principal_ui_preference
    FOR UPDATE
    USING (
        tenant_id    = shared.current_tenant_id()
        AND principal_id = nullif(current_setting('app.current_principal_id', true), '')::uuid
    )
    WITH CHECK (
        tenant_id    = shared.current_tenant_id()
        AND principal_id = nullif(current_setting('app.current_principal_id', true), '')::uuid
    );

-- Preferences can be deleted (reset to inherited default)
CREATE POLICY tenant_delete ON master.principal_ui_preference
    FOR DELETE USING (
        tenant_id    = shared.current_tenant_id()
        AND principal_id = nullif(current_setting('app.current_principal_id', true), '')::uuid
    );

CREATE POLICY admin_read  ON master.principal_ui_preference FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write ON master.principal_ui_preference FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- ════════════════════════════════════════════════════════════════════════════
-- master.saved_view
-- ════════════════════════════════════════════════════════════════════════════
-- Column: scope (not scope_code), owner_principal_id (not owner_id)
ALTER TABLE master.saved_view ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.saved_view FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read            ON master.saved_view;
DROP POLICY IF EXISTS tenant_read_personal   ON master.saved_view;
DROP POLICY IF EXISTS tenant_read_nonpersonal ON master.saved_view;
DROP POLICY IF EXISTS tenant_insert          ON master.saved_view;
DROP POLICY IF EXISTS tenant_update          ON master.saved_view;
DROP POLICY IF EXISTS owner_write            ON master.saved_view;
DROP POLICY IF EXISTS admin_read             ON master.saved_view;
DROP POLICY IF EXISTS admin_write            ON master.saved_view;

-- Personal views: only the owner can read
CREATE POLICY tenant_read_personal ON master.saved_view
    FOR SELECT USING (
        tenant_id = shared.current_tenant_id_soft()
        AND scope = 'personal'
        AND owner_principal_id = nullif(current_setting('app.current_principal_id', true), '')::uuid
    );

-- Shared and system views: all principals in the tenant can read
CREATE POLICY tenant_read_nonpersonal ON master.saved_view
    FOR SELECT USING (
        tenant_id = shared.current_tenant_id_soft()
        AND scope IN ('shared', 'system')
    );

-- INSERT: personal scope requires owner = session principal;
--         shared scope owner_principal_id records creator (must be session or NULL)
CREATE POLICY tenant_insert ON master.saved_view
    FOR INSERT WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND scope IN ('personal', 'shared')
        AND (
            (scope = 'personal'
             AND owner_principal_id = nullif(current_setting('app.current_principal_id', true), '')::uuid)
            OR
            (scope = 'shared' AND (
                owner_principal_id IS NULL
                OR owner_principal_id = nullif(current_setting('app.current_principal_id', true), '')::uuid
            ))
        )
    );

-- UPDATE: personal → owner only; shared → row creator (created_by) only
CREATE POLICY tenant_update ON master.saved_view
    FOR UPDATE
    USING (
        tenant_id = shared.current_tenant_id()
        AND (
            (scope = 'personal'
             AND owner_principal_id = nullif(current_setting('app.current_principal_id', true), '')::uuid)
            OR
            (scope = 'shared'
             AND created_by = nullif(current_setting('app.current_principal_id', true), '')::uuid)
        )
    )
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND (
            (scope = 'personal'
             AND owner_principal_id = nullif(current_setting('app.current_principal_id', true), '')::uuid)
            OR
            (scope = 'shared'
             AND created_by = nullif(current_setting('app.current_principal_id', true), '')::uuid)
        )
    );

CREATE POLICY admin_read  ON master.saved_view FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write ON master.saved_view FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- ════════════════════════════════════════════════════════════════════════════
-- master.dashboard
-- ════════════════════════════════════════════════════════════════════════════
-- Identical scope/owner pattern to saved_view.
ALTER TABLE master.dashboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.dashboard FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read             ON master.dashboard;
DROP POLICY IF EXISTS tenant_read_personal    ON master.dashboard;
DROP POLICY IF EXISTS tenant_read_nonpersonal ON master.dashboard;
DROP POLICY IF EXISTS tenant_insert           ON master.dashboard;
DROP POLICY IF EXISTS tenant_update           ON master.dashboard;
DROP POLICY IF EXISTS owner_write             ON master.dashboard;
DROP POLICY IF EXISTS admin_read              ON master.dashboard;
DROP POLICY IF EXISTS admin_write             ON master.dashboard;

CREATE POLICY tenant_read_personal ON master.dashboard
    FOR SELECT USING (
        tenant_id = shared.current_tenant_id_soft()
        AND scope = 'personal'
        AND owner_principal_id = nullif(current_setting('app.current_principal_id', true), '')::uuid
    );

CREATE POLICY tenant_read_nonpersonal ON master.dashboard
    FOR SELECT USING (
        tenant_id = shared.current_tenant_id_soft()
        AND scope IN ('shared', 'system')
    );

CREATE POLICY tenant_insert ON master.dashboard
    FOR INSERT WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND scope IN ('personal', 'shared')
        AND (
            (scope = 'personal'
             AND owner_principal_id = nullif(current_setting('app.current_principal_id', true), '')::uuid)
            OR
            (scope = 'shared' AND (
                owner_principal_id IS NULL
                OR owner_principal_id = nullif(current_setting('app.current_principal_id', true), '')::uuid
            ))
        )
    );

CREATE POLICY tenant_update ON master.dashboard
    FOR UPDATE
    USING (
        tenant_id = shared.current_tenant_id()
        AND (
            (scope = 'personal'
             AND owner_principal_id = nullif(current_setting('app.current_principal_id', true), '')::uuid)
            OR
            (scope = 'shared'
             AND created_by = nullif(current_setting('app.current_principal_id', true), '')::uuid)
        )
    )
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND (
            (scope = 'personal'
             AND owner_principal_id = nullif(current_setting('app.current_principal_id', true), '')::uuid)
            OR
            (scope = 'shared'
             AND created_by = nullif(current_setting('app.current_principal_id', true), '')::uuid)
        )
    );

CREATE POLICY admin_read  ON master.dashboard FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write ON master.dashboard FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- ════════════════════════════════════════════════════════════════════════════
-- master.dashboard_widget
-- ════════════════════════════════════════════════════════════════════════════
-- Widget visibility and write-access follow the parent dashboard's scope/ownership.
ALTER TABLE master.dashboard_widget ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.dashboard_widget FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read   ON master.dashboard_widget;
DROP POLICY IF EXISTS tenant_insert ON master.dashboard_widget;
DROP POLICY IF EXISTS tenant_update ON master.dashboard_widget;
DROP POLICY IF EXISTS tenant_delete ON master.dashboard_widget;
DROP POLICY IF EXISTS owner_write   ON master.dashboard_widget;
DROP POLICY IF EXISTS admin_read    ON master.dashboard_widget;
DROP POLICY IF EXISTS admin_write   ON master.dashboard_widget;

-- Read: widget is readable if the session can see the parent dashboard
CREATE POLICY tenant_read ON master.dashboard_widget
    FOR SELECT USING (
        tenant_id = shared.current_tenant_id_soft()
        AND EXISTS (
            SELECT 1 FROM master.dashboard d
            WHERE d.id = dashboard_id
              AND d.tenant_id = dashboard_widget.tenant_id
              AND (
                  d.scope IN ('shared', 'system')
                  OR (d.scope = 'personal'
                      AND d.owner_principal_id = nullif(current_setting('app.current_principal_id', true), '')::uuid)
              )
        )
    );

-- INSERT: only if the session owns or created the parent dashboard
CREATE POLICY tenant_insert ON master.dashboard_widget
    FOR INSERT WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND EXISTS (
            SELECT 1 FROM master.dashboard d
            WHERE d.id = dashboard_id
              AND d.tenant_id = dashboard_widget.tenant_id
              AND (
                  (d.scope = 'personal'
                   AND d.owner_principal_id = nullif(current_setting('app.current_principal_id', true), '')::uuid)
                  OR (d.scope = 'shared'
                      AND d.created_by = nullif(current_setting('app.current_principal_id', true), '')::uuid)
              )
        )
    );

-- UPDATE: same ownership check as INSERT
CREATE POLICY tenant_update ON master.dashboard_widget
    FOR UPDATE
    USING (
        tenant_id = shared.current_tenant_id()
        AND EXISTS (
            SELECT 1 FROM master.dashboard d
            WHERE d.id = dashboard_id
              AND d.tenant_id = dashboard_widget.tenant_id
              AND (
                  (d.scope = 'personal'
                   AND d.owner_principal_id = nullif(current_setting('app.current_principal_id', true), '')::uuid)
                  OR (d.scope = 'shared'
                      AND d.created_by = nullif(current_setting('app.current_principal_id', true), '')::uuid)
              )
        )
    )
    WITH CHECK (
        tenant_id = shared.current_tenant_id()
        AND EXISTS (
            SELECT 1 FROM master.dashboard d
            WHERE d.id = dashboard_id
              AND d.tenant_id = dashboard_widget.tenant_id
              AND (
                  (d.scope = 'personal'
                   AND d.owner_principal_id = nullif(current_setting('app.current_principal_id', true), '')::uuid)
                  OR (d.scope = 'shared'
                      AND d.created_by = nullif(current_setting('app.current_principal_id', true), '')::uuid)
              )
        )
    );

-- DELETE: same ownership check
CREATE POLICY tenant_delete ON master.dashboard_widget
    FOR DELETE USING (
        tenant_id = shared.current_tenant_id()
        AND EXISTS (
            SELECT 1 FROM master.dashboard d
            WHERE d.id = dashboard_id
              AND d.tenant_id = dashboard_widget.tenant_id
              AND (
                  (d.scope = 'personal'
                   AND d.owner_principal_id = nullif(current_setting('app.current_principal_id', true), '')::uuid)
                  OR (d.scope = 'shared'
                      AND d.created_by = nullif(current_setting('app.current_principal_id', true), '')::uuid)
              )
        )
    );

CREATE POLICY admin_read  ON master.dashboard_widget FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write ON master.dashboard_widget FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);
