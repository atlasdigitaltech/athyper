-- Sales orchestration documents. Operating Organization owns coordination;
-- Company Code owns seller orders and fulfillment outputs.

CREATE TABLE IF NOT EXISTS document.sales_opportunity (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL,
    code text NOT NULL, name text NOT NULL, customer_id uuid NOT NULL,
    operating_organization_id uuid NOT NULL, selling_model text NOT NULL DEFAULT 'federated',
    principal_seller_company_id uuid, requested_by uuid NOT NULL, status text NOT NULL DEFAULT 'draft',
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT sales_opportunity_pkey PRIMARY KEY (id), CONSTRAINT sales_opportunity_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT sales_opportunity_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT sales_opportunity_model_chk CHECK (selling_model IN ('federated', 'principal_seller')),
    CONSTRAINT sales_opportunity_principal_chk CHECK (selling_model <> 'principal_seller' OR principal_seller_company_id IS NOT NULL),
    CONSTRAINT sales_opportunity_status_chk CHECK (status IN ('draft', 'qualified', 'proposal', 'won', 'lost', 'cancelled')),
    CONSTRAINT sales_opportunity_metadata_chk CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE IF NOT EXISTS document.sales_opportunity_company (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, opportunity_id uuid NOT NULL,
    company_code_id uuid NOT NULL, participation_role text NOT NULL DEFAULT 'participant', status text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT sales_opportunity_company_pkey PRIMARY KEY (id), CONSTRAINT sales_opportunity_company_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT sales_opportunity_company_uq UNIQUE (tenant_id, opportunity_id, company_code_id),
    CONSTRAINT sales_opportunity_company_role_chk CHECK (participation_role IN ('lead_seller', 'participant', 'fulfillment')),
    CONSTRAINT sales_opportunity_company_status_chk CHECK (status IN ('active', 'removed'))
);

CREATE TABLE IF NOT EXISTS document.sales_quotation (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, opportunity_id uuid NOT NULL,
    code text NOT NULL, name text NOT NULL, customer_id uuid NOT NULL, operating_organization_id uuid NOT NULL,
    selling_model text NOT NULL DEFAULT 'federated', principal_seller_company_id uuid, requested_by uuid NOT NULL,
    status text NOT NULL DEFAULT 'draft', metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT sales_quotation_pkey PRIMARY KEY (id), CONSTRAINT sales_quotation_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT sales_quotation_code_uq UNIQUE (tenant_id, code),
    CONSTRAINT sales_quotation_model_chk CHECK (selling_model IN ('federated', 'principal_seller')),
    CONSTRAINT sales_quotation_principal_chk CHECK (selling_model <> 'principal_seller' OR principal_seller_company_id IS NOT NULL),
    CONSTRAINT sales_quotation_status_chk CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'converted', 'cancelled')),
    CONSTRAINT sales_quotation_metadata_chk CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE IF NOT EXISTS document.sales_quotation_company (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, quotation_id uuid NOT NULL,
    company_code_id uuid NOT NULL, participation_role text NOT NULL DEFAULT 'participant', status text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT sales_quotation_company_pkey PRIMARY KEY (id), CONSTRAINT sales_quotation_company_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT sales_quotation_company_uq UNIQUE (tenant_id, quotation_id, company_code_id),
    CONSTRAINT sales_quotation_company_role_chk CHECK (participation_role IN ('lead_seller', 'participant', 'fulfillment')),
    CONSTRAINT sales_quotation_company_status_chk CHECK (status IN ('active', 'removed'))
);

