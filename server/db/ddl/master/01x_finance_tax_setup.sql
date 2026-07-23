-- Finance Setup Phase 2, Stage C: normalized statutory registrations.

CREATE TABLE IF NOT EXISTS master.organization_tax_registration (
    id                          uuid        NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid        NOT NULL,
    legal_entity_id             uuid        NOT NULL,
    company_code_id             uuid,
    jurisdiction_id             uuid        NOT NULL,
    registration_type           text        NOT NULL,
    registration_number         text        NOT NULL,
    filing_frequency            text,
    effective_from              date        NOT NULL DEFAULT CURRENT_DATE,
    effective_to                date,
    is_primary                  boolean     NOT NULL DEFAULT false,
    certificate_attachment_id   uuid,
    metadata                    jsonb       NOT NULL DEFAULT '{}'::jsonb,
    status                      text        NOT NULL DEFAULT 'active',
    is_active                   boolean     GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at           timestamptz,
    status_changed_by           uuid,
    created_at                  timestamptz NOT NULL DEFAULT now(),
    created_by                  uuid        NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT otr_pkey PRIMARY KEY (id),
    CONSTRAINT otr_tenant_id_uq UNIQUE (tenant_id, id),
    CONSTRAINT otr_type_chk CHECK (registration_type IN (
        'VAT','GST','SALES_TAX','WHT','TAX_ID','CUSTOMS','EXCISE','OTHER')),
    CONSTRAINT otr_number_chk CHECK (btrim(registration_number) <> ''),
    CONSTRAINT otr_effective_chk CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT otr_status_chk CHECK (status IN ('active','inactive','archived')),
    CONSTRAINT otr_filing_chk CHECK (filing_frequency IS NULL OR filing_frequency IN (
        'monthly','bimonthly','quarterly','semi_annually','annually','on_demand')),
    CONSTRAINT otr_scope_overlap_excl EXCLUDE USING gist (
        tenant_id WITH =,
        legal_entity_id WITH =,
        COALESCE(company_code_id, '00000000-0000-0000-0000-000000000000'::uuid) WITH =,
        jurisdiction_id WITH =,
        registration_type WITH =,
        daterange(effective_from, COALESCE(effective_to, '9999-12-31'::date), '[]') WITH &&
    ) WHERE (status = 'active')
);

COMMENT ON TABLE master.organization_tax_registration IS
    'ARCHETYPE=B;SCOPE=T. Effective-dated statutory registration owned by a Legal Entity and optionally applicable only to one Company Code. Replaces the single-number Company limitation for multi-jurisdiction VAT/GST/WHT operations.';

