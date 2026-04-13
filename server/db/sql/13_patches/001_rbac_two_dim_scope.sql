-- =============================================================================
-- 13_patches/001_rbac_two_dim_scope.sql
-- =============================================================================
-- RBAC Two-Dimension Scope Model — live database migration
--
-- Context:  Local development only. No production/staging data to preserve.
-- Purpose:  Replace the single-column scope model (scope + ou_scope_id) with
--           a proper two-dimension model:
--             dimension 1 — visibility_scope  (all | own | team)        row-level filter
--             dimension 2 — assignment_scope  (tenant | company_code | legal_entity)  org boundary
--
-- Tables altered:
--   master.auth_group_role        — scope→visibility_scope, ou_scope_id→assignment_scope_*
--   master.access_grant      — scope→visibility_scope, ou_scope_id→assignment_scope_*
--   master.company_code_access — drop inline CHECK (replaced by lookup-backed trigger)
--
-- Safe to re-run: all ALTER TABLE steps use IF EXISTS / IF NOT EXISTS guards.
-- Run BEFORE applying the updated DDL source files (functions/triggers/indexes).
-- =============================================================================

BEGIN;

-- ═════════════════════════════════════════════════════════════════════════════
-- §1  master.auth_group_role
-- ═════════════════════════════════════════════════════════════════════════════

-- 1a. Add new columns (idempotent)
ALTER TABLE master.auth_group_role
    ADD COLUMN IF NOT EXISTS visibility_scope       text,
    ADD COLUMN IF NOT EXISTS assignment_scope_type  text NOT NULL DEFAULT 'tenant',
    ADD COLUMN IF NOT EXISTS assignment_scope_ref_id uuid,
    ADD COLUMN IF NOT EXISTS include_descendants    boolean NOT NULL DEFAULT true;

-- 1b. Migrate data from old columns to new columns
--   Old model (live DB):  scope IN ('all','own','team','ou_l1') + company_code_id (nullable UUID)
--   New model:  visibility_scope + assignment_scope_type + assignment_scope_ref_id
--
--   Mapping rules:
--     scope = 'all'/'own'/'team' + company_code_id IS NULL → visibility_scope=scope, type='tenant'
--     scope = 'ou_l1'            + company_code_id IS NOT NULL → visibility_scope='all', type='company_code', ref=company_code_id
--     scope = anything           + company_code_id IS NOT NULL → visibility_scope=scope, type='company_code', ref=company_code_id

UPDATE master.auth_group_role
SET
    visibility_scope = CASE
        WHEN scope = 'ou_l1' THEN 'all'
        WHEN scope IN ('all','own','team') THEN scope
        ELSE 'all'  -- fallback for any unexpected value
    END,
    assignment_scope_type = CASE
        WHEN company_code_id IS NOT NULL THEN 'company_code'
        ELSE 'tenant'
    END,
    assignment_scope_ref_id = company_code_id
WHERE visibility_scope IS NULL;  -- only migrate rows not yet migrated

-- 1c. Make visibility_scope NOT NULL now that all rows are populated
ALTER TABLE master.auth_group_role ALTER COLUMN visibility_scope SET NOT NULL;

-- 1d. Drop old constraints
ALTER TABLE master.auth_group_role DROP CONSTRAINT IF EXISTS agr_scope_chk;
ALTER TABLE master.auth_group_role DROP CONSTRAINT IF EXISTS auth_group_role_uq;
ALTER TABLE master.auth_group_role DROP CONSTRAINT IF EXISTS auth_group_role_cc_fk;

-- 1e. Drop old columns
ALTER TABLE master.auth_group_role DROP COLUMN IF EXISTS scope;
ALTER TABLE master.auth_group_role DROP COLUMN IF EXISTS company_code_id;

