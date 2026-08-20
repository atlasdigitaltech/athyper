-- ============================================================================
-- FILE: tenants/neon/010_demo/party_master/003_athq_network_spend_relations.sql
-- Tenant:  athyper / ATHQ
-- Purpose: Network, spend-category, BP-relation, customer-block, and app-index
--          seed for all 5 ATHQ external suppliers and 3 customers.
--
-- §A   Global certification types (iso-14001, pci-dss, soc-2)
-- §B   business_partner_network_capability — Peppol + Ariba + EDI per supplier
-- §C   business_partner_network_link       — one linked account per provider
-- §D   business_partner_relation           — parent, affiliate, distributor links
-- §E   supplier_commodity_category             — primary + secondary spend tags
-- §F   customer_block                      — 1 historical (EPG, lifted) + 1 active (QNP)
-- §G   supplier_app_index refresh          — all 5 external suppliers
-- §H   customer_app_index refresh          — all 3 external customers
--
-- Idempotent: ON CONFLICT DO NOTHING / WHERE NOT EXISTS throughout
-- Depends:    001_athq_supplier_customer.sql (GCM, EPG)
--             002_athq_extended_parties.sql  (PSM, GFL, NIC, AEH, QNP)
-- ============================================================================

-- ════════════════════════════════════════════════════════════════════════════
-- §A  (removed) — Certification types now seeded centrally by
--     platform/003_master/003_certification_type.sql.
-- ════════════════════════════════════════════════════════════════════════════
-- §B  BUSINESS PARTNER NETWORK CAPABILITIES
-- ════════════════════════════════════════════════════════════════════════════
DO $bp_net_cap$
DECLARE
    v_sys uuid := '00000000-0000-0000-0000-000000000000';
    v_tid uuid;

    v_gcm_bp uuid; v_psm_bp uuid; v_gfl_bp uuid;
    v_nic_bp uuid; v_epg_bp uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[003 §B] athyper tenant not found'; END IF;

    SELECT id INTO v_gcm_bp FROM master.business_partner WHERE tenant_id = v_tid AND code = 'GCM-001';
    SELECT id INTO v_psm_bp FROM master.business_partner WHERE tenant_id = v_tid AND code = 'PSM-001';
    SELECT id INTO v_gfl_bp FROM master.business_partner WHERE tenant_id = v_tid AND code = 'GFL-001';
    SELECT id INTO v_nic_bp FROM master.business_partner WHERE tenant_id = v_tid AND code = 'NIC-001';
    SELECT id INTO v_epg_bp FROM master.business_partner WHERE tenant_id = v_tid AND code = 'EPG-001';

    -- ── GCM-001: Peppol (invoice/PO both) + EDI X12 (invoice outbound)
    INSERT INTO master.business_partner_network_capability (
        tenant_id, business_partner_id, provider_code, document_type_id,
        document_direction, profile_id, profile_version, is_supported, verified_at,
        metadata, created_by
    )
    SELECT v_tid, bp, prov, doc, dir, prof_id, prof_ver, true, now(),
           '{"_seed":{"pack":"003_athq_network","version":"1.0.0"}}'::jsonb, v_sys
    FROM (VALUES
        (v_gcm_bp, 'peppol',   'invoice',        'send',  'urn:www.cenbii.eu:transaction:biitrns010:ver2.0', '2.1'),
        (v_gcm_bp, 'peppol',   'order', 'receive',   'urn:www.cenbii.eu:transaction:biitrns001:ver2.0', '2.1'),
        (v_gcm_bp, 'peppol',   'credit_note',    'send',  'urn:www.cenbii.eu:transaction:biitrns014:ver2.0', '2.1'),
        (v_gcm_bp, 'edi_x12',  'invoice',        'send',  '810',                                             '4010'),
        (v_gcm_bp, 'edi_x12',  'order', 'receive',   '850',                                             '4010'),
        (v_psm_bp, 'peppol',   'invoice',        'send',  'urn:www.cenbii.eu:transaction:biitrns010:ver2.0', '2.1'),
        (v_psm_bp, 'peppol',   'order', 'receive',   'urn:www.cenbii.eu:transaction:biitrns001:ver2.0', '2.1'),
        (v_psm_bp, 'ariba',    'order', 'receive',   'cXML_1.2_PO',                                    '1.2'),
        (v_gfl_bp, 'peppol',   'invoice',        'send',  'urn:www.cenbii.eu:transaction:biitrns010:ver2.0', '2.1'),
        (v_gfl_bp, 'edi_x12',  'order', 'receive',   '850',                                             '4010'),
        (v_gfl_bp, 'edi_x12',  'despatch_advice','send',  '856',                                             '4010'),
        (v_nic_bp, 'peppol',   'invoice',        'send',  'urn:www.cenbii.eu:transaction:biitrns010:ver2.0', '3.0'),
        (v_nic_bp, 'peppol',   'order', 'receive',   'urn:www.cenbii.eu:transaction:biitrns001:ver2.0', '3.0'),
        (v_nic_bp, 'ariba',    'order', 'receive',   'cXML_1.2_PO',                                    '1.2'),
        (v_nic_bp, 'ariba',    'invoice',        'send',  'cXML_1.2_INV',                                   '1.2')
    ) AS t(bp, prov, doc, dir, prof_id, prof_ver)
    WHERE bp IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM master.business_partner_network_capability nc
           WHERE nc.tenant_id = v_tid AND nc.business_partner_id = t.bp
             AND nc.provider_code = t.prov AND nc.document_type_id = t.doc
             AND nc.document_direction = t.dir
      );

    RAISE NOTICE '[003_athq_network §B] BP network capabilities seeded (GCM/PSM/GFL/NIC — Peppol/EDI/Ariba)';
