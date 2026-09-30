\set ON_ERROR_STOP on
\if :{?apply}
\else
  \set apply false
\endif
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SELECT set_config('athyper.jobs_repair.database', :'expected_database', true) AS ignored \gset
SELECT set_config('athyper.jobs_repair.id', :'repair_id', true) AS ignored \gset
SELECT pg_advisory_xact_lock(hashtextextended('athyper.jobs_execution_duplicate_repair.v1',0)) AS ignored \gset
LOCK TABLE ops.job_execution, ops.job_execution_attempt, ops.job_execution_command IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE jobs_repair_plan (
  duplicate_id uuid PRIMARY KEY, canonical_id uuid NOT NULL UNIQUE,
  duplicate_fingerprint text NOT NULL, canonical_fingerprint text NOT NULL,
  CHECK (duplicate_id <> canonical_id)
) ON COMMIT DROP;
INSERT INTO jobs_repair_plan SELECT * FROM jsonb_to_recordset(:'repair_plan'::jsonb)
  AS p(duplicate_id uuid, canonical_id uuid, duplicate_fingerprint text, canonical_fingerprint text);

DO $$
BEGIN
  IF current_database() <> current_setting('athyper.jobs_repair.database') THEN
    RAISE EXCEPTION 'Repair database does not match the audited plan';
  END IF;
  IF current_setting('is_superuser') <> 'on' THEN
    RAISE EXCEPTION 'Repair requires a database administrator with complete RLS visibility';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE contype='f' AND confrelid='ops.job_execution'::regclass
    AND NOT (conrelid='ops.job_execution'::regclass AND conname='job_execution_parent_fk'
      OR conrelid='ops.job_execution_attempt'::regclass AND conname='job_execution_attempt_execution_fk'
      OR conrelid='ops.job_execution_command'::regclass AND conname IN ('job_execution_command_execution_fk','job_execution_command_replacement_fk'))) THEN
    RAISE EXCEPTION 'Unreviewed foreign key references job executions; audit before repairing';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS ops.job_execution_duplicate_archive (
  execution_id uuid PRIMARY KEY,
  canonical_execution_id uuid NOT NULL,
  repair_id text NOT NULL,
  source_database text NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  archived_by text NOT NULL DEFAULT session_user,
  original_row jsonb NOT NULL,
  canonical_row jsonb NOT NULL,
  reason text NOT NULL,
  CHECK (execution_id <> canonical_execution_id),
  CHECK (jsonb_typeof(original_row)='object' AND jsonb_typeof(canonical_row)='object')
);
COMMENT ON TABLE ops.job_execution_duplicate_archive IS
  'Administrator-only append-only originals and canonical snapshots for the jobs duplicate repair. No execution/attempt/command references are rewritten.';
REVOKE ALL ON ops.job_execution_duplicate_archive FROM PUBLIC;
ALTER TABLE ops.job_execution_duplicate_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE ops.job_execution_duplicate_archive FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='ops.job_execution_duplicate_archive'::regclass AND tgname='job_execution_duplicate_archive_immutable') THEN
    CREATE TRIGGER job_execution_duplicate_archive_immutable BEFORE UPDATE OR DELETE ON ops.job_execution_duplicate_archive
      FOR EACH ROW EXECUTE FUNCTION ops.trg_guard_job_execution_evidence();
  END IF;
END $$;

CREATE TEMP TABLE jobs_repair_before ON COMMIT DROP AS
SELECT (SELECT count(*) FROM ops.job_execution) AS executions,
  (SELECT count(*) FROM ops.job_execution_duplicate_archive) AS archived,
  (SELECT md5(COALESCE(string_agg(md5(to_jsonb(a)::text),'' ORDER BY id),'')) FROM ops.job_execution_attempt a) AS attempts_fingerprint,
  (SELECT md5(COALESCE(string_agg(md5(to_jsonb(c)::text),'' ORDER BY id),'')) FROM ops.job_execution_command c) AS commands_fingerprint;

