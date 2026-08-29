BEGIN;

DO $$ BEGIN
  IF current_database() <> 'athyper_neon' OR current_setting('app.database_plane', true) <> 'neon' THEN
    RAISE EXCEPTION 'External workforce and services procurement migration requires the NEON plane';
  END IF;
END $$;

-- Source: planes/neon/master/03_tables.sql
-- External workforce is a distinct person role.  It deliberately does not
-- imply buyer employment, payroll eligibility, statutory enrollment, or
-- employee headcount.  A person may concurrently have both employee and
-- external_worker rows; the governing contracts remain independent.
CREATE TABLE master.external_worker (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    person_id           uuid        NOT NULL,
    worker_number       text        NOT NULL,
    default_classification text,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status              text        NOT NULL DEFAULT 'prospect',
    is_active           boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,
    CONSTRAINT external_worker_pkey PRIMARY KEY (id),
    CONSTRAINT external_worker_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT external_worker_person_uq UNIQUE (tenant_id, person_id),
    CONSTRAINT external_worker_number_uq UNIQUE (tenant_id, worker_number),
    CONSTRAINT external_worker_number_chk CHECK (worker_number ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT external_worker_classification_chk CHECK (
        default_classification IS NULL OR default_classification IN (
            'agency_worker','independent_contractor','consultant','sow_worker','other'
        )
    ),
    CONSTRAINT external_worker_status_chk CHECK (
        status IN ('prospect','active','suspended','inactive','archived')
    ),
    CONSTRAINT external_worker_metadata_object_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT external_worker_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT external_worker_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE master.external_worker IS
  'Reusable external-workforce role for one person. Supplier, buyer, commercial terms, placement, compliance, access and tenure belong to effective-dated worker engagements; this row never creates buyer employment.';

-- Source: planes/neon/control/03_tables.sql
-- Fieldglass-inspired external-workforce pricing policy.  Rate cards are
-- governed configuration; accepted commercial rates are snapshotted on work
-- order/SOW revisions and transaction lines.
CREATE TABLE control.external_workforce_rate_card (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    company_code_id     uuid        NOT NULL,
    code                text        NOT NULL,
    name                text        NOT NULL,
    description         text,
    currency_code       character(3) NOT NULL,
    effective_from      date        NOT NULL,
    effective_until     date,
    row_version         bigint      NOT NULL DEFAULT 1,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status              text        NOT NULL DEFAULT 'draft',
    status_changed_at   timestamptz,
    status_changed_by   uuid,
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,
    CONSTRAINT external_workforce_rate_card_pkey PRIMARY KEY (id),
    CONSTRAINT external_workforce_rate_card_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT external_workforce_rate_card_code_uq UNIQUE (tenant_id, company_code_id, code),
    CONSTRAINT external_workforce_rate_card_code_chk CHECK (code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT external_workforce_rate_card_name_chk CHECK (btrim(name) <> ''),
    CONSTRAINT external_workforce_rate_card_range_chk CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT external_workforce_rate_card_version_chk CHECK (row_version >= 1),
    CONSTRAINT external_workforce_rate_card_json_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT external_workforce_rate_card_status_chk CHECK (status IN ('draft','active','inactive','archived')),
    CONSTRAINT external_workforce_rate_card_status_pair_chk CHECK ((status_changed_at IS NULL) = (status_changed_by IS NULL)),
    CONSTRAINT external_workforce_rate_card_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

CREATE TABLE control.external_workforce_rate (
    id                  uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid        NOT NULL,
    rate_card_id        uuid        NOT NULL,
    supplier_id         uuid,
    job_id              uuid,
    site_id             uuid,
    worker_classification text,
    rate_code           text        NOT NULL,
    unit_of_measure     text        NOT NULL,
    regular_rate        numeric(18,6) NOT NULL,
    minimum_rate        numeric(18,6),
    maximum_rate        numeric(18,6),
    overtime_multiplier numeric(9,4) NOT NULL DEFAULT 1,
    doubletime_multiplier numeric(9,4) NOT NULL DEFAULT 1,
    supplier_markup_percent numeric(9,4) NOT NULL DEFAULT 0,
    effective_from      date        NOT NULL,
    effective_until     date,
    metadata            jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status              text        NOT NULL DEFAULT 'active',
    created_at          timestamptz NOT NULL DEFAULT now(),
    created_by          uuid        NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,
    CONSTRAINT external_workforce_rate_pkey PRIMARY KEY (id),
    CONSTRAINT external_workforce_rate_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT external_workforce_rate_code_uq UNIQUE (tenant_id, rate_card_id, rate_code, effective_from),
    CONSTRAINT external_workforce_rate_code_chk CHECK (rate_code ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,62}$'),
    CONSTRAINT external_workforce_rate_uom_chk CHECK (unit_of_measure IN ('hour','day','week','month','each','fixed')),
    CONSTRAINT external_workforce_rate_classification_chk CHECK (
        worker_classification IS NULL OR worker_classification IN (
            'agency_worker','independent_contractor','consultant','sow_worker','other'
        )
    ),
    CONSTRAINT external_workforce_rate_amount_chk CHECK (
        regular_rate >= 0
        AND (minimum_rate IS NULL OR minimum_rate >= 0)
        AND (maximum_rate IS NULL OR maximum_rate >= COALESCE(minimum_rate, 0))
        AND regular_rate BETWEEN COALESCE(minimum_rate, regular_rate) AND COALESCE(maximum_rate, regular_rate)
        AND overtime_multiplier >= 1 AND doubletime_multiplier >= overtime_multiplier
        AND supplier_markup_percent BETWEEN 0 AND 1000
    ),
    CONSTRAINT external_workforce_rate_range_chk CHECK (effective_until IS NULL OR effective_until > effective_from),
    CONSTRAINT external_workforce_rate_json_chk CHECK (jsonb_typeof(metadata) = 'object'),
    CONSTRAINT external_workforce_rate_status_chk CHECK (status IN ('active','inactive','archived')),
    CONSTRAINT external_workforce_rate_audit_pair_chk CHECK ((updated_at IS NULL) = (updated_by IS NULL))
);

COMMENT ON TABLE control.external_workforce_rate_card IS
  'Buyer-company rate policy for external labor. It is not a purchase commitment and cannot authorize spend.';
COMMENT ON TABLE control.external_workforce_rate IS
  'Effective rate-card row optionally narrowed by staffing supplier, job, site and worker classification.';

-- Source: planes/neon/document/03_tables.sql
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
    submitted_at timestamptz, submitted_by uuid, workflow_request_id uuid,
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
    CONSTRAINT external_time_sheet_submit_pair_chk CHECK ((submitted_at IS NULL) = (submitted_by IS NULL)),
    CONSTRAINT external_time_sheet_approval_pair_chk CHECK ((approved_at IS NULL) = (approved_by IS NULL)),
    CONSTRAINT external_time_sheet_approval_state_chk CHECK (status NOT IN ('approved','invoiced') OR approved_at IS NOT NULL),
    CONSTRAINT external_time_sheet_rejection_chk CHECK (status <> 'rejected' OR rejection_reason_code ~ '^[A-Z][A-Z0-9_.-]{1,126}$'),
    CONSTRAINT external_time_sheet_version_chk CHECK (row_version >= 1),
    CONSTRAINT external_time_sheet_status_chk CHECK (status IN ('draft','submitted','pending_approval','approved','rejected','reversed','invoiced','cancelled')),
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
    submitted_at timestamptz, submitted_by uuid, workflow_request_id uuid,
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
    CONSTRAINT external_expense_sheet_submit_pair_chk CHECK ((submitted_at IS NULL) = (submitted_by IS NULL)),
    CONSTRAINT external_expense_sheet_approval_pair_chk CHECK ((approved_at IS NULL) = (approved_by IS NULL)),
    CONSTRAINT external_expense_sheet_approval_state_chk CHECK (status NOT IN ('approved','invoiced') OR approved_at IS NOT NULL),
    CONSTRAINT external_expense_sheet_rejection_chk CHECK (status <> 'rejected' OR rejection_reason_code ~ '^[A-Z][A-Z0-9_.-]{1,126}$'),
    CONSTRAINT external_expense_sheet_version_chk CHECK (row_version >= 1),
    CONSTRAINT external_expense_sheet_status_chk CHECK (status IN ('draft','submitted','pending_approval','approved','rejected','reversed','invoiced','cancelled')),
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

COMMENT ON TABLE document.external_time_sheet IS 'External-worker time document. Corrections create a linked revision/reversal; approved history is never overwritten.';
COMMENT ON TABLE document.external_expense_sheet IS 'External-worker expense document. Receipt content is protected separately and approved history is never overwritten.';
COMMENT ON TABLE document.external_service_entry IS 'Buyer acceptance of approved time, expense or SOW deliverables. This is the auditable bridge to AP invoicing.';
COMMENT ON TABLE document.external_workforce_invoice_allocation IS 'Append-only allocation from an accepted external-workforce service entry line to an AP invoice line, including explicit reversal pairs.';

-- Source: planes/neon/master/05_constraints.sql
ALTER TABLE master.external_worker
    ADD CONSTRAINT external_worker_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_worker_person_fk FOREIGN KEY (tenant_id, person_id) REFERENCES master.person(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_worker_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_worker_updated_by_fk FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_worker_status_changed_by_fk FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

-- Source: planes/neon/control/05_constraints.sql
ALTER TABLE control.external_workforce_rate_card
    ADD CONSTRAINT external_workforce_rate_card_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_workforce_rate_card_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_workforce_rate_card_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_workforce_rate_card_updated_by_fk FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_workforce_rate_card_status_by_fk FOREIGN KEY (tenant_id, status_changed_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE control.external_workforce_rate
    ADD CONSTRAINT external_workforce_rate_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_workforce_rate_card_fk FOREIGN KEY (tenant_id, rate_card_id) REFERENCES control.external_workforce_rate_card(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_workforce_rate_supplier_fk FOREIGN KEY (tenant_id, supplier_id) REFERENCES master.supplier(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_workforce_rate_job_fk FOREIGN KEY (tenant_id, job_id) REFERENCES master.job(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_workforce_rate_site_fk FOREIGN KEY (tenant_id, site_id) REFERENCES master.site(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_workforce_rate_created_by_fk FOREIGN KEY (tenant_id, created_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_workforce_rate_updated_by_fk FOREIGN KEY (tenant_id, updated_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE control.external_workforce_rate
    ADD CONSTRAINT external_workforce_rate_no_overlap
    EXCLUDE USING gist (
        tenant_id WITH =,
        rate_card_id WITH =,
        COALESCE(supplier_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
        COALESCE(job_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
        COALESCE(site_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
        COALESCE(worker_classification, '') WITH =,
        daterange(effective_from, COALESCE(effective_until, 'infinity'::date), '[)') WITH &&
    ) WHERE (status = 'active');

-- Source: planes/neon/document/05_constraints.sql
-- External workforce sourcing and commercial authorities.
ALTER TABLE document.workforce_requisition
    ADD CONSTRAINT workforce_requisition_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT workforce_requisition_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT workforce_requisition_legal_entity_fk FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES master.legal_entity(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT workforce_requisition_purchase_requisition_fk FOREIGN KEY (tenant_id, purchase_requisition_id) REFERENCES document.purchase_requisition(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT workforce_requisition_job_fk FOREIGN KEY (tenant_id, job_id) REFERENCES master.job(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT workforce_requisition_position_fk FOREIGN KEY (tenant_id, position_id) REFERENCES master.position(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT workforce_requisition_org_unit_fk FOREIGN KEY (tenant_id, org_unit_id) REFERENCES master.org_unit(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT workforce_requisition_manager_fk FOREIGN KEY (tenant_id, manager_employee_id) REFERENCES master.employee(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT workforce_requisition_site_fk FOREIGN KEY (tenant_id, site_id) REFERENCES master.site(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT workforce_requisition_cost_center_fk FOREIGN KEY (tenant_id, cost_center_id) REFERENCES master.cost_center(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT workforce_requisition_workflow_fk FOREIGN KEY (tenant_id, workflow_request_id) REFERENCES document.workflow_request(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.workforce_requisition_supplier
    ADD CONSTRAINT workforce_requisition_supplier_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT workforce_requisition_supplier_requisition_fk FOREIGN KEY (tenant_id, workforce_requisition_id) REFERENCES document.workforce_requisition(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT workforce_requisition_supplier_supplier_fk FOREIGN KEY (tenant_id, supplier_id) REFERENCES master.supplier(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT workforce_requisition_supplier_distributed_by_fk FOREIGN KEY (tenant_id, distributed_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.external_candidate_submission
    ADD CONSTRAINT external_candidate_submission_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_candidate_submission_requisition_fk FOREIGN KEY (tenant_id, workforce_requisition_id) REFERENCES document.workforce_requisition(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_candidate_submission_distribution_fk FOREIGN KEY (tenant_id, requisition_supplier_id) REFERENCES document.workforce_requisition_supplier(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_candidate_submission_supplier_fk FOREIGN KEY (tenant_id, supplier_id) REFERENCES master.supplier(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_candidate_submission_person_fk FOREIGN KEY (tenant_id, person_id) REFERENCES master.person(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_candidate_submission_content_fk FOREIGN KEY (tenant_id, profile_content_item_id) REFERENCES document.content_item(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_candidate_submission_submitted_by_fk FOREIGN KEY (tenant_id, submitted_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.external_candidate_evaluation
    ADD CONSTRAINT external_candidate_evaluation_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_candidate_evaluation_submission_fk FOREIGN KEY (tenant_id, candidate_submission_id) REFERENCES document.external_candidate_submission(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_candidate_evaluation_evaluated_by_fk FOREIGN KEY (tenant_id, evaluated_by) REFERENCES master.principal(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.contingent_work_order
    ADD CONSTRAINT contingent_work_order_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT contingent_work_order_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT contingent_work_order_legal_entity_fk FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES master.legal_entity(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT contingent_work_order_supplier_fk FOREIGN KEY (tenant_id, supplier_id) REFERENCES master.supplier(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT contingent_work_order_submission_fk FOREIGN KEY (tenant_id, candidate_submission_id) REFERENCES document.external_candidate_submission(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT contingent_work_order_commitment_fk FOREIGN KEY (tenant_id, commitment_id) REFERENCES document.commitment(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.contingent_work_order_revision
    ADD CONSTRAINT contingent_work_order_revision_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT contingent_work_order_revision_order_fk FOREIGN KEY (tenant_id, work_order_id) REFERENCES document.contingent_work_order(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT contingent_work_order_revision_prior_fk FOREIGN KEY (tenant_id, prior_revision_id) REFERENCES document.contingent_work_order_revision(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT contingent_work_order_revision_rate_fk FOREIGN KEY (tenant_id, rate_id) REFERENCES control.external_workforce_rate(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT contingent_work_order_revision_workflow_fk FOREIGN KEY (tenant_id, workflow_request_id) REFERENCES document.workflow_request(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.statement_of_work
    ADD CONSTRAINT statement_of_work_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT statement_of_work_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT statement_of_work_legal_entity_fk FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES master.legal_entity(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT statement_of_work_supplier_fk FOREIGN KEY (tenant_id, supplier_id) REFERENCES master.supplier(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT statement_of_work_purchase_requisition_fk FOREIGN KEY (tenant_id, purchase_requisition_id) REFERENCES document.purchase_requisition(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT statement_of_work_commitment_fk FOREIGN KEY (tenant_id, commitment_id) REFERENCES document.commitment(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.statement_of_work_revision
    ADD CONSTRAINT statement_of_work_revision_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT statement_of_work_revision_sow_fk FOREIGN KEY (tenant_id, statement_of_work_id) REFERENCES document.statement_of_work(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT statement_of_work_revision_prior_fk FOREIGN KEY (tenant_id, prior_revision_id) REFERENCES document.statement_of_work_revision(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT statement_of_work_revision_workflow_fk FOREIGN KEY (tenant_id, workflow_request_id) REFERENCES document.workflow_request(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.statement_of_work_item
    ADD CONSTRAINT statement_of_work_item_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT statement_of_work_item_revision_fk FOREIGN KEY (tenant_id, statement_of_work_revision_id) REFERENCES document.statement_of_work_revision(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.worker_engagement
    ADD CONSTRAINT worker_engagement_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT worker_engagement_external_worker_fk FOREIGN KEY (tenant_id, external_worker_id) REFERENCES master.external_worker(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT worker_engagement_supplier_fk FOREIGN KEY (tenant_id, supplier_id) REFERENCES master.supplier(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT worker_engagement_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT worker_engagement_legal_entity_fk FOREIGN KEY (tenant_id, legal_entity_id) REFERENCES master.legal_entity(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT worker_engagement_work_order_fk FOREIGN KEY (tenant_id, contingent_work_order_id) REFERENCES document.contingent_work_order(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT worker_engagement_sow_fk FOREIGN KEY (tenant_id, statement_of_work_id) REFERENCES document.statement_of_work(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT worker_engagement_rate_fk FOREIGN KEY (tenant_id, rate_id) REFERENCES control.external_workforce_rate(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT worker_engagement_workflow_fk FOREIGN KEY (tenant_id, workflow_request_id) REFERENCES document.workflow_request(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.worker_operational_placement
    ADD CONSTRAINT worker_operational_placement_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT worker_operational_placement_engagement_fk FOREIGN KEY (tenant_id, worker_engagement_id) REFERENCES document.worker_engagement(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT worker_operational_placement_position_fk FOREIGN KEY (tenant_id, position_id) REFERENCES master.position(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT worker_operational_placement_org_unit_fk FOREIGN KEY (tenant_id, org_unit_id) REFERENCES master.org_unit(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT worker_operational_placement_manager_fk FOREIGN KEY (tenant_id, manager_employee_id) REFERENCES master.employee(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT worker_operational_placement_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT worker_operational_placement_cost_center_fk FOREIGN KEY (tenant_id, cost_center_id) REFERENCES master.cost_center(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT worker_operational_placement_profit_center_fk FOREIGN KEY (tenant_id, profit_center_id) REFERENCES master.profit_center(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT worker_operational_placement_project_fk FOREIGN KEY (tenant_id, project_id) REFERENCES master.project(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT worker_operational_placement_site_fk FOREIGN KEY (tenant_id, site_id) REFERENCES master.site(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.worker_operational_placement
    ADD CONSTRAINT worker_operational_placement_primary_no_overlap
    EXCLUDE USING gist (
        tenant_id WITH =,
        worker_engagement_id WITH =,
        daterange(effective_from, COALESCE(effective_until, 'infinity'::date), '[)') WITH &&
    ) WHERE (is_primary AND status = 'active');

ALTER TABLE document.worker_compliance_item
    ADD CONSTRAINT worker_compliance_item_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT worker_compliance_item_engagement_fk FOREIGN KEY (tenant_id, worker_engagement_id) REFERENCES document.worker_engagement(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT worker_compliance_item_evidence_fk FOREIGN KEY (tenant_id, evidence_content_item_id) REFERENCES document.content_item(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.engagement_onboarding_case
    ADD CONSTRAINT engagement_onboarding_case_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT engagement_onboarding_case_engagement_fk FOREIGN KEY (tenant_id, worker_engagement_id) REFERENCES document.worker_engagement(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT engagement_onboarding_case_workflow_fk FOREIGN KEY (tenant_id, workflow_request_id) REFERENCES document.workflow_request(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.external_time_sheet
    ADD CONSTRAINT external_time_sheet_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_time_sheet_engagement_fk FOREIGN KEY (tenant_id, worker_engagement_id) REFERENCES document.worker_engagement(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_time_sheet_workflow_fk FOREIGN KEY (tenant_id, workflow_request_id) REFERENCES document.workflow_request(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_time_sheet_revision_fk FOREIGN KEY (tenant_id, revision_of_time_sheet_id) REFERENCES document.external_time_sheet(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.external_time_entry
    ADD CONSTRAINT external_time_entry_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_time_entry_sheet_fk FOREIGN KEY (tenant_id, time_sheet_id) REFERENCES document.external_time_sheet(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_time_entry_cost_center_fk FOREIGN KEY (tenant_id, cost_center_id) REFERENCES master.cost_center(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_time_entry_project_fk FOREIGN KEY (tenant_id, project_id) REFERENCES master.project(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_time_entry_project_task_fk FOREIGN KEY (tenant_id, project_task_id) REFERENCES document.project_task(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_time_entry_sow_item_fk FOREIGN KEY (tenant_id, statement_of_work_item_id) REFERENCES document.statement_of_work_item(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.external_expense_sheet
    ADD CONSTRAINT external_expense_sheet_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_expense_sheet_engagement_fk FOREIGN KEY (tenant_id, worker_engagement_id) REFERENCES document.worker_engagement(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_expense_sheet_workflow_fk FOREIGN KEY (tenant_id, workflow_request_id) REFERENCES document.workflow_request(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_expense_sheet_revision_fk FOREIGN KEY (tenant_id, revision_of_expense_sheet_id) REFERENCES document.external_expense_sheet(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.external_expense_item
    ADD CONSTRAINT external_expense_item_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_expense_item_sheet_fk FOREIGN KEY (tenant_id, expense_sheet_id) REFERENCES document.external_expense_sheet(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_expense_item_cost_center_fk FOREIGN KEY (tenant_id, cost_center_id) REFERENCES master.cost_center(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_expense_item_project_fk FOREIGN KEY (tenant_id, project_id) REFERENCES master.project(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_expense_item_project_task_fk FOREIGN KEY (tenant_id, project_task_id) REFERENCES document.project_task(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_expense_item_sow_item_fk FOREIGN KEY (tenant_id, statement_of_work_item_id) REFERENCES document.statement_of_work_item(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_expense_item_receipt_fk FOREIGN KEY (tenant_id, receipt_content_item_id) REFERENCES document.content_item(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.external_service_entry
    ADD CONSTRAINT external_service_entry_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_service_entry_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_service_entry_supplier_fk FOREIGN KEY (tenant_id, supplier_id) REFERENCES master.supplier(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_service_entry_commitment_fk FOREIGN KEY (tenant_id, commitment_id) REFERENCES document.commitment(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_service_entry_workflow_fk FOREIGN KEY (tenant_id, workflow_request_id) REFERENCES document.workflow_request(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.external_service_entry_line
    ADD CONSTRAINT external_service_entry_line_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_service_entry_line_entry_fk FOREIGN KEY (tenant_id, service_entry_id) REFERENCES document.external_service_entry(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_service_entry_line_time_fk FOREIGN KEY (tenant_id, time_sheet_id) REFERENCES document.external_time_sheet(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_service_entry_line_expense_fk FOREIGN KEY (tenant_id, expense_sheet_id) REFERENCES document.external_expense_sheet(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_service_entry_line_sow_item_fk FOREIGN KEY (tenant_id, statement_of_work_item_id) REFERENCES document.statement_of_work_item(tenant_id, id) ON DELETE RESTRICT;

ALTER TABLE document.external_workforce_invoice_allocation
    ADD CONSTRAINT external_workforce_invoice_allocation_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant(id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_workforce_invoice_allocation_invoice_line_fk FOREIGN KEY (tenant_id, purchase_invoice_line_id) REFERENCES document.purchase_invoice_line(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_workforce_invoice_allocation_service_line_fk FOREIGN KEY (tenant_id, service_entry_line_id) REFERENCES document.external_service_entry_line(tenant_id, id) ON DELETE RESTRICT,
    ADD CONSTRAINT external_workforce_invoice_allocation_reversal_fk FOREIGN KEY (tenant_id, reverses_allocation_id) REFERENCES document.external_workforce_invoice_allocation(tenant_id, id) ON DELETE RESTRICT;

-- Source: planes/neon/master/06_indexes.sql
CREATE INDEX external_worker_status_idx
    ON master.external_worker (tenant_id, status, worker_number);

-- Source: planes/neon/control/06_indexes.sql
CREATE INDEX external_workforce_rate_card_active_idx
    ON control.external_workforce_rate_card (tenant_id, company_code_id, effective_from, effective_until)
    WHERE status = 'active';
CREATE INDEX external_workforce_rate_match_idx
    ON control.external_workforce_rate (tenant_id, rate_card_id, supplier_id, job_id, site_id, worker_classification, effective_from)
    WHERE status = 'active';

-- Source: planes/neon/document/06_indexes.sql
CREATE INDEX workforce_requisition_status_idx ON document.workforce_requisition (tenant_id, company_code_id, status, expected_start_date);
CREATE INDEX workforce_requisition_supplier_supplier_idx ON document.workforce_requisition_supplier (tenant_id, supplier_id, status, response_due_at);
CREATE INDEX external_candidate_submission_review_idx ON document.external_candidate_submission (tenant_id, workforce_requisition_id, status, submitted_at);
CREATE INDEX external_candidate_submission_person_idx ON document.external_candidate_submission (tenant_id, person_id) WHERE person_id IS NOT NULL;
CREATE INDEX contingent_work_order_status_idx ON document.contingent_work_order (tenant_id, company_code_id, supplier_id, status);
CREATE INDEX contingent_work_order_revision_effective_idx ON document.contingent_work_order_revision (tenant_id, work_order_id, status, start_date, end_date);
CREATE UNIQUE INDEX contingent_work_order_revision_one_effective_uq ON document.contingent_work_order_revision (tenant_id, work_order_id) WHERE status = 'effective';
CREATE INDEX statement_of_work_status_idx ON document.statement_of_work (tenant_id, company_code_id, supplier_id, status);
CREATE INDEX statement_of_work_revision_effective_idx ON document.statement_of_work_revision (tenant_id, statement_of_work_id, status, start_date, end_date);
CREATE UNIQUE INDEX statement_of_work_revision_one_effective_uq ON document.statement_of_work_revision (tenant_id, statement_of_work_id) WHERE status = 'effective';
CREATE INDEX worker_engagement_worker_idx ON document.worker_engagement (tenant_id, external_worker_id, status, start_date, end_date);
CREATE INDEX worker_engagement_supplier_idx ON document.worker_engagement (tenant_id, supplier_id, company_code_id, status);
CREATE INDEX worker_operational_placement_effective_idx ON document.worker_operational_placement (tenant_id, worker_engagement_id, effective_from, effective_until) WHERE status = 'active';
CREATE UNIQUE INDEX worker_operational_placement_primary_open_uq ON document.worker_operational_placement (tenant_id, worker_engagement_id) WHERE is_primary AND effective_until IS NULL AND status = 'active';
CREATE INDEX worker_compliance_item_readiness_idx ON document.worker_compliance_item (tenant_id, worker_engagement_id, required_before, decision, valid_until);
CREATE INDEX external_time_sheet_approval_idx ON document.external_time_sheet (tenant_id, status, period_end, worker_engagement_id);
CREATE INDEX external_expense_sheet_approval_idx ON document.external_expense_sheet (tenant_id, status, period_end, worker_engagement_id);
CREATE INDEX external_service_entry_approval_idx ON document.external_service_entry (tenant_id, company_code_id, supplier_id, status, service_period_end);
CREATE INDEX external_workforce_invoice_allocation_source_idx ON document.external_workforce_invoice_allocation (tenant_id, service_entry_line_id, allocation_kind);

-- Source: planes/neon/document/07_functions.sql
CREATE OR REPLACE FUNCTION document.trg_reject_external_workforce_history_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    RAISE EXCEPTION 'External workforce historical evidence is append-only'
        USING ERRCODE = 'restrict_violation';
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_external_candidate_submission()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, document AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM document.workforce_requisition_supplier distribution
        WHERE distribution.tenant_id = NEW.tenant_id
          AND distribution.id = NEW.requisition_supplier_id
          AND distribution.workforce_requisition_id = NEW.workforce_requisition_id
          AND distribution.supplier_id = NEW.supplier_id
          AND distribution.status IN ('distributed','acknowledged')
    ) THEN
        RAISE EXCEPTION 'Candidate submission must use an open distribution for the same requisition and supplier'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_contingent_work_order()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, document AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM document.external_candidate_submission submission
        WHERE submission.tenant_id = NEW.tenant_id
          AND submission.id = NEW.candidate_submission_id
          AND submission.supplier_id = NEW.supplier_id
          AND submission.status = 'selected'
    ) THEN
        RAISE EXCEPTION 'Contingent work order requires a selected submission from the same supplier'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_worker_engagement()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, document, master AS $$
DECLARE
    v_source_matches boolean;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM master.external_worker worker
        WHERE worker.tenant_id = NEW.tenant_id AND worker.id = NEW.external_worker_id
          AND worker.status IN ('prospect','active')
    ) THEN
        RAISE EXCEPTION 'Worker engagement requires an available external-worker role'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF NEW.contingent_work_order_id IS NOT NULL THEN
        SELECT EXISTS (
            SELECT 1 FROM document.contingent_work_order work_order
            WHERE work_order.tenant_id = NEW.tenant_id AND work_order.id = NEW.contingent_work_order_id
              AND work_order.supplier_id = NEW.supplier_id
              AND work_order.company_code_id = NEW.company_code_id
              AND work_order.legal_entity_id = NEW.legal_entity_id
              AND work_order.status IN ('pending_supplier_acceptance','active','suspended','completed')
        ) INTO v_source_matches;
    ELSE
        SELECT EXISTS (
            SELECT 1 FROM document.statement_of_work sow
            WHERE sow.tenant_id = NEW.tenant_id AND sow.id = NEW.statement_of_work_id
              AND sow.supplier_id = NEW.supplier_id
              AND sow.company_code_id = NEW.company_code_id
              AND sow.legal_entity_id = NEW.legal_entity_id
              AND sow.status IN ('pending_supplier_acceptance','active','suspended','completed')
        ) INTO v_source_matches;
    END IF;
    IF NOT v_source_matches THEN
        RAISE EXCEPTION 'Worker engagement supplier, buyer company, legal entity and source contract must agree'
            USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_external_revision()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Commercial revisions cannot be deleted' USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.status IN ('effective','superseded','rejected','cancelled') THEN
        RAISE EXCEPTION 'Terminal commercial revisions are immutable' USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.status <> 'draft' AND (
        to_jsonb(NEW) - ARRAY['status','supplier_accepted_at','supplier_accepted_by','effective_at']
    ) IS DISTINCT FROM (
        to_jsonb(OLD) - ARRAY['status','supplier_accepted_at','supplier_accepted_by','effective_at']
    ) THEN
        RAISE EXCEPTION 'Approved commercial revision terms and approval evidence are immutable'
            USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION document.trg_guard_worker_compliance_item()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Worker compliance evidence cannot be deleted' USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.decision <> 'pending' THEN
        RAISE EXCEPTION 'Worker compliance decision evidence is immutable' USING ERRCODE = 'restrict_violation';
    END IF;
    IF (NEW.id,NEW.tenant_id,NEW.worker_engagement_id,NEW.requirement_code,NEW.requirement_version,NEW.category,NEW.required_before,NEW.created_at,NEW.created_by)
       IS DISTINCT FROM
       (OLD.id,OLD.tenant_id,OLD.worker_engagement_id,OLD.requirement_code,OLD.requirement_version,OLD.category,OLD.required_before,OLD.created_at,OLD.created_by) THEN
        RAISE EXCEPTION 'Worker compliance requirement identity is immutable' USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END;
$$;

-- Source: planes/neon/document/08_triggers.sql
CREATE TRIGGER trg_external_candidate_submission_10_scope BEFORE INSERT OR UPDATE OF workforce_requisition_id,requisition_supplier_id,supplier_id ON document.external_candidate_submission FOR EACH ROW EXECUTE FUNCTION document.trg_guard_external_candidate_submission();
CREATE TRIGGER trg_contingent_work_order_10_scope BEFORE INSERT OR UPDATE OF candidate_submission_id,supplier_id ON document.contingent_work_order FOR EACH ROW EXECUTE FUNCTION document.trg_guard_contingent_work_order();
CREATE TRIGGER trg_worker_engagement_10_scope BEFORE INSERT OR UPDATE OF external_worker_id,supplier_id,company_code_id,legal_entity_id,contingent_work_order_id,statement_of_work_id ON document.worker_engagement FOR EACH ROW EXECUTE FUNCTION document.trg_guard_worker_engagement();

CREATE TRIGGER trg_external_candidate_evaluation_immutable BEFORE UPDATE OR DELETE ON document.external_candidate_evaluation FOR EACH ROW EXECUTE FUNCTION document.trg_reject_external_workforce_history_mutation();
CREATE TRIGGER trg_contingent_work_order_revision_guard BEFORE UPDATE OR DELETE ON document.contingent_work_order_revision FOR EACH ROW EXECUTE FUNCTION document.trg_guard_external_revision();
CREATE TRIGGER trg_statement_of_work_revision_guard BEFORE UPDATE OR DELETE ON document.statement_of_work_revision FOR EACH ROW EXECUTE FUNCTION document.trg_guard_external_revision();
CREATE TRIGGER trg_worker_compliance_item_guard BEFORE UPDATE OR DELETE ON document.worker_compliance_item FOR EACH ROW EXECUTE FUNCTION document.trg_guard_worker_compliance_item();
CREATE TRIGGER trg_external_workforce_invoice_allocation_immutable BEFORE UPDATE OR DELETE ON document.external_workforce_invoice_allocation FOR EACH ROW EXECUTE FUNCTION document.trg_reject_external_workforce_history_mutation();

DO $$
DECLARE v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'workforce_requisition','external_candidate_submission','contingent_work_order','statement_of_work',
        'worker_engagement','engagement_onboarding_case','external_time_sheet','external_expense_sheet','external_service_entry'
    ] LOOP
        EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON document.%I FOR EACH ROW EXECUTE FUNCTION document.trg_increment_row_version()', 'trg_'||v_table||'_80_version', v_table);
        EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON document.%I FOR EACH ROW EXECUTE FUNCTION shared.trg_set_updated_at()', 'trg_'||v_table||'_90_updated', v_table);
        EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OF status,status_changed_at,status_changed_by ON document.%I FOR EACH ROW EXECUTE FUNCTION document.trg_stamp_status_evidence()', 'trg_'||v_table||'_20_status', v_table);
    END LOOP;
END;
$$;

-- Source: planes/neon/master/10_rls.sql
ALTER TABLE master.external_worker ENABLE ROW LEVEL SECURITY;
ALTER TABLE master.external_worker FORCE ROW LEVEL SECURITY;
CREATE POLICY external_worker_tenant_access ON master.external_worker FOR ALL
    USING (tenant_id = shared.current_tenant_id_soft())
    WITH CHECK (tenant_id = shared.current_tenant_id());
CREATE POLICY external_worker_seed_write ON master.external_worker FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true);

-- Source: planes/neon/control/10_rls.sql
DO $$
DECLARE v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY['external_workforce_rate_card','external_workforce_rate'] LOOP
        EXECUTE format('ALTER TABLE control.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE control.%I FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format('CREATE POLICY tenant_access ON control.%I FOR ALL USING (tenant_id=shared.current_tenant_id_soft()) WITH CHECK (tenant_id=shared.current_tenant_id())', v_table);
        EXECUTE format('CREATE POLICY seed_write ON control.%I FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true)', v_table);
    END LOOP;
END;
$$;

-- Source: planes/neon/document/10_rls.sql
DO $$
DECLARE v_table text;
BEGIN
    FOREACH v_table IN ARRAY ARRAY[
        'workforce_requisition','workforce_requisition_supplier','external_candidate_submission','external_candidate_evaluation',
        'contingent_work_order','contingent_work_order_revision','statement_of_work','statement_of_work_revision','statement_of_work_item',
        'worker_engagement','worker_operational_placement','worker_compliance_item','engagement_onboarding_case',
        'external_time_sheet','external_time_entry','external_expense_sheet','external_expense_item',
        'external_service_entry','external_service_entry_line','external_workforce_invoice_allocation'
    ] LOOP
        EXECUTE format('ALTER TABLE document.%I ENABLE ROW LEVEL SECURITY', v_table);
        EXECUTE format('ALTER TABLE document.%I FORCE ROW LEVEL SECURITY', v_table);
        EXECUTE format('CREATE POLICY tenant_access ON document.%I FOR ALL USING (tenant_id=shared.current_tenant_id_soft()) WITH CHECK (tenant_id=shared.current_tenant_id())', v_table);
        EXECUTE format('CREATE POLICY seed_write ON document.%I FOR ALL TO CURRENT_USER USING (true) WITH CHECK (true)', v_table);
    END LOOP;
END;
$$;

-- Source: planes/neon/master/11_grants.sql
REVOKE ALL ON master.external_worker FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN GRANT SELECT,INSERT,UPDATE ON master.external_worker TO athyperapp; END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN GRANT ALL PRIVILEGES ON master.external_worker TO athyperadmin; END IF;
END $$;

-- Source: planes/neon/control/11_grants.sql
REVOKE ALL ON control.external_workforce_rate_card, control.external_workforce_rate FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
   GRANT SELECT,INSERT,UPDATE ON control.external_workforce_rate_card, control.external_workforce_rate TO athyperapp;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
   GRANT ALL PRIVILEGES ON control.external_workforce_rate_card, control.external_workforce_rate TO athyperadmin;
 END IF;
END $$;

-- Source: planes/neon/document/11_grants.sql
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperapp') THEN
   GRANT SELECT,INSERT,UPDATE ON
     document.workforce_requisition,document.workforce_requisition_supplier,document.external_candidate_submission,
     document.contingent_work_order,document.contingent_work_order_revision,document.statement_of_work,
     document.statement_of_work_revision,document.statement_of_work_item,document.worker_engagement,
     document.worker_operational_placement,document.worker_compliance_item,document.engagement_onboarding_case,
     document.external_time_sheet,document.external_time_entry,document.external_expense_sheet,document.external_expense_item,
     document.external_service_entry,document.external_service_entry_line
   TO athyperapp;
   GRANT SELECT,INSERT ON document.external_candidate_evaluation,document.external_workforce_invoice_allocation TO athyperapp;
   GRANT EXECUTE ON FUNCTION document.trg_reject_external_workforce_history_mutation() TO athyperapp;
   GRANT EXECUTE ON FUNCTION document.trg_guard_external_candidate_submission() TO athyperapp;
   GRANT EXECUTE ON FUNCTION document.trg_guard_contingent_work_order() TO athyperapp;
   GRANT EXECUTE ON FUNCTION document.trg_guard_worker_engagement() TO athyperapp;
   GRANT EXECUTE ON FUNCTION document.trg_guard_external_revision() TO athyperapp;
   GRANT EXECUTE ON FUNCTION document.trg_guard_worker_compliance_item() TO athyperapp;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='athyperadmin') THEN
   GRANT ALL PRIVILEGES ON
     document.workforce_requisition,document.workforce_requisition_supplier,document.external_candidate_submission,
     document.external_candidate_evaluation,document.contingent_work_order,document.contingent_work_order_revision,
     document.statement_of_work,document.statement_of_work_revision,document.statement_of_work_item,
     document.worker_engagement,document.worker_operational_placement,document.worker_compliance_item,
     document.engagement_onboarding_case,document.external_time_sheet,document.external_time_entry,
     document.external_expense_sheet,document.external_expense_item,document.external_service_entry,
     document.external_service_entry_line,document.external_workforce_invoice_allocation
   TO athyperadmin;
 END IF;
END $$;

COMMIT;
