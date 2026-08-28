BEGIN;
ALTER TABLE ops.record_import_session
  ADD COLUMN IF NOT EXISTS adapter_key text NOT NULL DEFAULT 'legacy.generic.v1',
  ADD COLUMN IF NOT EXISTS descriptor_hash text NOT NULL DEFAULT repeat('0',64),
  ADD COLUMN IF NOT EXISTS scope_coordinate jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS conflict_policy text NOT NULL DEFAULT 'reject',
  ADD COLUMN IF NOT EXISTS atomicity text NOT NULL DEFAULT 'all_or_nothing';
ALTER TABLE ops.record_import_session DROP CONSTRAINT IF EXISTS record_import_session_operation_chk;
ALTER TABLE ops.record_import_session ADD CONSTRAINT record_import_session_operation_chk CHECK(import_operation IN('create','update','upsert','delete','replace'));
DO $$ BEGIN ALTER TABLE ops.record_import_session ADD CONSTRAINT record_import_session_adapter_chk CHECK(adapter_key~'^[a-z][a-z0-9_.-]{2,126}$'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ops.record_import_session ADD CONSTRAINT record_import_session_descriptor_hash_chk CHECK(descriptor_hash~'^[a-f0-9]{64}$'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ops.record_import_session ADD CONSTRAINT record_import_session_scope_chk CHECK(jsonb_typeof(scope_coordinate)='object'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE ops.record_import_session ADD CONSTRAINT record_import_session_policy_chk CHECK(conflict_policy IN('reject','skip') AND atomicity IN('all_or_nothing','valid_rows')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMIT;
