/* ============================================================================
   Athyper — Entity Runtime Profile (satellite table)

   Extracts runtime behavior and governance metadata from meta.entity into a
   dedicated satellite table. These columns define how the entity operates at
   runtime: feature enablement, identity strategy, data-layer policies,
   governance level, engine binding, ownership, and mutability.

   This separation cleanly isolates the "what it is" (identity/classification
   on meta.entity) from the "how it behaves" (runtime profile on this table).

   Columns moved:
     feature_flags    → entity_runtime_profile.feature_flags
     identity_config  → entity_runtime_profile.identity_config
     data_policy      → entity_runtime_profile.data_policy
     governance_level → entity_runtime_profile.governance_level
     engine_tag       → entity_runtime_profile.engine_tag
     ownership_model  → entity_runtime_profile.ownership_model
     mutability       → entity_runtime_profile.mutability

   The original columns on meta.entity are NOT dropped (backward compat).
   Reads should prefer entity_runtime_profile; the old columns become stale
   and will be dropped in a future migration.

   PostgreSQL 16+
   Depends on: 040_meta.sql, 058_entity_ownership_backing.sql, 059_jsonb_validation.sql
   ============================================================================ */

-- ============================================================================
-- 1. CREATE SATELLITE TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS meta.entity_runtime_profile (
    entity_id        uuid        NOT NULL,
    tenant_id        uuid        NOT NULL,
    feature_flags    jsonb,
    identity_config  jsonb,
    data_policy      jsonb,
    governance_level text        NOT NULL DEFAULT 'full',
    engine_tag       text,
    ownership_model  text        NOT NULL DEFAULT 'system',
    mutability       text        NOT NULL DEFAULT 'controlled',
    updated_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT pk_entity_runtime_profile PRIMARY KEY (entity_id),
    CONSTRAINT fk_erp_entity FOREIGN KEY (entity_id)
        REFERENCES meta.entity(id) ON DELETE CASCADE,
    CONSTRAINT fk_erp_tenant FOREIGN KEY (tenant_id)
        REFERENCES core.tenant(id) ON DELETE CASCADE
);

COMMENT ON TABLE meta.entity_runtime_profile IS
  'Runtime behavior and governance metadata for entities. Defines feature enablement, identity strategy, data-layer policies, governance level, engine binding, ownership, and mutability. Separated from meta.entity to isolate behavioral configuration from identity/classification.';

COMMENT ON COLUMN meta.entity_runtime_profile.feature_flags IS
  'Feature enablement flags JSONB: { approval_required, numbering_enabled, effective_dating_enabled, versioning_mode, fields, relations, indexes, compiledModel, permissionPolicies, fieldSecurity, lifecycle, overlays, numbering, approvals, effectiveDating, audit }.';
COMMENT ON COLUMN meta.entity_runtime_profile.identity_config IS
  'Identity/primary-key strategy JSONB: auto-generation config, composite key definitions, external ID mappings.';
COMMENT ON COLUMN meta.entity_runtime_profile.data_policy IS
  'Data-layer behavioral policy JSONB: { soft_delete, append_only, temporal, immutable_after_state }.';
COMMENT ON COLUMN meta.entity_runtime_profile.governance_level IS
  'Governance depth: full (all gates), light (compile+deploy only), audit_only (read auditing only), none (no governance).';
COMMENT ON COLUMN meta.entity_runtime_profile.engine_tag IS
  'Optional engine binding: posting-engine, budget-engine, tax-engine, etc. NULL for generic entities.';
COMMENT ON COLUMN meta.entity_runtime_profile.ownership_model IS
  'Who owns this entity definition: system (platform-seeded), tenant (admin-created), package (module-provided), overlay (overlay-only extension).';
COMMENT ON COLUMN meta.entity_runtime_profile.mutability IS
  'Schema mutability level: locked (no changes), controlled (overlays only), extensible (add freely, base protected), forkable (can fork to tenant copy).';

-- ── Enum constraints (mirror those on meta.entity) ──

ALTER TABLE meta.entity_runtime_profile DROP CONSTRAINT IF EXISTS chk_erp_governance_level;
ALTER TABLE meta.entity_runtime_profile ADD CONSTRAINT chk_erp_governance_level
    CHECK (governance_level IN ('full', 'light', 'audit_only', 'none'));

ALTER TABLE meta.entity_runtime_profile DROP CONSTRAINT IF EXISTS chk_erp_ownership_model;
ALTER TABLE meta.entity_runtime_profile ADD CONSTRAINT chk_erp_ownership_model
    CHECK (ownership_model IN ('system', 'tenant', 'package', 'overlay'));

ALTER TABLE meta.entity_runtime_profile DROP CONSTRAINT IF EXISTS chk_erp_mutability;
ALTER TABLE meta.entity_runtime_profile ADD CONSTRAINT chk_erp_mutability
    CHECK (mutability IN ('locked', 'controlled', 'extensible', 'forkable'));

