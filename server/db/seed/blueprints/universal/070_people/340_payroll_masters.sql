-- Universal payroll master data (tenant-scoped, idempotent). Contents:
--   formula_expression(14) + versions, rate_table(7) + ~70 rows (IN×3, SG, GB, US×2),
--   pay_component(58), pay_structure(3 tenant templates), pay_structure_line(~50),
--   statutory_scheme(18 across IN/SG/MY/GB/US/AE).
--
-- VERIFY BEFORE EACH FINANCIAL YEAR — these rates expire/change:
--   SG CPF — 55-60 / 60-65 age-band rates follow CPF Board phased-increase schedule.
--   IN IT  — new-regime slabs match FY2025-26 (Budget 2025); add FY2026-27 after Budget 2026.
--   UK NI  — 2025-26 rates (15% employer from Apr 2025); update on next Autumn Statement.
--   US SS  — wage base $176,100 (2025); update annually per IRS announcement.
--
-- Intentionally NOT seeded:
--   master.pay_group — requires NOT NULL company_code_id; seed per-company elsewhere.
--   master.employee_statutory_enrollment — needs live employee_id; enrol post-hire.

DO $seed$
DECLARE
    v_tid  uuid;
    v_su   uuid := '00000000-0000-0000-0000-000000000000';
    v_pack text := 'universal_payroll_masters';
    v_n    int;