-- 1f. Remove the DEFAULT from assignment_scope_type (it's set explicitly on insert)
ALTER TABLE master.auth_group_role ALTER COLUMN assignment_scope_type DROP DEFAULT;

-- 1g. Add new constraints
DO $$ BEGIN
    ALTER TABLE master.auth_group_role
        ADD CONSTRAINT agr_visibility_scope_chk
        CHECK (visibility_scope IN ('all', 'own', 'team'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE master.auth_group_role
        ADD CONSTRAINT agr_assignment_scope_chk
        CHECK (assignment_scope_type IN ('tenant', 'company_code', 'legal_entity'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE master.auth_group_role
        ADD CONSTRAINT agr_assignment_ref_chk
        CHECK (
            (assignment_scope_type = 'tenant'        AND assignment_scope_ref_id IS NULL)
         OR (assignment_scope_type = 'company_code'  AND assignment_scope_ref_id IS NOT NULL)
         OR (assignment_scope_type = 'legal_entity'  AND assignment_scope_ref_id IS NOT NULL)
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE master.auth_group_role
        ADD CONSTRAINT agr_descendants_chk
        CHECK (
            assignment_scope_type = 'legal_entity'
            OR include_descendants = true
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1h. Add new wider unique constraint (NULLS NOT DISTINCT: each scope combo is distinct)
DO $$ BEGIN
    ALTER TABLE master.auth_group_role
        ADD CONSTRAINT auth_group_role_uq
        UNIQUE NULLS NOT DISTINCT (
            tenant_id, group_id, role_id,
            assignment_scope_type, assignment_scope_ref_id, include_descendants
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1i. New assignment-scope indexes (IF NOT EXISTS — safe re-run)
CREATE INDEX IF NOT EXISTS agr_assignment_scope_idx
    ON master.auth_group_role (tenant_id, assignment_scope_type, assignment_scope_ref_id)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS agr_assignment_le_idx
    ON master.auth_group_role (tenant_id, assignment_scope_ref_id)
    WHERE assignment_scope_type = 'legal_entity' AND status = 'active';

CREATE INDEX IF NOT EXISTS agr_assignment_cc_idx
    ON master.auth_group_role (tenant_id, assignment_scope_ref_id)
    WHERE assignment_scope_type = 'company_code' AND status = 'active';


-- ═════════════════════════════════════════════════════════════════════════════
-- §2  master.access_grant
-- ═════════════════════════════════════════════════════════════════════════════

-- 2a. Add new columns (idempotent)
ALTER TABLE master.access_grant
    ADD COLUMN IF NOT EXISTS visibility_scope       text,
    ADD COLUMN IF NOT EXISTS assignment_scope_type  text,
    ADD COLUMN IF NOT EXISTS assignment_scope_ref_id uuid;

-- 2b. Migrate data
--   Old (live DB): scope (nullable text), ou_scope_id (nullable UUID — was the CC FK for access_grant)
--   New: visibility_scope (nullable), assignment_scope_type (nullable), assignment_scope_ref_id
UPDATE master.access_grant
SET
    visibility_scope = scope,
    assignment_scope_type = CASE
        WHEN ou_scope_id IS NOT NULL THEN 'company_code'
        ELSE NULL
    END,
    assignment_scope_ref_id = ou_scope_id
WHERE visibility_scope IS NULL AND (scope IS NOT NULL OR ou_scope_id IS NOT NULL);

-- 2c. Drop old constraints
DO $$ BEGIN
    ALTER TABLE master.access_grant DROP CONSTRAINT IF EXISTS ag_scope_chk;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

ALTER TABLE master.access_grant DROP CONSTRAINT IF EXISTS ag_cc_fk;

-- 2d. Drop old columns
ALTER TABLE master.access_grant DROP COLUMN IF EXISTS scope;
ALTER TABLE master.access_grant DROP COLUMN IF EXISTS ou_scope_id;

-- 2e. Add new constraints
DO $$ BEGIN
    ALTER TABLE master.access_grant
        ADD CONSTRAINT ag_visibility_scope_chk
        CHECK (visibility_scope IS NULL OR visibility_scope IN ('all', 'own', 'team'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE master.access_grant
        ADD CONSTRAINT ag_assignment_scope_chk
        CHECK (
            assignment_scope_type IS NULL
         OR assignment_scope_type IN ('tenant', 'company_code', 'legal_entity')
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    ALTER TABLE master.access_grant
        ADD CONSTRAINT ag_assignment_ref_chk
        CHECK (
            assignment_scope_type IS NULL
         OR (assignment_scope_type = 'tenant'        AND assignment_scope_ref_id IS NULL)
         OR (assignment_scope_type = 'company_code'  AND assignment_scope_ref_id IS NOT NULL)
         OR (assignment_scope_type = 'legal_entity'  AND assignment_scope_ref_id IS NOT NULL)
        );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2f. New assignment-scope indexes for resolver performance
CREATE INDEX IF NOT EXISTS ag_assignment_scope_idx
    ON master.access_grant (tenant_id, permission_id, assignment_scope_type)
    WHERE status = 'active' AND effect = 'allow';

CREATE INDEX IF NOT EXISTS ag_assignment_cc_idx
    ON master.access_grant (tenant_id, permission_id, assignment_scope_ref_id)
    WHERE assignment_scope_type = 'company_code' AND status = 'active' AND effect = 'allow';

CREATE INDEX IF NOT EXISTS ag_assignment_le_idx
    ON master.access_grant (tenant_id, permission_id, assignment_scope_ref_id)
    WHERE assignment_scope_type = 'legal_entity' AND status = 'active' AND effect = 'allow';


-- ═════════════════════════════════════════════════════════════════════════════
-- §3  master.company_code_access — drop old inline CHECK
-- ═════════════════════════════════════════════════════════════════════════════
-- Validation now handled by trg_cca_entity_type_lookup trigger
-- backed by lookup domain master.company_code_access_entity_type.

ALTER TABLE master.company_code_access DROP CONSTRAINT IF EXISTS cca_entity_type_chk;


-- ═════════════════════════════════════════════════════════════════════════════
-- §4  fn_resolve_le_subtree_companies (new helper for RBAC scope resolution)
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION master.fn_resolve_le_subtree_companies(
    p_tenant_id       uuid,
    p_legal_entity_id uuid
) RETURNS TABLE (company_code_id uuid)
LANGUAGE sql STABLE PARALLEL SAFE
SET search_path = master, pg_catalog
AS $$
    WITH RECURSIVE le_tree AS (
        SELECT le.id
        FROM master.legal_entity le
        WHERE le.id        = p_legal_entity_id
          AND le.tenant_id = p_tenant_id
          AND le.is_active = true
        UNION ALL
        SELECT child.id
        FROM master.legal_entity child
        INNER JOIN le_tree parent ON child.parent_entity_id = parent.id
        WHERE child.tenant_id = p_tenant_id
          AND child.is_active = true
    )
    SELECT cc.id
    FROM master.company_code cc
    INNER JOIN le_tree ON cc.legal_entity_id = le_tree.id
    WHERE cc.tenant_id = p_tenant_id
      AND cc.is_active = true;
$$;

COMMENT ON FUNCTION master.fn_resolve_le_subtree_companies IS
    'Resolves a legal_entity_id to all company_code_ids in its full descendant subtree. '
    'Recursive CTE walks master.legal_entity.parent_entity_id from the anchor LE down. '
    'Used by resolve_allowed_companies() for RBAC assignment-scope evaluation.';


-- ═════════════════════════════════════════════════════════════════════════════
-- §5  derive_effective_roles — replace (signature changed)
-- ═════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS master.derive_effective_roles(uuid, uuid);

CREATE OR REPLACE FUNCTION master.derive_effective_roles(
    p_tenant_id    uuid,
    p_principal_id uuid
) RETURNS TABLE (
    role_id                    uuid,
    visibility_scope           text,
    assignment_scope_type      text,
    assignment_scope_ref_id    uuid,
    include_descendants        boolean,
    source_group               uuid
) LANGUAGE sql STABLE PARALLEL SAFE
SET search_path = master, pg_catalog
AS $$
    SELECT
        gr.role_id,
        gr.visibility_scope,
        gr.assignment_scope_type,
        gr.assignment_scope_ref_id,
        gr.include_descendants,
        pgm.group_id AS source_group
    FROM master.auth_group_member pgm
    JOIN master.auth_group_role gr
        ON gr.group_id  = pgm.group_id
       AND gr.tenant_id = pgm.tenant_id
       AND gr.status    = 'active'
       AND (gr.expires_at IS NULL OR gr.expires_at > now())
    WHERE pgm.tenant_id    = p_tenant_id
      AND pgm.principal_id = p_principal_id;
$$;

COMMENT ON FUNCTION master.derive_effective_roles IS
    'Returns all role assignments with two-dimension scope for a principal. '
    'visibility_scope + assignment_scope_type/ref_id/include_descendants.';


-- ═════════════════════════════════════════════════════════════════════════════
-- §6  resolve_allowed_companies — replaces get_effective_scope
-- ═════════════════════════════════════════════════════════════════════════════

DROP FUNCTION IF EXISTS master.get_effective_scope(uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION master.resolve_allowed_companies(
    p_tenant_id     uuid,
    p_principal_id  uuid,
    p_permission_id uuid
) RETURNS TABLE (company_code_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = master, shared, pg_catalog
AS $$
BEGIN
    -- Deny gate: if principal has an explicit deny, return nothing
    IF EXISTS (
        SELECT 1 FROM master.access_grant ag
        WHERE ag.tenant_id     = p_tenant_id
          AND ag.principal_id  = p_principal_id
          AND ag.permission_id = p_permission_id
          AND ag.effect        = 'deny'
          AND ag.status        = 'active'
          AND (ag.expires_at IS NULL OR ag.expires_at > now())
    ) THEN
        RETURN;
    END IF;

    RETURN QUERY

    -- Source 1: persona_permission → tenant-wide (all CCs)
    SELECT cc.id
    FROM master.company_code cc
    WHERE cc.tenant_id = p_tenant_id AND cc.is_active = true
      AND EXISTS (
          SELECT 1
          FROM master.principal_persona ppa
          JOIN shared.persona_permission pp
              ON pp.persona_id = ppa.persona_id AND pp.permission_id = p_permission_id AND pp.is_granted = true
          WHERE ppa.tenant_id = p_tenant_id AND ppa.principal_id = p_principal_id
            AND (ppa.expires_at IS NULL OR ppa.expires_at > now())
      )

    UNION

    -- Source 2a: auth_group_role — tenant scope
    SELECT cc.id
    FROM master.company_code cc
    WHERE cc.tenant_id = p_tenant_id AND cc.is_active = true
      AND EXISTS (
          SELECT 1
          FROM master.auth_group_member pgm
          JOIN master.auth_group_role gr
              ON gr.group_id = pgm.group_id AND gr.tenant_id = pgm.tenant_id
             AND gr.status = 'active' AND (gr.expires_at IS NULL OR gr.expires_at > now())
          JOIN shared.role r ON r.id = gr.role_id AND r.status = 'active'
          JOIN shared.persona_permission pp ON pp.persona_id = r.persona_id AND pp.permission_id = p_permission_id AND pp.is_granted = true
          WHERE pgm.tenant_id = p_tenant_id AND pgm.principal_id = p_principal_id
            AND gr.assignment_scope_type = 'tenant'
      )

    UNION

    -- Source 2b: auth_group_role — company_code scope
    SELECT gr.assignment_scope_ref_id
    FROM master.auth_group_member pgm
    JOIN master.auth_group_role gr ON gr.group_id = pgm.group_id AND gr.tenant_id = pgm.tenant_id
       AND gr.status = 'active' AND (gr.expires_at IS NULL OR gr.expires_at > now())
    JOIN shared.role r ON r.id = gr.role_id AND r.status = 'active'
    JOIN shared.persona_permission pp ON pp.persona_id = r.persona_id AND pp.permission_id = p_permission_id AND pp.is_granted = true
    WHERE pgm.tenant_id = p_tenant_id AND pgm.principal_id = p_principal_id
      AND gr.assignment_scope_type = 'company_code'

    UNION

    -- Source 2c: auth_group_role — legal_entity with full descendant subtree
    SELECT sub.company_code_id
    FROM master.auth_group_member pgm
    JOIN master.auth_group_role gr ON gr.group_id = pgm.group_id AND gr.tenant_id = pgm.tenant_id
       AND gr.status = 'active' AND (gr.expires_at IS NULL OR gr.expires_at > now())
    JOIN shared.role r ON r.id = gr.role_id AND r.status = 'active'
    JOIN shared.persona_permission pp ON pp.persona_id = r.persona_id AND pp.permission_id = p_permission_id AND pp.is_granted = true
    CROSS JOIN LATERAL master.fn_resolve_le_subtree_companies(p_tenant_id, gr.assignment_scope_ref_id) sub
    WHERE pgm.tenant_id = p_tenant_id AND pgm.principal_id = p_principal_id
      AND gr.assignment_scope_type = 'legal_entity' AND gr.include_descendants = true

    UNION

    -- Source 2d: auth_group_role — legal_entity direct companies only
    SELECT cc.id
    FROM master.auth_group_member pgm
    JOIN master.auth_group_role gr ON gr.group_id = pgm.group_id AND gr.tenant_id = pgm.tenant_id
       AND gr.status = 'active' AND (gr.expires_at IS NULL OR gr.expires_at > now())
    JOIN shared.role r ON r.id = gr.role_id AND r.status = 'active'
    JOIN shared.persona_permission pp ON pp.persona_id = r.persona_id AND pp.permission_id = p_permission_id AND pp.is_granted = true
    JOIN master.company_code cc ON cc.legal_entity_id = gr.assignment_scope_ref_id AND cc.tenant_id = p_tenant_id AND cc.is_active = true
    WHERE pgm.tenant_id = p_tenant_id AND pgm.principal_id = p_principal_id
      AND gr.assignment_scope_type = 'legal_entity' AND gr.include_descendants = false

    UNION

    -- Source 3a: access_grant — tenant scope
    SELECT cc.id
    FROM master.company_code cc
    WHERE cc.tenant_id = p_tenant_id AND cc.is_active = true
      AND EXISTS (
          SELECT 1 FROM master.access_grant ag
          WHERE ag.tenant_id = p_tenant_id AND ag.permission_id = p_permission_id
            AND ag.effect = 'allow' AND ag.status = 'active' AND (ag.expires_at IS NULL OR ag.expires_at > now())
            AND ag.assignment_scope_type = 'tenant'
            AND (ag.principal_id = p_principal_id
              OR ag.group_id IN (SELECT group_id FROM master.auth_group_member WHERE tenant_id = p_tenant_id AND principal_id = p_principal_id)
              OR ag.role_id IN (SELECT gr2.role_id FROM master.auth_group_member pgm2 JOIN master.auth_group_role gr2 ON gr2.group_id = pgm2.group_id AND gr2.tenant_id = pgm2.tenant_id AND gr2.status = 'active' WHERE pgm2.tenant_id = p_tenant_id AND pgm2.principal_id = p_principal_id))
      )

    UNION

    -- Source 3b: access_grant — company_code scope
    SELECT ag.assignment_scope_ref_id
    FROM master.access_grant ag
    WHERE ag.tenant_id = p_tenant_id AND ag.permission_id = p_permission_id
      AND ag.effect = 'allow' AND ag.status = 'active' AND (ag.expires_at IS NULL OR ag.expires_at > now())
      AND ag.assignment_scope_type = 'company_code'
      AND (ag.principal_id = p_principal_id
        OR ag.group_id IN (SELECT group_id FROM master.auth_group_member WHERE tenant_id = p_tenant_id AND principal_id = p_principal_id)
        OR ag.role_id IN (SELECT gr2.role_id FROM master.auth_group_member pgm2 JOIN master.auth_group_role gr2 ON gr2.group_id = pgm2.group_id AND gr2.tenant_id = pgm2.tenant_id AND gr2.status = 'active' WHERE pgm2.tenant_id = p_tenant_id AND pgm2.principal_id = p_principal_id))

    UNION

    -- Source 3c: access_grant — legal_entity (always full subtree)
    SELECT sub.company_code_id
    FROM master.access_grant ag
    CROSS JOIN LATERAL master.fn_resolve_le_subtree_companies(p_tenant_id, ag.assignment_scope_ref_id) sub
    WHERE ag.tenant_id = p_tenant_id AND ag.permission_id = p_permission_id
      AND ag.effect = 'allow' AND ag.status = 'active' AND (ag.expires_at IS NULL OR ag.expires_at > now())
      AND ag.assignment_scope_type = 'legal_entity'
      AND (ag.principal_id = p_principal_id
        OR ag.group_id IN (SELECT group_id FROM master.auth_group_member WHERE tenant_id = p_tenant_id AND principal_id = p_principal_id)
        OR ag.role_id IN (SELECT gr2.role_id FROM master.auth_group_member pgm2 JOIN master.auth_group_role gr2 ON gr2.group_id = pgm2.group_id AND gr2.tenant_id = pgm2.tenant_id AND gr2.status = 'active' WHERE pgm2.tenant_id = p_tenant_id AND pgm2.principal_id = p_principal_id))

    UNION

    -- Source 3d: access_grant — unscoped NULL → all CCs
    SELECT cc.id
    FROM master.company_code cc
    WHERE cc.tenant_id = p_tenant_id AND cc.is_active = true
      AND EXISTS (
          SELECT 1 FROM master.access_grant ag
          WHERE ag.tenant_id = p_tenant_id AND ag.permission_id = p_permission_id
            AND ag.effect = 'allow' AND ag.status = 'active' AND (ag.expires_at IS NULL OR ag.expires_at > now())
            AND ag.assignment_scope_type IS NULL
            AND (ag.principal_id = p_principal_id
              OR ag.group_id IN (SELECT group_id FROM master.auth_group_member WHERE tenant_id = p_tenant_id AND principal_id = p_principal_id)
              OR ag.role_id IN (SELECT gr2.role_id FROM master.auth_group_member pgm2 JOIN master.auth_group_role gr2 ON gr2.group_id = pgm2.group_id AND gr2.tenant_id = pgm2.tenant_id AND gr2.status = 'active' WHERE pgm2.tenant_id = p_tenant_id AND pgm2.principal_id = p_principal_id))
      );
END;
$$;

COMMENT ON FUNCTION master.resolve_allowed_companies IS
    'Returns the full set of allowed company_code_ids for a principal + permission. '
    'Replaces get_effective_scope() which was lossy (LIMIT 1) and conflated both scope dims.';


-- ═════════════════════════════════════════════════════════════════════════════
-- §7  get_effective_visibility_scope (new scalar — row-filter dimension only)
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION master.get_effective_visibility_scope(
    p_tenant_id     uuid,
    p_principal_id  uuid,
    p_permission_id uuid
) RETURNS text
LANGUAGE sql STABLE PARALLEL SAFE
SET search_path = master, shared, pg_catalog
AS $$
    SELECT vs FROM (
        -- Persona → always 'all'
        SELECT 'all'::text AS vs
        FROM master.principal_persona ppa
        JOIN shared.persona_permission pp
            ON pp.persona_id = ppa.persona_id AND pp.permission_id = p_permission_id AND pp.is_granted = true
        WHERE ppa.tenant_id = p_tenant_id AND ppa.principal_id = p_principal_id
          AND (ppa.expires_at IS NULL OR ppa.expires_at > now())

        UNION ALL

        -- Group role
        SELECT gr.visibility_scope AS vs
        FROM master.auth_group_member pgm
        JOIN master.auth_group_role gr ON gr.group_id = pgm.group_id AND gr.tenant_id = pgm.tenant_id
           AND gr.status = 'active' AND (gr.expires_at IS NULL OR gr.expires_at > now())
        JOIN shared.role r ON r.id = gr.role_id AND r.status = 'active'
        JOIN shared.persona_permission pp ON pp.persona_id = r.persona_id AND pp.permission_id = p_permission_id AND pp.is_granted = true
        WHERE pgm.tenant_id = p_tenant_id AND pgm.principal_id = p_principal_id

        UNION ALL

        -- Access grant allows with explicit visibility_scope
        SELECT ag.visibility_scope AS vs
        FROM master.access_grant ag
        WHERE ag.tenant_id = p_tenant_id AND ag.permission_id = p_permission_id
          AND ag.effect = 'allow' AND ag.status = 'active'
          AND (ag.expires_at IS NULL OR ag.expires_at > now())
          AND ag.visibility_scope IS NOT NULL
          AND (ag.principal_id = p_principal_id
            OR ag.group_id IN (SELECT group_id FROM master.auth_group_member WHERE tenant_id = p_tenant_id AND principal_id = p_principal_id)
            OR ag.role_id IN (SELECT gr2.role_id FROM master.auth_group_member pgm2 JOIN master.auth_group_role gr2 ON gr2.group_id = pgm2.group_id AND gr2.tenant_id = pgm2.tenant_id AND gr2.status = 'active' WHERE pgm2.tenant_id = p_tenant_id AND pgm2.principal_id = p_principal_id))
    ) all_scopes
    ORDER BY CASE vs WHEN 'all' THEN 1 WHEN 'team' THEN 2 WHEN 'own' THEN 3 ELSE 4 END
    LIMIT 1;
$$;

COMMENT ON FUNCTION master.get_effective_visibility_scope IS
    'Returns the widest visibility_scope (all > team > own) for a principal + permission. '
    'Row-filtering dimension only. CC boundary handled by resolve_allowed_companies().';


-- ═════════════════════════════════════════════════════════════════════════════
-- §8  trg_validate_assignment_scope — shared trigger function
-- ═════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION master.trg_validate_assignment_scope()
RETURNS trigger LANGUAGE plpgsql STABLE
SET search_path = master, pg_temp
AS $$
DECLARE
    v_source text := coalesce(TG_ARGV[0], TG_TABLE_NAME);
BEGIN
    IF NEW.assignment_scope_type IS NULL THEN
        RETURN NEW;
    END IF;

    CASE NEW.assignment_scope_type
        WHEN 'tenant' THEN
            IF NEW.assignment_scope_ref_id IS NOT NULL THEN
                RAISE EXCEPTION '%: ref_id must be NULL for tenant scope', v_source USING ERRCODE = 'check_violation';
            END IF;

        WHEN 'company_code' THEN
            IF NOT EXISTS (SELECT 1 FROM master.company_code WHERE id = NEW.assignment_scope_ref_id AND tenant_id = NEW.tenant_id) THEN
                RAISE EXCEPTION '%: ref_id % not found in company_code for tenant %',
                    v_source, NEW.assignment_scope_ref_id, NEW.tenant_id USING ERRCODE = 'foreign_key_violation';
            END IF;

        WHEN 'legal_entity' THEN
            IF NOT EXISTS (SELECT 1 FROM master.legal_entity WHERE id = NEW.assignment_scope_ref_id AND tenant_id = NEW.tenant_id) THEN
                RAISE EXCEPTION '%: ref_id % not found in legal_entity for tenant %',
                    v_source, NEW.assignment_scope_ref_id, NEW.tenant_id USING ERRCODE = 'foreign_key_violation';
            END IF;

        ELSE
            RAISE EXCEPTION '%: unknown assignment_scope_type %', v_source, NEW.assignment_scope_type USING ERRCODE = 'check_violation';
    END CASE;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION master.trg_validate_assignment_scope IS
    'Validates assignment_scope_ref_id exists in the target table (company_code or legal_entity) '
    'for the same tenant. Shared by auth_group_role and access_grant.';


-- ═════════════════════════════════════════════════════════════════════════════
-- §9  Trigger bindings (RBAC Phase 6)
-- ═════════════════════════════════════════════════════════════════════════════

-- auth_group_role: validate assignment scope ref on insert/update
DROP TRIGGER IF EXISTS trg_bi_bu_validate_assignment_scope ON master.auth_group_role;
CREATE TRIGGER trg_bi_bu_validate_assignment_scope
    BEFORE INSERT OR UPDATE OF assignment_scope_type, assignment_scope_ref_id
    ON master.auth_group_role
    FOR EACH ROW
    EXECUTE FUNCTION master.trg_validate_assignment_scope('auth_group_role');

-- access_grant: validate assignment scope ref on insert/update
DROP TRIGGER IF EXISTS trg_bi_bu_validate_assignment_scope ON master.access_grant;
CREATE TRIGGER trg_bi_bu_validate_assignment_scope
    BEFORE INSERT OR UPDATE OF assignment_scope_type, assignment_scope_ref_id
    ON master.access_grant
    FOR EACH ROW
    EXECUTE FUNCTION master.trg_validate_assignment_scope('access_grant');

-- company_code_access: entity_type via lookup domain (replaces inline CHECK)
DROP TRIGGER IF EXISTS trg_cca_entity_type_lookup ON master.company_code_access;
CREATE TRIGGER trg_cca_entity_type_lookup
    BEFORE INSERT OR UPDATE OF entity_type ON master.company_code_access
    FOR EACH ROW
    EXECUTE FUNCTION control.trg_validate_lookup_columns(
        'master.company_code_access_entity_type', 'entity_type'
    );


-- ═════════════════════════════════════════════════════════════════════════════
-- §10  Lookup domain + values for company_code_access entity types
-- ═════════════════════════════════════════════════════════════════════════════

INSERT INTO control.lookup_domain
    (code, name, description, source_schema, is_extensible, status, created_by)
SELECT
    'master.company_code_access_entity_type',
    'Company code access entity type',
    'Entity types scoped to company codes via master.company_code_access. '
    'is_extensible=true — tenants may add new entity types without DDL.',
    'master', true, 'active',
    '00000000-0000-0000-0000-000000000000'
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_domain
    WHERE code = 'master.company_code_access_entity_type'
);

INSERT INTO control.lookup_value
    (code, name, domain_code, sort_order, is_system, status, created_by)
SELECT v.code, v.name, v.domain_code, v.sort_order,
       true, 'active', '00000000-0000-0000-0000-000000000000'
FROM (VALUES
    ('supplier',          'Supplier',          'master.company_code_access_entity_type', 10),
    ('customer',          'Customer',          'master.company_code_access_entity_type', 20),
    ('item',              'Item',              'master.company_code_access_entity_type', 30),
    ('chart_of_accounts', 'Chart of accounts', 'master.company_code_access_entity_type', 40),
    ('cost_centre',       'Cost centre',       'master.company_code_access_entity_type', 50),
    ('project',           'Project',           'master.company_code_access_entity_type', 60),
    ('bank_account',      'Bank account',      'master.company_code_access_entity_type', 70)
) AS v(code, name, domain_code, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM control.lookup_value x
    WHERE x.domain_code = v.domain_code AND x.code = v.code AND x.tenant_id IS NULL
);


COMMIT;
