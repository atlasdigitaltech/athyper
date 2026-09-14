-- Common all-plane authorization authority. Rows remain plane-local unless explicitly marked as a published projection.
CREATE OR REPLACE FUNCTION authz.trg_normalize_codes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = authz, pg_catalog
AS $$
BEGIN
    IF TG_TABLE_NAME = 'permission' THEN
        NEW.canonical_code := lower(btrim(NEW.canonical_code));
    ELSIF TG_TABLE_NAME = 'scope_target' THEN
        NEW.scope_key := btrim(NEW.scope_key);
        NEW.display_name := btrim(NEW.display_name);
    ELSIF TG_TABLE_NAME IN ('role', 'principal_group') THEN
        NEW.code := lower(btrim(NEW.code));
        NEW.name := btrim(NEW.name);
        NEW.description := nullif(btrim(NEW.description), '');
        NEW.source_ref := nullif(btrim(NEW.source_ref), '');
    ELSIF TG_TABLE_NAME IN ('plane_membership', 'group_member', 'group_role') THEN
        NEW.source_ref := nullif(btrim(NEW.source_ref), '');
    ELSIF TG_TABLE_NAME = 'record_acl' THEN
        NEW.resource_code := lower(btrim(NEW.resource_code));
        NEW.reason := btrim(NEW.reason);
        NEW.revocation_reason := nullif(btrim(NEW.revocation_reason), '');
    ELSIF TG_TABLE_NAME = 'deny_rule' THEN
        NEW.reason := btrim(NEW.reason);
    ELSIF TG_TABLE_NAME = 'delegation' THEN
        NEW.reason := btrim(NEW.reason);
        NEW.approval_ticket := nullif(btrim(NEW.approval_ticket), '');
        NEW.revocation_reason := nullif(btrim(NEW.revocation_reason), '');
    ELSIF TG_TABLE_NAME = 'override' THEN
        NEW.reason := btrim(NEW.reason);
        NEW.approval_ticket := btrim(NEW.approval_ticket);
        NEW.revocation_reason := nullif(btrim(NEW.revocation_reason), '');
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION authz.trg_guard_tenant_row_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = authz, pg_catalog
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
        RAISE EXCEPTION
            '%.% identity fields id and tenant_id are immutable',
            TG_TABLE_SCHEMA, TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION authz.trg_guard_authority_natural_key()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = authz, pg_catalog
AS $$
DECLARE
    v_changed boolean := false;
BEGIN
    IF TG_TABLE_NAME = 'plane_membership' THEN
        v_changed :=
            NEW.principal_id IS DISTINCT FROM OLD.principal_id
            OR NEW.membership_kind IS DISTINCT FROM OLD.membership_kind
            OR NEW.source_type IS DISTINCT FROM OLD.source_type
            OR NEW.source_ref IS DISTINCT FROM OLD.source_ref
            OR NEW.effective_from IS DISTINCT FROM OLD.effective_from;
    ELSIF TG_TABLE_NAME = 'role' THEN
        v_changed :=
            NEW.code IS DISTINCT FROM OLD.code
            OR NEW.role_kind IS DISTINCT FROM OLD.role_kind
            OR NEW.source_type IS DISTINCT FROM OLD.source_type
            OR NEW.source_ref IS DISTINCT FROM OLD.source_ref;
    ELSIF TG_TABLE_NAME = 'role_permission' THEN
        v_changed :=
            NEW.role_id IS DISTINCT FROM OLD.role_id
            OR NEW.permission_id IS DISTINCT FROM OLD.permission_id;
    ELSIF TG_TABLE_NAME = 'principal_group' THEN
        v_changed :=
            NEW.code IS DISTINCT FROM OLD.code
            OR NEW.group_kind IS DISTINCT FROM OLD.group_kind
            OR NEW.source_type IS DISTINCT FROM OLD.source_type
            OR NEW.source_ref IS DISTINCT FROM OLD.source_ref;
    ELSIF TG_TABLE_NAME = 'group_member' THEN
        v_changed :=
            NEW.group_id IS DISTINCT FROM OLD.group_id
            OR NEW.principal_id IS DISTINCT FROM OLD.principal_id
            OR NEW.source_type IS DISTINCT FROM OLD.source_type
            OR NEW.source_ref IS DISTINCT FROM OLD.source_ref
            OR NEW.effective_from IS DISTINCT FROM OLD.effective_from;
    ELSIF TG_TABLE_NAME = 'group_role' THEN
        v_changed :=
            NEW.group_id IS DISTINCT FROM OLD.group_id
            OR NEW.role_id IS DISTINCT FROM OLD.role_id
            OR NEW.scope_target_id IS DISTINCT FROM OLD.scope_target_id
            OR NEW.source_type IS DISTINCT FROM OLD.source_type
            OR NEW.source_ref IS DISTINCT FROM OLD.source_ref
            OR NEW.effective_from IS DISTINCT FROM OLD.effective_from;
    ELSIF TG_TABLE_NAME = 'deny_rule' THEN
        v_changed :=
            NEW.permission_id IS DISTINCT FROM OLD.permission_id
            OR NEW.scope_target_id IS DISTINCT FROM OLD.scope_target_id
            OR NEW.subject_kind IS DISTINCT FROM OLD.subject_kind
            OR NEW.principal_id IS DISTINCT FROM OLD.principal_id
            OR NEW.group_id IS DISTINCT FROM OLD.group_id
            OR NEW.effective_from IS DISTINCT FROM OLD.effective_from;
    ELSIF TG_TABLE_NAME = 'delegation' THEN
        v_changed :=
            NEW.delegator_id IS DISTINCT FROM OLD.delegator_id
            OR NEW.delegate_id IS DISTINCT FROM OLD.delegate_id
            OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
            OR NEW.effective_until IS DISTINCT FROM OLD.effective_until;
    ELSIF TG_TABLE_NAME = 'override' THEN
        v_changed :=
            NEW.principal_id IS DISTINCT FROM OLD.principal_id
            OR NEW.permission_id IS DISTINCT FROM OLD.permission_id
            OR NEW.scope_target_id IS DISTINCT FROM OLD.scope_target_id
            OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
            OR NEW.effective_until IS DISTINCT FROM OLD.effective_until;
    ELSIF TG_TABLE_NAME = 'record_acl' THEN
        v_changed :=
            NEW.resource_code IS DISTINCT FROM OLD.resource_code
            OR NEW.record_id IS DISTINCT FROM OLD.record_id
            OR NEW.permission_id IS DISTINCT FROM OLD.permission_id
            OR NEW.subject_kind IS DISTINCT FROM OLD.subject_kind
            OR NEW.principal_id IS DISTINCT FROM OLD.principal_id
            OR NEW.group_id IS DISTINCT FROM OLD.group_id
            OR NEW.effective_from IS DISTINCT FROM OLD.effective_from;
    END IF;

    IF v_changed THEN
        RAISE EXCEPTION
            '%.% authority coordinates are immutable',
            TG_TABLE_SCHEMA, TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION authz.trg_guard_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = authz, pg_catalog
AS $$
DECLARE
    v_profile text := TG_ARGV[0];
    v_old     text := OLD.status::text;
    v_new     text := NEW.status::text;
    v_allowed boolean := false;
