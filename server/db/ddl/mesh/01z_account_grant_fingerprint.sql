-- ============================================================================
-- mesh/01z_account_grant_fingerprint.sql
-- Concept: Stable fingerprint + revoke notification for mesh.account_grant.
-- Depends on: mesh/01a_foundation_tables.sql (mesh.account_grant)
-- Scope:
--   1. fingerprint column — deterministic SHA over (principal_id, account_id,
--      role_code) so the descriptor cache key v4 can include it without
--      leaking mutable labels. Auto-computed by BEFORE trigger.
--   2. Revoke notification — when status flips from active to
--      revoked/suspended/inactive, the trigger publishes pg_notify and
--      writes log.descriptor_cache_invalidation so:
--         (a) the auth layer drops KC sessions for the principal,
--         (b) Redis purges desc:mesh:v4:*:<fingerprint>:* keys.
-- Reference: docs/local/architecture/three-plane-permission-stack.md  D8/D15
-- ============================================================================


-- ----------------------------------------------------------------------------
-- §1  Fingerprint column
-- ----------------------------------------------------------------------------
ALTER TABLE mesh.account_grant
    ADD COLUMN IF NOT EXISTS fingerprint text;

COMMENT ON COLUMN mesh.account_grant.fingerprint IS
    'D8. Stable SHA256 of (principal_id, account_id, role_code) for cache key inclusion. '
    'Auto-computed by trg_mag_fingerprint BEFORE INSERT/UPDATE. Never set by application code.';


-- ----------------------------------------------------------------------------
-- §2  Fingerprint compute function + trigger
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION mesh.fn_account_grant_fingerprint()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.fingerprint := encode(
        digest(
            COALESCE(NEW.principal_id::text, '')
            || ':' || COALESCE(NEW.account_id::text, '')
            || ':' || COALESCE(NEW.role_code, ''),
        'sha256'),
    'hex');
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION mesh.fn_account_grant_fingerprint IS
    'Auto-computes mesh.account_grant.fingerprint from (principal_id, account_id, role_code). '
    'Fires BEFORE INSERT/UPDATE on those columns; never run by application code.';

DROP TRIGGER IF EXISTS trg_mag_fingerprint ON mesh.account_grant;
CREATE TRIGGER trg_mag_fingerprint
    BEFORE INSERT OR UPDATE OF principal_id, account_id, role_code ON mesh.account_grant
    FOR EACH ROW EXECUTE FUNCTION mesh.fn_account_grant_fingerprint();

-- Backfill any existing rows. Compute fingerprint inline (cannot rely on
-- BEFORE trigger here because the trigger only fires on the listed columns;
-- a no-op UPDATE that doesn't touch principal_id/account_id/role_code would
-- not fire it). Also set updated_by to satisfy mesh_account_grant_audit_pair_chk.
UPDATE mesh.account_grant
   SET fingerprint = encode(
           digest(
               COALESCE(principal_id::text, '')
               || ':' || COALESCE(account_id::text, '')
               || ':' || COALESCE(role_code, ''),
           'sha256'),
           'hex'),
       updated_by = COALESCE(updated_by, 'system')
 WHERE fingerprint IS NULL;


-- ----------------------------------------------------------------------------
-- §3  Revoke notification function + trigger
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION mesh.fn_account_grant_revoke_hook()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_account_tenant uuid;
BEGIN
    -- Only fire when status moves from active to a non-active state
    IF OLD.status <> 'active' OR NEW.status = 'active' THEN
        RETURN NEW;
    END IF;

    IF NEW.status NOT IN ('inactive','suspended','revoked') THEN
        RETURN NEW;
    END IF;

    -- Resolve the host tenant of the network account for cache scoping
    SELECT na.tenant_id INTO v_account_tenant
      FROM mesh.network_account na
     WHERE na.id = NEW.account_id;

    -- pg_notify is the source of truth here; the cache listener (Phase 4)
    -- writes its own log row in neon.log.descriptor_cache_invalidation
    -- when it processes the event. Mesh DB does not have neon's log schema.
    PERFORM pg_notify(
        'grant_revoke',
        json_build_object(
            'grant_id',     NEW.id,
            'principal_id', NEW.principal_id,
            'account_id',   NEW.account_id,
            'tenant_id',    v_account_tenant,
            'fingerprint',  NEW.fingerprint,
            'new_status',   NEW.status,
            'at',           extract(epoch FROM now())
        )::text
    );

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION mesh.fn_account_grant_revoke_hook IS
    'D15. Fires when mesh.account_grant.status transitions out of ''active''. '
    'Publishes pg_notify(''grant_revoke'') for the session listener (KC logout + Redis purge) '
    'and writes log.descriptor_cache_invalidation for the poller fallback.';

DROP TRIGGER IF EXISTS trg_mag_revoke ON mesh.account_grant;
CREATE TRIGGER trg_mag_revoke
    AFTER UPDATE OF status ON mesh.account_grant
    FOR EACH ROW EXECUTE FUNCTION mesh.fn_account_grant_revoke_hook();
