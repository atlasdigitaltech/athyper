DO $tstat_addr$
DECLARE
    v_su            uuid := '00000000-0000-0000-0000-000000000000';
    v_now           timestamptz := now();
    v_tid           uuid;

    v_ot_tenant     uuid;
    v_ot_legal_ent  uuid;
    v_ot_company    uuid;
    v_ot_site       uuid;

    v_le_tksa       uuid;
    v_le_ssk        uuid;
    v_le_tegy       uuid;
    v_le_sdtx       uuid;
    v_cc_tksa       uuid;
    v_cc_ssk        uuid;
    v_cc_tegy       uuid;
    v_cc_sdtx       uuid;

    v_addr_riyadh    uuid;
    v_addr_cairo    uuid;
    v_cl_id         uuid;
    v_rec           record;
BEGIN
    -- Tenant and owner type contracts
    SELECT id INTO v_tid
    FROM master.tenant
    WHERE realm_key = 'athyper' AND code = 'technostat'
    LIMIT 1;
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[014_address_contacts] Technostat tenant not found';
    END IF;

    SELECT id INTO v_ot_tenant
    FROM control.owner_type
    WHERE code = 'tenant'
      AND tenant_id IS NULL
    LIMIT 1;

    SELECT id INTO v_ot_legal_ent
    FROM control.owner_type
    WHERE code = 'legal_entity'
      AND tenant_id IS NULL
    LIMIT 1;

    SELECT id INTO v_ot_company
    FROM control.owner_type
    WHERE code = 'company_code'
      AND tenant_id IS NULL
    LIMIT 1;

    IF v_ot_tenant IS NULL OR v_ot_legal_ent IS NULL OR v_ot_company IS NULL THEN
        RAISE EXCEPTION '[014_address_contacts] Missing required control.owner_type row (tenant/legal_entity/company_code)';
    END IF;

    -- Base entities expected by this tenant script
    SELECT id INTO v_le_tksa FROM master.legal_entity WHERE tenant_id = v_tid AND code = 'LE-TKSA' LIMIT 1;
    SELECT id INTO v_le_ssk FROM master.legal_entity WHERE tenant_id = v_tid AND code = 'LE-SSK' LIMIT 1;
    SELECT id INTO v_le_tegy FROM master.legal_entity WHERE tenant_id = v_tid AND code = 'LE-TEGY' LIMIT 1;
    SELECT id INTO v_le_sdtx FROM master.legal_entity WHERE tenant_id = v_tid AND code = 'LE-SDTX' LIMIT 1;

    SELECT id INTO v_cc_tksa FROM master.company_code WHERE tenant_id = v_tid AND code = 'TKSA' LIMIT 1;
    SELECT id INTO v_cc_ssk FROM master.company_code WHERE tenant_id = v_tid AND code = 'SSK' LIMIT 1;
    SELECT id INTO v_cc_tegy FROM master.company_code WHERE tenant_id = v_tid AND code = 'TEGY' LIMIT 1;
    SELECT id INTO v_cc_sdtx FROM master.company_code WHERE tenant_id = v_tid AND code = 'SDTX' LIMIT 1;

    -- Riyadh shared address
    SELECT id INTO v_addr_riyadh
    FROM master.address
    WHERE tenant_id = v_tid
      AND country_code = 'SA'
      AND COALESCE(postal_code, '') = '11361'
      AND btrim(line1) = 'P.O. Box 305099'
      AND btrim(city) = 'Riyadh'
    LIMIT 1;
    IF v_addr_riyadh IS NULL THEN
        INSERT INTO master.address (
            tenant_id, address_type, line1, city, region, postal_code, country_code, status, created_by
        ) VALUES (
            v_tid, 'commercial', 'P.O. Box 305099', 'Riyadh', 'Riyadh Province', '11361', 'SA', 'active', v_su
        )
        RETURNING id INTO v_addr_riyadh;
    END IF;

    -- Cairo shared address
    SELECT id INTO v_addr_cairo
    FROM master.address
    WHERE tenant_id = v_tid
      AND country_code = 'EG'
      AND COALESCE(postal_code, '') = '11835'
      AND btrim(line1) = '1st District Services Zone, 5th Compound'
      AND btrim(city) = 'New Cairo'
    LIMIT 1;
    IF v_addr_cairo IS NULL THEN
        INSERT INTO master.address (
            tenant_id, address_type, line1, line2, city, region, postal_code, country_code, status, created_by
        ) VALUES (
            v_tid, 'commercial', '1st District Services Zone, 5th Compound',
            'New Cairo Business District', 'New Cairo', 'Cairo Governorate', '11835', 'EG', 'active', v_su
        )
        RETURNING id INTO v_addr_cairo;
    END IF;

    -- Link tenant + legal entities + companies to the two addresses
    FOR v_rec IN
        SELECT t.owner_type_id, t.owner_id, t.address_id
        FROM (
            VALUES
                (v_ot_tenant,    v_tid,        v_addr_riyadh),
                (v_ot_legal_ent, v_le_tksa,    v_addr_riyadh),
                (v_ot_company,   v_cc_tksa,    v_addr_riyadh),
                (v_ot_legal_ent, v_le_ssk,     v_addr_riyadh),
                (v_ot_company,   v_cc_ssk,     v_addr_riyadh),
                (v_ot_legal_ent, v_le_tegy,    v_addr_cairo),
                (v_ot_company,   v_cc_tegy,    v_addr_cairo),
                (v_ot_legal_ent, v_le_sdtx,    v_addr_cairo),
                (v_ot_company,   v_cc_sdtx,    v_addr_cairo)
        ) AS t(owner_type_id, owner_id, address_id)
    LOOP
        IF v_rec.owner_id IS NULL THEN
            CONTINUE;
        END IF;

        IF NOT EXISTS (
            SELECT 1
            FROM master.address_link al
            WHERE al.tenant_id = v_tid
              AND al.owner_type_id = v_rec.owner_type_id
              AND al.owner_id = v_rec.owner_id
              AND al.purpose = 'default'
              AND al.address_id = v_rec.address_id
              AND al.role_qualifier IS NULL
        ) THEN
            INSERT INTO master.address_link (
                tenant_id, owner_type_id, owner_id, address_id, purpose, role_qualifier, is_primary, created_by
            ) VALUES (
                v_tid, v_rec.owner_type_id, v_rec.owner_id, v_rec.address_id, 'default', NULL, true, v_su
            );
        END IF;
    END LOOP;

    -- Optional site linkage is skipped if site owner type has not been seeded yet for this plane.
    SELECT id INTO v_ot_site
      FROM control.owner_type
     WHERE code = 'site'
      AND tenant_id IS NULL
     LIMIT 1;
    IF v_ot_site IS NOT NULL THEN
        FOR v_rec IN
            SELECT cc.code AS company_code, s.id AS site_id
            FROM master.site s
            JOIN master.company_code cc
              ON cc.tenant_id = s.tenant_id
             AND cc.id = s.company_code_id
            WHERE s.tenant_id = v_tid
              AND s.status = 'active'
              AND cc.code IN ('TKSA', 'SSK', 'TEGY', 'SDTX')
        LOOP
            IF NOT EXISTS (
                SELECT 1
                FROM master.address_link al
                WHERE al.tenant_id = v_tid
                  AND al.owner_type_id = v_ot_site
                  AND al.owner_id = v_rec.site_id
                  AND al.purpose = 'default'
                  AND al.address_id = CASE WHEN v_rec.company_code IN ('TKSA', 'SSK') THEN v_addr_riyadh ELSE v_addr_cairo END
                  AND al.role_qualifier IS NULL
            ) THEN
                INSERT INTO master.address_link (
                    tenant_id, owner_type_id, owner_id, address_id, purpose, role_qualifier, is_primary, created_by
                ) VALUES (
                    v_tid, v_ot_site, v_rec.site_id,
                    CASE WHEN v_rec.company_code IN ('TKSA', 'SSK') THEN v_addr_riyadh ELSE v_addr_cairo END,
                    'default', NULL, true, v_su
                );
            END IF;
        END LOOP;
    END IF;

    -- Tenant contacts
    IF NOT EXISTS (
        SELECT 1 FROM master.contact_link
        WHERE tenant_id = v_tid
          AND owner_type_id = v_ot_tenant
          AND owner_id = v_tid
          AND channel_type = 'email'
          AND value = 'contactus@technostat.net'
          AND purpose = 'default'
    ) THEN
        INSERT INTO master.contact_link (
            tenant_id, owner_type_id, owner_id, channel_type, value, purpose, is_primary, is_verified, verified_at, status, created_by
        ) VALUES (
            v_tid, v_ot_tenant, v_tid, 'email', 'contactus@technostat.net', 'default', true, true, v_now, 'active', v_su
        );
    END IF;

    SELECT id INTO v_cl_id
    FROM master.contact_link
    WHERE tenant_id = v_tid
      AND owner_type_id = v_ot_tenant
      AND owner_id = v_tid
      AND channel_type = 'email'
      AND value = 'contactus@technostat.net'
      AND purpose = 'default'
    LIMIT 1;

    IF v_cl_id IS NOT NULL THEN
        INSERT INTO master.contact_email (tenant_id, contact_link_id, created_by)
        VALUES (v_tid, v_cl_id, v_su)
        ON CONFLICT (contact_link_id) DO NOTHING;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM master.contact_link
        WHERE tenant_id = v_tid
          AND owner_type_id = v_ot_tenant
          AND owner_id = v_tid
          AND channel_type = 'phone'
          AND value = '+966112455534'
          AND purpose = 'default'
    ) THEN
        INSERT INTO master.contact_link (
            tenant_id, owner_type_id, owner_id, channel_type, value, purpose, is_primary, is_verified, verified_at, status, created_by
        ) VALUES (
            v_tid, v_ot_tenant, v_tid, 'phone', '+966112455534', 'default', true, true, v_now, 'active', v_su
        );
    END IF;

    SELECT id INTO v_cl_id
    FROM master.contact_link
    WHERE tenant_id = v_tid
      AND owner_type_id = v_ot_tenant
      AND owner_id = v_tid
      AND channel_type = 'phone'
      AND value = '+966112455534'
      AND purpose = 'default'
    LIMIT 1;

    IF v_cl_id IS NOT NULL THEN
        INSERT INTO master.contact_phone (tenant_id, contact_link_id, line_type, created_by)
        VALUES (v_tid, v_cl_id, 'landline', v_su)
        ON CONFLICT (contact_link_id) DO NOTHING;
    END IF;

    -- LE and CC contacts
    FOR v_rec IN
        SELECT t.owner_type_id, t.owner_id, t.email, t.phone
        FROM (
            VALUES
                (v_ot_legal_ent, v_le_tksa, 'group@technostat.net', '+966112455534'),
                (v_ot_company,   v_cc_tksa, 'ops.tksa@technostat.net', '+966112455535'),
                (v_ot_legal_ent, v_le_ssk,  'ssk@technostat.net', '+966112455536'),
                (v_ot_company,   v_cc_ssk,  'ops.ssk@technostat.net', '+966112455537'),
                (v_ot_legal_ent, v_le_tegy, 'egypt@technostat.net', '+20223456789'),
                (v_ot_company,   v_cc_tegy, 'ops.egypt@technostat.net', '+20223456790'),
                (v_ot_legal_ent, v_le_sdtx, 'sdtx@technostat.net', '+20223456791'),
                (v_ot_company,   v_cc_sdtx, 'ops.sdtx@technostat.net', '+20223456792')
        ) AS t(owner_type_id, owner_id, email, phone)
    LOOP
        IF v_rec.owner_id IS NULL THEN
            CONTINUE;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM master.contact_link
            WHERE tenant_id = v_tid
              AND owner_type_id = v_rec.owner_type_id
              AND owner_id = v_rec.owner_id
              AND channel_type = 'email'
              AND value = v_rec.email
              AND purpose = 'default'
        ) THEN
            INSERT INTO master.contact_link (
                tenant_id, owner_type_id, owner_id, channel_type, value,
                purpose, is_primary, is_verified, verified_at, status, created_by
            ) VALUES (
                v_tid, v_rec.owner_type_id, v_rec.owner_id, 'email', v_rec.email,
                'default', true, true, v_now, 'active', v_su
            );
        END IF;

        SELECT id INTO v_cl_id
        FROM master.contact_link
        WHERE tenant_id = v_tid
          AND owner_type_id = v_rec.owner_type_id
          AND owner_id = v_rec.owner_id
          AND channel_type = 'email'
          AND value = v_rec.email
          AND purpose = 'default'
        LIMIT 1;
        IF v_cl_id IS NOT NULL THEN
            INSERT INTO master.contact_email (tenant_id, contact_link_id, created_by)
            VALUES (v_tid, v_cl_id, v_su)
            ON CONFLICT (contact_link_id) DO NOTHING;
        END IF;

        IF NOT EXISTS (
            SELECT 1 FROM master.contact_link
            WHERE tenant_id = v_tid
              AND owner_type_id = v_rec.owner_type_id
              AND owner_id = v_rec.owner_id
              AND channel_type = 'phone'
              AND value = v_rec.phone
              AND purpose = 'default'
        ) THEN
            INSERT INTO master.contact_link (
                tenant_id, owner_type_id, owner_id, channel_type, value,
                purpose, is_primary, is_verified, verified_at, status, created_by
            ) VALUES (
                v_tid, v_rec.owner_type_id, v_rec.owner_id, 'phone', v_rec.phone,
                'default', false, true, v_now, 'active', v_su
            );
        END IF;

        SELECT id INTO v_cl_id
        FROM master.contact_link
        WHERE tenant_id = v_tid
          AND owner_type_id = v_rec.owner_type_id
          AND owner_id = v_rec.owner_id
          AND channel_type = 'phone'
          AND value = v_rec.phone
          AND purpose = 'default'
        LIMIT 1;
        IF v_cl_id IS NOT NULL THEN
            INSERT INTO master.contact_phone (tenant_id, contact_link_id, line_type, created_by)
            VALUES (v_tid, v_cl_id, 'landline', v_su)
            ON CONFLICT (contact_link_id) DO NOTHING;
        END IF;
    END LOOP;

    RAISE NOTICE '[014_address_contacts] Technostat: tenant + optional LE/CC/site addresses and contacts seeded';
END;
$tstat_addr$;
