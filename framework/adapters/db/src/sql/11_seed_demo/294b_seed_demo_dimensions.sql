/* ============================================================================
   Athyper v2.3 — Universal Ledger Dimension Seed (Blueprint-Based)
   Tables: fin.dimension_type, fin.dimension_value, fin.dimension_policy,
           fin.ou_dimension_default
   Dependencies: core.tenant, fin.operating_unit (from 291),
                 fin.cost_center, fin.profit_center (from 294),
                 fin.dimension_type, fin.dimension_value (from 191)

   Migrates existing cost_center/profit_center data into the universal
   dimension model and adds new dimension types per blueprint tier.

   Blueprint dimension allocation:
     A: 2 types (CC, PC)                    — 1 CC value
     B: 2 types (CC, PC)                    — 3 CC, 1 PC
     C: 3 types (CC, PC, PROJECT)           — 6 CC, 2 PC, 2 Projects
     D: 4 types (CC, PC, REGION, FUNCTION)  — 8 CC, 3 PC, 2 Regions, 3 Functions
     E: 3 types (CC, PC, LOCATION)          — 6 CC, 3 PC, 3 Locations
     F: 4 types (CC, PC, SEGMENT, INTERCO)  — 10 CC, 4 PC, 4 Segments, 4 IC markers
   ============================================================================ */

-- ============================================================================
-- Helper: upsert dimension type (with source_kind), return id
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.upsert_dim_type(
    p_tenant UUID, p_entity_code TEXT, p_code TEXT, p_name TEXT,
    p_category TEXT DEFAULT 'SYSTEM',
    p_source_kind TEXT DEFAULT 'INTERNAL',
    p_is_hierarchical BOOLEAN DEFAULT FALSE,
    p_sort_order SMALLINT DEFAULT 0
) RETURNS UUID LANGUAGE plpgsql AS $fn$
DECLARE v_id UUID;
BEGIN
    INSERT INTO fin.dimension_type (id, tenant_id, entity_code, code, name,
        category, source_kind, is_hierarchical, sort_order)
    VALUES (gen_random_uuid(), p_tenant, p_entity_code, p_code, p_name,
        p_category, p_source_kind, p_is_hierarchical, p_sort_order)
    ON CONFLICT (tenant_id, entity_code, code) DO UPDATE
        SET name = EXCLUDED.name, category = EXCLUDED.category,
            source_kind = EXCLUDED.source_kind,
            is_hierarchical = EXCLUDED.is_hierarchical,
            updated_at = now()
    RETURNING id INTO v_id;
    RETURN v_id;
END $fn$;

-- ============================================================================
-- Helper: upsert dimension value (with lifecycle fields), return id
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.upsert_dim_value(
    p_tenant UUID, p_entity_code TEXT, p_dim_type_id UUID,
    p_code TEXT, p_name TEXT, p_parent_id UUID DEFAULT NULL,
    p_level SMALLINT DEFAULT 1,
    p_status TEXT DEFAULT 'ACTIVE',
    p_allow_posting BOOLEAN DEFAULT TRUE,
    p_allow_budgeting BOOLEAN DEFAULT TRUE
) RETURNS UUID LANGUAGE plpgsql AS $fn$
DECLARE v_id UUID;
BEGIN
    INSERT INTO fin.dimension_value (id, tenant_id, entity_code, dimension_type_id,
        code, name, parent_id, level, status, allow_posting, allow_budgeting)
    VALUES (gen_random_uuid(), p_tenant, p_entity_code, p_dim_type_id,
        p_code, p_name, p_parent_id, p_level, p_status, p_allow_posting, p_allow_budgeting)
    ON CONFLICT (tenant_id, entity_code, dimension_type_id, code) DO UPDATE
        SET name = EXCLUDED.name, status = EXCLUDED.status,
            allow_posting = EXCLUDED.allow_posting,
            allow_budgeting = EXCLUDED.allow_budgeting,
            updated_at = now()
    RETURNING id INTO v_id;
    RETURN v_id;
END $fn$;

-- ============================================================================
-- Helper: set OU dimension default
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.set_ou_dim_default(
    p_tenant UUID, p_entity_code TEXT, p_ou_code TEXT,
    p_dim_type_id UUID, p_dim_value_code TEXT
) RETURNS VOID LANGUAGE plpgsql AS $fn$
DECLARE
    v_ou_id UUID;
    v_dim_value_id UUID;
