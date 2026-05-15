-- ============================================================================
-- CIRRUSATLANTIC — TENANT, LEGAL ENTITY & COMPANY CODE ADDRESSES + CONTACTS
-- ============================================================================
-- File:     003_address_contacts.sql
-- Schemas:  master.address, master.address_link,
--           master.contact_link, master.contact_email, master.contact_phone
-- Purpose:  Seed HQ address and primary support contacts (email + phone) for
--           the CirrusAtlantic tenant, legal entity CATL, and company code CATL.
--           All three share 20 Fenchurch Street, London (one address row,
--           three address_links — tenant / legal_entity / company_code).
-- Depends:  000_tenant.sql, 100_org_structure/200_legal_entities.sql
-- Idempotent: Yes — ON CONFLICT DO NOTHING / DO UPDATE throughout
-- ============================================================================

DO $catl_addr$
DECLARE
    v_su      uuid := '00000000-0000-0000-0000-000000000000';
    v_tid     uuid;
    v_le_id   uuid;
    v_cc_id   uuid;
    v_addr_id uuid;
    v_cl_id   uuid;
BEGIN

    -- ── Resolve tenant ───────────────────────────────────────────────────────
    SELECT id INTO v_tid FROM master.tenant
    WHERE realm_key = 'athyper' AND code = 'cirrusatlantic';

    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[003_address_contacts] CirrusAtlantic tenant not found';
    END IF;

    SELECT id INTO v_le_id FROM master.legal_entity
    WHERE tenant_id = v_tid AND code = 'CATL';

    SELECT id INTO v_cc_id FROM master.company_code
    WHERE tenant_id = v_tid AND code = 'CATL';

    -- =========================================================================
    -- ADDRESS: 20 Fenchurch Street, London — shared by tenant, LE-CATL, CC-CATL
    -- =========================================================================

    INSERT INTO master.address (
        tenant_id, code, name, address_type,
        line1, line2, city, region, postal_code, country_code,
        formatted_address, status, created_by
    ) VALUES (
        v_tid, 'catl-hq-lon', 'CirrusAtlantic HQ — London', 'commercial',
        '20 Fenchurch Street', 'Level 21',
        'London', 'England', 'EC3M 3BY', 'GB',
        '20 Fenchurch Street, Level 21, London EC3M 3BY, UK',
        'active', v_su
    )
    ON CONFLICT (tenant_id, country_code, postal_code, line1, city)
        WHERE (line1 IS NOT NULL) AND (postal_code IS NOT NULL) AND (status = 'active'::text)
    DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_addr_id;

    -- ── Address links: tenant + LE + CC → same London HQ ────────────────────
    INSERT INTO master.address_link (tenant_id, owner_type, owner_id, address_id, purpose, is_primary, created_by)
    VALUES
        (v_tid, 'tenant',       v_tid,   v_addr_id, 'hq', true, v_su),
        (v_tid, 'legal_entity', v_le_id, v_addr_id, 'hq', true, v_su),
        (v_tid, 'company_code', v_cc_id, v_addr_id, 'hq', true, v_su)
    ON CONFLICT (tenant_id, owner_type, owner_id, purpose, address_id) DO NOTHING;

    -- =========================================================================
    -- CONTACTS: Tenant
    -- =========================================================================

    INSERT INTO master.contact_link (tenant_id, owner_type, owner_id, channel_type, value, purpose, is_primary, is_verified, verified_at, status, created_by)
    VALUES (v_tid, 'tenant', v_tid, 'email', 'info@cirrusatlantic.co.uk', 'support', true, true, now(), 'active', v_su)
    ON CONFLICT (tenant_id, owner_type, owner_id, channel_type, value, purpose) DO NOTHING;

    SELECT id INTO v_cl_id FROM master.contact_link
    WHERE tenant_id = v_tid AND owner_type = 'tenant' AND owner_id = v_tid
      AND channel_type = 'email' AND value = 'info@cirrusatlantic.co.uk' AND purpose = 'support';

    INSERT INTO master.contact_email (tenant_id, contact_link_id, local_part, domain, mx_valid, created_by)
    VALUES (v_tid, v_cl_id, 'info', 'cirrusatlantic.co.uk', true, v_su)
    ON CONFLICT (tenant_id, contact_link_id) DO NOTHING;

    INSERT INTO master.contact_link (tenant_id, owner_type, owner_id, channel_type, value, purpose, is_primary, is_verified, verified_at, status, created_by)
    VALUES (v_tid, 'tenant', v_tid, 'phone', '+442071112222', 'support', true, true, now(), 'active', v_su)
    ON CONFLICT (tenant_id, owner_type, owner_id, channel_type, value, purpose) DO NOTHING;

    SELECT id INTO v_cl_id FROM master.contact_link
    WHERE tenant_id = v_tid AND owner_type = 'tenant' AND owner_id = v_tid
      AND channel_type = 'phone' AND value = '+442071112222' AND purpose = 'support';

    INSERT INTO master.contact_phone (tenant_id, contact_link_id, e164, calling_code, national_number, line_type, created_by)
    VALUES (v_tid, v_cl_id, '+442071112222', '44', '2071112222', 'landline', v_su)
    ON CONFLICT (tenant_id, contact_link_id) DO NOTHING;

    -- =========================================================================
    -- CONTACTS: Legal Entity CATL
    -- =========================================================================

    IF v_le_id IS NOT NULL THEN

        INSERT INTO master.contact_link (tenant_id, owner_type, owner_id, channel_type, value, purpose, is_primary, is_verified, verified_at, status, created_by)
        VALUES (v_tid, 'legal_entity', v_le_id, 'email', 'legal@cirrusatlantic.co.uk', 'support', true, true, now(), 'active', v_su)
        ON CONFLICT (tenant_id, owner_type, owner_id, channel_type, value, purpose) DO NOTHING;

        SELECT id INTO v_cl_id FROM master.contact_link
        WHERE tenant_id = v_tid AND owner_type = 'legal_entity' AND owner_id = v_le_id
          AND channel_type = 'email' AND value = 'legal@cirrusatlantic.co.uk' AND purpose = 'support';

        INSERT INTO master.contact_email (tenant_id, contact_link_id, local_part, domain, mx_valid, created_by)
        VALUES (v_tid, v_cl_id, 'legal', 'cirrusatlantic.co.uk', true, v_su)
        ON CONFLICT (tenant_id, contact_link_id) DO NOTHING;

        INSERT INTO master.contact_link (tenant_id, owner_type, owner_id, channel_type, value, purpose, is_primary, is_verified, verified_at, status, created_by)
        VALUES (v_tid, 'legal_entity', v_le_id, 'phone', '+442071112223', 'support', true, true, now(), 'active', v_su)
        ON CONFLICT (tenant_id, owner_type, owner_id, channel_type, value, purpose) DO NOTHING;

        SELECT id INTO v_cl_id FROM master.contact_link
        WHERE tenant_id = v_tid AND owner_type = 'legal_entity' AND owner_id = v_le_id
          AND channel_type = 'phone' AND value = '+442071112223' AND purpose = 'support';

        INSERT INTO master.contact_phone (tenant_id, contact_link_id, e164, calling_code, national_number, line_type, created_by)
        VALUES (v_tid, v_cl_id, '+442071112223', '44', '2071112223', 'landline', v_su)
        ON CONFLICT (tenant_id, contact_link_id) DO NOTHING;

    ELSE
        RAISE WARNING '[003_address_contacts] LE CATL not found — LE contacts skipped';
    END IF;

    -- =========================================================================
    -- CONTACTS: Company Code CATL
    -- =========================================================================

    IF v_cc_id IS NOT NULL THEN

        INSERT INTO master.contact_link (tenant_id, owner_type, owner_id, channel_type, value, purpose, is_primary, is_verified, verified_at, status, created_by)
        VALUES (v_tid, 'company_code', v_cc_id, 'email', 'finance@cirrusatlantic.co.uk', 'support', true, true, now(), 'active', v_su)
        ON CONFLICT (tenant_id, owner_type, owner_id, channel_type, value, purpose) DO NOTHING;

        SELECT id INTO v_cl_id FROM master.contact_link
        WHERE tenant_id = v_tid AND owner_type = 'company_code' AND owner_id = v_cc_id
          AND channel_type = 'email' AND value = 'finance@cirrusatlantic.co.uk' AND purpose = 'support';

        INSERT INTO master.contact_email (tenant_id, contact_link_id, local_part, domain, mx_valid, created_by)
        VALUES (v_tid, v_cl_id, 'finance', 'cirrusatlantic.co.uk', true, v_su)
        ON CONFLICT (tenant_id, contact_link_id) DO NOTHING;

        INSERT INTO master.contact_link (tenant_id, owner_type, owner_id, channel_type, value, purpose, is_primary, is_verified, verified_at, status, created_by)
        VALUES (v_tid, 'company_code', v_cc_id, 'phone', '+442071112224', 'support', true, true, now(), 'active', v_su)
        ON CONFLICT (tenant_id, owner_type, owner_id, channel_type, value, purpose) DO NOTHING;

        SELECT id INTO v_cl_id FROM master.contact_link
        WHERE tenant_id = v_tid AND owner_type = 'company_code' AND owner_id = v_cc_id
          AND channel_type = 'phone' AND value = '+442071112224' AND purpose = 'support';

        INSERT INTO master.contact_phone (tenant_id, contact_link_id, e164, calling_code, national_number, line_type, created_by)
        VALUES (v_tid, v_cl_id, '+442071112224', '44', '2071112224', 'landline', v_su)
        ON CONFLICT (tenant_id, contact_link_id) DO NOTHING;

    ELSE
        RAISE WARNING '[003_address_contacts] CC CATL not found — CC contacts skipped';
    END IF;

    RAISE NOTICE '[003_address_contacts] CirrusAtlantic: tenant + LE CATL + CC CATL — addresses and contacts seeded';

END $catl_addr$;
