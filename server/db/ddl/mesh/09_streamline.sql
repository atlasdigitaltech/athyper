-- ============================================================================
-- mesh/09_streamline.sql
-- Schema streamlining migration (existing-database upgrade).
--
-- Changes applied:
--   1. Add participant identity + profile columns directly to network_account
--   2. Backfill from participant_profile → network_account
--   3. Backfill from participant       → network_account
--   4. Drop participant_id FK + column from network_account
--   5. Rename network_connection        → network_relationship
--   6. Rename participant_identifier    → network_account_identifier
--   7. Rename participant_external_reference → network_account_reference
--   8. Drop party_contact_person, party_contact_role (master.* owns these)
--   9. Drop party_tax_profile                 (master.* owns this)
--  10. Drop principal_ui_profile              (master.* owns this)
--  11. Drop principal_ui_preference           (master.* owns this)
--  12. Drop participant_profile (data backfilled into network_account)
--  13. Drop participant         (data backfilled into network_account)
--  14. Rebuild RLS for renamed tables
--  15. Rebuild indexes + triggers for renamed/new tables
--
-- Idempotent: every block guards with IF EXISTS / IF NOT EXISTS / to_regclass().
-- Run order: after 01e_commerce_tables.sql, before / together with 03_constraints.sql.
-- ============================================================================

-- ============================================================================
-- STEP 1: Add profile + identity columns to network_account
-- ============================================================================

ALTER TABLE mesh.network_account
    ADD COLUMN IF NOT EXISTS participant_type           text         NOT NULL DEFAULT 'partner_org',
    ADD COLUMN IF NOT EXISTS source_plane               text,
    ADD COLUMN IF NOT EXISTS source_ref                 text,
    ADD COLUMN IF NOT EXISTS legal_name                 text,
    ADD COLUMN IF NOT EXISTS tax_id                     text,
    ADD COLUMN IF NOT EXISTS tax_country                character(2),
    ADD COLUMN IF NOT EXISTS vat_number                 text,
    ADD COLUMN IF NOT EXISTS legal_form                 text,
    ADD COLUMN IF NOT EXISTS registration_no            text,
    ADD COLUMN IF NOT EXISTS registration_country_code  character(2),
    ADD COLUMN IF NOT EXISTS tax_residence_country_code character(2),
    ADD COLUMN IF NOT EXISTS profile_authority          text         NOT NULL DEFAULT 'neon',
    ADD COLUMN IF NOT EXISTS verification_status        text         NOT NULL DEFAULT 'unverified',
    ADD COLUMN IF NOT EXISTS verified_at                timestamptz,
    ADD COLUMN IF NOT EXISTS verified_by                text,
    ADD COLUMN IF NOT EXISTS published_at               timestamptz,
    ADD COLUMN IF NOT EXISTS website_url                text,
    ADD COLUMN IF NOT EXISTS description                text,
    ADD COLUMN IF NOT EXISTS aliases                    text[]       NOT NULL DEFAULT '{}'::text[],
    ADD COLUMN IF NOT EXISTS business_types             text[]       NOT NULL DEFAULT '{}'::text[],
    ADD COLUMN IF NOT EXISTS founded_year               smallint,
    ADD COLUMN IF NOT EXISTS employee_count_band        text,
    ADD COLUMN IF NOT EXISTS annual_revenue_band        text,
    ADD COLUMN IF NOT EXISTS incorporation_date         date,
    ADD COLUMN IF NOT EXISTS effective_from             date,
    ADD COLUMN IF NOT EXISTS effective_until            date,
    ADD COLUMN IF NOT EXISTS profile_hash               text,
    ADD COLUMN IF NOT EXISTS last_verified_at           timestamptz,
    ADD COLUMN IF NOT EXISTS profile_snapshot           jsonb        NOT NULL DEFAULT '{}'::jsonb;

