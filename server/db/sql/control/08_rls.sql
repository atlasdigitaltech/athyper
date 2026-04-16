-- ============================================================================
-- control/08_rls.sql
-- Concept: Governance RLS — entity, policy, and field data isolation policies
-- Depends on: 04_tables/002_control.sql, 05_pre_constraint_functions/001_shared.sql
-- lookup_domain: open_read + admin_write (platform-level, no tenant_id).
-- lookup_value: scoped_read (global visible to all, tenant rows to own tenant only)
--               + tenant_write (own tenant INSERT) + admin_write (full access).
-- ============================================================================

-- lookup_domain
ALTER TABLE control.lookup_domain ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.lookup_domain FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS open_read ON control.lookup_domain;
CREATE POLICY open_read ON control.lookup_domain FOR SELECT USING (true);

DROP POLICY IF EXISTS admin_write ON control.lookup_domain;
CREATE POLICY admin_write ON control.lookup_domain FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

-- lookup_value
ALTER TABLE control.lookup_value ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.lookup_value FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS open_read     ON control.lookup_value;
DROP POLICY IF EXISTS scoped_read   ON control.lookup_value;
DROP POLICY IF EXISTS tenant_write  ON control.lookup_value;
DROP POLICY IF EXISTS tenant_update ON control.lookup_value;
DROP POLICY IF EXISTS admin_write   ON control.lookup_value;

-- Reads: global rows visible to all; tenant rows visible to own tenant only.
-- Uses current_tenant_id_soft() (returns NULL when GUC unset) instead of
-- current_tenant_id() (raises) — startup, health checks, seeding, and
-- fn_register_tenant must read lookups before a tenant session exists.
CREATE POLICY scoped_read ON control.lookup_value
    FOR SELECT
    USING (
        tenant_id IS NULL
        OR tenant_id = shared.current_tenant_id_soft()
    );

-- Tenant INSERT: own tenant_id only (extensibility trigger guards domain-level permission)
CREATE POLICY tenant_write ON control.lookup_value
    FOR INSERT
    WITH CHECK (
        tenant_id IS NOT NULL
        AND tenant_id = shared.current_tenant_id()
    );

-- Tenant UPDATE: own non-system rows only (e.g. deprecate via status change)
CREATE POLICY tenant_update ON control.lookup_value
    FOR UPDATE
    USING (
        tenant_id IS NOT NULL
        AND tenant_id = shared.current_tenant_id()
        AND is_system = false
    )
    WITH CHECK (
        tenant_id IS NOT NULL
        AND tenant_id = shared.current_tenant_id()
        AND is_system = false
    );

-- No tenant DELETE — tenants deprecate, not delete. System rows immutable except via athyperadmin.

-- Admin DML: full access for athyperadmin (seed + global row management)
CREATE POLICY admin_write ON control.lookup_value
    FOR ALL TO athyperadmin
    USING (true)
    WITH CHECK (true);


-- 11_rls_policies/002_control.sql
-- Depends on: 04_tables/002_control.sql, 05_pre_constraint_functions/001_shared (shared.current_tenant_id_soft)
-- Tenant isolation: tenant sees own rows only. Admin full access.

ALTER TABLE control.mfa_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.mfa_config FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read   ON control.mfa_config;
DROP POLICY IF EXISTS tenant_write  ON control.mfa_config;
DROP POLICY IF EXISTS tenant_insert ON control.mfa_config;
DROP POLICY IF EXISTS tenant_update ON control.mfa_config;
DROP POLICY IF EXISTS tenant_delete ON control.mfa_config;
DROP POLICY IF EXISTS admin_read    ON control.mfa_config;
DROP POLICY IF EXISTS admin_write   ON control.mfa_config;

CREATE POLICY tenant_read ON control.mfa_config FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());

-- Pattern B: split tenant DML into separate INSERT/UPDATE/DELETE
CREATE POLICY tenant_insert ON control.mfa_config
    FOR INSERT
    WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY tenant_update ON control.mfa_config
    FOR UPDATE
    USING  (tenant_id = shared.current_tenant_id())
    WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY tenant_delete ON control.mfa_config
    FOR DELETE
    USING (tenant_id = shared.current_tenant_id());

CREATE POLICY admin_read  ON control.mfa_config FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write ON control.mfa_config FOR ALL TO athyperadmin USING (true) WITH CHECK (true);


-- ============================================================================
-- NOTIFICATION CONFIG TABLES
-- ============================================================================

-- —— notification_provider (platform-level, no tenant_id) —————————————————
ALTER TABLE control.notification_provider ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.notification_provider FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read  ON control.notification_provider;
DROP POLICY IF EXISTS admin_read   ON control.notification_provider;
DROP POLICY IF EXISTS admin_write  ON control.notification_provider;

-- All authenticated tenant sessions can read provider registry (channel capability checks)
CREATE POLICY tenant_read  ON control.notification_provider
    FOR SELECT USING (true);
CREATE POLICY admin_read   ON control.notification_provider
    FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write  ON control.notification_provider
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);


