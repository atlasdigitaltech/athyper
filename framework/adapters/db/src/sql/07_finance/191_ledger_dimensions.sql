/* ============================================================================
   Athyper v2.3 — Universal Ledger Dimension Engine
   Schema: fin
   Dependencies: core.tenant, fin.chart_of_accounts, fin.journal_entry,
                 fin.journal_line, fin.gl_balance, fin.operating_unit,
                 fin.transaction_pipeline, fin.smart_default_rule

   Provides tenant-configurable, extensible accounting dimensions using
   hash-normalized dimension sets for scalable balance aggregation.

   Final table topology:

     Core registry and master data (3 tables):
       fin.dimension_type          → Registry of dimension kinds per tenant
       fin.dimension_value         → Internal master data (source_kind = INTERNAL)
       fin.dimension_policy        → Governance rules (policy module pattern)

     Canonical resolved combinations (2 tables):
       fin.dimension_set           → Hash-normalized combination of dimension values
       fin.dimension_set_item      → Individual members of a dimension set (immutable)

     Upstream capture and defaulting (2 tables):
       fin.ou_dimension_default    → Default dimension values per OU
       fin.document_line_dimension → Dimension capture at document entry time

     Existing tables extended (3 ALTER TABLEs):
       fin.journal_line            → + dimension_set_id
       fin.gl_balance              → + dimension_set_id (replaces cost_center_id grain)
       fin.transaction_pipeline    → + resolved_dimension_set_id, + dimension_derivation_log

     Helper functions (1):
       fin.resolve_dimension_set() → Hash-normalize and deduplicate dimension pairs

   Design principles:
     1. Dimension Set normalization — identical combinations reuse one set_id
     2. Source-aware types — dimensions can reference internal or external masters
     3. Policy-based validation — governance module, not passive rule table
     4. Header defaults, line-level authority
     5. Smart Default integration via txn.finalized contract
     6. Derived dimensions materialized at posting time (never recalculated)
     7. Dimension sets are immutable — historical postings remain valid
     8. Full audit trail of policy-driven derivation decisions

   Hash canonicalization contract:
     - Input pairs MUST be sorted ascending by dimension_type_id::text
     - NULL / empty values MUST be excluded before hashing
     - One value per dimension_type per set (enforced by unique constraint)
     - Hash format: SHA-256 of "type_id_1:value_id_1|type_id_2:value_id_2|..."
     - Hash is tenant+entity scoped via the uq_fin_dim_set constraint
     - Once created, a dimension_set and its items are NEVER modified or deleted
     - If a dimension_value becomes INACTIVE/ARCHIVED, existing sets referencing
       it remain valid for historical postings; new postings must use ACTIVE values

   Policy precedence (highest to lowest specificity):
     1. scope_account_code (exact GL account)       — most specific
     2. scope_account_range_lo/hi (account range)
     3. scope_subledger_type (AP, AR, etc.)
     4. scope_account_type (ASSET, EXPENSE, etc.)
     5. scope_intent_code (business intent)
     6. scope_doc_type (PURCHASE_INVOICE, etc.)
     7. scope_ou_id (operating unit)
     8. scope_domain (OPEX, CAPEX, etc.)
     9. (all NULL scopes = global default)           — least specific
     Ties at same specificity: resolved by explicit priority (higher wins),
     then newest active policy_version.

   Behavior conflict resolution:
     - FORBIDDEN outranks OPTIONAL and DERIVE_IF_MISSING
     - FIXED_VALUE outranks DERIVE_IF_MISSING and INHERIT_FROM_HEADER
     - REQUIRED outranks OPTIONAL
     - Exact-scope match outranks broader-scope match
     - If unresolvable conflict: validation fails with error for human review
   ============================================================================ */

-- ============================================================================
-- fin.dimension_type — Registry of dimension kinds per tenant
-- ============================================================================
-- System-seeded types: COST_CENTER, PROFIT_CENTER
-- Tenant-defined types: PROJECT, FUND, REGION, SEGMENT, CHANNEL, etc.
CREATE TABLE IF NOT EXISTS fin.dimension_type (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES core.tenant(id),
    entity_code     VARCHAR(20) NOT NULL,
    code            VARCHAR(50) NOT NULL,
    name            VARCHAR(200) NOT NULL,
    description     TEXT,

    -- Classification
    category        VARCHAR(30) NOT NULL DEFAULT 'CUSTOM'
                    CHECK (category IN (
                        'SYSTEM',       -- system-provided (COST_CENTER, PROFIT_CENTER)
                        'REGULATORY',   -- required by regulation (e.g., FUND for govt accounting)
                        'CUSTOM'        -- tenant-defined
                    )),

    -- Source: where dimension values are mastered
    --   INTERNAL:         values live in fin.dimension_value
    --   EXTERNAL_ENTITY:  values reference an external master table
    --   DERIVED:          values computed from context (e.g., region from OU)
    --                     IMPORTANT: derived dimensions MUST be materialized into
    --                     dimension_set_item at posting/finalization time. Reporting
    --                     should never recalculate past finance dimensions from
    --                     changing master data logic.
    --   SYSTEM:           values managed by platform (e.g., intercompany partner)
    source_kind     VARCHAR(30) NOT NULL DEFAULT 'INTERNAL'
                    CHECK (source_kind IN (
                        'INTERNAL',
                        'EXTERNAL_ENTITY',
                        'DERIVED',
                        'SYSTEM'
                    )),
    source_entity   VARCHAR(100),       -- for EXTERNAL_ENTITY: schema.table (e.g., 'fin.funding_profile')
    source_code_col VARCHAR(50),        -- for EXTERNAL_ENTITY: code column name
    source_name_col VARCHAR(50),        -- for EXTERNAL_ENTITY: display name column

    -- Behavior
    is_hierarchical BOOLEAN NOT NULL DEFAULT FALSE,
    max_depth       SMALLINT,           -- NULL = unlimited hierarchy depth
    is_balanced     BOOLEAN NOT NULL DEFAULT FALSE,   -- require debit=credit per dim value
    allow_multi     BOOLEAN NOT NULL DEFAULT FALSE,   -- allow multiple values per line (rare)

    -- Display
    sort_order      SMALLINT NOT NULL DEFAULT 0,
    icon            VARCHAR(50),

    -- Lifecycle
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_fin_dim_type UNIQUE (tenant_id, entity_code, code)
);

