-- ============================================================================
-- TECHNOSTAT — TENANT, LEGAL ENTITY & COMPANY CODE ADDRESSES + CONTACTS
-- ============================================================================
-- File:     014_address_contacts.sql
-- Schemas:  master.address, master.address_link,
--           master.contact_link, master.contact_email, master.contact_phone
-- Purpose:  Seed HQ addresses and primary support contacts (email + phone) for
--           the Technostat tenant, 4 legal entities, and 4 company codes.
--           Master address links for tenant/legal_entity/company_code/site use
--           only purpose = 'default'. Document roles are resolved at document
--           selection time.
--
--   Riyadh HQ  (P.O. Box 305099, 11361)  ← tenant + LE-TKSA + CC-TKSA + LE-SSK + CC-SSK
--   New Cairo Office (11835)              ← LE-TEGY + CC-TEGY + LE-SDTX + CC-SDTX
--
--   Entities sharing a physical location reuse one address row via separate
--   address_links — the dedup constraint on master.address ensures no duplicates.
--
-- Depends:  003_technostat_production_seed.sql (P01-P03)
-- Idempotent: Yes — ON CONFLICT DO NOTHING / DO UPDATE throughout
-- ============================================================================

DO $tstat_addr$
DECLARE
    v_su          uuid := '00000000-0000-0000-0000-000000000000';
    v_tid         uuid;
    v_le_tksa     uuid;
    v_le_ssk      uuid;
    v_le_tegy     uuid;
    v_le_sdtx     uuid;
    v_cc_tksa     uuid;
    v_cc_ssk      uuid;
    v_cc_tegy     uuid;
    v_cc_sdtx     uuid;
    v_addr_riyadh uuid;
    v_addr_cairo  uuid;
    v_cl_id       uuid;
