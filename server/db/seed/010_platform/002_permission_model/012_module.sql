-- seed/010_platform/002_permission_model/012_module.sql
-- Seed: Product modules + workspace linkage
-- Schema: shared | Table: module
-- Depends on: 011_workspace.sql
-- Idempotent: ON CONFLICT (code) DO UPDATE

-- ============================================================================
-- All modules — single insert, grouped by workspace for readability
-- ============================================================================
INSERT INTO shared.module (code, name, description, config, created_by)
VALUES
    -- ── Core platform (workspace: CORE) ──────────────────────────────────────
    ('FND',      'Foundation Runtime',                'Meta-driven runtime engine',                                                                                '{"tier":"Core"}'::jsonb,                                        '00000000-0000-0000-0000-000000000000'),
    ('META',     'Metadata Studio',                   'Declarative configuration',                                                                                 '{"tier":"Core"}'::jsonb,                                        '00000000-0000-0000-0000-000000000000'),
    ('IAM',      'Identity & Access Management',      'Authentication and authorization',                                                                          '{"tier":"Core"}'::jsonb,                                        '00000000-0000-0000-0000-000000000000'),
    ('AUD',      'Audit & Governance',                'Audit trails and compliance',                                                                               '{"tier":"Core"}'::jsonb,                                        '00000000-0000-0000-0000-000000000000'),
    ('POL',      'Policy & Rules Engine',             'Business rules and validations',                                                                            '{"tier":"Core"}'::jsonb,                                        '00000000-0000-0000-0000-000000000000'),
    ('WFL',      'Workflow Engine',                   'State machines and approvals',                                                                              '{"tier":"Core"}'::jsonb,                                        '00000000-0000-0000-0000-000000000000'),
    ('JOB',      'Automation & Jobs',                 'Schedulers and background tasks',                                                                           '{"tier":"Core"}'::jsonb,                                        '00000000-0000-0000-0000-000000000000'),
    ('DOC',      'Document Services',                 'PDF/HTML generation',                                                                                       '{"tier":"Core"}'::jsonb,                                        '00000000-0000-0000-0000-000000000000'),
    ('NTF',      'Notification Services',             'Email and alerts',                                                                                          '{"tier":"Core"}'::jsonb,                                        '00000000-0000-0000-0000-000000000000'),
    ('INT',      'Integration Hub',                   'API gateway and webhooks',                                                                                  '{"tier":"Core"}'::jsonb,                                        '00000000-0000-0000-0000-000000000000'),
    ('CMS',      'Content Services',                  'Document storage',                                                                                          '{"tier":"Core"}'::jsonb,                                        '00000000-0000-0000-0000-000000000000'),
    ('ACT',      'Activity & Commentary',             'Comments and timelines',                                                                                    '{"tier":"Core"}'::jsonb,                                        '00000000-0000-0000-0000-000000000000'),
    ('REL',      'Reference & Shared Data',           'Reference & Shared Data',                                                                                   '{"tier":"Core"}'::jsonb,                                        '00000000-0000-0000-0000-000000000000'),
    -- ── Finance (workspace: FIN) ─────────────────────────────────────────────
    ('ACC',      'Core Accounting',                   'General Ledger, AP, AR, fiscal controls',                                                                   '{"tier":"Base","dependencies":["FND"]}'::jsonb,                  '00000000-0000-0000-0000-000000000000'),
    ('PAY',      'Payment Processing',                'Collections, disbursements, reconciliation',                                                                 '{"tier":"Base","dependencies":["ACC"]}'::jsonb,                  '00000000-0000-0000-0000-000000000000'),
    ('TREASURY', 'Treasury & Cash Management',        'Cash positioning, bank accounts, liquidity, FX exposure, bank reconciliation, funding',                      '{"tier":"Base","dependencies":["ACC","PAY"]}'::jsonb,            '00000000-0000-0000-0000-000000000000'),
    ('BUDGET',   'Budget & Funds Control',            'Budget planning, allocation, commitment control, availability checks, and budget consumption tracking',      '{"tier":"Enterprise","dependencies":["ACC","WFL"]}'::jsonb,      '00000000-0000-0000-0000-000000000000'),
    ('PAYG',     'Payment Gateway',                   'External payment providers (Stripe, etc.)',                                                                  '{"tier":"Professional","dependencies":["PAY"]}'::jsonb,          '00000000-0000-0000-0000-000000000000'),
    -- ── Supply Chain (workspace: SCM) ────────────────────────────────────────
    ('SRM',       'Supplier Relationship Management', 'Supplier Lifecycle and Performance Management',                                                              '{"tier":"Base","dependencies":["REL","WFL","AUD"]}'::jsonb,      '00000000-0000-0000-0000-000000000000'),
    ('SOURCE',    'Sourcing',                         'RFQs, bids, supplier selection',                                                                            '{"tier":"Base","dependencies":["REL","WFL","DOC","NTF"]}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('CONTRACT',  'Contract Management',              'Commercial contracts, terms, obligations',                                                                   '{"tier":"Base","dependencies":["REL","WFL","DOC","NTF"]}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('BUY',       'Procurement',                      'Purchasing, requisitions, POs',                                                                             '{"tier":"Base","dependencies":["FND","REL"]}'::jsonb,            '00000000-0000-0000-0000-000000000000'),
    ('INVENTORY', 'Inventory Management',             'Inventory, valuation, movements',                                                                           '{"tier":"Base","dependencies":["FND","REL","ACC"]}'::jsonb,      '00000000-0000-0000-0000-000000000000'),
    ('QMS',       'Quality Management',               'Inspections, QC processes',                                                                                 '{"tier":"Base","dependencies":["INVENTORY"]}'::jsonb,            '00000000-0000-0000-0000-000000000000'),
    ('SUBCON',    'Subcontracting',                   'Job subcontract workflows',                                                                                  '{"tier":"Base","dependencies":["BUY","INVENTORY"]}'::jsonb,      '00000000-0000-0000-0000-000000000000'),
    ('DEMAND',    'Demand Planning & Forecasting',    'Statistical & AI-based demand forecasting, planning scenarios',                                              '{"tier":"Enterprise","dependencies":["INVENTORY","SALE"]}'::jsonb,'00000000-0000-0000-0000-000000000000'),
    ('WMS',       'Warehouse Management',             'Bin management, putaway, picking, packing, cycle counting, barcode/RFID',                                   '{"tier":"Enterprise","dependencies":["INVENTORY"]}'::jsonb,      '00000000-0000-0000-0000-000000000000'),
    ('LOGISTICS', 'Transportation & Logistics',       'Shipment planning, carriers, freight costs, delivery tracking',                                              '{"tier":"Enterprise","dependencies":["WMS","INVENTORY"]}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    -- ── Sales & CRM (workspace: COM) ─────────────────────────────────────────
    ('CRM',  'Customer Relationship Management',      'Leads, opportunities, pipeline management',                                                                  '{"tier":"Base","dependencies":["REL"]}'::jsonb,                  '00000000-0000-0000-0000-000000000000'),
    ('SALE', 'Sales & Order Management',              'Sales cycle, orders, invoicing',                                                                             '{"tier":"Base","dependencies":["FND","REL"]}'::jsonb,            '00000000-0000-0000-0000-000000000000'),
    -- ── People (workspace: PPL) ──────────────────────────────────────────────
    ('HR',      'Human Resources',                    'Employee lifecycle, organization structure',                                                                 '{"tier":"Base","dependencies":["FND","REL"]}'::jsonb,            '00000000-0000-0000-0000-000000000000'),
    ('PAYROLL', 'Payroll',                            'Salaries, statutory compliance',                                                                             '{"tier":"Base","dependencies":["HR","ACC"]}'::jsonb,             '00000000-0000-0000-0000-000000000000'),
    -- ── Projects & Services (workspace: PRS) ─────────────────────────────────
    ('PRJCOST', 'Project Management',                 'Project, Task, Project budgets, WBS, cost tracking, revenue recognition',                                    '{"tier":"Base","dependencies":["ACC","BUDGET"]}'::jsonb,          '00000000-0000-0000-0000-000000000000'),
    ('ITSM',    'Service Management',                 'Tickets, SLAs, service workflows',                                                                           '{"tier":"Base","dependencies":["FND","WFL","ASSET","NTF","AUD"]}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    -- ── Manufacturing & Maintenance (workspace: OPS) ──────────────────────────
    ('MAINT', 'Maintenance Management',               'Preventive & corrective maintenance',                                                                        '{"tier":"Base","dependencies":["BUY","ASSET","INVENTORY"]}'::jsonb,'00000000-0000-0000-0000-000000000000'),
    ('MFG',   'Manufacturing',                        'BOMs, work orders, MRP',                                                                                    '{"tier":"Base","dependencies":["INVENTORY"]}'::jsonb,            '00000000-0000-0000-0000-000000000000'),
    -- ── Assets & Facilities (workspace: AST) ─────────────────────────────────
    ('ASSET',     'Asset Management',                 'Asset lifecycle, depreciation',                                                                              '{"tier":"Enterprise","dependencies":["FND","ACC","AUD"]}'::jsonb,       '00000000-0000-0000-0000-000000000000'),
    ('ASSETREMS', 'Real Estate Asset Management',     'Property, lease, tenancy, rental billing, CAM charges, asset depreciation',                                  '{"tier":"Enterprise","dependencies":["ASSET","ACC","CONTRACT"]}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    ('ASSETFM',   'Facility Management',              'Buildings, utilities, space, maintenance cost centers',                                                      '{"tier":"Base","dependencies":["ASSET","MAINT"]}'::jsonb,               '00000000-0000-0000-0000-000000000000'),
    -- ── Partner Collaboration (workspace: PTR) ────────────────────────────────
    ('PCON',  'Proposal & Contract Collaboration',    'Partner-facing collaboration for proposals, commercial terms, and contract exchange',                        '{"tier":"Base","dependencies":["CONTRACT","REL"]}'::jsonb,       '00000000-0000-0000-0000-000000000000'),
    ('OMI',   'Order Intake',                         'Inbound partner orders and order acknowledgements received from external parties',                           '{"tier":"Base","dependencies":["BUY","REL"]}'::jsonb,            '00000000-0000-0000-0000-000000000000'),
    ('IMO',   'Invoice Delivery',                     'Outbound invoices and invoice delivery to customers or partner channels',                                    '{"tier":"Base","dependencies":["ACC","REL"]}'::jsonb,            '00000000-0000-0000-0000-000000000000'),
    ('CCON',  'Customer Contract Portal',             'Customer-visible contract access, commercial documents, and renewal interaction',                            '{"tier":"Base","dependencies":["CONTRACT","CRM"]}'::jsonb,       '00000000-0000-0000-0000-000000000000'),
    ('SOO',   'Sales Order Delivery',                 'Outbound sales orders sent to fulfillment, distributors, or trading partners',                               '{"tier":"Base","dependencies":["SALE","REL"]}'::jsonb,           '00000000-0000-0000-0000-000000000000'),
    ('SII',   'Sales Invoice Intake',                 'Inbound customer-side sales invoice intake and validation from connected channels',                          '{"tier":"Base","dependencies":["ACC","SALE"]}'::jsonb,           '00000000-0000-0000-0000-000000000000'),
    ('LOGX',  'Logistics Collaboration',              'Shipment visibility, transport milestone exchange, and logistics partner coordination',                      '{"tier":"Base","dependencies":["LOGISTICS","REL"]}'::jsonb,      '00000000-0000-0000-0000-000000000000')

ON CONFLICT (code) DO UPDATE SET
    name        = excluded.name,
    description = excluded.description,
    config      = excluded.config,
    updated_at  = now(),
    updated_by  = excluded.created_by;

-- ============================================================================
-- Workspace linkage — single UPDATE via array matching
-- Safe to re-run: workspace rows that don't exist simply don't match the JOIN.
-- ============================================================================
UPDATE shared.module m
SET    workspace_id = w.id,
       updated_at   = now(),
       updated_by   = '00000000-0000-0000-0000-000000000000'
FROM   shared.workspace w
JOIN  (VALUES
    ('CORE', ARRAY['FND','META','IAM','AUD','POL','WFL','JOB','DOC','NTF','INT','CMS','ACT','REL']),
    ('FIN',  ARRAY['ACC','PAY','TREASURY','BUDGET','PAYG']),
    ('SCM',  ARRAY['SRM','SOURCE','CONTRACT','BUY','INVENTORY','QMS','SUBCON','DEMAND','WMS','LOGISTICS']),
    ('COM',  ARRAY['CRM','SALE']),
    ('PPL',  ARRAY['HR','PAYROLL']),
    ('PRS',  ARRAY['PRJCOST','ITSM']),
    ('OPS',  ARRAY['MAINT','MFG']),
    ('AST',  ARRAY['ASSET','ASSETREMS','ASSETFM']),
    ('PTR',  ARRAY['PCON','OMI','IMO','CCON','SOO','SII','LOGX'])
) AS wm(wcode, mcodes) ON w.code = wm.wcode
WHERE  m.code = ANY(wm.mcodes);

-- ============================================================================
-- Remove obsolete workspace codes no longer in the product taxonomy.
-- Module FK reassignments above run first so deletes won't violate constraints.
-- ============================================================================
DELETE FROM shared.workspace WHERE code IN ('CXP','PMO','MFO','ASM','PRM');

DO $$ DECLARE w int; m int; BEGIN
  SELECT count(*) INTO w FROM shared.workspace;
  SELECT count(*) INTO m FROM shared.module;
  RAISE NOTICE '[012_module] shared.workspace: % rows | shared.module: % rows', w, m;
END $$;
