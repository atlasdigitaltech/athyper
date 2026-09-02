-- seed-contract-version: 1
-- seed-pack: neon.platform-catalog
-- seed-pack-version: 2.0.0
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
    (md5('neon:workspace:' || 'mdg')::uuid, 'mdg', 'Master Data Governance', 'Trusted business partner, product, financial, organization, location, and reference data governance', 10, false, '{"routeSlug":"mdg","visibility":"primary","_seed":{"pack":"neon.platform-catalog","version":"2.0.0"}}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
    (md5('neon:workspace:' || 'fin')::uuid, 'fin', 'Finance', 'Accounting, payments, treasury, and budgeting', 20, false, '{"_seed":{"pack":"neon.platform-catalog","version":"2.0.0"}}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
    (md5('neon:workspace:' || 'scm')::uuid, 'scm', 'Supply Chain', 'Suppliers, sourcing, contracts, procurement, inventory, warehousing, quality, demand planning, and logistics', 30, false, '{"_seed":{"pack":"neon.platform-catalog","version":"2.0.0"}}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
    (md5('neon:workspace:' || 'com')::uuid, 'com', 'Commercial', 'Customer relationships, opportunities, sales orders, and invoicing', 40, false, '{"_seed":{"pack":"neon.platform-catalog","version":"2.0.0"}}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
    (md5('neon:workspace:' || 'ppl')::uuid, 'ppl', 'People', 'Employee lifecycle and payroll', 50, false, '{"_seed":{"pack":"neon.platform-catalog","version":"2.0.0"}}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
    (md5('neon:workspace:' || 'prs')::uuid, 'prs', 'Projects & Services', 'Projects, costing, tasks, and service desk', 60, false, '{"_seed":{"pack":"neon.platform-catalog","version":"2.0.0"}}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
    (md5('neon:workspace:' || 'ops')::uuid, 'ops', 'Operations', 'Production, BOMs, work orders, MRP, and maintenance', 70, false, '{"_seed":{"pack":"neon.platform-catalog","version":"2.0.0"}}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
    (md5('neon:workspace:' || 'ast')::uuid, 'ast', 'Assets & Facilities', 'Fixed assets, real estate, leases, and facilities', 80, false, '{"_seed":{"pack":"neon.platform-catalog","version":"2.0.0"}}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
    (md5('neon:workspace:' || 'core')::uuid, 'core', 'Core Platform', 'Meta-driven runtime, authentication, and platform services', 10, true, '{"_seed":{"pack":"neon.platform-catalog","version":"2.0.0"}}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid)
ON CONFLICT (code) DO UPDATE SET
  name=excluded.name, description=excluded.description, sort_order=excluded.sort_order,
  is_shared_infrastructure=excluded.is_shared_infrastructure, metadata=excluded.metadata, status='active',
  updated_at=now(), updated_by=excluded.created_by
WHERE (master.workspace.name,master.workspace.description,master.workspace.sort_order,master.workspace.is_shared_infrastructure,master.workspace.metadata,master.workspace.status)
 IS DISTINCT FROM (excluded.name,excluded.description,excluded.sort_order,excluded.is_shared_infrastructure,excluded.metadata,'active'::shared.ref_status_d);

UPDATE master.workspace SET status='deprecated',updated_at=now(),updated_by='00000000-0000-0000-0000-000000000000'::uuid
WHERE status='active' AND metadata #>> '{_seed,pack}'='neon.platform-catalog'
  AND metadata #>> '{_seed,version}'<>'2.0.0';

INSERT INTO master.module (id,code,name,description,workspace_id,config,metadata,status,created_by)
SELECT md5('neon:module:' || seed_rows.code)::uuid, seed_rows.code,seed_rows.name,seed_rows.description,workspace.id,seed_rows.config,
       '{"_seed":{"pack":"neon.platform-catalog","version":"2.0.0"}}'::jsonb,'active','00000000-0000-0000-0000-000000000000'::uuid
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
    ('bp', 'Business Partner Management', 'Governed organizations, persons, roles, relationships, and domain profiles', '{"tier":"Base","dependencies":["rel","wfl","aud"]}'::jsonb, 'mdg'),
    ('item', 'Product & Item Governance', 'Governed products, items, classifications, specifications, packaging, and lifecycle data', '{"tier":"Base","dependencies":["rel","wfl","aud"]}'::jsonb, 'mdg'),
    ('finmd', 'Financial Master Data', 'Governed accounts, financial dimensions, payment terms, banks, and tax reference data', '{"tier":"Base","dependencies":["rel","wfl","aud"]}'::jsonb, 'mdg'),
    ('org', 'Organization & Reference Data', 'Governed legal entities, business units, departments, sites, and enterprise reference data', '{"tier":"Base","dependencies":["rel","wfl","aud"]}'::jsonb, 'mdg'),
    ('loc', 'Location & Address Governance', 'Governed addresses, geographies, validation, and location relationships', '{"tier":"Base","dependencies":["rel","wfl","aud"]}'::jsonb, 'mdg'),
    ('dqs', 'Data Quality & Stewardship', 'Data-quality rules, duplicate management, stewardship worklists, exceptions, and remediation', '{"tier":"Base","dependencies":["rel","pol","wfl","aud"]}'::jsonb, 'mdg'),
    ('acc', 'Financial Accounting', 'Ledgers, journals, intercompany accounting, closing, and financial reporting', '{"tier":"Base","dependencies":["fnd"]}'::jsonb, 'fin'),
    ('ap', 'Accounts Payable', 'Supplier invoices, advances, liabilities, payment preparation, and payables monitoring', '{"tier":"Base","dependencies":["acc","bp"]}'::jsonb, 'fin'),
    ('ar', 'Accounts Receivable', 'Customer billing, receivables, receipts, collections, and account monitoring', '{"tier":"Base","dependencies":["acc","bp"]}'::jsonb, 'fin'),
    ('treasury', 'Cash & Treasury Management', 'Cash, banks, payments, settlements, liquidity, financing, and foreign exchange', '{"tier":"Base","dependencies":["acc","ap","ar"]}'::jsonb, 'fin'),
    ('budget', 'Budget & Funds Control', 'Budget planning, allocation, commitment control, availability checks, and budget consumption tracking', '{"tier":"Enterprise","dependencies":["acc","wfl"]}'::jsonb, 'fin'),
    ('tax', 'Tax Management', 'Indirect and withholding tax, electronic invoicing, returns, settlement, and statutory compliance', '{"tier":"Enterprise","dependencies":["acc","ap","ar"]}'::jsonb, 'fin'),
    ('faa', 'Fixed Asset Accounting', 'Capitalization, depreciation, valuation, accounting transfers, retirement, and asset reporting', '{"tier":"Enterprise","dependencies":["acc","asset"]}'::jsonb, 'fin'),
    ('srm', 'Supplier Management', 'Supplier lifecycle, qualification, performance, risk, and development', '{"tier":"Base","dependencies":["bp","wfl","aud"]}'::jsonb, 'scm'),
    ('source', 'Strategic Sourcing', 'Sourcing intake, events, responses, evaluations, negotiation, and awards', '{"tier":"Base","dependencies":["bp","wfl","doc","ntf"]}'::jsonb, 'scm'),
    ('contract', 'Contract Management', 'Commercial contracts, terms, obligations', '{"tier":"Base","dependencies":["rel","wfl","doc","ntf"]}'::jsonb, 'scm'),
    ('buy', 'Procurement', 'Purchasing, requisitions, POs', '{"tier":"Base","dependencies":["fnd","rel"]}'::jsonb, 'scm'),
    ('inventory', 'Inventory Management', 'Inventory, valuation, movements', '{"tier":"Base","dependencies":["fnd","rel","acc"]}'::jsonb, 'scm'),
    ('qms', 'Quality Management', 'Inspections, QC processes', '{"tier":"Base","dependencies":["inventory"]}'::jsonb, 'scm'),
    ('demand', 'Demand & Supply Planning', 'Demand forecasting, supply balancing, requirements, inventory, and planning scenarios', '{"tier":"Enterprise","dependencies":["inventory","sale"]}'::jsonb, 'scm'),
    ('wms', 'Warehouse Management', 'Bin management, putaway, picking, packing, cycle counting, barcode/RFID', '{"tier":"Enterprise","dependencies":["inventory"]}'::jsonb, 'scm'),
    ('logistics', 'Transportation & Logistics', 'Shipment planning, carriers, freight costs, delivery tracking', '{"tier":"Enterprise","dependencies":["wms","inventory"]}'::jsonb, 'scm'),
    ('crm', 'Customer Relationship Management', 'Leads, opportunities, pipeline management', '{"tier":"Base","dependencies":["rel"]}'::jsonb, 'com'),
    ('sale', 'Sales & Order Management', 'Sales cycle, orders, invoicing', '{"tier":"Base","dependencies":["fnd","rel"]}'::jsonb, 'com'),
    ('pcm', 'Pricing & Commercial Management', 'Prices, discounts, promotions, rebates, commercial terms, and margin performance', '{"tier":"Enterprise","dependencies":["crm","sale"]}'::jsonb, 'com'),
    ('hr', 'Core Human Resources', 'Workforce records, employment, organizations, positions, compensation, benefits, and employee services', '{"tier":"Base","dependencies":["fnd","rel"]}'::jsonb, 'ppl'),
    ('tna', 'Time & Attendance', 'Schedules, attendance, time recording, leave, overtime, approvals, and compliance', '{"tier":"Base","dependencies":["hr","wfl"]}'::jsonb, 'ppl'),
    ('tal', 'Talent Management', 'Recruitment, onboarding, performance, learning, succession, and offboarding', '{"tier":"Enterprise","dependencies":["hr","wfl"]}'::jsonb, 'ppl'),
    ('payroll', 'Payroll', 'Salaries, statutory compliance', '{"tier":"Base","dependencies":["hr","acc"]}'::jsonb, 'ppl'),
    ('workforce', 'External Workforce', 'Contractors, contingent workers, engagements, compliance, time, expenses, and approvals', '{"tier":"Base","dependencies":["hr","buy","wfl"]}'::jsonb, 'ppl'),
    ('prjcost', 'Project Management', 'Project, Task, Project budgets, WBS, cost tracking, revenue recognition', '{"tier":"Base","dependencies":["acc","budget"]}'::jsonb, 'prs'),
    ('psa', 'Professional Services', 'Customer engagements, staffing, time, expenses, deliverables, billing, revenue, and profitability', '{"tier":"Enterprise","dependencies":["prjcost","hr","acc"]}'::jsonb, 'prs'),
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

UPDATE master.module SET status='deprecated',updated_at=now(),updated_by='00000000-0000-0000-0000-000000000000'::uuid
WHERE status='active' AND metadata #>> '{_seed,pack}'='neon.platform-catalog'
  AND metadata #>> '{_seed,version}'<>'2.0.0';

DO $assertions$ BEGIN
  IF (SELECT count(*) FROM master.workspace WHERE status='active') <> 9
     OR (SELECT count(*) FROM master.module WHERE status='active') <> 51 THEN
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
