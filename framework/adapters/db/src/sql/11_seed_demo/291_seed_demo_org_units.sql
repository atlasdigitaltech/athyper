/* ============================================================================
   Athyper v2.1 — Org Hierarchy Seed (Blueprint-Based)
   Tables: core.organizational_unit, fin.operating_unit
   Dependencies: core.tenant
   ============================================================================ */

-- ============================================================================
-- DDL Patch: Ensure 1:1 mapping between core OU and fin OU
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM fin.operating_unit
    WHERE org_unit_id IS NOT NULL
    GROUP BY tenant_id, org_unit_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate fin.operating_unit(tenant_id, org_unit_id) exists; clean before adding constraint';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_fin_ou_org_unit'
  ) THEN
    ALTER TABLE fin.operating_unit
      ADD CONSTRAINT uq_fin_ou_org_unit UNIQUE (tenant_id, org_unit_id);
  END IF;
END $$;

-- ============================================================================
-- Helper: upsert core OU and return id
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.upsert_core_ou(
    p_tenant uuid, p_code text, p_name text, p_parent uuid
) RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE v_id uuid;
BEGIN
    INSERT INTO core.organizational_unit (id, tenant_id, code, name, parent_id, created_by)
    VALUES (gen_random_uuid(), p_tenant, p_code, p_name, p_parent, 'seed')
    ON CONFLICT (tenant_id, code) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_id;
    RETURN v_id;
END $fn$;

-- ============================================================================
-- Helper: upsert fin operating_unit and return id
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.upsert_fin_ou(
    p_tenant uuid, p_org_unit_id uuid, p_entity_code text,
    p_code text, p_name text, p_parent uuid, p_level smallint, p_currency text
) RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE v_id uuid;
BEGIN
    INSERT INTO fin.operating_unit (id, tenant_id, org_unit_id, entity_code, code, name, parent_id, level, status, activated_at, default_currency_code, created_at, updated_at)
    VALUES (gen_random_uuid(), p_tenant, p_org_unit_id, p_entity_code, p_code, p_name, p_parent, p_level, 'ACTIVE', now(), p_currency, now(), now())
    ON CONFLICT (tenant_id, entity_code, code) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_id;
    RETURN v_id;
END $fn$;

-- ============================================================================
-- Blueprint A: Freelancer (demo_my, demo_in) — 1 OU each
-- ============================================================================
DO $$
DECLARE
    v_tenant uuid; v_code text; v_currency text; v_name text;
    v_ou_company uuid; v_fin_company uuid;
BEGIN
    FOR v_code, v_currency, v_name IN VALUES
        ('demo_my', 'MYR', 'Demo Malaysia Sdn Bhd'),
        ('demo_in', 'INR', 'Demo India Pvt Ltd')
    LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        v_ou_company := pg_temp.upsert_core_ou(v_tenant, 'COMPANY', v_name, NULL);
        v_fin_company := pg_temp.upsert_fin_ou(v_tenant, v_ou_company, 'HQ', 'COMPANY', v_name, NULL, 1::smallint, v_currency);

        RAISE NOTICE 'Blueprint A: % — 1 OU', v_code;
    END LOOP;
END $$;

-- ============================================================================
-- Blueprint B: Small 0-25 (demo_sa, demo_qa) — 5 OUs each
-- ============================================================================
DO $$
DECLARE
    v_tenant uuid; v_code text; v_currency text; v_name text;
    v_ou_company uuid; v_ou_branch uuid; v_ou_dept uuid;
    v_fin_company uuid; v_fin_branch uuid; v_fin_dept uuid;
