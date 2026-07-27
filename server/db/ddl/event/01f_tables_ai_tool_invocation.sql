-- ============================================================================
-- event/01f_tables_ai_tool_invocation.sql
-- Durable Atlas governed-tool proposal, authorization, and execution ledger.
--
-- Raw tool arguments, raw results, confirmation tokens, and chain-of-thought
-- are deliberately excluded. The runtime stores bounded summaries, hashes,
-- policy snapshots, opaque business/evidence references, and lifecycle state.
-- ============================================================================

CREATE TABLE IF NOT EXISTS event.ai_tool_invocation (
    id                                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                           uuid        NOT NULL,
    thread_id                           uuid        NOT NULL,
    run_id                              uuid        NOT NULL,
    plane                               text        NOT NULL,
    principal_id                        uuid        NOT NULL,

    tool_call_id                        text        NOT NULL,
    tool_code                           text        NOT NULL,
    tool_version                        text,
    action_code                         text,
    input_hash                          text,

    operation_class                     text        NOT NULL,
    risk_class                          text        NOT NULL,
    autonomy_decision                   text        NOT NULL,

    -- Proposal-time authorization evidence. These objects must contain only
    -- bounded identifiers, revisions, and allow/deny decisions; never secrets,
    -- access tokens, raw prompts, arguments, or field values.
    permission_snapshot                 jsonb       NOT NULL,
    policy_snapshot                     jsonb       NOT NULL,
    profile_snapshot                    jsonb       NOT NULL,
    authorization_epoch                 bigint      NOT NULL,
    policy_revision                     text        NOT NULL,
    profile_revision                    text        NOT NULL,

    proposal_summary                    text        NOT NULL,
    affected_entity_type                text,
    affected_entity_id                  uuid,
    expected_record_row_version         bigint,

    confirmation_required               boolean     NOT NULL DEFAULT false,
    confirmation_policy                 text        NOT NULL DEFAULT 'none',
    confirmation_token_hash             text,
    confirmation_actor_id               uuid,
    confirmation_at                     timestamptz,
    confirmation_expires_at             timestamptz,

    -- The execution guard is a second, execution-time authorization snapshot.
    -- It proves that auth epoch, policy, permission, lifecycle, field scope,
    -- and record version were re-evaluated immediately before dispatch.
    execution_guard_snapshot             jsonb,
    execution_auth_epoch                 bigint,
    execution_policy_revision            text,
    executing_at                         timestamptz,

    downstream_command_idempotency_key   text,
    business_transaction_type            text,
    business_transaction_id              uuid,
    result_hash                           text,
    evidence_refs                         jsonb       NOT NULL DEFAULT '[]'::jsonb,

    status                                text        NOT NULL DEFAULT 'proposed',
    terminal_error_class                  text,
    terminal_at                           timestamptz,
    duration_ms                           bigint,

    created_at                            timestamptz NOT NULL DEFAULT now(),
    created_by                            uuid        NOT NULL,
    updated_at                            timestamptz,
    updated_by                            uuid,

    CONSTRAINT ai_tool_invocation_pkey PRIMARY KEY (id),
    CONSTRAINT ai_tool_invocation_tenant_id_uq
        UNIQUE (tenant_id, id),
    CONSTRAINT ai_tool_invocation_scope_id_uq
        UNIQUE (tenant_id, thread_id, plane, id),
    CONSTRAINT ai_tool_invocation_call_uq
        UNIQUE (tenant_id, run_id, tool_call_id),

    CONSTRAINT ai_tool_invocation_plane_chk
        CHECK (plane IN ('neon', 'mesh', 'admin')),
    CONSTRAINT ai_tool_invocation_tool_call_id_chk
        CHECK (
            btrim(tool_call_id) <> ''
            AND octet_length(tool_call_id) <= 256
        ),
    CONSTRAINT ai_tool_invocation_tool_code_chk
        CHECK (
            tool_code ~ '^[A-Za-z0-9_-]{1,128}$'
        ),
    CONSTRAINT ai_tool_invocation_tool_version_chk
        CHECK (
            tool_version IS NULL
            OR tool_version ~ '^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$'
        ),
    CONSTRAINT ai_tool_invocation_action_code_chk
        CHECK (
            action_code IS NULL
            OR action_code ~ '^[a-z][a-z0-9_.:-]{0,127}$'
        ),
    CONSTRAINT ai_tool_invocation_input_hash_chk
        CHECK (
            input_hash IS NULL
            OR input_hash ~ '^[0-9a-f]{64}$'
        ),
    CONSTRAINT ai_tool_invocation_operation_class_chk
        CHECK (operation_class IN ('unresolved', 'read', 'propose', 'mutate')),
    CONSTRAINT ai_tool_invocation_risk_class_chk
        CHECK (risk_class IN ('unknown', 'low', 'medium', 'high', 'critical')),
    CONSTRAINT ai_tool_invocation_autonomy_chk
        CHECK (
            autonomy_decision IN (
                'not_evaluated',
                'denied',
                'suggest',
                'assist',
                'auto'
            )
        ),
    CONSTRAINT ai_tool_invocation_status_chk
        CHECK (
            status IN (
                'proposed',
                'confirmed',
                'executing',
                'completed',
                'denied',
                'failed',
                'expired',
                'cancelled'
            )
        ),

    CONSTRAINT ai_tool_invocation_permission_snapshot_chk
        CHECK (
            jsonb_typeof(permission_snapshot) = 'object'
            AND permission_snapshot <> '{}'::jsonb
            AND octet_length(permission_snapshot::text) <= 32768
        ),
    CONSTRAINT ai_tool_invocation_policy_snapshot_chk
        CHECK (
            jsonb_typeof(policy_snapshot) = 'object'
            AND policy_snapshot <> '{}'::jsonb
            AND octet_length(policy_snapshot::text) <= 32768
        ),
    CONSTRAINT ai_tool_invocation_profile_snapshot_chk
        CHECK (
            jsonb_typeof(profile_snapshot) = 'object'
            AND profile_snapshot <> '{}'::jsonb
            AND octet_length(profile_snapshot::text) <= 32768
        ),
    CONSTRAINT ai_tool_invocation_authorization_epoch_chk
        CHECK (authorization_epoch >= 0),
    CONSTRAINT ai_tool_invocation_revision_chk
        CHECK (
            btrim(policy_revision) <> ''
            AND octet_length(policy_revision) <= 256
            AND btrim(profile_revision) <> ''
            AND octet_length(profile_revision) <= 256
        ),
    CONSTRAINT ai_tool_invocation_summary_chk
        CHECK (
            btrim(proposal_summary) <> ''
            AND octet_length(proposal_summary) <= 4096
        ),
    CONSTRAINT ai_tool_invocation_entity_chk
        CHECK (
            (
                affected_entity_type IS NULL
                AND affected_entity_id IS NULL
            )
            OR (
                affected_entity_type IS NOT NULL
                AND btrim(affected_entity_type) <> ''
                AND octet_length(affected_entity_type) <= 128
                AND affected_entity_id IS NOT NULL
            )
        ),
    CONSTRAINT ai_tool_invocation_expected_version_chk
        CHECK (
            expected_record_row_version IS NULL
            OR (
                expected_record_row_version >= 0
                AND affected_entity_id IS NOT NULL
            )
        ),

    CONSTRAINT ai_tool_invocation_confirmation_policy_chk
        CHECK (
            confirmation_policy IN (
                'none',
                'explicit',
                'step_up',
                'dual_control'
            )
        ),
    CONSTRAINT ai_tool_invocation_confirmation_hash_chk
        CHECK (
            confirmation_token_hash IS NULL
            OR confirmation_token_hash ~ '^[0-9a-f]{64}$'
        ),
    CONSTRAINT ai_tool_invocation_confirmation_chk
        CHECK (
            (
                confirmation_required = false
                AND confirmation_policy = 'none'
                AND confirmation_token_hash IS NULL
                AND confirmation_actor_id IS NULL
                AND confirmation_at IS NULL
                AND confirmation_expires_at IS NULL
            )
            OR (
                confirmation_required = true
                AND confirmation_policy <> 'none'
                AND confirmation_token_hash IS NOT NULL
                AND confirmation_expires_at IS NOT NULL
                AND confirmation_expires_at > created_at
                AND (
                    (
                        confirmation_actor_id IS NULL
                        AND confirmation_at IS NULL
                    )
                    OR (
                        confirmation_actor_id IS NOT NULL
                        AND confirmation_at IS NOT NULL
                        AND confirmation_at >= created_at
                        AND confirmation_at <= confirmation_expires_at
                    )
                )
                AND (
                    status NOT IN ('confirmed', 'executing', 'completed')
                    OR confirmation_actor_id IS NOT NULL
                )
                AND (
                    status <> 'proposed'
                    OR confirmation_actor_id IS NULL
                )
            )
        ),
    CONSTRAINT ai_tool_invocation_confirmed_state_chk
        CHECK (
            status <> 'confirmed'
            OR (
                confirmation_required = true
                AND operation_class <> 'unresolved'
                AND risk_class <> 'unknown'
                AND autonomy_decision IN ('suggest', 'assist', 'auto')
                AND tool_version IS NOT NULL
                AND action_code IS NOT NULL
                AND input_hash IS NOT NULL
            )
        ),

    CONSTRAINT ai_tool_invocation_execution_guard_chk
        CHECK (
            (
                executing_at IS NULL
                AND execution_guard_snapshot IS NULL
                AND execution_auth_epoch IS NULL
                AND execution_policy_revision IS NULL
            )
            OR (
                executing_at IS NOT NULL
                AND execution_guard_snapshot IS NOT NULL
                AND jsonb_typeof(execution_guard_snapshot) = 'object'
                AND execution_guard_snapshot <> '{}'::jsonb
                AND octet_length(execution_guard_snapshot::text) <= 32768
                AND execution_auth_epoch IS NOT NULL
                AND execution_auth_epoch >= 0
                AND execution_policy_revision IS NOT NULL
                AND btrim(execution_policy_revision) <> ''
                AND octet_length(execution_policy_revision) <= 256
            )
        ),
    CONSTRAINT ai_tool_invocation_execution_state_chk
        CHECK (
            (
                status IN ('proposed', 'confirmed', 'denied', 'expired')
                AND executing_at IS NULL
            )
            OR (
                status IN ('executing', 'completed')
                AND executing_at IS NOT NULL
            )
            OR status IN ('failed', 'cancelled')
        ),
    CONSTRAINT ai_tool_invocation_executable_chk
        CHECK (
            status NOT IN ('executing', 'completed')
            OR (
                operation_class <> 'unresolved'
                AND risk_class <> 'unknown'
                AND autonomy_decision IN ('suggest', 'assist', 'auto')
                AND tool_version IS NOT NULL
                AND action_code IS NOT NULL
                AND input_hash IS NOT NULL
            )
        ),
    CONSTRAINT ai_tool_invocation_mutation_idempotency_chk
        CHECK (
            downstream_command_idempotency_key IS NULL
            OR (
                btrim(downstream_command_idempotency_key) <> ''
                AND octet_length(downstream_command_idempotency_key) <= 256
                AND executing_at IS NOT NULL
            )
        ),
    CONSTRAINT ai_tool_invocation_mutation_execution_chk
        CHECK (
            operation_class <> 'mutate'
            OR (
                confirmation_required = true
                AND autonomy_decision IN ('suggest', 'assist')
                AND (
                    executing_at IS NULL
                    OR downstream_command_idempotency_key IS NOT NULL
                )
            )
        ),

    CONSTRAINT ai_tool_invocation_business_ref_chk
        CHECK (
            (
                business_transaction_type IS NULL
                AND business_transaction_id IS NULL
            )
            OR (
                status = 'completed'
                AND business_transaction_type IS NOT NULL
                AND btrim(business_transaction_type) <> ''
                AND octet_length(business_transaction_type) <= 128
                AND business_transaction_id IS NOT NULL
            )
        ),
    CONSTRAINT ai_tool_invocation_result_hash_chk
        CHECK (
            result_hash IS NULL
            OR result_hash ~ '^[0-9a-f]{64}$'
        ),
    CONSTRAINT ai_tool_invocation_evidence_chk
        CHECK (
            jsonb_typeof(evidence_refs) = 'array'
            AND octet_length(evidence_refs::text) <= 65536
            AND (
                status = 'completed'
                OR evidence_refs = '[]'::jsonb
            )
        ),
    CONSTRAINT ai_tool_invocation_outcome_chk
        CHECK (
            (
                status IN ('proposed', 'confirmed', 'executing')
                AND terminal_at IS NULL
                AND terminal_error_class IS NULL
                AND result_hash IS NULL
                AND business_transaction_id IS NULL
                AND duration_ms IS NULL
            )
            OR (
                status = 'completed'
                AND terminal_at IS NOT NULL
                AND terminal_error_class IS NULL
                AND result_hash IS NOT NULL
                AND duration_ms IS NOT NULL
                AND duration_ms >= 0
            )
            OR (
                status IN ('denied', 'failed', 'expired', 'cancelled')
                AND terminal_at IS NOT NULL
                AND terminal_error_class IS NOT NULL
                AND btrim(terminal_error_class) <> ''
                AND octet_length(terminal_error_class) <= 128
                AND result_hash IS NULL
                AND business_transaction_id IS NULL
                AND duration_ms IS NOT NULL
                AND duration_ms >= 0
            )
        ),
    CONSTRAINT ai_tool_invocation_expiry_chk
        CHECK (
            status <> 'expired'
            OR (
                confirmation_required = true
                AND confirmation_expires_at IS NOT NULL
                AND terminal_at >= confirmation_expires_at
            )
        ),
    CONSTRAINT ai_tool_invocation_time_chk
        CHECK (
            (confirmation_at IS NULL OR confirmation_at >= created_at)
            AND (executing_at IS NULL OR executing_at >= created_at)
            AND (
                executing_at IS NULL
                OR confirmation_at IS NULL
                OR executing_at >= confirmation_at
            )
            AND (terminal_at IS NULL OR terminal_at >= created_at)
            AND (
                terminal_at IS NULL
                OR executing_at IS NULL
                OR terminal_at >= executing_at
            )
        )
);