DO $$
DECLARE p record; q ops.job_execution%ROWTYPE; c ops.job_execution%ROWTYPE; archived ops.job_execution_duplicate_archive%ROWTYPE;
BEGIN
  FOR p IN SELECT * FROM jobs_repair_plan ORDER BY duplicate_id LOOP
    SELECT * INTO q FROM ops.job_execution WHERE id=p.duplicate_id;
    IF NOT FOUND THEN
      SELECT * INTO archived FROM ops.job_execution_duplicate_archive WHERE execution_id=p.duplicate_id;
      IF NOT FOUND OR archived.repair_id <> current_setting('athyper.jobs_repair.id')
        OR archived.canonical_execution_id <> p.canonical_id OR md5(archived.original_row::text) <> p.duplicate_fingerprint
        OR md5(archived.canonical_row::text) <> p.canonical_fingerprint THEN
        RAISE EXCEPTION 'Missing or changed duplicate %; no matching completed repair', p.duplicate_id;
      END IF;
      CONTINUE;
    END IF;
    SELECT * INTO c FROM ops.job_execution WHERE id=p.canonical_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Canonical execution % is missing', p.canonical_id; END IF;
    IF md5(to_jsonb(q)::text) <> p.duplicate_fingerprint OR md5(to_jsonb(c)::text) <> p.canonical_fingerprint THEN
      RAISE EXCEPTION 'Execution changed since audit for %; refresh the plan', p.duplicate_id;
    END IF;
    IF q.tenant_id IS DISTINCT FROM c.tenant_id
      OR NULLIF(q.metadata->>'queue','') IS NULL OR NULLIF(q.metadata->>'jobId','') IS NULL
      OR q.metadata->>'queue' IS DISTINCT FROM c.metadata->>'queue'
      OR q.metadata->>'jobId' IS DISTINCT FROM c.metadata->>'jobId'
      OR q.input_payload IS DISTINCT FROM c.input_payload
      OR q.job_code IS DISTINCT FROM c.job_code OR q.job_type IS DISTINCT FROM c.job_type
      OR q.created_by IS DISTINCT FROM c.created_by THEN
      RAISE EXCEPTION 'Duplicate/canonical identities or payloads do not agree for %', p.duplicate_id;
    END IF;
    IF q.status <> 'queued' OR q.attempt_no <> 1 OR q.started_at IS NOT NULL OR q.completed_at IS NOT NULL
      OR c.status NOT IN ('succeeded','failed','dead_letter','timed_out','cancelled') OR c.completed_at IS NULL
      OR c.execution_key NOT IN (c.metadata->>'jobId',(c.metadata->>'queue') || ':' || (c.metadata->>'jobId')) THEN
      RAISE EXCEPTION 'Unsupported execution state or canonical key for %', p.duplicate_id;
    END IF;
    IF (SELECT count(*) FROM ops.job_execution e WHERE e.tenant_id IS NOT DISTINCT FROM q.tenant_id
      AND e.metadata->>'queue'=q.metadata->>'queue' AND e.metadata->>'jobId'=q.metadata->>'jobId') <> 2 THEN
      RAISE EXCEPTION 'Duplicate group is no longer exactly two rows for %', p.duplicate_id;
    END IF;
    IF EXISTS (SELECT 1 FROM ops.job_execution_attempt WHERE execution_id=q.id)
      OR EXISTS (SELECT 1 FROM ops.job_execution_command WHERE execution_id=q.id OR replacement_execution_id=q.id)
      OR EXISTS (SELECT 1 FROM ops.job_execution WHERE parent_execution_id=q.id) THEN
      RAISE EXCEPTION 'Duplicate % has evidence or inbound references; automatic repair refused', q.id;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM ops.job_execution_attempt WHERE execution_id=c.id) THEN
      RAISE EXCEPTION 'Canonical execution % has no attempt evidence', c.id;
    END IF;
    INSERT INTO ops.job_execution_duplicate_archive(execution_id,canonical_execution_id,repair_id,source_database,original_row,canonical_row,reason)
      VALUES(q.id,c.id,current_setting('athyper.jobs_repair.id'),current_database(),to_jsonb(q),to_jsonb(c),
        'Audited queued duplicate without execution evidence or inbound references; terminal execution and all evidence retained unchanged');
    DELETE FROM ops.job_execution WHERE id=q.id;
  END LOOP;
END $$;

DO $$
DECLARE b record; removed bigint;
BEGIN
  SELECT * INTO b FROM jobs_repair_before;
  removed := (SELECT count(*) FROM ops.job_execution_duplicate_archive)-b.archived;
  IF (SELECT count(*) FROM ops.job_execution) <> b.executions-removed
    OR (SELECT md5(COALESCE(string_agg(md5(to_jsonb(a)::text),'' ORDER BY id),'')) FROM ops.job_execution_attempt a) <> b.attempts_fingerprint
    OR (SELECT md5(COALESCE(string_agg(md5(to_jsonb(c)::text),'' ORDER BY id),'')) FROM ops.job_execution_command c) <> b.commands_fingerprint THEN
    RAISE EXCEPTION 'Post-repair row count or evidence integrity check failed';
  END IF;
  IF EXISTS (SELECT 1 FROM jobs_repair_plan p JOIN ops.job_execution_duplicate_archive a ON a.execution_id=p.duplicate_id
    LEFT JOIN ops.job_execution c ON c.id=p.canonical_id WHERE c.id IS NULL OR to_jsonb(c) IS DISTINCT FROM a.canonical_row)
    OR EXISTS (SELECT 1 FROM jobs_repair_plan p JOIN ops.job_execution q ON q.id=p.duplicate_id) THEN
    RAISE EXCEPTION 'Canonical row changed or duplicate remains';
  END IF;
END $$;
SELECT jsonb_build_object('database',current_database(),'repair_id',current_setting('athyper.jobs_repair.id'),
  'planned',(SELECT count(*) FROM jobs_repair_plan),
  'archived_this_run',(SELECT count(*) FROM ops.job_execution_duplicate_archive)-(SELECT archived FROM jobs_repair_before),
  'attempts_unchanged',true,'commands_unchanged',true,'canonical_rows_unchanged',true,'apply',:'apply'::boolean);
\if :apply
COMMIT;
\else
ROLLBACK;
\endif
