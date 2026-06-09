-- ============================================================================
-- ATHYPER — BUYER BUSINESS NETWORKS
-- ============================================================================
-- File:     010_demo/network/001_buyer_networks.sql
-- Schemas:  master.business_network, master.business_network_membership,
--           master.business_network_membership_role
-- Purpose:  Create two buyer-owned networks for the athyper tenant:
--             BN-ATHQ-PROC  — procurement (nimubus joins as supplier)
--             BN-ATHQ-CUST  — customer network (stratus joins as customer)
--           Register athyper as buyer self-member of both networks.
-- Depends:  000_tenant.sql, network_provider seed (athyper_network row)
-- Idempotent: ON CONFLICT DO NOTHING throughout
-- ============================================================================

DO $athq_networks$
DECLARE
    v_su  uuid := '00000000-0000-0000-0000-000000000000';
    v_tid uuid;
    v_bn_proc uuid;
    v_bn_cust uuid;
    v_mbr_proc uuid;
    v_mbr_cust uuid;
BEGIN
    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[001_buyer_networks] athyper tenant not found'; END IF;

    -- ── Business networks ────────────────────────────────────────────────────

    INSERT INTO master.business_network (owner_tenant_id, code, name, network_type, provider_code, created_by)
    VALUES
        (v_tid, 'BN-ATHQ-PROC', 'ATHQ Procurement Network',  'buyer_network', 'athyper_network', v_su),
        (v_tid, 'BN-ATHQ-CUST', 'ATHQ Customer Network',     'buyer_network', 'athyper_network', v_su)
    ON CONFLICT (owner_tenant_id, code) DO NOTHING;

    SELECT id INTO v_bn_proc FROM master.business_network WHERE owner_tenant_id = v_tid AND code = 'BN-ATHQ-PROC';
    SELECT id INTO v_bn_cust FROM master.business_network WHERE owner_tenant_id = v_tid AND code = 'BN-ATHQ-CUST';

    -- ── Buyer self-memberships ────────────────────────────────────────────────

    INSERT INTO master.business_network_membership (network_id, participant_tenant_id, status, created_by)
    VALUES
        (v_bn_proc, v_tid, 'active', v_su),
        (v_bn_cust, v_tid, 'active', v_su)
    ON CONFLICT (network_id, participant_tenant_id, participant_legal_entity_id, owner_business_partner_id) DO NOTHING;

    SELECT id INTO v_mbr_proc FROM master.business_network_membership WHERE network_id = v_bn_proc AND participant_tenant_id = v_tid;
    SELECT id INTO v_mbr_cust FROM master.business_network_membership WHERE network_id = v_bn_cust AND participant_tenant_id = v_tid;

    -- ── Buyer roles ───────────────────────────────────────────────────────────

    INSERT INTO master.business_network_membership_role (membership_id, role_type, relationship_type, display_label, created_by)
    VALUES
        (v_mbr_proc, 'buyer', 'buyer', 'ATHQ Procurement Buyer', v_su),
        (v_mbr_cust, 'buyer', 'buyer', 'ATHQ Customer Network Buyer', v_su)
    ON CONFLICT DO NOTHING;

    RAISE NOTICE '[001_buyer_networks] athyper: 2 networks + 2 self-memberships seeded (proc=%, cust=%)', v_bn_proc, v_bn_cust;
END $athq_networks$;
