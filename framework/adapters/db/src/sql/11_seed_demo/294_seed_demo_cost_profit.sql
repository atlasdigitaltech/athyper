/* ============================================================================
   Athyper v2.1 — Cost Centers + Profit Centers Seed (Blueprint-Based)
   Tables: fin.cost_center, fin.profit_center, fin.operating_unit (UPDATE defaults)
   Dependencies: core.tenant, fin.operating_unit (from 291)

   Blueprint allocation:
     A: 1 CC, 0 PC
     B: 3 CC, 1 PC
     C: 6 CC (incl 2 project CCs), 2 PC
     D: 8 CC (incl SSC), 3 PC (incl SSC recharge)
     E: 6 CC (per branch), 3 PC (per branch)
     F: 10 CC (per entity), 4 PC (per entity)
   ============================================================================ */

-- ============================================================================
-- Helper: upsert cost center, return id
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.upsert_cc(
    p_tenant uuid, p_entity_code text, p_code text, p_name text, p_parent uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE v_id uuid;
BEGIN
    INSERT INTO fin.cost_center (id, tenant_id, entity_code, code, name, parent_id)
    VALUES (gen_random_uuid(), p_tenant, p_entity_code, p_code, p_name, p_parent)
    ON CONFLICT (tenant_id, entity_code, code) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_id;
    RETURN v_id;
END $fn$;

-- ============================================================================
-- Helper: upsert profit center, return id
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.upsert_pc(
    p_tenant uuid, p_entity_code text, p_code text, p_name text
) RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE v_id uuid;
BEGIN
    INSERT INTO fin.profit_center (id, tenant_id, entity_code, code, name)
    VALUES (gen_random_uuid(), p_tenant, p_entity_code, p_code, p_name)
    ON CONFLICT (tenant_id, entity_code, code) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_id;
    RETURN v_id;
END $fn$;

-- ============================================================================
-- Helper: set OU defaults (cost center + profit center)
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.set_ou_defaults(
    p_tenant uuid, p_entity_code text, p_ou_code text,
    p_cc_code text, p_pc_code text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE
    v_cc_id uuid;
    v_pc_id uuid;
BEGIN
    IF p_cc_code IS NOT NULL THEN
        SELECT id INTO v_cc_id FROM fin.cost_center
        WHERE tenant_id = p_tenant AND entity_code = p_entity_code AND code = p_cc_code;
    END IF;
    IF p_pc_code IS NOT NULL THEN
        SELECT id INTO v_pc_id FROM fin.profit_center
        WHERE tenant_id = p_tenant AND entity_code = p_entity_code AND code = p_pc_code;
    END IF;

    UPDATE fin.operating_unit
    SET default_cost_center_id = COALESCE(v_cc_id, default_cost_center_id),
        default_profit_center_id = COALESCE(v_pc_id, default_profit_center_id),
        updated_at = now()
    WHERE tenant_id = p_tenant AND entity_code = p_entity_code AND code = p_ou_code;
END $fn$;

-- ============================================================================
-- Main seed loop
-- ============================================================================
DO $$
DECLARE
    v_tenant uuid;
    v_code   text;
    v_id     uuid;
BEGIN
    FOR v_code IN SELECT code FROM core.tenant WHERE code LIKE 'demo_%' AND status = 'active' ORDER BY code LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        CASE v_code

            -- ================================================================
            -- Blueprint A: Freelancer/Solo — 1 CC, 0 PC
            -- ================================================================
            WHEN 'demo_my', 'demo_in' THEN
                PERFORM pg_temp.upsert_cc(v_tenant, 'HQ', 'CC-GENERAL', 'General');
                -- Map COMPANY OU → CC-GENERAL
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'HQ', 'COMPANY', 'CC-GENERAL');

            -- ================================================================
            -- Blueprint B: Small (0-25) — 3 CC, 1 PC
            -- ================================================================
            WHEN 'demo_sa', 'demo_qa' THEN
                PERFORM pg_temp.upsert_cc(v_tenant, 'HQ', 'CC-SALES', 'Sales');
                PERFORM pg_temp.upsert_cc(v_tenant, 'HQ', 'CC-OPS',   'Operations');
                PERFORM pg_temp.upsert_cc(v_tenant, 'HQ', 'CC-ADMIN', 'Administration');
                PERFORM pg_temp.upsert_pc(v_tenant, 'HQ', 'PC-MAIN',  'Main Business');
                -- Map dept OUs
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'HQ', 'COMPANY',    'CC-OPS',   'PC-MAIN');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'HQ', 'BRANCH-HQ',  'CC-OPS',   'PC-MAIN');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'HQ', 'DEPT-SALES', 'CC-SALES',  'PC-MAIN');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'HQ', 'DEPT-OPS',   'CC-OPS',    'PC-MAIN');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'HQ', 'DEPT-ADMIN', 'CC-ADMIN',  'PC-MAIN');

            -- ================================================================
            -- Blueprint C: SME (≤200) — 6 CC, 2 PC
            -- ================================================================
            WHEN 'demo_fr', 'demo_de' THEN
                PERFORM pg_temp.upsert_cc(v_tenant, 'HQ', 'CC-SALES',    'Sales');
                PERFORM pg_temp.upsert_cc(v_tenant, 'HQ', 'CC-DELIVERY', 'Service Delivery');
                PERFORM pg_temp.upsert_cc(v_tenant, 'HQ', 'CC-RD',       'R&D');
                PERFORM pg_temp.upsert_cc(v_tenant, 'HQ', 'CC-ADMIN',    'Administration');
                PERFORM pg_temp.upsert_cc(v_tenant, 'HQ', 'CC-PROJ-1',   'Project Alpha');
                PERFORM pg_temp.upsert_cc(v_tenant, 'HQ', 'CC-PROJ-2',   'Project Beta');
                PERFORM pg_temp.upsert_pc(v_tenant, 'HQ', 'PC-PRODUCTS', 'Products Division');
                PERFORM pg_temp.upsert_pc(v_tenant, 'HQ', 'PC-SERVICES', 'Services Division');
                -- Map OUs
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'HQ', 'COMPANY',      'CC-ADMIN');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'HQ', 'DIV-PRODUCTS', 'CC-RD',       'PC-PRODUCTS');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'HQ', 'DIV-SERVICES', 'CC-DELIVERY', 'PC-SERVICES');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'HQ', 'DEPT-SALES',   'CC-SALES',    'PC-PRODUCTS');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'HQ', 'DEPT-RD',      'CC-RD',       'PC-PRODUCTS');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'HQ', 'DEPT-DELIVERY','CC-DELIVERY', 'PC-SERVICES');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'HQ', 'DEPT-SUPPORT', 'CC-DELIVERY', 'PC-SERVICES');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'HQ', 'DEPT-ADMIN',   'CC-ADMIN');

            -- ================================================================
            -- Blueprint D: Big single country — 8 CC, 3 PC
            -- ================================================================
            WHEN 'demo_us' THEN
                PERFORM pg_temp.upsert_cc(v_tenant, 'HQ', 'CC-SALES-E',  'Sales East');
                PERFORM pg_temp.upsert_cc(v_tenant, 'HQ', 'CC-SALES-W',  'Sales West');
                PERFORM pg_temp.upsert_cc(v_tenant, 'HQ', 'CC-OPS-E',    'Operations East');
                PERFORM pg_temp.upsert_cc(v_tenant, 'HQ', 'CC-OPS-W',    'Operations West');
                PERFORM pg_temp.upsert_cc(v_tenant, 'HQ', 'CC-ADMIN',    'Corporate Admin');
                PERFORM pg_temp.upsert_cc(v_tenant, 'HQ', 'CC-SSC-IT',   'Shared Services - IT');
                PERFORM pg_temp.upsert_cc(v_tenant, 'HQ', 'CC-SSC-HR',   'Shared Services - HR');
                PERFORM pg_temp.upsert_cc(v_tenant, 'HQ', 'CC-SSC-FIN',  'Shared Services - Finance');
                PERFORM pg_temp.upsert_pc(v_tenant, 'HQ', 'PC-EAST',  'East Region');
                PERFORM pg_temp.upsert_pc(v_tenant, 'HQ', 'PC-WEST',  'West Region');
                PERFORM pg_temp.upsert_pc(v_tenant, 'HQ', 'PC-SSC',   'Shared Services Center');
                -- Map OUs
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'HQ', 'COMPANY',      'CC-ADMIN');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'HQ', 'REGION-EAST',  'CC-OPS-E',   'PC-EAST');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'HQ', 'REGION-WEST',  'CC-OPS-W',   'PC-WEST');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'HQ', 'BRANCH-NYC',   'CC-OPS-E',   'PC-EAST');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'HQ', 'BRANCH-ATL',   'CC-OPS-E',   'PC-EAST');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'HQ', 'BRANCH-SF',    'CC-OPS-W',   'PC-WEST');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'HQ', 'BRANCH-SEA',   'CC-OPS-W',   'PC-WEST');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'HQ', 'DEPT-NYC-SALES','CC-SALES-E', 'PC-EAST');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'HQ', 'DEPT-NYC-OPS',  'CC-OPS-E',   'PC-EAST');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'HQ', 'DEPT-ATL-SALES','CC-SALES-E', 'PC-EAST');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'HQ', 'DEPT-ATL-OPS',  'CC-OPS-E',   'PC-EAST');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'HQ', 'DEPT-SF-SALES', 'CC-SALES-W', 'PC-WEST');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'HQ', 'DEPT-SF-OPS',   'CC-OPS-W',   'PC-WEST');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'HQ', 'DEPT-SEA-SALES','CC-SALES-W', 'PC-WEST');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'HQ', 'DEPT-SEA-OPS',  'CC-OPS-W',   'PC-WEST');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'HQ', 'SSC',           'CC-SSC-IT',  'PC-SSC');

            -- ================================================================
            -- Blueprint E: Multi-location — 6 CC (per branch), 3 PC (per branch)
            -- ================================================================
            WHEN 'demo_ch' THEN
                PERFORM pg_temp.upsert_cc(v_tenant, 'HQ', 'CC-ZH-SALES', 'Zurich Sales');
                PERFORM pg_temp.upsert_cc(v_tenant, 'HQ', 'CC-ZH-OPS',   'Zurich Operations');
                PERFORM pg_temp.upsert_cc(v_tenant, 'HQ', 'CC-GVA-SALES','Geneva Sales');
                PERFORM pg_temp.upsert_cc(v_tenant, 'HQ', 'CC-GVA-OPS',  'Geneva Operations');
                PERFORM pg_temp.upsert_cc(v_tenant, 'HQ', 'CC-BSL-SALES','Basel Sales');
                PERFORM pg_temp.upsert_cc(v_tenant, 'HQ', 'CC-BSL-OPS',  'Basel Operations');
                PERFORM pg_temp.upsert_pc(v_tenant, 'HQ', 'PC-ZH',  'Zurich');
                PERFORM pg_temp.upsert_pc(v_tenant, 'HQ', 'PC-GVA', 'Geneva');
                PERFORM pg_temp.upsert_pc(v_tenant, 'HQ', 'PC-BSL', 'Basel');
                -- Map OUs
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'HQ', 'COMPANY',       'CC-ZH-OPS');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'HQ', 'BRANCH-ZH',     'CC-ZH-OPS',   'PC-ZH');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'HQ', 'BRANCH-GVA',    'CC-GVA-OPS',  'PC-GVA');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'HQ', 'BRANCH-BSL',    'CC-BSL-OPS',  'PC-BSL');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'HQ', 'DEPT-ZH-SALES', 'CC-ZH-SALES', 'PC-ZH');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'HQ', 'DEPT-ZH-OPS',   'CC-ZH-OPS',   'PC-ZH');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'HQ', 'DEPT-GVA-SALES','CC-GVA-SALES','PC-GVA');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'HQ', 'DEPT-GVA-OPS',  'CC-GVA-OPS',  'PC-GVA');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'HQ', 'DEPT-BSL-SALES','CC-BSL-SALES','PC-BSL');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'HQ', 'DEPT-BSL-OPS',  'CC-BSL-OPS',  'PC-BSL');

            -- ================================================================
            -- Blueprint F: Multi-country — 10 CC (per entity), 4 PC (per entity)
            -- ================================================================
            WHEN 'demo_ca' THEN
                -- LE-CA (Holding)
                PERFORM pg_temp.upsert_cc(v_tenant, 'LE-CA', 'CC-CA-FINANCE', 'Canada Finance');
                PERFORM pg_temp.upsert_cc(v_tenant, 'LE-CA', 'CC-CA-ADMIN',   'Canada Admin');
                PERFORM pg_temp.upsert_pc(v_tenant, 'LE-CA', 'PC-LE-CA',      'Canada Holding');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'LE-CA', 'LE-CA',         'CC-CA-FINANCE', 'PC-LE-CA');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'LE-CA', 'DEPT-CA-FIN',   'CC-CA-FINANCE', 'PC-LE-CA');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'LE-CA', 'DEPT-CA-ADMIN', 'CC-CA-ADMIN',   'PC-LE-CA');

                -- LE-MY (Subsidiary)
                PERFORM pg_temp.upsert_cc(v_tenant, 'LE-MY', 'CC-MY-OPS',   'Malaysia Operations');
                PERFORM pg_temp.upsert_cc(v_tenant, 'LE-MY', 'CC-MY-SALES', 'Malaysia Sales');
                PERFORM pg_temp.upsert_pc(v_tenant, 'LE-MY', 'PC-LE-MY',    'Malaysia Subsidiary');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'LE-MY', 'LE-MY',         'CC-MY-OPS',   'PC-LE-MY');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'LE-MY', 'DEPT-MY-OPS',   'CC-MY-OPS',   'PC-LE-MY');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'LE-MY', 'DEPT-MY-SALES', 'CC-MY-SALES', 'PC-LE-MY');

                -- LE-SA (Subsidiary)
                PERFORM pg_temp.upsert_cc(v_tenant, 'LE-SA', 'CC-SA-OPS',   'Saudi Operations');
                PERFORM pg_temp.upsert_cc(v_tenant, 'LE-SA', 'CC-SA-SALES', 'Saudi Sales');
                PERFORM pg_temp.upsert_pc(v_tenant, 'LE-SA', 'PC-LE-SA',    'Saudi Subsidiary');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'LE-SA', 'LE-SA',         'CC-SA-OPS',   'PC-LE-SA');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'LE-SA', 'DEPT-SA-OPS',   'CC-SA-OPS',   'PC-LE-SA');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'LE-SA', 'DEPT-SA-SALES', 'CC-SA-SALES', 'PC-LE-SA');

                -- LE-IN (Subsidiary)
                PERFORM pg_temp.upsert_cc(v_tenant, 'LE-IN', 'CC-IN-OPS',   'India Operations');
                PERFORM pg_temp.upsert_cc(v_tenant, 'LE-IN', 'CC-IN-SALES', 'India Sales');
                PERFORM pg_temp.upsert_pc(v_tenant, 'LE-IN', 'PC-LE-IN',    'India Subsidiary');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'LE-IN', 'LE-IN',         'CC-IN-OPS',   'PC-LE-IN');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'LE-IN', 'DEPT-IN-OPS',   'CC-IN-OPS',   'PC-LE-IN');
                PERFORM pg_temp.set_ou_defaults(v_tenant, 'LE-IN', 'DEPT-IN-SALES', 'CC-IN-SALES', 'PC-LE-IN');

            ELSE
                RAISE NOTICE 'Centers: No blueprint mapping for tenant %', v_code;
        END CASE;

        RAISE NOTICE 'Cost/profit centers seeded for tenant %', v_code;
    END LOOP;
END $$;