BEGIN
    FOR v_code, v_currency, v_name IN VALUES
        ('demo_sa', 'SAR', 'Demo Saudi LLC'),
        ('demo_qa', 'QAR', 'Demo Qatar WLL')
    LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        -- COMPANY
        v_ou_company := pg_temp.upsert_core_ou(v_tenant, 'COMPANY', v_name, NULL);
        v_fin_company := pg_temp.upsert_fin_ou(v_tenant, v_ou_company, 'HQ', 'COMPANY', v_name, NULL, 1::smallint, v_currency);

        -- BRANCH (single)
        v_ou_branch := pg_temp.upsert_core_ou(v_tenant, 'BRANCH-HQ', 'Head Office', v_ou_company);
        v_fin_branch := pg_temp.upsert_fin_ou(v_tenant, v_ou_branch, 'HQ', 'BRANCH-HQ', 'Head Office', v_fin_company, 2::smallint, v_currency);

        -- Departments
        v_ou_dept := pg_temp.upsert_core_ou(v_tenant, 'DEPT-SALES', 'Sales', v_ou_branch);
        v_fin_dept := pg_temp.upsert_fin_ou(v_tenant, v_ou_dept, 'HQ', 'DEPT-SALES', 'Sales', v_fin_branch, 3::smallint, v_currency);

        v_ou_dept := pg_temp.upsert_core_ou(v_tenant, 'DEPT-OPS', 'Operations', v_ou_branch);
        v_fin_dept := pg_temp.upsert_fin_ou(v_tenant, v_ou_dept, 'HQ', 'DEPT-OPS', 'Operations', v_fin_branch, 3::smallint, v_currency);

        v_ou_dept := pg_temp.upsert_core_ou(v_tenant, 'DEPT-ADMIN', 'Administration', v_ou_branch);
        v_fin_dept := pg_temp.upsert_fin_ou(v_tenant, v_ou_dept, 'HQ', 'DEPT-ADMIN', 'Administration', v_fin_branch, 3::smallint, v_currency);

        RAISE NOTICE 'Blueprint B: % — 5 OUs', v_code;
    END LOOP;
END $$;

-- ============================================================================
-- Blueprint C: SME ≤200 (demo_fr, demo_de) — 8 OUs each
-- ============================================================================
DO $$
DECLARE
    v_tenant uuid; v_code text; v_currency text; v_name text;
    v_ou_company uuid; v_ou_div uuid; v_ou_branch uuid; v_ou_dept uuid;
    v_fin_company uuid; v_fin_div uuid; v_fin_branch uuid; v_fin_dept uuid;
BEGIN
    FOR v_code, v_currency, v_name IN VALUES
        ('demo_fr', 'EUR', 'Demo France SAS'),
        ('demo_de', 'EUR', 'Demo Deutschland GmbH')
    LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        -- COMPANY
        v_ou_company := pg_temp.upsert_core_ou(v_tenant, 'COMPANY', v_name, NULL);
        v_fin_company := pg_temp.upsert_fin_ou(v_tenant, v_ou_company, 'HQ', 'COMPANY', v_name, NULL, 1::smallint, v_currency);

        -- DIVISION: Products
        v_ou_div := pg_temp.upsert_core_ou(v_tenant, 'DIV-PRODUCTS', 'Products Division', v_ou_company);
        v_fin_div := pg_temp.upsert_fin_ou(v_tenant, v_ou_div, 'HQ', 'DIV-PRODUCTS', 'Products Division', v_fin_company, 2::smallint, v_currency);

        v_ou_branch := pg_temp.upsert_core_ou(v_tenant, 'BRANCH-PROD', 'Products Office', v_ou_div);
        v_fin_branch := pg_temp.upsert_fin_ou(v_tenant, v_ou_branch, 'HQ', 'BRANCH-PROD', 'Products Office', v_fin_div, 3::smallint, v_currency);

        v_ou_dept := pg_temp.upsert_core_ou(v_tenant, 'DEPT-PROD-ENG', 'Product Engineering', v_ou_branch);
        v_fin_dept := pg_temp.upsert_fin_ou(v_tenant, v_ou_dept, 'HQ', 'DEPT-PROD-ENG', 'Product Engineering', v_fin_branch, 3::smallint, v_currency);

        -- DIVISION: Services
        v_ou_div := pg_temp.upsert_core_ou(v_tenant, 'DIV-SERVICES', 'Services Division', v_ou_company);
        v_fin_div := pg_temp.upsert_fin_ou(v_tenant, v_ou_div, 'HQ', 'DIV-SERVICES', 'Services Division', v_fin_company, 2::smallint, v_currency);

        v_ou_branch := pg_temp.upsert_core_ou(v_tenant, 'BRANCH-SVC', 'Services Office', v_ou_div);
        v_fin_branch := pg_temp.upsert_fin_ou(v_tenant, v_ou_branch, 'HQ', 'BRANCH-SVC', 'Services Office', v_fin_div, 3::smallint, v_currency);

        v_ou_dept := pg_temp.upsert_core_ou(v_tenant, 'DEPT-SVC-DELIVERY', 'Service Delivery', v_ou_branch);
        v_fin_dept := pg_temp.upsert_fin_ou(v_tenant, v_ou_dept, 'HQ', 'DEPT-SVC-DELIVERY', 'Service Delivery', v_fin_branch, 3::smallint, v_currency);

        RAISE NOTICE 'Blueprint C: % — 8 OUs', v_code;
    END LOOP;
