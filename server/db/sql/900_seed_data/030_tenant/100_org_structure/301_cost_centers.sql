-- ============================================================================
-- 301_cost_centers.sql — Base cost center hierarchy (universal only)
-- ============================================================================
-- Structure: L1 root → L2 functional headers → L3 posting leaves
-- Base scope: ADMIN, COMMERCIAL, SUPPORT, OPS (1 generic leaf)
-- Industry-specific OPS leaves deferred to extension packs
-- Code convention: {COMP}-CC-{HEADER}-{LEAF}
-- Per company: 1 root + 4 headers + 9 posting = 14 nodes
-- Depends:  199_gl_preseed.sql (company codes must exist)
-- ============================================================================

DO $seed$
DECLARE
    v_tid   uuid;
    v_su    uuid := '00000000-0000-0000-0000-000000000000';
    v_meta  jsonb := '{"_seed": {"pack": "301_org", "version": "2.0.0"}}'::jsonb;
    v_cc    record;
    v_root  uuid;
    v_admin uuid;
    v_comm  uuid;
    v_supp  uuid;
    v_ops   uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN RAISE EXCEPTION 'Tenant ATHYPER not found'; END IF;

    FOR v_cc IN
        SELECT id, code, name FROM master.company_code
        WHERE tenant_id = v_tid AND status = 'active' ORDER BY code
    LOOP
        -- L1: Company root
        INSERT INTO master.cost_center
            (tenant_id, company_code_id, code, name,
             node_type, cost_center_category, level_no, parent_id,
             valid_from, sort_order, status, created_by, metadata)
        VALUES (v_tid, v_cc.id,
             v_cc.code || '-CC', v_cc.name || ' Cost Centers',
             'header', 'admin', 1, NULL,
             '2020-01-01'::date, 0, 'active', v_su, v_meta)
        ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET
            name = EXCLUDED.name, updated_at = now(), updated_by = v_su
        WHERE master.cost_center.name IS DISTINCT FROM EXCLUDED.name;

        SELECT id INTO v_root FROM master.cost_center
        WHERE tenant_id = v_tid AND company_code_id = v_cc.id
          AND code = v_cc.code || '-CC';

        -- L2: 4 functional headers
        INSERT INTO master.cost_center
            (tenant_id, company_code_id, code, name,
             node_type, cost_center_category, level_no, parent_id,
             valid_from, sort_order, status, created_by, metadata) VALUES
        (v_tid, v_cc.id, v_cc.code||'-CC-ADMIN',   'Administration',    'header','admin',     2, v_root,'2020-01-01'::date, 100,'active',v_su,v_meta),
        (v_tid, v_cc.id, v_cc.code||'-CC-COMM',    'Commercial',        'header','sales',     2, v_root,'2020-01-01'::date, 200,'active',v_su,v_meta),
        (v_tid, v_cc.id, v_cc.code||'-CC-SUPPORT', 'Support Services',  'header','shared',    2, v_root,'2020-01-01'::date, 300,'active',v_su,v_meta),
        (v_tid, v_cc.id, v_cc.code||'-CC-OPS',     'Operations',        'header','production',2, v_root,'2020-01-01'::date, 400,'active',v_su,v_meta)
        ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET
            name = EXCLUDED.name, parent_id = EXCLUDED.parent_id,
            updated_at = now(), updated_by = v_su
        WHERE (master.cost_center.name, master.cost_center.parent_id)
           IS DISTINCT FROM
              (EXCLUDED.name, EXCLUDED.parent_id);

        SELECT id INTO v_admin FROM master.cost_center WHERE tenant_id=v_tid AND company_code_id=v_cc.id AND code=v_cc.code||'-CC-ADMIN';
        SELECT id INTO v_comm  FROM master.cost_center WHERE tenant_id=v_tid AND company_code_id=v_cc.id AND code=v_cc.code||'-CC-COMM';
        SELECT id INTO v_supp  FROM master.cost_center WHERE tenant_id=v_tid AND company_code_id=v_cc.id AND code=v_cc.code||'-CC-SUPPORT';
        SELECT id INTO v_ops   FROM master.cost_center WHERE tenant_id=v_tid AND company_code_id=v_cc.id AND code=v_cc.code||'-CC-OPS';

        -- L3: Posting leaves under ADMIN (4)
        INSERT INTO master.cost_center
            (tenant_id, company_code_id, code, name,
             node_type, cost_center_category, level_no, parent_id,
             valid_from, sort_order, status, created_by, metadata) VALUES
        (v_tid,v_cc.id,v_cc.code||'-CC-ADMIN-FIN',  'Finance & Accounting','posting','admin',3,v_admin,'2020-01-01'::date,110,'active',v_su,v_meta),
        (v_tid,v_cc.id,v_cc.code||'-CC-ADMIN-HR',   'Human Resources',     'posting','admin',3,v_admin,'2020-01-01'::date,120,'active',v_su,v_meta),
        (v_tid,v_cc.id,v_cc.code||'-CC-ADMIN-IT',   'Information Technology','posting','admin',3,v_admin,'2020-01-01'::date,130,'active',v_su,v_meta),
        (v_tid,v_cc.id,v_cc.code||'-CC-ADMIN-LEGAL','Legal & Compliance',  'posting','admin',3,v_admin,'2020-01-01'::date,140,'active',v_su,v_meta)
        ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET
            name=EXCLUDED.name, parent_id=EXCLUDED.parent_id, updated_at=now(), updated_by=v_su
        WHERE (master.cost_center.name, master.cost_center.parent_id)
           IS DISTINCT FROM
              (EXCLUDED.name, EXCLUDED.parent_id);

        -- L3: Posting leaves under COMMERCIAL (2)
        INSERT INTO master.cost_center
            (tenant_id, company_code_id, code, name,
             node_type, cost_center_category, level_no, parent_id,
             valid_from, sort_order, status, created_by, metadata) VALUES
        (v_tid,v_cc.id,v_cc.code||'-CC-COMM-SALES','Sales',          'posting','sales',3,v_comm,'2020-01-01'::date,210,'active',v_su,v_meta),
        (v_tid,v_cc.id,v_cc.code||'-CC-COMM-MKTG', 'Marketing & BD','posting','sales',3,v_comm,'2020-01-01'::date,220,'active',v_su,v_meta)
        ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET
            name=EXCLUDED.name, parent_id=EXCLUDED.parent_id, updated_at=now(), updated_by=v_su
        WHERE (master.cost_center.name, master.cost_center.parent_id)
           IS DISTINCT FROM
              (EXCLUDED.name, EXCLUDED.parent_id);

        -- L3: Posting leaves under SUPPORT (2)
        INSERT INTO master.cost_center
            (tenant_id, company_code_id, code, name,
             node_type, cost_center_category, level_no, parent_id,
             valid_from, sort_order, status, created_by, metadata) VALUES
        (v_tid,v_cc.id,v_cc.code||'-CC-SUPPORT-PROC','Procurement',     'posting','admin', 3,v_supp,'2020-01-01'::date,310,'active',v_su,v_meta),
        (v_tid,v_cc.id,v_cc.code||'-CC-SUPPORT-SVC', 'Shared Services','posting','shared',3,v_supp,'2020-01-01'::date,320,'active',v_su,v_meta)
        ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET
            name=EXCLUDED.name, parent_id=EXCLUDED.parent_id, updated_at=now(), updated_by=v_su
        WHERE (master.cost_center.name, master.cost_center.parent_id)
           IS DISTINCT FROM
              (EXCLUDED.name, EXCLUDED.parent_id);

        -- L3: ONE generic operations leaf (packs add industry leaves here)
        INSERT INTO master.cost_center
            (tenant_id, company_code_id, code, name,
             node_type, cost_center_category, level_no, parent_id,
             valid_from, sort_order, status, created_by, metadata) VALUES
        (v_tid,v_cc.id,v_cc.code||'-CC-OPS-GEN','General Operations','posting','production',3,v_ops,'2020-01-01'::date,410,'active',v_su,v_meta)
        ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET
            name=EXCLUDED.name, parent_id=EXCLUDED.parent_id, updated_at=now(), updated_by=v_su
        WHERE (master.cost_center.name, master.cost_center.parent_id)
           IS DISTINCT FROM
              (EXCLUDED.name, EXCLUDED.parent_id);

    END LOOP;

    -- ══════════════════════════════════════════════════════════════════════
    -- ASSERTIONS (5 checks)
    -- ══════════════════════════════════════════════════════════════════════

    -- A1: Every company has exactly 1 L1 root
    IF EXISTS (
        SELECT company_code_id FROM master.cost_center
        WHERE tenant_id = v_tid AND level_no = 1
        GROUP BY company_code_id HAVING count(*) != 1
    ) THEN RAISE EXCEPTION '301 FAIL: company with != 1 CC root'; END IF;

    -- A2: No posting node has NULL parent
    IF EXISTS (
        SELECT id FROM master.cost_center
        WHERE tenant_id = v_tid AND node_type = 'posting' AND parent_id IS NULL
    ) THEN RAISE EXCEPTION '301 FAIL: posting CC with NULL parent'; END IF;

    -- A3: Every company has at least 9 base posting leaves
    -- (packs may add more — check minimum, not exact)
    IF EXISTS (
        SELECT company_code_id, count(*) FROM master.cost_center
        WHERE tenant_id = v_tid AND node_type = 'posting'
        GROUP BY company_code_id HAVING count(*) < 9
    ) THEN RAISE EXCEPTION '301 FAIL: company with < 9 posting CCs'; END IF;

    -- A4: No posting node at L1 or L2
    IF EXISTS (
        SELECT id FROM master.cost_center
        WHERE tenant_id = v_tid AND node_type = 'posting' AND level_no < 3
    ) THEN RAISE EXCEPTION '301 FAIL: posting CC at level < 3'; END IF;

    -- A5: All active companies represented (dynamic — not hard-coded)
    IF (SELECT count(DISTINCT company_code_id) FROM master.cost_center
        WHERE tenant_id = v_tid)
       !=
       (SELECT count(*) FROM master.company_code
        WHERE tenant_id = v_tid AND status = 'active')
    THEN RAISE EXCEPTION '301 FAIL: CC company count != active company_code count'; END IF;

    -- ══════════════════════════════════════════════════════════════════════
    -- CROSS-LINK NOTE (for extension packs / post-seed mapping):
    -- cost_center.profit_center_id is intentionally NULL in the base seed.
    -- Extension packs or a post-seed mapping file should populate it for
    -- operational cost centers where managerial reporting needs a default
    -- P&L owner. The DDL validates same-company integrity on this FK.
    -- ══════════════════════════════════════════════════════════════════════

    RAISE NOTICE '301: % cost centers across % companies (14 per company: 1+4+9)',
        (SELECT count(*) FROM master.cost_center WHERE tenant_id = v_tid),
        (SELECT count(DISTINCT company_code_id) FROM master.cost_center WHERE tenant_id = v_tid);
END $seed$;
