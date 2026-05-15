-- ============================================================================
-- ATHYPER — TENANT, LEGAL ENTITY & COMPANY CODE ADDRESSES + CONTACTS
-- ============================================================================
-- File:     003_address_contacts.sql
-- Schemas:  master.address, master.address_link,
--           master.contact_link, master.contact_email, master.contact_phone
-- Purpose:  Seed HQ address and primary support contacts (email + phone) for
--           the Athyper tenant, 17 legal entities, and 17 company codes.
--           LE/CC pairs sharing a physical location reuse one address row
--           via separate address_links.
-- Depends:  000_tenant.sql, 100_org_structure/199_gl_preseed.sql
-- Idempotent: Yes — ON CONFLICT DO NOTHING / DO UPDATE throughout
-- ============================================================================

DO $athyper_addr$
DECLARE
    v_su        uuid := '00000000-0000-0000-0000-000000000000';
    v_tid       uuid;
    v_entity_id uuid;
    v_addr_id   uuid;
    v_cl_id     uuid;
    rec         record;
BEGIN

    -- ── Resolve tenant ───────────────────────────────────────────────────────
    SELECT id INTO v_tid FROM master.tenant
    WHERE realm_key = 'athyper' AND code = 'athyper';

    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[003_address_contacts] Athyper tenant not found';
    END IF;

    -- =========================================================================
    -- TENANT-LEVEL: HQ Address (Dubai, DIFC) + Contacts
    -- =========================================================================

    INSERT INTO master.address (
        tenant_id, code, name, address_type,
        line1, line2, city, region, postal_code, country_code,
        formatted_address, status, created_by
    ) VALUES (
        v_tid, 'athyper-hq-dxb', 'Athyper Group HQ — Dubai', 'commercial',
        'Level 14, Gate District 4', 'Dubai International Financial Centre',
        'Dubai', 'Dubai Emirate', '507135', 'AE',
        'Level 14, Gate District 4, DIFC, Dubai 507135, UAE',
        'active', v_su
    )
    ON CONFLICT (tenant_id, country_code, postal_code, line1, city)
        WHERE (line1 IS NOT NULL) AND (postal_code IS NOT NULL) AND (status = 'active'::text)
    DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_addr_id;

    INSERT INTO master.address_link (
        tenant_id, owner_type, owner_id, address_id, purpose, is_primary, created_by
    ) VALUES (v_tid, 'tenant', v_tid, v_addr_id, 'hq', true, v_su)
    ON CONFLICT (tenant_id, owner_type, owner_id, purpose, address_id) DO NOTHING;

    INSERT INTO master.contact_link (
        tenant_id, owner_type, owner_id, channel_type, value,
        purpose, is_primary, is_verified, verified_at, status, created_by
    ) VALUES (v_tid, 'tenant', v_tid, 'email', 'info@athyper.com',
        'support', true, true, now(), 'active', v_su)
    ON CONFLICT (tenant_id, owner_type, owner_id, channel_type, value, purpose) DO NOTHING;

    SELECT id INTO v_cl_id FROM master.contact_link
    WHERE tenant_id = v_tid AND owner_type = 'tenant' AND owner_id = v_tid
      AND channel_type = 'email' AND value = 'info@athyper.com' AND purpose = 'support';

    INSERT INTO master.contact_email (tenant_id, contact_link_id, local_part, domain, mx_valid, created_by)
    VALUES (v_tid, v_cl_id, 'info', 'athyper.com', true, v_su)
    ON CONFLICT (tenant_id, contact_link_id) DO NOTHING;

    INSERT INTO master.contact_link (
        tenant_id, owner_type, owner_id, channel_type, value,
        purpose, is_primary, is_verified, verified_at, status, created_by
    ) VALUES (v_tid, 'tenant', v_tid, 'phone', '+97145015555',
        'support', true, true, now(), 'active', v_su)
    ON CONFLICT (tenant_id, owner_type, owner_id, channel_type, value, purpose) DO NOTHING;

    SELECT id INTO v_cl_id FROM master.contact_link
    WHERE tenant_id = v_tid AND owner_type = 'tenant' AND owner_id = v_tid
      AND channel_type = 'phone' AND value = '+97145015555' AND purpose = 'support';

    INSERT INTO master.contact_phone (tenant_id, contact_link_id, e164, calling_code, national_number, line_type, created_by)
    VALUES (v_tid, v_cl_id, '+97145015555', '971', '45015555', 'landline', v_su)
    ON CONFLICT (tenant_id, contact_link_id) DO NOTHING;

    v_addr_id := NULL;
    v_cl_id   := NULL;

    -- =========================================================================
    -- ENTITIES: 17 Legal Entities + 17 Company Codes
    -- =========================================================================

    CREATE TEMP TABLE tmp_athyper_entities (
        entity_type    text    NOT NULL,
        entity_code    text    NOT NULL,
        addr_code      text    NOT NULL,   -- shared between LE/CC pair
        addr_name      text    NOT NULL,
        addr_line1     text    NOT NULL,
        addr_line2     text,
        addr_city      text    NOT NULL,
        addr_region    text,
        addr_postal    text    NOT NULL,
        addr_country   char(2) NOT NULL,
        email          text    NOT NULL,
        email_local    text    NOT NULL,
        email_domain   text    NOT NULL,
        phone_e164     text    NOT NULL,
        phone_cc       text    NOT NULL,
        phone_national text    NOT NULL
    ) ON COMMIT DROP;

    INSERT INTO tmp_athyper_entities VALUES
    -- ── ATHQ: Group Holdings (MY — Kuala Lumpur) ────────────────────────────
    ('legal_entity','LE-ATHQ','ATHQ-KUL','Athyper Group Holdings — KL',
     'Level 38, Petronas Twin Tower 2','KLCC, Jalan Ampang',
     'Kuala Lumpur','Federal Territory of KL','50088','MY',
     'athq@athyper.com','athq','athyper.com',
     '+60321640000','+60','321640000'),
    ('company_code','ATHQ','ATHQ-KUL','Athyper Group Holdings — KL',
     'Level 38, Petronas Twin Tower 2','KLCC, Jalan Ampang',
     'Kuala Lumpur','Federal Territory of KL','50088','MY',
     'ops.athq@athyper.com','ops.athq','athyper.com',
     '+60321640001','+60','321640001'),

    -- ── AMRE: Malaysia Real Estate (MY — Kuala Lumpur) ──────────────────────
    ('legal_entity','LE-AMRE','AMRE-KUL','Athyper Malaysia Real Estate — KL',
     'Suite 1203, 1 First Avenue','Bandar Utama',
     'Kuala Lumpur','Federal Territory of KL','47800','MY',
     'amre@athyper.com','amre','athyper.com',
     '+60377101200','+60','377101200'),
    ('company_code','AMRE','AMRE-KUL','Athyper Malaysia Real Estate — KL',
     'Suite 1203, 1 First Avenue','Bandar Utama',
     'Kuala Lumpur','Federal Territory of KL','47800','MY',
     'ops.amre@athyper.com','ops.amre','athyper.com',
     '+60377101201','+60','377101201'),

    -- ── AQTU: Qatar Utilities (QA — Doha) ───────────────────────────────────
    ('legal_entity','LE-AQTU','AQTU-DOH','Athyper Qatar Utilities — Doha',
     'West Bay Business Park, Tower 1','P.O. Box 22119',
     'Doha','Baladiyat ad Dawhah','22119','QA',
     'aqtu@athyper.com','aqtu','athyper.com',
     '+97444515000','+974','44515000'),
    ('company_code','AQTU','AQTU-DOH','Athyper Qatar Utilities — Doha',
     'West Bay Business Park, Tower 1','P.O. Box 22119',
     'Doha','Baladiyat ad Dawhah','22119','QA',
     'ops.aqtu@athyper.com','ops.aqtu','athyper.com',
     '+97444515001','+974','44515001'),

    -- ── ASAC: Saudi Construction (SA — Riyadh) ──────────────────────────────
    ('legal_entity','LE-ASAC','ASAC-RUH','Athyper Saudi Construction — Riyadh',
     'King Fahd District, P.O. Box 9025',NULL,
     'Riyadh','Riyadh Province','11413','SA',
     'asac@athyper.com','asac','athyper.com',
     '+966114791100','+966','114791100'),
    ('company_code','ASAC','ASAC-RUH','Athyper Saudi Construction — Riyadh',
     'King Fahd District, P.O. Box 9025',NULL,
     'Riyadh','Riyadh Province','11413','SA',
     'ops.asac@athyper.com','ops.asac','athyper.com',
     '+966114791101','+966','114791101'),

    -- ── AQTS: Qatar Transport & Storage (QA — Doha) ─────────────────────────
    ('legal_entity','LE-AQTS','AQTS-DOH','Athyper Qatar Transport — Doha',
     'Al Muntazah District, P.O. Box 9845',NULL,
     'Doha','Baladiyat ad Dawhah','9845','QA',
     'aqts@athyper.com','aqts','athyper.com',
     '+97444556000','+974','44556000'),
    ('company_code','AQTS','AQTS-DOH','Athyper Qatar Transport — Doha',
     'Al Muntazah District, P.O. Box 9845',NULL,
     'Doha','Baladiyat ad Dawhah','9845','QA',
     'ops.aqts@athyper.com','ops.aqts','athyper.com',
     '+97444556001','+974','44556001'),

    -- ── AUET: UAE Trading (AE — Dubai, DAFZ) ────────────────────────────────
    ('legal_entity','LE-AUET','AUET-DXB','Athyper UAE Trading — Dubai',
     'Dubai Airport Free Zone, Office 3W-110',NULL,
     'Dubai','Dubai Emirate','54000','AE',
     'auet@athyper.com','auet','athyper.com',
     '+97146013000','+971','46013000'),
    ('company_code','AUET','AUET-DXB','Athyper UAE Trading — Dubai',
     'Dubai Airport Free Zone, Office 3W-110',NULL,
     'Dubai','Dubai Emirate','54000','AE',
     'ops.auet@athyper.com','ops.auet','athyper.com',
     '+97146013001','+971','46013001'),

    -- ── ASAH: Saudi Hospitality (SA — Riyadh) ───────────────────────────────
    ('legal_entity','LE-ASAH','ASAH-RUH','Athyper Saudi Hospitality — Riyadh',
     'Olaya Road, Al Mursalat, P.O. Box 12345',NULL,
     'Riyadh','Riyadh Province','11372','SA',
     'asah@athyper.com','asah','athyper.com',
     '+966114628000','+966','114628000'),
    ('company_code','ASAH','ASAH-RUH','Athyper Saudi Hospitality — Riyadh',
     'Olaya Road, Al Mursalat, P.O. Box 12345',NULL,
     'Riyadh','Riyadh Province','11372','SA',
     'ops.asah@athyper.com','ops.asah','athyper.com',
     '+966114628001','+966','114628001'),

    -- ── AUIC: US Information & Communication (US — New York) ────────────────
    ('legal_entity','LE-AUIC','AUIC-NYC','Athyper US InfoComm — New York',
     '1407 Broadway, Suite 1700',NULL,
     'New York','New York','10018','US',
     'auic@athyper.com','auic','athyper.com',
     '+12125057000','+1','2125057000'),
    ('company_code','AUIC','AUIC-NYC','Athyper US InfoComm — New York',
     '1407 Broadway, Suite 1700',NULL,
     'New York','New York','10018','US',
     'ops.auic@athyper.com','ops.auic','athyper.com',
     '+12125057001','+1','2125057001'),

    -- ── ASGF: Singapore Financial Services (SG) ─────────────────────────────
    ('legal_entity','LE-ASGF','ASGF-SIN','Athyper Singapore Financial — SIN',
     '1 Raffles Place, #44-01',NULL,
     'Singapore','Central Region','048616','SG',
     'asgf@athyper.com','asgf','athyper.com',
     '+6563208000','+65','63208000'),
    ('company_code','ASGF','ASGF-SIN','Athyper Singapore Financial — SIN',
     '1 Raffles Place, #44-01',NULL,
     'Singapore','Central Region','048616','SG',
     'ops.asgf@athyper.com','ops.asgf','athyper.com',
     '+6563208001','+65','63208001'),

    -- ── AITM: India Textile & Leather Mfg (IN — Mumbai) ────────────────────
    ('legal_entity','LE-AITM','AITM-BOM','Athyper India Textile Mfg — Mumbai',
     '701 Maker Chambers IV, Nariman Point',NULL,
     'Mumbai','Maharashtra','400021','IN',
     'aitm@athyper.com','aitm','athyper.com',
     '+912222819000','+91','2222819000'),
    ('company_code','AITM','AITM-BOM','Athyper India Textile Mfg — Mumbai',
     '701 Maker Chambers IV, Nariman Point',NULL,
     'Mumbai','Maharashtra','400021','IN',
     'ops.aitm@athyper.com','ops.aitm','athyper.com',
     '+912222819001','+91','2222819001'),

    -- ── ACFB: Canada Food & Beverage Mfg (CA — Toronto) ────────────────────
    ('legal_entity','LE-ACFB','ACFB-YYZ','Athyper Canada Food & Bev — Toronto',
     'Suite 2500, 100 King Street West',NULL,
     'Toronto','Ontario','M5X1B8','CA',
     'acfb@athyper.com','acfb','athyper.com',
     '+14168623000','+1','4168623000'),
    ('company_code','ACFB','ACFB-YYZ','Athyper Canada Food & Bev — Toronto',
     'Suite 2500, 100 King Street West',NULL,
     'Toronto','Ontario','M5X1B8','CA',
     'ops.acfb@athyper.com','ops.acfb','athyper.com',
     '+14168623001','+1','4168623001'),

    -- ── ADPM: Germany Pharmaceutical Mfg (DE — Frankfurt) ───────────────────
    ('legal_entity','LE-ADPM','ADPM-FRA','Athyper Germany Pharma — Frankfurt',
     'Taunusanlage 8',NULL,
     'Frankfurt','Hessen','60329','DE',
     'adpm@athyper.com','adpm','athyper.com',
     '+496997207000','+49','6997207000'),
    ('company_code','ADPM','ADPM-FRA','Athyper Germany Pharma — Frankfurt',
     'Taunusanlage 8',NULL,
     'Frankfurt','Hessen','60329','DE',
     'ops.adpm@athyper.com','ops.adpm','athyper.com',
     '+496997207001','+49','6997207001'),

    -- ── ATEM: Taiwan Electronics Mfg (TW — Taipei) ──────────────────────────
    ('legal_entity','LE-ATEM','ATEM-TPE','Athyper Taiwan Electronics — Taipei',
     '12F, 333 Keelung Road, Section 1',NULL,
     'Taipei','Taipei City','11012','TW',
     'atem@athyper.com','atem','athyper.com',
     '+886227578000','+886','227578000'),
    ('company_code','ATEM','ATEM-TPE','Athyper Taiwan Electronics — Taipei',
     '12F, 333 Keelung Road, Section 1',NULL,
     'Taipei','Taipei City','11012','TW',
     'ops.atem@athyper.com','ops.atem','athyper.com',
     '+886227578001','+886','227578001'),

    -- ── ASPE: South Africa Petroleum Extraction (ZA — Johannesburg) ─────────
    ('legal_entity','LE-ASPE','ASPE-JNB','Athyper SA Petroleum — Johannesburg',
     '150 West Street, Sandton',NULL,
     'Johannesburg','Gauteng','2196','ZA',
     'aspe@athyper.com','aspe','athyper.com',
     '+27113228000','+27','113228000'),
    ('company_code','ASPE','ASPE-JNB','Athyper SA Petroleum — Johannesburg',
     '150 West Street, Sandton',NULL,
     'Johannesburg','Gauteng','2196','ZA',
     'ops.aspe@athyper.com','ops.aspe','athyper.com',
     '+27113228001','+27','113228001'),

    -- ── AUKA: UK Agriculture (GB — London) ──────────────────────────────────
    ('legal_entity','LE-AUKA','AUKA-LON','Athyper UK Agriculture — London',
     '1 Canada Square, Canary Wharf',NULL,
     'London','England','E14 5AB','GB',
     'auka@athyper.com','auka','athyper.com',
     '+442074188000','+44','2074188000'),
    ('company_code','AUKA','AUKA-LON','Athyper UK Agriculture — London',
     '1 Canada Square, Canary Wharf',NULL,
     'London','England','E14 5AB','GB',
     'ops.auka@athyper.com','ops.auka','athyper.com',
     '+442074188001','+44','2074188001'),

    -- ── AJED: Japan Education Services (JP — Tokyo) ─────────────────────────
    ('legal_entity','LE-AJED','AJED-TYO','Athyper Japan Education — Tokyo',
     '2-7-1 Yurakucho, Chiyoda-ku',NULL,
     'Tokyo','Tokyo Metropolis','100-0006','JP',
     'ajed@athyper.com','ajed','athyper.com',
     '+81352207000','+81','352207000'),
    ('company_code','AJED','AJED-TYO','Athyper Japan Education — Tokyo',
     '2-7-1 Yurakucho, Chiyoda-ku',NULL,
     'Tokyo','Tokyo Metropolis','100-0006','JP',
     'ops.ajed@athyper.com','ops.ajed','athyper.com',
     '+81352207001','+81','352207001'),

    -- ── APHS: Philippines Hospital Services (PH — Taguig/BGC) ───────────────
    ('legal_entity','LE-APHS','APHS-MNL','Athyper Philippines Hospital — BGC',
     '16F Bonifacio One Technology Tower','31st Street, Bonifacio Global City',
     'Taguig','Metro Manila','1634','PH',
     'aphs@athyper.com','aphs','athyper.com',
     '+63288179000','+63','288179000'),
    ('company_code','APHS','APHS-MNL','Athyper Philippines Hospital — BGC',
     '16F Bonifacio One Technology Tower','31st Street, Bonifacio Global City',
     'Taguig','Metro Manila','1634','PH',
     'ops.aphs@athyper.com','ops.aphs','athyper.com',
     '+63288179001','+63','288179001');

    -- ── Process each entity ──────────────────────────────────────────────────
    FOR rec IN SELECT * FROM tmp_athyper_entities ORDER BY entity_code, entity_type LOOP

        v_entity_id := NULL;
        v_addr_id   := NULL;
        v_cl_id     := NULL;

        IF rec.entity_type = 'legal_entity' THEN
            SELECT id INTO v_entity_id FROM master.legal_entity
            WHERE tenant_id = v_tid AND code = rec.entity_code;
        ELSE
            SELECT id INTO v_entity_id FROM master.company_code
            WHERE tenant_id = v_tid AND code = rec.entity_code;
        END IF;

        IF v_entity_id IS NULL THEN
            RAISE WARNING '[003_address_contacts] % % not found — skipped',
                rec.entity_type, rec.entity_code;
            CONTINUE;
        END IF;

        -- Upsert address (LE/CC pairs sharing a location reuse the same row)
        INSERT INTO master.address (
            tenant_id, code, name, address_type,
            line1, line2, city, region, postal_code, country_code,
            formatted_address, status, created_by
        ) VALUES (
            v_tid, lower(rec.addr_code), rec.addr_name, 'commercial',
            rec.addr_line1, rec.addr_line2,
            rec.addr_city, rec.addr_region, rec.addr_postal, rec.addr_country,
            CONCAT_WS(', ', rec.addr_line1, rec.addr_city, rec.addr_postal, rec.addr_country),
            'active', v_su
        )
        ON CONFLICT (tenant_id, country_code, postal_code, line1, city)
            WHERE (line1 IS NOT NULL) AND (postal_code IS NOT NULL) AND (status = 'active'::text)
        DO UPDATE SET name = EXCLUDED.name
        RETURNING id INTO v_addr_id;

        INSERT INTO master.address_link (
            tenant_id, owner_type, owner_id, address_id, purpose, is_primary, created_by
        ) VALUES (v_tid, rec.entity_type, v_entity_id, v_addr_id, 'hq', true, v_su)
        ON CONFLICT (tenant_id, owner_type, owner_id, purpose, address_id) DO NOTHING;

        -- Email
        INSERT INTO master.contact_link (
            tenant_id, owner_type, owner_id, channel_type, value,
            purpose, is_primary, is_verified, verified_at, status, created_by
        ) VALUES (v_tid, rec.entity_type, v_entity_id, 'email', rec.email,
            'support', true, true, now(), 'active', v_su)
        ON CONFLICT (tenant_id, owner_type, owner_id, channel_type, value, purpose) DO NOTHING;

        SELECT id INTO v_cl_id FROM master.contact_link
        WHERE tenant_id = v_tid AND owner_type = rec.entity_type
          AND owner_id = v_entity_id AND channel_type = 'email'
          AND value = rec.email AND purpose = 'support';

        INSERT INTO master.contact_email (
            tenant_id, contact_link_id, local_part, domain, mx_valid, created_by
        ) VALUES (v_tid, v_cl_id, rec.email_local, rec.email_domain, true, v_su)
        ON CONFLICT (tenant_id, contact_link_id) DO NOTHING;

        v_cl_id := NULL;

        -- Phone
        INSERT INTO master.contact_link (
            tenant_id, owner_type, owner_id, channel_type, value,
            purpose, is_primary, is_verified, verified_at, status, created_by
        ) VALUES (v_tid, rec.entity_type, v_entity_id, 'phone', rec.phone_e164,
            'support', true, true, now(), 'active', v_su)
        ON CONFLICT (tenant_id, owner_type, owner_id, channel_type, value, purpose) DO NOTHING;

        SELECT id INTO v_cl_id FROM master.contact_link
        WHERE tenant_id = v_tid AND owner_type = rec.entity_type
          AND owner_id = v_entity_id AND channel_type = 'phone'
          AND value = rec.phone_e164 AND purpose = 'support';

        INSERT INTO master.contact_phone (
            tenant_id, contact_link_id, e164, calling_code, national_number, line_type, created_by
        ) VALUES (v_tid, v_cl_id, rec.phone_e164, ltrim(rec.phone_cc, '+'), rec.phone_national, 'landline', v_su)
        ON CONFLICT (tenant_id, contact_link_id) DO NOTHING;

    END LOOP;

    RAISE NOTICE '[003_address_contacts] Athyper: tenant + 17 LEs + 17 CCs — addresses and contacts seeded';

END $athyper_addr$;
