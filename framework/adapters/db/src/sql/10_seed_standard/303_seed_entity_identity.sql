/* ============================================================================
   Athyper — Entity Identity Backfill
   Populates entity_code, slug, mapping_mode, entity_class for all entities.
   Must run AFTER 300_meta_entity_registration.sql and
   AFTER 050_entity_identity_strengthening.sql (schema migration).

   PostgreSQL 16+
   ============================================================================ */

BEGIN;

-- Disable guards during identity backfill (initial population of new columns)
ALTER TABLE meta.entity DISABLE TRIGGER entity_evolution_guard;
ALTER TABLE meta.entity DISABLE TRIGGER trg_class_governance_guard;

-- ============================================================================
-- §1  Backfill entity_code from table_name (already snake_case)
-- ============================================================================
-- entity_code is the immutable machine identity. We use table_name as the
-- canonical source since it's already clean snake_case. For entities where
-- table_name diverges from the logical name (e.g. PurchaseInvoice →
-- purchase_invoice), entity_code follows the table_name — the physical truth.

-- First handle shared-table overrides (must come before bulk backfill to avoid uniqueness violations)
UPDATE meta.entity SET entity_code = 'manual_journal_entry'
WHERE name = 'ManualJournalEntry'
  AND (entity_code IS NULL OR entity_code != 'manual_journal_entry');

-- Bulk backfill: entity_code = table_name for all remaining NULL entries
UPDATE meta.entity
SET entity_code = table_name
WHERE entity_code IS NULL
  AND mapping_mode != 'virtual';

-- ============================================================================
-- §2  Backfill slug from name (PascalCase → kebab-case)
-- ============================================================================
-- Uses the same derivation as entityNameToSlug() in entity-meta-utils.ts:
--   camelCase boundaries → hyphen, then lowercase.

UPDATE meta.entity
SET slug = lower(
    regexp_replace(
        regexp_replace(name, '([a-z])([A-Z])', '\1-\2', 'g'),
        '([A-Z])([A-Z][a-z])', '\1-\2', 'g'
    )
)
WHERE slug IS NULL;

-- ============================================================================
-- §3  Set mapping_mode for known shared-table entities
-- ============================================================================
-- ManualJournalEntry and JournalEntry both map to fin.journal_entry.
-- ManualJournalEntry is the lifecycle-managed "full" entity (primary owner).
-- JournalEntry is the audit_only ledger view of the same table.

UPDATE meta.entity SET mapping_mode = 'shared'
WHERE name IN ('ManualJournalEntry', 'JournalEntry')
  AND mapping_mode = 'exclusive';

-- All other entities default to 'exclusive' (set by the column default).

-- ============================================================================
-- §4  (Handled above in §1 — shared-table overrides applied before bulk backfill)
-- ============================================================================
-- JournalEntry keeps entity_code = 'journal_entry' (matches table_name)

-- ============================================================================
-- §5  Backfill entity_class (behavioral archetype)
-- ============================================================================
-- Classification: REFERENCE, MASTER, CONTROL, DOCUMENT, LEDGER, LOG
-- Default is 'MASTER' (from column default). Override per entity below.

-- ── REFERENCE: immutable lookup/ISO data ──
UPDATE meta.entity SET entity_class = 'REFERENCE' WHERE name IN (
    'Country', 'StateRegion', 'Currency', 'Language', 'Locale',
    'Timezone', 'UnitOfMeasure', 'CommodityDomain', 'CommodityCode',
    'IndustryDomain', 'IndustryCode', 'Label'
);

-- ── MASTER: core business entities ──
UPDATE meta.entity SET entity_class = 'MASTER' WHERE name IN (
    'Customer', 'Supplier', 'Employee', 'ProductCategory', 'Product',
    'ChartOfAccounts', 'CostCenter', 'ProfitCenter', 'FiscalPeriod',
    'OperatingUnit', 'BusinessIntent', 'Warehouse', 'ItemMaster',
    'Asset', 'LegalEntity', 'CommissionPlan', 'TaxJurisdiction',
    'AIModelRegistry', 'FundingProfile', 'AccountingProfile',
    'SpendCategory',
    'Attachment', 'Document', 'Template', 'Letterhead', 'BrandProfile'
);

-- ── CONTROL: configuration/setup/rules ──
UPDATE meta.entity SET entity_class = 'CONTROL' WHERE name IN (
    'EntityRelationship',
    'TemplateVersion', 'TemplateBinding',
    'PolicyModule', 'SmartDefaultRule',
    'IntercompanyAgreement', 'FxRate', 'TaxRate',
    'BillOfMaterials', 'Routing',
    'CommissionAssignment',
    'SpendCategoryCommodityMap', 'CategoryIntentRule',
    'DocumentSequence',
    'IntegrationEndpoint', 'IntegrationFlow', 'WebhookSubscription'
);

-- ── DOCUMENT: lifecycle-managed transactional documents ──
UPDATE meta.entity SET entity_class = 'DOCUMENT' WHERE name IN (
    'PurchaseInvoice', 'ManualJournalEntry', 'PaymentEntry',
    'BankStatement',
    'Commitment', 'WorkOrder'
);

-- ── LEDGER: immutable append-only financial records ──
UPDATE meta.entity SET entity_class = 'LEDGER' WHERE name IN (
    'JournalEntry', 'JournalLine', 'GLBalance',
    'PurchaseInvoiceLine', 'PaymentAllocation',
    'FundingTransaction', 'FundingTransfer',
    'CommitmentSchedule', 'CommitmentFulfillment',
    'InventoryBalance', 'InventoryMovement', 'InventoryValuationLayer',
    'Stocktake', 'StocktakeLine',
    'BomLine', 'WorkOrderCost', 'WorkOrderMaterialIssue', 'ProductionVariance',
    'IntercompanyTransaction', 'ConsolidationElimination', 'NettingBatch',
    'FxRevaluation',
    'CommissionCalculation', 'CommissionStatement',
    'TaxCalculation', 'TaxCreditLedger',
    'AssetBook', 'AssetTransaction', 'DepreciationRun',
    'BankStatementLine', 'ReconciliationSession'
);

-- ── LOG: operational event streams, TTL-eligible ──
UPDATE meta.entity SET entity_class = 'LOG' WHERE name IN (
    'TransactionPipeline', 'PolicyEvaluationLog', 'Exception',
    'OuIntentMapping',
    'AIPrediction', 'AIAction', 'AIDriftMonitor',
    'RenderOutput', 'RenderJob', 'RenderDLQ',
    'EntityDocumentLink', 'DocumentACL',
    'AttachmentAccessLog', 'AttachmentComment', 'MultipartUpload',
    'WebhookEvent', 'OutboxItem', 'DeliveryLog', 'JobLog'
);

-- Re-enable guards
ALTER TABLE meta.entity ENABLE TRIGGER entity_evolution_guard;
ALTER TABLE meta.entity ENABLE TRIGGER trg_class_governance_guard;

COMMIT;
