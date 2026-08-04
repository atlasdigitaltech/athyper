-- seed-contract-version: 1
-- seed-pack: neon.platform-catalog
-- seed-pack-version: 1.0.0
-- seed-dataset: platform.workspace-module-catalog
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Wave 4 platform catalog rewrite","publisher":"Athyper","source_version":"wave4-platform-catalog.v1","retrieved_at":"2026-08-03","license":"internal"}
-- seed-plane: neon
-- seed-tenant-scope: none
-- seed-natural-key: master.workspace(code);master.module(code)
-- seed-cross-file-ids: true
-- seed-id-strategy: deterministic-uuid:athyper-wave4-neon-catalog-v1
-- seed-expected-row-count: query:wave4_neon_platform_catalog
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false
-- seed-assertion: expected-count
-- seed-assertion: orphan
-- seed-assertion: uniqueness
-- seed-assertion: semantic

DO $guard$ BEGIN
  IF current_setting('app.database_plane', true) <> 'neon' THEN
    RAISE EXCEPTION 'platform catalog pack requires app.database_plane=neon';
  END IF;
END $guard$;

INSERT INTO master.workspace (id, code, name, description, sort_order, is_shared_infrastructure, metadata, status, created_by)
VALUES
    (md5('neon:workspace:' || 'fin')::uuid, 'fin', 'Finance', 'Accounting, payments, treasury, and budgeting', 20, false, '{"_seed":{"pack":"neon.platform-catalog","version":"1.0.0"}}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
    (md5('neon:workspace:' || 'scm')::uuid, 'scm', 'Supply Chain', 'Suppliers, sourcing, contracts, procurement, inventory, warehousing, quality, demand planning, and logistics', 30, false, '{"_seed":{"pack":"neon.platform-catalog","version":"1.0.0"}}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
    (md5('neon:workspace:' || 'com')::uuid, 'com', 'Commercial', 'Customer relationships, opportunities, sales orders, and invoicing', 40, false, '{"_seed":{"pack":"neon.platform-catalog","version":"1.0.0"}}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
    (md5('neon:workspace:' || 'ppl')::uuid, 'ppl', 'People', 'Employee lifecycle and payroll', 50, false, '{"_seed":{"pack":"neon.platform-catalog","version":"1.0.0"}}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
    (md5('neon:workspace:' || 'prs')::uuid, 'prs', 'Projects & Services', 'Projects, costing, tasks, and service desk', 60, false, '{"_seed":{"pack":"neon.platform-catalog","version":"1.0.0"}}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
    (md5('neon:workspace:' || 'ops')::uuid, 'ops', 'Operations', 'Production, BOMs, work orders, MRP, and maintenance', 70, false, '{"_seed":{"pack":"neon.platform-catalog","version":"1.0.0"}}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
    (md5('neon:workspace:' || 'ast')::uuid, 'ast', 'Assets & Facilities', 'Fixed assets, real estate, leases, and facilities', 80, false, '{"_seed":{"pack":"neon.platform-catalog","version":"1.0.0"}}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
    (md5('neon:workspace:' || 'core')::uuid, 'core', 'Core Platform', 'Meta-driven runtime, authentication, and platform services', 10, true, '{"_seed":{"pack":"neon.platform-catalog","version":"1.0.0"}}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid)
ON CONFLICT (code) DO UPDATE SET
  name=excluded.name, description=excluded.description, sort_order=excluded.sort_order,
  is_shared_infrastructure=excluded.is_shared_infrastructure, metadata=excluded.metadata, status='active',
  updated_at=now(), updated_by=excluded.created_by
WHERE (master.workspace.name,master.workspace.description,master.workspace.sort_order,master.workspace.is_shared_infrastructure,master.workspace.metadata,master.workspace.status)
 IS DISTINCT FROM (excluded.name,excluded.description,excluded.sort_order,excluded.is_shared_infrastructure,excluded.metadata,'active'::shared.ref_status_d);

INSERT INTO master.module (id,code,name,description,workspace_id,config,metadata,status,created_by)
SELECT md5('neon:module:' || seed_rows.code)::uuid, seed_rows.code,seed_rows.name,seed_rows.description,workspace.id,seed_rows.config,
       '{"_seed":{"pack":"neon.platform-catalog","version":"1.0.0"}}'::jsonb,'active','00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
    ('fnd', 'Foundation Runtime', 'Meta-driven runtime engine', '{"tier":"Core"}'::jsonb, 'core'),
    ('meta', 'Metadata Studio', 'Declarative configuration', '{"tier":"Core"}'::jsonb, 'core'),
    ('iam', 'Identity & Access Management', 'Authentication and authorization', '{"tier":"Core"}'::jsonb, 'core'),
    ('aud', 'Audit & Governance', 'Audit trails and compliance', '{"tier":"Core"}'::jsonb, 'core'),
    ('pol', 'Policy & Rules Engine', 'Business rules and validations', '{"tier":"Core"}'::jsonb, 'core'),
    ('wfl', 'Workflow Engine', 'State machines and approvals', '{"tier":"Core"}'::jsonb, 'core'),
    ('job', 'Automation & Jobs', 'Schedulers and background tasks', '{"tier":"Core"}'::jsonb, 'core'),
    ('doc', 'Document Services', 'PDF/HTML generation', '{"tier":"Core"}'::jsonb, 'core'),
    ('ntf', 'Notification Services', 'Email and alerts', '{"tier":"Core"}'::jsonb, 'core'),
    ('int', 'Integration Hub', 'API gateway and webhooks', '{"tier":"Core"}'::jsonb, 'core'),
    ('cms', 'Content Services', 'Document storage', '{"tier":"Core"}'::jsonb, 'core'),
    ('act', 'Activity & Commentary', 'Comments and timelines', '{"tier":"Core"}'::jsonb, 'core'),
    ('rel', 'Reference & Shared Data', 'Reference & Shared Data', '{"tier":"Core"}'::jsonb, 'core'),
    ('acc', 'Core Accounting', 'General Ledger, AP, AR, fiscal controls', '{"tier":"Base","dependencies":["fnd"]}'::jsonb, 'fin'),
    ('pay', 'Payment Processing', 'Collections, disbursements, reconciliation', '{"tier":"Base","dependencies":["acc"],"is_shared_infrastructure":true}'::jsonb, 'fin'),
    ('treasury', 'Treasury & Cash Management', 'Cash positioning, bank accounts, liquidity, FX exposure, bank reconciliation, funding', '{"tier":"Base","dependencies":["acc","pay"]}'::jsonb, 'fin'),
    ('budget', 'Budget & Funds Control', 'Budget planning, allocation, commitment control, availability checks, and budget consumption tracking', '{"tier":"Enterprise","dependencies":["acc","wfl"]}'::jsonb, 'fin'),
    ('payg', 'Payment Gateway', 'External payment providers (Stripe, etc.)', '{"tier":"Professional","dependencies":["pay"]}'::jsonb, 'fin'),
    ('srm', 'Supplier Relationship Management', 'Supplier Lifecycle and Performance Management', '{"tier":"Base","dependencies":["rel","wfl","aud"]}'::jsonb, 'scm'),
    ('source', 'Sourcing', 'RFQs, bids, supplier selection', '{"tier":"Base","dependencies":["rel","wfl","doc","ntf"]}'::jsonb, 'scm'),
    ('contract', 'Contract Management', 'Commercial contracts, terms, obligations', '{"tier":"Base","dependencies":["rel","wfl","doc","ntf"]}'::jsonb, 'scm'),
    ('buy', 'Procurement', 'Purchasing, requisitions, POs', '{"tier":"Base","dependencies":["fnd","rel"]}'::jsonb, 'scm'),
    ('inventory', 'Inventory Management', 'Inventory, valuation, movements', '{"tier":"Base","dependencies":["fnd","rel","acc"]}'::jsonb, 'scm'),
    ('qms', 'Quality Management', 'Inspections, QC processes', '{"tier":"Base","dependencies":["inventory"]}'::jsonb, 'scm'),
    ('subcon', 'Subcontracting', 'Job subcontract workflows', '{"tier":"Base","dependencies":["buy","inventory"]}'::jsonb, 'scm'),
    ('demand', 'Demand Planning & Forecasting', 'Statistical & AI-based demand forecasting, planning scenarios', '{"tier":"Enterprise","dependencies":["inventory","sale"]}'::jsonb, 'scm'),
    ('wms', 'Warehouse Management', 'Bin management, putaway, picking, packing, cycle counting, barcode/RFID', '{"tier":"Enterprise","dependencies":["inventory"]}'::jsonb, 'scm'),
    ('logistics', 'Transportation & Logistics', 'Shipment planning, carriers, freight costs, delivery tracking', '{"tier":"Enterprise","dependencies":["wms","inventory"]}'::jsonb, 'scm'),
    ('crm', 'Customer Relationship Management', 'Leads, opportunities, pipeline management', '{"tier":"Base","dependencies":["rel"]}'::jsonb, 'com'),
    ('sale', 'Sales & Order Management', 'Sales cycle, orders, invoicing', '{"tier":"Base","dependencies":["fnd","rel"]}'::jsonb, 'com'),
    ('hr', 'Human Resources', 'Employee lifecycle, organization structure', '{"tier":"Base","dependencies":["fnd","rel"]}'::jsonb, 'ppl'),
    ('payroll', 'Payroll', 'Salaries, statutory compliance', '{"tier":"Base","dependencies":["hr","acc"]}'::jsonb, 'ppl'),
    ('prjcost', 'Project Management', 'Project, Task, Project budgets, WBS, cost tracking, revenue recognition', '{"tier":"Base","dependencies":["acc","budget"]}'::jsonb, 'prs'),
    ('itsm', 'Service Management', 'Tickets, SLAs, service workflows', '{"tier":"Base","dependencies":["fnd","wfl","asset","ntf","aud"]}'::jsonb, 'prs'),
    ('maint', 'Maintenance Management', 'Preventive & corrective maintenance', '{"tier":"Base","dependencies":["buy","asset","inventory"]}'::jsonb, 'ops'),
    ('mfg', 'Manufacturing', 'BOMs, work orders, MRP', '{"tier":"Base","dependencies":["inventory"]}'::jsonb, 'ops'),
    ('asset', 'Asset Management', 'Asset lifecycle, depreciation', '{"tier":"Enterprise","dependencies":["fnd","acc","aud"]}'::jsonb, 'ast'),
    ('assetrems', 'Real Estate Asset Management', 'Property, lease, tenancy, rental billing, CAM charges, asset depreciation', '{"tier":"Enterprise","dependencies":["asset","acc","contract"]}'::jsonb, 'ast'),
    ('assetfm', 'Facility Management', 'Buildings, utilities, space, maintenance cost centers', '{"tier":"Base","dependencies":["asset","maint"]}'::jsonb, 'ast')
) AS seed_rows(code,name,description,config,workspace_code)
JOIN master.workspace ON workspace.code=seed_rows.workspace_code
ON CONFLICT (code) DO UPDATE SET
  name=excluded.name,description=excluded.description,workspace_id=excluded.workspace_id,config=excluded.config,
  metadata=excluded.metadata,status='active',updated_at=now(),updated_by=excluded.created_by
WHERE (master.module.name,master.module.description,master.module.workspace_id,master.module.config,master.module.metadata,master.module.status)
 IS DISTINCT FROM (excluded.name,excluded.description,excluded.workspace_id,excluded.config,excluded.metadata,'active'::shared.ref_status_d);

DO $assertions$ BEGIN
  IF (SELECT count(*) FROM master.workspace WHERE status='active') <> 8
     OR (SELECT count(*) FROM master.module WHERE status='active') <> 39 THEN
    RAISE EXCEPTION 'neon platform catalog count mismatch';
  END IF;
  IF EXISTS (SELECT 1 FROM master.workspace WHERE code <> lower(code))
     OR EXISTS (SELECT 1 FROM master.module WHERE code <> lower(code)) THEN
    RAISE EXCEPTION 'neon platform catalog contains non-canonical codes';
  END IF;
  IF EXISTS (SELECT 1 FROM master.module m LEFT JOIN master.workspace w ON w.id=m.workspace_id WHERE w.id IS NULL) THEN
    RAISE EXCEPTION 'neon platform catalog contains orphan modules';
  END IF;
END $assertions$;