BEGIN
    IF v_new = v_old THEN
        RETURN NEW;
    END IF;

    v_allowed := CASE v_profile
        WHEN 'catalog' THEN
            (v_old = 'draft' AND v_new IN ('published', 'retired'))
            OR (v_old = 'published' AND v_new IN ('suspended', 'retired'))
            OR (v_old = 'suspended' AND v_new IN ('published', 'retired'))
        WHEN 'membership' THEN
            (v_old = 'pending' AND v_new IN ('active', 'revoked'))
            OR (v_old = 'active' AND v_new IN ('suspended', 'revoked'))
            OR (v_old = 'suspended' AND v_new IN ('active', 'revoked'))
        WHEN 'definition' THEN
            (v_old = 'draft' AND v_new IN ('active', 'retired'))
            OR (v_old = 'active' AND v_new IN ('suspended', 'retired'))
            OR (v_old = 'suspended' AND v_new IN ('active', 'retired'))
        WHEN 'scope' THEN
            (v_old = 'active' AND v_new IN ('suspended', 'retired'))
            OR (v_old = 'suspended' AND v_new IN ('active', 'retired'))
        WHEN 'authority' THEN
            (v_old = 'active' AND v_new IN ('suspended', 'revoked'))
            OR (v_old = 'suspended' AND v_new IN ('active', 'revoked'))
        WHEN 'approval' THEN
            (v_old = 'pending' AND v_new IN ('active', 'revoked'))
            OR (v_old = 'active' AND v_new = 'revoked')
        WHEN 'acl' THEN
            v_old = 'active' AND v_new = 'revoked'
        ELSE false
    END;

    IF NOT v_allowed THEN
        RAISE EXCEPTION
            'Invalid %.% status transition: % -> %',
            TG_TABLE_SCHEMA, TG_TABLE_NAME, v_old, v_new
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION authz.trg_guard_permission_definition()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = authz, pg_catalog
AS $$
DECLARE
    v_definition_changed boolean;
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.canonical_code IS DISTINCT FROM OLD.canonical_code THEN
        RAISE EXCEPTION
            'authz.permission id and canonical_code are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    v_definition_changed :=
        NEW.permission_kind IS DISTINCT FROM OLD.permission_kind
        OR NEW.module_id IS DISTINCT FROM OLD.module_id
        OR NEW.risk_tier IS DISTINCT FROM OLD.risk_tier
        OR NEW.requires_mfa IS DISTINCT FROM OLD.requires_mfa
        OR NEW.requires_sod IS DISTINCT FROM OLD.requires_sod
        OR NEW.is_shareable IS DISTINCT FROM OLD.is_shareable
        OR NEW.is_delegable IS DISTINCT FROM OLD.is_delegable
        OR NEW.is_overridable IS DISTINCT FROM OLD.is_overridable
        OR NEW.metadata IS DISTINCT FROM OLD.metadata;

    IF v_definition_changed AND OLD.status = 'published' THEN
        RAISE EXCEPTION
            'Suspend authz.permission % before changing its definition',
            OLD.canonical_code
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_definition_changed AND OLD.status = 'retired' THEN
        RAISE EXCEPTION
            'Retired authz.permission % is immutable',
            OLD.canonical_code
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION authz.trg_validate_permission_publish()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = authz, pg_catalog
AS $$
DECLARE
    v_dependency_kind text;
    v_dependency_id   uuid;
BEGIN
    IF NEW.status = 'published'
       AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
        IF NOT EXISTS (
            SELECT 1
              FROM control.module
             WHERE id = NEW.module_id
               AND status = 'active'
        ) THEN
            RAISE EXCEPTION
                'permission % cannot be published against an inactive module',
                NEW.canonical_code
                USING ERRCODE = 'check_violation';
        END IF;

        SELECT dependency_kind, dependency_id
          INTO v_dependency_kind, v_dependency_id
          FROM (
                SELECT 'delegation_grant'::text AS dependency_kind,
                       grant_row.id AS dependency_id
                  FROM authz.delegation_grant AS grant_row
                  JOIN authz.delegation AS delegation
                    ON delegation.tenant_id = grant_row.tenant_id
                   AND delegation.id = grant_row.delegation_id
                 WHERE grant_row.permission_id = NEW.id
                   AND delegation.status IN ('pending', 'active')
                   AND NOT NEW.is_delegable
                UNION ALL
                SELECT 'override', override_row.id
                  FROM authz.override AS override_row
                 WHERE override_row.permission_id = NEW.id
                   AND override_row.status IN ('pending', 'active')
                   AND NOT NEW.is_overridable
                UNION ALL
                SELECT 'record_acl', acl.id
                 FROM authz.record_acl AS acl
                 WHERE acl.permission_id = NEW.id
                   AND acl.status = 'active'
                   AND NOT NEW.is_shareable
          ) AS incompatible
         LIMIT 1;

        IF v_dependency_id IS NOT NULL THEN
            RAISE EXCEPTION
                'permission % cannot be published: incompatible % row %',
                NEW.canonical_code, v_dependency_kind, v_dependency_id
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;


CREATE OR REPLACE FUNCTION authz.trg_guard_scope_target()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = authz, pg_catalog
AS $$
DECLARE
    v_cycle boolean;
