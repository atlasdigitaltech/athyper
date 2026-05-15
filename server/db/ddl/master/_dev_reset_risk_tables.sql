-- ============================================================================
-- master/_dev_reset_risk_tables.sql
-- DEV / TEST ONLY — NOT executed by runner.sh
--
-- Wipes all risk domain tables (evidence, assessments, audit trail, etc.)
-- so that 01j_tables_party_risk.sql can be re-run from scratch.
--
-- Usage:
--   psql $DATABASE_URL -f server/db/sql/master/_dev_reset_risk_tables.sql
--   psql $DATABASE_URL -f server/db/sql/master/01j_tables_party_risk.sql
--
-- WARNING: This destroys ALL risk evidence, assessments, drivers, mitigations,
--          and review events in the target database. Never run against production.
-- ============================================================================

DO $$
BEGIN
    IF current_database() LIKE '%prod%' OR current_database() LIKE '%staging%' THEN
        RAISE EXCEPTION 'Refusing to run dev reset against database: %', current_database()
            USING ERRCODE = 'object_not_in_prerequisite_state';
    END IF;
END $$;

DROP TABLE IF EXISTS master.tenant_risk_source_config    CASCADE;
DROP TABLE IF EXISTS master.party_risk_review_event      CASCADE;
DROP TABLE IF EXISTS master.party_risk_mitigation        CASCADE;
DROP TABLE IF EXISTS master.party_risk_driver            CASCADE;
DROP TABLE IF EXISTS master.party_risk_dimension_score   CASCADE;
DROP TABLE IF EXISTS master.party_risk_assessment        CASCADE;
DROP TABLE IF EXISTS master.party_risk_evidence          CASCADE;
DROP TABLE IF EXISTS master.risk_model_dimension         CASCADE;
DROP TABLE IF EXISTS master.risk_model                   CASCADE;
DROP TABLE IF EXISTS master.risk_source                  CASCADE;
DROP TABLE IF EXISTS master.risk_driver_registry         CASCADE;
DROP TABLE IF EXISTS master.risk_dimension               CASCADE;

-- Evict ALL master DDL tracking rows so migrate.ts re-executes every master/01*
-- file on the next run.  Safe because all master DDL uses CREATE TABLE IF NOT EXISTS.
-- We clear the full schema rather than just the two risk-specific files because a
-- broader dev reset (e.g. DROP SCHEMA master CASCADE) may have removed tables beyond
-- the risk domain; clearing the whole set ensures nothing is silently skipped.
DELETE FROM public.schema_provisions
WHERE file_name LIKE 'master/01%'
   OR file_name = '900_seed_data/010_platform/003_master/002_party_risk_registry';