-- —— notification_routing_rule (tenant config — global rows visible to all) ——
ALTER TABLE control.notification_routing_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.notification_routing_rule FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON control.notification_routing_rule;
DROP POLICY IF EXISTS tenant_insert ON control.notification_routing_rule;
DROP POLICY IF EXISTS tenant_update ON control.notification_routing_rule;
DROP POLICY IF EXISTS tenant_delete ON control.notification_routing_rule;
DROP POLICY IF EXISTS admin_read    ON control.notification_routing_rule;
DROP POLICY IF EXISTS admin_write   ON control.notification_routing_rule;

-- Tenant can read their own rules AND platform global rules (tenant_id IS NULL)
CREATE POLICY tenant_read   ON control.notification_routing_rule
    FOR SELECT USING (
        tenant_id = shared.current_tenant_id_soft()
        OR tenant_id IS NULL
    );
CREATE POLICY tenant_insert ON control.notification_routing_rule
    FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON control.notification_routing_rule
    FOR UPDATE USING     (tenant_id = shared.current_tenant_id())
              WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON control.notification_routing_rule
    FOR DELETE USING (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON control.notification_routing_rule
    FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON control.notification_routing_rule
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);


-- —— notification_template (tenant config — platform defaults visible) ————
ALTER TABLE control.notification_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.notification_template FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON control.notification_template;
DROP POLICY IF EXISTS tenant_insert ON control.notification_template;
DROP POLICY IF EXISTS tenant_update ON control.notification_template;
DROP POLICY IF EXISTS tenant_delete ON control.notification_template;
DROP POLICY IF EXISTS admin_read    ON control.notification_template;
DROP POLICY IF EXISTS admin_write   ON control.notification_template;

-- Tenant can read their own templates AND platform default templates (tenant_id IS NULL)
CREATE POLICY tenant_read   ON control.notification_template
    FOR SELECT USING (
        tenant_id = shared.current_tenant_id_soft()
        OR tenant_id IS NULL
    );
CREATE POLICY tenant_insert ON control.notification_template
    FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON control.notification_template
    FOR UPDATE USING     (tenant_id = shared.current_tenant_id())
              WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON control.notification_template
    FOR DELETE USING (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON control.notification_template
    FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON control.notification_template
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);


-- ── LIFECYCLE ENGINE RLS policies ──────────────────────────────────────
-- =============================================================================
-- 11_rls_policies/014_lifecycle.sql
-- Lifecycle Engine — Row-Level Security for all 13 tables
-- Depends on: 04_tables/014_lifecycle.sql
-- =============================================================================
--
-- Pattern:
--   control.lifecycle, lifecycle_state, lifecycle_transition, lifecycle_transition_gate,
--   lifecycle_transition_hook, hook_action_registry, lifecycle_timer_policy:
--     READ: own tenant rows + platform global rows (tenant_id IS NULL)
--     WRITE: own tenant only
--
--   lifecycle_hook_override: own tenant only (always has tenant_id)
--
--   event.lifecycle_timer_schedule: own tenant only
--   master.lifecycle_instance: own tenant only
--
--   snapshot.*: own tenant + global rows; all snapshot tables are read-heavy
--               writes by recompile functions only (run as athyperadmin)

-- ── Step 1: Enable RLS + admin bypass on all 13 tables ──────────────────────
DO $body$ DECLARE t text; BEGIN
    FOR t IN SELECT unnest(ARRAY[
        'control.lifecycle', 'control.lifecycle_state',
        'control.lifecycle_transition', 'control.lifecycle_transition_gate',
        'control.lifecycle_transition_hook', 'control.lifecycle_hook_override',
        'control.hook_action_registry', 'control.lifecycle_timer_policy',
        'event.lifecycle_timer_schedule', 'master.lifecycle_instance',
        'snapshot.lifecycle_version', 'snapshot.lifecycle_route',
        'snapshot.status_route'
    ]) LOOP
        EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS tenant_read   ON %s', t);
        EXECUTE format('DROP POLICY IF EXISTS tenant_insert ON %s', t);
        EXECUTE format('DROP POLICY IF EXISTS tenant_update ON %s', t);
        EXECUTE format('DROP POLICY IF EXISTS admin_read    ON %s', t);
        EXECUTE format('DROP POLICY IF EXISTS admin_write   ON %s', t);
        EXECUTE format(
            'CREATE POLICY admin_read  ON %s FOR SELECT TO athyperadmin USING (true)', t);
        EXECUTE format(
            'CREATE POLICY admin_write ON %s FOR ALL TO athyperadmin USING (true) WITH CHECK (true)', t);
    END LOOP;
END $body$;

-- ── Step 2: Global + own tenant read for config tables ──────────────────────
DO $body$ DECLARE t text; BEGIN
    FOR t IN SELECT unnest(ARRAY[
        'control.lifecycle', 'control.lifecycle_state',
        'control.lifecycle_transition', 'control.lifecycle_transition_gate',
        'control.lifecycle_transition_hook', 'control.hook_action_registry',
        'control.lifecycle_timer_policy',
        'snapshot.lifecycle_version', 'snapshot.lifecycle_route',
        'snapshot.status_route'
    ]) LOOP
        EXECUTE format(
            'CREATE POLICY tenant_read ON %s FOR SELECT USING ('
            '  tenant_id = shared.current_tenant_id_soft() OR tenant_id IS NULL'
            ')', t);
        EXECUTE format(
            'CREATE POLICY tenant_insert ON %s FOR INSERT WITH CHECK ('
            '  tenant_id = shared.current_tenant_id()'
            ')', t);
        EXECUTE format(
            'CREATE POLICY tenant_update ON %s FOR UPDATE '
            '  USING (tenant_id = shared.current_tenant_id()) '
            '  WITH CHECK (tenant_id = shared.current_tenant_id())', t);
    END LOOP;
