-- General-purpose master.cost_center hierarchy per active company_code.

DO $seed$
DECLARE
    v_tid      uuid;
    v_su       uuid;
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
    v_su := nullif(trim(current_setting('app.current_principal_id', true)), '')::uuid;
    IF v_su IS NULL OR NOT EXISTS (SELECT 1 FROM master.principal WHERE tenant_id=v_tid AND id=v_su AND status='active') THEN
        RAISE EXCEPTION '[301_cost_centers] active tenant-local actor required';
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
            category_code, is_posting_allowed, parent_id,
            valid_from, sort_order, status, created_by, metadata
        )
        VALUES (
            v_tid, v_cc.id, v_cc.code || '-cc', v_cc.name || ' Cost Centers',
            'admin', false, NULL,
            '2020-01-01'::date, 0, 'active', v_su, v_meta
        )
        ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET
            name                 = EXCLUDED.name,
            category_code        = EXCLUDED.category_code,
            is_posting_allowed   = EXCLUDED.is_posting_allowed,
            parent_id            = EXCLUDED.parent_id,
            sort_order           = EXCLUDED.sort_order,
            metadata             = master.cost_center.metadata || EXCLUDED.metadata,
            updated_at           = now(),
            updated_by           = v_su
        WHERE (master.cost_center.name, master.cost_center.category_code,
               master.cost_center.is_posting_allowed,
               master.cost_center.parent_id, master.cost_center.sort_order)
           IS DISTINCT FROM
              (EXCLUDED.name, EXCLUDED.category_code,
               EXCLUDED.is_posting_allowed,
               EXCLUDED.parent_id, EXCLUDED.sort_order);

        SELECT id INTO v_root
        FROM master.cost_center
        WHERE tenant_id = v_tid AND company_code_id = v_cc.id AND code = v_cc.code || '-cc';

        INSERT INTO master.cost_center (
            tenant_id, company_code_id, code, name,
            category_code, is_posting_allowed, parent_id,
            valid_from, sort_order, status, created_by, metadata
        )
        VALUES
            (v_tid, v_cc.id, v_cc.code || '-cc-admin',   'Administration',   'admin',      false, v_root, '2020-01-01'::date, 100, 'active', v_su, v_meta),
            (v_tid, v_cc.id, v_cc.code || '-cc-comm',    'Commercial',       'sales',      false, v_root, '2020-01-01'::date, 200, 'active', v_su, v_meta),
            (v_tid, v_cc.id, v_cc.code || '-cc-support', 'Support Services', 'shared',     false, v_root, '2020-01-01'::date, 300, 'active', v_su, v_meta),
            (v_tid, v_cc.id, v_cc.code || '-cc-ops',     'Operations',       'production', false, v_root, '2020-01-01'::date, 400, 'active', v_su, v_meta)
        ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET
            name                 = EXCLUDED.name,
            category_code        = EXCLUDED.category_code,
            is_posting_allowed   = EXCLUDED.is_posting_allowed,
            parent_id            = EXCLUDED.parent_id,
            sort_order           = EXCLUDED.sort_order,
            metadata             = master.cost_center.metadata || EXCLUDED.metadata,
            updated_at           = now(),
            updated_by           = v_su
        WHERE (master.cost_center.name, master.cost_center.category_code,
               master.cost_center.is_posting_allowed,
               master.cost_center.parent_id, master.cost_center.sort_order)
           IS DISTINCT FROM
              (EXCLUDED.name, EXCLUDED.category_code,
               EXCLUDED.is_posting_allowed,
               EXCLUDED.parent_id, EXCLUDED.sort_order);

        SELECT id INTO v_admin FROM master.cost_center WHERE tenant_id = v_tid AND company_code_id = v_cc.id AND code = v_cc.code || '-cc-admin';
        SELECT id INTO v_comm  FROM master.cost_center WHERE tenant_id = v_tid AND company_code_id = v_cc.id AND code = v_cc.code || '-cc-comm';
        SELECT id INTO v_supp  FROM master.cost_center WHERE tenant_id = v_tid AND company_code_id = v_cc.id AND code = v_cc.code || '-cc-support';
        SELECT id INTO v_ops   FROM master.cost_center WHERE tenant_id = v_tid AND company_code_id = v_cc.id AND code = v_cc.code || '-cc-ops';

        INSERT INTO master.cost_center (
            tenant_id, company_code_id, code, name,
            category_code, is_posting_allowed, parent_id,
            valid_from, sort_order, status, created_by, metadata
        )
        VALUES
            (v_tid, v_cc.id, v_cc.code || '-cc-admin-fin',   'Finance and Accounting', 'admin', true, v_admin, '2020-01-01'::date, 110, 'active', v_su, v_meta),
            (v_tid, v_cc.id, v_cc.code || '-cc-admin-hr',    'Human Resources', 'admin', true, v_admin, '2020-01-01'::date, 120, 'active', v_su, v_meta),
            (v_tid, v_cc.id, v_cc.code || '-cc-admin-it',    'Information Technology', 'admin', true, v_admin, '2020-01-01'::date, 130, 'active', v_su, v_meta),
            (v_tid, v_cc.id, v_cc.code || '-cc-admin-legal', 'Legal and Compliance', 'admin', true, v_admin, '2020-01-01'::date, 140, 'active', v_su, v_meta),
            (v_tid, v_cc.id, v_cc.code || '-cc-comm-sales',  'Sales', 'sales', true, v_comm, '2020-01-01'::date, 210, 'active', v_su, v_meta),
            (v_tid, v_cc.id, v_cc.code || '-cc-comm-mktg',   'Marketing and BD', 'sales', true, v_comm, '2020-01-01'::date, 220, 'active', v_su, v_meta),
            (v_tid, v_cc.id, v_cc.code || '-cc-support-proc','Procurement', 'admin', true, v_supp, '2020-01-01'::date, 310, 'active', v_su, v_meta),
            (v_tid, v_cc.id, v_cc.code || '-cc-support-svc', 'Shared Services', 'shared', true, v_supp, '2020-01-01'::date, 320, 'active', v_su, v_meta),
            (v_tid, v_cc.id, v_cc.code || '-cc-ops-gen',     'General Operations', 'production', true, v_ops, '2020-01-01'::date, 410, 'active', v_su, v_meta)
        ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET
            name                 = EXCLUDED.name,
            category_code        = EXCLUDED.category_code,
            is_posting_allowed   = EXCLUDED.is_posting_allowed,
            parent_id            = EXCLUDED.parent_id,
            sort_order           = EXCLUDED.sort_order,
            metadata             = master.cost_center.metadata || EXCLUDED.metadata,
            updated_at           = now(),
            updated_by           = v_su
        WHERE (master.cost_center.name, master.cost_center.category_code,
               master.cost_center.is_posting_allowed,
               master.cost_center.parent_id, master.cost_center.sort_order)
           IS DISTINCT FROM
              (EXCLUDED.name, EXCLUDED.category_code,
               EXCLUDED.is_posting_allowed,
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
                AND c.code = cc.code || '-cc-ops-gen'
                AND c.is_posting_allowed
          )
    ) THEN
        RAISE EXCEPTION '[301_cost_centers] Active company missing universal posting cost centers';
    END IF;

    RAISE NOTICE '[301_cost_centers] Seeded universal cost centers for % active companies', v_count;
END $seed$;