BEGIN
    IF TG_OP = 'UPDATE' AND (
        NEW.id IS DISTINCT FROM OLD.id
        OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
        OR NEW.scope_kind IS DISTINCT FROM OLD.scope_kind
        OR NEW.scope_key IS DISTINCT FROM OLD.scope_key
        OR NEW.target_id IS DISTINCT FROM OLD.target_id
        OR NEW.parent_scope_target_id IS DISTINCT FROM OLD.parent_scope_target_id
    ) THEN
        RAISE EXCEPTION
            'scope-target identity fields are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_OP = 'UPDATE'
       AND OLD.status = 'active'
       AND NEW.status <> 'active'
       AND EXISTS (
            SELECT 1
              FROM authz.scope_target AS child
             WHERE child.tenant_id = OLD.tenant_id
               AND child.parent_scope_target_id = OLD.id
               AND child.status = 'active'
       ) THEN
        RAISE EXCEPTION
            'scope target % cannot leave active status while it has active children',
            OLD.id
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.parent_scope_target_id IS NULL THEN
        RETURN NEW;
    END IF;

    IF NEW.status = 'active' AND NOT EXISTS (
        SELECT 1
          FROM authz.scope_target AS parent
         WHERE parent.tenant_id = NEW.tenant_id
           AND parent.id = NEW.parent_scope_target_id
           AND parent.status = 'active'
    ) THEN
        RAISE EXCEPTION
            'active scope target % requires an active parent',
            NEW.id
            USING ERRCODE = 'check_violation';
    END IF;

    WITH RECURSIVE ancestors AS (
        SELECT id, parent_scope_target_id
          FROM authz.scope_target
         WHERE tenant_id = NEW.tenant_id
           AND id = NEW.parent_scope_target_id
        UNION
        SELECT parent.id, parent.parent_scope_target_id
          FROM authz.scope_target AS parent
          JOIN ancestors
            ON parent.tenant_id = NEW.tenant_id
           AND parent.id = ancestors.parent_scope_target_id
         WHERE ancestors.parent_scope_target_id IS NOT NULL
    )
    SELECT EXISTS (
        SELECT 1 FROM ancestors WHERE id = NEW.id
    )
    INTO v_cycle;

    IF v_cycle THEN
        RAISE EXCEPTION
            'scope-target parent would create a cycle for %',
            NEW.id
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION authz.fn_internal_permission_is_assignable_at_scope(
    p_permission_id   uuid,
    p_tenant_id       uuid,
    p_scope_target_id uuid,
    p_propagation_mode authz.propagation_mode_d DEFAULT 'exact'
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, authz
AS $$
    SELECT EXISTS (
        SELECT 1
          FROM authz.permission AS permission
          JOIN authz.scope_target AS target
            ON target.tenant_id = p_tenant_id
           AND target.id = p_scope_target_id
          JOIN authz.permission_scope_kind AS compatibility
            ON compatibility.permission_id = permission.id
           AND compatibility.scope_kind = target.scope_kind
           AND compatibility.propagation_mode = p_propagation_mode
           AND compatibility.status = 'active'
         WHERE permission.id = p_permission_id
           AND permission.status = 'published'
           AND target.status = 'active'
    );
$$;

COMMENT ON FUNCTION authz.fn_internal_permission_is_assignable_at_scope(
    uuid, uuid, uuid, authz.propagation_mode_d
) IS
  'Private authorization-engine helper. Callers must establish tenant authority before invoking it.';

CREATE OR REPLACE FUNCTION authz.fn_permission_is_assignable_at_scope(
    p_permission_id   uuid,
    p_tenant_id       uuid,
    p_scope_target_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, authz, shared
AS $$
BEGIN
    IF p_tenant_id IS DISTINCT FROM shared.current_tenant_id() THEN
        RAISE EXCEPTION
            'Requested tenant does not match the current tenant context'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    RETURN authz.fn_internal_permission_is_assignable_at_scope(
        p_permission_id, p_tenant_id, p_scope_target_id, 'exact'
    );
END;
$$;

COMMENT ON FUNCTION authz.fn_permission_is_assignable_at_scope(
    uuid, uuid, uuid
) IS
  'Tenant-bound application wrapper for exact permission/scope assignability.';

CREATE OR REPLACE FUNCTION authz.fn_internal_scope_assignment_covers_target(
    p_tenant_id                 uuid,
    p_assignment_scope_target_id uuid,
    p_requested_scope_target_id  uuid,
    p_propagation_mode           authz.propagation_mode_d
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, authz
AS $$
    WITH RECURSIVE requested_lineage AS (
        SELECT target.id, target.parent_scope_target_id
          FROM authz.scope_target AS target
         WHERE target.tenant_id = p_tenant_id
           AND target.id = p_requested_scope_target_id
           AND target.status = 'active'
        UNION ALL
        SELECT parent.id, parent.parent_scope_target_id
          FROM authz.scope_target AS parent
          JOIN requested_lineage AS child
            ON parent.id = child.parent_scope_target_id
         WHERE parent.tenant_id = p_tenant_id
           AND parent.status = 'active'
    )
    SELECT CASE p_propagation_mode
        WHEN 'exact' THEN
            p_assignment_scope_target_id = p_requested_scope_target_id
            AND EXISTS (
                SELECT 1
                  FROM authz.scope_target AS anchor
                 WHERE anchor.tenant_id = p_tenant_id
                   AND anchor.id = p_assignment_scope_target_id
                   AND anchor.status = 'active'
            )
        WHEN 'subtree' THEN EXISTS (
            SELECT 1
              FROM requested_lineage
             WHERE id = p_assignment_scope_target_id
        )
        ELSE false
    END;
$$;

COMMENT ON FUNCTION authz.fn_internal_scope_assignment_covers_target(
    uuid, uuid, uuid, authz.propagation_mode_d
) IS
  'Private authorization-engine scope coverage helper. Graph modes fail closed.';

CREATE OR REPLACE FUNCTION authz.fn_scope_assignment_covers_target(
    p_tenant_id                  uuid,
    p_assignment_scope_target_id uuid,
    p_requested_scope_target_id  uuid,
    p_propagation_mode           authz.propagation_mode_d
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, authz, shared
AS $$
BEGIN
    IF p_tenant_id IS DISTINCT FROM shared.current_tenant_id() THEN
        RAISE EXCEPTION
            'Requested tenant does not match the current tenant context'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    RETURN authz.fn_internal_scope_assignment_covers_target(
        p_tenant_id,
        p_assignment_scope_target_id,
        p_requested_scope_target_id,
        p_propagation_mode
    );
END;
$$;

COMMENT ON FUNCTION authz.fn_scope_assignment_covers_target(
    uuid, uuid, uuid, authz.propagation_mode_d
) IS
  'Tenant-bound application wrapper for exact and subtree scope coverage.';

CREATE OR REPLACE FUNCTION authz.trg_guard_role_permission()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = authz, pg_catalog
AS $$
DECLARE
    v_role_id     uuid;
    v_tenant_id   uuid;
    v_role_status authz.definition_status_d;
BEGIN
    IF TG_OP = 'UPDATE'
       AND (
           NEW.id IS DISTINCT FROM OLD.id
           OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
           OR NEW.role_id IS DISTINCT FROM OLD.role_id
           OR NEW.permission_id IS DISTINCT FROM OLD.permission_id
           OR NEW.created_at IS DISTINCT FROM OLD.created_at
           OR NEW.created_by IS DISTINCT FROM OLD.created_by
       ) THEN
        RAISE EXCEPTION
            'role_permission identity and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    v_role_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.role_id ELSE NEW.role_id END;
    v_tenant_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;

    SELECT status
      INTO v_role_status
      FROM authz.role
     WHERE tenant_id = v_tenant_id
       AND id = v_role_id
     FOR UPDATE;

    IF v_role_status IS NULL THEN
        RAISE EXCEPTION
            'role_permission requires an existing role'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_role_status NOT IN ('draft', 'suspended') THEN
        RAISE EXCEPTION
            'Role permissions for role % may change only while it is draft or suspended; current status is %',
            v_role_id, v_role_status
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION authz.trg_validate_role_activation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = authz, pg_catalog
AS $$
DECLARE
    v_dependency_kind text;
    v_dependency_id   uuid;
BEGIN
    IF NEW.status = 'active'
       AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
        IF NOT EXISTS (
            SELECT 1
              FROM authz.role_permission
             WHERE tenant_id = NEW.tenant_id
               AND role_id = NEW.id
        ) THEN
            RAISE EXCEPTION
                'role % cannot be activated without at least one permission',
                NEW.code
                USING ERRCODE = 'check_violation';
        END IF;

        SELECT 'role_permission'::text AS dependency_kind,
               role_permission.id AS dependency_id
          INTO v_dependency_kind, v_dependency_id
          FROM authz.role_permission AS role_permission
          LEFT JOIN authz.permission AS permission
            ON permission.id = role_permission.permission_id
           AND permission.status = 'published'
         WHERE role_permission.tenant_id = NEW.tenant_id
           AND role_permission.role_id = NEW.id
           AND permission.id IS NULL
         LIMIT 1;

        IF v_dependency_id IS NOT NULL THEN
            RAISE EXCEPTION
                'role % cannot be activated: incompatible % row %',
                NEW.code, v_dependency_kind, v_dependency_id
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION authz.trg_validate_group_role()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = authz, pg_catalog
AS $$
BEGIN
    IF NEW.status <> 'active' THEN
        RETURN NEW;
    END IF;

    IF NEW.effective_until IS NOT NULL
       AND NEW.effective_until <= clock_timestamp() THEN
        RAISE EXCEPTION 'an expired group_role cannot be activated'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM authz.principal_group
         WHERE tenant_id = NEW.tenant_id
           AND id = NEW.group_id
           AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'group_role requires an active principal_group'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM authz.role
         WHERE tenant_id = NEW.tenant_id
           AND id = NEW.role_id
           AND status = 'active'
    ) THEN
        RAISE EXCEPTION 'group_role requires an active role'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM authz.role_permission
         WHERE tenant_id = NEW.tenant_id
           AND role_id = NEW.role_id
    ) THEN
        RAISE EXCEPTION 'group_role requires at least one active role permission'
            USING ERRCODE = 'check_violation';
    END IF;

    IF EXISTS (
        SELECT 1
          FROM authz.role_permission AS role_permission
         WHERE role_permission.tenant_id = NEW.tenant_id
           AND role_permission.role_id = NEW.role_id
           AND NOT authz.fn_internal_permission_is_assignable_at_scope(
                role_permission.permission_id,
                NEW.tenant_id,
                NEW.scope_target_id,
                NEW.propagation_mode
           )
    ) THEN
        RAISE EXCEPTION
            'role % contains a permission incompatible with scope target %',
            NEW.role_id, NEW.scope_target_id
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION authz.trg_validate_group_member()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = authz, master, pg_catalog
AS $$
DECLARE
    v_group_kind   authz.group_kind_d;
    v_group_status authz.scope_status_d;
BEGIN
    SELECT group_kind, status
      INTO v_group_kind, v_group_status
      FROM authz.principal_group
     WHERE tenant_id = NEW.tenant_id
       AND id = NEW.group_id;

    IF v_group_kind IS NULL THEN
        RAISE EXCEPTION 'group_member requires an existing principal_group'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_group_kind = 'iam_managed' THEN
        IF NEW.source_type <> 'iam_sync' OR NEW.source_ref IS NULL THEN
            RAISE EXCEPTION
                'membership in an IAM-managed group requires iam_sync source and source_ref'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSIF NEW.source_type = 'iam_sync' THEN
        RAISE EXCEPTION
            'iam_sync membership is valid only for an IAM-managed group'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.status <> 'active' THEN
        RETURN NEW;
    END IF;

    IF NEW.effective_until IS NOT NULL
       AND NEW.effective_until <= clock_timestamp() THEN
        RAISE EXCEPTION 'an expired group membership cannot be activated'
            USING ERRCODE = 'check_violation';
    END IF;

    IF v_group_status <> 'active'
       OR NOT EXISTS (
            SELECT 1
              FROM master.principal
             WHERE tenant_id = NEW.tenant_id
               AND id = NEW.principal_id
               AND status = 'active'
       )
       OR NOT EXISTS (
            SELECT 1
              FROM authz.plane_membership
             WHERE tenant_id = NEW.tenant_id
               AND principal_id = NEW.principal_id
               AND status = 'active'
               AND effective_from <= clock_timestamp()
               AND (
                    effective_until IS NULL
                    OR effective_until > clock_timestamp()
               )
       ) THEN
        RAISE EXCEPTION
            'active group membership requires an active principal, group, and current plane membership'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION authz.trg_validate_scoped_authority()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = authz, pg_catalog
AS $$
DECLARE
    v_shareable   boolean;
    v_delegable   boolean;
    v_overridable boolean;
BEGIN
    IF TG_TABLE_NAME = 'deny_rule' THEN
        IF NEW.status = 'active'
           AND NEW.effective_until IS NOT NULL
           AND NEW.effective_until <= clock_timestamp() THEN
            RAISE EXCEPTION 'an expired deny rule cannot be activated'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    SELECT is_shareable, is_delegable, is_overridable
      INTO v_shareable, v_delegable, v_overridable
      FROM authz.permission
     WHERE id = NEW.permission_id
       AND status = 'published'
    ;

    IF NOT FOUND THEN
        RAISE EXCEPTION
            '%.% requires a currently published permission',
            TG_TABLE_SCHEMA, TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_TABLE_NAME = 'record_acl' THEN
        IF NOT v_shareable THEN
            RAISE EXCEPTION 'record_acl permission is not shareable'
                USING ERRCODE = 'check_violation';
        END IF;
        RETURN NEW;
    END IF;

    IF NOT authz.fn_internal_permission_is_assignable_at_scope(
        NEW.permission_id,
        NEW.tenant_id,
        NEW.scope_target_id
    ) THEN
        RAISE EXCEPTION
            'permission % is not valid for scope target %',
            NEW.permission_id, NEW.scope_target_id
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_TABLE_NAME = 'delegation_grant' AND NOT v_delegable THEN
        RAISE EXCEPTION 'delegation_grant permission is not delegable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_TABLE_NAME = 'override' AND NOT v_overridable THEN
        RAISE EXCEPTION 'override permission is not overridable'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION authz.trg_validate_active_subject()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = authz, master, pg_catalog
AS $$
BEGIN
    IF NEW.status <> 'active' THEN
        RETURN NEW;
    END IF;

    IF TG_TABLE_NAME = 'plane_membership' THEN
        IF NEW.effective_until IS NOT NULL
           AND NEW.effective_until <= clock_timestamp() THEN
            RAISE EXCEPTION 'an expired plane membership cannot be activated'
                USING ERRCODE = 'check_violation';
        END IF;
        IF NOT EXISTS (
            SELECT 1
              FROM master.tenant
             WHERE id = NEW.tenant_id
               AND status = 'active'
        ) THEN
            RAISE EXCEPTION 'active plane membership requires an active tenant'
                USING ERRCODE = 'check_violation';
        END IF;
        IF NOT EXISTS (
            SELECT 1
              FROM master.principal
             WHERE tenant_id = NEW.tenant_id
               AND id = NEW.principal_id
               AND status = 'active'
        ) THEN
            RAISE EXCEPTION 'active plane membership requires an active principal'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSIF TG_TABLE_NAME = 'delegation' THEN
        IF NEW.effective_until <= clock_timestamp() THEN
            RAISE EXCEPTION 'an expired delegation cannot be activated'
                USING ERRCODE = 'check_violation';
        END IF;
        IF (
            SELECT count(*)
              FROM authz.plane_membership
             WHERE tenant_id = NEW.tenant_id
               AND principal_id IN (NEW.delegator_id, NEW.delegate_id)
               AND status = 'active'
               AND effective_from <= clock_timestamp()
               AND (effective_until IS NULL OR effective_until > clock_timestamp())
        ) <> 2 THEN
            RAISE EXCEPTION
                'active delegation requires active plane membership for both principals'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSIF TG_TABLE_NAME = 'override' THEN
        IF NEW.effective_until <= clock_timestamp() THEN
            RAISE EXCEPTION 'an expired override cannot be activated'
                USING ERRCODE = 'check_violation';
        END IF;
        IF NOT EXISTS (
            SELECT 1
              FROM authz.plane_membership
             WHERE tenant_id = NEW.tenant_id
               AND principal_id = NEW.principal_id
               AND status = 'active'
               AND effective_from <= clock_timestamp()
               AND (effective_until IS NULL OR effective_until > clock_timestamp())
        ) THEN
            RAISE EXCEPTION 'active override requires active plane membership'
                USING ERRCODE = 'check_violation';
        END IF;
    ELSIF TG_TABLE_NAME = 'record_acl' THEN
        IF NEW.effective_until IS NOT NULL
           AND NEW.effective_until <= clock_timestamp() THEN
            RAISE EXCEPTION 'an expired record ACL cannot be activated'
                USING ERRCODE = 'check_violation';
        END IF;
        IF NEW.subject_kind = 'principal' AND NOT EXISTS (
            SELECT 1
              FROM master.principal AS principal
              JOIN authz.plane_membership AS membership
                ON membership.tenant_id = principal.tenant_id
               AND membership.principal_id = principal.id
               AND membership.status = 'active'
               AND membership.effective_from <= clock_timestamp()
               AND (
                    membership.effective_until IS NULL
                    OR membership.effective_until > clock_timestamp()
               )
             WHERE principal.tenant_id = NEW.tenant_id
               AND principal.id = NEW.principal_id
               AND principal.status = 'active'
        ) THEN
            RAISE EXCEPTION
                'active record ACL requires an active principal with current plane membership'
                USING ERRCODE = 'check_violation';
        ELSIF NEW.subject_kind = 'group' AND NOT EXISTS (
            SELECT 1
              FROM authz.principal_group
             WHERE tenant_id = NEW.tenant_id
               AND id = NEW.group_id
               AND status = 'active'
        ) THEN
            RAISE EXCEPTION 'active record ACL requires an active group'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION authz.trg_guard_delegation_grant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = authz, pg_catalog
AS $$
DECLARE
    v_delegation_id uuid :=
        CASE WHEN TG_OP = 'DELETE' THEN OLD.delegation_id ELSE NEW.delegation_id END;
    v_tenant_id uuid :=
        CASE WHEN TG_OP = 'DELETE' THEN OLD.tenant_id ELSE NEW.tenant_id END;
    v_parent_status authz.approval_status_d;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION
            'delegation grants are replaced, not updated'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT status
      INTO v_parent_status
      FROM authz.delegation
     WHERE tenant_id = v_tenant_id
       AND id = v_delegation_id
     FOR UPDATE;

    IF v_parent_status IS NULL THEN
        RAISE EXCEPTION 'delegation_grant requires an existing delegation'
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    IF v_parent_status <> 'pending' THEN
        RAISE EXCEPTION
            'delegation grants may change only while the parent is pending'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE OR REPLACE FUNCTION authz.trg_validate_delegation_activation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = authz, master, pg_catalog
AS $$
DECLARE
    v_grant_id uuid;
BEGIN
    IF NEW.status <> 'active'
       OR (TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status) THEN
        RETURN NEW;
    END IF;

    IF NEW.approved_by IS NULL OR NEW.approved_at IS NULL THEN
        RAISE EXCEPTION 'active delegation requires approval evidence'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM master.principal AS approver
          JOIN authz.plane_membership AS membership
            ON membership.tenant_id = approver.tenant_id
           AND membership.principal_id = approver.id
           AND membership.status = 'active'
           AND membership.effective_from <= clock_timestamp()
           AND (
                membership.effective_until IS NULL
                OR membership.effective_until > clock_timestamp()
           )
         WHERE approver.tenant_id = NEW.tenant_id
           AND approver.id = NEW.approved_by
           AND approver.status = 'active'
    ) THEN
        RAISE EXCEPTION
            'delegation approver must be an active principal with current plane membership'
            USING ERRCODE = 'check_violation';
    END IF;

    IF (
        SELECT count(*)
          FROM authz.plane_membership
         WHERE tenant_id = NEW.tenant_id
           AND principal_id IN (NEW.delegator_id, NEW.delegate_id)
           AND status = 'active'
           AND effective_from <= NEW.effective_from
           AND (
                effective_until IS NULL
                OR effective_until >= NEW.effective_until
           )
    ) <> 2 THEN
        RAISE EXCEPTION
            'delegator and delegate plane memberships must cover the delegation window'
            USING ERRCODE = 'check_violation';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM authz.delegation_grant
         WHERE tenant_id = NEW.tenant_id
           AND delegation_id = NEW.id
    ) THEN
        RAISE EXCEPTION 'delegation requires at least one grant'
            USING ERRCODE = 'check_violation';
    END IF;

    SELECT grant_row.id
      INTO v_grant_id
      FROM authz.delegation_grant AS grant_row
     WHERE grant_row.tenant_id = NEW.tenant_id
       AND grant_row.delegation_id = NEW.id
       AND (
            NOT EXISTS (
                SELECT 1
                  FROM authz.group_member AS membership
                  JOIN authz.group_role AS assignment
                    ON assignment.tenant_id = membership.tenant_id
                   AND assignment.group_id = membership.group_id
                   AND assignment.status = 'active'
                   AND assignment.effective_from <= NEW.effective_from
                   AND (
                        assignment.effective_until IS NULL
                        OR assignment.effective_until >= NEW.effective_until
                   )
                  JOIN authz.role_permission AS role_permission
                    ON role_permission.tenant_id = assignment.tenant_id
                   AND role_permission.role_id = assignment.role_id
                   AND role_permission.permission_id = grant_row.permission_id
                  JOIN authz.scope_target AS assignment_target
                    ON assignment_target.tenant_id = assignment.tenant_id
                   AND assignment_target.id = assignment.scope_target_id
                   AND assignment_target.status = 'active'
                 WHERE membership.tenant_id = NEW.tenant_id
                   AND membership.principal_id = NEW.delegator_id
                   AND membership.status = 'active'
                   AND membership.effective_from <= NEW.effective_from
                   AND (
                        membership.effective_until IS NULL
                        OR membership.effective_until >= NEW.effective_until
                   )
                   AND authz.fn_internal_scope_assignment_covers_target(
                        NEW.tenant_id,
                        assignment.scope_target_id,
                        grant_row.scope_target_id,
                        assignment.propagation_mode
                   )
            )
            OR EXISTS (
                SELECT 1
                  FROM authz.deny_rule AS deny
                  JOIN authz.scope_target AS deny_target
                    ON deny_target.tenant_id = deny.tenant_id
                   AND deny_target.id = deny.scope_target_id
                   AND deny_target.status = 'active'
                 WHERE deny.tenant_id = NEW.tenant_id
                   AND deny.permission_id = grant_row.permission_id
                   AND deny.status = 'active'
                   AND deny.effective_from < NEW.effective_until
                   AND (
                        deny.effective_until IS NULL
                        OR deny.effective_until > NEW.effective_from
                   )
                   AND (
                        deny.subject_kind = 'tenant'
                        OR (
                            deny.subject_kind = 'principal'
                            AND deny.principal_id = NEW.delegator_id
                        )
                        OR (
                            deny.subject_kind = 'group'
                            AND EXISTS (
                                SELECT 1
                                  FROM authz.group_member AS denied_membership
                                 WHERE denied_membership.tenant_id = NEW.tenant_id
                                   AND denied_membership.group_id = deny.group_id
                                   AND denied_membership.principal_id = NEW.delegator_id
                                   AND denied_membership.status = 'active'
                                   AND denied_membership.effective_from < NEW.effective_until
                                   AND (
                                        denied_membership.effective_until IS NULL
                                        OR denied_membership.effective_until > NEW.effective_from
                                   )
                            )
                        )
                   )
                   AND authz.fn_internal_scope_assignment_covers_target(
                        NEW.tenant_id,
                        deny.scope_target_id,
                        grant_row.scope_target_id,
                        'subtree'
                   )
            )
       )
     LIMIT 1;

    IF v_grant_id IS NOT NULL THEN
        RAISE EXCEPTION
            'delegation grant % lacks a deny-free base group-role proof covering its full window',
            v_grant_id
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION authz.trg_guard_audit_evidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = authz, pg_catalog
AS $$
BEGIN
    IF NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION
            '%.% creation evidence is immutable',
            TG_TABLE_SCHEMA, TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.status_changed_at IS NOT NULL
       AND (
            NEW.status_changed_at IS DISTINCT FROM OLD.status_changed_at
            OR NEW.status_changed_by IS DISTINCT FROM OLD.status_changed_by
       ) THEN
        RAISE EXCEPTION
            '%.% recorded status evidence is immutable',
            TG_TABLE_SCHEMA, TG_TABLE_NAME
            USING ERRCODE = 'check_violation';
    END IF;

    IF TG_TABLE_NAME IN ('delegation', 'override') THEN
        IF OLD.approved_at IS NOT NULL
           AND (
                NEW.approved_at IS DISTINCT FROM OLD.approved_at
                OR NEW.approved_by IS DISTINCT FROM OLD.approved_by
           ) THEN
            RAISE EXCEPTION 'approval evidence is immutable'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF TG_TABLE_NAME IN ('delegation', 'override', 'record_acl') THEN
        IF OLD.revoked_at IS NOT NULL
           AND (
                NEW.revoked_at IS DISTINCT FROM OLD.revoked_at
                OR NEW.revoked_by IS DISTINCT FROM OLD.revoked_by
                OR NEW.revocation_reason IS DISTINCT FROM OLD.revocation_reason
           ) THEN
            RAISE EXCEPTION 'revocation evidence is immutable'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    IF TG_TABLE_NAME = 'record_acl' THEN
        IF NEW.granted_by IS DISTINCT FROM OLD.granted_by THEN
            RAISE EXCEPTION 'record ACL grant evidence is immutable'
                USING ERRCODE = 'check_violation';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION authz.trg_guard_authority_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = authz, pg_catalog
