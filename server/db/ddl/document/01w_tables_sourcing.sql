-- ============================================================================
-- Procurement sourcing documents
-- Operating Organization owns orchestration; Company Code owns legal outputs.
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.sourcing_event (
    id                          uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid            NOT NULL,
    code                        text            NOT NULL,
    name                        text            NOT NULL,
    operating_organization_id  uuid            NOT NULL,
    event_type                  text            NOT NULL DEFAULT 'rfp',
    buying_model                text            NOT NULL DEFAULT 'federated',
    central_buyer_company_id    uuid,
    requested_by                uuid            NOT NULL,
    status                      text            NOT NULL DEFAULT 'draft',
    open_at                     timestamptz,
    close_at                    timestamptz,
    metadata                    jsonb           NOT NULL DEFAULT '{}'::jsonb,
    created_at                  timestamptz     NOT NULL DEFAULT now(),
    created_by                  uuid            NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT sourcing_event_pkey PRIMARY KEY (id),
    CONSTRAINT sourcing_event_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT sourcing_event_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT sourcing_event_type_chk CHECK (event_type IN ('rfp', 'rfq')),
    CONSTRAINT sourcing_event_buying_model_chk CHECK (buying_model IN ('federated', 'central_buyer')),
    CONSTRAINT sourcing_event_central_buyer_chk CHECK (
        buying_model <> 'central_buyer' OR central_buyer_company_id IS NOT NULL),
    CONSTRAINT sourcing_event_status_chk CHECK (status IN ('draft', 'published', 'evaluation', 'awarded', 'cancelled', 'closed')),
    CONSTRAINT sourcing_event_date_chk CHECK (close_at IS NULL OR open_at IS NULL OR close_at > open_at),
    CONSTRAINT sourcing_event_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE IF NOT EXISTS document.sourcing_event_company (
    id                  uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id           uuid            NOT NULL,
    sourcing_event_id   uuid            NOT NULL,
    company_code_id     uuid            NOT NULL,
    participation_role  text            NOT NULL DEFAULT 'participant',
    status              text            NOT NULL DEFAULT 'active',
    metadata            jsonb           NOT NULL DEFAULT '{}'::jsonb,
    created_at          timestamptz     NOT NULL DEFAULT now(),
    created_by          uuid            NOT NULL,
    updated_at          timestamptz,
    updated_by          uuid,

    CONSTRAINT sourcing_event_company_pkey PRIMARY KEY (id),
    CONSTRAINT sourcing_event_company_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT sourcing_event_company_uq UNIQUE (tenant_id, sourcing_event_id, company_code_id),
    CONSTRAINT sourcing_event_company_role_chk CHECK (participation_role IN ('lead_buyer', 'participant', 'beneficiary')),
    CONSTRAINT sourcing_event_company_status_chk CHECK (status IN ('active', 'removed')),
    CONSTRAINT sourcing_event_company_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE IF NOT EXISTS document.sourcing_event_demand (
    id                          uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid            NOT NULL,
    sourcing_event_id           uuid            NOT NULL,
    purchase_requisition_line_id uuid           NOT NULL,
    demand_company_code_id      uuid            NOT NULL,
    requested_quantity           numeric(18,4),
    requested_amount             numeric(18,4),
    status                      text            NOT NULL DEFAULT 'included',
    metadata                    jsonb           NOT NULL DEFAULT '{}'::jsonb,
    created_at                  timestamptz     NOT NULL DEFAULT now(),
    created_by                  uuid            NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT sourcing_event_demand_pkey PRIMARY KEY (id),
    CONSTRAINT sourcing_event_demand_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT sourcing_event_demand_uq UNIQUE (tenant_id, sourcing_event_id, purchase_requisition_line_id),
    CONSTRAINT sourcing_event_demand_qty_chk CHECK (requested_quantity IS NULL OR requested_quantity >= 0),
    CONSTRAINT sourcing_event_demand_amount_chk CHECK (requested_amount IS NULL OR requested_amount >= 0),
    CONSTRAINT sourcing_event_demand_status_chk CHECK (status IN ('included', 'withdrawn', 'converted')),
    CONSTRAINT sourcing_event_demand_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE IF NOT EXISTS document.sourcing_event_award (
    id                          uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid            NOT NULL,
    sourcing_event_id           uuid            NOT NULL,
    supplier_id                uuid            NOT NULL,
    award_status                text            NOT NULL DEFAULT 'recommended',
    recommendation_note        text,
    metadata                    jsonb           NOT NULL DEFAULT '{}'::jsonb,
    created_at                  timestamptz     NOT NULL DEFAULT now(),
    created_by                  uuid            NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT sourcing_event_award_pkey PRIMARY KEY (id),
    CONSTRAINT sourcing_event_award_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT sourcing_event_award_uq UNIQUE (tenant_id, sourcing_event_id, supplier_id),
    CONSTRAINT sourcing_event_award_status_chk CHECK (award_status IN ('recommended', 'approved', 'rejected', 'converted')),
    CONSTRAINT sourcing_event_award_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE IF NOT EXISTS document.sourcing_event_award_allocation (
    id                          uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid            NOT NULL,
    award_id                    uuid            NOT NULL,
    company_code_id             uuid            NOT NULL,
    allocation_percent          numeric(7,4),
    allocation_amount           numeric(18,4),
    output_commitment_id        uuid,
    status                      text            NOT NULL DEFAULT 'planned',
    metadata                    jsonb           NOT NULL DEFAULT '{}'::jsonb,
    created_at                  timestamptz     NOT NULL DEFAULT now(),
    created_by                  uuid            NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT sourcing_event_award_alloc_pkey PRIMARY KEY (id),
    CONSTRAINT sourcing_event_award_alloc_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT sourcing_event_award_alloc_uq UNIQUE (tenant_id, award_id, company_code_id),
    CONSTRAINT sourcing_event_award_alloc_percent_chk CHECK (allocation_percent IS NULL OR allocation_percent BETWEEN 0 AND 100),
    CONSTRAINT sourcing_event_award_alloc_amount_chk CHECK (allocation_amount IS NULL OR allocation_amount >= 0),
    CONSTRAINT sourcing_event_award_alloc_status_chk CHECK (status IN ('planned', 'converted', 'cancelled')),
    CONSTRAINT sourcing_event_award_alloc_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object')
);

DO $$ BEGIN ALTER TABLE document.sourcing_event ADD CONSTRAINT sourcing_event_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.sourcing_event ADD CONSTRAINT sourcing_event_oo_fk
    FOREIGN KEY (tenant_id, operating_organization_id) REFERENCES master.operating_organization (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.sourcing_event ADD CONSTRAINT sourcing_event_central_company_fk
    FOREIGN KEY (tenant_id, central_buyer_company_id) REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE document.sourcing_event_company ADD CONSTRAINT sourcing_event_company_event_fk
    FOREIGN KEY (tenant_id, sourcing_event_id) REFERENCES document.sourcing_event (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.sourcing_event_company ADD CONSTRAINT sourcing_event_company_code_fk
    FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE document.sourcing_event_demand ADD CONSTRAINT sourcing_event_demand_event_fk
    FOREIGN KEY (tenant_id, sourcing_event_id) REFERENCES document.sourcing_event (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.sourcing_event_demand ADD CONSTRAINT sourcing_event_demand_line_fk
    FOREIGN KEY (tenant_id, purchase_requisition_line_id) REFERENCES document.purchase_requisition_line (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.sourcing_event_demand ADD CONSTRAINT sourcing_event_demand_company_fk
    FOREIGN KEY (tenant_id, demand_company_code_id) REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE document.sourcing_event_award ADD CONSTRAINT sourcing_event_award_event_fk
    FOREIGN KEY (tenant_id, sourcing_event_id) REFERENCES document.sourcing_event (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.sourcing_event_award_allocation ADD CONSTRAINT sourcing_event_award_alloc_award_fk
    FOREIGN KEY (tenant_id, award_id) REFERENCES document.sourcing_event_award (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.sourcing_event_award_allocation ADD CONSTRAINT sourcing_event_award_alloc_company_fk
    FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS sourcing_event_tenant_oo_idx
    ON document.sourcing_event (tenant_id, operating_organization_id, status);
CREATE INDEX IF NOT EXISTS sourcing_event_demand_company_idx
    ON document.sourcing_event_demand (tenant_id, demand_company_code_id, status);
CREATE INDEX IF NOT EXISTS sourcing_event_award_alloc_company_idx
    ON document.sourcing_event_award_allocation (tenant_id, company_code_id, status);

CREATE TABLE IF NOT EXISTS document.sourcing_event_intercompany_allocation (
    id                          uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid            NOT NULL,
    award_allocation_id         uuid            NOT NULL,
    source_company_code_id      uuid            NOT NULL,
    beneficiary_company_code_id uuid            NOT NULL,
    commitment_id               uuid            NOT NULL,
    allocation_amount           numeric(18,4)   NOT NULL DEFAULT 0,
    currency_code               character(3),
    status                      text            NOT NULL DEFAULT 'planned',
    metadata                    jsonb           NOT NULL DEFAULT '{}'::jsonb,
    created_at                  timestamptz     NOT NULL DEFAULT now(),
    created_by                  uuid            NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT sourcing_event_ic_alloc_pkey PRIMARY KEY (id),
    CONSTRAINT sourcing_event_ic_alloc_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT sourcing_event_ic_alloc_uq UNIQUE (tenant_id, award_allocation_id, beneficiary_company_code_id),
    CONSTRAINT sourcing_event_ic_alloc_company_chk CHECK (source_company_code_id <> beneficiary_company_code_id),
    CONSTRAINT sourcing_event_ic_alloc_amount_chk CHECK (allocation_amount >= 0),
    CONSTRAINT sourcing_event_ic_alloc_status_chk CHECK (status IN ('planned', 'posted', 'cancelled')),
    CONSTRAINT sourcing_event_ic_alloc_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object')
);

DO $$ BEGIN ALTER TABLE document.sourcing_event_intercompany_allocation ADD CONSTRAINT sourcing_event_ic_alloc_tenant_fk
    FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.sourcing_event_intercompany_allocation ADD CONSTRAINT sourcing_event_ic_alloc_award_fk
    FOREIGN KEY (tenant_id, award_allocation_id) REFERENCES document.sourcing_event_award_allocation (tenant_id, id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.sourcing_event_intercompany_allocation ADD CONSTRAINT sourcing_event_ic_alloc_source_company_fk
    FOREIGN KEY (tenant_id, source_company_code_id) REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.sourcing_event_intercompany_allocation ADD CONSTRAINT sourcing_event_ic_alloc_beneficiary_company_fk
    FOREIGN KEY (tenant_id, beneficiary_company_code_id) REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.sourcing_event_intercompany_allocation ADD CONSTRAINT sourcing_event_ic_alloc_commitment_fk
    FOREIGN KEY (tenant_id, commitment_id) REFERENCES document.commitment (tenant_id, id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS sourcing_event_ic_alloc_beneficiary_idx
    ON document.sourcing_event_intercompany_allocation (tenant_id, beneficiary_company_code_id, status);