END $bp_net_cap$;


-- ════════════════════════════════════════════════════════════════════════════
-- §C  BUSINESS PARTNER NETWORK LINKS
-- ════════════════════════════════════════════════════════════════════════════
DO $bp_net_link$
DECLARE
    v_sys uuid := '00000000-0000-0000-0000-000000000000';
    v_tid uuid;

    v_gcm_bp uuid; v_psm_bp uuid; v_gfl_bp uuid; v_nic_bp uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[003 §C] athyper tenant not found'; END IF;

    SELECT id INTO v_gcm_bp FROM master.business_partner WHERE tenant_id = v_tid AND code = 'GCM-001';
    SELECT id INTO v_psm_bp FROM master.business_partner WHERE tenant_id = v_tid AND code = 'PSM-001';
    SELECT id INTO v_gfl_bp FROM master.business_partner WHERE tenant_id = v_tid AND code = 'GFL-001';
    SELECT id INTO v_nic_bp FROM master.business_partner WHERE tenant_id = v_tid AND code = 'NIC-001';

    -- Peppol: network_account_id = "0009:{VAT}" (UAE GLN scheme)
    -- Ariba:  network_account_id = "AN{ANID}" (Ariba Network ID)
    INSERT INTO master.business_partner_network_link (
        tenant_id, business_partner_id, provider_code, network_account_id,
        connection_status, verification_status, match_confidence, sync_status,
        connected_at, last_synced_at,
        network_snapshot, metadata, created_by
    )
    SELECT v_tid, bp, prov, acc_id,
           'connected', 'verified', 99.00, 'synced',
           now() - interval '90 days', now() - interval '1 day',
           snap, '{"_seed":{"pack":"003_athq_network","version":"1.0.0"}}'::jsonb, v_sys
    FROM (VALUES
        (v_gcm_bp, 'peppol', '0009:100123456000001',
         '{"party_name":"Gulf Construction Materials LLC","country":"AE"}'::jsonb),
        (v_gcm_bp, 'ariba',  'AN01234567890',
         '{"anid":"AN01234567890","company":"Gulf Construction Materials LLC"}'::jsonb),
        (v_psm_bp, 'peppol', '0009:100234567000001',
         '{"party_name":"Pinnacle Synergy Management LLC","country":"AE"}'::jsonb),
        (v_gfl_bp, 'peppol', '0009:101234567000001',
         '{"party_name":"Gulf Freight Logistics WLL","country":"QA"}'::jsonb),
        (v_nic_bp, 'peppol', '0009:100456789000001',
         '{"party_name":"Nexus InfoComm Consulting LLC","country":"AE"}'::jsonb),
        (v_nic_bp, 'ariba',  'AN09876543210',
         '{"anid":"AN09876543210","company":"Nexus InfoComm Consulting LLC"}'::jsonb)
    ) AS t(bp, prov, acc_id, snap)
    WHERE bp IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM master.business_partner_network_link nl
           WHERE nl.tenant_id = v_tid AND nl.business_partner_id = t.bp
             AND nl.provider_code = t.prov
      );

    RAISE NOTICE '[003_athq_network §C] BP network links seeded (GCM/PSM/GFL/NIC)';
