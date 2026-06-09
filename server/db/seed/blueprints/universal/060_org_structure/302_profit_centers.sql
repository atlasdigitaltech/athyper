-- ============================================================================
-- UNIVERSAL ORG FOUNDATION - PROFIT CENTERS
-- ============================================================================
-- File:     blueprints/universal/060_org_structure/302_profit_centers.sql
-- Schema:   master.profit_center
-- Purpose:  Simple general-purpose P&L hierarchy per active company.
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
    v_ext      uuid;
    v_ic       uuid;
    v_inv      uuid;
    v_svc      uuid;
    v_count    int;
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set - run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    SELECT count(*) INTO v_count
    FROM master.company_code
    WHERE tenant_id = v_tid AND status = 'active';

    IF v_count = 0 THEN
        RAISE EXCEPTION '[302_profit_centers] No active company codes for tenant %. Run tenant legal/company-code seed first.', v_tid;
    END IF;

    v_meta := jsonb_build_object(
        '_seed', jsonb_build_object(
            'pack', v_pack,
            'component', 'profit_centers',
            'version', v_version,
            'seeded_at', now()::text
        )
    );

    FOR v_cc IN
        SELECT id, code, name
        FROM master.company_code
        WHERE tenant_id = v_tid AND status = 'active'
        ORDER BY code
    LOOP
        INSERT INTO master.profit_center (
            tenant_id, company_code_id, code, name,
            node_type, profit_center_type, level_no, parent_id,
            valid_from, sort_order, status, created_by, metadata
        )
        VALUES (
            v_tid, v_cc.id, v_cc.code || '-PC', v_cc.name || ' Profit Centers',
            'header', 'revenue', 1, NULL,
            '2020-01-01'::date, 0, 'active', v_su, v_meta
        )
        ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET
            name               = EXCLUDED.name,
            node_type          = EXCLUDED.node_type,
            profit_center_type = EXCLUDED.profit_center_type,
            level_no           = EXCLUDED.level_no,
            parent_id          = EXCLUDED.parent_id,
            sort_order         = EXCLUDED.sort_order,
            metadata           = master.profit_center.metadata || EXCLUDED.metadata,
            updated_at         = now(),
            updated_by         = v_su
        WHERE (master.profit_center.name, master.profit_center.node_type,
               master.profit_center.profit_center_type, master.profit_center.level_no,
               master.profit_center.parent_id, master.profit_center.sort_order)
           IS DISTINCT FROM
              (EXCLUDED.name, EXCLUDED.node_type,
               EXCLUDED.profit_center_type, EXCLUDED.level_no,
               EXCLUDED.parent_id, EXCLUDED.sort_order);

        SELECT id INTO v_root
        FROM master.profit_center
        WHERE tenant_id = v_tid AND company_code_id = v_cc.id AND code = v_cc.code || '-PC';

        INSERT INTO master.profit_center (
            tenant_id, company_code_id, code, name,
            node_type, profit_center_type, level_no, parent_id,
            valid_from, sort_order, status, created_by, metadata
        )
        VALUES
            (v_tid, v_cc.id, v_cc.code || '-PC-EXT', 'External Business', 'header', 'revenue',    2, v_root, '2020-01-01'::date, 100, 'active', v_su, v_meta),
            (v_tid, v_cc.id, v_cc.code || '-PC-IC',  'Intercompany',      'header', 'shared',     2, v_root, '2020-01-01'::date, 200, 'active', v_su, v_meta),
            (v_tid, v_cc.id, v_cc.code || '-PC-INV', 'Investment',        'header', 'investment', 2, v_root, '2020-01-01'::date, 300, 'active', v_su, v_meta),
            (v_tid, v_cc.id, v_cc.code || '-PC-SVC', 'Internal Services', 'header', 'service',    2, v_root, '2020-01-01'::date, 400, 'active', v_su, v_meta)
        ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET
            name               = EXCLUDED.name,
            node_type          = EXCLUDED.node_type,
            profit_center_type = EXCLUDED.profit_center_type,
            level_no           = EXCLUDED.level_no,
            parent_id          = EXCLUDED.parent_id,
            sort_order         = EXCLUDED.sort_order,
            metadata           = master.profit_center.metadata || EXCLUDED.metadata,
            updated_at         = now(),
            updated_by         = v_su
        WHERE (master.profit_center.name, master.profit_center.node_type,
               master.profit_center.profit_center_type, master.profit_center.level_no,
               master.profit_center.parent_id, master.profit_center.sort_order)
           IS DISTINCT FROM
              (EXCLUDED.name, EXCLUDED.node_type,
               EXCLUDED.profit_center_type, EXCLUDED.level_no,
               EXCLUDED.parent_id, EXCLUDED.sort_order);

        SELECT id INTO v_ext FROM master.profit_center WHERE tenant_id = v_tid AND company_code_id = v_cc.id AND code = v_cc.code || '-PC-EXT';
        SELECT id INTO v_ic  FROM master.profit_center WHERE tenant_id = v_tid AND company_code_id = v_cc.id AND code = v_cc.code || '-PC-IC';
        SELECT id INTO v_inv FROM master.profit_center WHERE tenant_id = v_tid AND company_code_id = v_cc.id AND code = v_cc.code || '-PC-INV';
        SELECT id INTO v_svc FROM master.profit_center WHERE tenant_id = v_tid AND company_code_id = v_cc.id AND code = v_cc.code || '-PC-SVC';

        INSERT INTO master.profit_center (
            tenant_id, company_code_id, code, name,
            node_type, profit_center_type, level_no, parent_id,
            valid_from, sort_order, status, created_by, metadata
        )
        VALUES
            (v_tid, v_cc.id, v_cc.code || '-PC-EXT-GEN',      'General Revenue',      'posting', 'revenue',    3, v_ext, '2020-01-01'::date, 110, 'active', v_su, v_meta),
            (v_tid, v_cc.id, v_cc.code || '-PC-IC-INCOME',    'Intercompany Income',  'posting', 'shared',     3, v_ic,  '2020-01-01'::date, 210, 'active', v_su, v_meta),
            (v_tid, v_cc.id, v_cc.code || '-PC-INV-RETURNS',  'Investment Returns',   'posting', 'investment', 3, v_inv, '2020-01-01'::date, 310, 'active', v_su, v_meta),
            (v_tid, v_cc.id, v_cc.code || '-PC-SVC-INTERNAL', 'Internal Services',    'posting', 'service',    3, v_svc, '2020-01-01'::date, 410, 'active', v_su, v_meta)
        ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET
            name               = EXCLUDED.name,
            node_type          = EXCLUDED.node_type,
            profit_center_type = EXCLUDED.profit_center_type,
            level_no           = EXCLUDED.level_no,
            parent_id          = EXCLUDED.parent_id,
            sort_order         = EXCLUDED.sort_order,
            metadata           = master.profit_center.metadata || EXCLUDED.metadata,
            updated_at         = now(),
            updated_by         = v_su
        WHERE (master.profit_center.name, master.profit_center.node_type,
               master.profit_center.profit_center_type, master.profit_center.level_no,
               master.profit_center.parent_id, master.profit_center.sort_order)
           IS DISTINCT FROM
              (EXCLUDED.name, EXCLUDED.node_type,
               EXCLUDED.profit_center_type, EXCLUDED.level_no,
               EXCLUDED.parent_id, EXCLUDED.sort_order);
    END LOOP;

    IF EXISTS (
        SELECT 1
        FROM master.company_code cc
        WHERE cc.tenant_id = v_tid AND cc.status = 'active'
          AND NOT EXISTS (
              SELECT 1
              FROM master.profit_center pc
              WHERE pc.tenant_id = v_tid
                AND pc.company_code_id = cc.id
                AND pc.code = cc.code || '-PC-EXT-GEN'
                AND pc.node_type = 'posting'
          )
    ) THEN
        RAISE EXCEPTION '[302_profit_centers] Active company missing universal posting profit centers';
    END IF;

    RAISE NOTICE '[302_profit_centers] Seeded universal profit centers for % active companies', v_count;
END $seed$;