BEGIN
    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[seed] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    RAISE NOTICE '[%] Starting payroll masters seed for tenant %', v_pack, v_tid;

    -- ========================================================================
    -- § 1  FORMULA EXPRESSIONS
    -- Named formulas covering core payroll arithmetic, statutory contributions,
    -- and Indian statutory provisions. Additional country packs can add more.
    -- ========================================================================
    INSERT INTO control.formula_expression (
        id, tenant_id, code, name, module_code, formula_kind,
        description, input_schema, output_schema, default_rounding,
        status, created_by
    )
    VALUES

        -- Passthrough: returns the amount input as-is (used for BASIC, SA, bonuses
        -- where the amount is set directly on the compensation assignment).
        (shared.uuidv7(), v_tid,
         'basic_salary_passthrough', 'Basic Salary Passthrough',
         'PAYROLL', 'payroll',
         'Returns the input basic_salary amount unchanged. Used for fixed-amount components where the value comes from the compensation record.',
         '{"basic_salary": "number"}'::jsonb,
         '{"amount": "number"}'::jsonb,
         '{"mode": "half_up", "precision": 2}'::jsonb,
         'active', v_su),

        -- HRA = basic_salary × hra_pct / 100
        (shared.uuidv7(), v_tid,
         'hra_pct_of_basic', 'HRA — Percentage of Basic',
         'PAYROLL', 'payroll',
         'House Rent Allowance computed as a percentage of basic salary. Standard: 40% for non-metro, 50% for metro cities.',
         '{"basic_salary": "number", "hra_pct": "number"}'::jsonb,
         '{"amount": "number"}'::jsonb,
         '{"mode": "half_up", "precision": 2}'::jsonb,
         'active', v_su),

        -- Pro-rate by calendar days: full_month × paid_days / calendar_days
        (shared.uuidv7(), v_tid,
         'pro_rate_calendar', 'Pro-Rata — Calendar Days',
         'PAYROLL', 'payroll',
         'Reduces a full-month salary component proportionally for partial attendance based on calendar days.',
         '{"full_month_amount": "number", "paid_days": "number", "calendar_days": "number"}'::jsonb,
         '{"amount": "number"}'::jsonb,
         '{"mode": "half_up", "precision": 2}'::jsonb,
         'active', v_su),

        -- Pro-rate by working days: full_month × days_worked / working_days
        (shared.uuidv7(), v_tid,
         'pro_rate_working', 'Pro-Rata — Working Days',
         'PAYROLL', 'payroll',
         'Reduces a full-month salary component proportionally based on actual working days attended vs. scheduled working days.',
         '{"full_month_amount": "number", "days_worked": "number", "working_days": "number"}'::jsonb,
         '{"amount": "number"}'::jsonb,
         '{"mode": "half_up", "precision": 2}'::jsonb,
         'active', v_su),

        -- Regular OT: (basic / working_days / hours_per_day) × ot_hours
        (shared.uuidv7(), v_tid,
         'overtime_regular', 'Overtime Pay — Regular Rate (1×)',
         'PAYROLL', 'payroll',
         'Overtime at regular hourly rate: (basic ÷ working_days ÷ hours_per_day) × ot_hours. Applicable where no premium multiplier is mandated.',
         '{"basic_salary": "number", "working_days": "number", "hours_per_day": "number", "ot_hours": "number"}'::jsonb,
         '{"amount": "number"}'::jsonb,
         '{"mode": "half_up", "precision": 2}'::jsonb,
         'active', v_su),

        -- Premium OT: same as regular but × 1.5 or 2 (multiplier input)
        (shared.uuidv7(), v_tid,
         'overtime_premium', 'Overtime Pay — Premium Rate (configurable multiplier)',
         'PAYROLL', 'payroll',
         'Overtime at configurable premium rate: (basic ÷ working_days ÷ hours_per_day) × ot_hours × ot_multiplier. Set multiplier=1.5 for standard OT or 2.0 for holiday OT.',
         '{"basic_salary": "number", "working_days": "number", "hours_per_day": "number", "ot_hours": "number", "ot_multiplier": "number"}'::jsonb,
         '{"amount": "number"}'::jsonb,
         '{"mode": "half_up", "precision": 2}'::jsonb,
         'active', v_su),

        -- India PF Employee: min(basic+DA, pf_wage_ceiling) × pf_employee_rate / 100
        (shared.uuidv7(), v_tid,
         'pf_employee_in', 'PF — Employee Contribution (India)',
         'PAYROLL', 'payroll',
         'India EPF Act 1952: 12% of (basic+DA) capped at PF wage ceiling (₹15,000/month). employee contribution goes to PF account.',
         '{"basic_salary": "number", "da_amount": "number", "pf_wage_ceiling": "number", "pf_employee_rate": "number"}'::jsonb,
         '{"amount": "number"}'::jsonb,
         '{"mode": "round", "precision": 0}'::jsonb,
         'active', v_su),

        -- India PF Employer: split into 3.67% PF + 8.33% EPS on capped wage
        (shared.uuidv7(), v_tid,
         'pf_employer_in', 'PF — Employer Contribution (India)',
         'PAYROLL', 'payroll',
         'India EPF Act 1952: employer contributes 3.67% to PF + 8.33% to EPS on capped wage. Total employer PF outgo = 12% of capped wage + EDLI + admin charges.',
         '{"basic_salary": "number", "da_amount": "number", "pf_wage_ceiling": "number", "pf_employer_rate": "number"}'::jsonb,
         '{"amount": "number", "eps_amount": "number", "edli_amount": "number"}'::jsonb,
         '{"mode": "round", "precision": 0}'::jsonb,
         'active', v_su),

        -- India ESI Employee: gross × 0.75% if gross ≤ ESI ceiling
        (shared.uuidv7(), v_tid,
         'esi_employee_in', 'ESI — Employee Contribution (India)',
         'PAYROLL', 'payroll',
         'India ESI Act 1948: employee contributes 0.75% of gross salary if gross ≤ ESI wage ceiling (₹21,000/month). Zero for exempt employees.',
         '{"gross_salary": "number", "esi_wage_ceiling": "number", "esi_employee_rate": "number"}'::jsonb,
         '{"amount": "number", "is_exempt": "boolean"}'::jsonb,
         '{"mode": "round", "precision": 0}'::jsonb,
         'active', v_su),

        -- India ESI Employer: gross × 3.25% if gross ≤ ESI ceiling
        (shared.uuidv7(), v_tid,
         'esi_employer_in', 'ESI — Employer Contribution (India)',
         'PAYROLL', 'payroll',
         'India ESI Act 1948: employer contributes 3.25% of gross salary if gross ≤ ESI wage ceiling (₹21,000/month). Zero for exempt employees.',
         '{"gross_salary": "number", "esi_wage_ceiling": "number", "esi_employer_rate": "number"}'::jsonb,
         '{"amount": "number", "is_exempt": "boolean"}'::jsonb,
         '{"mode": "round", "precision": 0}'::jsonb,
         'active', v_su),

        -- Monthly TDS: annual_income_tax / 12 (arrears and advance TDS handled separately)
        (shared.uuidv7(), v_tid,
         'income_tax_tds_monthly', 'Income Tax TDS — Monthly Instalment',
         'PAYROLL', 'tax',
         'Monthly tax deduction at source (TDS): annual estimated income tax divided equally across remaining pay periods in the financial year.',
         '{"annual_income_tax": "number", "periods_remaining": "number"}'::jsonb,
         '{"amount": "number"}'::jsonb,
         '{"mode": "round", "precision": 0}'::jsonb,
         'active', v_su),

        -- India Gratuity monthly accrual: (basic+DA) × 15 / 26 / 12
        (shared.uuidv7(), v_tid,
         'gratuity_accrual_in', 'Gratuity Accrual — Monthly Provision (India)',
         'PAYROLL', 'accrual',
         'Payment of Gratuity Act 1972: monthly accrual = (basic+DA) × 15 ÷ 26 ÷ 12. Crystallises on exit after 5 years of continuous service.',
         '{"basic_salary": "number", "da_amount": "number"}'::jsonb,
         '{"amount": "number"}'::jsonb,
         '{"mode": "half_up", "precision": 2}'::jsonb,
         'active', v_su),

        -- India Statutory Bonus: 8.33% of basic capped at monthly ceiling
        (shared.uuidv7(), v_tid,
         'stat_bonus_in', 'Statutory Bonus Accrual (India)',
         'PAYROLL', 'accrual',
         'Payment of Bonus Act 1965: monthly accrual = min(basic × 8.33%, bonus_ceiling_monthly). Allocable surplus determines final payout rate (8.33%–20%).',
         '{"basic_salary": "number", "bonus_ceiling_monthly": "number"}'::jsonb,
         '{"amount": "number"}'::jsonb,
         '{"mode": "round", "precision": 0}'::jsonb,
         'active', v_su),

        -- Leave encashment: (basic / 26) × encashable_days
        (shared.uuidv7(), v_tid,
         'leave_encashment_in', 'Leave Encashment (India — 26-day basis)',
         'PAYROLL', 'leave',
         'Leave encashment value = (basic ÷ 26) × encashable_days. Per-day rate uses 26 working days. Tax exempt on exit up to 10 lakh (Sec 10(10AA)).',
         '{"basic_salary": "number", "encashable_days": "number"}'::jsonb,
         '{"amount": "number"}'::jsonb,
         '{"mode": "half_up", "precision": 2}'::jsonb,
         'active', v_su)

    ON CONFLICT (tenant_id, code) DO UPDATE
        SET name        = EXCLUDED.name,
            description = EXCLUDED.description,
            input_schema  = EXCLUDED.input_schema,
            output_schema = EXCLUDED.output_schema,
            status      = EXCLUDED.status,
            updated_at  = now(),
            updated_by  = v_su
        WHERE (control.formula_expression.name, control.formula_expression.description)
              IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.description);

    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE '[%] formula_expression: % rows upserted', v_pack, v_n;

    -- ========================================================================
    -- § 2  FORMULA EXPRESSION VERSIONS
    -- Version 1 (effective) for every formula above.
    -- expression_body is JSONLogic — safe, portable, evaluator-agnostic.
    -- ========================================================================
    INSERT INTO control.formula_expression_version (
        id, tenant_id, formula_expression_id, version_no, expression_language,
        expression_body, input_defaults, output_mapping, rounding_config,
        effective_from, effective_until, status, published_at, published_by,
        created_at, created_by
    )
    SELECT
        shared.uuidv7(), v_tid, fe.id, x.version_no, x.lang,
        x.body::jsonb,
        x.defaults::jsonb,
        x.mapping::jsonb,
        x.rounding::jsonb,
        x.eff_from::date, NULL::date,
        'effective', now(), v_su,
        now(), v_su
    FROM (VALUES

        ('basic_salary_passthrough', 1, 'jsonlogic',
         '{"var":"basic_salary"}',
         '{"basic_salary":0}',
         '{"result":"amount"}',
         '{"mode":"half_up","precision":2}',
         '2024-01-01'),

        ('hra_pct_of_basic', 1, 'jsonlogic',
         '{"/":[{"*":[{"var":"basic_salary"},{"var":"hra_pct"}]},100]}',
         '{"basic_salary":0,"hra_pct":40}',
         '{"result":"amount"}',
         '{"mode":"half_up","precision":2}',
         '2024-01-01'),

        ('pro_rate_calendar', 1, 'jsonlogic',
         '{"/":[{"*":[{"var":"full_month_amount"},{"var":"paid_days"}]},{"var":"calendar_days"}]}',
         '{"full_month_amount":0,"paid_days":0,"calendar_days":30}',
         '{"result":"amount"}',
         '{"mode":"half_up","precision":2}',
         '2024-01-01'),

        ('pro_rate_working', 1, 'jsonlogic',
         '{"/":[{"*":[{"var":"full_month_amount"},{"var":"days_worked"}]},{"var":"working_days"}]}',
         '{"full_month_amount":0,"days_worked":0,"working_days":26}',
         '{"result":"amount"}',
         '{"mode":"half_up","precision":2}',
         '2024-01-01'),

        ('overtime_regular', 1, 'jsonlogic',
         '{"*":[{"/":[{"/":[{"var":"basic_salary"},{"var":"working_days"}]},{"var":"hours_per_day"}]},{"var":"ot_hours"}]}',
         '{"basic_salary":0,"working_days":26,"hours_per_day":8,"ot_hours":0}',
         '{"result":"amount"}',
         '{"mode":"half_up","precision":2}',
         '2024-01-01'),

        ('overtime_premium', 1, 'jsonlogic',
         '{"*":[{"*":[{"/":[{"/":[{"var":"basic_salary"},{"var":"working_days"}]},{"var":"hours_per_day"}]},{"var":"ot_hours"}]},{"var":"ot_multiplier"}]}',
         '{"basic_salary":0,"working_days":26,"hours_per_day":8,"ot_hours":0,"ot_multiplier":1.5}',
         '{"result":"amount"}',
         '{"mode":"half_up","precision":2}',
         '2024-01-01'),

        ('pf_employee_in', 1, 'jsonlogic',
         '{"/":[{"*":[{"min":[{"+":[{"var":"basic_salary"},{"var":"da_amount"}]},{"var":"pf_wage_ceiling"}]},{"var":"pf_employee_rate"}]},100]}',
         '{"basic_salary":0,"da_amount":0,"pf_wage_ceiling":15000,"pf_employee_rate":12}',
         '{"result":"amount"}',
         '{"mode":"round","precision":0}',
         '2024-01-01'),

        ('pf_employer_in', 1, 'jsonlogic',
         '{"/":[{"*":[{"min":[{"+":[{"var":"basic_salary"},{"var":"da_amount"}]},{"var":"pf_wage_ceiling"}]},{"var":"pf_employer_rate"}]},100]}',
         '{"basic_salary":0,"da_amount":0,"pf_wage_ceiling":15000,"pf_employer_rate":12}',
         '{"result":"amount"}',
         '{"mode":"round","precision":0}',
         '2024-01-01'),

        ('esi_employee_in', 1, 'jsonlogic',
         '{"if":[{"<=":[{"var":"gross_salary"},{"var":"esi_wage_ceiling"}]},{"/":[{"*":[{"var":"gross_salary"},{"var":"esi_employee_rate"}]},100]},0]}',
         '{"gross_salary":0,"esi_wage_ceiling":21000,"esi_employee_rate":0.75}',
         '{"result":"amount","is_exempt":false}',
         '{"mode":"round","precision":0}',
         '2024-01-01'),

        ('esi_employer_in', 1, 'jsonlogic',
         '{"if":[{"<=":[{"var":"gross_salary"},{"var":"esi_wage_ceiling"}]},{"/":[{"*":[{"var":"gross_salary"},{"var":"esi_employer_rate"}]},100]},0]}',
         '{"gross_salary":0,"esi_wage_ceiling":21000,"esi_employer_rate":3.25}',
         '{"result":"amount","is_exempt":false}',
         '{"mode":"round","precision":0}',
         '2024-01-01'),

        ('income_tax_tds_monthly', 1, 'jsonlogic',
         '{"/":[{"var":"annual_income_tax"},{"var":"periods_remaining"}]}',
         '{"annual_income_tax":0,"periods_remaining":12}',
         '{"result":"amount"}',
         '{"mode":"round","precision":0}',
         '2024-01-01'),

        ('gratuity_accrual_in', 1, 'jsonlogic',
         '{"/":[{"/":[{"*":[{"+":[{"var":"basic_salary"},{"var":"da_amount"}]},15]},26]},12]}',
         '{"basic_salary":0,"da_amount":0}',
         '{"result":"amount"}',
         '{"mode":"half_up","precision":2}',
         '2024-01-01'),

        ('stat_bonus_in', 1, 'jsonlogic',
         '{"min":[{"/":[{"*":[{"var":"basic_salary"},8.33]},100]},{"var":"bonus_ceiling_monthly"}]}',
         '{"basic_salary":0,"bonus_ceiling_monthly":583}',
         '{"result":"amount"}',
         '{"mode":"round","precision":0}',
         '2024-01-01'),

        ('leave_encashment_in', 1, 'jsonlogic',
         '{"*":[{"/":[{"var":"basic_salary"},26]},{"var":"encashable_days"}]}',
         '{"basic_salary":0,"encashable_days":0}',
         '{"result":"amount"}',
         '{"mode":"half_up","precision":2}',
         '2024-01-01')

    ) AS x(formula_code, version_no, lang, body, defaults, mapping, rounding, eff_from)
    JOIN control.formula_expression fe
      ON fe.tenant_id = v_tid AND fe.code = x.formula_code
    ON CONFLICT (tenant_id, formula_expression_id, version_no) DO NOTHING;

    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE '[%] formula_expression_version: % rows inserted', v_pack, v_n;

    -- ========================================================================
    -- § 3  RATE TABLES
    -- Five statutory / bracket tables covering India (PF, ESI, income tax),
    -- Singapore (CPF), and UK (National Insurance).
    -- ========================================================================
    INSERT INTO control.rate_table (
        id, tenant_id, code, name, rate_table_kind, country_code, currency_code,
        description, status, created_by
    )
    VALUES

        (shared.uuidv7(), v_tid,
         'PF_RATE_IN', 'India — Employees Provident Fund Rate',
         'statutory', 'IN', 'INR',
         'EPF Act 1952: employee 12% + employer 3.67% PF + 8.33% EPS on PF wage ceiling ₹15,000. Single flat rate entry per party.',
         'active', v_su),

        (shared.uuidv7(), v_tid,
         'ESI_RATE_IN', 'India — Employees State Insurance Rate',
         'statutory', 'IN', 'INR',
         'ESI Act 1948: employee 0.75% + employer 3.25% on gross salary, applicable only if gross ≤ ₹21,000/month.',
         'active', v_su),

        (shared.uuidv7(), v_tid,
         'INCOME_TAX_IN_NEW', 'India — Income Tax New Regime (FY 2024-25)',
         'bracket', 'IN', 'INR',
         'Budget 2024 new tax regime (Sec 115BAC): zero tax to 3 lakh, 5%-30% slabs thereafter. Standard deduction ₹75,000.',
         'active', v_su),

        (shared.uuidv7(), v_tid,
         'CPF_RATE_SG', 'Singapore — CPF Contribution Rates (All Age Bands)',
         'lookup', 'SG', 'SGD',
         'CPF Act: age-banded rates on ordinary wages capped at SGD 6,000/month. Keys: party + age_band. Phase-in schedule increases rates for 55+ workers — verify against CPF Board for latest effective dates.',
         'active', v_su),

        (shared.uuidv7(), v_tid,
         'NI_RATE_GB', 'United Kingdom — National Insurance (2024-25 / 2025-26)',
         'bracket', 'GB', 'GBP',
         'Class 1 NI. Employee: 8% on £12,571–£50,270, 2% above (unchanged 2024-26). Employer 2024-25: 13.8% above £9,100. Employer 2025-26 (from 6 Apr 2025): 15% above £5,000.',
         'active', v_su),

        (shared.uuidv7(), v_tid,
         'US_SS_RATE', 'United States — Social Security FICA (2025)',
         'bracket', 'US', 'USD',
         'FICA Social Security: 6.2% employee + 6.2% employer on annual wages up to $176,100 (2025 wage base). Zero above wage base for both parties.',
         'active', v_su),

        (shared.uuidv7(), v_tid,
         'US_MEDICARE_RATE', 'United States — Medicare FICA',
         'statutory', 'US', 'USD',
         'FICA Medicare: 1.45% employee + 1.45% employer on all wages (no ceiling). Additional 0.9% employee-only surcharge (no employer match) on wages above $200,000/year.',
         'active', v_su)

    ON CONFLICT (tenant_id, code) DO UPDATE
        SET name        = EXCLUDED.name,
            description = EXCLUDED.description,
            updated_at  = now(),
            updated_by  = v_su
        WHERE (control.rate_table.name, control.rate_table.description)
              IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.description);

    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE '[%] rate_table: % rows upserted', v_pack, v_n;

    -- ========================================================================
    -- § 4  RATE TABLE ROWS
    -- key_values JSONB: {"party":"employee"|"employer", "age_band":"...", etc.}
    -- range_from/range_until: annual income thresholds (INR/SGD/GBP)
    -- rate_value: contribution rate as decimal (0.12 = 12%)
    -- cap_amount: maximum contribution per month
    -- ========================================================================
    INSERT INTO control.rate_table_row (
        id, tenant_id, rate_table_id, row_key, sequence_no,
        effective_from, effective_until,
        range_from, range_until,
        key_values, rate_value, amount_value, cap_amount, floor_amount,
        created_by
    )
    SELECT
        shared.uuidv7(), v_tid, rt.id,
        x.row_key, x.seq,
        x.eff_from::date, NULL::date,
        x.range_from::numeric,  x.range_until::numeric,
        x.kv::jsonb,
        x.rate::numeric,  x.amt::numeric,  x.cap::numeric,  x.flr::numeric,
        v_su
    FROM (VALUES

        -- ── India PF (statutory flat) ─────────────────────────────────────
        -- Employee: 12% on min(basic+DA, 15000). Monthly cap = 1800.
        ('PF_RATE_IN', 'ee_pf',        1,  '2024-04-01',
         NULL, NULL, '{"party":"employee","component":"pf"}',
         0.12, NULL, 1800, NULL),

        -- Employer PF share (3.67% to PF account)
        ('PF_RATE_IN', 'er_pf',        2,  '2024-04-01',
         NULL, NULL, '{"party":"employer","component":"pf"}',
         0.0367, NULL, 550.5, NULL),

        -- Employer EPS share (8.33% to pension)
        ('PF_RATE_IN', 'er_eps',       3,  '2024-04-01',
         NULL, NULL, '{"party":"employer","component":"eps"}',
         0.0833, NULL, 1249.5, NULL),

        -- Employer EDLI premium (0.5% capped at ₹75)
        ('PF_RATE_IN', 'er_edli',      4,  '2024-04-01',
         NULL, NULL, '{"party":"employer","component":"edli"}',
         0.005, NULL, 75, NULL),

        -- Employer PF admin charges (0.5% capped at ₹75 minimum ₹500 flat)
        ('PF_RATE_IN', 'er_admin',     5,  '2024-04-01',
         NULL, NULL, '{"party":"employer","component":"admin"}',
         0.005, NULL, 75, NULL),

        -- ── India ESI (statutory flat with gross ceiling) ─────────────────
        ('ESI_RATE_IN', 'ee_esi',      1,  '2024-04-01',
         NULL, NULL, '{"party":"employee","gross_ceiling":21000}',
         0.0075, NULL, NULL, NULL),

        ('ESI_RATE_IN', 'er_esi',      2,  '2024-04-01',
         NULL, NULL, '{"party":"employer","gross_ceiling":21000}',
         0.0325, NULL, NULL, NULL),

        -- ── India Income Tax New Regime FY2024-25 (annual income brackets) ─
        -- Slab 1: ₹0–₹3,00,000 — NIL
        ('INCOME_TAX_IN_NEW', 'slab_1', 1, '2024-04-01',
         0, 300000, '{"regime":"new","slab":1}',
         0.00, NULL, NULL, NULL),

        -- Slab 2: ₹3,00,001–₹6,00,000 — 5%
        ('INCOME_TAX_IN_NEW', 'slab_2', 2, '2024-04-01',
         300001, 600000, '{"regime":"new","slab":2}',
         0.05, NULL, NULL, NULL),

        -- Slab 3: ₹6,00,001–₹9,00,000 — 10%
        ('INCOME_TAX_IN_NEW', 'slab_3', 3, '2024-04-01',
         600001, 900000, '{"regime":"new","slab":3}',
         0.10, NULL, NULL, NULL),

        -- Slab 4: ₹9,00,001–₹12,00,000 — 15%
        ('INCOME_TAX_IN_NEW', 'slab_4', 4, '2024-04-01',
         900001, 1200000, '{"regime":"new","slab":4}',
         0.15, NULL, NULL, NULL),

        -- Slab 5: ₹12,00,001–₹15,00,000 — 20%
        ('INCOME_TAX_IN_NEW', 'slab_5', 5, '2024-04-01',
         1200001, 1500000, '{"regime":"new","slab":5}',
         0.20, NULL, NULL, NULL),

        -- Slab 6: above ₹15,00,000 — 30%
        ('INCOME_TAX_IN_NEW', 'slab_6', 6, '2024-04-01',
         1500001, NULL, '{"regime":"new","slab":6}',
         0.30, NULL, NULL, NULL),

        -- ── India Income Tax Surcharge thresholds ─────────────────────────
        -- Income 50L–1Cr: 10% surcharge | 1Cr–2Cr: 15% | 2Cr–5Cr: 25% | >5Cr: 37% (old) / 25% (new)
        -- Represented as separate key_values rows in the same table.
        ('INCOME_TAX_IN_NEW', 'surcharge_10pct', 7, '2024-04-01',
         5000000, 10000000, '{"regime":"new","charge_type":"surcharge"}',
         0.10, NULL, NULL, NULL),

        ('INCOME_TAX_IN_NEW', 'surcharge_15pct', 8, '2024-04-01',
         10000001, 20000000, '{"regime":"new","charge_type":"surcharge"}',
         0.15, NULL, NULL, NULL),

        ('INCOME_TAX_IN_NEW', 'surcharge_25pct', 9, '2024-04-01',
         20000001, NULL, '{"regime":"new","charge_type":"surcharge"}',
         0.25, NULL, NULL, NULL),

        -- Health & Education Cess: 4% on (tax + surcharge) — flat rate, no range
        ('INCOME_TAX_IN_NEW', 'cess_4pct', 10, '2024-04-01',
         NULL, NULL, '{"regime":"new","charge_type":"cess"}',
         0.04, NULL, NULL, NULL),

        -- ── Singapore CPF (lookup by age_band) ────────────────────────────
        -- Ordinary wage ceiling SGD 6,000/month; Annual wage ceiling SGD 102,000.
        ('CPF_RATE_SG', 'below_55_ee',      1,  '2024-01-01',
         NULL, NULL, '{"party":"employee","age_band":"below_55"}',
         0.20, NULL, NULL, NULL),

        ('CPF_RATE_SG', 'below_55_er',      2,  '2024-01-01',
         NULL, NULL, '{"party":"employer","age_band":"below_55"}',
         0.17, NULL, NULL, NULL),

        -- Age 55–60: employee 15%, employer 15%
        ('CPF_RATE_SG', 'age_55_60_ee',     3,  '2024-01-01',
         NULL, NULL, '{"party":"employee","age_band":"55_to_60"}',
         0.15, NULL, NULL, NULL),

        ('CPF_RATE_SG', 'age_55_60_er',     4,  '2024-01-01',
         NULL, NULL, '{"party":"employer","age_band":"55_to_60"}',
         0.15, NULL, NULL, NULL),

        -- Age 60–65: employee 10.5%, employer 11.5%
        ('CPF_RATE_SG', 'age_60_65_ee',     5,  '2024-01-01',
         NULL, NULL, '{"party":"employee","age_band":"60_to_65"}',
         0.105, NULL, NULL, NULL),

        ('CPF_RATE_SG', 'age_60_65_er',     6,  '2024-01-01',
         NULL, NULL, '{"party":"employer","age_band":"60_to_65"}',
         0.115, NULL, NULL, NULL),

        -- Age 65–70: employee 7.5%, employer 9%
        ('CPF_RATE_SG', 'age_65_70_ee',     7,  '2024-01-01',
         NULL, NULL, '{"party":"employee","age_band":"65_to_70"}',
         0.075, NULL, NULL, NULL),

        ('CPF_RATE_SG', 'age_65_70_er',     8,  '2024-01-01',
         NULL, NULL, '{"party":"employer","age_band":"65_to_70"}',
         0.09, NULL, NULL, NULL),

        -- Age 70+: employee 5%, employer 7.5%
        ('CPF_RATE_SG', 'age_70_plus_ee',   9,  '2024-01-01',
         NULL, NULL, '{"party":"employee","age_band":"70_and_above"}',
         0.05, NULL, NULL, NULL),

        ('CPF_RATE_SG', 'age_70_plus_er',  10,  '2024-01-01',
         NULL, NULL, '{"party":"employer","age_band":"70_and_above"}',
         0.075, NULL, NULL, NULL),

        -- ── UK National Insurance 2024-25 (annual earnings brackets) ──────
        -- Primary threshold: £12,570. Upper earnings limit: £50,270.
        -- Employee Class 1 primary contributions.
        ('NI_RATE_GB', 'ee_band_zero',      1,  '2024-04-06',
         0, 12570, '{"party":"employee","class":"1_primary"}',
         0.00, NULL, NULL, NULL),

        ('NI_RATE_GB', 'ee_band_main',      2,  '2024-04-06',
         12571, 50270, '{"party":"employee","class":"1_primary"}',
         0.08, NULL, NULL, NULL),

        ('NI_RATE_GB', 'ee_band_upper',     3,  '2024-04-06',
         50271, NULL, '{"party":"employee","class":"1_primary"}',
         0.02, NULL, NULL, NULL),

        -- Employer Class 1 secondary: 13.8% above secondary threshold £9,100
        ('NI_RATE_GB', 'er_band_zero',      4,  '2024-04-06',
         0, 9100, '{"party":"employer","class":"1_secondary"}',
         0.00, NULL, NULL, NULL),

        ('NI_RATE_GB', 'er_band_main',      5,  '2024-04-06',
         9101, NULL, '{"party":"employer","class":"1_secondary","fy":"2024-25"}',
         0.138, NULL, NULL, NULL),

        -- ── UK NI 2025-26 (from 6 April 2025) ────────────────────────────
        -- Employer NI only changed: secondary threshold cut £9,100→£5,000;
        -- rate raised 13.8%→15%. Employee bands (ee_band_*) are unchanged.
        ('NI_RATE_GB', 'er_band_zero_25',   6,  '2025-04-06',
         0, 5000, '{"party":"employer","class":"1_secondary","fy":"2025-26"}',
         0.00, NULL, NULL, NULL),

        ('NI_RATE_GB', 'er_band_main_25',   7,  '2025-04-06',
         5001, NULL, '{"party":"employer","class":"1_secondary","fy":"2025-26"}',
         0.15, NULL, NULL, NULL),

        -- ── India Income Tax New Regime FY 2025-26 (Budget 2025) ─────────
        -- Finance Act 2025 revised slabs: 7 bands vs 6 in FY 2024-25.
        -- Sec 87A full rebate on income up to ₹12,00,000 (zero tax for most salaried).
        -- Standard deduction ₹75,000 unchanged. Eff 1 April 2025.
        ('INCOME_TAX_IN_NEW', 'slab_fy26_1',  11, '2025-04-01',
         0, 400000, '{"regime":"new","slab":1,"fy":"2025-26"}',
         0.00, NULL, NULL, NULL),

        ('INCOME_TAX_IN_NEW', 'slab_fy26_2',  12, '2025-04-01',
         400001, 800000, '{"regime":"new","slab":2,"fy":"2025-26"}',
         0.05, NULL, NULL, NULL),

        ('INCOME_TAX_IN_NEW', 'slab_fy26_3',  13, '2025-04-01',
         800001, 1200000, '{"regime":"new","slab":3,"fy":"2025-26"}',
         0.10, NULL, NULL, NULL),

        ('INCOME_TAX_IN_NEW', 'slab_fy26_4',  14, '2025-04-01',
         1200001, 1600000, '{"regime":"new","slab":4,"fy":"2025-26"}',
         0.15, NULL, NULL, NULL),

        ('INCOME_TAX_IN_NEW', 'slab_fy26_5',  15, '2025-04-01',
         1600001, 2000000, '{"regime":"new","slab":5,"fy":"2025-26"}',
         0.20, NULL, NULL, NULL),

        ('INCOME_TAX_IN_NEW', 'slab_fy26_6',  16, '2025-04-01',
         2000001, 2400000, '{"regime":"new","slab":6,"fy":"2025-26"}',
         0.25, NULL, NULL, NULL),

        ('INCOME_TAX_IN_NEW', 'slab_fy26_7',  17, '2025-04-01',
         2400001, NULL, '{"regime":"new","slab":7,"fy":"2025-26"}',
         0.30, NULL, NULL, NULL),

        -- Surcharge thresholds unchanged from FY 2024-25.
        ('INCOME_TAX_IN_NEW', 'surcharge_fy26_10pct', 18, '2025-04-01',
         5000000, 10000000, '{"regime":"new","charge_type":"surcharge","fy":"2025-26"}',
         0.10, NULL, NULL, NULL),

        ('INCOME_TAX_IN_NEW', 'surcharge_fy26_15pct', 19, '2025-04-01',
         10000001, 20000000, '{"regime":"new","charge_type":"surcharge","fy":"2025-26"}',
         0.15, NULL, NULL, NULL),

        ('INCOME_TAX_IN_NEW', 'surcharge_fy26_25pct', 20, '2025-04-01',
         20000001, NULL, '{"regime":"new","charge_type":"surcharge","fy":"2025-26"}',
         0.25, NULL, NULL, NULL),

        ('INCOME_TAX_IN_NEW', 'cess_fy26_4pct',       21, '2025-04-01',
         NULL, NULL, '{"regime":"new","charge_type":"cess","fy":"2025-26"}',
         0.04, NULL, NULL, NULL),

        -- ── United States FICA — Social Security (2025 wage base) ────────
        -- Annual wage base $176,100. Rate 6.2% EE + 6.2% ER on wages up to base.
        ('US_SS_RATE', 'ee_ss_2025',        1, '2025-01-01',
         0, 176100, '{"party":"employee","year":2025}',
         0.062, NULL, 10918.20, NULL),

        ('US_SS_RATE', 'ee_ss_above_base',  2, '2025-01-01',
         176101, NULL, '{"party":"employee","year":2025}',
         0.00, NULL, NULL, NULL),

        ('US_SS_RATE', 'er_ss_2025',        3, '2025-01-01',
         0, 176100, '{"party":"employer","year":2025}',
         0.062, NULL, 10918.20, NULL),

        ('US_SS_RATE', 'er_ss_above_base',  4, '2025-01-01',
         176101, NULL, '{"party":"employer","year":2025}',
         0.00, NULL, NULL, NULL),

        -- ── United States FICA — Medicare (no wage ceiling) ───────────────
        -- EE 1.45% on all wages; additional 0.9% EE-only surcharge above $200k.
        -- ER 1.45% on all wages (no ceiling, no additional tax for employer).
        ('US_MEDICARE_RATE', 'ee_medicare_base',  1, '2013-01-01',
         0, 200000, '{"party":"employee"}',
         0.0145, NULL, NULL, NULL),

        ('US_MEDICARE_RATE', 'ee_medicare_addl',  2, '2013-01-01',
         200001, NULL, '{"party":"employee","addl_tax":true}',
         0.0235, NULL, NULL, NULL),

        ('US_MEDICARE_RATE', 'er_medicare',       3, '2013-01-01',
         NULL, NULL, '{"party":"employer"}',
         0.0145, NULL, NULL, NULL)

    ) AS x(table_code, row_key, seq, eff_from,
            range_from, range_until, kv,
            rate, amt, cap, flr)
    JOIN control.rate_table rt ON rt.tenant_id = v_tid AND rt.code = x.table_code
    ON CONFLICT (tenant_id, rate_table_id, effective_from, sequence_no) DO NOTHING;

    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE '[%] rate_table_row: % rows inserted', v_pack, v_n;

    -- ── Post-insert corrections ──────────────────────────────────────────────
    -- PF admin charges have NO ₹75 cap; minimum floor is ₹500/month.
    -- ON CONFLICT DO NOTHING above won't fix existing rows — use UPDATE.
    UPDATE control.rate_table_row rtr
       SET cap_amount   = NULL,
           floor_amount = 500,
           updated_by   = v_su
      FROM control.rate_table rt
     WHERE rt.tenant_id  = v_tid
       AND rt.code       = 'PF_RATE_IN'
       AND rtr.tenant_id = v_tid
       AND rtr.rate_table_id = rt.id
       AND rtr.row_key   = 'er_admin'
       AND rtr.cap_amount = 75;

    -- Expire the FY 2024-25 India IT slab rows now that FY 2025-26 rows exist.
    UPDATE control.rate_table_row rtr
       SET effective_until = '2025-03-31',
           updated_by      = v_su
      FROM control.rate_table rt
     WHERE rt.tenant_id  = v_tid
       AND rt.code       = 'INCOME_TAX_IN_NEW'
       AND rtr.tenant_id = v_tid
       AND rtr.rate_table_id  = rt.id
       AND rtr.effective_from = '2024-04-01'
       AND rtr.effective_until IS NULL;

    -- ========================================================================
    -- § 5  PAY COMPONENTS
    -- 58 components covering the full payroll spectrum across all 6 jurisdictions.
    -- formula_expression_id links to formulas seeded in § 1.
    -- default_gl_role uses canonical posting-role codes from the AP/payroll pack.
    -- ========================================================================
    INSERT INTO master.pay_component (
        id, tenant_id, code, name,
        component_type, value_type, taxable_behavior,
        is_recurring, is_employer_cost,
        formula_expression_id, default_gl_role,
        status, created_by
    )
    SELECT
        shared.uuidv7(), v_tid, x.code, x.name,
        x.comp_type, x.val_type, x.tax_behavior,
        x.is_recurring::boolean, x.is_er_cost::boolean,
        (SELECT id FROM control.formula_expression
          WHERE tenant_id = v_tid AND code = x.formula_code),
        x.gl_role,
        'active', v_su
    FROM (VALUES

        -- ── EARNINGS ─────────────────────────────────────────────────────────
        -- Basic Salary: the foundational component; all other % components derive from it.
        ('BASIC',        'Basic Salary',                 'earning', 'amount',  'taxable',          true,  false, 'basic_salary_passthrough', 'PAYROLL_WAGE'),
        -- Dearness Allowance: cost-of-living supplement, typically a % of basic.
        ('DA',           'Dearness Allowance',           'earning', 'rate',    'taxable',          true,  false, NULL::text,                 'PAYROLL_WAGE'),
        -- House Rent Allowance: partially exempt under Sec 10(13A) India.
        ('HRA',          'House Rent Allowance',         'earning', 'rate',    'partially_taxable',true,  false, 'hra_pct_of_basic',         'PAYROLL_ALLOWANCE'),
        -- Transport Allowance: exempt up to ₹3,200/month for disabled, ₹1,600 others.
        ('TA',           'Transport Allowance',          'earning', 'amount',  'non_taxable',      true,  false, NULL::text,                 'PAYROLL_ALLOWANCE'),
        -- Medical Allowance: exempt up to ₹15,000/year with medical bills.
        ('MA',           'Medical Allowance',            'earning', 'amount',  'non_taxable',      true,  false, NULL::text,                 'PAYROLL_ALLOWANCE'),
        -- Special Allowance: fully taxable balancing component.
        ('SA',           'Special Allowance',            'earning', 'amount',  'taxable',          true,  false, NULL::text,                 'PAYROLL_ALLOWANCE'),
        -- Children Education Allowance: exempt ₹100/child/month up to 2 children.
        ('CEA',          'Children Education Allowance', 'earning', 'amount',  'non_taxable',      true,  false, NULL::text,                 'PAYROLL_ALLOWANCE'),
        -- Leave Travel Allowance: exempt for 2 journeys in 4-year block.
        ('LTA',          'Leave Travel Allowance',       'earning', 'amount',  'non_taxable',      false, false, NULL::text,                 'PAYROLL_ALLOWANCE'),
        -- Meal Allowance: exempt up to ₹50/meal for meals in office hours.
        ('MEALS',        'Meal Allowance',               'earning', 'amount',  'non_taxable',      true,  false, NULL::text,                 'PAYROLL_ALLOWANCE'),
        -- Telephone/Mobile: exempt ₹1,000/month with billing proof.
        ('PHONE',        'Telephone / Mobile Allowance', 'earning', 'amount',  'non_taxable',      true,  false, NULL::text,                 'PAYROLL_ALLOWANCE'),
        -- Shift Allowance: taxable premium for non-standard hours.
        ('SHIFT',        'Shift Allowance',              'earning', 'amount',  'taxable',          true,  false, NULL::text,                 'PAYROLL_ALLOWANCE'),
        -- Car / Vehicle Allowance: fully taxable unless car is provided by company.
        ('CAR_ALLOW',    'Car / Vehicle Allowance',      'earning', 'amount',  'taxable',          true,  false, NULL::text,                 'PAYROLL_ALLOWANCE'),
        -- Project Allowance: ad-hoc for project postings.
        ('PROJ_ALLOW',   'Project Allowance',            'earning', 'amount',  'taxable',          false, false, NULL::text,                 'PAYROLL_ALLOWANCE'),
        -- Relocation Allowance: one-time, may be partially exempt.
        ('RELOCATION',   'Relocation Allowance',         'earning', 'amount',  'taxable',          false, false, NULL::text,                 'PAYROLL_ALLOWANCE'),
        -- Overtime Pay — regular 1× rate.
        ('OT_REGULAR',   'Overtime Pay — Regular Rate',  'earning', 'formula', 'taxable',          false, false, 'overtime_regular',         'PAYROLL_OT'),
        -- Overtime Pay — premium rate (1.5×, 2×).
        ('OT_PREMIUM',   'Overtime Pay — Premium Rate',  'earning', 'formula', 'taxable',          false, false, 'overtime_premium',         'PAYROLL_OT'),
        -- Performance Bonus: discretionary, assessed periodically.
        ('PERF_BONUS',   'Performance Bonus',            'earning', 'amount',  'taxable',          false, false, NULL::text,                 'PAYROLL_BONUS'),
        -- Annual Bonus: contractual annual payment.
        ('ANNUAL_BONUS', 'Annual Bonus',                 'earning', 'amount',  'taxable',          false, false, NULL::text,                 'PAYROLL_BONUS'),
        -- Festive Bonus: occasion-based (Diwali, Eid, Christmas, etc.).
        ('FESTIVE_BONUS','Festive / Occasion Bonus',     'earning', 'amount',  'taxable',          false, false, NULL::text,                 'PAYROLL_BONUS'),
        -- Joining Bonus: one-time sign-on, often with claw-back clause.
        ('JOIN_BONUS',   'Joining / Sign-on Bonus',      'earning', 'amount',  'taxable',          false, false, NULL::text,                 'PAYROLL_BONUS'),
        -- Referral Bonus: paid to referring employee after new hire confirmation.
        ('REFERRAL',     'Employee Referral Bonus',      'earning', 'amount',  'taxable',          false, false, NULL::text,                 'PAYROLL_BONUS'),
        -- Sales Commission: calculated on revenue/achievement.
        ('COMMISSION',   'Sales Commission',             'earning', 'formula', 'taxable',          false, false, NULL::text,                 'PAYROLL_BONUS'),
        -- Sales Incentive: structured incentive tied to KPIs.
        ('INCENTIVE',    'Sales Incentive',              'earning', 'formula', 'taxable',          false, false, NULL::text,                 'PAYROLL_BONUS'),
        -- Pro-Rata Adjustment: positive or negative correction for partial month.
        ('PRO_RATE',     'Pro-Rata Salary Adjustment',   'earning', 'formula', 'taxable',          false, false, 'pro_rate_calendar',        'PAYROLL_WAGE'),
        -- Salary Arrears: back-pay for retrospective increments.
        ('ARREARS',      'Salary Arrears',               'earning', 'amount',  'taxable',          false, false, NULL::text,                 'PAYROLL_WAGE'),
        -- Leave Encashment: paid on exit or during employment per policy.
        ('LEAVE_ENCASH', 'Leave Encashment',             'earning', 'formula', 'non_taxable',      false, false, 'leave_encashment_in',      'PAYROLL_LEAVE'),

        -- ── DEDUCTIONS ───────────────────────────────────────────────────────
        -- PF Employee: statutory 12% of capped basic+DA. Tax-exempt (Sec 80C).
        ('PF_EE',        'Provident Fund — Employee',    'deduction','formula','statutory_exempt', true,  false, 'pf_employee_in',           'PF_PAYABLE'),
        -- ESI Employee: 0.75% of gross if eligible. Tax-exempt.
        ('ESI_EE',       'ESI — Employee Contribution',  'deduction','formula','statutory_exempt', true,  false, 'esi_employee_in',          'ESI_PAYABLE'),
        -- Income Tax TDS: monthly TDS computed on projected annual income.
        ('INCOME_TAX',   'Income Tax (TDS)',             'deduction','formula','taxable',          true,  false, 'income_tax_tds_monthly',   'TDS_PAYABLE'),
        -- Professional Tax: state-level levy (Max ₹2,500/yr in India).
        ('PROF_TAX',     'Professional Tax',             'deduction','amount', 'statutory_exempt', true,  false, NULL::text,                 'PROF_TAX_PAYABLE'),
        -- Loan Recovery: installment against salary advance / personal loan.
        ('LOAN_RECOV',   'Loan / Advance Recovery',      'deduction','amount', 'non_taxable',      false, false, NULL::text,                 'ADVANCE_RECOVERABLE'),
        -- Late Deduction: penalty for late arrival, computed per company policy.
        ('LATE_DED',     'Late Arrival Deduction',       'deduction','formula','taxable',          false, false, 'pro_rate_working',         'PAYROLL_WAGE'),
        -- Absent Deduction: loss-of-pay for unauthorised absence.
        ('ABSENT_DED',   'Absent / Loss of Pay Deduction','deduction','formula','taxable',         false, false, 'pro_rate_calendar',        'PAYROLL_WAGE'),
        -- Group Health Insurance: employee's share of premium.
        ('HEALTH_INS_EE','Group Health Insurance — Employee Share','deduction','amount','non_taxable',true, false, NULL::text,               'INS_PAYABLE'),
        -- Life Insurance: employee's share of group term life premium.
        ('LIFE_INS_EE',  'Group Life Insurance — Employee Share', 'deduction','amount','non_taxable',true, false, NULL::text,               'INS_PAYABLE'),
        -- NPS Employee: up to 10% of basic+DA, exempt under Sec 80CCD(1).
        ('NPS_EE',       'NPS — Employee Contribution',  'deduction','formula','statutory_exempt', true,  false, NULL::text,                 'NPS_PAYABLE'),
        -- Union Dues: trade union membership fee.
        ('UNION_DUES',   'Trade Union Dues',             'deduction','amount', 'non_taxable',      true,  false, NULL::text,                 'PAYROLL_PAYABLE'),
        -- CPF Employee: SG CPF, age-banded rates — no India PF formula applies.
        ('CPF_EE',       'CPF — Employee Contribution (SG)','deduction','formula','statutory_exempt',true,false, NULL::text,                'CPF_PAYABLE'),

        -- ── STATUTORY (EMPLOYER COST) ─────────────────────────────────────
        -- PF Employer: 3.67% PF + 8.33% EPS + 0.5% EDLI + 0.5% admin.
        ('PF_ER',        'Provident Fund — Employer Contribution','statutory','formula','statutory_exempt',true,true,'pf_employer_in',       'PF_EXPENSE'),
        -- ESI Employer: 3.25% of gross if employee is eligible.
        ('ESI_ER',       'ESI — Employer Contribution',  'statutory','formula','statutory_exempt', true,  true,  'esi_employer_in',          'ESI_EXPENSE'),
        -- Gratuity monthly accrual: (basic+DA)×15/26/12. Crystallises on exit.
        ('GRATUITY_ACCR','Gratuity Accrual',             'statutory','formula','statutory_exempt', true,  true,  'gratuity_accrual_in',      'GRATUITY_PAYABLE'),
        -- Statutory Bonus: 8.33% monthly accrual; pay-out per Bonus Act.
        ('STAT_BONUS',   'Statutory Bonus Accrual',      'statutory','formula','statutory_exempt', true,  true,  'stat_bonus_in',            'STAT_BONUS_PAYABLE'),
        -- NPS Employer: 10% of basic+DA, deductible under Sec 36(1)(iva).
        ('NPS_ER',       'NPS — Employer Contribution',  'statutory','formula','statutory_exempt', true,  true,  NULL::text,                 'NPS_EXPENSE'),
        -- CPF Employer Singapore: age-banded rates — no India PF formula applies.
        ('CPF_ER',       'CPF — Employer Contribution (SG)','statutory','formula','statutory_exempt',true,true,  NULL::text,                'CPF_EXPENSE'),
        -- EPF Employer Malaysia: 12% / 13% on basic capped — no India PF formula.
        ('EPF_ER',       'EPF — Employer Contribution (MY)','statutory','formula','statutory_exempt',true,true,  NULL::text,                'EPF_EXPENSE'),
        -- SOCSO Employer Malaysia: ~1.75% on insured salary.
        ('SOCSO_ER',     'SOCSO — Employer Contribution (MY)','statutory','formula','statutory_exempt',true,true,NULL::text,                 'SOCSO_EXPENSE'),
        -- UK National Insurance Employer: 13.8% (2024-25) / 15% (2025-26) above secondary threshold.
        ('NI_ER',        'National Insurance — Employer (GB)','statutory','formula','statutory_exempt',true,true,NULL::text,                 'NI_EXPENSE'),
        -- US Social Security Employer: 6.2% up to annual wage base ($176,100 in 2025).
        ('SS_ER',        'Social Security — Employer (US)','statutory','formula','statutory_exempt',true,true,NULL::text,                   'SS_EXPENSE'),
        -- US Medicare Employer: 1.45% on all wages, no ceiling, no additional tax.
        ('MEDICARE_ER',  'Medicare — Employer (US)',      'statutory','formula','statutory_exempt', true,  true,  NULL::text,                 'MEDICARE_EXPENSE'),
        -- EIS Employer Malaysia: 0.4% under Employment Insurance System Act 2017.
        ('EIS_ER',       'EIS — Employer Contribution (MY)','statutory','formula','statutory_exempt',true,true,  NULL::text,                'EIS_EXPENSE'),
        -- Singapore Skills Development Levy: employer 0.25% of total wages (min $2, max $11.25).
        ('SDL_ER',       'Skills Development Levy (SG)',  'statutory','formula','statutory_exempt', true,  true,  NULL::text,                 'SDL_EXPENSE'),

        -- ── DEDUCTIONS (additional countries) ─────────────────────────────
        -- UK NI Employee: Class 1 primary — 8% on £12,571–£50,270, 2% above (2024-26).
        ('NI_EE',        'National Insurance — Employee (GB)','deduction','formula','statutory_exempt',true,false,NULL::text,               'NI_PAYABLE'),
        -- US Social Security Employee: FICA 6.2% up to annual wage base.
        ('SS_EE',        'Social Security — Employee (US)','deduction','formula','statutory_exempt', true,  false, NULL::text,               'SS_PAYABLE'),
        -- US Medicare Employee: FICA 1.45% base + 0.9% surcharge above $200k.
        ('MEDICARE_EE',  'Medicare — Employee (US)',      'deduction','formula','statutory_exempt', true,  false, NULL::text,                 'MEDICARE_PAYABLE'),
        -- Malaysia SOCSO Employee: ~0.5% under Employees Social Security Act (categories 1 & 2).
        ('SOCSO_EE',     'SOCSO — Employee Contribution (MY)','deduction','formula','statutory_exempt',true,false,NULL::text,               'SOCSO_PAYABLE'),
        -- Malaysia EIS Employee: 0.2% under Employment Insurance System Act 2017.
        ('EIS_EE',       'EIS — Employee Contribution (MY)','deduction','formula','statutory_exempt', true,  false, NULL::text,               'EIS_PAYABLE'),
        -- Singapore SHG: CDAC / ECF / MBMF / SINDA — fixed amounts by ethnicity, employer remits.
        ('SHG_EE',       'Self-Help Group Contribution (SG)','deduction','amount','non_taxable',    true,  false, NULL::text,                 'SHG_PAYABLE'),

        -- ── MEMO (computed summaries, not posted to GL) ─────────────────────
        ('GROSS_SAL',    'Gross Salary',                 'memo',    'formula', 'non_taxable',      true,  false, NULL::text,                 NULL::text),
        ('NET_SAL',      'Net Pay',                      'memo',    'formula', 'non_taxable',      true,  false, NULL::text,                 NULL::text),
        ('TOTAL_DED',    'Total Deductions',             'memo',    'formula', 'non_taxable',      true,  false, NULL::text,                 NULL::text),
        ('ER_STAT_COST', 'Employer Statutory Cost',      'memo',    'formula', 'non_taxable',      true,  true,  NULL::text,                 NULL::text),
        ('CTC',          'Cost to Company (CTC)',        'memo',    'formula', 'non_taxable',      true,  true,  NULL::text,                 NULL::text),
        ('TAXABLE_INC',  'Taxable Income',               'memo',    'formula', 'non_taxable',      true,  false, NULL::text,                 NULL::text)

    ) AS x(code, name, comp_type, val_type, tax_behavior,
            is_recurring, is_er_cost, formula_code, gl_role)
    ON CONFLICT (tenant_id, code) DO UPDATE
        SET name             = EXCLUDED.name,
            component_type   = EXCLUDED.component_type,
            value_type       = EXCLUDED.value_type,
            taxable_behavior = EXCLUDED.taxable_behavior,
            is_recurring     = EXCLUDED.is_recurring,
            is_employer_cost = EXCLUDED.is_employer_cost,
            default_gl_role  = EXCLUDED.default_gl_role,
            formula_expression_id = EXCLUDED.formula_expression_id,
            updated_at       = now(),
            updated_by       = v_su
        WHERE (master.pay_component.name,
               master.pay_component.component_type,
               coalesce(master.pay_component.formula_expression_id::text, 'NULL'))
              IS DISTINCT FROM (EXCLUDED.name,
                                EXCLUDED.component_type,
                                coalesce(EXCLUDED.formula_expression_id::text, 'NULL'));

    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE '[%] pay_component: % rows upserted', v_pack, v_n;

    -- ========================================================================
    -- § 6  PAY STRUCTURES (tenant-level templates, no pay_group_id)
    -- These structures act as blueprints. Assign to a pay_group after creating
    -- pay groups via the admin UI or a company-specific seed.
    -- currency_code = 'XXX' (ISO 4217 "no currency") signals a template;
    -- override with the pay group's currency_code when activating.
    -- ========================================================================
    INSERT INTO master.pay_structure (
        id, tenant_id, code, name, pay_group_id, currency_code,
        effective_from, effective_until, status, created_by
    )
    VALUES

        -- Standard Monthly: suitable for salaried employees up to mid-career.
        (shared.uuidv7(), v_tid,
         'PAYSTR_STANDARD', 'Standard Monthly Structure',
         NULL, 'XXX', '2024-01-01'::date, NULL::date, 'draft', v_su),

        -- Senior Monthly: for senior professionals and managers.
        (shared.uuidv7(), v_tid,
         'PAYSTR_SENIOR', 'Senior / Managerial Monthly Structure',
         NULL, 'XXX', '2024-01-01'::date, NULL::date, 'draft', v_su),

        -- Executive Monthly: for C-suite and director-level employees.
        (shared.uuidv7(), v_tid,
         'PAYSTR_EXECUTIVE', 'Executive Monthly Structure',
         NULL, 'XXX', '2024-01-01'::date, NULL::date, 'draft', v_su)

    ON CONFLICT (tenant_id, code) DO UPDATE
        SET name       = EXCLUDED.name,
            updated_at = now(),
            updated_by = v_su
        WHERE master.pay_structure.name IS DISTINCT FROM EXCLUDED.name;

    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE '[%] pay_structure: % rows upserted', v_pack, v_n;

    -- ========================================================================
    -- § 7  PAY STRUCTURE LINES
    -- Line numbers in multiples of 10 leave room for local insertions.
    -- default_amount NULL = amount set per compensation assignment.
    -- default_rate: where non-NULL, expresses the component's default %.
    -- ========================================================================
    INSERT INTO master.pay_structure_line (
        id, tenant_id, pay_structure_id, pay_component_id, line_no,
        default_amount, default_rate, formula_expression_id, created_by
    )
    SELECT
        shared.uuidv7(), v_tid, ps.id, pc.id, x.line_no::smallint,
        x.default_amount::numeric,
        x.default_rate::numeric,
        (SELECT fe.id FROM control.formula_expression fe
          WHERE fe.tenant_id = v_tid AND fe.code = x.formula_code),
        v_su
    FROM (VALUES

        -- ── PAYSTR_STANDARD ─────────────────────────────────────────────────
        -- Earnings
        ('PAYSTR_STANDARD', 'BASIC',        10, NULL::numeric, NULL::numeric,    NULL::text),
        ('PAYSTR_STANDARD', 'DA',           20, NULL,           0.12,             NULL::text),
        ('PAYSTR_STANDARD', 'HRA',          30, NULL,           0.40,             'hra_pct_of_basic'),
        ('PAYSTR_STANDARD', 'TA',           40, 1600,           NULL,             NULL::text),
        ('PAYSTR_STANDARD', 'MA',           50, 1250,           NULL,             NULL::text),
        ('PAYSTR_STANDARD', 'SA',           60, NULL,           NULL,             NULL::text),
        ('PAYSTR_STANDARD', 'MEALS',        70, 2200,           NULL,             NULL::text),
        ('PAYSTR_STANDARD', 'PHONE',        80, 1000,           NULL,             NULL::text),
        -- Deductions
        ('PAYSTR_STANDARD', 'PF_EE',       200, NULL,           NULL,             'pf_employee_in'),
        ('PAYSTR_STANDARD', 'ESI_EE',      210, NULL,           NULL,             'esi_employee_in'),
        ('PAYSTR_STANDARD', 'INCOME_TAX',  220, NULL,           NULL,             'income_tax_tds_monthly'),
        ('PAYSTR_STANDARD', 'PROF_TAX',    230, 200,            NULL,             NULL::text),
        -- Statutory (employer cost)
        ('PAYSTR_STANDARD', 'PF_ER',       400, NULL,           NULL,             'pf_employer_in'),
        ('PAYSTR_STANDARD', 'ESI_ER',      410, NULL,           NULL,             'esi_employer_in'),
        ('PAYSTR_STANDARD', 'GRATUITY_ACCR',420, NULL,          NULL,             'gratuity_accrual_in'),
        ('PAYSTR_STANDARD', 'STAT_BONUS',  430, NULL,           NULL,             'stat_bonus_in'),
        -- Memo
        ('PAYSTR_STANDARD', 'GROSS_SAL',   900, NULL,           NULL,             NULL::text),
        ('PAYSTR_STANDARD', 'NET_SAL',     910, NULL,           NULL,             NULL::text),
        ('PAYSTR_STANDARD', 'TOTAL_DED',   920, NULL,           NULL,             NULL::text),
        ('PAYSTR_STANDARD', 'CTC',         930, NULL,           NULL,             NULL::text),

        -- ── PAYSTR_SENIOR ────────────────────────────────────────────────────
        -- Earnings
        ('PAYSTR_SENIOR', 'BASIC',          10, NULL,           NULL,             NULL::text),
        ('PAYSTR_SENIOR', 'DA',             20, NULL,           0.12,             NULL::text),
        ('PAYSTR_SENIOR', 'HRA',            30, NULL,           0.50,             'hra_pct_of_basic'),
        ('PAYSTR_SENIOR', 'MA',             50, 1250,           NULL,             NULL::text),
        ('PAYSTR_SENIOR', 'SA',             60, NULL,           NULL,             NULL::text),
        ('PAYSTR_SENIOR', 'CAR_ALLOW',      70, 5000,           NULL,             NULL::text),
        ('PAYSTR_SENIOR', 'PHONE',          80, 2000,           NULL,             NULL::text),
        ('PAYSTR_SENIOR', 'PERF_BONUS',     90, NULL,           NULL,             NULL::text),
        -- Deductions
        ('PAYSTR_SENIOR', 'PF_EE',         200, NULL,           NULL,             'pf_employee_in'),
        ('PAYSTR_SENIOR', 'INCOME_TAX',    220, NULL,           NULL,             'income_tax_tds_monthly'),
        ('PAYSTR_SENIOR', 'NPS_EE',        240, NULL,           0.10,             NULL::text),
        -- Statutory
        ('PAYSTR_SENIOR', 'PF_ER',         400, NULL,           NULL,             'pf_employer_in'),
        ('PAYSTR_SENIOR', 'GRATUITY_ACCR', 410, NULL,           NULL,             'gratuity_accrual_in'),
        ('PAYSTR_SENIOR', 'STAT_BONUS',    420, NULL,           NULL,             'stat_bonus_in'),
        ('PAYSTR_SENIOR', 'NPS_ER',        430, NULL,           0.10,             NULL::text),
        -- Memo
        ('PAYSTR_SENIOR', 'GROSS_SAL',     900, NULL,           NULL,             NULL::text),
        ('PAYSTR_SENIOR', 'NET_SAL',       910, NULL,           NULL,             NULL::text),
        ('PAYSTR_SENIOR', 'CTC',           930, NULL,           NULL,             NULL::text),

        -- ── PAYSTR_EXECUTIVE ─────────────────────────────────────────────────
        -- Earnings
        ('PAYSTR_EXECUTIVE', 'BASIC',       10, NULL,           NULL,             NULL::text),
        ('PAYSTR_EXECUTIVE', 'HRA',         20, NULL,           0.50,             'hra_pct_of_basic'),
        ('PAYSTR_EXECUTIVE', 'SA',          30, NULL,           NULL,             NULL::text),
        ('PAYSTR_EXECUTIVE', 'CAR_ALLOW',   40, NULL,           NULL,             NULL::text),
        ('PAYSTR_EXECUTIVE', 'PHONE',       50, 3000,           NULL,             NULL::text),
        ('PAYSTR_EXECUTIVE', 'PERF_BONUS',  60, NULL,           NULL,             NULL::text),
        ('PAYSTR_EXECUTIVE', 'ANNUAL_BONUS',70, NULL,           NULL,             NULL::text),
        -- Deductions
        ('PAYSTR_EXECUTIVE', 'INCOME_TAX', 200, NULL,           NULL,             'income_tax_tds_monthly'),
        ('PAYSTR_EXECUTIVE', 'NPS_EE',     210, NULL,           0.10,             NULL::text),
        -- Statutory
        ('PAYSTR_EXECUTIVE', 'PF_ER',      400, NULL,           NULL,             'pf_employer_in'),
        ('PAYSTR_EXECUTIVE', 'GRATUITY_ACCR',410, NULL,         NULL,             'gratuity_accrual_in'),
        ('PAYSTR_EXECUTIVE', 'NPS_ER',     420, NULL,           0.10,             NULL::text),
        -- Memo
        ('PAYSTR_EXECUTIVE', 'GROSS_SAL',  900, NULL,           NULL,             NULL::text),
        ('PAYSTR_EXECUTIVE', 'NET_SAL',    910, NULL,           NULL,             NULL::text),
        ('PAYSTR_EXECUTIVE', 'CTC',        930, NULL,           NULL,             NULL::text)

    ) AS x(structure_code, component_code, line_no, default_amount, default_rate, formula_code)
    JOIN master.pay_structure  ps ON ps.tenant_id = v_tid AND ps.code = x.structure_code
    JOIN master.pay_component  pc ON pc.tenant_id = v_tid AND pc.code = x.component_code
    ON CONFLICT (tenant_id, pay_structure_id, pay_component_id) DO NOTHING;

    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE '[%] pay_structure_line: % rows inserted', v_pack, v_n;

    -- ========================================================================
    -- § 8  STATUTORY SCHEMES  (18 schemes across 6 jurisdictions)
    -- ========================================================================
    INSERT INTO master.statutory_scheme (
        id, tenant_id, code, name, country_code, scheme_type,
        employee_component_id, employer_component_id,
        rate_table_id, formula_expression_id,
        status, created_by
    )
    SELECT
        shared.uuidv7(), v_tid, x.code, x.name, x.country, x.scheme_type,
        (SELECT id FROM master.pay_component WHERE tenant_id = v_tid AND code = x.ee_comp),
        (SELECT id FROM master.pay_component WHERE tenant_id = v_tid AND code = x.er_comp),
        (SELECT id FROM control.rate_table WHERE tenant_id = v_tid AND code = x.rate_tbl),
        (SELECT id FROM control.formula_expression WHERE tenant_id = v_tid AND code = x.formula),
        'active', v_su
    FROM (VALUES

        -- ── INDIA ─────────────────────────────────────────────────────────
        -- EPF: Employees' Provident Funds and Miscellaneous Provisions Act, 1952
        -- Applicable to establishments with 20+ employees.
        ('IN_PF',          'India — Employees Provident Fund (EPF)',
         'IN', 'pension',
         'PF_EE', 'PF_ER', 'PF_RATE_IN', 'pf_employee_in'),

        -- ESIC: Employees' State Insurance Act, 1948
        -- Applies to employees with gross ≤ ₹21,000/month in covered regions.
        ('IN_ESI',         'India — Employees State Insurance (ESIC)',
         'IN', 'healthcare',
         'ESI_EE', 'ESI_ER', 'ESI_RATE_IN', 'esi_employee_in'),

        -- Gratuity: Payment of Gratuity Act, 1972
        -- Employer obligation; no employee deduction.
        ('IN_GRATUITY',    'India — Gratuity (Payment of Gratuity Act, 1972)',
         'IN', 'other',
         NULL::text, 'GRATUITY_ACCR', NULL::text, 'gratuity_accrual_in'),

        -- Statutory Bonus: Payment of Bonus Act, 1965
        -- Employer obligation on eligible employees (salary ≤ ₹21,000/month).
        ('IN_STAT_BONUS',  'India — Statutory Bonus (Payment of Bonus Act, 1965)',
         'IN', 'other',
         NULL::text, 'STAT_BONUS', NULL::text, 'stat_bonus_in'),

        -- Income Tax TDS: Income Tax Act, 1961 — Sec 192
        -- Employer deducts TDS on salary and remits to government.
        ('IN_INCOME_TAX',  'India — Income Tax (TDS u/s 192)',
         'IN', 'income_tax',
         'INCOME_TAX', NULL::text, 'INCOME_TAX_IN_NEW', 'income_tax_tds_monthly'),

        -- Professional Tax: charged by states (Maharashtra, Karnataka, etc.)
        -- Max ₹2,500/year. Rate varies by state salary slab.
        ('IN_PROF_TAX',    'India — Professional Tax (State Levy)',
         'IN', 'social_security',
         'PROF_TAX', NULL::text, NULL::text, NULL::text),

        -- NPS: National Pension System — employer 10% voluntary (recommended)
        ('IN_NPS',         'India — National Pension System (NPS)',
         'IN', 'pension',
         'NPS_EE', 'NPS_ER', NULL::text, NULL::text),

        -- ── SINGAPORE ─────────────────────────────────────────────────────
        -- CPF: Central Provident Fund Act
        -- Mandatory for Singapore Citizens and Permanent Residents.
        ('SG_CPF',         'Singapore — Central Provident Fund (CPF)',
         'SG', 'pension',
         'CPF_EE', 'CPF_ER', 'CPF_RATE_SG', NULL::text),

        -- SDL: Skills Development Levy — employer 0.25% of gross (min $2, max $11.25).
        -- Funds SkillsFuture Singapore. Employee has no contribution.
        ('SG_SDL',         'Singapore — Skills Development Levy (SDL)',
         'SG', 'other',
         NULL::text, 'SDL_ER', NULL::text, NULL::text),

        -- SHG: Self-Help Group contributions — CDAC / ECF / MBMF / SINDA.
        -- Deducted from employee salary by employer, remitted monthly.
        ('SG_SHG',         'Singapore — Self-Help Group Contributions',
         'SG', 'social_security',
         'SHG_EE', NULL::text, NULL::text, NULL::text),

        -- ── MALAYSIA ──────────────────────────────────────────────────────
        -- EPF: Employees Provident Fund Act, 1991
        -- Employee 11%, Employer 12% (or 13% for salary ≤ MYR 5,000).
        ('MY_EPF',         'Malaysia — Employees Provident Fund (EPF)',
         'MY', 'pension',
         'PF_EE', 'EPF_ER', NULL::text, NULL::text),

        -- SOCSO: Employees Social Security Act, 1969 (Perkeso)
        -- Employment Injury & Invalidity Scheme. Employer ~1.75%, Employee ~0.5%.
        ('MY_SOCSO',       'Malaysia — SOCSO / Perkeso',
         'MY', 'social_security',
         'SOCSO_EE', 'SOCSO_ER', NULL::text, NULL::text),

        -- EIS: Employment Insurance System — Employment Insurance System Act, 2017
        -- Employee 0.2%, Employer 0.4% on insured salary.
        ('MY_EIS',         'Malaysia — Employment Insurance System (EIS)',
         'MY', 'other',
         'EIS_EE', 'EIS_ER', NULL::text, NULL::text),

        -- ── UNITED KINGDOM ────────────────────────────────────────────────
        -- NI: Class 1 National Insurance (Social Security Contributions Act, 1992)
        -- Employee 8% (2024-26) / Employer 13.8% (2024-25) or 15% (2025-26) above respective thresholds.
        ('GB_NI',          'United Kingdom — National Insurance (Class 1)',
         'GB', 'social_security',
         'NI_EE', 'NI_ER', 'NI_RATE_GB', NULL::text),

        -- Auto-Enrolment Pension: Pensions Act, 2008
        -- Minimum 5% employee + 3% employer on qualifying earnings.
        ('GB_AE_PENSION',  'United Kingdom — Auto-Enrolment Pension',
         'GB', 'pension',
         NULL::text, NULL::text, NULL::text, NULL::text),

        -- ── UNITED STATES ─────────────────────────────────────────────────
        -- FICA Social Security: 6.2% EE + 6.2% ER; 2025 wage base $176,100.
        ('US_SOC_SEC',     'United States — Social Security (FICA)',
         'US', 'social_security',
         'SS_EE', 'SS_ER', 'US_SS_RATE', NULL::text),

        -- Medicare: 1.45% EE + 1.45% ER; additional 0.9% EE surcharge above $200k.
        ('US_MEDICARE',    'United States — Medicare (FICA)',
         'US', 'healthcare',
         'MEDICARE_EE', 'MEDICARE_ER', 'US_MEDICARE_RATE', NULL::text),

        -- ── UAE ───────────────────────────────────────────────────────────
        -- GPSSA: General Pension & Social Security Authority
        -- Applicable to UAE national employees only.
        -- Expatriates have no statutory pension contribution.
        ('AE_GPSSA',       'UAE — GPSSA (UAE Nationals Only)',
         'AE', 'pension',
         NULL::text, NULL::text, NULL::text, NULL::text)

    ) AS x(code, name, country, scheme_type, ee_comp, er_comp, rate_tbl, formula)
    ON CONFLICT (tenant_id, code) DO UPDATE
        SET name                  = EXCLUDED.name,
            scheme_type           = EXCLUDED.scheme_type,
            employee_component_id = EXCLUDED.employee_component_id,
            employer_component_id = EXCLUDED.employer_component_id,
            rate_table_id         = EXCLUDED.rate_table_id,
            formula_expression_id = EXCLUDED.formula_expression_id,
            updated_at            = now(),
            updated_by            = v_su
        WHERE (master.statutory_scheme.name,
               master.statutory_scheme.scheme_type,
               master.statutory_scheme.employee_component_id,
               master.statutory_scheme.employer_component_id,
               master.statutory_scheme.rate_table_id)
              IS DISTINCT FROM (EXCLUDED.name,
                                EXCLUDED.scheme_type,
                                EXCLUDED.employee_component_id,
                                EXCLUDED.employer_component_id,
                                EXCLUDED.rate_table_id);

    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE '[%] statutory_scheme: % rows upserted', v_pack, v_n;

    -- ========================================================================
    -- ASSERTIONS
    -- ========================================================================
    SELECT COUNT(*) INTO v_n FROM control.formula_expression WHERE tenant_id = v_tid;
    IF v_n < 14 THEN
        RAISE EXCEPTION '[%] Assertion failed: expected >= 14 formula_expression rows, found %', v_pack, v_n;
    END IF;

    SELECT COUNT(*) INTO v_n FROM control.formula_expression_version WHERE tenant_id = v_tid;
    IF v_n < 14 THEN
        RAISE EXCEPTION '[%] Assertion failed: expected >= 14 formula_expression_version rows, found %', v_pack, v_n;
    END IF;

    SELECT COUNT(*) INTO v_n FROM control.rate_table WHERE tenant_id = v_tid;
    IF v_n < 7 THEN
        RAISE EXCEPTION '[%] Assertion failed: expected >= 7 rate_table rows, found %', v_pack, v_n;
    END IF;

    SELECT COUNT(*) INTO v_n FROM control.rate_table_row WHERE tenant_id = v_tid;
    IF v_n < 50 THEN
        RAISE EXCEPTION '[%] Assertion failed: expected >= 50 rate_table_row rows, found %', v_pack, v_n;
    END IF;

    SELECT COUNT(*) INTO v_n FROM master.pay_component WHERE tenant_id = v_tid;
    IF v_n < 56 THEN
        RAISE EXCEPTION '[%] Assertion failed: expected >= 56 pay_component rows, found %', v_pack, v_n;
    END IF;

    SELECT COUNT(*) INTO v_n FROM master.pay_structure WHERE tenant_id = v_tid;
    IF v_n < 3 THEN
        RAISE EXCEPTION '[%] Assertion failed: expected >= 3 pay_structure rows, found %', v_pack, v_n;
    END IF;

    SELECT COUNT(*) INTO v_n FROM master.pay_structure_line WHERE tenant_id = v_tid;
    IF v_n < 40 THEN
        RAISE EXCEPTION '[%] Assertion failed: expected >= 40 pay_structure_line rows, found %', v_pack, v_n;
    END IF;

    SELECT COUNT(*) INTO v_n FROM master.statutory_scheme WHERE tenant_id = v_tid;
    IF v_n < 18 THEN
        RAISE EXCEPTION '[%] Assertion failed: expected >= 18 statutory_scheme rows, found %', v_pack, v_n;
    END IF;

    -- Every formula must have at least one effective version
    SELECT COUNT(*) INTO v_n
    FROM control.formula_expression fe
    LEFT JOIN control.formula_expression_version fev
           ON fev.tenant_id = fe.tenant_id
          AND fev.formula_expression_id = fe.id
          AND fev.status = 'effective'
    WHERE fe.tenant_id = v_tid AND fev.id IS NULL;
    IF v_n > 0 THEN
        RAISE EXCEPTION '[%] Assertion failed: % formula_expressions have no effective version', v_pack, v_n;
    END IF;

    -- Every pay structure must have at least one line
    SELECT COUNT(*) INTO v_n
    FROM master.pay_structure ps
    LEFT JOIN master.pay_structure_line psl ON psl.tenant_id = ps.tenant_id AND psl.pay_structure_id = ps.id
    WHERE ps.tenant_id = v_tid AND psl.id IS NULL;
    IF v_n > 0 THEN
        RAISE EXCEPTION '[%] Assertion failed: % pay_structures have no lines', v_pack, v_n;
    END IF;

    RAISE NOTICE '[%] All assertions passed', v_pack;
    RAISE NOTICE '[%] Summary — formulas: %, formula_versions: %, rate_tables: %, rate_rows: %, components: %, structures: %, lines: %, schemes: %',
        v_pack,
        (SELECT COUNT(*) FROM control.formula_expression      WHERE tenant_id = v_tid),
        (SELECT COUNT(*) FROM control.formula_expression_version WHERE tenant_id = v_tid),
        (SELECT COUNT(*) FROM control.rate_table              WHERE tenant_id = v_tid),
        (SELECT COUNT(*) FROM control.rate_table_row          WHERE tenant_id = v_tid),
        (SELECT COUNT(*) FROM master.pay_component            WHERE tenant_id = v_tid),
        (SELECT COUNT(*) FROM master.pay_structure            WHERE tenant_id = v_tid),
        (SELECT COUNT(*) FROM master.pay_structure_line       WHERE tenant_id = v_tid),
        (SELECT COUNT(*) FROM master.statutory_scheme         WHERE tenant_id = v_tid);

END $seed$;