END $body$;

-- ── Step 3: Own tenant only (always has tenant_id) ──────────────────────────
DO $body$ DECLARE t text; BEGIN
    FOR t IN SELECT unnest(ARRAY[
        'control.lifecycle_hook_override',
        'event.lifecycle_timer_schedule',
        'master.lifecycle_instance'
    ]) LOOP
        EXECUTE format(
            'CREATE POLICY tenant_read ON %s FOR SELECT USING ('
            '  tenant_id = shared.current_tenant_id_soft()'
            ')', t);
        EXECUTE format(
            'CREATE POLICY tenant_insert ON %s FOR INSERT WITH CHECK ('
            '  tenant_id = shared.current_tenant_id()'
            ')', t);
        EXECUTE format(
            'CREATE POLICY tenant_update ON %s FOR UPDATE '
            '  USING (tenant_id = shared.current_tenant_id()) '
            '  WITH CHECK (tenant_id = shared.current_tenant_id())', t);
    END LOOP;
END $body$;


-- ── WORKFLOW ENGINE RLS policies ───────────────────────────────────────
-- =============================================================================
-- 11_rls_policies/015_workflow.sql
-- Workflow Engine — Row-Level Security for all 8 tables
-- Depends on: 04_tables/015_workflow.sql
-- =============================================================================

-- ── Step 1: Enable RLS + admin bypass on all 8 tables ───────────────────────
DO $body$ DECLARE t text; BEGIN
    FOR t IN SELECT unnest(ARRAY[
        'control.workflow_definition',
        'control.workflow_template',
        'control.workflow_template_stage',
        'control.workflow_template_rule',
        'control.workflow_sla_policy',
        'document.workflow_request',
        'document.workflow_stage',
        'event.work_item'
    ]) LOOP
        EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS tenant_read   ON %s', t);
        EXECUTE format('DROP POLICY IF EXISTS tenant_insert ON %s', t);
        EXECUTE format('DROP POLICY IF EXISTS tenant_update ON %s', t);
        EXECUTE format('DROP POLICY IF EXISTS admin_read    ON %s', t);
        EXECUTE format('DROP POLICY IF EXISTS admin_write   ON %s', t);
        EXECUTE format('CREATE POLICY admin_read  ON %s FOR SELECT TO athyperadmin USING (true)', t);
        EXECUTE format('CREATE POLICY admin_write ON %s FOR ALL TO athyperadmin USING (true) WITH CHECK (true)', t);
    END LOOP;
END $body$;

-- ── Step 2: Config tables — own tenant + global (tenant_id IS NULL) ─────────
DO $body$ DECLARE t text; BEGIN
    FOR t IN SELECT unnest(ARRAY[
        'control.workflow_definition',
        'control.workflow_template',
        'control.workflow_template_stage',
        'control.workflow_template_rule',
        'control.workflow_sla_policy'
    ]) LOOP
        EXECUTE format(
            'CREATE POLICY tenant_read ON %s FOR SELECT USING ('
            '  tenant_id = shared.current_tenant_id_soft() OR tenant_id IS NULL'
            ')', t);
        EXECUTE format(
            'CREATE POLICY tenant_insert ON %s FOR INSERT WITH CHECK ('
            '  tenant_id = shared.current_tenant_id()'
            ')', t);
        EXECUTE format(
            'CREATE POLICY tenant_update ON %s FOR UPDATE '
            '  USING (tenant_id = shared.current_tenant_id()) '
            '  WITH CHECK (tenant_id = shared.current_tenant_id())', t);
    END LOOP;
END $body$;

-- ── Step 3: Runtime tables — own tenant only ────────────────────────────────
DO $body$ DECLARE t text; BEGIN
    FOR t IN SELECT unnest(ARRAY[
        'document.workflow_request',
        'document.workflow_stage',
        'event.work_item'
    ]) LOOP
        EXECUTE format(
            'CREATE POLICY tenant_read ON %s FOR SELECT USING ('
            '  tenant_id = shared.current_tenant_id_soft()'
            ')', t);
        EXECUTE format(
            'CREATE POLICY tenant_insert ON %s FOR INSERT WITH CHECK ('
            '  tenant_id = shared.current_tenant_id()'
            ')', t);
        EXECUTE format(
            'CREATE POLICY tenant_update ON %s FOR UPDATE '
            '  USING (tenant_id = shared.current_tenant_id()) '
            '  WITH CHECK (tenant_id = shared.current_tenant_id())', t);
    END LOOP;
END $body$;

-- entity_class_profile: no RLS — platform constant, no tenant_id

-- ─── Enable RLS + admin policies on all entity engine tables ─────────────────

