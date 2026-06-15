-- ============================================================================
-- document/01u_tables_pricing_component.sql
-- Concept: document.pricing_component (PC) — polymorphic pricing-component engine
-- Depends on: 01e_tables_invoice.sql (PIL parent),
--             01b_tables_journal.sql (AD source_doc_type CHECK reuses),
--             master/01s_tables_condition_type.sql (condition_type_id FK)
-- Spec: docs/specs/purchase_invoice_field_design.md §3.3, §6
--
-- Replaces flat discount/charge/tax/withholding/retention columns on parent
-- documents (PI, PIL; future: PO, SO, SI). v1.2: NO dimension columns,
-- NO budget_allocation_id (PC inherits dimensions/budget from source PIL at
-- apportion/posting).
--
-- Triggers: see 06u_pricing_component_triggers.sql
-- RLS:      see 08u_pricing_component_rls.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS document.pricing_component (
    -- Identity
    id                          uuid          NOT NULL DEFAULT shared.uuidv7(),
    tenant_id                   uuid          NOT NULL,
    company_code_id             uuid          NOT NULL,

    -- Polymorphic source (header-or-line scope)
    source_doc_type             text          NOT NULL,
    source_doc_id               uuid          NOT NULL,    -- parent header id
    source_line_id              uuid,                       -- NULL = header-scope row

    -- Term classification
    term_type                   text          NOT NULL,
    condition_type_id           uuid          NOT NULL,
    sequence                    integer       NOT NULL DEFAULT 100,

    -- Basis & values (non-negative magnitudes; sign derives from term_type)
    basis                       text          NOT NULL,
    rate_value                  numeric(20,10),
    amount_value                numeric(18,4),
    base_for_calculation        numeric(18,4),
    computed_amount             numeric(18,4) NOT NULL DEFAULT 0,
    computed_base_amount        numeric(18,4) NOT NULL DEFAULT 0,

    -- Entry & apportionment
    entry_level                 text          NOT NULL,
    apportion_basis             text,
    is_apportioned              boolean       NOT NULL DEFAULT false,
    is_apportioned_from_id      uuid,

    -- Origin & cross-document lineage (DB intent — qualifies)
    origin                      text          NOT NULL,
    ref_source_doc_type         text,
    ref_source_doc_id           uuid,
    ref_source_line_id          uuid,
    ref_value                   numeric(18,4),

    -- Tax/withholding metadata (BOTH term types)
    tax_group_id                uuid,
    is_inclusive                boolean,
    recoverable_pct             numeric(7,4),
    tax_section_code            text,

    -- Currency triad
    currency_code               character(3)  NOT NULL,
    base_currency_code          character(3)  NOT NULL,
    exchange_rate               numeric(20,10) NOT NULL DEFAULT 1.0,

    -- GL routing (the only routing override at term level)
    business_intent_id          uuid,
    posting_role_code           text,
    gl_account_id               uuid,
    account_source              text,

    -- NO dimensions (cost_center_id, profit_center_id, project_id, site_id, dimension_set_id)
    -- NO budget_allocation_id
    -- PC inherits these from source PIL at apportion/posting (v1.2 §3.3)

    -- Supersede chain (in-draft history)
    superseded_by_id            uuid,
    superseded_at               timestamptz,
    superseded_by_user          uuid,

    -- Concurrency
    row_version                 bigint        NOT NULL DEFAULT 1,

    -- Tags & Metadata
    tags                        jsonb         NOT NULL DEFAULT '[]'::jsonb,
    metadata                    jsonb         NOT NULL DEFAULT '{}'::jsonb,

    -- Audit
    created_at                  timestamptz   NOT NULL DEFAULT now(),
    created_by                  uuid          NOT NULL,
    updated_at                  timestamptz,
    updated_by                  uuid,

    CONSTRAINT pc_pkey                       PRIMARY KEY (id),
    CONSTRAINT pc_tenant_id_uq               UNIQUE (tenant_id, id),

    -- Enum / type discipline
    CONSTRAINT pc_term_type_chk              CHECK (term_type IN (
        'discount','charge','tax','withholding','retention','principal_marker')),
    CONSTRAINT pc_basis_chk                  CHECK (basis IN (
        'percent','amount','per_unit','flat')),
    CONSTRAINT pc_entry_level_chk            CHECK (entry_level IN (
        'header','line')),
    CONSTRAINT pc_origin_chk                 CHECK (origin IN (
        'manual','inherited','vendor_default','system_resolved')),
    CONSTRAINT pc_apportion_basis_chk        CHECK (apportion_basis IS NULL
        OR apportion_basis IN ('value','quantity','weight','equal')),

    -- Polymorphic source type — reuses AD sealed CHECK
    CONSTRAINT pc_source_doc_type_chk        CHECK (source_doc_type IN (
        'PURCHASE_REQUISITION_LINE','COMMITMENT_LINE','PURCHASE_INVOICE_LINE',
        'GOODS_RECEIPT_LINE','SERVICE_ENTRY_SHEET_LINE')),

    -- AD strategy enum mirrored
    CONSTRAINT pc_account_source_chk         CHECK (account_source IS NULL
        OR account_source IN ('POSTING_ROLE','FIXED','FROM_INTENT','FROM_CATEGORY')),

    -- Magnitudes non-negative (signed effect derives from term_type)
    CONSTRAINT pc_rate_nonneg_chk            CHECK (rate_value IS NULL OR rate_value >= 0),
    CONSTRAINT pc_amount_nonneg_chk          CHECK (amount_value IS NULL OR amount_value >= 0),
    CONSTRAINT pc_computed_nonneg_chk        CHECK (computed_amount >= 0),
    CONSTRAINT pc_computed_base_nonneg_chk   CHECK (computed_base_amount >= 0),

    -- Basis ↔ value coherence
    CONSTRAINT pc_basis_value_chk            CHECK (
        (basis = 'percent'  AND rate_value IS NOT NULL AND amount_value IS NULL)
        OR (basis = 'per_unit' AND rate_value IS NOT NULL AND amount_value IS NULL)
        OR (basis IN ('amount','flat') AND amount_value IS NOT NULL AND rate_value IS NULL)
    ),

    -- entry_level ⇔ source_line_id
    CONSTRAINT pc_entry_level_scope_chk      CHECK (
        (entry_level = 'header' AND source_line_id IS NULL)
        OR (entry_level = 'line' AND source_line_id IS NOT NULL)
    ),

    -- Apportionment cohesion
    CONSTRAINT pc_apportion_chk              CHECK (
        (is_apportioned = false AND is_apportioned_from_id IS NULL)
        OR (is_apportioned = true AND is_apportioned_from_id IS NOT NULL
            AND entry_level = 'line')
    ),

    -- Tax/withholding metadata scoped to those term types
    CONSTRAINT pc_tax_fields_scope_chk       CHECK (
        (term_type IN ('tax','withholding') AND tax_group_id IS NOT NULL)
        OR (term_type NOT IN ('tax','withholding')
            AND tax_group_id IS NULL AND is_inclusive IS NULL
            AND recoverable_pct IS NULL AND tax_section_code IS NULL)
    ),

    -- recoverable_pct bounds
    CONSTRAINT pc_recoverable_chk            CHECK (
        recoverable_pct IS NULL OR (recoverable_pct BETWEEN 0 AND 100)),

    -- Supersede tuple integrity
    CONSTRAINT pc_supersede_pair_chk         CHECK (
        (superseded_by_id IS NULL AND superseded_at IS NULL AND superseded_by_user IS NULL)
        OR (superseded_by_id IS NOT NULL AND superseded_at IS NOT NULL
            AND superseded_by_user IS NOT NULL)
    ),

    -- No self-supersede
    CONSTRAINT pc_no_self_supersede          CHECK (
        superseded_by_id IS DISTINCT FROM id),

    -- Currency consistency
    CONSTRAINT pc_currency_chk               CHECK (
        (currency_code = base_currency_code AND exchange_rate = 1.0)
        OR (currency_code <> base_currency_code AND exchange_rate > 0)
    ),

    -- sequence bounds
    CONSTRAINT pc_sequence_chk               CHECK (sequence > 0)
);

