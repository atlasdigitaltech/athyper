-- 11_rls_policies/003_master.sql
-- Depends on: 04_tables/003_master.sql, 04_tables/003e_master_ui_principal.sql,
--             05_pre_constraint_functions/001_shared.sql (shared.current_tenant_id_soft,
--                                                         shared.current_tenant_id)
-- Covers all master schema RLS policies (merged from 003_master + 003b_master_ui_principal).


ALTER TABLE master.tenant ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.tenant FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS open_read   ON master.tenant;
DROP POLICY IF EXISTS admin_write ON master.tenant;
DROP POLICY IF EXISTS self_read   ON master.tenant;
DROP POLICY IF EXISTS admin_read  ON master.tenant;

-- Authenticated tenant sessions see ONLY their own row
-- current_tenant_id_soft() returns NULL when GUC unset → NULL = uuid never matches → zero rows
CREATE POLICY self_read ON master.tenant
    FOR SELECT
    USING (id = shared.current_tenant_id_soft());

-- Platform admin sees all tenants
CREATE POLICY admin_read ON master.tenant
    FOR SELECT TO athyperadmin
    USING (true);

-- Platform admin full DML (seed, corrections, suspension)
CREATE POLICY admin_write ON master.tenant
    FOR ALL TO athyperadmin
    USING (true)
    WITH CHECK (true);

-- No tenant_write — tenants never INSERT/UPDATE their own root row directly.
-- Self-service updates go through fn_update_tenant_profile().
-- Registration goes through fn_register_tenant().

-- ── principal, principal_profile, contact_link, contact_email, contact_phone ──
-- Tenant isolation: tenant sees own rows only. Admin full access.

ALTER TABLE master.principal         ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.principal         FORCE ROW LEVEL SECURITY;
ALTER TABLE master.principal_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.principal_profile FORCE ROW LEVEL SECURITY;
ALTER TABLE master.contact_link     ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.contact_link     FORCE ROW LEVEL SECURITY;
ALTER TABLE master.contact_email     ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.contact_email     FORCE ROW LEVEL SECURITY;
ALTER TABLE master.contact_phone     ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.contact_phone     FORCE ROW LEVEL SECURITY;

-- principal
-- No tenant_write on principal. ALL mutations go through SECURITY DEFINER functions:
--   fn_register_tenant()  — creates principal + profile + contact_link atomically
-- Direct DML by tenant sessions is intentionally blocked.
DROP POLICY IF EXISTS tenant_read  ON master.principal;
DROP POLICY IF EXISTS admin_read   ON master.principal;
DROP POLICY IF EXISTS admin_write  ON master.principal;

CREATE POLICY tenant_read ON master.principal FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY admin_read  ON master.principal FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write ON master.principal FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

-- principal_profile
-- No tenant_write on principal_profile — same rationale as principal.
-- Mutations via SECURITY DEFINER functions only.
DROP POLICY IF EXISTS tenant_read  ON master.principal_profile;
DROP POLICY IF EXISTS admin_read   ON master.principal_profile;
DROP POLICY IF EXISTS admin_write  ON master.principal_profile;

CREATE POLICY tenant_read ON master.principal_profile FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY admin_read  ON master.principal_profile FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write ON master.principal_profile FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

-- contact_link (Pattern B: split tenant DML)
DROP POLICY IF EXISTS tenant_read   ON master.contact_link;
DROP POLICY IF EXISTS tenant_write  ON master.contact_link;
DROP POLICY IF EXISTS tenant_insert ON master.contact_link;
DROP POLICY IF EXISTS tenant_update ON master.contact_link;
DROP POLICY IF EXISTS tenant_delete ON master.contact_link;
DROP POLICY IF EXISTS admin_read    ON master.contact_link;
DROP POLICY IF EXISTS admin_write   ON master.contact_link;

