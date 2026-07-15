-- ============================================================================
-- OPERATING ORGANIZATION DOMAIN INTEGRATION
-- Procurement and sales ownership boundary.
--
-- Operating Organization owns orchestration resources. Company Code remains
-- the legal owner of requisitions, purchase orders, invoices, sales orders,
-- deliveries, and revenue postings.
-- ============================================================================

ALTER TABLE master.procurement_organization_profile
    ADD COLUMN IF NOT EXISTS central_buyer_company_id uuid;

ALTER TABLE master.sales_organization_profile
    ADD COLUMN IF NOT EXISTS principal_seller_company_id uuid;

COMMENT ON COLUMN master.procurement_organization_profile.central_buyer_company_id IS
    'Required when buying_model_default is central_buyer. Explicit legal company responsible for central buying and intercompany handling.';

COMMENT ON COLUMN master.sales_organization_profile.principal_seller_company_id IS
    'Required when selling is principal_seller mode. Explicit legal seller responsible for intercompany fulfillment.';

DO $$
BEGIN
    ALTER TABLE master.procurement_organization_profile
        ADD CONSTRAINT pop_central_buyer_company_fk
        FOREIGN KEY (tenant_id, central_buyer_company_id)
        REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE master.sales_organization_profile
        ADD CONSTRAINT sop_principal_seller_company_fk
        FOREIGN KEY (tenant_id, principal_seller_company_id)
        REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE master.procurement_organization_profile
        ADD CONSTRAINT pop_central_buyer_company_req
        CHECK (buying_model_default <> 'central_buyer' OR central_buyer_company_id IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- The current profile vocabulary remains backward compatible. A principal
-- seller is explicitly configured through the nullable company column; future
-- selling-model vocabulary can use the same invariant.

CREATE TABLE IF NOT EXISTS document.operating_organization_resource_owner (
    id                          uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid            NOT NULL,
    operating_organization_id  uuid            NOT NULL,
    domain                      text            NOT NULL,
    resource_type               text            NOT NULL,
    resource_id                 uuid            NOT NULL,
    ownership_role              text            NOT NULL DEFAULT 'owner',
    central_company_code_id     uuid,
    principal_seller_company_id uuid,
    metadata                    jsonb           NOT NULL DEFAULT '{}'::jsonb,
    status                      text            NOT NULL DEFAULT 'active',
    created_at                  timestamptz     NOT NULL DEFAULT now(),
    created_by                  uuid            NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT oor_owner_pkey PRIMARY KEY (id),
    CONSTRAINT oor_owner_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT oor_owner_resource_uq UNIQUE (tenant_id, resource_type, resource_id),
    CONSTRAINT oor_owner_domain_chk CHECK (domain IN ('procurement', 'sales')),
    CONSTRAINT oor_owner_role_chk CHECK (ownership_role = 'owner'),
    CONSTRAINT oor_owner_resource_chk CHECK (
        (domain = 'procurement' AND resource_type IN (
            'sourcing_project', 'sourcing_event', 'rfp', 'rfq', 'award_recommendation'))
        OR
        (domain = 'sales' AND resource_type IN (
            'lead', 'campaign', 'opportunity', 'quotation', 'tender_response'))
    ),
    CONSTRAINT oor_owner_status_chk CHECK (status IN ('active', 'suspended', 'closed')),
    CONSTRAINT oor_owner_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object')
);

COMMENT ON TABLE document.operating_organization_resource_owner IS
    'Operating Organization ownership for procurement and sales orchestration resources. This table does not replace Company Code ownership on legal transactions.';

COMMENT ON COLUMN document.operating_organization_resource_owner.central_company_code_id IS
    'Explicit central buying company for a procurement resource; required by application when central buying is selected.';

COMMENT ON COLUMN document.operating_organization_resource_owner.principal_seller_company_id IS
    'Explicit principal selling company for a sales resource; required by application when principal-seller mode is selected.';

CREATE TABLE IF NOT EXISTS document.operating_organization_resource_company (
    id                          uuid            NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid            NOT NULL,
    resource_owner_id           uuid            NOT NULL,
    company_code_id             uuid            NOT NULL,
    participation_role         text            NOT NULL DEFAULT 'participant',
    allocation_percent          numeric(7,4),
    allocation_amount           numeric(18,4),
    output_type                 text,
    status                      text            NOT NULL DEFAULT 'active',
    metadata                    jsonb           NOT NULL DEFAULT '{}'::jsonb,
    created_at                  timestamptz     NOT NULL DEFAULT now(),
    created_by                  uuid            NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT oor_company_pkey PRIMARY KEY (id),
    CONSTRAINT oor_company_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT oor_company_resource_uq UNIQUE (tenant_id, resource_owner_id, company_code_id),
    CONSTRAINT oor_company_role_chk CHECK (participation_role IN ('lead_buyer', 'lead_seller', 'participant', 'beneficiary')),
    CONSTRAINT oor_company_percent_chk CHECK (allocation_percent IS NULL OR allocation_percent >= 0 AND allocation_percent <= 100),
    CONSTRAINT oor_company_amount_chk CHECK (allocation_amount IS NULL OR allocation_amount >= 0),
    CONSTRAINT oor_company_status_chk CHECK (status IN ('active', 'suspended', 'closed')),
    CONSTRAINT oor_company_metadata_obj_chk CHECK (jsonb_typeof(metadata) = 'object')
);

COMMENT ON TABLE document.operating_organization_resource_company IS
    'Participant Company Code allocations for federated procurement awards and sales quotations. Legal output documents remain Company Code-owned.';

DO $$
BEGIN
    ALTER TABLE document.operating_organization_resource_owner
        ADD CONSTRAINT oor_owner_org_fk
        FOREIGN KEY (tenant_id, operating_organization_id)
        REFERENCES master.operating_organization (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE document.operating_organization_resource_owner
        ADD CONSTRAINT oor_owner_central_company_fk
        FOREIGN KEY (tenant_id, central_company_code_id)
        REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE document.operating_organization_resource_owner
        ADD CONSTRAINT oor_owner_seller_company_fk
        FOREIGN KEY (tenant_id, principal_seller_company_id)
        REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE document.operating_organization_resource_company
        ADD CONSTRAINT oor_company_owner_fk
        FOREIGN KEY (tenant_id, resource_owner_id)
        REFERENCES document.operating_organization_resource_owner (tenant_id, id)
        ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE document.operating_organization_resource_company
        ADD CONSTRAINT oor_company_code_fk
        FOREIGN KEY (tenant_id, company_code_id)
        REFERENCES master.company_code (tenant_id, id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
