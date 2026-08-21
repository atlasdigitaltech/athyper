-- Common all-plane authorization authority. Rows remain plane-local unless explicitly marked as a published projection.
-- Unified authorization protocol and lifecycle values.
-- This file is identical in Athyper, Neon, and Mesh.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'authz' AND t.typname = 'permission_kind_d'
  ) THEN
    CREATE DOMAIN authz.permission_kind_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'authz' AND t.typname = 'risk_tier_d'
  ) THEN
    CREATE DOMAIN authz.risk_tier_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'authz' AND t.typname = 'catalog_status_d'
  ) THEN
    CREATE DOMAIN authz.catalog_status_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'authz' AND t.typname = 'scope_kind_d'
  ) THEN
    CREATE DOMAIN authz.scope_kind_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'authz' AND t.typname = 'propagation_mode_d'
  ) THEN
    CREATE DOMAIN authz.propagation_mode_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'authz' AND t.typname = 'source_type_d'
  ) THEN
    CREATE DOMAIN authz.source_type_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'authz' AND t.typname = 'membership_kind_d'
  ) THEN
    CREATE DOMAIN authz.membership_kind_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'authz' AND t.typname = 'membership_status_d'
  ) THEN
    CREATE DOMAIN authz.membership_status_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'authz' AND t.typname = 'authority_status_d'
  ) THEN
    CREATE DOMAIN authz.authority_status_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'authz' AND t.typname = 'definition_status_d'
  ) THEN
    CREATE DOMAIN authz.definition_status_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'authz' AND t.typname = 'scope_status_d'
  ) THEN
    CREATE DOMAIN authz.scope_status_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'authz' AND t.typname = 'role_kind_d'
  ) THEN
    CREATE DOMAIN authz.role_kind_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'authz' AND t.typname = 'group_kind_d'
  ) THEN
    CREATE DOMAIN authz.group_kind_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'authz' AND t.typname = 'subject_kind_d'
  ) THEN
    CREATE DOMAIN authz.subject_kind_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'authz' AND t.typname = 'approval_status_d'
  ) THEN
    CREATE DOMAIN authz.approval_status_d AS text;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'authz' AND t.typname = 'acl_status_d'
  ) THEN
    CREATE DOMAIN authz.acl_status_d AS text;
  END IF;
END $$;

ALTER DOMAIN authz.permission_kind_d DROP CONSTRAINT IF EXISTS permission_kind_d_check;
ALTER DOMAIN authz.permission_kind_d ADD CONSTRAINT permission_kind_d_check
    CHECK (VALUE IN ('entity_operation', 'capability', 'system_action'));
ALTER DOMAIN authz.risk_tier_d DROP CONSTRAINT IF EXISTS risk_tier_d_check;
ALTER DOMAIN authz.risk_tier_d ADD CONSTRAINT risk_tier_d_check
    CHECK (VALUE IN ('low', 'medium', 'high', 'critical'));
ALTER DOMAIN authz.catalog_status_d DROP CONSTRAINT IF EXISTS catalog_status_d_check;
ALTER DOMAIN authz.catalog_status_d ADD CONSTRAINT catalog_status_d_check
    CHECK (VALUE IN ('draft', 'published', 'suspended', 'retired'));
ALTER DOMAIN authz.scope_kind_d DROP CONSTRAINT IF EXISTS scope_kind_d_check;
ALTER DOMAIN authz.scope_kind_d ADD CONSTRAINT scope_kind_d_check
    CHECK (VALUE IN (
        'tenant',
        'workspace',
        'module',
        'company_code',
        'legal_entity',
        'operating_organization',
        'network_account',
        'network_relationship',
        'resource'
    ));
ALTER DOMAIN authz.propagation_mode_d DROP CONSTRAINT IF EXISTS propagation_mode_d_check;
ALTER DOMAIN authz.propagation_mode_d ADD CONSTRAINT propagation_mode_d_check
    CHECK (VALUE IN (
        'exact',
        'subtree',
        'member_companies',
        'relationship_participants'
    ));
ALTER DOMAIN authz.source_type_d DROP CONSTRAINT IF EXISTS source_type_d_check;
ALTER DOMAIN authz.source_type_d ADD CONSTRAINT source_type_d_check
    CHECK (VALUE IN ('seed', 'manual', 'iam_sync', 'invite', 'api', 'import'));
