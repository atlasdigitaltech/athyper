-- ============================================================================
-- TECHNOSTAT — NETWORK CAPABILITIES, CERTIFICATIONS & BP RELATIONS
-- ============================================================================
-- File:     015_technostat_network_capabilities.sql
-- Schemas:  master.certification_type (NULL tenant — platform-wide)
--           master.business_partner_network_capability
--           master.business_partner_relation
-- Purpose:  Seeds network document-exchange capabilities for all non-IC
--           technostat suppliers; adds pci-dss / soc-2 platform cert types;
--           creates 4 inter-BP relations for demo topology.
--
-- Coverage:
--   §A  Platform certification types (pci-dss, soc-2)
--   §B  business_partner_network_capability (peppol/edi_x12/ariba per BP)
--   §C  business_partner_relation (4 relations)
--
-- Idempotent: ON CONFLICT DO NOTHING throughout.
-- Depends:    007_technostat_bp_supplier_customer_e2e.sql (BPs must exist)
--             009_technostat_supplier_dataset_100pct.sql  (MOTRM3B8)
-- ============================================================================

DO $tstat_net$
DECLARE
    v_tid  uuid;
    v_sys  uuid := '00000000-0000-0000-0000-000000000000';

    -- BP ids resolved below
    v_bp_amts   uuid;   -- SUP-KSA-01  Al Madar Technology Solutions LLC
    v_bp_anic   uuid;   -- SUP-KSA-02  Arabian Network Infrastructure Co.
    v_bp_ntp    uuid;   -- SUP-EGY-01  Nile Technology Partners
    v_bp_csi    uuid;   -- SUP-EGY-02  Cairo Systems Integration LLC
    v_bp_gps    uuid;   -- SUP-GLB-01  Global Procurement Solutions Ltd
    v_bp_mgi    uuid;   -- BOTH-GLB-01 Meridian Group International BV
    v_bp_test   uuid;   -- BP-MOTRM3B8 Test Tech Solutions LLC
    v_bp_tksa   uuid;   -- INT-TKSA    Technostat Group HQ (internal)
    v_bp_ards   uuid;   -- CUS-KSA-01  Al Rajhi Digital Systems Co.
    v_bp_sth    uuid;   -- CUS-KSA-02  Saudi Telecom Holdings

    v_seed  jsonb := '{"_seed":{"pack":"015_tstat_network","version":"1.0.0"}}'::jsonb;
