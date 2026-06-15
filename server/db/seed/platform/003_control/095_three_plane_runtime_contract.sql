-- ============================================================================
-- Three-plane runtime contract.
--
-- Development-stage consolidation for cross-plane permission and capability
-- gates that used to live in several tiny tail patch files.
--
-- Keep shared/control permission vocabulary, entity-operation normalization,
-- lifecycle-state edit/delete masks, and cross-plane entity tags together so a
-- developer can review runtime access behavior from one file after a reset.
--
-- Run after: 044_entity_operation.sql, shared permission model seeds.
-- ============================================================================

-- 1. Canonical permission aliases.
INSERT INTO control.permission_alias
    (canonical_code, alias_code, hard_fail_after, notes, created_by)
VALUES
    ('update', 'edit', NULL,
     'D6: collapsed `edit` into `update`. Warn-first; hard_fail_after will be set when CI gate (verify-permission-aliases.ts) lands.',
     '00000000-0000-0000-0000-000000000000'::uuid)
ON CONFLICT (alias_code) DO UPDATE
SET canonical_code = EXCLUDED.canonical_code,
    hard_fail_after = EXCLUDED.hard_fail_after,
    notes = EXCLUDED.notes;

-- 2. Normalize operation permission codes to the canonical action.
DO $$
DECLARE
    v_renamed integer := 0;
    v_dropped integer := 0;
BEGIN
    WITH dups AS (
        DELETE FROM control.entity_operation eo
         WHERE eo.permission_code = 'edit'
           AND EXISTS (
               SELECT 1
                 FROM control.entity_operation x
                WHERE COALESCE(x.tenant_id::text, '') = COALESCE(eo.tenant_id::text, '')
                  AND x.entity_name = eo.entity_name
                  AND x.permission_code = 'update'
           )
        RETURNING 1
    )
    SELECT count(*) INTO v_dropped FROM dups;

    UPDATE control.entity_operation
       SET permission_code = 'update'
     WHERE permission_code = 'edit';
    GET DIAGNOSTICS v_renamed = ROW_COUNT;

    RAISE NOTICE 'three-plane permission normalization: % edit rows renamed to update, % duplicates dropped',
        v_renamed, v_dropped;
END $$;

-- 3. Mesh-plane permission category and codes.
INSERT INTO shared.permission_category (code, name, sort_order, created_by)
VALUES
    ('mesh_collaboration', 'Mesh Collaboration', 110,
     '00000000-0000-0000-0000-000000000000'::uuid)
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = '00000000-0000-0000-0000-000000000000'::uuid;

INSERT INTO shared.permission (
    code,
    name,
    category_id,
    scope_type,
    risk_level,
    is_plan_restricted,
    plane_eligibility,
    sort_order,
    created_by
)
SELECT v.code,
       v.name,
       c.id,
       v.scope_type,
       v.risk_level,
       false,
       ARRAY['mesh']::text[],
       v.sort_order,
       '00000000-0000-0000-0000-000000000000'::uuid
  FROM shared.permission_category c
  JOIN (VALUES
    ('MESH.BUYER.VIEW', 'View Buyer', 'record', 'low', 10),
    ('MESH.BUYER.CONNECT', 'Connect Buyer', 'record', 'medium', 20),
    ('MESH.BUYER.RESPOND', 'Respond as Buyer', 'record', 'medium', 30),
    ('MESH.BUYER.MANAGE', 'Manage Buyer', 'tenant', 'high', 40),
    ('MESH.PARTNER.VIEW', 'View Partner', 'record', 'low', 50),
    ('MESH.PARTNER.RESPOND', 'Respond as Partner', 'record', 'medium', 60),
    ('MESH.PARTNER.MANAGE', 'Manage Partner', 'tenant', 'high', 70)
  ) AS v(code, name, scope_type, risk_level, sort_order)
    ON c.code = 'mesh_collaboration'
ON CONFLICT (code) DO UPDATE
SET name = EXCLUDED.name,
    category_id = EXCLUDED.category_id,
    scope_type = EXCLUDED.scope_type,
    risk_level = EXCLUDED.risk_level,
    is_plan_restricted = EXCLUDED.is_plan_restricted,
    plane_eligibility = EXCLUDED.plane_eligibility,
    sort_order = EXCLUDED.sort_order,
    updated_at = now(),
    updated_by = '00000000-0000-0000-0000-000000000000'::uuid;

