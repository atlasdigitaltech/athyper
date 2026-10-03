-- ============================================================================
-- onboarding/10_rls.sql
-- Tenant- and role-scoped policies for onboarding saga state.
-- ============================================================================

ALTER TABLE onboarding.onboarding_case ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding.onboarding_case FORCE ROW LEVEL SECURITY;
ALTER TABLE onboarding.onboarding_case_target ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding.onboarding_case_target FORCE ROW LEVEL SECURITY;
ALTER TABLE onboarding.onboarding_case_step ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding.onboarding_case_step FORCE ROW LEVEL SECURITY;
ALTER TABLE onboarding.onboarding_step_dependency ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding.onboarding_step_dependency FORCE ROW LEVEL SECURITY;
ALTER TABLE onboarding.onboarding_case_check ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding.onboarding_case_check FORCE ROW LEVEL SECURITY;
ALTER TABLE onboarding.onboarding_case_resource ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding.onboarding_case_resource FORCE ROW LEVEL SECURITY;
ALTER TABLE onboarding.onboarding_compilation_decision ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding.onboarding_compilation_decision FORCE ROW LEVEL SECURITY;
ALTER TABLE onboarding.onboarding_case_revision ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding.onboarding_case_revision FORCE ROW LEVEL SECURITY;
ALTER TABLE onboarding.onboarding_case_work_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding.onboarding_case_work_item FORCE ROW LEVEL SECURITY;
ALTER TABLE onboarding.onboarding_case_guest_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding.onboarding_case_guest_access FORCE ROW LEVEL SECURITY;

-- Tenant reads/writes for runtime callers with tenant-bound context.
DROP POLICY IF EXISTS tenant_read ON onboarding.onboarding_case;
CREATE POLICY tenant_read ON onboarding.onboarding_case
    FOR SELECT
    USING (onboarding.fn_can_read_onboarding_case(tenant_id, id));