END $bp_net_link$;


-- ════════════════════════════════════════════════════════════════════════════
-- §D  BUSINESS PARTNER RELATIONS
-- ════════════════════════════════════════════════════════════════════════════
DO $bp_rel$
DECLARE
    v_sys uuid := '00000000-0000-0000-0000-000000000000';
    v_tid uuid;

    v_gcm_bp uuid; v_psm_bp uuid; v_gfl_bp uuid;
    v_nic_bp uuid; v_aeh_bp uuid; v_qnp_bp uuid;

    -- Placeholder external BP codes for parent/holding companies
    -- (created inline here as org/government BPs — no supplier or customer role)
    v_gcm_parent_bp uuid;
    v_gfl_parent_bp uuid;
    v_nic_affiliate_bp uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[003 §D] athyper tenant not found'; END IF;

    SELECT id INTO v_gcm_bp FROM master.business_partner WHERE tenant_id = v_tid AND code = 'GCM-001';
    SELECT id INTO v_psm_bp FROM master.business_partner WHERE tenant_id = v_tid AND code = 'PSM-001';
    SELECT id INTO v_gfl_bp FROM master.business_partner WHERE tenant_id = v_tid AND code = 'GFL-001';
    SELECT id INTO v_nic_bp FROM master.business_partner WHERE tenant_id = v_tid AND code = 'NIC-001';
    SELECT id INTO v_aeh_bp FROM master.business_partner WHERE tenant_id = v_tid AND code = 'AEH-001';
    SELECT id INTO v_qnp_bp FROM master.business_partner WHERE tenant_id = v_tid AND code = 'QNP-001';

    -- §D1  Parent company stubs for GCM and GFL (identity-only, no commercial role)
    INSERT INTO master.business_partner (
        tenant_id, code, name, display_name, partner_category, description,
        registration_country_code, legal_form, status, metadata, created_by
    ) VALUES
    (v_tid, 'UAE-AGS-HOLD', 'UAE Aggregates & Steel Industries LLC', 'UAE Aggregates',
     'organization', 'Parent group holding company for GCM construction division.',
     'AE', 'private_limited', 'active',
     '{"_seed":{"pack":"003_athq_network","version":"1.0.0"}}'::jsonb, v_sys),
    (v_tid, 'QATLOG-HOLD',  'Qatar Logistics & Maritime Holdings WLL', 'QL Maritime',
     'organization', 'Parent holding group for GFL freight operations.',
     'QA', 'private_limited', 'active',
     '{"_seed":{"pack":"003_athq_network","version":"1.0.0"}}'::jsonb, v_sys),
    (v_tid, 'TECHV-INTL',   'TechVentures International Ltd', 'TechVentures',
     'organization', 'Mumbai-based technology investment group, 60% shareholder of NIC.',
     'IN', 'private_limited', 'active',
     '{"_seed":{"pack":"003_athq_network","version":"1.0.0"}}'::jsonb, v_sys)
    ON CONFLICT (tenant_id, code) DO NOTHING;

    SELECT id INTO v_gcm_parent_bp   FROM master.business_partner WHERE tenant_id = v_tid AND code = 'UAE-AGS-HOLD';
    SELECT id INTO v_gfl_parent_bp   FROM master.business_partner WHERE tenant_id = v_tid AND code = 'QATLOG-HOLD';
    SELECT id INTO v_nic_affiliate_bp FROM master.business_partner WHERE tenant_id = v_tid AND code = 'TECHV-INTL';

    -- §D2  Directional relations
    --      GCM is a subsidiary / distributor of UAE Aggregates parent group
    INSERT INTO master.business_partner_relation (
        tenant_id, from_bp_id, to_bp_id, relation_type, direction,
        country_scope, product_scope,
        effective_from, effective_until, notes,
        metadata, status, created_by
    )
    SELECT v_tid, v_gcm_parent_bp, v_gcm_bp, 'subsidiary_of', 'directional',
           ARRAY['AE']::char(2)[],
           'Construction aggregates, steel rebar, ready-mix concrete',
           '2008-01-01'::date, NULL,
           'GCM is the UAE construction materials subsidiary of UAE Aggregates & Steel Industries LLC.',
           '{"_seed":{"pack":"003_athq_network","version":"1.0.0"}}'::jsonb, 'active', v_sys
    WHERE v_gcm_parent_bp IS NOT NULL AND v_gcm_bp IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM master.business_partner_relation
           WHERE tenant_id = v_tid AND from_bp_id = v_gcm_parent_bp
             AND to_bp_id = v_gcm_bp AND relation_type = 'subsidiary_of'
      );

    --      PSM is an agent of AEH (PSM provides facilities services exclusively to AEH's portfolio)
    INSERT INTO master.business_partner_relation (
        tenant_id, from_bp_id, to_bp_id, relation_type, direction,
        country_scope, product_scope,
        effective_from, effective_until, notes,
        metadata, status, created_by
    )
    SELECT v_tid, v_aeh_bp, v_psm_bp, 'agent_of', 'directional',
           ARRAY['AE']::char(2)[],
           'Facilities management for AEH-owned assets',
           '2023-01-01'::date, NULL,
           'PSM is the preferred FM agent for AEH-owned commercial properties in Abu Dhabi.',
           '{"_seed":{"pack":"003_athq_network","version":"1.0.0"}}'::jsonb, 'active', v_sys
    WHERE v_aeh_bp IS NOT NULL AND v_psm_bp IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM master.business_partner_relation
           WHERE tenant_id = v_tid AND from_bp_id = v_aeh_bp
             AND to_bp_id = v_psm_bp AND relation_type = 'agent_of'
      );

    --      GFL is subsidiary of Qatar Logistics & Maritime Holdings
    INSERT INTO master.business_partner_relation (
        tenant_id, from_bp_id, to_bp_id, relation_type, direction,
        country_scope, product_scope,
        effective_from, effective_until, notes,
        metadata, status, created_by
    )
    SELECT v_tid, v_gfl_parent_bp, v_gfl_bp, 'subsidiary_of', 'directional',
           ARRAY['QA', 'AE', 'SA']::char(2)[],
           NULL,
           '2010-01-01'::date, NULL,
           'GFL is the freight forwarding subsidiary of Qatar Logistics & Maritime Holdings WLL.',
           '{"_seed":{"pack":"003_athq_network","version":"1.0.0"}}'::jsonb, 'active', v_sys
    WHERE v_gfl_parent_bp IS NOT NULL AND v_gfl_bp IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM master.business_partner_relation
           WHERE tenant_id = v_tid AND from_bp_id = v_gfl_parent_bp
             AND to_bp_id = v_gfl_bp AND relation_type = 'subsidiary_of'
      );

    --      NIC is affiliate of TechVentures International
    INSERT INTO master.business_partner_relation (
        tenant_id, from_bp_id, to_bp_id, relation_type, direction,
        country_scope, product_scope,
        effective_from, effective_until, notes,
        metadata, status, created_by
    )
    SELECT v_tid, v_nic_affiliate_bp, v_nic_bp, 'jv_partner_of', 'bidirectional',
           ARRAY['AE', 'IN']::char(2)[],
           'IT consulting, managed services, cloud platforms',
           '2015-09-01'::date, NULL,
           'NIC (60% owned by TechVentures) is a co-investment affiliate. '
           'Shared technology platforms and R&D.',
           '{"_seed":{"pack":"003_athq_network","version":"1.0.0"}}'::jsonb, 'active', v_sys
    WHERE v_nic_affiliate_bp IS NOT NULL AND v_nic_bp IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM master.business_partner_relation
           WHERE tenant_id = v_tid AND from_bp_id = v_nic_affiliate_bp
             AND to_bp_id = v_nic_bp AND relation_type = 'jv_partner_of'
      );

    --      AEH and QNP are business affiliates (joint-venture partner on West Bay project)
    INSERT INTO master.business_partner_relation (
        tenant_id, from_bp_id, to_bp_id, relation_type, direction,
        country_scope, product_scope,
        effective_from, effective_until, notes,
        metadata, status, created_by
    )
    SELECT v_tid, v_aeh_bp, v_qnp_bp, 'jv_partner_of', 'bidirectional',
           ARRAY['QA', 'AE']::char(2)[],
           'Energy infrastructure and real estate co-development',
           '2019-06-01'::date, NULL,
           'AEH and QNP collaborate on energy infrastructure at QNP real estate developments.',
           '{"_seed":{"pack":"003_athq_network","version":"1.0.0"}}'::jsonb, 'active', v_sys
    WHERE v_aeh_bp IS NOT NULL AND v_qnp_bp IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM master.business_partner_relation
           WHERE tenant_id = v_tid AND from_bp_id = v_aeh_bp
             AND to_bp_id = v_qnp_bp AND relation_type = 'jv_partner_of'
      );

    RAISE NOTICE '[003_athq_network §D] BP relations seeded (5 directional/bidirectional links)';
