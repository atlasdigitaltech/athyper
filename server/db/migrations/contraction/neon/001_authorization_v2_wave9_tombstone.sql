-- Wave 9 deployed-database tombstone: Neon/Admin.
-- Executed only by apply-authorization-v2-wave9-tombstone.ts.
-- Every DROP is RESTRICT; an unknown dependency aborts the transaction.

DO $guard$
BEGIN
    IF current_setting('athyper.wave9.authorized', true) IS DISTINCT FROM 'true'
       OR current_setting('athyper.wave9.plane', true) IS DISTINCT FROM 'neon'
       OR nullif(current_setting('athyper.wave9.execution_id', true), '') IS NULL
       OR nullif(current_setting('athyper.wave9.evidence_sha256', true), '') IS NULL
       OR nullif(current_setting('athyper.wave9.manifest_sha256', true), '') IS NULL
       OR nullif(current_setting('athyper.wave9.repository_revision', true), '') IS NULL
    THEN
        RAISE EXCEPTION 'Wave 9 Neon tombstone is not authorized by the guarded executor';
    END IF;
END
$guard$;

CREATE TABLE IF NOT EXISTS public.authorization_contraction_receipt_v2 (
    plane                   text        PRIMARY KEY,
    execution_id            text        NOT NULL UNIQUE,
    database_name           text        NOT NULL,
    repository_revision     text        NOT NULL,
    evidence_sha256         text        NOT NULL,
    removal_manifest_sha256 text        NOT NULL,
    completed_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
    completed_by            text        NOT NULL DEFAULT session_user,
    CONSTRAINT authorization_contraction_receipt_plane_chk
        CHECK (plane IN ('neon', 'mesh')),
    CONSTRAINT authorization_contraction_receipt_evidence_sha_chk
        CHECK (evidence_sha256 ~ '^[0-9a-f]{64}$'),
    CONSTRAINT authorization_contraction_receipt_manifest_sha_chk
        CHECK (removal_manifest_sha256 ~ '^[0-9a-f]{64}$')
);

CREATE OR REPLACE FUNCTION public.trg_authorization_contraction_receipt_v2_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'authorization contraction receipts are immutable';
END
$$;

DROP TRIGGER IF EXISTS trg_authorization_contraction_receipt_v2_immutable
    ON public.authorization_contraction_receipt_v2;
CREATE TRIGGER trg_authorization_contraction_receipt_v2_immutable
BEFORE UPDATE OR DELETE ON public.authorization_contraction_receipt_v2
FOR EACH ROW EXECUTE FUNCTION
    public.trg_authorization_contraction_receipt_v2_immutable();

REVOKE ALL ON TABLE public.authorization_contraction_receipt_v2 FROM PUBLIC;
REVOKE ALL ON FUNCTION
    public.trg_authorization_contraction_receipt_v2_immutable() FROM PUBLIC;

-- Stage 2: remove every non-internal trigger attached to a retiring relation.
DO $drop_triggers$
DECLARE
    item record;
BEGIN
    FOR item IN
        SELECT n.nspname, c.relname, t.tgname
          FROM pg_trigger t
          JOIN pg_class c ON c.oid = t.tgrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE NOT t.tgisinternal
           AND format('%I.%I', n.nspname, c.relname) = ANY (ARRAY[
             'master.principal_persona',
             'shared.persona_permission',
             'master.auth_group_role', 'master.auth_group_member', 'master.auth_group',
             'shared.role', 'shared.persona',
             'master.company_code_access', 'master.access_grant',
             'master.group_feature_grant', 'master.principal_feature_grant',
             'master.tenant_admin_grant', 'master.tenant_module_subscription',
             'master.tenant_feature_entitlement', 'master.tenant_permission_override',
             'shared.plan_permission_access', 'shared.plan_feature_access',
             'shared.plan_module_access', 'shared.enterprise_feature',
             'master.delegation_grant', 'master.attachment_acl',
             'master.content_item_access_grant',
             'master.business_network_membership_role',
             'master.business_network_membership', 'master.business_network',
             'control.permission_alias', 'control.auth_permission_alias_v2',
             'shared.permission_scope_policy', 'shared.permission_category',
             'shared.permission'
           ])
    LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS %I ON %I.%I RESTRICT',
            item.tgname, item.nspname, item.relname
        );
    END LOOP;
END
$drop_triggers$;

-- Stage 2: old evaluator and compatibility functions. Drop all overloads.
DO $drop_functions$
DECLARE
    item record;
