-- =========================================================================
-- TECHNOSTAT — NETWORK RELATIONS & CERTIFICATION PACK
-- =========================================================================
-- File:     015_technostat_network_capabilities.sql
-- Plane:    neon tenant seed
-- Purpose:  Seed network / relationship seed data for Technostat legacy topology
--           after retirement of legacy business_partner_network_capability model.
--
-- Coverage:
--   §A  Certification seed contract is satisfied by platform seed (kept as a no-op notice).
--   §B  Legacy network-capability model is retired in this tenant seed.
--   §C  Neon relationship seed in master.business_partner_relationship.
--
-- Idempotent: EXISTS checks before each conditional insert.
-- =========================================================================

DO $tstat_net$
DECLARE
    v_tid  uuid;
    v_sys  uuid;

    v_bp_amts   uuid;   -- SUP-KSA-01  Al Madar Technology Solutions LLC
    v_bp_anic   uuid;   -- SUP-KSA-02  Arabian Network Infrastructure Co.
    v_bp_ntp    uuid;   -- SUP-EGY-01  Nile Technology Partners
    v_bp_csi    uuid;   -- SUP-EGY-02  Cairo Systems Integration LLC
    v_bp_gps    uuid;   -- SUP-GLB-01  Global Procurement Solutions Ltd
    v_bp_mgi    uuid;   -- BOTH-GLB-01 Meridian Group International BV
    v_bp_tksa   uuid;   -- INT-TKSA    Technostat Group HQ (internal)
    v_bp_ards   uuid;   -- CUS-KSA-01  Al Rajhi Digital Systems Co.
    v_bp_sth    uuid;   -- CUS-KSA-02  Saudi Telecom Holdings

    v_seed  jsonb := '{"_seed":{"pack":"015_tstat_network","version":"1.1.0","rewrite":"legacy-model-pruned"}}'::jsonb;