DO $mesh_na_profile_checks$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='mesh.network_account'::regclass AND conname='mesh_network_account_participant_type_chk') THEN
        ALTER TABLE mesh.network_account ADD CONSTRAINT mesh_network_account_participant_type_chk
            CHECK (participant_type IN ('tenant_legal_entity','partner_org','platform','external'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='mesh.network_account'::regclass AND conname='mesh_network_account_source_plane_chk') THEN
        ALTER TABLE mesh.network_account ADD CONSTRAINT mesh_network_account_source_plane_chk
            CHECK (source_plane IS NULL OR source_plane IN ('neon','mesh','admin','external'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='mesh.network_account'::regclass AND conname='mesh_network_account_profile_authority_chk') THEN
        ALTER TABLE mesh.network_account ADD CONSTRAINT mesh_network_account_profile_authority_chk
            CHECK (profile_authority IN ('neon','mesh','self','admin'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='mesh.network_account'::regclass AND conname='mesh_network_account_verification_status_chk') THEN
        ALTER TABLE mesh.network_account ADD CONSTRAINT mesh_network_account_verification_status_chk
            CHECK (verification_status IN ('unverified','pending','verified','rejected','expired'));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='mesh.network_account'::regclass AND conname='mesh_network_account_profile_snapshot_obj_chk') THEN
        ALTER TABLE mesh.network_account ADD CONSTRAINT mesh_network_account_profile_snapshot_obj_chk
            CHECK (jsonb_typeof(profile_snapshot)='object');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='mesh.network_account'::regclass AND conname='mesh_network_account_verified_pair_chk') THEN
        ALTER TABLE mesh.network_account ADD CONSTRAINT mesh_network_account_verified_pair_chk
            CHECK ((verified_at IS NULL)=(verified_by IS NULL));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='mesh.network_account'::regclass AND conname='mesh_network_account_tax_country_chk') THEN
        ALTER TABLE mesh.network_account ADD CONSTRAINT mesh_network_account_tax_country_chk
            CHECK (tax_country IS NULL OR tax_country::text ~ '^[A-Z]{2}$');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='mesh.network_account'::regclass AND conname='mesh_network_account_reg_country_chk') THEN
        ALTER TABLE mesh.network_account ADD CONSTRAINT mesh_network_account_reg_country_chk
            CHECK (registration_country_code IS NULL OR registration_country_code::text ~ '^[A-Z]{2}$');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='mesh.network_account'::regclass AND conname='mesh_network_account_tax_res_country_chk') THEN
        ALTER TABLE mesh.network_account ADD CONSTRAINT mesh_network_account_tax_res_country_chk
            CHECK (tax_residence_country_code IS NULL OR tax_residence_country_code::text ~ '^[A-Z]{2}$');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='mesh.network_account'::regclass AND conname='mesh_network_account_website_chk') THEN
        ALTER TABLE mesh.network_account ADD CONSTRAINT mesh_network_account_website_chk
            CHECK (website_url IS NULL OR website_url ~ '^https?://');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='mesh.network_account'::regclass AND conname='mesh_network_account_founded_year_chk') THEN
        ALTER TABLE mesh.network_account ADD CONSTRAINT mesh_network_account_founded_year_chk
            CHECK (founded_year IS NULL OR founded_year BETWEEN 1800 AND 2200);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='mesh.network_account'::regclass AND conname='mesh_network_account_effective_order_chk') THEN
        ALTER TABLE mesh.network_account ADD CONSTRAINT mesh_network_account_effective_order_chk
            CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until >= effective_from);
    END IF;
END
$mesh_na_profile_checks$;

-- ============================================================================
-- STEP 2: Backfill profile data from participant_profile → network_account
-- ============================================================================

