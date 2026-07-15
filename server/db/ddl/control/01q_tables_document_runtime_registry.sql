-- ============================================================================
-- control/01q_tables_document_runtime_registry.sql
--
-- Concept: Document-runtime registries powering the descriptor-driven
-- document page (per Cleanup Plan v5 P3a + P3c).
--
-- Tables:
--   control.polymorphic_child_binding   (P3a) — declares parent → child
--                                       relationships for the generic
--                                       /api/document-runtime/binding/...
--                                       fetch route
--   control.document_lookup             (P3c) — declares allow-listed lookup
--                                       codes for /api/document-runtime/lookup
--                                       with server-authoritative base filters
--
-- Both tables are control-plane authoritative — populated via seed and
-- referenced by descriptor surface configs by `binding_code` / `lookup_code`.
--
-- Depends on: control schema bootstrap
-- Spec: cleanup-plan v5 §4.5 + §5.5 (binding); §4.6 + §5.6 (lookup)
-- ============================================================================

-- ============================================================================
-- §P3a  control.polymorphic_child_binding
-- ============================================================================
-- Authoritative source for "is <child> a polymorphic / FK child of <parent>?".
-- The /api/document-runtime/binding/<binding_code>/records/<parent_id> route
-- resolves a binding_code here, applies the right filter (fk_field for FK
-- binding, source_doc_type_value + source_doc_id_field for polymorphic),
-- and forwards to the backend records API.
--
-- Uniqueness:
--   - PRIMARY KEY (binding_code) — surfaces reference bindings by stable code
--   - NO unique on (parent, child) — a parent may have multiple bindings to
--     the same child for different roles/source types (e.g. a future
--     "purchase_invoice_payment_attachment" binding distinct from
--     "purchase_invoice__pricing_component").
--   - Index on (parent_entity_code, child_entity_code) for descriptor
--     compilation and seed-time integrity checks.

CREATE TABLE IF NOT EXISTS control.polymorphic_child_binding (
    -- Identity (deterministic; descriptor surfaces reference this code)
    binding_code            text          NOT NULL,

    -- The parent and child entity codes — must exist in control.entity
    parent_entity_code      text          NOT NULL,
    child_entity_code       text          NOT NULL,

    -- Discriminator: 'fk' for regular foreign-key child, 'polymorphic'
    -- for shared tables keyed by source_doc_type + source_doc_id
    binding_kind            text          NOT NULL,

    -- FK binding (NULL when polymorphic)
    fk_field                text,

    -- Polymorphic binding (NULL when FK)
    source_doc_type_value   text,           -- e.g. 'purchase_invoice_line'
    source_doc_id_field     text,           -- e.g. 'source_doc_id'
    source_line_id_field    text,           -- e.g. 'source_line_id'

    -- Free-form context
    description             text,

    -- Lifecycle
    status                  text          NOT NULL DEFAULT 'active',

    -- Standard envelope
    metadata                jsonb         NOT NULL DEFAULT '{}'::jsonb,
    created_at              timestamptz   NOT NULL DEFAULT now(),
    created_by              uuid          NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT pcb_pkey                   PRIMARY KEY (binding_code),
    CONSTRAINT pcb_binding_kind_chk       CHECK (binding_kind IN ('fk', 'polymorphic')),
    CONSTRAINT pcb_status_chk             CHECK (status IN ('active', 'inactive')),
    CONSTRAINT pcb_metadata_chk           CHECK (jsonb_typeof(metadata) = 'object'),

    -- §4.5 — kind/field consistency.
    -- FK bindings must have fk_field and NO source_doc_type_value.
    -- Polymorphic bindings must have source_doc_type_value and NO fk_field.
    CONSTRAINT pcb_kind_consistency_chk   CHECK (
        (binding_kind = 'fk'           AND fk_field IS NOT NULL AND source_doc_type_value IS NULL)
        OR
        (binding_kind = 'polymorphic'  AND source_doc_type_value IS NOT NULL AND fk_field IS NULL)
    )
);

