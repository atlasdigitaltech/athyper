/* ============================================================================
   Athyper — Comprehensive Entity UI Profile Seed
   Seeds label_singular, label_plural, description, icon_key, and color_token
   for ALL registered entities.

   Design decisions:
     • icon_key uses Lucide icon names (kebab-case, lowercase)
     • color_token uses Tailwind semantic color tokens per entity_class:
         REFERENCE  → slate-500    (neutral, stable lookup data)
         MASTER     → blue-600     (core business identity)
         CONTROL    → amber-500    (configuration, rules)
         DOCUMENT   → teal-600     (lifecycle-managed transactional)
         LEDGER     → violet-600   (immutable financial records)
         LOG        → slate-400    (operational event streams)
     • Finance entities with engine_tag get engine-specific color variants
     • description serves admin tooltips, AI exploration, import/export bundles

   Dependencies: 065_entity_ui_profile.sql, 303_seed_entity_identity.sql
   Must run AFTER entity_class is backfilled and ui_profile rows exist.

   PostgreSQL 16+
   ============================================================================ */

BEGIN;

-- ============================================================================
-- Helper: Update entity_ui_profile by entity name (all tenants)
-- ============================================================================
-- Uses a CTE pattern to update all tenant copies of each entity.

-- ============================================================================
-- §1  REFERENCE Entities (ref schema) — slate-500
-- ============================================================================

UPDATE meta.entity_ui_profile eup
SET label_singular = v.label_singular,
    label_plural   = v.label_plural,
    description    = v.description,
    icon_key       = v.icon_key,
    color_token    = v.color_token,
    updated_at     = now()
FROM meta.entity e,
(VALUES
    ('Country',        'Country',           'Countries',          'ISO country codes and regional metadata for address validation, tax jurisdiction, and locale resolution.', 'globe', 'slate-500'),
    ('StateRegion',    'State / Region',    'States / Regions',   'Sub-national administrative divisions linked to countries for address and tax zone mapping.', 'map-pin', 'slate-500'),
    ('Currency',       'Currency',          'Currencies',         'ISO 4217 currency codes with decimal precision for multi-currency financial processing.', 'coins', 'slate-500'),
    ('Language',       'Language',          'Languages',          'ISO 639 language codes for content localization and user interface translation.', 'languages', 'slate-500'),
    ('Locale',         'Locale',            'Locales',            'Combined language + region settings for number/date formatting and content delivery.', 'globe-2', 'slate-500'),
    ('Timezone',       'Timezone',          'Timezones',          'IANA timezone identifiers for scheduling, reporting, and timestamp normalization.', 'clock', 'slate-500'),
    ('UnitOfMeasure',  'Unit of Measure',   'Units of Measure',   'Standardized measurement units (weight, volume, length) for inventory and procurement.', 'ruler', 'slate-500'),
    ('CommodityDomain','Commodity Domain',  'Commodity Domains',  'Top-level commodity classification domains for spend categorization and HS code mapping.', 'layers', 'slate-500'),
    ('CommodityCode',  'Commodity Code',    'Commodity Codes',    'Detailed commodity codes (HS/UNSPSC) for procurement analytics and customs compliance.', 'tag', 'slate-500'),
    ('IndustryDomain', 'Industry Domain',   'Industry Domains',   'Top-level industry classification domains (NAICS/ISIC) for business segmentation.', 'building-2', 'slate-500'),
    ('IndustryCode',   'Industry Code',     'Industry Codes',     'Detailed industry classification codes for regulatory reporting and market analysis.', 'barcode', 'slate-500'),
    ('Label',          'Label',             'Labels',             'Reusable text labels for dynamic UI rendering and multi-language field captions.', 'type', 'slate-500')
) AS v(name, label_singular, label_plural, description, icon_key, color_token)
WHERE e.name = v.name
  AND eup.entity_id = e.id
  AND eup.label_singular IS NULL;

-- ============================================================================
-- §2  MASTER Entities (ent schema) — blue-600
-- ============================================================================

UPDATE meta.entity_ui_profile eup
SET label_singular = v.label_singular,
    label_plural   = v.label_plural,
    description    = v.description,
    icon_key       = v.icon_key,
    color_token    = v.color_token,
    updated_at     = now()
