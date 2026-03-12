/* ============================================================================
   Athyper — Entity Identity Config Seed
   Seeds identity_config (primaryLabelField, primaryCodeField) for ALL
   registered entities. This is per-entity data that cannot be derived from
   entity_class alone.

   identity_config shape (per chk_entity_identity_label CHECK constraint):
     { "primaryLabelField": "<field_name>",       -- REQUIRED when non-NULL
       "primaryCodeField":  "<field_name>",       -- optional
       "strategy":          "uuid_v7",            -- PK generation strategy
       "autoGenerate":      true }                -- auto-generate PK

   The primaryLabelField is consumed by the lookup API when no field-level
   lookup_profile exists. It determines which column is shown as the
   human-readable label in dropdowns, search results, and FK references.

   Dependencies: 067_entity_runtime_profile.sql, 303_seed_entity_identity.sql,
                 330_seed_entity_runtime_profile.sql
   Must run AFTER runtime_profile rows exist.

   PostgreSQL 16+
   ============================================================================ */

BEGIN;

-- ── Disable guards on meta.entity during seeding ──
ALTER TABLE meta.entity DISABLE TRIGGER trg_class_governance_guard;
ALTER TABLE meta.entity DISABLE TRIGGER entity_evolution_guard;
ALTER TABLE meta.entity DISABLE TRIGGER entity_numbering_policy_check;

-- ============================================================================
-- §1  REFERENCE Entities — primaryLabelField + primaryCodeField
-- ============================================================================

UPDATE meta.entity_runtime_profile erp
SET identity_config = v.config::jsonb,
    updated_at = now()
