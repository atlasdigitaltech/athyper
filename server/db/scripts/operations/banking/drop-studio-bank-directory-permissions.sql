-- ============================================================================
-- One-off LOCAL cleanup: remove the retired studio.bank_directory.* permissions.
-- Run on the STUDIO database (and any DB where authz.permission was seeded with them).
-- Plain SQL. Dry run: change the final COMMIT to ROLLBACK.
-- Deletes the permissions plus every row that references them (role grants, scope
-- kinds, etc.) discovered from pg_constraint. If a table blocks the delete (append-only
-- trigger), the script fails and rolls back; retire instead with
--   UPDATE authz.permission SET status = 'retired' ... (check the status enum first).
-- Untested against a live database.
-- ============================================================================
BEGIN;

CREATE TEMP TABLE _bank_perm ON COMMIT DROP AS
SELECT id, canonical_code FROM authz.permission
WHERE canonical_code IN ('studio.bank_directory.read','studio.bank_directory.author','studio.bank_directory.publish');

SELECT * FROM _bank_perm;   -- what will be removed

DO $$
DECLARE r record; n bigint;
BEGIN
  -- Child rows: every single-column FK that points at authz.permission(id).
  FOR r IN
    SELECT c.conrelid::regclass AS tbl, a.attname AS col
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f' AND c.confrelid = 'authz.permission'::regclass AND cardinality(c.conkey) = 1
  LOOP
    EXECUTE format('DELETE FROM %s WHERE %I IN (SELECT id FROM _bank_perm)', r.tbl, r.col);
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN RAISE NOTICE 'deleted % rows from %', n, r.tbl; END IF;
  END LOOP;
  DELETE FROM authz.permission WHERE id IN (SELECT id FROM _bank_perm);
END $$;

-- Dry run: replace COMMIT with ROLLBACK.
COMMIT;