BEGIN
    SELECT id INTO v_ou_id FROM fin.operating_unit
    WHERE tenant_id = p_tenant AND entity_code = p_entity_code AND code = p_ou_code;

    SELECT id INTO v_dim_value_id FROM fin.dimension_value
    WHERE tenant_id = p_tenant AND entity_code = p_entity_code
      AND dimension_type_id = p_dim_type_id AND code = p_dim_value_code;

    IF v_ou_id IS NOT NULL AND v_dim_value_id IS NOT NULL THEN
        INSERT INTO fin.ou_dimension_default (tenant_id, entity_code, ou_id,
            dimension_type_id, dimension_value_id)
        VALUES (p_tenant, p_entity_code, v_ou_id, p_dim_type_id, v_dim_value_id)
        ON CONFLICT (tenant_id, entity_code, ou_id, dimension_type_id) DO UPDATE
            SET dimension_value_id = EXCLUDED.dimension_value_id;
    END IF;
END $fn$;

-- ============================================================================
-- Helper: add dimension policy (governance module pattern)
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.add_dim_policy(
    p_tenant UUID, p_entity_code TEXT, p_dim_type_id UUID,
    p_policy_code TEXT,
    p_behavior TEXT DEFAULT 'OPTIONAL',
    p_scope_account_type TEXT DEFAULT NULL,
    p_scope_subledger_type TEXT DEFAULT NULL,
    p_scope_domain TEXT DEFAULT NULL,
    p_derive_source TEXT DEFAULT NULL,
    p_priority SMALLINT DEFAULT 0
) RETURNS UUID LANGUAGE plpgsql AS $fn$
DECLARE v_id UUID;
BEGIN
    INSERT INTO fin.dimension_policy (tenant_id, entity_code, dimension_type_id,
        policy_code, behavior, scope_account_type, scope_subledger_type,
        scope_domain, derive_source, priority)
    VALUES (p_tenant, p_entity_code, p_dim_type_id,
        p_policy_code, p_behavior, p_scope_account_type, p_scope_subledger_type,
        p_scope_domain, p_derive_source, p_priority)
    ON CONFLICT (tenant_id, entity_code, policy_code, policy_version) DO UPDATE
        SET behavior = EXCLUDED.behavior,
            scope_account_type = EXCLUDED.scope_account_type,
            scope_subledger_type = EXCLUDED.scope_subledger_type,
            scope_domain = EXCLUDED.scope_domain,
            derive_source = EXCLUDED.derive_source,
            priority = EXCLUDED.priority,
            updated_at = now()
    RETURNING id INTO v_id;
    RETURN v_id;
END $fn$;

-- ============================================================================
-- Main seed loop
-- ============================================================================
DO $$
DECLARE
    v_tenant    UUID;
    v_code      TEXT;
    v_cc_type   UUID;
    v_pc_type   UUID;
    v_extra1    UUID;   -- additional dimension type
    v_extra2    UUID;   -- additional dimension type
    v_id        UUID;
