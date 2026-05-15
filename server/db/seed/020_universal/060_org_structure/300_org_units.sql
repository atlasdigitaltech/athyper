-- ============================================================================
-- UNIVERSAL ORG FOUNDATION - ORG UNITS
-- ============================================================================
-- File:     020_universal/060_org_structure/300_org_units.sql
-- Schema:   master.org_unit
-- Purpose:  Simple, tenant-neutral organization hierarchy per active company.
-- Depends:  tenant legal entities and company codes.
-- Run:      After tenant company_code rows exist.
-- ============================================================================

DO $seed$
DECLARE
    v_tid      uuid;
    v_su       uuid := '00000000-0000-0000-0000-000000000000';
    v_pack     text := 'org_universal';
    v_version  text := '1.0.0';
    v_meta     jsonb;
    v_cc       record;
    v_root     uuid;
    v_count    int;
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set - run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM master.tenant WHERE id = v_tid) THEN
        RAISE EXCEPTION '[300_org_units] No tenant found for app.seed_tenant_id = %', v_tid;
    END IF;

    SELECT count(*) INTO v_count
    FROM master.company_code
    WHERE tenant_id = v_tid AND status = 'active';

    IF v_count = 0 THEN
        RAISE EXCEPTION '[300_org_units] No active company codes for tenant %. Run tenant legal/company-code seed first.', v_tid;
    END IF;

    v_meta := jsonb_build_object(
        '_seed', jsonb_build_object(
            'pack', v_pack,
            'component', 'org_units',
            'version', v_version,
            'seeded_at', now()::text
        )
    );

    FOR v_cc IN
        SELECT id, code, name, legal_entity_id
        FROM master.company_code
        WHERE tenant_id = v_tid AND status = 'active'
        ORDER BY code
    LOOP
        INSERT INTO master.org_unit (
            tenant_id, company_code_id, legal_entity_id,
            code, name, unit_type, parent_id, level_no,
            sort_order, valid_from, status, created_by, metadata
        )
        VALUES (
            v_tid, v_cc.id, v_cc.legal_entity_id,
            v_cc.code || '-ORG', v_cc.name || ' Organization',
            'division', NULL, 1,
            0, '2020-01-01'::date, 'active', v_su, v_meta
        )
        ON CONFLICT (tenant_id, code) DO UPDATE SET
            name            = EXCLUDED.name,
            company_code_id = EXCLUDED.company_code_id,
            legal_entity_id = EXCLUDED.legal_entity_id,
            unit_type       = EXCLUDED.unit_type,
            parent_id       = EXCLUDED.parent_id,
            sort_order      = EXCLUDED.sort_order,
            metadata        = master.org_unit.metadata || EXCLUDED.metadata,
            updated_at      = now(),
            updated_by      = v_su
        WHERE (master.org_unit.name, master.org_unit.company_code_id,
               master.org_unit.legal_entity_id, master.org_unit.unit_type,
               master.org_unit.parent_id, master.org_unit.sort_order)
           IS DISTINCT FROM
              (EXCLUDED.name, EXCLUDED.company_code_id,
               EXCLUDED.legal_entity_id, EXCLUDED.unit_type,
               EXCLUDED.parent_id, EXCLUDED.sort_order);

        SELECT id INTO v_root
        FROM master.org_unit
        WHERE tenant_id = v_tid AND code = v_cc.code || '-ORG';

        INSERT INTO master.org_unit (
            tenant_id, company_code_id, legal_entity_id,
            code, name, unit_type, parent_id, level_no,
            sort_order, valid_from, status, created_by, metadata
        )
        VALUES
            (v_tid, v_cc.id, v_cc.legal_entity_id, v_cc.code || '-ORG-ADMIN',   'Administration',   'department', v_root, 2, 100, '2020-01-01'::date, 'active', v_su, v_meta),
            (v_tid, v_cc.id, v_cc.legal_entity_id, v_cc.code || '-ORG-FIN',     'Finance',          'department', v_root, 2, 150, '2020-01-01'::date, 'active', v_su, v_meta),
            (v_tid, v_cc.id, v_cc.legal_entity_id, v_cc.code || '-ORG-COMM',    'Commercial',       'department', v_root, 2, 200, '2020-01-01'::date, 'active', v_su, v_meta),
            (v_tid, v_cc.id, v_cc.legal_entity_id, v_cc.code || '-ORG-OPS',     'Operations',       'department', v_root, 2, 300, '2020-01-01'::date, 'active', v_su, v_meta),
            (v_tid, v_cc.id, v_cc.legal_entity_id, v_cc.code || '-ORG-SUPPORT', 'Support Services', 'department', v_root, 2, 400, '2020-01-01'::date, 'active', v_su, v_meta)
        ON CONFLICT (tenant_id, code) DO UPDATE SET
            name            = EXCLUDED.name,
            company_code_id = EXCLUDED.company_code_id,
            legal_entity_id = EXCLUDED.legal_entity_id,
            unit_type       = EXCLUDED.unit_type,
            parent_id       = EXCLUDED.parent_id,
            sort_order      = EXCLUDED.sort_order,
            metadata        = master.org_unit.metadata || EXCLUDED.metadata,
            updated_at      = now(),
            updated_by      = v_su
        WHERE (master.org_unit.name, master.org_unit.company_code_id,
               master.org_unit.legal_entity_id, master.org_unit.unit_type,
               master.org_unit.parent_id, master.org_unit.sort_order)
           IS DISTINCT FROM
              (EXCLUDED.name, EXCLUDED.company_code_id,
               EXCLUDED.legal_entity_id, EXCLUDED.unit_type,
               EXCLUDED.parent_id, EXCLUDED.sort_order);
    END LOOP;

    IF EXISTS (
        SELECT 1
        FROM master.company_code cc
        WHERE cc.tenant_id = v_tid AND cc.status = 'active'
          AND NOT EXISTS (
              SELECT 1
              FROM master.org_unit ou
              WHERE ou.tenant_id = v_tid
                AND ou.company_code_id = cc.id
                AND ou.code = cc.code || '-ORG'
          )
    ) THEN
        RAISE EXCEPTION '[300_org_units] Active company missing universal org root';
    END IF;

    RAISE NOTICE '[300_org_units] Seeded universal org units for % active companies', v_count;
END $seed$;
