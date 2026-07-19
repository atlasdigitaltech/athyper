-- ============================================================================
-- document/01z_cross_book_posting.sql
-- Durable execution ledger for control.book_posting_rule.
-- Journal headers remain the accounting source of truth; this table records
-- one deterministic execution outcome per source JE + rule version.
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.book_posting_derivation (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid        NOT NULL,
    company_code_id       uuid        NOT NULL,
    source_journal_id     uuid        NOT NULL,
    posting_rule_id       uuid        NOT NULL,
    posting_rule_version  smallint    NOT NULL,
    target_journal_id     uuid,
    idempotency_key       text        NOT NULL,
    status                text        NOT NULL DEFAULT 'pending',
    attempt_count         integer     NOT NULL DEFAULT 0,
    last_attempt_at       timestamptz,
    completed_at          timestamptz,
    error_code            text,
    error_message         text,
    evidence_payload      jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT book_posting_derivation_pkey PRIMARY KEY (id),
    CONSTRAINT book_posting_derivation_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT bpd_source_rule_version_uq
        UNIQUE (tenant_id, source_journal_id, posting_rule_id, posting_rule_version),
    CONSTRAINT bpd_idempotency_uq UNIQUE (tenant_id, idempotency_key),
    CONSTRAINT bpd_status_chk CHECK (status IN ('pending','processing','completed','suppressed','failed')),
    CONSTRAINT bpd_attempt_count_chk CHECK (attempt_count >= 0),
    CONSTRAINT bpd_rule_version_chk CHECK (posting_rule_version > 0),
    CONSTRAINT bpd_key_nonempty_chk CHECK (btrim(idempotency_key) <> ''),
    CONSTRAINT bpd_target_status_chk CHECK (
        (status = 'completed' AND target_journal_id IS NOT NULL)
        OR (status <> 'completed')
    ),
    CONSTRAINT bpd_failure_chk CHECK (
        (status = 'failed' AND error_message IS NOT NULL)
        OR (status <> 'failed')
    )
);

COMMENT ON TABLE document.book_posting_derivation IS
    'ARCHETYPE=E;SCOPE=T. Durable cross-book posting execution and audit ledger. '
    'One outcome per source journal, posting rule, and rule version; retries reuse idempotency_key.';

COMMENT ON COLUMN document.book_posting_derivation.evidence_payload IS
    'Execution evidence including source/target books, matched filters, amount/account strategy, line count, and lineage depth.';