COMMENT ON TABLE event.ai_tool_invocation IS
    'ARCHETYPE=B_LITE;SCOPE=T;DEVIATION. Durable Atlas governed-tool lifecycle '
    'ledger. Proposal identity is immutable; authorization resolves at most once; '
    'terminal outcomes are immutable and purge only with the owning thread.';
COMMENT ON COLUMN event.ai_tool_invocation.input_hash IS
    'Lowercase SHA-256 of canonical validated arguments. NULL only when malformed '
    'or unavailable input cannot be safely canonicalized; raw arguments are never stored here.';
COMMENT ON COLUMN event.ai_tool_invocation.confirmation_token_hash IS
    'Lowercase SHA-256 of the server-signed confirmation token. The token itself is never persisted.';
COMMENT ON COLUMN event.ai_tool_invocation.permission_snapshot IS
    'Bounded proposal-time permission, entity-capability, company-scope, and field-mask decision metadata.';
COMMENT ON COLUMN event.ai_tool_invocation.execution_guard_snapshot IS
    'Bounded execution-time recheck metadata for auth epoch, policy, permission, lifecycle, field scope, and row version.';
COMMENT ON COLUMN event.ai_tool_invocation.evidence_refs IS
    'Opaque evidence identifiers and safe locators only; never raw evidence content.';

