\set ON_ERROR_STOP on
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '60s';
WITH duplicate_groups AS (
  SELECT tenant_id, metadata->>'queue' AS queue, metadata->>'jobId' AS job_id
  FROM ops.job_execution
  WHERE NULLIF(metadata->>'queue','') IS NOT NULL AND NULLIF(metadata->>'jobId','') IS NOT NULL
  GROUP BY tenant_id, metadata->>'queue', metadata->>'jobId' HAVING count(*) > 1
), details AS (
  SELECT j.id,j.tenant_id,j.execution_key,j.job_code,j.status,j.attempt_no,j.max_attempts,
    j.metadata->>'queue' AS queue,j.metadata->>'jobId' AS job_id,
    j.scheduled_at,j.started_at,j.completed_at,j.created_at,j.updated_at,j.error_code,
    (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',a.id,'attempt_no',a.attempt_no,'status',a.status,'error_code',a.error_code) ORDER BY a.attempt_no),'[]'::jsonb) FROM ops.job_execution_attempt a WHERE a.execution_id=j.id) AS attempts,
    (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',c.id,'command',c.command,'status',c.status,'requested_at',c.requested_at,'replacement_execution_id',c.replacement_execution_id) ORDER BY c.requested_at),'[]'::jsonb) FROM ops.job_execution_command c WHERE c.execution_id=j.id) AS commands,
    (SELECT count(*) FROM ops.job_execution c WHERE c.parent_execution_id=j.id) AS child_references,
    (SELECT count(*) FROM ops.job_execution_command c WHERE c.replacement_execution_id=j.id) AS replacement_references,
    md5(j.input_payload::text) AS payload_fingerprint
  FROM ops.job_execution j JOIN duplicate_groups g
    ON j.tenant_id IS NOT DISTINCT FROM g.tenant_id AND j.metadata->>'queue'=g.queue AND j.metadata->>'jobId'=g.job_id
)
SELECT jsonb_pretty(jsonb_build_object('database',current_database(),'audited_at',transaction_timestamp(),
  'execution_count',(SELECT count(*) FROM ops.job_execution),
  'duplicate_groups',(SELECT count(*) FROM duplicate_groups),
  'rows',COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY tenant_id NULLS FIRST,queue,job_id,created_at,id) FROM details d),'[]'::jsonb)));
COMMIT;
