CREATE INDEX IF NOT EXISTS atlas_conversation_retention_active_idx
    ON control.atlas_conversation_retention_policy
        (tenant_id, revision DESC)
    WHERE status = 'active';
