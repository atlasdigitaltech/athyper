/* ============================================================================
   Athyper — Entity Identity Strengthening
   Adds entity_code, slug, mapping_mode, entity_class columns;
   tightens entity_short format; enforces physical-mapping uniqueness
   for exclusive-mapped entities.

   PostgreSQL 16+
   Depends on: 040_meta.sql (meta.entity base table)
   ============================================================================ */

-- ============================================================================
-- 1. IMMUTABLE SYSTEM KEY: entity_code
-- ============================================================================
-- Stable internal identity that never changes even if display name changes.
-- Machine-safe, immutable, unique per tenant.
-- Pattern: snake_case, e.g. 'chart_of_accounts', 'purchase_invoice'

ALTER TABLE meta.entity ADD COLUMN IF NOT EXISTS entity_code text;

COMMENT ON COLUMN meta.entity.entity_code IS
  'Immutable machine-safe identity key. Never changes once set. Unique per tenant. snake_case format.';

-- Format: lowercase alphanumeric + underscores, must start with letter, 2-80 chars
ALTER TABLE meta.entity DROP CONSTRAINT IF EXISTS chk_entity_code_format;
ALTER TABLE meta.entity ADD CONSTRAINT chk_entity_code_format
    CHECK (entity_code IS NULL OR entity_code ~ '^[a-z][a-z0-9_]{1,79}$');

-- Unique per tenant (partial — allows NULLs during migration)
CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_code_uniq
    ON meta.entity (tenant_id, entity_code) WHERE entity_code IS NOT NULL;

-- ============================================================================
-- 2. PERSISTED SLUG
-- ============================================================================
-- Today slug is derived at runtime from name via PascalCase→kebab-case conversion.
-- Persisting it avoids future ambiguity from derivation changes and enables
-- direct DB lookups by slug.

ALTER TABLE meta.entity ADD COLUMN IF NOT EXISTS slug text;

COMMENT ON COLUMN meta.entity.slug IS
  'Persisted URL-routing slug. Lowercase kebab-case. Unique per tenant.';

-- Format: lowercase kebab-case, must start with letter, 2-100 chars
ALTER TABLE meta.entity DROP CONSTRAINT IF EXISTS chk_entity_slug_format;
ALTER TABLE meta.entity ADD CONSTRAINT chk_entity_slug_format
    CHECK (slug IS NULL OR slug ~ '^[a-z][a-z0-9]+(-[a-z0-9]+)*$');

-- Unique per tenant (partial — allows NULLs during migration)
CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_slug_uniq
    ON meta.entity (tenant_id, slug) WHERE slug IS NOT NULL;

-- ============================================================================
-- 3. PHYSICAL MAPPING MODE
-- ============================================================================
-- Declares whether a logical entity has exclusive ownership of its physical
-- table or shares it with other logical entities.
--
--   exclusive : 1:1 mapping — uniqueness on (tenant_id, table_schema, table_name)
--   shared    : multiple logical entities on one table (e.g. ManualJournalEntry
--               and JournalEntry both on fin.journal_entry)
--   virtual   : no physical table (e.g. computed/view entities)

ALTER TABLE meta.entity ADD COLUMN IF NOT EXISTS mapping_mode text NOT NULL DEFAULT 'exclusive';

COMMENT ON COLUMN meta.entity.mapping_mode IS
  'Physical table mapping mode: exclusive (1:1), shared (multi-entity per table), virtual (no table).';

ALTER TABLE meta.entity DROP CONSTRAINT IF EXISTS chk_entity_mapping_mode;
ALTER TABLE meta.entity ADD CONSTRAINT chk_entity_mapping_mode
    CHECK (mapping_mode IN ('exclusive', 'shared', 'virtual'));

-- Backfill: auto-detect shared mappings (multiple active entities on the same table)
UPDATE meta.entity SET mapping_mode = 'shared'
WHERE is_active = true
  AND mapping_mode = 'exclusive'
  AND (tenant_id, table_schema, table_name) IN (
    SELECT tenant_id, table_schema, table_name
    FROM meta.entity
    WHERE is_active = true
    GROUP BY tenant_id, table_schema, table_name
    HAVING count(*) > 1
  );

-- Physical mapping uniqueness: only for exclusive-mapped active entities
CREATE UNIQUE INDEX IF NOT EXISTS idx_entity_table_mapping_uniq
    ON meta.entity (tenant_id, table_schema, table_name)
    WHERE is_active = true AND mapping_mode = 'exclusive';

-- ============================================================================
-- 4. STRONGER entity_short FORMAT VALIDATION
-- ============================================================================
-- Existing: sparse unique index on (tenant_id, entity_short).
-- Add: format check — uppercase alphanumeric, starts with letter, 2-12 chars.

ALTER TABLE meta.entity DROP CONSTRAINT IF EXISTS chk_entity_short_format;
ALTER TABLE meta.entity ADD CONSTRAINT chk_entity_short_format
    CHECK (entity_short IS NULL OR entity_short ~ '^[A-Z][A-Z0-9_]{1,11}$');

-- ============================================================================
-- 5. ENTITY CLASS (behavioral archetype)
-- ============================================================================
-- Separates behavioral semantics from domain/storage classification (kind).
--
--   kind         = WHERE it lives (domain origin: ref, ent, fin, doc, int)
--   entity_class = HOW it behaves (behavioral archetype)
--
--   REFERENCE : immutable lookup data, no lifecycle (Currency, Country)
--   MASTER    : core business entities, optionally lifecycle-managed (Customer, ChartOfAccounts)
--   CONTROL   : configuration/setup/rules, versioned but no approval flow (TaxRate, SmartDefaultRule)
--   DOCUMENT  : lifecycle-managed transactional documents with numbering + approvals (PurchaseInvoice)
--   LEDGER    : immutable append-only financial records, balancing invariants (JournalEntry, GLBalance)
--   LOG       : operational event streams, TTL-eligible, sampleable (PolicyEvaluationLog, DeliveryLog)

ALTER TABLE meta.entity ADD COLUMN IF NOT EXISTS entity_class text NOT NULL DEFAULT 'MASTER';

COMMENT ON COLUMN meta.entity.entity_class IS
  'Behavioral archetype: REFERENCE (lookup), MASTER (business entity), CONTROL (config/rules), DOCUMENT (lifecycle+approvals), LEDGER (immutable financial), LOG (operational events).';

ALTER TABLE meta.entity DROP CONSTRAINT IF EXISTS chk_entity_class;
ALTER TABLE meta.entity ADD CONSTRAINT chk_entity_class
    CHECK (entity_class IN ('REFERENCE', 'MASTER', 'CONTROL', 'DOCUMENT', 'LEDGER', 'LOG'));

-- Index for filtering by class (used by capability resolution, UI filtering)
CREATE INDEX IF NOT EXISTS idx_entity_class
    ON meta.entity (tenant_id, entity_class);

-- ============================================================================
-- 6. IDENTITY MODEL SUMMARY (comments)
-- ============================================================================
-- entity_code  : immutable, machine-safe, stable registry identity
-- name         : logical display name / developer-facing label (PascalCase)
-- slug         : URL routing key (kebab-case, derived from name but persisted)
-- entity_short : command palette / TCODE shortcut alias (uppercase mnemonic)
-- entity_class : behavioral archetype (REFERENCE, MASTER, CONTROL, DOCUMENT, LEDGER, LOG)

COMMENT ON TABLE meta.entity IS
  'Entity (DocType) registry. Identity: entity_code (immutable), name (display), slug (routing), entity_short (alias). Classification: kind (domain) + entity_class (behavior). Physical mapping, governance, feature flags, version links.';
