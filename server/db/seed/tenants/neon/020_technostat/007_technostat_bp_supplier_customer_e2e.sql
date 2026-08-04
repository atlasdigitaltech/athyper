-- =============================================================================
-- FILE:    tenants/neon/020_technostat/007_technostat_bp_supplier_customer_e2e.sql
-- Tenant:  Technostat Group (tenant code: technostat)
--
-- Purpose:
--   Modernized business-partner fixture for Neon using canonical BP contracts.
--
-- Notes:
--   This packet is intentionally scoped to canonical Neon contracts only.
--   Legacy tables (party_* , supplier_qualification, customer_qualification,
--   business_partner_network_link, etc.) are retired from this pack.
--
--   Idempotency: each write is guarded by existence checks.
-- =============================================================================

DO $tksa_bp_seed$
DECLARE
    v_tid                      uuid;
    v_sys                      uuid;
    v_ot_business_partner      uuid;
    v_ot_supplier              uuid;
    v_ot_customer              uuid;

    v_bp_technostat           uuid;
    v_bp_supplier_gbl          uuid;
    v_bp_customer_gbl          uuid;
    v_addr                    uuid;
    v_sup                     uuid;
    v_cus                     uuid;
    v_sup_role_id              uuid;
    v_cus_role_id              uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant
    WHERE realm_key = 'athyper' AND code = 'technostat';
    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[technostat bp seed] tenant not found';
    END IF;

    SELECT created_by INTO v_sys FROM master.tenant WHERE id = v_tid;
    IF v_sys IS NULL THEN
        RAISE EXCEPTION '[technostat bp seed] tenant.created_by is required for seed inserts';
    END IF;

    SELECT id INTO v_ot_business_partner
      FROM control.owner_type
     WHERE tenant_id IS NULL
       AND code = 'business_partner'
     LIMIT 1;
    SELECT id INTO v_ot_supplier
      FROM control.owner_type
     WHERE tenant_id IS NULL
       AND code = 'supplier'
     LIMIT 1;
    SELECT id INTO v_ot_customer
      FROM control.owner_type
     WHERE tenant_id IS NULL
       AND code = 'customer'
     LIMIT 1;

    IF v_ot_business_partner IS NULL OR v_ot_supplier IS NULL OR v_ot_customer IS NULL THEN
        RAISE EXCEPTION '[technostat bp seed] owner_type IDs missing in control.owner_type';
    END IF;

    ---------------------------------------------------------------------------
    -- Shared reference data
    ---------------------------------------------------------------------------
    INSERT INTO master.payment_method (tenant_id, code, name, direction, instrument_mode, status, created_by)
    SELECT v_tid, v.code, v.name, v.direction, 'bank_transfer', 'active', v_sys
    FROM (VALUES
        ('SARIE-SAR', 'SAR Wire Transfer (SARIE)', 'outbound'::text),
        ('SADAD-SAR', 'SAR Collection (SADAD)', 'inbound'::text),
        ('WIRE-EGP',  'EGP Wire Transfer', 'outbound'::text),
        ('RTGS-EGP',  'EGP RTGS Collection', 'inbound'::text)
    ) AS v(code, name, direction)
    WHERE NOT EXISTS (
        SELECT 1 FROM master.payment_method pm
        WHERE pm.tenant_id = v_tid
          AND pm.code = v.code
    );

    INSERT INTO master.payment_term (
        tenant_id, code, name, version, is_current_version,
        applicable_to, base_event, due_rule_type, due_days,
        due_date_flexibility, business_day_convention,
        status, created_by
    )
    SELECT v_tid, v.code, v.name, 1, true,
           'BOTH'::text, 'INVOICE_DATE'::text, 'NET_DAYS'::text, v.days,
           'FIXED'::text, 'FOLLOWING'::text,
           'active'::text, v_sys
    FROM (VALUES
        ('PT-NET30', 'Net 30 Days', 30),
        ('PT-NET45', 'Net 45 Days', 45),
        ('PT-NET60', 'Net 60 Days', 60)
    ) AS v(code, name, days)
    WHERE NOT EXISTS (
        SELECT 1
          FROM master.payment_term pt
         WHERE pt.tenant_id = v_tid
           AND pt.code = v.code
           AND pt.version = 1
           AND pt.is_current_version = true
    );

    INSERT INTO master.certification_type (
        tenant_id, code, name, issuing_body,
        category, description, is_custom, metadata, status, created_by
    )
    SELECT
        v_tid,
        'zatca-einv',
        'ZATCA Phase 2 e-Invoicing Compliance',
        'Zakat Tax and Customs Authority',
        'financial',
        'Saudi Arabia mandatory e-invoicing compliance marker.',
        true,
        jsonb_build_object('_seed','tksa_party_master_modern'),
        'active',
        v_sys
    WHERE NOT EXISTS (
        SELECT 1
          FROM master.certification_type
         WHERE tenant_id = v_tid
           AND code = 'zatca-einv'
    );

    ---------------------------------------------------------------------------
    -- Core business partner identity (canonical): Technostat Group HQ
    ---------------------------------------------------------------------------
    INSERT INTO master.business_partner (
        tenant_id, code, name, display_name, legal_name,
        partner_category, legal_form, registration_country_code,
        incorporation_date, website_url,
        aliases, metadata, status, created_by
    )
    SELECT
        v_tid,
        'INT-TKSA',
        'Technostat Group HQ',
        'Technostat HQ',
        'Technostat Group Company',
        'organization',
        'joint_stock',
        'SA',
        DATE '2010-03-15',
        'https://www.technostat.com.sa',
        ARRAY['Technostat KSA','TKSA HQ']::text[],
        jsonb_build_object(
            '_seed', jsonb_build_object('pack','tksa_party_master_v2','seeded_at',now()::text),
            'erp_code', '100000001'
        ),
        'active',
        v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.business_partner bp
        WHERE bp.tenant_id = v_tid
          AND bp.code = 'INT-TKSA'
    );

    SELECT id INTO v_bp_technostat
      FROM master.business_partner
     WHERE tenant_id = v_tid
       AND code = 'INT-TKSA';

    INSERT INTO master.address (
        tenant_id, address_type, line1, line2, city, region, postal_code, country_code,
        metadata, status, created_by
    )
    SELECT v_tid,
           'commercial',
           'King Fahd Road, Al Olaya District',
           'Al Faisaliah Tower, 22nd Floor',
           'Riyadh', 'Riyadh Region', '12214', 'SA',
           jsonb_build_object('_seed','tksa_party_master_v2'),
           'active', v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.address a
           WHERE a.tenant_id = v_tid
             AND a.address_type = 'commercial'
             AND a.line1 = 'King Fahd Road, Al Olaya District'
             AND a.line2 = 'Al Faisaliah Tower, 22nd Floor'
             AND a.country_code = 'SA'
    )
    RETURNING id INTO v_addr;

    IF v_addr IS NULL THEN
        SELECT id INTO v_addr
          FROM master.address
         WHERE tenant_id = v_tid
           AND address_type = 'commercial'
           AND line1 = 'King Fahd Road, Al Olaya District'
           AND line2 = 'Al Faisaliah Tower, 22nd Floor'
           AND country_code = 'SA'
         LIMIT 1;
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM master.address_link al
         WHERE al.tenant_id = v_tid
           AND al.owner_type_id = v_ot_business_partner
           AND al.owner_id = v_bp_technostat
           AND al.address_id = v_addr
    ) THEN
        INSERT INTO master.address_link (
            tenant_id, owner_type_id, owner_id, address_id, purpose, role_qualifier,
            is_primary, effective_from, metadata, created_by
        ) VALUES (
            v_tid, v_ot_business_partner, v_bp_technostat, v_addr,
            'default', NULL, true, DATE '2010-03-15',
            jsonb_build_object('_seed','tksa_party_master_v2'), v_sys
        );
    END IF;

    INSERT INTO master.business_partner_identifier (
        tenant_id, business_partner_id, scheme_code, identifier_value,
        issuing_authority, issued_at, is_primary,
        verified_at, verified_by, metadata, status, created_by
    )
    SELECT v_tid, v_bp_technostat, v.scheme_code, v.identifier_value,
           v.issuing_authority, v.issued_at, v.is_primary,
           now(), v_sys, jsonb_build_object('_seed','tksa_party_master_v2'),
           'active', v_sys
      FROM (VALUES
        ('business_registration','CR-1010123456','Ministry of Commerce KSA', DATE '2010-03-15', true),
        ('lei','310100145600003','ZATCA', DATE '2010-04-01', false)
      ) AS v(scheme_code, identifier_value, issuing_authority, issued_at, is_primary)
    WHERE NOT EXISTS (
        SELECT 1
          FROM master.business_partner_identifier idn
         WHERE idn.tenant_id = v_tid
           AND idn.business_partner_id = v_bp_technostat
           AND idn.scheme_code = v.scheme_code
    );

    ---------------------------------------------------------------------------
    -- Canonical supplier/customer roles for the same BP.
    ---------------------------------------------------------------------------
    SELECT id INTO v_sup
      FROM master.supplier
     WHERE tenant_id = v_tid
       AND supplier_code = 'SUP-TKSA'
     LIMIT 1;

    IF v_sup IS NULL THEN
        INSERT INTO master.supplier (
            tenant_id, business_partner_id, supplier_code, metadata, status, created_by
        )
        SELECT v_tid, v_bp_technostat, 'SUP-TKSA',
               jsonb_build_object('_seed','tksa_party_master_v2'),
               'onboarding', v_sys
        WHERE NOT EXISTS (
            SELECT 1 FROM master.supplier s
             WHERE s.tenant_id = v_tid
               AND s.business_partner_id = v_bp_technostat
        )
        RETURNING id INTO v_sup;
    END IF;

    IF v_sup IS NULL THEN
        SELECT id INTO v_sup
          FROM master.supplier
         WHERE tenant_id = v_tid AND business_partner_id = v_bp_technostat;
    END IF;

    SELECT id INTO v_sup_role_id FROM control.owner_type WHERE tenant_id IS NULL AND code='supplier' LIMIT 1;

    IF NOT EXISTS (
      SELECT 1 FROM master.contact_link cl
       WHERE cl.tenant_id = v_tid
         AND cl.owner_type_id = v_ot_supplier
         AND cl.owner_id = v_sup
         AND cl.channel_type = 'email'
    ) THEN
      INSERT INTO master.contact_link (
          tenant_id, owner_type_id, owner_id,
          channel_type, value, purpose, is_primary,
          is_verified, verified_at, metadata, status, created_by
      ) VALUES (
          v_tid, v_ot_supplier, v_sup,
          'email', 'procure@technostat.com.sa', 'default', true,
          true, now(), jsonb_build_object('_seed','tksa_party_master_v2'),
          'active', v_sys
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM master.contact_link cl
       WHERE cl.tenant_id = v_tid
         AND cl.owner_type_id = v_ot_supplier
         AND cl.owner_id = v_sup
         AND cl.channel_type = 'phone'
    ) THEN
      INSERT INTO master.contact_link (
          tenant_id, owner_type_id, owner_id,
          channel_type, value, purpose, is_primary,
          is_verified, verified_at, metadata, status, created_by
      ) VALUES (
          v_tid, v_ot_supplier, v_sup,
          'phone', '+966112341234', 'default', false,
          true, now(), jsonb_build_object('_seed','tksa_party_master_v2'),
          'active', v_sys
      );
    END IF;

    ---------------------------------------------------------------------------
    -- Secondary customer BP for E2E breadth.
    ---------------------------------------------------------------------------
    INSERT INTO master.business_partner (
        tenant_id, code, name, display_name, legal_name,
        partner_category, legal_form, registration_country_code,
        incorporation_date, website_url,
        aliases, metadata, status, created_by
    )
    SELECT
        v_tid,
        'INT-TEGY',
        'Technostat Egypt Ops',
        'Technostat Egypt',
        'Technostat Egypt S.A.E.',
        'organization',
        'joint_stock',
        'EG',
        DATE '2015-09-01',
        'https://www.technostat.com.eg',
        ARRAY['Technostat Egypt','TEGY']::text[],
        jsonb_build_object('_seed', jsonb_build_object('pack','tksa_party_master_v2','seeded_at',now()::text)),
        'active',
        v_sys
    WHERE NOT EXISTS (
        SELECT 1 FROM master.business_partner bp
        WHERE bp.tenant_id = v_tid
          AND bp.code = 'INT-TEGY'
    );

    SELECT id INTO v_bp_supplier_gbl
      FROM master.business_partner
     WHERE tenant_id = v_tid AND code = 'INT-TEGY';

    SELECT id INTO v_cus
      FROM master.customer
     WHERE tenant_id = v_tid
       AND customer_code = 'CUS-TEGY'
     LIMIT 1;

    IF v_cus IS NULL THEN
        INSERT INTO master.customer (
            tenant_id, business_partner_id, customer_code, is_key_account,
            metadata, status, created_by
        )
        SELECT v_tid, v_bp_supplier_gbl, 'CUS-TEGY', true,
               jsonb_build_object('_seed','tksa_party_master_v2'),
               'active', v_sys
        WHERE NOT EXISTS (
            SELECT 1 FROM master.customer c
             WHERE c.tenant_id = v_tid AND c.business_partner_id = v_bp_supplier_gbl
        )
        RETURNING id INTO v_cus;
    END IF;

    IF v_cus IS NULL THEN
        SELECT id INTO v_cus
          FROM master.customer
         WHERE tenant_id = v_tid AND business_partner_id = v_bp_supplier_gbl;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM master.contact_link cl
       WHERE cl.tenant_id = v_tid
         AND cl.owner_type_id = v_ot_customer
         AND cl.owner_id = v_cus
         AND cl.channel_type = 'email'
    ) THEN
      INSERT INTO master.contact_link (
          tenant_id, owner_type_id, owner_id,
          channel_type, value, purpose, is_primary,
          is_verified, verified_at, metadata, status, created_by
      ) VALUES (
          v_tid, v_ot_customer, v_cus,
          'email', 'billing@technostat.com.eg', 'default', true,
          true, now(), jsonb_build_object('_seed','tksa_party_master_v2'),
          'active', v_sys
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM master.contact_link cl
       WHERE cl.tenant_id = v_tid
         AND cl.owner_type_id = v_ot_customer
         AND cl.owner_id = v_cus
         AND cl.channel_type = 'phone'
    ) THEN
      INSERT INTO master.contact_link (
          tenant_id, owner_type_id, owner_id,
          channel_type, value, purpose, is_primary,
          is_verified, verified_at, metadata, status, created_by
      ) VALUES (
          v_tid, v_ot_customer, v_cus,
          'phone', '+201234567890', 'default', false,
          true, now(), jsonb_build_object('_seed','tksa_party_master_v2'),
          'active', v_sys
      );
    END IF;

    RAISE NOTICE '[technostat bp seed] Modernized BP fixture applied for tenant %', v_tid;
END;
$tksa_bp_seed$;