CREATE TABLE IF NOT EXISTS document.sales_quotation_allocation (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, quotation_id uuid NOT NULL,
    company_code_id uuid NOT NULL, allocation_percent numeric(7,4), allocation_amount numeric(18,4),
    output_sales_order_id uuid, status text NOT NULL DEFAULT 'planned', metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT sales_quotation_allocation_pkey PRIMARY KEY (id), CONSTRAINT sales_quotation_allocation_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT sales_quotation_allocation_uq UNIQUE (tenant_id, quotation_id, company_code_id),
    CONSTRAINT sales_quotation_allocation_percent_chk CHECK (allocation_percent IS NULL OR allocation_percent BETWEEN 0 AND 100),
    CONSTRAINT sales_quotation_allocation_amount_chk CHECK (allocation_amount IS NULL OR allocation_amount >= 0),
    CONSTRAINT sales_quotation_allocation_status_chk CHECK (status IN ('planned', 'converted', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS document.sales_order (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, quotation_id uuid NOT NULL,
    code text NOT NULL, name text NOT NULL, company_code_id uuid NOT NULL, customer_id uuid NOT NULL,
    order_date date NOT NULL, currency_code character(3) NOT NULL, total_amount numeric(18,4) NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'draft', metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT sales_order_pkey PRIMARY KEY (id), CONSTRAINT sales_order_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT sales_order_code_uq UNIQUE (tenant_id, company_code_id, code), CONSTRAINT sales_order_amount_chk CHECK (total_amount >= 0),
    CONSTRAINT sales_order_status_chk CHECK (status IN ('draft', 'pending_approval', 'approved', 'active', 'closed', 'cancelled'))
);

CREATE TABLE IF NOT EXISTS document.sales_order_intercompany_fulfillment (
    id uuid NOT NULL DEFAULT shared.uuidv7(), tenant_id uuid NOT NULL, sales_order_id uuid NOT NULL,
    selling_company_code_id uuid NOT NULL, fulfillment_company_code_id uuid NOT NULL,
    allocation_amount numeric(18,4) NOT NULL DEFAULT 0, currency_code character(3) NOT NULL,
    status text NOT NULL DEFAULT 'planned', metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL, updated_at timestamptz, updated_by uuid,
    CONSTRAINT sales_order_ic_fulfillment_pkey PRIMARY KEY (id), CONSTRAINT sales_order_ic_fulfillment_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT sales_order_ic_fulfillment_uq UNIQUE (tenant_id, sales_order_id, fulfillment_company_code_id),
    CONSTRAINT sales_order_ic_company_chk CHECK (selling_company_code_id <> fulfillment_company_code_id),
    CONSTRAINT sales_order_ic_amount_chk CHECK (allocation_amount >= 0), CONSTRAINT sales_order_ic_status_chk CHECK (status IN ('planned', 'posted', 'cancelled'))
);

DO $$ BEGIN ALTER TABLE document.sales_opportunity ADD CONSTRAINT sales_opportunity_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.sales_opportunity ADD CONSTRAINT sales_opportunity_oo_fk FOREIGN KEY (tenant_id, operating_organization_id) REFERENCES master.operating_organization (tenant_id, id) ON DELETE RESTRICT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.sales_opportunity ADD CONSTRAINT sales_opportunity_customer_fk FOREIGN KEY (tenant_id, customer_id) REFERENCES master.customer (tenant_id, id) ON DELETE RESTRICT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.sales_opportunity ADD CONSTRAINT sales_opportunity_principal_seller_fk FOREIGN KEY (tenant_id, principal_seller_company_id) REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.sales_opportunity_company ADD CONSTRAINT sales_opportunity_company_event_fk FOREIGN KEY (tenant_id, opportunity_id) REFERENCES document.sales_opportunity (tenant_id, id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.sales_opportunity_company ADD CONSTRAINT sales_opportunity_company_code_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.sales_quotation ADD CONSTRAINT sales_quotation_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.sales_quotation ADD CONSTRAINT sales_quotation_opportunity_fk FOREIGN KEY (tenant_id, opportunity_id) REFERENCES document.sales_opportunity (tenant_id, id) ON DELETE RESTRICT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.sales_quotation ADD CONSTRAINT sales_quotation_oo_fk FOREIGN KEY (tenant_id, operating_organization_id) REFERENCES master.operating_organization (tenant_id, id) ON DELETE RESTRICT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.sales_quotation ADD CONSTRAINT sales_quotation_customer_fk FOREIGN KEY (tenant_id, customer_id) REFERENCES master.customer (tenant_id, id) ON DELETE RESTRICT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.sales_quotation ADD CONSTRAINT sales_quotation_principal_seller_fk FOREIGN KEY (tenant_id, principal_seller_company_id) REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.sales_quotation_company ADD CONSTRAINT sales_quotation_company_quote_fk FOREIGN KEY (tenant_id, quotation_id) REFERENCES document.sales_quotation (tenant_id, id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.sales_quotation_company ADD CONSTRAINT sales_quotation_company_code_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.sales_quotation_allocation ADD CONSTRAINT sales_quotation_alloc_quote_fk FOREIGN KEY (tenant_id, quotation_id) REFERENCES document.sales_quotation (tenant_id, id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.sales_quotation_allocation ADD CONSTRAINT sales_quotation_alloc_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.sales_order ADD CONSTRAINT sales_order_tenant_fk FOREIGN KEY (tenant_id) REFERENCES master.tenant (id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.sales_order ADD CONSTRAINT sales_order_quote_fk FOREIGN KEY (tenant_id, quotation_id) REFERENCES document.sales_quotation (tenant_id, id) ON DELETE RESTRICT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.sales_order ADD CONSTRAINT sales_order_company_fk FOREIGN KEY (tenant_id, company_code_id) REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.sales_order ADD CONSTRAINT sales_order_customer_fk FOREIGN KEY (tenant_id, customer_id) REFERENCES master.customer (tenant_id, id) ON DELETE RESTRICT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.sales_quotation_allocation ADD CONSTRAINT sales_quotation_alloc_order_fk FOREIGN KEY (tenant_id, output_sales_order_id) REFERENCES document.sales_order (tenant_id, id) ON DELETE RESTRICT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.sales_order_intercompany_fulfillment ADD CONSTRAINT sales_order_ic_order_fk FOREIGN KEY (tenant_id, sales_order_id) REFERENCES document.sales_order (tenant_id, id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.sales_order_intercompany_fulfillment ADD CONSTRAINT sales_order_ic_selling_company_fk FOREIGN KEY (tenant_id, selling_company_code_id) REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE document.sales_order_intercompany_fulfillment ADD CONSTRAINT sales_order_ic_fulfillment_company_fk FOREIGN KEY (tenant_id, fulfillment_company_code_id) REFERENCES master.company_code (tenant_id, id) ON DELETE RESTRICT; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS sales_opportunity_oo_idx ON document.sales_opportunity (tenant_id, operating_organization_id, status);
CREATE INDEX IF NOT EXISTS sales_quotation_oo_idx ON document.sales_quotation (tenant_id, operating_organization_id, status);
CREATE INDEX IF NOT EXISTS sales_quotation_alloc_company_idx ON document.sales_quotation_allocation (tenant_id, company_code_id, status);