ALTER DOMAIN authz.membership_kind_d DROP CONSTRAINT IF EXISTS membership_kind_d_check;
ALTER DOMAIN authz.membership_kind_d ADD CONSTRAINT membership_kind_d_check
    CHECK (VALUE IN ('standard', 'support', 'service', 'integration'));
ALTER DOMAIN authz.membership_status_d DROP CONSTRAINT IF EXISTS membership_status_d_check;
ALTER DOMAIN authz.membership_status_d ADD CONSTRAINT membership_status_d_check
    CHECK (VALUE IN ('pending', 'active', 'suspended', 'revoked'));
ALTER DOMAIN authz.authority_status_d DROP CONSTRAINT IF EXISTS authority_status_d_check;
ALTER DOMAIN authz.authority_status_d ADD CONSTRAINT authority_status_d_check
    CHECK (VALUE IN ('active', 'suspended', 'revoked'));
ALTER DOMAIN authz.definition_status_d DROP CONSTRAINT IF EXISTS definition_status_d_check;
ALTER DOMAIN authz.definition_status_d ADD CONSTRAINT definition_status_d_check
    CHECK (VALUE IN ('draft', 'active', 'suspended', 'retired'));
ALTER DOMAIN authz.scope_status_d DROP CONSTRAINT IF EXISTS scope_status_d_check;
ALTER DOMAIN authz.scope_status_d ADD CONSTRAINT scope_status_d_check
    CHECK (VALUE IN ('active', 'suspended', 'retired'));
ALTER DOMAIN authz.role_kind_d DROP CONSTRAINT IF EXISTS role_kind_d_check;
ALTER DOMAIN authz.role_kind_d ADD CONSTRAINT role_kind_d_check
    CHECK (VALUE IN ('system', 'custom', 'managed'));
ALTER DOMAIN authz.group_kind_d DROP CONSTRAINT IF EXISTS group_kind_d_check;
ALTER DOMAIN authz.group_kind_d ADD CONSTRAINT group_kind_d_check
    CHECK (VALUE IN ('system', 'custom', 'iam_managed'));
ALTER DOMAIN authz.subject_kind_d DROP CONSTRAINT IF EXISTS subject_kind_d_check;
ALTER DOMAIN authz.subject_kind_d ADD CONSTRAINT subject_kind_d_check
    CHECK (VALUE IN ('tenant', 'principal', 'group'));
ALTER DOMAIN authz.approval_status_d DROP CONSTRAINT IF EXISTS approval_status_d_check;
ALTER DOMAIN authz.approval_status_d ADD CONSTRAINT approval_status_d_check
    CHECK (VALUE IN ('pending', 'active', 'revoked'));
ALTER DOMAIN authz.acl_status_d DROP CONSTRAINT IF EXISTS acl_status_d_check;
ALTER DOMAIN authz.acl_status_d ADD CONSTRAINT acl_status_d_check
    CHECK (VALUE IN ('active', 'revoked'));

COMMENT ON DOMAIN authz.scope_kind_d IS
  'Sealed superset used by all planes. Each plane seeds only policies for scope kinds it supports.';

COMMENT ON DOMAIN authz.source_type_d IS
  'How a plane-local authorization row was provisioned. Keycloak synchronization is an input, not authorization authority.';

-- Athyper-published and reconciled authorization projections.
CREATE DOMAIN authz.application_projection_status_d AS text CHECK(VALUE IN ('pending','active','suspended','retired','failed'));
CREATE DOMAIN authz.projection_provider_status_d AS text CHECK(VALUE IN ('pending','active','suspended','retired'));
CREATE DOMAIN authz.projection_ceiling_mode_d AS text CHECK(VALUE IN ('exact','subtree','member_companies'));

CREATE DOMAIN authz.operation_decision_mode_d AS text
    CHECK (VALUE IN ('entity_resource','collection'));

CREATE DOMAIN authz.scope_coordinate_source_d AS text
    CHECK (VALUE IN ('tenant_context','request_field','record_field','collection_field','relation_resolver'));

CREATE DOMAIN authz.operation_scope_binding_status_d AS text
    CHECK (VALUE IN ('draft','published','retired'));
