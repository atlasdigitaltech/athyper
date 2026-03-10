/* ============================================================================
   Athyper v2.1 — Meta Entity Registration
   Registers ALL business entities from ref, ent, doc, fin(→ent/doc/ref), wf(int) schemas
   into meta.entity + meta.entity_version (v1, published).

   Dependencies: meta.entity, meta.entity_version, all base schemas
   ============================================================================ */

-- Temporarily disable CLASS_GOVERNANCE_GUARD during registration.
-- entity_class is not yet populated at this stage — it defaults to 'MASTER'.
-- File 303_seed_entity_identity.sql backfills the correct entity_class afterwards.
ALTER TABLE meta.entity DISABLE TRIGGER trg_class_governance_guard;

DO $$
DECLARE
    v_tenant uuid;
BEGIN
    SELECT id INTO v_tenant FROM core.tenant ORDER BY created_at LIMIT 1;
    IF v_tenant IS NULL THEN
        RAISE NOTICE 'No tenant found — skipping meta entity registration';
        RETURN;
    END IF;

    -- ========================================================================
    -- §1  REF SCHEMA — Reference/Lookup Entities (kind='ref', governance_level='light')
    -- These are ISO-standard reference tables. Light governance: field dict + permissions.
    -- ========================================================================
    INSERT INTO meta.entity (tenant_id, module_id, name, kind, table_schema, table_name,
                            governance_level, created_by)
    VALUES
        (v_tenant, 'FND', 'Country',         'ref', 'ref', 'country',         'light', 'system'),
        (v_tenant, 'FND', 'StateRegion',      'ref', 'ref', 'state_region',    'light', 'system'),
        (v_tenant, 'FND', 'Currency',         'ref', 'ref', 'currency',        'light', 'system'),
        (v_tenant, 'FND', 'Language',         'ref', 'ref', 'language',        'light', 'system'),
        (v_tenant, 'FND', 'Locale',           'ref', 'ref', 'locale',          'light', 'system'),
        (v_tenant, 'FND', 'Timezone',         'ref', 'ref', 'timezone',        'light', 'system'),
        (v_tenant, 'FND', 'UnitOfMeasure',    'ref', 'ref', 'uom',            'light', 'system'),
        (v_tenant, 'FND', 'CommodityDomain',  'ref', 'ref', 'commodity_domain','light', 'system'),
        (v_tenant, 'FND', 'CommodityCode',    'ref', 'ref', 'commodity_code',  'light', 'system'),
        (v_tenant, 'FND', 'IndustryDomain',   'ref', 'ref', 'industry_domain', 'light', 'system'),
        (v_tenant, 'FND', 'IndustryCode',     'ref', 'ref', 'industry_code',   'light', 'system'),
        (v_tenant, 'FND', 'Label',            'ref', 'ref', 'label',           'light', 'system')
    ON CONFLICT (tenant_id, name) DO NOTHING;

    -- ========================================================================
    -- §2  ENT SCHEMA — Master Data Entities (kind='ent', governance_level='full')
    -- Core business entities with full meta governance.
    -- ========================================================================
    INSERT INTO meta.entity (tenant_id, module_id, name, kind, table_schema, table_name,
                            governance_level, created_by)
    VALUES
        (v_tenant, 'CRM',  'Customer',           'ent', 'ent', 'customer',           'full', 'system'),
        (v_tenant, 'SRM',  'Supplier',            'ent', 'ent', 'supplier',           'full', 'system'),
        (v_tenant, 'HR',   'Employee',            'ent', 'ent', 'employee',           'full', 'system'),
        (v_tenant, 'FND',  'ProductCategory',     'ent', 'ent', 'product_category',   'full', 'system'),
        (v_tenant, 'FND',  'Product',             'ent', 'ent', 'product',            'full', 'system'),
        (v_tenant, 'FND',  'EntityRelationship',  'ent', 'ent', 'entity_relationship','light', 'system')
    ON CONFLICT (tenant_id, name) DO NOTHING;

    -- ========================================================================
    -- §3  DOC SCHEMA — Document Entities (kind='doc')
    -- Business-facing document entities get full governance;
    -- infrastructure/rendering tables get audit_only.
    -- ========================================================================
    INSERT INTO meta.entity (tenant_id, module_id, name, kind, table_schema, table_name,
                            governance_level, created_by)
    VALUES
        -- Business-facing (full governance)
        (v_tenant, 'DOC', 'Attachment',       'doc', 'doc', 'attachment',        'full',  'system'),
        (v_tenant, 'DOC', 'Document',         'doc', 'doc', 'document',          'full',  'system'),
        (v_tenant, 'DOC', 'Template',         'doc', 'doc', 'template',          'full',  'system'),
        (v_tenant, 'DOC', 'TemplateVersion',  'doc', 'doc', 'template_version',  'light', 'system'),
        (v_tenant, 'DOC', 'TemplateBinding',  'doc', 'doc', 'template_binding',  'light', 'system'),
        (v_tenant, 'DOC', 'Letterhead',       'doc', 'doc', 'letterhead',        'full',  'system'),
        (v_tenant, 'DOC', 'BrandProfile',     'doc', 'doc', 'brand_profile',     'full',  'system'),
        -- Infrastructure (audit_only governance)
        (v_tenant, 'DOC', 'RenderOutput',     'doc', 'doc', 'render_output',     'audit_only', 'system'),
        (v_tenant, 'DOC', 'RenderJob',        'doc', 'doc', 'render_job',        'audit_only', 'system'),
        (v_tenant, 'DOC', 'RenderDLQ',        'doc', 'doc', 'render_dlq',        'audit_only', 'system'),
        (v_tenant, 'DOC', 'EntityDocumentLink','doc', 'doc', 'entity_document_link','audit_only', 'system'),
        (v_tenant, 'DOC', 'DocumentACL',      'doc', 'doc', 'document_acl',      'audit_only', 'system'),
        (v_tenant, 'DOC', 'AttachmentAccessLog','doc', 'doc', 'attachment_access_log','audit_only', 'system'),
        (v_tenant, 'DOC', 'AttachmentComment', 'doc', 'doc', 'attachment_comment','audit_only', 'system'),
        (v_tenant, 'DOC', 'MultipartUpload',  'doc', 'doc', 'multipart_upload',  'audit_only', 'system')
    ON CONFLICT (tenant_id, name) DO NOTHING;

    -- ========================================================================
    -- §4  FIN SCHEMA — Finance Master & Document Entities
    -- Master data → kind='ent', Documents → kind='doc', all governance_level='full'.
    -- ========================================================================
    INSERT INTO meta.entity (tenant_id, module_id, name, kind, table_schema, table_name,
                            governance_level, engine_tag, created_by)
    VALUES
        -- Posting Engine (master data → ent)
        (v_tenant, 'ACC', 'ChartOfAccounts',   'ent', 'fin', 'chart_of_accounts',  'full', 'posting-engine',    'system'),
        (v_tenant, 'ACC', 'CostCenter',        'ent', 'fin', 'cost_center',        'full', 'posting-engine',    'system'),
        (v_tenant, 'ACC', 'ProfitCenter',      'ent', 'fin', 'profit_center',      'full', 'posting-engine',    'system'),
        (v_tenant, 'ACC', 'FiscalPeriod',      'ent', 'fin', 'fiscal_period',      'full', 'posting-engine',    'system'),
        (v_tenant, 'ACC', 'AccountingProfile', 'ent', 'fin', 'accounting_profile', 'full', 'posting-engine',    'system'),
        -- Decision Grid / OU (master data → ent)
        (v_tenant, 'ACC', 'OperatingUnit',     'ent', 'fin', 'operating_unit',     'full', 'decision-grid',     'system'),
        (v_tenant, 'ACC', 'BusinessIntent',    'ent', 'fin', 'business_intent',    'full', 'decision-grid',     'system'),
        -- Budget Engine (master data → ent)
        (v_tenant, 'BUDGET', 'FundingProfile', 'ent', 'fin', 'funding_profile',    'full', 'budget-engine',     'system'),
        -- Inventory Engine (master data → ent)
        (v_tenant, 'INVENTORY', 'Warehouse',   'ent', 'fin', 'warehouse',          'full', 'inventory-engine',  'system'),
        (v_tenant, 'INVENTORY', 'ItemMaster',  'ent', 'fin', 'item_master',        'full', 'inventory-engine',  'system'),
        -- Asset Engine (master data → ent)
        (v_tenant, 'ASSET', 'Asset',           'ent', 'fin', 'asset',              'full', 'asset-engine',      'system'),
        -- Commission Engine (master data → ent)
        (v_tenant, 'ACC', 'CommissionPlan',    'ent', 'fin', 'commission_plan',    'full', 'commission-engine', 'system'),
        -- Federation Engine (master data → ent)
        (v_tenant, 'ACC', 'LegalEntity',       'ent', 'fin', 'legal_entity',       'full', 'federation-engine', 'system'),
        -- Tax Engine (master data → ent)
        (v_tenant, 'ACC', 'TaxJurisdiction',   'ent', 'fin', 'tax_jurisdiction',   'full', 'tax-engine',        'system'),
        -- Atlas AI (master data → ent)
        (v_tenant, 'ACC', 'AIModelRegistry',   'ent', 'fin', 'ai_model_registry',  'full', 'atlas-ai',          'system'),
        -- Finance Documents (lifecycle-managed transactional documents → doc)
        (v_tenant, 'ACC', 'PurchaseInvoice',       'doc', 'fin', 'purchase_invoice',   'full', 'posting-engine',    'system'),
        (v_tenant, 'ACC', 'CreditNote',            'doc', 'fin', 'credit_note',        'full', 'posting-engine',    'system'),
        (v_tenant, 'ACC', 'DebitNote',             'doc', 'fin', 'debit_note',         'full', 'posting-engine',    'system'),
        (v_tenant, 'ACC', 'ManualJournalEntry',    'doc', 'fin', 'journal_entry',      'full', 'posting-engine',    'system'),
        (v_tenant, 'ACC', 'PaymentEntry',          'doc', 'fin', 'payment_entry',      'full', 'posting-engine',    'system'),
        -- Spend Categories (master data → ent)
        (v_tenant, 'ACC', 'SpendCategory',         'ent', 'fin', 'spend_category',     'full', 'decision-grid',     'system'),
        -- Banking / Reconciliation (document → doc)
        (v_tenant, 'TREASURY', 'BankStatement',    'doc', 'fin', 'bank_statement',     'full', 'bank-reconciliation', 'system')
    ON CONFLICT (tenant_id, name) DO NOTHING;

    -- ── Set display_config for hierarchical entities ──
    UPDATE meta.entity
    SET display_config = '{"treeView":{"parentField":"parent_id","levelField":"level","isGroupField":"is_group"},"displayFields":["account_code","account_name"]}'::jsonb
    WHERE tenant_id = v_tenant AND name = 'ChartOfAccounts';

    UPDATE meta.entity
    SET display_config = '{"treeView":{"parentField":"parent_id"},"displayFields":["code","name"]}'::jsonb
    WHERE tenant_id = v_tenant AND name = 'CostCenter';

    UPDATE meta.entity
    SET display_config = '{"treeView":{"parentField":"parent_id","levelField":"level"},"displayFields":["code","name"],"sectionOverrides":{"default_cost_center_id":"finance","default_profit_center_id":"finance","default_fp_id":"finance","default_currency_code":"finance"},"sectionLabels":{"finance":"Finance Context"}}'::jsonb
    WHERE tenant_id = v_tenant AND name = 'OperatingUnit';

    UPDATE meta.entity
    SET display_config = '{"displayFields":["code","name"]}'::jsonb
    WHERE tenant_id = v_tenant AND name = 'ProfitCenter';

    -- ── Display config for finance document entities ──
    UPDATE meta.entity
    SET display_config = '{"displayFields":["invoice_number","supplier_id","total_amount","status"],"sectionOverrides":{"ou_id":"context","intent_id":"context","spend_category_id":"context","fp_id":"budget","accounting_profile_id":"accounting"},"sectionLabels":{"context":"OU & Intent","budget":"Budget","accounting":"Accounting"}}'::jsonb
    WHERE tenant_id = v_tenant AND name = 'PurchaseInvoice';

    UPDATE meta.entity
    SET display_config = '{"displayFields":["credit_note_number","supplier_id","total_amount","status"]}'::jsonb
    WHERE tenant_id = v_tenant AND name = 'CreditNote';

    UPDATE meta.entity
    SET display_config = '{"displayFields":["debit_note_number","supplier_id","total_amount","status"]}'::jsonb
    WHERE tenant_id = v_tenant AND name = 'DebitNote';

    UPDATE meta.entity
    SET display_config = '{"displayFields":["payment_number","supplier_id","total_amount","status","payment_method"]}'::jsonb
    WHERE tenant_id = v_tenant AND name = 'PaymentEntry';

    UPDATE meta.entity
    SET display_config = '{"displayFields":["je_number","doc_type","total_debit","status"]}'::jsonb
    WHERE tenant_id = v_tenant AND name = 'ManualJournalEntry';

    UPDATE meta.entity
    SET display_config = '{"treeView":{"parentField":"parent_id","levelField":"level"},"displayFields":["code","name"]}'::jsonb
    WHERE tenant_id = v_tenant AND name = 'SpendCategory';

    UPDATE meta.entity
    SET display_config = '{"displayFields":["statement_number","bank_name","statement_date","status","closing_balance"]}'::jsonb
    WHERE tenant_id = v_tenant AND name = 'BankStatement';

    -- ========================================================================
    -- §5  FIN SCHEMA — Finance Config/Rule Entities (kind='ref', governance_level='light')
    -- Setup and rule tables: field dict + permissions, no lifecycle/overlays.
    -- ========================================================================
    INSERT INTO meta.entity (tenant_id, module_id, name, kind, table_schema, table_name,
                            governance_level, engine_tag, created_by)
    VALUES
        (v_tenant, 'ACC',        'PolicyModule',           'ref', 'fin', 'policy_module',           'light', 'decision-grid',     'system'),
        (v_tenant, 'ACC',        'SmartDefaultRule',       'ref', 'fin', 'smart_default_rule',      'light', 'decision-grid',     'system'),
        (v_tenant, 'ACC',        'IntercompanyAgreement',  'ref', 'fin', 'intercompany_agreement',  'light', 'federation-engine', 'system'),
        (v_tenant, 'TREASURY',   'FxRate',                 'ref', 'fin', 'fx_rate',                 'light', 'federation-engine', 'system'),
        (v_tenant, 'ACC',        'TaxRate',                'ref', 'fin', 'tax_rate',                'light', 'tax-engine',        'system'),
        (v_tenant, 'MFG',        'BillOfMaterials',        'ref', 'fin', 'bill_of_materials',       'light', 'production-engine', 'system'),
        (v_tenant, 'MFG',        'Routing',                'ref', 'fin', 'routing',                 'light', 'production-engine', 'system'),
        (v_tenant, 'ACC',        'CommissionAssignment',   'ref', 'fin', 'commission_assignment',   'light', 'commission-engine', 'system'),
        -- Spend Category config/mapping
        (v_tenant, 'ACC',        'SpendCategoryCommodityMap', 'ref', 'fin', 'spend_category_commodity_map', 'light', 'decision-grid', 'system'),
        (v_tenant, 'ACC',        'CategoryIntentRule',        'ref', 'fin', 'category_intent_rule',         'light', 'decision-grid', 'system'),
        -- Document infrastructure
        (v_tenant, 'ACC',        'DocumentSequence',          'ref', 'fin', 'document_sequence',            'light', 'posting-engine', 'system')
    ON CONFLICT (tenant_id, name) DO NOTHING;

    -- ========================================================================
    -- §6  FIN SCHEMA — Finance Transaction/Ledger Entities (governance_level='audit_only')
    -- Immutable/append-only transaction records. Document child lines → kind='doc',
    -- all other ledger/transaction entities → kind='ent'.
    -- ========================================================================
    INSERT INTO meta.entity (tenant_id, module_id, name, kind, table_schema, table_name,
                            governance_level, engine_tag, created_by)
    VALUES
        -- GL / Posting (ledger → ent)
        (v_tenant, 'ACC',       'JournalEntry',             'ent', 'fin', 'journal_entry',             'audit_only', 'posting-engine',    'system'),
        (v_tenant, 'ACC',       'JournalLine',              'ent', 'fin', 'journal_line',              'audit_only', 'posting-engine',    'system'),
        (v_tenant, 'ACC',       'GLBalance',                'ent', 'fin', 'gl_balance',                'audit_only', 'posting-engine',    'system'),
        -- Finance Document Lines (child rows of lifecycle-managed documents → doc)
        (v_tenant, 'ACC',       'PurchaseInvoiceLine',      'doc', 'fin', 'purchase_invoice_line',     'audit_only', 'posting-engine',    'system'),
        (v_tenant, 'ACC',       'CreditNoteLine',           'doc', 'fin', 'credit_note_line',          'light',      'posting-engine',    'system'),
        (v_tenant, 'ACC',       'DebitNoteLine',            'doc', 'fin', 'debit_note_line',           'light',      'posting-engine',    'system'),
        (v_tenant, 'ACC',       'PaymentAllocation',        'doc', 'fin', 'payment_allocation',        'audit_only', 'posting-engine',    'system'),
        -- Pipeline / Decision Grid (ledger → ent)
        (v_tenant, 'ACC',       'TransactionPipeline',      'ent', 'fin', 'transaction_pipeline',      'audit_only', 'decision-grid',     'system'),
        (v_tenant, 'ACC',       'PolicyEvaluationLog',      'ent', 'fin', 'policy_evaluation_log',     'audit_only', 'decision-grid',     'system'),
        (v_tenant, 'ACC',       'Exception',                'ent', 'fin', 'exception',                 'audit_only', 'decision-grid',     'system'),
        (v_tenant, 'ACC',       'OuIntentMapping',          'ent', 'fin', 'ou_intent_mapping',         'audit_only', 'decision-grid',     'system'),
        -- Budget (ledger → ent)
        (v_tenant, 'BUDGET',    'FundingTransaction',       'ent', 'fin', 'funding_transaction',       'audit_only', 'budget-engine',     'system'),
        (v_tenant, 'BUDGET',    'FundingTransfer',          'ent', 'fin', 'funding_transfer',          'audit_only', 'budget-engine',     'system'),
        -- Commitment (ledger → ent)
        (v_tenant, 'BUY',       'Commitment',               'ent', 'fin', 'commitment',                'audit_only', 'commitment-engine', 'system'),
        (v_tenant, 'BUY',       'CommitmentSchedule',       'ent', 'fin', 'commitment_schedule',       'audit_only', 'commitment-engine', 'system'),
        (v_tenant, 'BUY',       'CommitmentFulfillment',    'ent', 'fin', 'commitment_fulfillment',    'audit_only', 'commitment-engine', 'system'),
        -- Inventory (ledger → ent)
        (v_tenant, 'INVENTORY', 'InventoryBalance',         'ent', 'fin', 'inventory_balance',         'audit_only', 'inventory-engine',  'system'),
        (v_tenant, 'INVENTORY', 'InventoryMovement',        'ent', 'fin', 'inventory_movement',        'audit_only', 'inventory-engine',  'system'),
        (v_tenant, 'INVENTORY', 'InventoryValuationLayer',  'ent', 'fin', 'inventory_valuation_layer', 'audit_only', 'inventory-engine',  'system'),
        (v_tenant, 'INVENTORY', 'Stocktake',                'ent', 'fin', 'stocktake',                 'audit_only', 'inventory-engine',  'system'),
        (v_tenant, 'INVENTORY', 'StocktakeLine',            'ent', 'fin', 'stocktake_line',            'audit_only', 'inventory-engine',  'system'),
        -- Production (ledger → ent)
        (v_tenant, 'MFG',       'BomLine',                  'ent', 'fin', 'bom_line',                  'audit_only', 'production-engine', 'system'),
        (v_tenant, 'MFG',       'WorkOrder',                'ent', 'fin', 'work_order',                'audit_only', 'production-engine', 'system'),
        (v_tenant, 'MFG',       'WorkOrderCost',            'ent', 'fin', 'work_order_cost',           'audit_only', 'production-engine', 'system'),
        (v_tenant, 'MFG',       'WorkOrderMaterialIssue',   'ent', 'fin', 'work_order_material_issue', 'audit_only', 'production-engine', 'system'),
        (v_tenant, 'MFG',       'ProductionVariance',       'ent', 'fin', 'production_variance',       'audit_only', 'production-engine', 'system'),
        -- Federation (ledger → ent)
        (v_tenant, 'ACC',       'IntercompanyTransaction',  'ent', 'fin', 'intercompany_transaction',  'audit_only', 'federation-engine', 'system'),
        (v_tenant, 'ACC',       'ConsolidationElimination', 'ent', 'fin', 'consolidation_elimination', 'audit_only', 'federation-engine', 'system'),
        (v_tenant, 'ACC',       'NettingBatch',             'ent', 'fin', 'netting_batch',             'audit_only', 'federation-engine', 'system'),
        (v_tenant, 'ACC',       'FxRevaluation',            'ent', 'fin', 'fx_revaluation',            'audit_only', 'federation-engine', 'system'),
        -- Commission (ledger → ent)
        (v_tenant, 'ACC',       'CommissionCalculation',    'ent', 'fin', 'commission_calculation',    'audit_only', 'commission-engine', 'system'),
        (v_tenant, 'ACC',       'CommissionStatement',      'ent', 'fin', 'commission_statement',      'audit_only', 'commission-engine', 'system'),
        -- Tax (ledger → ent)
        (v_tenant, 'ACC',       'TaxCalculation',           'ent', 'fin', 'tax_calculation',           'audit_only', 'tax-engine',        'system'),
        (v_tenant, 'ACC',       'TaxCreditLedger',          'ent', 'fin', 'tax_credit_ledger',         'audit_only', 'tax-engine',        'system'),
        -- Asset (ledger → ent)
        (v_tenant, 'ASSET',     'AssetBook',                'ent', 'fin', 'asset_book',                'audit_only', 'asset-engine',      'system'),
        (v_tenant, 'ASSET',     'AssetTransaction',         'ent', 'fin', 'asset_transaction',         'audit_only', 'asset-engine',      'system'),
        (v_tenant, 'ASSET',     'DepreciationRun',          'ent', 'fin', 'depreciation_run',          'audit_only', 'asset-engine',      'system'),
        -- Atlas AI (ledger → ent)
        (v_tenant, 'ACC',       'AIPrediction',             'ent', 'fin', 'ai_prediction',             'audit_only', 'atlas-ai',          'system'),
        (v_tenant, 'ACC',       'AIAction',                 'ent', 'fin', 'ai_action',                 'audit_only', 'atlas-ai',          'system'),
        (v_tenant, 'ACC',       'AIDriftMonitor',           'ent', 'fin', 'ai_drift_monitor',          'audit_only', 'atlas-ai',          'system'),
        -- Banking / Reconciliation (document lines → doc)
        (v_tenant, 'TREASURY', 'BankStatementLine',         'doc', 'fin', 'bank_statement_line',          'audit_only', 'bank-reconciliation', 'system'),
        (v_tenant, 'TREASURY', 'ReconciliationSession',     'ent', 'fin', 'reconciliation_session',       'audit_only', 'bank-reconciliation', 'system')
    ON CONFLICT (tenant_id, name) DO NOTHING;

    -- ========================================================================
    -- §7  INT SCHEMA — Integration Entities (kind='int')
    -- Integration hub: endpoints, flows, webhooks in wf schema.
    -- ========================================================================
    INSERT INTO meta.entity (tenant_id, module_id, name, kind, table_schema, table_name,
                            governance_level, created_by)
    VALUES
        -- Business-facing (light governance)
        (v_tenant, 'INT', 'IntegrationEndpoint',  'int', 'wf', 'integration_endpoint',  'light',      'system'),
        (v_tenant, 'INT', 'IntegrationFlow',       'int', 'wf', 'integration_flow',      'light',      'system'),
        (v_tenant, 'INT', 'WebhookSubscription',   'int', 'wf', 'webhook_subscription',  'light',      'system'),
        -- Infrastructure (audit_only)
        (v_tenant, 'INT', 'WebhookEvent',          'int', 'wf', 'webhook_event',         'audit_only', 'system'),
        (v_tenant, 'INT', 'OutboxItem',            'int', 'wf', 'outbox_item',           'audit_only', 'system'),
        (v_tenant, 'INT', 'DeliveryLog',           'int', 'wf', 'delivery_log',          'audit_only', 'system'),
        (v_tenant, 'INT', 'JobLog',                'int', 'wf', 'job_log',               'audit_only', 'system')
    ON CONFLICT (tenant_id, name) DO NOTHING;

    -- ========================================================================
    -- §8  Create entity_version v1 (published) for ALL registered entities
    -- ========================================================================
    INSERT INTO meta.entity_version (tenant_id, entity_id, version_no, status, label,
                                     published_at, published_by, created_by)
    SELECT e.tenant_id, e.id, 1, 'effective', 'Initial DDL registration',
           now(), 'system', 'system'
    FROM meta.entity e
    WHERE e.tenant_id = v_tenant
      AND NOT EXISTS (
          SELECT 1 FROM meta.entity_version ev
          WHERE ev.entity_id = e.id AND ev.tenant_id = v_tenant
      );

    -- ========================================================================
    -- §9  Activate all draft entities (seed entities are production-ready)
    -- ========================================================================
    UPDATE meta.entity
    SET    status = 'active',
           status_changed_at = now(),
           status_changed_by = 'system'
    WHERE  tenant_id = v_tenant
      AND  status = 'draft';

    RAISE NOTICE 'Meta entity registration complete: % entities, % versions',
        (SELECT count(*) FROM meta.entity WHERE tenant_id = v_tenant),
        (SELECT count(*) FROM meta.entity_version WHERE tenant_id = v_tenant);

