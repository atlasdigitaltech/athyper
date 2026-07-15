-- ============================================================================
-- CIRRUSATLANTIC — TENANT, LEGAL ENTITY & COMPANY CODE ADDRESSES + CONTACTS
-- ============================================================================
-- File:     003_address_contacts.sql
-- Schema:   master.address, master.address_link,
--           master.contact_link, master.contact_email, master.contact_phone
-- Purpose:  Seed Innovative Data floor addresses and primary contacts for the
--           CirrusAtlantic tenant. This tenant intentionally keeps
--           role-specific org address purposes and excludes default:
--           bill_to/correspondence use Floor 2; ship_to/place_of_service use
--           Ground Floor through Floor 4.
-- Idempotent: Yes — ON CONFLICT DO NOTHING / DO UPDATE throughout
-- ============================================================================

DO $catl_addr$
DECLARE
    v_su          uuid := '00000000-0000-0000-0000-000000000000';
    v_tid         uuid;
    v_le_id       uuid;
    v_cc_id       uuid;
    v_addr_id     uuid;
    v_addr_code   text;
    v_addr_name   text;
    v_addr_attention text;
    v_addr_line1  text;
    v_addr_line2  text;
    v_addr_city   text;
    v_addr_region text;
    v_addr_postal text;
    v_addr_country text;
    v_addr_formatted text;
    v_cl_id       uuid;

    v_site_ids    uuid[];
    v_site_count  int;
    v_floor       record;
