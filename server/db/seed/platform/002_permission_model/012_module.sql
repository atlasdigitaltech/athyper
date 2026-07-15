-- Product modules + workspace linkage (NEON DB catalog). Depends on 011_workspace.sql.
-- CORE workspace is re-asserted here (not in 011) so a full DB reset is self-contained.
-- PTR (Partner Collaboration) is intentionally NOT seeded here — it lives only in the
-- mesh DB catalog under _mesh/013_workspace_module.sql.
-- CORE.is_shared_infrastructure=true: descriptor-layer reads (compiled-entity,
-- runtime-options reference targets) bypass the module-access gate so cross-module
-- reference fields like purchase_invoice_line.shipto_address_id can resolve the
-- `address` descriptor without every PI user holding the IAM grant. Records APIs,
-- writes, navigation, and admin consoles still enforce module access normally.
INSERT INTO shared.workspace (code, name, description, sort_order, is_shared_infrastructure, created_by)
VALUES
  ('CORE', 'Core Platform', 'Meta-driven runtime, authentication, and platform services', 10, true,  '00000000-0000-0000-0000-000000000000')
ON CONFLICT (code) DO UPDATE SET
  name        = excluded.name,
  description = excluded.description,
  sort_order  = excluded.sort_order,
  is_shared_infrastructure = excluded.is_shared_infrastructure,
  updated_at  = now(),
  updated_by  = excluded.created_by;