FROM meta.entity e,
(VALUES
    ('Customer',          'Customer',           'Customers',          'Business partners who purchase goods or services. Core CRM master data with credit terms and payment profiles.', 'users', 'blue-600'),
    ('Supplier',          'Supplier',           'Suppliers',          'Business partners who provide goods or services. Core SRM master data with payment terms and banking details.', 'truck', 'blue-600'),
    ('Employee',          'Employee',           'Employees',          'Internal workforce members with HR profiles, cost center assignments, and approval authority.', 'user-check', 'blue-600'),
    ('ProductCategory',   'Product Category',   'Product Categories', 'Hierarchical product classification for catalog organization, pricing rules, and analytics.', 'folder-tree', 'blue-600'),
    ('Product',           'Product',            'Products',           'Tangible or intangible items available for sale or procurement with pricing and inventory attributes.', 'package', 'blue-600'),
    ('Attachment',        'Attachment',         'Attachments',        'File attachments linked to business documents with access control and virus scan status.', 'paperclip', 'blue-600'),
    ('Document',          'Document',           'Documents',          'Generated business documents (invoices, POs, reports) with template binding and render history.', 'file-text', 'blue-600'),
    ('Template',          'Template',           'Templates',          'Document generation templates with placeholder definitions and output format configuration.', 'layout-template', 'blue-600'),
    ('Letterhead',        'Letterhead',         'Letterheads',        'Company letterhead designs for document generation with logo, address, and branding elements.', 'stamp', 'blue-600'),
    ('BrandProfile',      'Brand Profile',      'Brand Profiles',     'Corporate branding configuration: colors, fonts, logos for consistent document output.', 'palette', 'blue-600')
) AS v(name, label_singular, label_plural, description, icon_key, color_token)
WHERE e.name = v.name
  AND eup.entity_id = e.id
  AND eup.label_singular IS NULL;

-- ============================================================================
-- §3  MASTER Entities (fin schema — engine-bound) — blue-600
-- ============================================================================

UPDATE meta.entity_ui_profile eup
SET label_singular = v.label_singular,
    label_plural   = v.label_plural,
    description    = v.description,
    icon_key       = v.icon_key,
    color_token    = v.color_token,
    updated_at     = now()
FROM meta.entity e,
(VALUES
    ('ChartOfAccounts',   'Chart of Accounts',  'Charts of Accounts', 'Hierarchical account structure defining the GL taxonomy. Tree-based with account codes and types.', 'git-branch', 'blue-600'),
    ('CostCenter',        'Cost Center',        'Cost Centers',       'Organizational cost allocation units for expense tracking and budget accountability.', 'target', 'blue-600'),
    ('ProfitCenter',      'Profit Center',      'Profit Centers',     'Revenue and margin accountability units for profitability analysis and P&L reporting.', 'trending-up', 'blue-600'),
    ('FiscalPeriod',      'Fiscal Period',       'Fiscal Periods',     'Accounting period definitions (monthly/quarterly) with open/close status for posting control.', 'calendar', 'blue-600'),
    ('AccountingProfile', 'Accounting Profile',  'Accounting Profiles','Entity-level accounting configuration: default accounts, posting rules, and GL mapping.', 'settings', 'blue-600'),
    ('OperatingUnit',     'Operating Unit',      'Operating Units',    'Business unit hierarchy for multi-entity organizations: legal entities, divisions, departments.', 'network', 'blue-600'),
    ('BusinessIntent',    'Business Intent',     'Business Intents',   'Transaction purpose classification driving smart defaults for account, cost center, and tax treatment.', 'compass', 'blue-600'),
    ('FundingProfile',    'Funding Profile',     'Funding Profiles',   'Budget allocation profiles linking cost centers to funding sources with encumbrance rules.', 'wallet', 'blue-600'),
    ('Warehouse',         'Warehouse',           'Warehouses',         'Physical or virtual storage locations for inventory management with bin/zone configuration.', 'warehouse', 'blue-600'),
    ('ItemMaster',        'Item Master',         'Item Masters',       'Inventory item definitions with UoM, costing method, reorder rules, and warehouse bindings.', 'box', 'blue-600'),
    ('Asset',             'Asset',               'Assets',             'Fixed asset master records with acquisition details, location, and depreciation configuration.', 'landmark', 'blue-600'),
    ('CommissionPlan',    'Commission Plan',     'Commission Plans',   'Sales commission calculation rules: tiers, rates, thresholds, and payout schedules.', 'percent', 'blue-600'),
    ('LegalEntity',       'Legal Entity',        'Legal Entities',     'Juridical persons in the corporate structure for intercompany transactions and consolidation.', 'building', 'blue-600'),
    ('TaxJurisdiction',   'Tax Jurisdiction',    'Tax Jurisdictions',  'Tax authority definitions with registration numbers, rates, and compliance rules.', 'scale', 'blue-600'),
    ('AIModelRegistry',   'AI Model',            'AI Models',          'Machine learning model registry for Atlas AI: version tracking, performance metrics, deployment status.', 'brain', 'blue-600'),
    ('SpendCategory',     'Spend Category',      'Spend Categories',   'Hierarchical spend classification for procurement analytics, budget allocation, and policy routing.', 'pie-chart', 'blue-600')
) AS v(name, label_singular, label_plural, description, icon_key, color_token)
WHERE e.name = v.name
  AND eup.entity_id = e.id
  AND eup.label_singular IS NULL;

