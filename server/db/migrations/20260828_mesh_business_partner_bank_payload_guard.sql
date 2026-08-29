BEGIN;
DO $$ BEGIN IF current_database()<>'athyper_mesh' THEN RAISE EXCEPTION 'WP15 MESH bank payload guard must target athyper_mesh'; END IF; END $$;
ALTER TABLE snapshot.bank_account_disclosure ADD CONSTRAINT bank_account_disclosure_snapshot_safe_chk CHECK(lower(payload_json::text) !~ '"(account.?id.?value|account.?number|iban|routing.?number|raw.?account)[^"]*"[[:space:]]*:');
COMMIT;
