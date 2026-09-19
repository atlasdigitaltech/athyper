-- seed-contract-version: 1
-- seed-pack: mesh.platform-catalog
-- seed-pack-version: 2.0.0
-- seed-dataset: platform.workspace-module-catalog
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Canonical Mesh application catalog","publisher":"Athyper","source_version":"mesh-platform-catalog.v2","retrieved_at":"2026-09-01","license":"internal"}
-- seed-plane: mesh
-- seed-tenant-scope: none
-- seed-natural-key: master.workspace(code);master.module(code)
-- seed-cross-file-ids: true
-- seed-id-strategy: deterministic-uuid:athyper-wave4-mesh-catalog-v1
-- seed-expected-row-count: query:wave4_mesh_platform_catalog
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false
-- seed-assertion: expected-count
-- seed-assertion: orphan
-- seed-assertion: uniqueness
-- seed-assertion: semantic

DO $guard$ BEGIN
  IF current_setting('app.database_plane', true) <> 'mesh' THEN
    RAISE EXCEPTION 'platform catalog pack requires app.database_plane=mesh';
  END IF;
END $guard$;

INSERT INTO master.workspace (id, code, name, description, sort_order, is_shared_infrastructure, metadata, status, created_by)
VALUES
    (md5('mesh:workspace:' || 'core')::uuid, 'core', 'Core Platform', 'Meta-driven runtime, authentication, and platform services', 10, true, '{"routeSlug":"core","visibility":"primary","_seed":{"pack":"mesh.platform-catalog","version":"2.0.0"}}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
    (md5('mesh:workspace:' || 'network_rel')::uuid, 'network_rel', 'Network & Relationships', 'Organization connectivity, discovery, and trusted partner relationships', 10, false, '{"routeSlug":"network-relationships","visibility":"primary","_seed":{"pack":"mesh.platform-catalog","version":"2.0.0"}}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
    (md5('mesh:workspace:' || 'commercial_collab')::uuid, 'commercial_collab', 'Commercial Collaboration', 'Partner collaboration on sourcing, contracts, and business transactions', 20, false, '{"routeSlug":"commercial-collaboration","visibility":"primary","_seed":{"pack":"mesh.platform-catalog","version":"2.0.0"}}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
    (md5('mesh:workspace:' || 'supply_services')::uuid, 'supply_services', 'Supply & Services Collaboration', 'Supply-chain fulfilment, external workforce, and partner-delivered services', 30, false, '{"routeSlug":"supply-services","visibility":"primary","_seed":{"pack":"mesh.platform-catalog","version":"2.0.0"}}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
    (md5('mesh:workspace:' || 'financial_collab')::uuid, 'financial_collab', 'Financial Collaboration', 'Payments, working capital, financing, and trade services collaboration', 40, false, '{"routeSlug":"financial-collaboration","visibility":"primary","_seed":{"pack":"mesh.platform-catalog","version":"2.0.0"}}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid)
ON CONFLICT (code) DO UPDATE SET
  name=excluded.name, description=excluded.description, sort_order=excluded.sort_order,
  is_shared_infrastructure=excluded.is_shared_infrastructure, metadata=excluded.metadata, status='active',
  updated_at=now(), updated_by=excluded.created_by
WHERE (master.workspace.name,master.workspace.description,master.workspace.sort_order,master.workspace.is_shared_infrastructure,master.workspace.metadata,master.workspace.status)
 IS DISTINCT FROM (excluded.name,excluded.description,excluded.sort_order,excluded.is_shared_infrastructure,excluded.metadata,'active'::shared.ref_status_d);

UPDATE master.workspace
SET status='deprecated',updated_at=now(),updated_by='00000000-0000-0000-0000-000000000000'::uuid
WHERE status='active'
  AND metadata #>> '{_seed,pack}'='mesh.platform-catalog'
  AND code NOT IN ('core','network_rel','commercial_collab','supply_services','financial_collab');

INSERT INTO master.module (id,code,name,description,workspace_id,config,metadata,status,created_by)
SELECT md5('mesh:module:' || seed_rows.code)::uuid, seed_rows.code,seed_rows.name,seed_rows.description,workspace.id,seed_rows.config,
       '{"_seed":{"pack":"mesh.platform-catalog","version":"2.0.0"}}'::jsonb,'active','00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
    ('fnd', 'Foundation Runtime', 'Meta-driven runtime engine', '{"tier":"Core"}'::jsonb, 'core'),
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
    ('npm', 'Network & Partner Management', 'Network organizations, connections, onboarding, users, roles, and trading relationships', '{"tier":"Base","dependencies":["fnd","rel","iam","wfl"]}'::jsonb, 'network_rel'),
    ('mkd', 'Marketplace & Discovery', 'Discovery of partners, products, services, capabilities, and business opportunities', '{"tier":"Base","dependencies":["npm","rel","cms"]}'::jsonb, 'network_rel'),
    ('rlc', 'Relationship Collaboration', 'Qualification, compliance, performance, risk, and relationship improvement', '{"tier":"Base","dependencies":["npm","pol","wfl","aud"]}'::jsonb, 'network_rel'),
    ('nin', 'Network Intelligence', 'Network activity, transactions, partner performance, supply signals, risk, and benchmarks', '{"tier":"Enterprise","dependencies":["npm","rlc"]}'::jsonb, 'network_rel'),
    ('mso', 'Sourcing', 'External participation in opportunities, proposals, communications, negotiations, and awards', '{"tier":"Base","dependencies":["npm","rlc","doc","wfl"]}'::jsonb, 'commercial_collab'),
    ('mct', 'Contract', 'External contract review, negotiation, redlining, acceptance, signature, obligations, and amendments', '{"tier":"Base","dependencies":["npm","doc","wfl"]}'::jsonb, 'commercial_collab'),
    ('btx', 'Business Transaction', 'Exchange of orders, confirmations, service sheets, invoices, credit notes, and exceptions', '{"tier":"Base","dependencies":["npm","int","doc","wfl"]}'::jsonb, 'commercial_collab'),
    ('scc', 'Supply Chain', 'Forecasts, commitments, inventory, shipments, deliveries, quality, returns, and logistics collaboration', '{"tier":"Base","dependencies":["npm","btx","int"]}'::jsonb, 'supply_services'),
    ('wsc', 'Workforce & Services', 'Engagements, workers, assignments, compliance, time, expenses, and deliverables collaboration', '{"tier":"Base","dependencies":["npm","btx","wfl"]}'::jsonb, 'supply_services'),
    ('pwc', 'Payments & Working Capital', 'Receivables visibility, payment tracking, remittance, queries, early payment, and settlement', '{"tier":"Enterprise","dependencies":["npm","btx","int"]}'::jsonb, 'financial_collab'),
    ('trf', 'Trade Finance', 'Letters of credit, guarantees, collections, trade documents, and financing instruments', '{"tier":"Enterprise","dependencies":["npm","btx","doc","wfl"]}'::jsonb, 'financial_collab'),
    ('fpg', 'Financing Programs', 'Supply-chain finance, receivables finance, dynamic discounting, and structured funding programs', '{"tier":"Enterprise","dependencies":["npm","pwc","trf"]}'::jsonb, 'financial_collab'),
    ('fpn', 'Financial Partner Network', 'Banks, funders, insurers, payment providers, and other financial-service partners', '{"tier":"Enterprise","dependencies":["npm","iam","pol"]}'::jsonb, 'financial_collab')
) AS seed_rows(code,name,description,config,workspace_code)
JOIN master.workspace ON workspace.code=seed_rows.workspace_code
ON CONFLICT (code) DO UPDATE SET
  name=excluded.name,description=excluded.description,workspace_id=excluded.workspace_id,config=excluded.config,
  metadata=excluded.metadata,status='active',updated_at=now(),updated_by=excluded.created_by
WHERE (master.module.name,master.module.description,master.module.workspace_id,master.module.config,master.module.metadata,master.module.status)
 IS DISTINCT FROM (excluded.name,excluded.description,excluded.workspace_id,excluded.config,excluded.metadata,'active'::shared.ref_status_d);

UPDATE master.module
SET status='deprecated',updated_at=now(),updated_by='00000000-0000-0000-0000-000000000000'::uuid
WHERE status='active'
  AND metadata #>> '{_seed,pack}'='mesh.platform-catalog'
  AND code NOT IN ('fnd','iam','aud','pol','wfl','job','doc','ntf','int','cms','act','rel','npm','mkd','rlc','nin','mso','mct','btx','scc','wsc','pwc','trf','fpg','fpn');

DO $assertions$ BEGIN
  IF (SELECT count(*) FROM master.workspace WHERE status='active') <> 5
     OR (SELECT count(*) FROM master.module WHERE status='active') <> 25 THEN
    RAISE EXCEPTION 'mesh platform catalog count mismatch';
  END IF;
  IF EXISTS (SELECT 1 FROM master.workspace WHERE code <> lower(code))
     OR EXISTS (SELECT 1 FROM master.module WHERE code <> lower(code)) THEN
    RAISE EXCEPTION 'mesh platform catalog contains non-canonical codes';
  END IF;
  IF EXISTS (SELECT 1 FROM master.module m LEFT JOIN master.workspace w ON w.id=m.workspace_id WHERE w.id IS NULL) THEN
    RAISE EXCEPTION 'mesh platform catalog contains orphan modules';
  END IF;
END $assertions$;