END $bp_rel$;


-- ════════════════════════════════════════════════════════════════════════════
-- §E  SUPPLIER SPEND CATEGORIES
-- ════════════════════════════════════════════════════════════════════════════
DO $sup_spend$
DECLARE
    v_sys uuid := '00000000-0000-0000-0000-000000000000';
    v_tid uuid;

    v_gcm_id uuid; v_psm_id uuid; v_gfl_id uuid; v_nic_id uuid;

    -- Commodity category IDs resolved from universal taxonomy
    v_sc_outsrc  uuid;
    v_sc_safety  uuid;
    v_sc_fac     uuid;
    v_sc_util    uuid;
    v_sc_fleet   uuid;
    v_sc_travel  uuid;
    v_sc_it      uuid;
    v_sc_subs    uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[003 §E] athyper tenant not found'; END IF;

    SELECT id INTO v_gcm_id FROM master.supplier WHERE tenant_id = v_tid AND supplier_code = 'SUP-ATHQ-GCM-001';
    SELECT id INTO v_psm_id FROM master.supplier WHERE tenant_id = v_tid AND supplier_code = 'SUP-ATHQ-PSM-001';
    SELECT id INTO v_gfl_id FROM master.supplier WHERE tenant_id = v_tid AND supplier_code = 'SUP-ATHQ-GFL-001';
    SELECT id INTO v_nic_id FROM master.supplier WHERE tenant_id = v_tid AND supplier_code = 'SUP-ATHQ-NIC-001';

    -- Resolve commodity category IDs from universal taxonomy
    SELECT id INTO v_sc_outsrc FROM master.commodity_category WHERE tenant_id = v_tid AND code = 'SC-OUTSRC';
    SELECT id INTO v_sc_safety FROM master.commodity_category WHERE tenant_id = v_tid AND code = 'SC-SAFETY';
    SELECT id INTO v_sc_fac    FROM master.commodity_category WHERE tenant_id = v_tid AND code = 'SC-FAC';
    SELECT id INTO v_sc_util   FROM master.commodity_category WHERE tenant_id = v_tid AND code = 'SC-UTIL';
    SELECT id INTO v_sc_fleet  FROM master.commodity_category WHERE tenant_id = v_tid AND code = 'SC-FLEET';
    SELECT id INTO v_sc_travel FROM master.commodity_category WHERE tenant_id = v_tid AND code = 'SC-TRAVEL';
    SELECT id INTO v_sc_it     FROM master.commodity_category WHERE tenant_id = v_tid AND code = 'SC-IT';
    SELECT id INTO v_sc_subs   FROM master.commodity_category WHERE tenant_id = v_tid AND code = 'SC-SUBS';

    -- GCM-001: SC-OUTSRC (primary — construction outsourcing), SC-SAFETY (secondary)
    IF v_gcm_id IS NOT NULL AND v_sc_outsrc IS NOT NULL THEN
        INSERT INTO master.supplier_commodity_category (
            tenant_id, supplier_id, commodity_category_id, is_primary,
            effective_from, notes, metadata, status, created_by
        )
        SELECT v_tid, v_gcm_id, v_sc_outsrc, true,
               '2024-01-01'::date,
               'Primary commodity category: construction materials and outsourced subcontracting.',
               '{"_seed":{"pack":"003_athq_network","version":"1.0.0"}}'::jsonb, 'active', v_sys
        WHERE NOT EXISTS (
            SELECT 1 FROM master.supplier_commodity_category
             WHERE tenant_id = v_tid AND supplier_id = v_gcm_id AND commodity_category_id = v_sc_outsrc
        );
    END IF;

    IF v_gcm_id IS NOT NULL AND v_sc_safety IS NOT NULL THEN
        INSERT INTO master.supplier_commodity_category (
            tenant_id, supplier_id, commodity_category_id, is_primary,
            effective_from, notes, metadata, status, created_by
        )
        SELECT v_tid, v_gcm_id, v_sc_safety, false,
               '2024-01-01'::date,
               'Secondary: safety equipment and HSE supplies bundled in construction orders.',
               '{"_seed":{"pack":"003_athq_network","version":"1.0.0"}}'::jsonb, 'active', v_sys
        WHERE NOT EXISTS (
            SELECT 1 FROM master.supplier_commodity_category
             WHERE tenant_id = v_tid AND supplier_id = v_gcm_id AND commodity_category_id = v_sc_safety
        );
    END IF;

    -- PSM-001: SC-FAC (primary), SC-UTIL (secondary)
    IF v_psm_id IS NOT NULL AND v_sc_fac IS NOT NULL THEN
        INSERT INTO master.supplier_commodity_category (
            tenant_id, supplier_id, commodity_category_id, is_primary,
            effective_from, notes, metadata, status, created_by
        )
        SELECT v_tid, v_psm_id, v_sc_fac, true,
               '2023-01-01'::date,
               'Primary commodity category: integrated facilities management.',
               '{"_seed":{"pack":"003_athq_network","version":"1.0.0"}}'::jsonb, 'active', v_sys
        WHERE NOT EXISTS (
            SELECT 1 FROM master.supplier_commodity_category
             WHERE tenant_id = v_tid AND supplier_id = v_psm_id AND commodity_category_id = v_sc_fac
        );
    END IF;

    IF v_psm_id IS NOT NULL AND v_sc_util IS NOT NULL THEN
        INSERT INTO master.supplier_commodity_category (
            tenant_id, supplier_id, commodity_category_id, is_primary,
            effective_from, notes, metadata, status, created_by
        )
        SELECT v_tid, v_psm_id, v_sc_util, false,
               '2023-01-01'::date,
               'Secondary: utility management services (water, electricity).',
               '{"_seed":{"pack":"003_athq_network","version":"1.0.0"}}'::jsonb, 'active', v_sys
        WHERE NOT EXISTS (
            SELECT 1 FROM master.supplier_commodity_category
             WHERE tenant_id = v_tid AND supplier_id = v_psm_id AND commodity_category_id = v_sc_util
        );
    END IF;

    -- GFL-001: SC-FLEET (primary), SC-TRAVEL (secondary)
    IF v_gfl_id IS NOT NULL AND v_sc_fleet IS NOT NULL THEN
        INSERT INTO master.supplier_commodity_category (
            tenant_id, supplier_id, commodity_category_id, is_primary,
            effective_from, notes, metadata, status, created_by
        )
        SELECT v_tid, v_gfl_id, v_sc_fleet, true,
               '2022-07-01'::date,
               'Primary commodity category: freight, fleet, and last-mile delivery services.',
               '{"_seed":{"pack":"003_athq_network","version":"1.0.0"}}'::jsonb, 'active', v_sys
        WHERE NOT EXISTS (
            SELECT 1 FROM master.supplier_commodity_category
             WHERE tenant_id = v_tid AND supplier_id = v_gfl_id AND commodity_category_id = v_sc_fleet
        );
    END IF;

    IF v_gfl_id IS NOT NULL AND v_sc_travel IS NOT NULL THEN
        INSERT INTO master.supplier_commodity_category (
            tenant_id, supplier_id, commodity_category_id, is_primary,
            effective_from, notes, metadata, status, created_by
        )
        SELECT v_tid, v_gfl_id, v_sc_travel, false,
               '2022-07-01'::date,
               'Secondary: business travel logistics bundled with freight bookings.',
               '{"_seed":{"pack":"003_athq_network","version":"1.0.0"}}'::jsonb, 'active', v_sys
        WHERE NOT EXISTS (
            SELECT 1 FROM master.supplier_commodity_category
             WHERE tenant_id = v_tid AND supplier_id = v_gfl_id AND commodity_category_id = v_sc_travel
        );
    END IF;

    -- NIC-001: SC-IT (primary), SC-SUBS (secondary — software subscriptions)
    IF v_nic_id IS NOT NULL AND v_sc_it IS NOT NULL THEN
        INSERT INTO master.supplier_commodity_category (
            tenant_id, supplier_id, commodity_category_id, is_primary,
            effective_from, notes, metadata, status, created_by
        )
        SELECT v_tid, v_nic_id, v_sc_it, true,
               '2024-01-01'::date,
               'Primary commodity category: IT consulting, managed cloud, and SOC services.',
               '{"_seed":{"pack":"003_athq_network","version":"1.0.0"}}'::jsonb, 'active', v_sys
        WHERE NOT EXISTS (
            SELECT 1 FROM master.supplier_commodity_category
             WHERE tenant_id = v_tid AND supplier_id = v_nic_id AND commodity_category_id = v_sc_it
        );
    END IF;

    IF v_nic_id IS NOT NULL AND v_sc_subs IS NOT NULL THEN
        INSERT INTO master.supplier_commodity_category (
            tenant_id, supplier_id, commodity_category_id, is_primary,
            effective_from, notes, metadata, status, created_by
        )
        SELECT v_tid, v_nic_id, v_sc_subs, false,
               '2024-01-01'::date,
               'Secondary: cloud platform subscription licenses (AWS, Azure) resold via NIC.',
               '{"_seed":{"pack":"003_athq_network","version":"1.0.0"}}'::jsonb, 'active', v_sys
        WHERE NOT EXISTS (
            SELECT 1 FROM master.supplier_commodity_category
             WHERE tenant_id = v_tid AND supplier_id = v_nic_id AND commodity_category_id = v_sc_subs
        );
    END IF;

    RAISE NOTICE '[003_athq_network §E] Supplier commodity categories seeded (GCM/PSM/GFL/NIC)';