AS $$
DECLARE
    v_status text := OLD.status::text;
BEGIN
    IF (TG_TABLE_NAME = 'permission' AND v_status = 'draft')
       OR (TG_TABLE_NAME = 'role' AND v_status = 'draft')
       OR (TG_TABLE_NAME = 'plane_membership' AND v_status = 'pending')
       OR (TG_TABLE_NAME IN ('delegation', 'override') AND v_status = 'pending') THEN
        RETURN OLD;
    END IF;

    RAISE EXCEPTION
        'authz.%(%) is retained decision evidence; change lifecycle status instead of deleting',
        TG_TABLE_NAME, OLD.id
        USING ERRCODE = 'check_violation';
END;
$$;

CREATE OR REPLACE FUNCTION authz.trg_guard_trusted_device()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = authz, pg_catalog
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.principal_id IS DISTINCT FROM OLD.principal_id
       OR NEW.auth_epoch IS DISTINCT FROM OLD.auth_epoch
       OR NEW.device_token_hash IS DISTINCT FROM OLD.device_token_hash
       OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION
            'authz.trusted_device identity, token, expiry, and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.revoked_at IS NOT NULL
       AND (
           NEW.revoked_at IS DISTINCT FROM OLD.revoked_at
           OR NEW.revoked_by IS DISTINCT FROM OLD.revoked_by
           OR NEW.revocation_reason IS DISTINCT FROM OLD.revocation_reason
       ) THEN
        RAISE EXCEPTION 'trusted-device revocation evidence is immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.last_seen_at IS NOT NULL
       AND NEW.last_seen_at IS NOT NULL
       AND NEW.last_seen_at < OLD.last_seen_at THEN
        RAISE EXCEPTION 'trusted-device last_seen_at cannot move backwards'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION authz.fn_revoke_principal_trusted_devices(
    p_tenant_id uuid,
    p_principal_id uuid,
    p_revoked_by uuid,
    p_reason text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, authz, master, shared
AS $$
DECLARE
    v_count integer;
BEGIN
    IF p_tenant_id IS DISTINCT FROM shared.current_tenant_id()
       OR p_principal_id IS DISTINCT FROM master.current_principal_id_soft()
       OR p_revoked_by IS DISTINCT FROM master.current_principal_id_soft() THEN
        RAISE EXCEPTION 'trusted-device revocation is restricted to the current tenant and principal'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF p_reason IS NULL OR btrim(p_reason) = '' OR length(p_reason) > 240 THEN
        RAISE EXCEPTION 'trusted-device revocation reason is required (maximum 240 characters)'
            USING ERRCODE = 'check_violation';
    END IF;

    UPDATE authz.trusted_device
       SET revoked_at = clock_timestamp(),
           revoked_by = p_revoked_by,
           revocation_reason = btrim(p_reason)
     WHERE tenant_id = p_tenant_id
       AND principal_id = p_principal_id
       AND revoked_at IS NULL;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION authz.fn_reconcile_expired_authority(
    p_tenant_id uuid,
    p_effective_at timestamptz,
    p_actor_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, authz
AS $$
DECLARE
    v_changed_at timestamptz := clock_timestamp();
    v_memberships integer;
    v_group_members integer;
    v_group_roles integer;
    v_delegations integer;
    v_overrides integer;
    v_record_acls integer;
    v_trusted_devices integer;
BEGIN
    IF p_tenant_id IS NULL OR p_actor_id IS NULL OR p_effective_at IS NULL
       OR p_effective_at > clock_timestamp() + interval '1 minute' THEN
        RAISE EXCEPTION 'invalid authority reconciliation arguments'
            USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM master.principal
         WHERE tenant_id=p_tenant_id AND id=p_actor_id AND status='active'
    ) THEN
        RAISE EXCEPTION 'authority reconciliation actor is not active in tenant'
            USING ERRCODE = 'insufficient_privilege';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':authz-expiry', 0));

    UPDATE authz.plane_membership
       SET status='revoked', updated_at=v_changed_at, updated_by=p_actor_id
     WHERE tenant_id=p_tenant_id AND status IN ('active','suspended')
       AND effective_until IS NOT NULL AND effective_until<=p_effective_at;
    GET DIAGNOSTICS v_memberships = ROW_COUNT;

    UPDATE authz.group_member
       SET status='revoked', updated_at=v_changed_at, updated_by=p_actor_id
     WHERE tenant_id=p_tenant_id AND status IN ('active','suspended')
       AND effective_until IS NOT NULL AND effective_until<=p_effective_at;
    GET DIAGNOSTICS v_group_members = ROW_COUNT;

    UPDATE authz.group_role
       SET status='revoked', updated_at=v_changed_at, updated_by=p_actor_id
     WHERE tenant_id=p_tenant_id AND status IN ('active','suspended')
       AND effective_until IS NOT NULL AND effective_until<=p_effective_at;
    GET DIAGNOSTICS v_group_roles = ROW_COUNT;

    UPDATE authz.delegation
       SET status='revoked', revoked_at=v_changed_at, revoked_by=p_actor_id,
           revocation_reason='expired', updated_at=v_changed_at, updated_by=p_actor_id
     WHERE tenant_id=p_tenant_id AND status='active' AND effective_until<=p_effective_at;
    GET DIAGNOSTICS v_delegations = ROW_COUNT;

    UPDATE authz.override
       SET status='revoked', revoked_at=v_changed_at, revoked_by=p_actor_id,
           revocation_reason='expired', updated_at=v_changed_at, updated_by=p_actor_id
     WHERE tenant_id=p_tenant_id AND status='active' AND effective_until<=p_effective_at;
    GET DIAGNOSTICS v_overrides = ROW_COUNT;

    UPDATE authz.record_acl
       SET status='revoked', revoked_at=v_changed_at, revoked_by=p_actor_id,
           revocation_reason='expired', updated_at=v_changed_at, updated_by=p_actor_id
     WHERE tenant_id=p_tenant_id AND status='active'
       AND effective_until IS NOT NULL AND effective_until<=p_effective_at;
    GET DIAGNOSTICS v_record_acls = ROW_COUNT;

    UPDATE authz.trusted_device
       SET revoked_at = v_changed_at,
           revoked_by = p_actor_id,
           revocation_reason = 'expired'
     WHERE tenant_id = p_tenant_id
       AND expires_at <= p_effective_at
       AND revoked_at IS NULL;
    GET DIAGNOSTICS v_trusted_devices = ROW_COUNT;

    RETURN jsonb_build_object(
      'planeMemberships',v_memberships,'groupMembers',v_group_members,
      'groupRoles',v_group_roles,'delegations',v_delegations,
      'overrides',v_overrides,'recordAcls',v_record_acls,
      'trustedDevices',v_trusted_devices);
