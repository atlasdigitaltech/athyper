BEGIN;
DO $$ BEGIN IF current_database()<>'athyper_neon' THEN RAISE EXCEPTION 'WP15 NEON bank payload guard must target athyper_neon'; END IF; END $$;
ALTER TABLE control.mesh_bank_account_disclosure_inbox ADD CONSTRAINT mesh_bank_disclosure_inbox_safe_chk CHECK(lower(envelope_json::text) !~ '"(account.?id.?value|account.?number|iban|routing.?number|raw.?account)[^"]*"[[:space:]]*:');
ALTER TABLE snapshot.mesh_bank_account_disclosure_received ADD CONSTRAINT mesh_bank_disclosure_received_safe_chk CHECK(lower(payload_json::text) !~ '"(account.?id.?value|account.?number|iban|routing.?number|raw.?account)[^"]*"[[:space:]]*:');
COMMIT;
