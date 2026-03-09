/* ============================================================================
   Athyper — Entity Numbering Policy (satellite table)

   Extracts the naming_policy JSONB from meta.entity into a dedicated satellite
   table. The numbering policy defines automatic document numbering patterns
   (e.g. "INV-{{FY}}-{{SEQ:5}}") and is closely coupled with the numbering
   engine and sequence tables.

   Columns moved:
     naming_policy → entity_numbering_policy.naming_policy

   Additional columns added to the satellite for cohesion:
     is_active     — allows disabling numbering without deleting the policy
     last_reset_at — tracks the most recent sequence reset (operational)

   The original naming_policy column on meta.entity is NOT dropped (backward
   compat). Reads should prefer entity_numbering_policy; the old column becomes
   stale and will be dropped in a future migration.

   PostgreSQL 16+
   Depends on: 040_meta.sql, 059_jsonb_validation.sql, 062_cross_entity_consistency.sql
   ============================================================================ */

-- ============================================================================
-- 1. CREATE SATELLITE TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS meta.entity_numbering_policy (
    entity_id      uuid        NOT NULL,
    tenant_id      uuid        NOT NULL,
    naming_policy  jsonb,
    is_active      boolean     NOT NULL DEFAULT true,
    last_reset_at  timestamptz,
    updated_at     timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT pk_entity_numbering_policy PRIMARY KEY (entity_id),
    CONSTRAINT fk_enp_entity FOREIGN KEY (entity_id)
        REFERENCES meta.entity(id) ON DELETE CASCADE,
    CONSTRAINT fk_enp_tenant FOREIGN KEY (tenant_id)
        REFERENCES core.tenant(id) ON DELETE CASCADE
);

COMMENT ON TABLE meta.entity_numbering_policy IS
  'Numbering/naming policy for entities. Defines automatic document numbering patterns, sequence reset rules, and activation state. Separated from meta.entity to isolate numbering concern and reduce row width.';

COMMENT ON COLUMN meta.entity_numbering_policy.naming_policy IS
  'Numbering rule JSONB: { code, pattern, reset_policy, seq_start, seq_increment, is_active }. Pattern supports tokens like {{FY}}, {{SEQ:5}}, {{field_name}}.';
COMMENT ON COLUMN meta.entity_numbering_policy.is_active IS
  'Whether numbering is currently active for this entity. Allows disabling without deleting the policy.';
COMMENT ON COLUMN meta.entity_numbering_policy.last_reset_at IS
  'Timestamp of the most recent sequence reset (e.g. fiscal year rollover).';

-- naming_policy structure validation (CHECK-safe, no subqueries)
ALTER TABLE meta.entity_numbering_policy DROP CONSTRAINT IF EXISTS chk_enp_naming_policy_structure;
ALTER TABLE meta.entity_numbering_policy ADD CONSTRAINT chk_enp_naming_policy_structure CHECK (
    naming_policy IS NULL
    OR (
        jsonb_typeof(naming_policy) = 'object'
        AND (NOT naming_policy ? 'pattern' OR jsonb_typeof(naming_policy -> 'pattern') = 'string')
        AND (NOT naming_policy ? 'code' OR jsonb_typeof(naming_policy -> 'code') = 'string')
        AND (NOT naming_policy ? 'reset_policy' OR (naming_policy ->> 'reset_policy') IN ('none', 'yearly', 'monthly', 'daily'))
        AND (NOT naming_policy ? 'seq_start' OR jsonb_typeof(naming_policy -> 'seq_start') = 'number')
        AND (NOT naming_policy ? 'seq_increment' OR jsonb_typeof(naming_policy -> 'seq_increment') = 'number')
        AND (NOT naming_policy ? 'is_active' OR jsonb_typeof(naming_policy -> 'is_active') = 'boolean')
    )
);

-- naming_policy key allowlist (trigger-based, since CHECK cannot use subqueries)
CREATE OR REPLACE FUNCTION meta.trg_enp_naming_policy_key_allowlist()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    _allowed text[] := ARRAY['code', 'pattern', 'reset_policy', 'seq_start', 'seq_increment', 'is_active'];
    _key text;
BEGIN
    IF NEW.naming_policy IS NOT NULL THEN
        FOR _key IN SELECT jsonb_object_keys(NEW.naming_policy) LOOP
            IF _key != ALL(_allowed) THEN
                RAISE EXCEPTION 'entity_numbering_policy.naming_policy contains disallowed key: %', _key;
            END IF;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enp_naming_policy_key_allowlist ON meta.entity_numbering_policy;

CREATE TRIGGER enp_naming_policy_key_allowlist
    BEFORE INSERT OR UPDATE OF naming_policy ON meta.entity_numbering_policy
    FOR EACH ROW
    EXECUTE FUNCTION meta.trg_enp_naming_policy_key_allowlist();

-- Index for tenant scoping
CREATE INDEX IF NOT EXISTS idx_enp_tenant
    ON meta.entity_numbering_policy (tenant_id);

-- Index for active numbering policies (used by numbering engine)
CREATE INDEX IF NOT EXISTS idx_enp_active
    ON meta.entity_numbering_policy (tenant_id, entity_id)
    WHERE is_active = true AND naming_policy IS NOT NULL;

