-- Atlas thread history, retention, transcript, and run worker access paths.

CREATE INDEX IF NOT EXISTS atlas_thread_owner_history_idx
    ON master.atlas_thread
       (tenant_id, plane, owner_principal_id, updated_at DESC NULLS LAST, conversation_id);

CREATE INDEX IF NOT EXISTS atlas_thread_expiry_idx
    ON master.atlas_thread (expires_at)
    WHERE expires_at IS NOT NULL AND legal_hold = false;

CREATE INDEX IF NOT EXISTS atlas_thread_purge_idx
    ON master.atlas_thread (purge_after)
    WHERE purge_after IS NOT NULL AND legal_hold = false;

CREATE INDEX IF NOT EXISTS atlas_message_page_idx
    ON master.atlas_message
       (tenant_id, conversation_id, sequence DESC);

CREATE INDEX IF NOT EXISTS atlas_message_run_idx
    ON master.atlas_message (tenant_id, run_id, sequence)
    WHERE run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS atlas_message_parent_idx
    ON master.atlas_message (tenant_id, conversation_id, parent_message_id)
    WHERE parent_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS atlas_run_thread_history_idx
    ON event.atlas_run
       (tenant_id, conversation_id, started_at DESC, id);

CREATE INDEX IF NOT EXISTS atlas_run_principal_history_idx
    ON event.atlas_run
       (tenant_id, plane, principal_id, started_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS atlas_run_one_started_per_thread_uq
    ON event.atlas_run (tenant_id, conversation_id)
    WHERE status = 'started';

CREATE INDEX IF NOT EXISTS atlas_run_cancel_requested_idx
    ON event.atlas_run (cancellation_requested_at)
    WHERE status = 'started' AND cancellation_requested_at IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS atlas_run_metering_uq
    ON event.atlas_run (tenant_id, metering_run_id)
    WHERE metering_run_id IS NOT NULL;