END $$;

-- ============================================================================
-- Replicate to all other demo tenants
-- ============================================================================
DO $$
DECLARE
    v_source_tenant uuid;
    v_target_tenant uuid;
    v_entity_id uuid;
    v_new_entity_id uuid;
    r record;
BEGIN
    SELECT id INTO v_source_tenant FROM core.tenant ORDER BY created_at LIMIT 1;
    IF v_source_tenant IS NULL THEN RETURN; END IF;

    FOR v_target_tenant IN
        SELECT id FROM core.tenant WHERE id != v_source_tenant
    LOOP
        -- Copy entities
        FOR r IN
            SELECT module_id, name, kind, table_schema, table_name,
                   governance_level, engine_tag, naming_policy, feature_flags, display_config
            FROM meta.entity WHERE tenant_id = v_source_tenant
        LOOP
            INSERT INTO meta.entity (tenant_id, module_id, name, kind, table_schema, table_name,
                                    governance_level, engine_tag, naming_policy, feature_flags, display_config, created_by)
            VALUES (v_target_tenant, r.module_id, r.name, r.kind, r.table_schema, r.table_name,
                    r.governance_level, r.engine_tag, r.naming_policy, r.feature_flags, r.display_config, 'system')
            ON CONFLICT (tenant_id, name) DO UPDATE SET
                feature_flags  = EXCLUDED.feature_flags,
                display_config = EXCLUDED.display_config,
                engine_tag     = EXCLUDED.engine_tag;
        END LOOP;

        -- Create versions for new entities
        INSERT INTO meta.entity_version (tenant_id, entity_id, version_no, status, label,
                                         published_at, published_by, created_by)
        SELECT e.tenant_id, e.id, 1, 'effective', 'Initial DDL registration',
               now(), 'system', 'system'
        FROM meta.entity e
        WHERE e.tenant_id = v_target_tenant
          AND NOT EXISTS (
              SELECT 1 FROM meta.entity_version ev
              WHERE ev.entity_id = e.id AND ev.tenant_id = v_target_tenant
          );
    END LOOP;

    RAISE NOTICE 'Replicated meta entities to all tenants. Total: %',
        (SELECT count(*) FROM meta.entity);
END $$;

-- Re-enable CLASS_GOVERNANCE_GUARD after registration.
ALTER TABLE meta.entity ENABLE TRIGGER trg_class_governance_guard;
