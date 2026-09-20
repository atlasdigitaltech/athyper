-- ============================================================================
-- One-off LOCAL cleanup: drop the release/publish/activation bank directory model.
-- Run once against EACH database that has it (neon, mesh, studio), from any SQL
-- client or: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f drop-bank-directory-release-model.sql
-- Plain SQL only (no psql meta-commands). Dry run: change the final COMMIT to ROLLBACK.
-- Then re-apply the plane DDL (common/shared/03_bank_master.sql, 04_bank_master_views.sql,
-- indexes/triggers/grants, then the plane's foreign keys and views) so the flat
-- tables and the CASCADE-dropped foreign keys/views come back.
--
-- DESTRUCTIVE: shared.bank_institution / bank_branch / bank_identifier are dropped
-- WITH their rows (old and new share these names but not their columns). Local data
-- only; reload bank master data afterwards. CASCADE also drops the FKs from
-- master.bank_account, master.bank_provisional_reference and the Mesh bank tables,
-- plus dependent views (v_bank_account_resolved, v_business_partner_bank_account,
-- v_supplier_bank_account, mesh bank disclosure views). The re-apply restores them.
-- Untested against a live database.
-- ============================================================================
BEGIN;

-- Show what CASCADE will take with it.
SELECT conrelid::regclass AS referencing_table, conname
FROM pg_constraint
WHERE contype = 'f'
  AND confrelid IN (SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = 'shared' AND c.relname LIKE 'bank\_%')
ORDER BY 1, 2;

-- Functions (present only in shared/runtime_meta of neon/mesh/studio as applicable).
DROP FUNCTION IF EXISTS shared.publish_bank_directory(uuid, bigint, timestamptz, jsonb, jsonb, text);
DROP FUNCTION IF EXISTS shared.validate_bank_directory(jsonb);
DROP FUNCTION IF EXISTS shared.resolve_bank_directory_reference(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS shared.reject_bank_directory_mutation() CASCADE;

-- Views first (recreated by 04_bank_master_views.sql).
DROP VIEW IF EXISTS shared.v_bank_directory CASCADE;
DROP VIEW IF EXISTS shared.v_bank_branch CASCADE;
DROP VIEW IF EXISTS shared.v_bank_institution CASCADE;

-- Studio authoring/publication tables (studio DB only; no-ops elsewhere).
DROP TABLE IF EXISTS publication.bank_directory_release_link CASCADE;
DROP TABLE IF EXISTS publication.bank_directory_review CASCADE;
DROP TABLE IF EXISTS publication.bank_directory_authority CASCADE;
DROP TABLE IF EXISTS snapshot.bank_directory_revision CASCADE;

-- Shared release model.
DROP TABLE IF EXISTS shared.bank_directory_activation CASCADE;
DROP TABLE IF EXISTS shared.bank_directory_source_record CASCADE;
DROP TABLE IF EXISTS shared.bank_identifier CASCADE;
DROP TABLE IF EXISTS shared.bank_branch_version CASCADE;
DROP TABLE IF EXISTS shared.bank_institution_version CASCADE;
DROP TABLE IF EXISTS shared.bank_branch CASCADE;
DROP TABLE IF EXISTS shared.bank_institution CASCADE;
DROP TABLE IF EXISTS shared.bank_directory_release CASCADE;

-- Residue: applied-release ledger rows for the retired publication.
DO $$
BEGIN
  IF to_regclass('runtime_meta.applied_release') IS NOT NULL THEN
    DELETE FROM runtime_meta.applied_release WHERE publication_key = 'shared.bank_directory';
  END IF;
END $$;

-- Dry run: replace COMMIT with ROLLBACK.
COMMIT;
