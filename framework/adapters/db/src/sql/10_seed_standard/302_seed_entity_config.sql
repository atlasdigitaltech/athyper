/* ============================================================================
   Athyper — Entity Short Codes + Operation Capabilities
   Sets entity_short codes and seeds system-default entity operation capabilities.
   Must run AFTER 300_meta_entity_registration.sql (needs meta.entity rows).

   PostgreSQL 16+
   Depends on: 300_meta_entity_registration.sql
   ============================================================================ */

begin;

-- ============================================================================
-- §23  Entity Short Codes (for command palette TCODE aliases)
-- ============================================================================
-- Set entity_short on all meta.entity rows (all tenants) where not yet set.
-- These short codes generate memorable aliases like NEW PO, APPROVE INV.

UPDATE meta.entity SET entity_short = 'CUST'    WHERE name = 'Customer'         AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'SUPP'    WHERE name = 'Supplier'          AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'EMP'     WHERE name = 'Employee'          AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'PROD'    WHERE name = 'Product'           AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'PCAT'    WHERE name = 'ProductCategory'   AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'ATT'     WHERE name = 'Attachment'        AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'DOC'     WHERE name = 'Document'          AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'TMPL'    WHERE name = 'Template'          AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'LH'      WHERE name = 'Letterhead'        AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'BP'      WHERE name = 'BrandProfile'      AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'COA'     WHERE name = 'ChartOfAccounts'   AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'CC'      WHERE name = 'CostCenter'        AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'PC'      WHERE name = 'ProfitCenter'      AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'FP'      WHERE name = 'FiscalPeriod'      AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'OU'      WHERE name = 'OperatingUnit'     AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'BI'      WHERE name = 'BusinessIntent'    AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'WH'      WHERE name = 'Warehouse'         AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'ITEM'    WHERE name = 'ItemMaster'        AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'ASSET'   WHERE name = 'Asset'             AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'LE'      WHERE name = 'LegalEntity'       AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'JE'      WHERE name = 'JournalEntry'      AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'BOM'     WHERE name = 'BillOfMaterials'   AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'RTG'     WHERE name = 'Routing'           AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'WO'      WHERE name = 'WorkOrder'         AND entity_short IS NULL;

-- REF entities
UPDATE meta.entity SET entity_short = 'CTRY'  WHERE name = 'Country'               AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'SREG'  WHERE name = 'StateRegion'            AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'CUR'   WHERE name = 'Currency'              AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'LANG'  WHERE name = 'Language'              AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'LOC'   WHERE name = 'Locale'               AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'TZ'    WHERE name = 'Timezone'              AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'UOM'   WHERE name = 'UnitOfMeasure'         AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'CDOM'  WHERE name = 'CommodityDomain'       AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'CCOD'  WHERE name = 'CommodityCode'         AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'IDOM'  WHERE name = 'IndustryDomain'        AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'ICOD'  WHERE name = 'IndustryCode'          AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'LBL'   WHERE name = 'Label'                AND entity_short IS NULL;

-- ENT entities
UPDATE meta.entity SET entity_short = 'EREL'  WHERE name = 'EntityRelationship'    AND entity_short IS NULL;

-- DOC entities
UPDATE meta.entity SET entity_short = 'TVER'  WHERE name = 'TemplateVersion'       AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'TBND'  WHERE name = 'TemplateBinding'       AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'ROUT'  WHERE name = 'RenderOutput'          AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'RJOB'  WHERE name = 'RenderJob'             AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'RDLQ'  WHERE name = 'RenderDLQ'             AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'EDLK'  WHERE name = 'EntityDocumentLink'    AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'DACL'  WHERE name = 'DocumentACL'           AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'AALG'  WHERE name = 'AttachmentAccessLog'   AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'ACMT'  WHERE name = 'AttachmentComment'     AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'MUPL'  WHERE name = 'MultipartUpload'       AND entity_short IS NULL;

-- FIN Master entities
UPDATE meta.entity SET entity_short = 'APRF'  WHERE name = 'AccountingProfile'     AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'FPRF'  WHERE name = 'FundingProfile'        AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'CPLN'  WHERE name = 'CommissionPlan'        AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'TJUR'  WHERE name = 'TaxJurisdiction'       AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'AIMR'  WHERE name = 'AIModelRegistry'       AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'PMOD'  WHERE name = 'PolicyModule'          AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'SDRL'  WHERE name = 'SmartDefaultRule'      AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'ICAG'  WHERE name = 'IntercompanyAgreement' AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'FXR'   WHERE name = 'FxRate'               AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'TXRT'  WHERE name = 'TaxRate'              AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'CASN'  WHERE name = 'CommissionAssignment'  AND entity_short IS NULL;

-- FIN Document entities (full governance — lifecycle-managed)
UPDATE meta.entity SET entity_short = 'PINV'  WHERE name = 'PurchaseNonPoInvoice'  AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'MJE'   WHERE name = 'ManualJournalEntry'    AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'PAY'   WHERE name = 'PaymentEntry'          AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'BSTM'  WHERE name = 'BankStatement'         AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'SCAT'  WHERE name = 'SpendCategory'         AND entity_short IS NULL;

-- FIN Config entities (light governance — document infrastructure)
UPDATE meta.entity SET entity_short = 'SCMAP' WHERE name = 'SpendCategoryCommodityMap' AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'CIRL'  WHERE name = 'CategoryIntentRule'    AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'DSEQ'  WHERE name = 'DocumentSequence'      AND entity_short IS NULL;

-- FIN Document child entities (audit_only)
UPDATE meta.entity SET entity_short = 'PINVL' WHERE name = 'PurchaseInvoiceLine'   AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'PALL'  WHERE name = 'PaymentAllocation'     AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'BSLN'  WHERE name = 'BankStatementLine'     AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'RSES'  WHERE name = 'ReconciliationSession' AND entity_short IS NULL;

