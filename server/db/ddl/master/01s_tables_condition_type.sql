-- ============================================================================
-- master/01s_tables_condition_type.sql
-- Concept: master.condition_type — pricing-component condition catalog
-- Depends on: master/01b_tables_finance.sql (tax_group, business_intent)
-- Spec: docs/specs/purchase_invoice_field_design.md §3.8, §17.4
--
-- Catalog of pricing-component condition kinds (freight, insurance, packing,
-- VAT, withholding-194Q, retention-warranty, ...). FK target for
-- document.pricing_component.condition_type_id.
--
-- Scope model:
--   • System-seeded base set: is_system=true, tenant_id IS NULL
--   • Tenant-custom additions: is_system=false, tenant_id NOT NULL
--   • Unique per (tenant_id, code) — system rows use the same NULL tenant slot
--
-- RLS: see master/08z_condition_type_rls.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS master.condition_type (
    -- Identity
    id                          uuid          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid,                       -- NULL for system rows

    -- Field identity
    code                        text          NOT NULL,
    name                        text          NOT NULL,
    description                 text,

    -- Classification — aligns with pricing_component.term_type
    term_type                   text          NOT NULL,

    -- Defaults (populate PC at create-time)
    default_basis               text          NOT NULL,
    default_rate                numeric(20,10),
    default_amount              numeric(18,4),
    default_apportion_basis     text,
    default_posting_role_code   text,
    default_business_intent_id  uuid,
    default_account_source      text,

    -- Tax-related (applicable for term_type IN ('tax','withholding'))
    default_tax_group_id        uuid,
    default_is_inclusive        boolean,
    default_recoverable_pct     numeric(7,4),
    default_tax_section_code    text,

    -- Behavior flags
    is_taxable                  boolean       NOT NULL DEFAULT false,
    is_apportionable            boolean       NOT NULL DEFAULT true,
    applies_to_classes          jsonb         NOT NULL DEFAULT '[]'::jsonb,

    -- Scope marker (system vs tenant)
    is_system                   boolean       NOT NULL DEFAULT false,

    -- Display
    sort_order                  smallint      NOT NULL DEFAULT 0,

    -- Lifecycle (standard envelope)
    status                      text          NOT NULL DEFAULT 'active',
    is_active                   boolean       GENERATED ALWAYS AS (status = 'active') STORED,
    status_changed_at           timestamptz,
    status_changed_by           uuid,

    -- Tags & Metadata
    tags                        jsonb         NOT NULL DEFAULT '[]'::jsonb,
    metadata                    jsonb         NOT NULL DEFAULT '{}'::jsonb,

    -- Audit
    created_at                  timestamptz   NOT NULL DEFAULT now(),
    created_by                  uuid          NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT condition_type_pkey               PRIMARY KEY (id),
    CONSTRAINT condition_type_tenant_id_uq       UNIQUE (tenant_id, id),
    -- Unique per (tenant_id, code) — system rows share NULL tenant slot
    CONSTRAINT condition_type_tenant_code_uq     UNIQUE (tenant_id, code),

    -- Status / classification CHECKs
    CONSTRAINT condition_type_status_chk         CHECK (status IN (
        'active','inactive','deprecated')),
    CONSTRAINT condition_type_term_type_chk      CHECK (term_type IN (
        'discount','charge','tax','withholding','retention','principal_marker')),
    CONSTRAINT condition_type_basis_chk          CHECK (default_basis IN (
        'percent','amount','per_unit','flat')),
    CONSTRAINT condition_type_apportion_chk      CHECK (
        default_apportion_basis IS NULL
        OR default_apportion_basis IN ('value','quantity','weight','equal')),
    CONSTRAINT condition_type_account_source_chk CHECK (
        default_account_source IS NULL
        OR default_account_source IN ('POSTING_ROLE','FIXED','FROM_INTENT','FROM_CATEGORY')),

    -- basis ↔ value coherence
    CONSTRAINT condition_type_basis_value_chk    CHECK (
        (default_basis = 'percent'  AND default_rate IS NOT NULL AND default_amount IS NULL)
        OR (default_basis = 'per_unit' AND default_rate IS NOT NULL AND default_amount IS NULL)
        OR (default_basis IN ('amount','flat') AND default_amount IS NOT NULL AND default_rate IS NULL)
        OR (default_basis IS NULL AND default_rate IS NULL AND default_amount IS NULL)
    ),

    -- Tax fields scoped to tax/withholding term types
    CONSTRAINT condition_type_tax_scope_chk      CHECK (
        (term_type IN ('tax','withholding'))
        OR (default_tax_group_id IS NULL
            AND default_is_inclusive IS NULL
            AND default_recoverable_pct IS NULL
            AND default_tax_section_code IS NULL)
    ),

    -- recoverable_pct in [0,100]
    CONSTRAINT condition_type_recoverable_chk    CHECK (
        default_recoverable_pct IS NULL
        OR (default_recoverable_pct BETWEEN 0 AND 100)),

    -- Non-empty identifiers
    CONSTRAINT condition_type_code_nonempty      CHECK (btrim(code) <> ''),
    CONSTRAINT condition_type_name_nonempty      CHECK (btrim(name) <> '')
);

-- Tenant-scope FK to master.business_intent (optional)
DO $$
BEGIN
    ALTER TABLE master.condition_type
        ADD CONSTRAINT condition_type_business_intent_fk
        FOREIGN KEY (tenant_id, default_business_intent_id)
        REFERENCES master.business_intent (tenant_id, id)
        ON DELETE SET NULL
        DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

-- Tax group FK (control.tax_group is the canonical location)
DO $$
BEGIN
    ALTER TABLE master.condition_type
        ADD CONSTRAINT condition_type_tax_group_fk
        FOREIGN KEY (tenant_id, default_tax_group_id)
        REFERENCES control.tax_group (tenant_id, id)
        ON DELETE SET NULL
        DEFERRABLE INITIALLY DEFERRED;
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_table  THEN NULL;  -- control.tax_group may not yet exist in some dev environments
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS ix_condition_type_term_type
    ON master.condition_type (tenant_id, term_type)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS ix_condition_type_system
    ON master.condition_type (term_type, sort_order)
    WHERE is_system = true AND status = 'active';

COMMENT ON TABLE master.condition_type IS
    'ARCHETYPE=B;SCOPE=T. Pricing-component condition catalog. System-seeded base set '
    '(is_system=true, tenant_id NULL) covers common procurement charges (freight, insurance, '
    'discounts), taxes (VAT/GST), withholding (194Q/194C), retentions. Tenants can add '
    'custom rows via standard CRUD with is_system=false. FK target for '
    'document.pricing_component.condition_type_id. Defaults populate PC at create-time.';


-- =============================================================================
-- End of 01s_tables_condition_type.sql
-- =============================================================================
