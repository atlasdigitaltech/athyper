CREATE INDEX reference_sync_checkpoint_status_idx
    ON ops.reference_sync_checkpoint (status, last_succeeded_at);
CREATE INDEX reference_sync_checkpoint_target_idx
    ON ops.reference_sync_checkpoint (target_schema_name, target_table_name);