BEGIN

    SELECT id INTO v_tid
    FROM master.tenant
    WHERE realm_key = 'athyper' AND code = 'technostat';

    IF v_tid IS NULL THEN
        RAISE EXCEPTION '[015_tstat_network] Technostat tenant not found';
    END IF;

    SELECT created_by INTO v_sys
    FROM master.tenant
    WHERE id = v_tid;

    IF v_sys IS NULL THEN
        RAISE EXCEPTION '[015_tstat_network] Tenant created_by is null for %', v_tid;
    END IF;

    SELECT id INTO v_bp_amts FROM master.business_partner WHERE tenant_id = v_tid AND code = 'SUP-KSA-01';
    SELECT id INTO v_bp_anic FROM master.business_partner WHERE tenant_id = v_tid AND code = 'SUP-KSA-02';
    SELECT id INTO v_bp_ntp  FROM master.business_partner WHERE tenant_id = v_tid AND code = 'SUP-EGY-01';
    SELECT id INTO v_bp_csi  FROM master.business_partner WHERE tenant_id = v_tid AND code = 'SUP-EGY-02';
    SELECT id INTO v_bp_gps  FROM master.business_partner WHERE tenant_id = v_tid AND code = 'SUP-GLB-01';
    SELECT id INTO v_bp_mgi  FROM master.business_partner WHERE tenant_id = v_tid AND code = 'BOTH-GLB-01';
    SELECT id INTO v_bp_tksa FROM master.business_partner WHERE tenant_id = v_tid AND code = 'INT-TKSA';
    SELECT id INTO v_bp_ards FROM master.business_partner WHERE tenant_id = v_tid AND code = 'CUS-KSA-01';
    SELECT id INTO v_bp_sth  FROM master.business_partner WHERE tenant_id = v_tid AND code = 'CUS-KSA-02';

    RAISE NOTICE '[015_tstat_network] §A: platform cert types guaranteed by platform seed';
    RAISE NOTICE '[015_tstat_network] §B: legacy business_partner_network_capability seeding skipped';

    IF v_bp_gps IS NOT NULL AND v_bp_mgi IS NOT NULL THEN
        INSERT INTO master.business_partner_relationship (
            tenant_id, source_business_partner_id, target_business_partner_id,
            relationship_type_code, country_code, effective_from,
            notes, metadata, status, created_by
        )
        SELECT
            v_tid, v_bp_gps, v_bp_mgi,
            'affiliate', 'SA',
            '2021-01-01'::date,
            'Cross-referral arrangement: GPS handles direct procurement, Meridian manages distribution and indirect spend.',
            v_seed,
            'active',
            v_sys
        WHERE NOT EXISTS (
            SELECT 1
            FROM master.business_partner_relationship r
            WHERE r.tenant_id = v_tid
              AND r.source_business_partner_id = v_bp_gps
              AND r.target_business_partner_id = v_bp_mgi
              AND r.relationship_type_code = 'affiliate'
              AND r.country_code = 'SA'
              AND r.status = 'active'
        );

        INSERT INTO master.business_partner_relationship (
            tenant_id, source_business_partner_id, target_business_partner_id,
            relationship_type_code, country_code, effective_from,
            notes, metadata, status, created_by
        )
        SELECT
            v_tid, v_bp_mgi, v_bp_gps,
            'affiliate', 'SA',
            '2021-01-01'::date,
            'Cross-referral arrangement: Meridian manages distribution and indirect spend, GPS handles direct procurement.',
            v_seed,
            'active',
            v_sys
        WHERE NOT EXISTS (
            SELECT 1
            FROM master.business_partner_relationship r
            WHERE r.tenant_id = v_tid
              AND r.source_business_partner_id = v_bp_mgi
              AND r.target_business_partner_id = v_bp_gps
              AND r.relationship_type_code = 'affiliate'
              AND r.country_code = 'SA'
              AND r.status = 'active'
        );
    END IF;

    IF v_bp_tksa IS NOT NULL AND v_bp_amts IS NOT NULL THEN
        INSERT INTO master.business_partner_relationship (
            tenant_id, source_business_partner_id, target_business_partner_id,
            relationship_type_code, country_code, effective_from,
            notes, metadata, status, created_by
        )
        SELECT
            v_tid, v_bp_tksa, v_bp_amts,
            'affiliate', 'SA',
            '2020-03-01'::date,
            'TKSA preferred-vendor alliance with Al Madar Tech for ICT infrastructure and systems-integration bids in KSA public sector.',
            v_seed,
            'active',
            v_sys
        WHERE NOT EXISTS (
            SELECT 1
            FROM master.business_partner_relationship r
            WHERE r.tenant_id = v_tid
              AND r.source_business_partner_id = v_bp_tksa
              AND r.target_business_partner_id = v_bp_amts
              AND r.relationship_type_code = 'affiliate'
              AND r.country_code = 'SA'
              AND r.status = 'active'
        );
    END IF;

    IF v_bp_ards IS NOT NULL AND v_bp_sth IS NOT NULL THEN
        INSERT INTO master.business_partner_relationship (
            tenant_id, source_business_partner_id, target_business_partner_id,
            relationship_type_code, country_code, effective_from,
            notes, metadata, status, created_by
        )
        SELECT
            v_tid, v_bp_ards, v_bp_sth,
            'joint_venture', 'SA',
            '2023-09-01'::date,
            'Joint ICT platform co-investment under the Saudi Vision 2030 digital pillar.',
            v_seed,
            'active',
            v_sys
        WHERE NOT EXISTS (
            SELECT 1
            FROM master.business_partner_relationship r
            WHERE r.tenant_id = v_tid
              AND r.source_business_partner_id = v_bp_ards
              AND r.target_business_partner_id = v_bp_sth
              AND r.relationship_type_code = 'joint_venture'
              AND r.country_code = 'SA'
              AND r.status = 'active'
        );

        INSERT INTO master.business_partner_relationship (
            tenant_id, source_business_partner_id, target_business_partner_id,
            relationship_type_code, country_code, effective_from,
            notes, metadata, status, created_by
        )
        SELECT
            v_tid, v_bp_sth, v_bp_ards,
            'joint_venture', 'SA',
            '2023-09-01'::date,
            'Joint ICT platform co-investment under the Saudi Vision 2030 digital pillar.',
            v_seed,
            'active',
            v_sys
        WHERE NOT EXISTS (
            SELECT 1
            FROM master.business_partner_relationship r
            WHERE r.tenant_id = v_tid
              AND r.source_business_partner_id = v_bp_sth
              AND r.target_business_partner_id = v_bp_ards
              AND r.relationship_type_code = 'joint_venture'
              AND r.country_code = 'SA'
              AND r.status = 'active'
        );
    END IF;

    IF v_bp_ntp IS NOT NULL AND v_bp_csi IS NOT NULL THEN
        INSERT INTO master.business_partner_relationship (
            tenant_id, source_business_partner_id, target_business_partner_id,
            relationship_type_code, country_code, effective_from,
            notes, metadata, status, created_by
        )
        SELECT
            v_tid, v_bp_ntp, v_bp_csi,
            'subsidiary', 'EG',
            '2022-06-15'::date,
            'EG public-sector consortium: Nile Tech (systems integration lead) + Cairo Systems (infrastructure sub-contractor).',
            v_seed,
            'active',
            v_sys
        WHERE NOT EXISTS (
            SELECT 1
            FROM master.business_partner_relationship r
            WHERE r.tenant_id = v_tid
              AND r.source_business_partner_id = v_bp_ntp
              AND r.target_business_partner_id = v_bp_csi
              AND r.relationship_type_code = 'subsidiary'
              AND r.country_code = 'EG'
              AND r.status = 'active'
        );

        INSERT INTO master.business_partner_relationship (
            tenant_id, source_business_partner_id, target_business_partner_id,
            relationship_type_code, country_code, effective_from,
            notes, metadata, status, created_by
        )
        SELECT
            v_tid, v_bp_csi, v_bp_ntp,
            'parent', 'EG',
            '2022-06-15'::date,
            'EG public-sector consortium: Cairo Systems links back as a parent-style consortium relation.',
            v_seed,
            'active',
            v_sys
        WHERE NOT EXISTS (
            SELECT 1
            FROM master.business_partner_relationship r
            WHERE r.tenant_id = v_tid
              AND r.source_business_partner_id = v_bp_csi
              AND r.target_business_partner_id = v_bp_ntp
              AND r.relationship_type_code = 'parent'
              AND r.country_code = 'EG'
              AND r.status = 'active'
        );
    END IF;

    RAISE NOTICE '[015_tstat_network] §C: relationship rows seeded with rewrite model';
    RAISE NOTICE '[015_tstat_network] Complete — legacy §B retired, §C rewritten to active DDL model';

END $tstat_net$;