-- Descriptor compile + seed-time integrity scans (parent → all children)
CREATE INDEX IF NOT EXISTS ix_pcb_parent_child
    ON control.polymorphic_child_binding (parent_entity_code, child_entity_code);

-- Route lookups go through binding_code; this partial index keeps active
-- bindings fast.
CREATE INDEX IF NOT EXISTS ix_pcb_active
    ON control.polymorphic_child_binding (binding_code)
    WHERE status = 'active';

COMMENT ON TABLE control.polymorphic_child_binding IS
    'ARCHETYPE=B;SCOPE=N. Document-runtime child binding registry. Authoritative '
    'source for "is <child> a child of <parent>?". The generic '
    '/api/document-runtime/binding/<code>/records/<parent_id> route resolves '
    'a binding here and forwards with the computed filter. Cleanup-plan v5 §4.5.';

COMMENT ON COLUMN control.polymorphic_child_binding.binding_code IS
    'Stable descriptor reference (e.g. "purchase_invoice__pricing_component"). '
    'Surfaces in control.entity_surface.config reference this code; renaming '
    'is a breaking change.';

COMMENT ON COLUMN control.polymorphic_child_binding.binding_kind IS
    '''fk'': child rows reference parent via fk_field. '
    '''polymorphic'': child rows are keyed by source_doc_type + source_doc_id '
    '(common pattern for accounting_distribution, pricing_component).';


-- ============================================================================
-- §P3c  control.document_lookup
-- ============================================================================
-- Allow-listed lookup codes for the descriptor-driven lookup route.
-- Replaces the generic /api/document-runtime/lookup/<entity> endpoint with
-- /api/document-runtime/lookup/<lookup_code>, where base_filters is the
-- server-authoritative filter applied before merging caller-provided extras.
-- Callers cannot bypass base_filters.
--
-- Example seeds:
--   pi_discount_condition_types →
--     child_entity = 'condition_type',
--     base_filters = {"term_type":"discount","status":"active"}
--   pi_tax_groups →
--     child_entity = 'tax_group',
--     base_filters = {"status":"active"}

CREATE TABLE IF NOT EXISTS control.document_lookup (
    -- Identity
    lookup_code             text          NOT NULL,

    -- Target entity (must exist in control.entity)
    child_entity            text          NOT NULL,

    -- Server-authoritative filters applied before caller-provided extras.
    -- Caller filters merge on top, but base_filters always wins on conflict.
    base_filters            jsonb         NOT NULL DEFAULT '{}'::jsonb,

    -- Free-form context
    description             text,

    -- Lifecycle
    status                  text          NOT NULL DEFAULT 'active',

    -- Standard envelope
    metadata                jsonb         NOT NULL DEFAULT '{}'::jsonb,
    created_at              timestamptz   NOT NULL DEFAULT now(),
    created_by              uuid          NOT NULL,
    updated_at              timestamptz,
    updated_by              uuid,

    CONSTRAINT dl_pkey                    PRIMARY KEY (lookup_code),
    CONSTRAINT dl_status_chk              CHECK (status IN ('active', 'inactive')),
    CONSTRAINT dl_base_filters_chk        CHECK (jsonb_typeof(base_filters) = 'object'),
    CONSTRAINT dl_metadata_chk            CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS ix_dl_active
    ON control.document_lookup (lookup_code)
    WHERE status = 'active';

CREATE INDEX IF NOT EXISTS ix_dl_child_entity
    ON control.document_lookup (child_entity);

COMMENT ON TABLE control.document_lookup IS
    'ARCHETYPE=B;SCOPE=N. Document-runtime lookup registry. Replaces the generic '
    'entity-by-name lookup pattern with allow-listed codes whose base_filters '
    'are server-authoritative. Cleanup-plan v5 §4.6.';

COMMENT ON COLUMN control.document_lookup.base_filters IS
    'JSONB filter dict applied BEFORE merging caller extras. Caller cannot '
    'bypass these — they always win on key conflict. Example: '
    '{"term_type":"discount","status":"active"} for pi_discount_condition_types.';