-- =============================================================================
-- Foreign Keys
-- =============================================================================

DO $$
BEGIN
    ALTER TABLE document.pricing_component
        ADD CONSTRAINT pc_condition_type_fk
        FOREIGN KEY (condition_type_id)
        REFERENCES master.condition_type (id)
        ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

-- Simple self-FK on superseded_by_id (no compound — PG doesn't support FK to (id,id))
DO $$
BEGIN
    ALTER TABLE document.pricing_component
        ADD CONSTRAINT pc_superseded_by_fk
        FOREIGN KEY (superseded_by_id)
        REFERENCES document.pricing_component (id)
        DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE document.pricing_component
        ADD CONSTRAINT pc_apportioned_from_fk
        FOREIGN KEY (is_apportioned_from_id)
        REFERENCES document.pricing_component (id)
        DEFERRABLE INITIALLY DEFERRED;
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

-- =============================================================================
-- Indexes
-- =============================================================================

-- Active (non-superseded) rows per source line, ordered by waterfall sequence
CREATE INDEX IF NOT EXISTS ix_pc_source_active
    ON document.pricing_component (
        tenant_id, source_doc_type, source_doc_id, source_line_id, term_type, sequence)
    WHERE superseded_by_id IS NULL;

-- Supersede chain traversal
CREATE INDEX IF NOT EXISTS ix_pc_supersede_chain
    ON document.pricing_component (tenant_id, superseded_by_id)
    WHERE superseded_by_id IS NOT NULL;

-- Per condition_type usage (for reporting & seed cleanup)
CREATE INDEX IF NOT EXISTS ix_pc_condition_type
    ON document.pricing_component (tenant_id, condition_type_id)
    WHERE superseded_by_id IS NULL;

-- Apportionment lineage
CREATE INDEX IF NOT EXISTS ix_pc_apportion_chain
    ON document.pricing_component (tenant_id, is_apportioned_from_id)
    WHERE is_apportioned_from_id IS NOT NULL;

-- =============================================================================
-- Table Comment
-- =============================================================================

COMMENT ON TABLE document.pricing_component IS
    'ARCHETYPE=B;SCOPE=T. Polymorphic pricing-component engine. Replaces flat '
    'discount/charge/tax/withholding/retention columns on parent docs. Source key '
    '(source_doc_type, source_doc_id, source_line_id) reuses the AD pattern. '
    'v1.2: NO dimension columns and NO budget_allocation_id — PC inherits these '
    'from source PIL at apportion/posting time. Per-type validation trigger '
    'enforces FK integrity to the correct parent. Supersede chain preserves '
    'in-draft history; no status column. Header-scope rows apportion to '
    'line-scope rows at submit time (apportion_basis required only when actual '
    'apportionment occurs). Parent flat amount columns become trigger-maintained '
    'read caches in P4.';


-- =============================================================================
-- §P1.3  PC Validation Functions
-- =============================================================================
-- Triggers attached in 06u_pricing_component_triggers.sql.
-- =============================================================================

-- Per-type polymorphic source validation
CREATE OR REPLACE FUNCTION document.fn_pc_validate_polymorphic_source()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    parent_tenant uuid;
    parent_header_id uuid;
BEGIN
    -- entry_level vs source_line_id discipline is already in pc_entry_level_scope_chk

    IF NEW.source_doc_type = 'PURCHASE_INVOICE_LINE' THEN
        -- header-scope PC (source_line_id IS NULL): source_doc_id must be a purchase_invoice
        IF NEW.source_line_id IS NULL THEN
            SELECT tenant_id INTO parent_tenant
              FROM document.purchase_invoice
             WHERE id = NEW.source_doc_id
               AND tenant_id = NEW.tenant_id;

            IF parent_tenant IS NULL THEN
                RAISE EXCEPTION 'PC_SOURCE_NOT_FOUND: header-scope PC source_doc_id=% does not match a purchase_invoice in tenant %',
                    NEW.source_doc_id, NEW.tenant_id
                    USING ERRCODE = 'PC001';
            END IF;
        -- line-scope PC: source_line_id is a PIL; source_doc_id must be its parent PI
        ELSE
            SELECT pil.tenant_id, pil.purchase_invoice_id
              INTO parent_tenant, parent_header_id
              FROM document.purchase_invoice_line pil
             WHERE pil.id = NEW.source_line_id
               AND pil.tenant_id = NEW.tenant_id;

            IF parent_tenant IS NULL THEN
                RAISE EXCEPTION 'PC_SOURCE_NOT_FOUND: PIL source_line_id=% not found in tenant %',
                    NEW.source_line_id, NEW.tenant_id
                    USING ERRCODE = 'PC001';
            END IF;

            IF parent_header_id <> NEW.source_doc_id THEN
                RAISE EXCEPTION 'PC_SOURCE_HEADER_MISMATCH: source_doc_id=% does not own source_line_id=%',
                    NEW.source_doc_id, NEW.source_line_id
                    USING ERRCODE = 'PC002';
            END IF;
        END IF;

    ELSIF NEW.source_doc_type IN (
        'COMMITMENT_LINE','GOODS_RECEIPT_LINE',
        'SERVICE_ENTRY_SHEET_LINE','PURCHASE_REQUISITION_LINE'
    ) THEN
        -- Phase 2 (per-domain wiring): tighten as each source domain adopts PC
        NULL;
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION document.fn_pc_validate_polymorphic_source() IS
    'BEFORE INSERT/UPDATE OF source_doc_type, source_doc_id, source_line_id on '
    'document.pricing_component: validates that the polymorphic source resolves to '
    'an existing parent (PI for header-scope, PIL for line-scope), with matching '
    'tenant_id. Hard-validates PURCHASE_INVOICE_LINE; other source types '
    'soft-validated until per-domain wiring lands.';


-- Supersede-only update guard
CREATE OR REPLACE FUNCTION document.fn_pc_supersede_only_update()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    parent_status text;
BEGIN
    -- Resolve parent status (PI only for v1.2)
    IF OLD.source_doc_type = 'PURCHASE_INVOICE_LINE' THEN
        IF OLD.source_line_id IS NULL THEN
            SELECT status INTO parent_status FROM document.purchase_invoice
             WHERE id = OLD.source_doc_id AND tenant_id = OLD.tenant_id;
        ELSE
            SELECT pi.status INTO parent_status
              FROM document.purchase_invoice pi
              JOIN document.purchase_invoice_line pil ON pil.purchase_invoice_id = pi.id
             WHERE pil.id = OLD.source_line_id AND pil.tenant_id = OLD.tenant_id;
        END IF;
    ELSE
        -- Other source types: allow free editing until per-domain rules wire in
        RETURN NEW;
    END IF;

    -- Editing freely allowed in draft / rejected
    IF parent_status IN ('draft','rejected') THEN
        RETURN NEW;
    END IF;

    -- Editing not allowed once parent is terminal — only supersede-write permitted
    IF parent_status IN ('posted','partially_paid','fully_paid','reversed','cancelled') THEN
        RAISE EXCEPTION 'PC_LOCKED_BY_STATUS: parent invoice is %; PC is immutable',
            parent_status
            USING ERRCODE = 'PC003';
    END IF;

    -- In approval-stream states: only supersede tuple may change
    -- (allow superseded_by_id, superseded_at, superseded_by_user, row_version, updated_at, updated_by)
    IF (NEW.term_type           IS DISTINCT FROM OLD.term_type)
       OR (NEW.condition_type_id IS DISTINCT FROM OLD.condition_type_id)
       OR (NEW.sequence          IS DISTINCT FROM OLD.sequence)
       OR (NEW.basis             IS DISTINCT FROM OLD.basis)
       OR (NEW.rate_value        IS DISTINCT FROM OLD.rate_value)
       OR (NEW.amount_value      IS DISTINCT FROM OLD.amount_value)
       OR (NEW.entry_level       IS DISTINCT FROM OLD.entry_level)
       OR (NEW.apportion_basis   IS DISTINCT FROM OLD.apportion_basis)
       OR (NEW.origin            IS DISTINCT FROM OLD.origin)
       OR (NEW.tax_group_id      IS DISTINCT FROM OLD.tax_group_id)
       OR (NEW.is_inclusive      IS DISTINCT FROM OLD.is_inclusive)
       OR (NEW.recoverable_pct   IS DISTINCT FROM OLD.recoverable_pct)
       OR (NEW.tax_section_code  IS DISTINCT FROM OLD.tax_section_code)
       OR (NEW.business_intent_id IS DISTINCT FROM OLD.business_intent_id)
       OR (NEW.posting_role_code IS DISTINCT FROM OLD.posting_role_code)
       OR (NEW.account_source    IS DISTINCT FROM OLD.account_source)
       OR (NEW.source_doc_type   IS DISTINCT FROM OLD.source_doc_type)
       OR (NEW.source_doc_id     IS DISTINCT FROM OLD.source_doc_id)
       OR (NEW.source_line_id    IS DISTINCT FROM OLD.source_line_id)
    THEN
        RAISE EXCEPTION 'PC_SUPERSEDE_ONLY: parent invoice is %; only supersede tuple may be set',
            parent_status
            USING ERRCODE = 'PC004';
    END IF;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION document.fn_pc_supersede_only_update() IS
    'BEFORE UPDATE on document.pricing_component: while parent invoice is in '
    'draft/rejected, free edits allowed; in approval-stream states, only the '
    'supersede tuple (superseded_by_id, superseded_at, superseded_by_user) plus '
    'row_version/updated_at/updated_by may change; in terminal states, all edits '
    'blocked. PC rows are never deleted — superseded ones remain for audit.';


-- =============================================================================
-- End of 01u_tables_pricing_component.sql
-- =============================================================================
