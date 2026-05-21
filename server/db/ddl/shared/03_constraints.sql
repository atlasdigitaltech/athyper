-- ============================================================================
-- shared/03_constraints.sql
-- Concept: Reference Data FKs — shared schema foreign key constraints
-- Depends on: 04_tables/001_shared.sql
-- ============================================================================
-- Cross-schema and deferred FK constraints. Idempotent via DO blocks.
-- DEFERRABLE rationale: self-referencing FKs require deferral during bulk seed
-- (e.g. timezone alias rows reference canonical rows in the same transaction).

-- Self-referencing FKs

-- DEFERRABLE: alias rows reference canonical rows seeded in same transaction
DO $$ BEGIN
    ALTER TABLE shared.timezone
        ADD CONSTRAINT timezone_canonical_fk
        FOREIGN KEY (canonical_code) REFERENCES shared.timezone (code)
        ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE shared.locale
        ADD CONSTRAINT locale_language_fk
        FOREIGN KEY (language_code) REFERENCES shared.language (code)
        ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE shared.locale
        ADD CONSTRAINT locale_country_fk
        FOREIGN KEY (country_code) REFERENCES shared.country (code)
        ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE shared.state_region
        ADD CONSTRAINT state_region_country_fk
        FOREIGN KEY (country_code) REFERENCES shared.country (code)
        ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- DEFERRABLE: nested subdivisions reference parent rows seeded in same transaction
DO $$ BEGIN
    ALTER TABLE shared.state_region
        ADD CONSTRAINT state_region_parent_fk
        FOREIGN KEY (country_code, parent_code) REFERENCES shared.state_region (country_code, code)
        ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Cross-schema lookup validation (shared → meta)
-- Session-dependent CHECK constraints removed — replaced by trigger-based
-- validation via control.trg_validate_lookup_columns() in 09_triggers/001_shared.sql.
-- See P2-8 for rationale.

ALTER TABLE shared.uom DROP CONSTRAINT IF EXISTS fk_uom_quantity_type;
ALTER TABLE shared.uom DROP CONSTRAINT IF EXISTS uom_quantity_type_chk;

-- DEFERRABLE: domain codes seeded before commodity/industry codes in same transaction
DO $$ BEGIN
    ALTER TABLE shared.commodity_code
        ADD CONSTRAINT fk_commodity_code_domain
        FOREIGN KEY (domain_code) REFERENCES control.lookup_domain (code)
        ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- DEFERRABLE: same rationale as commodity_code
DO $$ BEGIN
    ALTER TABLE shared.industry_code
        ADD CONSTRAINT fk_industry_code_domain
        FOREIGN KEY (domain_code) REFERENCES control.lookup_domain (code)
        ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- persona.scope_mode — session-dependent CHECK removed, trigger-based validation added.
ALTER TABLE shared.persona DROP CONSTRAINT IF EXISTS persona_scope_mode_chk;

-- ── RBAC Phase 1 constraints ────────────────────────────────

-- permission.category_id → permission_category
DO $$ BEGIN
    ALTER TABLE shared.permission
        ADD CONSTRAINT permission_category_fk
        FOREIGN KEY (category_id) REFERENCES shared.permission_category (id)
        ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- persona_permission → persona
