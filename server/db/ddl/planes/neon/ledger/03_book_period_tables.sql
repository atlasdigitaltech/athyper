CREATE TABLE ledger.book_period_status (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    ledger_book_id uuid NOT NULL,
    fiscal_period_id uuid NOT NULL,
    status ledger.book_period_status_d NOT NULL DEFAULT 'future',
    opened_at timestamptz,
    opened_by uuid,
    soft_closed_at timestamptz,
    soft_closed_by uuid,
    hard_closed_at timestamptz,
    hard_closed_by uuid,
    status_changed_at timestamptz,
    status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz,
    updated_by uuid,
    CONSTRAINT book_period_status_pkey PRIMARY KEY (id),
    CONSTRAINT book_period_status_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT book_period_status_coordinate_uq
        UNIQUE (tenant_id, ledger_book_id, fiscal_period_id),
    CONSTRAINT book_period_status_open_pair_chk CHECK ((opened_at IS NULL) = (opened_by IS NULL)),
    CONSTRAINT book_period_status_soft_pair_chk
        CHECK ((soft_closed_at IS NULL) = (soft_closed_by IS NULL)),
    CONSTRAINT book_period_status_hard_pair_chk
        CHECK ((hard_closed_at IS NULL) = (hard_closed_by IS NULL)),
    CONSTRAINT book_period_status_changed_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT book_period_status_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE ledger.book_period_status IS
  'Per-ledger-book posting gate for a master fiscal period. The fiscal calendar remains in master.fiscal_period.';
