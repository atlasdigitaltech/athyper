-- ============================================================================
-- 302_profit_centers.sql — Base profit center hierarchy (universal only)
-- ============================================================================
-- Structure: L1 root → L2 type headers → L3 posting leaves
-- L2 headers: EXT (external revenue), IC (intercompany), INV (investment),
--             SVC (shared/internal service)
-- Code convention: {COMP}-PC-{HEADER}-{LEAF}
-- Industry-specific revenue lines deferred to extension packs
-- Depends:  199_gl_preseed.sql (company codes must exist)
-- ============================================================================

DO $seed$
DECLARE
    v_tid   uuid;
    v_su    uuid := '00000000-0000-0000-0000-000000000000';
    v_meta  jsonb := '{"_seed": {"pack": "302_org", "version": "2.0.0"}}'::jsonb;
    v_cc    record;
    v_root  uuid;
    v_ext   uuid;
    v_ic    uuid;
    v_inv   uuid;
    v_svc   uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE code = 'athyper';
    IF v_tid IS NULL THEN RAISE EXCEPTION 'Tenant ATHYPER not found'; END IF;

    -- Industry → company mapping for base posting leaves
    CREATE TEMP TABLE tmp_pc_leaves (
        company_code  text NOT NULL,
        header        text NOT NULL,   -- EXT, IC, INV, SVC
        suffix        text NOT NULL,
        pc_name       text NOT NULL,
        pc_type       text NOT NULL,   -- revenue, service, investment, shared
        sort_order    smallint NOT NULL,
        PRIMARY KEY (company_code, header, suffix)
    ) ON COMMIT DROP;

    INSERT INTO tmp_pc_leaves VALUES
    -- ─── HQ (holding — investment + services, minimal external) ─────────
    ('ATHQ', 'SVC', 'MGMT',    'Group Management Fees',     'service',    10),
    ('ATHQ', 'IC',  'INCOME',   'Intercompany Income',      'shared',     10),
    ('ATHQ', 'INV', 'RETURNS',  'Investment Returns',       'investment', 10),
    ('ATHQ', 'SVC', 'AUDIT',    'Internal Audit Services',  'service',    20),
    -- ─── Real Estate ────────────────────────────────────────────────────
    ('AMRE', 'EXT', 'RENTAL',   'Rental Income',            'revenue',    10),
    ('AMRE', 'EXT', 'PRODEV',   'Property Development',     'revenue',    20),
    ('AMRE', 'EXT', 'PROPSAL',  'Property Sales',           'revenue',    30),
    -- ─── Utilities ──────────────────────────────────────────────────────
    ('AQTU', 'EXT', 'ELEC',     'Electricity Sales',        'revenue',    10),
    ('AQTU', 'EXT', 'WATER',    'Water Supply',             'revenue',    20),
    ('AQTU', 'EXT', 'CONNECT',  'Connection Fees',          'revenue',    30),
    -- ─── Construction ───────────────────────────────────────────────────
    ('ASAC', 'EXT', 'BLDG',     'Building Construction',    'revenue',    10),
    ('ASAC', 'EXT', 'CIVIL',    'Civil Engineering',        'revenue',    20),
    ('ASAC', 'EXT', 'MEP',      'MEP Contracting',          'revenue',    30),
    -- ─── Transport ──────────────────────────────────────────────────────
    ('AQTS', 'EXT', 'FREIGHT',  'Freight & Haulage',        'revenue',    10),
    ('AQTS', 'EXT', 'WHSE',     'Warehousing & Storage',    'revenue',    20),
    ('AQTS', 'EXT', 'LASTMILE', 'Last Mile Delivery',       'revenue',    30),
    -- ─── Trading ────────────────────────────────────────────────────────
    ('AUET', 'EXT', 'WHLSALE',  'Wholesale',                'revenue',    10),
    ('AUET', 'EXT', 'RETAIL',   'Retail',                   'revenue',    20),
    ('AUET', 'EXT', 'ECOMM',    'E-Commerce',               'revenue',    30),
    -- ─── Hospitality ────────────────────────────────────────────────────
    ('ASAH', 'EXT', 'ROOMS',    'Rooms Revenue',            'revenue',    10),
    ('ASAH', 'EXT', 'FB',       'Food & Beverage Revenue',  'revenue',    20),
    ('ASAH', 'EXT', 'EVENTS',   'Events & Banqueting',      'revenue',    30),
    ('ASAH', 'EXT', 'SPA',      'Spa & Recreation',         'revenue',    40),
    -- ─── InfoComm ───────────────────────────────────────────────────────
    ('AUIC', 'EXT', 'SAAS',     'SaaS Recurring',           'revenue',    10),
    ('AUIC', 'EXT', 'CONSULT',  'Consulting & Implementation','revenue',  20),
    ('AUIC', 'EXT', 'LICENSE',  'License & IP',             'revenue',    30),
    -- ─── Financial ──────────────────────────────────────────────────────
    ('ASGF', 'EXT', 'LENDING',  'Lending & Interest',       'revenue',    10),
    ('ASGF', 'EXT', 'FEES',     'Fees & Commissions',       'revenue',    20),
    ('ASGF', 'INV', 'TRADING',  'Trading & Markets',        'investment', 10),
    ('ASGF', 'SVC', 'INSURANCE','Insurance Premiums',        'service',   10),
    -- ─── Textiles ───────────────────────────────────────────────────────
    ('AITM', 'EXT', 'GARMENT',  'Garments & Apparel',       'revenue',    10),
    ('AITM', 'EXT', 'FABRIC',   'Fabric Sales',             'revenue',    20),
    ('AITM', 'EXT', 'LEATHER',  'Leather Goods',            'revenue',    30),
    -- ─── F&B Manufacturing ──────────────────────────────────────────────
    ('ACFB', 'EXT', 'PACKAGED', 'Packaged Food',            'revenue',    10),
    ('ACFB', 'EXT', 'BEVERAGE', 'Beverages',                'revenue',    20),
    ('ACFB', 'EXT', 'INGREDNT', 'Ingredient / B2B',         'revenue',    30),
    -- ─── Pharma ─────────────────────────────────────────────────────────
    ('ADPM', 'EXT', 'BRANDED',  'Branded Products',         'revenue',    10),
    ('ADPM', 'EXT', 'GENERIC',  'Generic Products',         'revenue',    20),
    ('ADPM', 'EXT', 'API',      'API Third-Party Sales',    'revenue',    30),
    ('ADPM', 'SVC', 'LICENSING','Licensing & Royalties',     'service',   10),
    -- ─── Electronics ────────────────────────────────────────────────────
    ('ATEM', 'EXT', 'OEM',      'OEM Components',           'revenue',    10),
    ('ATEM', 'EXT', 'MODULE',   'Module Assembly',          'revenue',    20),
    ('ATEM', 'EXT', 'AFTERMKT', 'Aftermarket & Spares',     'revenue',    30),
    -- ─── Mining ─────────────────────────────────────────────────────────
    ('ASPE', 'EXT', 'CRUDE',    'Crude Oil Sales',          'revenue',    10),
    ('ASPE', 'EXT', 'GAS',      'Natural Gas Sales',        'revenue',    20),
    ('ASPE', 'EXT', 'NGL',      'NGL & Condensate',         'revenue',    30),
    -- ─── Agriculture ────────────────────────────────────────────────────
    ('AUKA', 'EXT', 'CROP',     'Crop Sales',               'revenue',    10),
    ('AUKA', 'EXT', 'LIVESTOCK','Livestock Sales',           'revenue',    20),
    ('AUKA', 'EXT', 'DAIRY',    'Dairy & Produce',          'revenue',    30),
    -- ─── Education ──────────────────────────────────────────────────────
    ('AJED', 'EXT', 'TUITION',  'Tuition Fees',             'revenue',    10),
    ('AJED', 'EXT', 'RESEARCH', 'Research Grants',          'revenue',    20),
    ('AJED', 'SVC', 'EXEC',     'Executive Education',       'service',   10),
    -- ─── Hospital ───────────────────────────────────────────────────────
    ('APHS', 'EXT', 'INPAT',    'Inpatient Services',       'revenue',    10),
    ('APHS', 'EXT', 'OUTPAT',   'Outpatient & Clinics',     'revenue',    20),
    ('APHS', 'EXT', 'PHARM',    'Pharmacy Revenue',         'revenue',    30),
    ('APHS', 'EXT', 'DIAG',     'Diagnostics Revenue',      'revenue',    40);

    FOR v_cc IN
        SELECT id, code, name FROM master.company_code
        WHERE tenant_id = v_tid AND status = 'active' ORDER BY code
    LOOP
        -- L1: Company root
        INSERT INTO master.profit_center
            (tenant_id, company_code_id, code, name,
             node_type, profit_center_type, level_no, parent_id,
             valid_from, sort_order, status, created_by, metadata)
        VALUES (v_tid, v_cc.id,
             v_cc.code || '-PC', v_cc.name || ' Profit Centers',
             'header', 'revenue', 1, NULL,
             '2020-01-01'::date, 0, 'active', v_su, v_meta)
        ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET
            name = EXCLUDED.name, updated_at = now(), updated_by = v_su
        WHERE master.profit_center.name IS DISTINCT FROM EXCLUDED.name;

        SELECT id INTO v_root FROM master.profit_center
        WHERE tenant_id = v_tid AND company_code_id = v_cc.id
          AND code = v_cc.code || '-PC';

        -- L2: 4 type headers (always created — gives structure even if no L3 yet)
        INSERT INTO master.profit_center
            (tenant_id, company_code_id, code, name,
             node_type, profit_center_type, level_no, parent_id,
             valid_from, sort_order, status, created_by, metadata) VALUES
        (v_tid,v_cc.id, v_cc.code||'-PC-EXT','External Business', 'header','revenue',   2,v_root,'2020-01-01'::date,100,'active',v_su,v_meta),
        (v_tid,v_cc.id, v_cc.code||'-PC-IC', 'Intercompany',     'header','shared',     2,v_root,'2020-01-01'::date,200,'active',v_su,v_meta),
        (v_tid,v_cc.id, v_cc.code||'-PC-INV','Investment',        'header','investment', 2,v_root,'2020-01-01'::date,300,'active',v_su,v_meta),
        (v_tid,v_cc.id, v_cc.code||'-PC-SVC','Internal Services', 'header','service',    2,v_root,'2020-01-01'::date,400,'active',v_su,v_meta)
        ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET
            name = EXCLUDED.name, parent_id = EXCLUDED.parent_id,
            profit_center_type = EXCLUDED.profit_center_type,
            updated_at = now(), updated_by = v_su
        WHERE (master.profit_center.name, master.profit_center.parent_id,
               master.profit_center.profit_center_type)
           IS DISTINCT FROM
              (EXCLUDED.name, EXCLUDED.parent_id, EXCLUDED.profit_center_type);

        SELECT id INTO v_ext FROM master.profit_center WHERE tenant_id=v_tid AND company_code_id=v_cc.id AND code=v_cc.code||'-PC-EXT';
        SELECT id INTO v_ic  FROM master.profit_center WHERE tenant_id=v_tid AND company_code_id=v_cc.id AND code=v_cc.code||'-PC-IC';
        SELECT id INTO v_inv FROM master.profit_center WHERE tenant_id=v_tid AND company_code_id=v_cc.id AND code=v_cc.code||'-PC-INV';
        SELECT id INTO v_svc FROM master.profit_center WHERE tenant_id=v_tid AND company_code_id=v_cc.id AND code=v_cc.code||'-PC-SVC';

        -- L3: Posting leaves from temp table
        INSERT INTO master.profit_center
            (tenant_id, company_code_id, code, name,
             node_type, profit_center_type, level_no, parent_id,
             valid_from, sort_order, status, created_by, metadata)
        SELECT
            v_tid, v_cc.id,
            v_cc.code || '-PC-' || p.header || '-' || p.suffix,
            p.pc_name,
            'posting', p.pc_type, 3,
            CASE p.header
                WHEN 'EXT' THEN v_ext
                WHEN 'IC'  THEN v_ic
                WHEN 'INV' THEN v_inv
                WHEN 'SVC' THEN v_svc
            END,
            '2020-01-01'::date,
            p.sort_order, 'active', v_su, v_meta
        FROM tmp_pc_leaves p
        WHERE p.company_code = v_cc.code
        ON CONFLICT (tenant_id, company_code_id, code) DO UPDATE SET
            name = EXCLUDED.name, parent_id = EXCLUDED.parent_id,
            profit_center_type = EXCLUDED.profit_center_type,
            updated_at = now(), updated_by = v_su
        WHERE (master.profit_center.name, master.profit_center.parent_id,
               master.profit_center.profit_center_type)
           IS DISTINCT FROM
              (EXCLUDED.name, EXCLUDED.parent_id, EXCLUDED.profit_center_type);

    END LOOP;

    -- ══════════════════════════════════════════════════════════════════════
    -- ASSERTIONS
    -- ══════════════════════════════════════════════════════════════════════

    -- A1: Every company has exactly 1 L1 root
    IF EXISTS (
        SELECT company_code_id FROM master.profit_center
        WHERE tenant_id = v_tid AND level_no = 1
        GROUP BY company_code_id HAVING count(*) != 1
    ) THEN RAISE EXCEPTION '302 FAIL: company with != 1 PC root'; END IF;

    -- A2: No posting node has NULL parent
    IF EXISTS (
        SELECT id FROM master.profit_center
        WHERE tenant_id = v_tid AND node_type = 'posting' AND parent_id IS NULL
    ) THEN RAISE EXCEPTION '302 FAIL: posting PC with NULL parent'; END IF;

    -- A3: Every company has at least 1 posting PC
    IF EXISTS (
        SELECT id FROM master.company_code cc
        WHERE cc.tenant_id = v_tid AND cc.status = 'active'
          AND NOT EXISTS (
              SELECT 1 FROM master.profit_center pc
              WHERE pc.tenant_id = v_tid AND pc.company_code_id = cc.id
                AND pc.node_type = 'posting')
    ) THEN RAISE EXCEPTION '302 FAIL: company with 0 posting PCs'; END IF;

    -- A4: No posting at L1 or L2
    IF EXISTS (
        SELECT id FROM master.profit_center
        WHERE tenant_id = v_tid AND node_type = 'posting' AND level_no < 3
    ) THEN RAISE EXCEPTION '302 FAIL: posting PC at level < 3'; END IF;

    -- A5: HQ has at least 1 investment or service PC
    IF NOT EXISTS (
        SELECT 1 FROM master.profit_center
        WHERE tenant_id = v_tid AND node_type = 'posting'
          AND profit_center_type IN ('investment', 'service')
          AND company_code_id = (SELECT id FROM master.company_code WHERE tenant_id = v_tid AND code = 'ATHQ')
    ) THEN RAISE EXCEPTION '302 FAIL: HQ missing investment/service PCs'; END IF;

    -- A6: All active companies represented (dynamic — not hard-coded)
    IF (SELECT count(DISTINCT company_code_id) FROM master.profit_center
        WHERE tenant_id = v_tid)
       !=
       (SELECT count(*) FROM master.company_code
        WHERE tenant_id = v_tid AND status = 'active')
    THEN RAISE EXCEPTION '302 FAIL: PC company count != active company_code count'; END IF;

    RAISE NOTICE '302: % profit centers across % companies (L1→L2→L3, multi-type)',
        (SELECT count(*) FROM master.profit_center WHERE tenant_id = v_tid),
        (SELECT count(DISTINCT company_code_id) FROM master.profit_center WHERE tenant_id = v_tid);
END $seed$;