END $sup_spend$;


-- ════════════════════════════════════════════════════════════════════════════
-- §F  CUSTOMER BLOCKS
-- ════════════════════════════════════════════════════════════════════════════
DO $cus_block$
DECLARE
    v_sys uuid := '00000000-0000-0000-0000-000000000000';
    v_tid uuid;

    v_epg_id uuid;
    v_qnp_id uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[003 §F] athyper tenant not found'; END IF;

    SELECT id INTO v_epg_id FROM master.customer WHERE tenant_id = v_tid AND customer_code = 'CUS-ATHQ-EPG-001';
    SELECT id INTO v_qnp_id FROM master.customer WHERE tenant_id = v_tid AND customer_code = 'CUS-ATHQ-QNP-001';

    -- EPG-001: historical credit hold — LIFTED (no longer active)
    IF v_epg_id IS NOT NULL THEN
        INSERT INTO master.customer_block (
            tenant_id, customer_id, block_type, block_reason,
            blocked_at, blocked_by,
            lifted_at, lifted_by, lift_reason,
            notes, metadata, status, created_by
        )
        SELECT
            v_tid, v_epg_id,
            'credit',
            'Credit limit exceeded following Emirates City Tower project material drawdown (AED 2.1M overdue).',
            '2024-03-15 08:00:00+04'::timestamptz, v_sys,
            '2024-04-30 14:00:00+04'::timestamptz, v_sys,
            'Partial payment of AED 1.5M received. Credit terms renegotiated to 45 days. Remaining balance placed on payment plan.',
            'Hold lifted after CFO (Fatima Al-Zarooni) confirmed payment plan acceptance. '
            'Credit limit reinstated at AED 5M pending 90-day observation.',
            '{"_seed":{"pack":"003_athq_network","version":"1.0.0"}}'::jsonb,
            'lifted', v_sys
        WHERE NOT EXISTS (
            SELECT 1 FROM master.customer_block
             WHERE tenant_id = v_tid AND customer_id = v_epg_id
               AND block_type = 'credit'
               AND blocked_at = '2024-03-15 08:00:00+04'::timestamptz
        );
    END IF;

    -- QNP-001: active compliance hold — government KYC renewal pending
    IF v_qnp_id IS NOT NULL THEN
        INSERT INTO master.customer_block (
            tenant_id, customer_id, block_type, block_reason,
            blocked_at, blocked_by,
            lifted_at, lifted_by, lift_reason,
            notes, metadata, status, created_by
        )
        SELECT
            v_tid, v_qnp_id,
            'all',
            'Annual KYC renewal overdue. Beneficial ownership declaration not resubmitted for 2025 period.',
            '2025-04-01 09:00:00+04'::timestamptz, v_sys,
            NULL, NULL, NULL,
            'Block placed following compliance team review. QNP finance director (A. Al-Thani) notified by email 2025-04-01. '
            'Documents requested: UBO declaration, Ministry of Commerce registration renewal, board resolution.',
            '{"_seed":{"pack":"003_athq_network","version":"1.0.0"}}'::jsonb,
            'active', v_sys
        WHERE NOT EXISTS (
            SELECT 1 FROM master.customer_block
             WHERE tenant_id = v_tid AND customer_id = v_qnp_id
               AND block_type = 'all'
               AND blocked_at = '2025-04-01 09:00:00+04'::timestamptz
        );
    END IF;

    RAISE NOTICE '[003_athq_network §F] Customer blocks seeded (EPG lifted, QNP active compliance hold)';