DROP POLICY IF EXISTS case_write ON onboarding.onboarding_case;
CREATE POLICY case_write ON onboarding.onboarding_case
    FOR ALL
    USING (nullif(current_setting('app.current_onboarding_access_token', true), '') IS NULL
           AND tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (nullif(current_setting('app.current_onboarding_access_token', true), '') IS NULL
                AND tenant_id = shared.current_tenant_id_soft());

DROP POLICY IF EXISTS tenant_read ON onboarding.onboarding_case_target;
CREATE POLICY tenant_read ON onboarding.onboarding_case_target
    FOR SELECT
    USING (onboarding.fn_can_read_onboarding_case(tenant_id, onboarding_case_id));

DROP POLICY IF EXISTS tenant_rw ON onboarding.onboarding_case_target;
CREATE POLICY tenant_rw ON onboarding.onboarding_case_target
    FOR ALL
    USING (nullif(current_setting('app.current_onboarding_access_token', true), '') IS NULL
           AND tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (nullif(current_setting('app.current_onboarding_access_token', true), '') IS NULL
                AND tenant_id = shared.current_tenant_id_soft());

DROP POLICY IF EXISTS tenant_read ON onboarding.onboarding_case_step;
CREATE POLICY tenant_read ON onboarding.onboarding_case_step
    FOR SELECT
    USING (onboarding.fn_can_read_onboarding_case(tenant_id, onboarding_case_id));

DROP POLICY IF EXISTS tenant_rw ON onboarding.onboarding_case_step;
CREATE POLICY tenant_rw ON onboarding.onboarding_case_step
    FOR ALL
    USING (nullif(current_setting('app.current_onboarding_access_token', true), '') IS NULL
           AND tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (nullif(current_setting('app.current_onboarding_access_token', true), '') IS NULL
                AND tenant_id = shared.current_tenant_id_soft());

DROP POLICY IF EXISTS tenant_read ON onboarding.onboarding_step_dependency;
CREATE POLICY tenant_read ON onboarding.onboarding_step_dependency
    FOR SELECT
    USING (onboarding.fn_can_read_onboarding_case(tenant_id, onboarding_case_id));

DROP POLICY IF EXISTS tenant_rw ON onboarding.onboarding_step_dependency;
CREATE POLICY tenant_rw ON onboarding.onboarding_step_dependency
    FOR ALL
    USING (nullif(current_setting('app.current_onboarding_access_token', true), '') IS NULL
           AND tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (nullif(current_setting('app.current_onboarding_access_token', true), '') IS NULL
                AND tenant_id = shared.current_tenant_id_soft());

DROP POLICY IF EXISTS tenant_read ON onboarding.onboarding_case_check;
CREATE POLICY tenant_read ON onboarding.onboarding_case_check
    FOR SELECT
    USING (onboarding.fn_can_read_onboarding_case(tenant_id, onboarding_case_id));

DROP POLICY IF EXISTS tenant_rw ON onboarding.onboarding_case_check;
CREATE POLICY tenant_rw ON onboarding.onboarding_case_check
    FOR ALL
    USING (nullif(current_setting('app.current_onboarding_access_token', true), '') IS NULL
           AND tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (nullif(current_setting('app.current_onboarding_access_token', true), '') IS NULL
                AND tenant_id = shared.current_tenant_id_soft());

DROP POLICY IF EXISTS tenant_read ON onboarding.onboarding_case_resource;
CREATE POLICY tenant_read ON onboarding.onboarding_case_resource
    FOR SELECT
    USING (onboarding.fn_can_read_onboarding_case(tenant_id, onboarding_case_id));

DROP POLICY IF EXISTS tenant_rw ON onboarding.onboarding_case_resource;
CREATE POLICY tenant_rw ON onboarding.onboarding_case_resource
    FOR ALL
    USING (nullif(current_setting('app.current_onboarding_access_token', true), '') IS NULL
           AND tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (nullif(current_setting('app.current_onboarding_access_token', true), '') IS NULL
                AND tenant_id = shared.current_tenant_id_soft());

DROP POLICY IF EXISTS tenant_read ON onboarding.onboarding_compilation_decision;
CREATE POLICY tenant_read ON onboarding.onboarding_compilation_decision
    FOR SELECT
    USING (onboarding.fn_can_read_onboarding_case(tenant_id, onboarding_case_id));

DROP POLICY IF EXISTS tenant_rw ON onboarding.onboarding_compilation_decision;
CREATE POLICY tenant_rw ON onboarding.onboarding_compilation_decision
    FOR ALL
    USING (nullif(current_setting('app.current_onboarding_access_token', true), '') IS NULL
           AND tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (nullif(current_setting('app.current_onboarding_access_token', true), '') IS NULL
                AND tenant_id = shared.current_tenant_id_soft());

DROP POLICY IF EXISTS tenant_read ON onboarding.onboarding_case_revision;
CREATE POLICY tenant_read ON onboarding.onboarding_case_revision
    FOR SELECT
    USING (onboarding.fn_can_read_onboarding_case(tenant_id, onboarding_case_id));

DROP POLICY IF EXISTS tenant_rw ON onboarding.onboarding_case_revision;
CREATE POLICY tenant_rw ON onboarding.onboarding_case_revision
    FOR ALL
    USING (nullif(current_setting('app.current_onboarding_access_token', true), '') IS NULL
           AND tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (nullif(current_setting('app.current_onboarding_access_token', true), '') IS NULL
                AND tenant_id = shared.current_tenant_id_soft());

DROP POLICY IF EXISTS tenant_read ON onboarding.onboarding_case_work_item;
CREATE POLICY tenant_read ON onboarding.onboarding_case_work_item
    FOR SELECT
    USING (onboarding.fn_can_read_onboarding_case(tenant_id, onboarding_case_id));

DROP POLICY IF EXISTS tenant_rw ON onboarding.onboarding_case_work_item;
CREATE POLICY tenant_rw ON onboarding.onboarding_case_work_item
    FOR ALL
    USING (nullif(current_setting('app.current_onboarding_access_token', true), '') IS NULL
           AND tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (nullif(current_setting('app.current_onboarding_access_token', true), '') IS NULL
                AND tenant_id = shared.current_tenant_id_soft());

-- Retire the former cross-tenant service policies on upgrades as well as foundations.
DO $$
DECLARE relation_name text;
BEGIN
    FOREACH relation_name IN ARRAY ARRAY[
        'onboarding_case','onboarding_case_target','onboarding_case_step',
        'onboarding_step_dependency','onboarding_case_check','onboarding_case_resource',
        'onboarding_compilation_decision','onboarding_case_revision',
        'onboarding_case_work_item','onboarding_case_guest_access'
    ] LOOP
        EXECUTE format('DROP POLICY IF EXISTS onboarding_service_admin ON onboarding.%I', relation_name);
    END LOOP;
END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'athyperadmin') THEN
        DROP POLICY IF EXISTS admin_access ON onboarding.onboarding_case;
        CREATE POLICY admin_access ON onboarding.onboarding_case
            FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
        DROP POLICY IF EXISTS admin_access ON onboarding.onboarding_case_target;
        CREATE POLICY admin_access ON onboarding.onboarding_case_target
            FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
        DROP POLICY IF EXISTS admin_access ON onboarding.onboarding_case_step;
        CREATE POLICY admin_access ON onboarding.onboarding_case_step
            FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
        DROP POLICY IF EXISTS admin_access ON onboarding.onboarding_step_dependency;
        CREATE POLICY admin_access ON onboarding.onboarding_step_dependency
            FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
        DROP POLICY IF EXISTS admin_access ON onboarding.onboarding_case_check;
        CREATE POLICY admin_access ON onboarding.onboarding_case_check
            FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
        DROP POLICY IF EXISTS admin_access ON onboarding.onboarding_case_resource;
        CREATE POLICY admin_access ON onboarding.onboarding_case_resource
            FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
        DROP POLICY IF EXISTS admin_access ON onboarding.onboarding_compilation_decision;
        CREATE POLICY admin_access ON onboarding.onboarding_compilation_decision
            FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
        DROP POLICY IF EXISTS admin_access ON onboarding.onboarding_case_revision;
        CREATE POLICY admin_access ON onboarding.onboarding_case_revision
            FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
        DROP POLICY IF EXISTS admin_access ON onboarding.onboarding_case_work_item;
        CREATE POLICY admin_access ON onboarding.onboarding_case_work_item
            FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
        DROP POLICY IF EXISTS admin_access ON onboarding.onboarding_case_guest_access;
        CREATE POLICY admin_access ON onboarding.onboarding_case_guest_access
            FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
    END IF;
END $$;

-- Seed-time bootstrapping path (DDL role execution). Keeps local setup smooth.
DROP POLICY IF EXISTS seed_write ON onboarding.onboarding_case;
CREATE POLICY seed_write ON onboarding.onboarding_case
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS seed_write ON onboarding.onboarding_case_target;
CREATE POLICY seed_write ON onboarding.onboarding_case_target
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS seed_write ON onboarding.onboarding_case_step;
CREATE POLICY seed_write ON onboarding.onboarding_case_step
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS seed_write ON onboarding.onboarding_step_dependency;
CREATE POLICY seed_write ON onboarding.onboarding_step_dependency
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS seed_write ON onboarding.onboarding_case_check;
CREATE POLICY seed_write ON onboarding.onboarding_case_check
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS seed_write ON onboarding.onboarding_case_resource;
CREATE POLICY seed_write ON onboarding.onboarding_case_resource
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS seed_write ON onboarding.onboarding_compilation_decision;
CREATE POLICY seed_write ON onboarding.onboarding_compilation_decision
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS seed_write ON onboarding.onboarding_case_revision;
CREATE POLICY seed_write ON onboarding.onboarding_case_revision
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS seed_write ON onboarding.onboarding_case_work_item;
CREATE POLICY seed_write ON onboarding.onboarding_case_work_item
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS seed_write ON onboarding.onboarding_case_guest_access;
CREATE POLICY seed_write ON onboarding.onboarding_case_guest_access
    FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);