-- ============================================================================
-- §4  CONTROL Entities — amber-500
-- ============================================================================

UPDATE meta.entity_ui_profile eup
SET label_singular = v.label_singular,
    label_plural   = v.label_plural,
    description    = v.description,
    icon_key       = v.icon_key,
    color_token    = v.color_token,
    updated_at     = now()
FROM meta.entity e,
(VALUES
    ('EntityRelationship', 'Entity Relationship', 'Entity Relationships', 'Meta-level relationship definitions between entities for referential integrity and navigation.', 'link', 'amber-500'),
    ('TemplateVersion',    'Template Version',    'Template Versions',    'Versioned snapshots of document templates with diff tracking and rollback capability.', 'history', 'amber-500'),
    ('TemplateBinding',    'Template Binding',    'Template Bindings',    'Configuration linking document templates to entity types and output channels.', 'plug', 'amber-500'),
    ('PolicyModule',       'Policy Module',       'Policy Modules',       'Decision grid policy bundles grouping related smart default rules for modular governance.', 'shield', 'amber-500'),
    ('SmartDefaultRule',   'Smart Default Rule',  'Smart Default Rules',  'Condition → action rules for auto-populating transaction fields based on context.', 'wand-2', 'amber-500'),
    ('IntercompanyAgreement','Intercompany Agreement','Intercompany Agreements','Transfer pricing and settlement rules between legal entities in a corporate group.', 'handshake', 'amber-500'),
    ('FxRate',             'FX Rate',             'FX Rates',             'Foreign exchange rate pairs with effective dates for multi-currency conversion.', 'arrow-left-right', 'amber-500'),
    ('TaxRate',            'Tax Rate',            'Tax Rates',            'Tax rate schedules by jurisdiction, category, and effective date range.', 'receipt', 'amber-500'),
    ('BillOfMaterials',    'Bill of Materials',   'Bills of Materials',   'Product composition definitions: component items, quantities, and assembly sequences.', 'list-tree', 'amber-500'),
    ('Routing',            'Routing',             'Routings',             'Manufacturing process sequences: work centers, operations, and standard times.', 'route', 'amber-500'),
    ('CommissionAssignment','Commission Assignment','Commission Assignments','Sales rep to commission plan bindings with territory and product scope.', 'user-plus', 'amber-500'),
    ('SpendCategoryCommodityMap','Spend Category Commodity Map','Spend Category Commodity Maps','Mapping between spend categories and commodity codes for automated classification.', 'shuffle', 'amber-500'),
    ('CategoryIntentRule', 'Category Intent Rule','Category Intent Rules', 'Rules mapping spend category + OU context to business intent for smart defaults.', 'git-merge', 'amber-500'),
    ('DocumentSequence',   'Document Sequence',   'Document Sequences',   'Number series configuration for document numbering: prefix, padding, reset policy.', 'hash', 'amber-500'),
    ('IntegrationEndpoint','Integration Endpoint','Integration Endpoints', 'External system connection definitions: URL, auth method, retry policy, rate limits.', 'plug-zap', 'amber-500'),
    ('IntegrationFlow',    'Integration Flow',    'Integration Flows',    'Data synchronization flow definitions: source, destination, mapping, schedule.', 'workflow', 'amber-500'),
    ('WebhookSubscription','Webhook Subscription','Webhook Subscriptions', 'Event-driven webhook registrations: entity events, filters, delivery endpoints.', 'webhook', 'amber-500')
) AS v(name, label_singular, label_plural, description, icon_key, color_token)
WHERE e.name = v.name
  AND eup.entity_id = e.id
  AND eup.label_singular IS NULL;