-- 4. Record status capability masks.
INSERT INTO control.entity_lifecycle_state_mask (
    tenant_id,
    entity_name,
    record_status,
    can_edit,
    can_delete,
    disabled_reason,
    created_by
)
VALUES
    (NULL, 'journal_entry', 'posted', false, false, 'posted_locked',
        '00000000-0000-0000-0000-000000000000'::uuid),
    (NULL, 'journal_entry', 'reversed', false, false, 'reversed_immutable',
        '00000000-0000-0000-0000-000000000000'::uuid),

    (NULL, 'purchase_invoice', 'matched', false, true, 'matched_lock',
        '00000000-0000-0000-0000-000000000000'::uuid),
    (NULL, 'purchase_invoice', 'posted', false, false, 'posted_locked',
        '00000000-0000-0000-0000-000000000000'::uuid),
    (NULL, 'purchase_invoice', 'cancelled', false, false, 'cancelled_immutable',
        '00000000-0000-0000-0000-000000000000'::uuid),

    (NULL, 'purchase_order', 'cancelled', false, false, 'cancelled_immutable',
        '00000000-0000-0000-0000-000000000000'::uuid),
    (NULL, 'purchase_order', 'closed', false, true, 'closed_lock',
        '00000000-0000-0000-0000-000000000000'::uuid),

    (NULL, 'payment_entry', 'posted', false, false, 'posted_locked',
        '00000000-0000-0000-0000-000000000000'::uuid),
    (NULL, 'payment_entry', 'reversed', false, false, 'reversed_immutable',
        '00000000-0000-0000-0000-000000000000'::uuid),

    (NULL, 'supplier', 'archived', false, false, 'archived_immutable',
        '00000000-0000-0000-0000-000000000000'::uuid),
    (NULL, 'supplier', 'blocked', true, false, 'blocked_no_delete',
        '00000000-0000-0000-0000-000000000000'::uuid),

    (NULL, 'fiscal_period', 'closed', false, false, 'period_closed',
        '00000000-0000-0000-0000-000000000000'::uuid),
    (NULL, 'fiscal_period', 'frozen', false, false, 'period_frozen',
        '00000000-0000-0000-0000-000000000000'::uuid)
ON CONFLICT (tenant_id, entity_name, record_status) DO UPDATE
SET can_edit = EXCLUDED.can_edit,
    can_delete = EXCLUDED.can_delete,
    disabled_reason = EXCLUDED.disabled_reason,
    updated_at = now(),
    updated_by = '00000000-0000-0000-0000-000000000000'::uuid;

-- 5. Cross-plane entity tags for business documents visible to mesh partners.
UPDATE control.entity
   SET plane_eligibility = ARRAY(
           SELECT DISTINCT plane
             FROM unnest(COALESCE(plane_eligibility, ARRAY[]::text[]) || ARRAY['mesh']::text[]) AS t(plane)
            ORDER BY plane
       ),
       updated_at = now(),
       updated_by = '00000000-0000-0000-0000-000000000000'
 WHERE tenant_id IS NULL
   AND entity_code IN (
       'purchase_invoice',
       'purchase_order',
       'sales_invoice',
       'sales_order',
       'goods_receipt_note'
   )
   AND NOT (COALESCE(plane_eligibility, ARRAY[]::text[]) @> ARRAY['mesh']::text[]);

-- 6. Development assertions.
DO $$
DECLARE
    v_count integer;
BEGIN
    SELECT count(*) INTO v_count
      FROM control.permission_alias
     WHERE alias_code = 'edit'
       AND canonical_code = 'update';
    IF v_count <> 1 THEN
        RAISE EXCEPTION '[three_plane_runtime_contract] expected edit -> update permission alias, got %', v_count;
    END IF;

    SELECT count(*) INTO v_count
      FROM control.entity_operation
     WHERE permission_code = 'edit';
    IF v_count <> 0 THEN
        RAISE EXCEPTION '[three_plane_runtime_contract] expected no entity_operation edit permission rows, got %', v_count;
    END IF;

    SELECT count(*) INTO v_count
      FROM shared.permission
     WHERE code IN (
           'MESH.BUYER.VIEW',
           'MESH.BUYER.CONNECT',
           'MESH.BUYER.RESPOND',
           'MESH.BUYER.MANAGE',
           'MESH.PARTNER.VIEW',
           'MESH.PARTNER.RESPOND',
           'MESH.PARTNER.MANAGE'
       )
       AND plane_eligibility @> ARRAY['mesh']::text[];
    IF v_count < 7 THEN
        RAISE EXCEPTION '[three_plane_runtime_contract] expected all 7 mesh permission rows, got %', v_count;
    END IF;

    SELECT count(*) INTO v_count
      FROM control.entity_lifecycle_state_mask
     WHERE tenant_id IS NULL;
    IF v_count < 13 THEN
        RAISE EXCEPTION '[three_plane_runtime_contract] expected at least 13 platform lifecycle masks, got %', v_count;
    END IF;
END $$;
