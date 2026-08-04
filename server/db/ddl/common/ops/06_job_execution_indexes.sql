CREATE INDEX job_execution_queue_idx
    ON ops.job_execution (status, scheduled_at, created_at)
    WHERE status IN ('queued','retrying');
CREATE INDEX job_execution_tenant_job_idx
    ON ops.job_execution (tenant_id, job_code, created_at DESC);
CREATE INDEX job_execution_run_idx
    ON ops.job_execution (run_id) WHERE run_id IS NOT NULL;
CREATE INDEX job_execution_correlation_idx
    ON ops.job_execution (correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX job_execution_purge_idx
    ON ops.job_execution (purge_after) WHERE purge_after IS NOT NULL;
