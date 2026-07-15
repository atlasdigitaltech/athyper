-- ============================================================================
-- ATHYPER --- TENANT / LEGAL ENTITY / COMPANY / SITE ADDRESS & CONTACT WIRES
-- ============================================================================
-- File:     306_address_contacts.sql
-- Purpose:  Replace tenant, legal-entity, company-code, and all active site
--           address/contact wiring for Athyper demo data.
-- Depends:  000_tenant.sql, 100_org_structure/200_demo_legal_entities.sql,
--           100_org_structure/201_athyper_subsidiaries.sql,
--           100_org_structure/303_sites.sql
--
-- The script performs a clean refresh for all scoped owners so old demo mappings
-- are replaced by the new matrix-driven setup.
-- Master address links for tenant/legal_entity/company_code/site use only
-- purpose = 'default'. Document roles are resolved at document selection time.
-- ============================================================================

DO $athyper_addr$
DECLARE
    v_su        uuid := '00000000-0000-0000-0000-000000000000';
    v_now       timestamptz := now();
    v_tid       uuid;

    v_le_id     uuid;
    v_cc_id     uuid;

    v_addr_id   uuid;
    v_cc_addr_id uuid;
    v_site_id   uuid;
    v_site_ids  uuid[];
    v_site_count int;
    v_missing_site_address_links int := 0;
    v_missing_site_email_links int := 0;
    v_missing_site_phone_links int := 0;

    v_cl_id     uuid;
    v_row       record;

    v_total_entities int := 0;
    v_seeded_entities int := 0;
    v_missing_entities int := 0;
    v_site_links_target int := 0;
    v_site_links_seeded int := 0;

    v_idx int;
    v_addr_attention text;
    v_addr_line3 text;

    v_le_email_local text;
    v_cc_email_local text;
    v_le_phone_national text;
    v_cc_phone_national text;
    v_site_email_local text;
    v_site_phone_national text;
    v_site_attention text;
