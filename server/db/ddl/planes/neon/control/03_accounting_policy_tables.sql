-- Clean accounting-determination aggregate. No POC acct_profile_* tables,
-- numeric versions, free-form formulas, alias tables or supplier overrides.

CREATE TABLE control.accounting_profile_policy (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    accounting_profile_id   uuid        NOT NULL,
    effective_from          date        NOT NULL DEFAULT CURRENT_DATE,
    effective_to            date,
    supersedes_policy_id    uuid,
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                  control.accounting_policy_status_d NOT NULL DEFAULT 'draft',
    is_active               boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT accounting_profile_policy_pkey PRIMARY KEY (id),
    CONSTRAINT accounting_profile_policy_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT accounting_profile_policy_revision_uq
        UNIQUE (tenant_id, accounting_profile_id, effective_from),
    CONSTRAINT accounting_profile_policy_period_chk
        CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT accounting_profile_policy_successor_chk
        CHECK (supersedes_policy_id IS NULL OR supersedes_policy_id <> id),
    CONSTRAINT accounting_profile_policy_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT accounting_profile_policy_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT accounting_profile_policy_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.accounting_profile_policy IS
  'Effective-dated aggregate definition for a stable master.accounting_profile. Children inherit lifecycle/effectivity and become immutable when this row is activated.';

CREATE TABLE control.accounting_profile_event (
    id                              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                       uuid        NOT NULL,
    accounting_profile_policy_id    uuid        NOT NULL,
    event_code                      text        NOT NULL,
    journal_action                  control.accounting_journal_action_d NOT NULL DEFAULT 'post',
    reverses_event_code             text,
    auto_reverse                    boolean     NOT NULL DEFAULT false,
    auto_reverse_period_offset      smallint,
    sequence_no                     smallint    NOT NULL DEFAULT 0,
    metadata                        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at                      timestamptz NOT NULL DEFAULT now(),
    created_by                      uuid        NOT NULL,

    CONSTRAINT accounting_profile_event_pkey PRIMARY KEY (id),
    CONSTRAINT accounting_profile_event_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT accounting_profile_event_code_uq
        UNIQUE (tenant_id, accounting_profile_policy_id, event_code),
    CONSTRAINT accounting_profile_event_code_chk
        CHECK (event_code ~ '^[A-Z][A-Z0-9_.-]{1,126}$'),
    CONSTRAINT accounting_profile_event_reverse_code_chk
        CHECK (reverses_event_code IS NULL OR reverses_event_code ~ '^[A-Z][A-Z0-9_.-]{1,126}$'),
    CONSTRAINT accounting_profile_event_reverse_chk CHECK (
        (journal_action = 'reverse' AND reverses_event_code IS NOT NULL)
        OR (journal_action <> 'reverse' AND reverses_event_code IS NULL)
    ),
    CONSTRAINT accounting_profile_event_auto_reverse_chk CHECK (
        (auto_reverse AND journal_action = 'post' AND auto_reverse_period_offset > 0)
        OR (NOT auto_reverse AND auto_reverse_period_offset IS NULL)
    ),
    CONSTRAINT accounting_profile_event_sequence_chk CHECK (sequence_no >= 0),
    CONSTRAINT accounting_profile_event_metadata_chk CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE control.accounting_profile_entry (
    id                              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                       uuid        NOT NULL,
    accounting_profile_event_id     uuid        NOT NULL,
    line_no                         smallint    NOT NULL,
    description                     text        NOT NULL,
    posting_side                    control.accounting_posting_side_d NOT NULL,
    posting_role_code               text        NOT NULL,
    amount_source                   control.accounting_amount_source_d NOT NULL,
    condition_type_id               uuid,
    is_balancing_line               boolean     NOT NULL DEFAULT false,
    metadata                        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at                      timestamptz NOT NULL DEFAULT now(),
    created_by                      uuid        NOT NULL,

    CONSTRAINT accounting_profile_entry_pkey PRIMARY KEY (id),
    CONSTRAINT accounting_profile_entry_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT accounting_profile_entry_line_uq
        UNIQUE (tenant_id, accounting_profile_event_id, line_no),
    CONSTRAINT accounting_profile_entry_line_chk CHECK (line_no > 0),
    CONSTRAINT accounting_profile_entry_description_chk CHECK (btrim(description) <> ''),
    CONSTRAINT accounting_profile_entry_role_chk
        CHECK (posting_role_code ~ '^[a-z][a-z0-9_]{1,62}$'),
    CONSTRAINT accounting_profile_entry_condition_chk CHECK (
        (amount_source = 'pricing_component' AND condition_type_id IS NOT NULL)
        OR (amount_source <> 'pricing_component' AND condition_type_id IS NULL)
    ),
    CONSTRAINT accounting_profile_entry_metadata_chk CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE control.accounting_profile_assignment (
    id                              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                       uuid        NOT NULL,
    company_code_id                 uuid,
    business_intent_id              uuid,
    flow_code                       text,
    document_type_code              text,
    accounting_profile_policy_id    uuid        NOT NULL,
    effective_from                  date        NOT NULL DEFAULT CURRENT_DATE,
    effective_to                    date,
    metadata                        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                          control.accounting_policy_status_d NOT NULL DEFAULT 'draft',
    is_active                       boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at               timestamptz,
    status_changed_by               uuid,
    created_at                      timestamptz NOT NULL DEFAULT now(),
    created_by                      uuid        NOT NULL,
    updated_at                      timestamptz,
    updated_by                      uuid,

    CONSTRAINT accounting_profile_assignment_pkey PRIMARY KEY (id),
    CONSTRAINT accounting_profile_assignment_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT accounting_profile_assignment_revision_uq UNIQUE NULLS NOT DISTINCT (
        tenant_id, company_code_id, business_intent_id, flow_code,
        document_type_code, effective_from
    ),
    CONSTRAINT accounting_profile_assignment_flow_chk
        CHECK (flow_code IS NULL OR flow_code ~ '^[A-Z][A-Z0-9_.-]{1,62}$'),
    CONSTRAINT accounting_profile_assignment_document_chk
        CHECK (document_type_code IS NULL OR document_type_code ~ '^[A-Z][A-Z0-9_.-]{1,126}$'),
    CONSTRAINT accounting_profile_assignment_period_chk
        CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT accounting_profile_assignment_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT accounting_profile_assignment_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT accounting_profile_assignment_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.accounting_profile_assignment IS
  'Deterministic company/intent/flow/document routing. Specificity is computed from populated coordinates; equal-specificity ambiguity is an error, never resolved by arbitrary priority.';

CREATE TABLE control.posting_role_account_assignment (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    company_code_id         uuid        NOT NULL,
    ledger_book_id          uuid        NOT NULL,
    posting_role_code       text        NOT NULL,
    gl_account_id           uuid        NOT NULL,
    effective_from          date        NOT NULL DEFAULT CURRENT_DATE,
    effective_to            date,
    supersedes_assignment_id uuid,
    description             text,
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                  control.accounting_policy_status_d NOT NULL DEFAULT 'draft',
    is_active               boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at       timestamptz,
    status_changed_by       uuid,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT posting_role_account_assignment_pkey PRIMARY KEY (id),
    CONSTRAINT posting_role_account_assignment_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT posting_role_account_assignment_revision_uq UNIQUE (
        tenant_id, company_code_id, ledger_book_id, posting_role_code, effective_from
    ),
    CONSTRAINT posting_role_account_assignment_role_chk
        CHECK (posting_role_code ~ '^[a-z][a-z0-9_]{1,62}$'),
    CONSTRAINT posting_role_account_assignment_period_chk
        CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT posting_role_account_assignment_successor_chk
        CHECK (supersedes_assignment_id IS NULL OR supersedes_assignment_id <> id),
    CONSTRAINT posting_role_account_assignment_description_chk
        CHECK (description IS NULL OR btrim(description) <> ''),
    CONSTRAINT posting_role_account_assignment_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT posting_role_account_assignment_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT posting_role_account_assignment_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.cross_book_posting_policy (
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,
    company_code_id             uuid        NOT NULL,
    code                        text        NOT NULL,
    name                        text        NOT NULL,
    description                 text,
    source_book_id              uuid        NOT NULL,
    target_book_id              uuid        NOT NULL,
    scope_document_type_code    text,
    scope_business_intent_id    uuid,
    posting_mode                control.cross_book_posting_mode_d NOT NULL DEFAULT 'mirror',
    recognition_timing          control.cross_book_recognition_d NOT NULL DEFAULT 'simultaneous',
    recognition_lag_periods     smallint,
    effective_from              date        NOT NULL DEFAULT CURRENT_DATE,
    effective_to                date,
    supersedes_policy_id        uuid,
    metadata                    jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                      control.accounting_policy_status_d NOT NULL DEFAULT 'draft',
    is_active                   boolean GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at           timestamptz,
    status_changed_by           uuid,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT cross_book_posting_policy_pkey PRIMARY KEY (id),
    CONSTRAINT cross_book_posting_policy_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT cross_book_posting_policy_revision_uq
        UNIQUE (tenant_id, company_code_id, code, effective_from),
    CONSTRAINT cross_book_posting_policy_code_chk
        CHECK (code ~ '^[A-Z][A-Z0-9_.-]{1,62}$'),
    CONSTRAINT cross_book_posting_policy_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT cross_book_posting_policy_books_chk CHECK (source_book_id <> target_book_id),
    CONSTRAINT cross_book_posting_policy_document_chk
        CHECK (scope_document_type_code IS NULL OR scope_document_type_code ~ '^[A-Z][A-Z0-9_.-]{1,126}$'),
    CONSTRAINT cross_book_posting_policy_recognition_chk CHECK (
        (recognition_timing = 'simultaneous' AND recognition_lag_periods IS NULL)
        OR (recognition_timing = 'deferred' AND recognition_lag_periods > 0)
    ),
    CONSTRAINT cross_book_posting_policy_period_chk
        CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT cross_book_posting_policy_successor_chk
        CHECK (supersedes_policy_id IS NULL OR supersedes_policy_id <> id),
    CONSTRAINT cross_book_posting_policy_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT cross_book_posting_policy_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT cross_book_posting_policy_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.cross_book_account_assignment (
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,
    cross_book_posting_policy_id uuid       NOT NULL,
    source_gl_account_id        uuid        NOT NULL,
    target_gl_account_id        uuid        NOT NULL,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,

    CONSTRAINT cross_book_account_assignment_pkey PRIMARY KEY (id),
    CONSTRAINT cross_book_account_assignment_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT cross_book_account_assignment_source_uq
        UNIQUE (tenant_id, cross_book_posting_policy_id, source_gl_account_id),
    CONSTRAINT cross_book_account_assignment_accounts_chk
        CHECK (source_gl_account_id <> target_gl_account_id)
);
