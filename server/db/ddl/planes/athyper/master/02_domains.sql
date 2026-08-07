CREATE DOMAIN master.canonical_party_kind_d AS text
  CHECK (VALUE IN ('platform','business_group','legal_entity','sole_proprietor','government','nonprofit'));
CREATE DOMAIN master.party_verification_status_d AS text
  CHECK (VALUE IN ('unverified','pending','verified','rejected','expired'));
CREATE DOMAIN master.party_lifecycle_status_d AS text
  CHECK (VALUE IN ('draft','active','suspended','merged','retired'));
CREATE DOMAIN master.party_identifier_claim_status_d AS text
  CHECK (VALUE IN ('claimed','verified','disputed','released','revoked'));
CREATE DOMAIN master.party_relationship_status_d AS text
  CHECK (VALUE IN ('pending','active','suspended','terminated'));

-- Sealed principal/IAM/UI protocol values.
-- These domains are identical in Athyper, Neon, and Mesh.
-- Extensible registry keys (event_code, preference_code, surface_code) remain
-- text with strict format checks because their values are module-owned.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'master' AND t.typname = 'principal_type_d'
  ) THEN
    CREATE DOMAIN master.principal_type_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'master' AND t.typname = 'principal_provisioning_source_d'
  ) THEN
    CREATE DOMAIN master.principal_provisioning_source_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'master' AND t.typname = 'principal_status_d'
  ) THEN
    CREATE DOMAIN master.principal_status_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'master' AND t.typname = 'identity_provider_d'
  ) THEN
    CREATE DOMAIN master.identity_provider_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'master' AND t.typname = 'identity_binding_status_d'
  ) THEN
    CREATE DOMAIN master.identity_binding_status_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'master' AND t.typname = 'ui_appearance_mode_d'
  ) THEN
    CREATE DOMAIN master.ui_appearance_mode_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'master' AND t.typname = 'ui_density_d'
  ) THEN
    CREATE DOMAIN master.ui_density_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'master' AND t.typname = 'saved_view_scope_d'
  ) THEN
    CREATE DOMAIN master.saved_view_scope_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'master' AND t.typname = 'notification_channel_d'
  ) THEN
    CREATE DOMAIN master.notification_channel_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'master' AND t.typname = 'notification_digest_frequency_d'
  ) THEN
    CREATE DOMAIN master.notification_digest_frequency_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'master' AND t.typname = 'template_status_d'
  ) THEN
    CREATE DOMAIN master.template_status_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'master' AND t.typname = 'template_engine_d'
  ) THEN
    CREATE DOMAIN master.template_engine_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'master' AND t.typname = 'print_paper_size_d'
  ) THEN
    CREATE DOMAIN master.print_paper_size_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'master' AND t.typname = 'print_orientation_d'
  ) THEN
    CREATE DOMAIN master.print_orientation_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'master' AND t.typname = 'print_margin_d'
  ) THEN
    CREATE DOMAIN master.print_margin_d AS text;
  END IF;
END $$;

ALTER DOMAIN master.principal_type_d DROP CONSTRAINT IF EXISTS principal_type_d_check;
ALTER DOMAIN master.principal_type_d ADD CONSTRAINT principal_type_d_check
    CHECK (VALUE IN (
        'user',
        'service_account',
        'bot',
        'integration',
        'support'
    ));
COMMENT ON DOMAIN master.principal_type_d IS
  'Application actor class. Tenant/admin distinctions belong to authz roles, not principal type.';

ALTER DOMAIN master.principal_provisioning_source_d DROP CONSTRAINT IF EXISTS principal_provisioning_source_d_check;
ALTER DOMAIN master.principal_provisioning_source_d ADD CONSTRAINT principal_provisioning_source_d_check
    CHECK (VALUE IN (
        'internal',
        'jit',
        'sync',
        'import',
        'api'
    ));
COMMENT ON DOMAIN master.principal_provisioning_source_d IS
  'How the application principal was provisioned.';

ALTER DOMAIN master.principal_status_d DROP CONSTRAINT IF EXISTS principal_status_d_check;
ALTER DOMAIN master.principal_status_d ADD CONSTRAINT principal_status_d_check
    CHECK (VALUE IN ('active', 'suspended', 'deactivated'));

