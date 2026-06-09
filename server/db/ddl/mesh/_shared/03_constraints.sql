-- ============================================================================
-- mesh/_shared/03_constraints.sql
-- Concept: Mesh-safe shared schema constraints for the standalone Mesh database
-- Depends on: shared/01_tables.sql
-- ============================================================================
-- This slice intentionally avoids NEON-only dependencies such as control.*.
-- Mesh gets a local shared schema snapshot and validates only shared-to-shared
-- relationships here.

-- DEFERRABLE: alias rows reference canonical rows seeded in the same transaction.
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

-- DEFERRABLE: nested subdivisions reference parent rows seeded in the same transaction.
DO $$ BEGIN
    ALTER TABLE shared.state_region
        ADD CONSTRAINT state_region_parent_fk
        FOREIGN KEY (country_code, parent_code) REFERENCES shared.state_region (country_code, code)
        ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- NEON validates these through control.lookup_domain/control.lookup_value.
-- Mesh has no control schema, so these lookup-backed constraints/triggers are
-- deliberately absent in the standalone Mesh database.
ALTER TABLE shared.uom DROP CONSTRAINT IF EXISTS fk_uom_quantity_type;
ALTER TABLE shared.uom DROP CONSTRAINT IF EXISTS uom_quantity_type_chk;
ALTER TABLE shared.persona DROP CONSTRAINT IF EXISTS persona_scope_mode_chk;

-- RBAC/catalog constraints.
DO $$ BEGIN
    ALTER TABLE shared.permission
        ADD CONSTRAINT permission_category_fk
        FOREIGN KEY (category_id) REFERENCES shared.permission_category (id)
        ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE shared.persona_permission
        ADD CONSTRAINT persona_permission_persona_fk
        FOREIGN KEY (persona_id) REFERENCES shared.persona (id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE shared.persona_permission
        ADD CONSTRAINT persona_permission_permission_fk
        FOREIGN KEY (permission_id) REFERENCES shared.permission (id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE shared.plan_module_access
        ADD CONSTRAINT pma_plan_version_fk
        FOREIGN KEY (plan_version_id) REFERENCES shared.subscription_plan_version (id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE shared.plan_module_access
        ADD CONSTRAINT pma_module_fk
        FOREIGN KEY (module_id) REFERENCES shared.module (id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE shared.plan_permission_access
        ADD CONSTRAINT ppa_plan_version_fk
        FOREIGN KEY (plan_version_id) REFERENCES shared.subscription_plan_version (id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE shared.plan_permission_access
        ADD CONSTRAINT ppa_permission_fk
        FOREIGN KEY (permission_id) REFERENCES shared.permission (id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE shared.plan_feature_access
        ADD CONSTRAINT pfa_plan_version_fk
        FOREIGN KEY (plan_version_id) REFERENCES shared.subscription_plan_version (id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE shared.plan_feature_access
        ADD CONSTRAINT pfa_feature_fk
        FOREIGN KEY (feature_id) REFERENCES shared.enterprise_feature (id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE shared.role
        ADD CONSTRAINT shared_role_persona_fk
        FOREIGN KEY (persona_id) REFERENCES shared.persona (id)
        ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE shared.role
        ADD CONSTRAINT shared_role_module_fk
        FOREIGN KEY (module_id) REFERENCES shared.module (id)
        ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE shared.role
        ADD CONSTRAINT shared_role_workspace_fk
        FOREIGN KEY (workspace_id) REFERENCES shared.workspace (id)
        ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- UNIQUE constraints on access tables may be missing in migrated databases.
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

DO $$ BEGIN
    ALTER TABLE shared.plan_module_access ALTER COLUMN plan_version_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE shared.plan_permission_access ALTER COLUMN plan_version_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE shared.plan_feature_access ALTER COLUMN plan_version_id SET NOT NULL;
EXCEPTION WHEN others THEN NULL;
END $$;

-- Commodity and industry crosswalk integrity stays local to shared.*.
DO $$ BEGIN
    ALTER TABLE shared.commodity_crosswalk
        ADD CONSTRAINT ccw_source_fk
        FOREIGN KEY (source_domain_code, source_code)
        REFERENCES shared.commodity_code (domain_code, code)
        ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE shared.commodity_crosswalk
        ADD CONSTRAINT ccw_target_fk
        FOREIGN KEY (target_domain_code, target_code)
        REFERENCES shared.commodity_code (domain_code, code)
        ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE shared.industry_crosswalk
        ADD CONSTRAINT icw_source_fk
        FOREIGN KEY (source_domain_code, source_code)
        REFERENCES shared.industry_code (domain_code, code)
        ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE shared.industry_crosswalk
        ADD CONSTRAINT icw_target_fk
        FOREIGN KEY (target_domain_code, target_code)
        REFERENCES shared.industry_code (domain_code, code)
        ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