-- ============================================================================
-- §5  DOCUMENT Entities — teal-600
-- ============================================================================

UPDATE meta.entity_ui_profile eup
SET label_singular = v.label_singular,
    label_plural   = v.label_plural,
    description    = v.description,
    icon_key       = v.icon_key,
    color_token    = v.color_token,
    updated_at     = now()
FROM meta.entity e,
(VALUES
    ('PurchaseInvoice',    'Purchase Invoice',    'Purchase Invoices',    'Supplier invoices progressing through draft → submitted → approved → posted lifecycle with GL posting.', 'file-input', 'teal-600'),
    ('CreditNote',         'Credit Note',         'Credit Notes',         'Supplier credit adjustments reducing accounts payable with reversal journal entries.', 'file-minus', 'teal-600'),
    ('DebitNote',          'Debit Note',          'Debit Notes',          'Supplier debit adjustments increasing accounts payable with corresponding journal entries.', 'file-plus', 'teal-600'),
    ('ManualJournalEntry', 'Manual Journal Entry','Manual Journal Entries','Free-form GL journal entries for adjustments, accruals, and corrections with approval workflow.', 'book-open', 'teal-600'),
    ('PaymentEntry',       'Payment Entry',       'Payment Entries',      'Outgoing payment records with bank allocation, payment method, and reconciliation status.', 'credit-card', 'teal-600'),
    ('BankStatement',      'Bank Statement',      'Bank Statements',      'Imported bank statements for automated reconciliation with matching rules and exception handling.', 'landmark', 'teal-600'),
    ('Commitment',         'Commitment',          'Commitments',          'Purchase commitment records for encumbrance accounting and budget control.', 'file-lock', 'teal-600'),
    ('WorkOrder',          'Work Order',          'Work Orders',          'Manufacturing work orders tracking production progress, material issues, and cost accumulation.', 'hard-hat', 'teal-600')
) AS v(name, label_singular, label_plural, description, icon_key, color_token)
WHERE e.name = v.name
  AND eup.entity_id = e.id
  AND eup.label_singular IS NULL;

-- ============================================================================
-- §6  LEDGER Entities — violet-600
-- ============================================================================

UPDATE meta.entity_ui_profile eup
SET label_singular = v.label_singular,
    label_plural   = v.label_plural,
    description    = v.description,
    icon_key       = v.icon_key,
    color_token    = v.color_token,
    updated_at     = now()