-- ============================================================================
-- 2. BACKFILL FROM meta.entity
-- ============================================================================

INSERT INTO meta.entity_numbering_policy (
    entity_id, tenant_id, naming_policy, is_active, updated_at
)
SELECT
    id, tenant_id, naming_policy,
    -- Derive is_active from naming_policy content or feature_flags
    COALESCE(
        (naming_policy ->> 'is_active')::boolean,
        (feature_flags ->> 'numbering_enabled')::boolean,
        naming_policy IS NOT NULL
    ),
    COALESCE(updated_at, now())
FROM meta.entity
WHERE naming_policy IS NOT NULL
ON CONFLICT (entity_id) DO UPDATE SET
    naming_policy = EXCLUDED.naming_policy,
    is_active     = EXCLUDED.is_active,
    updated_at    = now();

-- ============================================================================
-- 3. ENSURE ROW EXISTS TRIGGER (auto-create on entity insert)
-- ============================================================================
-- Unlike publish_state and ui_profile, numbering rows are only needed for
-- entities that actually use numbering. We still auto-create so the satellite
-- is always joinable, but with is_active = false and naming_policy = NULL.

CREATE OR REPLACE FUNCTION meta.trg_ensure_entity_numbering_policy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO meta.entity_numbering_policy (
        entity_id, tenant_id, naming_policy, is_active, updated_at
    )
    VALUES (NEW.id, NEW.tenant_id, NEW.naming_policy, NEW.naming_policy IS NOT NULL, now())
    ON CONFLICT (entity_id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_entity_numbering_policy ON meta.entity;

CREATE TRIGGER ensure_entity_numbering_policy
    AFTER INSERT ON meta.entity
    FOR EACH ROW
    EXECUTE FUNCTION meta.trg_ensure_entity_numbering_policy();

COMMENT ON TRIGGER ensure_entity_numbering_policy ON meta.entity IS
  'Auto-creates a meta.entity_numbering_policy row when a new entity is registered.';

-- ============================================================================
-- 4. DUAL-WRITE TRIGGER (keep legacy column in sync during migration)
-- ============================================================================

CREATE OR REPLACE FUNCTION meta.trg_sync_entity_numbering_to_legacy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE meta.entity
    SET naming_policy = NEW.naming_policy,
        updated_at   = now()
    WHERE id = NEW.entity_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_entity_numbering_to_legacy ON meta.entity_numbering_policy;

CREATE TRIGGER sync_entity_numbering_to_legacy
    AFTER UPDATE ON meta.entity_numbering_policy
    FOR EACH ROW
    EXECUTE FUNCTION meta.trg_sync_entity_numbering_to_legacy();

COMMENT ON TRIGGER sync_entity_numbering_to_legacy ON meta.entity_numbering_policy IS
  'Dual-write: syncs naming_policy changes back to meta.entity legacy column during migration period.';

-- ============================================================================
-- 5. RETARGET CROSS-ENTITY CONSISTENCY TRIGGER
-- ============================================================================
-- The existing trg_entity_numbering_policy_check (from 062) fires on
-- meta.entity INSERT/UPDATE and checks that DOCUMENT entities with
-- numbering_enabled have a naming_policy. We add a parallel check on
-- the satellite table.

CREATE OR REPLACE FUNCTION meta.trg_enp_numbering_consistency_check()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    v_entity_class text;
    v_numbering_flag boolean;
BEGIN
    -- Look up the entity's class and numbering flag
    SELECT entity_class, (feature_flags ->> 'numbering_enabled')::boolean
    INTO v_entity_class, v_numbering_flag
    FROM meta.entity
    WHERE id = NEW.entity_id;

    -- Only applies to DOCUMENT entities with numbering enabled
    IF v_entity_class = 'DOCUMENT' AND v_numbering_flag IS TRUE
       AND NEW.naming_policy IS NULL THEN
        RAISE EXCEPTION
            'CONSISTENCY_CHECK: DOCUMENT entity has numbering_enabled=true but naming_policy is NULL in entity_numbering_policy. '
            'Set a naming_policy with at least a pattern field, or disable numbering.'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enp_numbering_consistency_check ON meta.entity_numbering_policy;

CREATE TRIGGER enp_numbering_consistency_check
    BEFORE INSERT OR UPDATE ON meta.entity_numbering_policy
    FOR EACH ROW
    EXECUTE FUNCTION meta.trg_enp_numbering_consistency_check();

COMMENT ON TRIGGER enp_numbering_consistency_check ON meta.entity_numbering_policy IS
  'Ensures DOCUMENT entities with numbering_enabled=true have a naming_policy defined in the satellite table.';

-- ============================================================================
-- 6. VIEW: Unified entity + numbering policy (convenience)
-- ============================================================================

CREATE OR REPLACE VIEW meta.entity_with_numbering_policy AS
SELECT
    e.*,
    enp.naming_policy  AS enp_naming_policy,
    enp.is_active      AS enp_numbering_active,
    enp.last_reset_at  AS enp_last_reset_at
FROM meta.entity e
LEFT JOIN meta.entity_numbering_policy enp ON enp.entity_id = e.id;

COMMENT ON VIEW meta.entity_with_numbering_policy IS
  'Convenience view joining meta.entity with meta.entity_numbering_policy for admin queries.';