DO $mesh_backfill_pp$
BEGIN
    IF to_regclass('mesh.participant_profile') IS NOT NULL THEN
        UPDATE mesh.network_account na
        SET
            legal_name                  = COALESCE(na.legal_name,  pp.legal_name),
            tax_id                      = COALESCE(na.tax_id,      pp.tax_id),
            tax_country                 = COALESCE(na.tax_country,  pp.tax_country),
            vat_number                  = COALESCE(na.vat_number,   pp.vat_number),
            legal_form                  = COALESCE(na.legal_form,   pp.legal_form),
            registration_no             = COALESCE(na.registration_no, pp.registration_no),
            registration_country_code   = COALESCE(na.registration_country_code,  pp.registration_country_code),
            tax_residence_country_code  = COALESCE(na.tax_residence_country_code, pp.tax_residence_country_code),
            profile_authority           = CASE WHEN na.profile_authority = 'neon' THEN COALESCE(pp.profile_authority,'neon') ELSE na.profile_authority END,
            verification_status         = CASE WHEN na.verification_status = 'unverified' THEN COALESCE(pp.verification_status,'unverified') ELSE na.verification_status END,
            verified_at                 = COALESCE(na.verified_at,    pp.verified_at),
            verified_by                 = COALESCE(na.verified_by,    pp.verified_by),
            published_at                = COALESCE(na.published_at,   pp.published_at),
            website_url                 = COALESCE(na.website_url,    pp.website_url),
            description                 = COALESCE(na.description,    pp.description),
            aliases                     = CASE WHEN na.aliases    = '{}'::text[] THEN COALESCE(pp.aliases,    '{}'::text[]) ELSE na.aliases END,
            business_types              = CASE WHEN na.business_types = '{}'::text[] THEN COALESCE(pp.business_types,'{}'::text[]) ELSE na.business_types END,
            founded_year                = COALESCE(na.founded_year,   pp.founded_year),
            employee_count_band         = COALESCE(na.employee_count_band,  pp.employee_count_band),
            annual_revenue_band         = COALESCE(na.annual_revenue_band,  pp.annual_revenue_band),
            incorporation_date          = COALESCE(na.incorporation_date,   pp.incorporation_date),
            effective_from              = COALESCE(na.effective_from,  pp.effective_from),
            effective_until             = COALESCE(na.effective_until, pp.effective_until),
            profile_hash                = COALESCE(na.profile_hash,    pp.profile_hash),
            last_verified_at            = COALESCE(na.last_verified_at,pp.last_verified_at),
            profile_snapshot            = CASE WHEN na.profile_snapshot = '{}'::jsonb THEN pp.profile_snapshot ELSE na.profile_snapshot END,
            updated_at                  = now(),
            updated_by                  = 'system:09_streamline'
        FROM mesh.participant_profile pp
        WHERE pp.account_code = na.account_code;
        RAISE NOTICE '[09_streamline] Backfilled participant_profile → network_account.';
    END IF;
END
$mesh_backfill_pp$;

-- ============================================================================
-- STEP 3: Backfill identity data from participant → network_account
-- ============================================================================

DO $mesh_backfill_p$
BEGIN
    IF to_regclass('mesh.participant') IS NOT NULL
       AND EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema='mesh' AND table_name='network_account' AND column_name='participant_id'
       ) THEN
        UPDATE mesh.network_account na
        SET
            participant_type = CASE WHEN na.participant_type = 'partner_org'
                               THEN COALESCE(p.participant_type,'partner_org')
                               ELSE na.participant_type END,
            source_plane     = COALESCE(na.source_plane, p.source_plane),
            source_ref       = COALESCE(na.source_ref,   p.source_ref),
            updated_at       = now(),
            updated_by       = 'system:09_streamline'
        FROM mesh.participant p
        WHERE p.id = na.participant_id;
        RAISE NOTICE '[09_streamline] Backfilled participant → network_account.';
    END IF;
END
$mesh_backfill_p$;

-- ============================================================================
-- STEP 4: Drop participant_id FK and column from network_account
-- ============================================================================

DO $mesh_drop_participant_id$
BEGIN
    ALTER TABLE mesh.network_account DROP CONSTRAINT IF EXISTS mesh_network_account_participant_fk;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='mesh' AND table_name='network_account' AND column_name='participant_id'
    ) THEN
        DROP INDEX IF EXISTS mesh_network_account_participant_idx;
        ALTER TABLE mesh.network_account DROP COLUMN participant_id;
        RAISE NOTICE '[09_streamline] Dropped participant_id from network_account.';
    END IF;
END
$mesh_drop_participant_id$;

-- ============================================================================
-- STEP 5: Rename network_connection → network_relationship
-- ============================================================================

