/* ============================================================================
   Athyper v2.1 — Funding Profiles Seed (Blueprint-Based)
   Table: fin.funding_profile
   Dependencies: core.tenant, fin.operating_unit, fin.business_intent

   Funding is OPTIONAL — Blueprints A/B have zero funding profiles.
   All funding-dependent queries must be LEFT JOIN safe.
   The financeEngines.budget config flag gates this at runtime.

   Hierarchy levels: 1=Enterprise, 2=Division/Region/Entity, 3=OU, 4=Intent
   FY 2026, status=ACTIVE, health=GREEN, amounts are demo placeholders.
   ============================================================================ */

-- ============================================================================
-- Helper: upsert funding profile, return id
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.upsert_fp(
    p_tenant uuid, p_entity_code text, p_code text, p_name text,
    p_level smallint, p_parent uuid, p_ou_id uuid, p_intent_id uuid,
    p_total decimal, p_currency text
) RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE v_id uuid;
BEGIN
    INSERT INTO fin.funding_profile (
        id, tenant_id, entity_code, code, name,
        level, parent_id, ou_id, intent_id,
        total_limit, currency_code, fiscal_year, status
    ) VALUES (
        gen_random_uuid(), p_tenant, p_entity_code, p_code, p_name,
        p_level, p_parent, p_ou_id, p_intent_id,
        p_total, p_currency, 2026, 'ACTIVE'
    )
    ON CONFLICT (tenant_id, entity_code, code, fiscal_year)
    DO UPDATE SET updated_at = now()
    RETURNING id INTO v_id;
    RETURN v_id;
END $fn$;

-- ============================================================================
-- Helper: resolve OU id
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.resolve_ou(p_tenant uuid, p_entity_code text, p_code text)
RETURNS uuid LANGUAGE sql STABLE AS $fn$
    SELECT id FROM fin.operating_unit
    WHERE tenant_id = p_tenant AND entity_code = p_entity_code AND code = p_code
    LIMIT 1;
$fn$;

-- ============================================================================
-- Helper: resolve intent id
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.resolve_intent(p_tenant uuid, p_intent_code text)
RETURNS uuid LANGUAGE sql STABLE AS $fn$
    SELECT id FROM fin.business_intent
    WHERE tenant_id = p_tenant AND code = p_intent_code
    LIMIT 1;
$fn$;

-- ============================================================================
-- Main seed loop
-- ============================================================================
DO $$
DECLARE
    v_tenant  uuid;
    v_code    text;
    v_currency text;
    v_fp_l1   uuid;
    v_fp_l2   uuid;
    v_fp_l3   uuid;