BEGIN

    SELECT id INTO v_tid
    FROM master.tenant
    WHERE realm_key = 'athyper' AND code = 'athyper';

    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[306_address_contacts] Tenant athyper not found';
    END IF;

    -- =========================================================================
    -- Tenant (single source address + support contacts)
    -- =========================================================================

    DELETE FROM master.contact_email ce
    USING master.contact_link cl
    WHERE ce.tenant_id = v_tid
      AND ce.contact_link_id = cl.id
      AND cl.tenant_id = v_tid
      AND cl.owner_type = 'tenant'
      AND cl.owner_id = v_tid;

    DELETE FROM master.contact_phone cp
    USING master.contact_link cl
    WHERE cp.tenant_id = v_tid
      AND cp.contact_link_id = cl.id
      AND cl.tenant_id = v_tid
      AND cl.owner_type = 'tenant'
      AND cl.owner_id = v_tid;

    DELETE FROM master.contact_link
    WHERE tenant_id = v_tid
      AND owner_type = 'tenant'
      AND owner_id = v_tid;

    DELETE FROM master.address_link
    WHERE tenant_id = v_tid
      AND owner_type = 'tenant'
      AND owner_id = v_tid;

    INSERT INTO master.address (
        tenant_id, code, name, address_type, attention_line,
        line1, line2, line3, city, region, postal_code, country_code,
        formatted_address, status, created_by
    )
    VALUES (
        v_tid, 'athyper-tenant-hq', 'Athyper Group Headquarters', 'commercial',
        'Corporate Operations, Athyper Group',
        'Level 14, Gate District 4', 'Dubai International Financial Centre', 'Tower B, 4th Floor',
        'Dubai', 'Dubai Emirate', '507135', 'AE',
        'Corporate Operations, Athyper Group, Level 14, Gate District 4, Dubai International Financial Centre, Tower B, 4th Floor, Dubai 507135, United Arab Emirates',
        'active', v_su
    )
    ON CONFLICT (tenant_id, country_code, postal_code, line1, city)
        WHERE (line1 IS NOT NULL) AND (postal_code IS NOT NULL) AND (status = 'active'::text)
    DO UPDATE SET
        name = EXCLUDED.name,
        attention_line = EXCLUDED.attention_line,
        line2 = EXCLUDED.line2,
        line3 = EXCLUDED.line3,
        region = EXCLUDED.region,
        formatted_address = EXCLUDED.formatted_address,
        updated_at = now()
    RETURNING id INTO v_addr_id;

    INSERT INTO master.address_link (
        tenant_id, owner_type, owner_id, address_id, purpose, role_qualifier, is_primary, created_by
    ) VALUES (
        v_tid, 'tenant', v_tid, v_addr_id, 'default', NULL, true, v_su
    )
    ON CONFLICT (tenant_id, owner_type, owner_id, purpose, address_id) DO NOTHING;

    INSERT INTO master.contact_link (
        tenant_id, owner_type, owner_id, channel_type, value,
        code, name, purpose, is_primary, is_verified, verified_at, status, created_by
    )
    VALUES (
        v_tid, 'tenant', v_tid, 'email', 'info@athyper.com',
        'tenant-support-email', 'Tenant Support Email',
        'default', true, true, v_now, 'active', v_su
    )
    ON CONFLICT (tenant_id, owner_type, owner_id, channel_type, value, purpose, role_qualifier)
    DO NOTHING;

    INSERT INTO master.contact_link (
        tenant_id, owner_type, owner_id, channel_type, value,
        code, name, purpose, is_primary, is_verified, verified_at, status, created_by
    )
    VALUES (
        v_tid, 'tenant', v_tid, 'phone', '+97145015555',
        'tenant-support-phone', 'Tenant Support Phone',
        'default', true, true, v_now, 'active', v_su
    )
    ON CONFLICT (tenant_id, owner_type, owner_id, channel_type, value, purpose, role_qualifier)
    DO NOTHING;

    SELECT id INTO v_cl_id
    FROM master.contact_link
    WHERE tenant_id = v_tid AND owner_type = 'tenant' AND owner_id = v_tid
      AND channel_type = 'email' AND value = 'info@athyper.com'
      AND purpose = 'default';

    INSERT INTO master.contact_email (
        tenant_id, contact_link_id, local_part, domain, mx_valid, created_by
    ) VALUES (
        v_tid, v_cl_id, 'info', 'athyper.com', true, v_su
    )
    ON CONFLICT (tenant_id, contact_link_id) DO NOTHING;

    SELECT id INTO v_cl_id
    FROM master.contact_link
    WHERE tenant_id = v_tid AND owner_type = 'tenant' AND owner_id = v_tid
      AND channel_type = 'phone' AND value = '+97145015555'
      AND purpose = 'default';

    INSERT INTO master.contact_phone (
        tenant_id, contact_link_id, e164, calling_code, national_number,
        line_type, created_by
    ) VALUES (
        v_tid, v_cl_id, '+97145015555', '971', '45015555', 'landline', v_su
    )
    ON CONFLICT (tenant_id, contact_link_id) DO NOTHING;

    CREATE TEMP TABLE tmp_entity_site_profile (
        legal_entity_code text NOT NULL,
        company_code text NOT NULL,
        company_name text NOT NULL,
        addr_name text NOT NULL,
        addr_line1 text NOT NULL,
        addr_line2 text,
        addr_city text NOT NULL,
        addr_region text NOT NULL,
        addr_postal text NOT NULL,
        addr_country char(2) NOT NULL,
        calling_code text NOT NULL,
        site_bill_to_count int NOT NULL DEFAULT 1,
        site_ship_to_count int NOT NULL DEFAULT 1,
        site_bill_to_company_count int NOT NULL DEFAULT 1,
        site_ship_to_company_count int NOT NULL DEFAULT 1
    ) ON COMMIT DROP;

    INSERT INTO tmp_entity_site_profile (
        legal_entity_code, company_code, company_name,
        addr_name, addr_line1, addr_line2,
        addr_city, addr_region, addr_postal, addr_country, calling_code,
        site_bill_to_count, site_ship_to_count,
        site_bill_to_company_count, site_ship_to_company_count
    ) VALUES
    ('LE-ATHQ', 'ATHQ', 'Athyper Group Holdings',
     'Athyper Group Holdings', 'Level 38, Petronas Twin Tower 2', 'KLCC, Jalan Ampang',
     'Kuala Lumpur', 'Federal Territory of Kuala Lumpur', '50088', 'MY', '60',
     1, 1, 1, 1),
    ('LE-AMRE', 'AMRE', 'Athyper Malaysia Real Estate',
     'Athyper Malaysia Real Estate', 'Suite 1203, 1 First Avenue', 'Bandar Utama',
     'Kuala Lumpur', 'Federal Territory of Kuala Lumpur', '47800', 'MY', '60',
     1, 1, 1, 1),
    ('LE-AQTU', 'AQTU', 'Athyper Qatar Utilities',
     'Athyper Qatar Utilities', 'West Bay Business Park, Tower 1', 'P.O. Box 22119',
     'Doha', 'Ad Dawhah', '22119', 'QA', '974',
     1, 1, 1, 1),
    ('LE-ASAC', 'ASAC', 'Athyper Saudi Construction',
     'Athyper Saudi Construction', 'King Fahd District, P.O. Box 9025', 'Riyadh Office Quarter',
     'Riyadh', 'Riyadh Province', '11413', 'SA', '966',
     1, 2, 1, 1),
    ('LE-AQTS', 'AQTS', 'Athyper Qatar Transport & Storage',
     'Athyper Qatar Transport & Storage', 'Al Muntazah District, P.O. Box 9845', 'Doha Logistics District',
     'Doha', 'Ad Dawhah', '9845', 'QA', '974',
     1, 2, 1, 1),
    ('LE-AUET', 'AUET', 'Athyper UAE Trading',
     'Athyper UAE Trading', 'Dubai Airport Free Zone, Office 3W-110', 'Jebel Ali Logistics Corridor',
     'Dubai', 'Dubai Emirate', '54000', 'AE', '971',
     1, 5, 1, 1),
    ('LE-ASAH', 'ASAH', 'Athyper Saudi Hospitality',
     'Athyper Saudi Hospitality', 'Olaya Road, P.O. Box 12345', 'Al Mursalat District',
     'Riyadh', 'Riyadh Province', '11372', 'SA', '966',
     2, 5, 1, 1),
    ('LE-AUIC', 'AUIC', 'Athyper US Information & Communication',
     'Athyper US Information & Communication', '1407 Broadway, Suite 1700', 'New York New City',
     'New York', 'New York', '10018', 'US', '1',
     1, 1, 1, 1),
    ('LE-ASGF', 'ASGF', 'Athyper Singapore Financial Services',
     'Athyper Singapore Financial Services', '1 Raffles Place, #44-01', 'Marina Bay Financial Centre',
     'Singapore', 'Central Region', '048616', 'SG', '65',
     1, 1, 1, 1),
    ('LE-AITM', 'AITM', 'Athyper India Textile & Leather Mfg',
     'Athyper India Textile & Leather Mfg', '701 Maker Chambers IV, Nariman Point', 'Bandra-Kurla Complex',
     'Mumbai', 'Maharashtra', '400021', 'IN', '91',
     1, 1, 1, 1),
    ('LE-ACFB', 'ACFB', 'Athyper Canada Food & Beverage Mfg',
     'Athyper Canada Food & Beverage Mfg', 'Suite 2500, 100 King Street West', 'Bay-Advisors Business Centre',
     'Toronto', 'Ontario', 'M5X 1B8', 'CA', '1',
     1, 1, 1, 1),
    ('LE-ADPM', 'ADPM', 'Athyper Germany Pharmaceutical Mfg',
     'Athyper Germany Pharmaceutical Mfg', 'Taunusanlage 8', 'Frankfurt Banking District',
     'Frankfurt', 'Hesse', '60329', 'DE', '49',
     1, 1, 1, 1),
    ('LE-ATEM', 'ATEM', 'Athyper Taiwan Electronics Mfg',
     'Athyper Taiwan Electronics Mfg', '12F, 333 Keelung Road, Section 1', 'Neihu Technology Zone',
     'Taipei', 'Taipei City', '11012', 'TW', '886',
     1, 1, 1, 1),
    ('LE-ASPE', 'ASPE', 'Athyper South Africa Petroleum Extraction',
     'Athyper South Africa Petroleum Extraction', '150 West Street, Sandton', 'Main Extraction Control Office',
     'Johannesburg', 'Gauteng', '2196', 'ZA', '27',
     1, 1, 1, 1),
    ('LE-AUKA', 'AUKA', 'Athyper UK Agriculture',
     'Athyper UK Agriculture', '1 Canada Square, Canary Wharf', 'Westbound Agro Cluster',
     'London', 'England', 'E14 5AB', 'GB', '44',
     1, 1, 1, 1),
    ('LE-AJED', 'AJED', 'Athyper Japan Education Services',
     'Athyper Japan Education Services', '2-7-1 Yurakucho, Chiyoda-ku', 'Hillside Education Campus',
     'Tokyo', 'Tokyo Metropolis', '100-0006', 'JP', '81',
     1, 1, 1, 1),
    ('LE-APHS', 'APHS', 'Athyper Philippines Hospital Services',
     'Athyper Philippines Hospital Services', '16F Bonifacio One Technology Tower', '31st Street, Bonifacio Global City',
     'Taguig', 'Metro Manila', '1634', 'PH', '63',
     1, 1, 1, 1),
    ('LE-TKSA', 'TKSA', 'Technostat Group',
     'Technostat Group', 'Kingdom Business Center', 'Riyadh Executive District',
     'Riyadh', 'Riyadh Province', '11566', 'SA', '966',
     1, 1, 1, 1),
    ('LE-SSK', 'SSK', 'SSK Saudi',
     'SSK Saudi', 'Kingdom Innovation Hub', 'South Riyadh Technology Park',
     'Riyadh', 'Riyadh Province', '11567', 'SA', '966',
     1, 1, 1, 1),
    ('LE-TEGY', 'TEGY', 'Technostat Egypt',
     'Technostat Egypt', 'New Cairo Office', 'Cairo Technology District',
     'Cairo', 'Cairo Governorate', '11835', 'EG', '20',
     1, 1, 1, 1),
    ('LE-SDTX', 'SDTX', 'Satellites for Digital Transformation',
     'Satellites for Digital Transformation', 'New Cairo Office Annex', 'Cairo Digital Park',
     'Cairo', 'Cairo Governorate', '11836', 'EG', '20',
     1, 1, 1, 1),
    ('LE-CATL', 'CATL', 'CirrusAtlantic Ltd',
     'CirrusAtlantic Ltd', '5th Floor, Regent Street House', 'Canary Wharf Business Quarter',
     'London', 'England', 'W1B 5AH', 'GB', '44',
     1, 5, 1, 1);

    FOR v_row IN
        SELECT *
        FROM (
            SELECT p.*, row_number() OVER (ORDER BY p.legal_entity_code) AS row_idx
            FROM tmp_entity_site_profile p
        ) x
    LOOP
        v_total_entities := v_total_entities + 1;

        -- Resolve entities
        SELECT id INTO v_le_id FROM master.legal_entity WHERE tenant_id = v_tid AND code = v_row.legal_entity_code;
        SELECT id INTO v_cc_id FROM master.company_code WHERE tenant_id = v_tid AND code = v_row.company_code;

        IF v_le_id IS NULL OR v_cc_id IS NULL THEN
            v_missing_entities := v_missing_entities + 1;
            RAISE WARNING '[306_address_contacts] Missing entity in tenant athyper: legal_entity=%; company_code=%',
                v_row.legal_entity_code, v_row.company_code;
            CONTINUE;
        END IF;

        v_seeded_entities := v_seeded_entities + 1;

        -- Clear legacy LE and CC mappings so we fully replace prior demo wiring
        DELETE FROM master.address_link
        WHERE tenant_id = v_tid
          AND ((owner_type = 'legal_entity' AND owner_id = v_le_id)
            OR (owner_type = 'company_code' AND owner_id = v_cc_id));

        DELETE FROM master.contact_email ce
        USING master.contact_link cl
        WHERE ce.tenant_id = v_tid
          AND cl.tenant_id = v_tid
          AND cl.id = ce.contact_link_id
          AND ((cl.owner_type = 'legal_entity' AND cl.owner_id = v_le_id)
            OR (cl.owner_type = 'company_code' AND cl.owner_id = v_cc_id));

        DELETE FROM master.contact_phone cp
        USING master.contact_link cl
        WHERE cp.tenant_id = v_tid
          AND cl.tenant_id = v_tid
          AND cl.id = cp.contact_link_id
          AND ((cl.owner_type = 'legal_entity' AND cl.owner_id = v_le_id)
            OR (cl.owner_type = 'company_code' AND cl.owner_id = v_cc_id));

        DELETE FROM master.contact_link
        WHERE tenant_id = v_tid
          AND ((owner_type = 'legal_entity' AND owner_id = v_le_id)
            OR (owner_type = 'company_code' AND owner_id = v_cc_id));

        v_le_email_local := split_part(lower(v_row.legal_entity_code), '-', 2);
        IF v_le_email_local = '' THEN
            v_le_email_local := lower(v_row.legal_entity_code);
        END IF;
        v_cc_email_local := lower(v_row.company_code);

        v_le_phone_national := lpad((10000000 + v_row.row_idx)::text, 8, '0');
        v_cc_phone_national := lpad((10100000 + v_row.row_idx)::text, 8, '0');

        -- Shared LE/CC addresses: one physical row reused by both owners
        v_addr_attention := format('Accounts & Finance, %s', v_row.company_name);
        v_addr_line3 := format('%s Business District', v_row.addr_city);

        INSERT INTO master.address (
            tenant_id, code, name, address_type, attention_line,
            line1, line2, line3, city, region, postal_code, country_code,
            formatted_address, status, created_by
        )
        VALUES (
            v_tid,
            lower(v_row.company_code) || '-demo-shared',
            v_row.company_name,
            'commercial',
            v_addr_attention,
            v_row.addr_line1,
            v_row.addr_line2,
            v_addr_line3,
            v_row.addr_city,
            v_row.addr_region,
            v_row.addr_postal,
            v_row.addr_country,
            concat_ws(', ', v_addr_attention, v_row.addr_line1, v_row.addr_line2, v_addr_line3, v_row.addr_city, v_row.addr_postal, v_row.addr_country),
            'active',
            v_su
        )
        ON CONFLICT (tenant_id, country_code, postal_code, line1, city)
            WHERE (line1 IS NOT NULL) AND (postal_code IS NOT NULL) AND (status = 'active'::text)
        DO UPDATE SET
            name = EXCLUDED.name,
            attention_line = EXCLUDED.attention_line,
            line3 = EXCLUDED.line3,
            line2 = EXCLUDED.line2,
            region = EXCLUDED.region,
            formatted_address = EXCLUDED.formatted_address,
            updated_at = now()
        RETURNING id INTO v_cc_addr_id;

        INSERT INTO master.address_link (
            tenant_id, owner_type, owner_id, address_id, purpose, role_qualifier, is_primary, created_by
        ) VALUES
            (v_tid, 'legal_entity', v_le_id, v_cc_addr_id, 'default', NULL, true, v_su),
            (v_tid, 'company_code', v_cc_id, v_cc_addr_id, 'default', NULL, true, v_su)
        ON CONFLICT (tenant_id, owner_type, owner_id, purpose, address_id) DO NOTHING;

        -- LE contacts
        INSERT INTO master.contact_link (
            tenant_id, owner_type, owner_id, channel_type, value,
            code, name, purpose, is_primary, is_verified, verified_at, status, created_by
        ) VALUES (
            v_tid, 'legal_entity', v_le_id, 'email', v_le_email_local || '@athyper.com',
            'le-' || lower(v_row.company_code) || '-email', 'Legal Entity Correspondence',
            'default', true, true, v_now, 'active', v_su
        ) ON CONFLICT (tenant_id, owner_type, owner_id, channel_type, value, purpose, role_qualifier)
        DO NOTHING;

        SELECT id INTO v_cl_id
        FROM master.contact_link
        WHERE tenant_id = v_tid AND owner_type = 'legal_entity' AND owner_id = v_le_id
          AND channel_type = 'email' AND value = v_le_email_local || '@athyper.com'
          AND purpose = 'default';

        INSERT INTO master.contact_email (
            tenant_id, contact_link_id, local_part, domain, mx_valid, created_by
        ) VALUES (
            v_tid, v_cl_id, v_le_email_local, 'athyper.com', true, v_su
        ) ON CONFLICT (tenant_id, contact_link_id) DO NOTHING;

        INSERT INTO master.contact_link (
            tenant_id, owner_type, owner_id, channel_type, value,
            code, name, purpose, is_primary, is_verified, verified_at, status, created_by
        ) VALUES (
            v_tid, 'legal_entity', v_le_id, 'phone', '+' || v_row.calling_code || v_le_phone_national,
            'le-' || lower(v_row.company_code) || '-phone', 'Legal Entity Notification',
            'default', true, true, v_now, 'active', v_su
        ) ON CONFLICT (tenant_id, owner_type, owner_id, channel_type, value, purpose, role_qualifier)
        DO NOTHING;

        SELECT id INTO v_cl_id
        FROM master.contact_link
        WHERE tenant_id = v_tid AND owner_type = 'legal_entity' AND owner_id = v_le_id
          AND channel_type = 'phone' AND value = '+' || v_row.calling_code || v_le_phone_national
          AND purpose = 'default';

        INSERT INTO master.contact_phone (
            tenant_id, contact_link_id, e164, calling_code, national_number,
            line_type, created_by
        ) VALUES (
            v_tid, v_cl_id, '+' || v_row.calling_code || v_le_phone_national,
            v_row.calling_code, v_le_phone_national, 'landline', v_su
        ) ON CONFLICT (tenant_id, contact_link_id) DO NOTHING;

        -- CC contacts
        INSERT INTO master.contact_link (
            tenant_id, owner_type, owner_id, channel_type, value,
            code, name, purpose, is_primary, is_verified, verified_at, status, created_by
        ) VALUES (
            v_tid, 'company_code', v_cc_id, 'email', 'ops.' || v_cc_email_local || '@athyper.com',
            'cc-' || lower(v_row.company_code) || '-email', 'Company Code Correspondence',
            'default', true, true, v_now, 'active', v_su
        ) ON CONFLICT (tenant_id, owner_type, owner_id, channel_type, value, purpose, role_qualifier)
        DO NOTHING;

        SELECT id INTO v_cl_id
        FROM master.contact_link
        WHERE tenant_id = v_tid AND owner_type = 'company_code' AND owner_id = v_cc_id
          AND channel_type = 'email' AND value = 'ops.' || v_cc_email_local || '@athyper.com'
          AND purpose = 'default';

        INSERT INTO master.contact_email (
            tenant_id, contact_link_id, local_part, domain, mx_valid, created_by
        ) VALUES (
            v_tid, v_cl_id, 'ops.' || v_cc_email_local, 'athyper.com', true, v_su
        ) ON CONFLICT (tenant_id, contact_link_id) DO NOTHING;

        INSERT INTO master.contact_link (
            tenant_id, owner_type, owner_id, channel_type, value,
            code, name, purpose, is_primary, is_verified, verified_at, status, created_by
        ) VALUES (
            v_tid, 'company_code', v_cc_id, 'phone', '+' || v_row.calling_code || v_cc_phone_national,
            'cc-' || lower(v_row.company_code) || '-phone', 'Company Code Notification',
            'default', true, true, v_now, 'active', v_su
        ) ON CONFLICT (tenant_id, owner_type, owner_id, channel_type, value, purpose, role_qualifier)
        DO NOTHING;

        SELECT id INTO v_cl_id
        FROM master.contact_link
        WHERE tenant_id = v_tid AND owner_type = 'company_code' AND owner_id = v_cc_id
          AND channel_type = 'phone' AND value = '+' || v_row.calling_code || v_cc_phone_national
          AND purpose = 'default';

        INSERT INTO master.contact_phone (
            tenant_id, contact_link_id, e164, calling_code, national_number,
            line_type, created_by
        ) VALUES (
            v_tid, v_cl_id, '+' || v_row.calling_code || v_cc_phone_national,
            v_row.calling_code, v_cc_phone_national, 'landline', v_su
        ) ON CONFLICT (tenant_id, contact_link_id) DO NOTHING;

        -- Site wiring for all active sites under this company. Each site reuses
        -- the relevant company code's default address row.
        SELECT array_agg(s.id ORDER BY s.code)
          INTO v_site_ids
        FROM master.site s
        WHERE s.tenant_id = v_tid
          AND s.company_code_id = v_cc_id
          AND s.status = 'active';

        v_site_count := COALESCE(cardinality(v_site_ids), 0);

        IF v_site_count = 0 THEN
            RAISE WARNING '[306_address_contacts] No active sites for company_code=% (LE=%). Site roles skipped.',
                v_row.company_code, v_row.legal_entity_code;
            CONTINUE;
        END IF;

        DELETE FROM master.contact_email ce
        USING master.contact_link cl
        WHERE ce.tenant_id = v_tid
          AND cl.tenant_id = v_tid
          AND cl.id = ce.contact_link_id
          AND cl.owner_type = 'site'
          AND cl.owner_id = ANY(v_site_ids);

        DELETE FROM master.contact_phone cp
        USING master.contact_link cl
        WHERE cp.tenant_id = v_tid
          AND cl.tenant_id = v_tid
          AND cl.id = cp.contact_link_id
          AND cl.owner_type = 'site'
          AND cl.owner_id = ANY(v_site_ids);

        DELETE FROM master.contact_link
        WHERE tenant_id = v_tid
          AND owner_type = 'site'
          AND owner_id = ANY(v_site_ids);

        DELETE FROM master.address_link
        WHERE tenant_id = v_tid
          AND owner_type = 'site'
          AND owner_id = ANY(v_site_ids);

        v_site_links_target := v_site_links_target + v_site_count;

        -- Site owners keep only the default master address link. Document roles
        -- such as ship_to and place_of_service resolve through document address
        -- selections/snapshots, not org-master link purposes.
        FOR v_idx IN 1..v_site_count LOOP
            v_site_id := v_site_ids[v_idx];

            INSERT INTO master.address_link (
                tenant_id, owner_type, owner_id, address_id, purpose, role_qualifier, is_primary, created_by
            ) VALUES (
                v_tid, 'site', v_site_id, v_cc_addr_id, 'default', NULL, true, v_su
            )
            ON CONFLICT (tenant_id, owner_type, owner_id, purpose, address_id) DO NOTHING;

            v_site_links_seeded := v_site_links_seeded + 1;

            v_site_attention := format('%s Site %s, Operations Desk', v_row.company_name, v_idx);
            v_site_email_local := format('site-%s-%s', lower(v_row.company_code), to_char(v_idx, 'FM00'));
            v_site_phone_national := lpad((30000000 + v_row.row_idx + v_idx)::text, 8, '0');

            INSERT INTO master.contact_link (
                tenant_id, owner_type, owner_id, channel_type, value,
                code, name, purpose, role_qualifier, is_primary, is_verified, verified_at, status, created_by
            ) VALUES (
                v_tid, 'site', v_site_id,
                'email',
                v_site_email_local || '@athyper.com',
                format('site-%s-%s-email', lower(v_row.company_code), to_char(v_idx, 'FM00')),
                v_site_attention,
                'default', NULL,
                true, true, v_now, 'active', v_su
            ) ON CONFLICT (tenant_id, owner_type, owner_id, channel_type, value, purpose, role_qualifier)
            DO NOTHING;

            SELECT id INTO v_cl_id
            FROM master.contact_link
            WHERE tenant_id = v_tid AND owner_type = 'site' AND owner_id = v_site_id
              AND channel_type = 'email'
              AND value = v_site_email_local || '@athyper.com'
              AND purpose = 'default';

            INSERT INTO master.contact_email (
                tenant_id, contact_link_id, local_part, domain, mx_valid, created_by
            ) VALUES (
                v_tid, v_cl_id, v_site_email_local, 'athyper.com', true, v_su
            ) ON CONFLICT (tenant_id, contact_link_id) DO NOTHING;

            INSERT INTO master.contact_link (
                tenant_id, owner_type, owner_id, channel_type, value,
                code, name, purpose, role_qualifier, is_primary, is_verified, verified_at, status, created_by
            ) VALUES (
                v_tid, 'site', v_site_id,
                'phone',
                '+' || v_row.calling_code || v_site_phone_national,
                format('site-%s-%s-phone', lower(v_row.company_code), to_char(v_idx, 'FM00')),
                v_site_attention,
                'default', NULL,
                true, true, v_now, 'active', v_su
            ) ON CONFLICT (tenant_id, owner_type, owner_id, channel_type, value, purpose, role_qualifier)
            DO NOTHING;

            SELECT id INTO v_cl_id
            FROM master.contact_link
            WHERE tenant_id = v_tid AND owner_type = 'site' AND owner_id = v_site_id
              AND channel_type = 'phone'
              AND value = '+' || v_row.calling_code || v_site_phone_national
              AND purpose = 'default';

            INSERT INTO master.contact_phone (
                tenant_id, contact_link_id, e164, calling_code, national_number,
                line_type, created_by
            ) VALUES (
                v_tid, v_cl_id, '+' || v_row.calling_code || v_site_phone_national,
                v_row.calling_code, v_site_phone_national, 'landline', v_su
            ) ON CONFLICT (tenant_id, contact_link_id) DO NOTHING;
        END LOOP;

        -- Site bill_to/ship_to/place_of_service are intentionally not seeded as
        -- master.address_link purposes for Athyper. They are document address
        -- roles and resolve from the site's default address.
    END LOOP;

    -- Final sweep: every active Athyper site must have exactly one default
    -- master address link, using the default address of its company code.
    DELETE FROM master.address_link al
    USING master.site s
    WHERE al.tenant_id = v_tid
      AND al.owner_type = 'site'
      AND al.owner_id = s.id
      AND s.tenant_id = v_tid
      AND s.status = 'active';

    INSERT INTO master.address_link (
        tenant_id, owner_type, owner_id, address_id, purpose,
        role_qualifier, is_primary, created_by
    )
    SELECT
        v_tid,
        'site',
        s.id,
        cc_al.address_id,
        'default',
        NULL,
        true,
        v_su
    FROM master.site s
    JOIN master.address_link cc_al
      ON cc_al.tenant_id = v_tid
     AND cc_al.owner_type = 'company_code'
     AND cc_al.owner_id = s.company_code_id
     AND cc_al.purpose = 'default'
     AND cc_al.role_qualifier IS NULL
     AND cc_al.is_primary = true
     AND (cc_al.effective_until IS NULL OR cc_al.effective_until > CURRENT_DATE)
    WHERE s.tenant_id = v_tid
      AND s.status = 'active'
    ON CONFLICT (tenant_id, owner_type, owner_id, purpose, address_id)
    DO UPDATE SET
        role_qualifier = EXCLUDED.role_qualifier,
        is_primary = EXCLUDED.is_primary,
        effective_until = NULL,
        updated_at = now(),
        updated_by = EXCLUDED.created_by;

    GET DIAGNOSTICS v_site_links_seeded = ROW_COUNT;

    SELECT count(*) INTO v_site_links_target
    FROM master.site s
    WHERE s.tenant_id = v_tid
      AND s.status = 'active';

    SELECT count(*) INTO v_missing_site_address_links
    FROM master.site s
    WHERE s.tenant_id = v_tid
      AND s.status = 'active'
      AND NOT EXISTS (
          SELECT 1
          FROM master.address_link al
          WHERE al.tenant_id = v_tid
            AND al.owner_type = 'site'
            AND al.owner_id = s.id
            AND al.purpose = 'default'
            AND al.role_qualifier IS NULL
            AND al.is_primary = true
            AND (al.effective_until IS NULL OR al.effective_until > CURRENT_DATE)
      );

    SELECT count(*) INTO v_missing_site_email_links
    FROM master.site s
    WHERE s.tenant_id = v_tid
      AND s.status = 'active'
      AND NOT EXISTS (
          SELECT 1
          FROM master.contact_link cl
          WHERE cl.tenant_id = v_tid
            AND cl.owner_type = 'site'
            AND cl.owner_id = s.id
            AND cl.channel_type = 'email'
            AND cl.purpose = 'default'
            AND cl.role_qualifier IS NULL
            AND cl.is_primary = true
            AND cl.status = 'active'
      );

    SELECT count(*) INTO v_missing_site_phone_links
    FROM master.site s
    WHERE s.tenant_id = v_tid
      AND s.status = 'active'
      AND NOT EXISTS (
          SELECT 1
          FROM master.contact_link cl
          WHERE cl.tenant_id = v_tid
            AND cl.owner_type = 'site'
            AND cl.owner_id = s.id
            AND cl.channel_type = 'phone'
            AND cl.purpose = 'default'
            AND cl.role_qualifier IS NULL
            AND cl.is_primary = true
            AND cl.status = 'active'
      );

    IF v_missing_site_address_links > 0
       OR v_missing_site_email_links > 0
       OR v_missing_site_phone_links > 0 THEN
        RAISE EXCEPTION '[306_address_contacts] Athyper site default wiring incomplete: address_missing=% email_missing=% phone_missing=%',
            v_missing_site_address_links,
            v_missing_site_email_links,
            v_missing_site_phone_links;
    END IF;

    RAISE NOTICE '[306_address_contacts] ATHyper demo address/contact refresh complete. '
                    'entities_targeted=% entities_seeded=% missing=% site_links_target=% site_links_seeded=%',
                    v_total_entities, v_seeded_entities, v_missing_entities,
                    v_site_links_target, v_site_links_seeded;

END $athyper_addr$;