END $$;

-- ============================================================================
-- Blueprint D: Big single country (demo_us) — 12 OUs
-- ============================================================================
DO $$
DECLARE
    v_tenant uuid;
    v_ou_company uuid; v_ou_region uuid; v_ou_branch uuid; v_ou_dept uuid; v_ou_ssc uuid;
    v_fin_company uuid; v_fin_region uuid; v_fin_branch uuid; v_fin_dept uuid; v_fin_ssc uuid;
BEGIN
    SELECT id INTO v_tenant FROM core.tenant WHERE code = 'demo_us';
    IF v_tenant IS NULL THEN RETURN; END IF;

    -- COMPANY
    v_ou_company := pg_temp.upsert_core_ou(v_tenant, 'COMPANY', 'Demo US Corp', NULL);
    v_fin_company := pg_temp.upsert_fin_ou(v_tenant, v_ou_company, 'HQ', 'COMPANY', 'Demo US Corp', NULL, 1::smallint, 'USD');

    -- REGION EAST
    v_ou_region := pg_temp.upsert_core_ou(v_tenant, 'REGION-EAST', 'East Region', v_ou_company);
    v_fin_region := pg_temp.upsert_fin_ou(v_tenant, v_ou_region, 'HQ', 'REGION-EAST', 'East Region', v_fin_company, 2::smallint, 'USD');

    v_ou_branch := pg_temp.upsert_core_ou(v_tenant, 'BRANCH-NY', 'New York Office', v_ou_region);
    v_fin_branch := pg_temp.upsert_fin_ou(v_tenant, v_ou_branch, 'HQ', 'BRANCH-NY', 'New York Office', v_fin_region, 3::smallint, 'USD');

    v_ou_dept := pg_temp.upsert_core_ou(v_tenant, 'DEPT-NY-SALES', 'NY Sales', v_ou_branch);
    v_fin_dept := pg_temp.upsert_fin_ou(v_tenant, v_ou_dept, 'HQ', 'DEPT-NY-SALES', 'NY Sales', v_fin_branch, 3::smallint, 'USD');

    v_ou_dept := pg_temp.upsert_core_ou(v_tenant, 'DEPT-NY-OPS', 'NY Operations', v_ou_branch);
    v_fin_dept := pg_temp.upsert_fin_ou(v_tenant, v_ou_dept, 'HQ', 'DEPT-NY-OPS', 'NY Operations', v_fin_branch, 3::smallint, 'USD');

    -- REGION WEST
    v_ou_region := pg_temp.upsert_core_ou(v_tenant, 'REGION-WEST', 'West Region', v_ou_company);
    v_fin_region := pg_temp.upsert_fin_ou(v_tenant, v_ou_region, 'HQ', 'REGION-WEST', 'West Region', v_fin_company, 2::smallint, 'USD');

    v_ou_branch := pg_temp.upsert_core_ou(v_tenant, 'BRANCH-CA', 'California Office', v_ou_region);
    v_fin_branch := pg_temp.upsert_fin_ou(v_tenant, v_ou_branch, 'HQ', 'BRANCH-CA', 'California Office', v_fin_region, 3::smallint, 'USD');

    v_ou_dept := pg_temp.upsert_core_ou(v_tenant, 'DEPT-CA-SALES', 'CA Sales', v_ou_branch);
    v_fin_dept := pg_temp.upsert_fin_ou(v_tenant, v_ou_dept, 'HQ', 'DEPT-CA-SALES', 'CA Sales', v_fin_branch, 3::smallint, 'USD');

    v_ou_dept := pg_temp.upsert_core_ou(v_tenant, 'DEPT-CA-OPS', 'CA Operations', v_ou_branch);
    v_fin_dept := pg_temp.upsert_fin_ou(v_tenant, v_ou_dept, 'HQ', 'DEPT-CA-OPS', 'CA Operations', v_fin_branch, 3::smallint, 'USD');

    -- SSC (Shared Services Center — OU under COMPANY, not a separate entity_code)
    v_ou_ssc := pg_temp.upsert_core_ou(v_tenant, 'SSC', 'Shared Services Center', v_ou_company);
    v_fin_ssc := pg_temp.upsert_fin_ou(v_tenant, v_ou_ssc, 'HQ', 'SSC', 'Shared Services Center', v_fin_company, 2::smallint, 'USD');

    v_ou_dept := pg_temp.upsert_core_ou(v_tenant, 'SSC-IT', 'SSC IT Services', v_ou_ssc);
    v_fin_dept := pg_temp.upsert_fin_ou(v_tenant, v_ou_dept, 'HQ', 'SSC-IT', 'SSC IT Services', v_fin_ssc, 3::smallint, 'USD');

    RAISE NOTICE 'Blueprint D: demo_us — 12 OUs';