BEGIN

    -- ── Resolve tenant ───────────────────────────────────────────────────────
    SELECT id INTO v_tid
    FROM master.tenant
    WHERE realm_key = 'athyper' AND code = 'technostat';

    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[015_tstat_network] Technostat tenant not found';
    END IF;

    -- ── Resolve BPs ──────────────────────────────────────────────────────────
    SELECT id INTO v_bp_amts FROM master.business_partner WHERE tenant_id = v_tid AND code = 'SUP-KSA-01';
    SELECT id INTO v_bp_anic FROM master.business_partner WHERE tenant_id = v_tid AND code = 'SUP-KSA-02';
    SELECT id INTO v_bp_ntp  FROM master.business_partner WHERE tenant_id = v_tid AND code = 'SUP-EGY-01';
    SELECT id INTO v_bp_csi  FROM master.business_partner WHERE tenant_id = v_tid AND code = 'SUP-EGY-02';
    SELECT id INTO v_bp_gps  FROM master.business_partner WHERE tenant_id = v_tid AND code = 'SUP-GLB-01';
    SELECT id INTO v_bp_mgi  FROM master.business_partner WHERE tenant_id = v_tid AND code = 'BOTH-GLB-01';
    SELECT id INTO v_bp_test FROM master.business_partner WHERE tenant_id = v_tid AND code = 'BP-MOTRM3B8';
    SELECT id INTO v_bp_tksa FROM master.business_partner WHERE tenant_id = v_tid AND code = 'INT-TKSA';
    SELECT id INTO v_bp_ards FROM master.business_partner WHERE tenant_id = v_tid AND code = 'CUS-KSA-01';
    SELECT id INTO v_bp_sth  FROM master.business_partner WHERE tenant_id = v_tid AND code = 'CUS-KSA-02';

    -- §A  (removed) — Certification types now seeded centrally by
    --     010_platform/003_master/003_certification_type.sql.
    RAISE NOTICE '[015_tstat_network] §A: platform cert types guaranteed by platform seed';

    -- ============================================================================
    -- §B  business_partner_network_capability
    --     Unique on (tenant_id, business_partner_id, provider_code,
    --                document_type_id, document_direction)
    -- ============================================================================

    -- ── SUP-KSA-01: Al Madar Technology Solutions ────────────────────────────
    -- Peppol-registered KSA IT service provider (ZATCA Phase 2 compliant).
    IF v_bp_amts IS NOT NULL THEN
        INSERT INTO master.business_partner_network_capability (
            tenant_id, business_partner_id,
            provider_code, document_type_id, document_direction,
            profile_id, profile_version,
            is_supported, verified_at, metadata, created_by
        ) VALUES
        (v_tid, v_bp_amts, 'peppol', 'invoice',         'send',
         'urn:fdc:peppol.eu:2017:poacc:billing:3.0', '3.0',
         true, '2024-06-01'::timestamptz, v_seed, v_sys),
        (v_tid, v_bp_amts, 'peppol', 'order',  'receive',
         'urn:fdc:peppol.eu:2017:poacc:ordering:3.0', '3.0',
         true, '2024-06-01'::timestamptz, v_seed, v_sys)
        ON CONFLICT (tenant_id, business_partner_id, provider_code, document_type_id, document_direction)
        DO NOTHING;
    END IF;

    -- ── SUP-KSA-02: Arabian Network Infrastructure Co. ───────────────────────
    -- Peppol + EDI X12 (legacy EPC/utility billing integration).
    IF v_bp_anic IS NOT NULL THEN
        INSERT INTO master.business_partner_network_capability (
            tenant_id, business_partner_id,
            provider_code, document_type_id, document_direction,
            profile_id, profile_version,
            is_supported, verified_at, metadata, created_by
        ) VALUES
        (v_tid, v_bp_anic, 'peppol',  'invoice',        'send',
         'urn:fdc:peppol.eu:2017:poacc:billing:3.0', '3.0',
         true, '2024-09-15'::timestamptz, v_seed, v_sys),
        (v_tid, v_bp_anic, 'edi_x12', 'invoice',        'send',
         '810', '4010',
         true, '2023-03-01'::timestamptz, v_seed, v_sys),
        (v_tid, v_bp_anic, 'edi_x12', 'order', 'receive',
         '850', '4010',
         true, '2023-03-01'::timestamptz, v_seed, v_sys)
        ON CONFLICT (tenant_id, business_partner_id, provider_code, document_type_id, document_direction)
        DO NOTHING;
    END IF;

    -- ── SUP-EGY-01: Nile Technology Partners ────────────────────────────────
    -- Peppol-registered Egypt IT/managed services supplier.
    IF v_bp_ntp IS NOT NULL THEN
        INSERT INTO master.business_partner_network_capability (
            tenant_id, business_partner_id,
            provider_code, document_type_id, document_direction,
            profile_id, profile_version,
            is_supported, verified_at, metadata, created_by
        ) VALUES
        (v_tid, v_bp_ntp, 'peppol', 'invoice',        'send',
         'urn:fdc:peppol.eu:2017:poacc:billing:3.0', '3.0',
         true, '2024-01-20'::timestamptz, v_seed, v_sys),
        (v_tid, v_bp_ntp, 'peppol', 'order', 'receive',
         'urn:fdc:peppol.eu:2017:poacc:ordering:3.0', '3.0',
         true, '2024-01-20'::timestamptz, v_seed, v_sys)
        ON CONFLICT (tenant_id, business_partner_id, provider_code, document_type_id, document_direction)
        DO NOTHING;
    END IF;

    -- ── SUP-EGY-02: Cairo Systems Integration LLC ────────────────────────────
    -- Peppol invoice + credit note (government-facing ETA e-invoicing).
    IF v_bp_csi IS NOT NULL THEN
        INSERT INTO master.business_partner_network_capability (
            tenant_id, business_partner_id,
            provider_code, document_type_id, document_direction,
            profile_id, profile_version,
            is_supported, verified_at, metadata, created_by
        ) VALUES
        (v_tid, v_bp_csi, 'peppol', 'invoice',      'send',
         'urn:fdc:peppol.eu:2017:poacc:billing:3.0', '3.0',
         true, '2023-11-01'::timestamptz, v_seed, v_sys),
        (v_tid, v_bp_csi, 'peppol', 'credit_note',  'send',
         'urn:fdc:peppol.eu:2017:poacc:billing:3.0', '3.0',
         true, '2023-11-01'::timestamptz, v_seed, v_sys)
        ON CONFLICT (tenant_id, business_partner_id, provider_code, document_type_id, document_direction)
        DO NOTHING;
    END IF;

    -- ── SUP-GLB-01: Global Procurement Solutions Ltd ─────────────────────────
    -- Full multi-network supplier: Peppol (EU) + Ariba Network (global sourcing).
    IF v_bp_gps IS NOT NULL THEN
        INSERT INTO master.business_partner_network_capability (
            tenant_id, business_partner_id,
            provider_code, document_type_id, document_direction,
            profile_id, profile_version,
            is_supported, verified_at, metadata, created_by
        ) VALUES
        (v_tid, v_bp_gps, 'peppol', 'invoice',        'send',
         'urn:fdc:peppol.eu:2017:poacc:billing:3.0', '3.0',
         true, '2023-06-10'::timestamptz, v_seed, v_sys),
        (v_tid, v_bp_gps, 'peppol', 'order', 'receive',
         'urn:fdc:peppol.eu:2017:poacc:ordering:3.0', '3.0',
         true, '2023-06-10'::timestamptz, v_seed, v_sys),
        (v_tid, v_bp_gps, 'ariba',  'invoice',        'send',
         'ariba:billing:standard', '2.0',
         true, '2022-11-15'::timestamptz, v_seed, v_sys),
        (v_tid, v_bp_gps, 'ariba',  'order', 'receive',
         'ariba:ordering:standard', '2.0',
         true, '2022-11-15'::timestamptz, v_seed, v_sys)
        ON CONFLICT (tenant_id, business_partner_id, provider_code, document_type_id, document_direction)
        DO NOTHING;
    END IF;

    -- ── BOTH-GLB-01: Meridian Group International BV ─────────────────────────
    -- Global both-supplier-and-customer: Peppol (NL SMP) + Ariba (group mandate).
    IF v_bp_mgi IS NOT NULL THEN
        INSERT INTO master.business_partner_network_capability (
            tenant_id, business_partner_id,
            provider_code, document_type_id, document_direction,
            profile_id, profile_version,
            is_supported, verified_at, metadata, created_by
        ) VALUES
        (v_tid, v_bp_mgi, 'peppol', 'invoice',        'send',
         'urn:fdc:peppol.eu:2017:poacc:billing:3.0', '3.0',
         true, '2022-04-01'::timestamptz, v_seed, v_sys),
        (v_tid, v_bp_mgi, 'ariba',  'invoice',        'send',
         'ariba:billing:standard', '2.0',
         true, '2021-08-01'::timestamptz, v_seed, v_sys),
        (v_tid, v_bp_mgi, 'ariba',  'order', 'receive',
         'ariba:ordering:standard', '2.0',
         true, '2021-08-01'::timestamptz, v_seed, v_sys)
        ON CONFLICT (tenant_id, business_partner_id, provider_code, document_type_id, document_direction)
        DO NOTHING;
    END IF;

    -- ── BP-MOTRM3B8: Test Tech Solutions LLC ────────────────────────────────
    -- Demo onboarding supplier; Peppol invoice only (ZATCA Phase 2 onboarding).
    IF v_bp_test IS NOT NULL THEN
        INSERT INTO master.business_partner_network_capability (
            tenant_id, business_partner_id,
            provider_code, document_type_id, document_direction,
            profile_id, profile_version,
            is_supported, verified_at, metadata, created_by
        ) VALUES
        (v_tid, v_bp_test, 'peppol', 'invoice', 'send',
         'urn:fdc:peppol.eu:2017:poacc:billing:3.0', '3.0',
         true, NULL, v_seed, v_sys)
        ON CONFLICT (tenant_id, business_partner_id, provider_code, document_type_id, document_direction)
        DO NOTHING;
    END IF;

    RAISE NOTICE '[015_tstat_network] §B: network capabilities seeded for 7 supplier BPs';

    -- ============================================================================
    -- §C  business_partner_relation
    --     Unique on (tenant_id, from_bp_id, to_bp_id, relation_type).
    --     direction: 'bidirectional' for affiliates/consortium, 'directional' for strategic.
    -- ============================================================================

    -- ── Relation 1: SUP-GLB-01 ↔ BOTH-GLB-01 — affiliate ────────────────────
    -- GPS Ltd and Meridian Group cross-refer clients for complementary services
    -- (GPS: direct procurement, Meridian: managed procurement + distribution).
    IF v_bp_gps IS NOT NULL AND v_bp_mgi IS NOT NULL THEN
        INSERT INTO master.business_partner_relation (
            tenant_id, from_bp_id, to_bp_id,
            relation_type, direction,
            country_scope, effective_from,
            notes, metadata, status, created_by
        ) VALUES (
            v_tid, v_bp_gps, v_bp_mgi,
            'jv_partner_of', 'bidirectional',
            ARRAY['GB','NL','DE','SA','EG'],
            '2021-01-01',
            'Cross-referral arrangement: GPS handles direct procurement, Meridian manages distribution and indirect spend.',
            v_seed, 'active', v_sys
        )
        ON CONFLICT (tenant_id, from_bp_id, to_bp_id, relation_type) DO NOTHING;
    END IF;

    -- ── Relation 2: INT-TKSA → SUP-KSA-01 — strategic_partner ───────────────
    -- TKSA has a preferred-vendor strategic alliance with Al Madar for ICT
    -- infrastructure projects across KSA public sector bids.
    IF v_bp_tksa IS NOT NULL AND v_bp_amts IS NOT NULL THEN
        INSERT INTO master.business_partner_relation (
            tenant_id, from_bp_id, to_bp_id,
            relation_type, direction,
            country_scope, effective_from,
            notes, metadata, status, created_by
        ) VALUES (
            v_tid, v_bp_tksa, v_bp_amts,
            'jv_partner_of', 'directional',
            ARRAY['SA'],
            '2020-03-01',
            'TKSA preferred-vendor alliance with Al Madar Tech for ICT infrastructure and systems-integration bids in KSA public sector.',
            v_seed, 'active', v_sys
        )
        ON CONFLICT (tenant_id, from_bp_id, to_bp_id, relation_type) DO NOTHING;
    END IF;

    -- ── Relation 3: CUS-KSA-01 ↔ CUS-KSA-02 — affiliate ────────────────────
    -- Al Rajhi Digital and Saudi Telecom Holdings co-invest in shared
    -- ICT platform initiatives under the Saudi Vision 2030 digital pillar.
    IF v_bp_ards IS NOT NULL AND v_bp_sth IS NOT NULL THEN
        INSERT INTO master.business_partner_relation (
            tenant_id, from_bp_id, to_bp_id,
            relation_type, direction,
            country_scope, effective_from,
            notes, metadata, status, created_by
        ) VALUES (
            v_tid, v_bp_ards, v_bp_sth,
            'jv_partner_of', 'bidirectional',
            ARRAY['SA'],
            '2023-09-01',
            'Joint ICT platform co-investment under Vision 2030 digital infrastructure programme.',
            v_seed, 'active', v_sys
        )
        ON CONFLICT (tenant_id, from_bp_id, to_bp_id, relation_type) DO NOTHING;
    END IF;

    -- ── Relation 4: SUP-EGY-01 ↔ SUP-EGY-02 — consortium_member ────────────
    -- Nile Tech Partners + Cairo Systems Integration form a consortium for
    -- Egyptian government and SOE digital-transformation tenders.
    IF v_bp_ntp IS NOT NULL AND v_bp_csi IS NOT NULL THEN
        INSERT INTO master.business_partner_relation (
            tenant_id, from_bp_id, to_bp_id,
            relation_type, direction,
            country_scope, effective_from,
            notes, metadata, status, created_by
        ) VALUES (
            v_tid, v_bp_ntp, v_bp_csi,
            'consortium_member_of', 'bidirectional',
            ARRAY['EG'],
            '2022-06-15',
            'EG public-sector consortium: Nile Tech (systems integration lead) + Cairo Systems (infrastructure sub-contractor).',
            v_seed, 'active', v_sys
        )
        ON CONFLICT (tenant_id, from_bp_id, to_bp_id, relation_type) DO NOTHING;
    END IF;

    RAISE NOTICE '[015_tstat_network] §C: 4 BP relations seeded';
    RAISE NOTICE '[015_tstat_network] Complete — network capabilities, global cert types, BP relations done';

END $tstat_net$;