BEGIN

    -- ── Resolve tenant ───────────────────────────────────────────────────────
    SELECT id INTO v_tid FROM master.tenant
    WHERE realm_key = 'athyper' AND code = 'technostat';

    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[014_address_contacts] Technostat tenant not found';
    END IF;

    -- ── Resolve legal entities ───────────────────────────────────────────────
    SELECT id INTO v_le_tksa FROM master.legal_entity WHERE tenant_id = v_tid AND code = 'LE-TKSA';
    SELECT id INTO v_le_ssk  FROM master.legal_entity WHERE tenant_id = v_tid AND code = 'LE-SSK';
    SELECT id INTO v_le_tegy FROM master.legal_entity WHERE tenant_id = v_tid AND code = 'LE-TEGY';
    SELECT id INTO v_le_sdtx FROM master.legal_entity WHERE tenant_id = v_tid AND code = 'LE-SDTX';

    IF v_le_tksa IS NULL THEN RAISE EXCEPTION '[014_address_contacts] LE-TKSA not found'; END IF;
    IF v_le_ssk  IS NULL THEN RAISE EXCEPTION '[014_address_contacts] LE-SSK not found';  END IF;
    IF v_le_tegy IS NULL THEN RAISE EXCEPTION '[014_address_contacts] LE-TEGY not found'; END IF;
    IF v_le_sdtx IS NULL THEN RAISE EXCEPTION '[014_address_contacts] LE-SDTX not found'; END IF;

    -- ── Resolve company codes ────────────────────────────────────────────────
    SELECT id INTO v_cc_tksa FROM master.company_code WHERE tenant_id = v_tid AND code = 'TKSA';
    SELECT id INTO v_cc_ssk  FROM master.company_code WHERE tenant_id = v_tid AND code = 'SSK';
    SELECT id INTO v_cc_tegy FROM master.company_code WHERE tenant_id = v_tid AND code = 'TEGY';
    SELECT id INTO v_cc_sdtx FROM master.company_code WHERE tenant_id = v_tid AND code = 'SDTX';

    IF v_cc_tksa IS NULL THEN RAISE EXCEPTION '[014_address_contacts] CC TKSA not found'; END IF;
    IF v_cc_ssk  IS NULL THEN RAISE EXCEPTION '[014_address_contacts] CC SSK not found';  END IF;
    IF v_cc_tegy IS NULL THEN RAISE EXCEPTION '[014_address_contacts] CC TEGY not found'; END IF;
    IF v_cc_sdtx IS NULL THEN RAISE EXCEPTION '[014_address_contacts] CC SDTX not found'; END IF;

    -- =========================================================================
    -- ADDRESSES
    -- =========================================================================

    -- Riyadh HQ — shared by: tenant, LE-TKSA, CC-TKSA, LE-SSK, CC-SSK
    INSERT INTO master.address (
        tenant_id, code, name, address_type,
        line1, city, region, postal_code, country_code,
        formatted_address, status, created_by
    ) VALUES (
        v_tid, 'tstat-hq-ruh', 'Technostat Group HQ — Riyadh', 'commercial',
        'P.O. Box 305099',
        'Riyadh', 'Riyadh Province', '11361', 'SA',
        'P.O. Box 305099, Riyadh 11361, Saudi Arabia',
        'active', v_su
    )
    ON CONFLICT (tenant_id, country_code, postal_code, line1, city)
        WHERE (line1 IS NOT NULL) AND (postal_code IS NOT NULL) AND (status = 'active'::text)
    DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_addr_riyadh;

    -- New Cairo Office — shared by: LE-TEGY, CC-TEGY, LE-SDTX, CC-SDTX
    INSERT INTO master.address (
        tenant_id, code, name, address_type,
        line1, line2, city, region, postal_code, country_code,
        formatted_address, status, created_by
    ) VALUES (
        v_tid, 'tstat-office-cai', 'Technostat Egypt — New Cairo Office', 'commercial',
        '1st District Services Zone, 5th Compound', 'New Cairo Business District',
        'New Cairo', 'Cairo Governorate', '11835', 'EG',
        '1st District Services Zone, 5th Compound, New Cairo 11835, Egypt',
        'active', v_su
    )
    ON CONFLICT (tenant_id, country_code, postal_code, line1, city)
        WHERE (line1 IS NOT NULL) AND (postal_code IS NOT NULL) AND (status = 'active'::text)
    DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_addr_cairo;

    -- =========================================================================
    -- ADDRESS LINKS
    -- =========================================================================

    INSERT INTO master.address_link (tenant_id, owner_type, owner_id, address_id, purpose, is_primary, created_by)
    VALUES
        (v_tid, 'tenant',       v_tid,      v_addr_riyadh, 'default', true, v_su),
        (v_tid, 'legal_entity', v_le_tksa,  v_addr_riyadh, 'default', true, v_su),
        (v_tid, 'company_code', v_cc_tksa,  v_addr_riyadh, 'default', true, v_su),
        (v_tid, 'legal_entity', v_le_ssk,   v_addr_riyadh, 'default', true, v_su),
        (v_tid, 'company_code', v_cc_ssk,   v_addr_riyadh, 'default', true, v_su),
        (v_tid, 'legal_entity', v_le_tegy,  v_addr_cairo,  'default', true, v_su),
        (v_tid, 'company_code', v_cc_tegy,  v_addr_cairo,  'default', true, v_su),
        (v_tid, 'legal_entity', v_le_sdtx,  v_addr_cairo,  'default', true, v_su),
        (v_tid, 'company_code', v_cc_sdtx,  v_addr_cairo,  'default', true, v_su)
    ON CONFLICT (tenant_id, owner_type, owner_id, purpose, address_id) DO NOTHING;

    INSERT INTO master.address_link (tenant_id, owner_type, owner_id, address_id, purpose, is_primary, created_by)
    SELECT
        v_tid,
        'site',
        s.id,
        CASE WHEN cc.code IN ('TKSA', 'SSK') THEN v_addr_riyadh ELSE v_addr_cairo END,
        'default',
        true,
        v_su
    FROM master.site s
    JOIN master.company_code cc
      ON cc.tenant_id = s.tenant_id
     AND cc.id = s.company_code_id
    WHERE s.tenant_id = v_tid
      AND s.status = 'active'
      AND cc.code IN ('TKSA', 'SSK', 'TEGY', 'SDTX')
    ON CONFLICT (tenant_id, owner_type, owner_id, purpose, address_id) DO NOTHING;

    -- =========================================================================
    -- CONTACTS: Tenant
    -- =========================================================================

    INSERT INTO master.contact_link (tenant_id, owner_type, owner_id, channel_type, value, purpose, is_primary, is_verified, verified_at, status, created_by)
    VALUES (v_tid, 'tenant', v_tid, 'email', 'contactus@technostat.net', 'default', true, true, now(), 'active', v_su)
    ON CONFLICT (tenant_id, owner_type, owner_id, channel_type, value, purpose, role_qualifier) DO NOTHING;

    SELECT id INTO v_cl_id FROM master.contact_link
    WHERE tenant_id = v_tid AND owner_type = 'tenant' AND owner_id = v_tid
      AND channel_type = 'email' AND value = 'contactus@technostat.net' AND purpose = 'default';

    INSERT INTO master.contact_email (tenant_id, contact_link_id, local_part, domain, mx_valid, created_by)
    VALUES (v_tid, v_cl_id, 'contactus', 'technostat.net', true, v_su)
    ON CONFLICT (tenant_id, contact_link_id) DO NOTHING;

    INSERT INTO master.contact_link (tenant_id, owner_type, owner_id, channel_type, value, purpose, is_primary, is_verified, verified_at, status, created_by)
    VALUES (v_tid, 'tenant', v_tid, 'phone', '+966112455534', 'default', true, true, now(), 'active', v_su)
    ON CONFLICT (tenant_id, owner_type, owner_id, channel_type, value, purpose, role_qualifier) DO NOTHING;

    SELECT id INTO v_cl_id FROM master.contact_link
    WHERE tenant_id = v_tid AND owner_type = 'tenant' AND owner_id = v_tid
      AND channel_type = 'phone' AND value = '+966112455534' AND purpose = 'default';

    INSERT INTO master.contact_phone (tenant_id, contact_link_id, e164, calling_code, national_number, line_type, created_by)
    VALUES (v_tid, v_cl_id, '+966112455534', '966', '112455534', 'landline', v_su)
    ON CONFLICT (tenant_id, contact_link_id) DO NOTHING;

    -- =========================================================================
    -- CONTACTS: LE & CC entities (loop-driven)
    --   • Emails/phones -> purpose='default' for LE/CC root owners
    --   Per owner_type.allowed_contact_purposes matrix from 001_owner_type.sql
    -- =========================================================================

    DECLARE
        rec record;
    BEGIN
        FOR rec IN
            SELECT * FROM (VALUES
                ('legal_entity', v_le_tksa, 'group@technostat.net',     'group',     '+966112455534', '966', '112455534'),
                ('company_code', v_cc_tksa, 'ops.tksa@technostat.net',  'ops.tksa',  '+966112455535', '966', '112455535'),
                ('legal_entity', v_le_ssk,  'ssk@technostat.net',       'ssk',       '+966112455536', '966', '112455536'),
                ('company_code', v_cc_ssk,  'ops.ssk@technostat.net',   'ops.ssk',   '+966112455537', '966', '112455537'),
                ('legal_entity', v_le_tegy, 'egypt@technostat.net',     'egypt',     '+20223456789',  '20',  '223456789'),
                ('company_code', v_cc_tegy, 'ops.egypt@technostat.net', 'ops.egypt', '+20223456790',  '20',  '223456790'),
                ('legal_entity', v_le_sdtx, 'sdtx@technostat.net',      'sdtx',      '+20223456791',  '20',  '223456791'),
                ('company_code', v_cc_sdtx, 'ops.sdtx@technostat.net',  'ops.sdtx',  '+20223456792',  '20',  '223456792')
            ) AS t(owner_type, owner_id, email, email_local, phone_e164, phone_cc, phone_national)
        LOOP
            v_cl_id := NULL;

            -- Email channel -> 'default'
            INSERT INTO master.contact_link (
                tenant_id, owner_type, owner_id, channel_type, value,
                purpose, is_primary, is_verified, verified_at, status, created_by
            ) VALUES (v_tid, rec.owner_type, rec.owner_id::uuid, 'email', rec.email,
                'default', true, true, now(), 'active', v_su)
            ON CONFLICT (tenant_id, owner_type, owner_id, channel_type, value, purpose, role_qualifier) DO NOTHING;

            SELECT id INTO v_cl_id FROM master.contact_link
            WHERE tenant_id = v_tid AND owner_type = rec.owner_type AND owner_id = rec.owner_id::uuid
              AND channel_type = 'email' AND value = rec.email AND purpose = 'default';

            INSERT INTO master.contact_email (tenant_id, contact_link_id, local_part, domain, mx_valid, created_by)
            VALUES (v_tid, v_cl_id, rec.email_local, 'technostat.net', true, v_su)
            ON CONFLICT (tenant_id, contact_link_id) DO NOTHING;

            v_cl_id := NULL;

            -- Phone channel -> 'default'
            INSERT INTO master.contact_link (
                tenant_id, owner_type, owner_id, channel_type, value,
                purpose, is_primary, is_verified, verified_at, status, created_by
            ) VALUES (v_tid, rec.owner_type, rec.owner_id::uuid, 'phone', rec.phone_e164,
                'default', true, true, now(), 'active', v_su)
            ON CONFLICT (tenant_id, owner_type, owner_id, channel_type, value, purpose, role_qualifier) DO NOTHING;

            SELECT id INTO v_cl_id FROM master.contact_link
            WHERE tenant_id = v_tid AND owner_type = rec.owner_type AND owner_id = rec.owner_id::uuid
              AND channel_type = 'phone' AND value = rec.phone_e164 AND purpose = 'default';

            INSERT INTO master.contact_phone (
                tenant_id, contact_link_id, e164, calling_code, national_number, line_type, created_by
            ) VALUES (v_tid, v_cl_id, rec.phone_e164, rec.phone_cc, rec.phone_national, 'landline', v_su)
            ON CONFLICT (tenant_id, contact_link_id) DO NOTHING;
        END LOOP;
    END;

    RAISE NOTICE '[014_address_contacts] Technostat: tenant + 4 LEs + 4 CCs + sites - default address links and default contacts seeded';

END $tstat_addr$;
