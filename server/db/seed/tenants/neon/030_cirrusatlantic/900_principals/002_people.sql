-- ============================================================================
-- CIRRUSATLANTIC — PEOPLE (PERSON / EMPLOYEE / EMPLOYMENT + ADDRESS & CONTACTS)
-- ============================================================================
-- File:     002_people.sql
-- Schemas:  master.person, master.employee, master.employment,
--           master.address, master.address_link,
--           master.contact_link, master.contact_email, master.contact_phone
-- Purpose:  Seed 8 employees for the CATL company code.
--           3 rows are linked to existing CirrusAtlantic principals (aa003000-…).
--           5 rows are HR-only records with no platform login.
--           Each employee receives:
--             • a home address + address_link  (owner_type='employee', purpose='correspondence')
--             • a work email contact_link + contact_email  (purpose='notification')
--             • a work phone contact_link + contact_phone  (purpose='notification')
-- Depends:  000_tenant.sql, 100_org_structure/200_legal_entities.sql,
--           900_principals/001_principals.sql
--             → tenant 'cirrusatlantic'
--             → legal entity:   CATL  (id: dd000030-0000-0000-0000-000000000001)
--             → company code:   CATL  (id: ee000030-0000-0000-0000-000000000001)
--             → principals:     aa003000-…-000001 (catl.admin)
--                               aa003000-…-000002 (catl.owner)
--                               aa003000-…-000003 (catl.finance)
-- Numbering:
--   person_number     P-CA-0001 … P-CA-0008
--   employee_number   E-CA-0001 … E-CA-0008
--   employment_number EN-CA-0001 … EN-CA-0008
-- Idempotent: Yes — ON CONFLICT DO NOTHING / DO UPDATE throughout
-- ============================================================================

DO $catl_people$
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
    WHERE realm_key = 'athyper' AND code = 'cirrusatlantic';

    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[002_people] CirrusAtlantic tenant not found';
    END IF;

    PERFORM set_config('app.current_principal_id', v_su::text, true);

    -- ──────────────────────────────────────────────────────────────────────────
    -- Working dataset — one row per employee
    -- ──────────────────────────────────────────────────────────────────────────
    CREATE TEMP TABLE tmp_catl_people (
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

    INSERT INTO tmp_catl_people VALUES

    -- ── CATL — CirrusAtlantic Ltd (London, GB) ────────────────────────────────

    -- Principal-linked: catl.owner → James Whitfield
    ('aa003000-0000-0000-0000-000000000002',
     'catl.owner', 'James', 'Whitfield',
     'CATL', 'CATL',
     'owner@cirrusatlantic.com', '+447700900101', '+44', '7700900101',
     '2015-04-01', 'Chief Executive Officer',
     '15 Kensington Gardens', NULL,
     'London', NULL, 'W8 4PT', 'GB',
     'P-CA-0001', 'E-CA-0001', 'EN-CA-0001'),

    -- Principal-linked: catl.admin → Rebecca Clarke
    ('aa003000-0000-0000-0000-000000000001',
     'catl.admin', 'Rebecca', 'Clarke',
     'CATL', 'CATL',
     'admin@cirrusatlantic.com', '+447700900102', '+44', '7700900102',
     '2018-01-15', 'IT Systems Administrator',
     '7 Canada Square, Canary Wharf', NULL,
     'London', NULL, 'E14 5AA', 'GB',
     'P-CA-0002', 'E-CA-0002', 'EN-CA-0002'),

    -- Principal-linked: catl.finance → Simon Fletcher
    ('aa003000-0000-0000-0000-000000000003',
     'catl.finance', 'Simon', 'Fletcher',
     'CATL', 'CATL',
     'finance@cirrusatlantic.com', '+447700900103', '+44', '7700900103',
     '2016-07-01', 'Finance Director',
     '42 Chelsea Bridge Road', NULL,
     'London', NULL, 'SW1W 8PW', 'GB',
     'P-CA-0003', 'E-CA-0003', 'EN-CA-0003'),

    -- HR-only: Emma Hartley
    (NULL,
     'emma.hartley', 'Emma', 'Hartley',
     'CATL', 'CATL',
     'emma.hartley@cirrusatlantic.com', '+447700900104', '+44', '7700900104',
     '2019-03-01', 'Senior Software Developer',
     '23 Brixton Hill', NULL,
     'London', NULL, 'SW2 1NE', 'GB',
     'P-CA-0004', 'E-CA-0004', 'EN-CA-0004'),

    -- HR-only: Oliver Blackwood
    (NULL,
     'oliver.blackwood', 'Oliver', 'Blackwood',
     'CATL', 'CATL',
     'oliver.blackwood@cirrusatlantic.com', '+447700900105', '+44', '7700900105',
     '2020-06-15', 'Project Manager',
     '8 Battersea Rise', NULL,
     'London', NULL, 'SW11 1HG', 'GB',
     'P-CA-0005', 'E-CA-0005', 'EN-CA-0005'),

    -- HR-only: Sophie Chambers
    (NULL,
     'sophie.chambers', 'Sophie', 'Chambers',
     'CATL', 'CATL',
     'sophie.chambers@cirrusatlantic.com', '+447700900106', '+44', '7700900106',
     '2021-01-04', 'HR Manager',
     '3 Shoreditch High Street', NULL,
     'London', NULL, 'E1 6JE', 'GB',
     'P-CA-0006', 'E-CA-0006', 'EN-CA-0006'),

    -- HR-only: Lucas Pembrook
    (NULL,
     'lucas.pembrook', 'Lucas', 'Pembrook',
     'CATL', 'CATL',
     'lucas.pembrook@cirrusatlantic.com', '+447700900107', '+44', '7700900107',
     '2021-09-01', 'Cloud Architect',
     '11 Clerkenwell Road', NULL,
     'London', NULL, 'EC1M 5PA', 'GB',
     'P-CA-0007', 'E-CA-0007', 'EN-CA-0007'),

    -- HR-only: Diana Thorpe
    (NULL,
     'diana.thorpe', 'Diana', 'Thorpe',
     'CATL', 'CATL',
     'diana.thorpe@cirrusatlantic.com', '+447700900108', '+44', '7700900108',
     '2022-02-14', 'Business Analyst',
     '5 Tottenham Court Road', NULL,
     'London', NULL, 'W1T 1BJ', 'GB',
     'P-CA-0008', 'E-CA-0008', 'EN-CA-0008');

    -- ══════════════════════════════════════════════════════════════════════════
    -- Main loop — person → employee → employment → address → contacts
    -- ══════════════════════════════════════════════════════════════════════════
    FOR rec IN SELECT * FROM tmp_catl_people ORDER BY emp_number LOOP

        SELECT id INTO v_cc_id FROM master.company_code
        WHERE tenant_id = v_tid AND code = rec.company_code;

        SELECT id INTO v_le_id FROM master.legal_entity
        WHERE tenant_id = v_tid AND code = rec.le_code;

        IF v_cc_id IS NULL THEN
            RAISE WARNING '[002_people] company_code % not found — skipping %',
                rec.company_code, rec.p_code;
            CONTINUE;
        END IF;

        IF v_le_id IS NULL THEN
            RAISE WARNING '[002_people] legal_entity % not found — skipping %',
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

    RAISE NOTICE '[002_people] 8 persons + employees + employments + home addresses + work contacts seeded';

END $catl_people$;
