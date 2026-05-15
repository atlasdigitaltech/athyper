-- ============================================================================
-- 303_company_code_tax_fx_links.sql - post-company tax/FX onboarding links
-- ============================================================================
-- Purpose:
--   Universal tax and FX catalogs are tenant-scoped, but company codes are
--   tenant-specific and are created by onboarding files. This post-company
--   step connects every applicable company code to those universal catalogs.
--
-- Depends:
--   020_universal/020_tax/320_tax_jurisdictions.sql
--   020_universal/020_tax/330_fx_rates.sql
--   tenant 100_org_structure/1* or /2* legal_entity/company_code files
-- ============================================================================

DO $seed$
DECLARE
    v_tid     uuid;
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_missing text;
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set - run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    -- Company codes often omit country_code because the legal entity already
    -- carries statutory country. Copy it only when the company code has no
    -- explicit operational country.
    UPDATE master.company_code cc
    SET country_code = le.country_code,
        updated_at   = now(),
        updated_by   = v_su
    FROM master.legal_entity le
    WHERE cc.tenant_id = v_tid
      AND le.tenant_id = cc.tenant_id
      AND le.id = cc.legal_entity_id
      AND cc.country_code IS NULL
      AND le.country_code IS NOT NULL;

    -- Link each company code to the tenant's matching country-level tax
    -- jurisdiction. If the tenant has a country-specific override seeded
    -- outside the universal pack, this still works as long as country_code
    -- and level_no are populated.
    UPDATE master.company_code cc
    SET tax_jurisdiction_id = tj.id,
        updated_at          = now(),
        updated_by          = v_su
    FROM master.tax_jurisdiction tj
    WHERE cc.tenant_id = v_tid
      AND tj.tenant_id = cc.tenant_id
      AND tj.level_no = 1
      AND tj.status = 'active'
      AND tj.country_code = cc.country_code
      AND cc.tax_jurisdiction_id IS DISTINCT FROM tj.id;

    -- A1: Any active company code whose country has a tenant jurisdiction must
    -- now point at a same-tenant jurisdiction for that country.
    SELECT string_agg(cc.code, ', ' ORDER BY cc.code)
    INTO v_missing
    FROM master.company_code cc
    WHERE cc.tenant_id = v_tid
      AND cc.status = 'active'
      AND cc.country_code IS NOT NULL
      AND EXISTS (
          SELECT 1
          FROM master.tax_jurisdiction tj
          WHERE tj.tenant_id = cc.tenant_id
            AND tj.level_no = 1
            AND tj.status = 'active'
            AND tj.country_code = cc.country_code
      )
      AND NOT EXISTS (
          SELECT 1
          FROM master.tax_jurisdiction linked
          WHERE linked.tenant_id = cc.tenant_id
            AND linked.id = cc.tax_jurisdiction_id
            AND linked.level_no = 1
            AND linked.status = 'active'
            AND linked.country_code = cc.country_code
      );
    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION '303 FAIL: active company code has covered country but no matching tax_jurisdiction_id: %',
            v_missing;
    END IF;

    -- A2: Every active non-MYR company code currency must have usable seeded
    -- SPOT FX to MYR. MYR itself is handled by master.get_fx_rate identity.
    -- Keep the date check aligned with master.get_fx_rate(), which only uses
    -- rates whose effective_date is on or before the posting/onboarding date.
    SELECT string_agg(cc.code || ':' || cc.functional_currency, ', ' ORDER BY cc.code)
    INTO v_missing
    FROM master.company_code cc
    WHERE cc.tenant_id = v_tid
      AND cc.status = 'active'
      AND cc.functional_currency <> 'MYR'
      AND NOT EXISTS (
          SELECT 1
          FROM master.fx_rate r
          WHERE r.tenant_id = cc.tenant_id
            AND r.from_currency = cc.functional_currency
            AND r.to_currency = 'MYR'
            AND r.rate_type = 'SPOT'
            AND r.effective_date <= CURRENT_DATE
            AND r.is_active = true
      );
    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION '303 FAIL: active company code currency missing usable SPOT FX to MYR as of today: %',
            v_missing;
    END IF;

    -- A3: Period-end coverage is required for close/revaluation onboarding.
    SELECT string_agg(cc.code || ':' || cc.functional_currency, ', ' ORDER BY cc.code)
    INTO v_missing
    FROM master.company_code cc
    WHERE cc.tenant_id = v_tid
      AND cc.status = 'active'
      AND cc.functional_currency <> 'MYR'
      AND NOT EXISTS (
          SELECT 1
          FROM master.fx_rate r
          WHERE r.tenant_id = cc.tenant_id
            AND r.from_currency = cc.functional_currency
            AND r.to_currency = 'MYR'
            AND r.rate_type = 'PERIOD_END'
            AND r.effective_date = DATE '2026-03-31'
            AND r.is_active = true
      );
    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION '303 FAIL: active company code currency missing Mar-2026 PERIOD_END FX to MYR: %',
            v_missing;
    END IF;

    RAISE NOTICE '303: company-code tax/FX links checked for tenant % (% active company codes)',
        v_tid,
        (SELECT count(*) FROM master.company_code WHERE tenant_id = v_tid AND status = 'active');
END $seed$;