FROM meta.entity e,
(VALUES
    ('Country',        '{"primaryLabelField": "name", "primaryCodeField": "code2", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('StateRegion',    '{"primaryLabelField": "name", "primaryCodeField": "code", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('Currency',       '{"primaryLabelField": "name", "primaryCodeField": "code", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('Language',       '{"primaryLabelField": "name", "primaryCodeField": "code", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('Locale',         '{"primaryLabelField": "name", "primaryCodeField": "code", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('Timezone',       '{"primaryLabelField": "display_name", "primaryCodeField": "tzid", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('UnitOfMeasure',  '{"primaryLabelField": "name", "primaryCodeField": "code", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('CommodityDomain','{"primaryLabelField": "name", "primaryCodeField": "code", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('CommodityCode',  '{"primaryLabelField": "name", "primaryCodeField": "code", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('IndustryDomain', '{"primaryLabelField": "name", "primaryCodeField": "code", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('IndustryCode',   '{"primaryLabelField": "name", "primaryCodeField": "code", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('Label',          '{"primaryLabelField": "name", "primaryCodeField": "code", "strategy": "uuid_v7", "autoGenerate": true}')
) AS v(name, config)
WHERE e.name = v.name
  AND erp.entity_id = e.id
  AND erp.identity_config IS NULL;

-- ============================================================================
-- §2  MASTER Entities (ent schema)
-- ============================================================================

UPDATE meta.entity_runtime_profile erp
SET identity_config = v.config::jsonb,
    updated_at = now()
FROM meta.entity e,
(VALUES
    ('Customer',        '{"primaryLabelField": "name", "primaryCodeField": "code", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('Supplier',        '{"primaryLabelField": "name", "primaryCodeField": "code", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('Employee',        '{"primaryLabelField": "name", "primaryCodeField": "employee_number", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('ProductCategory', '{"primaryLabelField": "name", "primaryCodeField": "code", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('Product',         '{"primaryLabelField": "name", "primaryCodeField": "code", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('Attachment',      '{"primaryLabelField": "file_name", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('Document',        '{"primaryLabelField": "title", "primaryCodeField": "code", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('Template',        '{"primaryLabelField": "name", "primaryCodeField": "code", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('Letterhead',      '{"primaryLabelField": "name", "primaryCodeField": "code", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('BrandProfile',    '{"primaryLabelField": "name", "strategy": "uuid_v7", "autoGenerate": true}')
) AS v(name, config)
WHERE e.name = v.name
  AND erp.entity_id = e.id
  AND erp.identity_config IS NULL;

-- ============================================================================
-- §3  MASTER Entities (fin schema — engine-bound)
-- ============================================================================

UPDATE meta.entity_runtime_profile erp
SET identity_config = v.config::jsonb,
    updated_at = now()
FROM meta.entity e,
(VALUES
    ('ChartOfAccounts',   '{"primaryLabelField": "account_name", "primaryCodeField": "account_code", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('CostCenter',        '{"primaryLabelField": "name", "primaryCodeField": "code", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('ProfitCenter',      '{"primaryLabelField": "name", "primaryCodeField": "code", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('FiscalPeriod',      '{"primaryLabelField": "period_name", "primaryCodeField": "fiscal_year", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('AccountingProfile', '{"primaryLabelField": "name", "primaryCodeField": "code", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('OperatingUnit',     '{"primaryLabelField": "name", "primaryCodeField": "code", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('BusinessIntent',    '{"primaryLabelField": "name", "primaryCodeField": "code", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('FundingProfile',    '{"primaryLabelField": "name", "primaryCodeField": "code", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('Warehouse',         '{"primaryLabelField": "name", "primaryCodeField": "code", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('ItemMaster',        '{"primaryLabelField": "name", "primaryCodeField": "code", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('Asset',             '{"primaryLabelField": "name", "primaryCodeField": "asset_number", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('CommissionPlan',    '{"primaryLabelField": "name", "primaryCodeField": "code", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('LegalEntity',       '{"primaryLabelField": "name", "primaryCodeField": "code", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('TaxJurisdiction',   '{"primaryLabelField": "name", "primaryCodeField": "code", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('AIModelRegistry',   '{"primaryLabelField": "model_name", "primaryCodeField": "model_code", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('SpendCategory',     '{"primaryLabelField": "name", "primaryCodeField": "code", "strategy": "uuid_v7", "autoGenerate": true}')
) AS v(name, config)
WHERE e.name = v.name
  AND erp.entity_id = e.id
  AND erp.identity_config IS NULL;

-- ============================================================================
-- §4  CONTROL Entities
-- ============================================================================

UPDATE meta.entity_runtime_profile erp
SET identity_config = v.config::jsonb,
    updated_at = now()
FROM meta.entity e,
(VALUES
    ('EntityRelationship',      '{"primaryLabelField": "name", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('TemplateVersion',         '{"primaryLabelField": "label", "primaryCodeField": "version_no", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('TemplateBinding',         '{"primaryLabelField": "name", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('PolicyModule',            '{"primaryLabelField": "name", "primaryCodeField": "code", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('SmartDefaultRule',        '{"primaryLabelField": "name", "primaryCodeField": "code", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('IntercompanyAgreement',   '{"primaryLabelField": "name", "primaryCodeField": "code", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('FxRate',                  '{"primaryLabelField": "name", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('TaxRate',                 '{"primaryLabelField": "name", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('BillOfMaterials',         '{"primaryLabelField": "name", "primaryCodeField": "code", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('Routing',                 '{"primaryLabelField": "name", "primaryCodeField": "code", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('CommissionAssignment',    '{"primaryLabelField": "name", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('SpendCategoryCommodityMap','{"primaryLabelField": "name", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('CategoryIntentRule',      '{"primaryLabelField": "name", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('DocumentSequence',        '{"primaryLabelField": "name", "primaryCodeField": "prefix", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('IntegrationEndpoint',     '{"primaryLabelField": "name", "primaryCodeField": "code", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('IntegrationFlow',         '{"primaryLabelField": "name", "primaryCodeField": "code", "strategy": "uuid_v7", "autoGenerate": true}'),
    ('WebhookSubscription',     '{"primaryLabelField": "name", "strategy": "uuid_v7", "autoGenerate": true}')
) AS v(name, config)
WHERE e.name = v.name
  AND erp.entity_id = e.id
  AND erp.identity_config IS NULL;

-- ============================================================================
-- §5  DOCUMENT Entities
-- ============================================================================

UPDATE meta.entity_runtime_profile erp
SET identity_config = v.config::jsonb,
    updated_at = now()
FROM meta.entity e,
(VALUES
    ('PurchaseInvoice',    '{"primaryLabelField": "invoice_number", "strategy": "uuid_v7", "autoGenerate": true, "hasDocumentNumber": true}'),
    ('CreditNote',         '{"primaryLabelField": "credit_note_number", "strategy": "uuid_v7", "autoGenerate": true, "hasDocumentNumber": true}'),
    ('DebitNote',          '{"primaryLabelField": "debit_note_number", "strategy": "uuid_v7", "autoGenerate": true, "hasDocumentNumber": true}'),
    ('ManualJournalEntry', '{"primaryLabelField": "je_number", "strategy": "uuid_v7", "autoGenerate": true, "hasDocumentNumber": true}'),
    ('PaymentEntry',       '{"primaryLabelField": "payment_number", "strategy": "uuid_v7", "autoGenerate": true, "hasDocumentNumber": true}'),
    ('BankStatement',      '{"primaryLabelField": "statement_number", "strategy": "uuid_v7", "autoGenerate": true, "hasDocumentNumber": true}'),
    ('Commitment',         '{"primaryLabelField": "commitment_number", "strategy": "uuid_v7", "autoGenerate": true, "hasDocumentNumber": true}'),
    ('WorkOrder',          '{"primaryLabelField": "work_order_number", "strategy": "uuid_v7", "autoGenerate": true, "hasDocumentNumber": true}')
) AS v(name, config)
WHERE e.name = v.name
  AND erp.entity_id = e.id
  AND erp.identity_config IS NULL;

-- ============================================================================
-- §6  LEDGER Entities
-- ============================================================================

UPDATE meta.entity_runtime_profile erp
SET identity_config = v.config::jsonb,
    updated_at = now()
FROM meta.entity e,
(VALUES
    -- GL / Posting
    ('JournalEntry',       '{"primaryLabelField": "je_number", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    ('JournalLine',        '{"primaryLabelField": "line_no", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    ('GLBalance',          '{"primaryLabelField": "account_id", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    -- Document child lines
    ('PurchaseInvoiceLine','{"primaryLabelField": "line_no", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    ('CreditNoteLine',     '{"primaryLabelField": "line_no", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    ('DebitNoteLine',      '{"primaryLabelField": "line_no", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    ('PaymentAllocation',  '{"primaryLabelField": "invoice_id", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    -- Budget
    ('FundingTransaction', '{"primaryLabelField": "description", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    ('FundingTransfer',    '{"primaryLabelField": "description", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    -- Commitment
    ('CommitmentSchedule', '{"primaryLabelField": "line_no", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    ('CommitmentFulfillment','{"primaryLabelField": "description", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    -- Inventory
    ('InventoryBalance',   '{"primaryLabelField": "item_id", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    ('InventoryMovement',  '{"primaryLabelField": "movement_type", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    ('InventoryValuationLayer','{"primaryLabelField": "item_id", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    ('Stocktake',          '{"primaryLabelField": "stocktake_number", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    ('StocktakeLine',      '{"primaryLabelField": "line_no", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    -- Production
    ('BomLine',            '{"primaryLabelField": "line_no", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    ('WorkOrderCost',      '{"primaryLabelField": "cost_type", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    ('WorkOrderMaterialIssue','{"primaryLabelField": "item_id", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    ('ProductionVariance', '{"primaryLabelField": "variance_type", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    -- Federation / Intercompany
    ('IntercompanyTransaction','{"primaryLabelField": "description", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    ('ConsolidationElimination','{"primaryLabelField": "description", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    ('NettingBatch',       '{"primaryLabelField": "description", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    ('FxRevaluation',      '{"primaryLabelField": "description", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    -- Commission
    ('CommissionCalculation','{"primaryLabelField": "description", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    ('CommissionStatement','{"primaryLabelField": "statement_number", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    -- Tax
    ('TaxCalculation',     '{"primaryLabelField": "description", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    ('TaxCreditLedger',    '{"primaryLabelField": "description", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    -- Asset
    ('AssetBook',          '{"primaryLabelField": "book_type", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    ('AssetTransaction',   '{"primaryLabelField": "transaction_type", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    ('DepreciationRun',    '{"primaryLabelField": "description", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    -- Banking
    ('BankStatementLine',  '{"primaryLabelField": "description", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    ('ReconciliationSession','{"primaryLabelField": "description", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}')
) AS v(name, config)
WHERE e.name = v.name
  AND erp.entity_id = e.id
  AND erp.identity_config IS NULL;

-- ============================================================================
-- §7  LOG Entities
-- ============================================================================

UPDATE meta.entity_runtime_profile erp
SET identity_config = v.config::jsonb,
    updated_at = now()
FROM meta.entity e,
(VALUES
    ('TransactionPipeline','{"primaryLabelField": "stage", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    ('PolicyEvaluationLog','{"primaryLabelField": "rule_name", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    ('Exception',          '{"primaryLabelField": "message", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    ('OuIntentMapping',    '{"primaryLabelField": "description", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    ('AIPrediction',       '{"primaryLabelField": "prediction_type", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    ('AIAction',           '{"primaryLabelField": "action_type", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    ('AIDriftMonitor',     '{"primaryLabelField": "metric_name", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    ('RenderOutput',       '{"primaryLabelField": "file_name", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    ('RenderJob',          '{"primaryLabelField": "status", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    ('RenderDLQ',          '{"primaryLabelField": "error_message", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    ('EntityDocumentLink', '{"primaryLabelField": "link_type", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    ('DocumentACL',        '{"primaryLabelField": "permission", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    ('AttachmentAccessLog','{"primaryLabelField": "action", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    ('AttachmentComment',  '{"primaryLabelField": "comment", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    ('MultipartUpload',    '{"primaryLabelField": "file_name", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    ('WebhookEvent',       '{"primaryLabelField": "event_type", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    ('OutboxItem',         '{"primaryLabelField": "event_type", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    ('DeliveryLog',        '{"primaryLabelField": "status", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}'),
    ('JobLog',             '{"primaryLabelField": "job_type", "strategy": "uuid_v7", "autoGenerate": true, "immutableAfterCreate": true}')
) AS v(name, config)
WHERE e.name = v.name
  AND erp.entity_id = e.id
  AND erp.identity_config IS NULL;

-- ============================================================================
-- §8  Re-enable guards
-- ============================================================================

ALTER TABLE meta.entity ENABLE TRIGGER trg_class_governance_guard;
ALTER TABLE meta.entity ENABLE TRIGGER entity_evolution_guard;
ALTER TABLE meta.entity ENABLE TRIGGER entity_numbering_policy_check;

COMMIT;
