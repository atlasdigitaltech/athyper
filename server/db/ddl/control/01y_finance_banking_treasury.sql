-- Finance Setup Phase 2, Stage E: non-secret interface health projection.
ALTER TABLE control.bank_interface_profile
  ADD COLUMN IF NOT EXISTS last_connection_test_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_connection_test_status text NOT NULL DEFAULT 'not_tested',
  ADD COLUMN IF NOT EXISTS last_connection_test_code text,
  ADD COLUMN IF NOT EXISTS last_connection_test_latency_ms integer;

DO $$ BEGIN ALTER TABLE control.bank_interface_profile ADD CONSTRAINT bip_test_status_chk
  CHECK(last_connection_test_status IN('not_tested','passed','failed','unavailable'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE control.bank_interface_profile ADD CONSTRAINT bip_test_latency_chk
  CHECK(last_connection_test_latency_ms IS NULL OR last_connection_test_latency_ms>=0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN control.bank_interface_profile.last_connection_test_code IS
  'Non-sensitive provider result code. Response bodies, tokens and credential material are never persisted.';
