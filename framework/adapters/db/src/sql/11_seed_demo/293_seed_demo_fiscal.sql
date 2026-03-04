/* ============================================================================
   Athyper v2.1 — Fiscal Periods Seed (Blueprint-Based)
   Table: fin.fiscal_period
   Dependencies: core.tenant, core.tenant_profile (fiscal_year_start_month),
                 fin.operating_unit (entity_code discovery)

   Seeds FY 2026 for all tenants (12 monthly periods + 1 adjustment period).
   Jan-start tenants: Jan 2026 – Dec 2026.
   Apr-start tenants (IN, CA): Apr 2026 – Mar 2027.
   ============================================================================ */

DO $$
DECLARE
    v_tenant   uuid;
    v_code     text;
    v_fy_start int;
    v_entity   text;
    v_period   int;
    v_start    date;
    v_end      date;
    v_fy_year  int := 2026;
    v_month    int;
    v_year     int;
BEGIN
    FOR v_code IN SELECT code FROM core.tenant WHERE code LIKE 'demo_%' AND status = 'active' ORDER BY code LOOP
        SELECT id INTO v_tenant FROM core.tenant WHERE code = v_code;
        IF v_tenant IS NULL THEN CONTINUE; END IF;

        -- Determine fiscal year start month from tenant_profile (default 1 = January)
        SELECT COALESCE(tp.fiscal_year_start_month, 1)
        INTO v_fy_start
        FROM core.tenant_profile tp
        WHERE tp.tenant_id = v_tenant;

        IF v_fy_start IS NULL THEN v_fy_start := 1; END IF;

        -- For each entity_code used by this tenant
        FOR v_entity IN
            SELECT DISTINCT entity_code FROM fin.operating_unit
            WHERE tenant_id = v_tenant ORDER BY entity_code
        LOOP
            -- Generate 12 monthly periods
            FOR v_period IN 1..12 LOOP
                -- Calculate month: (fy_start - 1 + period - 1) mod 12 + 1
                v_month := ((v_fy_start - 1) + (v_period - 1)) % 12 + 1;

                -- Calculate year: if month rolled past December, increment year
                IF v_month >= v_fy_start THEN
                    v_year := v_fy_year;
                ELSE
                    v_year := v_fy_year + 1;
                END IF;

                v_start := make_date(v_year, v_month, 1);
                -- End of month: first day of next month minus 1
                IF v_month = 12 THEN
                    v_end := make_date(v_year + 1, 1, 1) - 1;
                ELSE
                    v_end := make_date(v_year, v_month + 1, 1) - 1;
                END IF;

                INSERT INTO fin.fiscal_period (
                    id, tenant_id, entity_code, fiscal_year, period_number,
                    period_name, start_date, end_date, status
                ) VALUES (
                    gen_random_uuid(), v_tenant, v_entity, v_fy_year, v_period,
                    to_char(v_start, 'Mon YYYY'),
                    v_start, v_end,
                    CASE WHEN v_period = 1 THEN 'OPEN' ELSE 'FUTURE' END
                )
                ON CONFLICT (tenant_id, entity_code, fiscal_year, period_number)
                DO NOTHING;
            END LOOP;

            -- Period 13: adjustment period (start_date = end_date = last day of FY)
            -- Last day of FY = day before the first day of next FY
            IF v_fy_start = 1 THEN
                v_end := make_date(v_fy_year, 12, 31);
            ELSE
                v_end := make_date(v_fy_year + 1, v_fy_start, 1) - 1;
            END IF;

            INSERT INTO fin.fiscal_period (
                id, tenant_id, entity_code, fiscal_year, period_number,
                period_name, start_date, end_date, status
            ) VALUES (
                gen_random_uuid(), v_tenant, v_entity, v_fy_year, 13,
                'Adjustment', v_end, v_end, 'FUTURE'
            )
            ON CONFLICT (tenant_id, entity_code, fiscal_year, period_number)
            DO NOTHING;

        END LOOP; -- entity_code

        RAISE NOTICE 'Fiscal periods seeded for tenant %', v_code;
    END LOOP; -- tenant
END $$;