DO $$ BEGIN
    ALTER TABLE shared.persona_permission
        ADD CONSTRAINT persona_permission_persona_fk
        FOREIGN KEY (persona_id) REFERENCES shared.persona (id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- persona_permission → permission
DO $$ BEGIN
    ALTER TABLE shared.persona_permission
        ADD CONSTRAINT persona_permission_permission_fk
        FOREIGN KEY (permission_id) REFERENCES shared.permission (id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- plan_module_access → subscription_plan_version
DO $$ BEGIN
    ALTER TABLE shared.plan_module_access
        ADD CONSTRAINT pma_plan_version_fk
        FOREIGN KEY (plan_version_id) REFERENCES shared.subscription_plan_version (id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- plan_module_access → module
DO $$ BEGIN
    ALTER TABLE shared.plan_module_access
        ADD CONSTRAINT pma_module_fk
        FOREIGN KEY (module_id) REFERENCES shared.module (id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- plan_permission_access → subscription_plan_version
DO $$ BEGIN
    ALTER TABLE shared.plan_permission_access
        ADD CONSTRAINT ppa_plan_version_fk
        FOREIGN KEY (plan_version_id) REFERENCES shared.subscription_plan_version (id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- plan_permission_access → permission
DO $$ BEGIN
    ALTER TABLE shared.plan_permission_access
        ADD CONSTRAINT ppa_permission_fk
        FOREIGN KEY (permission_id) REFERENCES shared.permission (id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- plan_feature_access → subscription_plan_version
DO $$ BEGIN
    ALTER TABLE shared.plan_feature_access
        ADD CONSTRAINT pfa_plan_version_fk
        FOREIGN KEY (plan_version_id) REFERENCES shared.subscription_plan_version (id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- plan_feature_access → enterprise_feature
DO $$ BEGIN
    ALTER TABLE shared.plan_feature_access
        ADD CONSTRAINT pfa_feature_fk
        FOREIGN KEY (feature_id) REFERENCES shared.enterprise_feature (id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- UNIQUE constraints on access tables (may be missing when the table existed
-- before the plan_id → plan_version_id migration and was altered in-place).
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'shared.plan_module_access'::regclass
          AND conname = 'plan_module_access_uq'
    ) THEN
        DROP INDEX IF EXISTS shared.plan_module_access_uq;
        ALTER TABLE shared.plan_module_access
            ADD CONSTRAINT plan_module_access_uq UNIQUE (plan_version_id, module_id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'shared.plan_permission_access'::regclass
          AND conname = 'plan_permission_access_uq'
    ) THEN
        DROP INDEX IF EXISTS shared.plan_permission_access_uq;
        ALTER TABLE shared.plan_permission_access
            ADD CONSTRAINT plan_permission_access_uq UNIQUE (plan_version_id, permission_id);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'shared.plan_feature_access'::regclass
          AND conname = 'plan_feature_access_uq'
    ) THEN
        DROP INDEX IF EXISTS shared.plan_feature_access_uq;
        ALTER TABLE shared.plan_feature_access
            ADD CONSTRAINT plan_feature_access_uq UNIQUE (plan_version_id, feature_id);
    END IF;
END $$;

-- Enforce NOT NULL on plan_version_id across all three access tables.
-- On fresh DBs the column is already NOT NULL from CREATE TABLE IF NOT EXISTS.
-- On migrated DBs the ALTER TABLE migration path adds it as nullable; this
-- block enforces NOT NULL after the FK is in place (no rows exist yet at
-- DDL time, so the constraint is safe to add immediately).
DO $$ BEGIN
    ALTER TABLE shared.plan_module_access     ALTER COLUMN plan_version_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE shared.plan_permission_access ALTER COLUMN plan_version_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE shared.plan_feature_access    ALTER COLUMN plan_version_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;


-- ── §CCW  shared.commodity_crosswalk ────────────────────────────────────────
-- Composite FK to shared.commodity_code (domain_code, code) for source + target.
-- Enforces referential integrity against the standard code registry.
DO $$ BEGIN ALTER TABLE shared.commodity_crosswalk ADD CONSTRAINT ccw_source_fk
    FOREIGN KEY (source_domain_code, source_code)
    REFERENCES shared.commodity_code (domain_code, code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE shared.commodity_crosswalk ADD CONSTRAINT ccw_target_fk
    FOREIGN KEY (target_domain_code, target_code)
    REFERENCES shared.commodity_code (domain_code, code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── §ICW  shared.industry_crosswalk ─────────────────────────────────────────
-- Composite FK to shared.industry_code (domain_code, code) for source + target.
DO $$ BEGIN ALTER TABLE shared.industry_crosswalk ADD CONSTRAINT icw_source_fk
    FOREIGN KEY (source_domain_code, source_code)
    REFERENCES shared.industry_code (domain_code, code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE shared.industry_crosswalk ADD CONSTRAINT icw_target_fk
    FOREIGN KEY (target_domain_code, target_code)
    REFERENCES shared.industry_code (domain_code, code) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
