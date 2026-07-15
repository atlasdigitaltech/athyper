-- ============================================================================
-- SEED 003 - Demo Delegation Grants
-- ============================================================================
-- Delegation grants are resolved by tenant + principal code instead of fixed
-- principal UUIDs. 001_demo_principals may preserve an existing principal for a
-- code during reset/reseed, so using code lookups keeps this seed aligned with
-- the actual principal rows.
-- ============================================================================

DO $demo_delegation_grants$
DECLARE
    v_su uuid := '00000000-0000-0000-0000-000000000000';
    v_tenant_id uuid;
    v_missing_codes text[];
BEGIN
    SELECT id INTO v_tenant_id
    FROM master.tenant
    WHERE realm_key = 'athyper'
      AND code = 'athyper';

    IF v_tenant_id IS NULL THEN
        RAISE EXCEPTION '[003_demo_delegation_grants] tenant athyper/athyper not found';
    END IF;

    WITH required_principals(code) AS (
        VALUES
            ('athq.owner'),
            ('athq.manager'),
            ('athq.admin'),
            ('athq.cfo')
    )
    SELECT array_agg(rp.code ORDER BY rp.code)
    INTO v_missing_codes
    FROM required_principals rp
    LEFT JOIN master.principal p
        ON p.tenant_id = v_tenant_id
       AND p.code = rp.code
    WHERE p.id IS NULL;

    IF v_missing_codes IS NOT NULL THEN
        RAISE EXCEPTION '[003_demo_delegation_grants] missing demo principals: %', v_missing_codes;
    END IF;

    WITH grant_seed AS (
        SELECT *
        FROM (VALUES
            (
                'ff100001-0000-0000-0000-000000000001'::uuid,
                'athq.owner',
                'athq.manager',
                ARRAY['approve', 'create']::text[],
                'entity',
                'ATHQ',
                INTERVAL '90 days'
            ),
            (
                'ff100002-0000-0000-0000-000000000001'::uuid,
                'athq.admin',
                'athq.cfo',
                ARRAY['export']::text[],
                'entity',
                'ATHQ',
                INTERVAL '30 days'
            )
        ) AS v(id, delegator_code, delegate_code, permissions, scope_type, scope_ref, expires_in)
    )
    INSERT INTO master.delegation_grant (
        id,
        tenant_id,
        delegator_id,
        delegate_id,
        permissions,
        scope_type,
        scope_ref,
        expires_at,
        is_revoked,
        created_by
    )
    SELECT
        gs.id,
        v_tenant_id,
        delegator.id,
        delegate.id,
        gs.permissions,
        gs.scope_type,
        gs.scope_ref,
        now() + gs.expires_in,
        false,
        v_su
    FROM grant_seed gs
    JOIN master.principal delegator
        ON delegator.tenant_id = v_tenant_id
       AND delegator.code = gs.delegator_code
    JOIN master.principal delegate
        ON delegate.tenant_id = v_tenant_id
       AND delegate.code = gs.delegate_code
    ON CONFLICT (id) DO NOTHING;

    RAISE NOTICE '[003_demo_delegation_grants] demo delegation grants seeded';
END $demo_delegation_grants$;