BEGIN
    -- Resolve tenant and CATL entities
    SELECT id INTO v_tid
    FROM master.tenant
    WHERE realm_key = 'athyper' AND code = 'cirrusatlantic';

    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[003_address_contacts] CirrusAtlantic tenant not found';
    END IF;

    SELECT id INTO v_le_id
    FROM master.legal_entity
    WHERE tenant_id = v_tid AND code = 'CATL';

    -- Backward-compatible: some earlier CATL seeds used LE-CATL, so fall back if needed.
    IF v_le_id IS NULL THEN
        SELECT id INTO v_le_id
        FROM master.legal_entity
        WHERE tenant_id = v_tid AND code = 'LE-CATL';
    END IF;

    SELECT id INTO v_cc_id
    FROM master.company_code
    WHERE tenant_id = v_tid AND code = 'CATL';

    IF v_le_id IS NULL OR v_cc_id IS NULL THEN
        RAISE EXCEPTION '[003_address_contacts] CATL LE/CC not found for tenant cirrusatlantic';
    END IF;

    SELECT array_agg(s.id ORDER BY s.code)
    INTO v_site_ids
    FROM master.site s
    WHERE s.tenant_id = v_tid
      AND s.company_code_id = v_cc_id
      AND s.status = 'active';

    v_site_count := COALESCE(cardinality(v_site_ids), 0);

    -- Full reset for these owners
    DELETE FROM master.contact_email ce
    USING master.contact_link cl
    WHERE ce.tenant_id = v_tid
      AND ce.contact_link_id = cl.id
      AND cl.tenant_id = v_tid
      AND (
            (cl.owner_type = 'tenant' AND cl.owner_id = v_tid)
         OR (cl.owner_type = 'legal_entity' AND cl.owner_id = v_le_id)
         OR (cl.owner_type = 'company_code' AND cl.owner_id = v_cc_id)
         OR (cl.owner_type = 'site' AND cl.owner_id = ANY(COALESCE(v_site_ids, ARRAY[]::uuid[])))
      );

    DELETE FROM master.contact_phone cp
    USING master.contact_link cl
    WHERE cp.tenant_id = v_tid
      AND cp.contact_link_id = cl.id
      AND cl.tenant_id = v_tid
      AND (
            (cl.owner_type = 'tenant' AND cl.owner_id = v_tid)
         OR (cl.owner_type = 'legal_entity' AND cl.owner_id = v_le_id)
         OR (cl.owner_type = 'company_code' AND cl.owner_id = v_cc_id)
         OR (cl.owner_type = 'site' AND cl.owner_id = ANY(COALESCE(v_site_ids, ARRAY[]::uuid[])))
      );

    DELETE FROM master.contact_link
    WHERE tenant_id = v_tid
      AND (
           (owner_type = 'tenant' AND owner_id = v_tid)
        OR (owner_type = 'legal_entity' AND owner_id = v_le_id)
        OR (owner_type = 'company_code' AND owner_id = v_cc_id)
        OR (owner_type = 'site' AND owner_id = ANY(COALESCE(v_site_ids, ARRAY[]::uuid[])))
      );

    DELETE FROM master.address_link
    WHERE tenant_id = v_tid
      AND (
           (owner_type = 'tenant' AND owner_id = v_tid)
        OR (owner_type = 'legal_entity' AND owner_id = v_le_id)
        OR (owner_type = 'company_code' AND owner_id = v_cc_id)
        OR (owner_type = 'site' AND owner_id = ANY(COALESCE(v_site_ids, ARRAY[]::uuid[])))
      );

    CREATE TEMP TABLE tmp_catl_floor_address (
        floor_no smallint PRIMARY KEY,
        floor_label text NOT NULL,
        address_id uuid
    ) ON COMMIT DROP;

    INSERT INTO tmp_catl_floor_address (floor_no, floor_label)
    VALUES
        (0, 'Ground Floor'),
        (1, 'Floor 1'),
        (2, 'Floor 2'),
        (3, 'Floor 3'),
        (4, 'Floor 4');

    FOR v_floor IN
        SELECT floor_no, floor_label
        FROM tmp_catl_floor_address
        ORDER BY floor_no
    LOOP
        v_addr_code := format('catl-innovative-data-floor-%s', v_floor.floor_no);
        v_addr_name := format('Innovative Data - %s', v_floor.floor_label);
        v_addr_attention := format('Innovative Data, %s', v_floor.floor_label);
        v_addr_line1 := format('%s, Innovative Data Building', v_floor.floor_label);
        v_addr_line2 := '18 Innovation Avenue';
        v_addr_city := 'London';
        v_addr_region := 'England';
        v_addr_postal := 'EC3M 3BY';
        v_addr_country := 'GB';
        v_addr_formatted := concat_ws(', ', v_addr_attention, v_addr_line1, v_addr_line2, v_addr_city, v_addr_postal, v_addr_country);

        INSERT INTO master.address (
            tenant_id, code, name, address_type, attention_line,
            line1, line2, line3, city, region, postal_code, country_code,
            formatted_address, status, created_by
        ) VALUES (
            v_tid, v_addr_code, v_addr_name, 'commercial', v_addr_attention,
            v_addr_line1, v_addr_line2, 'Canary Wharf', v_addr_city, v_addr_region, v_addr_postal, v_addr_country,
            v_addr_formatted, 'active', v_su
        )
        ON CONFLICT (tenant_id, country_code, postal_code, line1, city)
            WHERE (line1 IS NOT NULL) AND (postal_code IS NOT NULL) AND (status = 'active'::text)
        DO UPDATE SET
            code = EXCLUDED.code,
            name = EXCLUDED.name,
            attention_line = EXCLUDED.attention_line,
            line2 = EXCLUDED.line2,
            line3 = EXCLUDED.line3,
            region = EXCLUDED.region,
            formatted_address = EXCLUDED.formatted_address,
            updated_at = now()
        RETURNING id INTO v_addr_id;

        UPDATE tmp_catl_floor_address
        SET address_id = v_addr_id
        WHERE floor_no = v_floor.floor_no;
    END LOOP;

    INSERT INTO master.address_link (
        tenant_id, owner_type, owner_id, address_id, purpose, is_primary, role_qualifier, created_by
    )
    SELECT v_tid, owner_type, owner_id, floor2.address_id, purpose, true, role_qualifier, v_su
    FROM (VALUES
        ('tenant'::text, v_tid::uuid, 'bill_to'::text, NULL::text),
        ('tenant'::text, v_tid::uuid, 'correspondence'::text, 'account_statement'::text),
        ('legal_entity'::text, v_le_id::uuid, 'bill_to'::text, NULL::text),
        ('legal_entity'::text, v_le_id::uuid, 'correspondence'::text, 'legal_notice'::text),
        ('company_code'::text, v_cc_id::uuid, 'bill_to'::text, NULL::text),
        ('company_code'::text, v_cc_id::uuid, 'correspondence'::text, 'tax_filing'::text)
    ) AS owner_roles(owner_type, owner_id, purpose, role_qualifier)
    CROSS JOIN tmp_catl_floor_address floor2
    WHERE floor2.floor_no = 2
    ON CONFLICT (tenant_id, owner_type, owner_id, purpose, address_id) DO NOTHING;

    INSERT INTO master.address_link (
        tenant_id, owner_type, owner_id, address_id, purpose, is_primary, role_qualifier, created_by
    )
    SELECT
        v_tid,
        owners.owner_type,
        owners.owner_id,
        floors.address_id,
        roles.purpose,
        floors.floor_no = 0,
        NULL,
        v_su
    FROM (VALUES
        ('tenant'::text, v_tid::uuid),
        ('legal_entity'::text, v_le_id::uuid),
        ('company_code'::text, v_cc_id::uuid)
    ) AS owners(owner_type, owner_id)
    CROSS JOIN (VALUES ('ship_to'::text), ('place_of_service'::text)) AS roles(purpose)
    CROSS JOIN tmp_catl_floor_address floors
    ON CONFLICT (tenant_id, owner_type, owner_id, purpose, address_id) DO NOTHING;

    -- Site owners use the same Innovative Data building. Bill/correspondence
    -- use Floor 2; ship/service cycle through Ground Floor through Floor 4.
    IF v_site_count > 0 THEN
        INSERT INTO master.address_link (
            tenant_id, owner_type, owner_id, address_id, purpose, is_primary, role_qualifier, created_by
        )
        SELECT v_tid, 'site', site_rows.site_id, floor2.address_id, role_rows.purpose, true, role_rows.role_qualifier, v_su
        FROM (
            SELECT unnest(v_site_ids) AS site_id
        ) AS site_rows
        CROSS JOIN (VALUES
            ('bill_to'::text, NULL::text),
            ('correspondence'::text, 'account_statement'::text)
        ) AS role_rows(purpose, role_qualifier)
        CROSS JOIN tmp_catl_floor_address floor2
        WHERE floor2.floor_no = 2
        ON CONFLICT (tenant_id, owner_type, owner_id, purpose, address_id) DO NOTHING;

        INSERT INTO master.address_link (
            tenant_id, owner_type, owner_id, address_id, purpose, is_primary, role_qualifier, created_by
        )
        SELECT
            v_tid,
            'site',
            site_rows.site_id,
            floors.address_id,
            role_rows.purpose,
            true,
            NULL,
            v_su
        FROM (
            SELECT u.site_id, ((row_number() OVER (ORDER BY u.site_id))::int - 1) % 5 AS floor_no
            FROM unnest(v_site_ids) AS u(site_id)
        ) AS site_rows
        JOIN tmp_catl_floor_address floors
          ON floors.floor_no = site_rows.floor_no
        CROSS JOIN (VALUES ('ship_to'::text), ('place_of_service'::text)) AS role_rows(purpose)
        ON CONFLICT (tenant_id, owner_type, owner_id, purpose, address_id) DO NOTHING;
    ELSE
        RAISE WARNING '[003_address_contacts] No active CATL sites found for cirrusatlantic tenant';
    END IF;

    -- =========================================================================
    -- CONTACTS: Tenant
    -- =========================================================================
    INSERT INTO master.contact_link (
        tenant_id, owner_type, owner_id, channel_type, value,
        code, name, purpose, role_qualifier, is_primary, is_verified, verified_at, status, created_by
    ) VALUES (
        v_tid, 'tenant', v_tid, 'email', 'info@cirrusatlantic.co.uk',
        'tenant-support-email', 'Tenant Support Email', 'default', NULL,
        true, true, now(), 'active', v_su
    )
    ON CONFLICT (tenant_id, owner_type, owner_id, channel_type, value, purpose, role_qualifier) DO NOTHING;

    SELECT id INTO v_cl_id
    FROM master.contact_link
    WHERE tenant_id = v_tid AND owner_type = 'tenant' AND owner_id = v_tid
      AND channel_type = 'email' AND value = 'info@cirrusatlantic.co.uk' AND purpose = 'default';

    INSERT INTO master.contact_email (
        tenant_id, contact_link_id, local_part, domain, mx_valid, created_by
    ) VALUES (
        v_tid, v_cl_id, 'info', 'cirrusatlantic.co.uk', true, v_su
    )
    ON CONFLICT (tenant_id, contact_link_id) DO NOTHING;

    INSERT INTO master.contact_link (
        tenant_id, owner_type, owner_id, channel_type, value,
        code, name, purpose, role_qualifier, is_primary, is_verified, verified_at, status, created_by
    ) VALUES (
        v_tid, 'tenant', v_tid, 'phone', '+442071112222',
        'tenant-support-phone', 'Tenant Support Phone', 'default', NULL,
        true, true, now(), 'active', v_su
    )
    ON CONFLICT (tenant_id, owner_type, owner_id, channel_type, value, purpose, role_qualifier) DO NOTHING;

    SELECT id INTO v_cl_id
    FROM master.contact_link
    WHERE tenant_id = v_tid AND owner_type = 'tenant' AND owner_id = v_tid
      AND channel_type = 'phone' AND value = '+442071112222' AND purpose = 'default';

    INSERT INTO master.contact_phone (
        tenant_id, contact_link_id, e164, calling_code, national_number, line_type, created_by
    ) VALUES (
        v_tid, v_cl_id, '+442071112222', '44', '2071112222', 'landline', v_su
    )
    ON CONFLICT (tenant_id, contact_link_id) DO NOTHING;

    -- =========================================================================
    -- CONTACTS: Legal Entity CATL
    -- =========================================================================
    INSERT INTO master.contact_link (
        tenant_id, owner_type, owner_id, channel_type, value,
        code, name, purpose, role_qualifier, is_primary, is_verified, verified_at, status, created_by
    ) VALUES (
        v_tid, 'legal_entity', v_le_id, 'email', 'legal@cirrusatlantic.co.uk',
        'le-catl-legal-email', 'Legal Entity Correspondence', 'default', NULL,
        true, true, now(), 'active', v_su
    )
    ON CONFLICT (tenant_id, owner_type, owner_id, channel_type, value, purpose, role_qualifier) DO NOTHING;

    SELECT id INTO v_cl_id
    FROM master.contact_link
    WHERE tenant_id = v_tid AND owner_type = 'legal_entity' AND owner_id = v_le_id
      AND channel_type = 'email' AND value = 'legal@cirrusatlantic.co.uk' AND purpose = 'default';

    INSERT INTO master.contact_email (
        tenant_id, contact_link_id, local_part, domain, mx_valid, created_by
    ) VALUES (
        v_tid, v_cl_id, 'legal', 'cirrusatlantic.co.uk', true, v_su
    )
    ON CONFLICT (tenant_id, contact_link_id) DO NOTHING;

    INSERT INTO master.contact_link (
        tenant_id, owner_type, owner_id, channel_type, value,
        code, name, purpose, role_qualifier, is_primary, is_verified, verified_at, status, created_by
    ) VALUES (
        v_tid, 'legal_entity', v_le_id, 'phone', '+442071112223',
        'le-catl-legal-phone', 'Legal Entity Phone', 'default', NULL,
        true, true, now(), 'active', v_su
    )
    ON CONFLICT (tenant_id, owner_type, owner_id, channel_type, value, purpose, role_qualifier) DO NOTHING;

    SELECT id INTO v_cl_id
    FROM master.contact_link
    WHERE tenant_id = v_tid AND owner_type = 'legal_entity' AND owner_id = v_le_id
      AND channel_type = 'phone' AND value = '+442071112223' AND purpose = 'default';

    INSERT INTO master.contact_phone (
        tenant_id, contact_link_id, e164, calling_code, national_number, line_type, created_by
    ) VALUES (
        v_tid, v_cl_id, '+442071112223', '44', '2071112223', 'landline', v_su
    )
    ON CONFLICT (tenant_id, contact_link_id) DO NOTHING;

    -- =========================================================================
    -- CONTACTS: Company Code CATL
    -- =========================================================================
    INSERT INTO master.contact_link (
        tenant_id, owner_type, owner_id, channel_type, value,
        code, name, purpose, role_qualifier, is_primary, is_verified, verified_at, status, created_by
    ) VALUES (
        v_tid, 'company_code', v_cc_id, 'email', 'finance@cirrusatlantic.co.uk',
        'cc-catl-finance-email', 'Company Code Finance Email', 'default', NULL,
        true, true, now(), 'active', v_su
    )
    ON CONFLICT (tenant_id, owner_type, owner_id, channel_type, value, purpose, role_qualifier) DO NOTHING;

    SELECT id INTO v_cl_id
    FROM master.contact_link
    WHERE tenant_id = v_tid AND owner_type = 'company_code' AND owner_id = v_cc_id
      AND channel_type = 'email' AND value = 'finance@cirrusatlantic.co.uk' AND purpose = 'default';

    INSERT INTO master.contact_email (
        tenant_id, contact_link_id, local_part, domain, mx_valid, created_by
    ) VALUES (
        v_tid, v_cl_id, 'finance', 'cirrusatlantic.co.uk', true, v_su
    )
    ON CONFLICT (tenant_id, contact_link_id) DO NOTHING;

    INSERT INTO master.contact_link (
        tenant_id, owner_type, owner_id, channel_type, value,
        code, name, purpose, role_qualifier, is_primary, is_verified, verified_at, status, created_by
    ) VALUES (
        v_tid, 'company_code', v_cc_id, 'phone', '+442071112224',
        'cc-catl-finance-phone', 'Company Code Finance Phone', 'default', NULL,
        true, true, now(), 'active', v_su
    )
    ON CONFLICT (tenant_id, owner_type, owner_id, channel_type, value, purpose, role_qualifier) DO NOTHING;

    SELECT id INTO v_cl_id
    FROM master.contact_link
    WHERE tenant_id = v_tid AND owner_type = 'company_code' AND owner_id = v_cc_id
      AND channel_type = 'phone' AND value = '+442071112224' AND purpose = 'default';

    INSERT INTO master.contact_phone (
        tenant_id, contact_link_id, e164, calling_code, national_number, line_type, created_by
    ) VALUES (
        v_tid, v_cl_id, '+442071112224', '44', '2071112224', 'landline', v_su
    )
    ON CONFLICT (tenant_id, contact_link_id) DO NOTHING;

    RAISE NOTICE '[003_address_contacts] CirrusAtlantic: tenant + LE + CC + site address/contact wiring seeded';
END $catl_addr$;
