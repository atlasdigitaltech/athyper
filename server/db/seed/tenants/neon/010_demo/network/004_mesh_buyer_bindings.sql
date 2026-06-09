-- ============================================================================
-- ATHYPER - MESH BUYER REALM BINDINGS + BUYER NETWORK ACCESS
-- ============================================================================
-- Purpose: Let ATHQ owner/admin enter Mesh as buyer/network-owner users.
--          The unified athyper Keycloak realm authenticates the same business principals;
--          DB network_membership scoped groups resolve the actual Mesh contexts.
--
-- Mesh KC UUIDs:
--   ee101000-0000-0000-0000-000000000001  athq.owner
--   ee101000-0000-0000-0000-000000000002  athq.admin
--
-- Existing principal UUIDs:
--   aa001000-0000-0000-0000-000000000006  athq.owner
--   aa001000-0000-0000-0000-000000000007  athq.admin
--
-- Depends: 900_principals/001_demo_principals.sql,
--          network/001_buyer_networks.sql
-- ============================================================================

DO $athq_mesh_buyer$
DECLARE
    v_su       uuid := '00000000-0000-0000-0000-000000000000';
    v_tid      uuid;
    v_mbr_proc uuid;
    v_mbr_cust uuid;
    v_grp_owner uuid;
    v_grp_admin uuid;
BEGIN
    PERFORM set_config('app.current_principal_id', v_su::text, true);

    SELECT id INTO v_tid FROM master.tenant WHERE realm_key = 'athyper' AND code = 'athyper';
    IF v_tid IS NULL THEN RAISE EXCEPTION '[004_mesh_buyer_bindings] athyper tenant not found'; END IF;

    IF NOT EXISTS (SELECT 1 FROM master.principal WHERE tenant_id = v_tid AND id = 'aa001000-0000-0000-0000-000000000006') THEN
        RAISE EXCEPTION '[004_mesh_buyer_bindings] athq.owner principal not found';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM master.principal WHERE tenant_id = v_tid AND id = 'aa001000-0000-0000-0000-000000000007') THEN
        RAISE EXCEPTION '[004_mesh_buyer_bindings] athq.admin principal not found';
    END IF;

    INSERT INTO master.principal_identity_binding (
        tenant_id, principal_id,
        realm_key, provider_code, subject_id, username,
        sync_status, idp_enabled, idp_email_verified,
        synced_at, created_by
    ) VALUES
        (v_tid, 'aa001000-0000-0000-0000-000000000006',
         'athyper', 'keycloak', 'aa001000-0000-0000-0000-000000000006', 'athq.owner',
         'synced', true, true, now(), v_su),
        (v_tid, 'aa001000-0000-0000-0000-000000000007',
         'athyper', 'keycloak', 'aa001000-0000-0000-0000-000000000007', 'athq.admin',
         'synced', true, true, now(), v_su)
    ON CONFLICT (tenant_id, principal_id, realm_key, provider_code) DO UPDATE SET
        subject_id         = EXCLUDED.subject_id,
        username           = EXCLUDED.username,
        sync_status        = EXCLUDED.sync_status,
        idp_enabled        = EXCLUDED.idp_enabled,
        idp_email_verified = EXCLUDED.idp_email_verified,
        synced_at          = now(),
        updated_at         = now(),
        updated_by         = v_su;

    SELECT mbr.id INTO v_mbr_proc
    FROM master.business_network_membership mbr
    JOIN master.business_network bn ON bn.id = mbr.network_id
    WHERE bn.owner_tenant_id = v_tid
      AND bn.code = 'BN-ATHQ-PROC'
      AND mbr.participant_tenant_id = v_tid;

    SELECT mbr.id INTO v_mbr_cust
    FROM master.business_network_membership mbr
    JOIN master.business_network bn ON bn.id = mbr.network_id
    WHERE bn.owner_tenant_id = v_tid
      AND bn.code = 'BN-ATHQ-CUST'
      AND mbr.participant_tenant_id = v_tid;

    IF v_mbr_proc IS NULL THEN RAISE EXCEPTION '[004_mesh_buyer_bindings] ATHQ PROC buyer membership not found'; END IF;
    IF v_mbr_cust IS NULL THEN RAISE EXCEPTION '[004_mesh_buyer_bindings] ATHQ CUST buyer membership not found'; END IF;

    INSERT INTO master.auth_group (
        tenant_id, code, name, description,
        is_system, is_self_service_eligible, created_by
    ) VALUES
        (v_tid, 'ATHQ-MESH-BUYER-OWNER',
         'ATHQ Mesh Buyer Owner',
         'Buyer owner access scoped to ATHQ-owned Mesh networks.',
         true, false, v_su),
        (v_tid, 'ATHQ-MESH-BUYER-ADMIN',
         'ATHQ Mesh Buyer Admin',
         'Buyer administrator access scoped to ATHQ-owned Mesh networks.',
         true, false, v_su)
    ON CONFLICT (tenant_id, code) DO NOTHING;

    SELECT id INTO v_grp_owner FROM master.auth_group WHERE tenant_id = v_tid AND code = 'ATHQ-MESH-BUYER-OWNER';
    SELECT id INTO v_grp_admin  FROM master.auth_group WHERE tenant_id = v_tid AND code = 'ATHQ-MESH-BUYER-ADMIN';

    INSERT INTO master.auth_group_role (
        tenant_id, group_id, role_id,
        visibility_scope, assignment_scope_type, assignment_scope_ref_id,
        include_descendants, created_by
    )
    SELECT v_tid, v_grp_owner, r.id,
           'all', 'network_membership', mbr_id,
           true, v_su
    FROM shared.role r
    CROSS JOIN (VALUES (v_mbr_proc), (v_mbr_cust)) AS m(mbr_id)
    WHERE r.code LIKE 'owner-%'
    ON CONFLICT (tenant_id, group_id, role_id, assignment_scope_type, assignment_scope_ref_id, include_descendants) DO NOTHING;

    INSERT INTO master.auth_group_role (
        tenant_id, group_id, role_id,
        visibility_scope, assignment_scope_type, assignment_scope_ref_id,
        include_descendants, created_by
    )
    SELECT v_tid, v_grp_admin, r.id,
           'all', 'network_membership', mbr_id,
           true, v_su
    FROM shared.role r
    CROSS JOIN (VALUES (v_mbr_proc), (v_mbr_cust)) AS m(mbr_id)
    WHERE r.code LIKE 'admin-%'
    ON CONFLICT (tenant_id, group_id, role_id, assignment_scope_type, assignment_scope_ref_id, include_descendants) DO NOTHING;

    INSERT INTO master.auth_group_member (
        tenant_id, principal_id, group_id,
        joined_at, added_by, created_by
    )
    SELECT v_tid, p.id, g.id, now(), v_su, v_su
    FROM (VALUES
        ('athq.owner', 'ATHQ-MESH-BUYER-OWNER'),
        ('athq.admin', 'ATHQ-MESH-BUYER-ADMIN')
    ) AS v(principal_code, group_code)
    JOIN master.principal p ON p.tenant_id = v_tid AND p.code = v.principal_code
    JOIN master.auth_group g ON g.tenant_id = v_tid AND g.code = v.group_code
    ON CONFLICT (tenant_id, principal_id, group_id) DO NOTHING;

    RAISE NOTICE '[004_mesh_buyer_bindings] athyper: 2 Mesh buyer users + 2 buyer contexts seeded';
END $athq_mesh_buyer$;