-- ── JSONB structure constraints (mirror 059 CHECK constraints) ──

ALTER TABLE meta.entity_runtime_profile DROP CONSTRAINT IF EXISTS chk_erp_feature_flags_structure;
ALTER TABLE meta.entity_runtime_profile ADD CONSTRAINT chk_erp_feature_flags_structure CHECK (
    feature_flags IS NULL
    OR (
        jsonb_typeof(feature_flags) = 'object'
        AND (NOT feature_flags ? 'approval_required' OR jsonb_typeof(feature_flags -> 'approval_required') = 'boolean')
        AND (NOT feature_flags ? 'numbering_enabled' OR jsonb_typeof(feature_flags -> 'numbering_enabled') = 'boolean')
        AND (NOT feature_flags ? 'effective_dating_enabled' OR jsonb_typeof(feature_flags -> 'effective_dating_enabled') = 'boolean')
        AND (NOT feature_flags ? 'versioning_mode' OR feature_flags ->> 'versioning_mode' IN ('none', 'sequential', 'major_minor'))
        AND (NOT feature_flags ? 'fields' OR jsonb_typeof(feature_flags -> 'fields') = 'boolean')
        AND (NOT feature_flags ? 'relations' OR jsonb_typeof(feature_flags -> 'relations') = 'boolean')
        AND (NOT feature_flags ? 'indexes' OR jsonb_typeof(feature_flags -> 'indexes') = 'boolean')
        AND (NOT feature_flags ? 'compiledModel' OR jsonb_typeof(feature_flags -> 'compiledModel') = 'boolean')
        AND (NOT feature_flags ? 'permissionPolicies' OR jsonb_typeof(feature_flags -> 'permissionPolicies') = 'boolean')
        AND (NOT feature_flags ? 'fieldSecurity' OR jsonb_typeof(feature_flags -> 'fieldSecurity') = 'boolean')
        AND (NOT feature_flags ? 'lifecycle' OR jsonb_typeof(feature_flags -> 'lifecycle') = 'boolean')
        AND (NOT feature_flags ? 'overlays' OR jsonb_typeof(feature_flags -> 'overlays') = 'boolean')
        AND (NOT feature_flags ? 'numbering' OR jsonb_typeof(feature_flags -> 'numbering') = 'boolean')
        AND (NOT feature_flags ? 'approvals' OR jsonb_typeof(feature_flags -> 'approvals') = 'boolean')
        AND (NOT feature_flags ? 'effectiveDating' OR jsonb_typeof(feature_flags -> 'effectiveDating') = 'boolean')
        AND (NOT feature_flags ? 'audit' OR jsonb_typeof(feature_flags -> 'audit') = 'boolean')
    )
);

-- feature_flags key allowlist (trigger-based, since CHECK cannot use subqueries)
CREATE OR REPLACE FUNCTION meta.trg_erp_feature_flags_key_allowlist()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    _allowed text[] := ARRAY[
        'approval_required', 'numbering_enabled',
        'effective_dating_enabled', 'versioning_mode',
        'fields', 'relations', 'indexes', 'compiledModel',
        'permissionPolicies', 'fieldSecurity', 'lifecycle', 'overlays',
        'numbering', 'approvals', 'effectiveDating', 'audit'
    ];
    _key text;
BEGIN
    IF NEW.feature_flags IS NOT NULL THEN
        FOR _key IN SELECT jsonb_object_keys(NEW.feature_flags) LOOP
            IF _key != ALL(_allowed) THEN
                RAISE EXCEPTION 'entity_runtime_profile.feature_flags contains disallowed key: %', _key;
            END IF;
        END LOOP;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS erp_feature_flags_key_allowlist ON meta.entity_runtime_profile;

CREATE TRIGGER erp_feature_flags_key_allowlist
    BEFORE INSERT OR UPDATE OF feature_flags ON meta.entity_runtime_profile
    FOR EACH ROW
    EXECUTE FUNCTION meta.trg_erp_feature_flags_key_allowlist();

ALTER TABLE meta.entity_runtime_profile DROP CONSTRAINT IF EXISTS chk_erp_data_policy_structure;
ALTER TABLE meta.entity_runtime_profile ADD CONSTRAINT chk_erp_data_policy_structure CHECK (
    data_policy IS NULL
    OR (
        jsonb_typeof(data_policy) = 'object'
        AND (NOT data_policy ? 'soft_delete' OR jsonb_typeof(data_policy -> 'soft_delete') = 'boolean')
        AND (NOT data_policy ? 'append_only' OR jsonb_typeof(data_policy -> 'append_only') = 'boolean')
        AND (NOT data_policy ? 'temporal' OR jsonb_typeof(data_policy -> 'temporal') = 'boolean')
        AND (NOT data_policy ? 'immutable_after_state' OR jsonb_typeof(data_policy -> 'immutable_after_state') = 'string')
    )
);

