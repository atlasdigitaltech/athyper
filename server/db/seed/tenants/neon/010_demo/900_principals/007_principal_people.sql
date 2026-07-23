-- ============================================================================
-- DEMO PRINCIPALS — PERSON / EMPLOYEE / EMPLOYMENT + ADDRESS & CONTACTS
-- ============================================================================
-- File:     007_principal_people.sql
-- Schemas:  master.person, master.employee, master.employment,
--           master.address, master.address_link,
--           master.contact_link, master.contact_email, master.contact_phone
-- Purpose:  Create person + employee + employment records for all 21 demo
--           principals (17 athq-series + 4 named athyper/ATHQ users).
--           Each employee also receives:
--             • a home address + address_link  (owner_type = 'employee', purpose = 'correspondence')
--             • a work email contact_link + contact_email  (purpose = 'notification')
--             • a work phone contact_link + contact_phone  (purpose = 'notification')
-- Depends:  001_demo_principals.sql, 005_named_tenant_principals.sql,
--           100_org_structure/200_demo_legal_entities.sql,
--           100_org_structure/199_gl_preseed.sql (company_code rows)
-- Idempotent: Yes — ON CONFLICT DO NOTHING / DO UPDATE throughout
-- ============================================================================

DO $demo_people$
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
    WHERE realm_key = 'athyper' AND code = 'athyper';

    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[007_principal_people] Athyper tenant not found';
    END IF;

    PERFORM set_config('app.current_principal_id', v_su::text, true);

    -- ──────────────────────────────────────────────────────────────────────────
    -- Working dataset — one row per demo principal
    -- ──────────────────────────────────────────────────────────────────────────
    CREATE TEMP TABLE tmp_demo_people (
        principal_id    uuid     NOT NULL,
        p_code          text     NOT NULL,   -- shared code suffix for person & employee
        first_name      text     NOT NULL,
        last_name       text     NOT NULL,
        company_code    text     NOT NULL,   -- master.company_code.code
        le_code         text     NOT NULL,   -- master.legal_entity.code
        work_email      text     NOT NULL,
        work_phone      text     NOT NULL,   -- E.164
        phone_cc        text     NOT NULL,   -- calling code with + prefix
        phone_national  text     NOT NULL,   -- national number digits only
        hire_date       date     NOT NULL,
        title           text,
        home_line1      text     NOT NULL,
        home_line2      text,
        home_city       text     NOT NULL,
        home_region     text,
        home_postal     text     NOT NULL,
        home_country    char(2)  NOT NULL,
        person_number   text     NOT NULL,
        emp_number      text     NOT NULL,
        empl_number     text     NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO tmp_demo_people VALUES

    -- ── 17 Demo series  (aa001000-…) ─────────────────────────────────────────

    -- athq.viewer
    ('aa001000-0000-0000-0000-000000000001',
     'athq.viewer',    'ATHQ',    'Viewer',
     'ATHQ', 'LE-ATHQ',
     'athq.viewer@athyper.com',    '+60121001001', '+60', '121001001',
     '2023-01-15', 'Business Analyst',
     'Unit 15-A, Mont Kiara Palma', 'Jalan Kiara',
     'Kuala Lumpur', 'Federal Territory of KL', '50480', 'MY',
     'P-0001', 'E-0001', 'EN-0001'),

    -- athq.reporter
    ('aa001000-0000-0000-0000-000000000002',
     'athq.reporter',  'ATHQ',    'Reporter',
     'ATHQ', 'LE-ATHQ',
     'athq.reporter@athyper.com',  '+60121001002', '+60', '121001002',
     '2022-03-10', 'Finance Analyst',
     'Suite 8-C, Bangsar South',   'Jalan Kerinchi',
     'Kuala Lumpur', 'Federal Territory of KL', '59200', 'MY',
     'P-0002', 'E-0002', 'EN-0002'),

    -- athq.requester
    ('aa001000-0000-0000-0000-000000000003',
     'athq.requester', 'ATHQ',    'Requester',
     'ATHQ', 'LE-ATHQ',
     'athq.requester@athyper.com', '+60121001003', '+60', '121001003',
     '2021-07-05', 'Procurement Officer',
     '3A-12, The Pavilion Residences', 'Bukit Bintang',
     'Kuala Lumpur', 'Federal Territory of KL', '55100', 'MY',
     'P-0003', 'E-0003', 'EN-0003'),

    -- athq.agent
    ('aa001000-0000-0000-0000-000000000004',
     'athq.agent',     'ATHQ',    'Agent',
     'ATHQ', 'LE-ATHQ',
     'athq.agent@athyper.com',     '+60121001004', '+60', '121001004',
     '2021-02-20', 'Senior Procurement Officer',
     '20-05, Damansara Utama',     NULL,
     'Petaling Jaya', 'Selangor', '47400', 'MY',
     'P-0004', 'E-0004', 'EN-0004'),

    -- athq.manager
    ('aa001000-0000-0000-0000-000000000005',
     'athq.manager',   'ATHQ',    'Manager',
     'ATHQ', 'LE-ATHQ',
     'athq.manager@athyper.com',   '+60121001005', '+60', '121001005',
     '2019-08-12', 'Group Operations Manager',
     'Lot 22, Damansara Heights',  'Bukit Damansara',
     'Kuala Lumpur', 'Federal Territory of KL', '50490', 'MY',
     'P-0005', 'E-0005', 'EN-0005'),

    -- athq.owner
    ('aa001000-0000-0000-0000-000000000006',
     'athq.owner',     'ATHQ',    'Owner',
     'ATHQ', 'LE-ATHQ',
     'athq.owner@athyper.com',     '+60121001006', '+60', '121001006',
     '2018-04-01', 'Group Director',
     '8A Jalan Duta',              'Bukit Tunku',
     'Kuala Lumpur', 'Federal Territory of KL', '50480', 'MY',
     'P-0006', 'E-0006', 'EN-0006'),

    -- athq.admin
    ('aa001000-0000-0000-0000-000000000007',
     'athq.admin',     'ATHQ',    'Admin',
     'ATHQ', 'LE-ATHQ',
     'athq.admin@athyper.com',     '+60121001007', '+60', '121001007',
     '2020-01-06', 'System Administrator',
     'A-10-5, The Rainz',          'Bukit Jalil',
     'Kuala Lumpur', 'Federal Territory of KL', '57000', 'MY',
     'P-0007', 'E-0007', 'EN-0007'),

    -- aqtu.manager
    ('aa001000-0000-0000-0000-000000000008',
     'aqtu.manager',   'AQTU',    'Manager',
     'AQTU', 'LE-AQTU',
     'aqtu.manager@athyper.com',   '+97455100001', '+974', '55100001',
     '2019-05-15', 'Qatar Utilities Manager',
     'Villa 24, Al Waab Street',   'West Bay Lagoon',
     'Doha', 'Baladiyat ad Dawhah', '28288', 'QA',
     'P-0008', 'E-0008', 'EN-0008'),

    -- asac.manager
    ('aa001000-0000-0000-0000-000000000009',
     'asac.manager',   'ASAC',    'Manager',
     'ASAC', 'LE-ASAC',
     'asac.manager@athyper.com',   '+966501100001', '+966', '501100001',
     '2020-03-20', 'Saudi Construction Manager',
     'Villa 15, Al Malqa District', NULL,
     'Riyadh', 'Riyadh Province', '13521', 'SA',
     'P-0009', 'E-0009', 'EN-0009'),

    -- auic.manager
    ('aa001000-0000-0000-0000-00000000000a',
     'auic.manager',   'AUIC',    'Manager',
     'AUIC', 'LE-AUIC',
     'auic.manager@athyper.com',   '+12125057100', '+1', '2125057100',
     '2019-11-01', 'US InfoComm Manager',
     '245 West 107th Street',      'Apt 8E',
     'New York', 'New York', '10025', 'US',
     'P-0010', 'E-0010', 'EN-0010'),

    -- asgf.manager
    ('aa001000-0000-0000-0000-00000000000b',
     'asgf.manager',   'ASGF',    'Manager',
     'ASGF', 'LE-ASGF',
     'asgf.manager@athyper.com',   '+6591001001', '+65', '91001001',
     '2020-06-01', 'Singapore Financial Manager',
     'Block 18 Bishan Street 23',  '#12-44',
     'Singapore', 'Central Region', '579769', 'SG',
     'P-0011', 'E-0011', 'EN-0011'),

    -- athq.cfo
    ('aa001000-0000-0000-0000-00000000000c',
     'athq.cfo',       'ATHQ',    'CFO',
     'ATHQ', 'LE-ATHQ',
     'athq.cfo@athyper.com',       '+60121001012', '+60', '121001012',
     '2017-09-01', 'Chief Financial Officer',
     '18 Jalan Maarof',            'Bangsar',
     'Kuala Lumpur', 'Federal Territory of KL', '59000', 'MY',
     'P-0012', 'E-0012', 'EN-0012'),

    -- partner.viewer
    ('aa001000-0000-0000-0000-00000000000d',
     'partner.viewer', 'Partner', 'Viewer',
     'ATHQ', 'LE-ATHQ',
     'partner.viewer@athyper.com', '+60121001013', '+60', '121001013',
     '2022-09-01', 'Partner Coordinator',
     '15-3A, i-City',              'Section 7',
     'Shah Alam', 'Selangor', '40150', 'MY',
     'P-0013', 'E-0013', 'EN-0013'),

    -- partner.agent
    ('aa001000-0000-0000-0000-00000000000e',
     'partner.agent',  'Partner', 'Agent',
     'ATHQ', 'LE-ATHQ',
     'partner.agent@athyper.com',  '+60121001014', '+60', '121001014',
     '2021-11-15', 'Partner Associate',
     'B-3-8, Sunway Velocity',     'Cheras',
     'Kuala Lumpur', 'Federal Territory of KL', '56000', 'MY',
     'P-0014', 'E-0014', 'EN-0014'),

    -- partner.manager
    ('aa001000-0000-0000-0000-00000000000f',
     'partner.manager','Partner', 'Manager',
     'ATHQ', 'LE-ATHQ',
     'partner.manager@athyper.com','+60121001015', '+60', '121001015',
     '2020-08-10', 'Partner Manager',
     '22A Jalan Ampang',           'Ampang Hilir',
     'Kuala Lumpur', 'Federal Territory of KL', '55000', 'MY',
     'P-0015', 'E-0015', 'EN-0015'),

    -- partner.owner
    ('aa001000-0000-0000-0000-000000000010',
     'partner.owner',  'Partner', 'Owner',
     'ATHQ', 'LE-ATHQ',
     'partner.owner@athyper.com',  '+60121001016', '+60', '121001016',
     '2019-02-01', 'Partner Director',
     'Lot 7, Bukit Damansara',     NULL,
     'Kuala Lumpur', 'Federal Territory of KL', '50490', 'MY',
     'P-0016', 'E-0016', 'EN-0016'),

    -- karim.dual
    ('aa001000-0000-0000-0000-000000000011',
     'karim.dual',     'Karim',   'Dual',
     'ATHQ', 'LE-ATHQ',
     'karim.dual@athyper.com',     '+60121001017', '+60', '121001017',
     '2020-04-15', 'Senior Manager',
     'A-22-5, Setia Sky Residences', 'Jalan Raja Muda Abdul Aziz',
     'Kuala Lumpur', 'Federal Territory of KL', '50300', 'MY',
     'P-0017', 'E-0017', 'EN-0017'),

    -- ── 4 Named users  (aa000001-…) ──────────────────────────────────────────

    -- kumar
    ('aa000001-0000-0000-0000-000000000001',
     'kumar',          'Kumar',   'Rajan',
     'ATHQ', 'LE-ATHQ',
     'kumar@athyper.com',          '+60121001018', '+60', '121001018',
     '2019-06-01', 'Finance Manager',
     '12-B, Menara Duta',          'Dutamas',
     'Kuala Lumpur', 'Federal Territory of KL', '50480', 'MY',
     'P-0018', 'E-0018', 'EN-0018'),

    -- raja
    ('aa000001-0000-0000-0000-000000000002',
     'raja',           'Raja',    'Krishnan',
     'ATHQ', 'LE-ATHQ',
     'raja@athyper.com',           '+60121001019', '+60', '121001019',
     '2020-09-14', 'Accounts Manager',
     'C-15-3, Pearl Suria',        'Old Klang Road',
     'Kuala Lumpur', 'Federal Territory of KL', '58200', 'MY',
     'P-0019', 'E-0019', 'EN-0019'),

    -- rama
    ('aa000001-0000-0000-0000-000000000003',
     'rama',           'Rama',    'Subramaniam',
     'ATHQ', 'LE-ATHQ',
     'rama@athyper.com',           '+60121001020', '+60', '121001020',
     '2021-03-22', 'Treasury Analyst',
     '8A-12, Sri Duta',            'Ampang',
     'Kuala Lumpur', 'Federal Territory of KL', '68000', 'MY',
     'P-0020', 'E-0020', 'EN-0020'),

    -- laks
    ('aa000001-0000-0000-0000-000000000004',
     'laks',           'Lakshmi', 'Narayanan',
     'ATHQ', 'LE-ATHQ',
     'laks@athyper.com',           '+60121001021', '+60', '121001021',
     '2022-02-07', 'Financial Controller',
     '30A Jalan Tun Hussein',      'Taman Tun Dr Ismail',
     'Kuala Lumpur', 'Federal Territory of KL', '60000', 'MY',
     'P-0021', 'E-0021', 'EN-0021');

    -- ══════════════════════════════════════════════════════════════════════════
    -- Main loop — process one principal at a time
    -- Order: person → employee → employment → address → contacts
    -- ══════════════════════════════════════════════════════════════════════════
    FOR rec IN SELECT * FROM tmp_demo_people ORDER BY emp_number LOOP

        -- ── Resolve company code + legal entity ────────────────────────────────
        SELECT id INTO v_cc_id FROM master.company_code
        WHERE tenant_id = v_tid AND code = rec.company_code;

        SELECT id INTO v_le_id FROM master.legal_entity
        WHERE tenant_id = v_tid AND code = rec.le_code;

        IF v_cc_id IS NULL THEN
            RAISE WARNING '[007_principal_people] company_code % not found — skipping %',
                rec.company_code, rec.p_code;
            CONTINUE;
        END IF;

        IF v_le_id IS NULL THEN
            RAISE WARNING '[007_principal_people] legal_entity % not found — skipping %',
                rec.le_code, rec.p_code;
            CONTINUE;
        END IF;

        -- ── STAGE A: master.person ──────────────────────────────────────────────
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

        -- ── STAGE B: master.employee ────────────────────────────────────────────
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
                company_code_id = EXCLUDED.company_code_id,
                display_name    = EXCLUDED.display_name,
                title           = EXCLUDED.title,
                updated_at      = now(),
                updated_by      = v_su;

        SELECT id INTO v_emp_id FROM master.employee
        WHERE tenant_id = v_tid AND code = 'EMP-' || rec.p_code;

        -- ── STAGE C: master.employment ──────────────────────────────────────────
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

        -- ── STAGE D: master.address + master.address_link (home) ───────────────
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
            WHERE tenant_id = v_tid AND country_code = rec.home_country
              AND postal_code = rec.home_postal
              AND line1       = rec.home_line1
              AND city        = rec.home_city
              AND status      = 'active';
        END IF;

        INSERT INTO master.address_link (
            tenant_id, owner_type, owner_id, address_id,
            purpose, is_primary, effective_from, created_by
        ) VALUES (
            v_tid, 'employee', v_emp_id, v_addr_id,
            'correspondence', true, rec.hire_date, v_su
        )
        ON CONFLICT (tenant_id, owner_type, owner_id, purpose, role_qualifier, address_id) DO NOTHING;

        -- ── STAGE E: work email ─────────────────────────────────────────────────
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
        WHERE tenant_id  = v_tid
          AND owner_type = 'employee'
          AND owner_id   = v_emp_id
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

        -- ── STAGE F: work phone ─────────────────────────────────────────────────
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
        WHERE tenant_id  = v_tid
          AND owner_type = 'employee'
          AND owner_id   = v_emp_id
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

    RAISE NOTICE '[007_principal_people] 21 persons + employees + employments + home addresses + work contacts seeded';

END $demo_people$;