DO $body$ DECLARE t text; BEGIN
    FOR t IN SELECT unnest(ARRAY[
        'control.entity','control.entity_publish_state','control.entity_version',
        'control.entity_field','control.field_group','control.field_group_member',
        'control.field_security_policy','control.overlay','control.overlay_change',
        'control.entity_lifecycle','control.entity_operation',
        'control.entity_policy','control.entity_relation',
        'snapshot.entity_compiled','snapshot.entity_compiled_overlay'
    ]) LOOP
        EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS tenant_read   ON %s', t);
        EXECUTE format('DROP POLICY IF EXISTS tenant_insert ON %s', t);
        EXECUTE format('DROP POLICY IF EXISTS tenant_update ON %s', t);
        EXECUTE format('DROP POLICY IF EXISTS admin_read    ON %s', t);
        EXECUTE format('DROP POLICY IF EXISTS admin_write   ON %s', t);
        EXECUTE format('CREATE POLICY admin_read  ON %s FOR SELECT TO athyperadmin USING (true)', t);
        EXECUTE format('CREATE POLICY admin_write ON %s FOR ALL TO athyperadmin USING (true) WITH CHECK (true)', t);
    END LOOP;
END $body$;

-- ─── Tables with tenant_id nullable (system rows visible to all) ─────────────

DO $body$ DECLARE t text; BEGIN
    FOR t IN SELECT unnest(ARRAY[
        'control.entity','control.entity_version','control.entity_field',
        'control.entity_lifecycle','control.entity_operation',
        'control.entity_relation','snapshot.entity_compiled',
        'snapshot.entity_compiled_overlay'
    ]) LOOP
        EXECUTE format(
            'CREATE POLICY tenant_read ON %s FOR SELECT USING ('
            '  tenant_id = shared.current_tenant_id_soft() OR tenant_id IS NULL'
            ')', t);
        EXECUTE format(
            'CREATE POLICY tenant_insert ON %s FOR INSERT WITH CHECK ('
            '  tenant_id = shared.current_tenant_id() OR tenant_id IS NULL'
            ')', t);
        EXECUTE format(
            'CREATE POLICY tenant_update ON %s FOR UPDATE '
            '  USING (tenant_id = shared.current_tenant_id() OR tenant_id IS NULL) '
            '  WITH CHECK (tenant_id = shared.current_tenant_id() OR tenant_id IS NULL)', t);
    END LOOP;
END $body$;

-- ─── Tables with tenant_id NOT NULL (own tenant only) ────────────────────────

DO $body$ DECLARE t text; BEGIN
    FOR t IN SELECT unnest(ARRAY[
        'control.entity_publish_state','control.field_security_policy',
        'control.overlay','control.overlay_change','control.entity_policy'
    ]) LOOP
        EXECUTE format(
            'CREATE POLICY tenant_read ON %s FOR SELECT USING ('
            '  tenant_id = shared.current_tenant_id_soft()'
            ')', t);
        EXECUTE format(
            'CREATE POLICY tenant_insert ON %s FOR INSERT WITH CHECK ('
            '  tenant_id = shared.current_tenant_id()'
            ')', t);
        EXECUTE format(
            'CREATE POLICY tenant_update ON %s FOR UPDATE '
            '  USING (tenant_id = shared.current_tenant_id()) '
            '  WITH CHECK (tenant_id = shared.current_tenant_id())', t);
    END LOOP;
END $body$;

-- ─── field_group: no tenant_id — platform-wide, admin-managed ────────────────

DROP POLICY IF EXISTS admin_read_fg  ON control.field_group;
DROP POLICY IF EXISTS admin_write_fg ON control.field_group;
DROP POLICY IF EXISTS public_read_fg ON control.field_group;
CREATE POLICY admin_read_fg  ON control.field_group FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write_fg ON control.field_group FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
CREATE POLICY public_read_fg ON control.field_group FOR SELECT USING (true);

DROP POLICY IF EXISTS admin_read_fgm  ON control.field_group_member;
DROP POLICY IF EXISTS admin_write_fgm ON control.field_group_member;
DROP POLICY IF EXISTS public_read_fgm ON control.field_group_member;
CREATE POLICY admin_read_fgm  ON control.field_group_member FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write_fgm ON control.field_group_member FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
CREATE POLICY public_read_fgm ON control.field_group_member FOR SELECT USING (true);

-- ============================================================================
-- LEDGER POSTING PATH — control tables
-- ============================================================================

-- ── control.book_posting_rule ────────────────────────────────────────────────
ALTER TABLE control.book_posting_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.book_posting_rule FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON control.book_posting_rule;
DROP POLICY IF EXISTS tenant_insert ON control.book_posting_rule;
DROP POLICY IF EXISTS tenant_update ON control.book_posting_rule;
DROP POLICY IF EXISTS tenant_delete ON control.book_posting_rule;
DROP POLICY IF EXISTS admin_read    ON control.book_posting_rule;
DROP POLICY IF EXISTS admin_write   ON control.book_posting_rule;
CREATE POLICY tenant_read   ON control.book_posting_rule FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON control.book_posting_rule FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON control.book_posting_rule FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON control.book_posting_rule FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON control.book_posting_rule FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON control.book_posting_rule FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ============================================================================
-- R5  control.outbox_routing_rule
--     Platform-global + tenant-scoped. Tenants read their own rules + globals.
--     Write restricted to athyperadmin (platform rules) or tenant admin for
--     their own rows.
-- ============================================================================
ALTER TABLE control.outbox_routing_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.outbox_routing_rule FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scoped_read  ON control.outbox_routing_rule;
DROP POLICY IF EXISTS admin_write  ON control.outbox_routing_rule;
CREATE POLICY scoped_read ON control.outbox_routing_rule
    FOR SELECT USING (
        tenant_id IS NULL
        OR tenant_id = shared.current_tenant_id_soft()
    );