DO $mesh_rename_nc$
BEGIN
    IF to_regclass('mesh.network_connection') IS NOT NULL
       AND to_regclass('mesh.network_relationship') IS NULL THEN
        ALTER TABLE mesh.network_connection RENAME TO network_relationship;

        -- Rename primary constraint
        ALTER TABLE mesh.network_relationship RENAME CONSTRAINT mesh_network_connection_pkey              TO mesh_network_relationship_pkey;
        ALTER TABLE mesh.network_relationship RENAME CONSTRAINT mesh_network_connection_code_uq           TO mesh_network_relationship_code_uq;
        ALTER TABLE mesh.network_relationship RENAME CONSTRAINT mesh_network_connection_pair_uq           TO mesh_network_relationship_pair_uq;
        ALTER TABLE mesh.network_relationship RENAME CONSTRAINT mesh_network_connection_distinct_chk      TO mesh_network_relationship_distinct_chk;
        ALTER TABLE mesh.network_relationship RENAME CONSTRAINT mesh_network_connection_status_chk        TO mesh_network_relationship_status_chk;
        ALTER TABLE mesh.network_relationship RENAME CONSTRAINT mesh_network_connection_capability_obj_chk TO mesh_network_relationship_capability_obj_chk;
        ALTER TABLE mesh.network_relationship RENAME CONSTRAINT mesh_network_connection_terms_obj_chk     TO mesh_network_relationship_terms_obj_chk;
        ALTER TABLE mesh.network_relationship RENAME CONSTRAINT mesh_network_connection_metadata_obj_chk  TO mesh_network_relationship_metadata_obj_chk;
        ALTER TABLE mesh.network_relationship RENAME CONSTRAINT mesh_network_connection_audit_pair_chk    TO mesh_network_relationship_audit_pair_chk;
        ALTER TABLE mesh.network_relationship RENAME CONSTRAINT mesh_network_connection_buyer_fk          TO mesh_network_relationship_buyer_fk;
        ALTER TABLE mesh.network_relationship RENAME CONSTRAINT mesh_network_connection_supplier_fk       TO mesh_network_relationship_supplier_fk;

        RAISE NOTICE '[09_streamline] Renamed network_connection → network_relationship.';
    END IF;
END
$mesh_rename_nc$;

-- Rename connection_code → relationship_code inside network_relationship
DO $mesh_rename_connection_code$
BEGIN
    IF to_regclass('mesh.network_relationship') IS NOT NULL
       AND EXISTS (
           SELECT 1 FROM information_schema.columns
           WHERE table_schema='mesh' AND table_name='network_relationship' AND column_name='connection_code'
       ) THEN
        ALTER TABLE mesh.network_relationship RENAME COLUMN connection_code TO relationship_code;
        RAISE NOTICE '[09_streamline] Renamed connection_code → relationship_code.';
    END IF;
END
$mesh_rename_connection_code$;

-- Rename document_envelope FK constraint name
DO $mesh_rename_envelope_fk$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='mesh_document_envelope_connection_fk') THEN
        ALTER TABLE mesh.document_envelope RENAME CONSTRAINT mesh_document_envelope_connection_fk TO mesh_document_envelope_relationship_fk;
    END IF;
END
$mesh_rename_envelope_fk$;

-- Rename connection_acceptance FK
DO $mesh_rename_acceptance_fk$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='mesh_connection_acceptance_connection_fk') THEN
        ALTER TABLE mesh.connection_acceptance RENAME CONSTRAINT mesh_connection_acceptance_connection_fk TO mesh_connection_acceptance_relationship_fk;
    END IF;
END
$mesh_rename_acceptance_fk$;

-- Rebuild indexes for network_relationship
DROP INDEX IF EXISTS mesh_network_connection_supplier_idx;
DROP INDEX IF EXISTS mesh_network_connection_buyer_idx;
CREATE INDEX IF NOT EXISTS mesh_network_relationship_supplier_idx ON mesh.network_relationship (supplier_account_code, status);
CREATE INDEX IF NOT EXISTS mesh_network_relationship_buyer_idx    ON mesh.network_relationship (buyer_account_code,    status);

-- ============================================================================
-- STEP 6: Rename participant_identifier → network_account_identifier
-- ============================================================================