END $cus_block$;


-- ════════════════════════════════════════════════════════════════════════════
-- §G  SUPPLIER APP INDEX REFRESH (all external suppliers for this tenant)
-- ════════════════════════════════════════════════════════════════════════════
DO $sup_idx$
DECLARE
    v_tid uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[003 §G] athyper tenant not found'; END IF;

    INSERT INTO master.supplier_app_index (
        id, tenant_id, supplier_id, business_partner_id,
        supplier_code, supplier_type, supplier_status, is_payment_ready,
        business_partner_code, name, display_name, legal_name, legal_form,
        registration_no, registration_country_code, tax_residence_country_code,
        partner_category, aliases, business_types, search_text, updated_at
    )
    SELECT
        s.id, s.tenant_id, s.id, bp.id,
        s.supplier_code, s.supplier_type, s.status, s.is_payment_ready,
        bp.code, bp.name, bp.display_name, bp.legal_name, bp.legal_form,
        bp.registration_no, bp.registration_country_code, bp.tax_residence_country_code,
        bp.partner_category, bp.aliases, bp.business_types,
        lower(
            bp.name || ' ' || s.supplier_code || ' ' ||
            COALESCE(bp.display_name, '') || ' ' ||
            COALESCE(bp.legal_name, '') || ' ' ||
            COALESCE(bp.registration_no, '') || ' ' ||
            COALESCE(bp.external_ref, '') || ' ' ||
            COALESCE(array_to_string(bp.aliases::text[], ' '), '')
        ),
        now()
    FROM master.supplier s
    JOIN master.business_partner bp
         ON bp.id = s.business_partner_id AND bp.tenant_id = s.tenant_id
    WHERE s.tenant_id = v_tid
      AND s.supplier_type != 'intercompany'
    ON CONFLICT (id) DO UPDATE
        SET search_text     = EXCLUDED.search_text,
            supplier_status = EXCLUDED.supplier_status,
            is_payment_ready = EXCLUDED.is_payment_ready,
            updated_at      = now();

    RAISE NOTICE '[003_athq_network §G] supplier_app_index refreshed for athyper tenant';