ALTER DOMAIN master.identity_provider_d DROP CONSTRAINT IF EXISTS identity_provider_d_check;
ALTER DOMAIN master.identity_provider_d ADD CONSTRAINT identity_provider_d_check
    CHECK (VALUE IN (
        'keycloak',
        'oidc',
        'saml',
        'microsoft',
        'google',
        'okta',
        'ldap',
        'github'
    ));
COMMENT ON DOMAIN master.identity_provider_d IS
  'Sealed IAM adapter identifier. Adding a provider requires a corresponding trusted adapter.';

ALTER DOMAIN master.identity_binding_status_d DROP CONSTRAINT IF EXISTS identity_binding_status_d_check;
ALTER DOMAIN master.identity_binding_status_d ADD CONSTRAINT identity_binding_status_d_check
    CHECK (VALUE IN ('active', 'disabled', 'revoked'));

ALTER DOMAIN master.ui_appearance_mode_d DROP CONSTRAINT IF EXISTS ui_appearance_mode_d_check;
ALTER DOMAIN master.ui_appearance_mode_d ADD CONSTRAINT ui_appearance_mode_d_check
    CHECK (VALUE IN ('light', 'dark', 'system'));

ALTER DOMAIN master.ui_density_d DROP CONSTRAINT IF EXISTS ui_density_d_check;
ALTER DOMAIN master.ui_density_d ADD CONSTRAINT ui_density_d_check
    CHECK (VALUE IN ('compact', 'comfortable', 'spacious'));

ALTER DOMAIN master.saved_view_scope_d DROP CONSTRAINT IF EXISTS saved_view_scope_d_check;
ALTER DOMAIN master.saved_view_scope_d ADD CONSTRAINT saved_view_scope_d_check
    CHECK (VALUE IN ('personal', 'shared', 'system'));
COMMENT ON DOMAIN master.saved_view_scope_d IS
  'Saved-view visibility and ownership class. Personal rows require an owner; shared and system rows do not.';

ALTER DOMAIN master.notification_channel_d DROP CONSTRAINT IF EXISTS notification_channel_d_check;
ALTER DOMAIN master.notification_channel_d ADD CONSTRAINT notification_channel_d_check
    CHECK (VALUE IN (
        'in_app',
        'email',
        'sms',
        'push',
        'webhook',
        'whatsapp'
    ));

ALTER DOMAIN master.notification_digest_frequency_d DROP CONSTRAINT IF EXISTS notification_digest_frequency_d_check;
ALTER DOMAIN master.notification_digest_frequency_d ADD CONSTRAINT notification_digest_frequency_d_check
    CHECK (VALUE IN (
        'hourly_digest',
        'daily_digest',
        'weekly_digest'
    ));
COMMENT ON DOMAIN master.notification_digest_frequency_d IS
  'Digest override. NULL on a preference means immediate/default routing.';

ALTER DOMAIN master.template_status_d DROP CONSTRAINT IF EXISTS template_status_d_check;
ALTER DOMAIN master.template_status_d ADD CONSTRAINT template_status_d_check
    CHECK (VALUE IN ('draft', 'review', 'published', 'archived'));

ALTER DOMAIN master.template_engine_d DROP CONSTRAINT IF EXISTS template_engine_d_check;
ALTER DOMAIN master.template_engine_d ADD CONSTRAINT template_engine_d_check
    CHECK (VALUE IN ('handlebars'));

ALTER DOMAIN master.print_paper_size_d DROP CONSTRAINT IF EXISTS print_paper_size_d_check;
ALTER DOMAIN master.print_paper_size_d ADD CONSTRAINT print_paper_size_d_check
    CHECK (VALUE IN ('A3', 'A4', 'A5', 'B4', 'Letter', 'Legal'));

ALTER DOMAIN master.print_orientation_d DROP CONSTRAINT IF EXISTS print_orientation_d_check;
ALTER DOMAIN master.print_orientation_d ADD CONSTRAINT print_orientation_d_check
    CHECK (VALUE IN ('portrait', 'landscape'));

ALTER DOMAIN master.print_margin_d DROP CONSTRAINT IF EXISTS print_margin_d_check;
ALTER DOMAIN master.print_margin_d ADD CONSTRAINT print_margin_d_check
    CHECK (VALUE IN ('none', 'narrow', 'normal', 'wide'));