DO $mesh_rename_pi$
BEGIN
    IF to_regclass('mesh.participant_identifier') IS NOT NULL
       AND to_regclass('mesh.network_account_identifier') IS NULL THEN
        ALTER TABLE mesh.participant_identifier RENAME TO network_account_identifier;

        ALTER TABLE mesh.network_account_identifier RENAME CONSTRAINT mesh_participant_identifier_pkey            TO mesh_network_account_identifier_pkey;
        ALTER TABLE mesh.network_account_identifier RENAME CONSTRAINT mesh_participant_identifier_uq              TO mesh_network_account_identifier_uq;
        ALTER TABLE mesh.network_account_identifier RENAME CONSTRAINT mesh_participant_identifier_scheme_chk      TO mesh_network_account_identifier_scheme_chk;
        ALTER TABLE mesh.network_account_identifier RENAME CONSTRAINT mesh_participant_identifier_value_chk       TO mesh_network_account_identifier_value_chk;
        ALTER TABLE mesh.network_account_identifier RENAME CONSTRAINT mesh_participant_identifier_verified_chk    TO mesh_network_account_identifier_verified_chk;
        ALTER TABLE mesh.network_account_identifier RENAME CONSTRAINT mesh_participant_identifier_metadata_obj_chk TO mesh_network_account_identifier_metadata_obj_chk;

        -- FK added in 03_constraints.sql
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname='mesh_participant_identifier_account_fk') THEN
            ALTER TABLE mesh.network_account_identifier RENAME CONSTRAINT mesh_participant_identifier_account_fk TO mesh_network_account_identifier_account_fk;
        END IF;

        RAISE NOTICE '[09_streamline] Renamed participant_identifier → network_account_identifier.';
    END IF;
END
$mesh_rename_pi$;

DROP INDEX IF EXISTS mesh_participant_identifier_account_idx;
CREATE INDEX IF NOT EXISTS mesh_network_account_identifier_account_idx ON mesh.network_account_identifier (account_code, scheme);

-- ============================================================================
-- STEP 7: Rename participant_external_reference → network_account_reference
-- ============================================================================

DO $mesh_rename_per$
BEGIN
    IF to_regclass('mesh.participant_external_reference') IS NOT NULL
       AND to_regclass('mesh.network_account_reference') IS NULL THEN
        ALTER TABLE mesh.participant_external_reference RENAME TO network_account_reference;

        ALTER TABLE mesh.network_account_reference RENAME CONSTRAINT mesh_participant_external_reference_pkey       TO mesh_network_account_reference_pkey;
        ALTER TABLE mesh.network_account_reference RENAME CONSTRAINT mesh_participant_external_reference_source_uq  TO mesh_network_account_reference_source_uq;
        ALTER TABLE mesh.network_account_reference RENAME CONSTRAINT mesh_participant_external_reference_source_chk TO mesh_network_account_reference_source_chk;
        ALTER TABLE mesh.network_account_reference RENAME CONSTRAINT mesh_participant_external_reference_external_chk TO mesh_network_account_reference_external_chk;
        ALTER TABLE mesh.network_account_reference RENAME CONSTRAINT mesh_participant_external_reference_valid_chk   TO mesh_network_account_reference_valid_chk;
        ALTER TABLE mesh.network_account_reference RENAME CONSTRAINT mesh_participant_external_reference_payload_chk TO mesh_network_account_reference_payload_chk;
        ALTER TABLE mesh.network_account_reference RENAME CONSTRAINT mesh_participant_external_reference_status_chk  TO mesh_network_account_reference_status_chk;
        ALTER TABLE mesh.network_account_reference RENAME CONSTRAINT mesh_participant_external_reference_account_fk  TO mesh_network_account_reference_account_fk;

        RAISE NOTICE '[09_streamline] Renamed participant_external_reference → network_account_reference.';
    END IF;
END
$mesh_rename_per$;

DROP INDEX IF EXISTS mesh_participant_external_reference_account_idx;
CREATE INDEX IF NOT EXISTS mesh_network_account_reference_account_idx ON mesh.network_account_reference (account_code);

-- ============================================================================
-- STEP 8: Drop party_contact_person, party_contact_role
--         (master.party_contact_person/role own these for business partners)
-- ============================================================================

