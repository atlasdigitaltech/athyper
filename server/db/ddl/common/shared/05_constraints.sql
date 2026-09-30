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

ALTER TABLE shared.commodity_code
    ADD CONSTRAINT commodity_code_domain_id_uq UNIQUE (domain_code, id);

ALTER TABLE shared.commodity_code
    ADD CONSTRAINT commodity_code_scheme_fk
    FOREIGN KEY (domain_code)
    REFERENCES shared.classification_scheme (code)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE shared.commodity_code
    ADD CONSTRAINT commodity_code_parent_fk
    FOREIGN KEY (domain_code, parent_code)
    REFERENCES shared.commodity_code (domain_code, code)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE shared.industry_code
    ADD CONSTRAINT industry_code_domain_id_uq UNIQUE (domain_code, id);

ALTER TABLE shared.industry_code
    ADD CONSTRAINT industry_code_scheme_fk
    FOREIGN KEY (domain_code)
    REFERENCES shared.classification_scheme (code)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE shared.industry_code
    ADD CONSTRAINT industry_code_parent_fk
    FOREIGN KEY (domain_code, parent_code)
    REFERENCES shared.industry_code (domain_code, code)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;


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