END $sup_idx$;


-- ════════════════════════════════════════════════════════════════════════════
-- §H  CUSTOMER APP INDEX REFRESH (all external customers for this tenant)
-- ════════════════════════════════════════════════════════════════════════════
DO $cus_idx$
DECLARE
    v_tid uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[003 §H] athyper tenant not found'; END IF;

    INSERT INTO master.customer_app_index (
        id, tenant_id, customer_id, business_partner_id,
        customer_code, customer_type, customer_status, is_key_account, risk_rating,
        business_partner_code, name, display_name, legal_name, legal_form,
        registration_no, registration_country_code,
        aliases, business_types, search_text, updated_at
    )
    SELECT
        c.id, c.tenant_id, c.id, bp.id,
        c.customer_code, c.customer_type, c.status, c.is_key_account, c.risk_rating,
        bp.code, bp.name, bp.display_name, bp.legal_name, bp.legal_form,
        bp.registration_no, bp.registration_country_code,
        bp.aliases, bp.business_types,
        lower(
            bp.name || ' ' || c.customer_code || ' ' ||
            COALESCE(bp.display_name, '') || ' ' ||
            COALESCE(bp.legal_name, '') || ' ' ||
            COALESCE(bp.registration_no, '') || ' ' ||
            COALESCE(bp.external_ref, '') || ' ' ||
            COALESCE(array_to_string(bp.aliases::text[], ' '), '')
        ),
        now()
    FROM master.customer c
    JOIN master.business_partner bp
         ON bp.id = c.business_partner_id AND bp.tenant_id = c.tenant_id
    WHERE c.tenant_id = v_tid
      AND c.customer_type != 'intercompany'
    ON CONFLICT (id) DO UPDATE
        SET search_text     = EXCLUDED.search_text,
            customer_status = EXCLUDED.customer_status,
            updated_at      = now();

    RAISE NOTICE '[003_athq_network §H] customer_app_index refreshed for athyper tenant';
END $cus_idx$;
