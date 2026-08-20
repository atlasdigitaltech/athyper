-- Wires every active company_code to the universal tax_jurisdiction + FX
-- catalogues seeded by 320/330. Must run AFTER tenant 100_org_structure files
-- have created the legal_entity + company_code rows.

DO $seed$
DECLARE
    v_tid     uuid;
    v_missing text;
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set - run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    -- Tax jurisdiction is no longer a mutable company-code attribute. Validate
    -- that every company has an explicit operational country and a matching
    -- tenant-local country jurisdiction; registrations/policy link them later.
    SELECT string_agg(cc.code, ', ' ORDER BY cc.code)
    INTO v_missing
    FROM master.company_code cc
    WHERE cc.tenant_id = v_tid
      AND cc.status = 'active'
      AND (cc.country_code IS NULL OR NOT EXISTS (
          SELECT 1 FROM master.tax_jurisdiction jurisdiction
          WHERE jurisdiction.tenant_id=cc.tenant_id
            AND jurisdiction.jurisdiction_type='country'
            AND jurisdiction.status='active'
            AND jurisdiction.country_code=cc.country_code));
    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION '303 FAIL: active company code missing country or matching tax jurisdiction: %',
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