CREATE POLICY admin_write ON control.outbox_routing_rule
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);


-- ============================================================================
-- R11  control.budget_check_config
--      Tenant-scoped. Tenants manage their own configs.
-- ============================================================================
ALTER TABLE control.budget_check_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.budget_check_config FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read   ON control.budget_check_config;
DROP POLICY IF EXISTS tenant_write  ON control.budget_check_config;
DROP POLICY IF EXISTS admin_write   ON control.budget_check_config;
CREATE POLICY tenant_read  ON control.budget_check_config
    FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_write ON control.budget_check_config
    FOR ALL USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY admin_write  ON control.budget_check_config
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);


-- ============================================================================
-- R7-A  control.wht_threshold_config
--       Tenant-scoped. Tenants manage their own WHT threshold configs.
-- ============================================================================
ALTER TABLE control.wht_threshold_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.wht_threshold_config FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read   ON control.wht_threshold_config;
DROP POLICY IF EXISTS tenant_write  ON control.wht_threshold_config;
DROP POLICY IF EXISTS admin_write   ON control.wht_threshold_config;
CREATE POLICY tenant_read  ON control.wht_threshold_config
    FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_write ON control.wht_threshold_config
    FOR ALL USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY admin_write  ON control.wht_threshold_config
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);


-- ============================================================================
-- Engine 4.13: Unified Transaction Resolution Engine additions
-- ============================================================================


-- ============================================================================
-- §0  control.transaction_event_catalog
--     Platform-global lookup (no tenant_id). Open read for all authenticated
--     sessions (event-code pickers, flow template UI). Admin-only write.
-- ============================================================================
ALTER TABLE control.transaction_event_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.transaction_event_catalog FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS open_read   ON control.transaction_event_catalog;
DROP POLICY IF EXISTS admin_write ON control.transaction_event_catalog;
CREATE POLICY open_read   ON control.transaction_event_catalog FOR SELECT USING (true);
CREATE POLICY admin_write ON control.transaction_event_catalog FOR ALL TO athyperadmin USING (true) WITH CHECK (true);


-- ============================================================================
-- §1  control.transaction_flow_template
--     tenant_id IS NULL = platform-global (read by all, managed by admin only).
--     tenant_id = UUID  = tenant override (own tenant read + write).
-- ============================================================================
ALTER TABLE control.transaction_flow_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.transaction_flow_template FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scoped_read   ON control.transaction_flow_template;
DROP POLICY IF EXISTS tenant_insert ON control.transaction_flow_template;
DROP POLICY IF EXISTS tenant_update ON control.transaction_flow_template;
DROP POLICY IF EXISTS admin_write   ON control.transaction_flow_template;

-- Global rows (NULL) visible to all authenticated sessions; own tenant rows visible to self.
CREATE POLICY scoped_read ON control.transaction_flow_template
    FOR SELECT USING (
        tenant_id IS NULL
        OR tenant_id = shared.current_tenant_id_soft()
    );

-- Tenants can only insert their own override rows (not NULL/global rows).
CREATE POLICY tenant_insert ON control.transaction_flow_template
    FOR INSERT WITH CHECK (
        tenant_id IS NOT NULL
        AND tenant_id = shared.current_tenant_id()
    );

-- Tenants can only update their own override rows.
CREATE POLICY tenant_update ON control.transaction_flow_template
    FOR UPDATE
    USING     (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id())
    WITH CHECK (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id());

CREATE POLICY admin_write ON control.transaction_flow_template
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);