FROM meta.entity e,
(VALUES
    -- GL / Posting
    ('JournalEntry',       'Journal Entry',       'Journal Entries',      'Immutable GL journal entry headers created by the posting engine from source documents.', 'book', 'violet-600'),
    ('JournalLine',        'Journal Line',        'Journal Lines',        'Individual debit/credit lines within a journal entry with account, amount, and dimension tags.', 'list', 'violet-600'),
    ('GLBalance',          'GL Balance',           'GL Balances',          'Period-end general ledger account balances for reporting and trial balance generation.', 'bar-chart-3', 'violet-600'),
    -- Document child lines
    ('PurchaseInvoiceLine','Invoice Line',         'Invoice Lines',        'Line items on a purchase invoice: item, quantity, unit price, tax, and GL account mapping.', 'list-ordered', 'violet-600'),
    ('CreditNoteLine',     'Credit Note Line',    'Credit Note Lines',    'Line items on a credit note with item references and reversal amounts.', 'minus-circle', 'violet-600'),
    ('DebitNoteLine',      'Debit Note Line',     'Debit Note Lines',     'Line items on a debit note with item references and adjustment amounts.', 'plus-circle', 'violet-600'),
    ('PaymentAllocation',  'Payment Allocation',  'Payment Allocations',  'Invoice-to-payment matching records for accounts payable settlement tracking.', 'split', 'violet-600'),
    -- Budget
    ('FundingTransaction', 'Funding Transaction', 'Funding Transactions', 'Budget consumption records: encumbrances, expenditures, and releases against funding profiles.', 'arrow-down-to-line', 'violet-600'),
    ('FundingTransfer',    'Funding Transfer',    'Funding Transfers',    'Budget reallocation records transferring funds between cost centers or budget lines.', 'arrow-right-left', 'violet-600'),
    -- Commitment
    ('CommitmentSchedule', 'Commitment Schedule', 'Commitment Schedules', 'Time-phased commitment delivery schedules for encumbrance forecasting.', 'calendar-clock', 'violet-600'),
    ('CommitmentFulfillment','Commitment Fulfillment','Commitment Fulfillments','Records of commitment discharge via invoice receipt or goods receipt.', 'check-circle', 'violet-600'),
    -- Inventory
    ('InventoryBalance',   'Inventory Balance',   'Inventory Balances',   'Current on-hand inventory quantities and valuations by warehouse, bin, and lot.', 'database', 'violet-600'),
    ('InventoryMovement',  'Inventory Movement',  'Inventory Movements',  'Stock movement records: receipts, issues, transfers, and adjustments with valuation impact.', 'move', 'violet-600'),
    ('InventoryValuationLayer','Valuation Layer', 'Valuation Layers',    'FIFO/LIFO/weighted-average cost layers for inventory valuation and COGS calculation.', 'layers', 'violet-600'),
    ('Stocktake',          'Stocktake',           'Stocktakes',           'Physical inventory count sessions with variance analysis and adjustment posting.', 'clipboard-check', 'violet-600'),
    ('StocktakeLine',      'Stocktake Line',      'Stocktake Lines',      'Individual item count lines within a stocktake: expected vs. counted quantities.', 'clipboard-list', 'violet-600'),
    -- Production
    ('BomLine',            'BOM Line',            'BOM Lines',            'Component lines within a bill of materials: item, quantity per unit, scrap factor.', 'list-tree', 'violet-600'),
    ('WorkOrderCost',      'Work Order Cost',     'Work Order Costs',     'Accumulated production costs: material, labor, overhead allocated to a work order.', 'calculator', 'violet-600'),
    ('WorkOrderMaterialIssue','Material Issue',   'Material Issues',      'Raw material issue records from warehouse to production floor for work orders.', 'package-minus', 'violet-600'),
    ('ProductionVariance', 'Production Variance', 'Production Variances', 'Standard vs. actual cost variance records for manufacturing cost analysis.', 'diff', 'violet-600'),
    -- Federation / Intercompany
    ('IntercompanyTransaction','Intercompany Transaction','Intercompany Transactions','Cross-entity transactions requiring elimination entries in consolidated reporting.', 'arrow-left-right', 'violet-600'),
    ('ConsolidationElimination','Consolidation Elimination','Consolidation Eliminations','Elimination journal entries generated during group consolidation processes.', 'x-circle', 'violet-600'),
    ('NettingBatch',       'Netting Batch',       'Netting Batches',      'Intercompany netting cycles reducing gross settlement to net positions.', 'minimize-2', 'violet-600'),
    ('FxRevaluation',      'FX Revaluation',      'FX Revaluations',      'Foreign currency revaluation entries for period-end balance sheet translation.', 'refresh-cw', 'violet-600'),
    -- Commission
    ('CommissionCalculation','Commission Calculation','Commission Calculations','Computed commission amounts per sales rep based on plan rules and transaction data.', 'calculator', 'violet-600'),
    ('CommissionStatement','Commission Statement', 'Commission Statements','Period-end commission payout statements aggregating calculations for settlement.', 'file-spreadsheet', 'violet-600'),
    -- Tax
    ('TaxCalculation',     'Tax Calculation',     'Tax Calculations',     'Computed tax amounts per transaction line with jurisdiction, rate, and base amount detail.', 'calculator', 'violet-600'),
    ('TaxCreditLedger',    'Tax Credit Ledger',   'Tax Credit Ledgers',   'Input tax credit accumulation ledger for VAT/GST recovery and compliance reporting.', 'receipt', 'violet-600'),
    -- Asset
    ('AssetBook',          'Asset Book',          'Asset Books',          'Depreciation book records per asset: method, useful life, salvage value, accumulated depreciation.', 'book-copy', 'violet-600'),
    ('AssetTransaction',   'Asset Transaction',   'Asset Transactions',   'Asset lifecycle events: acquisition, disposal, revaluation, transfer, and impairment.', 'repeat', 'violet-600'),
    ('DepreciationRun',    'Depreciation Run',    'Depreciation Runs',    'Periodic depreciation batch processing records with journal entry generation.', 'timer', 'violet-600'),
    -- Banking
    ('BankStatementLine',  'Statement Line',      'Statement Lines',      'Individual bank statement transactions for matching against system payments and receipts.', 'list', 'violet-600'),
    ('ReconciliationSession','Reconciliation Session','Reconciliation Sessions','Bank reconciliation session records tracking matching progress and exceptions.', 'check-square', 'violet-600')
) AS v(name, label_singular, label_plural, description, icon_key, color_token)
WHERE e.name = v.name
  AND eup.entity_id = e.id
  AND eup.label_singular IS NULL;