END;
$$;

-- Projection mutation routines are ultimately owned by the dedicated NOLOGIN
-- role. Temporary membership lets repeatable DDL replace an already-owned
-- routine; it is revoked at the end of this file and grants no persistent
-- runtime/admin authority.
GRANT athyper_projection_owner TO CURRENT_USER;

-- Athyper-published and reconciled authorization projections.
CREATE OR REPLACE FUNCTION authz.fn_stage_application_projection(
  p_tenant_id uuid,
  p_projection jsonb,
  p_providers jsonb,
  p_scopes jsonb,
  p_actor_id uuid
) RETURNS authz.application_projection
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,authz
AS $$
DECLARE
  v_projection authz.application_projection%ROWTYPE;
  v_existing authz.application_projection%ROWTYPE;
  v_projection_id uuid:=NULLIF(p_projection->>'id','')::uuid;
  v_source_projection_id uuid:=NULLIF(p_projection->>'sourceProjectionId','')::uuid;
  v_source_version bigint:=NULLIF(p_projection->>'sourceVersion','')::bigint;
  v_source_hash text:=p_projection->>'sourceHash';
BEGIN
  IF p_tenant_id IS NULL OR p_actor_id IS NULL OR jsonb_typeof(p_projection)<>'object'
     OR jsonb_typeof(p_providers)<>'array' OR jsonb_array_length(p_providers)=0
     OR jsonb_typeof(p_scopes)<>'array' OR jsonb_array_length(p_scopes)=0
     OR v_projection_id IS NULL OR v_source_projection_id IS NULL OR v_source_version<1
     OR v_source_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'APPLICATION_PROJECTION_PAYLOAD_INVALID' USING ERRCODE='check_violation';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM master.tenant WHERE id=p_tenant_id AND status='active') THEN
    RAISE EXCEPTION 'APPLICATION_PROJECTION_TARGET_TENANT_INACTIVE' USING ERRCODE='foreign_key_violation';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_providers) item
    WHERE COALESCE(item->>'id','') !~ '^[0-9a-f-]{36}$'
       OR COALESCE(item->>'sourceProviderId','') !~ '^[0-9a-f-]{36}$'
       OR NULLIF(item->>'sourceVersion','')::bigint<1) THEN
    RAISE EXCEPTION 'APPLICATION_PROJECTION_PROVIDER_INVALID' USING ERRCODE='check_violation';
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_scopes) item
    WHERE COALESCE(item->>'id','') !~ '^[0-9a-f-]{36}$'
       OR COALESCE(item->>'scopeTargetId','') !~ '^[0-9a-f-]{36}$'
       OR COALESCE(item->>'sourceScopeId','') !~ '^[0-9a-f-]{36}$'
       OR NULLIF(item->>'sourceVersion','')::bigint<1) THEN
    RAISE EXCEPTION 'APPLICATION_PROJECTION_SCOPE_INVALID' USING ERRCODE='check_violation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_source_projection_id::text || ':' || v_source_version::text,0));
  SELECT * INTO v_existing FROM authz.application_projection
   WHERE source_projection_id=v_source_projection_id AND source_version=v_source_version FOR UPDATE;
  IF FOUND THEN
    IF v_existing.id<>v_projection_id OR v_existing.tenant_id<>p_tenant_id OR v_existing.source_hash<>v_source_hash THEN
      RAISE EXCEPTION 'APPLICATION_PROJECTION_IDEMPOTENCY_CONFLICT' USING ERRCODE='unique_violation';
    END IF;
    RETURN v_existing;
  END IF;

  INSERT INTO authz.application_projection(
    id,tenant_id,realm_key,external_organization_id,organization_alias,organization_name,
    source_projection_id,source_version,source_hash,status,metadata,created_by)
  VALUES(
    v_projection_id,p_tenant_id,lower(btrim(p_projection->>'realmKey')),
    p_projection->>'externalOrganizationId',NULLIF(btrim(p_projection->>'organizationAlias'),''),
    p_projection->>'organizationName',v_source_projection_id,v_source_version,v_source_hash,
    'pending',COALESCE(p_projection->'metadata','{}'::jsonb),p_actor_id)
  RETURNING * INTO v_projection;

  INSERT INTO authz.projection_provider(
    id,tenant_id,projection_id,provider_code,protocol,external_provider_id,
    source_provider_id,source_version,status,created_by)
  SELECT (item->>'id')::uuid,p_tenant_id,v_projection_id,lower(btrim(item->>'providerCode')),
    lower(btrim(item->>'protocol')),NULLIF(item->>'externalProviderId',''),
    (item->>'sourceProviderId')::uuid,(item->>'sourceVersion')::bigint,'active',p_actor_id
  FROM jsonb_array_elements(p_providers) item;

  INSERT INTO authz.projection_scope(
    id,tenant_id,projection_id,scope_target_id,ceiling_mode,network_role_ceiling,
    source_scope_id,source_version,status,effective_from,effective_until,created_by)
  SELECT (item->>'id')::uuid,p_tenant_id,v_projection_id,(item->>'scopeTargetId')::uuid,
    COALESCE(NULLIF(item->>'ceilingMode',''),'exact')::authz.projection_ceiling_mode_d,
    NULLIF(item->>'networkRoleCeiling',''),(item->>'sourceScopeId')::uuid,
    (item->>'sourceVersion')::bigint,'active',
    COALESCE(NULLIF(item->>'effectiveFrom','')::timestamptz,statement_timestamp()),
    NULLIF(item->>'effectiveUntil','')::timestamptz,p_actor_id
  FROM jsonb_array_elements(p_scopes) item;
  RETURN v_projection;