CREATE INDEX IF NOT EXISTS idx_fin_dim_type_tenant
    ON fin.dimension_type(tenant_id, entity_code);
CREATE INDEX IF NOT EXISTS idx_fin_dim_type_active
    ON fin.dimension_type(tenant_id, entity_code, is_active) WHERE is_active = TRUE;

-- ============================================================================
-- fin.dimension_value — Master data for internally-sourced dimensions
-- ============================================================================
-- Used when dimension_type.source_kind = 'INTERNAL'.
-- External dimensions resolve values via source_entity/source_code_col.
--
-- Lifecycle notes:
--   ACTIVE    — available for new postings, budgeting, and planning
--   INACTIVE  — not available for new postings; existing references valid
--   BLOCKED   — temporarily suspended; allow_posting forced FALSE
--   ARCHIVED  — permanently retired; historical references remain valid
--
-- Once a dimension_value is referenced by any dimension_set_item, it must
-- never be deleted — only its status changes. This preserves the immutability
-- of dimension sets and the correctness of historical postings.
CREATE TABLE IF NOT EXISTS fin.dimension_value (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES core.tenant(id),
    entity_code     VARCHAR(20) NOT NULL,
    dimension_type_id UUID NOT NULL REFERENCES fin.dimension_type(id),
    code            VARCHAR(50) NOT NULL,
    name            VARCHAR(200) NOT NULL,
    description     TEXT,

    -- Hierarchy (optional, controlled by dimension_type.is_hierarchical)
    parent_id       UUID REFERENCES fin.dimension_value(id),
    level           SMALLINT NOT NULL DEFAULT 1,
    path            TEXT,                           -- materialized path e.g. 'CC-ADMIN/CC-IT/CC-DEV'

    -- Lifecycle & effective dating
    status          VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
                    CHECK (status IN ('ACTIVE', 'INACTIVE', 'BLOCKED', 'ARCHIVED')),
    valid_from      DATE,
    valid_to        DATE,
    allow_posting   BOOLEAN NOT NULL DEFAULT TRUE,
    allow_budgeting BOOLEAN NOT NULL DEFAULT TRUE,
    allow_planning  BOOLEAN NOT NULL DEFAULT TRUE,

    -- External source reference (when this value mirrors an external master)
    source_record_id UUID,              -- FK to external master record
    source_entity_code VARCHAR(100),    -- which external entity this came from

    -- Metadata
    tags            JSONB DEFAULT '[]',
    attributes      JSONB DEFAULT '{}',             -- type-specific custom attributes

    sort_order      SMALLINT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_fin_dim_value UNIQUE (tenant_id, entity_code, dimension_type_id, code),
    CONSTRAINT chk_fin_dim_value_dates CHECK (
        valid_from IS NULL OR valid_to IS NULL OR valid_from <= valid_to
    ),
    CONSTRAINT chk_fin_dim_value_blocked CHECK (
        status != 'BLOCKED' OR allow_posting = FALSE
    )
);

CREATE INDEX IF NOT EXISTS idx_fin_dim_value_type
    ON fin.dimension_value(dimension_type_id);
CREATE INDEX IF NOT EXISTS idx_fin_dim_value_tenant
    ON fin.dimension_value(tenant_id, entity_code);
