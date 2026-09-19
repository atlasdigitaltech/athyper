-- Unified attachment, collaboration, content, and conversation foundation.
-- entity_type/entity_id remain API coordinates until the metadata entity
-- registry and control.owner_type catalog have complete one-to-one coverage.


COMMENT ON TABLE document.attachment IS
  'Tenant-scoped object-storage attachment metadata shared by all planes. Processing fields remain operational compatibility fields until a protected processing satellite is introduced.';


COMMENT ON TABLE document.attachment_link IS
  'Canonical polymorphic entity-to-attachment relation. Replaces the misleading master.entity_document_link name.';


CREATE UNIQUE INDEX content_item_root_slug_uq
    ON document.content_item (tenant_id, locale_code, slug)
    WHERE parent_id IS NULL;
CREATE UNIQUE INDEX content_item_child_slug_uq
    ON document.content_item (tenant_id, parent_id, locale_code, slug)
    WHERE parent_id IS NOT NULL;


CREATE TABLE document.conversation (
    id                uuid                           NOT NULL DEFAULT shared.uuidv7(),
    tenant_id         uuid                           NOT NULL,
    type              text                           NOT NULL DEFAULT 'dm',
    title             text,
    entity_type       text,
    entity_id         uuid,
    metadata          jsonb                          NOT NULL DEFAULT '{}'::jsonb,
    status            document.conversation_status_d NOT NULL DEFAULT 'active',
    status_changed_at timestamptz,
    status_changed_by uuid,
    deleted_at        timestamptz,
    deleted_by        uuid,
    created_at        timestamptz                    NOT NULL DEFAULT now(),
    created_by        uuid                           NOT NULL,
    updated_at        timestamptz,
    updated_by        uuid,

    CONSTRAINT conversation_pkey PRIMARY KEY (id),
    CONSTRAINT conversation_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT conversation_type_chk CHECK (type ~ '^[a-z][a-z0-9_]{1,62}$'),
    CONSTRAINT conversation_title_chk
        CHECK (title IS NULL OR (btrim(title) <> '' AND length(title) <= 512)),
    CONSTRAINT conversation_owner_pair_chk
        CHECK ((entity_type IS NULL) = (entity_id IS NULL)),
    CONSTRAINT conversation_entity_type_chk
        CHECK (
            entity_type IS NULL
            OR entity_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)?$'
        ),
    CONSTRAINT conversation_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT conversation_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT conversation_delete_pair_chk
        CHECK ((deleted_at IS NULL) = (deleted_by IS NULL)),
    CONSTRAINT conversation_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.conversation_participant (
    id                   uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id            uuid        NOT NULL,
    conversation_id      uuid        NOT NULL,
    principal_id         uuid        NOT NULL,
    role                 text        NOT NULL DEFAULT 'member',
    last_read_message_id uuid,
    last_read_at         timestamptz,
    joined_at            timestamptz NOT NULL DEFAULT now(),
    left_at              timestamptz,
    left_by              uuid,
    leave_reason         text,
    created_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid        NOT NULL,
    updated_at           timestamptz,
    updated_by           uuid,

    CONSTRAINT conversation_participant_pkey PRIMARY KEY (id),
    CONSTRAINT conversation_participant_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT conversation_participant_member_uq
        UNIQUE (tenant_id, conversation_id, principal_id),
    CONSTRAINT conversation_participant_role_chk
        CHECK (role IN ('owner', 'admin', 'member', 'observer')),
    CONSTRAINT conversation_participant_leave_pair_chk
        CHECK ((left_at IS NULL) = (left_by IS NULL)),
    CONSTRAINT conversation_participant_leave_reason_chk
        CHECK (leave_reason IS NULL OR (left_at IS NOT NULL AND btrim(leave_reason) <> '')),
    CONSTRAINT conversation_participant_dates_chk
        CHECK (left_at IS NULL OR left_at >= joined_at),
    CONSTRAINT conversation_participant_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.multipart_upload (
    id             uuid                               NOT NULL DEFAULT shared.uuidv7(),
    tenant_id      uuid                               NOT NULL,
    upload_id      text                               NOT NULL,
    storage_bucket text                               NOT NULL,
    storage_key    text                               NOT NULL,
    file_name      text                               NOT NULL,
    content_type   text,
    size_bytes     bigint,
    part_etags     jsonb                              NOT NULL DEFAULT '[]'::jsonb,
    status         document.multipart_upload_status_d NOT NULL DEFAULT 'initiated',
    expires_at     timestamptz                        NOT NULL,
    completed_at   timestamptz,
    aborted_at     timestamptz,
    attachment_id  uuid,
    initiated_by            uuid                               NOT NULL,
    attachment_series_id    uuid,
    parent_attachment_id    uuid,
    quarantine_key          text,
    expected_file_name      text,
    expected_content_type   text,
    expected_size_bytes     bigint,
    expected_sha256         text,
    version                 integer,
    created_at              timestamptz                        NOT NULL DEFAULT now(),
    created_by              uuid                               NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT multipart_upload_pkey PRIMARY KEY (id),
    CONSTRAINT multipart_upload_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT multipart_upload_upload_id_uq UNIQUE (tenant_id, upload_id),
    CONSTRAINT multipart_upload_id_chk CHECK (btrim(upload_id) <> ''),
    CONSTRAINT multipart_upload_storage_chk
        CHECK (btrim(storage_bucket) <> '' AND btrim(storage_key) <> ''),
    CONSTRAINT multipart_upload_file_name_chk
        CHECK (btrim(file_name) <> '' AND length(file_name) <= 1024),
    CONSTRAINT multipart_upload_size_chk CHECK (size_bytes IS NULL OR size_bytes >= 0),
    CONSTRAINT multipart_upload_parts_chk CHECK (jsonb_typeof(part_etags) = 'array'),
    CONSTRAINT multipart_upload_completion_chk
        CHECK (
            (status = 'completed' AND completed_at IS NOT NULL AND attachment_id IS NOT NULL)
            OR (status <> 'completed' AND completed_at IS NULL)
        ),
    CONSTRAINT multipart_upload_abort_chk
        CHECK (
            (status IN ('aborted', 'expired') AND aborted_at IS NOT NULL)
            OR (status NOT IN ('aborted', 'expired') AND aborted_at IS NULL)
        ),
    CONSTRAINT multipart_upload_expected_size_chk
        CHECK (expected_size_bytes IS NULL OR expected_size_bytes >= 0),
    CONSTRAINT multipart_upload_expected_sha256_chk
        CHECK (expected_sha256 IS NULL OR expected_sha256 ~ '^[a-f0-9]{64}$'),
    CONSTRAINT multipart_upload_version_chk CHECK (version IS NULL OR version >= 1),
    CONSTRAINT multipart_upload_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

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
    address_snapshot         jsonb       NOT NULL DEFAULT '{}'::jsonb,
    address_snapshot_hash    char(64),
    address_snapshot_captured_at timestamptz,
    address_snapshot_captured_by uuid,
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
    CONSTRAINT commitment_line_address_snapshot_json_chk CHECK (jsonb_typeof(address_snapshot) = 'object'),
    CONSTRAINT commitment_line_address_snapshot_hash_chk CHECK (address_snapshot_hash IS NULL OR address_snapshot_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT commitment_line_address_snapshot_capture_pair_chk CHECK ((address_snapshot_captured_at IS NULL) = (address_snapshot_captured_by IS NULL)),
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
    address_snapshot         jsonb       NOT NULL DEFAULT '{}'::jsonb,
    address_snapshot_hash    char(64),
    address_snapshot_captured_at timestamptz,
    address_snapshot_captured_by uuid,
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
    CONSTRAINT purchase_invoice_line_address_snapshot_json_chk CHECK (jsonb_typeof(address_snapshot) = 'object'),
    CONSTRAINT purchase_invoice_line_address_snapshot_hash_chk CHECK (address_snapshot_hash IS NULL OR address_snapshot_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT purchase_invoice_line_address_snapshot_capture_pair_chk CHECK ((address_snapshot_captured_at IS NULL) = (address_snapshot_captured_by IS NULL)),
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

-- Authoring documents, supplier evidence, and fulfillment documents.
-- Version history belongs to snapshot.entity_snapshot, not local version chains.

CREATE TABLE document.purchase_requisition (
    id                           uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                    uuid        NOT NULL,
    company_code_id              uuid        NOT NULL,
    code                         text        NOT NULL,
    name                         text        NOT NULL,
    description                  text,
    requisition_type             document.requisition_type_d NOT NULL DEFAULT 'standard',
    priority                     document.requisition_priority_d NOT NULL DEFAULT 'normal',
    requested_by                 uuid        NOT NULL,
    responsible_principal_id     uuid,
    document_date                date        NOT NULL DEFAULT CURRENT_DATE,
    required_by_date             date,
    currency_code                character(3) NOT NULL,
    base_currency_code           character(3) NOT NULL,
    exchange_rate                numeric(18,10),
    fx_rate_snapshot             jsonb       NOT NULL DEFAULT '{}'::jsonb,
    total_amount                 numeric(18,4) NOT NULL DEFAULT 0,
    budget_check_result          document.budget_check_result_d,
    fiscal_period_id             uuid,
    encumbrance_journal_entry_id uuid,
    workflow_request_id          uuid,
    approved_at                  timestamptz,
    approved_by                  uuid,
    row_version                  bigint      NOT NULL DEFAULT 1,
    tags                         jsonb       NOT NULL DEFAULT '[]'::jsonb,
    metadata                     jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                       document.requisition_status_d NOT NULL DEFAULT 'draft',
    status_changed_at            timestamptz,
    status_changed_by            uuid,
    created_at                   timestamptz NOT NULL DEFAULT now(),
    created_by                   uuid        NOT NULL,
    updated_at                   timestamptz,
    updated_by                   uuid,
    CONSTRAINT purchase_requisition_pkey PRIMARY KEY (id),
    CONSTRAINT purchase_requisition_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT purchase_requisition_code_uq UNIQUE (tenant_id, company_code_id, code),
    CONSTRAINT purchase_requisition_code_chk CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT purchase_requisition_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT purchase_requisition_dates_chk CHECK (required_by_date IS NULL OR required_by_date >= document_date),
    CONSTRAINT purchase_requisition_currency_chk CHECK (
        (currency_code = base_currency_code AND COALESCE(exchange_rate, 1) = 1)
        OR (currency_code <> base_currency_code AND exchange_rate > 0)
    ),
    CONSTRAINT purchase_requisition_amount_chk CHECK (total_amount >= 0),
    CONSTRAINT purchase_requisition_approval_pair_chk CHECK ((approved_at IS NULL) = (approved_by IS NULL)),
    CONSTRAINT purchase_requisition_approval_state_chk CHECK (
        status NOT IN ('approved','partially_converted','fully_converted','closed') OR approved_at IS NOT NULL
    ),
    CONSTRAINT purchase_requisition_row_version_chk CHECK (row_version >= 1),
    CONSTRAINT purchase_requisition_json_chk CHECK (
        jsonb_typeof(fx_rate_snapshot) = 'object' AND jsonb_typeof(tags) = 'array' AND jsonb_typeof(metadata) = 'object'
    ),
    CONSTRAINT purchase_requisition_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT purchase_requisition_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.purchase_requisition_line (
    id                       uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid        NOT NULL,
    company_code_id          uuid        NOT NULL,
    purchase_requisition_id  uuid        NOT NULL,
    line_no                  smallint    NOT NULL,
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
    gross_amount             numeric(18,4) GENERATED ALWAYS AS (quantity * unit_price / price_unit + tax_amount - withholding_tax_amount) STORED,
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
    suggested_supplier_id    uuid,
    ship_from_address_id     uuid,
    remit_to_address_id      uuid,
    over_delivery_tolerance  numeric(7,4) NOT NULL DEFAULT 0,
    under_delivery_tolerance numeric(7,4) NOT NULL DEFAULT 0,
    committed_quantity       numeric(18,4) NOT NULL DEFAULT 0,
    metadata                 jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                   document.requisition_line_status_d NOT NULL DEFAULT 'open',
    status_changed_at        timestamptz,
    status_changed_by        uuid,
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid        NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,
    CONSTRAINT purchase_requisition_line_pkey PRIMARY KEY (id),
    CONSTRAINT purchase_requisition_line_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT purchase_requisition_line_parent_no_uq UNIQUE (tenant_id, purchase_requisition_id, line_no),
    CONSTRAINT purchase_requisition_line_no_chk CHECK (line_no > 0),
    CONSTRAINT purchase_requisition_line_description_chk CHECK (btrim(item_description) <> ''),
    CONSTRAINT purchase_requisition_line_quantity_chk CHECK (quantity > 0 AND committed_quantity BETWEEN 0 AND quantity),
    CONSTRAINT purchase_requisition_line_price_chk CHECK (unit_price >= 0 AND price_unit > 0),
    CONSTRAINT purchase_requisition_line_tax_chk CHECK (tax_amount >= 0 AND withholding_tax_amount >= 0),
    CONSTRAINT purchase_requisition_line_tolerance_chk CHECK (
        over_delivery_tolerance BETWEEN 0 AND 100 AND under_delivery_tolerance BETWEEN 0 AND 100
    ),
    CONSTRAINT purchase_requisition_line_warehouse_chk CHECK (warehouse_id IS NULL OR site_id IS NOT NULL),
    CONSTRAINT purchase_requisition_line_json_chk CHECK (
        jsonb_typeof(classification_decision) = 'object' AND jsonb_typeof(metadata) = 'object'
    ),
    CONSTRAINT purchase_requisition_line_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT purchase_requisition_line_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.purchase_order_confirmation (
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,
    company_code_id             uuid        NOT NULL,
    code                        text        NOT NULL,
    name                        text        NOT NULL,
    commitment_id               uuid        NOT NULL,
    supplier_id                 uuid        NOT NULL,
    supplier_reference_number   text,
    supplier_confirmation_date  date,
    confirmation_type           document.confirmation_type_d NOT NULL DEFAULT 'FULL_CONFIRM',
    document_date               date        NOT NULL DEFAULT CURRENT_DATE,
    currency_code               character(3) NOT NULL,
    confirmed_total_amount      numeric(18,4) NOT NULL DEFAULT 0,
    amendment_commitment_id     uuid,
    notes                       text,
    source_summary              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    metadata                    jsonb       NOT NULL DEFAULT '{}'::jsonb,
    row_version                 bigint      NOT NULL DEFAULT 1,
    status                      document.confirmation_status_d NOT NULL DEFAULT 'received',
    status_changed_at           timestamptz,
    status_changed_by           uuid,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,
    CONSTRAINT purchase_order_confirmation_pkey PRIMARY KEY (id),
    CONSTRAINT purchase_order_confirmation_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT purchase_order_confirmation_code_uq UNIQUE (tenant_id, company_code_id, code),
    CONSTRAINT purchase_order_confirmation_code_chk CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT purchase_order_confirmation_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT purchase_order_confirmation_amount_chk CHECK (confirmed_total_amount >= 0),
    CONSTRAINT purchase_order_confirmation_amendment_chk CHECK (amendment_commitment_id IS DISTINCT FROM commitment_id),
    CONSTRAINT purchase_order_confirmation_row_version_chk CHECK (row_version >= 1),
    CONSTRAINT purchase_order_confirmation_json_chk CHECK (
        jsonb_typeof(source_summary) = 'object' AND jsonb_typeof(metadata) = 'object'
    ),
    CONSTRAINT purchase_order_confirmation_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT purchase_order_confirmation_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.purchase_order_confirmation_line (
    id                       uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid        NOT NULL,
    confirmation_id          uuid        NOT NULL,
    line_no                  smallint    NOT NULL,
    commitment_line_id       uuid        NOT NULL,
    procurement_type         document.procurement_type_d NOT NULL DEFAULT 'goods',
    line_type                document.commercial_line_type_d NOT NULL DEFAULT 'noncatalog',
    confirmed_quantity       numeric(18,4) NOT NULL,
    confirmed_unit_price     numeric(18,4) NOT NULL,
    confirmed_delivery_date  date,
    quantity_variance        numeric(18,4) NOT NULL DEFAULT 0,
    price_variance           numeric(18,4) NOT NULL DEFAULT 0,
    line_status              document.confirmation_line_status_d NOT NULL DEFAULT 'confirmed',
    supplier_notes           text,
    metadata                 jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid        NOT NULL,
    CONSTRAINT purchase_order_confirmation_line_pkey PRIMARY KEY (id),
    CONSTRAINT purchase_order_confirmation_line_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT purchase_order_confirmation_line_parent_no_uq UNIQUE (tenant_id, confirmation_id, line_no),
    CONSTRAINT purchase_order_confirmation_line_no_chk CHECK (line_no > 0),
    CONSTRAINT purchase_order_confirmation_line_quantity_chk CHECK (confirmed_quantity > 0),
    CONSTRAINT purchase_order_confirmation_line_price_chk CHECK (confirmed_unit_price >= 0),
    CONSTRAINT purchase_order_confirmation_line_json_chk CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE document.delivery_note (
    id                         uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                  uuid        NOT NULL,
    company_code_id            uuid        NOT NULL,
    code                       text        NOT NULL,
    name                       text        NOT NULL,
    commitment_id              uuid        NOT NULL,
    supplier_id                uuid        NOT NULL,
    supplier_delivery_note_no  text,
    supplier_dispatch_date     date,
    bill_of_lading_no          text,
    tracking_number            text,
    delivery_date              date        NOT NULL DEFAULT CURRENT_DATE,
    expected_arrival_date      date,
    actual_arrival_date        date,
    delivery_site_id           uuid        NOT NULL,
    delivery_warehouse_id      uuid,
    carrier_name               text,
    transport_mode             text,
    requires_inspection        boolean     NOT NULL DEFAULT false,
    inspection_status          document.inspection_status_d,
    is_fully_receipted         boolean     NOT NULL DEFAULT false,
    currency_code              character(3) NOT NULL,
    total_amount               numeric(18,4) NOT NULL DEFAULT 0,
    notes                      text,
    metadata                   jsonb       NOT NULL DEFAULT '{}'::jsonb,
    row_version                bigint      NOT NULL DEFAULT 1,
    status                     document.delivery_note_status_d NOT NULL DEFAULT 'draft',
    status_changed_at          timestamptz,
    status_changed_by          uuid,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    created_by                 uuid        NOT NULL,
    updated_at                 timestamptz,
    updated_by                 uuid,
    CONSTRAINT delivery_note_pkey PRIMARY KEY (id),
    CONSTRAINT delivery_note_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT delivery_note_code_uq UNIQUE (tenant_id, company_code_id, code),
    CONSTRAINT delivery_note_code_chk CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT delivery_note_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT delivery_note_dates_chk CHECK (
        (expected_arrival_date IS NULL OR expected_arrival_date >= supplier_dispatch_date)
        AND (actual_arrival_date IS NULL OR actual_arrival_date >= supplier_dispatch_date)
    ),
    CONSTRAINT delivery_note_inspection_chk CHECK (
        (requires_inspection AND inspection_status IS NOT NULL)
        OR (NOT requires_inspection AND inspection_status IS NULL)
    ),
    CONSTRAINT delivery_note_amount_chk CHECK (total_amount >= 0),
    CONSTRAINT delivery_note_row_version_chk CHECK (row_version >= 1),
    CONSTRAINT delivery_note_json_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT delivery_note_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT delivery_note_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.delivery_note_line (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid        NOT NULL,
    company_code_id       uuid        NOT NULL,
    delivery_note_id      uuid        NOT NULL,
    line_no               smallint    NOT NULL,
    commitment_line_id    uuid        NOT NULL,
    item_id               uuid,
    item_description      text        NOT NULL,
    procurement_type      document.procurement_type_d NOT NULL DEFAULT 'goods',
    line_type             document.commercial_line_type_d NOT NULL DEFAULT 'noncatalog',
    uom_code              text        NOT NULL,
    shipped_quantity      numeric(18,4) NOT NULL,
    received_quantity     numeric(18,4) NOT NULL DEFAULT 0,
    damaged_quantity      numeric(18,4) NOT NULL DEFAULT 0,
    rejected_quantity     numeric(18,4) NOT NULL DEFAULT 0,
    accepted_quantity     numeric(18,4) GENERATED ALWAYS AS (received_quantity - damaged_quantity - rejected_quantity) STORED,
    lot_number            text,
    serial_numbers        text[],
    batch_number          text,
    expiry_date           date,
    metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,
    CONSTRAINT delivery_note_line_pkey PRIMARY KEY (id),
    CONSTRAINT delivery_note_line_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT delivery_note_line_parent_no_uq UNIQUE (tenant_id, delivery_note_id, line_no),
    CONSTRAINT delivery_note_line_no_chk CHECK (line_no > 0),
    CONSTRAINT delivery_note_line_description_chk CHECK (btrim(item_description) <> ''),
    CONSTRAINT delivery_note_line_quantity_chk CHECK (
        shipped_quantity > 0 AND received_quantity BETWEEN 0 AND shipped_quantity
        AND damaged_quantity >= 0 AND rejected_quantity >= 0
        AND damaged_quantity + rejected_quantity <= received_quantity
    ),
    CONSTRAINT delivery_note_line_serials_chk CHECK (serial_numbers IS NULL OR array_position(serial_numbers, NULL) IS NULL),
    CONSTRAINT delivery_note_line_json_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT delivery_note_line_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.receipt (
    id                       uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid        NOT NULL,
    company_code_id          uuid        NOT NULL,
    code                     text        NOT NULL,
    name                     text        NOT NULL,
    requested_by             uuid        NOT NULL,
    commitment_id            uuid,
    delivery_note_id         uuid,
    supplier_id              uuid        NOT NULL,
    received_date            date        NOT NULL DEFAULT CURRENT_DATE,
    posting_date             date        NOT NULL DEFAULT CURRENT_DATE,
    receiving_site_id        uuid,
    receiving_warehouse_id   uuid,
    currency_code            character(3) NOT NULL,
    base_currency_code       character(3) NOT NULL,
    exchange_rate            numeric(18,10),
    fx_rate_snapshot         jsonb       NOT NULL DEFAULT '{}'::jsonb,
    total_amount             numeric(18,4) NOT NULL DEFAULT 0,
    fiscal_period_id         uuid        NOT NULL,
    accrual_journal_entry_id uuid,
    workflow_request_id      uuid,
    approved_at              timestamptz,
    approved_by              uuid,
    source_summary           jsonb       NOT NULL DEFAULT '{}'::jsonb,
    metadata                 jsonb       NOT NULL DEFAULT '{}'::jsonb,
    row_version              bigint      NOT NULL DEFAULT 1,
    status                   document.receipt_status_d NOT NULL DEFAULT 'draft',
    status_changed_at        timestamptz,
    status_changed_by        uuid,
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid        NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,
    CONSTRAINT receipt_pkey PRIMARY KEY (id),
    CONSTRAINT receipt_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT receipt_code_uq UNIQUE (tenant_id, company_code_id, code),
    CONSTRAINT receipt_code_chk CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT receipt_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT receipt_source_chk CHECK (commitment_id IS NOT NULL OR delivery_note_id IS NOT NULL),
    CONSTRAINT receipt_location_chk CHECK (receiving_warehouse_id IS NULL OR receiving_site_id IS NOT NULL),
    CONSTRAINT receipt_currency_chk CHECK (
        (currency_code = base_currency_code AND COALESCE(exchange_rate, 1) = 1)
        OR (currency_code <> base_currency_code AND exchange_rate > 0)
    ),
    CONSTRAINT receipt_amount_chk CHECK (total_amount >= 0),
    CONSTRAINT receipt_approval_pair_chk CHECK ((approved_at IS NULL) = (approved_by IS NULL)),
    CONSTRAINT receipt_approval_state_chk CHECK (status NOT IN ('approved','posted','reversed') OR approved_at IS NOT NULL),
    CONSTRAINT receipt_row_version_chk CHECK (row_version >= 1),
    CONSTRAINT receipt_json_chk CHECK (
        jsonb_typeof(fx_rate_snapshot) = 'object' AND jsonb_typeof(source_summary) = 'object' AND jsonb_typeof(metadata) = 'object'
    ),
    CONSTRAINT receipt_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT receipt_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.receipt_line (
    id                       uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid        NOT NULL,
    company_code_id          uuid        NOT NULL,
    receipt_id               uuid        NOT NULL,
    line_no                  smallint    NOT NULL,
    commitment_line_id       uuid        NOT NULL,
    delivery_note_line_id    uuid,
    source_schedule_id       uuid,
    source_line_version      bigint,
    item_id                  uuid        NOT NULL,
    item_description         text        NOT NULL,
    procurement_type         document.procurement_type_d NOT NULL DEFAULT 'goods',
    line_type                document.commercial_line_type_d NOT NULL DEFAULT 'noncatalog',
    uom_code                 text        NOT NULL,
    received_quantity        numeric(18,4) NOT NULL,
    accepted_quantity        numeric(18,4) NOT NULL,
    rejected_quantity        numeric(18,4) NOT NULL DEFAULT 0,
    unit_price               numeric(18,4) NOT NULL,
    price_unit               numeric(18,4) NOT NULL DEFAULT 1,
    currency_code            character(3) NOT NULL,
    net_amount               numeric(18,4) GENERATED ALWAYS AS (accepted_quantity * unit_price / price_unit) STORED,
    tax_amount               numeric(18,4) NOT NULL DEFAULT 0,
    withholding_tax_amount   numeric(18,4) NOT NULL DEFAULT 0,
    gross_amount             numeric(18,4) GENERATED ALWAYS AS (accepted_quantity * unit_price / price_unit + tax_amount - withholding_tax_amount) STORED,
    tax_group_id             uuid,
    withholding_tax_group_id uuid,
    to_tax_jurisdiction_id   uuid,
    from_tax_jurisdiction_id uuid,
    site_id                  uuid        NOT NULL,
    warehouse_id             uuid        NOT NULL,
    storage_location_code    text,
    ship_to_address_id       uuid,
    bill_to_address_id       uuid,
    bill_from_address_id     uuid,
    supplier_id              uuid,
    ship_from_address_id     uuid,
    remit_to_address_id      uuid,
    lot_number               text,
    serial_numbers           jsonb,
    batch_number             text,
    expiry_date              date,
    inventory_movement_id    uuid,
    asset_class_id           uuid,
    metadata                 jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid        NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,
    CONSTRAINT receipt_line_pkey PRIMARY KEY (id),
    CONSTRAINT receipt_line_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT receipt_line_parent_no_uq UNIQUE (tenant_id, receipt_id, line_no),
    CONSTRAINT receipt_line_no_chk CHECK (line_no > 0),
    CONSTRAINT receipt_line_description_chk CHECK (btrim(item_description) <> ''),
    CONSTRAINT receipt_line_quantity_chk CHECK (
        received_quantity > 0 AND accepted_quantity >= 0 AND rejected_quantity >= 0
        AND accepted_quantity + rejected_quantity = received_quantity
    ),
    CONSTRAINT receipt_line_price_chk CHECK (unit_price >= 0 AND price_unit > 0),
    CONSTRAINT receipt_line_tax_chk CHECK (tax_amount >= 0 AND withholding_tax_amount >= 0),
    CONSTRAINT receipt_line_source_version_chk CHECK (source_line_version IS NULL OR source_line_version >= 1),
    CONSTRAINT receipt_line_serials_chk CHECK (serial_numbers IS NULL OR jsonb_typeof(serial_numbers) = 'array'),
    CONSTRAINT receipt_line_json_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT receipt_line_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.service_sheet (
    id                       uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid        NOT NULL,
    company_code_id          uuid        NOT NULL,
    code                     text        NOT NULL,
    name                     text        NOT NULL,
    requested_by             uuid        NOT NULL,
    commitment_id            uuid        NOT NULL,
    supplier_id              uuid        NOT NULL,
    service_date             date        NOT NULL DEFAULT CURRENT_DATE,
    posting_date             date        NOT NULL DEFAULT CURRENT_DATE,
    service_period_from      date        NOT NULL,
    service_period_to        date        NOT NULL,
    currency_code            character(3) NOT NULL,
    base_currency_code       character(3) NOT NULL,
    exchange_rate            numeric(18,10),
    fx_rate_snapshot         jsonb       NOT NULL DEFAULT '{}'::jsonb,
    total_amount             numeric(18,4) NOT NULL DEFAULT 0,
    fiscal_period_id         uuid        NOT NULL,
    accrual_journal_entry_id uuid,
    accepted_by              uuid,
    accepted_at              timestamptz,
    workflow_request_id      uuid,
    approved_at              timestamptz,
    approved_by              uuid,
    metadata                 jsonb       NOT NULL DEFAULT '{}'::jsonb,
    row_version              bigint      NOT NULL DEFAULT 1,
    status                   document.service_sheet_status_d NOT NULL DEFAULT 'draft',
    status_changed_at        timestamptz,
    status_changed_by        uuid,
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid        NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,
    CONSTRAINT service_sheet_pkey PRIMARY KEY (id),
    CONSTRAINT service_sheet_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT service_sheet_code_uq UNIQUE (tenant_id, company_code_id, code),
    CONSTRAINT service_sheet_code_chk CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT service_sheet_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT service_sheet_period_chk CHECK (service_period_to >= service_period_from),
    CONSTRAINT service_sheet_currency_chk CHECK (
        (currency_code = base_currency_code AND COALESCE(exchange_rate, 1) = 1)
        OR (currency_code <> base_currency_code AND exchange_rate > 0)
    ),
    CONSTRAINT service_sheet_amount_chk CHECK (total_amount >= 0),
    CONSTRAINT service_sheet_acceptance_pair_chk CHECK ((accepted_at IS NULL) = (accepted_by IS NULL)),
    CONSTRAINT service_sheet_acceptance_state_chk CHECK (
        status NOT IN ('accepted','pending_approval','approved','posted','reversed') OR accepted_at IS NOT NULL
    ),
    CONSTRAINT service_sheet_approval_pair_chk CHECK ((approved_at IS NULL) = (approved_by IS NULL)),
    CONSTRAINT service_sheet_approval_state_chk CHECK (status NOT IN ('approved','posted','reversed') OR approved_at IS NOT NULL),
    CONSTRAINT service_sheet_row_version_chk CHECK (row_version >= 1),
    CONSTRAINT service_sheet_json_chk CHECK (jsonb_typeof(fx_rate_snapshot) = 'object' AND jsonb_typeof(metadata) = 'object'),
    CONSTRAINT service_sheet_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT service_sheet_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.service_sheet_line (
    id                       uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid        NOT NULL,
    company_code_id          uuid        NOT NULL,
    service_sheet_id         uuid        NOT NULL,
    line_no                  smallint    NOT NULL,
    commitment_line_id       uuid        NOT NULL,
    source_schedule_id       uuid,
    item_id                  uuid,
    item_description         text        NOT NULL,
    procurement_type         document.procurement_type_d NOT NULL DEFAULT 'services',
    line_type                document.commercial_line_type_d NOT NULL DEFAULT 'noncatalog',
    uom_code                 text        NOT NULL,
    quantity                 numeric(18,4) NOT NULL,
    unit_price               numeric(18,4) NOT NULL,
    price_unit               numeric(18,4) NOT NULL DEFAULT 1,
    currency_code            character(3) NOT NULL,
    net_amount               numeric(18,4) GENERATED ALWAYS AS (quantity * unit_price / price_unit) STORED,
    service_period_start     date,
    service_period_end       date,
    completion_pct           numeric(7,4),
    milestone_name           text,
    tax_group_id             uuid,
    tax_amount               numeric(18,4) NOT NULL DEFAULT 0,
    withholding_tax_group_id uuid,
    withholding_tax_amount   numeric(18,4) NOT NULL DEFAULT 0,
    to_tax_jurisdiction_id   uuid,
    from_tax_jurisdiction_id uuid,
    gross_amount             numeric(18,4) GENERATED ALWAYS AS (quantity * unit_price / price_unit + tax_amount - withholding_tax_amount) STORED,
    site_id                  uuid,
    warehouse_id             uuid,
    storage_location_code    text,
    ship_to_address_id       uuid,
    bill_to_address_id       uuid,
    bill_from_address_id     uuid,
    supplier_id              uuid,
    ship_from_address_id     uuid,
    remit_to_address_id      uuid,
    metadata                 jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid        NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,
    CONSTRAINT service_sheet_line_pkey PRIMARY KEY (id),
    CONSTRAINT service_sheet_line_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT service_sheet_line_parent_no_uq UNIQUE (tenant_id, service_sheet_id, line_no),
    CONSTRAINT service_sheet_line_no_chk CHECK (line_no > 0),
    CONSTRAINT service_sheet_line_description_chk CHECK (btrim(item_description) <> ''),
    CONSTRAINT service_sheet_line_quantity_chk CHECK (quantity > 0),
    CONSTRAINT service_sheet_line_price_chk CHECK (unit_price >= 0 AND price_unit > 0),
    CONSTRAINT service_sheet_line_period_chk CHECK (
        (service_period_start IS NULL) = (service_period_end IS NULL)
        AND (service_period_end IS NULL OR service_period_end >= service_period_start)
    ),
    CONSTRAINT service_sheet_line_completion_chk CHECK (completion_pct IS NULL OR completion_pct BETWEEN 0 AND 100),
    CONSTRAINT service_sheet_line_tax_chk CHECK (tax_amount >= 0 AND withholding_tax_amount >= 0),
    CONSTRAINT service_sheet_line_warehouse_chk CHECK (warehouse_id IS NULL OR site_id IS NOT NULL),
    CONSTRAINT service_sheet_line_json_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT service_sheet_line_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

-- Pricing components and delivery/billing schedules are operational children.
-- Their polymorphic source coordinates are validated by database triggers.

CREATE TABLE document.pricing_component (
    id                       uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid        NOT NULL,
    company_code_id          uuid        NOT NULL,
    source_doc_type          document.pricing_source_type_d NOT NULL,
    source_doc_id            uuid        NOT NULL,
    source_line_id           uuid,
    term_type                master.pricing_term_type_d NOT NULL,
    condition_type_id        uuid        NOT NULL,
    sequence                 integer     NOT NULL DEFAULT 100,
    basis                    master.pricing_basis_d NOT NULL,
    rate_value               numeric(20,10),
    amount_value             numeric(18,4),
    base_for_calculation     numeric(18,4),
    computed_amount          numeric(18,4) NOT NULL DEFAULT 0,
    computed_base_amount     numeric(18,4) NOT NULL DEFAULT 0,
    entry_level              document.pricing_entry_level_d NOT NULL,
    apportion_basis          master.pricing_apportion_basis_d,
    is_apportioned           boolean     NOT NULL DEFAULT false,
    is_apportioned_from_id   uuid,
    origin                   document.pricing_origin_d NOT NULL DEFAULT 'manual',
    ref_source_doc_type      text,
    ref_source_doc_id        uuid,
    ref_source_line_id       uuid,
    ref_value                numeric(18,4),
    tax_group_id             uuid,
    is_inclusive             boolean,
    recoverable_pct          numeric(7,4),
    tax_section_code         text,
    currency_code            character(3) NOT NULL,
    base_currency_code       character(3) NOT NULL,
    exchange_rate            numeric(20,10) NOT NULL DEFAULT 1,
    superseded_by_id         uuid,
    superseded_at            timestamptz,
    superseded_by_user       uuid,
    row_version              bigint      NOT NULL DEFAULT 1,
    tags                     jsonb       NOT NULL DEFAULT '[]'::jsonb,
    metadata                 jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid        NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,
    CONSTRAINT pricing_component_pkey PRIMARY KEY (id),
    CONSTRAINT pricing_component_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT pricing_component_sequence_chk CHECK (sequence > 0),
    CONSTRAINT pricing_component_scope_chk CHECK (
        (entry_level = 'header' AND source_line_id IS NULL)
        OR (entry_level = 'line' AND source_line_id IS NOT NULL)
    ),
    CONSTRAINT pricing_component_basis_value_chk CHECK (
        (basis IN ('percent','per_unit') AND rate_value IS NOT NULL AND amount_value IS NULL)
        OR (basis IN ('amount','flat') AND amount_value IS NOT NULL AND rate_value IS NULL)
    ),
    CONSTRAINT pricing_component_rate_chk CHECK (
        rate_value IS NULL OR (rate_value >= 0 AND (basis <> 'percent' OR rate_value <= 100))
    ),
    CONSTRAINT pricing_component_amount_chk CHECK (
        amount_value IS NULL OR amount_value >= 0
    ),
    CONSTRAINT pricing_component_calculation_chk CHECK (
        (base_for_calculation IS NULL OR base_for_calculation >= 0)
        AND computed_amount >= 0 AND computed_base_amount >= 0
    ),
    CONSTRAINT pricing_component_apportion_chk CHECK (
        (NOT is_apportioned AND is_apportioned_from_id IS NULL)
        OR (is_apportioned AND is_apportioned_from_id IS NOT NULL AND entry_level = 'line')
    ),
    CONSTRAINT pricing_component_reference_chk CHECK (
        (ref_source_doc_type IS NULL AND ref_source_doc_id IS NULL AND ref_source_line_id IS NULL AND ref_value IS NULL)
        OR (ref_source_doc_type IS NOT NULL AND ref_source_doc_id IS NOT NULL)
    ),
    CONSTRAINT pricing_component_tax_scope_chk CHECK (
        (term_type IN ('tax','withholding') AND tax_group_id IS NOT NULL)
        OR (term_type NOT IN ('tax','withholding') AND tax_group_id IS NULL
            AND is_inclusive IS NULL AND recoverable_pct IS NULL AND tax_section_code IS NULL)
    ),
    CONSTRAINT pricing_component_wht_chk CHECK (
        term_type <> 'withholding'
        OR (is_inclusive IS NOT TRUE AND COALESCE(recoverable_pct, 0) = 0
            AND metadata ? 'rate_schedule_id' AND metadata ? 'wht_basis' AND metadata ? 'resolved_rate')
    ),
    CONSTRAINT pricing_component_recoverable_chk CHECK (
        recoverable_pct IS NULL OR recoverable_pct BETWEEN 0 AND 100
    ),
    CONSTRAINT pricing_component_currency_chk CHECK (
        (currency_code = base_currency_code AND exchange_rate = 1)
        OR (currency_code <> base_currency_code AND exchange_rate > 0)
    ),
    CONSTRAINT pricing_component_supersede_pair_chk CHECK (
        (superseded_by_id IS NULL AND superseded_at IS NULL AND superseded_by_user IS NULL)
        OR (superseded_by_id IS NOT NULL AND superseded_at IS NOT NULL AND superseded_by_user IS NOT NULL)
    ),
    CONSTRAINT pricing_component_no_self_link_chk CHECK (
        is_apportioned_from_id IS DISTINCT FROM id AND superseded_by_id IS DISTINCT FROM id
    ),
    CONSTRAINT pricing_component_row_version_chk CHECK (row_version >= 1),
    CONSTRAINT pricing_component_json_chk CHECK (
        jsonb_typeof(tags) = 'array' AND jsonb_typeof(metadata) = 'object'
    ),
    CONSTRAINT pricing_component_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE document.pricing_component IS
  'Tenant and company-bound polymorphic pricing waterfall. condition_type is the semantic authority; rows preserve calculated transaction evidence and optional supersession history.';

CREATE TABLE document.schedule_line (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid        NOT NULL,
    source_doc_type       document.schedule_source_type_d NOT NULL,
    source_doc_id         uuid        NOT NULL,
    source_line_id        uuid        NOT NULL,
    schedule_no           smallint    NOT NULL,
    schedule_kind         document.schedule_kind_d NOT NULL DEFAULT 'delivery',
    scheduled_quantity    numeric(18,4) NOT NULL,
    scheduled_amount      numeric(18,4),
    scheduled_date        date        NOT NULL,
    currency_code         character(3),
    fulfilled_quantity    numeric(18,4) NOT NULL DEFAULT 0,
    fulfilled_amount      numeric(18,4) NOT NULL DEFAULT 0,
    remaining_quantity    numeric(18,4) GENERATED ALWAYS AS (scheduled_quantity - fulfilled_quantity) STORED,
    fulfillment_status    document.schedule_fulfillment_status_d NOT NULL DEFAULT 'open',
    row_version           bigint      NOT NULL DEFAULT 1,
    version_number        integer     NOT NULL DEFAULT 1,
    previous_version_id   uuid,
    is_current_version    boolean     NOT NULL DEFAULT true,
    supersedes_at         timestamptz,
    terminal_status       document.schedule_terminal_status_d,
    status_source         document.schedule_status_source_d NOT NULL DEFAULT 'manual',
    status                document.schedule_status_d NOT NULL DEFAULT 'active',
    tags                  jsonb       NOT NULL DEFAULT '[]'::jsonb,
    metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,
    CONSTRAINT schedule_line_pkey PRIMARY KEY (id),
    CONSTRAINT schedule_line_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT schedule_line_number_chk CHECK (schedule_no > 0),
    CONSTRAINT schedule_line_quantity_chk CHECK (
        scheduled_quantity > 0 AND fulfilled_quantity BETWEEN 0 AND scheduled_quantity
    ),
    CONSTRAINT schedule_line_fulfillment_state_chk CHECK (
        (fulfillment_status = 'open' AND fulfilled_quantity = 0)
        OR (fulfillment_status = 'partial' AND fulfilled_quantity > 0 AND fulfilled_quantity < scheduled_quantity)
        OR (fulfillment_status = 'fulfilled' AND fulfilled_quantity = scheduled_quantity)
        OR fulfillment_status IN ('closed','cancelled')
    ),
    CONSTRAINT schedule_line_amount_chk CHECK (
        scheduled_amount IS NULL OR (
            scheduled_amount >= 0 AND currency_code IS NOT NULL
            AND fulfilled_amount BETWEEN 0 AND scheduled_amount
        )
    ),
    CONSTRAINT schedule_line_no_amount_chk CHECK (
        scheduled_amount IS NOT NULL OR (currency_code IS NULL AND fulfilled_amount = 0)
    ),
    CONSTRAINT schedule_line_version_chk CHECK (version_number >= 1),
    CONSTRAINT schedule_line_previous_chk CHECK (previous_version_id IS DISTINCT FROM id),
    CONSTRAINT schedule_line_supersession_state_chk CHECK (
        (is_current_version AND supersedes_at IS NULL AND status <> 'superseded')
        OR (NOT is_current_version AND supersedes_at IS NOT NULL AND status IN ('superseded','cancelled'))
    ),
    CONSTRAINT schedule_line_terminal_state_chk CHECK (
        terminal_status IS NULL
        OR status IN ('retired','cancelled')
        OR (NOT is_current_version AND status = 'superseded')
    ),
    CONSTRAINT schedule_line_row_version_chk CHECK (row_version >= 1),
    CONSTRAINT schedule_line_json_chk CHECK (
        jsonb_typeof(tags) = 'array' AND jsonb_typeof(metadata) = 'object'
    ),
    CONSTRAINT schedule_line_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE document.schedule_line IS
  'Versioned delivery, billing-milestone, or release schedule attached to an authoritative document line. Fulfillment fields are operational projections, not the source event ledger.';

-- Supplier catalog review, PunchOut return, assembly execution, and sales.

CREATE TABLE document.catalog_import (
    id                           uuid                             NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                    uuid                             NOT NULL,
    company_code_id              uuid                             NOT NULL,
    supplier_business_partner_id uuid                             NOT NULL,
    source_system                text                             NOT NULL,
    source_account_id            uuid,
    source_catalog_id            uuid                             NOT NULL,
    source_publication_id        uuid                             NOT NULL,
    source_revision_no           integer                          NOT NULL,
    source_content_hash          text                             NOT NULL,
    received_at                  timestamptz                      NOT NULL DEFAULT now(),
    reviewed_at                  timestamptz,
    reviewed_by                  uuid,
    published_at                 timestamptz,
    published_by                 uuid,
    error_message                text,
    metadata                     jsonb                            NOT NULL DEFAULT '{}'::jsonb,
    status                       document.catalog_import_status_d NOT NULL DEFAULT 'received',
    status_changed_at            timestamptz,
    status_changed_by            uuid,
    created_at                   timestamptz                      NOT NULL DEFAULT now(),
    created_by                   uuid                             NOT NULL,
    updated_at                   timestamptz,
    updated_by                   uuid,

    CONSTRAINT catalog_import_pkey PRIMARY KEY (id),
    CONSTRAINT catalog_import_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT catalog_import_source_uq
        UNIQUE (tenant_id, company_code_id, source_system, source_publication_id),
    CONSTRAINT catalog_import_source_system_chk
        CHECK (btrim(source_system) <> ''),
    CONSTRAINT catalog_import_revision_chk CHECK (source_revision_no >= 1),
    CONSTRAINT catalog_import_hash_chk
        CHECK (source_content_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT catalog_import_review_evidence_chk
        CHECK ((reviewed_at IS NULL) = (reviewed_by IS NULL)),
    CONSTRAINT catalog_import_publish_evidence_chk
        CHECK ((published_at IS NULL) = (published_by IS NULL)),
    CONSTRAINT catalog_import_error_chk
        CHECK (error_message IS NULL OR btrim(error_message) <> ''),
    CONSTRAINT catalog_import_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT catalog_import_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT catalog_import_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.catalog_import_line (
    id                         uuid                           NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                  uuid                           NOT NULL,
    catalog_import_id          uuid                           NOT NULL,
    line_no                    integer                        NOT NULL,
    source_catalog_item_id     uuid                           NOT NULL,
    supplier_item_code         text                           NOT NULL,
    supplier_item_name         text                           NOT NULL,
    supplier_description       text,
    manufacturer_name          text,
    manufacturer_part_number  text,
    gtin                       text,
    commodity_code_id          uuid,
    supplier_uom_code          text                           NOT NULL,
    normalized_uom_code        text,
    minimum_order_qty          numeric(18,6),
    order_multiple             numeric(18,6),
    unit_price                 numeric(18,6),
    price_unit                 numeric(18,6)                  NOT NULL DEFAULT 1,
    currency_code              character(3),
    valid_from                 date,
    valid_until                date,
    proposed_item_id           uuid,
    match_status               document.item_match_status_d   NOT NULL DEFAULT 'unmatched',
    match_method               document.item_match_method_d,
    match_confidence           numeric(5,2),
    review_decision            document.catalog_review_decision_d,
    reviewed_at                timestamptz,
    reviewed_by                uuid,
    review_note                text,
    published_catalog_item_id  uuid,
    source_payload             jsonb                          NOT NULL DEFAULT '{}'::jsonb,
    status                     text                           NOT NULL DEFAULT 'active',
    status_changed_at          timestamptz,
    status_changed_by          uuid,
    created_at                 timestamptz                    NOT NULL DEFAULT now(),
    created_by                 uuid                           NOT NULL,
    updated_at                 timestamptz,
    updated_by                 uuid,

    CONSTRAINT catalog_import_line_pkey PRIMARY KEY (id),
    CONSTRAINT catalog_import_line_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT catalog_import_line_number_uq
        UNIQUE (tenant_id, catalog_import_id, line_no),
    CONSTRAINT catalog_import_line_source_uq
        UNIQUE (tenant_id, catalog_import_id, source_catalog_item_id),
    CONSTRAINT catalog_import_line_number_chk CHECK (line_no >= 1),
    CONSTRAINT catalog_import_line_supplier_code_chk
        CHECK (btrim(supplier_item_code) <> ''),
    CONSTRAINT catalog_import_line_supplier_name_chk
        CHECK (btrim(supplier_item_name) <> ''),
    CONSTRAINT catalog_import_line_uom_chk
        CHECK (btrim(supplier_uom_code) <> ''),
    CONSTRAINT catalog_import_line_order_chk CHECK (
        (minimum_order_qty IS NULL OR minimum_order_qty > 0)
        AND (order_multiple IS NULL OR order_multiple > 0)
    ),
    CONSTRAINT catalog_import_line_price_chk CHECK (
        (unit_price IS NULL AND currency_code IS NULL)
        OR (unit_price IS NOT NULL AND unit_price >= 0 AND currency_code IS NOT NULL)
    ),
    CONSTRAINT catalog_import_line_price_unit_chk CHECK (price_unit > 0),
    CONSTRAINT catalog_import_line_range_chk
        CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from),
    CONSTRAINT catalog_import_line_match_evidence_chk CHECK (
        (match_method IS NULL AND match_confidence IS NULL)
        OR match_status IN ('candidate_found', 'matched', 'conflict')
    ),
    CONSTRAINT catalog_import_line_confidence_chk
        CHECK (match_confidence IS NULL OR match_confidence BETWEEN 0 AND 100),
    CONSTRAINT catalog_import_line_review_evidence_chk
        CHECK ((reviewed_at IS NULL) = (reviewed_by IS NULL)),
    CONSTRAINT catalog_import_line_review_decision_chk CHECK (
        review_decision IS NULL
        OR reviewed_at IS NOT NULL
    ),
    CONSTRAINT catalog_import_line_publish_chk CHECK (
        published_catalog_item_id IS NULL
        OR review_decision IN ('map_existing_item', 'create_product_and_item')
    ),
    CONSTRAINT catalog_import_line_review_note_chk
        CHECK (review_note IS NULL OR btrim(review_note) <> ''),
    CONSTRAINT catalog_import_line_payload_object_chk
        CHECK (jsonb_typeof(source_payload) = 'object'),
    CONSTRAINT catalog_import_line_status_chk
        CHECK (status IN ('active', 'ignored', 'published', 'failed')),
    CONSTRAINT catalog_import_line_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT catalog_import_line_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.punchout_cart (
    id                           uuid                            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                    uuid                            NOT NULL,
    company_code_id              uuid                            NOT NULL,
    supplier_business_partner_id uuid                            NOT NULL,
    mesh_session_id              uuid                            NOT NULL,
    network_relationship_id      uuid,
    external_cart_id             text                            NOT NULL,
    currency_code                character(3)                    NOT NULL,
    returned_at                  timestamptz                     NOT NULL,
    expires_at                   timestamptz,
    converted_requisition_id     uuid,
    metadata                     jsonb                           NOT NULL DEFAULT '{}'::jsonb,
    status                       document.punchout_cart_status_d NOT NULL DEFAULT 'returned',
    status_changed_at            timestamptz,
    status_changed_by            uuid,
    created_at                   timestamptz                     NOT NULL DEFAULT now(),
    created_by                   uuid                            NOT NULL,
    updated_at                   timestamptz,
    updated_by                   uuid,

    CONSTRAINT punchout_cart_pkey PRIMARY KEY (id),
    CONSTRAINT punchout_cart_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT punchout_cart_session_uq UNIQUE (tenant_id, mesh_session_id),
    CONSTRAINT punchout_cart_external_uq
        UNIQUE (tenant_id, supplier_business_partner_id, external_cart_id),
    CONSTRAINT punchout_cart_external_chk
        CHECK (btrim(external_cart_id) <> ''),
    CONSTRAINT punchout_cart_range_chk
        CHECK (expires_at IS NULL OR expires_at > returned_at),
    CONSTRAINT punchout_cart_conversion_chk CHECK (
        (status = 'converted') = (converted_requisition_id IS NOT NULL)
    ),
    CONSTRAINT punchout_cart_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT punchout_cart_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT punchout_cart_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.punchout_cart_line (
    id                        uuid                         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                 uuid                         NOT NULL,
    punchout_cart_id          uuid                         NOT NULL,
    line_no                   integer                      NOT NULL,
    supplier_item_code        text                         NOT NULL,
    supplier_item_description text                         NOT NULL,
    manufacturer_name         text,
    manufacturer_part_number text,
    gtin                      text,
    commodity_code_id         uuid,
    item_id                   uuid,
    quantity                  numeric(18,6)                NOT NULL,
    uom_code                  text                         NOT NULL,
    unit_price                numeric(18,6)                NOT NULL,
    price_unit                numeric(18,6)                NOT NULL DEFAULT 1,
    currency_code             character(3)                 NOT NULL,
    match_status              document.item_match_status_d NOT NULL DEFAULT 'unmatched',
    match_method              document.item_match_method_d,
    match_confidence          numeric(5,2),
    matched_at                timestamptz,
    matched_by                uuid,
    metadata                  jsonb                        NOT NULL DEFAULT '{}'::jsonb,
    status                    text                         NOT NULL DEFAULT 'active',
    status_changed_at         timestamptz,
    status_changed_by         uuid,
    created_at                timestamptz                  NOT NULL DEFAULT now(),
    created_by                uuid                         NOT NULL,
    updated_at                timestamptz,
    updated_by                uuid,

    CONSTRAINT punchout_cart_line_pkey PRIMARY KEY (id),
    CONSTRAINT punchout_cart_line_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT punchout_cart_line_number_uq
        UNIQUE (tenant_id, punchout_cart_id, line_no),
    CONSTRAINT punchout_cart_line_number_chk CHECK (line_no >= 1),
    CONSTRAINT punchout_cart_line_supplier_code_chk
        CHECK (btrim(supplier_item_code) <> ''),
    CONSTRAINT punchout_cart_line_description_chk
        CHECK (btrim(supplier_item_description) <> ''),
    CONSTRAINT punchout_cart_line_quantity_chk CHECK (quantity > 0),
    CONSTRAINT punchout_cart_line_price_chk
        CHECK (unit_price >= 0 AND price_unit > 0),
    CONSTRAINT punchout_cart_line_match_chk CHECK (
        (item_id IS NULL AND match_status <> 'matched')
        OR (item_id IS NOT NULL AND match_status = 'matched')
    ),
    CONSTRAINT punchout_cart_line_match_evidence_chk CHECK (
        (matched_at IS NULL) = (matched_by IS NULL)
        AND (matched_at IS NULL OR match_method IS NOT NULL)
    ),
    CONSTRAINT punchout_cart_line_confidence_chk
        CHECK (match_confidence IS NULL OR match_confidence BETWEEN 0 AND 100),
    CONSTRAINT punchout_cart_line_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT punchout_cart_line_status_chk
        CHECK (status IN ('active', 'converted', 'ignored', 'rejected')),
    CONSTRAINT punchout_cart_line_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT punchout_cart_line_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.production_order (
    id                    uuid                               NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                               NOT NULL,
    company_code_id       uuid                               NOT NULL,
    code                  text                               NOT NULL,
    output_item_id        uuid                               NOT NULL,
    bom_snapshot_id       uuid                               NOT NULL,
    planned_quantity      numeric(18,6)                      NOT NULL,
    completed_quantity    numeric(18,6)                      NOT NULL DEFAULT 0,
    uom_code              text                               NOT NULL,
    assembly_site_id      uuid,
    planned_start_at      timestamptz,
    planned_end_at        timestamptz,
    actual_start_at       timestamptz,
    actual_end_at         timestamptz,
    metadata              jsonb                              NOT NULL DEFAULT '{}'::jsonb,
    status                document.production_order_status_d NOT NULL DEFAULT 'draft',
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz                        NOT NULL DEFAULT now(),
    created_by            uuid                               NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT production_order_pkey PRIMARY KEY (id),
    CONSTRAINT production_order_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT production_order_company_code_uq
        UNIQUE (tenant_id, company_code_id, code),
    CONSTRAINT production_order_code_fmt_chk
        CHECK (code ~ '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$'),
    CONSTRAINT production_order_quantity_chk CHECK (
        planned_quantity > 0
        AND completed_quantity >= 0
        AND completed_quantity <= planned_quantity
    ),
    CONSTRAINT production_order_planned_range_chk CHECK (
        planned_end_at IS NULL
        OR planned_start_at IS NULL
        OR planned_end_at >= planned_start_at
    ),
    CONSTRAINT production_order_actual_range_chk CHECK (
        actual_end_at IS NULL
        OR actual_start_at IS NULL
        OR actual_end_at >= actual_start_at
    ),
    CONSTRAINT production_order_completion_evidence_chk CHECK (
        status NOT IN ('completed', 'closed')
        OR (
            completed_quantity > 0
            AND actual_start_at IS NOT NULL
            AND actual_end_at IS NOT NULL
        )
    ),
    CONSTRAINT production_order_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT production_order_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT production_order_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.production_order_component (
    id                   uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id            uuid        NOT NULL,
    production_order_id  uuid        NOT NULL,
    bom_component_snapshot_id uuid,
    component_item_id    uuid        NOT NULL,
    line_no              integer     NOT NULL,
    planned_quantity     numeric(18,6) NOT NULL,
    reserved_quantity    numeric(18,6) NOT NULL DEFAULT 0,
    issued_quantity      numeric(18,6) NOT NULL DEFAULT 0,
    consumed_quantity    numeric(18,6) NOT NULL DEFAULT 0,
    returned_quantity    numeric(18,6) NOT NULL DEFAULT 0,
    scrapped_quantity    numeric(18,6) NOT NULL DEFAULT 0,
    uom_code             text        NOT NULL,
    metadata             jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status               text        NOT NULL DEFAULT 'planned',
    status_changed_at    timestamptz,
    status_changed_by    uuid,
    created_at           timestamptz NOT NULL DEFAULT now(),
    created_by           uuid        NOT NULL,
    updated_at           timestamptz,
    updated_by           uuid,

    CONSTRAINT production_order_component_pkey PRIMARY KEY (id),
    CONSTRAINT production_order_component_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT production_order_component_line_uq
        UNIQUE (tenant_id, production_order_id, line_no),
    CONSTRAINT production_order_component_line_chk CHECK (line_no >= 1),
    CONSTRAINT production_order_component_quantity_chk CHECK (
        planned_quantity > 0
        AND reserved_quantity >= 0
        AND issued_quantity >= 0
        AND consumed_quantity >= 0
        AND returned_quantity >= 0
        AND scrapped_quantity >= 0
        AND consumed_quantity + returned_quantity + scrapped_quantity
            <= issued_quantity
    ),
    CONSTRAINT production_order_component_status_chk CHECK (
        status IN ('planned', 'reserved', 'issued', 'consumed', 'completed', 'cancelled')
    ),
    CONSTRAINT production_order_component_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT production_order_component_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT production_order_component_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

-- Required parent for the requested sales_order_line; no sales-order header
-- existed in the new Neon path.
CREATE TABLE document.sales_order (
    id                 uuid                          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id          uuid                          NOT NULL,
    company_code_id    uuid                          NOT NULL,
    customer_id        uuid                          NOT NULL,
    code               text                          NOT NULL,
    order_date         date                          NOT NULL,
    requested_date     date,
    currency_code      character(3)                  NOT NULL,
    total_amount       numeric(18,6)                 NOT NULL DEFAULT 0,
    metadata           jsonb                         NOT NULL DEFAULT '{}'::jsonb,
    status             document.sales_order_status_d NOT NULL DEFAULT 'draft',
    status_changed_at  timestamptz,
    status_changed_by  uuid,
    created_at         timestamptz                   NOT NULL DEFAULT now(),
    created_by         uuid                          NOT NULL,
    updated_at         timestamptz,
    updated_by         uuid,

    CONSTRAINT sales_order_pkey PRIMARY KEY (id),
    CONSTRAINT sales_order_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT sales_order_company_code_uq
        UNIQUE (tenant_id, company_code_id, code),
    CONSTRAINT sales_order_code_fmt_chk
        CHECK (code ~ '^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}$'),
    CONSTRAINT sales_order_requested_date_chk
        CHECK (requested_date IS NULL OR requested_date >= order_date),
    CONSTRAINT sales_order_total_chk CHECK (total_amount >= 0),
    CONSTRAINT sales_order_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT sales_order_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT sales_order_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.sales_order_line (
    id                 uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id          uuid        NOT NULL,
    sales_order_id     uuid        NOT NULL,
    line_no            integer     NOT NULL,
    item_id            uuid        NOT NULL,
    item_description   text        NOT NULL,
    quantity           numeric(18,6) NOT NULL,
    uom_code           text        NOT NULL,
    unit_price         numeric(18,6) NOT NULL,
    price_unit         numeric(18,6) NOT NULL DEFAULT 1,
    currency_code      character(3) NOT NULL,
    tax_amount         numeric(18,6) NOT NULL DEFAULT 0,
    net_amount         numeric(18,6)
        GENERATED ALWAYS AS ((quantity * unit_price) / price_unit) STORED,
    gross_amount       numeric(18,6)
        GENERATED ALWAYS AS (((quantity * unit_price) / price_unit) + tax_amount) STORED,
    requested_date     date,
    metadata           jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status             text        NOT NULL DEFAULT 'open',
    status_changed_at  timestamptz,
    status_changed_by  uuid,
    created_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid        NOT NULL,
    updated_at         timestamptz,
    updated_by         uuid,

    CONSTRAINT sales_order_line_pkey PRIMARY KEY (id),
    CONSTRAINT sales_order_line_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT sales_order_line_number_uq
        UNIQUE (tenant_id, sales_order_id, line_no),
    CONSTRAINT sales_order_line_number_chk CHECK (line_no >= 1),
    CONSTRAINT sales_order_line_description_chk
        CHECK (btrim(item_description) <> ''),
    CONSTRAINT sales_order_line_quantity_chk CHECK (quantity > 0),
    CONSTRAINT sales_order_line_price_chk
        CHECK (unit_price >= 0 AND price_unit > 0 AND tax_amount >= 0),
    CONSTRAINT sales_order_line_status_chk
        CHECK (status IN ('open', 'allocated', 'partially_fulfilled', 'fulfilled', 'cancelled')),
    CONSTRAINT sales_order_line_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT sales_order_line_status_audit_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT sales_order_line_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.stocktake (
    id                     uuid                        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id              uuid                        NOT NULL,
    company_code_id        uuid                        NOT NULL,
    site_id                uuid                        NOT NULL,
    warehouse_id           uuid                        NOT NULL,
    code                   text                        NOT NULL,
    name                   text                        NOT NULL,
    reference_no           text,
    stocktake_type         document.stocktake_type_d   NOT NULL DEFAULT 'full',
    stocktake_date         date                        NOT NULL,
    system_quantity_as_of  timestamptz                 NOT NULL,
    blind_count            boolean                     NOT NULL DEFAULT false,
    variance_journal_entry_id uuid,
    completed_at           timestamptz,
    completed_by           uuid,
    metadata               jsonb                       NOT NULL DEFAULT '{}'::jsonb,
    status                 document.stocktake_status_d NOT NULL DEFAULT 'planned',
    status_changed_at      timestamptz,
    status_changed_by      uuid,
    created_at             timestamptz                 NOT NULL DEFAULT now(),
    created_by             uuid                        NOT NULL,
    updated_at             timestamptz,
    updated_by             uuid,

    CONSTRAINT stocktake_pkey PRIMARY KEY (id),
    CONSTRAINT stocktake_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT stocktake_warehouse_code_uq UNIQUE (tenant_id, warehouse_id, code),
    CONSTRAINT stocktake_code_fmt_chk CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT stocktake_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT stocktake_reference_chk CHECK (reference_no IS NULL OR btrim(reference_no) <> ''),
    CONSTRAINT stocktake_completion_pair_chk CHECK ((completed_at IS NULL) = (completed_by IS NULL)),
    CONSTRAINT stocktake_completion_status_chk CHECK (
        (status = 'completed' AND completed_at IS NOT NULL)
        OR (status <> 'completed' AND completed_at IS NULL AND variance_journal_entry_id IS NULL)
    ),
    CONSTRAINT stocktake_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT stocktake_status_audit_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT stocktake_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.stocktake_line (
    id                       uuid          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid          NOT NULL,
    stocktake_id             uuid          NOT NULL,
    line_no                  integer       NOT NULL,
    item_id                  uuid          NOT NULL,
    lot_number               text,
    serial_number            text,
    system_quantity          numeric(20,6) NOT NULL,
    counted_quantity         numeric(20,6),
    variance_quantity        numeric(20,6) GENERATED ALWAYS AS
        (CASE WHEN counted_quantity IS NULL THEN NULL ELSE counted_quantity - system_quantity END) STORED,
    uom_code                 text          NOT NULL,
    unit_cost                numeric(20,6) NOT NULL DEFAULT 0,
    variance_value           numeric(20,4) GENERATED ALWAYS AS
        (CASE WHEN counted_quantity IS NULL THEN NULL ELSE (counted_quantity - system_quantity) * unit_cost END) STORED,
    currency_code            character(3)  NOT NULL,
    counted_at               timestamptz,
    counted_by               uuid,
    posted_inventory_movement_id uuid,
    metadata                 jsonb         NOT NULL DEFAULT '{}'::jsonb,
    created_at               timestamptz   NOT NULL DEFAULT now(),
    created_by               uuid          NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,

    CONSTRAINT stocktake_line_pkey PRIMARY KEY (id),
    CONSTRAINT stocktake_line_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT stocktake_line_no_uq UNIQUE (tenant_id, stocktake_id, line_no),
    CONSTRAINT stocktake_line_coordinate_uq UNIQUE NULLS NOT DISTINCT
        (tenant_id, stocktake_id, item_id, lot_number, serial_number),
    CONSTRAINT stocktake_line_no_chk CHECK (line_no >= 1),
    CONSTRAINT stocktake_line_quantities_chk CHECK (
        system_quantity >= 0 AND (counted_quantity IS NULL OR counted_quantity >= 0)
    ),
    CONSTRAINT stocktake_line_cost_chk CHECK (unit_cost >= 0),
    CONSTRAINT stocktake_line_count_pair_chk CHECK ((counted_at IS NULL) = (counted_by IS NULL)),
    CONSTRAINT stocktake_line_count_evidence_chk CHECK ((counted_quantity IS NULL) = (counted_at IS NULL)),
    CONSTRAINT stocktake_line_lot_chk CHECK (lot_number IS NULL OR btrim(lot_number) <> ''),
    CONSTRAINT stocktake_line_serial_chk CHECK (serial_number IS NULL OR btrim(serial_number) <> ''),
    CONSTRAINT stocktake_line_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT stocktake_line_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.sales_opportunity (
    id                          uuid                          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid                          NOT NULL,
    customer_id                 uuid                          NOT NULL,
    operating_organization_id   uuid                          NOT NULL,
    code                        text                          NOT NULL,
    name                        text                          NOT NULL,
    description                 text,
    selling_model               master.selling_model_d        NOT NULL DEFAULT 'federated',
    principal_seller_company_id uuid,
    estimated_amount            numeric(18,6),
    currency_code               character(3),
    probability_percent         numeric(5,2),
    expected_close_date         date,
    requested_by                uuid,
    metadata                    jsonb                         NOT NULL DEFAULT '{}'::jsonb,
    status                      document.sales_opportunity_status_d NOT NULL DEFAULT 'draft',
    status_changed_at           timestamptz,
    status_changed_by           uuid,
    created_at                  timestamptz                   NOT NULL DEFAULT now(),
    created_by                  uuid                          NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT sales_opportunity_pkey PRIMARY KEY (id),
    CONSTRAINT sales_opportunity_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT sales_opportunity_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT sales_opportunity_code_fmt_chk CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT sales_opportunity_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT sales_opportunity_amount_pair_chk CHECK ((estimated_amount IS NULL) = (currency_code IS NULL)),
    CONSTRAINT sales_opportunity_amount_chk CHECK (estimated_amount IS NULL OR estimated_amount >= 0),
    CONSTRAINT sales_opportunity_probability_chk CHECK (probability_percent IS NULL OR probability_percent BETWEEN 0 AND 100),
    CONSTRAINT sales_opportunity_selling_model_chk CHECK (
        (selling_model = 'principal_seller' AND principal_seller_company_id IS NOT NULL)
        OR (selling_model <> 'principal_seller' AND principal_seller_company_id IS NULL)
    ),
    CONSTRAINT sales_opportunity_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT sales_opportunity_status_audit_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT sales_opportunity_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.sales_opportunity_company (
    id               uuid                                  NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid                                  NOT NULL,
    opportunity_id   uuid                                  NOT NULL,
    company_code_id  uuid                                  NOT NULL,
    participation_role document.sales_participation_role_d NOT NULL DEFAULT 'participant',
    status           document.sales_participation_status_d NOT NULL DEFAULT 'active',
    status_changed_at timestamptz,
    status_changed_by uuid,
    created_at       timestamptz                           NOT NULL DEFAULT now(),
    created_by       uuid                                  NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,
    CONSTRAINT sales_opportunity_company_pkey PRIMARY KEY (id),
    CONSTRAINT sales_opportunity_company_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT sales_opportunity_company_member_uq UNIQUE (tenant_id, opportunity_id, company_code_id),
    CONSTRAINT sales_opportunity_company_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT sales_opportunity_company_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.sales_quotation (
    id                          uuid                          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid                          NOT NULL,
    opportunity_id              uuid,
    customer_id                 uuid                          NOT NULL,
    operating_organization_id   uuid                          NOT NULL,
    code                        text                          NOT NULL,
    name                        text                          NOT NULL,
    selling_model               master.selling_model_d        NOT NULL DEFAULT 'federated',
    principal_seller_company_id uuid,
    quotation_date              date                          NOT NULL,
    valid_until                 date,
    currency_code               character(3)                  NOT NULL,
    total_amount                numeric(18,6)                  NOT NULL DEFAULT 0,
    requested_by                uuid,
    metadata                    jsonb                         NOT NULL DEFAULT '{}'::jsonb,
    status                      document.sales_quotation_status_d NOT NULL DEFAULT 'draft',
    status_changed_at           timestamptz,
    status_changed_by           uuid,
    created_at                  timestamptz                   NOT NULL DEFAULT now(),
    created_by                  uuid                          NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,
    CONSTRAINT sales_quotation_pkey PRIMARY KEY (id),
    CONSTRAINT sales_quotation_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT sales_quotation_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT sales_quotation_code_fmt_chk CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT sales_quotation_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT sales_quotation_validity_chk CHECK (valid_until IS NULL OR valid_until >= quotation_date),
    CONSTRAINT sales_quotation_amount_chk CHECK (total_amount >= 0),
    CONSTRAINT sales_quotation_selling_model_chk CHECK (
        (selling_model = 'principal_seller' AND principal_seller_company_id IS NOT NULL)
        OR (selling_model <> 'principal_seller' AND principal_seller_company_id IS NULL)
    ),
    CONSTRAINT sales_quotation_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT sales_quotation_status_audit_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT sales_quotation_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.sales_quotation_company (
    id               uuid                                  NOT NULL DEFAULT shared.uuidv7(),
    tenant_id        uuid                                  NOT NULL,
    quotation_id     uuid                                  NOT NULL,
    company_code_id  uuid                                  NOT NULL,
    participation_role document.sales_participation_role_d NOT NULL DEFAULT 'participant',
    status           document.sales_participation_status_d NOT NULL DEFAULT 'active',
    status_changed_at timestamptz,
    status_changed_by uuid,
    created_at       timestamptz                           NOT NULL DEFAULT now(),
    created_by       uuid                                  NOT NULL,
    updated_at       timestamptz,
    updated_by       uuid,
    CONSTRAINT sales_quotation_company_pkey PRIMARY KEY (id),
    CONSTRAINT sales_quotation_company_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT sales_quotation_company_member_uq UNIQUE (tenant_id, quotation_id, company_code_id),
    CONSTRAINT sales_quotation_company_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT sales_quotation_company_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.sales_quotation_allocation (
    id                    uuid          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid          NOT NULL,
    quotation_id          uuid          NOT NULL,
    company_code_id       uuid          NOT NULL,
    allocation_percent    numeric(7,4),
    allocation_amount     numeric(18,6),
    output_sales_order_id uuid,
    status                document.sales_quotation_allocation_status_d NOT NULL DEFAULT 'planned',
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz   NOT NULL DEFAULT now(),
    created_by            uuid          NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,
    CONSTRAINT sales_quotation_allocation_pkey PRIMARY KEY (id),
    CONSTRAINT sales_quotation_allocation_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT sales_quotation_allocation_company_uq UNIQUE (tenant_id, quotation_id, company_code_id),
    CONSTRAINT sales_quotation_allocation_measure_chk CHECK (
        allocation_percent IS NOT NULL OR allocation_amount IS NOT NULL
    ),
    CONSTRAINT sales_quotation_allocation_percent_chk CHECK (allocation_percent IS NULL OR allocation_percent BETWEEN 0 AND 100),
    CONSTRAINT sales_quotation_allocation_amount_chk CHECK (allocation_amount IS NULL OR allocation_amount >= 0),
    CONSTRAINT sales_quotation_allocation_conversion_chk CHECK (
        (status = 'converted' AND output_sales_order_id IS NOT NULL)
        OR (status <> 'converted' AND output_sales_order_id IS NULL)
    ),
    CONSTRAINT sales_quotation_allocation_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT sales_quotation_allocation_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

ALTER TABLE document.sales_order
    ADD COLUMN quotation_id uuid;

CREATE TABLE document.sales_order_intercompany_fulfillment (
    id                          uuid          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid          NOT NULL,
    sales_order_id              uuid          NOT NULL,
    selling_company_code_id     uuid          NOT NULL,
    fulfillment_company_code_id uuid          NOT NULL,
    allocation_amount           numeric(18,6) NOT NULL,
    currency_code               character(3)  NOT NULL,
    status                      document.intercompany_fulfillment_status_d NOT NULL DEFAULT 'planned',
    status_changed_at           timestamptz,
    status_changed_by           uuid,
    metadata                    jsonb         NOT NULL DEFAULT '{}'::jsonb,
    created_at                  timestamptz   NOT NULL DEFAULT now(),
    created_by                  uuid          NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,
    CONSTRAINT sales_order_intercompany_fulfillment_pkey PRIMARY KEY (id),
    CONSTRAINT sales_order_intercompany_fulfillment_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT sales_order_intercompany_fulfillment_route_uq UNIQUE
        (tenant_id, sales_order_id, selling_company_code_id, fulfillment_company_code_id),
    CONSTRAINT sales_order_intercompany_fulfillment_amount_chk CHECK (allocation_amount >= 0),
    CONSTRAINT sales_order_intercompany_fulfillment_company_chk CHECK (selling_company_code_id <> fulfillment_company_code_id),
    CONSTRAINT sales_order_intercompany_fulfillment_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT sales_order_intercompany_fulfillment_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT sales_order_intercompany_fulfillment_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE document.stocktake IS
  'Warehouse count document with a frozen inventory cut-off. Completion requires every line to be counted and every non-zero variance to reference its posted inventory movement.';
COMMENT ON TABLE document.stocktake_line IS
  'Counted item/lot/serial coordinate. Variance quantity and value are generated evidence, not application-supplied state.';
COMMENT ON TABLE document.sales_opportunity IS
  'Customer opportunity owned by one sales operating organization; participating legal companies are explicit child rows.';
COMMENT ON TABLE document.sales_quotation IS
  'Commercial quotation that can allocate fulfilment across participating company codes and convert allocations into company sales orders.';
COMMENT ON COLUMN document.sales_order.quotation_id IS
  'Optional originating quotation. Multi-company quotation conversion produces at most one order per quotation/company.';
COMMENT ON TABLE document.sales_order_intercompany_fulfillment IS
  'Planned or posted value fulfilled by another company code for the company owning the sales order.';

CREATE TABLE document.bank_statement (
    id                  uuid                                   NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid                                   NOT NULL,
    company_code_id     uuid                                   NOT NULL,
    bank_account_id     uuid                                   NOT NULL,
    statement_ref       text,
    period_start_date   date                                   NOT NULL,
    period_end_date     date                                   NOT NULL,
    opening_balance     numeric(20,4)                           NOT NULL,
    closing_balance     numeric(20,4)                           NOT NULL,
    currency_code       character(3)                           NOT NULL,
    source_format       document.bank_statement_source_format_d NOT NULL,
    source_hash         text,
    signed_off_at       timestamptz,
    signed_off_by       uuid,
    notes               text,
    metadata            jsonb                                  NOT NULL DEFAULT '{}'::jsonb,
    status              document.bank_statement_status_d       NOT NULL DEFAULT 'imported',
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz                            NOT NULL DEFAULT now(),
    created_by          uuid                                   NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,
    CONSTRAINT bank_statement_pkey PRIMARY KEY (id),
    CONSTRAINT bank_statement_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT bank_statement_period_chk CHECK (period_end_date >= period_start_date),
    CONSTRAINT bank_statement_reference_chk CHECK (statement_ref IS NULL OR btrim(statement_ref) <> ''),
    CONSTRAINT bank_statement_source_hash_chk CHECK (
        (source_format = 'manual' AND (source_hash IS NULL OR btrim(source_hash) <> ''))
        OR (source_format <> 'manual' AND source_hash IS NOT NULL AND btrim(source_hash) <> '')
    ),
    CONSTRAINT bank_statement_signoff_pair_chk CHECK ((signed_off_at IS NULL) = (signed_off_by IS NULL)),
    CONSTRAINT bank_statement_signoff_status_chk CHECK (
        (status IN ('signed_off', 'archived')) = (signed_off_at IS NOT NULL)
    ),
    CONSTRAINT bank_statement_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT bank_statement_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT bank_statement_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.bank_statement_line (
    id                  uuid                                 NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid                                 NOT NULL,
    bank_statement_id   uuid                                 NOT NULL,
    line_no             integer                              NOT NULL,
    transaction_date    date                                 NOT NULL,
    value_date          date,
    description         text                                 NOT NULL,
    reference_number    text,
    counterparty_name   text,
    counterparty_account text,
    amount              numeric(20,4)                        NOT NULL,
    running_balance     numeric(20,4),
    currency_code       character(3)                         NOT NULL,
    transaction_type    document.bank_transaction_type_d     NOT NULL DEFAULT 'other',
    idempotency_key     text                                 NOT NULL,
    recon_status        document.bank_reconciliation_status_d NOT NULL DEFAULT 'unmatched',
    raw_data            jsonb                                NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz                          NOT NULL DEFAULT now(),
    created_by          uuid                                 NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,
    CONSTRAINT bank_statement_line_pkey PRIMARY KEY (id),
    CONSTRAINT bank_statement_line_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT bank_statement_line_no_uq UNIQUE (tenant_id, bank_statement_id, line_no),
    CONSTRAINT bank_statement_line_idempotency_uq UNIQUE (tenant_id, bank_statement_id, idempotency_key),
    CONSTRAINT bank_statement_line_no_chk CHECK (line_no >= 1),
    CONSTRAINT bank_statement_line_description_chk CHECK (btrim(description) <> ''),
    CONSTRAINT bank_statement_line_amount_chk CHECK (amount <> 0),
    CONSTRAINT bank_statement_line_key_chk CHECK (btrim(idempotency_key) <> ''),
    CONSTRAINT bank_statement_line_reference_chk CHECK (reference_number IS NULL OR btrim(reference_number) <> ''),
    CONSTRAINT bank_statement_line_raw_object_chk CHECK (jsonb_typeof(raw_data) = 'object'),
    CONSTRAINT bank_statement_line_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.bank_recon_case (
    id                  uuid                                  NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid                                  NOT NULL,
    company_code_id     uuid                                  NOT NULL,
    bank_account_id     uuid                                  NOT NULL,
    case_number         text                                  NOT NULL,
    case_type           document.bank_recon_case_type_d        NOT NULL,
    confidence_score    numeric(5,4)                          NOT NULL DEFAULT 1,
    book_amount         numeric(20,4)                         NOT NULL DEFAULT 0,
    bank_amount         numeric(20,4)                         NOT NULL DEFAULT 0,
    difference_amount   numeric(20,4) GENERATED ALWAYS AS (book_amount - bank_amount) STORED,
    currency_code       character(3)                          NOT NULL,
    sign_off_journal_entry_id uuid,
    matched_at          timestamptz,
    signed_off_at       timestamptz,
    signed_off_by       uuid,
    voided_at           timestamptz,
    voided_by           uuid,
    void_reason         text,
    notes               text,
    metadata            jsonb                                 NOT NULL DEFAULT '{}'::jsonb,
    status              document.bank_recon_case_status_d      NOT NULL DEFAULT 'open',
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz                           NOT NULL DEFAULT now(),
    created_by          uuid                                  NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,
    CONSTRAINT bank_recon_case_pkey PRIMARY KEY (id),
    CONSTRAINT bank_recon_case_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT bank_recon_case_number_uq UNIQUE (tenant_id, company_code_id, case_number),
    CONSTRAINT bank_recon_case_number_chk CHECK (case_number ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT bank_recon_case_confidence_chk CHECK (confidence_score BETWEEN 0 AND 1),
    CONSTRAINT bank_recon_case_amounts_chk CHECK (book_amount >= 0 AND bank_amount >= 0),
    CONSTRAINT bank_recon_case_matched_chk CHECK ((status IN ('matched', 'signed_off')) = (matched_at IS NOT NULL)),
    CONSTRAINT bank_recon_case_signoff_pair_chk CHECK ((signed_off_at IS NULL) = (signed_off_by IS NULL)),
    CONSTRAINT bank_recon_case_signoff_status_chk CHECK ((status = 'signed_off') = (signed_off_at IS NOT NULL)),
    CONSTRAINT bank_recon_case_void_pair_chk CHECK ((voided_at IS NULL) = (voided_by IS NULL)),
    CONSTRAINT bank_recon_case_void_status_chk CHECK (
        (status = 'voided' AND voided_at IS NOT NULL AND void_reason IS NOT NULL AND btrim(void_reason) <> '')
        OR (status <> 'voided' AND voided_at IS NULL AND void_reason IS NULL)
    ),
    CONSTRAINT bank_recon_case_adjustment_journal_chk CHECK (
        sign_off_journal_entry_id IS NULL OR case_type IN ('exception', 'bank_charge', 'fx_difference')
    ),
    CONSTRAINT bank_recon_case_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT bank_recon_case_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT bank_recon_case_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.bank_recon_case_line (
    id                     uuid                         NOT NULL DEFAULT shared.uuidv7(),
    tenant_id              uuid                         NOT NULL,
    bank_recon_case_id     uuid                         NOT NULL,
    side                   document.bank_recon_side_d    NOT NULL,
    payment_entry_id       uuid,
    bank_statement_line_id uuid,
    amount                 numeric(20,4)                NOT NULL,
    notes                  text,
    created_at             timestamptz                  NOT NULL DEFAULT now(),
    created_by             uuid                         NOT NULL,
    CONSTRAINT bank_recon_case_line_pkey PRIMARY KEY (id),
    CONSTRAINT bank_recon_case_line_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT bank_recon_case_line_source_uq UNIQUE NULLS NOT DISTINCT
        (tenant_id, bank_recon_case_id, side, payment_entry_id, bank_statement_line_id),
    CONSTRAINT bank_recon_case_line_side_chk CHECK (
        (side = 'payment' AND payment_entry_id IS NOT NULL AND bank_statement_line_id IS NULL)
        OR (side = 'statement' AND bank_statement_line_id IS NOT NULL AND payment_entry_id IS NULL)
    ),
    CONSTRAINT bank_recon_case_line_amount_chk CHECK (amount > 0),
    CONSTRAINT bank_recon_case_line_notes_chk CHECK (notes IS NULL OR btrim(notes) <> '')
);

CREATE TABLE document.depreciation_run (
    id                   uuid                               NOT NULL DEFAULT shared.uuidv7(),
    tenant_id            uuid                               NOT NULL,
    company_code_id      uuid                               NOT NULL,
    ledger_book_id       uuid                               NOT NULL,
    fiscal_period_id     uuid                               NOT NULL,
    code                 text                               NOT NULL,
    name                 text                               NOT NULL,
    currency_code        character(3)                       NOT NULL,
    idempotency_key      text                               NOT NULL,
    reversal_of_run_id   uuid,
    reference_journal_entry_id uuid,
    started_at           timestamptz,
    started_by           uuid,
    completed_at         timestamptz,
    completed_by         uuid,
    posted_at            timestamptz,
    posted_by            uuid,
    failure_summary      jsonb,
    metadata             jsonb                              NOT NULL DEFAULT '{}'::jsonb,
    status               document.depreciation_run_status_d NOT NULL DEFAULT 'planned',
    status_changed_at    timestamptz,
    status_changed_by    uuid,
    created_at           timestamptz                        NOT NULL DEFAULT now(),
    created_by           uuid                               NOT NULL,
    updated_at           timestamptz,
    updated_by           uuid,
    CONSTRAINT depreciation_run_pkey PRIMARY KEY (id),
    CONSTRAINT depreciation_run_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT depreciation_run_code_uq UNIQUE (tenant_id, company_code_id, ledger_book_id, code),
    CONSTRAINT depreciation_run_period_direction_uq UNIQUE NULLS NOT DISTINCT
        (tenant_id, company_code_id, ledger_book_id, fiscal_period_id, reversal_of_run_id),
    CONSTRAINT depreciation_run_idempotency_uq UNIQUE (tenant_id, idempotency_key),
    CONSTRAINT depreciation_run_code_chk CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT depreciation_run_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT depreciation_run_key_chk CHECK (btrim(idempotency_key) <> ''),
    CONSTRAINT depreciation_run_self_chk CHECK (reversal_of_run_id IS DISTINCT FROM id),
    CONSTRAINT depreciation_run_start_pair_chk CHECK ((started_at IS NULL) = (started_by IS NULL)),
    CONSTRAINT depreciation_run_complete_pair_chk CHECK ((completed_at IS NULL) = (completed_by IS NULL)),
    CONSTRAINT depreciation_run_post_pair_chk CHECK ((posted_at IS NULL) = (posted_by IS NULL)),
    CONSTRAINT depreciation_run_state_evidence_chk CHECK (
        (status NOT IN ('running', 'calculated', 'posted', 'failed') OR started_at IS NOT NULL)
        AND (status NOT IN ('calculated', 'posted', 'failed') OR completed_at IS NOT NULL)
        AND (status <> 'posted' OR posted_at IS NOT NULL)
        AND (status <> 'failed' OR failure_summary IS NOT NULL)
    ),
    CONSTRAINT depreciation_run_failure_object_chk CHECK (failure_summary IS NULL OR jsonb_typeof(failure_summary) = 'object'),
    CONSTRAINT depreciation_run_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT depreciation_run_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT depreciation_run_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.depreciation_run_line (
    id                    uuid                                  NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                                  NOT NULL,
    run_id                uuid                                  NOT NULL,
    asset_id              uuid                                  NOT NULL,
    asset_book_id         uuid                                  NOT NULL,
    depreciation_schedule_id uuid,
    reversal_of_line_id   uuid,
    depreciation_amount   numeric(20,4)                         NOT NULL,
    currency_code         character(3)                          NOT NULL,
    cost_basis_at_run     numeric(20,4)                         NOT NULL,
    accumulated_depreciation_before numeric(20,4)               NOT NULL,
    accumulated_depreciation_after  numeric(20,4)               NOT NULL,
    net_book_value_after  numeric(20,4)                         NOT NULL,
    depreciation_method   master.depreciation_method_d          NOT NULL,
    useful_life_months    integer                               NOT NULL,
    remaining_life_months integer                               NOT NULL,
    error_message         text,
    status                document.depreciation_line_status_d    NOT NULL DEFAULT 'calculated',
    posted_at             timestamptz,
    posted_by             uuid,
    created_at            timestamptz                           NOT NULL DEFAULT now(),
    created_by            uuid                                  NOT NULL,
    CONSTRAINT depreciation_run_line_pkey PRIMARY KEY (id),
    CONSTRAINT depreciation_run_line_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT depreciation_run_line_asset_uq UNIQUE (tenant_id, run_id, asset_book_id),
    CONSTRAINT depreciation_run_line_amount_chk CHECK (depreciation_amount > 0),
    CONSTRAINT depreciation_run_line_values_chk CHECK (
        cost_basis_at_run >= 0 AND accumulated_depreciation_before >= 0
        AND accumulated_depreciation_after >= 0 AND net_book_value_after >= 0
        AND (
            (reversal_of_line_id IS NULL AND accumulated_depreciation_after = accumulated_depreciation_before + depreciation_amount)
            OR (reversal_of_line_id IS NOT NULL AND accumulated_depreciation_after = accumulated_depreciation_before - depreciation_amount)
        )
        AND accumulated_depreciation_after + net_book_value_after <= cost_basis_at_run
    ),
    CONSTRAINT depreciation_run_line_life_chk CHECK (useful_life_months >= 0 AND remaining_life_months >= 0 AND remaining_life_months <= useful_life_months),
    CONSTRAINT depreciation_run_line_self_chk CHECK (reversal_of_line_id IS DISTINCT FROM id),
    CONSTRAINT depreciation_run_line_error_chk CHECK (
        (status = 'error' AND error_message IS NOT NULL AND btrim(error_message) <> '')
        OR (status <> 'error' AND error_message IS NULL)
    ),
    CONSTRAINT depreciation_run_line_post_pair_chk CHECK ((posted_at IS NULL) = (posted_by IS NULL)),
    CONSTRAINT depreciation_run_line_post_status_chk CHECK ((status = 'posted') = (posted_at IS NOT NULL))
);

CREATE TABLE document.depreciation_schedule (
    id                    uuid                                      NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid                                      NOT NULL,
    asset_id              uuid                                      NOT NULL,
    asset_book_id         uuid                                      NOT NULL,
    fiscal_period_id      uuid                                      NOT NULL,
    planned_amount        numeric(20,4)                             NOT NULL,
    cumulative_planned_amount numeric(20,4)                         NOT NULL,
    opening_net_book_value numeric(20,4)                            NOT NULL,
    closing_net_book_value numeric(20,4) GENERATED ALWAYS AS (opening_net_book_value - planned_amount) STORED,
    currency_code         character(3)                              NOT NULL,
    actual_run_line_id    uuid,
    actual_amount         numeric(20,4),
    variance_amount       numeric(20,4) GENERATED ALWAYS AS
        (CASE WHEN actual_amount IS NULL THEN NULL ELSE actual_amount - planned_amount END) STORED,
    is_final_period       boolean                                   NOT NULL DEFAULT false,
    notes                 text,
    metadata              jsonb                                     NOT NULL DEFAULT '{}'::jsonb,
    status                document.depreciation_schedule_status_d    NOT NULL DEFAULT 'planned',
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz                               NOT NULL DEFAULT now(),
    created_by            uuid                                      NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,
    CONSTRAINT depreciation_schedule_pkey PRIMARY KEY (id),
    CONSTRAINT depreciation_schedule_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT depreciation_schedule_period_uq UNIQUE (tenant_id, asset_book_id, fiscal_period_id),
    CONSTRAINT depreciation_schedule_amounts_chk CHECK (
        planned_amount >= 0 AND cumulative_planned_amount >= planned_amount
        AND opening_net_book_value >= planned_amount
        AND (actual_amount IS NULL OR actual_amount >= 0)
    ),
    CONSTRAINT depreciation_schedule_actual_pair_chk CHECK ((actual_run_line_id IS NULL) = (actual_amount IS NULL)),
    CONSTRAINT depreciation_schedule_actual_status_chk CHECK (
        (status = 'posted') = (actual_run_line_id IS NOT NULL)
    ),
    CONSTRAINT depreciation_schedule_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT depreciation_schedule_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT depreciation_schedule_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE document.bank_recon_case_line IS
  'Append-only canonical M:N match bridge. Split reconciliation uses multiple payment or statement rows within one case; voiding the case releases the sources.';
COMMENT ON COLUMN document.bank_statement_line.recon_status IS
  'Database-maintained operational projection of active reconciliation case coverage; no recon_case_id shortcut is stored.';
COMMENT ON TABLE document.depreciation_run IS
  'One company, ledger-book and fiscal-period depreciation execution. Ambiguous legacy book_type/book_id and duplicated fiscal coordinates are removed.';
COMMENT ON TABLE document.depreciation_schedule IS
  'Current planned schedule per asset book and fiscal period. Historical versions are captured by snapshot.entity_snapshot rather than schedule_version.';

CREATE TABLE document.sourcing_event (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    operating_organization_id uuid NOT NULL,
    code text NOT NULL,
    name text NOT NULL,
    description text,
    event_type document.sourcing_event_type_d NOT NULL DEFAULT 'rfp',
    buying_model document.sourcing_buying_model_d NOT NULL DEFAULT 'federated',
    central_buyer_company_id uuid,
    evaluation_currency_code character(3),
    requested_by uuid NOT NULL,
    open_at timestamptz,
    close_at timestamptz,
    published_at timestamptz,
    published_by uuid,
    awarded_at timestamptz,
    awarded_by uuid,
    closed_at timestamptz,
    closed_by uuid,
    cancellation_reason text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    status document.sourcing_event_status_d NOT NULL DEFAULT 'draft',
    status_changed_at timestamptz,
    status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz,
    updated_by uuid,
    CONSTRAINT sourcing_event_pkey PRIMARY KEY(id),
    CONSTRAINT sourcing_event_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT sourcing_event_code_uq UNIQUE(tenant_id,code),
    CONSTRAINT sourcing_event_code_chk CHECK(code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT sourcing_event_name_chk CHECK(btrim(name)<>''),
    CONSTRAINT sourcing_event_central_buyer_chk CHECK(
        (buying_model='central_buyer' AND central_buyer_company_id IS NOT NULL)
        OR (buying_model='federated' AND central_buyer_company_id IS NULL)
    ),
    CONSTRAINT sourcing_event_dates_chk CHECK(close_at IS NULL OR open_at IS NULL OR close_at>open_at),
    CONSTRAINT sourcing_event_publish_pair_chk CHECK((published_at IS NULL)=(published_by IS NULL)),
    CONSTRAINT sourcing_event_award_pair_chk CHECK((awarded_at IS NULL)=(awarded_by IS NULL)),
    CONSTRAINT sourcing_event_close_pair_chk CHECK((closed_at IS NULL)=(closed_by IS NULL)),
    CONSTRAINT sourcing_event_state_evidence_chk CHECK(
        (status NOT IN ('published','evaluation','awarded','closed') OR published_at IS NOT NULL)
        AND (status NOT IN ('awarded','closed') OR awarded_at IS NOT NULL)
        AND (status<>'closed' OR closed_at IS NOT NULL)
        AND ((status='cancelled')=(cancellation_reason IS NOT NULL))
    ),
    CONSTRAINT sourcing_event_metadata_chk CHECK(jsonb_typeof(metadata)='object'),
    CONSTRAINT sourcing_event_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT sourcing_event_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.sourcing_event_company (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    sourcing_event_id uuid NOT NULL,
    company_code_id uuid NOT NULL,
    participation_role document.sourcing_company_role_d NOT NULL DEFAULT 'participant',
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    status document.sourcing_company_status_d NOT NULL DEFAULT 'active',
    status_changed_at timestamptz,
    status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz,
    updated_by uuid,
    CONSTRAINT sourcing_event_company_pkey PRIMARY KEY(id),
    CONSTRAINT sourcing_event_company_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT sourcing_event_company_uq UNIQUE(tenant_id,sourcing_event_id,company_code_id),
    CONSTRAINT sourcing_event_company_metadata_chk CHECK(jsonb_typeof(metadata)='object'),
    CONSTRAINT sourcing_event_company_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT sourcing_event_company_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.sourcing_event_demand (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    sourcing_event_id uuid NOT NULL,
    purchase_requisition_line_id uuid NOT NULL,
    demand_company_code_id uuid NOT NULL,
    requested_quantity numeric(20,6) NOT NULL,
    uom_code text NOT NULL,
    requested_amount numeric(20,4) NOT NULL,
    source_currency_code character(3) NOT NULL,
    evaluation_amount numeric(20,4) NOT NULL,
    evaluation_currency_code character(3) NOT NULL,
    fx_rate_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    status document.sourcing_demand_status_d NOT NULL DEFAULT 'included',
    status_changed_at timestamptz,
    status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz,
    updated_by uuid,
    CONSTRAINT sourcing_event_demand_pkey PRIMARY KEY(id),
    CONSTRAINT sourcing_event_demand_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT sourcing_event_demand_uq UNIQUE(tenant_id,sourcing_event_id,purchase_requisition_line_id),
    CONSTRAINT sourcing_event_demand_quantity_chk CHECK(requested_quantity>0),
    CONSTRAINT sourcing_event_demand_amount_chk CHECK(requested_amount>=0 AND evaluation_amount>=0),
    CONSTRAINT sourcing_event_demand_fx_chk CHECK(
        (source_currency_code=evaluation_currency_code AND requested_amount=evaluation_amount)
        OR (source_currency_code<>evaluation_currency_code AND jsonb_typeof(fx_rate_snapshot)='object' AND fx_rate_snapshot<>'{}'::jsonb)
    ),
    CONSTRAINT sourcing_event_demand_json_chk CHECK(jsonb_typeof(fx_rate_snapshot)='object' AND jsonb_typeof(metadata)='object'),
    CONSTRAINT sourcing_event_demand_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT sourcing_event_demand_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.sourcing_event_award (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    sourcing_event_id uuid NOT NULL,
    supplier_id uuid NOT NULL,
    award_amount numeric(20,4) NOT NULL DEFAULT 0,
    currency_code character(3) NOT NULL,
    recommendation_note text,
    response_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
    approved_at timestamptz,
    approved_by uuid,
    converted_at timestamptz,
    converted_by uuid,
    rejection_reason text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    status document.sourcing_award_status_d NOT NULL DEFAULT 'recommended',
    status_changed_at timestamptz,
    status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz,
    updated_by uuid,
    CONSTRAINT sourcing_event_award_pkey PRIMARY KEY(id),
    CONSTRAINT sourcing_event_award_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT sourcing_event_award_uq UNIQUE(tenant_id,sourcing_event_id,supplier_id),
    CONSTRAINT sourcing_event_award_amount_chk CHECK(award_amount>=0),
    CONSTRAINT sourcing_event_award_approval_pair_chk CHECK((approved_at IS NULL)=(approved_by IS NULL)),
    CONSTRAINT sourcing_event_award_conversion_pair_chk CHECK((converted_at IS NULL)=(converted_by IS NULL)),
    CONSTRAINT sourcing_event_award_state_chk CHECK(
        (status NOT IN ('approved','converted') OR approved_at IS NOT NULL)
        AND (status<>'converted' OR converted_at IS NOT NULL)
        AND ((status='rejected')=(rejection_reason IS NOT NULL))
    ),
    CONSTRAINT sourcing_event_award_json_chk CHECK(jsonb_typeof(response_snapshot)='object' AND jsonb_typeof(metadata)='object'),
    CONSTRAINT sourcing_event_award_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT sourcing_event_award_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.sourcing_event_award_allocation (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    award_id uuid NOT NULL,
    sourcing_event_demand_id uuid NOT NULL,
    company_code_id uuid NOT NULL,
    awarded_quantity numeric(20,6),
    uom_code text,
    awarded_amount numeric(20,4) NOT NULL,
    currency_code character(3) NOT NULL,
    output_commitment_id uuid,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    status document.sourcing_award_allocation_status_d NOT NULL DEFAULT 'planned',
    status_changed_at timestamptz,
    status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz,
    updated_by uuid,
    CONSTRAINT sourcing_event_award_allocation_pkey PRIMARY KEY(id),
    CONSTRAINT sourcing_event_award_allocation_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT sourcing_event_award_allocation_uq UNIQUE(tenant_id,award_id,sourcing_event_demand_id,company_code_id),
    CONSTRAINT sourcing_event_award_allocation_quantity_chk CHECK((awarded_quantity IS NULL)=(uom_code IS NULL) AND (awarded_quantity IS NULL OR awarded_quantity>0)),
    CONSTRAINT sourcing_event_award_allocation_amount_chk CHECK(awarded_amount>=0 AND (awarded_amount>0 OR coalesce(awarded_quantity,0)>0)),
    CONSTRAINT sourcing_event_award_allocation_conversion_chk CHECK(
        (status='converted' AND output_commitment_id IS NOT NULL)
        OR (status<>'converted' AND output_commitment_id IS NULL)
    ),
    CONSTRAINT sourcing_event_award_allocation_metadata_chk CHECK(jsonb_typeof(metadata)='object'),
    CONSTRAINT sourcing_event_award_allocation_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT sourcing_event_award_allocation_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.sourcing_event_intercompany_allocation (
    id uuid NOT NULL DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    award_allocation_id uuid NOT NULL,
    source_company_code_id uuid NOT NULL,
    beneficiary_company_code_id uuid NOT NULL,
    commitment_id uuid NOT NULL,
    allocation_amount numeric(20,4) NOT NULL,
    currency_code character(3) NOT NULL,
    posting_journal_entry_id uuid,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    status document.sourcing_intercompany_status_d NOT NULL DEFAULT 'planned',
    status_changed_at timestamptz,
    status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL,
    updated_at timestamptz,
    updated_by uuid,
    CONSTRAINT sourcing_event_intercompany_allocation_pkey PRIMARY KEY(id),
    CONSTRAINT sourcing_event_intercompany_allocation_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT sourcing_event_intercompany_allocation_uq UNIQUE(tenant_id,award_allocation_id),
    CONSTRAINT sourcing_event_intercompany_company_chk CHECK(source_company_code_id<>beneficiary_company_code_id),
    CONSTRAINT sourcing_event_intercompany_amount_chk CHECK(allocation_amount>0),
    CONSTRAINT sourcing_event_intercompany_posting_chk CHECK(
        (status='posted' AND posting_journal_entry_id IS NOT NULL)
        OR (status<>'posted' AND posting_journal_entry_id IS NULL)
    ),
    CONSTRAINT sourcing_event_intercompany_metadata_chk CHECK(jsonb_typeof(metadata)='object'),
    CONSTRAINT sourcing_event_intercompany_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT sourcing_event_intercompany_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

COMMENT ON TABLE document.sourcing_event_award_allocation IS
  'Demand-line award fact. A supplier award can cover selected demand rows, quantities and companies; ambiguous company-only percentage allocation is retired.';
COMMENT ON TABLE document.sourcing_event_intercompany_allocation IS
  'Central-buyer accounting bridge from the central commitment to its beneficiary-company award allocation.';

CREATE TABLE document.shift_assignment (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, code text NOT NULL,
    employee_id uuid NOT NULL, shift_type_id uuid NOT NULL, work_date date NOT NULL,
    planned_start_at timestamptz NOT NULL, planned_end_at timestamptz NOT NULL,
    source_type text NOT NULL DEFAULT 'schedule', metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    status document.shift_assignment_status_d NOT NULL DEFAULT 'scheduled', status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT shift_assignment_pkey PRIMARY KEY(id), CONSTRAINT shift_assignment_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT shift_assignment_code_uq UNIQUE(tenant_id,code), CONSTRAINT shift_assignment_employee_date_uq UNIQUE(tenant_id,employee_id,work_date),
    CONSTRAINT shift_assignment_code_chk CHECK(code~'^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT shift_assignment_time_chk CHECK(planned_end_at>planned_start_at),
    CONSTRAINT shift_assignment_date_chk CHECK((planned_start_at AT TIME ZONE 'UTC')::date BETWEEN work_date-1 AND work_date+1),
    CONSTRAINT shift_assignment_source_chk CHECK(source_type~'^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT shift_assignment_json_chk CHECK(jsonb_typeof(metadata)='object'),
    CONSTRAINT shift_assignment_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT shift_assignment_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.time_punch (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, employee_id uuid NOT NULL,
    shift_assignment_id uuid, punch_at timestamptz NOT NULL, punch_type document.attendance_punch_type_d NOT NULL,
    source_type document.attendance_punch_source_d NOT NULL DEFAULT 'manual', device_ref text,
    idempotency_key text NOT NULL, geo_payload jsonb NOT NULL DEFAULT '{}'::jsonb, raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    void_reason text, status document.attendance_punch_status_d NOT NULL DEFAULT 'accepted', status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT time_punch_pkey PRIMARY KEY(id), CONSTRAINT time_punch_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT time_punch_idempotency_uq UNIQUE(tenant_id,idempotency_key),
    CONSTRAINT time_punch_key_chk CHECK(btrim(idempotency_key)<>''),
    CONSTRAINT time_punch_json_chk CHECK(jsonb_typeof(geo_payload)='object' AND jsonb_typeof(raw_payload)='object'),
    CONSTRAINT time_punch_void_chk CHECK((status='voided')=(void_reason IS NOT NULL)),
    CONSTRAINT time_punch_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT time_punch_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.attendance_day (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, employee_id uuid NOT NULL,
    shift_assignment_id uuid, attendance_date date NOT NULL,
    scheduled_minutes integer NOT NULL DEFAULT 0, worked_minutes integer NOT NULL DEFAULT 0,
    paid_minutes integer NOT NULL DEFAULT 0, overtime_minutes integer NOT NULL DEFAULT 0,
    late_minutes integer NOT NULL DEFAULT 0, early_leave_minutes integer NOT NULL DEFAULT 0, absence_minutes integer NOT NULL DEFAULT 0,
    first_in_at timestamptz, last_out_at timestamptz, calculation_version bigint NOT NULL DEFAULT 1,
    source_cutoff_at timestamptz NOT NULL DEFAULT now(), calculation_trace jsonb NOT NULL DEFAULT '{}'::jsonb,
    status document.attendance_day_status_d NOT NULL DEFAULT 'open', status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT attendance_day_pkey PRIMARY KEY(id), CONSTRAINT attendance_day_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT attendance_day_employee_date_uq UNIQUE(tenant_id,employee_id,attendance_date),
    CONSTRAINT attendance_day_minutes_chk CHECK(scheduled_minutes>=0 AND worked_minutes>=0 AND paid_minutes>=0 AND overtime_minutes>=0 AND late_minutes>=0 AND early_leave_minutes>=0 AND absence_minutes>=0),
    CONSTRAINT attendance_day_punch_span_chk CHECK(last_out_at IS NULL OR first_in_at IS NULL OR last_out_at>=first_in_at),
    CONSTRAINT attendance_day_version_chk CHECK(calculation_version>=1),
    CONSTRAINT attendance_day_trace_chk CHECK(jsonb_typeof(calculation_trace)='object'),
    CONSTRAINT attendance_day_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT attendance_day_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.attendance_adjustment_request (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, code text NOT NULL,
    employee_id uuid NOT NULL, attendance_day_id uuid, workflow_request_id uuid,
    adjustment_kind text NOT NULL, reason_code text, reason_text text,
    requested_values jsonb NOT NULL DEFAULT '{}'::jsonb, approved_values jsonb NOT NULL DEFAULT '{}'::jsonb,
    submitted_at timestamptz, submitted_by uuid, approved_at timestamptz, approved_by uuid, decision_reason text,
    status document.hr_approval_status_d NOT NULL DEFAULT 'draft', status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT attendance_adjustment_request_pkey PRIMARY KEY(id), CONSTRAINT attendance_adjustment_request_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT attendance_adjustment_request_code_uq UNIQUE(tenant_id,code),
    CONSTRAINT attendance_adjustment_request_code_chk CHECK(code~'^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT attendance_adjustment_kind_chk CHECK(adjustment_kind~'^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT attendance_adjustment_json_chk CHECK(jsonb_typeof(requested_values)='object' AND jsonb_typeof(approved_values)='object'),
    CONSTRAINT attendance_adjustment_submit_pair_chk CHECK((submitted_at IS NULL)=(submitted_by IS NULL)),
    CONSTRAINT attendance_adjustment_approve_pair_chk CHECK((approved_at IS NULL)=(approved_by IS NULL)),
    CONSTRAINT attendance_adjustment_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT attendance_adjustment_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.compensation_change (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, code text NOT NULL,
    employee_id uuid NOT NULL, current_assignment_id uuid, workflow_request_id uuid,
    change_reason_code text NOT NULL, effective_date date NOT NULL,
    proposed_pay_group_id uuid NOT NULL, proposed_pay_structure_id uuid,
    proposed_currency_code character(3) NOT NULL, proposed_base_amount numeric(18,4) NOT NULL,
    proposed_annualized_amount numeric(18,4), approved_assignment_id uuid,
    submitted_at timestamptz, submitted_by uuid, approved_at timestamptz, approved_by uuid, decision_reason text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    status document.hr_approval_status_d NOT NULL DEFAULT 'draft', status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT compensation_change_pkey PRIMARY KEY(id), CONSTRAINT compensation_change_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT compensation_change_code_uq UNIQUE(tenant_id,code),
    CONSTRAINT compensation_change_code_chk CHECK(code~'^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT compensation_change_reason_chk CHECK(btrim(change_reason_code)<>''),
    CONSTRAINT compensation_change_amount_chk CHECK(proposed_base_amount>=0 AND (proposed_annualized_amount IS NULL OR proposed_annualized_amount>=0)),
    CONSTRAINT compensation_change_materialization_chk CHECK((status='approved')=(approved_assignment_id IS NOT NULL)),
    CONSTRAINT compensation_change_submit_pair_chk CHECK((submitted_at IS NULL)=(submitted_by IS NULL)),
    CONSTRAINT compensation_change_approve_pair_chk CHECK((approved_at IS NULL)=(approved_by IS NULL)),
    CONSTRAINT compensation_change_json_chk CHECK(jsonb_typeof(metadata)='object'),
    CONSTRAINT compensation_change_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT compensation_change_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.employee_tax_declaration (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, code text NOT NULL,
    employee_id uuid NOT NULL, employment_id uuid NOT NULL, tax_year smallint NOT NULL,
    country_code character(2) NOT NULL, version_no integer NOT NULL DEFAULT 1, workflow_request_id uuid,
    submitted_at timestamptz, submitted_by uuid, approved_at timestamptz, approved_by uuid, decision_reason text,
    status document.employee_tax_declaration_status_d NOT NULL DEFAULT 'draft', status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT employee_tax_declaration_pkey PRIMARY KEY(id), CONSTRAINT employee_tax_declaration_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT employee_tax_declaration_code_uq UNIQUE(tenant_id,code),
    CONSTRAINT employee_tax_declaration_version_uq UNIQUE(tenant_id,employee_id,employment_id,country_code,tax_year,version_no),
    CONSTRAINT employee_tax_declaration_code_chk CHECK(code~'^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT employee_tax_declaration_year_chk CHECK(tax_year BETWEEN 1900 AND 9999 AND version_no>=1),
    CONSTRAINT employee_tax_declaration_submit_pair_chk CHECK((submitted_at IS NULL)=(submitted_by IS NULL)),
    CONSTRAINT employee_tax_declaration_approve_pair_chk CHECK((approved_at IS NULL)=(approved_by IS NULL)),
    CONSTRAINT employee_tax_declaration_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT employee_tax_declaration_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.employee_tax_declaration_line (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, employee_tax_declaration_id uuid NOT NULL,
    line_no smallint NOT NULL, declaration_code text NOT NULL, amount numeric(18,4), quantity numeric(18,4),
    payload jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
    updated_at timestamptz, updated_by uuid,
    CONSTRAINT employee_tax_declaration_line_pkey PRIMARY KEY(id), CONSTRAINT employee_tax_declaration_line_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT employee_tax_declaration_line_no_uq UNIQUE(tenant_id,employee_tax_declaration_id,line_no),
    CONSTRAINT employee_tax_declaration_line_number_chk CHECK(line_no>0),
    CONSTRAINT employee_tax_declaration_line_code_chk CHECK(declaration_code~'^[A-Za-z][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT employee_tax_declaration_line_value_chk CHECK(amount IS NOT NULL OR quantity IS NOT NULL),
    CONSTRAINT employee_tax_declaration_line_payload_chk CHECK(jsonb_typeof(payload)='object'),
    CONSTRAINT employee_tax_declaration_line_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.leave_request (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, code text NOT NULL,
    employee_id uuid NOT NULL, leave_type_id uuid NOT NULL, leave_plan_id uuid NOT NULL, workflow_request_id uuid,
    start_date date NOT NULL, end_date date NOT NULL, start_half text, end_half text,
    quantity_unit document.leave_quantity_unit_d NOT NULL, requested_quantity numeric(12,4) NOT NULL,
    approved_quantity numeric(12,4), reason text, attachment_required boolean NOT NULL DEFAULT false,
    submitted_at timestamptz, submitted_by uuid, approved_at timestamptz, approved_by uuid, decision_reason text,
    status document.hr_approval_status_d NOT NULL DEFAULT 'draft', status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT leave_request_pkey PRIMARY KEY(id), CONSTRAINT leave_request_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT leave_request_code_uq UNIQUE(tenant_id,code), CONSTRAINT leave_request_code_chk CHECK(code~'^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT leave_request_dates_chk CHECK(end_date>=start_date),
    CONSTRAINT leave_request_half_chk CHECK((start_half IS NULL OR start_half IN('first','second')) AND (end_half IS NULL OR end_half IN('first','second'))),
    CONSTRAINT leave_request_quantity_chk CHECK(requested_quantity>0 AND (approved_quantity IS NULL OR approved_quantity>=0)),
    CONSTRAINT leave_request_submit_pair_chk CHECK((submitted_at IS NULL)=(submitted_by IS NULL)),
    CONSTRAINT leave_request_approve_pair_chk CHECK((approved_at IS NULL)=(approved_by IS NULL)),
    CONSTRAINT leave_request_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT leave_request_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.leave_balance_entry (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, employee_id uuid NOT NULL,
    leave_plan_id uuid NOT NULL, leave_type_id uuid NOT NULL, entry_date date NOT NULL,
    period_start date, period_end date, quantity_unit document.leave_quantity_unit_d NOT NULL,
    quantity_delta numeric(12,4) NOT NULL, source_entity_type text NOT NULL, source_entity_id uuid,
    idempotency_key text NOT NULL, description text, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
    CONSTRAINT leave_balance_entry_pkey PRIMARY KEY(id), CONSTRAINT leave_balance_entry_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT leave_balance_entry_idempotency_uq UNIQUE(tenant_id,idempotency_key),
    CONSTRAINT leave_balance_entry_period_chk CHECK(period_end IS NULL OR period_start IS NULL OR period_end>=period_start),
    CONSTRAINT leave_balance_entry_source_chk CHECK(source_entity_type~'^[a-z][a-z0-9_.-]{1,126}$' AND btrim(idempotency_key)<>''),
    CONSTRAINT leave_balance_entry_delta_chk CHECK(quantity_delta<>0),
    CONSTRAINT leave_balance_entry_json_chk CHECK(jsonb_typeof(metadata)='object')
);

CREATE TABLE document.people_request (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, code text NOT NULL,
    employee_id uuid NOT NULL, request_type text NOT NULL, target_entity_type text, target_entity_id uuid, workflow_request_id uuid,
    requested_payload jsonb NOT NULL DEFAULT '{}'::jsonb, approved_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    submitted_at timestamptz, submitted_by uuid, approved_at timestamptz, approved_by uuid, decision_reason text,
    status document.hr_approval_status_d NOT NULL DEFAULT 'draft', status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT people_request_pkey PRIMARY KEY(id), CONSTRAINT people_request_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT people_request_code_uq UNIQUE(tenant_id,code), CONSTRAINT people_request_code_chk CHECK(code~'^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT people_request_type_chk CHECK(request_type~'^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT people_request_target_chk CHECK((target_entity_type IS NULL)=(target_entity_id IS NULL)),
    CONSTRAINT people_request_payload_chk CHECK(jsonb_typeof(requested_payload)='object' AND jsonb_typeof(approved_payload)='object'),
    CONSTRAINT people_request_submit_pair_chk CHECK((submitted_at IS NULL)=(submitted_by IS NULL)),
    CONSTRAINT people_request_approve_pair_chk CHECK((approved_at IS NULL)=(approved_by IS NULL)),
    CONSTRAINT people_request_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT people_request_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

-- S2 People/Workforce request authority. Business Partner requests are limited
-- to organization identity and supplier/customer roles.
CREATE TABLE document.workforce_request (
    id                                uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                         uuid        NOT NULL,
    request_no                        text        NOT NULL,
    request_kind                      text        NOT NULL,
    source_kind                       text        NOT NULL,
    target_person_id                  uuid,
    target_employee_id                uuid,
    target_employment_id              uuid,
    legal_entity_id                   uuid        NOT NULL,
    company_code_id                   uuid,
    org_unit_id                       uuid,
    position_id                       uuid,
    protected_profile_content_item_id uuid,
    payload_schema_code               text        NOT NULL,
    payload_schema_version            integer     NOT NULL,
    payload_schema_hash               text        NOT NULL,
    requested_changes                 jsonb       NOT NULL DEFAULT '{}'::jsonb,
    workflow_request_id               uuid,
    materialized_person_id            uuid,
    materialized_employee_id          uuid,
    materialized_employment_id        uuid,
    materialized_work_assignment_id   uuid,
    materialized_principal_id         uuid,
    materialized_onboarding_case_id   uuid,
    materialization_snapshot_id       uuid,
    decision_fingerprint              text,
    application_fingerprint           text,
    idempotency_key                   text        NOT NULL,
    status                            text        NOT NULL DEFAULT 'draft',
    submitted_at                      timestamptz,
    submitted_by                      uuid,
    approved_at                       timestamptz,
    approved_by                       uuid,
    applied_at                        timestamptz,
    applied_by                        uuid,
    failure_code                      text,
    support_reference                 text,
    row_version                       bigint      NOT NULL DEFAULT 1,
    status_changed_at                 timestamptz,
    status_changed_by                 uuid,
    created_at                        timestamptz NOT NULL DEFAULT now(),
    created_by                        uuid        NOT NULL,
    updated_at                        timestamptz,
    updated_by                        uuid,

    CONSTRAINT workforce_request_pkey PRIMARY KEY (id),
    CONSTRAINT workforce_request_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT workforce_request_no_uq UNIQUE (tenant_id, request_no),
    CONSTRAINT workforce_request_idempotency_uq UNIQUE (tenant_id, idempotency_key),
    CONSTRAINT workforce_request_no_chk CHECK (request_no ~ '^[A-Z][A-Z0-9_.-]{2,62}$'),
    CONSTRAINT workforce_request_kind_chk CHECK (
        request_kind IN ('onboard_person', 'add_employment', 'change_employment', 'offboard_employment')
    ),
    CONSTRAINT workforce_request_source_chk CHECK (source_kind IN ('manual', 'portal', 'import', 'api')),
    CONSTRAINT workforce_request_target_chk CHECK (
        (request_kind = 'onboard_person'
            AND target_person_id IS NULL AND target_employee_id IS NULL AND target_employment_id IS NULL)
        OR (request_kind = 'add_employment'
            AND target_person_id IS NOT NULL AND target_employment_id IS NULL)
        OR (request_kind IN ('change_employment', 'offboard_employment')
            AND target_person_id IS NOT NULL AND target_employee_id IS NOT NULL
            AND target_employment_id IS NOT NULL)
    ),
    CONSTRAINT workforce_request_scope_chk CHECK (
        (request_kind IN ('onboard_person', 'add_employment', 'change_employment')
            AND company_code_id IS NOT NULL AND org_unit_id IS NOT NULL)
        OR request_kind = 'offboard_employment'
    ),
    CONSTRAINT workforce_request_profile_evidence_chk CHECK (
        request_kind <> 'onboard_person' OR protected_profile_content_item_id IS NOT NULL
    ),
    CONSTRAINT workforce_request_schema_chk CHECK (
        payload_schema_code ~ '^[a-z][a-z0-9_.-]{1,126}$'
        AND payload_schema_version >= 1
        AND payload_schema_hash ~ '^[a-f0-9]{64}$'
    ),
    CONSTRAINT workforce_request_payload_chk CHECK (
        jsonb_typeof(requested_changes) = 'object'
        AND pg_column_size(requested_changes) <= 262144
    ),
    CONSTRAINT workforce_request_fingerprint_chk CHECK (
        (decision_fingerprint IS NULL OR decision_fingerprint ~ '^[a-f0-9]{64}$')
        AND (application_fingerprint IS NULL OR application_fingerprint ~ '^[a-f0-9]{64}$')
    ),
    CONSTRAINT workforce_request_idempotency_chk CHECK (
        btrim(idempotency_key) = idempotency_key AND length(idempotency_key) BETWEEN 8 AND 200
    ),
    CONSTRAINT workforce_request_status_chk CHECK (status IN (
        'draft', 'validating', 'validation_failed', 'pending_approval', 'returned',
        'approved', 'rejected', 'applying', 'applied', 'failed', 'cancelled', 'superseded'
    )),
    CONSTRAINT workforce_request_application_chk CHECK (
        (status = 'applied') = (
            materialization_snapshot_id IS NOT NULL
            AND application_fingerprint IS NOT NULL
            AND applied_at IS NOT NULL AND applied_by IS NOT NULL
            AND CASE request_kind
                WHEN 'onboard_person' THEN
                    materialized_person_id IS NOT NULL
                    AND materialized_employee_id IS NOT NULL
                    AND materialized_employment_id IS NOT NULL
                    AND materialized_work_assignment_id IS NOT NULL
                WHEN 'add_employment' THEN
                    materialized_person_id = target_person_id
                    AND materialized_employee_id IS NOT NULL
                    AND materialized_employment_id IS NOT NULL
                    AND materialized_work_assignment_id IS NOT NULL
                WHEN 'change_employment' THEN
                    materialized_person_id = target_person_id
                    AND materialized_employee_id = target_employee_id
                    AND materialized_employment_id IS NOT NULL
                    AND materialized_work_assignment_id IS NOT NULL
                WHEN 'offboard_employment' THEN
                    materialized_person_id = target_person_id
                    AND materialized_employee_id = target_employee_id
                    AND materialized_employment_id = target_employment_id
                    AND materialized_work_assignment_id IS NULL
                ELSE false
            END
        )
    ),
    CONSTRAINT workforce_request_submission_pair_chk CHECK ((submitted_at IS NULL) = (submitted_by IS NULL)),
    CONSTRAINT workforce_request_approval_pair_chk CHECK ((approved_at IS NULL) = (approved_by IS NULL)),
    CONSTRAINT workforce_request_apply_pair_chk CHECK ((applied_at IS NULL) = (applied_by IS NULL)),
    CONSTRAINT workforce_request_no_self_approval_chk CHECK (approved_by IS NULL OR approved_by IS DISTINCT FROM submitted_by),
    CONSTRAINT workforce_request_failure_chk CHECK (
        (status = 'failed' AND failure_code ~ '^[A-Z][A-Z0-9_.-]{2,126}$'
                           AND nullif(btrim(support_reference), '') IS NOT NULL)
        OR (status <> 'failed' AND failure_code IS NULL AND support_reference IS NULL)
    ),
    CONSTRAINT workforce_request_row_version_chk CHECK (row_version >= 1),
    CONSTRAINT workforce_request_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT workforce_request_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE document.workforce_request IS
  'People/Workforce-owned request authority for person onboarding and employment lifecycle. It never creates or targets a Business Partner; restricted identity values are referenced through protected content evidence.';

CREATE TABLE document.workforce_request_validation (
 id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, request_id uuid NOT NULL, evaluation_id uuid NOT NULL,
 rule_code text NOT NULL, ruleset_code text NOT NULL, ruleset_version integer NOT NULL, ruleset_hash text NOT NULL,
 severity text NOT NULL, field_path text NOT NULL DEFAULT '$', outcome text NOT NULL, message_code text NOT NULL,
 evidence_reference jsonb NOT NULL DEFAULT '{}'::jsonb, evaluated_at timestamptz NOT NULL, evaluated_by uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
 CONSTRAINT workforce_request_validation_pkey PRIMARY KEY(id), CONSTRAINT workforce_request_validation_tenant_id_uq UNIQUE(tenant_id,id),
 CONSTRAINT workforce_request_validation_coordinate_uq UNIQUE(tenant_id,request_id,evaluation_id,rule_code,field_path),
 CONSTRAINT workforce_request_validation_rule_chk CHECK(rule_code~'^[a-z][a-z0-9_.-]{1,126}$'),
 CONSTRAINT workforce_request_validation_ruleset_chk CHECK(ruleset_code~'^[a-z][a-z0-9_.-]{1,126}$' AND ruleset_version>=1 AND ruleset_hash~'^[a-f0-9]{64}$'),
 CONSTRAINT workforce_request_validation_severity_chk CHECK(severity IN('info','warning','error')),
 CONSTRAINT workforce_request_validation_path_chk CHECK(length(btrim(field_path)) BETWEEN 1 AND 512),
 CONSTRAINT workforce_request_validation_outcome_chk CHECK(outcome IN('passed','failed','skipped')),
 CONSTRAINT workforce_request_validation_message_chk CHECK(message_code~'^[A-Z][A-Z0-9_.-]{1,126}$'),
 CONSTRAINT workforce_request_validation_evidence_chk CHECK(jsonb_typeof(evidence_reference)='object' AND pg_column_size(evidence_reference)<=65536)
);
COMMENT ON TABLE document.workforce_request_validation IS 'Append-only, ruleset-pinned People/Workforce validation evidence reviewed by the approver.';

CREATE TABLE document.hr_case (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, code text NOT NULL, name text NOT NULL,
    employee_id uuid, case_type text NOT NULL DEFAULT 'general', priority document.hr_case_priority_d NOT NULL DEFAULT 'normal',
    assigned_to uuid, opened_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz, closed_at timestamptz,
    resolution_summary text, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    status document.hr_case_status_d NOT NULL DEFAULT 'open', status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT hr_case_pkey PRIMARY KEY(id), CONSTRAINT hr_case_tenant_id_uq UNIQUE(tenant_id,id), CONSTRAINT hr_case_code_uq UNIQUE(tenant_id,code),
    CONSTRAINT hr_case_code_chk CHECK(code~'^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'), CONSTRAINT hr_case_name_chk CHECK(btrim(name)<>''),
    CONSTRAINT hr_case_type_chk CHECK(case_type~'^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT hr_case_dates_chk CHECK((resolved_at IS NULL OR resolved_at>=opened_at) AND (closed_at IS NULL OR closed_at>=coalesce(resolved_at,opened_at))),
    CONSTRAINT hr_case_resolution_chk CHECK(status NOT IN('resolved','closed') OR resolution_summary IS NOT NULL),
    CONSTRAINT hr_case_json_chk CHECK(jsonb_typeof(metadata)='object'),
    CONSTRAINT hr_case_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT hr_case_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.onboarding_case (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, code text NOT NULL, name text NOT NULL,
    person_id uuid NOT NULL, employee_id uuid, target_start_date date, checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
    workflow_request_id uuid, activated_at timestamptz, completed_at timestamptz,
    status document.people_case_status_d NOT NULL DEFAULT 'draft', status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT onboarding_case_pkey PRIMARY KEY(id), CONSTRAINT onboarding_case_tenant_id_uq UNIQUE(tenant_id,id), CONSTRAINT onboarding_case_code_uq UNIQUE(tenant_id,code),
    CONSTRAINT onboarding_case_code_chk CHECK(code~'^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'), CONSTRAINT onboarding_case_name_chk CHECK(btrim(name)<>''),
    CONSTRAINT onboarding_case_json_chk CHECK(jsonb_typeof(checklist)='array'),
    CONSTRAINT onboarding_case_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT onboarding_case_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.offboarding_case (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, code text NOT NULL, name text NOT NULL,
    employee_id uuid NOT NULL, target_exit_date date NOT NULL, reason_code text, checklist jsonb NOT NULL DEFAULT '[]'::jsonb,
    workflow_request_id uuid, activated_at timestamptz, completed_at timestamptz,
    status document.people_case_status_d NOT NULL DEFAULT 'draft', status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT offboarding_case_pkey PRIMARY KEY(id), CONSTRAINT offboarding_case_tenant_id_uq UNIQUE(tenant_id,id), CONSTRAINT offboarding_case_code_uq UNIQUE(tenant_id,code),
    CONSTRAINT offboarding_case_code_chk CHECK(code~'^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'), CONSTRAINT offboarding_case_name_chk CHECK(btrim(name)<>''),
    CONSTRAINT offboarding_case_json_chk CHECK(jsonb_typeof(checklist)='array'),
    CONSTRAINT offboarding_case_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT offboarding_case_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.payroll_period (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, code text NOT NULL, name text NOT NULL,
    pay_group_id uuid NOT NULL, period_year smallint NOT NULL, period_number smallint NOT NULL,
    period_start date NOT NULL, period_end date NOT NULL, pay_date date NOT NULL,
    status document.payroll_period_status_d NOT NULL DEFAULT 'open', status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT payroll_period_pkey PRIMARY KEY(id), CONSTRAINT payroll_period_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT payroll_period_code_uq UNIQUE(tenant_id,code), CONSTRAINT payroll_period_group_period_uq UNIQUE(tenant_id,pay_group_id,period_year,period_number),
    CONSTRAINT payroll_period_code_chk CHECK(code~'^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'), CONSTRAINT payroll_period_name_chk CHECK(btrim(name)<>''),
    CONSTRAINT payroll_period_number_chk CHECK(period_number BETWEEN 1 AND 53),
    CONSTRAINT payroll_period_dates_chk CHECK(period_end>=period_start AND pay_date>=period_start),
    CONSTRAINT payroll_period_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT payroll_period_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.payroll_run (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, code text NOT NULL, name text NOT NULL,
    payroll_period_id uuid NOT NULL, run_type document.payroll_run_type_d NOT NULL DEFAULT 'regular', run_no smallint NOT NULL DEFAULT 1,
    calculation_started_at timestamptz, calculation_completed_at timestamptz,
    approved_at timestamptz, approved_by uuid, posted_at timestamptz, posted_by uuid,
    posted_journal_entry_id uuid, reversal_of_run_id uuid, idempotency_key text NOT NULL,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    status document.payroll_run_status_d NOT NULL DEFAULT 'draft', status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT payroll_run_pkey PRIMARY KEY(id), CONSTRAINT payroll_run_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT payroll_run_code_uq UNIQUE(tenant_id,code), CONSTRAINT payroll_run_period_no_uq UNIQUE(tenant_id,payroll_period_id,run_no),
    CONSTRAINT payroll_run_idempotency_uq UNIQUE(tenant_id,idempotency_key), CONSTRAINT payroll_run_journal_uq UNIQUE(tenant_id,posted_journal_entry_id),
    CONSTRAINT payroll_run_code_chk CHECK(code~'^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'), CONSTRAINT payroll_run_name_chk CHECK(btrim(name)<>''),
    CONSTRAINT payroll_run_no_chk CHECK(run_no>=1 AND btrim(idempotency_key)<>''),
    CONSTRAINT payroll_run_calculation_pair_chk CHECK((calculation_started_at IS NULL)=(calculation_completed_at IS NULL) OR calculation_started_at IS NOT NULL),
    CONSTRAINT payroll_run_approval_pair_chk CHECK((approved_at IS NULL)=(approved_by IS NULL)),
    CONSTRAINT payroll_run_posting_pair_chk CHECK((posted_at IS NULL)=(posted_by IS NULL)),
    CONSTRAINT payroll_run_posted_chk CHECK((status IN('posted','reversed'))=(posted_journal_entry_id IS NOT NULL)),
    CONSTRAINT payroll_run_reversal_chk CHECK((run_type='correction') OR reversal_of_run_id IS NULL),
    CONSTRAINT payroll_run_json_chk CHECK(jsonb_typeof(metadata)='object'),
    CONSTRAINT payroll_run_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT payroll_run_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.payroll_run_employee (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, payroll_run_id uuid NOT NULL, employee_id uuid NOT NULL,
    compensation_assignment_id uuid NOT NULL, inclusion_reason text, exclusion_reason text, error_detail jsonb NOT NULL DEFAULT '{}'::jsonb,
    status document.payroll_run_employee_status_d NOT NULL DEFAULT 'included', status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT payroll_run_employee_pkey PRIMARY KEY(id), CONSTRAINT payroll_run_employee_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT payroll_run_employee_uq UNIQUE(tenant_id,payroll_run_id,employee_id),
    CONSTRAINT payroll_run_employee_reason_chk CHECK((status='excluded')=(exclusion_reason IS NOT NULL)),
    CONSTRAINT payroll_run_employee_error_chk CHECK(jsonb_typeof(error_detail)='object' AND (status<>'error' OR error_detail<>'{}'::jsonb)),
    CONSTRAINT payroll_run_employee_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT payroll_run_employee_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.payroll_result (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, payroll_run_id uuid NOT NULL,
    payroll_run_employee_id uuid NOT NULL, employee_id uuid NOT NULL, currency_code character(3) NOT NULL,
    gross_amount numeric(18,4) NOT NULL DEFAULT 0, employee_deduction_amount numeric(18,4) NOT NULL DEFAULT 0,
    employer_contribution_amount numeric(18,4) NOT NULL DEFAULT 0, net_amount numeric(18,4) NOT NULL DEFAULT 0,
    calculation_trace jsonb NOT NULL DEFAULT '{}'::jsonb,
    status document.payroll_result_status_d NOT NULL DEFAULT 'calculating', status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT payroll_result_pkey PRIMARY KEY(id), CONSTRAINT payroll_result_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT payroll_result_employee_uq UNIQUE(tenant_id,payroll_run_id,employee_id),
    CONSTRAINT payroll_result_run_employee_uq UNIQUE(tenant_id,payroll_run_employee_id),
    CONSTRAINT payroll_result_amount_chk CHECK(gross_amount>=0 AND employee_deduction_amount>=0 AND employer_contribution_amount>=0 AND (status='calculating' OR net_amount>=0)),
    CONSTRAINT payroll_result_net_chk CHECK(abs(net_amount-(gross_amount-employee_deduction_amount))<0.005),
    CONSTRAINT payroll_result_json_chk CHECK(jsonb_typeof(calculation_trace)='object'),
    CONSTRAINT payroll_result_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT payroll_result_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.payroll_result_line (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, payroll_result_id uuid NOT NULL,
    line_no smallint NOT NULL, pay_component_id uuid NOT NULL, component_code_snapshot text NOT NULL,
    component_type_snapshot text NOT NULL, is_employer_cost_snapshot boolean NOT NULL DEFAULT false,
    quantity numeric(18,4), rate numeric(18,8), amount numeric(18,4) NOT NULL,
    currency_code character(3) NOT NULL, formula_expression_version_id uuid,
    evaluated_inputs jsonb NOT NULL DEFAULT '{}'::jsonb, evaluated_outputs jsonb NOT NULL DEFAULT '{}'::jsonb, evaluation_trace jsonb NOT NULL DEFAULT '{}'::jsonb,
    cost_center_id uuid, profit_center_id uuid, project_id uuid, site_id uuid, gl_role text,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
    CONSTRAINT payroll_result_line_pkey PRIMARY KEY(id), CONSTRAINT payroll_result_line_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT payroll_result_line_no_uq UNIQUE(tenant_id,payroll_result_id,line_no),
    CONSTRAINT payroll_result_line_no_chk CHECK(line_no>0), CONSTRAINT payroll_result_line_amount_chk CHECK(amount>=0),
    CONSTRAINT payroll_result_line_component_chk CHECK(component_code_snapshot~'^[A-Za-z][A-Za-z0-9_.-]{0,62}$' AND component_type_snapshot IN('earning','deduction','employer_contribution','statutory','memo')),
    CONSTRAINT payroll_result_line_json_chk CHECK(jsonb_typeof(evaluated_inputs)='object' AND jsonb_typeof(evaluated_outputs)='object' AND jsonb_typeof(evaluation_trace)='object')
);

CREATE TABLE document.policy_acknowledgment (
    id                       uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid        NOT NULL,
    employee_id              uuid        NOT NULL,
    policy_definition_id     uuid        NOT NULL,
    policy_code_snapshot     text        NOT NULL,
    policy_name_snapshot     text        NOT NULL,
    policy_version_snapshot  integer     NOT NULL,
    policy_content_hash      char(64)    NOT NULL,
    acknowledgment_channel   document.policy_acknowledgment_channel_d NOT NULL DEFAULT 'self_service',
    acknowledged_at          timestamptz NOT NULL DEFAULT now(),
    acknowledged_by          uuid        NOT NULL,
    evidence_payload         jsonb       NOT NULL DEFAULT '{}'::jsonb,
    correlation_id           uuid,
    trace_id                 char(32),
    ip_address               inet,
    user_agent               text,
    created_at               timestamptz NOT NULL DEFAULT now(),
    created_by               uuid        NOT NULL,

    CONSTRAINT policy_acknowledgment_pkey PRIMARY KEY(id),
    CONSTRAINT policy_acknowledgment_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT policy_acknowledgment_version_uq
        UNIQUE(tenant_id,employee_id,policy_definition_id,policy_version_snapshot),
    CONSTRAINT policy_acknowledgment_code_chk CHECK(
        policy_code_snapshot~'^[a-zA-Z][a-zA-Z0-9_.-]{1,126}$'
        AND btrim(policy_name_snapshot)<>''
    ),
    CONSTRAINT policy_acknowledgment_version_chk CHECK(policy_version_snapshot>0),
    CONSTRAINT policy_acknowledgment_hash_chk CHECK(policy_content_hash~'^[0-9a-f]{64}$'),
    CONSTRAINT policy_acknowledgment_time_chk CHECK(acknowledged_at<=created_at),
    CONSTRAINT policy_acknowledgment_evidence_chk CHECK(jsonb_typeof(evidence_payload)='object'),
    CONSTRAINT policy_acknowledgment_trace_chk CHECK(trace_id IS NULL OR trace_id~'^[0-9a-f]{32}$'),
    CONSTRAINT policy_acknowledgment_user_agent_chk CHECK(user_agent IS NULL OR length(user_agent)<=2048)
);

COMMENT ON TABLE document.policy_acknowledgment IS
  'Immutable employee acknowledgment evidence for a specific policy version and content hash. The corresponding business event is also written to audit.audit_log.';

CREATE TABLE document.project_task (
    id                       uuid                           NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid                           NOT NULL,
    project_id               uuid                           NOT NULL,
    project_wbs_id           uuid                           NOT NULL,
    code                     text                           NOT NULL,
    title                    text                           NOT NULL,
    description              text,
    task_type                document.project_task_type_d   NOT NULL DEFAULT 'task',
    assignee_principal_id    uuid,
    assignee_team_id         uuid,
    planned_start_at         timestamptz,
    planned_end_at           timestamptz,
    actual_start_at          timestamptz,
    actual_end_at            timestamptz,
    planned_effort_hours     numeric(12,2),
    actual_effort_hours      numeric(12,2),
    completion_pct           numeric(5,2)                   NOT NULL DEFAULT 0,
    metadata                 jsonb                          NOT NULL DEFAULT '{}'::jsonb,
    status                   document.project_task_status_d NOT NULL DEFAULT 'draft',
    status_changed_at        timestamptz,
    status_changed_by        uuid,
    created_at               timestamptz                    NOT NULL DEFAULT now(),
    created_by               uuid                           NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,

    CONSTRAINT project_task_pkey PRIMARY KEY (id),
    CONSTRAINT project_task_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT project_task_project_id_uq UNIQUE (tenant_id, project_id, id),
    CONSTRAINT project_task_code_uq UNIQUE (tenant_id, project_id, code),
    CONSTRAINT project_task_code_fmt_chk CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT project_task_title_chk CHECK (btrim(title) <> ''),
    CONSTRAINT project_task_planned_range_chk CHECK (
        planned_end_at IS NULL OR planned_start_at IS NULL OR planned_end_at >= planned_start_at
    ),
    CONSTRAINT project_task_actual_range_chk CHECK (
        actual_end_at IS NULL OR actual_start_at IS NULL OR actual_end_at >= actual_start_at
    ),
    CONSTRAINT project_task_effort_chk CHECK (
        (planned_effort_hours IS NULL OR planned_effort_hours >= 0)
        AND (actual_effort_hours IS NULL OR actual_effort_hours >= 0)
    ),
    CONSTRAINT project_task_completion_pct_chk CHECK (completion_pct BETWEEN 0 AND 100),
    CONSTRAINT project_task_completion_chk CHECK (
        status <> 'completed'
        OR (completion_pct = 100 AND actual_start_at IS NOT NULL AND actual_end_at IS NOT NULL)
    ),
    CONSTRAINT project_task_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT project_task_status_evidence_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT project_task_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.project_task_requirement (
    id                   uuid                                  NOT NULL DEFAULT shared.uuidv7(),
    tenant_id            uuid                                  NOT NULL,
    project_id           uuid                                  NOT NULL,
    project_task_id      uuid                                  NOT NULL,
    project_item_id      uuid                                  NOT NULL,
    quantity_planned     numeric(18,6)                         NOT NULL,
    quantity_reserved    numeric(18,6)                         NOT NULL DEFAULT 0,
    quantity_issued      numeric(18,6)                         NOT NULL DEFAULT 0,
    quantity_consumed    numeric(18,6)                         NOT NULL DEFAULT 0,
    quantity_returned    numeric(18,6)                         NOT NULL DEFAULT 0,
    uom_code             text                                  NOT NULL,
    metadata             jsonb                                 NOT NULL DEFAULT '{}'::jsonb,
    status               document.project_requirement_status_d NOT NULL DEFAULT 'planned',
    status_changed_at    timestamptz,
    status_changed_by    uuid,
    created_at           timestamptz                           NOT NULL DEFAULT now(),
    created_by           uuid                                  NOT NULL,
    updated_at           timestamptz,
    updated_by           uuid,

    CONSTRAINT project_task_requirement_pkey PRIMARY KEY (id),
    CONSTRAINT project_task_requirement_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT project_task_requirement_coordinate_uq
        UNIQUE (tenant_id, project_task_id, project_item_id),
    CONSTRAINT project_task_requirement_quantity_chk CHECK (
        quantity_planned > 0
        AND quantity_reserved >= 0
        AND quantity_issued >= 0
        AND quantity_consumed >= 0
        AND quantity_returned >= 0
        AND quantity_consumed + quantity_returned <= quantity_issued
    ),
    CONSTRAINT project_task_requirement_metadata_object_chk
        CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT project_task_requirement_status_evidence_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT project_task_requirement_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.budget_profile (
    id                       uuid                             NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                uuid                             NOT NULL,
    project_id               uuid                             NOT NULL,
    company_code_id          uuid                             NOT NULL,
    ledger_book_id           uuid                             NOT NULL,
    code                     text                             NOT NULL,
    name                     text                             NOT NULL,
    description              text,
    budget_type              document.budget_type_d           NOT NULL,
    version_number           integer                          NOT NULL DEFAULT 1,
    supersedes_profile_id    uuid,
    fiscal_year_from         smallint                         NOT NULL,
    fiscal_year_to           smallint                         NOT NULL,
    currency_code            character(3)                     NOT NULL,
    authorized_amount        numeric(18,4)                    NOT NULL,
    approved_at              timestamptz,
    approved_by              uuid,
    metadata                 jsonb                            NOT NULL DEFAULT '{}'::jsonb,
    status                   document.budget_profile_status_d NOT NULL DEFAULT 'draft',
    status_changed_at        timestamptz,
    status_changed_by        uuid,
    created_at               timestamptz                      NOT NULL DEFAULT now(),
    created_by               uuid                             NOT NULL,
    updated_at               timestamptz,
    updated_by               uuid,

    CONSTRAINT budget_profile_pkey PRIMARY KEY (id),
    CONSTRAINT budget_profile_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT budget_profile_project_id_uq UNIQUE (tenant_id, project_id, id),
    CONSTRAINT budget_profile_code_version_uq
        UNIQUE (tenant_id, project_id, ledger_book_id, code, version_number),
    CONSTRAINT budget_profile_code_fmt_chk CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT budget_profile_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT budget_profile_version_chk CHECK (version_number >= 1),
    CONSTRAINT budget_profile_fiscal_range_chk CHECK (
        fiscal_year_from BETWEEN 1900 AND 9999
        AND fiscal_year_to BETWEEN fiscal_year_from AND 9999
    ),
    CONSTRAINT budget_profile_amount_chk CHECK (authorized_amount >= 0),
    CONSTRAINT budget_profile_approval_pair_chk
        CHECK ((approved_at IS NULL) = (approved_by IS NULL)),
    CONSTRAINT budget_profile_approval_status_chk CHECK (
        status NOT IN ('approved', 'active', 'closed')
        OR approved_at IS NOT NULL
    ),
    CONSTRAINT budget_profile_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT budget_profile_status_evidence_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT budget_profile_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.budget_allocation (
    id                     uuid                                NOT NULL DEFAULT shared.uuidv7(),
    tenant_id              uuid                                NOT NULL,
    budget_profile_id      uuid                                NOT NULL,
    project_id             uuid                                NOT NULL,
    project_wbs_id         uuid                                NOT NULL,
    fiscal_year            smallint                            NOT NULL,
    period_from            smallint                            NOT NULL DEFAULT 1,
    period_to              smallint                            NOT NULL DEFAULT 16,
    allocated_amount       numeric(18,4)                       NOT NULL,
    overspend_policy       document.overspend_policy_d         NOT NULL DEFAULT 'block',
    tolerance_pct          numeric(7,4)                        NOT NULL DEFAULT 0,
    requires_approval      boolean                             NOT NULL DEFAULT false,
    approval_threshold     numeric(18,4),
    metadata               jsonb                               NOT NULL DEFAULT '{}'::jsonb,
    status                 document.budget_allocation_status_d NOT NULL DEFAULT 'draft',
    status_changed_at      timestamptz,
    status_changed_by      uuid,
    created_at             timestamptz                         NOT NULL DEFAULT now(),
    created_by             uuid                                NOT NULL,
    updated_at             timestamptz,
    updated_by             uuid,

    CONSTRAINT budget_allocation_pkey PRIMARY KEY (id),
    CONSTRAINT budget_allocation_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT budget_allocation_profile_id_uq
        UNIQUE (tenant_id, budget_profile_id, id),
    CONSTRAINT budget_allocation_coordinate_uq
        UNIQUE (tenant_id, budget_profile_id, project_wbs_id, fiscal_year, period_from, period_to),
    CONSTRAINT budget_allocation_fiscal_year_chk CHECK (fiscal_year BETWEEN 1900 AND 9999),
    CONSTRAINT budget_allocation_period_chk CHECK (
        period_from BETWEEN 1 AND 16 AND period_to BETWEEN period_from AND 16
    ),
    CONSTRAINT budget_allocation_amount_chk CHECK (allocated_amount >= 0),
    CONSTRAINT budget_allocation_tolerance_chk CHECK (tolerance_pct BETWEEN 0 AND 100),
    CONSTRAINT budget_allocation_approval_chk CHECK (
        (NOT requires_approval AND approval_threshold IS NULL)
        OR (requires_approval AND approval_threshold IS NOT NULL AND approval_threshold >= 0)
    ),
    CONSTRAINT budget_allocation_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT budget_allocation_status_evidence_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT budget_allocation_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE document.budget_profile IS
  'Governed project budget version for one company, ledger book, fiscal range, and currency.';
COMMENT ON TABLE document.budget_allocation IS
  'Authorized WBS allocation. Reserved, consumed, released, and available balances are ledger-derived and intentionally absent.';

CREATE TABLE document.planning_scenario (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid        NOT NULL,
    planning_model_id     uuid        NOT NULL,
    code                  text        NOT NULL,
    version_no            integer     NOT NULL DEFAULT 1,
    name                  text        NOT NULL,
    description           text,
    based_on_scenario_id  uuid,
    probability_weight    numeric(7,6) NOT NULL DEFAULT 1,
    approved_at           timestamptz,
    approved_by           uuid,
    metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                document.planning_scenario_status_d NOT NULL DEFAULT 'draft',
    status_changed_at     timestamptz,
    status_changed_by     uuid,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT planning_scenario_pkey PRIMARY KEY (id),
    CONSTRAINT planning_scenario_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT planning_scenario_model_id_uq UNIQUE (tenant_id, planning_model_id, id),
    CONSTRAINT planning_scenario_code_version_uq
        UNIQUE (tenant_id, planning_model_id, code, version_no),
    CONSTRAINT planning_scenario_code_chk
        CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT planning_scenario_version_chk CHECK (version_no > 0),
    CONSTRAINT planning_scenario_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT planning_scenario_description_chk
        CHECK (description IS NULL OR btrim(description) <> ''),
    CONSTRAINT planning_scenario_probability_chk
        CHECK (probability_weight BETWEEN 0 AND 1),
    CONSTRAINT planning_scenario_not_self_based_chk
        CHECK (based_on_scenario_id IS NULL OR based_on_scenario_id <> id),
    CONSTRAINT planning_scenario_approval_pair_chk
        CHECK ((approved_at IS NULL) = (approved_by IS NULL)),
    CONSTRAINT planning_scenario_approval_status_chk
        CHECK (status NOT IN ('approved', 'superseded') OR approved_at IS NOT NULL),
    CONSTRAINT planning_scenario_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT planning_scenario_status_pair_chk
        CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT planning_scenario_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.planning_scenario_line (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid        NOT NULL,
    planning_scenario_id  uuid        NOT NULL,
    planning_model_id     uuid        NOT NULL,
    line_no               integer     NOT NULL,
    planning_driver_id    uuid,
    gl_account_id         uuid,
    cost_center_id        uuid,
    profit_center_id      uuid,
    project_id            uuid,
    project_wbs_id        uuid,
    fiscal_year           smallint    NOT NULL,
    period_number         smallint    NOT NULL,
    currency_code         character(3) NOT NULL,
    planned_amount        numeric(18,4) NOT NULL,
    baseline_amount       numeric(18,4),
    source_type           document.planning_line_source_d NOT NULL DEFAULT 'manual',
    source_reference_id   uuid,
    confidence            numeric(7,6) NOT NULL DEFAULT 1,
    description           text,
    metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,
    updated_at            timestamptz,
    updated_by            uuid,

    CONSTRAINT planning_scenario_line_pkey PRIMARY KEY (id),
    CONSTRAINT planning_scenario_line_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT planning_scenario_line_number_uq
        UNIQUE (tenant_id, planning_scenario_id, line_no),
    CONSTRAINT planning_scenario_line_number_chk CHECK (line_no > 0),
    CONSTRAINT planning_scenario_line_fiscal_year_chk
        CHECK (fiscal_year BETWEEN 1900 AND 9999),
    CONSTRAINT planning_scenario_line_period_chk CHECK (period_number BETWEEN 1 AND 16),
    CONSTRAINT planning_scenario_line_wbs_chk
        CHECK (project_wbs_id IS NULL OR project_id IS NOT NULL),
    CONSTRAINT planning_scenario_line_source_chk CHECK (
        source_type <> 'driver' OR planning_driver_id IS NOT NULL
    ),
    CONSTRAINT planning_scenario_line_confidence_chk CHECK (confidence BETWEEN 0 AND 1),
    CONSTRAINT planning_scenario_line_description_chk
        CHECK (description IS NULL OR btrim(description) <> ''),
    CONSTRAINT planning_scenario_line_metadata_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT planning_scenario_line_audit_pair_chk
        CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE document.planning_scenario IS
  'Editable and versioned planning document. Approval freezes its normalized period lines; calculation results are written to ledger.planning_output.';

COMMENT ON TABLE document.planning_scenario_line IS
  'One planning input coordinate for one fiscal period. Replaces legacy control.forecast_line and its period_amounts JSON.';

-- First desired-state movement wave from the legacy Neon document catalogue.

CREATE TABLE document.asset_transaction (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL,
    code text NOT NULL DEFAULT '', name text NOT NULL DEFAULT '', company_code_id uuid NOT NULL,
    asset_id uuid NOT NULL, asset_book_id uuid, book_type text,
    txn_type document.asset_transaction_type_d NOT NULL,
    amount numeric(18,4) NOT NULL, currency_code character(3) NOT NULL DEFAULT 'USD',
    effective_date date NOT NULL, fiscal_year smallint NOT NULL, period_number smallint NOT NULL,
    from_values jsonb, to_values jsonb, reference_je_id uuid,
    depreciation_run_id uuid, depreciation_run_line_id uuid,
    reversal_of_id uuid, is_reversal boolean NOT NULL DEFAULT false,
    performed_by uuid NOT NULL, performed_at timestamptz NOT NULL DEFAULT now(), notes text,
    posted_at timestamptz, posted_by uuid, tags jsonb NOT NULL DEFAULT '[]'::jsonb,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    status document.asset_transaction_status_d NOT NULL DEFAULT 'draft',
    is_active boolean GENERATED ALWAYS AS (status IN ('draft','posted')) STORED,
    status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
    updated_at timestamptz, updated_by uuid,
    CONSTRAINT asset_transaction_pkey PRIMARY KEY(id),
    CONSTRAINT asset_transaction_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT asset_transaction_amount_chk CHECK(amount >= 0),
    CONSTRAINT asset_transaction_period_chk CHECK(period_number BETWEEN 1 AND 16),
    CONSTRAINT asset_transaction_reversal_chk CHECK((NOT is_reversal AND reversal_of_id IS NULL) OR (is_reversal AND reversal_of_id IS NOT NULL)),
    CONSTRAINT asset_transaction_self_chk CHECK(reversal_of_id IS DISTINCT FROM id),
    CONSTRAINT asset_transaction_json_chk CHECK((from_values IS NULL OR jsonb_typeof(from_values)='object') AND (to_values IS NULL OR jsonb_typeof(to_values)='object') AND jsonb_typeof(tags)='array' AND jsonb_typeof(metadata)='object'),
    CONSTRAINT asset_transaction_post_pair_chk CHECK((posted_at IS NULL)=(posted_by IS NULL)),
    CONSTRAINT asset_transaction_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT asset_transaction_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

COMMENT ON COLUMN document.asset_transaction.book_type IS
  'Compatibility cache of master.ledger_book.category. asset_book_id remains authoritative.';

CREATE TABLE document.fx_revaluation_run (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL,
    company_code_id uuid NOT NULL, book_id uuid NOT NULL,
    fiscal_year smallint NOT NULL, period_number smallint NOT NULL,
    revaluation_date date NOT NULL, posting_date date,
    rate_type_used text NOT NULL DEFAULT 'PERIOD_END', rate_source document.fx_rate_source_d NOT NULL DEFAULT 'MANUAL',
    functional_currency character(3) NOT NULL,
    total_unrealized_gain numeric(18,4) NOT NULL DEFAULT 0, total_unrealized_loss numeric(18,4) NOT NULL DEFAULT 0,
    net_amount numeric(18,4) GENERATED ALWAYS AS (total_unrealized_gain-total_unrealized_loss) STORED,
    line_count integer NOT NULL DEFAULT 0, revaluation_je_id uuid, reversal_je_id uuid,
    is_auto_reversed boolean NOT NULL DEFAULT true, auto_reverse_date date, idempotency_key text,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    status document.fx_revaluation_run_status_d NOT NULL DEFAULT 'draft',
    is_active boolean GENERATED ALWAYS AS (status IN ('draft','calculated','posted')) STORED,
    status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
    updated_at timestamptz, updated_by uuid,
    CONSTRAINT fx_revaluation_run_pkey PRIMARY KEY(id),
    CONSTRAINT fx_revaluation_run_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT fx_revaluation_run_gain_chk CHECK(total_unrealized_gain>=0),
    CONSTRAINT fx_revaluation_run_loss_chk CHECK(total_unrealized_loss>=0),
    CONSTRAINT fx_revaluation_run_line_count_chk CHECK(line_count>=0),
    CONSTRAINT fx_revaluation_run_period_chk CHECK(period_number BETWEEN 1 AND 16),
    CONSTRAINT fx_revaluation_run_reverse_chk CHECK(NOT is_auto_reversed OR auto_reverse_date IS NOT NULL),
    CONSTRAINT fx_revaluation_run_je_chk CHECK(revaluation_je_id IS DISTINCT FROM reversal_je_id),
    CONSTRAINT fx_revaluation_run_metadata_chk CHECK(jsonb_typeof(metadata)='object'),
    CONSTRAINT fx_revaluation_run_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT fx_revaluation_run_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.intercompany_agreement (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL,
    code text NOT NULL DEFAULT '', name text NOT NULL DEFAULT '', company_code_id uuid NOT NULL,
    agreement_number text NOT NULL, source_company_code_id uuid NOT NULL, dest_company_code_id uuid NOT NULL,
    agreement_type document.intercompany_agreement_type_d NOT NULL, description text,
    transfer_pricing_method document.transfer_pricing_method_d NOT NULL,
    markup_pct numeric(7,4), arm_length_basis text, currency_code character(3) NOT NULL,
    base_currency_code character(3), annual_value numeric(18,4), total_value numeric(18,4),
    effective_from date NOT NULL, effective_to date, priority smallint NOT NULL DEFAULT 0,
    conflict_strategy document.intercompany_conflict_strategy_d NOT NULL DEFAULT 'HIGHEST_PRIORITY',
    version smallint NOT NULL DEFAULT 1, supersedes_id uuid,
    cost_center_id uuid, profit_center_id uuid, project_id uuid, site_id uuid, dimension_set_id uuid,
    agreement_owner_id uuid, approved_at timestamptz, approved_by uuid, workflow_request_id uuid,
    tags jsonb NOT NULL DEFAULT '[]'::jsonb, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    status document.intercompany_agreement_status_d NOT NULL DEFAULT 'draft',
    is_active boolean GENERATED ALWAYS AS (status IN ('draft','active')) STORED,
    status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
    updated_at timestamptz, updated_by uuid,
    CONSTRAINT intercompany_agreement_pkey PRIMARY KEY(id),
    CONSTRAINT intercompany_agreement_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT intercompany_agreement_number_uq UNIQUE(tenant_id,company_code_id,agreement_number),
    CONSTRAINT intercompany_agreement_number_chk CHECK(btrim(agreement_number)<>''),
    CONSTRAINT intercompany_agreement_company_chk CHECK(source_company_code_id<>dest_company_code_id),
    CONSTRAINT intercompany_agreement_dates_chk CHECK(effective_to IS NULL OR effective_to>=effective_from),
    CONSTRAINT intercompany_agreement_markup_chk CHECK(markup_pct IS NULL OR markup_pct BETWEEN -100 AND 1000),
    CONSTRAINT intercompany_agreement_priority_chk CHECK(priority>=0),
    CONSTRAINT intercompany_agreement_version_chk CHECK(version>=1),
    CONSTRAINT intercompany_agreement_self_chk CHECK(supersedes_id IS DISTINCT FROM id),
    CONSTRAINT intercompany_agreement_json_chk CHECK(jsonb_typeof(tags)='array' AND jsonb_typeof(metadata)='object'),
    CONSTRAINT intercompany_agreement_approval_pair_chk CHECK((approved_at IS NULL)=(approved_by IS NULL)),
    CONSTRAINT intercompany_agreement_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT intercompany_agreement_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.intercompany_transaction (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL,
    code text NOT NULL DEFAULT '', name text NOT NULL DEFAULT '', company_code_id uuid NOT NULL,
    ic_txn_number text NOT NULL, source_company_code_id uuid NOT NULL, dest_company_code_id uuid NOT NULL,
    txn_type document.intercompany_transaction_type_d NOT NULL,
    document_date date NOT NULL, posting_date date NOT NULL, currency_code character(3) NOT NULL,
    amount numeric(18,4) NOT NULL, agreement_id uuid, transfer_price numeric(18,4), arm_length_price numeric(18,4),
    pricing_variance numeric(18,4) GENERATED ALWAYS AS (transfer_price-arm_length_price) STORED,
    base_currency_code character(3) NOT NULL, exchange_rate numeric(18,10), base_amount numeric(18,4),
    source_je_id uuid, dest_je_id uuid, mirror_txn_id uuid, is_mirror boolean NOT NULL DEFAULT false,
    match_status document.intercompany_match_status_d NOT NULL DEFAULT 'UNMATCHED',
    matched_at timestamptz, discrepancy_amount numeric(18,4), discrepancy_reason text,
    netting_batch_id uuid, fiscal_year smallint NOT NULL, period_number smallint,
    cost_center_id uuid, profit_center_id uuid, project_id uuid, site_id uuid, dimension_set_id uuid,
    description text, tags jsonb NOT NULL DEFAULT '[]'::jsonb, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    status document.intercompany_transaction_status_d NOT NULL DEFAULT 'draft',
    is_active boolean GENERATED ALWAYS AS (status IN ('draft','created','posted','netted')) STORED,
    status_changed_at timestamptz, status_changed_by uuid, posted_at timestamptz, posted_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
    updated_at timestamptz, updated_by uuid,
    CONSTRAINT intercompany_transaction_pkey PRIMARY KEY(id),
    CONSTRAINT intercompany_transaction_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT intercompany_transaction_number_uq UNIQUE(tenant_id,company_code_id,ic_txn_number),
    CONSTRAINT intercompany_transaction_number_chk CHECK(btrim(ic_txn_number)<>''),
    CONSTRAINT intercompany_transaction_amount_chk CHECK(amount>0),
    CONSTRAINT intercompany_transaction_dates_chk CHECK(document_date<=posting_date),
    CONSTRAINT intercompany_transaction_company_chk CHECK(source_company_code_id<>dest_company_code_id),
    CONSTRAINT intercompany_transaction_fx_chk CHECK(currency_code=base_currency_code OR exchange_rate>0),
    CONSTRAINT intercompany_transaction_period_chk CHECK(period_number IS NULL OR period_number BETWEEN 1 AND 16),
    CONSTRAINT intercompany_transaction_mirror_chk CHECK(mirror_txn_id IS DISTINCT FROM id),
    CONSTRAINT intercompany_transaction_json_chk CHECK(jsonb_typeof(tags)='array' AND jsonb_typeof(metadata)='object'),
    CONSTRAINT intercompany_transaction_post_pair_chk CHECK((posted_at IS NULL)=(posted_by IS NULL)),
    CONSTRAINT intercompany_transaction_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT intercompany_transaction_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.ic_elimination (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL,
    code text NOT NULL DEFAULT '', name text NOT NULL DEFAULT '', company_code_id uuid NOT NULL,
    elimination_code text NOT NULL, source_company_code_id uuid NOT NULL, counterparty_company_code_id uuid NOT NULL,
    elimination_type document.ic_elimination_type_d NOT NULL, consolidation_group text NOT NULL,
    book_id uuid NOT NULL, fiscal_year smallint NOT NULL, period_number smallint NOT NULL,
    elimination_date date NOT NULL, posting_date date NOT NULL, elimination_amount numeric(18,4) NOT NULL,
    currency_code character(3) NOT NULL, functional_currency_code character(3) NOT NULL,
    exchange_rate numeric(18,10), functional_amount numeric(18,4), line_count smallint NOT NULL DEFAULT 0,
    ic_transaction_id uuid, je_id uuid, reversal_je_id uuid,
    decision_score numeric(5,4), approval_route document.ic_approval_route_d NOT NULL DEFAULT 'STANDARD',
    tags jsonb NOT NULL DEFAULT '[]'::jsonb, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    status document.ic_elimination_status_d NOT NULL DEFAULT 'calculated',
    is_active boolean GENERATED ALWAYS AS (status IN ('calculated','approved','posted')) STORED,
    status_changed_at timestamptz, status_changed_by uuid,
    approved_at timestamptz, approved_by uuid, posted_at timestamptz, posted_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
    updated_at timestamptz, updated_by uuid,
    CONSTRAINT ic_elimination_pkey PRIMARY KEY(id),
    CONSTRAINT ic_elimination_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT ic_elimination_code_uq UNIQUE(tenant_id,company_code_id,elimination_code),
    CONSTRAINT ic_elimination_code_chk CHECK(btrim(elimination_code)<>''),
    CONSTRAINT ic_elimination_amount_chk CHECK(elimination_amount>0),
    CONSTRAINT ic_elimination_company_chk CHECK(source_company_code_id<>counterparty_company_code_id),
    CONSTRAINT ic_elimination_dates_chk CHECK(elimination_date<=posting_date),
    CONSTRAINT ic_elimination_fx_chk CHECK(currency_code=functional_currency_code OR exchange_rate>0),
    CONSTRAINT ic_elimination_period_chk CHECK(period_number BETWEEN 1 AND 16),
    CONSTRAINT ic_elimination_score_chk CHECK(decision_score IS NULL OR decision_score BETWEEN 0 AND 1),
    CONSTRAINT ic_elimination_je_chk CHECK(je_id IS DISTINCT FROM reversal_je_id),
    CONSTRAINT ic_elimination_json_chk CHECK(jsonb_typeof(tags)='array' AND jsonb_typeof(metadata)='object'),
    CONSTRAINT ic_elimination_approval_pair_chk CHECK((approved_at IS NULL)=(approved_by IS NULL)),
    CONSTRAINT ic_elimination_post_pair_chk CHECK((posted_at IS NULL)=(posted_by IS NULL)),
    CONSTRAINT ic_elimination_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT ic_elimination_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.match_exception (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL,
    invoice_match_case_id uuid NOT NULL, invoice_line_id uuid NOT NULL,
    exception_type document.match_exception_type_d NOT NULL, exception_subtype text,
    expected_value numeric(18,4), actual_value numeric(18,4), variance_amount numeric(18,4) NOT NULL,
    variance_pct numeric(7,4), currency_code character(3) NOT NULL,
    tolerance_pct numeric(5,2), tolerance_amount numeric(18,4), is_within_tolerance boolean NOT NULL DEFAULT false,
    resolution_type document.match_exception_resolution_d, resolution_notes text,
    resolved_by uuid, resolved_at timestamptz, workflow_request_id uuid,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    status document.match_exception_status_d NOT NULL DEFAULT 'open',
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
    updated_at timestamptz, updated_by uuid,
    CONSTRAINT match_exception_pkey PRIMARY KEY(id),
    CONSTRAINT match_exception_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT match_exception_resolved_pair_chk CHECK((resolved_by IS NULL)=(resolved_at IS NULL)),
    CONSTRAINT match_exception_tolerance_chk CHECK((tolerance_pct IS NULL OR tolerance_pct BETWEEN 0 AND 100) AND (tolerance_amount IS NULL OR tolerance_amount>=0)),
    CONSTRAINT match_exception_metadata_chk CHECK(jsonb_typeof(metadata)='object'),
    CONSTRAINT match_exception_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.netting_batch (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL,
    code text NOT NULL DEFAULT '', name text NOT NULL DEFAULT '', company_code_id uuid NOT NULL,
    batch_number text NOT NULL, company_code_a_id uuid NOT NULL, company_code_b_id uuid NOT NULL,
    batch_date date NOT NULL, cut_off_date date NOT NULL, settlement_date date,
    currency_code character(3) NOT NULL,
    gross_amount_a_to_b numeric(18,4) NOT NULL DEFAULT 0, gross_amount_b_to_a numeric(18,4) NOT NULL DEFAULT 0,
    gross_amount numeric(18,4) GENERATED ALWAYS AS (gross_amount_a_to_b+gross_amount_b_to_a) STORED,
    net_amount numeric(18,4) NOT NULL DEFAULT 0, net_direction document.netting_direction_d NOT NULL DEFAULT 'ZERO',
    txn_count integer NOT NULL DEFAULT 0, settlement_je_id uuid,
    fiscal_year smallint NOT NULL, period_number smallint, idempotency_key text,
    tags jsonb NOT NULL DEFAULT '[]'::jsonb, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    status document.netting_batch_status_d NOT NULL DEFAULT 'draft',
    is_active boolean GENERATED ALWAYS AS (status IN ('draft','calculated','approved')) STORED,
    status_changed_at timestamptz, status_changed_by uuid,
    settled_at timestamptz, settled_by uuid, approved_at timestamptz, approved_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
    updated_at timestamptz, updated_by uuid,
    CONSTRAINT netting_batch_pkey PRIMARY KEY(id),
    CONSTRAINT netting_batch_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT netting_batch_number_uq UNIQUE(tenant_id,company_code_id,batch_number),
    CONSTRAINT netting_batch_number_chk CHECK(btrim(batch_number)<>''),
    CONSTRAINT netting_batch_company_chk CHECK(company_code_a_id<>company_code_b_id),
    CONSTRAINT netting_batch_cutoff_chk CHECK(cut_off_date<=batch_date),
    CONSTRAINT netting_batch_settlement_chk CHECK(settlement_date IS NULL OR settlement_date>=batch_date),
    CONSTRAINT netting_batch_amount_chk CHECK(gross_amount_a_to_b>=0 AND gross_amount_b_to_a>=0 AND net_amount>=0),
    CONSTRAINT netting_batch_count_chk CHECK(txn_count>=0),
    CONSTRAINT netting_batch_period_chk CHECK(period_number IS NULL OR period_number BETWEEN 1 AND 16),
    CONSTRAINT netting_batch_json_chk CHECK(jsonb_typeof(tags)='array' AND jsonb_typeof(metadata)='object'),
    CONSTRAINT netting_batch_settled_pair_chk CHECK((settled_at IS NULL)=(settled_by IS NULL)),
    CONSTRAINT netting_batch_approved_pair_chk CHECK((approved_at IS NULL)=(approved_by IS NULL)),
    CONSTRAINT netting_batch_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT netting_batch_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.obligation_horizon (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL,
    commitment_id uuid NOT NULL, schedule_id uuid, fiscal_year smallint NOT NULL,
    period_from smallint NOT NULL DEFAULT 1, period_to smallint NOT NULL DEFAULT 12,
    obligation_tier document.obligation_tier_d NOT NULL DEFAULT 'PLANNED',
    amount numeric(18,4) NOT NULL, original_amount numeric(18,4), currency_code character(3) NOT NULL,
    fp_id uuid, intent_id uuid, company_code_id uuid,
    spread_method document.obligation_spread_method_d NOT NULL DEFAULT 'EVEN', period_amounts jsonb,
    confidence numeric(3,2) NOT NULL DEFAULT 1.00,
    source_type document.obligation_source_type_d NOT NULL DEFAULT 'CONTRACT',
    escalation_formula jsonb, escalation_applied_at timestamptz,
    contract_currency_code character(3), contract_amount numeric(18,4), exchange_rate numeric(12,6), rate_type text,
    retention_pct numeric(5,2), retention_release_date date, amendment_count smallint NOT NULL DEFAULT 0,
    variance_to_original numeric(18,4) GENERATED ALWAYS AS (amount-original_amount) STORED,
    promoted_at timestamptz, reserved_at timestamptz, funding_txn_id uuid,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    status document.obligation_horizon_status_d NOT NULL DEFAULT 'active',
    is_active boolean GENERATED ALWAYS AS (status='active') STORED,
    status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
    updated_at timestamptz, updated_by uuid,
    CONSTRAINT obligation_horizon_pkey PRIMARY KEY(id),
    CONSTRAINT obligation_horizon_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT obligation_horizon_amount_chk CHECK(amount>=0),
    CONSTRAINT obligation_horizon_original_chk CHECK(original_amount IS NULL OR original_amount>=0),
    CONSTRAINT obligation_horizon_period_chk CHECK(period_from BETWEEN 1 AND 12 AND period_to BETWEEN period_from AND 12),
    CONSTRAINT obligation_horizon_confidence_chk CHECK(confidence BETWEEN 0 AND 1),
    CONSTRAINT obligation_horizon_retention_chk CHECK(retention_pct IS NULL OR retention_pct BETWEEN 0 AND 100),
    CONSTRAINT obligation_horizon_amendment_chk CHECK(amendment_count>=0),
    CONSTRAINT obligation_horizon_period_amounts_chk CHECK(period_amounts IS NULL OR jsonb_typeof(period_amounts)='object'),
    CONSTRAINT obligation_horizon_escalation_chk CHECK(escalation_formula IS NULL OR jsonb_typeof(escalation_formula)='object'),
    CONSTRAINT obligation_horizon_metadata_chk CHECK(jsonb_typeof(metadata)='object'),
    CONSTRAINT obligation_horizon_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT obligation_horizon_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.payment_remittance_output (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, company_code_id uuid NOT NULL,
    remittance_number text NOT NULL, payment_entry_id uuid NOT NULL, supplier_id uuid NOT NULL,
    currency_code character(3) NOT NULL, total_amount numeric(18,4) NOT NULL, net_remitted numeric(18,4) NOT NULL,
    delivery_method document.remittance_delivery_method_d NOT NULL DEFAULT 'EMAIL',
    delivered_at timestamptz, delivery_status document.remittance_delivery_status_d NOT NULL DEFAULT 'pending',
    render_output_id uuid, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    status document.payment_remittance_status_d NOT NULL DEFAULT 'draft',
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
    updated_at timestamptz, updated_by uuid,
    CONSTRAINT payment_remittance_output_pkey PRIMARY KEY(id),
    CONSTRAINT payment_remittance_output_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT payment_remittance_output_number_uq UNIQUE(tenant_id,company_code_id,remittance_number),
    CONSTRAINT payment_remittance_output_number_chk CHECK(btrim(remittance_number)<>''),
    CONSTRAINT payment_remittance_output_amount_chk CHECK(total_amount>=0 AND net_remitted>=0 AND net_remitted<=total_amount),
    CONSTRAINT payment_remittance_output_delivery_chk CHECK(delivery_status<>'delivered' OR delivered_at IS NOT NULL),
    CONSTRAINT payment_remittance_output_metadata_chk CHECK(jsonb_typeof(metadata)='object'),
    CONSTRAINT payment_remittance_output_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.payment_term_discount_result (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL,
    payment_id uuid NOT NULL, invoice_id uuid NOT NULL, commitment_id uuid,
    payment_term_id uuid, discount_tier_id uuid,
    allocated_payment_amount numeric(18,4) NOT NULL, qualification_date date NOT NULL,
    qualified_tier_no smallint, qualified_days_actual smallint NOT NULL,
    discount_basis_amount numeric(18,4) NOT NULL, discount_pct numeric(5,2), discount_amount numeric(18,4) NOT NULL,
    application_status document.payment_discount_application_status_d NOT NULL,
    is_reversal boolean NOT NULL DEFAULT false, reverses_id uuid,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
    CONSTRAINT payment_term_discount_result_pkey PRIMARY KEY(id),
    CONSTRAINT payment_term_discount_result_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT payment_term_discount_result_amount_chk CHECK(allocated_payment_amount>=0 AND discount_basis_amount>=0 AND discount_amount>=0),
    CONSTRAINT payment_term_discount_result_days_chk CHECK(qualified_days_actual>=0),
    CONSTRAINT payment_term_discount_result_pct_chk CHECK(discount_pct IS NULL OR discount_pct BETWEEN 0 AND 100),
    CONSTRAINT payment_term_discount_result_term_chk CHECK(commitment_id IS NOT NULL OR payment_term_id IS NOT NULL),
    CONSTRAINT payment_term_discount_result_reverse_chk CHECK((NOT is_reversal) OR reverses_id IS NOT NULL),
    CONSTRAINT payment_term_discount_result_self_chk CHECK(reverses_id IS DISTINCT FROM id),
    CONSTRAINT payment_term_discount_result_metadata_chk CHECK(jsonb_typeof(metadata)='object')
);

CREATE TABLE document.wht_certificate (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL,
    code text NOT NULL DEFAULT '', name text NOT NULL DEFAULT '', company_code_id uuid NOT NULL,
    counterparty_id uuid NOT NULL, tax_type_id uuid NOT NULL, section_code text,
    certificate_no text NOT NULL, certificate_series text, period_from date NOT NULL, period_to date NOT NULL,
    gross_amount numeric(18,4) NOT NULL, wht_amount numeric(18,4) NOT NULL, currency_code character(3) NOT NULL,
    source_transaction_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
    status document.wht_certificate_status_d NOT NULL DEFAULT 'draft',
    issued_at timestamptz, issued_by uuid, voided_at timestamptz, voided_by uuid, void_reason text,
    superseded_by_id uuid, created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
    updated_at timestamptz, updated_by uuid,
    CONSTRAINT wht_certificate_pkey PRIMARY KEY(id),
    CONSTRAINT wht_certificate_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT wht_certificate_number_uq UNIQUE(tenant_id,company_code_id,certificate_no),
    CONSTRAINT wht_certificate_number_chk CHECK(btrim(certificate_no)<>''),
    CONSTRAINT wht_certificate_period_chk CHECK(period_to>=period_from),
    CONSTRAINT wht_certificate_amount_chk CHECK(gross_amount>=0 AND wht_amount>=0 AND wht_amount<=gross_amount),
    CONSTRAINT wht_certificate_issued_chk CHECK(status<>'issued' OR issued_at IS NOT NULL),
    CONSTRAINT wht_certificate_voided_chk CHECK(status<>'voided' OR (voided_at IS NOT NULL AND void_reason IS NOT NULL)),
    CONSTRAINT wht_certificate_issue_pair_chk CHECK((issued_at IS NULL)=(issued_by IS NULL)),
    CONSTRAINT wht_certificate_void_pair_chk CHECK((voided_at IS NULL)=(voided_by IS NULL)),
    CONSTRAINT wht_certificate_self_chk CHECK(superseded_by_id IS DISTINCT FROM id),
    CONSTRAINT wht_certificate_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.import_request (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL,
    entity_name text NOT NULL, file_ref text NOT NULL, file_name text NOT NULL, file_size_bytes bigint,
    file_format document.import_file_format_d NOT NULL DEFAULT 'csv', mapping_config jsonb NOT NULL DEFAULT '[]'::jsonb,
    import_mode document.import_mode_d NOT NULL DEFAULT 'create', options jsonb NOT NULL DEFAULT '{}'::jsonb,
    total_rows integer, processed_rows integer NOT NULL DEFAULT 0, success_count integer NOT NULL DEFAULT 0, error_count integer NOT NULL DEFAULT 0,
    status document.import_request_status_d NOT NULL DEFAULT 'uploaded', error_summary jsonb,
    started_at timestamptz, completed_at timestamptz, submitted_by uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
    updated_at timestamptz, updated_by uuid,
    CONSTRAINT import_request_pkey PRIMARY KEY(id),
    CONSTRAINT import_request_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT import_request_entity_chk CHECK(btrim(entity_name)<>''),
    CONSTRAINT import_request_file_chk CHECK(btrim(file_ref)<>'' AND btrim(file_name)<>'' AND (file_size_bytes IS NULL OR file_size_bytes>=0)),
    CONSTRAINT import_request_json_chk CHECK(jsonb_typeof(mapping_config)='array' AND jsonb_typeof(options)='object' AND (error_summary IS NULL OR jsonb_typeof(error_summary)='object')),
    CONSTRAINT import_request_count_chk CHECK((total_rows IS NULL OR total_rows>=0) AND processed_rows>=0 AND success_count>=0 AND error_count>=0),
    CONSTRAINT import_request_dates_chk CHECK(completed_at IS NULL OR (started_at IS NOT NULL AND completed_at>=started_at)),
    CONSTRAINT import_request_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.import_request_chunk (
    id                 uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id          uuid        NOT NULL,
    import_request_id  uuid        NOT NULL,
    chunk_index        integer     NOT NULL,
    row_start          integer     NOT NULL,
    row_end            integer     NOT NULL,
    status             document.import_chunk_status_d NOT NULL DEFAULT 'pending',
    success_count      integer     NOT NULL DEFAULT 0,
    error_count        integer     NOT NULL DEFAULT 0,
    errors             jsonb       NOT NULL DEFAULT '[]'::jsonb,
    job_id             text,
    attempt_count      integer     NOT NULL DEFAULT 0,
    max_attempts       integer     NOT NULL DEFAULT 3,
    started_at         timestamptz,
    completed_at       timestamptz,
    status_changed_at  timestamptz,
    status_changed_by  uuid,
    created_at         timestamptz NOT NULL DEFAULT now(),
    created_by         uuid        NOT NULL,
    updated_at         timestamptz,
    updated_by         uuid,

    CONSTRAINT import_request_chunk_pkey PRIMARY KEY(id),
    CONSTRAINT import_request_chunk_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT import_request_chunk_index_uq UNIQUE(tenant_id,import_request_id,chunk_index),
    CONSTRAINT import_request_chunk_index_chk CHECK(chunk_index>=0),
    CONSTRAINT import_request_chunk_range_chk CHECK(row_start>=1 AND row_end>=row_start),
    CONSTRAINT import_request_chunk_counts_chk CHECK(
        success_count>=0 AND error_count>=0
        AND success_count+error_count<=row_end-row_start+1
    ),
    CONSTRAINT import_request_chunk_errors_chk CHECK(jsonb_typeof(errors)='array'),
    CONSTRAINT import_request_chunk_attempt_chk CHECK(
        attempt_count>=0 AND max_attempts>0 AND attempt_count<=max_attempts
    ),
    CONSTRAINT import_request_chunk_job_chk CHECK(job_id IS NULL OR btrim(job_id)<>''),
    CONSTRAINT import_request_chunk_timeline_chk CHECK(
        (started_at IS NULL OR started_at>=created_at)
        AND (completed_at IS NULL OR (started_at IS NOT NULL AND completed_at>=started_at))
    ),
    CONSTRAINT import_request_chunk_terminal_chk CHECK(
        (status IN ('completed','failed','cancelled'))=(completed_at IS NOT NULL)
    ),
    CONSTRAINT import_request_chunk_status_pair_chk CHECK(
        (status_changed_at IS NULL)=(status_changed_by IS NULL)
    ),
    CONSTRAINT import_request_chunk_audit_pair_chk CHECK(
        (updated_at IS NULL)=(updated_by IS NULL)
    )
);

COMMENT ON TABLE document.import_request_chunk IS
  'Independently retryable, tenant-scoped row range within an import request. Chunk state is mutable; lifecycle evidence is also appended to audit.audit_log.';

CREATE TABLE document.render_output (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL,
    template_version_id uuid, letterhead_id uuid, brand_profile_id uuid,
    entity_name text NOT NULL, entity_id text NOT NULL, operation text NOT NULL,
    variant text NOT NULL DEFAULT 'default', locale text NOT NULL DEFAULT 'en', timezone text NOT NULL DEFAULT 'UTC',
    status document.render_output_status_d NOT NULL DEFAULT 'QUEUED',
    job_queue_id text, attempt_count integer NOT NULL DEFAULT 0, max_attempts integer NOT NULL DEFAULT 3,
    last_attempt_at timestamptz, trace_id char(32),
    storage_bucket text, storage_key text, storage_version_id text, mime_type text DEFAULT 'application/pdf',
    size_bytes bigint, checksum text, manifest_json jsonb NOT NULL DEFAULT '{}'::jsonb, manifest_version integer NOT NULL DEFAULT 1,
    input_payload_hash text, replaces_output_id uuid,
    error_code text, error_message text, failure_category document.render_failure_category_d,
    replay_count integer NOT NULL DEFAULT 0, last_replayed_at timestamptz, last_replayed_by uuid,
    rendered_at timestamptz, delivered_at timestamptz, archived_at timestamptz,
    revoked_at timestamptz, revoked_by uuid, revoke_reason text,
    status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
    updated_at timestamptz, updated_by uuid,
    CONSTRAINT render_output_pkey PRIMARY KEY(id),
    CONSTRAINT render_output_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT render_output_entity_chk CHECK(btrim(entity_name)<>'' AND btrim(entity_id)<>''),
    CONSTRAINT render_output_operation_chk CHECK(btrim(operation)<>''),
    CONSTRAINT render_output_size_chk CHECK(size_bytes IS NULL OR size_bytes>=0),
    CONSTRAINT render_output_attempt_chk CHECK(attempt_count>=0 AND max_attempts>0 AND attempt_count<=max_attempts),
    CONSTRAINT render_output_replay_chk CHECK(replay_count>=0),
    CONSTRAINT render_output_attempt_time_chk CHECK(last_attempt_at IS NULL OR last_attempt_at>=created_at),
    CONSTRAINT render_output_trace_chk CHECK(trace_id IS NULL OR trace_id~'^[0-9a-f]{32}$'),
    CONSTRAINT render_output_manifest_chk CHECK(manifest_version>=1 AND jsonb_typeof(manifest_json)='object' AND manifest_json ? 'entity_name'),
    CONSTRAINT render_output_storage_chk CHECK((storage_bucket IS NULL)=(storage_key IS NULL)),
    CONSTRAINT render_output_revoke_pair_chk CHECK((revoked_at IS NULL)=(revoked_by IS NULL)),
    CONSTRAINT render_output_replayed_pair_chk CHECK((last_replayed_at IS NULL)=(last_replayed_by IS NULL)),
    CONSTRAINT render_output_failed_chk CHECK(status<>'FAILED' OR (error_code IS NOT NULL AND failure_category IS NOT NULL)),
    CONSTRAINT render_output_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT render_output_self_chk CHECK(replaces_output_id IS DISTINCT FROM id),
    CONSTRAINT render_output_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

CREATE TABLE document.user_profile_update_request (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL,
    code text NOT NULL, name text NOT NULL, created_by uuid NOT NULL,
    requested_by uuid NOT NULL, principal_id uuid NOT NULL, principal_snapshot jsonb,
    request_scope text[] NOT NULL DEFAULT '{}'::text[], priority document.profile_update_priority_d NOT NULL DEFAULT 'normal',
    change_reason text, requested_changes jsonb NOT NULL DEFAULT '{}'::jsonb, workflow_request_id uuid,
    status document.profile_update_request_status_d NOT NULL DEFAULT 'draft',
    is_active boolean GENERATED ALWAYS AS (status IN ('draft','submitted','awaiting_approval','revision_requested')) STORED,
    status_changed_at timestamptz, status_changed_by uuid, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz, updated_by uuid,
    CONSTRAINT user_profile_update_request_pkey PRIMARY KEY(id),
    CONSTRAINT user_profile_update_request_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT user_profile_update_request_code_uq UNIQUE(tenant_id,code),
    CONSTRAINT user_profile_update_request_code_chk CHECK(code~'^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT user_profile_update_request_name_chk CHECK(btrim(name)<>''),
    CONSTRAINT user_profile_update_request_self_service_chk CHECK(requested_by=created_by AND principal_id=created_by),
    CONSTRAINT user_profile_update_request_json_chk CHECK((principal_snapshot IS NULL OR jsonb_typeof(principal_snapshot)='object') AND jsonb_typeof(requested_changes)='object' AND jsonb_typeof(metadata)='object'),
    CONSTRAINT user_profile_update_request_status_pair_chk CHECK((status_changed_at IS NULL)=(status_changed_by IS NULL)),
    CONSTRAINT user_profile_update_request_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);


COMMENT ON TABLE document.attachment_series IS
  'Logical identity for a versioned attachment. current_attachment_id tracks the latest active version; all entity links target the series, not individual versions.';


COMMENT ON TABLE document.attachment_legal_hold IS
  'Evidentiary hold on an attachment series. Active when released_at IS NULL. Placement evidence is immutable. Release requires all three fields. Rows cannot be deleted through the application role.';


COMMENT ON TABLE document.attachment_legal_hold_event IS
  'Append-only evidentiary log for hold placement and release. Answers who did what, when, and why. Rows are immutable once written.';


COMMENT ON TABLE document.attachment_derivative IS
  'Idempotent renditions derived from an attachment version (thumbnail, preview PDF, page image). Deduplication key: (attachment_id, derivative_type, rendition_code, source_sha256, specification_hash). Only status=ready renditions are exposed by download APIs.';

CREATE TABLE document.multipart_upload_part (
    tenant_id           uuid        NOT NULL,
    multipart_upload_id uuid        NOT NULL,
    part_number         integer     NOT NULL,
    etag                text        NOT NULL,
    size_bytes          bigint,
    checksum            text,
    recorded_at         timestamptz NOT NULL DEFAULT now(),
    recorded_by         uuid        NOT NULL,

    CONSTRAINT multipart_upload_part_pkey PRIMARY KEY (tenant_id, multipart_upload_id, part_number),
    CONSTRAINT multipart_upload_part_part_number_chk CHECK (part_number BETWEEN 1 AND 10000),
    CONSTRAINT multipart_upload_part_etag_chk CHECK (btrim(etag) <> ''),
    CONSTRAINT multipart_upload_part_size_chk CHECK (size_bytes IS NULL OR size_bytes >= 0),
    CONSTRAINT multipart_upload_part_checksum_chk
        CHECK (checksum IS NULL OR checksum ~ '^[a-f0-9]{64}$')
);

COMMENT ON TABLE document.multipart_upload_part IS
  'Per-part evidence for multipart upload integrity. Append-only. Rows are immutable once written.';

-- Source-neutral Business Partner onboarding and amendment envelope.
-- Manual NEON, governed import, API, and MESH proposals converge here. The
-- approved master remains in master.business_partner and its role extensions.
CREATE TABLE document.business_partner_invitation (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, invitation_no text NOT NULL,
    journey_kind text NOT NULL, registration_mode text NOT NULL DEFAULT 'self_service',
    requested_role document.business_partner_requested_role_d NOT NULL, scope_kind text NOT NULL,
    requested_operating_organization_id uuid, company_code_id uuid, legal_entity_id uuid, org_unit_id uuid, position_id uuid,
    intended_party_name text NOT NULL, invitee_email_hash text NOT NULL, token_hash text NOT NULL,
    expires_at timestamptz NOT NULL, status text NOT NULL DEFAULT 'pending', resend_count integer NOT NULL DEFAULT 0,
    last_sent_at timestamptz NOT NULL DEFAULT now(), applicant_principal_id uuid,
    business_partner_request_id uuid, entity_case_id uuid,
    accepted_at timestamptz, cancelled_at timestamptz, superseded_at timestamptz,
    applicant_access_revoked_at timestamptz, applicant_access_revoked_by uuid,
    idempotency_key text NOT NULL, row_version bigint NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT business_partner_invitation_pkey PRIMARY KEY(id), CONSTRAINT business_partner_invitation_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT business_partner_invitation_no_uq UNIQUE(tenant_id,invitation_no), CONSTRAINT business_partner_invitation_idempotency_uq UNIQUE(tenant_id,idempotency_key), CONSTRAINT business_partner_invitation_token_uq UNIQUE(tenant_id,token_hash),
    CONSTRAINT business_partner_invitation_journey_chk CHECK(journey_kind IN('supplier','customer','candidate')), CONSTRAINT business_partner_invitation_mode_chk CHECK(registration_mode IN('self_service','on_behalf','integration')),
    CONSTRAINT business_partner_invitation_role_chk CHECK((journey_kind='supplier' AND requested_role='supplier') OR (journey_kind='customer' AND requested_role='customer') OR (journey_kind='candidate' AND requested_role='workforce')),
    CONSTRAINT business_partner_invitation_scope_chk CHECK((scope_kind='commercial' AND journey_kind IN('supplier','customer') AND requested_operating_organization_id IS NOT NULL AND legal_entity_id IS NULL AND org_unit_id IS NULL AND position_id IS NULL) OR (scope_kind='workforce' AND journey_kind='candidate' AND requested_operating_organization_id IS NULL AND legal_entity_id IS NOT NULL AND company_code_id IS NOT NULL AND org_unit_id IS NOT NULL)),
    CONSTRAINT business_partner_invitation_hash_chk CHECK(invitee_email_hash~'^[a-f0-9]{64}$' AND token_hash~'^[a-f0-9]{64}$'), CONSTRAINT business_partner_invitation_status_chk CHECK(status IN('pending','accepted','cancelled','expired','superseded')),
    CONSTRAINT business_partner_invitation_lifecycle_chk CHECK((status='pending' AND applicant_principal_id IS NULL AND business_partner_request_id IS NULL AND entity_case_id IS NULL AND accepted_at IS NULL AND cancelled_at IS NULL AND superseded_at IS NULL) OR (status='accepted' AND applicant_principal_id IS NOT NULL AND num_nonnulls(business_partner_request_id,entity_case_id)=1 AND accepted_at IS NOT NULL AND cancelled_at IS NULL AND superseded_at IS NULL) OR (status='cancelled' AND accepted_at IS NULL AND cancelled_at IS NOT NULL AND superseded_at IS NULL) OR (status='expired' AND accepted_at IS NULL AND cancelled_at IS NULL AND superseded_at IS NULL) OR (status='superseded' AND accepted_at IS NULL AND cancelled_at IS NULL AND superseded_at IS NOT NULL)),
    CONSTRAINT business_partner_invitation_expiry_chk CHECK(expires_at>created_at), CONSTRAINT business_partner_invitation_name_chk CHECK(length(btrim(intended_party_name)) BETWEEN 1 AND 512), CONSTRAINT business_partner_invitation_idempotency_chk CHECK(btrim(idempotency_key)=idempotency_key AND length(idempotency_key) BETWEEN 8 AND 200), CONSTRAINT business_partner_invitation_version_chk CHECK(row_version>=1 AND resend_count>=0), CONSTRAINT business_partner_invitation_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL)), CONSTRAINT business_partner_invitation_access_revocation_chk CHECK((applicant_access_revoked_at IS NULL AND applicant_access_revoked_by IS NULL) OR (status='accepted' AND applicant_principal_id IS NOT NULL AND applicant_access_revoked_at IS NOT NULL AND applicant_access_revoked_by IS NOT NULL))
);
COMMENT ON TABLE document.business_partner_invitation IS 'Tenant-bound, expiring, single-use invitation authority for supplier, customer, and candidate onboarding. Only SHA-256 token and email hashes persist; raw secrets must never be stored or logged.';

-- Compatibility disposition G0: retained as the employee-only IAM saga intent
-- for supported-upgrade parity. G1/G5 may replace it only after measured
-- consumer cutover; it is deliberately not an employee or principal authority.
CREATE TABLE document.workforce_iam_projection (
    id                           uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                    uuid        NOT NULL,
    employee_id                  uuid        NOT NULL,
    employer_organization_id     uuid        NOT NULL,
    requested_principal_creation boolean     NOT NULL DEFAULT false,
    desired_state                text        NOT NULL DEFAULT 'member',
    observed_state               text        NOT NULL DEFAULT 'pending',
    attempt_count                integer     NOT NULL DEFAULT 0,
    last_error_code              text,
    next_attempt_at              timestamptz NOT NULL DEFAULT now(),
    idempotency_key              text        NOT NULL,
    row_version                  bigint      NOT NULL DEFAULT 1,
    created_at                   timestamptz NOT NULL DEFAULT now(),
    created_by                   uuid        NOT NULL,
    updated_at                   timestamptz,
    updated_by                   uuid,
    CONSTRAINT workforce_iam_projection_pkey PRIMARY KEY (id),
    CONSTRAINT workforce_iam_projection_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT workforce_iam_projection_employee_uq UNIQUE (tenant_id, employee_id),
    CONSTRAINT workforce_iam_projection_idempotency_uq UNIQUE (tenant_id, idempotency_key),
    CONSTRAINT workforce_iam_projection_employee_fk FOREIGN KEY (tenant_id, employee_id) REFERENCES master.employee(tenant_id, id) ON DELETE RESTRICT,
    CONSTRAINT workforce_iam_projection_state_chk CHECK (desired_state IN ('member', 'suspended', 'deprovisioned') AND observed_state IN ('pending', 'provisioned', 'failed', 'deprovisioned')),
    CONSTRAINT workforce_iam_projection_attempt_chk CHECK (attempt_count >= 0 AND btrim(idempotency_key) <> ''),
    CONSTRAINT workforce_iam_projection_audit_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);
COMMENT ON TABLE document.workforce_iam_projection IS
    'COMPATIBILITY; owner=People/IAM; disposition=retain for supported-upgrade parity then replace through governed-case IAM projection after measured zero legacy use. Employee-only saga intent; never Person, employee, or principal authority.';

CREATE TABLE document.business_partner_request (
    id                              uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                       uuid        NOT NULL,
    request_no                      text        NOT NULL,
    request_kind                    document.business_partner_request_kind_d NOT NULL,
    source_kind                     text        NOT NULL,
    registration_mode               text        NOT NULL DEFAULT 'direct',
    invitation_id                   uuid,
    applicant_principal_id          uuid,
    represented_party_name          text,
    representation_evidence_id      uuid,
    target_business_partner_id      uuid,
    base_record_version             bigint,
    base_snapshot_id                uuid,
    base_payload_hash               text,
    source_system_code              text,
    source_entity_code              text,
    source_entity_id                text,
    source_entity_code_value        text,
    source_projection_id            uuid,
    source_version                  bigint,
    source_payload_hash             text,
    requested_role                  document.business_partner_requested_role_d,
    operating_organization_id       uuid,
    company_code_id                 uuid,
    legal_entity_id                 uuid,
    org_unit_id                     uuid,
    position_id                     uuid,
    payload_schema_code             text        NOT NULL,
    payload_schema_version          integer     NOT NULL,
    payload_schema_hash             text        NOT NULL,
    proposed_payload                jsonb       NOT NULL DEFAULT '{}'::jsonb,
    extension_mode                  text        NOT NULL DEFAULT 'legacy_untyped',
    extension_fingerprint           text,
    extension_counts                jsonb       NOT NULL DEFAULT '{"addresses":0,"contactPersons":0,"contactChannels":0,"identifiers":0,"taxRegistrations":0,"classifications":0,"certifications":0}'::jsonb,
    validation_summary              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    duplicate_summary               jsonb       NOT NULL DEFAULT '{}'::jsonb,
    change_impact                   jsonb       NOT NULL DEFAULT '{}'::jsonb,
    workflow_request_id             uuid,
    materialized_business_partner_id uuid,
    materialized_supplier_id        uuid,
    materialized_customer_id        uuid,
    materialized_person_id          uuid,
    materialized_employee_id        uuid,
    materialized_employment_id      uuid,
    materialized_work_assignment_id uuid,
    materialized_principal_id       uuid,
    materialized_bank_verification_id uuid,
    materialized_supplier_company_profile_id uuid,
    materialized_customer_company_profile_id uuid,
    materialized_operating_organization_assignment_id uuid,
    materialization_snapshot_id     uuid,
    application_idempotency_key     text,
    application_fingerprint         text,
    application_result_kind         text,
    application_reason_code         text,
    decision_fingerprint            text,
    idempotency_key                 text        NOT NULL,
    status                          text        NOT NULL DEFAULT 'draft',
    submitted_at                    timestamptz,
    submitted_by                    uuid,
    approved_at                     timestamptz,
    approved_by                     uuid,
    applied_at                      timestamptz,
    applied_by                      uuid,
    failure_code                    text,
    failure_detail                  text,
    support_reference               text,
    row_version                     bigint      NOT NULL DEFAULT 1,
    status_changed_at               timestamptz,
    status_changed_by               uuid,
    created_at                      timestamptz NOT NULL DEFAULT now(),
    created_by                      uuid        NOT NULL,
    updated_at                      timestamptz,
    updated_by                      uuid,

    CONSTRAINT business_partner_request_pkey PRIMARY KEY (id),
    CONSTRAINT business_partner_request_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT business_partner_request_no_uq UNIQUE (tenant_id, request_no),
    CONSTRAINT business_partner_request_idempotency_uq UNIQUE (tenant_id, idempotency_key),
    CONSTRAINT business_partner_request_no_chk CHECK (request_no ~ '^[A-Z][A-Z0-9_.-]{2,62}$'),
    CONSTRAINT business_partner_request_kind_chk CHECK (request_kind IN (
        'new_partner', 'amend_partner', 'add_supplier', 'add_customer',
        'add_workforce',
        'assign_organization', 'configure_company', 'change_bank',
        'change_employment',
        'deactivate', 'reactivate', 'archive'
    )),
    CONSTRAINT business_partner_request_source_chk CHECK (source_kind IN ('manual', 'portal', 'mesh', 'import', 'api')),
    CONSTRAINT business_partner_request_registration_mode_chk CHECK (registration_mode IN ('direct', 'self_service', 'on_behalf', 'integration')),
    CONSTRAINT business_partner_request_registration_channel_chk CHECK (
        (registration_mode = 'self_service' AND source_kind = 'portal' AND invitation_id IS NOT NULL AND applicant_principal_id IS NOT NULL AND represented_party_name IS NULL AND representation_evidence_id IS NULL)
        OR (registration_mode = 'on_behalf' AND source_kind = 'manual' AND invitation_id IS NULL AND applicant_principal_id IS NULL AND nullif(btrim(represented_party_name), '') IS NOT NULL)
        OR (registration_mode = 'integration' AND source_kind IN ('mesh', 'import', 'api') AND invitation_id IS NULL AND applicant_principal_id IS NULL AND represented_party_name IS NULL AND representation_evidence_id IS NULL)
        OR (registration_mode = 'direct' AND source_kind = 'manual' AND invitation_id IS NULL AND applicant_principal_id IS NULL AND represented_party_name IS NULL AND representation_evidence_id IS NULL)
    ),
    CONSTRAINT business_partner_request_target_chk CHECK (
        (request_kind = 'new_partner' AND target_business_partner_id IS NULL)
        OR (request_kind <> 'new_partner' AND target_business_partner_id IS NOT NULL)
    ),
    CONSTRAINT business_partner_request_base_chk CHECK (base_record_version IS NULL OR base_record_version >= 1),
    CONSTRAINT business_partner_request_base_snapshot_chk CHECK (
        (base_snapshot_id IS NULL) = (base_payload_hash IS NULL)
        AND (base_payload_hash IS NULL OR base_payload_hash ~ '^[a-f0-9]{64}$')
    ),
    CONSTRAINT business_partner_request_source_coordinates_chk CHECK (
        source_kind <> 'mesh'
        OR (
            source_system_code = 'athyper_mesh'
            AND nullif(btrim(source_entity_code), '') IS NOT NULL
            AND nullif(btrim(source_entity_id), '') IS NOT NULL
            AND source_projection_id IS NOT NULL
            AND source_version >= 1
            AND source_payload_hash ~ '^[a-f0-9]{64}$'
        )
    ),
    CONSTRAINT business_partner_request_source_code_chk CHECK (
        source_system_code IS NULL OR source_system_code ~ '^[a-z][a-z0-9_.-]{1,62}$'
    ),
    CONSTRAINT business_partner_request_source_entity_chk CHECK (
        source_entity_code IS NULL OR source_entity_code ~ '^[a-z][a-z0-9_.-]{1,126}$'
    ),
    CONSTRAINT business_partner_request_source_version_chk CHECK (source_version IS NULL OR source_version >= 1),
    CONSTRAINT business_partner_request_source_hash_chk CHECK (
        source_payload_hash IS NULL OR source_payload_hash ~ '^[a-f0-9]{64}$'
    ),
    CONSTRAINT business_partner_request_schema_chk CHECK (
        payload_schema_code ~ '^[a-z][a-z0-9_.-]{1,126}$'
        AND payload_schema_version >= 1
        AND payload_schema_hash ~ '^[a-f0-9]{64}$'
    ),
    CONSTRAINT business_partner_request_payload_chk CHECK (
        jsonb_typeof(proposed_payload) = 'object'
        AND jsonb_typeof(validation_summary) = 'object'
        AND jsonb_typeof(duplicate_summary) = 'object'
        AND jsonb_typeof(change_impact) = 'object'
        AND pg_column_size(proposed_payload) <= 1048576
        AND pg_column_size(validation_summary) <= 262144
        AND pg_column_size(duplicate_summary) <= 262144
        AND pg_column_size(change_impact) <= 262144
    ),
    CONSTRAINT business_partner_request_extension_mode_chk CHECK (
        extension_mode IN ('legacy_untyped', 'typed_v1')
    ),
    CONSTRAINT business_partner_request_extension_fingerprint_chk CHECK (
        (extension_mode = 'legacy_untyped' AND extension_fingerprint IS NULL)
        OR (extension_mode = 'typed_v1' AND extension_fingerprint ~ '^[a-f0-9]{64}$')
    ),
    CONSTRAINT business_partner_request_extension_counts_chk CHECK (
        jsonb_typeof(extension_counts) = 'object'
        AND extension_counts = jsonb_build_object(
            'addresses', extension_counts->'addresses',
            'contactPersons', extension_counts->'contactPersons',
            'contactChannels', extension_counts->'contactChannels',
            'identifiers', extension_counts->'identifiers',
            'taxRegistrations', extension_counts->'taxRegistrations',
            'classifications', extension_counts->'classifications',
            'certifications', extension_counts->'certifications'
        )
        AND NOT jsonb_path_exists(
            extension_counts,
            '$.keyvalue().value ? (@.type() != "number" || @ < 0 || @ % 1 != 0)'
        )
    ),
    CONSTRAINT business_partner_request_fingerprint_chk CHECK (
        (decision_fingerprint IS NULL OR decision_fingerprint ~ '^[a-f0-9]{64}$')
        AND (application_fingerprint IS NULL OR application_fingerprint ~ '^[a-f0-9]{64}$')
    ),
    CONSTRAINT business_partner_request_application_key_chk CHECK (
        application_idempotency_key IS NULL OR (
            btrim(application_idempotency_key) = application_idempotency_key
            AND length(application_idempotency_key) BETWEEN 8 AND 200
        )
    ),
    CONSTRAINT business_partner_request_result_kind_chk CHECK (application_result_kind IS NULL OR application_result_kind IN (
        'partner_role_created', 'workforce_created', 'partner_amended', 'organization_assigned', 'company_configured',
        'bank_verification_started', 'employment_changed', 'partner_deactivated', 'partner_reactivated', 'partner_archived'
    )),
    CONSTRAINT business_partner_request_safe_reason_chk CHECK (
        application_reason_code IS NULL OR application_reason_code ~ '^[A-Z][A-Z0-9_.-]{2,126}$'
    ),
    CONSTRAINT business_partner_request_materialization_evidence_chk CHECK (
        (status = 'applied') = (
            materialized_business_partner_id IS NOT NULL
            AND materialization_snapshot_id IS NOT NULL
            AND application_idempotency_key IS NOT NULL
            AND application_fingerprint IS NOT NULL
            AND application_result_kind IS NOT NULL
            AND applied_at IS NOT NULL AND applied_by IS NOT NULL
            AND CASE request_kind
              WHEN 'new_partner' THEN (requested_role='workforce' AND application_result_kind='workforce_created' AND materialized_person_id IS NOT NULL AND materialized_employee_id IS NOT NULL AND materialized_employment_id IS NOT NULL AND materialized_work_assignment_id IS NOT NULL) OR (requested_role='supplier' AND application_result_kind='partner_role_created' AND materialized_supplier_id IS NOT NULL AND materialized_customer_id IS NULL AND materialized_person_id IS NULL AND materialized_operating_organization_assignment_id IS NOT NULL) OR (requested_role='customer' AND application_result_kind='partner_role_created' AND materialized_customer_id IS NOT NULL AND materialized_supplier_id IS NULL AND materialized_operating_organization_assignment_id IS NOT NULL AND materialized_person_id IS NULL AND num_nonnulls(materialized_employee_id,materialized_employment_id,materialized_work_assignment_id)=0)
              WHEN 'add_supplier' THEN requested_role='supplier' AND application_result_kind='partner_role_created' AND materialized_supplier_id IS NOT NULL AND materialized_operating_organization_assignment_id IS NOT NULL
              WHEN 'add_customer' THEN requested_role='customer' AND application_result_kind='partner_role_created' AND materialized_customer_id IS NOT NULL AND materialized_operating_organization_assignment_id IS NOT NULL
              WHEN 'add_workforce' THEN requested_role='workforce' AND application_result_kind='workforce_created' AND materialized_person_id IS NOT NULL AND materialized_employee_id IS NOT NULL AND materialized_employment_id IS NOT NULL AND materialized_work_assignment_id IS NOT NULL
              WHEN 'amend_partner' THEN requested_role IS NULL AND application_result_kind='partner_amended' AND num_nonnulls(materialized_supplier_id,materialized_customer_id,materialized_person_id,materialized_employee_id,materialized_employment_id,materialized_work_assignment_id,materialized_operating_organization_assignment_id,materialized_bank_verification_id)=0
              WHEN 'assign_organization' THEN requested_role IN('supplier','customer') AND application_result_kind='organization_assigned' AND materialized_operating_organization_assignment_id IS NOT NULL AND num_nonnulls(materialized_supplier_company_profile_id,materialized_customer_company_profile_id,materialized_person_id,materialized_employee_id,materialized_employment_id,materialized_work_assignment_id,materialized_bank_verification_id)=0
              WHEN 'configure_company' THEN requested_role IN('supplier','customer') AND application_result_kind='company_configured' AND num_nonnulls(materialized_supplier_company_profile_id,materialized_customer_company_profile_id)=1 AND num_nonnulls(materialized_person_id,materialized_employee_id,materialized_employment_id,materialized_work_assignment_id,materialized_bank_verification_id)=0
              WHEN 'change_bank' THEN requested_role='supplier' AND application_result_kind='bank_verification_started' AND materialized_bank_verification_id IS NOT NULL
              WHEN 'change_employment' THEN requested_role='workforce' AND application_result_kind='employment_changed' AND materialized_person_id IS NOT NULL AND materialized_employee_id IS NOT NULL AND materialized_employment_id IS NOT NULL AND materialized_work_assignment_id IS NOT NULL AND num_nonnulls(materialized_supplier_id,materialized_customer_id,materialized_supplier_company_profile_id,materialized_customer_company_profile_id,materialized_operating_organization_assignment_id,materialized_bank_verification_id)=0
              WHEN 'deactivate' THEN requested_role IS NULL AND application_result_kind='partner_deactivated' AND application_reason_code IS NOT NULL AND num_nonnulls(materialized_supplier_id,materialized_customer_id,materialized_person_id,materialized_employee_id,materialized_employment_id,materialized_work_assignment_id,materialized_supplier_company_profile_id,materialized_customer_company_profile_id,materialized_operating_organization_assignment_id,materialized_bank_verification_id)=0
              WHEN 'reactivate' THEN requested_role IS NULL AND application_result_kind='partner_reactivated' AND application_reason_code IS NOT NULL AND num_nonnulls(materialized_supplier_id,materialized_customer_id,materialized_person_id,materialized_employee_id,materialized_employment_id,materialized_work_assignment_id,materialized_supplier_company_profile_id,materialized_customer_company_profile_id,materialized_operating_organization_assignment_id,materialized_bank_verification_id)=0
              WHEN 'archive' THEN requested_role IS NULL AND application_result_kind='partner_archived' AND application_reason_code IS NOT NULL AND num_nonnulls(materialized_supplier_id,materialized_customer_id,materialized_person_id,materialized_employee_id,materialized_employment_id,materialized_work_assignment_id,materialized_supplier_company_profile_id,materialized_customer_company_profile_id,materialized_operating_organization_assignment_id,materialized_bank_verification_id)=0
              ELSE false END
        )
    ),
    CONSTRAINT business_partner_request_role_scope_chk CHECK (
        ((request_kind IN ('add_workforce','change_employment') OR (request_kind='new_partner' AND requested_role='workforce')) AND requested_role='workforce' AND legal_entity_id IS NOT NULL AND company_code_id IS NOT NULL AND org_unit_id IS NOT NULL AND operating_organization_id IS NULL)
        OR (request_kind IN ('new_partner','add_supplier','add_customer','assign_organization','configure_company','change_bank') AND requested_role IN ('supplier','customer') AND operating_organization_id IS NOT NULL AND legal_entity_id IS NULL AND org_unit_id IS NULL AND position_id IS NULL)
        OR (request_kind IN ('amend_partner','deactivate','reactivate','archive') AND requested_role IS NULL)
    ),
    CONSTRAINT business_partner_request_lifecycle_impact_chk CHECK (
        request_kind NOT IN ('deactivate','reactivate','archive') OR status NOT IN ('pending_approval','approved','applying','applied') OR
        (jsonb_typeof(change_impact->'dependencies')='array' AND change_impact->>'evidenceVersion' ~ '^[1-9][0-9]*$' AND change_impact->>'reasonCode' ~ '^[A-Z][A-Z0-9_.-]{2,126}$' AND change_impact->>'assessedAt' IS NOT NULL)
    ),
    CONSTRAINT business_partner_request_company_profile_role_chk CHECK (
        (materialized_supplier_company_profile_id IS NULL OR (requested_role = 'supplier' AND materialized_supplier_id IS NOT NULL))
        AND (materialized_customer_company_profile_id IS NULL OR (requested_role = 'customer' AND materialized_customer_id IS NOT NULL))
        AND (request_kind <> 'configure_company' OR company_code_id IS NOT NULL)
    ),
    CONSTRAINT business_partner_request_idempotency_chk CHECK (
        btrim(idempotency_key) = idempotency_key AND length(idempotency_key) BETWEEN 8 AND 200
    ),
    CONSTRAINT business_partner_request_status_chk CHECK (status IN (
        'draft', 'validating', 'validation_failed', 'pending_approval',
        'returned', 'approved', 'rejected', 'applying', 'applied',
        'failed', 'cancelled', 'superseded'
    )),
    CONSTRAINT business_partner_request_submission_pair_chk CHECK ((submitted_at IS NULL) = (submitted_by IS NULL)),
    CONSTRAINT business_partner_request_approval_pair_chk CHECK ((approved_at IS NULL) = (approved_by IS NULL)),
    CONSTRAINT business_partner_request_apply_pair_chk CHECK ((applied_at IS NULL) = (applied_by IS NULL)),
    CONSTRAINT business_partner_request_no_self_approval_chk
        CHECK (approved_by IS NULL OR approved_by IS DISTINCT FROM submitted_by),
    CONSTRAINT business_partner_request_failure_chk CHECK (
        (status = 'failed' AND nullif(btrim(failure_code), '') IS NOT NULL
                           AND nullif(btrim(support_reference), '') IS NOT NULL)
        OR (status <> 'failed' AND failure_code IS NULL AND failure_detail IS NULL)
    ),
    CONSTRAINT business_partner_request_row_version_chk CHECK (row_version >= 1),
    CONSTRAINT business_partner_request_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT business_partner_request_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE document.business_partner_request IS
  'Source-neutral governed request for NEON Business Partner registration, amendment, role extension, organization/company configuration, bank change, and lifecycle actions. Approved requests materialize through an idempotent domain command; source systems never write the master directly.';
COMMENT ON COLUMN document.business_partner_request.source_projection_id IS
  'Opaque recipient-local projection coordinate. A typed FK is added by the MESH projection wave; it is never a cross-database foreign key.';
COMMENT ON COLUMN document.business_partner_request.proposed_payload IS
  'Schema-versioned proposed canonical values. Unrestricted source dumps, secrets, raw bank identifiers, and authority-bearing metadata are prohibited.';
COMMENT ON COLUMN document.business_partner_request.extension_mode IS
  'legacy_untyped rows are never reinterpreted; typed_v1 rows materialize only typed child tables.';

CREATE TABLE document.business_partner_request_evidence (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid        NOT NULL,
    request_id            uuid        NOT NULL,
    evidence_kind         text        NOT NULL,
    attachment_id         uuid,
    snapshot_id           uuid,
    source_reference      text,
    content_hash          text        NOT NULL,
    classification_code   text        NOT NULL DEFAULT 'internal',
    verification_status   text        NOT NULL DEFAULT 'pending',
    verified_at           timestamptz,
    verified_by           uuid,
    metadata              jsonb       NOT NULL DEFAULT '{}'::jsonb,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,

    CONSTRAINT business_partner_request_evidence_pkey PRIMARY KEY (id),
    CONSTRAINT business_partner_request_evidence_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT business_partner_request_evidence_kind_chk CHECK (evidence_kind ~ '^[a-z][a-z0-9_.-]{1,62}$'),
    CONSTRAINT business_partner_request_evidence_source_chk CHECK (num_nonnulls(attachment_id, snapshot_id, source_reference) = 1),
    CONSTRAINT business_partner_request_evidence_reference_chk
        CHECK (source_reference IS NULL OR length(btrim(source_reference)) BETWEEN 1 AND 1024),
    CONSTRAINT business_partner_request_evidence_hash_chk CHECK (content_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT business_partner_request_evidence_classification_chk
        CHECK (classification_code IN ('public', 'internal', 'confidential', 'restricted')),
    CONSTRAINT business_partner_request_evidence_verification_chk
        CHECK (verification_status IN ('pending', 'verified', 'rejected', 'expired')),
    CONSTRAINT business_partner_request_evidence_verification_pair_chk CHECK (
        (verification_status = 'pending' AND verified_at IS NULL AND verified_by IS NULL)
        OR (verification_status IN ('verified', 'rejected', 'expired') AND verified_at IS NOT NULL AND verified_by IS NOT NULL)
    ),
    CONSTRAINT business_partner_request_evidence_metadata_chk
        CHECK (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 65536)
);

COMMENT ON TABLE document.business_partner_request_evidence IS
  'Append-only evidence manifest for one Business Partner request. The referenced attachment, immutable entity snapshot, or bounded source reference owns the evidence payload.';

CREATE TABLE document.business_partner_request_validation (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid        NOT NULL,
    request_id            uuid        NOT NULL,
    evaluation_id         uuid        NOT NULL,
    rule_code             text        NOT NULL,
    ruleset_code          text        NOT NULL,
    ruleset_version       integer     NOT NULL,
    ruleset_hash          text        NOT NULL,
    severity              text        NOT NULL,
    field_path            text        NOT NULL DEFAULT '$',
    outcome               text        NOT NULL,
    message_code          text        NOT NULL,
    evidence_reference    jsonb       NOT NULL DEFAULT '{}'::jsonb,
    evaluated_at          timestamptz NOT NULL DEFAULT now(),
    evaluated_by          uuid        NOT NULL,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,

    CONSTRAINT business_partner_request_validation_pkey PRIMARY KEY (id),
    CONSTRAINT business_partner_request_validation_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT business_partner_request_validation_coordinate_uq
        UNIQUE (tenant_id, request_id, evaluation_id, rule_code, field_path),
    CONSTRAINT business_partner_request_validation_rule_chk CHECK (rule_code ~ '^[a-z][a-z0-9_.-]{1,126}$'),
    CONSTRAINT business_partner_request_validation_ruleset_chk CHECK (
        ruleset_code ~ '^[a-z][a-z0-9_.-]{1,126}$'
        AND ruleset_version >= 1
        AND ruleset_hash ~ '^[a-f0-9]{64}$'
    ),
    CONSTRAINT business_partner_request_validation_severity_chk CHECK (severity IN ('info', 'warning', 'error')),
    CONSTRAINT business_partner_request_validation_path_chk CHECK (length(btrim(field_path)) BETWEEN 1 AND 512),
    CONSTRAINT business_partner_request_validation_outcome_chk CHECK (outcome IN ('passed', 'failed', 'skipped')),
    CONSTRAINT business_partner_request_validation_message_chk CHECK (message_code ~ '^[A-Z][A-Z0-9_.-]{1,126}$'),
    CONSTRAINT business_partner_request_validation_evidence_chk
        CHECK (jsonb_typeof(evidence_reference) = 'object' AND pg_column_size(evidence_reference) <= 65536)
);

COMMENT ON TABLE document.business_partner_request_validation IS
  'Append-only, ruleset-pinned validation result. evaluation_id groups one deterministic validation run and preserves the exact rule evidence reviewed for approval.';

CREATE TABLE document.business_partner_request_address (
    id                     uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id              uuid        NOT NULL,
    request_id             uuid        NOT NULL,
    client_item_key        text        NOT NULL,
    definition_field_code  text        NOT NULL,
    purpose                text        NOT NULL,
    address_kind           text        NOT NULL DEFAULT 'street',
    line1                  text,
    line2                  text,
    city                   text,
    region                 text,
    state_region_code      text,
    postal_code            text,
    po_box                 text,
    country_code           text        NOT NULL,
    is_primary             boolean     NOT NULL DEFAULT false,
    normalized_hash        text        NOT NULL,
    validation_evidence_id uuid,
    effective_from         date,
    effective_until        date,
    source_kind            text        NOT NULL,
    source_reference       text,
    created_at             timestamptz NOT NULL DEFAULT now(),
    created_by             uuid        NOT NULL,

    CONSTRAINT business_partner_request_address_subdivision_fk FOREIGN KEY (country_code, state_region_code) REFERENCES shared.state_region(country_code, code),
    CONSTRAINT business_partner_request_address_pkey PRIMARY KEY (id),
    CONSTRAINT business_partner_request_address_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT business_partner_request_address_client_key_uq UNIQUE (tenant_id, request_id, client_item_key),
    CONSTRAINT business_partner_request_address_client_key_chk CHECK (client_item_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,126}$'),
    CONSTRAINT business_partner_request_address_field_code_chk CHECK (definition_field_code ~ '^[A-Za-z][A-Za-z0-9_.-]{1,126}$'),
    CONSTRAINT business_partner_request_address_kind_chk CHECK (address_kind IN ('street', 'po_box', 'rural', 'military', 'other')),
    CONSTRAINT business_partner_request_address_country_chk CHECK (country_code ~ '^[A-Z]{2}$'),
    CONSTRAINT business_partner_request_address_po_box_chk CHECK (address_kind <> 'po_box' OR length(btrim(po_box)) > 0),
    CONSTRAINT business_partner_request_address_hash_chk CHECK (normalized_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT business_partner_request_address_range_chk CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until >= effective_from)
);

CREATE TABLE document.business_partner_request_contact_person (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid        NOT NULL,
    request_id            uuid        NOT NULL,
    client_item_key       text        NOT NULL,
    definition_field_code text        NOT NULL,
    contact_name          text        NOT NULL,
    business_title        text,
    department_name       text,
    role_code             text,
    is_primary            boolean     NOT NULL DEFAULT false,
    effective_from        date,
    effective_until       date,
    source_kind           text        NOT NULL,
    source_reference      text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,

    CONSTRAINT business_partner_request_contact_person_pkey PRIMARY KEY (id),
    CONSTRAINT business_partner_request_contact_person_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT business_partner_request_contact_person_client_key_uq UNIQUE (tenant_id, request_id, client_item_key),
    CONSTRAINT business_partner_request_contact_person_client_key_chk CHECK (client_item_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,126}$'),
    CONSTRAINT business_partner_request_contact_person_field_code_chk CHECK (definition_field_code ~ '^[A-Za-z][A-Za-z0-9_.-]{1,126}$'),
    CONSTRAINT business_partner_request_contact_person_name_chk CHECK (length(btrim(contact_name)) BETWEEN 1 AND 255),
    CONSTRAINT business_partner_request_contact_person_range_chk CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until >= effective_from)
);

CREATE TABLE document.business_partner_request_contact_channel (
    id                      uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id               uuid        NOT NULL,
    request_id              uuid        NOT NULL,
    client_item_key         text        NOT NULL,
    definition_field_code   text        NOT NULL,
    contact_client_item_key text        NOT NULL,
    channel_type            text        NOT NULL,
    channel_value           text        NOT NULL,
    purpose                 text        NOT NULL,
    is_primary              boolean     NOT NULL DEFAULT false,
    effective_from          date,
    effective_until         date,
    source_kind             text        NOT NULL,
    source_reference        text,
    created_at              timestamptz NOT NULL DEFAULT now(),
    created_by              uuid        NOT NULL,

    CONSTRAINT business_partner_request_contact_channel_pkey PRIMARY KEY (id),
    CONSTRAINT business_partner_request_contact_channel_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT business_partner_request_contact_channel_client_key_uq UNIQUE (tenant_id, request_id, client_item_key),
    CONSTRAINT business_partner_request_contact_channel_client_key_chk CHECK (client_item_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,126}$'),
    CONSTRAINT business_partner_request_contact_channel_field_code_chk CHECK (definition_field_code ~ '^[A-Za-z][A-Za-z0-9_.-]{1,126}$'),
    CONSTRAINT business_partner_request_contact_channel_type_chk CHECK (channel_type IN ('email', 'phone', 'fax', 'sms', 'whatsapp', 'website')),
    CONSTRAINT business_partner_request_contact_channel_value_chk CHECK (length(channel_value) BETWEEN 1 AND 512),
    CONSTRAINT business_partner_request_contact_channel_range_chk CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until >= effective_from)
);

CREATE TABLE document.business_partner_request_identifier (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid        NOT NULL,
    request_id            uuid        NOT NULL,
    client_item_key       text        NOT NULL,
    definition_field_code text        NOT NULL,
    scheme_code           text        NOT NULL,
    identifier_value      text,
    protected_value_token text,
    value_hash            text        NOT NULL,
    masked_value          text        NOT NULL,
    issuing_authority     text,
    issuing_country_code  text,
    is_primary            boolean     NOT NULL DEFAULT false,
    effective_from        date,
    effective_until       date,
    source_kind           text        NOT NULL,
    source_reference      text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,

    CONSTRAINT business_partner_request_identifier_pkey PRIMARY KEY (id),
    CONSTRAINT business_partner_request_identifier_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT business_partner_request_identifier_client_key_uq UNIQUE (tenant_id, request_id, client_item_key),
    CONSTRAINT business_partner_request_identifier_client_key_chk CHECK (client_item_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,126}$'),
    CONSTRAINT business_partner_request_identifier_field_code_chk CHECK (definition_field_code ~ '^[A-Za-z][A-Za-z0-9_.-]{1,126}$'),
    CONSTRAINT business_partner_request_identifier_value_chk CHECK (num_nonnulls(identifier_value, protected_value_token) = 1),
    CONSTRAINT business_partner_request_identifier_hash_chk CHECK (value_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT business_partner_request_identifier_country_chk CHECK (issuing_country_code IS NULL OR issuing_country_code ~ '^[A-Z]{2}$'),
    CONSTRAINT business_partner_request_identifier_range_chk CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until >= effective_from)
);

CREATE TABLE document.business_partner_request_tax_registration (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid        NOT NULL,
    request_id            uuid        NOT NULL,
    client_item_key       text        NOT NULL,
    definition_field_code text        NOT NULL,
    jurisdiction_id       uuid        NOT NULL,
    tax_type_id           uuid,
    registration_type_code text       NOT NULL,
    protected_value_token text        NOT NULL,
    value_hash            text        NOT NULL,
    masked_value          text        NOT NULL,
    is_primary            boolean     NOT NULL DEFAULT false,
    effective_from        date,
    effective_until       date,
    source_kind           text        NOT NULL,
    source_reference      text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,

    CONSTRAINT business_partner_request_tax_registration_pkey PRIMARY KEY (id),
    CONSTRAINT business_partner_request_tax_registration_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT business_partner_request_tax_registration_client_key_uq UNIQUE (tenant_id, request_id, client_item_key),
    CONSTRAINT business_partner_request_tax_registration_client_key_chk CHECK (client_item_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,126}$'),
    CONSTRAINT business_partner_request_tax_registration_field_code_chk CHECK (definition_field_code ~ '^[A-Za-z][A-Za-z0-9_.-]{1,126}$'),
    CONSTRAINT business_partner_request_tax_registration_hash_chk CHECK (value_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT business_partner_request_tax_registration_range_chk CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until >= effective_from)
);

CREATE TABLE document.business_partner_request_classification (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid        NOT NULL,
    request_id            uuid        NOT NULL,
    client_item_key       text        NOT NULL,
    definition_field_code text        NOT NULL,
    classification_kind   text        NOT NULL,
    reference_id          uuid        NOT NULL,
    domain_code           text,
    partner_role          text,
    assignment_kind       text,
    is_primary            boolean     NOT NULL DEFAULT false,
    confidence            smallint,
    effective_from        date,
    effective_until       date,
    source_kind           text        NOT NULL,
    source_reference      text,
    created_at            timestamptz NOT NULL DEFAULT now(),
    created_by            uuid        NOT NULL,

    CONSTRAINT business_partner_request_classification_pkey PRIMARY KEY (id),
    CONSTRAINT business_partner_request_classification_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT business_partner_request_classification_client_key_uq UNIQUE (tenant_id, request_id, client_item_key),
    CONSTRAINT business_partner_request_classification_client_key_chk CHECK (client_item_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,126}$'),
    CONSTRAINT business_partner_request_classification_field_code_chk CHECK (definition_field_code ~ '^[A-Za-z][A-Za-z0-9_.-]{1,126}$'),
    CONSTRAINT business_partner_request_classification_kind_chk CHECK (classification_kind IN ('commodity', 'industry')),
    CONSTRAINT business_partner_request_classification_role_chk CHECK (partner_role IS NULL OR partner_role IN ('supplier', 'customer')),
    CONSTRAINT business_partner_request_classification_assignment_chk CHECK (assignment_kind IS NULL OR assignment_kind IN ('declared', 'verified', 'inferred', 'imported')),
    CONSTRAINT business_partner_request_classification_confidence_chk CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
    CONSTRAINT business_partner_request_classification_range_chk CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until >= effective_from)
);

CREATE TABLE document.business_partner_request_certification (
    id                         uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                  uuid        NOT NULL,
    request_id                 uuid        NOT NULL,
    client_item_key            text        NOT NULL,
    definition_field_code      text        NOT NULL,
    certification_type_id      uuid,
    custom_name                text,
    certificate_number_token   text,
    masked_certificate_number  text,
    certified_by               text,
    certified_location         text,
    attachment_id              uuid,
    company_code_id            uuid,
    effective_from             date,
    effective_until            date,
    source_kind                text        NOT NULL,
    source_reference           text,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    created_by                 uuid        NOT NULL,

    CONSTRAINT business_partner_request_certification_pkey PRIMARY KEY (id),
    CONSTRAINT business_partner_request_certification_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT business_partner_request_certification_client_key_uq UNIQUE (tenant_id, request_id, client_item_key),
    CONSTRAINT business_partner_request_certification_client_key_chk CHECK (client_item_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,126}$'),
    CONSTRAINT business_partner_request_certification_field_code_chk CHECK (definition_field_code ~ '^[A-Za-z][A-Za-z0-9_.-]{1,126}$'),
    CONSTRAINT business_partner_request_certification_type_chk CHECK (num_nonnulls(certification_type_id, custom_name) = 1),
    CONSTRAINT business_partner_request_certification_range_chk CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until >= effective_from)
);

CREATE TABLE document.business_partner_request_materialization_item (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid        NOT NULL,
    request_id            uuid        NOT NULL,
    child_kind            text        NOT NULL,
    request_child_id      uuid        NOT NULL,
    client_item_key       text        NOT NULL,
    definition_field_code text        NOT NULL,
    source_kind           text        NOT NULL,
    source_reference      text,
    effective_from        date,
    effective_until       date,
    target_table          text        NOT NULL,
    target_id             uuid        NOT NULL,
    applied_at            timestamptz NOT NULL DEFAULT now(),
    applied_by            uuid        NOT NULL,

    CONSTRAINT business_partner_request_materialization_item_pkey PRIMARY KEY (id),
    CONSTRAINT business_partner_request_materialization_item_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT business_partner_request_materialization_item_child_uq UNIQUE (tenant_id, request_id, child_kind, request_child_id),
    CONSTRAINT business_partner_request_materialization_item_target_uq UNIQUE (tenant_id, target_table, target_id),
    CONSTRAINT business_partner_request_materialization_item_kind_chk CHECK (child_kind IN ('address', 'contact_person', 'contact_channel', 'identifier', 'tax_registration', 'classification', 'certification')),
    CONSTRAINT business_partner_request_materialization_item_target_chk CHECK (target_table ~ '^(master|common)\.[a-z][a-z0-9_]{1,62}$')
);

COMMENT ON TABLE document.business_partner_request_materialization_item IS
  'Immutable request-child-to-authoritative-row application evidence; contains coordinates and safe provenance only.';

CREATE TABLE document.mesh_business_partner_match (
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,
    projection_id               uuid        NOT NULL,
    snapshot_id                 uuid        NOT NULL,
    source_payload_hash         text        NOT NULL,
    source_publication_version  integer     NOT NULL,
    operating_organization_id   uuid        NOT NULL,
    company_code_id             uuid,
    candidate_business_partner_id uuid,
    candidate_fingerprint       text,
    algorithm_code              text        NOT NULL,
    algorithm_version           integer     NOT NULL,
    algorithm_hash              text        NOT NULL,
    ranked_candidates           jsonb       NOT NULL,
    field_diff                  jsonb       NOT NULL,
    diff_hash                   text        NOT NULL,
    idempotency_key             text        NOT NULL,
    created_at                  timestamptz NOT NULL DEFAULT clock_timestamp(),
    created_by                  uuid        NOT NULL,

    CONSTRAINT mesh_business_partner_match_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_business_partner_match_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT mesh_business_partner_match_key_uq UNIQUE (tenant_id, idempotency_key),
    CONSTRAINT mesh_business_partner_match_snapshot_uq UNIQUE (tenant_id, id, snapshot_id),
    CONSTRAINT mesh_business_partner_match_source_hash_chk CHECK (source_payload_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT mesh_business_partner_match_version_chk CHECK (source_publication_version >= 1 AND algorithm_version >= 1),
    CONSTRAINT mesh_business_partner_match_algorithm_chk CHECK (algorithm_code ~ '^[a-z][a-z0-9_.-]{1,126}$' AND algorithm_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT mesh_business_partner_match_candidate_chk CHECK ((candidate_business_partner_id IS NULL) = (candidate_fingerprint IS NULL) AND (candidate_fingerprint IS NULL OR candidate_fingerprint ~ '^[a-f0-9]{64}$')),
    CONSTRAINT mesh_business_partner_match_evidence_chk CHECK (jsonb_typeof(ranked_candidates) = 'array' AND jsonb_typeof(field_diff) = 'array' AND pg_column_size(ranked_candidates) <= 262144 AND pg_column_size(field_diff) <= 262144 AND diff_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT mesh_business_partner_match_key_chk CHECK (btrim(idempotency_key) = idempotency_key AND length(idempotency_key) BETWEEN 8 AND 200)
);

CREATE TABLE document.mesh_business_partner_acceptance (
    id                    uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id             uuid        NOT NULL,
    match_id              uuid        NOT NULL,
    snapshot_id           uuid        NOT NULL,
    accepted_field_paths  text[]      NOT NULL,
    proposed_payload      jsonb       NOT NULL,
    acceptance_hash       text        NOT NULL,
    request_idempotency_key text      NOT NULL,
    created_at            timestamptz NOT NULL DEFAULT clock_timestamp(),
    created_by            uuid        NOT NULL,

    CONSTRAINT mesh_business_partner_acceptance_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_business_partner_acceptance_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT mesh_business_partner_acceptance_key_uq UNIQUE (tenant_id, request_idempotency_key),
    CONSTRAINT mesh_business_partner_acceptance_paths_chk CHECK (
        cardinality(accepted_field_paths) BETWEEN 1 AND 7
        AND array_position(accepted_field_paths, NULL) IS NULL
        AND accepted_field_paths <@ ARRAY[
            'partner.accountCode', 'partner.legalName',
            'partner.legalForm', 'partner.countryCode', 'partner.incorporationDate',
            'partner.websiteUrl', 'partner.description'
        ]::text[]
    ),
    CONSTRAINT mesh_business_partner_acceptance_payload_chk CHECK (jsonb_typeof(proposed_payload) = 'object' AND pg_column_size(proposed_payload) <= 65536),
    CONSTRAINT mesh_business_partner_acceptance_hash_chk CHECK (acceptance_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT mesh_business_partner_acceptance_key_chk CHECK (btrim(request_idempotency_key) = request_idempotency_key AND length(request_idempotency_key) BETWEEN 8 AND 200)
);

CREATE TABLE document.mesh_business_partner_acceptance_event (
    id                uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id         uuid        NOT NULL,
    acceptance_id     uuid        NOT NULL,
    lifecycle_version integer     NOT NULL,
    event_kind        text        NOT NULL,
    business_partner_request_id uuid,
    event_fingerprint text        NOT NULL,
    recorded_at       timestamptz NOT NULL DEFAULT clock_timestamp(),
    recorded_by       uuid        NOT NULL,

    CONSTRAINT mesh_business_partner_acceptance_event_pkey PRIMARY KEY (id),
    CONSTRAINT mesh_business_partner_acceptance_event_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT mesh_business_partner_acceptance_event_version_uq UNIQUE (tenant_id, acceptance_id, lifecycle_version),
    CONSTRAINT mesh_business_partner_acceptance_event_request_uq UNIQUE NULLS NOT DISTINCT (tenant_id, acceptance_id, business_partner_request_id),
    CONSTRAINT mesh_business_partner_acceptance_event_version_chk CHECK (lifecycle_version >= 1),
    CONSTRAINT mesh_business_partner_acceptance_event_kind_chk CHECK (event_kind IN ('prepared','request_created')),
    CONSTRAINT mesh_business_partner_acceptance_event_request_chk CHECK ((event_kind = 'prepared' AND business_partner_request_id IS NULL AND lifecycle_version = 1) OR (event_kind = 'request_created' AND business_partner_request_id IS NOT NULL AND lifecycle_version = 2)),
    CONSTRAINT mesh_business_partner_acceptance_event_fingerprint_chk CHECK (event_fingerprint ~ '^[a-f0-9]{64}$')
);

COMMENT ON TABLE document.mesh_business_partner_match IS
  'Immutable, snapshot-pinned deterministic MESH-to-NEON candidate ranking and field diff. Matching grants no master-data write authority.';
COMMENT ON TABLE document.mesh_business_partner_acceptance IS
  'Immutable selective-acceptance command containing only supported explicitly accepted fields and the exact derived onboarding payload.';
COMMENT ON TABLE document.mesh_business_partner_acceptance_event IS
  'Append-only recoverable saga evidence linking a selective acceptance to the ordinary governed Business Partner request.';

CREATE TABLE document.business_partner_bank_verification (
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,
    bank_projection_id          uuid        NOT NULL,
    business_partner_id         uuid        NOT NULL,
    supplier_company_profile_id uuid        NOT NULL,
    company_code_id             uuid        NOT NULL,
    candidate_bank_account_link_id uuid,
    prior_bank_account_link_id  uuid,
    expected_account_fingerprint text       NOT NULL,
    verification_method         text,
    verification_evidence       jsonb       NOT NULL DEFAULT '{}'::jsonb,
    idempotency_key             text        NOT NULL,
    decision_fingerprint        text,
    application_fingerprint     text,
    status                      text        NOT NULL DEFAULT 'pending_verification',
    verified_at                 timestamptz,
    verified_by                 uuid,
    rejected_at                 timestamptz,
    rejected_by                 uuid,
    rejection_reason            text,
    applied_at                  timestamptz,
    applied_by                  uuid,
    row_version                 bigint      NOT NULL DEFAULT 1,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,
    CONSTRAINT business_partner_bank_verification_pkey PRIMARY KEY(id),
    CONSTRAINT business_partner_bank_verification_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT business_partner_bank_verification_idempotency_uq UNIQUE(tenant_id,idempotency_key),
    CONSTRAINT business_partner_bank_verification_status_chk CHECK(status IN('pending_verification','verified','rejected','applied','superseded')),
    CONSTRAINT business_partner_bank_verification_fingerprint_chk CHECK(expected_account_fingerprint ~ '^[a-f0-9]{64}$' AND (decision_fingerprint IS NULL OR decision_fingerprint ~ '^[a-f0-9]{64}$') AND (application_fingerprint IS NULL OR application_fingerprint ~ '^[a-f0-9]{64}$')),
    CONSTRAINT business_partner_bank_verification_key_chk CHECK(btrim(idempotency_key)=idempotency_key AND length(idempotency_key) BETWEEN 8 AND 200),
    CONSTRAINT business_partner_bank_verification_evidence_chk CHECK(jsonb_typeof(verification_evidence)='object' AND pg_column_size(verification_evidence)<=65536),
    CONSTRAINT business_partner_bank_verification_decision_chk CHECK((status='pending_verification' AND candidate_bank_account_link_id IS NULL AND decision_fingerprint IS NULL AND verified_at IS NULL AND verified_by IS NULL AND rejected_at IS NULL AND rejected_by IS NULL) OR (status='verified' AND candidate_bank_account_link_id IS NOT NULL AND nullif(btrim(verification_method),'') IS NOT NULL AND verification_evidence<>'{}'::jsonb AND decision_fingerprint IS NOT NULL AND verified_at IS NOT NULL AND verified_by IS NOT NULL) OR (status='rejected' AND decision_fingerprint IS NOT NULL AND rejected_at IS NOT NULL AND rejected_by IS NOT NULL AND nullif(btrim(rejection_reason),'') IS NOT NULL) OR (status IN('applied','superseded') AND candidate_bank_account_link_id IS NOT NULL AND decision_fingerprint IS NOT NULL AND verified_at IS NOT NULL AND verified_by IS NOT NULL)),
    CONSTRAINT business_partner_bank_verification_sod_chk CHECK(verified_by IS NULL OR verified_by IS DISTINCT FROM created_by),
    CONSTRAINT business_partner_bank_verification_apply_chk CHECK((status='applied')=(application_fingerprint IS NOT NULL AND applied_at IS NOT NULL AND applied_by IS NOT NULL)),
    CONSTRAINT business_partner_bank_verification_version_chk CHECK(row_version>=1),
    CONSTRAINT business_partner_bank_verification_audit_pair_chk CHECK((updated_at IS NULL)=(updated_by IS NULL))
);

COMMENT ON TABLE document.business_partner_bank_verification IS
  'Independent NEON verification and optimistic preferred-remittance switch for one masked MESH disclosure. It never stores the raw disclosed account identifier.';

CREATE TABLE document.business_partner_duplicate_resolution (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL,
    duplicate_business_partner_id uuid NOT NULL, surviving_business_partner_id uuid NOT NULL,
    resolution_kind text NOT NULL, reason_code text NOT NULL, dependency_evidence jsonb NOT NULL,
    rekey_manifest jsonb NOT NULL DEFAULT '[]'::jsonb, snapshot_id uuid NOT NULL,
    resolved_at timestamptz NOT NULL DEFAULT now(), resolved_by uuid NOT NULL,
    CONSTRAINT business_partner_duplicate_resolution_pkey PRIMARY KEY(id),
    CONSTRAINT business_partner_duplicate_resolution_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT business_partner_duplicate_resolution_duplicate_uq UNIQUE(tenant_id,duplicate_business_partner_id),
    CONSTRAINT business_partner_duplicate_resolution_distinct_chk CHECK(duplicate_business_partner_id<>surviving_business_partner_id),
    CONSTRAINT business_partner_duplicate_resolution_kind_chk CHECK(resolution_kind IN('merge','rekey','supersede')),
    CONSTRAINT business_partner_duplicate_resolution_reason_chk CHECK(reason_code ~ '^[A-Z][A-Z0-9_.-]{2,126}$'),
    CONSTRAINT business_partner_duplicate_resolution_evidence_chk CHECK(jsonb_typeof(dependency_evidence)='object' AND dependency_evidence<>'{}'::jsonb AND jsonb_typeof(rekey_manifest)='array')
);

COMMENT ON TABLE document.business_partner_duplicate_resolution IS
  'Steward-only immutable evidence for category-preserving duplicate merge, explicit foreign-key re-key manifest, and supersession. Category is never corrected in place.';

CREATE TABLE document.supplier_activation_evidence (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL,
    business_partner_id uuid NOT NULL, supplier_id uuid NOT NULL,
    operating_organization_id uuid NOT NULL, company_code_id uuid,
    business_date date NOT NULL, prior_status text NOT NULL, resulting_status text NOT NULL DEFAULT 'active',
    readiness_fingerprint text NOT NULL, readiness_evidence jsonb NOT NULL,
    idempotency_key text NOT NULL, command_fingerprint text NOT NULL,
    activated_at timestamptz NOT NULL DEFAULT now(), activated_by uuid NOT NULL,
    CONSTRAINT supplier_activation_evidence_pkey PRIMARY KEY(id),
    CONSTRAINT supplier_activation_evidence_tenant_id_uq UNIQUE(tenant_id,id),
    CONSTRAINT supplier_activation_evidence_idempotency_uq UNIQUE(tenant_id,idempotency_key),
    CONSTRAINT supplier_activation_evidence_status_chk CHECK(prior_status IN('onboarding','suspended','inactive') AND resulting_status='active'),
    CONSTRAINT supplier_activation_evidence_hash_chk CHECK(readiness_fingerprint~'^[a-f0-9]{64}$' AND command_fingerprint~'^[a-f0-9]{64}$'),
    CONSTRAINT supplier_activation_evidence_key_chk CHECK(btrim(idempotency_key)=idempotency_key AND length(idempotency_key) BETWEEN 8 AND 200),
    CONSTRAINT supplier_activation_evidence_payload_chk CHECK(jsonb_typeof(readiness_evidence)='object' AND readiness_evidence->>'decisionFingerprint'=readiness_fingerprint AND readiness_evidence->>'role'='supplier' AND (readiness_evidence->>'eligible')::boolean=true AND pg_column_size(readiness_evidence)<=262144)
);
COMMENT ON TABLE document.supplier_activation_evidence IS 'Immutable evidence for the sole readiness-driven supplier activation command; registration and qualification decisions cannot activate a supplier.';

CREATE TABLE document.business_partner_invitation_recovery(
 id uuid NOT NULL DEFAULT shared.uuidv7(),tenant_id uuid NOT NULL,invitation_id uuid NOT NULL,request_id uuid,entity_case_id uuid,prior_applicant_principal_id uuid NOT NULL,requested_applicant_principal_id uuid NOT NULL,reason text NOT NULL,idempotency_key text NOT NULL,status text NOT NULL DEFAULT 'requested',requested_at timestamptz NOT NULL DEFAULT now(),requested_by uuid NOT NULL,
 CONSTRAINT business_partner_invitation_recovery_pkey PRIMARY KEY(id),CONSTRAINT business_partner_invitation_recovery_tenant_id_uq UNIQUE(tenant_id,id),CONSTRAINT business_partner_invitation_recovery_idempotency_uq UNIQUE(tenant_id,idempotency_key),CONSTRAINT business_partner_invitation_recovery_status_chk CHECK(status='requested'),CONSTRAINT business_partner_invitation_recovery_subject_chk CHECK(num_nonnulls(request_id,entity_case_id)=1),CONSTRAINT business_partner_invitation_recovery_reason_chk CHECK(length(btrim(reason)) BETWEEN 1 AND 4000),CONSTRAINT business_partner_invitation_recovery_principal_chk CHECK(prior_applicant_principal_id<>requested_applicant_principal_id)
);
COMMENT ON TABLE document.business_partner_invitation_recovery IS 'Immutable idempotent recovery intent. IAM recovers the subject; historic ownership is never rewritten and principals or requests are never duplicated.';

-- External workforce and services procurement.
-- These aggregates govern sourcing, commercial engagement and service
-- acceptance. They do not reuse business_partner_request or
-- master.employment as transaction authorities.
CREATE TABLE document.workforce_requisition (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL,
    company_code_id uuid NOT NULL, legal_entity_id uuid NOT NULL, purchase_requisition_id uuid,
    code text NOT NULL, name text NOT NULL, description text,
    engagement_model text NOT NULL DEFAULT 'contingent', job_id uuid, position_id uuid, org_unit_id uuid,
    manager_employee_id uuid, site_id uuid, cost_center_id uuid,
    requested_headcount numeric(10,2) NOT NULL DEFAULT 1,
    expected_start_date date NOT NULL, expected_end_date date,
    currency_code character(3) NOT NULL, target_rate_min numeric(18,6), target_rate_max numeric(18,6), rate_unit text,
    workflow_request_id uuid, approved_at timestamptz, approved_by uuid,
    row_version bigint NOT NULL DEFAULT 1, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'draft', status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT workforce_requisition_pkey PRIMARY KEY (id),
    CONSTRAINT workforce_requisition_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT workforce_requisition_code_uq UNIQUE (tenant_id, company_code_id, code),
    CONSTRAINT workforce_requisition_code_chk CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT workforce_requisition_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT workforce_requisition_model_chk CHECK (engagement_model IN ('contingent','independent_contractor')),
    CONSTRAINT workforce_requisition_dates_chk CHECK (expected_end_date IS NULL OR expected_end_date > expected_start_date),
    CONSTRAINT workforce_requisition_headcount_chk CHECK (requested_headcount > 0),
    CONSTRAINT workforce_requisition_rate_chk CHECK ((target_rate_min IS NULL OR target_rate_min >= 0) AND (target_rate_max IS NULL OR target_rate_max >= COALESCE(target_rate_min,0)) AND ((target_rate_min IS NULL AND target_rate_max IS NULL AND rate_unit IS NULL) OR rate_unit IN ('hour','day','week','month','each','fixed'))),
    CONSTRAINT workforce_requisition_approval_pair_chk CHECK ((approved_at IS NULL) = (approved_by IS NULL)),
    CONSTRAINT workforce_requisition_approval_state_chk CHECK (status NOT IN ('approved','released','partially_filled','filled','closed') OR approved_at IS NOT NULL),
    CONSTRAINT workforce_requisition_version_chk CHECK (row_version >= 1),
    CONSTRAINT workforce_requisition_json_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT workforce_requisition_status_chk CHECK (status IN ('draft','pending_approval','approved','released','partially_filled','filled','cancelled','closed')),
    CONSTRAINT workforce_requisition_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT workforce_requisition_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.workforce_requisition_supplier (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL,
    workforce_requisition_id uuid NOT NULL, supplier_id uuid NOT NULL,
    distributed_at timestamptz NOT NULL, distributed_by uuid NOT NULL, response_due_at timestamptz,
    acknowledged_at timestamptz, declined_at timestamptz, decline_reason text,
    distribution_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb, status text NOT NULL DEFAULT 'distributed',
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
    CONSTRAINT workforce_requisition_supplier_pkey PRIMARY KEY (id),
    CONSTRAINT workforce_requisition_supplier_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT workforce_requisition_supplier_uq UNIQUE (tenant_id, workforce_requisition_id, supplier_id),
    CONSTRAINT workforce_requisition_supplier_dates_chk CHECK (response_due_at IS NULL OR response_due_at > distributed_at),
    CONSTRAINT workforce_requisition_supplier_decline_chk CHECK ((status = 'declined') = (declined_at IS NOT NULL) AND (decline_reason IS NULL OR btrim(decline_reason) <> '')),
    CONSTRAINT workforce_requisition_supplier_json_chk CHECK (jsonb_typeof(distribution_snapshot) = 'object'),
    CONSTRAINT workforce_requisition_supplier_status_chk CHECK (status IN ('distributed','acknowledged','declined','closed'))
);

CREATE TABLE document.external_candidate_submission (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL,
    workforce_requisition_id uuid NOT NULL, requisition_supplier_id uuid NOT NULL, supplier_id uuid NOT NULL,
    person_id uuid, candidate_reference_hash char(64) NOT NULL, profile_content_item_id uuid,
    proposed_rate numeric(18,6), currency_code character(3) NOT NULL, rate_unit text, availability_date date,
    submitted_at timestamptz NOT NULL, submitted_by uuid NOT NULL, consent_evidence_id uuid,
    row_version bigint NOT NULL DEFAULT 1, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'submitted', status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT external_candidate_submission_pkey PRIMARY KEY (id),
    CONSTRAINT external_candidate_submission_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT external_candidate_submission_ref_uq UNIQUE (tenant_id, workforce_requisition_id, supplier_id, candidate_reference_hash),
    CONSTRAINT external_candidate_submission_hash_chk CHECK (candidate_reference_hash ~ '^[a-f0-9]{64}$'),
    CONSTRAINT external_candidate_submission_rate_chk CHECK ((proposed_rate IS NULL AND rate_unit IS NULL) OR (proposed_rate >= 0 AND rate_unit IN ('hour','day','week','month','each','fixed'))),
    CONSTRAINT external_candidate_submission_version_chk CHECK (row_version >= 1),
    CONSTRAINT external_candidate_submission_json_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT external_candidate_submission_status_chk CHECK (status IN ('submitted','under_review','shortlisted','selected','rejected','withdrawn')),
    CONSTRAINT external_candidate_submission_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT external_candidate_submission_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.external_candidate_evaluation (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, candidate_submission_id uuid NOT NULL,
    evaluation_kind text NOT NULL, outcome text NOT NULL, score numeric(7,4), safe_reason_code text,
    evidence_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
    evaluated_at timestamptz NOT NULL DEFAULT now(), evaluated_by uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
    CONSTRAINT external_candidate_evaluation_pkey PRIMARY KEY (id),
    CONSTRAINT external_candidate_evaluation_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT external_candidate_evaluation_kind_chk CHECK (evaluation_kind IN ('screening','interview','assessment','compliance','commercial')),
    CONSTRAINT external_candidate_evaluation_outcome_chk CHECK (outcome IN ('pass','fail','hold','recommended','not_recommended')),
    CONSTRAINT external_candidate_evaluation_score_chk CHECK (score IS NULL OR score BETWEEN 0 AND 100),
    CONSTRAINT external_candidate_evaluation_reason_chk CHECK (safe_reason_code IS NULL OR safe_reason_code ~ '^[A-Z][A-Z0-9_.-]{1,126}$'),
    CONSTRAINT external_candidate_evaluation_json_chk CHECK (jsonb_typeof(evidence_snapshot) = 'object')
);

COMMENT ON TABLE document.external_candidate_submission IS 'Supplier submission against a released workforce requisition. Pre-selection identity may remain pseudonymous; resumes and restricted PII belong to protected content/person stores, never metadata.';
COMMENT ON TABLE document.external_candidate_evaluation IS 'Append-only evaluation outcome with safe reason codes and non-PII evidence coordinates.';

CREATE TABLE document.contingent_work_order (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL,
    company_code_id uuid NOT NULL, legal_entity_id uuid NOT NULL, supplier_id uuid NOT NULL,
    candidate_submission_id uuid NOT NULL, commitment_id uuid,
    code text NOT NULL, name text NOT NULL, current_revision_no integer NOT NULL DEFAULT 0,
    row_version bigint NOT NULL DEFAULT 1, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'draft', status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT contingent_work_order_pkey PRIMARY KEY (id),
    CONSTRAINT contingent_work_order_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT contingent_work_order_code_uq UNIQUE (tenant_id, company_code_id, code),
    CONSTRAINT contingent_work_order_candidate_uq UNIQUE (tenant_id, candidate_submission_id),
    CONSTRAINT contingent_work_order_code_chk CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT contingent_work_order_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT contingent_work_order_revision_chk CHECK (current_revision_no >= 0),
    CONSTRAINT contingent_work_order_version_chk CHECK (row_version >= 1),
    CONSTRAINT contingent_work_order_json_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT contingent_work_order_status_chk CHECK (status IN ('draft','pending_approval','pending_supplier_acceptance','active','suspended','completed','cancelled','closed')),
    CONSTRAINT contingent_work_order_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT contingent_work_order_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.contingent_work_order_revision (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, work_order_id uuid NOT NULL,
    revision_no integer NOT NULL, prior_revision_id uuid, change_reason text NOT NULL,
    start_date date NOT NULL, end_date date NOT NULL, worker_classification text NOT NULL,
    rate_id uuid, currency_code character(3) NOT NULL, rate_unit text NOT NULL,
    bill_rate numeric(18,6) NOT NULL, pay_rate numeric(18,6), not_to_exceed_amount numeric(18,4),
    standard_hours_per_day numeric(7,4), standard_hours_per_week numeric(7,4),
    terms_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb, terms_hash char(64) NOT NULL,
    workflow_request_id uuid, approved_at timestamptz, approved_by uuid,
    supplier_accepted_at timestamptz, supplier_accepted_by uuid,
    effective_at timestamptz, status text NOT NULL DEFAULT 'draft',
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
    CONSTRAINT contingent_work_order_revision_pkey PRIMARY KEY (id),
    CONSTRAINT contingent_work_order_revision_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT contingent_work_order_revision_no_uq UNIQUE (tenant_id, work_order_id, revision_no),
    CONSTRAINT contingent_work_order_revision_no_chk CHECK (revision_no >= 1),
    CONSTRAINT contingent_work_order_revision_reason_chk CHECK (btrim(change_reason) <> ''),
    CONSTRAINT contingent_work_order_revision_dates_chk CHECK (end_date > start_date),
    CONSTRAINT contingent_work_order_revision_class_chk CHECK (worker_classification IN ('agency_worker','independent_contractor','consultant','other')),
    CONSTRAINT contingent_work_order_revision_rate_chk CHECK (rate_unit IN ('hour','day','week','month','each','fixed') AND bill_rate >= 0 AND (pay_rate IS NULL OR pay_rate >= 0) AND (not_to_exceed_amount IS NULL OR not_to_exceed_amount >= 0)),
    CONSTRAINT contingent_work_order_revision_hours_chk CHECK ((standard_hours_per_day IS NULL OR standard_hours_per_day > 0) AND (standard_hours_per_week IS NULL OR standard_hours_per_week > 0)),
    CONSTRAINT contingent_work_order_revision_hash_chk CHECK (terms_hash ~ '^[a-f0-9]{64}$' AND jsonb_typeof(terms_snapshot) = 'object'),
    CONSTRAINT contingent_work_order_revision_approval_pair_chk CHECK ((approved_at IS NULL) = (approved_by IS NULL)),
    CONSTRAINT contingent_work_order_revision_acceptance_pair_chk CHECK ((supplier_accepted_at IS NULL) = (supplier_accepted_by IS NULL)),
    CONSTRAINT contingent_work_order_revision_status_chk CHECK (status IN ('draft','pending_approval','approved','supplier_accepted','effective','superseded','rejected','cancelled')),
    CONSTRAINT contingent_work_order_revision_effective_chk CHECK (status <> 'effective' OR (approved_at IS NOT NULL AND supplier_accepted_at IS NOT NULL AND effective_at IS NOT NULL))
);

CREATE TABLE document.statement_of_work (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL,
    company_code_id uuid NOT NULL, legal_entity_id uuid NOT NULL, supplier_id uuid NOT NULL,
    purchase_requisition_id uuid, commitment_id uuid,
    code text NOT NULL, name text NOT NULL, description text,
    current_revision_no integer NOT NULL DEFAULT 0, row_version bigint NOT NULL DEFAULT 1,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb, status text NOT NULL DEFAULT 'draft',
    status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT statement_of_work_pkey PRIMARY KEY (id),
    CONSTRAINT statement_of_work_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT statement_of_work_code_uq UNIQUE (tenant_id, company_code_id, code),
    CONSTRAINT statement_of_work_code_chk CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT statement_of_work_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT statement_of_work_revision_chk CHECK (current_revision_no >= 0),
    CONSTRAINT statement_of_work_version_chk CHECK (row_version >= 1),
    CONSTRAINT statement_of_work_json_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT statement_of_work_status_chk CHECK (status IN ('draft','pending_approval','pending_supplier_acceptance','active','suspended','completed','cancelled','closed')),
    CONSTRAINT statement_of_work_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT statement_of_work_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.statement_of_work_revision (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, statement_of_work_id uuid NOT NULL,
    revision_no integer NOT NULL, prior_revision_id uuid, change_reason text NOT NULL,
    start_date date NOT NULL, end_date date NOT NULL, currency_code character(3) NOT NULL,
    not_to_exceed_amount numeric(18,4) NOT NULL, allow_workers boolean NOT NULL DEFAULT true,
    allow_time_sheets boolean NOT NULL DEFAULT false, allow_expense_sheets boolean NOT NULL DEFAULT false,
    auto_invoice_approved_items boolean NOT NULL DEFAULT false,
    terms_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb, terms_hash char(64) NOT NULL,
    workflow_request_id uuid, approved_at timestamptz, approved_by uuid,
    supplier_accepted_at timestamptz, supplier_accepted_by uuid,
    effective_at timestamptz, status text NOT NULL DEFAULT 'draft',
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
    CONSTRAINT statement_of_work_revision_pkey PRIMARY KEY (id),
    CONSTRAINT statement_of_work_revision_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT statement_of_work_revision_no_uq UNIQUE (tenant_id, statement_of_work_id, revision_no),
    CONSTRAINT statement_of_work_revision_no_chk CHECK (revision_no >= 1),
    CONSTRAINT statement_of_work_revision_reason_chk CHECK (btrim(change_reason) <> ''),
    CONSTRAINT statement_of_work_revision_dates_chk CHECK (end_date > start_date),
    CONSTRAINT statement_of_work_revision_amount_chk CHECK (not_to_exceed_amount >= 0),
    CONSTRAINT statement_of_work_revision_auto_invoice_chk CHECK (NOT auto_invoice_approved_items OR allow_time_sheets OR allow_expense_sheets),
    CONSTRAINT statement_of_work_revision_hash_chk CHECK (terms_hash ~ '^[a-f0-9]{64}$' AND jsonb_typeof(terms_snapshot) = 'object'),
    CONSTRAINT statement_of_work_revision_approval_pair_chk CHECK ((approved_at IS NULL) = (approved_by IS NULL)),
    CONSTRAINT statement_of_work_revision_acceptance_pair_chk CHECK ((supplier_accepted_at IS NULL) = (supplier_accepted_by IS NULL)),
    CONSTRAINT statement_of_work_revision_status_chk CHECK (status IN ('draft','pending_approval','approved','supplier_accepted','effective','superseded','rejected','cancelled')),
    CONSTRAINT statement_of_work_revision_effective_chk CHECK (status <> 'effective' OR (approved_at IS NOT NULL AND supplier_accepted_at IS NOT NULL AND effective_at IS NOT NULL))
);

CREATE TABLE document.statement_of_work_item (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, statement_of_work_revision_id uuid NOT NULL,
    line_no smallint NOT NULL, item_type text NOT NULL, code text NOT NULL, name text NOT NULL, description text,
    due_date date, quantity numeric(18,4) NOT NULL DEFAULT 1, unit_price numeric(18,6) NOT NULL DEFAULT 0,
    amount numeric(18,4) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    acceptance_required boolean NOT NULL DEFAULT true, accepted_at timestamptz, accepted_by uuid,
    status text NOT NULL DEFAULT 'planned', metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
    CONSTRAINT statement_of_work_item_pkey PRIMARY KEY (id),
    CONSTRAINT statement_of_work_item_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT statement_of_work_item_line_uq UNIQUE (tenant_id, statement_of_work_revision_id, line_no),
    CONSTRAINT statement_of_work_item_code_uq UNIQUE (tenant_id, statement_of_work_revision_id, code),
    CONSTRAINT statement_of_work_item_line_chk CHECK (line_no > 0 AND code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$' AND btrim(name) <> ''),
    CONSTRAINT statement_of_work_item_type_chk CHECK (item_type IN ('deliverable','event','fee','schedule')),
    CONSTRAINT statement_of_work_item_amount_chk CHECK (quantity > 0 AND unit_price >= 0),
    CONSTRAINT statement_of_work_item_acceptance_chk CHECK ((accepted_at IS NULL) = (accepted_by IS NULL) AND (status <> 'accepted' OR accepted_at IS NOT NULL)),
    CONSTRAINT statement_of_work_item_status_chk CHECK (status IN ('planned','submitted','accepted','rejected','cancelled')),
    CONSTRAINT statement_of_work_item_json_chk CHECK (jsonb_typeof(metadata) = 'object')
);

COMMENT ON TABLE document.contingent_work_order_revision IS 'Immutable-on-approval commercial terms for one contingent worker. Revisions preserve prior rates, dates, budgets and supplier acceptance.';
COMMENT ON TABLE document.statement_of_work_revision IS 'Immutable-on-approval SOW terms controlling workers, time, expense, deliverable/event/fee acceptance and auto-invoicing.';

CREATE TABLE document.worker_engagement (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL,
    external_worker_id uuid NOT NULL, supplier_id uuid NOT NULL,
    company_code_id uuid NOT NULL, legal_entity_id uuid NOT NULL,
    contingent_work_order_id uuid, statement_of_work_id uuid,
    code text NOT NULL, name text NOT NULL, worker_classification text NOT NULL,
    start_date date NOT NULL, end_date date NOT NULL, maximum_tenure_days integer,
    currency_code character(3) NOT NULL, rate_id uuid, rate_unit text, bill_rate numeric(18,6),
    not_to_exceed_amount numeric(18,4), workflow_request_id uuid,
    readiness_evidence jsonb NOT NULL DEFAULT '{}'::jsonb, readiness_evidence_hash char(64),
    onboarding_status text NOT NULL DEFAULT 'not_started', access_status text NOT NULL DEFAULT 'not_requested',
    row_version bigint NOT NULL DEFAULT 1, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'pending', status_changed_at timestamptz, status_changed_by uuid,
    activated_at timestamptz, activated_by uuid, closed_at timestamptz, closed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT worker_engagement_pkey PRIMARY KEY (id),
    CONSTRAINT worker_engagement_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT worker_engagement_code_uq UNIQUE (tenant_id, company_code_id, code),
    CONSTRAINT worker_engagement_source_uq UNIQUE NULLS NOT DISTINCT (tenant_id, contingent_work_order_id, statement_of_work_id, external_worker_id),
    CONSTRAINT worker_engagement_code_chk CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$' AND btrim(name) <> ''),
    CONSTRAINT worker_engagement_source_chk CHECK (num_nonnulls(contingent_work_order_id, statement_of_work_id) = 1),
    CONSTRAINT worker_engagement_class_chk CHECK (worker_classification IN ('agency_worker','independent_contractor','consultant','sow_worker','other')),
    CONSTRAINT worker_engagement_dates_chk CHECK (end_date > start_date AND (maximum_tenure_days IS NULL OR maximum_tenure_days > 0)),
    CONSTRAINT worker_engagement_rate_chk CHECK ((bill_rate IS NULL AND rate_unit IS NULL) OR (bill_rate >= 0 AND rate_unit IN ('hour','day','week','month','each','fixed'))),
    CONSTRAINT worker_engagement_amount_chk CHECK (not_to_exceed_amount IS NULL OR not_to_exceed_amount >= 0),
    CONSTRAINT worker_engagement_readiness_chk CHECK (jsonb_typeof(readiness_evidence) = 'object' AND (readiness_evidence_hash IS NULL OR readiness_evidence_hash ~ '^[a-f0-9]{64}$')),
    CONSTRAINT worker_engagement_activation_pair_chk CHECK ((activated_at IS NULL) = (activated_by IS NULL)),
    CONSTRAINT worker_engagement_close_pair_chk CHECK ((closed_at IS NULL) = (closed_by IS NULL)),
    CONSTRAINT worker_engagement_activation_chk CHECK (status <> 'active' OR (activated_at IS NOT NULL AND onboarding_status = 'completed' AND readiness_evidence @> '{"eligible":true}'::jsonb)),
    CONSTRAINT worker_engagement_onboarding_chk CHECK (onboarding_status IN ('not_started','in_progress','blocked','completed','cancelled')),
    CONSTRAINT worker_engagement_access_chk CHECK (access_status IN ('not_requested','requested','provisioned','failed','deprovision_requested','deprovisioned')),
    CONSTRAINT worker_engagement_status_chk CHECK (status IN ('pending','active','suspended','completed','terminated','cancelled','closed')),
    CONSTRAINT worker_engagement_version_chk CHECK (row_version >= 1),
    CONSTRAINT worker_engagement_json_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT worker_engagement_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT worker_engagement_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.worker_operational_placement (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, worker_engagement_id uuid NOT NULL,
    position_id uuid, org_unit_id uuid, manager_employee_id uuid, company_code_id uuid NOT NULL,
    cost_center_id uuid, profit_center_id uuid, project_id uuid, site_id uuid,
    allocation_percent numeric(7,4) NOT NULL DEFAULT 100,
    effective_from date NOT NULL, effective_until date,
    is_primary boolean NOT NULL DEFAULT true, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
    updated_at timestamptz, updated_by uuid,
    CONSTRAINT worker_operational_placement_pkey PRIMARY KEY (id),
    CONSTRAINT worker_operational_placement_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT worker_operational_placement_effective_uq UNIQUE (tenant_id, worker_engagement_id, effective_from, is_primary),
    CONSTRAINT worker_operational_placement_range_chk CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT worker_operational_placement_allocation_chk CHECK (allocation_percent > 0 AND allocation_percent <= 100),
    CONSTRAINT worker_operational_placement_status_chk CHECK (status IN ('active','inactive','superseded')),
    CONSTRAINT worker_operational_placement_json_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT worker_operational_placement_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.worker_compliance_item (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, worker_engagement_id uuid NOT NULL,
    requirement_code text NOT NULL, requirement_version text NOT NULL, category text NOT NULL,
    required_before text NOT NULL DEFAULT 'activation', evidence_content_item_id uuid,
    evidence_fingerprint char(64), valid_from date, valid_until date,
    decision text NOT NULL DEFAULT 'pending', safe_reason_code text,
    decided_at timestamptz, decided_by uuid, decision_fingerprint char(64),
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
    CONSTRAINT worker_compliance_item_pkey PRIMARY KEY (id),
    CONSTRAINT worker_compliance_item_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT worker_compliance_item_requirement_uq UNIQUE (tenant_id, worker_engagement_id, requirement_code, requirement_version),
    CONSTRAINT worker_compliance_item_code_chk CHECK (requirement_code ~ '^[A-Za-z][A-Za-z0-9_.-]{1,126}$' AND btrim(requirement_version) <> ''),
    CONSTRAINT worker_compliance_item_category_chk CHECK (category IN ('identity','right_to_work','background','insurance','license','training','health_safety','classification','other')),
    CONSTRAINT worker_compliance_item_gate_chk CHECK (required_before IN ('selection','activation','site_access','renewal')),
    CONSTRAINT worker_compliance_item_evidence_chk CHECK ((evidence_fingerprint IS NULL OR evidence_fingerprint ~ '^[a-f0-9]{64}$') AND (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from)),
    CONSTRAINT worker_compliance_item_decision_chk CHECK (decision IN ('pending','verified','rejected','waived','expired') AND (decision = 'pending') = (decided_at IS NULL AND decided_by IS NULL AND decision_fingerprint IS NULL)),
    CONSTRAINT worker_compliance_item_decision_hash_chk CHECK (decision_fingerprint IS NULL OR decision_fingerprint ~ '^[a-f0-9]{64}$'),
    CONSTRAINT worker_compliance_item_reason_chk CHECK (safe_reason_code IS NULL OR safe_reason_code ~ '^[A-Z][A-Z0-9_.-]{1,126}$')
);

CREATE TABLE document.engagement_onboarding_case (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, worker_engagement_id uuid NOT NULL,
    code text NOT NULL, name text NOT NULL, target_start_date date NOT NULL,
    checklist jsonb NOT NULL DEFAULT '[]'::jsonb, workflow_request_id uuid,
    activated_at timestamptz, completed_at timestamptz,
    row_version bigint NOT NULL DEFAULT 1, status text NOT NULL DEFAULT 'draft',
    status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT engagement_onboarding_case_pkey PRIMARY KEY (id),
    CONSTRAINT engagement_onboarding_case_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT engagement_onboarding_case_engagement_uq UNIQUE (tenant_id, worker_engagement_id),
    CONSTRAINT engagement_onboarding_case_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT engagement_onboarding_case_code_chk CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$' AND btrim(name) <> ''),
    CONSTRAINT engagement_onboarding_case_json_chk CHECK (jsonb_typeof(checklist) = 'array'),
    CONSTRAINT engagement_onboarding_case_completion_chk CHECK (status <> 'completed' OR completed_at IS NOT NULL),
    CONSTRAINT engagement_onboarding_case_version_chk CHECK (row_version >= 1),
    CONSTRAINT engagement_onboarding_case_status_chk CHECK (status IN ('draft','active','blocked','completed','cancelled')),
    CONSTRAINT engagement_onboarding_case_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT engagement_onboarding_case_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE document.worker_engagement IS 'Commercial and lifecycle authority for a supplier-provided person working for the buyer. Exactly one contingent work order or SOW is authoritative; no buyer employment is implied.';
COMMENT ON TABLE document.worker_operational_placement IS 'Effective buyer-side manager, organization, site and cost allocation for an external engagement. This is not master.work_assignment and does not affect employee headcount.';
COMMENT ON TABLE document.worker_compliance_item IS 'Engagement-specific compliance gate. Evidence content is protected separately; only fingerprints, validity and safe decisions are stored here.';

CREATE TABLE document.external_time_sheet (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, worker_engagement_id uuid NOT NULL,
    code text NOT NULL, period_start date NOT NULL, period_end date NOT NULL,
    submitted_at timestamptz, submitted_by uuid, source_inbox_id uuid, workflow_request_id uuid,
    approved_at timestamptz, approved_by uuid, rejection_reason_code text,
    revision_of_time_sheet_id uuid, row_version bigint NOT NULL DEFAULT 1,
    status text NOT NULL DEFAULT 'draft', status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT external_time_sheet_pkey PRIMARY KEY (id),
    CONSTRAINT external_time_sheet_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT external_time_sheet_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT external_time_sheet_period_uq UNIQUE NULLS NOT DISTINCT (tenant_id, worker_engagement_id, period_start, revision_of_time_sheet_id),
    CONSTRAINT external_time_sheet_code_chk CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT external_time_sheet_period_chk CHECK (period_end >= period_start),
    CONSTRAINT external_time_sheet_submit_source_chk CHECK (
        (submitted_at IS NULL AND submitted_by IS NULL AND source_inbox_id IS NULL)
        OR (submitted_at IS NOT NULL AND num_nonnulls(submitted_by, source_inbox_id) = 1)
    ),
    CONSTRAINT external_time_sheet_submit_state_chk CHECK (
        status IN ('draft','cancelled') OR submitted_at IS NOT NULL
    ),
    CONSTRAINT external_time_sheet_approval_pair_chk CHECK ((approved_at IS NULL) = (approved_by IS NULL)),
    CONSTRAINT external_time_sheet_approval_state_chk CHECK (status NOT IN ('approved','reversed') OR approved_at IS NOT NULL),
    CONSTRAINT external_time_sheet_rejection_chk CHECK (status <> 'rejected' OR rejection_reason_code ~ '^[A-Z][A-Z0-9_.-]{1,126}$'),
    CONSTRAINT external_time_sheet_version_chk CHECK (row_version >= 1),
    CONSTRAINT external_time_sheet_status_chk CHECK (status IN ('draft','submitted','pending_approval','approved','rejected','reversed','cancelled')),
    CONSTRAINT external_time_sheet_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT external_time_sheet_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.external_time_entry (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, time_sheet_id uuid NOT NULL,
    line_no smallint NOT NULL, work_date date NOT NULL, time_category text NOT NULL DEFAULT 'regular',
    hours numeric(9,4) NOT NULL, rate numeric(18,6) NOT NULL, currency_code character(3) NOT NULL,
    amount numeric(18,4) GENERATED ALWAYS AS (hours * rate) STORED,
    cost_center_id uuid, project_id uuid, project_task_id uuid, statement_of_work_item_id uuid,
    task_code text, notes text, rate_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb, rate_snapshot_hash char(64) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
    CONSTRAINT external_time_entry_pkey PRIMARY KEY (id),
    CONSTRAINT external_time_entry_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT external_time_entry_line_uq UNIQUE (tenant_id, time_sheet_id, line_no),
    CONSTRAINT external_time_entry_line_chk CHECK (line_no > 0 AND hours > 0 AND hours <= 24 AND rate >= 0),
    CONSTRAINT external_time_entry_category_chk CHECK (time_category IN ('regular','overtime','doubletime','on_call','absence','other')),
    CONSTRAINT external_time_entry_hash_chk CHECK (rate_snapshot_hash ~ '^[a-f0-9]{64}$' AND jsonb_typeof(rate_snapshot) = 'object')
);

CREATE TABLE document.external_expense_sheet (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, worker_engagement_id uuid NOT NULL,
    code text NOT NULL, period_start date NOT NULL, period_end date NOT NULL,
    submitted_at timestamptz, submitted_by uuid, source_inbox_id uuid, workflow_request_id uuid,
    approved_at timestamptz, approved_by uuid, rejection_reason_code text,
    revision_of_expense_sheet_id uuid, row_version bigint NOT NULL DEFAULT 1,
    status text NOT NULL DEFAULT 'draft', status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT external_expense_sheet_pkey PRIMARY KEY (id),
    CONSTRAINT external_expense_sheet_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT external_expense_sheet_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT external_expense_sheet_period_uq UNIQUE NULLS NOT DISTINCT (tenant_id, worker_engagement_id, period_start, revision_of_expense_sheet_id),
    CONSTRAINT external_expense_sheet_code_chk CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT external_expense_sheet_period_chk CHECK (period_end >= period_start),
    CONSTRAINT external_expense_sheet_submit_source_chk CHECK (
        (submitted_at IS NULL AND submitted_by IS NULL AND source_inbox_id IS NULL)
        OR (submitted_at IS NOT NULL AND num_nonnulls(submitted_by, source_inbox_id) = 1)
    ),
    CONSTRAINT external_expense_sheet_submit_state_chk CHECK (
        status IN ('draft','cancelled') OR submitted_at IS NOT NULL
    ),
    CONSTRAINT external_expense_sheet_approval_pair_chk CHECK ((approved_at IS NULL) = (approved_by IS NULL)),
    CONSTRAINT external_expense_sheet_approval_state_chk CHECK (status NOT IN ('approved','reversed') OR approved_at IS NOT NULL),
    CONSTRAINT external_expense_sheet_rejection_chk CHECK (status <> 'rejected' OR rejection_reason_code ~ '^[A-Z][A-Z0-9_.-]{1,126}$'),
    CONSTRAINT external_expense_sheet_version_chk CHECK (row_version >= 1),
    CONSTRAINT external_expense_sheet_status_chk CHECK (status IN ('draft','submitted','pending_approval','approved','rejected','reversed','cancelled')),
    CONSTRAINT external_expense_sheet_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT external_expense_sheet_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.external_expense_item (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, expense_sheet_id uuid NOT NULL,
    line_no smallint NOT NULL, expense_date date NOT NULL, expense_code text NOT NULL, description text NOT NULL,
    amount numeric(18,4) NOT NULL, tax_amount numeric(18,4) NOT NULL DEFAULT 0, currency_code character(3) NOT NULL,
    cost_center_id uuid, project_id uuid, project_task_id uuid, statement_of_work_item_id uuid,
    receipt_content_item_id uuid, merchant_name text, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
    CONSTRAINT external_expense_item_pkey PRIMARY KEY (id),
    CONSTRAINT external_expense_item_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT external_expense_item_line_uq UNIQUE (tenant_id, expense_sheet_id, line_no),
    CONSTRAINT external_expense_item_line_chk CHECK (line_no > 0 AND amount >= 0 AND tax_amount >= 0),
    CONSTRAINT external_expense_item_code_chk CHECK (expense_code ~ '^[A-Za-z][A-Za-z0-9_.-]{1,126}$' AND btrim(description) <> ''),
    CONSTRAINT external_expense_item_json_chk CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE document.external_service_entry (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL,
    company_code_id uuid NOT NULL, supplier_id uuid NOT NULL, commitment_id uuid,
    code text NOT NULL, name text NOT NULL, service_period_start date NOT NULL, service_period_end date NOT NULL,
    currency_code character(3) NOT NULL, workflow_request_id uuid,
    submitted_at timestamptz, submitted_by uuid, approved_at timestamptz, approved_by uuid,
    row_version bigint NOT NULL DEFAULT 1, status text NOT NULL DEFAULT 'draft',
    status_changed_at timestamptz, status_changed_by uuid,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT external_service_entry_pkey PRIMARY KEY (id),
    CONSTRAINT external_service_entry_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT external_service_entry_code_uq UNIQUE (tenant_id, company_code_id, code),
    CONSTRAINT external_service_entry_code_chk CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$' AND btrim(name) <> ''),
    CONSTRAINT external_service_entry_period_chk CHECK (service_period_end >= service_period_start),
    CONSTRAINT external_service_entry_submit_pair_chk CHECK ((submitted_at IS NULL) = (submitted_by IS NULL)),
    CONSTRAINT external_service_entry_approval_pair_chk CHECK ((approved_at IS NULL) = (approved_by IS NULL)),
    CONSTRAINT external_service_entry_approval_state_chk CHECK (status NOT IN ('approved','invoiced') OR approved_at IS NOT NULL),
    CONSTRAINT external_service_entry_version_chk CHECK (row_version >= 1),
    CONSTRAINT external_service_entry_status_chk CHECK (status IN ('draft','submitted','pending_approval','approved','rejected','reversed','invoiced','cancelled')),
    CONSTRAINT external_service_entry_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT external_service_entry_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE document.external_service_entry_line (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, service_entry_id uuid NOT NULL,
    line_no smallint NOT NULL, time_sheet_id uuid, expense_sheet_id uuid, statement_of_work_item_id uuid,
    description text NOT NULL, quantity numeric(18,4) NOT NULL DEFAULT 1, unit_price numeric(18,6) NOT NULL,
    accepted_amount numeric(18,4) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    currency_code character(3) NOT NULL, acceptance_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
    acceptance_hash char(64) NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
    CONSTRAINT external_service_entry_line_pkey PRIMARY KEY (id),
    CONSTRAINT external_service_entry_line_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT external_service_entry_line_no_uq UNIQUE (tenant_id, service_entry_id, line_no),
    CONSTRAINT external_service_entry_line_source_chk CHECK (num_nonnulls(time_sheet_id, expense_sheet_id, statement_of_work_item_id) = 1),
    CONSTRAINT external_service_entry_line_amount_chk CHECK (line_no > 0 AND quantity > 0 AND unit_price >= 0 AND btrim(description) <> ''),
    CONSTRAINT external_service_entry_line_hash_chk CHECK (acceptance_hash ~ '^[a-f0-9]{64}$' AND jsonb_typeof(acceptance_snapshot) = 'object')
);

CREATE TABLE document.external_workforce_invoice_allocation (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL,
    purchase_invoice_line_id uuid NOT NULL, service_entry_line_id uuid NOT NULL,
    allocation_kind text NOT NULL DEFAULT 'invoice', allocated_amount numeric(18,4) NOT NULL,
    currency_code character(3) NOT NULL, reverses_allocation_id uuid, idempotency_key text NOT NULL,
    allocated_at timestamptz NOT NULL DEFAULT now(), allocated_by uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
    CONSTRAINT external_workforce_invoice_allocation_pkey PRIMARY KEY (id),
    CONSTRAINT external_workforce_invoice_allocation_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT external_workforce_invoice_allocation_idempotency_uq UNIQUE (tenant_id, idempotency_key),
    CONSTRAINT external_workforce_invoice_allocation_kind_chk CHECK (allocation_kind IN ('invoice','reversal')),
    CONSTRAINT external_workforce_invoice_allocation_amount_chk CHECK (allocated_amount > 0 AND btrim(idempotency_key) <> ''),
    CONSTRAINT external_workforce_invoice_allocation_reversal_chk CHECK ((allocation_kind = 'reversal') = (reverses_allocation_id IS NOT NULL))
);

CREATE TABLE document.service_sheet_source_allocation (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, service_sheet_line_id uuid NOT NULL,
    external_time_sheet_id uuid, external_expense_sheet_id uuid, statement_of_work_item_id uuid,
    allocation_kind text NOT NULL DEFAULT 'acceptance', accepted_quantity numeric(18,4),
    accepted_amount numeric(18,4) NOT NULL, currency_code character(3) NOT NULL,
    reverses_allocation_id uuid, source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
    source_snapshot_hash char(64) NOT NULL, idempotency_key text NOT NULL,
    allocated_at timestamptz NOT NULL DEFAULT now(), allocated_by uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL,
    CONSTRAINT service_sheet_source_allocation_pkey PRIMARY KEY (id),
    CONSTRAINT service_sheet_source_allocation_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT service_sheet_source_allocation_idempotency_uq UNIQUE (tenant_id, idempotency_key),
    CONSTRAINT service_sheet_source_allocation_source_chk CHECK (num_nonnulls(external_time_sheet_id, external_expense_sheet_id, statement_of_work_item_id) = 1),
    CONSTRAINT service_sheet_source_allocation_kind_chk CHECK (allocation_kind IN ('acceptance','reversal')),
    CONSTRAINT service_sheet_source_allocation_amount_chk CHECK (accepted_amount > 0 AND (accepted_quantity IS NULL OR accepted_quantity > 0)),
    CONSTRAINT service_sheet_source_allocation_reversal_chk CHECK ((allocation_kind = 'reversal') = (reverses_allocation_id IS NOT NULL)),
    CONSTRAINT service_sheet_source_allocation_hash_chk CHECK (source_snapshot_hash ~ '^[a-f0-9]{64}$' AND jsonb_typeof(source_snapshot) = 'object'),
    CONSTRAINT service_sheet_source_allocation_key_chk CHECK (btrim(idempotency_key) = idempotency_key AND length(idempotency_key) BETWEEN 8 AND 200)
);

COMMENT ON TABLE document.external_time_sheet IS 'External-worker time document. Corrections create a linked revision/reversal; approved history is never overwritten.';
COMMENT ON TABLE document.external_expense_sheet IS 'External-worker expense document. Receipt content is protected separately and approved history is never overwritten.';
COMMENT ON TABLE document.external_service_entry IS 'DEPRECATED compatibility aggregate. New external-workforce acceptance uses document.service_sheet and document.service_sheet_source_allocation.';
COMMENT ON TABLE document.external_service_entry_line IS 'DEPRECATED compatibility lines. New external-workforce acceptance uses document.service_sheet_line and document.service_sheet_source_allocation.';
COMMENT ON TABLE document.external_workforce_invoice_allocation IS 'DEPRECATED compatibility allocation. New invoice matching binds purchase-invoice lines to document.service_sheet_line.';
COMMENT ON TABLE document.service_sheet_source_allocation IS 'Append-only acceptance/reversal evidence connecting an approved external claim or SOW item to the canonical P2P service-sheet line.';

-- Immutable explicit choices over a server-derived three-way comparison.
CREATE TABLE document.mesh_profile_change_resolution (
    id uuid PRIMARY KEY DEFAULT shared.uuidv7(),
    tenant_id uuid NOT NULL,
    projection_id uuid NOT NULL,
    baseline_snapshot_id uuid NOT NULL,
    incoming_snapshot_id uuid NOT NULL,
    business_partner_id uuid NOT NULL,
    operating_organization_id uuid NOT NULL,
    expected_target_version bigint NOT NULL CHECK (expected_target_version > 0),
    preview_fingerprint text NOT NULL CHECK (preview_fingerprint ~ '^[a-f0-9]{64}$'),
    preview jsonb NOT NULL CHECK (jsonb_typeof(preview) = 'object'),
    decisions jsonb NOT NULL CHECK (jsonb_typeof(decisions) = 'object'),
    proposed_values jsonb NOT NULL CHECK (jsonb_typeof(proposed_values) = 'object'),
    idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 180),
    created_by uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (tenant_id, id),
    UNIQUE (tenant_id, idempotency_key),
    CHECK (
        pg_column_size(preview) <= 65536
        AND pg_column_size(decisions) <= 4096
        AND pg_column_size(proposed_values) <= 32768
    )
);

CREATE TABLE document.mesh_profile_change_case (
    tenant_id uuid NOT NULL,
    resolution_id uuid NOT NULL,
    entity_case_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, resolution_id),
    UNIQUE (tenant_id, entity_case_id)
);