BEGIN
    FOR item IN
        SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE format('%I.%I', n.nspname, p.proname) = ANY (ARRAY[
             'shared.trg_protect_system_persona',
             'master.check_permission',
             'master.derive_effective_roles',
             'master.resolve_allowed_companies',
             'master.get_effective_visibility_scope',
             'master.resolve_effective_authorization_scope',
             'master.trg_access_grant_status_changed',
             'master.trg_guard_delegation_grant_mutation',
             'master.trg_validate_delegation_permissions',
             'master.fn_bump_auth_epoch'
           ])
    LOOP
        EXECUTE format(
            'DROP FUNCTION %I.%I(%s) RESTRICT',
            item.nspname, item.proname, item.args
        );
    END LOOP;
END
$drop_functions$;

-- Stages 3-5: Persona assignment, mapping, role FK/catalog, and old groups.
DROP TABLE IF EXISTS master.principal_persona RESTRICT;
DROP TABLE IF EXISTS shared.persona_permission RESTRICT;
DROP TABLE IF EXISTS master.auth_group_role RESTRICT;
DROP TABLE IF EXISTS master.auth_group_member RESTRICT;
DROP TABLE IF EXISTS master.auth_group RESTRICT;
DROP TABLE IF EXISTS shared.role RESTRICT;
DROP TABLE IF EXISTS shared.persona RESTRICT;

-- Stage 6: Admin/company/access/feature/plan grant compatibility model.
DROP TABLE IF EXISTS master.company_code_access RESTRICT;
DROP TABLE IF EXISTS master.access_grant RESTRICT;
DROP TABLE IF EXISTS master.group_feature_grant RESTRICT;
DROP TABLE IF EXISTS master.principal_feature_grant RESTRICT;
DROP TABLE IF EXISTS master.tenant_admin_grant RESTRICT;
DROP TABLE IF EXISTS master.tenant_module_subscription RESTRICT;
DROP TABLE IF EXISTS master.tenant_feature_entitlement RESTRICT;
DROP TABLE IF EXISTS master.tenant_permission_override RESTRICT;
DROP TABLE IF EXISTS shared.plan_permission_access RESTRICT;
DROP TABLE IF EXISTS shared.plan_feature_access RESTRICT;
DROP TABLE IF EXISTS shared.plan_module_access RESTRICT;
DROP TABLE IF EXISTS shared.enterprise_feature RESTRICT;

-- Stage 7: legacy ACL and delegation.
DROP TABLE IF EXISTS master.delegation_grant RESTRICT;
DROP TABLE IF EXISTS master.attachment_acl RESTRICT;
DROP TABLE IF EXISTS master.content_item_access_grant RESTRICT;

-- Stage 8: Mesh-specific network authority formerly stored in Neon.
DROP TABLE IF EXISTS master.business_network_membership_role RESTRICT;
DROP TABLE IF EXISTS master.business_network_membership RESTRICT;
DROP TABLE IF EXISTS master.business_network RESTRICT;

-- Stage 9: migration-only aliases.
DROP TABLE IF EXISTS control.permission_alias RESTRICT;
DROP TABLE IF EXISTS control.auth_permission_alias_v2 RESTRICT;

-- Stage 10: superseded shared authorization catalog.
DROP TABLE IF EXISTS shared.permission_scope_policy RESTRICT;
DROP TABLE IF EXISTS shared.permission RESTRICT;
DROP TABLE IF EXISTS shared.permission_category RESTRICT;

INSERT INTO public.authorization_contraction_receipt_v2 (
    plane, execution_id, database_name, repository_revision,
    evidence_sha256, removal_manifest_sha256
) VALUES (
    'neon',
    current_setting('athyper.wave9.execution_id'),
    current_database(),
    current_setting('athyper.wave9.repository_revision'),
    current_setting('athyper.wave9.evidence_sha256'),
    current_setting('athyper.wave9.manifest_sha256')
)
ON CONFLICT (plane) DO NOTHING;

DO $receipt_guard$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM public.authorization_contraction_receipt_v2
         WHERE plane = 'neon'
           AND execution_id = current_setting('athyper.wave9.execution_id')
           AND database_name = current_database()
           AND repository_revision = current_setting('athyper.wave9.repository_revision')
           AND evidence_sha256 = current_setting('athyper.wave9.evidence_sha256')
           AND removal_manifest_sha256 = current_setting('athyper.wave9.manifest_sha256')
    ) THEN
        RAISE EXCEPTION 'conflicting Wave 9 Neon tombstone receipt';
    END IF;
END
$receipt_guard$;
