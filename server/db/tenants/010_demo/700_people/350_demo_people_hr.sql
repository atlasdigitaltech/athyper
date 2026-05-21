-- ============================================================================
-- tenants/010_demo/700_people/350_demo_people_hr.sql
-- Demo HR People — Three Legal Entities
--
--   AITM  · Athyper Technologies Private Limited   (India,  INR)
--   ASGF  · Athyper Technologies Pte. Ltd.         (Singapore, SGD)
--   AUKA  · Athyper Technologies Limited            (United Kingdom, GBP)
--
-- 12 demo employees (4 per entity) across Tech, Finance, HR, Legal, Sales:
--
--   India (AITM):
--     EMP-IN-001  Priya Sharma         — CTO
--     EMP-IN-002  Rahul Mehta          — Senior Software Engineer
--     EMP-IN-003  Ananya Krishnan      — HR Manager
--     EMP-IN-004  Vikram Patel         — Financial Analyst
--
--   Singapore (ASGF):
--     EMP-SG-001  Wei Lin Tan          — Engineering Manager
--     EMP-SG-002  Siti Rahimah Ahmad   — Legal Counsel
--     EMP-SG-003  Marcus Lim           — Data Analyst
--     EMP-SG-004  Preethi Subramaniam  — Compliance Officer
--
--   United Kingdom (AUKA):
--     EMP-GB-001  Oliver Thornton      — Vice President of Engineering
--     EMP-GB-002  Isabelle Fontaine    — Finance Director
--     EMP-GB-003  James Whitfield      — Sales Manager
--     EMP-GB-004  Eleanor Hayes        — HR Business Partner
--
-- Tables seeded:
--   master.person                    — PII root
--   master.person_sensitive_profile  — Isolated PII (tokens are DEMO STUBS only)
--   master.external_reference        — HRIS / ERP integration IDs
--   master.pay_group                 — 1 monthly pay group per company
--   master.position                  — 4 budgeted positions per company
--   master.employment                — 1 active contract per person
--
-- Deferred — require master.employee records created by hire/onboarding flow:
--   master.work_assignment           — employee_id NOT NULL
--   master.employee_leave_enrollment — employee_id NOT NULL
--   master.employee_statutory_enrollment — employee_id NOT NULL
--
-- Prerequisites:
--   ✓ 020_universal/070_people/310_job_classification.sql
--   ✓ Tenant org structure: company_codes AITM · ASGF · AUKA
--   ✓ Org units per company (AITM_TECH, AITM_HR, AITM_FIN, etc.) — optional;
--     position.org_unit_id is nullable and skipped gracefully if absent.
--
-- Idempotent: ON CONFLICT guards on all tables.
--
-- Usage:
--   SET app.seed_tenant_id = '<tenant-uuid>';
--   \i tenants/010_demo/700_people/350_demo_people_hr.sql
-- ============================================================================

DO $demo_hr$
DECLARE
    v_tid  uuid;
    v_su   uuid := '00000000-0000-0000-0000-000000000000';

    -- Company and legal entity IDs
    v_cc_in  uuid;   -- AITM company_code.id
    v_cc_sg  uuid;   -- ASGF company_code.id
    v_cc_gb  uuid;   -- AUKA company_code.id
    v_le_in  uuid;   -- India legal_entity.id
    v_le_sg  uuid;   -- Singapore legal_entity.id
    v_le_gb  uuid;   -- UK legal_entity.id

    -- Org unit IDs (nullable — graceful if not seeded)
    v_ou_tech_in   uuid;
    v_ou_hr_in     uuid;
    v_ou_fin_in    uuid;
    v_ou_tech_sg   uuid;
    v_ou_legal_sg  uuid;
    v_ou_tech_gb   uuid;
    v_ou_fin_gb    uuid;
    v_ou_sales_gb  uuid;

    -- Job IDs (from job_classification seed)
    v_job_cto            uuid;
    v_job_sr_swe         uuid;
    v_job_hr_mgr         uuid;
    v_job_fin_analyst    uuid;
    v_job_eng_mgr        uuid;
    v_job_legal_counsel  uuid;
    v_job_data_analyst   uuid;
    v_job_compliance     uuid;
    v_job_vp_eng         uuid;
    v_job_fin_dir        uuid;
    v_job_sales_mgr      uuid;
    v_job_hr_bp          uuid;

    -- Position IDs (captured after insert for employment linking)
    v_pos_cto_in     uuid;
    v_pos_swe_in     uuid;
    v_pos_hr_in      uuid;
    v_pos_fin_in     uuid;
    v_pos_engmgr_sg  uuid;
    v_pos_legal_sg   uuid;
    v_pos_analyst_sg uuid;
    v_pos_comp_sg    uuid;
    v_pos_vpeng_gb   uuid;
    v_pos_findir_gb  uuid;
    v_pos_sales_gb   uuid;
    v_pos_hrbp_gb    uuid;

    -- Person IDs (captured after insert for sensitive profile + employment)
    v_p_priya    uuid;
    v_p_rahul    uuid;
    v_p_ananya   uuid;
    v_p_vikram   uuid;
    v_p_weilan   uuid;
    v_p_siti     uuid;
    v_p_marcus   uuid;
    v_p_preethi  uuid;
    v_p_oliver   uuid;
    v_p_isabelle uuid;
    v_p_james    uuid;
    v_p_eleanor  uuid;

    v_n  int;
