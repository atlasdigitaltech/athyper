-- ============================================================================
-- TECHNOSTAT — PEOPLE (PERSON / EMPLOYEE / EMPLOYMENT + ADDRESS & CONTACTS)
-- ============================================================================
-- File:     016_technostat_people.sql
-- Schemas:  master.person, master.employee, master.employment,
--           master.address, master.address_link,
--           master.contact_link, master.contact_email, master.contact_phone
-- Purpose:  Seed 12 employees across TKSA · SSK · TEGY · SDTX company codes.
--           5 rows are linked to existing Technostat principals (cc001000-…).
--           7 rows are HR-only records with no platform login.
--           Each employee receives:
--             • a home address + address_link  (owner_type='employee', purpose='correspondence')
--             • a work email contact_link + contact_email  (purpose='notification')
--             • a work phone contact_link + contact_phone  (purpose='notification')
-- Depends:  003_technostat_production_seed.sql
--             → tenant 'technostat'
--             → legal entities: LE-TKSA · LE-SSK · LE-TEGY · LE-SDTX
--             → company codes:  TKSA · SSK · TEGY · SDTX
--             → principals:     cc001000-…-000001 … 000005
-- Numbering:
--   person_number     P-TK-0001 … P-TK-0012
--   employee_number   E-TK-0001 … E-TK-0012
--   employment_number EN-TK-0001 … EN-TK-0012
-- Idempotent: Yes — ON CONFLICT DO NOTHING / DO UPDATE throughout
-- ============================================================================

DO $tksa_people$
DECLARE
    v_su        uuid := '00000000-0000-0000-0000-000000000000';
    v_tid       uuid;
    v_cc_id     uuid;
    v_le_id     uuid;
    v_person_id uuid;
    v_emp_id    uuid;
    v_addr_id   uuid;
    v_cl_id     uuid;
    rec         record;