END $$;

CREATE OR REPLACE FUNCTION authz.fn_activate_application_projection(
  p_tenant_id uuid,
  p_projection_id uuid,
  p_source_version bigint,
  p_source_hash text,
  p_actor_id uuid
) RETURNS authz.application_projection
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=authz,event,shared,pg_catalog
AS $$
DECLARE
  v_projection authz.application_projection%ROWTYPE;
  v_now timestamptz := clock_timestamp();
BEGIN
  SELECT * INTO v_projection
    FROM authz.application_projection
   WHERE tenant_id=p_tenant_id AND id=p_projection_id
   FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'application projection not found'; END IF;
  IF v_projection.source_version<>p_source_version OR v_projection.source_hash<>p_source_hash THEN
    RAISE EXCEPTION 'application projection desired-state version/hash mismatch';
  END IF;
  IF v_projection.status='active' THEN RETURN v_projection; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    v_projection.realm_key || ':' || v_projection.external_organization_id, 0));

  IF NOT EXISTS(
    SELECT 1
      FROM authz.projection_scope s
      JOIN authz.scope_target t ON (t.tenant_id,t.id)=(s.tenant_id,s.scope_target_id)
     WHERE s.tenant_id=p_tenant_id AND s.projection_id=p_projection_id
       AND s.status='active' AND s.effective_from<=v_now
       AND (s.effective_until IS NULL OR s.effective_until>v_now)
       AND t.status='active'
  ) THEN
    RAISE EXCEPTION 'application projection requires an active same-tenant scope';
  END IF;

  UPDATE authz.application_projection
     SET status='retired', effective_until=v_now, reconciled_at=v_now,
         updated_at=v_now, updated_by=p_actor_id
   WHERE id<>p_projection_id
     AND realm_key=v_projection.realm_key
     AND external_organization_id=v_projection.external_organization_id
     AND status IN ('active','suspended')
     AND effective_from IS NOT NULL
     AND (effective_until IS NULL OR effective_until>v_now);

  UPDATE authz.application_projection
     SET status='active', effective_from=v_now, effective_until=NULL,
         reconciled_at=v_now, reconciliation_error_code=NULL,
         updated_at=v_now, updated_by=p_actor_id
   WHERE id=p_projection_id
   RETURNING * INTO v_projection;
  RETURN v_projection;
