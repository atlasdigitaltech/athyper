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
