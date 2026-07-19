-- ============================================================================
-- control/02_mfa_keycloak_authority.sql
-- Phase 5 — Keycloak is the sole MFA credential authority.
--
-- This idempotent migration supports databases created before Phase 5. The
-- credential_hash column is intentionally removed: it contained local TOTP
-- material and must not survive the authority migration.
-- ============================================================================

ALTER TABLE control.mfa_config
    ADD COLUMN IF NOT EXISTS authority text NOT NULL DEFAULT 'keycloak';

UPDATE control.mfa_config
   SET authority = 'keycloak'
 WHERE authority IS NULL OR authority <> 'keycloak';

ALTER TABLE control.mfa_config
    DROP CONSTRAINT IF EXISTS mfa_config_authority_chk;

ALTER TABLE control.mfa_config
    ADD CONSTRAINT mfa_config_authority_chk CHECK (authority = 'keycloak');

-- Remove legacy local TOTP secrets. Keycloak AIA (CONFIGURE_TOTP) is now the
-- only supported enrollment path and Keycloak verifies every MFA challenge.
ALTER TABLE control.mfa_config
    DROP COLUMN IF EXISTS credential_hash;

COMMENT ON COLUMN control.mfa_config.authority IS
  'MFA authority for this mirror row. Phase 5 requires keycloak; credentials and verification remain in Keycloak.';

COMMENT ON COLUMN control.mfa_config.metadata IS
  'Safe Keycloak mirror metadata only. Never store OTP secrets, recovery codes, WebAuthn public keys, counters or provider tokens.';