BEGIN
    FOR v_code IN SELECT code FROM core.tenant WHERE code LIKE 'demo_%' AND status = 'active' ORDER BY code LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        CASE v_code

            -- ================================================================
            -- Blueprint A: Freelancer/Solo — CC + PC types, 1 CC value
            -- ================================================================
            WHEN 'demo_my', 'demo_in' THEN
                v_cc_type := pg_temp.upsert_dim_type(v_tenant, 'HQ', 'COST_CENTER', 'Cost Center',
                    'SYSTEM', 'INTERNAL', TRUE, 1::SMALLINT);
                v_pc_type := pg_temp.upsert_dim_type(v_tenant, 'HQ', 'PROFIT_CENTER', 'Profit Center',
                    'SYSTEM', 'INTERNAL', FALSE, 2::SMALLINT);

                -- Values
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'HQ', v_cc_type, 'CC-GENERAL', 'General');

                -- Policies: CC optional on expenses, derive from OU if missing
                PERFORM pg_temp.add_dim_policy(v_tenant, 'HQ', v_cc_type,
                    'CC-EXPENSE-DERIVE', 'DERIVE_IF_MISSING', 'EXPENSE', NULL, NULL, 'ou_default');

                -- OU defaults
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'HQ', 'COMPANY', v_cc_type, 'CC-GENERAL');

            -- ================================================================
            -- Blueprint B: Small — CC + PC types, 3 CC + 1 PC
            -- ================================================================
            WHEN 'demo_sa', 'demo_qa' THEN
                v_cc_type := pg_temp.upsert_dim_type(v_tenant, 'HQ', 'COST_CENTER', 'Cost Center',
                    'SYSTEM', 'INTERNAL', TRUE, 1::SMALLINT);
                v_pc_type := pg_temp.upsert_dim_type(v_tenant, 'HQ', 'PROFIT_CENTER', 'Profit Center',
                    'SYSTEM', 'INTERNAL', FALSE, 2::SMALLINT);

                -- CC values
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'HQ', v_cc_type, 'CC-SALES', 'Sales');
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'HQ', v_cc_type, 'CC-OPS',   'Operations');
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'HQ', v_cc_type, 'CC-ADMIN', 'Administration');
                -- PC values
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'HQ', v_pc_type, 'PC-MAIN',  'Main Business');

                -- Policies
                PERFORM pg_temp.add_dim_policy(v_tenant, 'HQ', v_cc_type,
                    'CC-EXPENSE-REQ', 'REQUIRED', 'EXPENSE');
                PERFORM pg_temp.add_dim_policy(v_tenant, 'HQ', v_cc_type,
                    'CC-EXPENSE-DERIVE', 'DERIVE_IF_MISSING', 'EXPENSE', NULL, NULL, 'ou_default', 1::SMALLINT);
                PERFORM pg_temp.add_dim_policy(v_tenant, 'HQ', v_pc_type,
                    'PC-REVENUE-OPT', 'OPTIONAL', 'REVENUE');
                PERFORM pg_temp.add_dim_policy(v_tenant, 'HQ', v_pc_type,
                    'PC-INHERIT', 'INHERIT_FROM_HEADER', NULL, NULL, NULL, NULL, (-1)::SMALLINT);

                -- OU defaults
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'HQ', 'COMPANY',    v_cc_type, 'CC-OPS');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'HQ', 'COMPANY',    v_pc_type, 'PC-MAIN');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'HQ', 'BRANCH-HQ',  v_cc_type, 'CC-OPS');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'HQ', 'BRANCH-HQ',  v_pc_type, 'PC-MAIN');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'HQ', 'DEPT-SALES', v_cc_type, 'CC-SALES');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'HQ', 'DEPT-SALES', v_pc_type, 'PC-MAIN');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'HQ', 'DEPT-OPS',   v_cc_type, 'CC-OPS');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'HQ', 'DEPT-OPS',   v_pc_type, 'PC-MAIN');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'HQ', 'DEPT-ADMIN', v_cc_type, 'CC-ADMIN');

            -- ================================================================
            -- Blueprint C: SME — CC + PC + PROJECT types
            -- ================================================================
            WHEN 'demo_fr', 'demo_de' THEN
                v_cc_type := pg_temp.upsert_dim_type(v_tenant, 'HQ', 'COST_CENTER', 'Cost Center',
                    'SYSTEM', 'INTERNAL', TRUE, 1::SMALLINT);
                v_pc_type := pg_temp.upsert_dim_type(v_tenant, 'HQ', 'PROFIT_CENTER', 'Profit Center',
                    'SYSTEM', 'INTERNAL', FALSE, 2::SMALLINT);
                v_extra1 := pg_temp.upsert_dim_type(v_tenant, 'HQ', 'PROJECT', 'Project',
                    'CUSTOM', 'INTERNAL', FALSE, 3::SMALLINT);

                -- CC values
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'HQ', v_cc_type, 'CC-SALES',    'Sales');
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'HQ', v_cc_type, 'CC-DELIVERY', 'Service Delivery');
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'HQ', v_cc_type, 'CC-RD',       'R&D');
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'HQ', v_cc_type, 'CC-ADMIN',    'Administration');
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'HQ', v_cc_type, 'CC-PROJ-1',   'Project Alpha');
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'HQ', v_cc_type, 'CC-PROJ-2',   'Project Beta');
                -- PC values
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'HQ', v_pc_type, 'PC-PRODUCTS', 'Products Division');
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'HQ', v_pc_type, 'PC-SERVICES', 'Services Division');
                -- Project values
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'HQ', v_extra1, 'PROJ-ALPHA', 'Project Alpha');
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'HQ', v_extra1, 'PROJ-BETA',  'Project Beta');

                -- Policies
                PERFORM pg_temp.add_dim_policy(v_tenant, 'HQ', v_cc_type,
                    'CC-EXPENSE-REQ', 'REQUIRED', 'EXPENSE');
                PERFORM pg_temp.add_dim_policy(v_tenant, 'HQ', v_cc_type,
                    'CC-EXPENSE-DERIVE', 'DERIVE_IF_MISSING', 'EXPENSE', NULL, NULL, 'ou_default', 1::SMALLINT);
                PERFORM pg_temp.add_dim_policy(v_tenant, 'HQ', v_pc_type,
                    'PC-REVENUE-REQ', 'REQUIRED', 'REVENUE');
                PERFORM pg_temp.add_dim_policy(v_tenant, 'HQ', v_pc_type,
                    'PC-INHERIT', 'INHERIT_FROM_HEADER', NULL, NULL, NULL, NULL, (-1)::SMALLINT);
                -- Project required on CAPEX, optional otherwise
                PERFORM pg_temp.add_dim_policy(v_tenant, 'HQ', v_extra1,
                    'PROJ-CAPEX-REQ', 'REQUIRED', NULL, NULL, 'CAPEX');
                PERFORM pg_temp.add_dim_policy(v_tenant, 'HQ', v_extra1,
                    'PROJ-DEFAULT-OPT', 'OPTIONAL', NULL, NULL, NULL, NULL, (-1)::SMALLINT);
                -- PC forbidden on balance sheet control accounts
                PERFORM pg_temp.add_dim_policy(v_tenant, 'HQ', v_pc_type,
                    'PC-BS-FORBID', 'FORBIDDEN', 'ASSET', NULL, NULL, NULL, 5::SMALLINT);
                PERFORM pg_temp.add_dim_policy(v_tenant, 'HQ', v_pc_type,
                    'PC-BS-FORBID-L', 'FORBIDDEN', 'LIABILITY', NULL, NULL, NULL, 5::SMALLINT);

                -- OU defaults
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'HQ', 'COMPANY',      v_cc_type, 'CC-ADMIN');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'HQ', 'DIV-PRODUCTS', v_cc_type, 'CC-RD');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'HQ', 'DIV-PRODUCTS', v_pc_type, 'PC-PRODUCTS');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'HQ', 'DIV-SERVICES', v_cc_type, 'CC-DELIVERY');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'HQ', 'DIV-SERVICES', v_pc_type, 'PC-SERVICES');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'HQ', 'DEPT-SALES',   v_cc_type, 'CC-SALES');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'HQ', 'DEPT-SALES',   v_pc_type, 'PC-PRODUCTS');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'HQ', 'DEPT-DELIVERY',v_cc_type, 'CC-DELIVERY');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'HQ', 'DEPT-DELIVERY',v_pc_type, 'PC-SERVICES');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'HQ', 'DEPT-ADMIN',   v_cc_type, 'CC-ADMIN');

            -- ================================================================
            -- Blueprint D: Big single country — CC + PC + REGION + FUNCTION
            -- ================================================================
            WHEN 'demo_us' THEN
                v_cc_type := pg_temp.upsert_dim_type(v_tenant, 'HQ', 'COST_CENTER', 'Cost Center',
                    'SYSTEM', 'INTERNAL', TRUE, 1::SMALLINT);
                v_pc_type := pg_temp.upsert_dim_type(v_tenant, 'HQ', 'PROFIT_CENTER', 'Profit Center',
                    'SYSTEM', 'INTERNAL', FALSE, 2::SMALLINT);
                v_extra1 := pg_temp.upsert_dim_type(v_tenant, 'HQ', 'REGION', 'Region',
                    'CUSTOM', 'DERIVED', FALSE, 3::SMALLINT);   -- DERIVED from OU geography
                v_extra2 := pg_temp.upsert_dim_type(v_tenant, 'HQ', 'FUNCTION', 'Business Function',
                    'CUSTOM', 'INTERNAL', FALSE, 4::SMALLINT);

                -- CC values
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'HQ', v_cc_type, 'CC-SALES-E',  'Sales East');
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'HQ', v_cc_type, 'CC-SALES-W',  'Sales West');
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'HQ', v_cc_type, 'CC-OPS-E',    'Operations East');
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'HQ', v_cc_type, 'CC-OPS-W',    'Operations West');
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'HQ', v_cc_type, 'CC-ADMIN',    'Corporate Admin');
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'HQ', v_cc_type, 'CC-SSC-IT',   'Shared Services - IT');
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'HQ', v_cc_type, 'CC-SSC-HR',   'Shared Services - HR');
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'HQ', v_cc_type, 'CC-SSC-FIN',  'Shared Services - Finance');
                -- PC values
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'HQ', v_pc_type, 'PC-EAST',  'East Region');
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'HQ', v_pc_type, 'PC-WEST',  'West Region');
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'HQ', v_pc_type, 'PC-SSC',   'Shared Services Center');
                -- Region values (DERIVED but still have canonical values)
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'HQ', v_extra1, 'RGN-EAST', 'East Coast');
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'HQ', v_extra1, 'RGN-WEST', 'West Coast');
                -- Function values
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'HQ', v_extra2, 'FN-SALES',    'Sales');
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'HQ', v_extra2, 'FN-OPS',      'Operations');
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'HQ', v_extra2, 'FN-SHARED',   'Shared Services');

                -- Policies
                PERFORM pg_temp.add_dim_policy(v_tenant, 'HQ', v_cc_type,
                    'CC-EXPENSE-REQ', 'REQUIRED', 'EXPENSE');
                PERFORM pg_temp.add_dim_policy(v_tenant, 'HQ', v_cc_type,
                    'CC-DERIVE', 'DERIVE_IF_MISSING', 'EXPENSE', NULL, NULL, 'ou_default', 1::SMALLINT);
                PERFORM pg_temp.add_dim_policy(v_tenant, 'HQ', v_pc_type,
                    'PC-REVENUE-REQ', 'REQUIRED', 'REVENUE');
                PERFORM pg_temp.add_dim_policy(v_tenant, 'HQ', v_pc_type,
                    'PC-EXPENSE-REQ', 'REQUIRED', 'EXPENSE');
                PERFORM pg_temp.add_dim_policy(v_tenant, 'HQ', v_extra1,
                    'RGN-DERIVE', 'DERIVE_IF_MISSING', NULL, NULL, NULL, 'ou_default');
                PERFORM pg_temp.add_dim_policy(v_tenant, 'HQ', v_extra2,
                    'FN-EXPENSE-OPT', 'OPTIONAL', 'EXPENSE');

                -- OU defaults
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'HQ', 'COMPANY',      v_cc_type, 'CC-ADMIN');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'HQ', 'REGION-EAST',  v_cc_type, 'CC-OPS-E');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'HQ', 'REGION-EAST',  v_pc_type, 'PC-EAST');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'HQ', 'REGION-EAST',  v_extra1,  'RGN-EAST');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'HQ', 'REGION-WEST',  v_cc_type, 'CC-OPS-W');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'HQ', 'REGION-WEST',  v_pc_type, 'PC-WEST');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'HQ', 'REGION-WEST',  v_extra1,  'RGN-WEST');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'HQ', 'SSC',          v_cc_type, 'CC-SSC-IT');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'HQ', 'SSC',          v_pc_type, 'PC-SSC');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'HQ', 'SSC',          v_extra2,  'FN-SHARED');

            -- ================================================================
            -- Blueprint E: Multi-location — CC + PC + LOCATION
            -- ================================================================
            WHEN 'demo_ch' THEN
                v_cc_type := pg_temp.upsert_dim_type(v_tenant, 'HQ', 'COST_CENTER', 'Cost Center',
                    'SYSTEM', 'INTERNAL', TRUE, 1::SMALLINT);
                v_pc_type := pg_temp.upsert_dim_type(v_tenant, 'HQ', 'PROFIT_CENTER', 'Profit Center',
                    'SYSTEM', 'INTERNAL', FALSE, 2::SMALLINT);
                v_extra1 := pg_temp.upsert_dim_type(v_tenant, 'HQ', 'LOCATION', 'Location',
                    'CUSTOM', 'INTERNAL', FALSE, 3::SMALLINT);

                -- CC values
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'HQ', v_cc_type, 'CC-ZH-SALES', 'Zurich Sales');
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'HQ', v_cc_type, 'CC-ZH-OPS',   'Zurich Operations');
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'HQ', v_cc_type, 'CC-GVA-SALES','Geneva Sales');
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'HQ', v_cc_type, 'CC-GVA-OPS',  'Geneva Operations');
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'HQ', v_cc_type, 'CC-BSL-SALES','Basel Sales');
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'HQ', v_cc_type, 'CC-BSL-OPS',  'Basel Operations');
                -- PC values
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'HQ', v_pc_type, 'PC-ZH',  'Zurich');
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'HQ', v_pc_type, 'PC-GVA', 'Geneva');
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'HQ', v_pc_type, 'PC-BSL', 'Basel');
                -- Location values
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'HQ', v_extra1, 'LOC-ZH',  'Zurich Office');
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'HQ', v_extra1, 'LOC-GVA', 'Geneva Office');
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'HQ', v_extra1, 'LOC-BSL', 'Basel Office');

                -- Policies
                PERFORM pg_temp.add_dim_policy(v_tenant, 'HQ', v_cc_type,
                    'CC-EXPENSE-REQ', 'REQUIRED', 'EXPENSE');
                PERFORM pg_temp.add_dim_policy(v_tenant, 'HQ', v_cc_type,
                    'CC-DERIVE', 'DERIVE_IF_MISSING', 'EXPENSE', NULL, NULL, 'ou_default', 1::SMALLINT);
                PERFORM pg_temp.add_dim_policy(v_tenant, 'HQ', v_pc_type,
                    'PC-REVENUE-REQ', 'REQUIRED', 'REVENUE');
                PERFORM pg_temp.add_dim_policy(v_tenant, 'HQ', v_extra1,
                    'LOC-ALL-REQ', 'REQUIRED');
                PERFORM pg_temp.add_dim_policy(v_tenant, 'HQ', v_extra1,
                    'LOC-DERIVE', 'DERIVE_IF_MISSING', NULL, NULL, NULL, 'ou_default', 1::SMALLINT);

                -- OU defaults
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'HQ', 'COMPANY',       v_cc_type, 'CC-ZH-OPS');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'HQ', 'BRANCH-ZH',     v_cc_type, 'CC-ZH-OPS');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'HQ', 'BRANCH-ZH',     v_pc_type, 'PC-ZH');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'HQ', 'BRANCH-ZH',     v_extra1,  'LOC-ZH');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'HQ', 'BRANCH-GVA',    v_cc_type, 'CC-GVA-OPS');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'HQ', 'BRANCH-GVA',    v_pc_type, 'PC-GVA');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'HQ', 'BRANCH-GVA',    v_extra1,  'LOC-GVA');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'HQ', 'BRANCH-BSL',    v_cc_type, 'CC-BSL-OPS');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'HQ', 'BRANCH-BSL',    v_pc_type, 'PC-BSL');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'HQ', 'BRANCH-BSL',    v_extra1,  'LOC-BSL');

            -- ================================================================
            -- Blueprint F: Multi-country — CC + PC + SEGMENT + INTERCOMPANY
            -- Per legal entity
            -- ================================================================
            WHEN 'demo_ca' THEN
                DECLARE
                    v_entities TEXT[] := ARRAY['LE-CA','LE-MY','LE-SA','LE-IN'];
                    v_ent TEXT;
                BEGIN
                    FOREACH v_ent IN ARRAY v_entities LOOP
                        v_cc_type := pg_temp.upsert_dim_type(v_tenant, v_ent, 'COST_CENTER', 'Cost Center',
                            'SYSTEM', 'INTERNAL', TRUE, 1::SMALLINT);
                        v_pc_type := pg_temp.upsert_dim_type(v_tenant, v_ent, 'PROFIT_CENTER', 'Profit Center',
                            'SYSTEM', 'INTERNAL', FALSE, 2::SMALLINT);
                        v_extra1 := pg_temp.upsert_dim_type(v_tenant, v_ent, 'SEGMENT', 'Business Segment',
                            'CUSTOM', 'INTERNAL', FALSE, 3::SMALLINT);
                        v_extra2 := pg_temp.upsert_dim_type(v_tenant, v_ent, 'INTERCOMPANY', 'Intercompany Partner',
                            'REGULATORY', 'SYSTEM', FALSE, 4::SMALLINT);

                        -- Policies per entity
                        PERFORM pg_temp.add_dim_policy(v_tenant, v_ent, v_cc_type,
                            'CC-EXPENSE-REQ', 'REQUIRED', 'EXPENSE');
                        PERFORM pg_temp.add_dim_policy(v_tenant, v_ent, v_cc_type,
                            'CC-DERIVE', 'DERIVE_IF_MISSING', 'EXPENSE', NULL, NULL, 'ou_default', 1::SMALLINT);
                        PERFORM pg_temp.add_dim_policy(v_tenant, v_ent, v_pc_type,
                            'PC-REVENUE-REQ', 'REQUIRED', 'REVENUE');
                        -- Intercompany: derive from federation context on IC subledger accounts
                        PERFORM pg_temp.add_dim_policy(v_tenant, v_ent, v_extra2,
                            'IC-AP-DERIVE', 'DERIVE_IF_MISSING', NULL, 'AP', NULL, 'federation_context', 5::SMALLINT);
                        PERFORM pg_temp.add_dim_policy(v_tenant, v_ent, v_extra1,
                            'SEG-OPT', 'OPTIONAL');

                        -- Segment values (same across entities for consolidation)
                        PERFORM pg_temp.upsert_dim_value(v_tenant, v_ent, v_extra1, 'SEG-TECH',    'Technology');
                        PERFORM pg_temp.upsert_dim_value(v_tenant, v_ent, v_extra1, 'SEG-CONSULT', 'Consulting');
                        PERFORM pg_temp.upsert_dim_value(v_tenant, v_ent, v_extra1, 'SEG-SHARED',  'Shared Services');
                        PERFORM pg_temp.upsert_dim_value(v_tenant, v_ent, v_extra1, 'SEG-CORP',    'Corporate');

                        -- Intercompany partner values (all other entities)
                        PERFORM pg_temp.upsert_dim_value(v_tenant, v_ent, v_extra2, 'IC-CA', 'Canada Holding');
                        PERFORM pg_temp.upsert_dim_value(v_tenant, v_ent, v_extra2, 'IC-MY', 'Malaysia Subsidiary');
                        PERFORM pg_temp.upsert_dim_value(v_tenant, v_ent, v_extra2, 'IC-SA', 'Saudi Subsidiary');
                        PERFORM pg_temp.upsert_dim_value(v_tenant, v_ent, v_extra2, 'IC-IN', 'India Subsidiary');
                    END LOOP;
                END;

                -- LE-CA entity-specific values
                SELECT id INTO v_cc_type FROM fin.dimension_type
                    WHERE tenant_id = v_tenant AND entity_code = 'LE-CA' AND code = 'COST_CENTER';
                SELECT id INTO v_pc_type FROM fin.dimension_type
                    WHERE tenant_id = v_tenant AND entity_code = 'LE-CA' AND code = 'PROFIT_CENTER';

                PERFORM pg_temp.upsert_dim_value(v_tenant, 'LE-CA', v_cc_type, 'CC-CA-FINANCE', 'Canada Finance');
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'LE-CA', v_cc_type, 'CC-CA-ADMIN',   'Canada Admin');
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'LE-CA', v_pc_type, 'PC-LE-CA',      'Canada Holding');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'LE-CA', 'LE-CA',         v_cc_type, 'CC-CA-FINANCE');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'LE-CA', 'LE-CA',         v_pc_type, 'PC-LE-CA');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'LE-CA', 'DEPT-CA-FIN',   v_cc_type, 'CC-CA-FINANCE');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'LE-CA', 'DEPT-CA-FIN',   v_pc_type, 'PC-LE-CA');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'LE-CA', 'DEPT-CA-ADMIN', v_cc_type, 'CC-CA-ADMIN');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'LE-CA', 'DEPT-CA-ADMIN', v_pc_type, 'PC-LE-CA');

                -- LE-MY
                SELECT id INTO v_cc_type FROM fin.dimension_type
                    WHERE tenant_id = v_tenant AND entity_code = 'LE-MY' AND code = 'COST_CENTER';
                SELECT id INTO v_pc_type FROM fin.dimension_type
                    WHERE tenant_id = v_tenant AND entity_code = 'LE-MY' AND code = 'PROFIT_CENTER';

                PERFORM pg_temp.upsert_dim_value(v_tenant, 'LE-MY', v_cc_type, 'CC-MY-OPS',   'Malaysia Operations');
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'LE-MY', v_cc_type, 'CC-MY-SALES', 'Malaysia Sales');
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'LE-MY', v_pc_type, 'PC-LE-MY',    'Malaysia Subsidiary');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'LE-MY', 'LE-MY',         v_cc_type, 'CC-MY-OPS');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'LE-MY', 'LE-MY',         v_pc_type, 'PC-LE-MY');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'LE-MY', 'DEPT-MY-OPS',   v_cc_type, 'CC-MY-OPS');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'LE-MY', 'DEPT-MY-OPS',   v_pc_type, 'PC-LE-MY');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'LE-MY', 'DEPT-MY-SALES', v_cc_type, 'CC-MY-SALES');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'LE-MY', 'DEPT-MY-SALES', v_pc_type, 'PC-LE-MY');

                -- LE-SA
                SELECT id INTO v_cc_type FROM fin.dimension_type
                    WHERE tenant_id = v_tenant AND entity_code = 'LE-SA' AND code = 'COST_CENTER';
                SELECT id INTO v_pc_type FROM fin.dimension_type
                    WHERE tenant_id = v_tenant AND entity_code = 'LE-SA' AND code = 'PROFIT_CENTER';

                PERFORM pg_temp.upsert_dim_value(v_tenant, 'LE-SA', v_cc_type, 'CC-SA-OPS',   'Saudi Operations');
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'LE-SA', v_cc_type, 'CC-SA-SALES', 'Saudi Sales');
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'LE-SA', v_pc_type, 'PC-LE-SA',    'Saudi Subsidiary');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'LE-SA', 'LE-SA',         v_cc_type, 'CC-SA-OPS');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'LE-SA', 'LE-SA',         v_pc_type, 'PC-LE-SA');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'LE-SA', 'DEPT-SA-OPS',   v_cc_type, 'CC-SA-OPS');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'LE-SA', 'DEPT-SA-OPS',   v_pc_type, 'PC-LE-SA');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'LE-SA', 'DEPT-SA-SALES', v_cc_type, 'CC-SA-SALES');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'LE-SA', 'DEPT-SA-SALES', v_pc_type, 'PC-LE-SA');

                -- LE-IN
                SELECT id INTO v_cc_type FROM fin.dimension_type
                    WHERE tenant_id = v_tenant AND entity_code = 'LE-IN' AND code = 'COST_CENTER';
                SELECT id INTO v_pc_type FROM fin.dimension_type
                    WHERE tenant_id = v_tenant AND entity_code = 'LE-IN' AND code = 'PROFIT_CENTER';

                PERFORM pg_temp.upsert_dim_value(v_tenant, 'LE-IN', v_cc_type, 'CC-IN-OPS',   'India Operations');
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'LE-IN', v_cc_type, 'CC-IN-SALES', 'India Sales');
                PERFORM pg_temp.upsert_dim_value(v_tenant, 'LE-IN', v_pc_type, 'PC-LE-IN',    'India Subsidiary');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'LE-IN', 'LE-IN',         v_cc_type, 'CC-IN-OPS');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'LE-IN', 'LE-IN',         v_pc_type, 'PC-LE-IN');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'LE-IN', 'DEPT-IN-OPS',   v_cc_type, 'CC-IN-OPS');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'LE-IN', 'DEPT-IN-OPS',   v_pc_type, 'PC-LE-IN');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'LE-IN', 'DEPT-IN-SALES', v_cc_type, 'CC-IN-SALES');
                PERFORM pg_temp.set_ou_dim_default(v_tenant, 'LE-IN', 'DEPT-IN-SALES', v_pc_type, 'PC-LE-IN');

            ELSE
                RAISE NOTICE 'Dimensions: No blueprint mapping for tenant %', v_code;
        END CASE;

        RAISE NOTICE 'Dimension types + values + policies seeded for tenant %', v_code;
    END LOOP;
END $$;