-- ── Indexes ──

CREATE INDEX IF NOT EXISTS idx_erp_tenant
    ON meta.entity_runtime_profile (tenant_id);

CREATE INDEX IF NOT EXISTS idx_erp_governance
    ON meta.entity_runtime_profile (tenant_id, governance_level);

CREATE INDEX IF NOT EXISTS idx_erp_engine_tag
    ON meta.entity_runtime_profile (tenant_id, engine_tag)
    WHERE engine_tag IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_erp_ownership
    ON meta.entity_runtime_profile (tenant_id, ownership_model);

-- ============================================================================
-- 2. BACKFILL FROM meta.entity
-- ============================================================================

INSERT INTO meta.entity_runtime_profile (
    entity_id, tenant_id,
    feature_flags, identity_config, data_policy,
    governance_level, engine_tag, ownership_model, mutability,
    updated_at
)
SELECT
    id, tenant_id,
    feature_flags, identity_config, data_policy,
    governance_level, engine_tag, ownership_model, mutability,
    COALESCE(updated_at, now())
FROM meta.entity
ON CONFLICT (entity_id) DO UPDATE SET
    feature_flags    = EXCLUDED.feature_flags,
    identity_config  = EXCLUDED.identity_config,
    data_policy      = EXCLUDED.data_policy,
    governance_level = EXCLUDED.governance_level,
    engine_tag       = EXCLUDED.engine_tag,
    ownership_model  = EXCLUDED.ownership_model,
    mutability       = EXCLUDED.mutability,
    updated_at       = now();

-- ============================================================================
-- 3. ENSURE ROW EXISTS TRIGGER (auto-create on entity insert)
-- ============================================================================

CREATE OR REPLACE FUNCTION meta.trg_ensure_entity_runtime_profile()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO meta.entity_runtime_profile (
        entity_id, tenant_id,
        feature_flags, identity_config, data_policy,
        governance_level, engine_tag, ownership_model, mutability,
        updated_at
    )
    VALUES (
        NEW.id, NEW.tenant_id,
        NEW.feature_flags, NEW.identity_config, NEW.data_policy,
        NEW.governance_level, NEW.engine_tag, NEW.ownership_model, NEW.mutability,
        now()
    )
    ON CONFLICT (entity_id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ensure_entity_runtime_profile ON meta.entity;

CREATE TRIGGER ensure_entity_runtime_profile
    AFTER INSERT ON meta.entity
    FOR EACH ROW
    EXECUTE FUNCTION meta.trg_ensure_entity_runtime_profile();

COMMENT ON TRIGGER ensure_entity_runtime_profile ON meta.entity IS
  'Auto-creates a meta.entity_runtime_profile row when a new entity is registered, copying initial runtime config from the entity row.';

-- ============================================================================
-- 4. DUAL-WRITE TRIGGER (keep legacy columns in sync during migration)
-- ============================================================================

CREATE OR REPLACE FUNCTION meta.trg_sync_entity_runtime_to_legacy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    UPDATE meta.entity
    SET feature_flags    = NEW.feature_flags,
        identity_config  = NEW.identity_config,
        data_policy      = NEW.data_policy,
        governance_level = NEW.governance_level,
        engine_tag       = NEW.engine_tag,
        ownership_model  = NEW.ownership_model,
        mutability       = NEW.mutability,
        updated_at       = now()
    WHERE id = NEW.entity_id;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_entity_runtime_to_legacy ON meta.entity_runtime_profile;

CREATE TRIGGER sync_entity_runtime_to_legacy
    AFTER UPDATE ON meta.entity_runtime_profile
    FOR EACH ROW
    EXECUTE FUNCTION meta.trg_sync_entity_runtime_to_legacy();

COMMENT ON TRIGGER sync_entity_runtime_to_legacy ON meta.entity_runtime_profile IS
  'Dual-write: syncs runtime profile changes back to meta.entity legacy columns during migration period.';

-- ============================================================================
-- 5. VIEW: Unified entity + runtime profile (convenience)
-- ============================================================================

CREATE OR REPLACE VIEW meta.entity_with_runtime_profile AS
SELECT
    e.*,
    erp.feature_flags    AS erp_feature_flags,
    erp.identity_config  AS erp_identity_config,
    erp.data_policy      AS erp_data_policy,
    erp.governance_level AS erp_governance_level,
    erp.engine_tag       AS erp_engine_tag,
    erp.ownership_model  AS erp_ownership_model,
    erp.mutability       AS erp_mutability
FROM meta.entity e
LEFT JOIN meta.entity_runtime_profile erp ON erp.entity_id = e.id;

COMMENT ON VIEW meta.entity_with_runtime_profile IS
  'Convenience view joining meta.entity with meta.entity_runtime_profile for admin queries.';
