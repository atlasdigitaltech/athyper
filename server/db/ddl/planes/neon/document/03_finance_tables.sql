-- Corrected Neon finance/P2P operational documents.
-- Generic entity snapshots replace document-local version chains.

CREATE TABLE document.workflow_request (
    id                       uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid        NOT NULL,
    workflow_type            text        NOT NULL DEFAULT 'approval',
    definition_code          text,
    definition_version       integer,
    compiled_artifact_hash   text,
    template_snapshot        jsonb       NOT NULL DEFAULT '{}'::jsonb,
    entity_type              text        NOT NULL,
    entity_id                text        NOT NULL,
    entity_version_id        uuid,
    entity_snapshot          jsonb       NOT NULL DEFAULT '{}'::jsonb,
    requested_by             uuid        NOT NULL,
    requested_at             timestamptz NOT NULL DEFAULT now(),
    decision                 document.workflow_decision_d,
    decided_by               uuid,
    decided_at               timestamptz,
    reason                   text,
    correlation_id           uuid,
    metadata                 jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                   document.workflow_request_status_d NOT NULL DEFAULT 'pending',
    status_changed_at        timestamptz,
    status_changed_by        uuid,
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid        NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,
    CONSTRAINT workflow_request_pkey PRIMARY KEY (id),
    CONSTRAINT workflow_request_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT workflow_request_entity_chk CHECK (
        entity_type ~ '^[a-z][a-z0-9_.-]{1,126}$' AND btrim(entity_id) <> ''
    ),
    CONSTRAINT workflow_request_definition_chk CHECK (
        (definition_code IS NULL) = (definition_version IS NULL)
        AND (definition_code IS NULL OR definition_code ~ '^[A-Za-z][A-Za-z0-9_.-]{1,126}$')
        AND (definition_version IS NULL OR definition_version >= 1)
    ),
    CONSTRAINT workflow_request_hash_chk CHECK (
        compiled_artifact_hash IS NULL OR compiled_artifact_hash ~ '^[a-f0-9]{64}$'
    ),
    CONSTRAINT workflow_request_decision_chk CHECK (
        (decision IS NULL AND decided_by IS NULL AND decided_at IS NULL)
        OR (decision IS NOT NULL AND decided_by IS NOT NULL AND decided_at IS NOT NULL)
    ),
    CONSTRAINT workflow_request_terminal_chk CHECK (
        status NOT IN ('approved','rejected','cancelled') OR decision IS NOT NULL
    ),
    CONSTRAINT workflow_request_json_chk CHECK (
        jsonb_typeof(template_snapshot) = 'object'
        AND jsonb_typeof(entity_snapshot) = 'object'
        AND jsonb_typeof(metadata) = 'object'
    ),
    CONSTRAINT workflow_request_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT workflow_request_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.workflow_stage (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    workflow_request_id uuid        NOT NULL,
    stage_no            smallint    NOT NULL,
    stage_code          text        NOT NULL,
    name                text        NOT NULL,
    mode                document.workflow_stage_mode_d NOT NULL DEFAULT 'serial',
    quorum              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    sla_policy_code     text,
    started_at          timestamptz,
    completed_at        timestamptz,
    outcome             text,
    status              document.workflow_stage_status_d NOT NULL DEFAULT 'pending',
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,
    CONSTRAINT workflow_stage_pkey PRIMARY KEY (id),
    CONSTRAINT workflow_stage_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT workflow_stage_request_no_uq UNIQUE (tenant_id, workflow_request_id, stage_no),
    CONSTRAINT workflow_stage_request_code_uq UNIQUE (tenant_id, workflow_request_id, stage_code),
    CONSTRAINT workflow_stage_no_chk CHECK (stage_no > 0),
    CONSTRAINT workflow_stage_code_chk CHECK (stage_code ~ '^[A-Za-z][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT workflow_stage_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT workflow_stage_quorum_chk CHECK (jsonb_typeof(quorum) = 'object'),
    CONSTRAINT workflow_stage_time_chk CHECK (
        completed_at IS NULL OR (started_at IS NOT NULL AND completed_at >= started_at)
    ),
    CONSTRAINT workflow_stage_state_chk CHECK (
        (status = 'pending' AND started_at IS NULL AND completed_at IS NULL)
        OR (status = 'active' AND started_at IS NOT NULL AND completed_at IS NULL)
        OR (status IN ('completed','skipped','cancelled') AND completed_at IS NOT NULL)
    ),
    CONSTRAINT workflow_stage_outcome_chk CHECK (
        outcome IS NULL OR outcome IN ('approved','rejected','escalated','skipped','cancelled')
    ),
    CONSTRAINT workflow_stage_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT workflow_stage_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.commitment (
    id                       uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid        NOT NULL,
    company_code_id          uuid        NOT NULL,
    code                     text        NOT NULL,
    name                     text        NOT NULL,
    description              text,
    commitment_type          document.commitment_type_d NOT NULL DEFAULT 'purchase_order',
    order_type               text,
    supplier_id              uuid,
    parent_commitment_id     uuid,
    release_sequence_no      smallint,
    responsible_principal_id uuid,
    requested_by             uuid        NOT NULL,
    workflow_request_id      uuid,
    approved_at              timestamptz,
    approved_by              uuid,
    document_date            date        NOT NULL,
    effective_date           date        NOT NULL,
    expiry_date              date,
    currency_code            character(3) NOT NULL,
    base_currency_code       character(3) NOT NULL,
    exchange_rate            numeric(18,10),
    fx_policy                document.fx_policy_d NOT NULL DEFAULT 'spot_on_event',
    fx_rate_snapshot         jsonb       NOT NULL DEFAULT '{}'::jsonb,
    total_amount             numeric(18,4) NOT NULL DEFAULT 0,
    payment_term_id          uuid,
    fiscal_period_id         uuid,
    budget_check_result      document.budget_check_result_d,
    encumbrance_journal_entry_id uuid,
    row_version              bigint      NOT NULL DEFAULT 1,
    metadata                 jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                   document.commitment_status_d NOT NULL DEFAULT 'draft',
    status_changed_at        timestamptz,
    status_changed_by        uuid,
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid        NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,
    CONSTRAINT commitment_pkey PRIMARY KEY (id),
    CONSTRAINT commitment_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT commitment_code_uq UNIQUE (tenant_id, company_code_id, code),
    CONSTRAINT commitment_code_chk CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT commitment_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT commitment_order_type_chk CHECK (
        order_type IS NULL OR order_type IN ('standard','blanket','service','emergency')
    ),
    CONSTRAINT commitment_order_scope_chk CHECK (order_type IS NULL OR commitment_type = 'purchase_order'),
    CONSTRAINT commitment_release_pair_chk CHECK (
        (parent_commitment_id IS NULL AND release_sequence_no IS NULL)
        OR (parent_commitment_id IS NOT NULL AND release_sequence_no > 0)
    ),
    CONSTRAINT commitment_self_chk CHECK (parent_commitment_id IS DISTINCT FROM id),
    CONSTRAINT commitment_date_chk CHECK (expiry_date IS NULL OR expiry_date >= effective_date),
    CONSTRAINT commitment_amount_chk CHECK (total_amount >= 0),
    CONSTRAINT commitment_currency_chk CHECK (
        (currency_code = base_currency_code AND COALESCE(exchange_rate, 1) = 1)
        OR (currency_code <> base_currency_code AND exchange_rate > 0)
    ),
    CONSTRAINT commitment_approval_pair_chk CHECK ((approved_at IS NULL) = (approved_by IS NULL)),
    CONSTRAINT commitment_approval_state_chk CHECK (
        status NOT IN ('approved','active','closed') OR approved_at IS NOT NULL
    ),
    CONSTRAINT commitment_row_version_chk CHECK (row_version >= 1),
    CONSTRAINT commitment_json_chk CHECK (
        jsonb_typeof(fx_rate_snapshot) = 'object' AND jsonb_typeof(metadata) = 'object'
    ),
    CONSTRAINT commitment_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT commitment_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.commitment_line (
    id                       uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid        NOT NULL,
    company_code_id          uuid        NOT NULL,
    commitment_id            uuid        NOT NULL,
    line_no                  smallint    NOT NULL,
    source_entity_type       text,
    source_entity_id         uuid,
    source_line_id           uuid,
    item_id                  uuid,
    item_description         text        NOT NULL,
    procurement_type         document.procurement_type_d NOT NULL DEFAULT 'goods',
    line_type                document.commercial_line_type_d NOT NULL DEFAULT 'noncatalog',
    commodity_category_id    uuid,
    business_intent_id       uuid,
    classification_decision  jsonb       NOT NULL DEFAULT '{}'::jsonb,
    asset_class_id           uuid,
    uom_code                 text        NOT NULL,
    quantity                 numeric(18,4) NOT NULL,
    unit_price               numeric(18,4) NOT NULL DEFAULT 0,
    price_unit               numeric(18,4) NOT NULL DEFAULT 1,
    currency_code            character(3) NOT NULL,
    net_amount               numeric(18,4) GENERATED ALWAYS AS (quantity * unit_price / price_unit) STORED,
    tax_amount               numeric(18,4) NOT NULL DEFAULT 0,
    withholding_tax_amount   numeric(18,4) NOT NULL DEFAULT 0,
    gross_amount             numeric(18,4) GENERATED ALWAYS AS (
        quantity * unit_price / price_unit + tax_amount - withholding_tax_amount
    ) STORED,
    over_delivery_tolerance  numeric(7,4) NOT NULL DEFAULT 0,
    under_delivery_tolerance numeric(7,4) NOT NULL DEFAULT 0,
    tax_group_id             uuid,
    withholding_tax_group_id uuid,
    to_tax_jurisdiction_id   uuid,
    from_tax_jurisdiction_id uuid,
    required_by_date         date,
    site_id                  uuid,
    warehouse_id             uuid,
    storage_location_code    text,
    ship_to_address_id       uuid,
    bill_to_address_id       uuid,
    bill_from_address_id     uuid,
    ship_from_address_id     uuid,
    remit_to_address_id      uuid,
    metadata                 jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                   document.commitment_line_status_d NOT NULL DEFAULT 'open',
    status_changed_at        timestamptz,
    status_changed_by        uuid,
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid        NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,
    CONSTRAINT commitment_line_pkey PRIMARY KEY (id),
    CONSTRAINT commitment_line_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT commitment_line_parent_no_uq UNIQUE (tenant_id, commitment_id, line_no),
    CONSTRAINT commitment_line_no_chk CHECK (line_no > 0),
    CONSTRAINT commitment_line_description_chk CHECK (btrim(item_description) <> ''),
    CONSTRAINT commitment_line_source_chk CHECK (
        (source_entity_type IS NULL AND source_entity_id IS NULL AND source_line_id IS NULL)
        OR (source_entity_type ~ '^[a-z][a-z0-9_.-]{1,126}$' AND source_entity_id IS NOT NULL)
    ),
    CONSTRAINT commitment_line_quantity_chk CHECK (quantity > 0),
    CONSTRAINT commitment_line_price_chk CHECK (unit_price >= 0 AND price_unit > 0),
    CONSTRAINT commitment_line_tax_chk CHECK (tax_amount >= 0 AND withholding_tax_amount >= 0),
    CONSTRAINT commitment_line_tolerance_chk CHECK (
        over_delivery_tolerance BETWEEN 0 AND 100
        AND under_delivery_tolerance BETWEEN 0 AND 100
    ),
    CONSTRAINT commitment_line_warehouse_site_chk CHECK (warehouse_id IS NULL OR site_id IS NOT NULL),
    CONSTRAINT commitment_line_json_chk CHECK (
        jsonb_typeof(classification_decision) = 'object' AND jsonb_typeof(metadata) = 'object'
    ),
    CONSTRAINT commitment_line_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT commitment_line_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.commitment_release_allocation (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid        NOT NULL,
    parent_commitment_id  uuid        NOT NULL,
    parent_line_id        uuid        NOT NULL,
    release_commitment_id uuid        NOT NULL,
    release_line_id       uuid        NOT NULL,
    allocation_kind       document.release_allocation_kind_d NOT NULL DEFAULT 'release',
    released_quantity     numeric(18,4) NOT NULL DEFAULT 0,
    released_amount       numeric(18,4) NOT NULL DEFAULT 0,
    currency_code         character(3) NOT NULL,
    reverses_allocation_id uuid,
    idempotency_key       text        NOT NULL,
    released_at           timestamptz NOT NULL DEFAULT now(),
    released_by           uuid        NOT NULL,
    metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,
    CONSTRAINT commitment_release_allocation_pkey PRIMARY KEY (id),
    CONSTRAINT commitment_release_allocation_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT commitment_release_allocation_idempotency_uq UNIQUE (tenant_id, idempotency_key),
    CONSTRAINT commitment_release_allocation_self_chk CHECK (parent_commitment_id <> release_commitment_id),
    CONSTRAINT commitment_release_allocation_amount_chk CHECK (
        released_quantity >= 0 AND released_amount >= 0
        AND (released_quantity > 0 OR released_amount > 0)
    ),
    CONSTRAINT commitment_release_allocation_reversal_chk CHECK (
        (allocation_kind = 'release' AND reverses_allocation_id IS NULL)
        OR (allocation_kind = 'reversal' AND reverses_allocation_id IS NOT NULL)
    ),
    CONSTRAINT commitment_release_allocation_no_self_reversal_chk CHECK (reverses_allocation_id IS DISTINCT FROM id),
    CONSTRAINT commitment_release_allocation_key_chk CHECK (btrim(idempotency_key) <> ''),
    CONSTRAINT commitment_release_allocation_json_chk CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE document.purchase_invoice (
    id                       uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid        NOT NULL,
    company_code_id          uuid        NOT NULL,
    code                     text        NOT NULL,
    name                     text        NOT NULL,
    invoice_source           document.purchase_invoice_source_d NOT NULL DEFAULT 'po_based',
    invoice_type             document.purchase_invoice_type_d NOT NULL DEFAULT 'standard',
    direction                document.purchase_invoice_direction_d NOT NULL DEFAULT 'payable',
    supplier_id              uuid,
    commitment_id            uuid,
    supplier_invoice_number  text,
    supplier_invoice_date    date,
    posting_date             date        NOT NULL DEFAULT CURRENT_DATE,
    received_date            date        NOT NULL DEFAULT CURRENT_DATE,
    baseline_date            date,
    due_date                 date,
    tax_mode                 document.tax_mode_d NOT NULL DEFAULT 'exclusive',
    match_type               document.invoice_match_type_d NOT NULL DEFAULT 'three_way',
    match_status             document.invoice_match_status_d NOT NULL DEFAULT 'unmatched',
    currency_code            character(3) NOT NULL,
    base_currency_code       character(3) NOT NULL,
    exchange_rate            numeric(18,10),
    fx_rate_snapshot         jsonb       NOT NULL DEFAULT '{}'::jsonb,
    net_amount               numeric(18,4) NOT NULL DEFAULT 0,
    tax_amount               numeric(18,4) NOT NULL DEFAULT 0,
    withholding_tax_amount   numeric(18,4) NOT NULL DEFAULT 0,
    retention_amount         numeric(18,4) NOT NULL DEFAULT 0,
    advance_deduction_amount numeric(18,4) NOT NULL DEFAULT 0,
    payable_amount           numeric(18,4) GENERATED ALWAYS AS (
        net_amount + tax_amount - withholding_tax_amount
        - retention_amount - advance_deduction_amount
    ) STORED,
    paid_amount              numeric(18,4) NOT NULL DEFAULT 0,
    outstanding_amount       numeric(18,4) GENERATED ALWAYS AS (
        net_amount + tax_amount - withholding_tax_amount
        - retention_amount - advance_deduction_amount - paid_amount
    ) STORED,
    payment_term_id          uuid,
    fiscal_period_id         uuid        NOT NULL,
    budget_check_result      document.budget_check_result_d,
    ap_journal_entry_id      uuid,
    requested_by             uuid        NOT NULL,
    workflow_request_id      uuid,
    approved_at              timestamptz,
    approved_by              uuid,
    row_version              bigint      NOT NULL DEFAULT 1,
    metadata                 jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                   document.purchase_invoice_status_d NOT NULL DEFAULT 'draft',
    status_changed_at        timestamptz,
    status_changed_by        uuid,
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid        NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,
    CONSTRAINT purchase_invoice_pkey PRIMARY KEY (id),
    CONSTRAINT purchase_invoice_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT purchase_invoice_code_uq UNIQUE (tenant_id, company_code_id, code),
    CONSTRAINT purchase_invoice_code_chk CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT purchase_invoice_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT purchase_invoice_direction_chk CHECK (
        (invoice_type = 'credit_note' AND direction = 'credit')
        OR (invoice_type <> 'credit_note' AND direction = 'payable')
    ),
    CONSTRAINT purchase_invoice_supplier_ref_chk CHECK (
        status = 'proforma'
        OR (
            supplier_id IS NOT NULL
            AND supplier_invoice_number IS NOT NULL
            AND btrim(supplier_invoice_number) <> ''
            AND supplier_invoice_date IS NOT NULL
        )
    ),
    CONSTRAINT purchase_invoice_commitment_chk CHECK (
        invoice_source NOT IN ('po_based','contract_based') OR commitment_id IS NOT NULL
    ),
    CONSTRAINT purchase_invoice_dates_chk CHECK (
        due_date IS NULL OR baseline_date IS NULL OR due_date >= baseline_date
    ),
    CONSTRAINT purchase_invoice_currency_chk CHECK (
        (currency_code = base_currency_code AND COALESCE(exchange_rate, 1) = 1)
        OR (currency_code <> base_currency_code AND exchange_rate > 0)
    ),
    CONSTRAINT purchase_invoice_amount_chk CHECK (
        net_amount >= 0 AND tax_amount >= 0 AND withholding_tax_amount >= 0
        AND retention_amount >= 0 AND advance_deduction_amount >= 0 AND paid_amount >= 0
        AND withholding_tax_amount + retention_amount + advance_deduction_amount <= net_amount + tax_amount
        AND paid_amount <= net_amount + tax_amount - withholding_tax_amount - retention_amount - advance_deduction_amount
    ),
    CONSTRAINT purchase_invoice_approval_pair_chk CHECK ((approved_at IS NULL) = (approved_by IS NULL)),
    CONSTRAINT purchase_invoice_approval_state_chk CHECK (
        status NOT IN ('approved','posted') OR approved_at IS NOT NULL
    ),
    CONSTRAINT purchase_invoice_row_version_chk CHECK (row_version >= 1),
    CONSTRAINT purchase_invoice_json_chk CHECK (
        jsonb_typeof(fx_rate_snapshot) = 'object' AND jsonb_typeof(metadata) = 'object'
    ),
    CONSTRAINT purchase_invoice_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT purchase_invoice_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.purchase_invoice_line (
    id                       uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid        NOT NULL,
    company_code_id          uuid        NOT NULL,
    purchase_invoice_id      uuid        NOT NULL,
    line_no                  smallint    NOT NULL,
    source_entity_type       text,
    source_entity_id         uuid,
    source_line_id           uuid,
    commitment_line_id       uuid,
    item_id                  uuid,
    item_description         text        NOT NULL,
    procurement_type         document.procurement_type_d NOT NULL DEFAULT 'goods',
    line_type                document.commercial_line_type_d NOT NULL DEFAULT 'noncatalog',
    commodity_category_id    uuid,
    business_intent_id       uuid,
    classification_decision  jsonb       NOT NULL DEFAULT '{}'::jsonb,
    asset_class_id           uuid,
    uom_code                 text        NOT NULL,
    quantity                 numeric(18,4) NOT NULL,
    unit_price               numeric(18,4) NOT NULL,
    price_unit               numeric(18,4) NOT NULL DEFAULT 1,
    currency_code            character(3) NOT NULL,
    net_amount               numeric(18,4) GENERATED ALWAYS AS (quantity * unit_price / price_unit) STORED,
    tax_amount               numeric(18,4) NOT NULL DEFAULT 0,
    withholding_tax_amount   numeric(18,4) NOT NULL DEFAULT 0,
    gross_amount             numeric(18,4) GENERATED ALWAYS AS (
        quantity * unit_price / price_unit + tax_amount - withholding_tax_amount
    ) STORED,
    tax_group_id             uuid,
    withholding_tax_group_id uuid,
    to_tax_jurisdiction_id   uuid,
    from_tax_jurisdiction_id uuid,
    site_id                  uuid,
    warehouse_id             uuid,
    storage_location_code    text,
    ship_to_address_id       uuid,
    bill_to_address_id       uuid,
    bill_from_address_id     uuid,
    ship_from_address_id     uuid,
    remit_to_address_id      uuid,
    matched_quantity         numeric(18,4) NOT NULL DEFAULT 0,
    match_status             document.invoice_match_status_d NOT NULL DEFAULT 'unmatched',
    source_binding           jsonb       NOT NULL DEFAULT '{}'::jsonb,
    row_version              bigint      NOT NULL DEFAULT 1,
    metadata                 jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid        NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,
    CONSTRAINT purchase_invoice_line_pkey PRIMARY KEY (id),
    CONSTRAINT purchase_invoice_line_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT purchase_invoice_line_parent_no_uq UNIQUE (tenant_id, purchase_invoice_id, line_no),
    CONSTRAINT purchase_invoice_line_no_chk CHECK (line_no > 0),
    CONSTRAINT purchase_invoice_line_description_chk CHECK (btrim(item_description) <> ''),
    CONSTRAINT purchase_invoice_line_source_chk CHECK (
        (source_entity_type IS NULL AND source_entity_id IS NULL AND source_line_id IS NULL)
        OR (source_entity_type ~ '^[a-z][a-z0-9_.-]{1,126}$' AND source_entity_id IS NOT NULL)
    ),
    CONSTRAINT purchase_invoice_line_quantity_chk CHECK (quantity > 0),
    CONSTRAINT purchase_invoice_line_price_chk CHECK (unit_price >= 0 AND price_unit > 0),
    CONSTRAINT purchase_invoice_line_amount_chk CHECK (
        tax_amount >= 0 AND withholding_tax_amount >= 0 AND withholding_tax_amount <= net_amount + tax_amount
    ),
    CONSTRAINT purchase_invoice_line_match_chk CHECK (matched_quantity BETWEEN 0 AND quantity),
    CONSTRAINT purchase_invoice_line_warehouse_site_chk CHECK (warehouse_id IS NULL OR site_id IS NOT NULL),
    CONSTRAINT purchase_invoice_line_row_version_chk CHECK (row_version >= 1),
    CONSTRAINT purchase_invoice_line_json_chk CHECK (
        jsonb_typeof(classification_decision) = 'object'
        AND jsonb_typeof(source_binding) = 'object'
        AND jsonb_typeof(metadata) = 'object'
    ),
    CONSTRAINT purchase_invoice_line_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.invoice_match_case (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    company_code_id         uuid        NOT NULL,
    purchase_invoice_id     uuid        NOT NULL,
    commitment_id           uuid,
    match_type              document.invoice_match_type_d NOT NULL DEFAULT 'three_way',
    match_result            document.invoice_match_result_d NOT NULL DEFAULT 'pending',
    total_quantity_variance numeric(18,4) NOT NULL DEFAULT 0,
    total_price_variance    numeric(18,4) NOT NULL DEFAULT 0,
    total_amount_variance   numeric(18,4) NOT NULL DEFAULT 0,
    exception_count         smallint    NOT NULL DEFAULT 0,
    has_exceptions          boolean GENERATED ALWAYS AS (exception_count > 0) STORED,
    matched_at              timestamptz,
    matched_by              uuid,
    metadata                jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                  document.invoice_match_case_status_d NOT NULL DEFAULT 'pending',
    status_changed_at       timestamptz,
    status_changed_by       uuid,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,
    CONSTRAINT invoice_match_case_pkey PRIMARY KEY (id),
    CONSTRAINT invoice_match_case_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT invoice_match_case_invoice_uq UNIQUE (tenant_id, purchase_invoice_id),
    CONSTRAINT invoice_match_case_exception_chk CHECK (exception_count >= 0),
    CONSTRAINT invoice_match_case_match_pair_chk CHECK ((matched_at IS NULL) = (matched_by IS NULL)),
    CONSTRAINT invoice_match_case_result_chk CHECK (
        match_result IN ('pending','exception','rejected') OR matched_at IS NOT NULL
    ),
    CONSTRAINT invoice_match_case_json_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT invoice_match_case_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT invoice_match_case_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.accounting_distribution (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid        NOT NULL,
    source_entity_type    text        NOT NULL,
    source_entity_id      uuid        NOT NULL,
    source_line_id        uuid        NOT NULL,
    distribution_no       smallint    NOT NULL,
    distribution_basis    document.distribution_basis_d NOT NULL DEFAULT 'percent',
    split_percent         numeric(7,4),
    split_amount          numeric(18,4),
    split_quantity        numeric(18,4),
    distributed_amount    numeric(18,4) NOT NULL,
    currency_code         character(3) NOT NULL,
    amount_status         document.distribution_amount_status_d NOT NULL DEFAULT 'provisional',
    calculation_hash      text,
    account_source        document.account_resolution_source_d NOT NULL DEFAULT 'pending',
    gl_account_id         uuid,
    cost_center_id        uuid,
    profit_center_id      uuid,
    project_id            uuid,
    dimension_set_id      uuid,
    asset_id              uuid,
    budget_allocation_id  uuid,
    budget_check_result   document.budget_check_result_d,
    policy_snapshot       jsonb       NOT NULL DEFAULT '{}'::jsonb,
    description           text,
    metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,
    CONSTRAINT accounting_distribution_pkey PRIMARY KEY (id),
    CONSTRAINT accounting_distribution_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT accounting_distribution_source_no_uq UNIQUE (
        tenant_id, source_entity_type, source_entity_id, source_line_id, distribution_no
    ),
    CONSTRAINT accounting_distribution_source_chk CHECK (
        source_entity_type ~ '^[a-z][a-z0-9_.-]{1,126}$'
    ),
    CONSTRAINT accounting_distribution_no_chk CHECK (distribution_no > 0),
    CONSTRAINT accounting_distribution_basis_chk CHECK (
        (distribution_basis = 'percent' AND split_percent > 0 AND split_amount IS NULL AND split_quantity IS NULL)
        OR (distribution_basis = 'amount' AND split_amount > 0 AND split_percent IS NULL AND split_quantity IS NULL)
        OR (distribution_basis = 'quantity' AND split_quantity > 0 AND split_percent IS NULL AND split_amount IS NULL)
    ),
    CONSTRAINT accounting_distribution_percent_chk CHECK (split_percent IS NULL OR split_percent <= 100),
    CONSTRAINT accounting_distribution_amount_chk CHECK (distributed_amount >= 0),
    CONSTRAINT accounting_distribution_hash_chk CHECK (
        calculation_hash IS NULL OR calculation_hash ~ '^[a-f0-9]{64}$'
    ),
    CONSTRAINT accounting_distribution_json_chk CHECK (
        jsonb_typeof(policy_snapshot) = 'object' AND jsonb_typeof(metadata) = 'object'
    ),
    CONSTRAINT accounting_distribution_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.payment_term_application (
    id                         uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                  uuid        NOT NULL,
    purchase_invoice_id        uuid        NOT NULL,
    purchase_invoice_line_id   uuid,
    commitment_id              uuid,
    payment_term_id            uuid,
    payment_term_clause_id     uuid,
    application_type           document.term_application_type_d NOT NULL,
    application_status         document.term_application_status_d NOT NULL DEFAULT 'applied',
    evaluation_sequence_no     smallint    NOT NULL,
    term_snapshot              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    clause_snapshot            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    calculated_basis_amount    numeric(18,4) NOT NULL,
    default_percent            numeric(7,4),
    applied_percent            numeric(7,4),
    default_amount             numeric(18,4) NOT NULL,
    applied_amount             numeric(18,4) NOT NULL,
    running_total_amount       numeric(18,4) NOT NULL DEFAULT 0,
    remaining_balance_amount   numeric(18,4) NOT NULL DEFAULT 0,
    base_event_date            date,
    days_applied               smallint,
    resolved_due_date          date,
    override_reason            text,
    override_requested_by      uuid,
    override_requested_at      timestamptz,
    override_decision          document.override_decision_d,
    override_decided_by        uuid,
    override_decided_at        timestamptz,
    reverses_application_id    uuid,
    supersedes_application_id  uuid,
    metadata                   jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    created_by                 uuid        NOT NULL,
    updated_at                 timestamptz,
    updated_by                 uuid,
    CONSTRAINT payment_term_application_pkey PRIMARY KEY (id),
    CONSTRAINT payment_term_application_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT payment_term_application_coordinate_uq UNIQUE NULLS NOT DISTINCT (
        tenant_id, purchase_invoice_id, purchase_invoice_line_id,
        payment_term_clause_id, application_type, evaluation_sequence_no
    ),
    CONSTRAINT payment_term_application_sequence_chk CHECK (evaluation_sequence_no > 0),
    CONSTRAINT payment_term_application_amount_chk CHECK (
        calculated_basis_amount >= 0 AND default_amount >= 0 AND applied_amount >= 0
        AND running_total_amount >= 0 AND remaining_balance_amount >= 0
    ),
    CONSTRAINT payment_term_application_percent_chk CHECK (
        (default_percent IS NULL OR default_percent BETWEEN 0 AND 100)
        AND (applied_percent IS NULL OR applied_percent BETWEEN 0 AND 100)
    ),
    CONSTRAINT payment_term_application_due_chk CHECK (
        application_type <> 'due_date'
        OR (base_event_date IS NOT NULL AND resolved_due_date IS NOT NULL)
    ),
    CONSTRAINT payment_term_application_override_request_chk CHECK (
        (override_requested_by IS NULL) = (override_requested_at IS NULL)
    ),
    CONSTRAINT payment_term_application_override_decision_chk CHECK (
        (override_decision IS NULL AND override_decided_by IS NULL AND override_decided_at IS NULL)
        OR (override_decision IS NOT NULL AND override_decided_by IS NOT NULL AND override_decided_at IS NOT NULL)
    ),
    CONSTRAINT payment_term_application_reason_chk CHECK (
        override_requested_at IS NULL OR (override_reason IS NOT NULL AND btrim(override_reason) <> '')
    ),
    CONSTRAINT payment_term_application_self_chk CHECK (
        reverses_application_id IS DISTINCT FROM id AND supersedes_application_id IS DISTINCT FROM id
    ),
    CONSTRAINT payment_term_application_reversal_chk CHECK (
        application_status <> 'reversed' OR reverses_application_id IS NOT NULL
    ),
    CONSTRAINT payment_term_application_json_chk CHECK (
        jsonb_typeof(term_snapshot) = 'object'
        AND jsonb_typeof(clause_snapshot) = 'object'
        AND jsonb_typeof(metadata) = 'object'
    ),
    CONSTRAINT payment_term_application_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.payment_entry (
    id                       uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid        NOT NULL,
    company_code_id          uuid        NOT NULL,
    payment_number           text        NOT NULL,
    payment_type             document.payment_type_d NOT NULL DEFAULT 'standard',
    payment_direction        document.payment_direction_d NOT NULL DEFAULT 'outbound',
    supplier_id              uuid,
    supplier_name_snapshot   text        NOT NULL,
    payment_method_code      text        NOT NULL,
    bank_account_id          uuid,
    payment_reference        text,
    bank_reference           text,
    document_date            date        NOT NULL DEFAULT CURRENT_DATE,
    posting_date             date        NOT NULL DEFAULT CURRENT_DATE,
    value_date               date        NOT NULL DEFAULT CURRENT_DATE,
    currency_code            character(3) NOT NULL,
    base_currency_code       character(3) NOT NULL,
    exchange_rate            numeric(18,10),
    fx_rate_snapshot         jsonb       NOT NULL DEFAULT '{}'::jsonb,
    payment_amount           numeric(18,4) NOT NULL,
    base_amount              numeric(18,4) NOT NULL,
    bank_currency_code       character(3),
    bank_exchange_rate       numeric(18,10),
    bank_currency_amount     numeric(18,4),
    fiscal_period_id         uuid        NOT NULL,
    journal_entry_id         uuid,
    reversal_of_payment_id   uuid,
    reversal_reason          text,
    workflow_request_id      uuid,
    approved_at              timestamptz,
    approved_by              uuid,
    posted_at                timestamptz,
    posted_by                uuid,
    cleared_at               timestamptz,
    row_version              bigint      NOT NULL DEFAULT 1,
    metadata                 jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                   document.payment_status_d NOT NULL DEFAULT 'draft',
    status_changed_at        timestamptz,
    status_changed_by        uuid,
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid        NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,
    CONSTRAINT payment_entry_pkey PRIMARY KEY (id),
    CONSTRAINT payment_entry_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT payment_entry_number_uq UNIQUE (tenant_id, company_code_id, payment_number),
    CONSTRAINT payment_entry_number_chk CHECK (btrim(payment_number) <> ''),
    CONSTRAINT payment_entry_supplier_chk CHECK (
        payment_direction <> 'outbound' OR supplier_id IS NOT NULL
    ),
    CONSTRAINT payment_entry_method_chk CHECK (payment_method_code ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT payment_entry_date_chk CHECK (value_date >= document_date),
    CONSTRAINT payment_entry_amount_chk CHECK (payment_amount > 0 AND base_amount > 0),
    CONSTRAINT payment_entry_currency_chk CHECK (
        (currency_code = base_currency_code AND COALESCE(exchange_rate, 1) = 1)
        OR (currency_code <> base_currency_code AND exchange_rate > 0)
    ),
    CONSTRAINT payment_entry_bank_currency_chk CHECK (
        (bank_currency_code IS NULL AND bank_exchange_rate IS NULL AND bank_currency_amount IS NULL)
        OR (
            bank_currency_code IS NOT NULL AND bank_exchange_rate > 0
            AND bank_currency_amount > 0
        )
    ),
    CONSTRAINT payment_entry_reversal_chk CHECK (
        (reversal_of_payment_id IS NULL AND reversal_reason IS NULL)
        OR (reversal_of_payment_id IS NOT NULL AND reversal_reason IS NOT NULL AND btrim(reversal_reason) <> '')
    ),
    CONSTRAINT payment_entry_no_self_reversal_chk CHECK (reversal_of_payment_id IS DISTINCT FROM id),
    CONSTRAINT payment_entry_approval_pair_chk CHECK ((approved_at IS NULL) = (approved_by IS NULL)),
    CONSTRAINT payment_entry_posting_pair_chk CHECK ((posted_at IS NULL) = (posted_by IS NULL)),
    CONSTRAINT payment_entry_state_chk CHECK (
        (status NOT IN ('approved','posted','transmitted','cleared') OR approved_at IS NOT NULL)
        AND (status NOT IN ('posted','transmitted','cleared') OR posted_at IS NOT NULL)
        AND (status <> 'cleared' OR cleared_at IS NOT NULL)
    ),
    CONSTRAINT payment_entry_row_version_chk CHECK (row_version >= 1),
    CONSTRAINT payment_entry_json_chk CHECK (
        jsonb_typeof(fx_rate_snapshot) = 'object' AND jsonb_typeof(metadata) = 'object'
    ),
    CONSTRAINT payment_entry_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT payment_entry_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.payment_entry_allocation (
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,
    payment_entry_id            uuid        NOT NULL,
    line_no                     smallint    NOT NULL,
    allocation_kind             document.payment_allocation_kind_d NOT NULL DEFAULT 'allocation',
    purchase_invoice_id         uuid,
    commitment_id               uuid,
    payment_term_application_id uuid,
    currency_code               character(3) NOT NULL,
    allocated_amount            numeric(18,4) NOT NULL,
    discount_amount             numeric(18,4) NOT NULL DEFAULT 0,
    withholding_tax_amount      numeric(18,4) NOT NULL DEFAULT 0,
    advance_recovery_amount     numeric(18,4) NOT NULL DEFAULT 0,
    retention_amount            numeric(18,4) NOT NULL DEFAULT 0,
    net_payment_amount          numeric(18,4) GENERATED ALWAYS AS (
        allocated_amount - discount_amount - withholding_tax_amount
        - advance_recovery_amount - retention_amount
    ) STORED,
    base_currency_code          character(3) NOT NULL,
    exchange_rate               numeric(18,10) NOT NULL,
    base_amount                 numeric(18,4) NOT NULL,
    fx_gain_loss                numeric(18,4) NOT NULL DEFAULT 0,
    reverses_allocation_id      uuid,
    idempotency_key             text        NOT NULL,
    notes                       text,
    metadata                    jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,
    CONSTRAINT payment_entry_allocation_pkey PRIMARY KEY (id),
    CONSTRAINT payment_entry_allocation_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT payment_entry_allocation_line_uq UNIQUE (tenant_id, payment_entry_id, line_no),
    CONSTRAINT payment_entry_allocation_idempotency_uq UNIQUE (tenant_id, idempotency_key),
    CONSTRAINT payment_entry_allocation_line_chk CHECK (line_no > 0),
    CONSTRAINT payment_entry_allocation_target_chk CHECK (
        num_nonnulls(purchase_invoice_id, commitment_id) = 1
    ),
    CONSTRAINT payment_entry_allocation_amount_chk CHECK (
        allocated_amount > 0 AND discount_amount >= 0 AND withholding_tax_amount >= 0
        AND advance_recovery_amount >= 0 AND retention_amount >= 0
        AND discount_amount + withholding_tax_amount + advance_recovery_amount + retention_amount <= allocated_amount
        AND base_amount > 0 AND exchange_rate > 0
    ),
    CONSTRAINT payment_entry_allocation_reversal_chk CHECK (
        (allocation_kind = 'allocation' AND reverses_allocation_id IS NULL)
        OR (allocation_kind = 'reversal' AND reverses_allocation_id IS NOT NULL)
    ),
    CONSTRAINT payment_entry_allocation_no_self_reversal_chk CHECK (reverses_allocation_id IS DISTINCT FROM id),
    CONSTRAINT payment_entry_allocation_key_chk CHECK (btrim(idempotency_key) <> ''),
    CONSTRAINT payment_entry_allocation_json_chk CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE document.journal_entry (
    id                         uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                  uuid        NOT NULL,
    company_code_id            uuid        NOT NULL,
    ledger_book_id             uuid        NOT NULL,
    fiscal_period_id           uuid        NOT NULL,
    journal_number             text        NOT NULL,
    document_date              date        NOT NULL,
    posting_date               date        NOT NULL,
    source_entity_type         text        NOT NULL,
    source_entity_id           uuid,
    transaction_currency_code  character(3) NOT NULL,
    base_currency_code         character(3) NOT NULL,
    total_debit                numeric(18,4) NOT NULL DEFAULT 0,
    total_credit               numeric(18,4) NOT NULL DEFAULT 0,
    line_count                 smallint    NOT NULL DEFAULT 0,
    description                text,
    reversal_of_journal_id     uuid,
    derived_from_journal_id    uuid,
    original_fiscal_period_id  uuid,
    prior_period_reason        text,
    accounting_profile_policy_id uuid,
    idempotency_key            text        NOT NULL,
    posted_at                  timestamptz,
    posted_by                  uuid,
    metadata                   jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                     document.journal_status_d NOT NULL DEFAULT 'draft',
    status_changed_at          timestamptz,
    status_changed_by          uuid,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    created_by                 uuid        NOT NULL,
    updated_at                 timestamptz,
    updated_by                 uuid,
    CONSTRAINT journal_entry_pkey PRIMARY KEY (id),
    CONSTRAINT journal_entry_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT journal_entry_number_uq UNIQUE (tenant_id, company_code_id, ledger_book_id, journal_number),
    CONSTRAINT journal_entry_idempotency_uq UNIQUE (tenant_id, ledger_book_id, idempotency_key),
    CONSTRAINT journal_entry_number_chk CHECK (btrim(journal_number) <> ''),
    CONSTRAINT journal_entry_source_chk CHECK (source_entity_type ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT journal_entry_date_chk CHECK (document_date <= posting_date),
    CONSTRAINT journal_entry_amount_chk CHECK (
        total_debit >= 0 AND total_credit >= 0
        AND (status <> 'posted' OR total_debit = total_credit)
    ),
    CONSTRAINT journal_entry_line_count_chk CHECK (line_count >= 0),
    CONSTRAINT journal_entry_self_chk CHECK (
        reversal_of_journal_id IS DISTINCT FROM id AND derived_from_journal_id IS DISTINCT FROM id
    ),
    CONSTRAINT journal_entry_prior_period_chk CHECK (
        (original_fiscal_period_id IS NULL AND prior_period_reason IS NULL)
        OR (original_fiscal_period_id IS NOT NULL AND prior_period_reason IS NOT NULL AND btrim(prior_period_reason) <> '')
    ),
    CONSTRAINT journal_entry_posting_pair_chk CHECK ((posted_at IS NULL) = (posted_by IS NULL)),
    CONSTRAINT journal_entry_posting_state_chk CHECK (status <> 'posted' OR posted_at IS NOT NULL),
    CONSTRAINT journal_entry_key_chk CHECK (btrim(idempotency_key) <> ''),
    CONSTRAINT journal_entry_json_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT journal_entry_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT journal_entry_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.journal_line (
    id                         uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                  uuid        NOT NULL,
    journal_entry_id           uuid        NOT NULL,
    line_no                    smallint    NOT NULL,
    gl_account_id              uuid        NOT NULL,
    transaction_currency_code  character(3) NOT NULL,
    transaction_debit          numeric(18,4) NOT NULL DEFAULT 0,
    transaction_credit         numeric(18,4) NOT NULL DEFAULT 0,
    base_currency_code         character(3) NOT NULL,
    base_debit                 numeric(18,4) NOT NULL DEFAULT 0,
    base_credit                numeric(18,4) NOT NULL DEFAULT 0,
    exchange_rate              numeric(18,10),
    fx_rate_snapshot           jsonb       NOT NULL DEFAULT '{}'::jsonb,
    cost_center_id             uuid,
    profit_center_id           uuid,
    project_id                 uuid,
    dimension_set_id           uuid,
    business_partner_id        uuid,
    subledger_type             text,
    subledger_id               uuid,
    posting_role_code          text,
    description                text,
    source_line_id             uuid,
    metadata                   jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    created_by                 uuid        NOT NULL,
    CONSTRAINT journal_line_pkey PRIMARY KEY (id),
    CONSTRAINT journal_line_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT journal_line_parent_no_uq UNIQUE (tenant_id, journal_entry_id, line_no),
    CONSTRAINT journal_line_no_chk CHECK (line_no > 0),
    CONSTRAINT journal_line_transaction_polarity_chk CHECK (
        (transaction_debit > 0 AND transaction_credit = 0)
        OR (transaction_debit = 0 AND transaction_credit > 0)
    ),
    CONSTRAINT journal_line_base_polarity_chk CHECK (
        (base_debit > 0 AND base_credit = 0)
        OR (base_debit = 0 AND base_credit > 0)
    ),
    CONSTRAINT journal_line_side_chk CHECK (
        (transaction_debit > 0 AND base_debit > 0)
        OR (transaction_credit > 0 AND base_credit > 0)
    ),
    CONSTRAINT journal_line_currency_chk CHECK (
        (transaction_currency_code = base_currency_code AND COALESCE(exchange_rate, 1) = 1)
        OR (transaction_currency_code <> base_currency_code AND exchange_rate > 0)
    ),
    CONSTRAINT journal_line_subledger_chk CHECK ((subledger_type IS NULL) = (subledger_id IS NULL)),
    CONSTRAINT journal_line_role_chk CHECK (
        posting_role_code IS NULL OR posting_role_code ~ '^[A-Z][A-Z0-9_.-]{1,126}$'
    ),
    CONSTRAINT journal_line_json_chk CHECK (
        jsonb_typeof(fx_rate_snapshot) = 'object' AND jsonb_typeof(metadata) = 'object'
    )
);

CREATE TABLE document.journal_line_reference (
    id                         uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                  uuid        NOT NULL,
    journal_line_id            uuid        NOT NULL,
    reference_kind             document.journal_reference_kind_d NOT NULL,
    source_entity_type         text        NOT NULL,
    source_entity_id           uuid        NOT NULL,
    source_line_id             uuid,
    source_document_number     text,
    accounting_distribution_id uuid,
    posting_role_code          text,
    policy_snapshot            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    allocated_amount           numeric(18,4) NOT NULL,
    currency_code              character(3) NOT NULL,
    base_amount                numeric(18,4),
    settlement_date            date,
    description                text,
    metadata                   jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    created_by                 uuid        NOT NULL,
    CONSTRAINT journal_line_reference_pkey PRIMARY KEY (id),
    CONSTRAINT journal_line_reference_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT journal_line_reference_identity_uq UNIQUE NULLS NOT DISTINCT (
        tenant_id, journal_line_id, reference_kind,
        source_entity_type, source_entity_id, source_line_id,
        accounting_distribution_id
    ),
    CONSTRAINT journal_line_reference_source_chk CHECK (
        source_entity_type ~ '^[a-z][a-z0-9_.-]{1,126}$'
    ),
    CONSTRAINT journal_line_reference_amount_chk CHECK (
        allocated_amount > 0 AND (base_amount IS NULL OR base_amount > 0)
    ),
    CONSTRAINT journal_line_reference_role_chk CHECK (
        posting_role_code IS NULL OR posting_role_code ~ '^[A-Z][A-Z0-9_.-]{1,126}$'
    ),
    CONSTRAINT journal_line_reference_json_chk CHECK (
        jsonb_typeof(policy_snapshot) = 'object' AND jsonb_typeof(metadata) = 'object'
    )
);

COMMENT ON TABLE document.workflow_request IS
  'Tenant workflow execution envelope pinned to a compiled definition snapshot. Meta Entity publication identifiers remain data, not FKs, until the runtime-meta wave.';
COMMENT ON TABLE document.commitment IS
  'Governed commercial commitment header. Fulfillment, invoicing and payment amounts are derived from evidence rather than mutable header counters.';
COMMENT ON TABLE document.commitment_release_allocation IS
  'Append-only release/reversal evidence connecting framework or blanket commitment lines to release lines.';
COMMENT ON TABLE document.purchase_invoice IS
  'AP invoice operational document. Generic entity snapshots replace local version chains; settlement state is derived from payment allocations.';
COMMENT ON TABLE document.accounting_distribution IS
  'Pre-posting account-assignment split proof. Posted accounting evidence is document.journal_line and journal_line_reference.';
COMMENT ON TABLE document.payment_term_application IS
  'Invoice payment-term evaluation evidence, including controlled override and reversal/supersession links.';
COMMENT ON TABLE document.payment_entry_allocation IS
  'Append-only payment allocation/reversal evidence. Exactly one invoice or commitment is targeted.';
COMMENT ON TABLE document.journal_entry IS
  'Journal header. Posted rows are immutable and balance projections are derived exclusively from posted journal lines.';
COMMENT ON TABLE document.journal_line IS
  'Immutable-after-posting debit/credit lines. Company, book and period derive from the journal header to avoid inconsistent duplication.';
COMMENT ON TABLE document.journal_line_reference IS
  'Append-only trace from journal lines to source, settlement, matching, tax, budget or capitalization evidence.';
-- document.invoice_tax_snapshot is deliberately retired. ledger.tax_calculation
-- is the immutable tax evidence and snapshot.entity_snapshot provides version history.