BEGIN

    SELECT id INTO v_tid
    FROM master.tenant
    WHERE realm_key = 'athyper' AND code = 'technostat';

    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[016_technostat_people] Technostat tenant not found';
    END IF;

    PERFORM set_config('app.current_principal_id', v_su::text, true);

    -- ──────────────────────────────────────────────────────────────────────────
    -- Working dataset — one row per employee
    -- ──────────────────────────────────────────────────────────────────────────
    CREATE TEMP TABLE tmp_tksa_people (
        principal_id    uuid,            -- NULL for non-principal employees
        p_code          text NOT NULL,   -- shared code suffix (person + employee)
        first_name      text NOT NULL,
        last_name       text NOT NULL,
        company_code    text NOT NULL,   -- master.company_code.code
        le_code         text NOT NULL,   -- master.legal_entity.code
        work_email      text NOT NULL,
        work_phone      text NOT NULL,   -- E.164
        phone_cc        text NOT NULL,   -- calling code with + prefix
        phone_national  text NOT NULL,   -- national number digits only
        hire_date       date NOT NULL,
        title           text,
        home_line1      text NOT NULL,
        home_line2      text,
        home_city       text NOT NULL,
        home_region     text,
        home_postal     text NOT NULL,
        home_country    char(2) NOT NULL,
        person_number   text NOT NULL,
        emp_number      text NOT NULL,
        empl_number     text NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO tmp_tksa_people VALUES

    -- ── TKSA — Technostat Group HQ (Riyadh, SA) ───────────────────────────────

    ('cc001000-0000-0000-0000-000000000001',
     'tksa.owner', 'Omar', 'Al-Rashid',
     'TKSA', 'LE-TKSA',
     'tksa.owner@technostat.demo', '+966551000001', '+966', '551000001',
     '2000-01-01', 'Group Chief Executive',
     'King Fahd Road, Al-Malaz', NULL,
     'Riyadh', 'Riyadh Province', '11361', 'SA',
     'P-TK-0001', 'E-TK-0001', 'EN-TK-0001'),

    ('cc001000-0000-0000-0000-000000000002',
     'tksa.admin', 'Khalid', 'Al-Mansouri',
     'TKSA', 'LE-TKSA',
     'tksa.admin@technostat.demo', '+966551000002', '+966', '551000002',
     '2010-03-15', 'Group IT Manager',
     'Olaya District, King Fahd Rd', NULL,
     'Riyadh', 'Riyadh Province', '12244', 'SA',
     'P-TK-0002', 'E-TK-0002', 'EN-TK-0002'),

    (NULL,
     'nasser.alghamdi', 'Nasser', 'Al-Ghamdi',
     'TKSA', 'LE-TKSA',
     'nasser.alghamdi@technostat.demo', '+966551000003', '+966', '551000003',
     '2005-06-01', 'Finance Director',
     'Al-Woroud District', NULL,
     'Riyadh', 'Riyadh Province', '12214', 'SA',
     'P-TK-0003', 'E-TK-0003', 'EN-TK-0003'),

    -- ── SSK — SSK Saudi Operations (Riyadh, SA) ───────────────────────────────

    ('cc001000-0000-0000-0000-000000000003',
     'ssk.admin', 'Tariq', 'Al-Harbi',
     'SSK', 'LE-SSK',
     'ssk.admin@technostat.demo', '+966551000004', '+966', '551000004',
     '2017-06-01', 'Operations Manager',
     'Al-Naseem District', NULL,
     'Riyadh', 'Riyadh Province', '11564', 'SA',
     'P-TK-0004', 'E-TK-0004', 'EN-TK-0004'),

    (NULL,
     'fatimah.alzahrani', 'Fatimah', 'Al-Zahrani',
     'SSK', 'LE-SSK',
     'fatimah.alzahrani@technostat.demo', '+966551000005', '+966', '551000005',
     '2019-09-01', 'Project Manager',
     'Al-Murjan District', NULL,
     'Riyadh', 'Riyadh Province', '11532', 'SA',
     'P-TK-0005', 'E-TK-0005', 'EN-TK-0005'),

    (NULL,
     'khalid.alotaibi', 'Khalid', 'Al-Otaibi',
     'SSK', 'LE-SSK',
     'khalid.alotaibi@technostat.demo', '+966551000006', '+966', '551000006',
     '2020-01-15', 'Procurement Manager',
     'Al-Arid District', NULL,
     'Riyadh', 'Riyadh Province', '13211', 'SA',
     'P-TK-0006', 'E-TK-0006', 'EN-TK-0006'),

    -- ── TEGY — Technostat Egypt Operations (Cairo, EG) ────────────────────────

    ('cc001000-0000-0000-0000-000000000004',
     'tegy.admin', 'Ahmed', 'El-Sayed',
     'TEGY', 'LE-TEGY',
     'tegy.admin@technostat.demo', '+201012340001', '+20', '1012340001',
     '2018-09-20', 'Country Manager',
     '5th Settlement, New Cairo', NULL,
     'Cairo', 'Cairo Governorate', '11835', 'EG',
     'P-TK-0007', 'E-TK-0007', 'EN-TK-0007'),

    (NULL,
     'sara.mahmoud', 'Sara', 'Mahmoud',
     'TEGY', 'LE-TEGY',
     'sara.mahmoud@technostat.demo', '+201012340002', '+20', '1012340002',
     '2020-02-01', 'Finance Manager',
     'Maadi, Corniche El Nil', NULL,
     'Cairo', 'Cairo Governorate', '11431', 'EG',
     'P-TK-0008', 'E-TK-0008', 'EN-TK-0008'),

    (NULL,
     'mohd.nour', 'Mohamed', 'Nour',
     'TEGY', 'LE-TEGY',
     'mohd.nour@technostat.demo', '+201012340003', '+20', '1012340003',
     '2021-04-10', 'Operations Lead',
     'Nasr City, Mostafa El-Nahas St', NULL,
     'Cairo', 'Cairo Governorate', '11762', 'EG',
     'P-TK-0009', 'E-TK-0009', 'EN-TK-0009'),

    -- ── SDTX — Satellites Digital Transformation (Cairo, EG) ──────────────────

    ('cc001000-0000-0000-0000-000000000005',
     'sdtx.admin', 'Dina', 'Mostafa',
     'SDTX', 'LE-SDTX',
     'sdtx.admin@technostat.demo', '+201012340004', '+20', '1012340004',
     '2022-01-10', 'IT Director',
     'Heliopolis, El Nozha St', NULL,
     'Cairo', 'Cairo Governorate', '11841', 'EG',
     'P-TK-0010', 'E-TK-0010', 'EN-TK-0010'),

    (NULL,
     'youssef.ibrahim', 'Youssef', 'Ibrahim',
     'SDTX', 'LE-SDTX',
     'youssef.ibrahim@technostat.demo', '+201012340005', '+20', '1012340005',
     '2022-03-01', 'Senior Software Engineer',
     'Dokki, Tahrir Square Area', NULL,
     'Giza', 'Giza Governorate', '12311', 'EG',
     'P-TK-0011', 'E-TK-0011', 'EN-TK-0011'),

    (NULL,
     'nour.eldin', 'Nour', 'El-Din',
     'SDTX', 'LE-SDTX',
     'nour.eldin@technostat.demo', '+201012340006', '+20', '1012340006',
     '2022-06-15', 'Digital Transformation Lead',
     'Zamalek, 26th July Corridor', NULL,
     'Cairo', 'Cairo Governorate', '11211', 'EG',
     'P-TK-0012', 'E-TK-0012', 'EN-TK-0012');

    -- ══════════════════════════════════════════════════════════════════════════
    -- Main loop — person → employee → employment → address → contacts
    -- ══════════════════════════════════════════════════════════════════════════
    FOR rec IN SELECT * FROM tmp_tksa_people ORDER BY emp_number LOOP

        SELECT id INTO v_cc_id FROM master.company_code
        WHERE tenant_id = v_tid AND code = rec.company_code;

        SELECT id INTO v_le_id FROM master.legal_entity
        WHERE tenant_id = v_tid AND code = rec.le_code;

        IF v_cc_id IS NULL THEN
            RAISE WARNING '[016_technostat_people] company_code % not found — skipping %',
                rec.company_code, rec.p_code;
            CONTINUE;
        END IF;

        IF v_le_id IS NULL THEN
            RAISE WARNING '[016_technostat_people] legal_entity % not found — skipping %',
                rec.le_code, rec.p_code;
            CONTINUE;
        END IF;

        -- ── STAGE A: master.person ──────────────────────────────────────────
        INSERT INTO master.person (
            tenant_id, code, name, person_number,
            first_name, last_name, display_name,
            primary_email, primary_phone,
            status, created_by
        ) VALUES (
            v_tid,
            rec.p_code,
            rec.first_name || ' ' || rec.last_name,
            rec.person_number,
            rec.first_name, rec.last_name,
            rec.first_name || ' ' || rec.last_name,
            rec.work_email,
            rec.work_phone,
            'active', v_su
        )
        ON CONFLICT (tenant_id, code) DO UPDATE
            SET primary_email  = EXCLUDED.primary_email,
                primary_phone  = EXCLUDED.primary_phone,
                display_name   = EXCLUDED.display_name,
                updated_at     = now(),
                updated_by     = v_su;

        SELECT id INTO v_person_id FROM master.person
        WHERE tenant_id = v_tid AND code = rec.p_code;

        -- ── STAGE B: master.employee ────────────────────────────────────────
        INSERT INTO master.employee (
            tenant_id, code, name, employee_number,
            first_name, last_name, display_name,
            email, phone,
            principal_id, person_id,
            company_code_id,
            employment_type, title,
            hire_date, status, created_by
        ) VALUES (
            v_tid,
            'EMP-' || rec.p_code,
            rec.first_name || ' ' || rec.last_name,
            rec.emp_number,
            rec.first_name, rec.last_name,
            rec.first_name || ' ' || rec.last_name,
            rec.work_email,
            rec.work_phone,
            rec.principal_id,
            v_person_id,
            v_cc_id,
            'full_time',
            rec.title,
            rec.hire_date,
            'active', v_su
        )
        ON CONFLICT (tenant_id, code) DO UPDATE
            SET email           = EXCLUDED.email,
                phone           = EXCLUDED.phone,
                person_id       = EXCLUDED.person_id,
                principal_id    = EXCLUDED.principal_id,
                company_code_id = EXCLUDED.company_code_id,
                display_name    = EXCLUDED.display_name,
                title           = EXCLUDED.title,
                updated_at      = now(),
                updated_by      = v_su;

        SELECT id INTO v_emp_id FROM master.employee
        WHERE tenant_id = v_tid AND code = 'EMP-' || rec.p_code;

        -- ── STAGE C: master.employment ──────────────────────────────────────
        INSERT INTO master.employment (
            tenant_id, code, name, employment_number,
            person_id, employee_id,
            legal_entity_id, company_code_id,
            employment_type, employment_status,
            hire_date, status, created_by
        ) VALUES (
            v_tid,
            'EMPL-' || rec.p_code,
            rec.first_name || ' ' || rec.last_name || ' — Primary Employment',
            rec.empl_number,
            v_person_id, v_emp_id,
            v_le_id, v_cc_id,
            'full_time', 'active',
            rec.hire_date,
            'active', v_su
        )
        ON CONFLICT (tenant_id, code) DO UPDATE
            SET person_id       = EXCLUDED.person_id,
                employee_id     = EXCLUDED.employee_id,
                legal_entity_id = EXCLUDED.legal_entity_id,
                company_code_id = EXCLUDED.company_code_id,
                updated_at      = now(),
                updated_by      = v_su;

        -- ── STAGE D: master.address + master.address_link (home) ───────────
        v_addr_id := NULL;

        INSERT INTO master.address (
            tenant_id, name, address_type,
            line1, line2, city, region, postal_code, country_code,
            formatted_address, status, created_by
        ) VALUES (
            v_tid,
            rec.first_name || ' ' || rec.last_name || ' — Home',
            'residential',
            rec.home_line1, rec.home_line2,
            rec.home_city, rec.home_region, rec.home_postal, rec.home_country,
            CONCAT_WS(', ',
                rec.home_line1,
                NULLIF(rec.home_line2, ''),
                rec.home_city,
                rec.home_postal,
                rec.home_country
            ),
            'active', v_su
        )
        ON CONFLICT (tenant_id, country_code, postal_code, line1, city)
            WHERE (line1 IS NOT NULL) AND (postal_code IS NOT NULL) AND (status = 'active'::text)
        DO UPDATE SET name = EXCLUDED.name
        RETURNING id INTO v_addr_id;

        IF v_addr_id IS NULL THEN
            SELECT id INTO v_addr_id FROM master.address
            WHERE tenant_id    = v_tid
              AND country_code = rec.home_country
              AND postal_code  = rec.home_postal
              AND line1        = rec.home_line1
              AND city         = rec.home_city
              AND status       = 'active';
        END IF;

        INSERT INTO master.address_link (
            tenant_id, owner_type, owner_id, address_id,
            purpose, is_primary, effective_from, created_by
        ) VALUES (
            v_tid, 'employee', v_emp_id, v_addr_id,
            'correspondence', true, rec.hire_date, v_su
        )
        ON CONFLICT (tenant_id, owner_type, owner_id, purpose, role_qualifier, address_id) DO NOTHING;

        -- ── STAGE E: work email ─────────────────────────────────────────────
        v_cl_id := NULL;

        INSERT INTO master.contact_link (
            tenant_id, owner_type, owner_id,
            channel_type, value, purpose,
            is_primary, is_verified, verified_at,
            status, created_by
        ) VALUES (
            v_tid, 'employee', v_emp_id,
            'email', rec.work_email, 'notification',
            true, true, now(),
            'active', v_su
        )
        ON CONFLICT (tenant_id, owner_type, owner_id, channel_type, value, purpose, role_qualifier) DO NOTHING;

        SELECT id INTO v_cl_id FROM master.contact_link
        WHERE tenant_id    = v_tid
          AND owner_type   = 'employee'
          AND owner_id     = v_emp_id
          AND channel_type = 'email'
          AND value        = rec.work_email
          AND purpose      = 'notification';

        INSERT INTO master.contact_email (
            tenant_id, contact_link_id,
            local_part, domain, mx_valid, created_by
        ) VALUES (
            v_tid, v_cl_id,
            split_part(rec.work_email, '@', 1),
            split_part(rec.work_email, '@', 2),
            true, v_su
        )
        ON CONFLICT (tenant_id, contact_link_id) DO NOTHING;

        -- ── STAGE F: work phone ─────────────────────────────────────────────
        v_cl_id := NULL;

        INSERT INTO master.contact_link (
            tenant_id, owner_type, owner_id,
            channel_type, value, purpose,
            is_primary, is_verified, verified_at,
            status, created_by
        ) VALUES (
            v_tid, 'employee', v_emp_id,
            'phone', rec.work_phone, 'notification',
            true, true, now(),
            'active', v_su
        )
        ON CONFLICT (tenant_id, owner_type, owner_id, channel_type, value, purpose, role_qualifier) DO NOTHING;

        SELECT id INTO v_cl_id FROM master.contact_link
        WHERE tenant_id    = v_tid
          AND owner_type   = 'employee'
          AND owner_id     = v_emp_id
          AND channel_type = 'phone'
          AND value        = rec.work_phone
          AND purpose      = 'notification';

        INSERT INTO master.contact_phone (
            tenant_id, contact_link_id,
            e164, calling_code, national_number, line_type, created_by
        ) VALUES (
            v_tid, v_cl_id,
            rec.work_phone, ltrim(rec.phone_cc, '+'), rec.phone_national,
            'mobile', v_su
        )
        ON CONFLICT (tenant_id, contact_link_id) DO NOTHING;

    END LOOP;

    RAISE NOTICE '[016_technostat_people] 12 persons + employees + employments + home addresses + work contacts seeded';

END $tksa_people$;
