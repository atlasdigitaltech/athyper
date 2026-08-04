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