END $$;

-- ============================================================================
-- Blueprint E: Multi-location (demo_ch) — 9 OUs, single entity_code 'HQ'
-- ============================================================================
DO $$
DECLARE
    v_tenant uuid;
    v_ou_company uuid; v_ou_branch uuid; v_ou_dept uuid;
    v_fin_company uuid; v_fin_branch uuid; v_fin_dept uuid;
BEGIN
    SELECT id INTO v_tenant FROM core.tenant WHERE code = 'demo_ch';
    IF v_tenant IS NULL THEN RETURN; END IF;

    -- COMPANY
    v_ou_company := pg_temp.upsert_core_ou(v_tenant, 'COMPANY', 'Demo Schweiz AG', NULL);
    v_fin_company := pg_temp.upsert_fin_ou(v_tenant, v_ou_company, 'HQ', 'COMPANY', 'Demo Schweiz AG', NULL, 1::smallint, 'CHF');

    -- BRANCH: Zurich (HQ branch)
    v_ou_branch := pg_temp.upsert_core_ou(v_tenant, 'BRANCH-ZH', 'Zurich Office', v_ou_company);
    v_fin_branch := pg_temp.upsert_fin_ou(v_tenant, v_ou_branch, 'HQ', 'BRANCH-ZH', 'Zurich Office', v_fin_company, 2::smallint, 'CHF');

    v_ou_dept := pg_temp.upsert_core_ou(v_tenant, 'DEPT-ZH-SALES', 'ZH Sales', v_ou_branch);
    v_fin_dept := pg_temp.upsert_fin_ou(v_tenant, v_ou_dept, 'HQ', 'DEPT-ZH-SALES', 'ZH Sales', v_fin_branch, 3::smallint, 'CHF');

    v_ou_dept := pg_temp.upsert_core_ou(v_tenant, 'DEPT-ZH-OPS', 'ZH Operations', v_ou_branch);
    v_fin_dept := pg_temp.upsert_fin_ou(v_tenant, v_ou_dept, 'HQ', 'DEPT-ZH-OPS', 'ZH Operations', v_fin_branch, 3::smallint, 'CHF');

    -- BRANCH: Geneva
    v_ou_branch := pg_temp.upsert_core_ou(v_tenant, 'BRANCH-GVA', 'Geneva Office', v_ou_company);
    v_fin_branch := pg_temp.upsert_fin_ou(v_tenant, v_ou_branch, 'HQ', 'BRANCH-GVA', 'Geneva Office', v_fin_company, 2::smallint, 'CHF');

    v_ou_dept := pg_temp.upsert_core_ou(v_tenant, 'DEPT-GVA-SALES', 'GVA Sales', v_ou_branch);
    v_fin_dept := pg_temp.upsert_fin_ou(v_tenant, v_ou_dept, 'HQ', 'DEPT-GVA-SALES', 'GVA Sales', v_fin_branch, 3::smallint, 'CHF');

    v_ou_dept := pg_temp.upsert_core_ou(v_tenant, 'DEPT-GVA-OPS', 'GVA Operations', v_ou_branch);
    v_fin_dept := pg_temp.upsert_fin_ou(v_tenant, v_ou_dept, 'HQ', 'DEPT-GVA-OPS', 'GVA Operations', v_fin_branch, 3::smallint, 'CHF');

    -- BRANCH: Basel
    v_ou_branch := pg_temp.upsert_core_ou(v_tenant, 'BRANCH-BSL', 'Basel Office', v_ou_company);
    v_fin_branch := pg_temp.upsert_fin_ou(v_tenant, v_ou_branch, 'HQ', 'BRANCH-BSL', 'Basel Office', v_fin_company, 2::smallint, 'CHF');

    v_ou_dept := pg_temp.upsert_core_ou(v_tenant, 'DEPT-BSL-SALES', 'BSL Sales', v_ou_branch);
    v_fin_dept := pg_temp.upsert_fin_ou(v_tenant, v_ou_dept, 'HQ', 'DEPT-BSL-SALES', 'BSL Sales', v_fin_branch, 3::smallint, 'CHF');

    v_ou_dept := pg_temp.upsert_core_ou(v_tenant, 'DEPT-BSL-OPS', 'BSL Operations', v_ou_branch);
    v_fin_dept := pg_temp.upsert_fin_ou(v_tenant, v_ou_dept, 'HQ', 'DEPT-BSL-OPS', 'BSL Operations', v_fin_branch, 3::smallint, 'CHF');

    RAISE NOTICE 'Blueprint E: demo_ch — 9 OUs (single entity_code HQ)';