-- FIN Transaction entities
UPDATE meta.entity SET entity_short = 'JL'    WHERE name = 'JournalLine'           AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'GLB'   WHERE name = 'GLBalance'             AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'TPIP'  WHERE name = 'TransactionPipeline'   AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'PELG'  WHERE name = 'PolicyEvaluationLog'   AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'EXCN'  WHERE name = 'Exception'             AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'OUIM'  WHERE name = 'OuIntentMapping'       AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'FTRX'  WHERE name = 'FundingTransaction'    AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'FTRF'  WHERE name = 'FundingTransfer'       AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'CMMT'  WHERE name = 'Commitment'            AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'CSCH'  WHERE name = 'CommitmentSchedule'    AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'CFUL'  WHERE name = 'CommitmentFulfillment' AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'IBAL'  WHERE name = 'InventoryBalance'      AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'IMOV'  WHERE name = 'InventoryMovement'     AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'IVAL'  WHERE name = 'InventoryValuationLayer' AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'STKC'  WHERE name = 'Stocktake'             AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'STKL'  WHERE name = 'StocktakeLine'         AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'BOML'  WHERE name = 'BomLine'               AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'WOCL'  WHERE name = 'WorkOrderCost'         AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'WOMI'  WHERE name = 'WorkOrderMaterialIssue' AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'PVAR'  WHERE name = 'ProductionVariance'    AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'ICTR'  WHERE name = 'IntercompanyTransaction' AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'CELM'  WHERE name = 'ConsolidationElimination' AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'NETB'  WHERE name = 'NettingBatch'          AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'FXRV'  WHERE name = 'FxRevaluation'         AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'CCAL'  WHERE name = 'CommissionCalculation'  AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'CSTM'  WHERE name = 'CommissionStatement'   AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'TXCL'  WHERE name = 'TaxCalculation'        AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'TXCR'  WHERE name = 'TaxCreditLedger'       AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'ABKL'  WHERE name = 'AssetBook'             AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'ATRX'  WHERE name = 'AssetTransaction'      AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'DRUN'  WHERE name = 'DepreciationRun'       AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'AIPD'  WHERE name = 'AIPrediction'          AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'AIAC'  WHERE name = 'AIAction'              AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'AIDM'  WHERE name = 'AIDriftMonitor'        AND entity_short IS NULL;

-- INT entities
UPDATE meta.entity SET entity_short = 'IEPT'  WHERE name = 'IntegrationEndpoint'   AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'IFLW'  WHERE name = 'IntegrationFlow'       AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'WHSB'  WHERE name = 'WebhookSubscription'   AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'WHEV'  WHERE name = 'WebhookEvent'          AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'OBOX'  WHERE name = 'OutboxItem'            AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'DLVL'  WHERE name = 'DeliveryLog'           AND entity_short IS NULL;
UPDATE meta.entity SET entity_short = 'JLOG'  WHERE name = 'JobLog'                AND entity_short IS NULL;

-- ============================================================================
-- §24  Entity Operation Capabilities (system defaults, tenant_id = NULL)
-- ============================================================================
-- These are system-level defaults applied to all tenants via the overlay view.
-- Tenants can override any row by inserting into meta.entity_operation with their tenant_id.

-- Helper: seed a single entity operation capability (system default)
CREATE OR REPLACE FUNCTION pg_temp.seed_entity_op(
  p_entity_name text,
  p_op_code     text,
  p_surface     text DEFAULT 'BOTH',
  p_placement   text DEFAULT 'TOOLBAR',
  p_handler     text DEFAULT 'API',
  p_target      text DEFAULT NULL,
  p_req_record  boolean DEFAULT false,
  p_sort        int DEFAULT 0,
  p_label       text DEFAULT NULL,
  p_tcode       text DEFAULT NULL
) RETURNS void AS $$
BEGIN
  INSERT INTO meta.entity_operation
    (tenant_id, entity_name, operation_code, surface, placement,
     handler_type, handler_target, requires_record, sort_order,
     label_override, tcode_alias, created_by)
  VALUES
    (NULL, p_entity_name, p_op_code, p_surface, p_placement,
     p_handler, p_target, p_req_record, p_sort,
     p_label, p_tcode, 'system')
  ON CONFLICT (entity_name, operation_code) WHERE tenant_id IS NULL DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Master Data Entities: Customer, Supplier, Employee, Product
-- Pattern: full CRUD + print/export, no workflow ops
-- ============================================================================

