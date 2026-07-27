-- Atlas governed-tool lookup, recovery, idempotency, and audit access paths.

CREATE INDEX IF NOT EXISTS ai_tool_invocation_run_history_idx
    ON event.ai_tool_invocation
       (tenant_id, run_id, created_at, id);

CREATE INDEX IF NOT EXISTS ai_tool_invocation_thread_history_idx
    ON event.ai_tool_invocation
       (tenant_id, thread_id, created_at DESC, id);

CREATE INDEX IF NOT EXISTS ai_tool_invocation_principal_history_idx
    ON event.ai_tool_invocation
       (tenant_id, plane, principal_id, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_tool_invocation_open_idx
    ON event.ai_tool_invocation
       (tenant_id, status, created_at)
    WHERE status IN ('proposed', 'confirmed', 'executing');

CREATE INDEX IF NOT EXISTS ai_tool_invocation_confirmation_expiry_idx
    ON event.ai_tool_invocation (confirmation_expires_at)
    WHERE status IN ('proposed', 'confirmed')
      AND confirmation_required = true;

CREATE UNIQUE INDEX IF NOT EXISTS ai_tool_invocation_confirmation_hash_uq
    ON event.ai_tool_invocation (tenant_id, confirmation_token_hash)
    WHERE confirmation_token_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ai_tool_invocation_downstream_idempotency_uq
    ON event.ai_tool_invocation
       (tenant_id, downstream_command_idempotency_key)
    WHERE downstream_command_idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS ai_tool_invocation_business_ref_idx
    ON event.ai_tool_invocation
       (tenant_id, business_transaction_type, business_transaction_id)
    WHERE business_transaction_id IS NOT NULL;