-- ============================================================================
-- §2  control.acct_profile_config
-- ============================================================================
ALTER TABLE control.acct_profile_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.acct_profile_config FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON control.acct_profile_config;
DROP POLICY IF EXISTS tenant_insert ON control.acct_profile_config;
DROP POLICY IF EXISTS tenant_update ON control.acct_profile_config;
DROP POLICY IF EXISTS tenant_delete ON control.acct_profile_config;
DROP POLICY IF EXISTS admin_read    ON control.acct_profile_config;
DROP POLICY IF EXISTS admin_write   ON control.acct_profile_config;
CREATE POLICY tenant_read   ON control.acct_profile_config FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON control.acct_profile_config FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON control.acct_profile_config FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON control.acct_profile_config FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON control.acct_profile_config FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON control.acct_profile_config FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- ============================================================================
-- §3  control.acct_profile_commitment_config
-- ============================================================================
ALTER TABLE control.acct_profile_commitment_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.acct_profile_commitment_config FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON control.acct_profile_commitment_config;
DROP POLICY IF EXISTS tenant_insert ON control.acct_profile_commitment_config;
DROP POLICY IF EXISTS tenant_update ON control.acct_profile_commitment_config;
DROP POLICY IF EXISTS tenant_delete ON control.acct_profile_commitment_config;
DROP POLICY IF EXISTS admin_read    ON control.acct_profile_commitment_config;
DROP POLICY IF EXISTS admin_write   ON control.acct_profile_commitment_config;
CREATE POLICY tenant_read   ON control.acct_profile_commitment_config FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON control.acct_profile_commitment_config FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON control.acct_profile_commitment_config FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON control.acct_profile_commitment_config FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON control.acct_profile_commitment_config FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON control.acct_profile_commitment_config FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- ============================================================================
-- §4  control.acct_profile_revenue_config
-- ============================================================================
ALTER TABLE control.acct_profile_revenue_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.acct_profile_revenue_config FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON control.acct_profile_revenue_config;
DROP POLICY IF EXISTS tenant_insert ON control.acct_profile_revenue_config;
DROP POLICY IF EXISTS tenant_update ON control.acct_profile_revenue_config;
DROP POLICY IF EXISTS tenant_delete ON control.acct_profile_revenue_config;
DROP POLICY IF EXISTS admin_read    ON control.acct_profile_revenue_config;
DROP POLICY IF EXISTS admin_write   ON control.acct_profile_revenue_config;
CREATE POLICY tenant_read   ON control.acct_profile_revenue_config FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON control.acct_profile_revenue_config FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON control.acct_profile_revenue_config FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON control.acct_profile_revenue_config FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON control.acct_profile_revenue_config FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON control.acct_profile_revenue_config FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- ============================================================================
-- §5  control.acct_profile_settlement_config
-- ============================================================================
ALTER TABLE control.acct_profile_settlement_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.acct_profile_settlement_config FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON control.acct_profile_settlement_config;
DROP POLICY IF EXISTS tenant_insert ON control.acct_profile_settlement_config;
DROP POLICY IF EXISTS tenant_update ON control.acct_profile_settlement_config;
DROP POLICY IF EXISTS tenant_delete ON control.acct_profile_settlement_config;
DROP POLICY IF EXISTS admin_read    ON control.acct_profile_settlement_config;
DROP POLICY IF EXISTS admin_write   ON control.acct_profile_settlement_config;
CREATE POLICY tenant_read   ON control.acct_profile_settlement_config FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON control.acct_profile_settlement_config FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON control.acct_profile_settlement_config FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON control.acct_profile_settlement_config FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON control.acct_profile_settlement_config FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON control.acct_profile_settlement_config FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- ============================================================================
-- §6  control.acct_profile_event
-- ============================================================================
ALTER TABLE control.acct_profile_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.acct_profile_event FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON control.acct_profile_event;
DROP POLICY IF EXISTS tenant_insert ON control.acct_profile_event;
DROP POLICY IF EXISTS tenant_update ON control.acct_profile_event;
DROP POLICY IF EXISTS tenant_delete ON control.acct_profile_event;
DROP POLICY IF EXISTS admin_read    ON control.acct_profile_event;
DROP POLICY IF EXISTS admin_write   ON control.acct_profile_event;
CREATE POLICY tenant_read   ON control.acct_profile_event FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON control.acct_profile_event FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON control.acct_profile_event FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON control.acct_profile_event FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON control.acct_profile_event FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON control.acct_profile_event FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- ============================================================================
-- §7  control.acct_profile_entry_template
-- ============================================================================
ALTER TABLE control.acct_profile_entry_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.acct_profile_entry_template FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON control.acct_profile_entry_template;
DROP POLICY IF EXISTS tenant_insert ON control.acct_profile_entry_template;
DROP POLICY IF EXISTS tenant_update ON control.acct_profile_entry_template;
DROP POLICY IF EXISTS tenant_delete ON control.acct_profile_entry_template;
DROP POLICY IF EXISTS admin_read    ON control.acct_profile_entry_template;
DROP POLICY IF EXISTS admin_write   ON control.acct_profile_entry_template;
CREATE POLICY tenant_read   ON control.acct_profile_entry_template FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON control.acct_profile_entry_template FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON control.acct_profile_entry_template FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON control.acct_profile_entry_template FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON control.acct_profile_entry_template FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON control.acct_profile_entry_template FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- ============================================================================
-- §8  control.acct_profile_book_rule
-- ============================================================================
ALTER TABLE control.acct_profile_book_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.acct_profile_book_rule FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON control.acct_profile_book_rule;
DROP POLICY IF EXISTS tenant_insert ON control.acct_profile_book_rule;
DROP POLICY IF EXISTS tenant_update ON control.acct_profile_book_rule;
DROP POLICY IF EXISTS tenant_delete ON control.acct_profile_book_rule;
DROP POLICY IF EXISTS admin_read    ON control.acct_profile_book_rule;
DROP POLICY IF EXISTS admin_write   ON control.acct_profile_book_rule;
CREATE POLICY tenant_read   ON control.acct_profile_book_rule FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON control.acct_profile_book_rule FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON control.acct_profile_book_rule FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON control.acct_profile_book_rule FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON control.acct_profile_book_rule FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON control.acct_profile_book_rule FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- ============================================================================
-- §9  control.acct_profile_dimension_rule
-- ============================================================================
ALTER TABLE control.acct_profile_dimension_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.acct_profile_dimension_rule FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON control.acct_profile_dimension_rule;
DROP POLICY IF EXISTS tenant_insert ON control.acct_profile_dimension_rule;
DROP POLICY IF EXISTS tenant_update ON control.acct_profile_dimension_rule;
DROP POLICY IF EXISTS tenant_delete ON control.acct_profile_dimension_rule;
DROP POLICY IF EXISTS admin_read    ON control.acct_profile_dimension_rule;
DROP POLICY IF EXISTS admin_write   ON control.acct_profile_dimension_rule;
CREATE POLICY tenant_read   ON control.acct_profile_dimension_rule FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON control.acct_profile_dimension_rule FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON control.acct_profile_dimension_rule FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON control.acct_profile_dimension_rule FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON control.acct_profile_dimension_rule FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON control.acct_profile_dimension_rule FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- ============================================================================
-- §10  control.classification_to_intent_rule
-- ============================================================================
ALTER TABLE control.classification_to_intent_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.classification_to_intent_rule FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON control.classification_to_intent_rule;
DROP POLICY IF EXISTS tenant_insert ON control.classification_to_intent_rule;
DROP POLICY IF EXISTS tenant_update ON control.classification_to_intent_rule;
DROP POLICY IF EXISTS tenant_delete ON control.classification_to_intent_rule;
DROP POLICY IF EXISTS admin_read    ON control.classification_to_intent_rule;
DROP POLICY IF EXISTS admin_write   ON control.classification_to_intent_rule;
CREATE POLICY tenant_read   ON control.classification_to_intent_rule FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON control.classification_to_intent_rule FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON control.classification_to_intent_rule FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON control.classification_to_intent_rule FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON control.classification_to_intent_rule FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON control.classification_to_intent_rule FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- ============================================================================
-- §11  control.intent_to_accounting_profile_rule
-- ============================================================================
ALTER TABLE control.intent_to_accounting_profile_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.intent_to_accounting_profile_rule FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON control.intent_to_accounting_profile_rule;
DROP POLICY IF EXISTS tenant_insert ON control.intent_to_accounting_profile_rule;
DROP POLICY IF EXISTS tenant_update ON control.intent_to_accounting_profile_rule;
DROP POLICY IF EXISTS tenant_delete ON control.intent_to_accounting_profile_rule;
DROP POLICY IF EXISTS admin_read    ON control.intent_to_accounting_profile_rule;
DROP POLICY IF EXISTS admin_write   ON control.intent_to_accounting_profile_rule;
CREATE POLICY tenant_read   ON control.intent_to_accounting_profile_rule FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON control.intent_to_accounting_profile_rule FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON control.intent_to_accounting_profile_rule FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON control.intent_to_accounting_profile_rule FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON control.intent_to_accounting_profile_rule FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON control.intent_to_accounting_profile_rule FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- ============================================================================
-- §12  control.intent_profile_override
-- Governance-gated: tenants can submit (INSERT) and view their own overrides.
-- Tenants cannot self-approve (approved_by/approved_at set only by admin or
-- an elevated-role principal — enforced at application layer).
-- ============================================================================
ALTER TABLE control.intent_profile_override ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.intent_profile_override FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON control.intent_profile_override;
DROP POLICY IF EXISTS tenant_insert ON control.intent_profile_override;
DROP POLICY IF EXISTS tenant_update ON control.intent_profile_override;
DROP POLICY IF EXISTS admin_read    ON control.intent_profile_override;
DROP POLICY IF EXISTS admin_write   ON control.intent_profile_override;
CREATE POLICY tenant_read   ON control.intent_profile_override FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON control.intent_profile_override FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
-- Tenants may update own rows (e.g. withdraw a pending_approval override).
CREATE POLICY tenant_update ON control.intent_profile_override FOR UPDATE
    USING     (tenant_id = shared.current_tenant_id() AND status IN ('pending_approval','inactive'))
    WITH CHECK (tenant_id = shared.current_tenant_id());