CREATE POLICY tenant_read   ON master.contact_link FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.contact_link FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.contact_link FOR UPDATE USING (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.contact_link FOR DELETE USING (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.contact_link FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.contact_link FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

-- contact_email (Pattern B: split tenant DML)
DROP POLICY IF EXISTS tenant_read   ON master.contact_email;
DROP POLICY IF EXISTS tenant_write  ON master.contact_email;
DROP POLICY IF EXISTS tenant_insert ON master.contact_email;
DROP POLICY IF EXISTS tenant_update ON master.contact_email;
DROP POLICY IF EXISTS tenant_delete ON master.contact_email;
DROP POLICY IF EXISTS admin_read    ON master.contact_email;
DROP POLICY IF EXISTS admin_write   ON master.contact_email;

CREATE POLICY tenant_read   ON master.contact_email FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.contact_email FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.contact_email FOR UPDATE USING (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.contact_email FOR DELETE USING (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.contact_email FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.contact_email FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

-- contact_phone (Pattern B: split tenant DML)
DROP POLICY IF EXISTS tenant_read   ON master.contact_phone;
DROP POLICY IF EXISTS tenant_write  ON master.contact_phone;
DROP POLICY IF EXISTS tenant_insert ON master.contact_phone;
DROP POLICY IF EXISTS tenant_update ON master.contact_phone;
DROP POLICY IF EXISTS tenant_delete ON master.contact_phone;
DROP POLICY IF EXISTS admin_read    ON master.contact_phone;
DROP POLICY IF EXISTS admin_write   ON master.contact_phone;

CREATE POLICY tenant_read   ON master.contact_phone FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.contact_phone FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.contact_phone FOR UPDATE USING (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.contact_phone FOR DELETE USING (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.contact_phone FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.contact_phone FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

-- ── label ──
-- Global labels (tenant_id IS NULL) visible to all. Tenant-specific labels visible to owning tenant.
ALTER TABLE master.label ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.label FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read   ON master.label;
DROP POLICY IF EXISTS tenant_insert ON master.label;
DROP POLICY IF EXISTS tenant_update ON master.label;
DROP POLICY IF EXISTS admin_read    ON master.label;
DROP POLICY IF EXISTS admin_write   ON master.label;

CREATE POLICY tenant_read ON master.label FOR SELECT USING (tenant_id IS NULL OR tenant_id = shared.current_tenant_id_soft());

-- Tenant write: own tenant labels only (global labels are admin-only)
CREATE POLICY tenant_insert ON master.label
    FOR INSERT
    WITH CHECK (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id());

CREATE POLICY tenant_update ON master.label
    FOR UPDATE
    USING  (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id())
    WITH CHECK (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id());

-- No tenant_delete — tenants deprecate labels (status='deprecated'), not delete.
CREATE POLICY admin_read  ON master.label FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write ON master.label FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

-- ── label_entity_type ──
-- Platform-wide config table — admin-only writes, readable by all.
ALTER TABLE master.label_entity_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.label_entity_type FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS open_read   ON master.label_entity_type;
DROP POLICY IF EXISTS admin_read  ON master.label_entity_type;
DROP POLICY IF EXISTS admin_write ON master.label_entity_type;

CREATE POLICY open_read   ON master.label_entity_type FOR SELECT USING (true);
CREATE POLICY admin_read  ON master.label_entity_type FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write ON master.label_entity_type FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

-- ── owner_type ──
-- System rows (tenant_id IS NULL) visible to all. Tenant custom rows visible to owning tenant.
ALTER TABLE master.owner_type ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.owner_type FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read   ON master.owner_type;
DROP POLICY IF EXISTS tenant_write  ON master.owner_type;
DROP POLICY IF EXISTS tenant_update ON master.owner_type;
DROP POLICY IF EXISTS tenant_delete ON master.owner_type;
DROP POLICY IF EXISTS admin_read    ON master.owner_type;
DROP POLICY IF EXISTS admin_write   ON master.owner_type;

CREATE POLICY tenant_read ON master.owner_type FOR SELECT USING (tenant_id IS NULL OR tenant_id = shared.current_tenant_id_soft());

-- Tenant self-service: INSERT custom (non-system) owner types scoped to own tenant
CREATE POLICY tenant_write ON master.owner_type
    FOR INSERT
    WITH CHECK (
        tenant_id IS NOT NULL
        AND tenant_id = shared.current_tenant_id()
        AND is_system = false
    );

-- Tenant self-service: UPDATE own custom owner types only.
-- Tenants deprecate (status='deprecated') rather than DELETE.
-- fn_guard_owner_type_in_use blocks deprecation when active references exist.
CREATE POLICY tenant_update ON master.owner_type
    FOR UPDATE
    USING  (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id() AND is_system = false)
    WITH CHECK (tenant_id IS NOT NULL AND tenant_id = shared.current_tenant_id() AND is_system = false);

-- No tenant_delete — tenants deprecate, not delete. Admin can DELETE via admin_write.
-- Hard DELETE is guarded by fn_guard_owner_type_in_use trigger.

CREATE POLICY admin_read  ON master.owner_type FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write ON master.owner_type FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

-- ── address ── (Pattern B: split tenant DML)
-- Tenant isolation: tenant sees own rows only. Admin full access.
ALTER TABLE master.address ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.address FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read   ON master.address;
DROP POLICY IF EXISTS tenant_write  ON master.address;
DROP POLICY IF EXISTS tenant_insert ON master.address;
DROP POLICY IF EXISTS tenant_update ON master.address;
DROP POLICY IF EXISTS tenant_delete ON master.address;
DROP POLICY IF EXISTS admin_read    ON master.address;
DROP POLICY IF EXISTS admin_write   ON master.address;

CREATE POLICY tenant_read   ON master.address FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.address FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.address FOR UPDATE USING (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.address FOR DELETE USING (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.address FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.address FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

-- ── address_link ── (Pattern B: split tenant DML)
-- Tenant isolation: tenant sees own rows only. Admin full access.
ALTER TABLE master.address_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.address_link FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read   ON master.address_link;
DROP POLICY IF EXISTS tenant_write  ON master.address_link;
DROP POLICY IF EXISTS tenant_insert ON master.address_link;
DROP POLICY IF EXISTS tenant_update ON master.address_link;
DROP POLICY IF EXISTS tenant_delete ON master.address_link;
DROP POLICY IF EXISTS admin_read    ON master.address_link;
DROP POLICY IF EXISTS admin_write   ON master.address_link;

CREATE POLICY tenant_read   ON master.address_link FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.address_link FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.address_link FOR UPDATE USING (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.address_link FOR DELETE USING (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.address_link FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.address_link FOR ALL TO athyperadmin USING (true) WITH CHECK (true);


-- ============================================================================
-- RBAC Phase 2 RLS — tenant-scoped tables (Pattern B: split tenant DML)
-- ============================================================================

-- operating_unit RLS policies removed — table dropped in company_code migration.

-- ── tenant_module_subscription ──
ALTER TABLE master.tenant_module_subscription ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.tenant_module_subscription FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read   ON master.tenant_module_subscription;
DROP POLICY IF EXISTS tenant_insert ON master.tenant_module_subscription;
DROP POLICY IF EXISTS tenant_update ON master.tenant_module_subscription;
DROP POLICY IF EXISTS admin_read    ON master.tenant_module_subscription;
DROP POLICY IF EXISTS admin_write   ON master.tenant_module_subscription;

CREATE POLICY tenant_read   ON master.tenant_module_subscription FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.tenant_module_subscription FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.tenant_module_subscription FOR UPDATE USING (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.tenant_module_subscription FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.tenant_module_subscription FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

-- ── tenant_feature_entitlement ──
ALTER TABLE master.tenant_feature_entitlement ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.tenant_feature_entitlement FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read  ON master.tenant_feature_entitlement;
DROP POLICY IF EXISTS admin_read   ON master.tenant_feature_entitlement;
DROP POLICY IF EXISTS admin_write  ON master.tenant_feature_entitlement;

CREATE POLICY tenant_read  ON master.tenant_feature_entitlement FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY admin_read   ON master.tenant_feature_entitlement FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write  ON master.tenant_feature_entitlement FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

-- ── tenant_permission_override ──
ALTER TABLE master.tenant_permission_override ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.tenant_permission_override FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read  ON master.tenant_permission_override;
DROP POLICY IF EXISTS admin_read   ON master.tenant_permission_override;
DROP POLICY IF EXISTS admin_write  ON master.tenant_permission_override;

CREATE POLICY tenant_read  ON master.tenant_permission_override FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY admin_read   ON master.tenant_permission_override FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write  ON master.tenant_permission_override FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

-- ── company_code_access ──
ALTER TABLE master.company_code_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.company_code_access FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read   ON master.company_code_access;
DROP POLICY IF EXISTS tenant_insert ON master.company_code_access;
DROP POLICY IF EXISTS tenant_update ON master.company_code_access;
DROP POLICY IF EXISTS tenant_delete ON master.company_code_access;
DROP POLICY IF EXISTS admin_read    ON master.company_code_access;
DROP POLICY IF EXISTS admin_write   ON master.company_code_access;

CREATE POLICY tenant_read   ON master.company_code_access FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.company_code_access FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.company_code_access FOR UPDATE USING (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.company_code_access FOR DELETE USING (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.company_code_access FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.company_code_access FOR ALL TO athyperadmin USING (true) WITH CHECK (true);


-- ============================================================================
-- RBAC Phase 3 RLS — tenant-scoped RBAC tables (Pattern B: split tenant DML)
-- ============================================================================

-- Macro: all Phase 3 tables follow the same pattern:
-- tenant_read (SELECT), tenant_insert, tenant_update, admin_read, admin_write.
-- No tenant_delete on RBAC tables — soft-delete via status change.

-- ── role ──
-- shared.role has no RLS — it is a platform-level read-only reference table.
-- All authenticated roles can read; writes are admin-only via schema grants.

-- ── auth_group ──
ALTER TABLE master.auth_group ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.auth_group FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read   ON master.auth_group;
DROP POLICY IF EXISTS tenant_insert ON master.auth_group;
DROP POLICY IF EXISTS tenant_update ON master.auth_group;
DROP POLICY IF EXISTS admin_read    ON master.auth_group;
DROP POLICY IF EXISTS admin_write   ON master.auth_group;

CREATE POLICY tenant_read   ON master.auth_group FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.auth_group FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.auth_group FOR UPDATE USING (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.auth_group FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.auth_group FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

-- ── auth_group_role ──
ALTER TABLE master.auth_group_role ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.auth_group_role FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read   ON master.auth_group_role;
DROP POLICY IF EXISTS tenant_insert ON master.auth_group_role;
DROP POLICY IF EXISTS tenant_update ON master.auth_group_role;
DROP POLICY IF EXISTS tenant_delete ON master.auth_group_role;
DROP POLICY IF EXISTS admin_read    ON master.auth_group_role;
DROP POLICY IF EXISTS admin_write   ON master.auth_group_role;

CREATE POLICY tenant_read   ON master.auth_group_role FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.auth_group_role FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.auth_group_role FOR UPDATE USING (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.auth_group_role FOR DELETE USING (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.auth_group_role FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.auth_group_role FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

-- ── auth_group_member ──
ALTER TABLE master.auth_group_member ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.auth_group_member FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read   ON master.auth_group_member;
DROP POLICY IF EXISTS tenant_insert ON master.auth_group_member;
DROP POLICY IF EXISTS tenant_delete ON master.auth_group_member;
DROP POLICY IF EXISTS admin_read    ON master.auth_group_member;
DROP POLICY IF EXISTS admin_write   ON master.auth_group_member;

CREATE POLICY tenant_read   ON master.auth_group_member FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.auth_group_member FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.auth_group_member FOR DELETE USING (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.auth_group_member FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.auth_group_member FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

-- ── principal_persona ──
ALTER TABLE master.principal_persona ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.principal_persona FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read   ON master.principal_persona;
DROP POLICY IF EXISTS tenant_insert ON master.principal_persona;
DROP POLICY IF EXISTS tenant_update ON master.principal_persona;
DROP POLICY IF EXISTS admin_read    ON master.principal_persona;
DROP POLICY IF EXISTS admin_write   ON master.principal_persona;

CREATE POLICY tenant_read   ON master.principal_persona FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.principal_persona FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.principal_persona FOR UPDATE USING (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.principal_persona FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.principal_persona FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

-- ── team ──
ALTER TABLE master.team ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.team FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read   ON master.team;
DROP POLICY IF EXISTS tenant_insert ON master.team;
DROP POLICY IF EXISTS tenant_update ON master.team;
DROP POLICY IF EXISTS admin_read    ON master.team;
DROP POLICY IF EXISTS admin_write   ON master.team;

CREATE POLICY tenant_read   ON master.team FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.team FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.team FOR UPDATE USING (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.team FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.team FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

-- ── team_member ──
ALTER TABLE master.team_member ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.team_member FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read   ON master.team_member;
DROP POLICY IF EXISTS tenant_insert ON master.team_member;
DROP POLICY IF EXISTS tenant_delete ON master.team_member;
DROP POLICY IF EXISTS admin_read    ON master.team_member;
DROP POLICY IF EXISTS admin_write   ON master.team_member;

CREATE POLICY tenant_read   ON master.team_member FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.team_member FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.team_member FOR DELETE USING (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.team_member FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.team_member FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

-- ── access_grant ──
ALTER TABLE master.access_grant ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.access_grant FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read   ON master.access_grant;
DROP POLICY IF EXISTS tenant_insert ON master.access_grant;
DROP POLICY IF EXISTS tenant_update ON master.access_grant;
DROP POLICY IF EXISTS admin_read    ON master.access_grant;
DROP POLICY IF EXISTS admin_write   ON master.access_grant;

CREATE POLICY tenant_read   ON master.access_grant FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.access_grant FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.access_grant FOR UPDATE USING (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.access_grant FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.access_grant FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

-- ── group_feature_grant ──
ALTER TABLE master.group_feature_grant ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.group_feature_grant FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read   ON master.group_feature_grant;
DROP POLICY IF EXISTS tenant_insert ON master.group_feature_grant;
DROP POLICY IF EXISTS tenant_delete ON master.group_feature_grant;
DROP POLICY IF EXISTS admin_read    ON master.group_feature_grant;
DROP POLICY IF EXISTS admin_write   ON master.group_feature_grant;

CREATE POLICY tenant_read   ON master.group_feature_grant FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.group_feature_grant FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.group_feature_grant FOR DELETE USING (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.group_feature_grant FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.group_feature_grant FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

-- ── principal_feature_grant ──
ALTER TABLE master.principal_feature_grant ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.principal_feature_grant FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_read   ON master.principal_feature_grant;
DROP POLICY IF EXISTS tenant_insert ON master.principal_feature_grant;
DROP POLICY IF EXISTS tenant_delete ON master.principal_feature_grant;
DROP POLICY IF EXISTS admin_read    ON master.principal_feature_grant;
DROP POLICY IF EXISTS admin_write   ON master.principal_feature_grant;

CREATE POLICY tenant_read   ON master.principal_feature_grant FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.principal_feature_grant FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.principal_feature_grant FOR DELETE USING (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.principal_feature_grant FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.principal_feature_grant FOR ALL TO athyperadmin USING (true) WITH CHECK (true);


-- ============================================================================
-- §27  notification (per-recipient inbox — mutable, partitioned)
-- ============================================================================
ALTER TABLE master.notification ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.notification FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.notification;
DROP POLICY IF EXISTS tenant_insert ON master.notification;
DROP POLICY IF EXISTS tenant_update ON master.notification;
DROP POLICY IF EXISTS admin_read    ON master.notification;
DROP POLICY IF EXISTS admin_write   ON master.notification;

CREATE POLICY tenant_read   ON master.notification
    FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.notification
    FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
-- Patch 001 Fix 4: add recipient ownership check to USING.
-- Patch 002 Fix 3: mirror recipient_id in WITH CHECK — without it a user could SELECT their
-- own notification (USING passes), then UPDATE SET recipient_id = <other_principal> and the
-- WITH CHECK (tenant_id only) would pass, reassigning the row to another principal.
-- Bulk cross-user updates (e.g. "dismiss all for deleted message") require athyperadmin role.
CREATE POLICY tenant_update ON master.notification
    FOR UPDATE
    USING (
        tenant_id    = shared.current_tenant_id()
        AND recipient_id = nullif(current_setting('app.current_principal_id', true), '')::uuid
    )
    WITH CHECK (
        tenant_id    = shared.current_tenant_id()
        AND recipient_id = nullif(current_setting('app.current_principal_id', true), '')::uuid
    );
CREATE POLICY admin_read    ON master.notification
    FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.notification
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

-- 11_rls_policies/012_identity_sharing.sql
-- RLS for master.tenant_profile and master.delegation_grant.


-- —— master.tenant_profile ———————————————————————————————————————————————
-- Tenant can read and update their own profile.
-- INSERT restricted to first-time setup (admin creates on tenant provisioning).
-- No DELETE — tenant profile persists for the life of the tenant.
ALTER TABLE master.tenant_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.tenant_profile FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.tenant_profile;
DROP POLICY IF EXISTS tenant_insert ON master.tenant_profile;
DROP POLICY IF EXISTS tenant_update ON master.tenant_profile;
DROP POLICY IF EXISTS admin_read    ON master.tenant_profile;
DROP POLICY IF EXISTS admin_write   ON master.tenant_profile;

CREATE POLICY tenant_read   ON master.tenant_profile
    FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());

CREATE POLICY tenant_insert ON master.tenant_profile
    FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY tenant_update ON master.tenant_profile
    FOR UPDATE
    USING     (tenant_id = shared.current_tenant_id())
    WITH CHECK (tenant_id = shared.current_tenant_id());

CREATE POLICY admin_read    ON master.tenant_profile
    FOR SELECT TO athyperadmin USING (true);

CREATE POLICY admin_write   ON master.tenant_profile
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);


-- —— master.delegation_grant —————————————————————————————————————————————
-- Both delegator and delegate can READ the grant (both sides need visibility).
-- INSERT: done by the approval worker (runs as tenant session after request approved).
-- UPDATE: restricted to revocation columns only — guard trigger enforces this.
-- DELETE: blocked — revocation uses is_revoked flag, not DELETE.
ALTER TABLE master.delegation_grant ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.delegation_grant FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.delegation_grant;
DROP POLICY IF EXISTS tenant_insert ON master.delegation_grant;
DROP POLICY IF EXISTS tenant_update ON master.delegation_grant;
DROP POLICY IF EXISTS admin_read    ON master.delegation_grant;
DROP POLICY IF EXISTS admin_write   ON master.delegation_grant;

-- Both parties in the same tenant can read the grant
CREATE POLICY tenant_read   ON master.delegation_grant
    FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());

-- Approval worker inserts the grant in tenant context
CREATE POLICY tenant_insert ON master.delegation_grant
    FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());

-- Revocation only — mutation guard trigger restricts which columns change
CREATE POLICY tenant_update ON master.delegation_grant
    FOR UPDATE
    USING     (tenant_id = shared.current_tenant_id())
    WITH CHECK (tenant_id = shared.current_tenant_id());

-- No tenant DELETE policy — revocation uses is_revoked=true, not DELETE

CREATE POLICY admin_read    ON master.delegation_grant
    FOR SELECT TO athyperadmin USING (true);

CREATE POLICY admin_write   ON master.delegation_grant
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);

-- 11_rls_policies/013_collab.sql
-- RLS for collaboration cluster — all 11 tables.
-- Depends on: 04_tables/013_collab.sql
--
-- Policy groups:
--   Standard tenant-isolated (most tables):
--     tenant_read, tenant_insert, tenant_update, admin_read, admin_write
--
--   Soft-delete aware (master.comment, master.comment_draft, master.conversation):
--     Tenant SELECT sees deleted rows too — soft-delete filtered at query layer.
--
--   Append-only (master.comment_mention):
--     No UPDATE / DELETE for tenant role — mentions are immutable.
--
--   Reaction (master.comment_reaction):
--     Tenant can DELETE own reactions (toggle off).
--
--   Governance (governance.comment_moderation):
--     Tenant can read moderation state (is_hidden visible to all).
--     INSERT / UPDATE restricted to athyperadmin (trigger-managed).


-- —— §1  master.attachment ———————————————————————————————————————————————
ALTER TABLE master.attachment ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.attachment FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.attachment;
DROP POLICY IF EXISTS tenant_insert ON master.attachment;
DROP POLICY IF EXISTS tenant_update ON master.attachment;
DROP POLICY IF EXISTS admin_read    ON master.attachment;
DROP POLICY IF EXISTS admin_write   ON master.attachment;
CREATE POLICY tenant_read   ON master.attachment FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.attachment FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.attachment FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.attachment FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.attachment FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- —— §2  master.multipart_upload —————————————————————————————————————————
ALTER TABLE master.multipart_upload ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.multipart_upload FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.multipart_upload;
DROP POLICY IF EXISTS tenant_insert ON master.multipart_upload;
DROP POLICY IF EXISTS tenant_update ON master.multipart_upload;
DROP POLICY IF EXISTS tenant_delete ON master.multipart_upload;
DROP POLICY IF EXISTS admin_read    ON master.multipart_upload;
DROP POLICY IF EXISTS admin_write   ON master.multipart_upload;
CREATE POLICY tenant_read   ON master.multipart_upload FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.multipart_upload FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.multipart_upload FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
-- Tenant can abort their own uploads (DELETE)
CREATE POLICY tenant_delete ON master.multipart_upload FOR DELETE USING (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.multipart_upload FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.multipart_upload FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- —— §3  master.attachment_acl ———————————————————————————————————————————
ALTER TABLE master.attachment_acl ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.attachment_acl FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.attachment_acl;
DROP POLICY IF EXISTS tenant_insert ON master.attachment_acl;
DROP POLICY IF EXISTS tenant_delete ON master.attachment_acl;
DROP POLICY IF EXISTS admin_read    ON master.attachment_acl;
DROP POLICY IF EXISTS admin_write   ON master.attachment_acl;
CREATE POLICY tenant_read   ON master.attachment_acl FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.attachment_acl FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
-- ACL grants are revoked by deletion (not soft-delete)
CREATE POLICY tenant_delete ON master.attachment_acl FOR DELETE USING (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.attachment_acl FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.attachment_acl FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- —— §4  master.comment —————————————————————————————————————————————————
-- Tenant can see all comments including deleted (deleted_at IS NOT NULL).
-- Soft-delete filtered in application query layer, not at RLS level.
ALTER TABLE master.comment ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.comment FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.comment;
DROP POLICY IF EXISTS tenant_insert ON master.comment;
DROP POLICY IF EXISTS tenant_update ON master.comment;
DROP POLICY IF EXISTS admin_read    ON master.comment;
DROP POLICY IF EXISTS admin_write   ON master.comment;
CREATE POLICY tenant_read   ON master.comment FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.comment FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
-- Patch 002 Fix 4a: add commenter_id ownership check — tenant_id alone allowed any tenant
-- user to UPDATE any comment row. Commenter can edit/soft-delete their own comment only.
-- Admin-level cross-user updates still available via admin_write.
CREATE POLICY tenant_update ON master.comment
    FOR UPDATE
    USING (
        tenant_id    = shared.current_tenant_id()
        AND commenter_id = nullif(current_setting('app.current_principal_id', true), '')::uuid
    )
    WITH CHECK (
        tenant_id    = shared.current_tenant_id()
        AND commenter_id = nullif(current_setting('app.current_principal_id', true), '')::uuid
    );
CREATE POLICY admin_read    ON master.comment FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.comment FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- —— §5  master.comment_draft ———————————————————————————————————————————
-- Principals can read, write, update, and delete their own drafts only.
ALTER TABLE master.comment_draft ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.comment_draft FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.comment_draft;
DROP POLICY IF EXISTS tenant_insert ON master.comment_draft;
DROP POLICY IF EXISTS tenant_update ON master.comment_draft;
DROP POLICY IF EXISTS tenant_delete ON master.comment_draft;
DROP POLICY IF EXISTS admin_read    ON master.comment_draft;
DROP POLICY IF EXISTS admin_write   ON master.comment_draft;
-- Only the author sees their own draft
CREATE POLICY tenant_read   ON master.comment_draft FOR SELECT USING (
    tenant_id = shared.current_tenant_id_soft()
    AND principal_id = nullif(current_setting('app.current_principal_id', true), '')::uuid
);
-- Patch 002 Fix 4b: add principal_id ownership check to all mutation policies.
-- tenant_id alone allowed any tenant user to INSERT/UPDATE/DELETE drafts belonging
-- to other principals. Principal can only create, edit, and delete their own drafts.
CREATE POLICY tenant_insert ON master.comment_draft
    FOR INSERT
    WITH CHECK (
        tenant_id    = shared.current_tenant_id()
        AND principal_id = nullif(current_setting('app.current_principal_id', true), '')::uuid
    );
CREATE POLICY tenant_update ON master.comment_draft
    FOR UPDATE
    USING (
        tenant_id    = shared.current_tenant_id()
        AND principal_id = nullif(current_setting('app.current_principal_id', true), '')::uuid
    )
    WITH CHECK (
        tenant_id    = shared.current_tenant_id()
        AND principal_id = nullif(current_setting('app.current_principal_id', true), '')::uuid
    );
-- Author deletes draft on submit or discard
CREATE POLICY tenant_delete ON master.comment_draft
    FOR DELETE
    USING (
        tenant_id    = shared.current_tenant_id()
        AND principal_id = nullif(current_setting('app.current_principal_id', true), '')::uuid
    );
CREATE POLICY admin_read    ON master.comment_draft FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.comment_draft FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- —— §6  master.comment_mention —————————————————————————————————————————
-- Append-only — no UPDATE or DELETE for tenant role.
ALTER TABLE master.comment_mention ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.comment_mention FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.comment_mention;
DROP POLICY IF EXISTS tenant_insert ON master.comment_mention;
DROP POLICY IF EXISTS admin_read    ON master.comment_mention;
DROP POLICY IF EXISTS admin_write   ON master.comment_mention;
CREATE POLICY tenant_read   ON master.comment_mention FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.comment_mention FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
-- NO tenant_update, NO tenant_delete — append-only
CREATE POLICY admin_read    ON master.comment_mention FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.comment_mention FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- —— §7  master.comment_reaction ————————————————————————————————————————
-- Tenant can add and remove their own reactions (toggle pattern).
ALTER TABLE master.comment_reaction ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.comment_reaction FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.comment_reaction;
DROP POLICY IF EXISTS tenant_insert ON master.comment_reaction;
DROP POLICY IF EXISTS tenant_delete ON master.comment_reaction;
DROP POLICY IF EXISTS admin_read    ON master.comment_reaction;
DROP POLICY IF EXISTS admin_write   ON master.comment_reaction;
CREATE POLICY tenant_read   ON master.comment_reaction FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.comment_reaction FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
-- Principals can remove their own reactions (DELETE = toggle off)
CREATE POLICY tenant_delete ON master.comment_reaction FOR DELETE USING (
    tenant_id = shared.current_tenant_id()
    AND principal_id = nullif(current_setting('app.current_principal_id', true), '')::uuid
);
CREATE POLICY admin_read    ON master.comment_reaction FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.comment_reaction FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- —— §8  master.conversation ————————————————————————————————————————————
ALTER TABLE master.conversation ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.conversation FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.conversation;
DROP POLICY IF EXISTS tenant_insert ON master.conversation;
DROP POLICY IF EXISTS tenant_update ON master.conversation;
DROP POLICY IF EXISTS admin_read    ON master.conversation;
DROP POLICY IF EXISTS admin_write   ON master.conversation;
CREATE POLICY tenant_read   ON master.conversation FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.conversation FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.conversation FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.conversation FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.conversation FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- —— §9  master.conversation_participant ————————————————————————————————
ALTER TABLE master.conversation_participant ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.conversation_participant FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.conversation_participant;
DROP POLICY IF EXISTS tenant_insert ON master.conversation_participant;
DROP POLICY IF EXISTS tenant_update ON master.conversation_participant;
DROP POLICY IF EXISTS admin_read    ON master.conversation_participant;
DROP POLICY IF EXISTS admin_write   ON master.conversation_participant;
CREATE POLICY tenant_read   ON master.conversation_participant FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.conversation_participant FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
-- Participant can update their own read cursor (last_read_message_id / last_read_at)
CREATE POLICY tenant_update ON master.conversation_participant FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.conversation_participant FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.conversation_participant FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- —— §10  event.comment_flag ————————————————————————————————————————————
-- Tenant can submit flags (insert) and read their own flags.
-- UPDATE (status change = moderation decision) restricted to athyperadmin.
ALTER TABLE event.comment_flag ENABLE ROW LEVEL SECURITY;
ALTER TABLE event.comment_flag FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON event.comment_flag;
DROP POLICY IF EXISTS tenant_insert ON event.comment_flag;
DROP POLICY IF EXISTS admin_read    ON event.comment_flag;
DROP POLICY IF EXISTS admin_write   ON event.comment_flag;
CREATE POLICY tenant_read   ON event.comment_flag FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON event.comment_flag FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
-- No tenant_update — moderation decisions (status change) are admin-only
CREATE POLICY admin_read    ON event.comment_flag FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON event.comment_flag FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- —— §11  governance.comment_moderation ——————————————————————————————————
-- Tenant can READ moderation state (is_hidden is visible for rendering).
-- INSERT / UPDATE managed exclusively by trg_fn_sync_comment_moderation trigger.
ALTER TABLE governance.comment_moderation ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance.comment_moderation FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON governance.comment_moderation;
DROP POLICY IF EXISTS admin_read    ON governance.comment_moderation;
DROP POLICY IF EXISTS admin_write   ON governance.comment_moderation;
-- Tenants read moderation state to determine if a comment should be hidden
CREATE POLICY tenant_read   ON governance.comment_moderation FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
-- No tenant INSERT/UPDATE — trigger-managed only
CREATE POLICY admin_read    ON governance.comment_moderation FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON governance.comment_moderation FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- =============================================================================
-- §12  DOCUMENT · PRINT · BRANDING  —  master RLS policies
-- =============================================================================

-- ── master.document ────────────────────────────────────────────────────────
ALTER TABLE master.document ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.document FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.document;
DROP POLICY IF EXISTS tenant_insert ON master.document;
DROP POLICY IF EXISTS tenant_update ON master.document;
DROP POLICY IF EXISTS admin_read    ON master.document;
DROP POLICY IF EXISTS admin_write   ON master.document;
CREATE POLICY tenant_read   ON master.document FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.document FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.document FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.document FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.document FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── master.brand_profile ───────────────────────────────────────────────────
ALTER TABLE master.brand_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.brand_profile FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.brand_profile;
DROP POLICY IF EXISTS tenant_insert ON master.brand_profile;
DROP POLICY IF EXISTS tenant_update ON master.brand_profile;
DROP POLICY IF EXISTS admin_read    ON master.brand_profile;
DROP POLICY IF EXISTS admin_write   ON master.brand_profile;
CREATE POLICY tenant_read   ON master.brand_profile FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.brand_profile FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.brand_profile FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.brand_profile FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.brand_profile FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── master.letterhead ──────────────────────────────────────────────────────
ALTER TABLE master.letterhead ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.letterhead FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.letterhead;
DROP POLICY IF EXISTS tenant_insert ON master.letterhead;
DROP POLICY IF EXISTS tenant_update ON master.letterhead;
DROP POLICY IF EXISTS admin_read    ON master.letterhead;
DROP POLICY IF EXISTS admin_write   ON master.letterhead;
CREATE POLICY tenant_read   ON master.letterhead FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.letterhead FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.letterhead FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.letterhead FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.letterhead FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── master.template ────────────────────────────────────────────────────────
ALTER TABLE master.template ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.template FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.template;
DROP POLICY IF EXISTS tenant_insert ON master.template;
DROP POLICY IF EXISTS tenant_update ON master.template;
DROP POLICY IF EXISTS admin_read    ON master.template;
DROP POLICY IF EXISTS admin_write   ON master.template;
CREATE POLICY tenant_read   ON master.template FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.template FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.template FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.template FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.template FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── master.attachment_comment ──────────────────────────────────────────────
ALTER TABLE master.attachment_comment ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.attachment_comment FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.attachment_comment;
DROP POLICY IF EXISTS tenant_insert ON master.attachment_comment;
DROP POLICY IF EXISTS tenant_update ON master.attachment_comment;
DROP POLICY IF EXISTS admin_read    ON master.attachment_comment;
DROP POLICY IF EXISTS admin_write   ON master.attachment_comment;
CREATE POLICY tenant_read   ON master.attachment_comment FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.attachment_comment FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
-- Authors can update their own non-deleted comments
CREATE POLICY tenant_update ON master.attachment_comment FOR UPDATE
    USING     (tenant_id = shared.current_tenant_id() AND deleted_at IS NULL)
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.attachment_comment FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.attachment_comment FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── master.template_binding ────────────────────────────────────────────────
-- Bindings are managed by admin; tenant reads only
ALTER TABLE master.template_binding ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.template_binding FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.template_binding;
DROP POLICY IF EXISTS tenant_insert ON master.template_binding;
DROP POLICY IF EXISTS admin_read    ON master.template_binding;
DROP POLICY IF EXISTS admin_write   ON master.template_binding;
CREATE POLICY tenant_read   ON master.template_binding FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.template_binding FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.template_binding FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.template_binding FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── master.entity_document_link ────────────────────────────────────────────
-- Links are inserted or deleted — not updated
ALTER TABLE master.entity_document_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.entity_document_link FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.entity_document_link;
DROP POLICY IF EXISTS tenant_insert ON master.entity_document_link;
DROP POLICY IF EXISTS tenant_delete ON master.entity_document_link;
DROP POLICY IF EXISTS admin_read    ON master.entity_document_link;
DROP POLICY IF EXISTS admin_write   ON master.entity_document_link;
CREATE POLICY tenant_read   ON master.entity_document_link FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.entity_document_link FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.entity_document_link FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.entity_document_link FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.entity_document_link FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- ============================================================================
-- CORE FINANCE MASTER — ROW LEVEL SECURITY (Pattern B: split tenant DML)
-- ============================================================================
-- All 12 finance tables use Pattern B:
--   tenant_read   — SELECT own rows (current_tenant_id_soft, NULL-safe)
--   tenant_insert — INSERT with tenant_id = current_tenant_id (strict)
--   tenant_update — UPDATE own rows only
--   tenant_delete — DELETE own rows only
--   admin_read    — SELECT all (athyperadmin)
--   admin_write   — ALL DML (athyperadmin)
-- ============================================================================

-- ── master.legal_entity ─────────────────────────────────────────────────────
ALTER TABLE master.legal_entity ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.legal_entity FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.legal_entity;
DROP POLICY IF EXISTS tenant_insert ON master.legal_entity;
DROP POLICY IF EXISTS tenant_update ON master.legal_entity;
DROP POLICY IF EXISTS tenant_delete ON master.legal_entity;
DROP POLICY IF EXISTS admin_read    ON master.legal_entity;
DROP POLICY IF EXISTS admin_write   ON master.legal_entity;
CREATE POLICY tenant_read   ON master.legal_entity FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.legal_entity FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.legal_entity FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.legal_entity FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.legal_entity FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.legal_entity FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── master.company_code ─────────────────────────────────────────────────────
ALTER TABLE master.company_code ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.company_code FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.company_code;
DROP POLICY IF EXISTS tenant_insert ON master.company_code;
DROP POLICY IF EXISTS tenant_update ON master.company_code;
DROP POLICY IF EXISTS tenant_delete ON master.company_code;
DROP POLICY IF EXISTS admin_read    ON master.company_code;
DROP POLICY IF EXISTS admin_write   ON master.company_code;
CREATE POLICY tenant_read   ON master.company_code FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.company_code FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.company_code FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.company_code FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.company_code FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.company_code FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── master.cost_center ──────────────────────────────────────────────────────
ALTER TABLE master.cost_center ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.cost_center FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.cost_center;
DROP POLICY IF EXISTS tenant_insert ON master.cost_center;
DROP POLICY IF EXISTS tenant_update ON master.cost_center;
DROP POLICY IF EXISTS tenant_delete ON master.cost_center;
DROP POLICY IF EXISTS admin_read    ON master.cost_center;
DROP POLICY IF EXISTS admin_write   ON master.cost_center;
CREATE POLICY tenant_read   ON master.cost_center FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.cost_center FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.cost_center FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.cost_center FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.cost_center FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.cost_center FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── master.profit_center ────────────────────────────────────────────────────
ALTER TABLE master.profit_center ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.profit_center FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.profit_center;
DROP POLICY IF EXISTS tenant_insert ON master.profit_center;
DROP POLICY IF EXISTS tenant_update ON master.profit_center;
DROP POLICY IF EXISTS tenant_delete ON master.profit_center;
DROP POLICY IF EXISTS admin_read    ON master.profit_center;
DROP POLICY IF EXISTS admin_write   ON master.profit_center;
CREATE POLICY tenant_read   ON master.profit_center FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.profit_center FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.profit_center FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.profit_center FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.profit_center FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.profit_center FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── master.site ─────────────────────────────────────────────────────────────
ALTER TABLE master.site ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.site FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.site;
DROP POLICY IF EXISTS tenant_insert ON master.site;
DROP POLICY IF EXISTS tenant_update ON master.site;
DROP POLICY IF EXISTS tenant_delete ON master.site;
DROP POLICY IF EXISTS admin_read    ON master.site;
DROP POLICY IF EXISTS admin_write   ON master.site;
CREATE POLICY tenant_read   ON master.site FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.site FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.site FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.site FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.site FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.site FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── master.warehouse ────────────────────────────────────────────────────────
ALTER TABLE master.warehouse ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.warehouse FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.warehouse;
DROP POLICY IF EXISTS tenant_insert ON master.warehouse;
DROP POLICY IF EXISTS tenant_update ON master.warehouse;
DROP POLICY IF EXISTS tenant_delete ON master.warehouse;
DROP POLICY IF EXISTS admin_read    ON master.warehouse;
DROP POLICY IF EXISTS admin_write   ON master.warehouse;
CREATE POLICY tenant_read   ON master.warehouse FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.warehouse FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.warehouse FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.warehouse FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.warehouse FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.warehouse FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── master.chart_of_account ─────────────────────────────────────────────────
ALTER TABLE master.chart_of_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.chart_of_account FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.chart_of_account;
DROP POLICY IF EXISTS tenant_insert ON master.chart_of_account;
DROP POLICY IF EXISTS tenant_update ON master.chart_of_account;
DROP POLICY IF EXISTS tenant_delete ON master.chart_of_account;
DROP POLICY IF EXISTS admin_read    ON master.chart_of_account;
DROP POLICY IF EXISTS admin_write   ON master.chart_of_account;
CREATE POLICY tenant_read   ON master.chart_of_account FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.chart_of_account FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.chart_of_account FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.chart_of_account FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.chart_of_account FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.chart_of_account FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── master.gl_account ───────────────────────────────────────────────────────
ALTER TABLE master.gl_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.gl_account FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.gl_account;
DROP POLICY IF EXISTS tenant_insert ON master.gl_account;
DROP POLICY IF EXISTS tenant_update ON master.gl_account;
DROP POLICY IF EXISTS tenant_delete ON master.gl_account;
DROP POLICY IF EXISTS admin_read    ON master.gl_account;
DROP POLICY IF EXISTS admin_write   ON master.gl_account;
CREATE POLICY tenant_read   ON master.gl_account FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.gl_account FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.gl_account FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.gl_account FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.gl_account FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.gl_account FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── master.company_code_chart_assignment ────────────────────────────────────
ALTER TABLE master.company_code_chart_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.company_code_chart_assignment FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.company_code_chart_assignment;
DROP POLICY IF EXISTS tenant_insert ON master.company_code_chart_assignment;
DROP POLICY IF EXISTS tenant_update ON master.company_code_chart_assignment;
DROP POLICY IF EXISTS tenant_delete ON master.company_code_chart_assignment;
DROP POLICY IF EXISTS admin_read    ON master.company_code_chart_assignment;
DROP POLICY IF EXISTS admin_write   ON master.company_code_chart_assignment;
CREATE POLICY tenant_read   ON master.company_code_chart_assignment FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.company_code_chart_assignment FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.company_code_chart_assignment FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.company_code_chart_assignment FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.company_code_chart_assignment FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.company_code_chart_assignment FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── master.company_code_gl_account ──────────────────────────────────────────
ALTER TABLE master.company_code_gl_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.company_code_gl_account FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.company_code_gl_account;
DROP POLICY IF EXISTS tenant_insert ON master.company_code_gl_account;
DROP POLICY IF EXISTS tenant_update ON master.company_code_gl_account;
DROP POLICY IF EXISTS tenant_delete ON master.company_code_gl_account;
DROP POLICY IF EXISTS admin_read    ON master.company_code_gl_account;
DROP POLICY IF EXISTS admin_write   ON master.company_code_gl_account;
CREATE POLICY tenant_read   ON master.company_code_gl_account FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.company_code_gl_account FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.company_code_gl_account FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.company_code_gl_account FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.company_code_gl_account FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.company_code_gl_account FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── master.project ──────────────────────────────────────────────────────────
ALTER TABLE master.project ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.project FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.project;
DROP POLICY IF EXISTS tenant_insert ON master.project;
DROP POLICY IF EXISTS tenant_update ON master.project;
DROP POLICY IF EXISTS tenant_delete ON master.project;
DROP POLICY IF EXISTS admin_read    ON master.project;
DROP POLICY IF EXISTS admin_write   ON master.project;
CREATE POLICY tenant_read   ON master.project FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.project FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.project FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.project FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.project FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.project FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── master.project_item ─────────────────────────────────────────────────────
ALTER TABLE master.project_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.project_item FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.project_item;
DROP POLICY IF EXISTS tenant_insert ON master.project_item;
DROP POLICY IF EXISTS tenant_update ON master.project_item;
DROP POLICY IF EXISTS tenant_delete ON master.project_item;
DROP POLICY IF EXISTS admin_read    ON master.project_item;
DROP POLICY IF EXISTS admin_write   ON master.project_item;
CREATE POLICY tenant_read   ON master.project_item FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.project_item FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.project_item FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.project_item FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.project_item FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.project_item FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ============================================================================
-- LEDGER POSTING PATH — master tables
-- ============================================================================

-- ── master.dimension_set ─────────────────────────────────────────────────────
ALTER TABLE master.dimension_set ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.dimension_set FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.dimension_set;
DROP POLICY IF EXISTS tenant_insert ON master.dimension_set;
DROP POLICY IF EXISTS tenant_update ON master.dimension_set;
DROP POLICY IF EXISTS tenant_delete ON master.dimension_set;
DROP POLICY IF EXISTS admin_read    ON master.dimension_set;
DROP POLICY IF EXISTS admin_write   ON master.dimension_set;
CREATE POLICY tenant_read   ON master.dimension_set FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.dimension_set FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.dimension_set FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.dimension_set FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.dimension_set FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.dimension_set FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── master.fiscal_period ─────────────────────────────────────────────────────
ALTER TABLE master.fiscal_period ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.fiscal_period FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.fiscal_period;
DROP POLICY IF EXISTS tenant_insert ON master.fiscal_period;
DROP POLICY IF EXISTS tenant_update ON master.fiscal_period;
DROP POLICY IF EXISTS tenant_delete ON master.fiscal_period;
DROP POLICY IF EXISTS admin_read    ON master.fiscal_period;
DROP POLICY IF EXISTS admin_write   ON master.fiscal_period;
CREATE POLICY tenant_read   ON master.fiscal_period FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.fiscal_period FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.fiscal_period FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.fiscal_period FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.fiscal_period FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.fiscal_period FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── master.ledger_book ───────────────────────────────────────────────────────
ALTER TABLE master.ledger_book ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.ledger_book FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.ledger_book;
DROP POLICY IF EXISTS tenant_insert ON master.ledger_book;
DROP POLICY IF EXISTS tenant_update ON master.ledger_book;
DROP POLICY IF EXISTS tenant_delete ON master.ledger_book;
DROP POLICY IF EXISTS admin_read    ON master.ledger_book;
DROP POLICY IF EXISTS admin_write   ON master.ledger_book;
CREATE POLICY tenant_read   ON master.ledger_book FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.ledger_book FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.ledger_book FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.ledger_book FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.ledger_book FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.ledger_book FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── master.company_code_book_assignment ───────────────────────────────────────────────────
ALTER TABLE master.company_code_book_assignment ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.company_code_book_assignment FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.company_code_book_assignment;
DROP POLICY IF EXISTS tenant_insert ON master.company_code_book_assignment;
DROP POLICY IF EXISTS tenant_update ON master.company_code_book_assignment;
DROP POLICY IF EXISTS tenant_delete ON master.company_code_book_assignment;
DROP POLICY IF EXISTS admin_read    ON master.company_code_book_assignment;
DROP POLICY IF EXISTS admin_write   ON master.company_code_book_assignment;
CREATE POLICY tenant_read   ON master.company_code_book_assignment FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.company_code_book_assignment FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.company_code_book_assignment FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.company_code_book_assignment FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.company_code_book_assignment FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.company_code_book_assignment FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- =============================================================================
-- MODULE 400 — Party, Product, and Classification Bridge
-- Pattern B on all 8 tables: split DML + admin bypass
-- =============================================================================

-- ── master.customer ────────────────────────────────────────────────────────
ALTER TABLE master.customer ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.customer FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.customer;
DROP POLICY IF EXISTS tenant_insert ON master.customer;
DROP POLICY IF EXISTS tenant_update ON master.customer;
DROP POLICY IF EXISTS tenant_delete ON master.customer;
DROP POLICY IF EXISTS admin_read    ON master.customer;
DROP POLICY IF EXISTS admin_write   ON master.customer;
CREATE POLICY tenant_read   ON master.customer FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.customer FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.customer FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.customer FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.customer FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.customer FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── master.supplier ────────────────────────────────────────────────────────
ALTER TABLE master.supplier ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.supplier FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.supplier;
DROP POLICY IF EXISTS tenant_insert ON master.supplier;
DROP POLICY IF EXISTS tenant_update ON master.supplier;
DROP POLICY IF EXISTS tenant_delete ON master.supplier;
DROP POLICY IF EXISTS admin_read    ON master.supplier;
DROP POLICY IF EXISTS admin_write   ON master.supplier;
CREATE POLICY tenant_read   ON master.supplier FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.supplier FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.supplier FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.supplier FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.supplier FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.supplier FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── master.employee ────────────────────────────────────────────────────────
ALTER TABLE master.employee ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.employee FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.employee;
DROP POLICY IF EXISTS tenant_insert ON master.employee;
DROP POLICY IF EXISTS tenant_update ON master.employee;
DROP POLICY IF EXISTS tenant_delete ON master.employee;
DROP POLICY IF EXISTS admin_read    ON master.employee;
DROP POLICY IF EXISTS admin_write   ON master.employee;
CREATE POLICY tenant_read   ON master.employee FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.employee FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.employee FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.employee FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.employee FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.employee FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── master.item_category ────────────────────────────────────────────────
ALTER TABLE master.item_category ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.item_category FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.item_category;
DROP POLICY IF EXISTS tenant_insert ON master.item_category;
DROP POLICY IF EXISTS tenant_update ON master.item_category;
DROP POLICY IF EXISTS tenant_delete ON master.item_category;
DROP POLICY IF EXISTS admin_read    ON master.item_category;
DROP POLICY IF EXISTS admin_write   ON master.item_category;
CREATE POLICY tenant_read   ON master.item_category FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.item_category FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.item_category FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.item_category FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.item_category FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.item_category FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── master.product ─────────────────────────────────────────────────────────
ALTER TABLE master.product ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.product FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.product;
DROP POLICY IF EXISTS tenant_insert ON master.product;
DROP POLICY IF EXISTS tenant_update ON master.product;
DROP POLICY IF EXISTS tenant_delete ON master.product;
DROP POLICY IF EXISTS admin_read    ON master.product;
DROP POLICY IF EXISTS admin_write   ON master.product;
CREATE POLICY tenant_read   ON master.product FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.product FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.product FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.product FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.product FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.product FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── master.item ─────────────────────────────────────────────────────
ALTER TABLE master.item ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.item FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.item;
DROP POLICY IF EXISTS tenant_insert ON master.item;
DROP POLICY IF EXISTS tenant_update ON master.item;
DROP POLICY IF EXISTS tenant_delete ON master.item;
DROP POLICY IF EXISTS admin_read    ON master.item;
DROP POLICY IF EXISTS admin_write   ON master.item;
CREATE POLICY tenant_read   ON master.item FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.item FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.item FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.item FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.item FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.item FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── master.spend_category ──────────────────────────────────────────────────
ALTER TABLE master.spend_category ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.spend_category FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.spend_category;
DROP POLICY IF EXISTS tenant_insert ON master.spend_category;
DROP POLICY IF EXISTS tenant_update ON master.spend_category;
DROP POLICY IF EXISTS tenant_delete ON master.spend_category;
DROP POLICY IF EXISTS admin_read    ON master.spend_category;
DROP POLICY IF EXISTS admin_write   ON master.spend_category;
CREATE POLICY tenant_read   ON master.spend_category FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.spend_category FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.spend_category FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.spend_category FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.spend_category FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.spend_category FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── master.commodity_classification ────────────────────────────────────────
ALTER TABLE master.commodity_classification ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.commodity_classification FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.commodity_classification;
DROP POLICY IF EXISTS tenant_insert ON master.commodity_classification;
DROP POLICY IF EXISTS tenant_update ON master.commodity_classification;
DROP POLICY IF EXISTS tenant_delete ON master.commodity_classification;
DROP POLICY IF EXISTS admin_read    ON master.commodity_classification;
DROP POLICY IF EXISTS admin_write   ON master.commodity_classification;
CREATE POLICY tenant_read   ON master.commodity_classification FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.commodity_classification FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.commodity_classification FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.commodity_classification FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.commodity_classification FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.commodity_classification FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── master.company_code_customer_profile ────────────────────────────────────────
ALTER TABLE master.company_code_customer_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.company_code_customer_profile FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.company_code_customer_profile;
DROP POLICY IF EXISTS tenant_insert ON master.company_code_customer_profile;
DROP POLICY IF EXISTS tenant_update ON master.company_code_customer_profile;
DROP POLICY IF EXISTS tenant_delete ON master.company_code_customer_profile;
DROP POLICY IF EXISTS admin_read    ON master.company_code_customer_profile;
DROP POLICY IF EXISTS admin_write   ON master.company_code_customer_profile;
CREATE POLICY tenant_read   ON master.company_code_customer_profile FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.company_code_customer_profile FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.company_code_customer_profile FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.company_code_customer_profile FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.company_code_customer_profile FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.company_code_customer_profile FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── master.company_code_supplier_profile ────────────────────────────────────────
ALTER TABLE master.company_code_supplier_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.company_code_supplier_profile FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.company_code_supplier_profile;
DROP POLICY IF EXISTS tenant_insert ON master.company_code_supplier_profile;
DROP POLICY IF EXISTS tenant_update ON master.company_code_supplier_profile;
DROP POLICY IF EXISTS tenant_delete ON master.company_code_supplier_profile;
DROP POLICY IF EXISTS admin_read    ON master.company_code_supplier_profile;
DROP POLICY IF EXISTS admin_write   ON master.company_code_supplier_profile;
CREATE POLICY tenant_read   ON master.company_code_supplier_profile FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.company_code_supplier_profile FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.company_code_supplier_profile FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.company_code_supplier_profile FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.company_code_supplier_profile FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.company_code_supplier_profile FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- =============================================================================
-- MODULE AM — Fixed Asset Register (Pattern B: split tenant DML)
-- =============================================================================

-- ── master.asset_class ───────────────────────────────────────────────────────
ALTER TABLE master.asset_class ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.asset_class FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.asset_class;
DROP POLICY IF EXISTS tenant_insert ON master.asset_class;
DROP POLICY IF EXISTS tenant_update ON master.asset_class;
DROP POLICY IF EXISTS tenant_delete ON master.asset_class;
DROP POLICY IF EXISTS admin_read    ON master.asset_class;
DROP POLICY IF EXISTS admin_write   ON master.asset_class;
CREATE POLICY tenant_read   ON master.asset_class FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.asset_class FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.asset_class FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.asset_class FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.asset_class FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.asset_class FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── master.asset ─────────────────────────────────────────────────────────────
ALTER TABLE master.asset ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.asset FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.asset;
DROP POLICY IF EXISTS tenant_insert ON master.asset;
DROP POLICY IF EXISTS tenant_update ON master.asset;
DROP POLICY IF EXISTS tenant_delete ON master.asset;
DROP POLICY IF EXISTS admin_read    ON master.asset;
DROP POLICY IF EXISTS admin_write   ON master.asset;
CREATE POLICY tenant_read   ON master.asset FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.asset FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.asset FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.asset FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.asset FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.asset FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── master.asset_book ────────────────────────────────────────────────────────
ALTER TABLE master.asset_book ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.asset_book FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.asset_book;
DROP POLICY IF EXISTS tenant_insert ON master.asset_book;
DROP POLICY IF EXISTS tenant_update ON master.asset_book;
DROP POLICY IF EXISTS tenant_delete ON master.asset_book;
DROP POLICY IF EXISTS admin_read    ON master.asset_book;
DROP POLICY IF EXISTS admin_write   ON master.asset_book;
CREATE POLICY tenant_read   ON master.asset_book FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.asset_book FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.asset_book FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.asset_book FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.asset_book FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.asset_book FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── master.asset_component ───────────────────────────────────────────────────
ALTER TABLE master.asset_component ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.asset_component FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.asset_component;
DROP POLICY IF EXISTS tenant_insert ON master.asset_component;
DROP POLICY IF EXISTS tenant_update ON master.asset_component;
DROP POLICY IF EXISTS tenant_delete ON master.asset_component;
DROP POLICY IF EXISTS admin_read    ON master.asset_component;
DROP POLICY IF EXISTS admin_write   ON master.asset_component;
CREATE POLICY tenant_read   ON master.asset_component FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.asset_component FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.asset_component FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.asset_component FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.asset_component FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.asset_component FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── master.asset_assignment_history ─────────────────────────────────────────
ALTER TABLE master.asset_assignment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.asset_assignment_history FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.asset_assignment_history;
DROP POLICY IF EXISTS tenant_insert ON master.asset_assignment_history;
DROP POLICY IF EXISTS tenant_update ON master.asset_assignment_history;
DROP POLICY IF EXISTS tenant_delete ON master.asset_assignment_history;
DROP POLICY IF EXISTS admin_read    ON master.asset_assignment_history;
DROP POLICY IF EXISTS admin_write   ON master.asset_assignment_history;
CREATE POLICY tenant_read   ON master.asset_assignment_history FOR SELECT USING     (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.asset_assignment_history FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.asset_assignment_history FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.asset_assignment_history FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.asset_assignment_history FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.asset_assignment_history FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- ── bank_party ───────────────────────────────────────────────────────────────
ALTER TABLE master.bank_party ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.bank_party FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read ON master.bank_party;
DROP POLICY IF EXISTS tenant_insert ON master.bank_party;
DROP POLICY IF EXISTS tenant_update ON master.bank_party;
DROP POLICY IF EXISTS tenant_delete ON master.bank_party;
DROP POLICY IF EXISTS admin_read ON master.bank_party;
DROP POLICY IF EXISTS admin_write ON master.bank_party;
CREATE POLICY tenant_read   ON master.bank_party FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.bank_party FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.bank_party FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.bank_party FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.bank_party FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.bank_party FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── bank_account ─────────────────────────────────────────────────────────────
ALTER TABLE master.bank_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.bank_account FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read ON master.bank_account;
DROP POLICY IF EXISTS tenant_insert ON master.bank_account;
DROP POLICY IF EXISTS tenant_update ON master.bank_account;
DROP POLICY IF EXISTS tenant_delete ON master.bank_account;
DROP POLICY IF EXISTS admin_read ON master.bank_account;
DROP POLICY IF EXISTS admin_write ON master.bank_account;
CREATE POLICY tenant_read   ON master.bank_account FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.bank_account FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.bank_account FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.bank_account FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.bank_account FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.bank_account FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── bank_account_link ────────────────────────────────────────────────────────
ALTER TABLE master.bank_account_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.bank_account_link FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read ON master.bank_account_link;
DROP POLICY IF EXISTS tenant_insert ON master.bank_account_link;
DROP POLICY IF EXISTS tenant_update ON master.bank_account_link;
DROP POLICY IF EXISTS tenant_delete ON master.bank_account_link;
DROP POLICY IF EXISTS admin_read ON master.bank_account_link;
DROP POLICY IF EXISTS admin_write ON master.bank_account_link;
CREATE POLICY tenant_read   ON master.bank_account_link FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.bank_account_link FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.bank_account_link FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.bank_account_link FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.bank_account_link FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.bank_account_link FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);

-- ── bank_account_house_config ────────────────────────────────────────────────
ALTER TABLE master.bank_account_house_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.bank_account_house_config FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read ON master.bank_account_house_config;
DROP POLICY IF EXISTS tenant_insert ON master.bank_account_house_config;
DROP POLICY IF EXISTS tenant_update ON master.bank_account_house_config;
DROP POLICY IF EXISTS tenant_delete ON master.bank_account_house_config;
DROP POLICY IF EXISTS admin_read ON master.bank_account_house_config;
DROP POLICY IF EXISTS admin_write ON master.bank_account_house_config;
CREATE POLICY tenant_read   ON master.bank_account_house_config FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.bank_account_house_config FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.bank_account_house_config FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.bank_account_house_config FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.bank_account_house_config FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.bank_account_house_config FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- ── payment_method ───────────────────────────────────────────────────────────
ALTER TABLE master.payment_method ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.payment_method FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read   ON master.payment_method;
DROP POLICY IF EXISTS tenant_insert ON master.payment_method;
DROP POLICY IF EXISTS tenant_update ON master.payment_method;
DROP POLICY IF EXISTS tenant_delete ON master.payment_method;
DROP POLICY IF EXISTS admin_read    ON master.payment_method;
DROP POLICY IF EXISTS admin_write   ON master.payment_method;
CREATE POLICY tenant_read   ON master.payment_method FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY tenant_insert ON master.payment_method FOR INSERT WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_update ON master.payment_method FOR UPDATE USING     (tenant_id = shared.current_tenant_id()) WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY tenant_delete ON master.payment_method FOR DELETE USING     (tenant_id = shared.current_tenant_id());
CREATE POLICY admin_read    ON master.payment_method FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write   ON master.payment_method FOR ALL    TO athyperadmin USING (true) WITH CHECK (true);


-- ── principal_identity_binding ──────────────────────────────────────────────────
ALTER TABLE master.principal_identity_binding ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.principal_identity_binding FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_read  ON master.principal_identity_binding;
DROP POLICY IF EXISTS admin_read   ON master.principal_identity_binding;
DROP POLICY IF EXISTS admin_write  ON master.principal_identity_binding;
CREATE POLICY tenant_read ON master.principal_identity_binding
    FOR SELECT USING (tenant_id = shared.current_tenant_id_soft());
CREATE POLICY admin_read ON master.principal_identity_binding
    FOR SELECT TO athyperadmin USING (true);
CREATE POLICY admin_write ON master.principal_identity_binding
    FOR ALL TO athyperadmin USING (true) WITH CHECK (true);


-- ============================================================================
-- UI Principal tables (principal_ui_profile, principal_ui_preference,
-- saved_view, dashboard, dashboard_widget)
-- ============================================================================

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