END $$;

CREATE OR REPLACE FUNCTION authz.fn_resolve_active_application_projections(
    p_realm_key text,
    p_external_organization_ids text[],
    p_provider_code text DEFAULT 'keycloak'
) RETURNS TABLE (
    projection_id uuid,
    tenant_id uuid,
    realm_key text,
    external_organization_id text,
    organization_alias text,
    organization_name text,
    source_version bigint,
    source_hash text,
    effective_from timestamptz,
    effective_until timestamptz,
    scope_ceilings jsonb
) LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, authz
SET row_security = off
AS $$
BEGIN
    IF p_realm_key IS NULL
       OR lower(btrim(p_realm_key)) !~ '^[a-z][a-z0-9_.-]{1,62}$'
       OR p_external_organization_ids IS NULL
       OR cardinality(p_external_organization_ids) NOT BETWEEN 1 AND 200
       OR p_provider_code IS NULL
       OR lower(btrim(p_provider_code)) !~ '^[a-z][a-z0-9_.-]{1,62}$'
    THEN
        RETURN;
    END IF;

    RETURN QUERY
    SELECT
        projection.id,
        projection.tenant_id,
        projection.realm_key,
        projection.external_organization_id,
        projection.organization_alias,
        projection.organization_name,
        projection.source_version,
        projection.source_hash,
        projection.effective_from,
        projection.effective_until,
        COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'scope_target_id', ceiling.scope_target_id,
                    'ceiling_mode', ceiling.ceiling_mode,
                    'network_role_ceiling', ceiling.network_role_ceiling
                ) ORDER BY ceiling.scope_target_id
            ) FILTER (WHERE ceiling.id IS NOT NULL),
            '[]'::jsonb
        )
    FROM authz.application_projection AS projection
    JOIN authz.projection_provider AS provider
      ON provider.tenant_id = projection.tenant_id
     AND provider.projection_id = projection.id
     AND provider.provider_code = lower(btrim(p_provider_code))
     AND provider.status = 'active'
    LEFT JOIN authz.projection_scope AS ceiling
      ON ceiling.tenant_id = projection.tenant_id
     AND ceiling.projection_id = projection.id
     AND ceiling.status = 'active'
     AND ceiling.effective_from <= statement_timestamp()
     AND (ceiling.effective_until IS NULL OR ceiling.effective_until > statement_timestamp())
    WHERE projection.realm_key = lower(btrim(p_realm_key))
      AND projection.external_organization_id = ANY(p_external_organization_ids)
      AND projection.status = 'active'
      AND projection.effective_from <= statement_timestamp()
      AND (projection.effective_until IS NULL OR projection.effective_until > statement_timestamp())
    GROUP BY projection.id
    HAVING count(ceiling.id) > 0
    ORDER BY projection.external_organization_id, projection.id;
END;
$$;

COMMENT ON FUNCTION authz.fn_resolve_active_application_projections(text,text[],text) IS
  'Fail-closed cross-tenant IAM admission lookup by immutable organization coordinate. Returns active provider-bound projections with their effective scope ceilings.';

CREATE OR REPLACE FUNCTION authz.trg_normalize_entity_operation_binding()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,authz AS $$ BEGIN
    NEW.plane_code:=lower(btrim(NEW.plane_code));
    NEW.entity_code:=lower(btrim(NEW.entity_code));
    NEW.operation_key:=lower(btrim(NEW.operation_key));
    RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION authz.trg_validate_entity_operation_binding()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,authz AS $$
DECLARE v_database_plane text:=current_setting('app.database_plane',true);
BEGIN
    IF v_database_plane IS NULL OR v_database_plane NOT IN ('studio','neon','mesh') OR NEW.plane_code<>v_database_plane THEN
      RAISE EXCEPTION 'Entity-operation binding plane % does not match database plane %',NEW.plane_code,coalesce(v_database_plane,'unset') USING ERRCODE='check_violation';
    END IF;
    IF NEW.status='published' AND NOT EXISTS(
      SELECT 1 FROM authz.permission p WHERE p.id=NEW.permission_id
       AND p.permission_kind IN ('entity_operation','capability') AND p.status='published') THEN
      RAISE EXCEPTION 'Published entity-operation binding requires a published operation permission' USING ERRCODE='check_violation';
    END IF;
    RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION authz.trg_guard_entity_operation_binding()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,authz AS $$ BEGIN
    IF OLD.status='retired' AND NOT (current_setting('authz.rollback_restore',true)='on' AND NEW.status='published') THEN
      RAISE EXCEPTION 'Retired entity-operation bindings are immutable' USING ERRCODE='55000';
    END IF;
    IF OLD.status='published' AND (
       ROW(NEW.id,NEW.tenant_id,NEW.applied_release_id,NEW.plane_code,NEW.source_entity_id,
           NEW.source_entity_operation_id,NEW.source_release_id,NEW.source_release_hash,
           NEW.source_compiled_hash,NEW.entity_code,NEW.operation_key,NEW.permission_id,
           NEW.decision_mode,NEW.effective_from,NEW.published_at,NEW.published_by,NEW.created_at,NEW.created_by)
       IS DISTINCT FROM
       ROW(OLD.id,OLD.tenant_id,OLD.applied_release_id,OLD.plane_code,OLD.source_entity_id,
           OLD.source_entity_operation_id,OLD.source_release_id,OLD.source_release_hash,
           OLD.source_compiled_hash,OLD.entity_code,OLD.operation_key,OLD.permission_id,
           OLD.decision_mode,OLD.effective_from,OLD.published_at,OLD.published_by,OLD.created_at,OLD.created_by)
       OR NEW.status<>'retired' OR NEW.effective_until IS NULL OR NEW.retired_at IS NULL OR NEW.retired_by IS NULL) THEN
      RAISE EXCEPTION 'Published entity-operation bindings may only transition to retired' USING ERRCODE='55000';
    ELSIF OLD.status='draft' AND NEW.status NOT IN ('draft','published') THEN
      RAISE EXCEPTION 'Draft entity-operation binding may only remain draft or publish' USING ERRCODE='check_violation';
    END IF;
    RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION authz.trg_guard_entity_operation_binding_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,authz AS $$ BEGIN
    IF OLD.status<>'draft' THEN RAISE EXCEPTION 'Published or retired entity-operation bindings cannot be deleted' USING ERRCODE='55000'; END IF;
    RETURN OLD;
END; $$;

CREATE OR REPLACE FUNCTION authz.trg_normalize_entity_operation_scope_binding()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,authz AS $$ BEGIN
    NEW.coordinate_key:=nullif(lower(btrim(NEW.coordinate_key)),'');
    NEW.resolver_key:=nullif(lower(btrim(NEW.resolver_key)),'');
    RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION authz.trg_guard_entity_operation_scope_binding()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,authz AS $$
DECLARE v_status authz.operation_scope_binding_status_d;
BEGIN
    SELECT status INTO v_status FROM authz.entity_operation_binding WHERE id=OLD.entity_operation_binding_id;
    IF v_status<>'draft' THEN RAISE EXCEPTION 'Scope rows of published or retired operation bindings are immutable' USING ERRCODE='55000'; END IF;
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END; $$;