-- No tenant_delete — use status=revoked transition.
CREATE POLICY admin_read  ON control.intent_profile_override FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write ON control.intent_profile_override FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- ── bank_format_rule ─────────────────────────────────────────────────────────
ALTER TABLE control.bank_format_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.bank_format_rule FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read ON control.bank_format_rule;
DROP POLICY IF EXISTS tenant_insert ON control.bank_format_rule;
DROP POLICY IF EXISTS tenant_update ON control.bank_format_rule;
DROP POLICY IF EXISTS admin_read ON control.bank_format_rule;
DROP POLICY IF EXISTS admin_write ON control.bank_format_rule;
CREATE POLICY tenant_read   ON control.bank_format_rule FOR SELECT USING (
    tenant_id IS NULL OR tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON control.bank_format_rule FOR INSERT WITH CHECK (
    tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON control.bank_format_rule FOR UPDATE
    USING (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id())
    WITH CHECK (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON control.bank_format_rule FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON control.bank_format_rule FOR ALL TO athyperadmin USING (true) WITH CHECK (true);


-- ── payment_method_company_policy ────────────────────────────────────────────
ALTER TABLE control.payment_method_company_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.payment_method_company_policy FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON control.payment_method_company_policy;
DROP POLICY IF EXISTS tenant_insert ON control.payment_method_company_policy;
DROP POLICY IF EXISTS tenant_update ON control.payment_method_company_policy;
DROP POLICY IF EXISTS tenant_delete ON control.payment_method_company_policy;
DROP POLICY IF EXISTS admin_read    ON control.payment_method_company_policy;
DROP POLICY IF EXISTS admin_write   ON control.payment_method_company_policy;
CREATE POLICY tenant_read   ON control.payment_method_company_policy FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON control.payment_method_company_policy FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON control.payment_method_company_policy FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON control.payment_method_company_policy FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON control.payment_method_company_policy FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON control.payment_method_company_policy FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── bank_interface_profile (SENSITIVE config — no tenant_delete) ─────────────
ALTER TABLE control.bank_interface_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.bank_interface_profile FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON control.bank_interface_profile;
DROP POLICY IF EXISTS tenant_insert ON control.bank_interface_profile;
DROP POLICY IF EXISTS tenant_update ON control.bank_interface_profile;
DROP POLICY IF EXISTS tenant_delete ON control.bank_interface_profile;
DROP POLICY IF EXISTS admin_read    ON control.bank_interface_profile;
DROP POLICY IF EXISTS admin_write   ON control.bank_interface_profile;
CREATE POLICY tenant_read   ON control.bank_interface_profile FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON control.bank_interface_profile FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON control.bank_interface_profile FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON control.bank_interface_profile FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON control.bank_interface_profile FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── payment_method_interface_binding ─────────────────────────────────────────
ALTER TABLE control.payment_method_interface_binding ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.payment_method_interface_binding FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON control.payment_method_interface_binding;
DROP POLICY IF EXISTS tenant_insert ON control.payment_method_interface_binding;
DROP POLICY IF EXISTS tenant_update ON control.payment_method_interface_binding;
DROP POLICY IF EXISTS admin_read    ON control.payment_method_interface_binding;
DROP POLICY IF EXISTS admin_write   ON control.payment_method_interface_binding;
CREATE POLICY tenant_read   ON control.payment_method_interface_binding FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON control.payment_method_interface_binding FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON control.payment_method_interface_binding FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON control.payment_method_interface_binding FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON control.payment_method_interface_binding FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── payment_settlement_rule ──────────────────────────────────────────────────
ALTER TABLE control.payment_settlement_rule ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.payment_settlement_rule FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON control.payment_settlement_rule;
DROP POLICY IF EXISTS tenant_insert ON control.payment_settlement_rule;
DROP POLICY IF EXISTS tenant_update ON control.payment_settlement_rule;
DROP POLICY IF EXISTS admin_read    ON control.payment_settlement_rule;
DROP POLICY IF EXISTS admin_write   ON control.payment_settlement_rule;
CREATE POLICY tenant_read   ON control.payment_settlement_rule FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON control.payment_settlement_rule FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON control.payment_settlement_rule FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON control.payment_settlement_rule FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON control.payment_settlement_rule FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── asset_class_book_policy ────────────────────────────────────────────────
ALTER TABLE control.asset_class_book_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.asset_class_book_policy FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON control.asset_class_book_policy;
DROP POLICY IF EXISTS tenant_insert ON control.asset_class_book_policy;
DROP POLICY IF EXISTS tenant_update ON control.asset_class_book_policy;
DROP POLICY IF EXISTS tenant_delete ON control.asset_class_book_policy;
DROP POLICY IF EXISTS admin_read    ON control.asset_class_book_policy;
DROP POLICY IF EXISTS admin_write   ON control.asset_class_book_policy;
CREATE POLICY tenant_read   ON control.asset_class_book_policy FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON control.asset_class_book_policy FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON control.asset_class_book_policy FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON control.asset_class_book_policy FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON control.asset_class_book_policy FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON control.asset_class_book_policy FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- ── blueprint_registry ────────────────────────────────────────────────────────
-- R6: platform-global table (no tenant_id). Open read for all authenticated
-- sessions (provisioning API, tenant wizard). Write restricted to athyperadmin.
ALTER TABLE control.blueprint_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.blueprint_registry FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS open_read  ON control.blueprint_registry;
DROP POLICY IF EXISTS admin_write ON control.blueprint_registry;
CREATE POLICY open_read   ON control.blueprint_registry FOR SELECT USING (true);
CREATE POLICY admin_write ON control.blueprint_registry FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- ── tenant_blueprint_application ──────────────────────────────────────────────
-- R6: tenant-scoped provisioning audit log. Tenants read their own applications.
-- athyperadmin has full cross-tenant access for provisioning operations.
ALTER TABLE control.tenant_blueprint_application ENABLE ROW LEVEL SECURITY;
ALTER TABLE control.tenant_blueprint_application FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scoped_read  ON control.tenant_blueprint_application;
DROP POLICY IF EXISTS admin_write  ON control.tenant_blueprint_application;
CREATE POLICY scoped_read ON control.tenant_blueprint_application
    FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY admin_write ON control.tenant_blueprint_application
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);