END $$;

-- ============================================================================
-- Blueprint F: Multi-country (demo_ca) — 13 OUs, 4 entity_codes
-- ============================================================================
DO $$
DECLARE
    v_tenant uuid;
    v_ou_company uuid; v_ou_le uuid; v_ou_dept uuid;
    v_fin_company uuid; v_fin_le uuid; v_fin_dept uuid;
BEGIN
    SELECT id INTO v_tenant FROM core.tenant WHERE code = 'demo_ca';
    IF v_tenant IS NULL THEN RETURN; END IF;

    -- COMPANY (group shell)
    v_ou_company := pg_temp.upsert_core_ou(v_tenant, 'COMPANY', 'Demo Group Holdings', NULL);
    -- Group shell has entity_code LE-CA (the holding is itself a legal entity)
    v_fin_company := pg_temp.upsert_fin_ou(v_tenant, v_ou_company, 'LE-CA', 'COMPANY', 'Demo Group Holdings', NULL, 1::smallint, 'CAD');

    -- LE-CA: Canada Holding
    v_ou_le := pg_temp.upsert_core_ou(v_tenant, 'LE-CA', 'Demo Canada Inc', v_ou_company);
    v_fin_le := pg_temp.upsert_fin_ou(v_tenant, v_ou_le, 'LE-CA', 'LE-CA', 'Demo Canada Inc', v_fin_company, 2::smallint, 'CAD');

    v_ou_dept := pg_temp.upsert_core_ou(v_tenant, 'DEPT-CA-FINANCE', 'CA Finance', v_ou_le);
    v_fin_dept := pg_temp.upsert_fin_ou(v_tenant, v_ou_dept, 'LE-CA', 'DEPT-CA-FINANCE', 'CA Finance', v_fin_le, 3::smallint, 'CAD');

    v_ou_dept := pg_temp.upsert_core_ou(v_tenant, 'DEPT-CA-ADMIN', 'CA Administration', v_ou_le);
    v_fin_dept := pg_temp.upsert_fin_ou(v_tenant, v_ou_dept, 'LE-CA', 'DEPT-CA-ADMIN', 'CA Administration', v_fin_le, 3::smallint, 'CAD');

    -- LE-MY: Malaysia Subsidiary
    v_ou_le := pg_temp.upsert_core_ou(v_tenant, 'LE-MY', 'Demo Malaysia Sdn Bhd', v_ou_company);
    v_fin_le := pg_temp.upsert_fin_ou(v_tenant, v_ou_le, 'LE-MY', 'LE-MY', 'Demo Malaysia Sdn Bhd', v_fin_company, 2::smallint, 'MYR');

    v_ou_dept := pg_temp.upsert_core_ou(v_tenant, 'DEPT-MY-OPS', 'MY Operations', v_ou_le);
    v_fin_dept := pg_temp.upsert_fin_ou(v_tenant, v_ou_dept, 'LE-MY', 'DEPT-MY-OPS', 'MY Operations', v_fin_le, 3::smallint, 'MYR');

    v_ou_dept := pg_temp.upsert_core_ou(v_tenant, 'DEPT-MY-SALES', 'MY Sales', v_ou_le);
    v_fin_dept := pg_temp.upsert_fin_ou(v_tenant, v_ou_dept, 'LE-MY', 'DEPT-MY-SALES', 'MY Sales', v_fin_le, 3::smallint, 'MYR');

    -- LE-SA: Saudi Subsidiary
    v_ou_le := pg_temp.upsert_core_ou(v_tenant, 'LE-SA', 'Demo Saudi LLC', v_ou_company);
    v_fin_le := pg_temp.upsert_fin_ou(v_tenant, v_ou_le, 'LE-SA', 'LE-SA', 'Demo Saudi LLC', v_fin_company, 2::smallint, 'SAR');

    v_ou_dept := pg_temp.upsert_core_ou(v_tenant, 'DEPT-SA-OPS', 'SA Operations', v_ou_le);
    v_fin_dept := pg_temp.upsert_fin_ou(v_tenant, v_ou_dept, 'LE-SA', 'DEPT-SA-OPS', 'SA Operations', v_fin_le, 3::smallint, 'SAR');

    v_ou_dept := pg_temp.upsert_core_ou(v_tenant, 'DEPT-SA-SALES', 'SA Sales', v_ou_le);
    v_fin_dept := pg_temp.upsert_fin_ou(v_tenant, v_ou_dept, 'LE-SA', 'DEPT-SA-SALES', 'SA Sales', v_fin_le, 3::smallint, 'SAR');

    -- LE-IN: India Subsidiary
    v_ou_le := pg_temp.upsert_core_ou(v_tenant, 'LE-IN', 'Demo India Pvt Ltd', v_ou_company);
    v_fin_le := pg_temp.upsert_fin_ou(v_tenant, v_ou_le, 'LE-IN', 'LE-IN', 'Demo India Pvt Ltd', v_fin_company, 2::smallint, 'INR');

    v_ou_dept := pg_temp.upsert_core_ou(v_tenant, 'DEPT-IN-OPS', 'IN Operations', v_ou_le);
    v_fin_dept := pg_temp.upsert_fin_ou(v_tenant, v_ou_dept, 'LE-IN', 'DEPT-IN-OPS', 'IN Operations', v_fin_le, 3::smallint, 'INR');

    v_ou_dept := pg_temp.upsert_core_ou(v_tenant, 'DEPT-IN-SALES', 'IN Sales', v_ou_le);
    v_fin_dept := pg_temp.upsert_fin_ou(v_tenant, v_ou_dept, 'LE-IN', 'DEPT-IN-SALES', 'IN Sales', v_fin_le, 3::smallint, 'INR');

    RAISE NOTICE 'Blueprint F: demo_ca — 13 OUs (4 entity_codes: LE-CA, LE-MY, LE-SA, LE-IN)';
END $$;