-- Safe additive alignment for environments that provisioned an earlier
-- development snapshot of this still-unreleased table.
ALTER TABLE event.ai_tool_invocation
    ADD COLUMN IF NOT EXISTS action_code text,
    ADD COLUMN IF NOT EXISTS duration_ms bigint;

ALTER TABLE event.ai_tool_invocation
    ALTER COLUMN tool_version DROP NOT NULL;

ALTER TABLE event.ai_tool_invocation
    DROP CONSTRAINT IF EXISTS ai_tool_invocation_tool_code_chk;
ALTER TABLE event.ai_tool_invocation
    ADD CONSTRAINT ai_tool_invocation_tool_code_chk
    CHECK (tool_code ~ '^[A-Za-z0-9_-]{1,128}$');

DO $$ BEGIN ALTER TABLE event.ai_tool_invocation
    ADD CONSTRAINT ai_tool_invocation_action_code_chk
    CHECK (
        action_code IS NULL
        OR action_code ~ '^[a-z][a-z0-9_.:-]{0,127}$'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE event.ai_tool_invocation
    ADD CONSTRAINT ai_tool_invocation_duration_state_chk
    CHECK (
        (
            status IN ('proposed', 'confirmed', 'executing')
            AND duration_ms IS NULL
        )
        OR (
            status IN ('completed', 'denied', 'failed', 'expired', 'cancelled')
            AND duration_ms IS NOT NULL
            AND duration_ms >= 0
        )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE event.ai_tool_invocation
    ADD CONSTRAINT ai_tool_invocation_executable_identity_chk
    CHECK (
        status NOT IN ('executing', 'completed')
        OR (
            tool_version IS NOT NULL
            AND action_code IS NOT NULL
        )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE event.ai_tool_invocation
    ADD CONSTRAINT ai_tool_invocation_confirmed_state_chk
    CHECK (
        status <> 'confirmed'
        OR (
            confirmation_required = true
            AND operation_class <> 'unresolved'
            AND risk_class <> 'unknown'
            AND autonomy_decision IN ('suggest', 'assist', 'auto')
            AND tool_version IS NOT NULL
            AND action_code IS NOT NULL
            AND input_hash IS NOT NULL
        )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE event.ai_tool_invocation
    ADD CONSTRAINT ai_tool_invocation_bounded_json_chk
    CHECK (
        octet_length(permission_snapshot::text) <= 32768
        AND octet_length(policy_snapshot::text) <= 32768
        AND octet_length(profile_snapshot::text) <= 32768
        AND (
            execution_guard_snapshot IS NULL
            OR octet_length(execution_guard_snapshot::text) <= 32768
        )
        AND octet_length(evidence_refs::text) <= 65536
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