BEGIN

    v_tid := nullif(trim(current_setting('app.seed_tenant_id', true)), '')::uuid;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[demo_hr] app.seed_tenant_id not set — run: SET app.seed_tenant_id = ''<uuid>''';
    END IF;

    RAISE NOTICE '[demo_hr] Seeding HR demo data for tenant %', v_tid;

    -- ========================================================================
    -- RESOLVE COMPANY CODES AND LEGAL ENTITIES
    -- ========================================================================
    SELECT id, legal_entity_id INTO v_cc_in, v_le_in
      FROM master.company_code WHERE tenant_id = v_tid AND code = 'AITM';
    SELECT id, legal_entity_id INTO v_cc_sg, v_le_sg
      FROM master.company_code WHERE tenant_id = v_tid AND code = 'ASGF';
    SELECT id, legal_entity_id INTO v_cc_gb, v_le_gb
      FROM master.company_code WHERE tenant_id = v_tid AND code = 'AUKA';

    IF v_cc_in IS NULL THEN RAISE EXCEPTION '[demo_hr] company_code AITM not found for tenant %', v_tid; END IF;
    IF v_cc_sg IS NULL THEN RAISE EXCEPTION '[demo_hr] company_code ASGF not found for tenant %', v_tid; END IF;
    IF v_cc_gb IS NULL THEN RAISE EXCEPTION '[demo_hr] company_code AUKA not found for tenant %', v_tid; END IF;

    -- Org units — null-safe; positions still insert without them
    SELECT id INTO v_ou_tech_in  FROM master.org_unit WHERE tenant_id = v_tid AND code = 'AITM_TECH';
    SELECT id INTO v_ou_hr_in    FROM master.org_unit WHERE tenant_id = v_tid AND code = 'AITM_HR';
    SELECT id INTO v_ou_fin_in   FROM master.org_unit WHERE tenant_id = v_tid AND code = 'AITM_FIN';
    SELECT id INTO v_ou_tech_sg  FROM master.org_unit WHERE tenant_id = v_tid AND code = 'ASGF_TECH';
    SELECT id INTO v_ou_legal_sg FROM master.org_unit WHERE tenant_id = v_tid AND code = 'ASGF_LEGAL';
    SELECT id INTO v_ou_tech_gb  FROM master.org_unit WHERE tenant_id = v_tid AND code = 'AUKA_TECH';
    SELECT id INTO v_ou_fin_gb   FROM master.org_unit WHERE tenant_id = v_tid AND code = 'AUKA_FIN';
    SELECT id INTO v_ou_sales_gb FROM master.org_unit WHERE tenant_id = v_tid AND code = 'AUKA_SALES';

    -- Job IDs — resolved from job_classification seed
    SELECT id INTO v_job_cto           FROM master.job WHERE tenant_id = v_tid AND code = 'cto';
    SELECT id INTO v_job_sr_swe        FROM master.job WHERE tenant_id = v_tid AND code = 'sr_software_engineer';
    SELECT id INTO v_job_hr_mgr        FROM master.job WHERE tenant_id = v_tid AND code = 'hr_manager';
    SELECT id INTO v_job_fin_analyst   FROM master.job WHERE tenant_id = v_tid AND code = 'financial_analyst';
    SELECT id INTO v_job_eng_mgr       FROM master.job WHERE tenant_id = v_tid AND code = 'engineering_manager';
    SELECT id INTO v_job_legal_counsel FROM master.job WHERE tenant_id = v_tid AND code = 'legal_counsel';
    SELECT id INTO v_job_data_analyst  FROM master.job WHERE tenant_id = v_tid AND code = 'data_analyst';
    SELECT id INTO v_job_compliance    FROM master.job WHERE tenant_id = v_tid AND code = 'compliance_officer';
    SELECT id INTO v_job_vp_eng        FROM master.job WHERE tenant_id = v_tid AND code = 'vp_engineering';
    SELECT id INTO v_job_fin_dir       FROM master.job WHERE tenant_id = v_tid AND code = 'finance_director';
    SELECT id INTO v_job_sales_mgr     FROM master.job WHERE tenant_id = v_tid AND code = 'sales_manager';
    SELECT id INTO v_job_hr_bp         FROM master.job WHERE tenant_id = v_tid AND code = 'hr_business_partner';

    -- ========================================================================
    -- PAY GROUPS  (1 monthly pay group per company)
    -- pay_group requires company_code_id (NOT NULL) and currency_code.
    -- Run after company_codes are provisioned; skip if already present.
    -- ========================================================================
    INSERT INTO master.pay_group (
        id, tenant_id, code, name,
        company_code_id, legal_entity_id,
        pay_frequency, currency_code, country_code,
        status, created_by
    )
    VALUES
        (shared.uuidv7(), v_tid, 'AITM_MONTHLY',
         'Athyper India — Monthly Payroll',
         v_cc_in, v_le_in, 'monthly', 'INR', 'IN', 'active', v_su),

        (shared.uuidv7(), v_tid, 'ASGF_MONTHLY',
         'Athyper Singapore — Monthly Payroll',
         v_cc_sg, v_le_sg, 'monthly', 'SGD', 'SG', 'active', v_su),

        (shared.uuidv7(), v_tid, 'AUKA_MONTHLY',
         'Athyper UK — Monthly Payroll',
         v_cc_gb, v_le_gb, 'monthly', 'GBP', 'GB', 'active', v_su)

    ON CONFLICT (tenant_id, code) DO UPDATE
        SET name       = EXCLUDED.name,
            updated_at = now(),
            updated_by = v_su
        WHERE master.pay_group.name IS DISTINCT FROM EXCLUDED.name;

    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE '[demo_hr] pay_group: % rows upserted', v_n;

    -- ========================================================================
    -- POSITIONS  (4 per company, 12 total)
    -- position_type='regular', headcount_capacity=1, status='active'.
    -- valid_from = company hire-date floor; valid_to left NULL (open-ended).
    -- org_unit_id is nullable — NULL if org units not seeded.
    -- ========================================================================

    -- India
    INSERT INTO master.position (
        id, tenant_id, code, name,
        company_code_id, legal_entity_id, org_unit_id, job_id,
        position_type, headcount_capacity, valid_from,
        metadata, status, created_by
    ) VALUES
        (shared.uuidv7(), v_tid, 'AITM_POS_CTO',    'Chief Technology Officer — India',
         v_cc_in, v_le_in, v_ou_tech_in,  v_job_cto,
         'regular', 1.00, '2023-01-01', '{}', 'active', v_su),

        (shared.uuidv7(), v_tid, 'AITM_POS_SWE_SR', 'Senior Software Engineer — India',
         v_cc_in, v_le_in, v_ou_tech_in,  v_job_sr_swe,
         'regular', 1.00, '2023-01-01', '{}', 'active', v_su),

        (shared.uuidv7(), v_tid, 'AITM_POS_HR_MGR', 'HR Manager — India',
         v_cc_in, v_le_in, v_ou_hr_in,   v_job_hr_mgr,
         'regular', 1.00, '2023-01-01', '{}', 'active', v_su),

        (shared.uuidv7(), v_tid, 'AITM_POS_FIN_AN', 'Financial Analyst — India',
         v_cc_in, v_le_in, v_ou_fin_in,  v_job_fin_analyst,
         'regular', 1.00, '2023-06-01', '{}', 'active', v_su)

    ON CONFLICT (tenant_id, code) DO UPDATE
        SET name       = EXCLUDED.name,
            job_id     = EXCLUDED.job_id,
            updated_at = now(),
            updated_by = v_su
        WHERE (master.position.name, master.position.job_id)
              IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.job_id);

    -- Singapore
    INSERT INTO master.position (
        id, tenant_id, code, name,
        company_code_id, legal_entity_id, org_unit_id, job_id,
        position_type, headcount_capacity, valid_from,
        metadata, status, created_by
    ) VALUES
        (shared.uuidv7(), v_tid, 'ASGF_POS_ENG_MGR', 'Engineering Manager — Singapore',
         v_cc_sg, v_le_sg, v_ou_tech_sg,  v_job_eng_mgr,
         'regular', 1.00, '2023-01-01', '{}', 'active', v_su),

        (shared.uuidv7(), v_tid, 'ASGF_POS_LEGAL',   'Legal Counsel — Singapore',
         v_cc_sg, v_le_sg, v_ou_legal_sg, v_job_legal_counsel,
         'regular', 1.00, '2023-01-01', '{}', 'active', v_su),

        (shared.uuidv7(), v_tid, 'ASGF_POS_ANALYST', 'Data Analyst — Singapore',
         v_cc_sg, v_le_sg, v_ou_tech_sg,  v_job_data_analyst,
         'regular', 1.00, '2023-06-01', '{}', 'active', v_su),

        (shared.uuidv7(), v_tid, 'ASGF_POS_COMP',    'Compliance Officer — Singapore',
         v_cc_sg, v_le_sg, v_ou_legal_sg, v_job_compliance,
         'regular', 1.00, '2024-01-01', '{}', 'active', v_su)

    ON CONFLICT (tenant_id, code) DO UPDATE
        SET name       = EXCLUDED.name,
            job_id     = EXCLUDED.job_id,
            updated_at = now(),
            updated_by = v_su
        WHERE (master.position.name, master.position.job_id)
              IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.job_id);

    -- United Kingdom
    INSERT INTO master.position (
        id, tenant_id, code, name,
        company_code_id, legal_entity_id, org_unit_id, job_id,
        position_type, headcount_capacity, valid_from,
        metadata, status, created_by
    ) VALUES
        (shared.uuidv7(), v_tid, 'AUKA_POS_VP_ENG',  'Vice President of Engineering — UK',
         v_cc_gb, v_le_gb, v_ou_tech_gb,  v_job_vp_eng,
         'regular', 1.00, '2022-01-01', '{}', 'active', v_su),

        (shared.uuidv7(), v_tid, 'AUKA_POS_FIN_DIR', 'Finance Director — UK',
         v_cc_gb, v_le_gb, v_ou_fin_gb,   v_job_fin_dir,
         'regular', 1.00, '2022-01-01', '{}', 'active', v_su),

        (shared.uuidv7(), v_tid, 'AUKA_POS_SALES',   'Sales Manager — UK',
         v_cc_gb, v_le_gb, v_ou_sales_gb, v_job_sales_mgr,
         'regular', 1.00, '2023-03-01', '{}', 'active', v_su),

        (shared.uuidv7(), v_tid, 'AUKA_POS_HR_BP',   'HR Business Partner — UK',
         v_cc_gb, v_le_gb, v_ou_tech_gb,  v_job_hr_bp,
         'regular', 1.00, '2023-06-01', '{}', 'active', v_su)

    ON CONFLICT (tenant_id, code) DO UPDATE
        SET name       = EXCLUDED.name,
            job_id     = EXCLUDED.job_id,
            updated_at = now(),
            updated_by = v_su
        WHERE (master.position.name, master.position.job_id)
              IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.job_id);

    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE '[demo_hr] position: last batch % rows upserted (12 total)', v_n;

    -- Capture position IDs for employment metadata
    SELECT id INTO v_pos_cto_in     FROM master.position WHERE tenant_id = v_tid AND code = 'AITM_POS_CTO';
    SELECT id INTO v_pos_swe_in     FROM master.position WHERE tenant_id = v_tid AND code = 'AITM_POS_SWE_SR';
    SELECT id INTO v_pos_hr_in      FROM master.position WHERE tenant_id = v_tid AND code = 'AITM_POS_HR_MGR';
    SELECT id INTO v_pos_fin_in     FROM master.position WHERE tenant_id = v_tid AND code = 'AITM_POS_FIN_AN';
    SELECT id INTO v_pos_engmgr_sg  FROM master.position WHERE tenant_id = v_tid AND code = 'ASGF_POS_ENG_MGR';
    SELECT id INTO v_pos_legal_sg   FROM master.position WHERE tenant_id = v_tid AND code = 'ASGF_POS_LEGAL';
    SELECT id INTO v_pos_analyst_sg FROM master.position WHERE tenant_id = v_tid AND code = 'ASGF_POS_ANALYST';
    SELECT id INTO v_pos_comp_sg    FROM master.position WHERE tenant_id = v_tid AND code = 'ASGF_POS_COMP';
    SELECT id INTO v_pos_vpeng_gb   FROM master.position WHERE tenant_id = v_tid AND code = 'AUKA_POS_VP_ENG';
    SELECT id INTO v_pos_findir_gb  FROM master.position WHERE tenant_id = v_tid AND code = 'AUKA_POS_FIN_DIR';
    SELECT id INTO v_pos_sales_gb   FROM master.position WHERE tenant_id = v_tid AND code = 'AUKA_POS_SALES';
    SELECT id INTO v_pos_hrbp_gb    FROM master.position WHERE tenant_id = v_tid AND code = 'AUKA_POS_HR_BP';

    -- ========================================================================
    -- PERSONS  (12 demo employees)
    -- Realistic cross-country names; emails are @athyper.com demo domain.
    -- country_code = country of work, not necessarily nationality.
    -- ========================================================================
    INSERT INTO master.person (
        id, tenant_id, code, name, person_number,
        first_name, middle_name, last_name,
        display_name, preferred_name,
        primary_email, primary_phone, country_code,
        metadata, tags, status, created_by
    )
    VALUES
        -- India ──────────────────────────────────────────────────────────────
        (shared.uuidv7(), v_tid, 'PERS_PRIYA_SHARMA',     'Priya Sharma',           'EMP-IN-001',
         'Priya',    NULL,       'Sharma',     'Priya Sharma',          'Priya',
         'priya.sharma@athyper.com',          '+91 98200 11001', 'IN',
         '{"entity":"AITM","function":"tech_engineering"}'::jsonb,
         '["india","executive","tech"]'::jsonb,          'active', v_su),

        (shared.uuidv7(), v_tid, 'PERS_RAHUL_MEHTA',      'Rahul Mehta',            'EMP-IN-002',
         'Rahul',    NULL,       'Mehta',      'Rahul Mehta',           'Rahul',
         'rahul.mehta@athyper.com',           '+91 98200 11002', 'IN',
         '{"entity":"AITM","function":"tech_engineering"}'::jsonb,
         '["india","tech","senior"]'::jsonb,             'active', v_su),

        (shared.uuidv7(), v_tid, 'PERS_ANANYA_KRISHNAN',  'Ananya Krishnan',         'EMP-IN-003',
         'Ananya',   NULL,       'Krishnan',   'Ananya Krishnan',        'Ananya',
         'ananya.krishnan@athyper.com',       '+91 98200 11003', 'IN',
         '{"entity":"AITM","function":"human_resources"}'::jsonb,
         '["india","hr","manager"]'::jsonb,              'active', v_su),

        (shared.uuidv7(), v_tid, 'PERS_VIKRAM_PATEL',     'Vikram Patel',            'EMP-IN-004',
         'Vikram',   NULL,       'Patel',      'Vikram Patel',           'Vik',
         'vikram.patel@athyper.com',          '+91 98200 11004', 'IN',
         '{"entity":"AITM","function":"finance_accounting"}'::jsonb,
         '["india","finance"]'::jsonb,                   'active', v_su),

        -- Singapore ──────────────────────────────────────────────────────────
        (shared.uuidv7(), v_tid, 'PERS_WEI_LIN_TAN',      'Wei Lin Tan',             'EMP-SG-001',
         'Wei Lin',  NULL,       'Tan',        'Wei Lin Tan',            'Wei Lin',
         'weilan.tan@athyper.com',            '+65 9100 2201',   'SG',
         '{"entity":"ASGF","function":"tech_engineering"}'::jsonb,
         '["singapore","tech","manager"]'::jsonb,        'active', v_su),

        (shared.uuidv7(), v_tid, 'PERS_SITI_AHMAD',       'Siti Rahimah Bte Ahmad',  'EMP-SG-002',
         'Siti',     'Rahimah',  'Ahmad',      'Siti Ahmad',             'Siti',
         'siti.ahmad@athyper.com',            '+65 9100 2202',   'SG',
         '{"entity":"ASGF","function":"legal_compliance"}'::jsonb,
         '["singapore","legal","senior"]'::jsonb,        'active', v_su),

        (shared.uuidv7(), v_tid, 'PERS_MARCUS_LIM',       'Marcus Lim Jun Hao',      'EMP-SG-003',
         'Marcus',   'Jun Hao',  'Lim',        'Marcus Lim',             'Marcus',
         'marcus.lim@athyper.com',            '+65 9100 2203',   'SG',
         '{"entity":"ASGF","function":"data_analytics"}'::jsonb,
         '["singapore","data","analytics"]'::jsonb,      'active', v_su),

        (shared.uuidv7(), v_tid, 'PERS_PREETHI_SUB',      'Preethi Subramaniam',     'EMP-SG-004',
         'Preethi',  NULL,       'Subramaniam','Preethi Subramaniam',    'Preethi',
         'preethi.subramaniam@athyper.com',   '+65 9100 2204',   'SG',
         '{"entity":"ASGF","function":"legal_compliance"}'::jsonb,
         '["singapore","compliance","legal"]'::jsonb,    'active', v_su),

        -- United Kingdom ─────────────────────────────────────────────────────
        (shared.uuidv7(), v_tid, 'PERS_OLIVER_THORNTON',  'Oliver Thornton',         'EMP-GB-001',
         'Oliver',   NULL,       'Thornton',   'Oliver Thornton',        'Oli',
         'oliver.thornton@athyper.com',       '+44 7700 900101', 'GB',
         '{"entity":"AUKA","function":"tech_engineering"}'::jsonb,
         '["uk","tech","executive"]'::jsonb,             'active', v_su),

        (shared.uuidv7(), v_tid, 'PERS_ISABELLE_FONTAINE','Isabelle Fontaine',        'EMP-GB-002',
         'Isabelle', NULL,       'Fontaine',   'Isabelle Fontaine',      'Isabelle',
         'isabelle.fontaine@athyper.com',     '+44 7700 900102', 'GB',
         '{"entity":"AUKA","function":"finance_accounting"}'::jsonb,
         '["uk","finance","director"]'::jsonb,           'active', v_su),

        (shared.uuidv7(), v_tid, 'PERS_JAMES_WHITFIELD',  'James Whitfield',         'EMP-GB-003',
         'James',    NULL,       'Whitfield',  'James Whitfield',        'Jamie',
         'james.whitfield@athyper.com',       '+44 7700 900103', 'GB',
         '{"entity":"AUKA","function":"sales_growth"}'::jsonb,
         '["uk","sales","manager"]'::jsonb,              'active', v_su),

        (shared.uuidv7(), v_tid, 'PERS_ELEANOR_HAYES',    'Eleanor Hayes',           'EMP-GB-004',
         'Eleanor',  NULL,       'Hayes',      'Eleanor Hayes',          'Ellie',
         'eleanor.hayes@athyper.com',         '+44 7700 900104', 'GB',
         '{"entity":"AUKA","function":"human_resources"}'::jsonb,
         '["uk","hr","senior"]'::jsonb,                  'active', v_su)

    ON CONFLICT (tenant_id, code) DO UPDATE
        SET name          = EXCLUDED.name,
            primary_email = EXCLUDED.primary_email,
            primary_phone = EXCLUDED.primary_phone,
            metadata      = EXCLUDED.metadata,
            updated_at    = now(),
            updated_by    = v_su
        WHERE (master.person.name, master.person.primary_email, master.person.primary_phone)
              IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.primary_email, EXCLUDED.primary_phone);

    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE '[demo_hr] person: % rows upserted', v_n;

    -- Capture person IDs for dependent tables
    SELECT id INTO v_p_priya    FROM master.person WHERE tenant_id = v_tid AND code = 'PERS_PRIYA_SHARMA';
    SELECT id INTO v_p_rahul    FROM master.person WHERE tenant_id = v_tid AND code = 'PERS_RAHUL_MEHTA';
    SELECT id INTO v_p_ananya   FROM master.person WHERE tenant_id = v_tid AND code = 'PERS_ANANYA_KRISHNAN';
    SELECT id INTO v_p_vikram   FROM master.person WHERE tenant_id = v_tid AND code = 'PERS_VIKRAM_PATEL';
    SELECT id INTO v_p_weilan   FROM master.person WHERE tenant_id = v_tid AND code = 'PERS_WEI_LIN_TAN';
    SELECT id INTO v_p_siti     FROM master.person WHERE tenant_id = v_tid AND code = 'PERS_SITI_AHMAD';
    SELECT id INTO v_p_marcus   FROM master.person WHERE tenant_id = v_tid AND code = 'PERS_MARCUS_LIM';
    SELECT id INTO v_p_preethi  FROM master.person WHERE tenant_id = v_tid AND code = 'PERS_PREETHI_SUB';
    SELECT id INTO v_p_oliver   FROM master.person WHERE tenant_id = v_tid AND code = 'PERS_OLIVER_THORNTON';
    SELECT id INTO v_p_isabelle FROM master.person WHERE tenant_id = v_tid AND code = 'PERS_ISABELLE_FONTAINE';
    SELECT id INTO v_p_james    FROM master.person WHERE tenant_id = v_tid AND code = 'PERS_JAMES_WHITFIELD';
    SELECT id INTO v_p_eleanor  FROM master.person WHERE tenant_id = v_tid AND code = 'PERS_ELEANOR_HAYES';

    -- ========================================================================
    -- PERSON SENSITIVE PROFILES
    -- ⚠  PII TOKENS ARE DEMO STUBS — replace with real vault tokens before
    --    pushing to staging or production environments.
    -- national_id_type values follow country convention:
    --   India:     'aadhaar'    (+ PAN via tax_identifier_token)
    --   Singapore: 'nric'       (+ TIN via tax_identifier_token)
    --   UK:        'ni_number'  (+ UTR via tax_identifier_token)
    -- Protected metadata carries payroll-relevant non-PII hints (tax regime,
    -- CPF type, HMRC tax code) that the payroll engine may read.
    -- ========================================================================
    INSERT INTO master.person_sensitive_profile (
        id, tenant_id, person_id,
        date_of_birth, gender, marital_status,
        nationality_country_code,
        national_id_type, national_id_token, tax_identifier_token,
        emergency_contact, protected_attributes, metadata,
        created_by
    )
    VALUES
        -- India ──────────────────────────────────────────────────────────────
        (shared.uuidv7(), v_tid, v_p_priya,
         '1988-03-14', 'female', 'married', 'IN',
         'aadhaar', 'DEMO_TOKEN_AADHAAR_PRIYA', 'DEMO_TOKEN_PAN_PRIYA',
         '{"name":"Rohan Sharma","relation":"spouse","phone":"+91 98200 19901"}'::jsonb,
         '{"tax_regime":"new","pf_exempt":false}'::jsonb,
         '{}'::jsonb, v_su),

        (shared.uuidv7(), v_tid, v_p_rahul,
         '1995-07-22', 'male', 'single', 'IN',
         'aadhaar', 'DEMO_TOKEN_AADHAAR_RAHUL', 'DEMO_TOKEN_PAN_RAHUL',
         '{"name":"Suresh Mehta","relation":"father","phone":"+91 98200 19902"}'::jsonb,
         '{"tax_regime":"old","pf_exempt":false}'::jsonb,
         '{}'::jsonb, v_su),

        (shared.uuidv7(), v_tid, v_p_ananya,
         '1991-11-05', 'female', 'married', 'IN',
         'aadhaar', 'DEMO_TOKEN_AADHAAR_ANANYA', 'DEMO_TOKEN_PAN_ANANYA',
         '{"name":"Arjun Krishnan","relation":"spouse","phone":"+91 98200 19903"}'::jsonb,
         '{"tax_regime":"new","pf_exempt":false}'::jsonb,
         '{}'::jsonb, v_su),

        (shared.uuidv7(), v_tid, v_p_vikram,
         '1998-02-18', 'male', 'single', 'IN',
         'aadhaar', 'DEMO_TOKEN_AADHAAR_VIKRAM', 'DEMO_TOKEN_PAN_VIKRAM',
         '{"name":"Kamla Patel","relation":"mother","phone":"+91 98200 19904"}'::jsonb,
         '{"tax_regime":"new","pf_exempt":false}'::jsonb,
         '{}'::jsonb, v_su),

        -- Singapore ──────────────────────────────────────────────────────────
        (shared.uuidv7(), v_tid, v_p_weilan,
         '1985-09-03', 'female', 'married', 'SG',
         'nric', 'DEMO_TOKEN_NRIC_WEILAN', 'DEMO_TOKEN_TIN_WEILAN',
         '{"name":"David Tan","relation":"spouse","phone":"+65 9100 2901"}'::jsonb,
         '{"cpf_account_type":"ordinary","cpf_age_band":"35_45"}'::jsonb,
         '{}'::jsonb, v_su),

        (shared.uuidv7(), v_tid, v_p_siti,
         '1990-06-17', 'female', 'married', 'SG',
         'nric', 'DEMO_TOKEN_NRIC_SITI', 'DEMO_TOKEN_TIN_SITI',
         '{"name":"Ahmad Firdaus","relation":"spouse","phone":"+65 9100 2902"}'::jsonb,
         '{"cpf_account_type":"ordinary","cpf_age_band":"below_35"}'::jsonb,
         '{}'::jsonb, v_su),

        (shared.uuidv7(), v_tid, v_p_marcus,
         '1997-04-25', 'male', 'single', 'SG',
         'nric', 'DEMO_TOKEN_NRIC_MARCUS', 'DEMO_TOKEN_TIN_MARCUS',
         '{"name":"Lim Swee Huat","relation":"father","phone":"+65 9100 2903"}'::jsonb,
         '{"cpf_account_type":"ordinary","cpf_age_band":"below_35"}'::jsonb,
         '{}'::jsonb, v_su),

        (shared.uuidv7(), v_tid, v_p_preethi,
         '1993-12-08', 'female', 'single', 'SG',
         'nric', 'DEMO_TOKEN_NRIC_PREETHI', 'DEMO_TOKEN_TIN_PREETHI',
         '{"name":"Rajan Subramaniam","relation":"father","phone":"+65 9100 2904"}'::jsonb,
         '{"cpf_account_type":"ordinary","cpf_age_band":"below_35"}'::jsonb,
         '{}'::jsonb, v_su),

        -- United Kingdom ─────────────────────────────────────────────────────
        (shared.uuidv7(), v_tid, v_p_oliver,
         '1982-01-29', 'male', 'married', 'GB',
         'ni_number', 'DEMO_TOKEN_NIN_OLIVER', 'DEMO_TOKEN_UTR_OLIVER',
         '{"name":"Claire Thornton","relation":"spouse","phone":"+44 7700 901101"}'::jsonb,
         '{"tax_code":"1257L","ni_category":"A"}'::jsonb,
         '{}'::jsonb, v_su),

        (shared.uuidv7(), v_tid, v_p_isabelle,
         '1986-08-11', 'female', 'married', 'GB',
         'ni_number', 'DEMO_TOKEN_NIN_ISABELLE', 'DEMO_TOKEN_UTR_ISABELLE',
         '{"name":"Pierre Fontaine","relation":"spouse","phone":"+44 7700 901102"}'::jsonb,
         '{"tax_code":"1257L","ni_category":"A"}'::jsonb,
         '{}'::jsonb, v_su),

        (shared.uuidv7(), v_tid, v_p_james,
         '1990-05-07', 'male', 'single', 'GB',
         'ni_number', 'DEMO_TOKEN_NIN_JAMES', 'DEMO_TOKEN_UTR_JAMES',
         '{"name":"Susan Whitfield","relation":"mother","phone":"+44 7700 901103"}'::jsonb,
         '{"tax_code":"1257L","ni_category":"A"}'::jsonb,
         '{}'::jsonb, v_su),

        (shared.uuidv7(), v_tid, v_p_eleanor,
         '1994-10-20', 'female', 'single', 'GB',
         'ni_number', 'DEMO_TOKEN_NIN_ELEANOR', 'DEMO_TOKEN_UTR_ELEANOR',
         '{"name":"Patricia Hayes","relation":"mother","phone":"+44 7700 901104"}'::jsonb,
         '{"tax_code":"1257L","ni_category":"A"}'::jsonb,
         '{}'::jsonb, v_su)

    ON CONFLICT (tenant_id, person_id) DO NOTHING;

    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE '[demo_hr] person_sensitive_profile: % rows inserted', v_n;

    -- ========================================================================
    -- EXTERNAL REFERENCES  (HRIS / ERP integration IDs)
    -- owner_entity = 'person' references master.person via owner_id.
    -- UNIQUE ON (tenant_id, source_system, external_id).
    -- ========================================================================
    INSERT INTO master.external_reference (
        id, tenant_id,
        owner_entity, owner_id,
        source_system, external_id, external_code,
        payload, status, created_by
    )
    VALUES
        -- India — Workday HRIS IDs
        (shared.uuidv7(), v_tid, 'person', v_p_priya,    'workday', 'WD-IN-10001', 'AITM-001', '{"cost_center":"CC_TECH_IN"}'::jsonb, 'active', v_su),
        (shared.uuidv7(), v_tid, 'person', v_p_rahul,    'workday', 'WD-IN-10002', 'AITM-002', '{"cost_center":"CC_TECH_IN"}'::jsonb, 'active', v_su),
        (shared.uuidv7(), v_tid, 'person', v_p_ananya,   'workday', 'WD-IN-10003', 'AITM-003', '{"cost_center":"CC_HR_IN"}'::jsonb,   'active', v_su),
        (shared.uuidv7(), v_tid, 'person', v_p_vikram,   'workday', 'WD-IN-10004', 'AITM-004', '{"cost_center":"CC_FIN_IN"}'::jsonb,  'active', v_su),
        -- Singapore — Workday HRIS IDs
        (shared.uuidv7(), v_tid, 'person', v_p_weilan,   'workday', 'WD-SG-20001', 'ASGF-001', '{"cost_center":"CC_TECH_SG"}'::jsonb,  'active', v_su),
        (shared.uuidv7(), v_tid, 'person', v_p_siti,     'workday', 'WD-SG-20002', 'ASGF-002', '{"cost_center":"CC_LEGAL_SG"}'::jsonb, 'active', v_su),
        (shared.uuidv7(), v_tid, 'person', v_p_marcus,   'workday', 'WD-SG-20003', 'ASGF-003', '{"cost_center":"CC_TECH_SG"}'::jsonb,  'active', v_su),
        (shared.uuidv7(), v_tid, 'person', v_p_preethi,  'workday', 'WD-SG-20004', 'ASGF-004', '{"cost_center":"CC_LEGAL_SG"}'::jsonb, 'active', v_su),
        -- UK — Workday HRIS IDs
        (shared.uuidv7(), v_tid, 'person', v_p_oliver,   'workday', 'WD-GB-30001', 'AUKA-001', '{"cost_center":"CC_TECH_GB"}'::jsonb,  'active', v_su),
        (shared.uuidv7(), v_tid, 'person', v_p_isabelle, 'workday', 'WD-GB-30002', 'AUKA-002', '{"cost_center":"CC_FIN_GB"}'::jsonb,   'active', v_su),
        (shared.uuidv7(), v_tid, 'person', v_p_james,    'workday', 'WD-GB-30003', 'AUKA-003', '{"cost_center":"CC_SALES_GB"}'::jsonb, 'active', v_su),
        (shared.uuidv7(), v_tid, 'person', v_p_eleanor,  'workday', 'WD-GB-30004', 'AUKA-004', '{"cost_center":"CC_HR_GB"}'::jsonb,    'active', v_su)

    ON CONFLICT (tenant_id, source_system, external_id) DO NOTHING;

    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE '[demo_hr] external_reference: % rows inserted', v_n;

    -- ========================================================================
    -- EMPLOYMENT  (1 active contract per person)
    --
    -- CRITICAL: employment_status MUST equal status (DB CHECK constraint).
    -- Both columns are set to 'active' for all demo contracts.
    --
    -- probation_end_date = hire_date + 90 days for junior roles;
    -- NULL for senior hires where probation is waived.
    --
    -- Partial unique index prevents duplicate active full_time employments
    -- for the same (person, company_code) pair — one row per person here, safe.
    --
    -- metadata.position_code is a soft hint for the work_assignment step;
    -- it is not enforced by the DB.
    -- ========================================================================
    INSERT INTO master.employment (
        id, tenant_id, code, name,
        person_id, legal_entity_id, company_code_id,
        employment_number, employment_type,
        employment_status,
        hire_date, probation_end_date,
        metadata, status, created_by
    )
    VALUES
        -- India ──────────────────────────────────────────────────────────────
        (shared.uuidv7(), v_tid, 'EMPL_PRIYA_SHARMA',     'Priya Sharma — Athyper India',
         v_p_priya,    v_le_in, v_cc_in, 'AITM-EMP-001', 'full_time', 'active',
         '2023-01-03', NULL,
         jsonb_build_object('position_code','AITM_POS_CTO','position_id',v_pos_cto_in),
         'active', v_su),

        (shared.uuidv7(), v_tid, 'EMPL_RAHUL_MEHTA',      'Rahul Mehta — Athyper India',
         v_p_rahul,    v_le_in, v_cc_in, 'AITM-EMP-002', 'full_time', 'active',
         '2023-03-15', '2023-06-14',
         jsonb_build_object('position_code','AITM_POS_SWE_SR','position_id',v_pos_swe_in),
         'active', v_su),

        (shared.uuidv7(), v_tid, 'EMPL_ANANYA_KRISHNAN',  'Ananya Krishnan — Athyper India',
         v_p_ananya,   v_le_in, v_cc_in, 'AITM-EMP-003', 'full_time', 'active',
         '2023-01-03', NULL,
         jsonb_build_object('position_code','AITM_POS_HR_MGR','position_id',v_pos_hr_in),
         'active', v_su),

        (shared.uuidv7(), v_tid, 'EMPL_VIKRAM_PATEL',     'Vikram Patel — Athyper India',
         v_p_vikram,   v_le_in, v_cc_in, 'AITM-EMP-004', 'full_time', 'active',
         '2023-07-01', '2023-09-29',
         jsonb_build_object('position_code','AITM_POS_FIN_AN','position_id',v_pos_fin_in),
         'active', v_su),

        -- Singapore ──────────────────────────────────────────────────────────
        (shared.uuidv7(), v_tid, 'EMPL_WEI_LIN_TAN',      'Wei Lin Tan — Athyper Singapore',
         v_p_weilan,   v_le_sg, v_cc_sg, 'ASGF-EMP-001', 'full_time', 'active',
         '2023-01-03', NULL,
         jsonb_build_object('position_code','ASGF_POS_ENG_MGR','position_id',v_pos_engmgr_sg),
         'active', v_su),

        (shared.uuidv7(), v_tid, 'EMPL_SITI_AHMAD',       'Siti Ahmad — Athyper Singapore',
         v_p_siti,     v_le_sg, v_cc_sg, 'ASGF-EMP-002', 'full_time', 'active',
         '2023-02-01', NULL,
         jsonb_build_object('position_code','ASGF_POS_LEGAL','position_id',v_pos_legal_sg),
         'active', v_su),

        (shared.uuidv7(), v_tid, 'EMPL_MARCUS_LIM',       'Marcus Lim — Athyper Singapore',
         v_p_marcus,   v_le_sg, v_cc_sg, 'ASGF-EMP-003', 'full_time', 'active',
         '2023-07-10', '2023-10-08',
         jsonb_build_object('position_code','ASGF_POS_ANALYST','position_id',v_pos_analyst_sg),
         'active', v_su),

        (shared.uuidv7(), v_tid, 'EMPL_PREETHI_SUB',      'Preethi Subramaniam — Athyper Singapore',
         v_p_preethi,  v_le_sg, v_cc_sg, 'ASGF-EMP-004', 'full_time', 'active',
         '2024-01-15', '2024-04-14',
         jsonb_build_object('position_code','ASGF_POS_COMP','position_id',v_pos_comp_sg),
         'active', v_su),

        -- United Kingdom ─────────────────────────────────────────────────────
        (shared.uuidv7(), v_tid, 'EMPL_OLIVER_THORNTON',  'Oliver Thornton — Athyper UK',
         v_p_oliver,   v_le_gb, v_cc_gb, 'AUKA-EMP-001', 'full_time', 'active',
         '2022-01-04', NULL,
         jsonb_build_object('position_code','AUKA_POS_VP_ENG','position_id',v_pos_vpeng_gb),
         'active', v_su),

        (shared.uuidv7(), v_tid, 'EMPL_ISABELLE_FONTAINE','Isabelle Fontaine — Athyper UK',
         v_p_isabelle, v_le_gb, v_cc_gb, 'AUKA-EMP-002', 'full_time', 'active',
         '2022-03-01', NULL,
         jsonb_build_object('position_code','AUKA_POS_FIN_DIR','position_id',v_pos_findir_gb),
         'active', v_su),

        (shared.uuidv7(), v_tid, 'EMPL_JAMES_WHITFIELD',  'James Whitfield — Athyper UK',
         v_p_james,    v_le_gb, v_cc_gb, 'AUKA-EMP-003', 'full_time', 'active',
         '2023-04-03', '2023-07-02',
         jsonb_build_object('position_code','AUKA_POS_SALES','position_id',v_pos_sales_gb),
         'active', v_su),

        (shared.uuidv7(), v_tid, 'EMPL_ELEANOR_HAYES',    'Eleanor Hayes — Athyper UK',
         v_p_eleanor,  v_le_gb, v_cc_gb, 'AUKA-EMP-004', 'full_time', 'active',
         '2023-06-05', '2023-09-03',
         jsonb_build_object('position_code','AUKA_POS_HR_BP','position_id',v_pos_hrbp_gb),
         'active', v_su)

    ON CONFLICT (tenant_id, code) DO UPDATE
        SET name              = EXCLUDED.name,
            employment_number = EXCLUDED.employment_number,
            updated_at        = now(),
            updated_by        = v_su
        WHERE (master.employment.name, master.employment.employment_number)
              IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.employment_number);

    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE '[demo_hr] employment: % rows upserted', v_n;

    -- ========================================================================
    -- ASSERTIONS
    -- ========================================================================
    SELECT COUNT(*) INTO v_n
    FROM master.person WHERE tenant_id = v_tid AND code LIKE 'PERS_%';
    IF v_n < 12 THEN
        RAISE EXCEPTION '[demo_hr] Expected 12 person rows, found %', v_n;
    END IF;

    SELECT COUNT(*) INTO v_n
    FROM master.person_sensitive_profile psp
    JOIN master.person p ON p.tenant_id = psp.tenant_id AND p.id = psp.person_id
    WHERE p.tenant_id = v_tid AND p.code LIKE 'PERS_%';
    IF v_n < 12 THEN
        RAISE EXCEPTION '[demo_hr] Expected 12 person_sensitive_profile rows, found %', v_n;
    END IF;

    SELECT COUNT(*) INTO v_n
    FROM master.pay_group
    WHERE tenant_id = v_tid AND code IN ('AITM_MONTHLY','ASGF_MONTHLY','AUKA_MONTHLY');
    IF v_n < 3 THEN
        RAISE EXCEPTION '[demo_hr] Expected 3 pay_group rows, found %', v_n;
    END IF;

    SELECT COUNT(*) INTO v_n
    FROM master.position
    WHERE tenant_id = v_tid
      AND code IN (
          'AITM_POS_CTO', 'AITM_POS_SWE_SR', 'AITM_POS_HR_MGR', 'AITM_POS_FIN_AN',
          'ASGF_POS_ENG_MGR', 'ASGF_POS_LEGAL', 'ASGF_POS_ANALYST', 'ASGF_POS_COMP',
          'AUKA_POS_VP_ENG', 'AUKA_POS_FIN_DIR', 'AUKA_POS_SALES', 'AUKA_POS_HR_BP'
      )
      AND status = 'active';
    IF v_n < 12 THEN
        RAISE EXCEPTION '[demo_hr] Expected 12 active position rows, found %', v_n;
    END IF;

    SELECT COUNT(*) INTO v_n
    FROM master.employment
    WHERE tenant_id = v_tid AND code LIKE 'EMPL_%' AND status = 'active';
    IF v_n < 12 THEN
        RAISE EXCEPTION '[demo_hr] Expected 12 active employment rows, found %', v_n;
    END IF;

    -- Validate no employment has a broken person_id
    SELECT COUNT(*) INTO v_n
    FROM master.employment e
    LEFT JOIN master.person p ON p.tenant_id = e.tenant_id AND p.id = e.person_id
    WHERE e.tenant_id = v_tid AND e.code LIKE 'EMPL_%' AND p.id IS NULL;
    IF v_n > 0 THEN
        RAISE EXCEPTION '[demo_hr] % employment rows have a broken person_id FK', v_n;
    END IF;

    -- Validate employment_status = status (CHECK constraint sanity)
    SELECT COUNT(*) INTO v_n
    FROM master.employment
    WHERE tenant_id = v_tid AND code LIKE 'EMPL_%'
      AND employment_status <> status;
    IF v_n > 0 THEN
        RAISE EXCEPTION '[demo_hr] % employment rows violate employment_status = status constraint', v_n;
    END IF;

    RAISE NOTICE '[demo_hr] All assertions passed.';
    RAISE NOTICE '[demo_hr] Summary: persons=12, sensitive_profiles=12, pay_groups=3, positions=12, employments=12';
    RAISE NOTICE '[demo_hr] Next: run hire/onboarding flow per employee to create master.employee records.';
    RAISE NOTICE '[demo_hr] Then enrol into leave plans (employee_leave_enrollment) and statutory';
    RAISE NOTICE '[demo_hr] schemes (employee_statutory_enrollment) using the statutory_scheme codes:';
    RAISE NOTICE '[demo_hr]   India:     epf_in / esi_in / tds_in';
    RAISE NOTICE '[demo_hr]   Singapore: cpf_sg_below55';
    RAISE NOTICE '[demo_hr]   UK:        ni_gb / paye_gb';

END $demo_hr$;
