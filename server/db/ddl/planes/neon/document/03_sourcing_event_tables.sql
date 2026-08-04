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
