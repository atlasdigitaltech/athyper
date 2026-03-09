/* ============================================================================
   Athyper v2.3 — Reporting Cube Definition Seeds (Blueprint-Based)
   Table: fin.rpt_cube_definition
   Dependencies: core.tenant, 193_reporting_analytics.sql

   Seeds cube families per demo tenant based on blueprint tier.
   Follows the same A→F blueprint tiering as dimension type allocation.

   Blueprint cube allocation:
     A (demo_my, demo_in):   1 cube  — FS only (lightweight P&L/BS)
     B (demo_sa, demo_qa):   1 cube  — FS with CC/PC
     C (demo_fr, demo_de):   2 cubes — FS + MGMT (with PROJECT)
     D (demo_us):            3 cubes — FS + MGMT + OPS (REGION, FUNCTION)
     E (demo_ch):            2 cubes — FS + MGMT (with LOCATION)
     F (demo_ca):            4 cubes — FS + MGMT + OPS + IC (full suite)
   ============================================================================ */

DO $$
DECLARE
    v_tenant    UUID;
    v_code      TEXT;
BEGIN
    FOR v_code IN SELECT code FROM core.tenant WHERE code LIKE 'demo_%' AND status = 'active' ORDER BY code LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        CASE v_code

            -- ================================================================
            -- Blueprint A: Freelancer/Solo — FS cube only
            -- ================================================================
            WHEN 'demo_my', 'demo_in' THEN
                INSERT INTO fin.rpt_cube_definition (
                    tenant_id, entity_code, cube_code, name, description,
                    cube_type, grain, dimension_codes, measure_codes,
                    account_types, book_codes, refresh_mode, retention_years
                ) VALUES (
                    v_tenant, 'HQ', 'FS_MONTHLY', 'Financial Statement Cube',
                    'Monthly P&L and Balance Sheet by Cost Center',
                    'FS', 'MONTHLY',
                    '{COST_CENTER}',
                    '{amount_dr,amount_cr,amount_net}',
                    NULL,                       -- all account types
                    '{STAT}',                   -- primary book only
                    'BATCH',                    -- batch is sufficient for solo
                    2                           -- 2 years retention
                ) ON CONFLICT (tenant_id, entity_code, cube_code) DO UPDATE
                    SET name = EXCLUDED.name,
                        dimension_codes = EXCLUDED.dimension_codes,
                        updated_at = now();

            -- ================================================================
            -- Blueprint B: Small — FS cube with CC + PC
            -- ================================================================
            WHEN 'demo_sa', 'demo_qa' THEN
                INSERT INTO fin.rpt_cube_definition (
                    tenant_id, entity_code, cube_code, name, description,
                    cube_type, grain, dimension_codes, measure_codes,
                    account_types, book_codes, refresh_mode, retention_years
                ) VALUES (
                    v_tenant, 'HQ', 'FS_MONTHLY', 'Financial Statement Cube',
                    'Monthly P&L and Balance Sheet by Cost Center and Profit Center',
                    'FS', 'MONTHLY',
                    '{COST_CENTER,PROFIT_CENTER}',
                    '{amount_dr,amount_cr,amount_net}',
                    NULL,
                    '{STAT}',
                    'BATCH',
                    3
                ) ON CONFLICT (tenant_id, entity_code, cube_code) DO UPDATE
                    SET name = EXCLUDED.name,
                        dimension_codes = EXCLUDED.dimension_codes,
                        updated_at = now();

            -- ================================================================
            -- Blueprint C: Mid-Market — FS + MGMT (with PROJECT)
            -- ================================================================
            WHEN 'demo_fr', 'demo_de' THEN
                -- FS cube: standard financial statement
                INSERT INTO fin.rpt_cube_definition (
                    tenant_id, entity_code, cube_code, name, description,
                    cube_type, grain, dimension_codes, measure_codes,
                    account_types, book_codes, refresh_mode, retention_years
                ) VALUES (
                    v_tenant, 'HQ', 'FS_MONTHLY', 'Financial Statement Cube',
                    'Monthly P&L and Balance Sheet by Cost Center and Profit Center',
                    'FS', 'MONTHLY',
                    '{COST_CENTER,PROFIT_CENTER}',
                    '{amount_dr,amount_cr,amount_net}',
                    NULL,
                    '{STAT}',
                    'EVENT',
                    3
                ) ON CONFLICT (tenant_id, entity_code, cube_code) DO UPDATE
                    SET name = EXCLUDED.name,
                        dimension_codes = EXCLUDED.dimension_codes,
                        refresh_mode = EXCLUDED.refresh_mode,
                        updated_at = now();

                -- MGMT cube: management analytics with project
                INSERT INTO fin.rpt_cube_definition (
                    tenant_id, entity_code, cube_code, name, description,
                    cube_type, grain, dimension_codes, measure_codes,
                    account_types, book_codes, refresh_mode, retention_years
                ) VALUES (
                    v_tenant, 'HQ', 'MGMT_MONTHLY', 'Management Analytics Cube',
                    'Internal reporting by Cost Center, Profit Center, and Project',
                    'MGMT', 'MONTHLY',
                    '{COST_CENTER,PROFIT_CENTER,PROJECT}',
                    '{amount_dr,amount_cr,amount_net}',
                    '{REVENUE,EXPENSE}',        -- P&L accounts only
                    '{STAT}',
                    'EVENT',
                    3
                ) ON CONFLICT (tenant_id, entity_code, cube_code) DO UPDATE
                    SET name = EXCLUDED.name,
                        dimension_codes = EXCLUDED.dimension_codes,
                        updated_at = now();

            -- ================================================================
            -- Blueprint D: Enterprise US — FS + MGMT + OPS
            -- ================================================================
            WHEN 'demo_us' THEN
                -- FS cube
                INSERT INTO fin.rpt_cube_definition (
                    tenant_id, entity_code, cube_code, name, description,
                    cube_type, grain, dimension_codes, measure_codes,
                    account_types, book_codes, refresh_mode, retention_years
                ) VALUES (
                    v_tenant, 'US-CORP', 'FS_MONTHLY', 'Financial Statement Cube',
                    'Monthly P&L and Balance Sheet across all standard dimensions',
                    'FS', 'MONTHLY',
                    '{COST_CENTER,PROFIT_CENTER}',
                    '{amount_dr,amount_cr,amount_net}',
                    NULL,
                    '{STAT}',
                    'EVENT',
                    3
                ) ON CONFLICT (tenant_id, entity_code, cube_code) DO UPDATE
                    SET name = EXCLUDED.name,
                        dimension_codes = EXCLUDED.dimension_codes,
                        updated_at = now();

                -- MGMT cube: management analytics with region + function
                INSERT INTO fin.rpt_cube_definition (
                    tenant_id, entity_code, cube_code, name, description,
                    cube_type, grain, dimension_codes, measure_codes,
                    account_types, book_codes, refresh_mode, retention_years
                ) VALUES (
                    v_tenant, 'US-CORP', 'MGMT_MONTHLY', 'Management Analytics Cube',
                    'Internal P&L by Cost Center, Region, and Function',
                    'MGMT', 'MONTHLY',
                    '{COST_CENTER,PROFIT_CENTER,REGION,FUNCTION}',
                    '{amount_dr,amount_cr,amount_net}',
                    '{REVENUE,EXPENSE}',
                    '{STAT}',
                    'EVENT',
                    3
                ) ON CONFLICT (tenant_id, entity_code, cube_code) DO UPDATE
                    SET name = EXCLUDED.name,
                        dimension_codes = EXCLUDED.dimension_codes,
                        updated_at = now();

                -- OPS cube: operational cost by region + function
                INSERT INTO fin.rpt_cube_definition (
                    tenant_id, entity_code, cube_code, name, description,
                    cube_type, grain, dimension_codes, measure_codes,
                    account_types, book_codes, refresh_mode, retention_years
                ) VALUES (
                    v_tenant, 'US-CORP', 'OPS_MONTHLY', 'Operational Cost Cube',
                    'OPEX tracking by Cost Center, Region, and Function',
                    'OPS', 'MONTHLY',
                    '{COST_CENTER,REGION,FUNCTION}',
                    '{amount_dr,amount_cr,amount_net}',
                    '{EXPENSE}',                -- expenses only
                    '{STAT}',
                    'HYBRID',
                    3
                ) ON CONFLICT (tenant_id, entity_code, cube_code) DO UPDATE
                    SET name = EXCLUDED.name,
                        dimension_codes = EXCLUDED.dimension_codes,
                        updated_at = now();

            -- ================================================================
            -- Blueprint E: Multi-Entity CH — FS + MGMT (with LOCATION)
            -- ================================================================
            WHEN 'demo_ch' THEN
                -- FS cube
                INSERT INTO fin.rpt_cube_definition (
                    tenant_id, entity_code, cube_code, name, description,
                    cube_type, grain, dimension_codes, measure_codes,
                    account_types, book_codes, refresh_mode, retention_years
                ) VALUES (
                    v_tenant, 'CH-HOLD', 'FS_MONTHLY', 'Financial Statement Cube',
                    'Monthly P&L and Balance Sheet by Cost Center and Profit Center',
                    'FS', 'MONTHLY',
                    '{COST_CENTER,PROFIT_CENTER}',
                    '{amount_dr,amount_cr,amount_net}',
                    NULL,
                    '{STAT}',
                    'EVENT',
                    3
                ) ON CONFLICT (tenant_id, entity_code, cube_code) DO UPDATE
                    SET name = EXCLUDED.name,
                        dimension_codes = EXCLUDED.dimension_codes,
                        updated_at = now();

                -- MGMT cube: with location
                INSERT INTO fin.rpt_cube_definition (
                    tenant_id, entity_code, cube_code, name, description,
                    cube_type, grain, dimension_codes, measure_codes,
                    account_types, book_codes, refresh_mode, retention_years
                ) VALUES (
                    v_tenant, 'CH-HOLD', 'MGMT_MONTHLY', 'Management Analytics Cube',
                    'Internal P&L by Cost Center, Profit Center, and Location',
                    'MGMT', 'MONTHLY',
                    '{COST_CENTER,PROFIT_CENTER,LOCATION}',
                    '{amount_dr,amount_cr,amount_net}',
                    '{REVENUE,EXPENSE}',
                    '{STAT}',
                    'EVENT',
                    3
                ) ON CONFLICT (tenant_id, entity_code, cube_code) DO UPDATE
                    SET name = EXCLUDED.name,
                        dimension_codes = EXCLUDED.dimension_codes,
                        updated_at = now();

            -- ================================================================
            -- Blueprint F: Group/MNC CA — Full suite: FS + MGMT + OPS + IC
            -- ================================================================
            WHEN 'demo_ca' THEN
                -- FS cube (per legal entity — CA-PARENT and CA-SUB seed)
                INSERT INTO fin.rpt_cube_definition (
                    tenant_id, entity_code, cube_code, name, description,
                    cube_type, grain, dimension_codes, measure_codes,
                    account_types, book_codes, refresh_mode, retention_years
                ) VALUES
                (
                    v_tenant, 'CA-PARENT', 'FS_MONTHLY', 'Financial Statement Cube',
                    'Monthly P&L and Balance Sheet — full dimension suite',
                    'FS', 'MONTHLY',
                    '{COST_CENTER,PROFIT_CENTER}',
                    '{amount_dr,amount_cr,amount_net}',
                    NULL,
                    '{STAT,IFRS}',              -- dual-book: statutory + IFRS
                    'EVENT',
                    5
                ),
                (
                    v_tenant, 'CA-SUB', 'FS_MONTHLY', 'Financial Statement Cube (Sub)',
                    'Monthly P&L and Balance Sheet — subsidiary',
                    'FS', 'MONTHLY',
                    '{COST_CENTER,PROFIT_CENTER}',
                    '{amount_dr,amount_cr,amount_net}',
                    NULL,
                    '{STAT,LOCAL}',             -- statutory + local GAAP
                    'EVENT',
                    5
                )
                ON CONFLICT (tenant_id, entity_code, cube_code) DO UPDATE
                    SET name = EXCLUDED.name,
                        dimension_codes = EXCLUDED.dimension_codes,
                        book_codes = EXCLUDED.book_codes,
                        updated_at = now();

                -- MGMT cube: management by segment + intercompany
                INSERT INTO fin.rpt_cube_definition (
                    tenant_id, entity_code, cube_code, name, description,
                    cube_type, grain, dimension_codes, measure_codes,
                    account_types, book_codes, refresh_mode, retention_years
                ) VALUES (
                    v_tenant, 'CA-PARENT', 'MGMT_MONTHLY', 'Management Analytics Cube',
                    'Internal P&L by Cost Center, Profit Center, and Segment',
                    'MGMT', 'MONTHLY',
                    '{COST_CENTER,PROFIT_CENTER,SEGMENT}',
                    '{amount_dr,amount_cr,amount_net}',
                    '{REVENUE,EXPENSE}',
                    '{STAT}',
                    'EVENT',
                    5
                ) ON CONFLICT (tenant_id, entity_code, cube_code) DO UPDATE
                    SET name = EXCLUDED.name,
                        dimension_codes = EXCLUDED.dimension_codes,
                        updated_at = now();

                -- OPS cube: operational cost
                INSERT INTO fin.rpt_cube_definition (
                    tenant_id, entity_code, cube_code, name, description,
                    cube_type, grain, dimension_codes, measure_codes,
                    account_types, book_codes, refresh_mode, retention_years
                ) VALUES (
                    v_tenant, 'CA-PARENT', 'OPS_MONTHLY', 'Operational Cost Cube',
                    'OPEX tracking by Cost Center and Segment',
                    'OPS', 'MONTHLY',
                    '{COST_CENTER,SEGMENT}',
                    '{amount_dr,amount_cr,amount_net}',
                    '{EXPENSE}',
                    '{STAT}',
                    'HYBRID',
                    5
                ) ON CONFLICT (tenant_id, entity_code, cube_code) DO UPDATE
                    SET name = EXCLUDED.name,
                        dimension_codes = EXCLUDED.dimension_codes,
                        updated_at = now();

                -- IC cube: intercompany / consolidation
                INSERT INTO fin.rpt_cube_definition (
                    tenant_id, entity_code, cube_code, name, description,
                    cube_type, grain, dimension_codes, measure_codes,
                    account_types, book_codes, refresh_mode, retention_years
                ) VALUES (
                    v_tenant, 'CA-PARENT', 'IC_MONTHLY', 'Intercompany Cube',
                    'Cross-entity balances for consolidation elimination',
                    'IC', 'MONTHLY',
                    '{COST_CENTER,SEGMENT,INTERCOMPANY}',
                    '{amount_dr,amount_cr,amount_net}',
                    NULL,                       -- all account types
                    '{STAT,IFRS}',              -- consolidation books
                    'HYBRID',
                    5
                ) ON CONFLICT (tenant_id, entity_code, cube_code) DO UPDATE
                    SET name = EXCLUDED.name,
                        dimension_codes = EXCLUDED.dimension_codes,
                        updated_at = now();

        END CASE;

    END LOOP;
END $$;