CREATE INDEX IF NOT EXISTS idx_fin_dim_value_parent
    ON fin.dimension_value(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fin_dim_value_postable
    ON fin.dimension_value(tenant_id, dimension_type_id)
    WHERE status = 'ACTIVE' AND allow_posting = TRUE;
CREATE INDEX IF NOT EXISTS idx_fin_dim_value_source
    ON fin.dimension_value(source_record_id) WHERE source_record_id IS NOT NULL;

-- ============================================================================
-- fin.dimension_policy — Dimension governance (policy module pattern)
-- ============================================================================
-- Follows Athyper's policy_module pattern: governance rules that the
-- Dimension Policy Engine evaluates during SMART_DEFAULTS and FINALIZATION.
--
-- Precedence (highest to lowest specificity):
--   1. scope_account_code       — exact GL account match
--   2. scope_account_range      — account range match
--   3. scope_subledger_type     — subledger type match
--   4. scope_account_type       — account type match
--   5. scope_intent_code        — business intent match
--   6. scope_doc_type           — document type match
--   7. scope_ou_id              — operating unit match
--   8. scope_domain             — domain match (OPEX/CAPEX/etc.)
--   9. (all NULL)               — global default
-- Ties: explicit priority (higher wins), then newest policy_version.
--
-- Conflict resolution:
--   FORBIDDEN > FIXED_VALUE > REQUIRED > DERIVE_IF_MISSING > INHERIT_FROM_HEADER > OPTIONAL
--   More-specific scope always outranks less-specific scope.
--   Unresolvable conflicts → validation error for human review.
CREATE TABLE IF NOT EXISTS fin.dimension_policy (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES core.tenant(id),
    entity_code     VARCHAR(20) NOT NULL,
    dimension_type_id UUID NOT NULL REFERENCES fin.dimension_type(id),

    -- Policy name and version (follows policy_module pattern)
    policy_code     VARCHAR(50) NOT NULL,
    policy_version  SMALLINT NOT NULL DEFAULT 1,
    description     TEXT,

    -- Applicability scope: what context this policy applies to
    -- Each field is NULL = "all". Non-null = filter match.
    scope_account_type      VARCHAR(20),    -- ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE
    scope_account_code      VARCHAR(20),    -- specific GL account code
    scope_account_range_lo  VARCHAR(20),    -- account range lower bound (inclusive)
    scope_account_range_hi  VARCHAR(20),    -- account range upper bound (inclusive)
    scope_subledger_type    VARCHAR(20),    -- AP, AR, ASSET, INVENTORY, etc.
    scope_ou_id             UUID REFERENCES fin.operating_unit(id),
    scope_intent_code       VARCHAR(50),    -- business intent code
    scope_doc_type          VARCHAR(30),    -- PURCHASE_INVOICE, PAYMENT_ENTRY, MANUAL_JE
    scope_domain            VARCHAR(50),    -- OPEX, CAPEX, REVENUE, etc.

    -- Behavior: what happens when this policy matches
    behavior        VARCHAR(30) NOT NULL DEFAULT 'OPTIONAL'
                    CHECK (behavior IN (
                        'REQUIRED',             -- must be provided
                        'OPTIONAL',             -- can be provided
                        'FORBIDDEN',            -- must NOT be provided
                        'DERIVE_IF_MISSING',    -- auto-derive from context if not supplied
                        'INHERIT_FROM_HEADER',  -- inherit from document header default
                        'FIXED_VALUE'           -- always use a specific value
                    )),

    -- For FIXED_VALUE behavior
    fixed_value_id  UUID REFERENCES fin.dimension_value(id),

    -- For DERIVE_IF_MISSING: derivation source
    derive_source   VARCHAR(50),        -- e.g., 'ou_default', 'intent_mapping', 'parent_line',
                                        --       'federation_context'

    -- Allowed values constraint (NULL = any active value)
    allowed_values  UUID[],             -- restrict to specific dimension_value IDs

    -- Combination constraints
    depends_on_type_id UUID REFERENCES fin.dimension_type(id),  -- requires another dimension
    mutually_exclusive_with UUID REFERENCES fin.dimension_type(id),

    -- Priority for conflict resolution (higher wins within same specificity tier)
    priority        SMALLINT NOT NULL DEFAULT 0,

    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_fin_dim_policy UNIQUE (tenant_id, entity_code, policy_code, policy_version)
);

CREATE INDEX IF NOT EXISTS idx_fin_dim_policy_type
    ON fin.dimension_policy(dimension_type_id);
CREATE INDEX IF NOT EXISTS idx_fin_dim_policy_tenant
    ON fin.dimension_policy(tenant_id, entity_code);
CREATE INDEX IF NOT EXISTS idx_fin_dim_policy_scope_acct
    ON fin.dimension_policy(scope_account_type) WHERE scope_account_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fin_dim_policy_scope_ou
    ON fin.dimension_policy(scope_ou_id) WHERE scope_ou_id IS NOT NULL;

-- ============================================================================
-- fin.dimension_set — Hash-normalized dimension combination
-- ============================================================================
-- A journal line resolves to ONE canonical dimension set.
-- The set is hash-normalized by sorted (dimension_type_id, dimension_value_id).
-- Identical combinations across any lines/documents reuse the same set_id.
--
-- IMMUTABILITY CONTRACT:
--   - Once a dimension_set is created, it is NEVER modified or deleted.
--   - If a dimension_value referenced by a set becomes INACTIVE or ARCHIVED,
--     the set remains valid for all historical postings.
--   - New postings that would use the same combination minus the inactive value
--     will resolve to a different set with a different hash.
--   - This guarantees ledger integrity and historical reporting accuracy.
--
-- This is the key scalability pattern:
--   - Avoids row explosion in gl_balance
--   - Makes aggregation and posting deterministic
--   - Gives a stable analytic key for projections, cubes, and cache
--   - Same principle used in SAP Universal Journal, Oracle GL Segments
CREATE TABLE IF NOT EXISTS fin.dimension_set (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES core.tenant(id),
    entity_code     VARCHAR(20) NOT NULL,

    -- SHA-256 hash of sorted pairs: "type_id_1:value_id_1|type_id_2:value_id_2|..."
    -- Canonicalization rules:
    --   1. Pairs sorted ascending by dimension_type_id::text
    --   2. NULL/empty values excluded before hashing
    --   3. One value per dimension_type (enforced by dimension_set_item UQ)
    --   4. Hash input is deterministic UTF-8 text
    --   5. Collision safety: scoped to (tenant_id, entity_code) via UQ constraint
    set_hash        VARCHAR(64) NOT NULL,

    -- The canonical pre-hash signature string. Stored for:
    --   - Debugging: human-readable inspection of what the hash represents
    --   - Validation: can recompute sha256(signature) to verify set_hash
    --   - Diagnostics: if two sets have the same hash, compare signatures
    -- Format: "type_id_1:value_id_1|type_id_2:value_id_2|..." (sorted by type_id)
    signature       TEXT NOT NULL,

    -- Number of dimensions in this set. Enables fast filtering (WHERE dimension_count = 3)
    -- without joining dimension_set_item. Also used for sanity validation and debugging.
    -- Must be > 0; undimensioned lines use NULL dimension_set_id instead.
    -- Guaranteed correct by immutability: set during creation, never modified.
    dimension_count SMALLINT NOT NULL
                    CHECK (dimension_count > 0),

    -- Display cache (denormalized for UI/reporting without joins)
    display_label   TEXT,               -- e.g., 'COST_CENTER:CC-SALES | PROFIT_CENTER:PC-EAST'

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_fin_dim_set UNIQUE (tenant_id, entity_code, set_hash)
);

CREATE INDEX IF NOT EXISTS idx_fin_dim_set_tenant
    ON fin.dimension_set(tenant_id, entity_code);
CREATE INDEX IF NOT EXISTS idx_fin_dim_set_count
    ON fin.dimension_set(tenant_id, dimension_count);

-- ============================================================================
-- fin.dimension_set_item — Individual members of a dimension set
-- ============================================================================
-- Immutable once created. Sets are never modified — only new sets are created.
-- One value per dimension_type per set, enforced by unique constraint.
CREATE TABLE IF NOT EXISTS fin.dimension_set_item (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dimension_set_id UUID NOT NULL REFERENCES fin.dimension_set(id) ON DELETE CASCADE,
    dimension_type_id UUID NOT NULL REFERENCES fin.dimension_type(id),
    dimension_value_id UUID NOT NULL REFERENCES fin.dimension_value(id),
    ordinal         SMALLINT NOT NULL,  -- sorted position within the set

    -- Physical enforcement: one value per dimension_type per set
    CONSTRAINT uq_fin_dim_set_item UNIQUE (dimension_set_id, dimension_type_id),
    -- Physical enforcement: ordinals are unique within a set
    CONSTRAINT uq_fin_dim_set_item_ord UNIQUE (dimension_set_id, ordinal)
);

CREATE INDEX IF NOT EXISTS idx_fin_dim_set_item_set
    ON fin.dimension_set_item(dimension_set_id);
CREATE INDEX IF NOT EXISTS idx_fin_dim_set_item_value
    ON fin.dimension_set_item(dimension_type_id, dimension_value_id);

-- ============================================================================
-- fin.ou_dimension_default — Default dimension values per operating unit
-- ============================================================================
-- Replaces fin.operating_unit.default_cost_center_id / default_profit_center_id
-- with a flexible N-dimension default system per OU.
-- Smart Default Engine reads these during SMART_DEFAULTS step.
CREATE TABLE IF NOT EXISTS fin.ou_dimension_default (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES core.tenant(id),
    entity_code     VARCHAR(20) NOT NULL,
    ou_id           UUID NOT NULL REFERENCES fin.operating_unit(id) ON DELETE CASCADE,
    dimension_type_id UUID NOT NULL REFERENCES fin.dimension_type(id),
    dimension_value_id UUID NOT NULL REFERENCES fin.dimension_value(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- One default per dimension type per OU
    CONSTRAINT uq_fin_ou_dim_default UNIQUE (tenant_id, entity_code, ou_id, dimension_type_id)
);

CREATE INDEX IF NOT EXISTS idx_fin_ou_dim_default_ou
    ON fin.ou_dimension_default(ou_id);

-- ============================================================================
-- fin.document_line_dimension — Dimension capture at document entry
-- ============================================================================
-- Header/document carries suggested/default dimension context.
-- Final posting authority is at line level — the Posting Engine resolves
-- and freezes dimension_set_id at JE line creation.
--
-- Two-phase lifecycle:
--   1. Entry time: individual dimension values captured per line (raw, editable)
--   2. Validation complete: resolved_dimension_set_id snapshot attached
--      This enables comparison: user-entered vs. inherited vs. posting-finalized
CREATE TABLE IF NOT EXISTS fin.document_line_dimension (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES core.tenant(id),
    doc_type        VARCHAR(30) NOT NULL,       -- 'PURCHASE_INVOICE', 'PAYMENT_ENTRY', 'MANUAL_JE'
    doc_line_id     UUID NOT NULL,              -- FK to the specific document line table
    dimension_type_id UUID NOT NULL REFERENCES fin.dimension_type(id),
    dimension_value_id UUID NOT NULL REFERENCES fin.dimension_value(id),
    is_header_default BOOLEAN NOT NULL DEFAULT FALSE, -- TRUE = inherited from header, not user-selected
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_fin_doc_line_dim UNIQUE (tenant_id, doc_type, doc_line_id, dimension_type_id)
);

CREATE INDEX IF NOT EXISTS idx_fin_doc_line_dim_doc
    ON fin.document_line_dimension(doc_type, doc_line_id);
CREATE INDEX IF NOT EXISTS idx_fin_doc_line_dim_value
    ON fin.document_line_dimension(dimension_value_id);

-- Optional: resolved dimension set snapshot per document line
-- Added as a separate column on the source document line tables rather than
-- here, because each doc type has its own line table. Example migration:
--   ALTER TABLE fin.purchase_invoice_line
--       ADD COLUMN IF NOT EXISTS resolved_dimension_set_id UUID REFERENCES fin.dimension_set(id);
-- This is not added here to avoid coupling document DDL to dimension DDL.
-- Individual document engines add the column when they integrate.

-- ============================================================================
-- Schema extensions: add dimension_set_id to existing tables
-- ============================================================================

-- fin.journal_line: each line resolves to one canonical dimension set
ALTER TABLE fin.journal_line
    ADD COLUMN IF NOT EXISTS dimension_set_id UUID REFERENCES fin.dimension_set(id);

CREATE INDEX IF NOT EXISTS idx_fin_je_line_dim_set
    ON fin.journal_line(dimension_set_id) WHERE dimension_set_id IS NOT NULL;

-- fin.gl_balance: balance grain now includes dimension_set_id
-- NULL dimension_set_id = undimensioned balance (backward compatible)
ALTER TABLE fin.gl_balance
    ADD COLUMN IF NOT EXISTS dimension_set_id UUID REFERENCES fin.dimension_set(id);

-- Create the new unique constraint including dimension_set_id
-- The old constraint (uq_fin_gl_balance) remains for backward compatibility
-- until migration is complete, then can be dropped.
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'uq_fin_gl_balance_v2') THEN
        CREATE UNIQUE INDEX uq_fin_gl_balance_v2
            ON fin.gl_balance(tenant_id, entity_code, account_id, fiscal_year,
                              period_number, currency_code, COALESCE(dimension_set_id, '00000000-0000-0000-0000-000000000000'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_fin_gl_balance_dim_set
    ON fin.gl_balance(dimension_set_id) WHERE dimension_set_id IS NOT NULL;

-- fin.transaction_pipeline: resolved dimension snapshot for txn.finalized contract
ALTER TABLE fin.transaction_pipeline
    ADD COLUMN IF NOT EXISTS resolved_dimension_set_id UUID REFERENCES fin.dimension_set(id);

-- Dimension derivation audit log (stored as JSONB on transaction_pipeline)
-- Records how each dimension value was resolved during SMART_DEFAULTS/FINALIZATION.
-- Array of: {
--   dimension_type_code: "COST_CENTER",
--   dimension_value_code: "CC-SALES",
--   source: "user_entered" | "header_inherited" | "ou_default" | "policy_fixed" | "derived" | "federation_context",
--   policy_code: "CC-EXPENSE-DERIVE",
--   policy_version: 1,
--   confidence: 1.0,
--   warnings: ["value CC-OPS was overridden by user"]
-- }
ALTER TABLE fin.transaction_pipeline
    ADD COLUMN IF NOT EXISTS dimension_derivation_log JSONB NOT NULL DEFAULT '[]'::JSONB;

-- ============================================================================
-- Helper function: resolve or create a dimension set from sorted pairs
-- ============================================================================
-- Called by the Posting Engine during JE line creation.
-- Accepts a sorted array of (dimension_type_id, dimension_value_id) pairs,
-- computes the canonical hash, and returns an existing or newly created set_id.
--
-- Canonicalization rules enforced:
--   1. Input pairs MUST be pre-sorted by type_id (caller responsibility)
--   2. NULL/empty pairs are rejected (returns NULL for empty input)
--   3. Duplicate type_ids are rejected (raises exception)
--   4. Hash: SHA-256 of "type_id_1:value_id_1|type_id_2:value_id_2|..."
--   5. Existing set with matching (tenant, entity, hash) is reused
--   6. New set + items created atomically if no match found
CREATE OR REPLACE FUNCTION fin.resolve_dimension_set(
    p_tenant_id UUID,
    p_entity_code VARCHAR(20),
    p_pairs JSONB    -- array of {"type_id": uuid, "value_id": uuid} sorted by type_id
) RETURNS UUID LANGUAGE plpgsql AS $fn$
DECLARE
    v_hash      VARCHAR(64);
    v_set_id    UUID;
    v_count     SMALLINT;
    v_pair      JSONB;
    v_ordinal   SMALLINT := 0;
    v_parts     TEXT[] := '{}';
    v_signature TEXT;
    v_labels    TEXT[] := '{}';
    v_type_code TEXT;
    v_val_code  TEXT;
    v_prev_type TEXT := '';
    v_cur_type  TEXT;
BEGIN
    -- Empty set = undimensioned (use NULL dimension_set_id)
    IF p_pairs IS NULL OR jsonb_array_length(p_pairs) = 0 THEN
        RETURN NULL;
    END IF;

    v_count := jsonb_array_length(p_pairs)::SMALLINT;

    -- Build hash input from sorted pairs; validate sort order and uniqueness
    FOR v_pair IN SELECT * FROM jsonb_array_elements(p_pairs)
    LOOP
        v_cur_type := v_pair->>'type_id';

        -- Reject duplicate type_ids
        IF v_cur_type = v_prev_type THEN
            RAISE EXCEPTION 'Duplicate dimension_type_id % in dimension set input', v_cur_type;
        END IF;

        -- Reject unsorted input
        IF v_cur_type < v_prev_type THEN
            RAISE EXCEPTION 'Dimension set input not sorted by type_id: % came after %', v_cur_type, v_prev_type;
        END IF;

        v_prev_type := v_cur_type;
        v_parts := v_parts || (v_cur_type || ':' || (v_pair->>'value_id'));
    END LOOP;

    v_signature := array_to_string(v_parts, '|');
    v_hash := encode(sha256(v_signature::bytea), 'hex');

    -- Try to find existing set (fast path — hash lookup)
    SELECT id INTO v_set_id FROM fin.dimension_set
    WHERE tenant_id = p_tenant_id AND entity_code = p_entity_code AND set_hash = v_hash;

    IF v_set_id IS NOT NULL THEN
        RETURN v_set_id;
    END IF;

    -- Build display label for new set
    FOR v_pair IN SELECT * FROM jsonb_array_elements(p_pairs)
    LOOP
        SELECT dt.code INTO v_type_code FROM fin.dimension_type dt WHERE dt.id = (v_pair->>'type_id')::UUID;
        SELECT dv.code INTO v_val_code FROM fin.dimension_value dv WHERE dv.id = (v_pair->>'value_id')::UUID;
        v_labels := v_labels || (COALESCE(v_type_code,'?') || ':' || COALESCE(v_val_code,'?'));
    END LOOP;

    -- Create new set atomically
    INSERT INTO fin.dimension_set (tenant_id, entity_code, set_hash, signature, dimension_count, display_label)
    VALUES (p_tenant_id, p_entity_code, v_hash, v_signature, v_count, array_to_string(v_labels, ' | '))
    ON CONFLICT (tenant_id, entity_code, set_hash) DO NOTHING
    RETURNING id INTO v_set_id;

    -- Handle race condition: another transaction created the same set concurrently
    IF v_set_id IS NULL THEN
        SELECT id INTO v_set_id FROM fin.dimension_set
        WHERE tenant_id = p_tenant_id AND entity_code = p_entity_code AND set_hash = v_hash;
        RETURN v_set_id;
    END IF;

    -- Create set items
    v_ordinal := 0;
    FOR v_pair IN SELECT * FROM jsonb_array_elements(p_pairs)
    LOOP
        v_ordinal := v_ordinal + 1;
        INSERT INTO fin.dimension_set_item (dimension_set_id, dimension_type_id, dimension_value_id, ordinal)
        VALUES (v_set_id, (v_pair->>'type_id')::UUID, (v_pair->>'value_id')::UUID, v_ordinal);
    END LOOP;

    RETURN v_set_id;
END $fn$;

-- ============================================================================
-- Immutability Enforcement — dimension_set canonical columns
-- ============================================================================
-- set_hash, signature, and dimension_count form the canonical identity of a
-- dimension set. Mutating any of them would break the hash contract and cause
-- drift between the set header and its items. display_label is cosmetic and
-- remains updatable (e.g., after a dimension_type rename).
-- ============================================================================
CREATE OR REPLACE FUNCTION fin.trg_dimension_set_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.set_hash IS DISTINCT FROM OLD.set_hash THEN
        RAISE EXCEPTION 'dimension_set.set_hash is immutable after creation';
    END IF;
    IF NEW.signature IS DISTINCT FROM OLD.signature THEN
        RAISE EXCEPTION 'dimension_set.signature is immutable after creation';
    END IF;
    IF NEW.dimension_count IS DISTINCT FROM OLD.dimension_count THEN
        RAISE EXCEPTION 'dimension_set.dimension_count is immutable after creation';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_dimension_set_immutable ON fin.dimension_set;
CREATE TRIGGER trg_dimension_set_immutable
    BEFORE UPDATE ON fin.dimension_set
    FOR EACH ROW
    EXECUTE FUNCTION fin.trg_dimension_set_immutable();

-- ============================================================================
-- Immutability Enforcement — dimension_set_item rows
-- ============================================================================
-- Set items are the physical members of a canonical combination. Any UPDATE or
-- DELETE would silently change what a set_hash represents, corrupting every
-- journal line and GL balance that references the parent dimension_set.
-- ============================================================================
CREATE OR REPLACE FUNCTION fin.trg_dimension_set_item_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'dimension_set_item rows are immutable — % is not permitted', TG_OP;
END $$;

DROP TRIGGER IF EXISTS trg_dimension_set_item_no_update ON fin.dimension_set_item;
CREATE TRIGGER trg_dimension_set_item_no_update
    BEFORE UPDATE ON fin.dimension_set_item
    FOR EACH ROW
    EXECUTE FUNCTION fin.trg_dimension_set_item_immutable();

DROP TRIGGER IF EXISTS trg_dimension_set_item_no_delete ON fin.dimension_set_item;
CREATE TRIGGER trg_dimension_set_item_no_delete
    BEFORE DELETE ON fin.dimension_set_item
    FOR EACH ROW
    EXECUTE FUNCTION fin.trg_dimension_set_item_immutable();

-- ============================================================================
-- Phase 2A: Structural source attribution — fin.dimension_resolution_meta
-- ============================================================================
-- Persists the full resolution context for every dimension resolution event.
-- This is the structured audit trail that the user specifically requested:
--   "should not live only in logs... preserved in a structured way"
--
-- Key design choices:
--   - target_kind + target_id: polymorphic FK to any resolvable target
--   - resolution_hash: SHA-256 of the resolution_log JSONB for tamper detection
--   - evaluated_policies: snapshot of which policies were evaluated (with version)
--   - Immutable: once created, rows cannot be updated or deleted
CREATE TABLE IF NOT EXISTS fin.dimension_resolution_meta (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES core.tenant(id),
    entity_code         VARCHAR(20) NOT NULL,

    -- What was resolved
    target_kind         VARCHAR(30) NOT NULL
                        CHECK (target_kind IN (
                            'journal_line',
                            'document_line',
                            'transaction_pipeline'
                        )),
    target_id           UUID NOT NULL,

    -- Result
    dimension_set_id    UUID REFERENCES fin.dimension_set(id),

    -- Full resolution log — array of resolution entries with source attribution
    -- Each entry: { dimensionTypeCode, dimensionValueCode, dimensionTypeId,
    --               dimensionValueId, source (USER|FIXED_POLICY|DERIVED_POLICY|
    --               OU_DEFAULT|HEADER_INHERITED|SYSTEM_INHERITED|AI_SUGGESTED|
    --               FEDERATION_CONTEXT), policyCode, policyVersion, confidence, warnings }
    resolution_log      JSONB NOT NULL DEFAULT '[]'::JSONB,

    -- Tamper detection: SHA-256 of resolution_log::text
    resolution_hash     VARCHAR(64) NOT NULL,

    -- Policy context snapshot: which policies were evaluated during resolution
    -- Array of { policyId, policyCode, policyVersion, behavior, matched }
    evaluated_policies  JSONB NOT NULL DEFAULT '[]'::JSONB,

    resolved_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_by         UUID,

    CONSTRAINT uq_fin_dim_res_meta UNIQUE (tenant_id, target_kind, target_id)
);

CREATE INDEX IF NOT EXISTS idx_fin_dim_res_meta_target
    ON fin.dimension_resolution_meta(target_kind, target_id);
CREATE INDEX IF NOT EXISTS idx_fin_dim_res_meta_set
    ON fin.dimension_resolution_meta(dimension_set_id) WHERE dimension_set_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fin_dim_res_meta_tenant
    ON fin.dimension_resolution_meta(tenant_id, entity_code);

-- Immutability trigger for dimension_resolution_meta
CREATE OR REPLACE FUNCTION fin.trg_dimension_resolution_meta_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        RAISE EXCEPTION 'dimension_resolution_meta rows are immutable — UPDATE is not permitted';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'dimension_resolution_meta rows are immutable — DELETE is not permitted';
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_dim_res_meta_no_update ON fin.dimension_resolution_meta;
CREATE TRIGGER trg_dim_res_meta_no_update
    BEFORE UPDATE ON fin.dimension_resolution_meta
    FOR EACH ROW
    EXECUTE FUNCTION fin.trg_dimension_resolution_meta_immutable();

DROP TRIGGER IF EXISTS trg_dim_res_meta_no_delete ON fin.dimension_resolution_meta;
CREATE TRIGGER trg_dim_res_meta_no_delete
    BEFORE DELETE ON fin.dimension_resolution_meta
    FOR EACH ROW
    EXECUTE FUNCTION fin.trg_dimension_resolution_meta_immutable();

-- ============================================================================
-- Phase 2A: Document line dimension snapshot
-- ============================================================================
-- "This is very important" — approval should see the same dimensions posting will use.
-- Add resolved_dimension_set_id to purchase_invoice_line (and other doc lines).
ALTER TABLE fin.purchase_invoice_line
    ADD COLUMN IF NOT EXISTS resolved_dimension_set_id UUID REFERENCES fin.dimension_set(id);

CREATE INDEX IF NOT EXISTS idx_fin_pi_line_dim_set
    ON fin.purchase_invoice_line(resolved_dimension_set_id)
    WHERE resolved_dimension_set_id IS NOT NULL;

-- ============================================================================
-- Phase 2B: Policy scope expansion — book_code
-- ============================================================================
-- Dimension policies can now be scoped to a specific ledger book.
-- This enables book-specific dimension rules (e.g., TAX book requires
-- TAX_JURISDICTION dimension, MGMT book forbids it).
ALTER TABLE fin.dimension_policy
    ADD COLUMN IF NOT EXISTS scope_book_code VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_fin_dim_policy_scope_book
    ON fin.dimension_policy(scope_book_code) WHERE scope_book_code IS NOT NULL;

COMMENT ON COLUMN fin.dimension_policy.scope_book_code IS
    'Ledger book scope — NULL = applies to all books. Enables book-specific dimension rules.';

-- ============================================================================
-- Phase 2C: Dimension-aware GL query helpers
-- ============================================================================

-- Get GL balances filtered by dimension set
CREATE OR REPLACE FUNCTION fin.gl_balance_by_dimension(
    p_tenant_id     UUID,
    p_entity_code   VARCHAR(20),
    p_fiscal_year   INTEGER,
    p_period_number INTEGER DEFAULT NULL,
    p_dimension_set_id UUID DEFAULT NULL,
    p_account_id    UUID DEFAULT NULL,
    p_book_code     VARCHAR(20) DEFAULT NULL
) RETURNS TABLE (
    account_id      UUID,
    account_code    VARCHAR(20),
    account_name    VARCHAR(200),
    book_code       VARCHAR(20),
    dimension_set_id UUID,
    dimension_label TEXT,
    fiscal_year     INTEGER,
    period_number   INTEGER,
    period_debit    DECIMAL(18,4),
    period_credit   DECIMAL(18,4),
    closing_debit   DECIMAL(18,4),
    closing_credit  DECIMAL(18,4)
) LANGUAGE sql STABLE AS $fn$
    SELECT
        b.account_id,
        a.account_code,
        a.account_name,
        b.book_code,
        b.dimension_set_id,
        ds.display_label,
        b.fiscal_year,
        b.period_number,
        b.period_debit,
        b.period_credit,
        b.closing_debit,
        b.closing_credit
    FROM fin.gl_balance b
    JOIN fin.chart_of_accounts a ON a.id = b.account_id
    LEFT JOIN fin.dimension_set ds ON ds.id = b.dimension_set_id
    WHERE b.tenant_id = p_tenant_id
      AND b.entity_code = p_entity_code
      AND b.fiscal_year = p_fiscal_year
      AND (p_period_number IS NULL OR b.period_number = p_period_number)
      AND (p_dimension_set_id IS NULL OR b.dimension_set_id = p_dimension_set_id)
      AND (p_account_id IS NULL OR b.account_id = p_account_id)
      AND (p_book_code IS NULL OR b.book_code = p_book_code)
    ORDER BY a.account_code, b.period_number;
$fn$;

-- Aggregate GL balances by dimension type (pivot-style)
-- Returns one row per (account, dimension_value) with summed balances
CREATE OR REPLACE FUNCTION fin.gl_balance_by_dimension_type(
    p_tenant_id         UUID,
    p_entity_code       VARCHAR(20),
    p_fiscal_year       INTEGER,
    p_dimension_type_code VARCHAR(50),
    p_book_code         VARCHAR(20) DEFAULT NULL
) RETURNS TABLE (
    account_id          UUID,
    account_code        VARCHAR(20),
    account_name        VARCHAR(200),
    dimension_value_id  UUID,
    dimension_value_code VARCHAR(50),
    dimension_value_name VARCHAR(200),
    total_debit         DECIMAL(18,4),
    total_credit        DECIMAL(18,4),
    net_balance         DECIMAL(18,4)
) LANGUAGE sql STABLE AS $fn$
    SELECT
        b.account_id,
        a.account_code,
        a.account_name,
        dsi.dimension_value_id,
        dv.code AS dimension_value_code,
        dv.name AS dimension_value_name,
        SUM(b.period_debit)  AS total_debit,
        SUM(b.period_credit) AS total_credit,
        SUM(b.period_debit - b.period_credit) AS net_balance
    FROM fin.gl_balance b
    JOIN fin.chart_of_accounts a ON a.id = b.account_id
    JOIN fin.dimension_set_item dsi ON dsi.dimension_set_id = b.dimension_set_id
    JOIN fin.dimension_type dt ON dt.id = dsi.dimension_type_id
    JOIN fin.dimension_value dv ON dv.id = dsi.dimension_value_id
    WHERE b.tenant_id = p_tenant_id
      AND b.entity_code = p_entity_code
      AND b.fiscal_year = p_fiscal_year
      AND dt.code = p_dimension_type_code
      AND b.dimension_set_id IS NOT NULL
      AND (p_book_code IS NULL OR b.book_code = p_book_code)
    GROUP BY b.account_id, a.account_code, a.account_name,
             dsi.dimension_value_id, dv.code, dv.name
    ORDER BY a.account_code, dv.code;
$fn$;

-- ============================================================================
-- Phase 2D: Dimension-aware balance indexes
-- ============================================================================
-- Composite indexes for the most common dimension-aware query patterns.

-- Query: "GL balance by account + dimension in a period" (detail view)
CREATE INDEX IF NOT EXISTS idx_fin_gl_balance_dim_detail
    ON fin.gl_balance(tenant_id, entity_code, account_id, fiscal_year,
                      period_number, dimension_set_id)
    WHERE dimension_set_id IS NOT NULL;

-- Query: "All dimensioned balances in a period" (summary/report)
CREATE INDEX IF NOT EXISTS idx_fin_gl_balance_dim_period
    ON fin.gl_balance(tenant_id, entity_code, fiscal_year, period_number,
                      dimension_set_id)
    WHERE dimension_set_id IS NOT NULL;

-- Query: "Journal lines by dimension set" (drill-through)
CREATE INDEX IF NOT EXISTS idx_fin_je_line_dim_set_detail
    ON fin.journal_line(dimension_set_id, tenant_id)
    WHERE dimension_set_id IS NOT NULL;

-- Query: dimension_resolution_meta by source type (audit queries)
CREATE INDEX IF NOT EXISTS idx_fin_dim_res_meta_source
    ON fin.dimension_resolution_meta
    USING gin (resolution_log jsonb_path_ops);
