/* ============================================================================
   Athyper v2.1 — Tax Jurisdictions & Rates Seed (Blueprint-Based)
   Tables: fin.tax_jurisdiction, fin.tax_rate
   Dependencies: core.tenant, ref.country

   Tax tables are TENANT-SCOPED (no entity_code column).
   For multi-entity tenants (Blueprint F / demo_ca), all country jurisdictions
   are seeded under the single tenant. Runtime resolution uses
   fin.legal_entity.country_code → fin.tax_jurisdiction.country_code.

   All rates are demo-simplified approximations, effective 2026-01-01.
   ============================================================================ */

-- ============================================================================
-- Helper: upsert jurisdiction, return id
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.upsert_tax_juris(
    p_tenant uuid, p_code text, p_name text,
    p_country varchar(2), p_state varchar(10),
    p_type text, p_parent_code text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE
    v_id uuid;
    v_parent uuid;
BEGIN
    IF p_parent_code IS NOT NULL THEN
        SELECT id INTO v_parent FROM fin.tax_jurisdiction
        WHERE tenant_id = p_tenant AND code = p_parent_code;
    END IF;

    INSERT INTO fin.tax_jurisdiction (
        id, tenant_id, code, name, country_code, state_region_code,
        jurisdiction_type, parent_id
    ) VALUES (
        gen_random_uuid(), p_tenant, p_code, p_name,
        p_country, NULLIF(p_state, ''), p_type, v_parent
    )
    ON CONFLICT (tenant_id, code) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_id;
    RETURN v_id;
END $fn$;

-- ============================================================================
-- Helper: upsert tax rate
-- ============================================================================
CREATE OR REPLACE FUNCTION pg_temp.upsert_tax_rate(
    p_tenant uuid, p_juris_id uuid, p_tax_type text,
    p_tax_code text, p_rate decimal, p_desc text,
    p_effective date DEFAULT '2026-01-01'
) RETURNS uuid LANGUAGE plpgsql AS $fn$
DECLARE v_id uuid;
BEGIN
    INSERT INTO fin.tax_rate (
        id, tenant_id, jurisdiction_id, tax_type, tax_code,
        rate, description, effective_from
    ) VALUES (
        gen_random_uuid(), p_tenant, p_juris_id, p_tax_type,
        p_tax_code, p_rate, p_desc, p_effective
    )
    ON CONFLICT (tenant_id, jurisdiction_id, tax_code, effective_from)
    DO UPDATE SET rate = EXCLUDED.rate
    RETURNING id INTO v_id;
    RETURN v_id;
END $fn$;

-- ============================================================================
-- Main seed loop
-- ============================================================================
DO $$
DECLARE
    v_tenant uuid;
    v_code   text;
    v_j      uuid; -- jurisdiction id
    v_jp     uuid; -- parent jurisdiction id
BEGIN
    FOR v_code IN SELECT code FROM core.tenant WHERE code LIKE 'demo_%' AND status = 'active' ORDER BY code LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        CASE v_code

            -- ================================================================
            -- MY — Sales & Services Tax (SST)
            -- ================================================================
            WHEN 'demo_my' THEN
                v_j := pg_temp.upsert_tax_juris(v_tenant, 'MY-SST', 'Malaysia SST', 'MY', '', 'COUNTRY');
                PERFORM pg_temp.upsert_tax_rate(v_tenant, v_j, 'SALES_TAX', 'SST-SERVICES', 6.0000, 'Service Tax 6%');
                PERFORM pg_temp.upsert_tax_rate(v_tenant, v_j, 'SALES_TAX', 'SST-GOODS',   10.0000, 'Sales Tax 10%');
                PERFORM pg_temp.upsert_tax_rate(v_tenant, v_j, 'SALES_TAX', 'SST-EXEMPT',   0.0000, 'SST Exempt');

            -- ================================================================
            -- IN — GST (Central + State + Integrated)
            -- ================================================================
            WHEN 'demo_in' THEN
                v_j := pg_temp.upsert_tax_juris(v_tenant, 'IN-CGST', 'India CGST (Central)', 'IN', '', 'COUNTRY');
                PERFORM pg_temp.upsert_tax_rate(v_tenant, v_j, 'GST', 'CGST-5',   2.5000, 'CGST 2.5% (of 5% slab)');
                PERFORM pg_temp.upsert_tax_rate(v_tenant, v_j, 'GST', 'CGST-12',  6.0000, 'CGST 6% (of 12% slab)');
                PERFORM pg_temp.upsert_tax_rate(v_tenant, v_j, 'GST', 'CGST-18',  9.0000, 'CGST 9% (of 18% slab)');
                PERFORM pg_temp.upsert_tax_rate(v_tenant, v_j, 'GST', 'CGST-28', 14.0000, 'CGST 14% (of 28% slab)');

                v_j := pg_temp.upsert_tax_juris(v_tenant, 'IN-SGST', 'India SGST (State)', 'IN', 'MH', 'STATE');
                PERFORM pg_temp.upsert_tax_rate(v_tenant, v_j, 'GST', 'SGST-5',   2.5000, 'SGST 2.5% (of 5% slab)');
                PERFORM pg_temp.upsert_tax_rate(v_tenant, v_j, 'GST', 'SGST-12',  6.0000, 'SGST 6% (of 12% slab)');
                PERFORM pg_temp.upsert_tax_rate(v_tenant, v_j, 'GST', 'SGST-18',  9.0000, 'SGST 9% (of 18% slab)');
                PERFORM pg_temp.upsert_tax_rate(v_tenant, v_j, 'GST', 'SGST-28', 14.0000, 'SGST 14% (of 28% slab)');

                v_j := pg_temp.upsert_tax_juris(v_tenant, 'IN-IGST', 'India IGST (Integrated)', 'IN', '', 'COUNTRY');
                PERFORM pg_temp.upsert_tax_rate(v_tenant, v_j, 'GST', 'IGST-5',   5.0000, 'IGST 5%');
                PERFORM pg_temp.upsert_tax_rate(v_tenant, v_j, 'GST', 'IGST-12', 12.0000, 'IGST 12%');
                PERFORM pg_temp.upsert_tax_rate(v_tenant, v_j, 'GST', 'IGST-18', 18.0000, 'IGST 18%');
                PERFORM pg_temp.upsert_tax_rate(v_tenant, v_j, 'GST', 'IGST-28', 28.0000, 'IGST 28%');

            -- ================================================================
            -- SA — ZATCA VAT
            -- ================================================================
            WHEN 'demo_sa' THEN
                v_j := pg_temp.upsert_tax_juris(v_tenant, 'SA-ZATCA', 'Saudi Arabia ZATCA', 'SA', '', 'COUNTRY');
                PERFORM pg_temp.upsert_tax_rate(v_tenant, v_j, 'VAT', 'VAT-STD',  15.0000, 'Standard VAT 15%');
                PERFORM pg_temp.upsert_tax_rate(v_tenant, v_j, 'VAT', 'VAT-ZERO',  0.0000, 'Zero-Rated VAT');
                PERFORM pg_temp.upsert_tax_rate(v_tenant, v_j, 'VAT', 'VAT-EXEMPT', 0.0000, 'VAT Exempt');

            -- ================================================================
            -- QA — No VAT jurisdiction (demo zero rate)
            -- ================================================================
            WHEN 'demo_qa' THEN
                v_j := pg_temp.upsert_tax_juris(v_tenant, 'QA-GTA', 'Qatar General Tax Authority', 'QA', '', 'COUNTRY');
                PERFORM pg_temp.upsert_tax_rate(v_tenant, v_j, 'VAT', 'DEMO-ZERO', 0.0000, 'No VAT (demo placeholder)');

            -- ================================================================
            -- FR — TVA (French VAT)
            -- ================================================================
            WHEN 'demo_fr' THEN
                v_j := pg_temp.upsert_tax_juris(v_tenant, 'FR-DGFiP', 'France DGFiP', 'FR', '', 'COUNTRY');
                PERFORM pg_temp.upsert_tax_rate(v_tenant, v_j, 'VAT', 'TVA-STD',    20.0000, 'TVA taux normal 20%');
                PERFORM pg_temp.upsert_tax_rate(v_tenant, v_j, 'VAT', 'TVA-RED',     5.5000, 'TVA taux réduit 5.5%');
                PERFORM pg_temp.upsert_tax_rate(v_tenant, v_j, 'VAT', 'TVA-INTERM', 10.0000, 'TVA taux intermédiaire 10%');
                PERFORM pg_temp.upsert_tax_rate(v_tenant, v_j, 'VAT', 'TVA-SUPER',   2.1000, 'TVA taux super-réduit 2.1%');

            -- ================================================================
            -- DE — MwSt (German VAT)
            -- ================================================================
            WHEN 'demo_de' THEN
                v_j := pg_temp.upsert_tax_juris(v_tenant, 'DE-BFST', 'Germany BZSt', 'DE', '', 'COUNTRY');
                PERFORM pg_temp.upsert_tax_rate(v_tenant, v_j, 'VAT', 'MWST-STD', 19.0000, 'MwSt Regelsteuersatz 19%');
                PERFORM pg_temp.upsert_tax_rate(v_tenant, v_j, 'VAT', 'MWST-RED',  7.0000, 'MwSt ermäßigter Satz 7%');

            -- ================================================================
            -- CH — MWST (Swiss VAT) + cantonal jurisdictions
            -- ================================================================
            WHEN 'demo_ch' THEN
                v_jp := pg_temp.upsert_tax_juris(v_tenant, 'CH-FTA', 'Swiss Federal Tax Administration', 'CH', '', 'COUNTRY');
                PERFORM pg_temp.upsert_tax_rate(v_tenant, v_jp, 'VAT', 'MWST-STD',    8.1000, 'MWST Normalsatz 8.1%');
                PERFORM pg_temp.upsert_tax_rate(v_tenant, v_jp, 'VAT', 'MWST-RED',    2.6000, 'MWST reduzierter Satz 2.6%');
                PERFORM pg_temp.upsert_tax_rate(v_tenant, v_jp, 'VAT', 'MWST-HOTEL',  3.8000, 'MWST Beherbergung 3.8%');
                -- Cantonal (parent = CH-FTA)
                PERFORM pg_temp.upsert_tax_juris(v_tenant, 'CH-ZH',  'Canton Zürich',  'CH', 'ZH',  'STATE', 'CH-FTA');
                PERFORM pg_temp.upsert_tax_juris(v_tenant, 'CH-GVA', 'Canton Genève',  'CH', 'GE',  'STATE', 'CH-FTA');
                PERFORM pg_temp.upsert_tax_juris(v_tenant, 'CH-BSL', 'Canton Basel-Stadt', 'CH', 'BS', 'STATE', 'CH-FTA');

            -- ================================================================
            -- US — State-level sales tax only (no federal sales tax)
            -- ================================================================
            WHEN 'demo_us' THEN
                v_j := pg_temp.upsert_tax_juris(v_tenant, 'US-NY-SALES', 'New York State Sales Tax', 'US', 'NY', 'STATE');
                PERFORM pg_temp.upsert_tax_rate(v_tenant, v_j, 'SALES_TAX', 'SALES-NY', 8.0000, 'NY combined state+city 8%');

                v_j := pg_temp.upsert_tax_juris(v_tenant, 'US-CA-SALES', 'California Sales Tax', 'US', 'CA', 'STATE');
                PERFORM pg_temp.upsert_tax_rate(v_tenant, v_j, 'SALES_TAX', 'SALES-CA', 7.2500, 'CA base sales tax 7.25%');

                v_j := pg_temp.upsert_tax_juris(v_tenant, 'US-WA-SALES', 'Washington State Sales Tax', 'US', 'WA', 'STATE');
                PERFORM pg_temp.upsert_tax_rate(v_tenant, v_j, 'SALES_TAX', 'SALES-WA', 6.5000, 'WA base sales tax 6.5%');

                v_j := pg_temp.upsert_tax_juris(v_tenant, 'US-GA-SALES', 'Georgia Sales Tax', 'US', 'GA', 'STATE');
                PERFORM pg_temp.upsert_tax_rate(v_tenant, v_j, 'SALES_TAX', 'SALES-GA', 4.0000, 'GA state sales tax 4%');

            -- ================================================================
            -- CA — GST/HST + subsidiary country jurisdictions (Blueprint F)
            -- ================================================================
            WHEN 'demo_ca' THEN
                -- Canadian federal
                v_jp := pg_temp.upsert_tax_juris(v_tenant, 'CA-CRA', 'Canada Revenue Agency', 'CA', '', 'COUNTRY');
                PERFORM pg_temp.upsert_tax_rate(v_tenant, v_jp, 'GST', 'GST-CA', 5.0000, 'Federal GST 5%');

                -- Ontario HST (provincial)
                v_j := pg_temp.upsert_tax_juris(v_tenant, 'CA-ON', 'Ontario HST', 'CA', 'ON', 'STATE', 'CA-CRA');
                PERFORM pg_temp.upsert_tax_rate(v_tenant, v_j, 'GST', 'HST-ON', 13.0000, 'Ontario HST 13%');

                -- Subsidiary country jurisdictions (tenant-scoped, resolved by country_code at runtime)
                v_j := pg_temp.upsert_tax_juris(v_tenant, 'MY-SST', 'Malaysia SST', 'MY', '', 'COUNTRY');
                PERFORM pg_temp.upsert_tax_rate(v_tenant, v_j, 'SALES_TAX', 'SST-SERVICES', 6.0000, 'Malaysia Service Tax 6%');
                PERFORM pg_temp.upsert_tax_rate(v_tenant, v_j, 'SALES_TAX', 'SST-GOODS',   10.0000, 'Malaysia Sales Tax 10%');

                v_j := pg_temp.upsert_tax_juris(v_tenant, 'SA-ZATCA', 'Saudi Arabia ZATCA', 'SA', '', 'COUNTRY');
                PERFORM pg_temp.upsert_tax_rate(v_tenant, v_j, 'VAT', 'VAT-STD', 15.0000, 'Saudi VAT 15%');
                PERFORM pg_temp.upsert_tax_rate(v_tenant, v_j, 'VAT', 'VAT-ZERO', 0.0000, 'Saudi Zero-Rated');

                v_j := pg_temp.upsert_tax_juris(v_tenant, 'IN-GST', 'India GST (Integrated)', 'IN', '', 'COUNTRY');
                PERFORM pg_temp.upsert_tax_rate(v_tenant, v_j, 'GST', 'IGST-18', 18.0000, 'India IGST 18%');
                PERFORM pg_temp.upsert_tax_rate(v_tenant, v_j, 'GST', 'IGST-5',   5.0000, 'India IGST 5%');

            ELSE
                RAISE NOTICE 'Tax: No blueprint mapping for tenant %', v_code;
        END CASE;

        RAISE NOTICE 'Tax jurisdictions/rates seeded for tenant %', v_code;
    END LOOP;
END $$;
