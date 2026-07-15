-- ============================================================================
-- control/01s_tables_lifecycle_transition_execution.sql
-- Concept: Idempotency carrier for lifecycle transition hooks (Phase 2.5)
-- Depends on: control/01_tables.sql (shared.uuidv7, control schema)
-- Scope: Posting + dispatcher idempotency — one row per
--        (execution_token, hook_action_key). Hook handlers enter under
--        INSERT ... ON CONFLICT DO NOTHING RETURNING id — empty return = no-op.
--
-- Why this exists (R2 review finding):
--   Posting transitions fire multiple hook actions (activity_log.write,
--   snapshot.capture, transaction_flow.dispatch, ledger.materialize_gl_balance,
--   ledger.commitment_consume, budget_transaction, notification.publish).
--   Each hook must be idempotent so that retries (API/client retry, webhook
--   replay, worker re-delivery) do not double-post or duplicate notifications.
--
-- Execution token contract:
--   execution_token = sha256_hex(
--     transition_id || ':' || source_doc_id || ':' || transition_event_seq
--   )
--
--   Same transition fired twice for the same source-doc revision yields the
--   same token → INSERT ... ON CONFLICT DO NOTHING blocks the duplicate.
--
-- Retention:
--   Rows are durable — they encode posting history that ledger reconciliation
--   relies on. Retention managed by archival job, not TTL.
-- ============================================================================

CREATE TABLE IF NOT EXISTS control.lifecycle_transition_execution (
    -- Identity
    id                      uuid          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid          NOT NULL,

    -- Idempotency key
    execution_token         text          NOT NULL,  -- sha256 hex of transition context
    hook_action_key         text          NOT NULL,  -- snapshot.capture | ledger.materialize_gl_balance | ...

    -- Transition context (denormalised for auditability and re-replay)
    transition_id           uuid          NOT NULL,
    source_doc_type         text          NOT NULL,
    source_doc_id           uuid          NOT NULL,
    transition_event_seq    bigint        NOT NULL DEFAULT 1,

    -- Outcome
    status                  text          NOT NULL DEFAULT 'completed',
    payload_hash            text,                       -- sha256 of result payload (optional)
    error_message           text,                       -- populated when status='failed'
    error_code              text,                       -- machine-readable error tag

    -- Actor
    principal_id            uuid,

    -- Audit
    executed_at             timestamptz   NOT NULL DEFAULT now(),
    completed_at            timestamptz,                -- NULL until handler returns
    duration_ms             integer,                    -- handler wall-clock
    metadata                jsonb         NOT NULL DEFAULT '{}'::jsonb,

    CONSTRAINT lte_pkey                 PRIMARY KEY (id),
    CONSTRAINT lte_tenant_id_uq         UNIQUE (tenant_id, id),
    CONSTRAINT lte_token_action_uq      UNIQUE (execution_token, hook_action_key),
    CONSTRAINT lte_status_chk           CHECK (status IN (
        'completed','partial','failed','skipped','in_progress')),
    CONSTRAINT lte_source_type_chk      CHECK (btrim(source_doc_type) <> ''),
    CONSTRAINT lte_token_chk            CHECK (length(execution_token) >= 16),
    CONSTRAINT lte_action_chk           CHECK (btrim(hook_action_key) <> ''),
    CONSTRAINT lte_event_seq_pos        CHECK (transition_event_seq >= 1),
    CONSTRAINT lte_duration_nonneg      CHECK (duration_ms IS NULL OR duration_ms >= 0),
    CONSTRAINT lte_completed_after_start CHECK (
        completed_at IS NULL OR completed_at >= executed_at),
    CONSTRAINT lte_failed_has_msg       CHECK (
        status <> 'failed' OR error_message IS NOT NULL)
);

COMMENT ON TABLE control.lifecycle_transition_execution IS
    'SCOPE=T. Idempotency carrier for lifecycle transition hooks. Each row records '
    'one hook handler run keyed by (execution_token, hook_action_key). Handlers enter '
    'under INSERT ... ON CONFLICT DO NOTHING RETURNING id — empty return means a prior '
    'firing already completed this hook for this transition × source-doc × event-seq, '
    'and the handler must no-op. Single new control-plane table (documented exception '
    'to the no-new-tables lock; see plan §2.5).';

COMMENT ON COLUMN control.lifecycle_transition_execution.execution_token IS
    'sha256 hex of (transition_id || '':'' || source_doc_id || '':'' || transition_event_seq). '
    'Same transition fired twice for the same revision yields the same token.';

COMMENT ON COLUMN control.lifecycle_transition_execution.hook_action_key IS
    'Hook action that ran. Examples: snapshot.capture, activity_log.write, '
    'transaction_flow.dispatch, ledger.materialize_gl_balance, '
    'ledger.commitment_consume, notification.publish, workflow.start.';

COMMENT ON COLUMN control.lifecycle_transition_execution.transition_event_seq IS
    'Monotonic per (transition_id, source_doc_id). Bumped when the same transition '
    'genuinely fires again on the same source doc (e.g., reverse → re-approve cycle).';


-- ── Indexes ─────────────────────────────────────────────────────────────────
-- Replay / audit: list all hooks fired for one source doc
CREATE INDEX IF NOT EXISTS lte_source_doc_idx
    ON control.lifecycle_transition_execution (tenant_id, source_doc_type, source_doc_id, executed_at DESC);

-- Failure inspection
CREATE INDEX IF NOT EXISTS lte_failed_idx
    ON control.lifecycle_transition_execution (tenant_id, executed_at DESC)
    WHERE status = 'failed';

-- Recent activity by principal (for the "what did X just do" UI)
CREATE INDEX IF NOT EXISTS lte_principal_recent_idx
    ON control.lifecycle_transition_execution (tenant_id, principal_id, executed_at DESC)
    WHERE principal_id IS NOT NULL;

-- In-flight handlers (for stuck-handler recovery sweep)
CREATE INDEX IF NOT EXISTS lte_in_progress_idx
    ON control.lifecycle_transition_execution (executed_at)
    WHERE status = 'in_progress';
