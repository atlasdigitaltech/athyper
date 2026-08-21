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
        id, canonical_code, permission_kind,
        module_id, risk_tier, requires_mfa, requires_sod, is_shareable,
        is_delegable, is_overridable, metadata, status,
        status_changed_at, status_changed_by, created_by
    )
    SELECT
        md5('athyper.meta-entity:permission:' || seed.operation_code)::uuid,
        'metadata.entity.' || seed.operation_code,
        'capability',
        v_module_id,
        seed.risk_tier::authz.risk_tier_d,
        seed.requires_mfa,
        seed.requires_sod,
        false,
        seed.is_delegable,
        false,
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
         WHERE canonical_code IN (
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
         WHERE actual.id IS NULL
            OR actual.permission_kind <> 'capability'
            OR actual.risk_tier::text <> expected.risk_tier
            OR actual.requires_mfa <> expected.requires_mfa
            OR actual.requires_sod <> expected.requires_sod
            OR actual.is_delegable <> expected.is_delegable
            OR actual.status <> 'published'
    ) THEN
        RAISE EXCEPTION '[meta-entity P2.7] canonical permission contract drift detected';
    END IF;
END
$seed_metadata_entity_permissions$;
