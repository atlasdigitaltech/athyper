-- Add authorization-epoch binding to remembered-device evidence.
-- Apply once to every plane database (Neon, Mesh, and Studio) as the schema owner.
-- Existing evidence is revoked rather than grandfathered because its enrollment
-- epoch cannot be reconstructed safely.

BEGIN;

LOCK TABLE authz.trusted_device IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE authz.trusted_device
    ADD COLUMN IF NOT EXISTS auth_epoch integer;

UPDATE authz.trusted_device
   SET auth_epoch = COALESCE(auth_epoch, 0),
       revoked_at = COALESCE(revoked_at, GREATEST(clock_timestamp(), created_at)),
       revoked_by = CASE WHEN revoked_at IS NULL THEN principal_id ELSE revoked_by END,
       revocation_reason = CASE
           WHEN revoked_at IS NULL THEN 'Revoked during authorization-epoch binding migration'
           ELSE revocation_reason
       END
 WHERE auth_epoch IS NULL;

ALTER TABLE authz.trusted_device
    ALTER COLUMN auth_epoch SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'authz.trusted_device'::regclass
           AND conname = 'trusted_device_auth_epoch_chk'
    ) THEN
        ALTER TABLE authz.trusted_device
            ADD CONSTRAINT trusted_device_auth_epoch_chk CHECK (auth_epoch >= 0);
    END IF;
END;
$$;

COMMENT ON COLUMN authz.trusted_device.auth_epoch IS
  'Principal authorization epoch captured at enrollment; any epoch increment invalidates the remembered-browser evidence.';

CREATE OR REPLACE FUNCTION authz.trg_guard_trusted_device()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = authz, pg_catalog
AS $$
BEGIN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
       OR NEW.principal_id IS DISTINCT FROM OLD.principal_id
       OR NEW.auth_epoch IS DISTINCT FROM OLD.auth_epoch
       OR NEW.device_token_hash IS DISTINCT FROM OLD.device_token_hash
       OR NEW.expires_at IS DISTINCT FROM OLD.expires_at
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
        RAISE EXCEPTION
            'authz.trusted_device identity, token, expiry, and creation evidence are immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.revoked_at IS NOT NULL
       AND (
           NEW.revoked_at IS DISTINCT FROM OLD.revoked_at
           OR NEW.revoked_by IS DISTINCT FROM OLD.revoked_by
           OR NEW.revocation_reason IS DISTINCT FROM OLD.revocation_reason
       ) THEN
        RAISE EXCEPTION 'trusted-device revocation evidence is immutable'
            USING ERRCODE = 'check_violation';
    END IF;

    IF OLD.last_seen_at IS NOT NULL
       AND NEW.last_seen_at IS NOT NULL
       AND NEW.last_seen_at < OLD.last_seen_at THEN
        RAISE EXCEPTION 'trusted-device last_seen_at cannot move backwards'
            USING ERRCODE = 'check_violation';
    END IF;

    RETURN NEW;
END;
$$;

COMMIT;
