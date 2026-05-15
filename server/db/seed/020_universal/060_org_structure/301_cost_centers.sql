-- ============================================================================
-- UNIVERSAL ORG FOUNDATION - COST CENTERS
-- ============================================================================
-- File:     020_universal/060_org_structure/301_cost_centers.sql
-- Schema:   master.cost_center
-- Purpose:  Simple general-purpose cost-center hierarchy per active company.
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
    v_admin    uuid;
    v_comm     uuid;
    v_supp     uuid;
    v_ops      uuid;
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
        RAISE EXCEPTION '[301_cost_centers] No active company codes for tenant %. Run tenant legal/company-code seed first.', v_tid;
    END IF;

    v_meta := jsonb_build_object(
        '_seed', jsonb_build_object(
            'pack', v_pack,
            'component', 'cost_centers',
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
        INSERT INTO master.cost_center (
            tenant_id, company_code_id, code, name,
            node_type, cost_center_category, level_no, parent_id,
            valid_from, sort_order, status, created_by, metadata
        )
        VALUES (
            v_tid, v_cc.id, v_cc.code || '-CC', v_cc.name || ' Cost Centers',
            'header', 'admin', 1, NULL,
            '2020-01-01'::date, 0, 'active', v_su, v_meta
        )
        ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET
            name                 = EXCLUDED.name,
            node_type            = EXCLUDED.node_type,
            cost_center_category = EXCLUDED.cost_center_category,
            level_no             = EXCLUDED.level_no,
            parent_id            = EXCLUDED.parent_id,
            sort_order           = EXCLUDED.sort_order,
            metadata             = master.cost_center.metadata || EXCLUDED.metadata,
            updated_at           = now(),
            updated_by           = v_su
        WHERE (master.cost_center.name, master.cost_center.node_type,
               master.cost_center.cost_center_category, master.cost_center.level_no,
               master.cost_center.parent_id, master.cost_center.sort_order)
           IS DISTINCT FROM
              (EXCLUDED.name, EXCLUDED.node_type,
               EXCLUDED.cost_center_category, EXCLUDED.level_no,
               EXCLUDED.parent_id, EXCLUDED.sort_order);

        SELECT id INTO v_root
        FROM master.cost_center
        WHERE tenant_id = v_tid AND company_code_id = v_cc.id AND code = v_cc.code || '-CC';

        INSERT INTO master.cost_center (
            tenant_id, company_code_id, code, name,
            node_type, cost_center_category, level_no, parent_id,
            valid_from, sort_order, status, created_by, metadata
        )
        VALUES
            (v_tid, v_cc.id, v_cc.code || '-CC-ADMIN',   'Administration',   'header', 'admin',      2, v_root, '2020-01-01'::date, 100, 'active', v_su, v_meta),
            (v_tid, v_cc.id, v_cc.code || '-CC-COMM',    'Commercial',       'header', 'sales',      2, v_root, '2020-01-01'::date, 200, 'active', v_su, v_meta),
            (v_tid, v_cc.id, v_cc.code || '-CC-SUPPORT', 'Support Services', 'header', 'shared',     2, v_root, '2020-01-01'::date, 300, 'active', v_su, v_meta),
            (v_tid, v_cc.id, v_cc.code || '-CC-OPS',     'Operations',       'header', 'production', 2, v_root, '2020-01-01'::date, 400, 'active', v_su, v_meta)
        ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET
            name                 = EXCLUDED.name,
            node_type            = EXCLUDED.node_type,
            cost_center_category = EXCLUDED.cost_center_category,
            level_no             = EXCLUDED.level_no,
            parent_id            = EXCLUDED.parent_id,
            sort_order           = EXCLUDED.sort_order,
            metadata             = master.cost_center.metadata || EXCLUDED.metadata,
            updated_at           = now(),
            updated_by           = v_su
        WHERE (master.cost_center.name, master.cost_center.node_type,
               master.cost_center.cost_center_category, master.cost_center.level_no,
               master.cost_center.parent_id, master.cost_center.sort_order)
           IS DISTINCT FROM
              (EXCLUDED.name, EXCLUDED.node_type,
               EXCLUDED.cost_center_category, EXCLUDED.level_no,
               EXCLUDED.parent_id, EXCLUDED.sort_order);

        SELECT id INTO v_admin FROM master.cost_center WHERE tenant_id = v_tid AND company_code_id = v_cc.id AND code = v_cc.code || '-CC-ADMIN';
        SELECT id INTO v_comm  FROM master.cost_center WHERE tenant_id = v_tid AND company_code_id = v_cc.id AND code = v_cc.code || '-CC-COMM';
        SELECT id INTO v_supp  FROM master.cost_center WHERE tenant_id = v_tid AND company_code_id = v_cc.id AND code = v_cc.code || '-CC-SUPPORT';
        SELECT id INTO v_ops   FROM master.cost_center WHERE tenant_id = v_tid AND company_code_id = v_cc.id AND code = v_cc.code || '-CC-OPS';

        INSERT INTO master.cost_center (
            tenant_id, company_code_id, code, name,
            node_type, cost_center_category, level_no, parent_id,
            valid_from, sort_order, status, created_by, metadata
        )
        VALUES
            (v_tid, v_cc.id, v_cc.code || '-CC-ADMIN-FIN',   'Finance and Accounting',   'posting', 'admin',      3, v_admin, '2020-01-01'::date, 110, 'active', v_su, v_meta),
            (v_tid, v_cc.id, v_cc.code || '-CC-ADMIN-HR',    'Human Resources',          'posting', 'admin',      3, v_admin, '2020-01-01'::date, 120, 'active', v_su, v_meta),
            (v_tid, v_cc.id, v_cc.code || '-CC-ADMIN-IT',    'Information Technology',   'posting', 'admin',      3, v_admin, '2020-01-01'::date, 130, 'active', v_su, v_meta),
            (v_tid, v_cc.id, v_cc.code || '-CC-ADMIN-LEGAL', 'Legal and Compliance',     'posting', 'admin',      3, v_admin, '2020-01-01'::date, 140, 'active', v_su, v_meta),
            (v_tid, v_cc.id, v_cc.code || '-CC-COMM-SALES',  'Sales',                    'posting', 'sales',      3, v_comm,  '2020-01-01'::date, 210, 'active', v_su, v_meta),
            (v_tid, v_cc.id, v_cc.code || '-CC-COMM-MKTG',   'Marketing and BD',         'posting', 'sales',      3, v_comm,  '2020-01-01'::date, 220, 'active', v_su, v_meta),
            (v_tid, v_cc.id, v_cc.code || '-CC-SUPPORT-PROC','Procurement',              'posting', 'admin',      3, v_supp,  '2020-01-01'::date, 310, 'active', v_su, v_meta),
            (v_tid, v_cc.id, v_cc.code || '-CC-SUPPORT-SVC', 'Shared Services',          'posting', 'shared',     3, v_supp,  '2020-01-01'::date, 320, 'active', v_su, v_meta),
            (v_tid, v_cc.id, v_cc.code || '-CC-OPS-GEN',     'General Operations',       'posting', 'production', 3, v_ops,   '2020-01-01'::date, 410, 'active', v_su, v_meta)
        ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET
            name                 = EXCLUDED.name,
            node_type            = EXCLUDED.node_type,
            cost_center_category = EXCLUDED.cost_center_category,
            level_no             = EXCLUDED.level_no,
            parent_id            = EXCLUDED.parent_id,
            sort_order           = EXCLUDED.sort_order,
            metadata             = master.cost_center.metadata || EXCLUDED.metadata,
            updated_at           = now(),
            updated_by           = v_su
        WHERE (master.cost_center.name, master.cost_center.node_type,
               master.cost_center.cost_center_category, master.cost_center.level_no,
               master.cost_center.parent_id, master.cost_center.sort_order)
           IS DISTINCT FROM
              (EXCLUDED.name, EXCLUDED.node_type,
               EXCLUDED.cost_center_category, EXCLUDED.level_no,
               EXCLUDED.parent_id, EXCLUDED.sort_order);
    END LOOP;

    IF EXISTS (
        SELECT 1
        FROM master.company_code cc
        WHERE cc.tenant_id = v_tid AND cc.status = 'active'
          AND NOT EXISTS (
              SELECT 1
              FROM master.cost_center c
              WHERE c.tenant_id = v_tid
                AND c.company_code_id = cc.id
                AND c.code = cc.code || '-CC-OPS-GEN'
                AND c.node_type = 'posting'
          )
    ) THEN
        RAISE EXCEPTION '[301_cost_centers] Active company missing universal posting cost centers';
    END IF;

    RAISE NOTICE '[301_cost_centers] Seeded universal cost centers for % active companies', v_count;
END $seed$;