CREATE OR REPLACE FUNCTION authz.fn_stage_entity_operation_projection(
    p_applied_release_id uuid,p_tenant_id uuid,p_plane_code text,p_source_release_id uuid,
    p_source_compiled_hash text,p_compiled_json jsonb
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,authz,runtime_meta AS $$
DECLARE v_bindings jsonb:=COALESCE(p_compiled_json->'operation_scope_bindings','[]'::jsonb);
DECLARE v_source_entity_id uuid:=NULLIF(p_compiled_json#>>'{source,entity_id}','')::uuid;
DECLARE v_release_hash text:=p_compiled_json#>>'{source,release_hash}';
DECLARE v_actor uuid:=COALESCE(NULLIF(current_setting('app.current_principal_id',true),'')::uuid,'00000000-0000-0000-0000-000000000000'::uuid);
DECLARE v_expected integer; DECLARE v_actual integer;
BEGIN
    IF jsonb_typeof(v_bindings)<>'array' THEN RAISE EXCEPTION 'OPERATION_BINDINGS_SHAPE_INVALID' USING ERRCODE='check_violation'; END IF;
    IF jsonb_array_length(v_bindings)=0 THEN RETURN 0; END IF;
    IF v_source_entity_id IS NULL OR v_release_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'OPERATION_BINDINGS_SOURCE_INVALID' USING ERRCODE='check_violation'; END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_bindings) item
      WHERE item->>'permissionCode' LIKE 'legacy.%'
         OR array_length(string_to_array(item->>'permissionCode','.'),1)<>4
         OR split_part(item->>'permissionCode','.',1)<>lower(p_plane_code)
         OR split_part(item->>'permissionCode','.',2)='action'
         OR split_part(item->>'permissionCode','.',3)='action'
         OR COALESCE(item->>'permissionId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         OR COALESCE(item->>'bindingId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
         OR COALESCE(item->>'scopeBindingId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$') THEN
      RAISE EXCEPTION 'OPERATION_BINDING_CANONICAL_PERMISSION_REQUIRED' USING ERRCODE='check_violation';
    END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_bindings) item
      GROUP BY item->>'sourceEntityOperationId'
      HAVING count(DISTINCT (item->>'permissionId',item->>'permissionCode'))<>1) THEN
      RAISE EXCEPTION 'OPERATION_BINDING_PERMISSION_AMBIGUOUS' USING ERRCODE='check_violation';
    END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_bindings) item
      GROUP BY item->>'sourceEntityOperationId',item->>'scopeKind' HAVING count(*)<>1) THEN
      RAISE EXCEPTION 'OPERATION_SCOPE_COORDINATE_AMBIGUOUS' USING ERRCODE='check_violation';
    END IF;
    SELECT count(DISTINCT item->>'sourceEntityOperationId') INTO v_expected FROM jsonb_array_elements(v_bindings) item;
    SELECT count(*) INTO v_actual FROM authz.entity_operation_binding WHERE applied_release_id=p_applied_release_id;
    IF v_actual>0 THEN
      IF v_actual=v_expected AND (SELECT count(*) FROM authz.entity_operation_scope_binding s
          JOIN authz.entity_operation_binding b ON b.id=s.entity_operation_binding_id
          WHERE b.applied_release_id=p_applied_release_id)=jsonb_array_length(v_bindings) THEN
        RETURN v_actual;
      END IF;
      RAISE EXCEPTION 'OPERATION_PROJECTION_IDEMPOTENCY_CONFLICT' USING ERRCODE='unique_violation';
    END IF;
    IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_bindings) item
      LEFT JOIN authz.permission p ON p.canonical_code=item->>'permissionCode' AND p.status='published'
        AND p.id=(item->>'permissionId')::uuid
      WHERE p.id IS NULL OR p.permission_kind::text<>COALESCE(item->>'permissionKind','entity_operation')) THEN
      RAISE EXCEPTION 'OPERATION_BINDING_PERMISSION_UNRESOLVED' USING ERRCODE='foreign_key_violation';
    END IF;
    INSERT INTO authz.entity_operation_binding(
      id,tenant_id,applied_release_id,plane_code,source_entity_id,source_entity_operation_id,
      source_release_id,source_release_hash,source_compiled_hash,entity_code,operation_key,
      permission_id,decision_mode,created_by)
    -- Descriptor IDs identify source bindings; projection rows belong to one applied release.
    SELECT DISTINCT ON (item->>'sourceEntityOperationId') md5(p_applied_release_id::text||':operation:'||(item->>'bindingId'))::uuid,p_tenant_id,p_applied_release_id,lower(p_plane_code),
      v_source_entity_id,(item->>'sourceEntityOperationId')::uuid,p_source_release_id,v_release_hash,
      p_source_compiled_hash,item->>'entityCode',item->>'operationKey',p.id,
      (item->>'decisionMode')::authz.operation_decision_mode_d,v_actor
    FROM jsonb_array_elements(v_bindings) item JOIN authz.permission p
      ON p.canonical_code=item->>'permissionCode' AND p.id=(item->>'permissionId')::uuid
    ORDER BY item->>'sourceEntityOperationId',item->>'scopeKind';
    GET DIAGNOSTICS v_actual=ROW_COUNT;
    IF v_actual<>v_expected THEN RAISE EXCEPTION 'OPERATION_BINDING_STAGE_COUNT_MISMATCH' USING ERRCODE='check_violation'; END IF;
    INSERT INTO authz.entity_operation_scope_binding(
      id,entity_operation_binding_id,scope_kind,coordinate_source,coordinate_key,resolver_key,created_by)
    SELECT md5(p_applied_release_id::text||':scope:'||(item->>'scopeBindingId'))::uuid,b.id,(item->>'scopeKind')::authz.scope_kind_d,
      (item->>'coordinateSource')::authz.scope_coordinate_source_d,item->>'coordinateKey',item->>'resolverKey',v_actor
    FROM jsonb_array_elements(v_bindings) item
    JOIN authz.entity_operation_binding b ON b.applied_release_id=p_applied_release_id
      AND b.tenant_id IS NOT DISTINCT FROM p_tenant_id
      AND b.source_entity_operation_id=(item->>'sourceEntityOperationId')::uuid;
    IF (SELECT count(*) FROM authz.entity_operation_scope_binding s JOIN authz.entity_operation_binding b ON b.id=s.entity_operation_binding_id WHERE b.applied_release_id=p_applied_release_id)<>jsonb_array_length(v_bindings) THEN
      RAISE EXCEPTION 'OPERATION_SCOPE_STAGE_COUNT_MISMATCH' USING ERRCODE='check_violation';
    END IF;
    RETURN v_actual;
END; $$;

CREATE OR REPLACE FUNCTION authz.fn_activate_entity_operation_projection(p_applied_release_id uuid,p_at timestamptz)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,authz AS $$
DECLARE v_actor uuid:=COALESCE(NULLIF(current_setting('app.current_principal_id',true),'')::uuid,'00000000-0000-0000-0000-000000000000'::uuid); DECLARE v_count integer;
BEGIN
  UPDATE authz.entity_operation_binding SET status='published',effective_from=p_at,published_at=p_at,published_by=v_actor
   WHERE applied_release_id=p_applied_release_id AND status='draft'; GET DIAGNOSTICS v_count=ROW_COUNT; RETURN v_count;
END; $$;

CREATE OR REPLACE FUNCTION authz.fn_retire_entity_operation_projection(p_applied_release_id uuid,p_at timestamptz)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,authz AS $$
DECLARE v_actor uuid:=COALESCE(NULLIF(current_setting('app.current_principal_id',true),'')::uuid,'00000000-0000-0000-0000-000000000000'::uuid); DECLARE v_count integer;
BEGIN
  UPDATE authz.entity_operation_binding SET status='retired',effective_until=LEAST(COALESCE(effective_until,p_at),p_at),retired_at=p_at,retired_by=v_actor,updated_at=p_at,updated_by=v_actor
   WHERE applied_release_id=p_applied_release_id AND status='published'; GET DIAGNOSTICS v_count=ROW_COUNT; RETURN v_count;
END; $$;

CREATE OR REPLACE FUNCTION authz.fn_restore_entity_operation_projection(p_applied_release_id uuid,p_at timestamptz)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,authz AS $$
BEGIN
  -- Historical rows do not record whether retirement came from publication,
  -- revocation or expiry. Never infer permission to republish from that state.
  -- Recover through a reviewed successor compiled against the current head.
  IF EXISTS (SELECT 1 FROM authz.entity_operation_binding
             WHERE applied_release_id=p_applied_release_id) THEN
    RAISE EXCEPTION 'BINDING_RECOVERY_SUCCESSOR_REQUIRED' USING ERRCODE='check_violation';
  END IF;
  RETURN 0;
END; $$;

REVOKE athyper_projection_owner FROM CURRENT_USER;