DO $mesh_drop_contact$
BEGIN
    -- Remove FK from contact_link → party_contact_person before dropping
    IF to_regclass('mesh.contact_link') IS NOT NULL THEN
        ALTER TABLE mesh.contact_link DROP CONSTRAINT IF EXISTS mesh_contact_link_person_fk;
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema='mesh' AND table_name='contact_link' AND column_name='contact_person_id'
        ) THEN
            ALTER TABLE mesh.contact_link DROP COLUMN contact_person_id;
        END IF;
    END IF;
    -- party_contact_role cascades from party_contact_person
    IF to_regclass('mesh.party_contact_role') IS NOT NULL THEN
        DROP TABLE mesh.party_contact_role;
        RAISE NOTICE '[09_streamline] Dropped party_contact_role.';
    END IF;
    IF to_regclass('mesh.party_contact_person') IS NOT NULL THEN
        DROP TABLE mesh.party_contact_person;
        RAISE NOTICE '[09_streamline] Dropped party_contact_person.';
    END IF;
END
$mesh_drop_contact$;

-- ============================================================================
-- STEP 9: Drop party_tax_profile
--         (master.party_tax_profile owns country-specific tax for business partners)
-- ============================================================================

DO $mesh_drop_ptp$
BEGIN
    IF to_regclass('mesh.party_tax_profile') IS NOT NULL THEN
        DROP TABLE mesh.party_tax_profile;
        RAISE NOTICE '[09_streamline] Dropped party_tax_profile.';
    END IF;
END
$mesh_drop_ptp$;

-- ============================================================================
-- STEP 10: Drop principal_ui_profile and principal_ui_preference
--          (master.principal_ui_profile/preference cover all planes)
-- ============================================================================

DO $mesh_drop_ui_prefs$
BEGIN
    IF to_regclass('mesh.principal_ui_profile') IS NOT NULL THEN
        DROP TABLE mesh.principal_ui_profile;
        RAISE NOTICE '[09_streamline] Dropped principal_ui_profile.';
    END IF;
    IF to_regclass('mesh.principal_ui_preference') IS NOT NULL THEN
        DROP TABLE mesh.principal_ui_preference;
        RAISE NOTICE '[09_streamline] Dropped principal_ui_preference.';
    END IF;
END
$mesh_drop_ui_prefs$;

-- ============================================================================
-- STEP 11: Drop participant_profile (data already in network_account)
-- ============================================================================

DO $mesh_drop_pp$
BEGIN
    IF to_regclass('mesh.participant_profile') IS NOT NULL THEN
        ALTER TABLE mesh.participant_profile DROP CONSTRAINT IF EXISTS mesh_participant_profile_account_fk;
        DROP TABLE mesh.participant_profile;
        RAISE NOTICE '[09_streamline] Dropped participant_profile.';
    END IF;
END
$mesh_drop_pp$;

-- ============================================================================
-- STEP 12: Drop participant (data already in network_account)
-- ============================================================================

DO $mesh_drop_participant$
BEGIN
    IF to_regclass('mesh.participant') IS NOT NULL THEN
        DROP TABLE mesh.participant CASCADE;
        RAISE NOTICE '[09_streamline] Dropped participant (CASCADE).';
    END IF;
END
$mesh_drop_participant$;

-- ============================================================================
-- STEP 13: Enable RLS on renamed tables
-- ============================================================================

DO $mesh_rls_enable$
BEGIN
    IF to_regclass('mesh.network_relationship') IS NOT NULL THEN
        EXECUTE 'ALTER TABLE mesh.network_relationship ENABLE ROW LEVEL SECURITY';
        EXECUTE 'ALTER TABLE mesh.network_relationship FORCE ROW LEVEL SECURITY';
    END IF;
    IF to_regclass('mesh.network_account_identifier') IS NOT NULL THEN
        EXECUTE 'ALTER TABLE mesh.network_account_identifier ENABLE ROW LEVEL SECURITY';
        EXECUTE 'ALTER TABLE mesh.network_account_identifier FORCE ROW LEVEL SECURITY';
    END IF;
    IF to_regclass('mesh.network_account_reference') IS NOT NULL THEN
        EXECUTE 'ALTER TABLE mesh.network_account_reference ENABLE ROW LEVEL SECURITY';
        EXECUTE 'ALTER TABLE mesh.network_account_reference FORCE ROW LEVEL SECURITY';
    END IF;
