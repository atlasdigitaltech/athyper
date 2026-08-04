CREATE TABLE control.budget_control_policy (
    id                            uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                     uuid        NOT NULL,
    policy_code                   text        NOT NULL,
    version_no                    integer     NOT NULL DEFAULT 1,
    name                          text        NOT NULL,
    description                   text,
    company_code_id               uuid,
    ledger_book_id                uuid,
    source_document_type          text,
    period_scope                  control.budget_period_scope_d
                                              NOT NULL DEFAULT 'fiscal_year',
    consumption_basis             control.budget_consumption_basis_d
                                              NOT NULL DEFAULT 'actuals_and_commitments',
    warn_at_percent               numeric(7,4) NOT NULL DEFAULT 80,
    block_at_percent              numeric(7,4) NOT NULL DEFAULT 100,
    override_policy_definition_id uuid,
    effective_from                date        NOT NULL DEFAULT CURRENT_DATE,
    effective_to                  date,
    supersedes_id                 uuid,
    metadata                      jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                        control.finance_policy_status_d NOT NULL DEFAULT 'draft',
    is_active                     boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at             timestamptz,
    status_changed_by             uuid,
    created_at                    timestamptz NOT NULL DEFAULT now(),
    created_by                    uuid        NOT NULL,
    updated_at                    timestamptz,
    updated_by                    uuid,

    CONSTRAINT budget_control_policy_pkey PRIMARY KEY (id),
    CONSTRAINT budget_control_policy_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT budget_control_policy_lineage_version_uq UNIQUE NULLS NOT DISTINCT (
        tenant_id, policy_code, company_code_id, ledger_book_id,
        source_document_type, version_no
    ),
    CONSTRAINT budget_control_policy_code_chk
        CHECK (policy_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT budget_control_policy_version_chk CHECK (version_no > 0),
    CONSTRAINT budget_control_policy_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT budget_control_policy_description_chk
        CHECK (description IS NULL OR btrim(description) <> ''),
    CONSTRAINT budget_control_policy_scope_chk
        CHECK (ledger_book_id IS NULL OR company_code_id IS NOT NULL),
    CONSTRAINT budget_control_policy_document_type_chk CHECK (
        source_document_type IS NULL
        OR source_document_type ~ '^[a-z][a-z0-9_.-]{1,126}$'
    ),
    CONSTRAINT budget_control_policy_threshold_chk CHECK (
        warn_at_percent BETWEEN 0 AND 1000
        AND block_at_percent BETWEEN warn_at_percent AND 1000
    ),
    CONSTRAINT budget_control_policy_effective_chk
        CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT budget_control_policy_not_self_superseding_chk
        CHECK (supersedes_id IS NULL OR supersedes_id <> id),
    CONSTRAINT budget_control_policy_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT budget_control_policy_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT budget_control_policy_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.budget_control_policy IS
  'Neon-only typed budget-evaluation policy. Budget authority remains in document.budget_profile and document.budget_allocation; balances remain ledger-derived.';

COMMENT ON COLUMN control.budget_control_policy.consumption_basis IS
  'Defines which ledger evidence contributes to utilization; it does not store or duplicate balances.';
