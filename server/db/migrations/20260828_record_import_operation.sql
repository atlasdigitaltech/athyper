ALTER TABLE ops.record_import_session
  ADD COLUMN IF NOT EXISTS import_operation text NOT NULL DEFAULT 'create';

DO $$
BEGIN
  ALTER TABLE ops.record_import_session
    ADD CONSTRAINT record_import_session_operation_chk
    CHECK (import_operation IN ('create', 'update', 'upsert'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN ops.record_import_session.import_operation IS
  'Immutable reviewed import mode executed by the governed transfer worker.';
