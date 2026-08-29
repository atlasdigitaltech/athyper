-- Durable, queryable transfer progress and terminal receipts. BullMQ remains the
-- execution transport; these plane-local records remain the user-facing truth.
BEGIN;

ALTER TABLE ops.record_import_session
  ADD COLUMN IF NOT EXISTS progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS receipt jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS error_code text,
  ADD COLUMN IF NOT EXISTS error_detail text,
  ADD COLUMN IF NOT EXISTS started_at timestamptz;

ALTER TABLE ops.record_export_request
  ADD COLUMN IF NOT EXISTS progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS receipt jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS error_detail text;

DO $$ BEGIN
  ALTER TABLE ops.record_import_session
    ADD CONSTRAINT record_import_session_runtime_json_chk
    CHECK(jsonb_typeof(progress)='object' AND jsonb_typeof(receipt)='object');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ops.record_import_session
    ADD CONSTRAINT record_import_session_error_chk
    CHECK((error_code IS NULL OR length(error_code)<=200) AND (error_detail IS NULL OR length(error_detail)<=2000));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ops.record_export_request
    ADD CONSTRAINT record_export_request_runtime_json_chk
    CHECK(jsonb_typeof(progress)='object' AND jsonb_typeof(receipt)='object');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE ops.record_export_request
    ADD CONSTRAINT record_export_request_error_chk
    CHECK((error_code IS NULL OR length(error_code)<=200) AND (error_detail IS NULL OR length(error_detail)<=2000));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMIT;
