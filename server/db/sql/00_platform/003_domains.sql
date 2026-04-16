-- ============================================================================
-- 00_platform/003_domains.sql
-- Concept: Domain Types — reusable PostgreSQL CHECK domains for status and lifecycle fields
-- Depends on: 01_schemas/001_schemas.sql
-- ============================================================================

-- shared.ref_status_d — two-state lifecycle: active | deprecated
DO $$ BEGIN
    CREATE DOMAIN shared.ref_status_d AS TEXT
        CONSTRAINT ref_status_check
        CHECK (VALUE IN ('active', 'deprecated'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON DOMAIN shared.ref_status_d IS
  'Two-state lifecycle for shared reference/lookup tables: active | deprecated.';


-- shared.active_inactive_d — operational entity status: active | inactive
DO $$ BEGIN
    CREATE DOMAIN shared.active_inactive_d AS TEXT
        CONSTRAINT active_inactive_check
        CHECK (VALUE IN ('active', 'inactive'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON DOMAIN shared.active_inactive_d IS
  'Operational entity status: active | inactive. '
  'Used by control, master, and other schemas for entities with a binary lifecycle.';


-- shared.active_inactive_archived_d — extended lifecycle: active | inactive | archived
DO $$ BEGIN
    CREATE DOMAIN shared.active_inactive_archived_d AS TEXT
        CONSTRAINT active_inactive_archived_check
        CHECK (VALUE IN ('active', 'inactive', 'archived'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON DOMAIN shared.active_inactive_archived_d IS
  'Extended lifecycle: active | inactive | archived. '
  'Used for entities that may be soft-archived rather than just deactivated.';


-- shared.log_type_d — audit log classification: business | system
DO $$ BEGIN
    CREATE DOMAIN shared.log_type_d AS TEXT
        CONSTRAINT log_type_check
        CHECK (VALUE IN ('business', 'system'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON DOMAIN shared.log_type_d IS
  'Audit log classification: business (user-driven) | system (automated/internal). '
  'Applied across all append-only log tables.';


-- shared.mapping_type_d — crosswalk mapping quality/type
DO $$ BEGIN
    CREATE DOMAIN shared.mapping_type_d AS TEXT
        CONSTRAINT mapping_type_check
        CHECK (VALUE IN ('EXACT', 'BROAD', 'NARROW', 'PARTIAL', 'RELATED'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON DOMAIN shared.mapping_type_d IS
  'Crosswalk mapping quality: EXACT | BROAD | NARROW | PARTIAL | RELATED. '
  'Used by commodity_crosswalk and industry_crosswalk tables.';


-- shared.provenance_d — data origin/provenance tracking
DO $$ BEGIN
    CREATE DOMAIN shared.provenance_d AS TEXT
        CONSTRAINT provenance_check
        CHECK (VALUE IN ('OFFICIAL', 'AI_GENERATED', 'AI_VERIFIED', 'MANUAL', 'IMPORTED'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON DOMAIN shared.provenance_d IS
  'Data provenance: OFFICIAL | AI_GENERATED | AI_VERIFIED | MANUAL | IMPORTED. '
  'Tracks the origin and verification status of crosswalk mappings.';


-- shared.keycloak_sync_status_d — IdP/Keycloak synchronisation health
-- Superset of all valid sync states across mfa_config, principal_profile (deprecated),
-- and principal_identity_binding. Values are protocol-defined — not business-extensible.
-- mfa_config restricts to the 4-value base set via an additional column CHECK.
DO $$ BEGIN
    CREATE DOMAIN shared.keycloak_sync_status_d AS TEXT
        CONSTRAINT keycloak_sync_status_check
        CHECK (VALUE IN ('pending', 'synced', 'drift', 'error', 'disabled'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON DOMAIN shared.keycloak_sync_status_d IS
  'Keycloak/IdP sync health: pending | synced | drift | error | disabled. '
  'Protocol-defined enum — not extensible by tenants. '
  'Used by master.principal_identity_binding (all 5 values) and '
  'control.mfa_config (base 4 values; disabled not applicable to MFA credentials).';