-- ============================================================================
-- §7  LOG Entities — slate-400
-- ============================================================================

UPDATE meta.entity_ui_profile eup
SET label_singular = v.label_singular,
    label_plural   = v.label_plural,
    description    = v.description,
    icon_key       = v.icon_key,
    color_token    = v.color_token,
    updated_at     = now()
FROM meta.entity e,
(VALUES
    -- Decision Grid / Pipeline
    ('TransactionPipeline','Transaction Pipeline','Transaction Pipelines','Audit trail of transactions flowing through the decision grid pipeline stages.', 'git-commit', 'slate-400'),
    ('PolicyEvaluationLog','Policy Evaluation Log','Policy Evaluation Logs','Detailed log of policy rule evaluations with match results and applied defaults.', 'clipboard-list', 'slate-400'),
    ('Exception',          'Exception',           'Exceptions',           'Business rule violation records requiring human review or automated resolution.', 'alert-triangle', 'slate-400'),
    ('OuIntentMapping',    'OU Intent Mapping',   'OU Intent Mappings',   'Resolved mappings between operating units and business intents for transaction routing.', 'map', 'slate-400'),
    -- Atlas AI
    ('AIPrediction',       'AI Prediction',       'AI Predictions',       'Machine learning model prediction outputs with confidence scores and feature importance.', 'sparkles', 'slate-400'),
    ('AIAction',           'AI Action',           'AI Actions',           'AI-initiated actions (auto-categorization, anomaly flags) with human override tracking.', 'zap', 'slate-400'),
    ('AIDriftMonitor',     'AI Drift Monitor',    'AI Drift Monitors',    'Model performance drift detection records triggering retraining or alerting.', 'activity', 'slate-400'),
    -- Document rendering
    ('RenderOutput',       'Render Output',       'Render Outputs',       'Generated document output files (PDF, DOCX) with storage location and checksum.', 'file-output', 'slate-400'),
    ('RenderJob',          'Render Job',          'Render Jobs',          'Asynchronous document rendering job queue entries with status and retry tracking.', 'loader', 'slate-400'),
    ('RenderDLQ',          'Render DLQ',          'Render DLQ Entries',   'Dead letter queue for failed document rendering jobs awaiting manual intervention.', 'alert-octagon', 'slate-400'),
    ('EntityDocumentLink', 'Entity Document Link','Entity Document Links', 'Cross-reference links between business entities and their generated documents.', 'link-2', 'slate-400'),
    ('DocumentACL',        'Document ACL',        'Document ACLs',        'Access control list entries governing document visibility per user, role, or group.', 'shield', 'slate-400'),
    ('AttachmentAccessLog','Attachment Access Log','Attachment Access Logs','Audit log of attachment download and preview events for compliance tracking.', 'eye', 'slate-400'),
    ('AttachmentComment',  'Attachment Comment',  'Attachment Comments',  'User comments and annotations attached to file attachments.', 'message-square', 'slate-400'),
    ('MultipartUpload',    'Multipart Upload',    'Multipart Uploads',    'Chunked file upload session tracking for large attachment handling.', 'upload', 'slate-400'),
    -- Integration
    ('WebhookEvent',       'Webhook Event',       'Webhook Events',       'Inbound webhook event payloads received from external systems for processing.', 'webhook', 'slate-400'),
    ('OutboxItem',         'Outbox Item',         'Outbox Items',         'Transactional outbox entries ensuring at-least-once delivery of integration events.', 'send', 'slate-400'),
    ('DeliveryLog',        'Delivery Log',        'Delivery Logs',        'HTTP delivery attempt records for outbound webhooks and integration callbacks.', 'truck', 'slate-400'),
    ('JobLog',             'Job Log',             'Job Logs',             'Background job execution records: queue, status, duration, error details.', 'terminal', 'slate-400')
) AS v(name, label_singular, label_plural, description, icon_key, color_token)
WHERE e.name = v.name
  AND eup.entity_id = e.id
  AND eup.label_singular IS NULL;

-- ============================================================================
-- §8  Dual-write sync note
-- ============================================================================
-- The sync_entity_ui_to_legacy trigger fires on UPDATE, pushing changes
-- back to meta.entity legacy columns automatically. No extra action needed.

COMMIT;