INSERT INTO shared.module (code, name, description, config, created_by)
VALUES
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

    ('ACC',      'Core Accounting',                   'General Ledger, AP, AR, fiscal controls',                                                                   '{"tier":"Base","dependencies":["FND"]}'::jsonb,                  '00000000-0000-0000-0000-000000000000'),
    -- PAY.config.is_shared_infrastructure=true: descriptor-layer reads (compiled-entity,
    -- runtime-options reference targets) bypass module-access gating for PAY. Records APIs,
    -- writes, navigation, and admin consoles still enforce normal module access. Needed so
    -- BUY/SALE/ACC documents can resolve reference fields like `purchase_order.payment_term_id`,
    -- `purchase_invoice.payment_method_id`, and bank/holiday lookups without every user
    -- holding a PAY grant. PAY hosts pure lookup dictionaries (payment_term, payment_method,
    -- bank_party, holiday_calendar) shared as reference data across procurement/sales/finance.
    ('PAY',      'Payment Processing',                'Collections, disbursements, reconciliation',                                                                 '{"tier":"Base","dependencies":["ACC"],"is_shared_infrastructure":true}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('TREASURY', 'Treasury & Cash Management',        'Cash positioning, bank accounts, liquidity, FX exposure, bank reconciliation, funding',                      '{"tier":"Base","dependencies":["ACC","PAY"]}'::jsonb,            '00000000-0000-0000-0000-000000000000'),
    ('BUDGET',   'Budget & Funds Control',            'Budget planning, allocation, commitment control, availability checks, and budget consumption tracking',      '{"tier":"Enterprise","dependencies":["ACC","WFL"]}'::jsonb,      '00000000-0000-0000-0000-000000000000'),
    ('PAYG',     'Payment Gateway',                   'External payment providers (Stripe, etc.)',                                                                  '{"tier":"Professional","dependencies":["PAY"]}'::jsonb,          '00000000-0000-0000-0000-000000000000'),

    ('SRM',       'Supplier Relationship Management', 'Supplier Lifecycle and Performance Management',                                                             '{"tier":"Base","dependencies":["REL","WFL","AUD"]}'::jsonb,      '00000000-0000-0000-0000-000000000000'),
    ('SOURCE',    'Sourcing',                         'RFQs, bids, supplier selection',                                                                            '{"tier":"Base","dependencies":["REL","WFL","DOC","NTF"]}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('CONTRACT',  'Contract Management',              'Commercial contracts, terms, obligations',                                                                   '{"tier":"Base","dependencies":["REL","WFL","DOC","NTF"]}'::jsonb, '00000000-0000-0000-0000-000000000000'),
    ('BUY',       'Procurement',                      'Purchasing, requisitions, POs',                                                                             '{"tier":"Base","dependencies":["FND","REL"]}'::jsonb,            '00000000-0000-0000-0000-000000000000'),
    ('INVENTORY', 'Inventory Management',             'Inventory, valuation, movements',                                                                           '{"tier":"Base","dependencies":["FND","REL","ACC"]}'::jsonb,      '00000000-0000-0000-0000-000000000000'),
    ('QMS',       'Quality Management',               'Inspections, QC processes',                                                                                 '{"tier":"Base","dependencies":["INVENTORY"]}'::jsonb,            '00000000-0000-0000-0000-000000000000'),
    ('SUBCON',    'Subcontracting',                   'Job subcontract workflows',                                                                                  '{"tier":"Base","dependencies":["BUY","INVENTORY"]}'::jsonb,      '00000000-0000-0000-0000-000000000000'),
    ('DEMAND',    'Demand Planning & Forecasting',    'Statistical & AI-based demand forecasting, planning scenarios',                                              '{"tier":"Enterprise","dependencies":["INVENTORY","SALE"]}'::jsonb,'00000000-0000-0000-0000-000000000000'),
    ('WMS',       'Warehouse Management',             'Bin management, putaway, picking, packing, cycle counting, barcode/RFID',                                   '{"tier":"Enterprise","dependencies":["INVENTORY"]}'::jsonb,      '00000000-0000-0000-0000-000000000000'),
    ('LOGISTICS', 'Transportation & Logistics',       'Shipment planning, carriers, freight costs, delivery tracking',                                              '{"tier":"Enterprise","dependencies":["WMS","INVENTORY"]}'::jsonb, '00000000-0000-0000-0000-000000000000'),

    ('CRM',  'Customer Relationship Management',      'Leads, opportunities, pipeline management',                                                                  '{"tier":"Base","dependencies":["REL"]}'::jsonb,                  '00000000-0000-0000-0000-000000000000'),
    ('SALE', 'Sales & Order Management',              'Sales cycle, orders, invoicing',                                                                             '{"tier":"Base","dependencies":["FND","REL"]}'::jsonb,            '00000000-0000-0000-0000-000000000000'),

    ('HR',      'Human Resources',                    'Employee lifecycle, organization structure',                                                                 '{"tier":"Base","dependencies":["FND","REL"]}'::jsonb,            '00000000-0000-0000-0000-000000000000'),
    ('PAYROLL', 'Payroll',                            'Salaries, statutory compliance',                                                                             '{"tier":"Base","dependencies":["HR","ACC"]}'::jsonb,             '00000000-0000-0000-0000-000000000000'),

    ('PRJCOST', 'Project Management',                 'Project, Task, Project budgets, WBS, cost tracking, revenue recognition',                                    '{"tier":"Base","dependencies":["ACC","BUDGET"]}'::jsonb,          '00000000-0000-0000-0000-000000000000'),
    ('ITSM',    'Service Management',                 'Tickets, SLAs, service workflows',                                                                           '{"tier":"Base","dependencies":["FND","WFL","ASSET","NTF","AUD"]}'::jsonb, '00000000-0000-0000-0000-000000000000'),

    ('MAINT', 'Maintenance Management',               'Preventive & corrective maintenance',                                                                        '{"tier":"Base","dependencies":["BUY","ASSET","INVENTORY"]}'::jsonb,'00000000-0000-0000-0000-000000000000'),
    ('MFG',   'Manufacturing',                        'BOMs, work orders, MRP',                                                                                    '{"tier":"Base","dependencies":["INVENTORY"]}'::jsonb,            '00000000-0000-0000-0000-000000000000'),

    ('ASSET',     'Asset Management',                 'Asset lifecycle, depreciation',                                                                              '{"tier":"Enterprise","dependencies":["FND","ACC","AUD"]}'::jsonb,       '00000000-0000-0000-0000-000000000000'),
    ('ASSETREMS', 'Real Estate Asset Management',     'Property, lease, tenancy, rental billing, CAM charges, asset depreciation',                                  '{"tier":"Enterprise","dependencies":["ASSET","ACC","CONTRACT"]}'::jsonb,  '00000000-0000-0000-0000-000000000000'),
    ('ASSETFM',   'Facility Management',              'Buildings, utilities, space, maintenance cost centers',                                                      '{"tier":"Base","dependencies":["ASSET","MAINT"]}'::jsonb,               '00000000-0000-0000-0000-000000000000')

ON CONFLICT (code) DO UPDATE SET
    name        = excluded.name,
    description = excluded.description,
    config      = excluded.config,
    updated_at  = now(),
    updated_by  = excluded.created_by;

-- Workspace linkage via array matching.
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
    ('AST',  ARRAY['ASSET','ASSETREMS','ASSETFM'])
) AS wm(wcode, mcodes) ON w.code = wm.wcode
WHERE  m.code = ANY(wm.mcodes);

-- Retire PTR (Partner Collaboration) from the neon catalog — moved to mesh DB
-- under _mesh/013_workspace_module.sql. Delete modules first (FK RESTRICT to workspace).
DELETE FROM shared.module    WHERE code IN ('PCON','OMI','IMO','CCON','SOO','SII','LOGX');
DELETE FROM shared.workspace WHERE code = 'PTR';

-- Drop retired workspace codes. Must run AFTER the module FK reassignment above.
DELETE FROM shared.workspace WHERE code IN ('CXP','PMO','MFO','ASM','PRM');

DO $$ DECLARE w int; m int; BEGIN
  SELECT count(*) INTO w FROM shared.workspace;
  SELECT count(*) INTO m FROM shared.module;
  RAISE NOTICE '[012_module] shared.workspace: % rows | shared.module: % rows (neon expected: 8 / 39)', w, m;
  IF w <> 8 OR m <> 39 THEN
    RAISE EXCEPTION '[012_module] neon catalog mismatch — expected 8 workspaces + 39 modules, got % / %', w, m;
  END IF;
END $$;
