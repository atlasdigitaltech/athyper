-- 900_seed_data/001_shared/012_module.sql
-- Seed: Product modules + workspace linkage
-- Schema: shared | Table: module
-- Depends on: 011_workspace.sql
-- Idempotent: on conflict (code) do update

-- ============================================================================
-- Core Platform modules  (workspace: CORE)
-- ============================================================================
insert into shared.module (code, name, description, config, created_by) values
  ('FND',  'Foundation Runtime',            'Meta-driven runtime engine',            '{"tier":"Core"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
  ('META', 'Metadata Studio',              'Declarative configuration',             '{"tier":"Core"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
  ('IAM',  'Identity & Access Management', 'Authentication and authorization',      '{"tier":"Core"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
  ('AUD',  'Audit & Governance',           'Audit trails and compliance',           '{"tier":"Core"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
  ('POL',  'Policy & Rules Engine',        'Business rules and validations',        '{"tier":"Core"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
  ('WFL',  'Workflow Engine',              'State machines and approvals',          '{"tier":"Core"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
  ('JOB',  'Automation & Jobs',            'Schedulers and background tasks',       '{"tier":"Core"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
  ('DOC',  'Document Services',            'PDF/HTML generation',                   '{"tier":"Core"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
  ('NTF',  'Notification Services',        'Email and alerts',                      '{"tier":"Core"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
  ('INT',  'Integration Hub',              'API gateway and webhooks',              '{"tier":"Core"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
  ('CMS',  'Content Services',             'Document storage',                      '{"tier":"Core"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
  ('ACT',  'Activity & Commentary',        'Comments and timelines',               '{"tier":"Core"}'::jsonb, '00000000-0000-0000-0000-000000000000'),
  ('REL',  'Reference & Shared Data',      'Reference & Shared Data',               '{"tier":"Core"}'::jsonb, '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
    name        = excluded.name,
    description = excluded.description,
    config      = excluded.config,
    updated_at  = now(),
    updated_by  = excluded.created_by;

-- ============================================================================
-- Finance modules  (workspace: FIN)
-- ============================================================================
insert into shared.module (code, name, description, config, created_by) values
  ('ACC',      'Core Accounting',             'General Ledger, AP, AR, fiscal controls',                                                                      '{"tier":"Base","dependencies":["FND"]}'::jsonb,                       '00000000-0000-0000-0000-000000000000'),
  ('PAY',      'Payment Processing',          'Collections, disbursements, reconciliation',                                                                    '{"tier":"Base","dependencies":["ACC"]}'::jsonb,                       '00000000-0000-0000-0000-000000000000'),
  ('TREASURY', 'Treasury & Cash Management',  'Cash positioning, bank accounts, liquidity, FX exposure, bank reconciliation, funding',                         '{"tier":"Base","dependencies":["ACC","PAY"]}'::jsonb,                 '00000000-0000-0000-0000-000000000000'),
  ('BUDGET',   'Budget & Funds Control',      'Budget planning, allocation, commitment control, availability checks, and budget consumption tracking',          '{"tier":"Enterprise","dependencies":["ACC","WFL"]}'::jsonb,           '00000000-0000-0000-0000-000000000000'),
  ('PAYG',     'Payment Gateway',             'External payment providers (Stripe, etc.)',                                                                     '{"tier":"Professional","dependencies":["PAY"]}'::jsonb,              '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
    name        = excluded.name,
    description = excluded.description,
    config      = excluded.config,
    updated_at  = now(),
    updated_by  = excluded.created_by;

-- ============================================================================
-- Supply Chain modules  (workspace: SCM)
-- ============================================================================
insert into shared.module (code, name, description, config, created_by) values
  ('SRM',       'Supplier Relationship Management', 'Supplier Lifecycle and Performance Management',                             '{"tier":"Base","dependencies":["REL","WFL","AUD"]}'::jsonb,        '00000000-0000-0000-0000-000000000000'),
  ('SOURCE',    'Sourcing',                         'RFQs, bids, vendor selection',                                             '{"tier":"Base","dependencies":["REL","WFL","DOC","NTF"]}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
  ('CONTRACT',  'Contract Management',              'Commercial contracts, terms, obligations',                                  '{"tier":"Base","dependencies":["REL","WFL","DOC","NTF"]}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
  ('BUY',       'Procurement',                      'Purchasing, requisitions, POs',                                            '{"tier":"Base","dependencies":["FND","REL"]}'::jsonb,               '00000000-0000-0000-0000-000000000000'),
  ('INVENTORY', 'Inventory Management',             'Inventory, valuation, movements',                                          '{"tier":"Base","dependencies":["FND","REL","ACC"]}'::jsonb,         '00000000-0000-0000-0000-000000000000'),
  ('QMS',       'Quality Management',               'Inspections, QC processes',                                                '{"tier":"Base","dependencies":["INVENTORY"]}'::jsonb,               '00000000-0000-0000-0000-000000000000'),
  ('SUBCON',    'Subcontracting',                   'Job subcontract workflows',                                                 '{"tier":"Base","dependencies":["BUY","INVENTORY"]}'::jsonb,         '00000000-0000-0000-0000-000000000000'),
  ('DEMAND',    'Demand Planning & Forecasting',    'Statistical & AI-based demand forecasting, planning scenarios',            '{"tier":"Enterprise","dependencies":["INVENTORY","SALE"]}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
  ('WMS',       'Warehouse Management',             'Bin management, putaway, picking, packing, cycle counting, barcode/RFID',  '{"tier":"Enterprise","dependencies":["INVENTORY"]}'::jsonb,         '00000000-0000-0000-0000-000000000000'),
  ('LOGISTICS', 'Transportation & Logistics',       'Shipment planning, carriers, freight costs, delivery tracking',            '{"tier":"Enterprise","dependencies":["WMS","INVENTORY"]}'::jsonb,   '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
    name        = excluded.name,
    description = excluded.description,
    config      = excluded.config,
    updated_at  = now(),
    updated_by  = excluded.created_by;

-- ============================================================================
-- Commercial modules  (workspace: COM)
-- ============================================================================
insert into shared.module (code, name, description, config, created_by) values
  ('CRM',  'Customer Relationship Management', 'Leads, opportunities, pipeline management',  '{"tier":"Base","dependencies":["REL"]}'::jsonb,       '00000000-0000-0000-0000-000000000000'),
  ('SALE', 'Sales & Order Management',         'Sales cycle, orders, invoicing',             '{"tier":"Base","dependencies":["FND","REL"]}'::jsonb, '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
    name        = excluded.name,
    description = excluded.description,
    config      = excluded.config,
    updated_at  = now(),
    updated_by  = excluded.created_by;

-- ============================================================================
-- People modules  (workspace: PPL)
-- ============================================================================
insert into shared.module (code, name, description, config, created_by) values
  ('HR',      'Human Resources', 'Employee lifecycle, organization structure',  '{"tier":"Base","dependencies":["FND","REL"]}'::jsonb, '00000000-0000-0000-0000-000000000000'),
  ('PAYROLL', 'Payroll',         'Salaries, statutory compliance',              '{"tier":"Base","dependencies":["HR","ACC"]}'::jsonb,  '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
    name        = excluded.name,
    description = excluded.description,
    config      = excluded.config,
    updated_at  = now(),
    updated_by  = excluded.created_by;

-- ============================================================================
-- Projects & Services modules  (workspace: PRS)
-- ============================================================================
insert into shared.module (code, name, description, config, created_by) values
  ('PRJCOST', 'Project Management',  'Project, Task, Project budgets, WBS, cost tracking, revenue recognition',  '{"tier":"Base","dependencies":["ACC","BUDGET"]}'::jsonb,                   '00000000-0000-0000-0000-000000000000'),
  ('ITSM',    'Service Management',  'Tickets, SLAs, service workflows',                                         '{"tier":"Base","dependencies":["FND","WFL","ASSET","NTF","AUD"]}'::jsonb,  '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
    name        = excluded.name,
    description = excluded.description,
    config      = excluded.config,
    updated_at  = now(),
    updated_by  = excluded.created_by;

-- ============================================================================
-- Operations modules  (workspace: OPS)
-- ============================================================================
insert into shared.module (code, name, description, config, created_by) values
  ('MAINT', 'Maintenance Management', 'Preventive & corrective maintenance',  '{"tier":"Base","dependencies":["BUY","ASSET","INVENTORY"]}'::jsonb, '00000000-0000-0000-0000-000000000000'),
  ('MFG',   'Manufacturing',          'BOMs, work orders, MRP',               '{"tier":"Base","dependencies":["INVENTORY"]}'::jsonb,               '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
    name        = excluded.name,
    description = excluded.description,
    config      = excluded.config,
    updated_at  = now(),
    updated_by  = excluded.created_by;

-- ============================================================================
-- Assets & Facilities modules  (workspace: AST)
-- ============================================================================
insert into shared.module (code, name, description, config, created_by) values
  ('ASSET',     'Asset Management',             'Asset lifecycle, depreciation',                                              '{"tier":"Enterprise","dependencies":["FND","ACC","AUD"]}'::jsonb,        '00000000-0000-0000-0000-000000000000'),
  ('ASSETREMS', 'Real Estate Asset Management', 'Property, lease, tenancy, rental billing, CAM charges, asset depreciation',  '{"tier":"Enterprise","dependencies":["ASSET","ACC","CONTRACT"]}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
  ('ASSETFM',   'Facility Management',          'Buildings, utilities, space, maintenance cost centers',                      '{"tier":"Base","dependencies":["ASSET","MAINT"]}'::jsonb,                '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
    name        = excluded.name,
    description = excluded.description,
    config      = excluded.config,
    updated_at  = now(),
    updated_by  = excluded.created_by;

-- ============================================================================
-- Partner Collaboration modules  (workspace: PTR)
-- ============================================================================
insert into shared.module (code, name, description, config, created_by) values
  ('PCON',  'Proposal & Contract Collaboration', 'Partner-facing collaboration for proposals, commercial terms, and contract exchange',        '{"tier":"Base","dependencies":["CONTRACT","REL"]}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
  ('OMI',   'Order Intake',                      'Inbound partner orders and order acknowledgements received from external parties',            '{"tier":"Base","dependencies":["BUY","REL"]}'::jsonb,       '00000000-0000-0000-0000-000000000000'),
  ('IMO',   'Invoice Delivery',                  'Outbound invoices and invoice delivery to customers or partner channels',                     '{"tier":"Base","dependencies":["ACC","REL"]}'::jsonb,       '00000000-0000-0000-0000-000000000000'),
  ('CCON',  'Customer Contract Portal',          'Customer-visible contract access, commercial documents, and renewal interaction',             '{"tier":"Base","dependencies":["CONTRACT","CRM"]}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
  ('SOO',   'Sales Order Delivery',              'Outbound sales orders sent to fulfillment, distributors, or trading partners',                '{"tier":"Base","dependencies":["SALE","REL"]}'::jsonb,      '00000000-0000-0000-0000-000000000000'),
  ('SII',   'Sales Invoice Intake',              'Inbound customer-side sales invoice intake and validation from connected channels',           '{"tier":"Base","dependencies":["ACC","SALE"]}'::jsonb,      '00000000-0000-0000-0000-000000000000'),
  ('LOGX',  'Logistics Collaboration',           'Shipment visibility, transport milestone exchange, and logistics partner coordination',       '{"tier":"Base","dependencies":["LOGISTICS","REL"]}'::jsonb, '00000000-0000-0000-0000-000000000000')
on conflict (code) do update set
    name        = excluded.name,
    description = excluded.description,
    config      = excluded.config,
    updated_at  = now(),
    updated_by  = excluded.created_by;

-- ============================================================================
-- Link modules → workspaces
-- These UPDATEs always run; re-runs are idempotent (setting same value).
-- ============================================================================

-- CORE: cross-cutting platform modules
update shared.module
   set workspace_id = (select id from shared.workspace where code = 'CORE')
 where code in ('FND', 'META', 'IAM', 'AUD', 'POL', 'WFL', 'JOB', 'DOC', 'NTF', 'INT', 'CMS', 'ACT', 'REL')
   and exists (select 1 from shared.workspace where code = 'CORE');

-- FIN: finance modules
update shared.module
   set workspace_id = (select id from shared.workspace where code = 'FIN')
 where code in ('ACC', 'PAY', 'TREASURY', 'BUDGET', 'PAYG')
   and exists (select 1 from shared.workspace where code = 'FIN');

-- SCM: supply chain modules
update shared.module
   set workspace_id = (select id from shared.workspace where code = 'SCM')
 where code in ('SRM', 'SOURCE', 'CONTRACT', 'BUY', 'INVENTORY', 'QMS', 'SUBCON', 'DEMAND', 'WMS', 'LOGISTICS')
   and exists (select 1 from shared.workspace where code = 'SCM');

-- COM: commercial modules
update shared.module
   set workspace_id = (select id from shared.workspace where code = 'COM')
 where code in ('CRM', 'SALE')
   and exists (select 1 from shared.workspace where code = 'COM');

-- PPL: people modules
update shared.module
   set workspace_id = (select id from shared.workspace where code = 'PPL')
 where code in ('HR', 'PAYROLL')
   and exists (select 1 from shared.workspace where code = 'PPL');

-- PRS: projects & services modules
update shared.module
   set workspace_id = (select id from shared.workspace where code = 'PRS')
 where code in ('PRJCOST', 'ITSM')
   and exists (select 1 from shared.workspace where code = 'PRS');

-- OPS: operations modules
update shared.module
   set workspace_id = (select id from shared.workspace where code = 'OPS')
 where code in ('MAINT', 'MFG')
   and exists (select 1 from shared.workspace where code = 'OPS');

-- AST: assets & facilities modules
update shared.module
   set workspace_id = (select id from shared.workspace where code = 'AST')
 where code in ('ASSET', 'ASSETREMS', 'ASSETFM')
   and exists (select 1 from shared.workspace where code = 'AST');

-- PTR: partner collaboration modules
update shared.module
   set workspace_id = (select id from shared.workspace where code = 'PTR')
 where code in ('PCON', 'OMI', 'IMO', 'CCON', 'SOO', 'SII', 'LOGX')
   and exists (select 1 from shared.workspace where code = 'PTR');

-- ============================================================================
-- Cleanup: remove obsolete workspace records no longer in the product taxonomy.
-- Module FKs are already reassigned above so deletes will not violate constraints.
-- ============================================================================
delete from shared.workspace
 where code in ('CXP', 'PMO', 'MFO', 'ASM', 'PRM');

-- Report
DO $$ DECLARE w int; m int; BEGIN
  SELECT count(*) INTO w FROM shared.workspace;
  SELECT count(*) INTO m FROM shared.module;
  RAISE NOTICE 'shared.workspace: % rows | shared.module: % rows', w, m;
END $$;
