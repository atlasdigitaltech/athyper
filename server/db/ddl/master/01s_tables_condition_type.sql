-- ============================================================================
-- master/01s_tables_condition_type.sql
-- Concept: master.condition_type — pricing-component condition catalog
-- Depends on: master/01b_tables_finance.sql (business_intent ref already removed)
-- Spec: docs/specs/purchase_invoice_field_design.md §3.8, §17.4
--
-- Catalog of pricing-component condition kinds. The PC-facing catalog: this is
-- what the term picker offers. Jurisdictional tax-engine internals (rate,
-- recoverability, jurisdiction) live in master.tax_type +
-- control.tax_rate_schedule + control.tax_group; master.tax_type carries a
-- condition_type_id back-pointer so each jurisdictional tax_type classifies
-- into one of the catalog kinds (e.g. IN-CGST → "Goods and Services Tax").
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
    term_sub_type               text,                       -- optional refinement: settlement / landed / warranty / performance / completion

    -- Defaults (populate PC at create-time)
    default_basis               text          NOT NULL,
    default_rate                numeric(20,10),
    default_amount              numeric(18,4),
    default_apportion_basis     text,

    -- Behavior flags
    is_taxable                  boolean       NOT NULL DEFAULT false,
    is_apportionable            boolean       NOT NULL DEFAULT true,
    applies_to_classes          jsonb         NOT NULL DEFAULT '[]'::jsonb,

    -- Accounting semantics. These are stable defaults only; recognition timing
    -- and event-specific Dr/Cr construction remain owned by acct_profile_event
    -- and acct_profile_entry_template.
    default_cost_effect         text          NOT NULL DEFAULT 'NO_COST_EFFECT',
    default_posting_pattern     text          NOT NULL DEFAULT 'MEMO_ONLY',
    default_distribution_policy text         NOT NULL DEFAULT 'INHERIT_LINE',
    default_capitalization_policy text        NOT NULL DEFAULT 'FOLLOW_LINE',
    default_posting_role_code   text,

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
    CONSTRAINT condition_type_cost_effect_chk CHECK (default_cost_effect IN (
        'REDUCE_COST','ADD_TO_COST','NO_COST_EFFECT')),
    CONSTRAINT condition_type_posting_pattern_chk CHECK (default_posting_pattern IN (
        'INHERIT_LINE_ACCOUNT','SEPARATE_ACCOUNT','TAX_RECOVERABLE',
        'LIABILITY_SPLIT','TAX_SELF_ASSESSED','MEMO_ONLY')),
    CONSTRAINT condition_type_distribution_policy_chk CHECK (default_distribution_policy IN (
        'INHERIT_LINE','APPORTION_TO_LINES','NO_COST_DISTRIBUTION')),
    CONSTRAINT condition_type_capitalization_policy_chk CHECK (default_capitalization_policy IN (
        'FOLLOW_LINE','ALWAYS_CAPITALIZE','NEVER_CAPITALIZE')),

    -- term_sub_type enum
    CONSTRAINT condition_type_sub_type_enum_chk  CHECK (
        term_sub_type IS NULL
        OR term_sub_type IN ('settlement','landed','warranty','performance','completion')),

    -- term_sub_type only valid under specific term_types
    CONSTRAINT condition_type_sub_type_pair_chk  CHECK (
        (term_type = 'discount'         AND (term_sub_type IS NULL OR term_sub_type = 'settlement'))
        OR (term_type = 'charge'        AND (term_sub_type IS NULL OR term_sub_type = 'landed'))
        OR (term_type = 'tax'           AND term_sub_type IS NULL)
        OR (term_type = 'withholding'   AND term_sub_type IS NULL)
        OR (term_type = 'retention'     AND term_sub_type IN ('warranty','performance','completion'))
        OR (term_type = 'principal_marker' AND term_sub_type IS NULL)
    ),

    -- basis ↔ value coherence
    CONSTRAINT condition_type_basis_value_chk    CHECK (
        (default_basis = 'percent'  AND default_rate IS NOT NULL AND default_amount IS NULL)
        OR (default_basis = 'per_unit' AND default_rate IS NOT NULL AND default_amount IS NULL)
        OR (default_basis IN ('amount','flat') AND default_amount IS NOT NULL AND default_rate IS NULL)
        OR (default_basis IS NULL AND default_rate IS NULL AND default_amount IS NULL)
    ),

    -- Non-empty identifiers
    CONSTRAINT condition_type_code_nonempty      CHECK (btrim(code) <> ''),
    CONSTRAINT condition_type_name_nonempty      CHECK (btrim(name) <> '')
);

-- Indexes
CREATE INDEX IF NOT EXISTS ix_condition_type_term_type
    ON master.condition_type (tenant_id, term_type)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS ix_condition_type_system
    ON master.condition_type (term_type, sort_order)
    WHERE is_system = true AND status = 'active';

CREATE INDEX IF NOT EXISTS ix_condition_type_sub_type
    ON master.condition_type (term_type, term_sub_type)
    WHERE term_sub_type IS NOT NULL AND status = 'active';

COMMENT ON TABLE master.condition_type IS
    'ARCHETYPE=B;SCOPE=T. PC-facing pricing-component condition catalog (term picker source). '
    'System-seeded base set (is_system=true, tenant_id NULL) covers procurement charges (freight, '
    'insurance, customs duty), tax kinds (VAT/GST/HST/PST/Sales/Use), withholding, retentions, and the '
    'principal_marker. Tenants can add custom rows via standard CRUD with is_system=false. '
    'Tax/withholding jurisdictional internals live in master.tax_type + control.tax_rate_schedule + '
    'control.tax_group; master.tax_type.condition_type_id back-points here.';


-- =============================================================================
-- End of 01s_tables_condition_type.sql
-- =============================================================================