END
$mesh_rls_enable$;

-- Drop stale policy names carried over from old table names
DROP POLICY IF EXISTS mesh_network_connection_read          ON mesh.network_relationship;
DROP POLICY IF EXISTS mesh_network_connection_admin         ON mesh.network_relationship;
DROP POLICY IF EXISTS mesh_participant_identifier_read      ON mesh.network_account_identifier;
DROP POLICY IF EXISTS mesh_participant_identifier_admin     ON mesh.network_account_identifier;
DROP POLICY IF EXISTS mesh_participant_external_reference_read  ON mesh.network_account_reference;
DROP POLICY IF EXISTS mesh_participant_external_reference_admin ON mesh.network_account_reference;

-- Create canonical RLS for network_relationship
DROP POLICY IF EXISTS mesh_network_relationship_read  ON mesh.network_relationship;
CREATE POLICY mesh_network_relationship_read ON mesh.network_relationship
    FOR SELECT USING (
        mesh.is_mesh_admin()
        OR buyer_account_code    = mesh.current_account_code()
        OR supplier_account_code = mesh.current_account_code()
    );
DROP POLICY IF EXISTS mesh_network_relationship_admin ON mesh.network_relationship;
CREATE POLICY mesh_network_relationship_admin ON mesh.network_relationship
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

-- Create canonical RLS for network_account_identifier
DROP POLICY IF EXISTS mesh_network_account_identifier_read  ON mesh.network_account_identifier;
CREATE POLICY mesh_network_account_identifier_read ON mesh.network_account_identifier
    FOR SELECT USING (mesh.is_mesh_admin() OR account_code = mesh.current_account_code());
DROP POLICY IF EXISTS mesh_network_account_identifier_admin ON mesh.network_account_identifier;
CREATE POLICY mesh_network_account_identifier_admin ON mesh.network_account_identifier
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

-- Create canonical RLS for network_account_reference
DROP POLICY IF EXISTS mesh_network_account_reference_read  ON mesh.network_account_reference;
CREATE POLICY mesh_network_account_reference_read ON mesh.network_account_reference
    FOR SELECT USING (mesh.is_mesh_admin() OR account_code = mesh.current_account_code());
DROP POLICY IF EXISTS mesh_network_account_reference_admin ON mesh.network_account_reference;
CREATE POLICY mesh_network_account_reference_admin ON mesh.network_account_reference
    FOR ALL USING (mesh.is_mesh_admin()) WITH CHECK (mesh.is_mesh_admin());

-- ============================================================================
-- STEP 14: Profile indexes on network_account
-- ============================================================================

CREATE INDEX IF NOT EXISTS mesh_network_account_source_idx
    ON mesh.network_account (source_plane, source_ref)
    WHERE source_plane IS NOT NULL AND source_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS mesh_network_account_legal_name_idx
    ON mesh.network_account (legal_name)
    WHERE legal_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS mesh_network_account_profile_hash_idx
    ON mesh.network_account (account_code, profile_hash)
    WHERE profile_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS mesh_network_account_verification_idx
    ON mesh.network_account (verification_status, verified_at)
    WHERE verification_status IN ('pending','verified');

CREATE INDEX IF NOT EXISTS mesh_network_account_participant_type_idx
    ON mesh.network_account (participant_type, status);

-- ============================================================================
-- STEP 15: Trigger for network_relationship
-- ============================================================================

DROP TRIGGER IF EXISTS trg_network_connection_updated_at  ON mesh.network_relationship;
DROP TRIGGER IF EXISTS trg_network_relationship_updated_at ON mesh.network_relationship;
CREATE TRIGGER trg_network_relationship_updated_at
    BEFORE UPDATE ON mesh.network_relationship
    FOR EACH ROW EXECUTE FUNCTION mesh.trg_set_updated_at();

-- Catalog_price connection_id index rename (connection_id FK resolves automatically after rename)
DROP INDEX IF EXISTS mesh_catalog_price_connection_idx;
CREATE INDEX IF NOT EXISTS mesh_catalog_price_relationship_idx
    ON mesh.catalog_price (connection_id, status, effective_from DESC)
    WHERE connection_id IS NOT NULL;