-- Customer
SELECT pg_temp.seed_entity_op('Customer', 'create',  'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Customer');
SELECT pg_temp.seed_entity_op('Customer', 'read',    'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('Customer', 'update',  'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('Customer', 'delete',  'DETAIL', 'OVERFLOW', 'API',      NULL, true,  4);
SELECT pg_temp.seed_entity_op('Customer', 'print',   'DETAIL', 'TOOLBAR',  'MODAL',    'print_dialog', true, 5);
SELECT pg_temp.seed_entity_op('Customer', 'export',  'LIST',   'TOOLBAR',  'API',      NULL, false, 6);
SELECT pg_temp.seed_entity_op('Customer', 'import',  'LIST',   'TOOLBAR',  'MODAL',    'import_dialog', false, 7);
SELECT pg_temp.seed_entity_op('Customer', 'copy',    'DETAIL', 'OVERFLOW', 'API',      NULL, true,  8);

-- Supplier
SELECT pg_temp.seed_entity_op('Supplier', 'create',  'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Supplier');
SELECT pg_temp.seed_entity_op('Supplier', 'read',    'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('Supplier', 'update',  'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('Supplier', 'delete',  'DETAIL', 'OVERFLOW', 'API',      NULL, true,  4);
SELECT pg_temp.seed_entity_op('Supplier', 'print',   'DETAIL', 'TOOLBAR',  'MODAL',    'print_dialog', true, 5);
SELECT pg_temp.seed_entity_op('Supplier', 'export',  'LIST',   'TOOLBAR',  'API',      NULL, false, 6);
SELECT pg_temp.seed_entity_op('Supplier', 'import',  'LIST',   'TOOLBAR',  'MODAL',    'import_dialog', false, 7);

-- Employee
SELECT pg_temp.seed_entity_op('Employee', 'create',  'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Employee');
SELECT pg_temp.seed_entity_op('Employee', 'read',    'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('Employee', 'update',  'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('Employee', 'print',   'DETAIL', 'TOOLBAR',  'MODAL',    'print_dialog', true, 4);
SELECT pg_temp.seed_entity_op('Employee', 'export',  'LIST',   'TOOLBAR',  'API',      NULL, false, 5);

-- Product
SELECT pg_temp.seed_entity_op('Product', 'create',  'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Product');
SELECT pg_temp.seed_entity_op('Product', 'read',    'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('Product', 'update',  'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('Product', 'delete',  'DETAIL', 'OVERFLOW', 'API',      NULL, true,  4);
SELECT pg_temp.seed_entity_op('Product', 'export',  'LIST',   'TOOLBAR',  'API',      NULL, false, 5);
SELECT pg_temp.seed_entity_op('Product', 'import',  'LIST',   'TOOLBAR',  'MODAL',    'import_dialog', false, 6);
SELECT pg_temp.seed_entity_op('Product', 'copy',    'DETAIL', 'OVERFLOW', 'API',      NULL, true,  7);

-- ItemMaster
SELECT pg_temp.seed_entity_op('ItemMaster', 'create',  'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Item');
SELECT pg_temp.seed_entity_op('ItemMaster', 'read',    'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('ItemMaster', 'update',  'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('ItemMaster', 'delete',  'DETAIL', 'OVERFLOW', 'API',      NULL, true,  4);
SELECT pg_temp.seed_entity_op('ItemMaster', 'export',  'LIST',   'TOOLBAR',  'API',      NULL, false, 5);
SELECT pg_temp.seed_entity_op('ItemMaster', 'import',  'LIST',   'TOOLBAR',  'MODAL',    'import_dialog', false, 6);

-- ============================================================================
-- Finance Master Data: ChartOfAccounts, CostCenter, ProfitCenter, Warehouse
-- Pattern: CRUD + export/import, some with approval workflows
-- ============================================================================

SELECT pg_temp.seed_entity_op('ChartOfAccounts', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Account');
SELECT pg_temp.seed_entity_op('ChartOfAccounts', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('ChartOfAccounts', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('ChartOfAccounts', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 4);
SELECT pg_temp.seed_entity_op('ChartOfAccounts', 'import', 'LIST',   'TOOLBAR',  'MODAL',    'import_dialog', false, 5);

SELECT pg_temp.seed_entity_op('CostCenter', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Cost Center');
SELECT pg_temp.seed_entity_op('CostCenter', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('CostCenter', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('CostCenter', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 4);

SELECT pg_temp.seed_entity_op('Warehouse', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Warehouse');
SELECT pg_temp.seed_entity_op('Warehouse', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('Warehouse', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('Warehouse', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 4);

-- ============================================================================
-- Transaction Entities: JournalEntry (audit_only), WorkOrder
-- Pattern: JournalEntry = read-only audit view; WorkOrder = full lifecycle
-- ============================================================================

SELECT pg_temp.seed_entity_op('JournalEntry', 'read',   'DETAIL',       'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('JournalEntry', 'export', 'LIST',         'TOOLBAR', 'API',      NULL, false, 2);
SELECT pg_temp.seed_entity_op('JournalEntry', 'print',  'DETAIL',       'TOOLBAR', 'MODAL',    'print_dialog', true, 3);

SELECT pg_temp.seed_entity_op('WorkOrder', 'create',       'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Work Order');
SELECT pg_temp.seed_entity_op('WorkOrder', 'read',         'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('WorkOrder', 'update',       'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('WorkOrder', 'submit',       'DETAIL', 'PRIMARY',  'API',      NULL, true,  4, 'Submit WO');
SELECT pg_temp.seed_entity_op('WorkOrder', 'approve',      'DETAIL', 'PRIMARY',  'API',      NULL, true,  5, 'Approve WO');
SELECT pg_temp.seed_entity_op('WorkOrder', 'deny',         'DETAIL', 'PRIMARY',  'API',      NULL, true,  6, 'Reject WO');
SELECT pg_temp.seed_entity_op('WorkOrder', 'cancel',       'DETAIL', 'OVERFLOW', 'API',      NULL, true,  7);
SELECT pg_temp.seed_entity_op('WorkOrder', 'close',        'DETAIL', 'OVERFLOW', 'API',      NULL, true,  8);
SELECT pg_temp.seed_entity_op('WorkOrder', 'print',        'BOTH',   'TOOLBAR',  'MODAL',    'print_dialog', true, 9);
SELECT pg_temp.seed_entity_op('WorkOrder', 'export',       'LIST',   'TOOLBAR',  'API',      NULL, false, 10);

-- ============================================================================
-- Finance Document Entities (v2.2): PurchaseNonPoInvoice, ManualJournalEntry,
--   PaymentEntry, BankStatement
-- Pattern: full lifecycle with approval workflows + post/reverse/reconcile ops
-- ============================================================================

-- PurchaseNonPoInvoice (DRAFT → SUBMITTED → APPROVED → POSTED → PAID)
SELECT pg_temp.seed_entity_op('PurchaseNonPoInvoice', 'create',  'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1,  'New Invoice');
SELECT pg_temp.seed_entity_op('PurchaseNonPoInvoice', 'read',    'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('PurchaseNonPoInvoice', 'update',  'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('PurchaseNonPoInvoice', 'submit',  'DETAIL', 'PRIMARY',  'API',      NULL, true,  4,  'Submit Invoice');
SELECT pg_temp.seed_entity_op('PurchaseNonPoInvoice', 'approve', 'DETAIL', 'PRIMARY',  'API',      NULL, true,  5,  'Approve Invoice');
SELECT pg_temp.seed_entity_op('PurchaseNonPoInvoice', 'deny',    'DETAIL', 'PRIMARY',  'API',      NULL, true,  6,  'Reject Invoice');
SELECT pg_temp.seed_entity_op('PurchaseNonPoInvoice', 'post',    'DETAIL', 'PRIMARY',  'API',      NULL, true,  7,  'Post Invoice');
SELECT pg_temp.seed_entity_op('PurchaseNonPoInvoice', 'cancel',  'DETAIL', 'OVERFLOW', 'API',      NULL, true,  8);
SELECT pg_temp.seed_entity_op('PurchaseNonPoInvoice', 'print',   'DETAIL', 'TOOLBAR',  'MODAL',    'print_dialog', true, 9);
SELECT pg_temp.seed_entity_op('PurchaseNonPoInvoice', 'export',  'LIST',   'TOOLBAR',  'API',      NULL, false, 10);

-- ManualJournalEntry (CREATED → POSTED → REVERSED)
SELECT pg_temp.seed_entity_op('ManualJournalEntry', 'create',  'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1,  'New Manual JE');
SELECT pg_temp.seed_entity_op('ManualJournalEntry', 'read',    'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('ManualJournalEntry', 'submit',  'DETAIL', 'PRIMARY',  'API',      NULL, true,  3,  'Submit JE');
SELECT pg_temp.seed_entity_op('ManualJournalEntry', 'post',    'DETAIL', 'PRIMARY',  'API',      NULL, true,  4,  'Post JE');
SELECT pg_temp.seed_entity_op('ManualJournalEntry', 'reverse', 'DETAIL', 'OVERFLOW', 'API',      NULL, true,  5,  'Reverse JE');
SELECT pg_temp.seed_entity_op('ManualJournalEntry', 'print',   'DETAIL', 'TOOLBAR',  'MODAL',    'print_dialog', true, 6);
SELECT pg_temp.seed_entity_op('ManualJournalEntry', 'export',  'LIST',   'TOOLBAR',  'API',      NULL, false, 7);

-- PaymentEntry (DRAFT → SUBMITTED → APPROVED → POSTED → RECONCILED)
SELECT pg_temp.seed_entity_op('PaymentEntry', 'create',    'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1,  'New Payment');
SELECT pg_temp.seed_entity_op('PaymentEntry', 'read',      'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('PaymentEntry', 'update',    'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('PaymentEntry', 'submit',    'DETAIL', 'PRIMARY',  'API',      NULL, true,  4,  'Submit Payment');
SELECT pg_temp.seed_entity_op('PaymentEntry', 'approve',   'DETAIL', 'PRIMARY',  'API',      NULL, true,  5,  'Approve Payment');
SELECT pg_temp.seed_entity_op('PaymentEntry', 'deny',      'DETAIL', 'PRIMARY',  'API',      NULL, true,  6,  'Reject Payment');
SELECT pg_temp.seed_entity_op('PaymentEntry', 'post',      'DETAIL', 'PRIMARY',  'API',      NULL, true,  7,  'Post Payment');
SELECT pg_temp.seed_entity_op('PaymentEntry', 'cancel',    'DETAIL', 'OVERFLOW', 'API',      NULL, true,  8);
SELECT pg_temp.seed_entity_op('PaymentEntry', 'reconcile', 'DETAIL', 'TOOLBAR',  'API',      NULL, true,  9,  'Reconcile');
SELECT pg_temp.seed_entity_op('PaymentEntry', 'print',     'BOTH',   'TOOLBAR',  'MODAL',    'print_dialog', true, 10);
SELECT pg_temp.seed_entity_op('PaymentEntry', 'export',    'LIST',   'TOOLBAR',  'API',      NULL, false, 11);

-- BankStatement (IMPORTED → IN_PROGRESS → COMPLETED)
SELECT pg_temp.seed_entity_op('BankStatement', 'create', 'LIST',   'PRIMARY',  'MODAL',    'import_dialog', false, 1, 'Import Statement');
SELECT pg_temp.seed_entity_op('BankStatement', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('BankStatement', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 3);

-- SpendCategory (full governance, hierarchical)
SELECT pg_temp.seed_entity_op('SpendCategory', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Spend Category');
SELECT pg_temp.seed_entity_op('SpendCategory', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('SpendCategory', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('SpendCategory', 'delete', 'DETAIL', 'OVERFLOW', 'API',      NULL, true,  4);
SELECT pg_temp.seed_entity_op('SpendCategory', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 5);
SELECT pg_temp.seed_entity_op('SpendCategory', 'import', 'LIST',   'TOOLBAR',  'MODAL',    'import_dialog', false, 6);

-- ============================================================================
-- Document Entities: Template, Attachment, Letterhead
-- Pattern: CRUD ops for config-type entities
-- ============================================================================

SELECT pg_temp.seed_entity_op('Template', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Template');
SELECT pg_temp.seed_entity_op('Template', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('Template', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('Template', 'delete', 'DETAIL', 'OVERFLOW', 'API',      NULL, true,  4);
SELECT pg_temp.seed_entity_op('Template', 'copy',   'DETAIL', 'OVERFLOW', 'API',      NULL, true,  5, 'Duplicate Template');

SELECT pg_temp.seed_entity_op('Attachment', 'create', 'LIST',   'PRIMARY', 'MODAL', 'upload_dialog', false, 1, 'Upload');
SELECT pg_temp.seed_entity_op('Attachment', 'read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('Attachment', 'delete', 'DETAIL', 'OVERFLOW','API',      NULL, true,  3);

SELECT pg_temp.seed_entity_op('Letterhead', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Letterhead');
SELECT pg_temp.seed_entity_op('Letterhead', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('Letterhead', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('Letterhead', 'delete', 'DETAIL', 'OVERFLOW', 'API',      NULL, true,  4);

-- ============================================================================
-- Asset Entity: full lifecycle with approvals
-- ============================================================================

SELECT pg_temp.seed_entity_op('Asset', 'create',       'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Asset');
SELECT pg_temp.seed_entity_op('Asset', 'read',         'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('Asset', 'update',       'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('Asset', 'submit',       'DETAIL', 'PRIMARY',  'API',      NULL, true,  4, 'Submit Asset');
SELECT pg_temp.seed_entity_op('Asset', 'approve',      'DETAIL', 'PRIMARY',  'API',      NULL, true,  5, 'Approve Asset');
SELECT pg_temp.seed_entity_op('Asset', 'deny',         'DETAIL', 'PRIMARY',  'API',      NULL, true,  6, 'Reject Asset');
SELECT pg_temp.seed_entity_op('Asset', 'delete_draft', 'DETAIL', 'OVERFLOW', 'API',      NULL, true,  7);
SELECT pg_temp.seed_entity_op('Asset', 'print',        'DETAIL', 'TOOLBAR',  'MODAL',    'print_dialog', true, 8);
SELECT pg_temp.seed_entity_op('Asset', 'export',       'LIST',   'TOOLBAR',  'API',      NULL, false, 9);

-- ============================================================================
-- REF Entities: Country, StateRegion, Currency, Language, Locale, Timezone,
--               UnitOfMeasure, CommodityDomain, CommodityCode,
--               IndustryDomain, IndustryCode, Label
-- Pattern: light CRUD (create, read, update) + export/import. No delete.
-- ============================================================================

-- Country
SELECT pg_temp.seed_entity_op('Country', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Country');
SELECT pg_temp.seed_entity_op('Country', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('Country', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('Country', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 4);
SELECT pg_temp.seed_entity_op('Country', 'import', 'LIST',   'TOOLBAR',  'MODAL',    'import_dialog', false, 5);

-- StateRegion
SELECT pg_temp.seed_entity_op('StateRegion', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New State/Region');
SELECT pg_temp.seed_entity_op('StateRegion', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('StateRegion', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('StateRegion', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 4);
SELECT pg_temp.seed_entity_op('StateRegion', 'import', 'LIST',   'TOOLBAR',  'MODAL',    'import_dialog', false, 5);

-- Currency
SELECT pg_temp.seed_entity_op('Currency', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Currency');
SELECT pg_temp.seed_entity_op('Currency', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('Currency', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('Currency', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 4);
SELECT pg_temp.seed_entity_op('Currency', 'import', 'LIST',   'TOOLBAR',  'MODAL',    'import_dialog', false, 5);

-- Language
SELECT pg_temp.seed_entity_op('Language', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Language');
SELECT pg_temp.seed_entity_op('Language', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('Language', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('Language', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 4);
SELECT pg_temp.seed_entity_op('Language', 'import', 'LIST',   'TOOLBAR',  'MODAL',    'import_dialog', false, 5);

-- Locale
SELECT pg_temp.seed_entity_op('Locale', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Locale');
SELECT pg_temp.seed_entity_op('Locale', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('Locale', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('Locale', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 4);
SELECT pg_temp.seed_entity_op('Locale', 'import', 'LIST',   'TOOLBAR',  'MODAL',    'import_dialog', false, 5);

-- Timezone
SELECT pg_temp.seed_entity_op('Timezone', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Timezone');
SELECT pg_temp.seed_entity_op('Timezone', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('Timezone', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('Timezone', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 4);
SELECT pg_temp.seed_entity_op('Timezone', 'import', 'LIST',   'TOOLBAR',  'MODAL',    'import_dialog', false, 5);

-- UnitOfMeasure
SELECT pg_temp.seed_entity_op('UnitOfMeasure', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New UoM');
SELECT pg_temp.seed_entity_op('UnitOfMeasure', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('UnitOfMeasure', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('UnitOfMeasure', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 4);
SELECT pg_temp.seed_entity_op('UnitOfMeasure', 'import', 'LIST',   'TOOLBAR',  'MODAL',    'import_dialog', false, 5);

-- CommodityDomain
SELECT pg_temp.seed_entity_op('CommodityDomain', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Commodity Domain');
SELECT pg_temp.seed_entity_op('CommodityDomain', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('CommodityDomain', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('CommodityDomain', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 4);
SELECT pg_temp.seed_entity_op('CommodityDomain', 'import', 'LIST',   'TOOLBAR',  'MODAL',    'import_dialog', false, 5);

-- CommodityCode
SELECT pg_temp.seed_entity_op('CommodityCode', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Commodity Code');
SELECT pg_temp.seed_entity_op('CommodityCode', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('CommodityCode', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('CommodityCode', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 4);
SELECT pg_temp.seed_entity_op('CommodityCode', 'import', 'LIST',   'TOOLBAR',  'MODAL',    'import_dialog', false, 5);

-- IndustryDomain
SELECT pg_temp.seed_entity_op('IndustryDomain', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Industry Domain');
SELECT pg_temp.seed_entity_op('IndustryDomain', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('IndustryDomain', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('IndustryDomain', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 4);
SELECT pg_temp.seed_entity_op('IndustryDomain', 'import', 'LIST',   'TOOLBAR',  'MODAL',    'import_dialog', false, 5);

-- IndustryCode
SELECT pg_temp.seed_entity_op('IndustryCode', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Industry Code');
SELECT pg_temp.seed_entity_op('IndustryCode', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('IndustryCode', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('IndustryCode', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 4);
SELECT pg_temp.seed_entity_op('IndustryCode', 'import', 'LIST',   'TOOLBAR',  'MODAL',    'import_dialog', false, 5);

-- Label
SELECT pg_temp.seed_entity_op('Label', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Label');
SELECT pg_temp.seed_entity_op('Label', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('Label', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('Label', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 4);
SELECT pg_temp.seed_entity_op('Label', 'import', 'LIST',   'TOOLBAR',  'MODAL',    'import_dialog', false, 5);

-- ============================================================================
-- ENT Entities: EntityRelationship, ProductCategory
-- ============================================================================

-- ProductCategory (full governance — CRUD + export/import)
SELECT pg_temp.seed_entity_op('ProductCategory', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Category');
SELECT pg_temp.seed_entity_op('ProductCategory', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('ProductCategory', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('ProductCategory', 'delete', 'DETAIL', 'OVERFLOW', 'API',      NULL, true,  4);
SELECT pg_temp.seed_entity_op('ProductCategory', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 5);
SELECT pg_temp.seed_entity_op('ProductCategory', 'import', 'LIST',   'TOOLBAR',  'MODAL',    'import_dialog', false, 6);

-- EntityRelationship (light governance)
SELECT pg_temp.seed_entity_op('EntityRelationship', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Relationship');
SELECT pg_temp.seed_entity_op('EntityRelationship', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('EntityRelationship', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('EntityRelationship', 'delete', 'DETAIL', 'OVERFLOW', 'API',      NULL, true,  4);
SELECT pg_temp.seed_entity_op('EntityRelationship', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 5);

-- ============================================================================
-- DOC Entities (business-facing): Document, BrandProfile
-- Pattern: full CRUD + print/export
-- ============================================================================

-- Document
SELECT pg_temp.seed_entity_op('Document', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Document');
SELECT pg_temp.seed_entity_op('Document', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('Document', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('Document', 'delete', 'DETAIL', 'OVERFLOW', 'API',      NULL, true,  4);
SELECT pg_temp.seed_entity_op('Document', 'print',  'DETAIL', 'TOOLBAR',  'MODAL',    'print_dialog', true, 5);
SELECT pg_temp.seed_entity_op('Document', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 6);

-- BrandProfile
SELECT pg_temp.seed_entity_op('BrandProfile', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Brand Profile');
SELECT pg_temp.seed_entity_op('BrandProfile', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('BrandProfile', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('BrandProfile', 'delete', 'DETAIL', 'OVERFLOW', 'API',      NULL, true,  4);
SELECT pg_temp.seed_entity_op('BrandProfile', 'copy',   'DETAIL', 'OVERFLOW', 'API',      NULL, true,  5, 'Duplicate Profile');
SELECT pg_temp.seed_entity_op('BrandProfile', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 6);

-- ============================================================================
-- DOC Entities (config/light): TemplateVersion, TemplateBinding
-- Pattern: read + update + export (managed via parent Template)
-- ============================================================================

-- TemplateVersion
SELECT pg_temp.seed_entity_op('TemplateVersion', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('TemplateVersion', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('TemplateVersion', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 3);

-- TemplateBinding
SELECT pg_temp.seed_entity_op('TemplateBinding', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Binding');
SELECT pg_temp.seed_entity_op('TemplateBinding', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('TemplateBinding', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('TemplateBinding', 'delete', 'DETAIL', 'OVERFLOW', 'API',      NULL, true,  4);
SELECT pg_temp.seed_entity_op('TemplateBinding', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 5);

-- ============================================================================
-- DOC Entities (infrastructure/audit_only): RenderOutput, RenderJob, RenderDLQ,
--   EntityDocumentLink, DocumentACL, AttachmentAccessLog, AttachmentComment,
--   MultipartUpload
-- Pattern: read-only + export
-- ============================================================================

SELECT pg_temp.seed_entity_op('RenderOutput',       'read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('RenderOutput',       'export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);

SELECT pg_temp.seed_entity_op('RenderJob',          'read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('RenderJob',          'export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);

SELECT pg_temp.seed_entity_op('RenderDLQ',          'read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('RenderDLQ',          'export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);

SELECT pg_temp.seed_entity_op('EntityDocumentLink', 'read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('EntityDocumentLink', 'export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);

SELECT pg_temp.seed_entity_op('DocumentACL',        'read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('DocumentACL',        'export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);

SELECT pg_temp.seed_entity_op('AttachmentAccessLog','read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('AttachmentAccessLog','export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);

SELECT pg_temp.seed_entity_op('AttachmentComment',  'read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('AttachmentComment',  'export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);

SELECT pg_temp.seed_entity_op('MultipartUpload',    'read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('MultipartUpload',    'export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);

-- ============================================================================
-- FIN Master Entities (full governance): ProfitCenter, FiscalPeriod,
--   AccountingProfile, OperatingUnit, BusinessIntent, FundingProfile,
--   CommissionPlan, LegalEntity, TaxJurisdiction, AIModelRegistry
-- Pattern: CRUD + export/import
-- ============================================================================

-- ProfitCenter
SELECT pg_temp.seed_entity_op('ProfitCenter', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Profit Center');
SELECT pg_temp.seed_entity_op('ProfitCenter', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('ProfitCenter', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('ProfitCenter', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 4);

-- FiscalPeriod
SELECT pg_temp.seed_entity_op('FiscalPeriod', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Fiscal Period');
SELECT pg_temp.seed_entity_op('FiscalPeriod', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('FiscalPeriod', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('FiscalPeriod', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 4);

-- AccountingProfile
SELECT pg_temp.seed_entity_op('AccountingProfile', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Acct Profile');
SELECT pg_temp.seed_entity_op('AccountingProfile', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('AccountingProfile', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('AccountingProfile', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 4);
SELECT pg_temp.seed_entity_op('AccountingProfile', 'import', 'LIST',   'TOOLBAR',  'MODAL',    'import_dialog', false, 5);

-- OperatingUnit
SELECT pg_temp.seed_entity_op('OperatingUnit', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Operating Unit');
SELECT pg_temp.seed_entity_op('OperatingUnit', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('OperatingUnit', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('OperatingUnit', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 4);
SELECT pg_temp.seed_entity_op('OperatingUnit', 'import', 'LIST',   'TOOLBAR',  'MODAL',    'import_dialog', false, 5);

-- BusinessIntent
SELECT pg_temp.seed_entity_op('BusinessIntent', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Business Intent');
SELECT pg_temp.seed_entity_op('BusinessIntent', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('BusinessIntent', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('BusinessIntent', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 4);

-- FundingProfile
SELECT pg_temp.seed_entity_op('FundingProfile', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Funding Profile');
SELECT pg_temp.seed_entity_op('FundingProfile', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('FundingProfile', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('FundingProfile', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 4);

-- CommissionPlan
SELECT pg_temp.seed_entity_op('CommissionPlan', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Commission Plan');
SELECT pg_temp.seed_entity_op('CommissionPlan', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('CommissionPlan', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('CommissionPlan', 'delete', 'DETAIL', 'OVERFLOW', 'API',      NULL, true,  4);
SELECT pg_temp.seed_entity_op('CommissionPlan', 'copy',   'DETAIL', 'OVERFLOW', 'API',      NULL, true,  5, 'Duplicate Plan');
SELECT pg_temp.seed_entity_op('CommissionPlan', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 6);

-- LegalEntity
SELECT pg_temp.seed_entity_op('LegalEntity', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Legal Entity');
SELECT pg_temp.seed_entity_op('LegalEntity', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('LegalEntity', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('LegalEntity', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 4);
SELECT pg_temp.seed_entity_op('LegalEntity', 'import', 'LIST',   'TOOLBAR',  'MODAL',    'import_dialog', false, 5);

-- TaxJurisdiction
SELECT pg_temp.seed_entity_op('TaxJurisdiction', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Tax Jurisdiction');
SELECT pg_temp.seed_entity_op('TaxJurisdiction', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('TaxJurisdiction', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('TaxJurisdiction', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 4);
SELECT pg_temp.seed_entity_op('TaxJurisdiction', 'import', 'LIST',   'TOOLBAR',  'MODAL',    'import_dialog', false, 5);

-- AIModelRegistry
SELECT pg_temp.seed_entity_op('AIModelRegistry', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New AI Model');
SELECT pg_temp.seed_entity_op('AIModelRegistry', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('AIModelRegistry', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('AIModelRegistry', 'delete', 'DETAIL', 'OVERFLOW', 'API',      NULL, true,  4);
SELECT pg_temp.seed_entity_op('AIModelRegistry', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 5);

-- ============================================================================
-- FIN Config Entities (light governance): PolicyModule, SmartDefaultRule,
--   IntercompanyAgreement, FxRate, TaxRate, CommissionAssignment,
--   BillOfMaterials, Routing
-- Pattern: CRUD + export. Some with import.
-- ============================================================================

-- PolicyModule
SELECT pg_temp.seed_entity_op('PolicyModule', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Policy Module');
SELECT pg_temp.seed_entity_op('PolicyModule', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('PolicyModule', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('PolicyModule', 'delete', 'DETAIL', 'OVERFLOW', 'API',      NULL, true,  4);
SELECT pg_temp.seed_entity_op('PolicyModule', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 5);

-- SmartDefaultRule
SELECT pg_temp.seed_entity_op('SmartDefaultRule', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Default Rule');
SELECT pg_temp.seed_entity_op('SmartDefaultRule', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('SmartDefaultRule', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('SmartDefaultRule', 'delete', 'DETAIL', 'OVERFLOW', 'API',      NULL, true,  4);
SELECT pg_temp.seed_entity_op('SmartDefaultRule', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 5);

-- IntercompanyAgreement
SELECT pg_temp.seed_entity_op('IntercompanyAgreement', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New IC Agreement');
SELECT pg_temp.seed_entity_op('IntercompanyAgreement', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('IntercompanyAgreement', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('IntercompanyAgreement', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 4);

-- FxRate
SELECT pg_temp.seed_entity_op('FxRate', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New FX Rate');
SELECT pg_temp.seed_entity_op('FxRate', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('FxRate', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('FxRate', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 4);
SELECT pg_temp.seed_entity_op('FxRate', 'import', 'LIST',   'TOOLBAR',  'MODAL',    'import_dialog', false, 5);

-- TaxRate
SELECT pg_temp.seed_entity_op('TaxRate', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Tax Rate');
SELECT pg_temp.seed_entity_op('TaxRate', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('TaxRate', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('TaxRate', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 4);
SELECT pg_temp.seed_entity_op('TaxRate', 'import', 'LIST',   'TOOLBAR',  'MODAL',    'import_dialog', false, 5);

-- CommissionAssignment
SELECT pg_temp.seed_entity_op('CommissionAssignment', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Assignment');
SELECT pg_temp.seed_entity_op('CommissionAssignment', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('CommissionAssignment', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('CommissionAssignment', 'delete', 'DETAIL', 'OVERFLOW', 'API',      NULL, true,  4);
SELECT pg_temp.seed_entity_op('CommissionAssignment', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 5);

-- SpendCategoryCommodityMap
SELECT pg_temp.seed_entity_op('SpendCategoryCommodityMap', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Mapping');
SELECT pg_temp.seed_entity_op('SpendCategoryCommodityMap', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('SpendCategoryCommodityMap', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('SpendCategoryCommodityMap', 'delete', 'DETAIL', 'OVERFLOW', 'API',      NULL, true,  4);
SELECT pg_temp.seed_entity_op('SpendCategoryCommodityMap', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 5);

-- CategoryIntentRule
SELECT pg_temp.seed_entity_op('CategoryIntentRule', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Rule');
SELECT pg_temp.seed_entity_op('CategoryIntentRule', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('CategoryIntentRule', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('CategoryIntentRule', 'delete', 'DETAIL', 'OVERFLOW', 'API',      NULL, true,  4);
SELECT pg_temp.seed_entity_op('CategoryIntentRule', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 5);

-- DocumentSequence
SELECT pg_temp.seed_entity_op('DocumentSequence', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Sequence');
SELECT pg_temp.seed_entity_op('DocumentSequence', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('DocumentSequence', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('DocumentSequence', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 4);

-- BillOfMaterials
SELECT pg_temp.seed_entity_op('BillOfMaterials', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New BOM');
SELECT pg_temp.seed_entity_op('BillOfMaterials', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('BillOfMaterials', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('BillOfMaterials', 'copy',   'DETAIL', 'OVERFLOW', 'API',      NULL, true,  4, 'Duplicate BOM');
SELECT pg_temp.seed_entity_op('BillOfMaterials', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 5);

-- Routing
SELECT pg_temp.seed_entity_op('Routing', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Routing');
SELECT pg_temp.seed_entity_op('Routing', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('Routing', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('Routing', 'copy',   'DETAIL', 'OVERFLOW', 'API',      NULL, true,  4, 'Duplicate Routing');
SELECT pg_temp.seed_entity_op('Routing', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 5);

-- ============================================================================
-- FIN Transaction/Ledger Entities (audit_only): read + export only
-- Document Children: PurchaseInvoiceLine, PaymentAllocation, BankStatementLine,
--                    ReconciliationSession
-- GL / Posting: JournalLine, GLBalance
-- Decision Grid: TransactionPipeline, PolicyEvaluationLog, Exception, OuIntentMapping
-- Budget: FundingTransaction, FundingTransfer
-- Commitment: Commitment, CommitmentSchedule, CommitmentFulfillment
-- Inventory: InventoryBalance, InventoryMovement, InventoryValuationLayer,
--            Stocktake, StocktakeLine
-- Production: BomLine, WorkOrderCost, WorkOrderMaterialIssue, ProductionVariance
-- Federation: IntercompanyTransaction, ConsolidationElimination, NettingBatch, FxRevaluation
-- Commission: CommissionCalculation, CommissionStatement
-- Tax: TaxCalculation, TaxCreditLedger
-- Asset: AssetBook, AssetTransaction, DepreciationRun
-- Atlas AI: AIPrediction, AIAction, AIDriftMonitor
-- ============================================================================

-- Document Children (audit_only — child rows of lifecycle-managed finance documents)
SELECT pg_temp.seed_entity_op('PurchaseInvoiceLine', 'read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('PurchaseInvoiceLine', 'export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);

SELECT pg_temp.seed_entity_op('PaymentAllocation',   'read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('PaymentAllocation',   'export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);

SELECT pg_temp.seed_entity_op('BankStatementLine',   'read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('BankStatementLine',   'export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);

SELECT pg_temp.seed_entity_op('ReconciliationSession','read',  'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('ReconciliationSession','export','LIST',   'TOOLBAR', 'API',      NULL, false, 2);

-- GL / Posting
SELECT pg_temp.seed_entity_op('JournalLine',  'read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('JournalLine',  'export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);

SELECT pg_temp.seed_entity_op('GLBalance',    'read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('GLBalance',    'export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);

-- Decision Grid
SELECT pg_temp.seed_entity_op('TransactionPipeline',  'read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('TransactionPipeline',  'export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);

SELECT pg_temp.seed_entity_op('PolicyEvaluationLog',  'read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('PolicyEvaluationLog',  'export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);

SELECT pg_temp.seed_entity_op('Exception',            'read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('Exception',            'export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);

SELECT pg_temp.seed_entity_op('OuIntentMapping',      'read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('OuIntentMapping',      'export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);

-- Budget
SELECT pg_temp.seed_entity_op('FundingTransaction',   'read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('FundingTransaction',   'export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);

SELECT pg_temp.seed_entity_op('FundingTransfer',      'read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('FundingTransfer',      'export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);

-- Commitment
SELECT pg_temp.seed_entity_op('Commitment',           'read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('Commitment',           'export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);
SELECT pg_temp.seed_entity_op('Commitment',           'print',  'DETAIL', 'TOOLBAR', 'MODAL',    'print_dialog', true, 3);

SELECT pg_temp.seed_entity_op('CommitmentSchedule',   'read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('CommitmentSchedule',   'export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);

SELECT pg_temp.seed_entity_op('CommitmentFulfillment','read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('CommitmentFulfillment','export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);

-- Inventory
SELECT pg_temp.seed_entity_op('InventoryBalance',     'read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('InventoryBalance',     'export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);

SELECT pg_temp.seed_entity_op('InventoryMovement',    'read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('InventoryMovement',    'export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);

SELECT pg_temp.seed_entity_op('InventoryValuationLayer','read', 'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('InventoryValuationLayer','export','LIST',  'TOOLBAR', 'API',      NULL, false, 2);

SELECT pg_temp.seed_entity_op('Stocktake',            'read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('Stocktake',            'export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);
SELECT pg_temp.seed_entity_op('Stocktake',            'print',  'DETAIL', 'TOOLBAR', 'MODAL',    'print_dialog', true, 3);

SELECT pg_temp.seed_entity_op('StocktakeLine',        'read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('StocktakeLine',        'export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);

-- Production
SELECT pg_temp.seed_entity_op('BomLine',              'read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('BomLine',              'export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);

SELECT pg_temp.seed_entity_op('WorkOrderCost',        'read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('WorkOrderCost',        'export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);

SELECT pg_temp.seed_entity_op('WorkOrderMaterialIssue','read',  'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('WorkOrderMaterialIssue','export','LIST',   'TOOLBAR', 'API',      NULL, false, 2);

SELECT pg_temp.seed_entity_op('ProductionVariance',   'read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('ProductionVariance',   'export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);

-- Federation
SELECT pg_temp.seed_entity_op('IntercompanyTransaction','read', 'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('IntercompanyTransaction','export','LIST',  'TOOLBAR', 'API',      NULL, false, 2);

SELECT pg_temp.seed_entity_op('ConsolidationElimination','read','DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('ConsolidationElimination','export','LIST', 'TOOLBAR', 'API',      NULL, false, 2);

SELECT pg_temp.seed_entity_op('NettingBatch',         'read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('NettingBatch',         'export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);

SELECT pg_temp.seed_entity_op('FxRevaluation',        'read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('FxRevaluation',        'export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);

-- Commission
SELECT pg_temp.seed_entity_op('CommissionCalculation','read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('CommissionCalculation','export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);
SELECT pg_temp.seed_entity_op('CommissionCalculation','print',  'DETAIL', 'TOOLBAR', 'MODAL',    'print_dialog', true, 3);

SELECT pg_temp.seed_entity_op('CommissionStatement',  'read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('CommissionStatement',  'export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);
SELECT pg_temp.seed_entity_op('CommissionStatement',  'print',  'DETAIL', 'TOOLBAR', 'MODAL',    'print_dialog', true, 3);

-- Tax
SELECT pg_temp.seed_entity_op('TaxCalculation',       'read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('TaxCalculation',       'export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);

SELECT pg_temp.seed_entity_op('TaxCreditLedger',      'read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('TaxCreditLedger',      'export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);

-- Asset
SELECT pg_temp.seed_entity_op('AssetBook',            'read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('AssetBook',            'export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);

SELECT pg_temp.seed_entity_op('AssetTransaction',     'read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('AssetTransaction',     'export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);

SELECT pg_temp.seed_entity_op('DepreciationRun',      'read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('DepreciationRun',      'export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);
SELECT pg_temp.seed_entity_op('DepreciationRun',      'print',  'DETAIL', 'TOOLBAR', 'MODAL',    'print_dialog', true, 3);

-- Atlas AI
SELECT pg_temp.seed_entity_op('AIPrediction',         'read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('AIPrediction',         'export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);

SELECT pg_temp.seed_entity_op('AIAction',             'read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('AIAction',             'export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);

SELECT pg_temp.seed_entity_op('AIDriftMonitor',       'read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('AIDriftMonitor',       'export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);

-- ============================================================================
-- INT Entities (config/light): IntegrationEndpoint, IntegrationFlow,
--   WebhookSubscription
-- Pattern: CRUD + export
-- ============================================================================

-- IntegrationEndpoint
SELECT pg_temp.seed_entity_op('IntegrationEndpoint', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Endpoint');
SELECT pg_temp.seed_entity_op('IntegrationEndpoint', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('IntegrationEndpoint', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('IntegrationEndpoint', 'delete', 'DETAIL', 'OVERFLOW', 'API',      NULL, true,  4);
SELECT pg_temp.seed_entity_op('IntegrationEndpoint', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 5);

-- IntegrationFlow
SELECT pg_temp.seed_entity_op('IntegrationFlow', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Flow');
SELECT pg_temp.seed_entity_op('IntegrationFlow', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('IntegrationFlow', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('IntegrationFlow', 'delete', 'DETAIL', 'OVERFLOW', 'API',      NULL, true,  4);
SELECT pg_temp.seed_entity_op('IntegrationFlow', 'copy',   'DETAIL', 'OVERFLOW', 'API',      NULL, true,  5, 'Duplicate Flow');
SELECT pg_temp.seed_entity_op('IntegrationFlow', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 6);

-- WebhookSubscription
SELECT pg_temp.seed_entity_op('WebhookSubscription', 'create', 'LIST',   'PRIMARY',  'NAVIGATE', NULL, false, 1, 'New Subscription');
SELECT pg_temp.seed_entity_op('WebhookSubscription', 'read',   'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  2);
SELECT pg_temp.seed_entity_op('WebhookSubscription', 'update', 'DETAIL', 'TOOLBAR',  'NAVIGATE', NULL, true,  3);
SELECT pg_temp.seed_entity_op('WebhookSubscription', 'delete', 'DETAIL', 'OVERFLOW', 'API',      NULL, true,  4);
SELECT pg_temp.seed_entity_op('WebhookSubscription', 'export', 'LIST',   'TOOLBAR',  'API',      NULL, false, 5);

-- ============================================================================
-- INT Entities (infrastructure/audit_only): WebhookEvent, OutboxItem,
--   DeliveryLog, JobLog
-- Pattern: read + export only
-- ============================================================================

SELECT pg_temp.seed_entity_op('WebhookEvent', 'read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('WebhookEvent', 'export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);

SELECT pg_temp.seed_entity_op('OutboxItem',   'read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('OutboxItem',   'export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);

SELECT pg_temp.seed_entity_op('DeliveryLog',  'read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('DeliveryLog',  'export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);

SELECT pg_temp.seed_entity_op('JobLog',       'read',   'DETAIL', 'TOOLBAR', 'NAVIGATE', NULL, true,  1);
SELECT pg_temp.seed_entity_op('JobLog',       'export', 'LIST',   'TOOLBAR', 'API',      NULL, false, 2);

DO $$ BEGIN
  RAISE NOTICE 'Entity operation capabilities seeded: % rows',
      (SELECT count(*) FROM meta.entity_operation WHERE tenant_id IS NULL);
END $$;

-- ============================================================================
commit;
