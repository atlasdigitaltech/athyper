-- seed-pack-version: p2.7-v1
-- Canonical seed-owned capability catalog. Role assignment remains a separate
-- authorization-authority concern; this file only makes the exact capabilities
-- addressable and keeps the API fail-closed when an assignment is absent.
DO $seed_metadata_entity_permissions$
DECLARE
    v_actor uuid := '00000000-0000-0000-0000-000000000000'::uuid;
    v_module_id uuid;
BEGIN
    SELECT id INTO v_module_id
      FROM control.module
     WHERE lower(code) = 'meta';

    IF v_module_id IS NULL THEN
        RAISE EXCEPTION '[meta-entity P2.7] prerequisite control.module META is missing';
    END IF;

    INSERT INTO authz.permission (
        id, canonical_code, permission_kind, resource_code, operation_code,
        module_id, risk_tier, requires_mfa, requires_sod, is_shareable,
        is_delegable, is_overridable, provenance_ref, metadata, status,
        status_changed_at, status_changed_by, created_by
    )
    SELECT
        md5('athyper.meta-entity:permission:' || seed.operation_code)::uuid,
        'metadata.entity.' || seed.operation_code,
        'capability',
        'metadata.entity',
        seed.operation_code,
        v_module_id,
        seed.risk_tier::authz.risk_tier_d,
        seed.requires_mfa,
        seed.requires_sod,
        false,
        seed.is_delegable,
        false,
        'athyper.meta-entity@p2.7-v1',
        jsonb_build_object(
            'seed_owner', 'athyper.meta-entity',
            'phase', 'P2.7',
            'scope', 'tenant'
        ),
        'draft',
        NULL,
        NULL,
        v_actor
    FROM (VALUES
        ('view',     'low',      false, false, true),
        ('author',   'medium',   false, false, true),
        ('review',   'high',     false, true,  false),
        ('publish',  'critical', true,  true,  false),
        ('rollback', 'critical', true,  true,  false),
        ('retire',   'critical', true,  true,  false)
    ) AS seed(operation_code, risk_tier, requires_mfa, requires_sod, is_delegable)
    ON CONFLICT (canonical_code) DO NOTHING;

    INSERT INTO authz.permission_scope_policy (
        permission_id, scope_kind, propagation_mode, created_by
    )
    SELECT permission.id, 'tenant', 'exact', v_actor
      FROM authz.permission AS permission
     WHERE permission.canonical_code IN (
        'metadata.entity.view',
        'metadata.entity.author',
        'metadata.entity.review',
        'metadata.entity.publish',
        'metadata.entity.rollback',
        'metadata.entity.retire'
     )
       AND permission.status IN ('draft', 'suspended')
       AND NOT EXISTS (
           SELECT 1 FROM authz.permission_scope_policy AS scope_policy
            WHERE scope_policy.permission_id = permission.id
              AND scope_policy.scope_kind = 'tenant'
       );

    UPDATE authz.permission
       SET status = 'published', status_changed_by = v_actor, updated_by = v_actor
     WHERE canonical_code IN (
        'metadata.entity.view',
        'metadata.entity.author',
        'metadata.entity.review',
        'metadata.entity.publish',
        'metadata.entity.rollback',
        'metadata.entity.retire'
     )
       AND status IN ('draft', 'suspended');

    IF (SELECT count(*) FROM authz.permission
         WHERE canonical_code LIKE 'metadata.entity.%'
           AND canonical_code IN (
             'metadata.entity.view', 'metadata.entity.author',
             'metadata.entity.review', 'metadata.entity.publish',
             'metadata.entity.rollback', 'metadata.entity.retire'
           )) <> 6 THEN
        RAISE EXCEPTION '[meta-entity P2.7] canonical permission catalog is incomplete';
    END IF;
    IF EXISTS (
        SELECT 1
          FROM (VALUES
            ('view',     'low',      false, false, true),
            ('author',   'medium',   false, false, true),
            ('review',   'high',     false, true,  false),
            ('publish',  'critical', true,  true,  false),
            ('rollback', 'critical', true,  true,  false),
            ('retire',   'critical', true,  true,  false)
          ) AS expected(operation_code, risk_tier, requires_mfa, requires_sod, is_delegable)
          LEFT JOIN authz.permission AS actual
            ON actual.canonical_code = 'metadata.entity.' || expected.operation_code
          LEFT JOIN authz.permission_scope_policy AS scope_policy
            ON scope_policy.permission_id = actual.id
           AND scope_policy.scope_kind = 'tenant'
         WHERE actual.id IS NULL
            OR actual.permission_kind <> 'capability'
            OR actual.resource_code <> 'metadata.entity'
            OR actual.operation_code <> expected.operation_code
            OR actual.risk_tier::text <> expected.risk_tier
            OR actual.requires_mfa <> expected.requires_mfa
            OR actual.requires_sod <> expected.requires_sod
            OR actual.is_delegable <> expected.is_delegable
            OR actual.status <> 'published'
            OR actual.provenance_ref <> 'athyper.meta-entity@p2.7-v1'
            OR scope_policy.permission_id IS NULL
            OR scope_policy.propagation_mode <> 'exact'
    ) THEN
        RAISE EXCEPTION '[meta-entity P2.7] canonical permission contract drift detected';
    END IF;
END
$seed_metadata_entity_permissions$;
