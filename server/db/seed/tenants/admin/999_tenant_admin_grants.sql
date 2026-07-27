-- ============================================================================
-- CANONICAL ADMIN-PLANE TENANT GRANTS
-- ============================================================================
-- Full-reset seed only.  This is intentionally the final Admin-plane seed so
-- the table contains exactly the approved tenant owner/admin principals.
--
-- `systemadmin` is deliberately absent: tenant_admin_grant only permits the
-- owner/admin personas, while systemadmin is the global SYSTEM audit principal.
-- ============================================================================

DO $canonical_tenant_admin_grants$
DECLARE
    v_system_principal uuid := '00000000-0000-0000-0000-000000000000';
    v_expected_count integer := 45;
    v_inserted_count integer;
BEGIN
    PERFORM set_config('app.current_principal_id', v_system_principal::text, true);

    -- Rebuild, rather than merge, so a full reset cannot retain stale Admin
    -- plane access such as support.agent or a previously-seeded principal.
    DELETE FROM master.tenant_admin_grant;

    WITH approved(principal_code, persona_key) AS (
        VALUES
            ('athq.admin', 'admin'), ('acfb.admin', 'admin'), ('adpm.admin', 'admin'),
            ('aitm.admin', 'admin'), ('ajed.admin', 'admin'), ('amre.admin', 'admin'),
            ('aphs.admin', 'admin'), ('aqts.admin', 'admin'), ('aqtu.admin', 'admin'),
            ('asac.admin', 'admin'), ('asah.admin', 'admin'), ('asgf.admin', 'admin'),
            ('aspe.admin', 'admin'), ('atem.admin', 'admin'), ('auet.admin', 'admin'),
            ('auic.admin', 'admin'), ('auka.admin', 'admin'), ('athyper.admin', 'admin'),
            ('athq.owner', 'owner'), ('acfb.owner', 'owner'), ('adpm.owner', 'owner'),
            ('aitm.owner', 'owner'), ('ajed.owner', 'owner'), ('amre.owner', 'owner'),
            ('aphs.owner', 'owner'), ('aqts.owner', 'owner'), ('aqtu.owner', 'owner'),
            ('asac.owner', 'owner'), ('asah.owner', 'owner'), ('asgf.owner', 'owner'),
            ('aspe.owner', 'owner'), ('atem.owner', 'owner'), ('auet.owner', 'owner'),
            ('auic.owner', 'owner'), ('auka.owner', 'owner'), ('athyper.owner', 'owner'),
            ('tksa.owner', 'owner'), ('tksa.admin', 'admin'), ('ssk.admin', 'admin'),
            ('tegy.admin', 'admin'), ('sdtx.admin', 'admin'),
            ('platform.owner', 'owner'), ('platform.admin', 'admin'),
            ('catl.owner', 'owner'), ('catl.admin', 'admin')
    )
    INSERT INTO master.tenant_admin_grant (
        tenant_id, principal_id, persona_key, all_legal_entities, status, created_by
    )
    SELECT p.tenant_id, p.id, a.persona_key, true, 'active', v_system_principal
    FROM approved a
    JOIN master.principal p
      ON p.code = a.principal_code;

    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;
    IF v_inserted_count <> v_expected_count THEN
        RAISE EXCEPTION
            '[999_tenant_admin_grants] expected % approved principals, inserted %. Check principal IDs and tenant IDs.',
            v_expected_count, v_inserted_count;
    END IF;

    -- Admin authorization is resolved from principal_persona ×
    -- persona_permission (not from tenant_admin_grant itself).  Keep the two
    -- records synchronized, including platform staff and cross-tenant admins
    -- whose individual tenant seeds may not create a persona assignment.
    -- principal_persona is append-only and intentionally has no
    -- updated_at/updated_by columns. Remove only stale assignments first so
    -- this seed remains compatible with older versions of the generic IAM
    -- outbox trigger, whose UPDATE branch assumes updated_by exists.
    DELETE FROM master.principal_persona pp
    USING master.tenant_admin_grant tag, shared.persona persona
    WHERE pp.tenant_id = tag.tenant_id
      AND pp.principal_id = tag.principal_id
      AND persona.code = tag.persona_key
      AND pp.persona_id IS DISTINCT FROM persona.id;

    INSERT INTO master.principal_persona (
        tenant_id, principal_id, persona_id, assigned_by, created_by
    )
    SELECT
        tag.tenant_id,
        tag.principal_id,
        persona.id,
        v_system_principal,
        v_system_principal
    FROM master.tenant_admin_grant tag
    JOIN shared.persona persona
      ON persona.code = tag.persona_key
    ON CONFLICT (tenant_id, principal_id) DO NOTHING;

    RAISE NOTICE '[999_tenant_admin_grants] rebuilt % canonical tenant admin grants and persona assignments', v_inserted_count;
END $canonical_tenant_admin_grants$;