BEGIN
    FOR v_code IN SELECT code FROM core.tenant WHERE code LIKE 'demo_%' AND status = 'active' ORDER BY code LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        -- Skip A/B — no funding
        IF v_code IN ('demo_my','demo_in','demo_sa','demo_qa') THEN
            RAISE NOTICE 'Funding: skipped (no funding) for tenant %', v_code;
            CONTINUE;
        END IF;

        -- Resolve default currency
        SELECT tp.currency INTO v_currency
        FROM core.tenant_profile tp WHERE tp.tenant_id = v_tenant;
        IF v_currency IS NULL THEN v_currency := 'USD'; END IF;

        CASE v_code

            -- ================================================================
            -- Blueprint C: SME — 3 levels (Enterprise → Division → OU)
            -- ================================================================
            WHEN 'demo_fr', 'demo_de' THEN
                v_fp_l1 := pg_temp.upsert_fp(v_tenant, 'HQ', 'FP-ENTERPRISE', 'Enterprise Budget',
                    1::smallint, NULL, pg_temp.resolve_ou(v_tenant,'HQ','COMPANY'), NULL,
                    500000.0000, v_currency);

                v_fp_l2 := pg_temp.upsert_fp(v_tenant, 'HQ', 'FP-DIV-PRODUCTS', 'Products Division Budget',
                    2::smallint, v_fp_l1, pg_temp.resolve_ou(v_tenant,'HQ','DIV-PRODUCTS'), NULL,
                    300000.0000, v_currency);

                v_fp_l2 := pg_temp.upsert_fp(v_tenant, 'HQ', 'FP-DIV-SERVICES', 'Services Division Budget',
                    2::smallint, v_fp_l1, pg_temp.resolve_ou(v_tenant,'HQ','DIV-SERVICES'), NULL,
                    200000.0000, v_currency);

                -- OU-level (sample — one per division)
                PERFORM pg_temp.upsert_fp(v_tenant, 'HQ', 'FP-DEPT-SALES', 'Sales Department Budget',
                    3::smallint, v_fp_l2, pg_temp.resolve_ou(v_tenant,'HQ','DEPT-SALES'), NULL,
                    100000.0000, v_currency);
                PERFORM pg_temp.upsert_fp(v_tenant, 'HQ', 'FP-DEPT-DELIVERY', 'Delivery Department Budget',
                    3::smallint, v_fp_l2, pg_temp.resolve_ou(v_tenant,'HQ','DEPT-DELIVERY'), NULL,
                    100000.0000, v_currency);

            -- ================================================================
            -- Blueprint D: Big single country — 4 levels (Enterprise → Region → OU → Intent)
            -- ================================================================
            WHEN 'demo_us' THEN
                v_fp_l1 := pg_temp.upsert_fp(v_tenant, 'HQ', 'FP-ENTERPRISE', 'Enterprise Budget',
                    1::smallint, NULL, pg_temp.resolve_ou(v_tenant,'HQ','COMPANY'), NULL,
                    5000000.0000, v_currency);

                -- Regional level
                v_fp_l2 := pg_temp.upsert_fp(v_tenant, 'HQ', 'FP-REGION-EAST', 'East Region Budget',
                    2::smallint, v_fp_l1, pg_temp.resolve_ou(v_tenant,'HQ','REGION-EAST'), NULL,
                    2500000.0000, v_currency);
                v_fp_l2 := pg_temp.upsert_fp(v_tenant, 'HQ', 'FP-REGION-WEST', 'West Region Budget',
                    2::smallint, v_fp_l1, pg_temp.resolve_ou(v_tenant,'HQ','REGION-WEST'), NULL,
                    2000000.0000, v_currency);
                PERFORM pg_temp.upsert_fp(v_tenant, 'HQ', 'FP-SSC', 'Shared Services Budget',
                    2::smallint, v_fp_l1, pg_temp.resolve_ou(v_tenant,'HQ','SSC'), NULL,
                    500000.0000, v_currency);

                -- OU-level (one sample branch per region)
                v_fp_l3 := pg_temp.upsert_fp(v_tenant, 'HQ', 'FP-NYC', 'NYC Branch Budget',
                    3::smallint, v_fp_l2, pg_temp.resolve_ou(v_tenant,'HQ','BRANCH-NYC'), NULL,
                    1200000.0000, v_currency);

                -- Intent-level (one sample)
                PERFORM pg_temp.upsert_fp(v_tenant, 'HQ', 'FP-NYC-OPEX', 'NYC OPEX Budget',
                    4::smallint, v_fp_l3, pg_temp.resolve_ou(v_tenant,'HQ','BRANCH-NYC'),
                    pg_temp.resolve_intent(v_tenant, 'OPEX-GENERAL'),
                    400000.0000, v_currency);
                PERFORM pg_temp.upsert_fp(v_tenant, 'HQ', 'FP-NYC-CAPEX', 'NYC CAPEX Budget',
                    4::smallint, v_fp_l3, pg_temp.resolve_ou(v_tenant,'HQ','BRANCH-NYC'),
                    pg_temp.resolve_intent(v_tenant, 'CAPEX-EQUIPMENT'),
                    200000.0000, v_currency);

                v_fp_l3 := pg_temp.upsert_fp(v_tenant, 'HQ', 'FP-SF', 'SF Branch Budget',
                    3::smallint, v_fp_l2, pg_temp.resolve_ou(v_tenant,'HQ','BRANCH-SF'), NULL,
                    1000000.0000, v_currency);

                PERFORM pg_temp.upsert_fp(v_tenant, 'HQ', 'FP-SF-OPEX', 'SF OPEX Budget',
                    4::smallint, v_fp_l3, pg_temp.resolve_ou(v_tenant,'HQ','BRANCH-SF'),
                    pg_temp.resolve_intent(v_tenant, 'OPEX-GENERAL'),
                    350000.0000, v_currency);

            -- ================================================================
            -- Blueprint E: Multi-location — 3 levels (Enterprise → Branch → OU)
            -- ================================================================
            WHEN 'demo_ch' THEN
                v_fp_l1 := pg_temp.upsert_fp(v_tenant, 'HQ', 'FP-ENTERPRISE', 'Enterprise Budget',
                    1::smallint, NULL, pg_temp.resolve_ou(v_tenant,'HQ','COMPANY'), NULL,
                    2000000.0000, v_currency);

                v_fp_l2 := pg_temp.upsert_fp(v_tenant, 'HQ', 'FP-BRANCH-ZH', 'Zurich Branch Budget',
                    2::smallint, v_fp_l1, pg_temp.resolve_ou(v_tenant,'HQ','BRANCH-ZH'), NULL,
                    800000.0000, v_currency);
                v_fp_l2 := pg_temp.upsert_fp(v_tenant, 'HQ', 'FP-BRANCH-GVA', 'Geneva Branch Budget',
                    2::smallint, v_fp_l1, pg_temp.resolve_ou(v_tenant,'HQ','BRANCH-GVA'), NULL,
                    700000.0000, v_currency);
                v_fp_l2 := pg_temp.upsert_fp(v_tenant, 'HQ', 'FP-BRANCH-BSL', 'Basel Branch Budget',
                    2::smallint, v_fp_l1, pg_temp.resolve_ou(v_tenant,'HQ','BRANCH-BSL'), NULL,
                    500000.0000, v_currency);

                -- OU-level (one per branch)
                PERFORM pg_temp.upsert_fp(v_tenant, 'HQ', 'FP-ZH-SALES', 'Zurich Sales Budget',
                    3::smallint, v_fp_l2, pg_temp.resolve_ou(v_tenant,'HQ','DEPT-ZH-SALES'), NULL,
                    250000.0000, v_currency);
                PERFORM pg_temp.upsert_fp(v_tenant, 'HQ', 'FP-ZH-OPS', 'Zurich Operations Budget',
                    3::smallint, v_fp_l2, pg_temp.resolve_ou(v_tenant,'HQ','DEPT-ZH-OPS'), NULL,
                    250000.0000, v_currency);

            -- ================================================================
            -- Blueprint F: Multi-country — 4 levels (Enterprise → Entity → OU → Intent)
            -- ================================================================
            WHEN 'demo_ca' THEN
                -- Level 1: Group enterprise
                v_fp_l1 := pg_temp.upsert_fp(v_tenant, 'LE-CA', 'FP-GROUP', 'Group Consolidated Budget',
                    1::smallint, NULL, pg_temp.resolve_ou(v_tenant,'LE-CA','LE-CA'), NULL,
                    10000000.0000, v_currency);

                -- Level 2: Per legal entity
                v_fp_l2 := pg_temp.upsert_fp(v_tenant, 'LE-CA', 'FP-LE-CA', 'Canada Holding Budget',
                    2::smallint, v_fp_l1, pg_temp.resolve_ou(v_tenant,'LE-CA','LE-CA'), NULL,
                    3000000.0000, v_currency);
                PERFORM pg_temp.upsert_fp(v_tenant, 'LE-MY', 'FP-LE-MY', 'Malaysia Subsidiary Budget',
                    2::smallint, v_fp_l1, pg_temp.resolve_ou(v_tenant,'LE-MY','LE-MY'), NULL,
                    2000000.0000, 'MYR');
                PERFORM pg_temp.upsert_fp(v_tenant, 'LE-SA', 'FP-LE-SA', 'Saudi Subsidiary Budget',
                    2::smallint, v_fp_l1, pg_temp.resolve_ou(v_tenant,'LE-SA','LE-SA'), NULL,
                    2500000.0000, 'SAR');
                PERFORM pg_temp.upsert_fp(v_tenant, 'LE-IN', 'FP-LE-IN', 'India Subsidiary Budget',
                    2::smallint, v_fp_l1, pg_temp.resolve_ou(v_tenant,'LE-IN','LE-IN'), NULL,
                    2500000.0000, 'INR');

                -- Level 3: OU-level (one dept per entity as sample)
                PERFORM pg_temp.upsert_fp(v_tenant, 'LE-CA', 'FP-CA-FIN', 'Canada Finance Dept Budget',
                    3::smallint, v_fp_l2, pg_temp.resolve_ou(v_tenant,'LE-CA','DEPT-CA-FIN'), NULL,
                    1500000.0000, v_currency);
                PERFORM pg_temp.upsert_fp(v_tenant, 'LE-MY', 'FP-MY-OPS', 'Malaysia Ops Dept Budget',
                    3::smallint, v_fp_l2, pg_temp.resolve_ou(v_tenant,'LE-MY','DEPT-MY-OPS'), NULL,
                    1000000.0000, 'MYR');
                PERFORM pg_temp.upsert_fp(v_tenant, 'LE-SA', 'FP-SA-OPS', 'Saudi Ops Dept Budget',
                    3::smallint, v_fp_l2, pg_temp.resolve_ou(v_tenant,'LE-SA','DEPT-SA-OPS'), NULL,
                    1200000.0000, 'SAR');
                PERFORM pg_temp.upsert_fp(v_tenant, 'LE-IN', 'FP-IN-OPS', 'India Ops Dept Budget',
                    3::smallint, v_fp_l2, pg_temp.resolve_ou(v_tenant,'LE-IN','DEPT-IN-OPS'), NULL,
                    1200000.0000, 'INR');

                -- Level 4: Intent-level (one sample per entity)
                PERFORM pg_temp.upsert_fp(v_tenant, 'LE-CA', 'FP-CA-OPEX', 'Canada OPEX Budget',
                    4::smallint, v_fp_l2, pg_temp.resolve_ou(v_tenant,'LE-CA','LE-CA'),
                    pg_temp.resolve_intent(v_tenant, 'OPEX-GENERAL'),
                    500000.0000, v_currency);
                PERFORM pg_temp.upsert_fp(v_tenant, 'LE-MY', 'FP-MY-OPEX', 'Malaysia OPEX Budget',
                    4::smallint, v_fp_l2, pg_temp.resolve_ou(v_tenant,'LE-MY','LE-MY'),
                    pg_temp.resolve_intent(v_tenant, 'OPEX-GENERAL'),
                    300000.0000, 'MYR');

            ELSE
                RAISE NOTICE 'Funding: No blueprint mapping for tenant %', v_code;
        END CASE;

        RAISE NOTICE 'Funding profiles seeded for tenant %', v_code;
    END LOOP;
END $$;
