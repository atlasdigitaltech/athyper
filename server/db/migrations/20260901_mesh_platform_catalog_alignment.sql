BEGIN;

DO $$ BEGIN
  IF current_database() <> 'athyper_mesh' OR current_setting('app.database_plane', true) <> 'mesh' THEN
    RAISE EXCEPTION 'Mesh platform catalog alignment requires the MESH plane';
  END IF;
END $$;

INSERT INTO master.workspace (id,code,name,description,sort_order,is_shared_infrastructure,metadata,status,created_by)
VALUES
  (md5('mesh:workspace:core')::uuid,'core','Core Platform','Meta-driven runtime, authentication, and platform services',10,true,'{"routeSlug":"core","visibility":"primary","_seed":{"pack":"mesh.platform-catalog","version":"2.0.0"}}','active','00000000-0000-0000-0000-000000000000'),
  (md5('mesh:workspace:network_rel')::uuid,'network_rel','Network & Relationships','Organization connectivity, discovery, and trusted partner relationships',10,false,'{"routeSlug":"network-relationships","visibility":"primary","_seed":{"pack":"mesh.platform-catalog","version":"2.0.0"}}','active','00000000-0000-0000-0000-000000000000'),
  (md5('mesh:workspace:commercial_collab')::uuid,'commercial_collab','Commercial Collaboration','Partner collaboration on sourcing, contracts, and business transactions',20,false,'{"routeSlug":"commercial-collaboration","visibility":"primary","_seed":{"pack":"mesh.platform-catalog","version":"2.0.0"}}','active','00000000-0000-0000-0000-000000000000'),
  (md5('mesh:workspace:supply_services')::uuid,'supply_services','Supply & Services Collaboration','Supply-chain fulfilment, external workforce, and partner-delivered services',30,false,'{"routeSlug":"supply-services","visibility":"primary","_seed":{"pack":"mesh.platform-catalog","version":"2.0.0"}}','active','00000000-0000-0000-0000-000000000000'),
  (md5('mesh:workspace:financial_collab')::uuid,'financial_collab','Financial Collaboration','Payments, working capital, financing, and trade services collaboration',40,false,'{"routeSlug":"financial-collaboration","visibility":"primary","_seed":{"pack":"mesh.platform-catalog","version":"2.0.0"}}','active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (code) DO UPDATE SET
  name=excluded.name,description=excluded.description,sort_order=excluded.sort_order,
  is_shared_infrastructure=excluded.is_shared_infrastructure,metadata=excluded.metadata,status='active',
  updated_at=now(),updated_by=excluded.created_by;

UPDATE master.workspace
SET status='deprecated',updated_at=now(),updated_by='00000000-0000-0000-0000-000000000000'
WHERE status='active' AND metadata #>> '{_seed,pack}'='mesh.platform-catalog'
  AND code NOT IN ('core','network_rel','commercial_collab','supply_services','financial_collab');

INSERT INTO master.module (id,code,name,description,workspace_id,config,metadata,status,created_by)
SELECT md5('mesh:module:' || seed.code)::uuid,seed.code,seed.name,seed.description,workspace.id,seed.config,
       '{"_seed":{"pack":"mesh.platform-catalog","version":"2.0.0"}}','active','00000000-0000-0000-0000-000000000000'
FROM (VALUES
  ('fnd','Foundation Runtime','Meta-driven runtime engine','{"tier":"Core"}'::jsonb,'core'),
  ('iam','Identity & Access Management','Authentication and authorization','{"tier":"Core"}'::jsonb,'core'),
  ('aud','Audit & Governance','Audit trails and compliance','{"tier":"Core"}'::jsonb,'core'),
  ('pol','Policy & Rules Engine','Business rules and validations','{"tier":"Core"}'::jsonb,'core'),
  ('wfl','Workflow Engine','State machines and approvals','{"tier":"Core"}'::jsonb,'core'),
  ('job','Automation & Jobs','Schedulers and background tasks','{"tier":"Core"}'::jsonb,'core'),
  ('doc','Document Services','PDF/HTML generation','{"tier":"Core"}'::jsonb,'core'),
  ('ntf','Notification Services','Email and alerts','{"tier":"Core"}'::jsonb,'core'),
  ('int','Integration Hub','API gateway and webhooks','{"tier":"Core"}'::jsonb,'core'),
  ('cms','Content Services','Document storage','{"tier":"Core"}'::jsonb,'core'),
  ('act','Activity & Commentary','Comments and timelines','{"tier":"Core"}'::jsonb,'core'),
  ('rel','Reference & Shared Data','Reference & Shared Data','{"tier":"Core"}'::jsonb,'core'),
  ('npm','Network & Partner Management','Network organizations, connections, onboarding, users, roles, and trading relationships','{"tier":"Base","dependencies":["fnd","rel","iam","wfl"]}'::jsonb,'network_rel'),
  ('mkd','Marketplace & Discovery','Discovery of partners, products, services, capabilities, and business opportunities','{"tier":"Base","dependencies":["npm","rel","cms"]}'::jsonb,'network_rel'),
  ('rlc','Relationship Collaboration','Qualification, compliance, performance, risk, and relationship improvement','{"tier":"Base","dependencies":["npm","pol","wfl","aud"]}'::jsonb,'network_rel'),
  ('nin','Network Intelligence','Network activity, transactions, partner performance, supply signals, risk, and benchmarks','{"tier":"Enterprise","dependencies":["npm","rlc"]}'::jsonb,'network_rel'),
  ('mso','Sourcing','External participation in opportunities, proposals, communications, negotiations, and awards','{"tier":"Base","dependencies":["npm","rlc","doc","wfl"]}'::jsonb,'commercial_collab'),
  ('mct','Contract','External contract review, negotiation, redlining, acceptance, signature, obligations, and amendments','{"tier":"Base","dependencies":["npm","doc","wfl"]}'::jsonb,'commercial_collab'),
  ('btx','Business Transaction','Exchange of orders, confirmations, service sheets, invoices, credit notes, and exceptions','{"tier":"Base","dependencies":["npm","int","doc","wfl"]}'::jsonb,'commercial_collab'),
  ('scc','Supply Chain','Forecasts, commitments, inventory, shipments, deliveries, quality, returns, and logistics collaboration','{"tier":"Base","dependencies":["npm","btx","int"]}'::jsonb,'supply_services'),
  ('wsc','Workforce & Services','Engagements, workers, assignments, compliance, time, expenses, and deliverables collaboration','{"tier":"Base","dependencies":["npm","btx","wfl"]}'::jsonb,'supply_services'),
  ('pwc','Payments & Working Capital','Receivables visibility, payment tracking, remittance, queries, early payment, and settlement','{"tier":"Enterprise","dependencies":["npm","btx","int"]}'::jsonb,'financial_collab'),
  ('trf','Trade Finance','Letters of credit, guarantees, collections, trade documents, and financing instruments','{"tier":"Enterprise","dependencies":["npm","btx","doc","wfl"]}'::jsonb,'financial_collab'),
  ('fpg','Financing Programs','Supply-chain finance, receivables finance, dynamic discounting, and structured funding programs','{"tier":"Enterprise","dependencies":["npm","pwc","trf"]}'::jsonb,'financial_collab'),
  ('fpn','Financial Partner Network','Banks, funders, insurers, payment providers, and other financial-service partners','{"tier":"Enterprise","dependencies":["npm","iam","pol"]}'::jsonb,'financial_collab')
) AS seed(code,name,description,config,workspace_code)
JOIN master.workspace workspace ON workspace.code=seed.workspace_code
ON CONFLICT (code) DO UPDATE SET
  name=excluded.name,description=excluded.description,workspace_id=excluded.workspace_id,config=excluded.config,
  metadata=excluded.metadata,status='active',updated_at=now(),updated_by=excluded.created_by;

UPDATE master.module
SET status='deprecated',updated_at=now(),updated_by='00000000-0000-0000-0000-000000000000'
WHERE status='active' AND metadata #>> '{_seed,pack}'='mesh.platform-catalog'
  AND code NOT IN ('fnd','iam','aud','pol','wfl','job','doc','ntf','int','cms','act','rel','npm','mkd','rlc','nin','mso','mct','btx','scc','wsc','pwc','trf','fpg','fpn');

INSERT INTO control.workspace (id,code,name,description,sort_order,is_shared_infrastructure,metadata,status,status_changed_at,status_changed_by,created_at,created_by,updated_at,updated_by)
SELECT id,code,name,description,sort_order,is_shared_infrastructure,metadata,status,status_changed_at,status_changed_by,created_at,created_by,updated_at,updated_by
FROM master.workspace
ON CONFLICT (code) DO UPDATE SET
  name=excluded.name,description=excluded.description,sort_order=excluded.sort_order,
  is_shared_infrastructure=excluded.is_shared_infrastructure,metadata=excluded.metadata,status=excluded.status,
  updated_at=now(),updated_by=excluded.created_by;

INSERT INTO control.module (id,code,name,description,config,metadata,status,status_changed_at,status_changed_by,created_at,created_by,updated_at,updated_by)
SELECT id,code,name,description,config,metadata,status,status_changed_at,status_changed_by,created_at,created_by,updated_at,updated_by
FROM master.module
ON CONFLICT (code) DO UPDATE SET
  name=excluded.name,description=excluded.description,config=excluded.config,metadata=excluded.metadata,status=excluded.status,
  updated_at=now(),updated_by=excluded.created_by;

INSERT INTO control.workspace_module (workspace_id,module_id,is_primary,sort_order,metadata,status,created_by)
SELECT module.workspace_id,module.id,true,row_number() OVER (PARTITION BY module.workspace_id ORDER BY module.code)::smallint,
       '{"_seed":{"pack":"mesh.control-platform-catalog","version":"2.0.0"}}','active','00000000-0000-0000-0000-000000000000'
FROM master.module module WHERE module.status='active'
ON CONFLICT (workspace_id,module_id) DO UPDATE SET
  is_primary=true,sort_order=excluded.sort_order,metadata=excluded.metadata,status='active',
  updated_at=now(),updated_by=excluded.created_by;

UPDATE control.workspace_module association
SET status='deprecated',updated_at=now(),updated_by='00000000-0000-0000-0000-000000000000'
WHERE association.status='active'
  AND association.metadata #>> '{_seed,pack}'='mesh.control-platform-catalog'
  AND NOT EXISTS (
    SELECT 1 FROM master.module module
    WHERE module.id=association.module_id AND module.workspace_id=association.workspace_id AND module.status='active'
  );

INSERT INTO control.subscription_plan_module (id,subscription_plan_id,module_id,entitlement_mode,metadata,status,created_by)
SELECT md5('mesh:plan-module:' || plan.code || ':' || module.code)::uuid,plan.id,module.id,'included',
       '{"_seed":{"pack":"mesh.subscription-plan-modules","version":"2.0.0"}}','active','00000000-0000-0000-0000-000000000000'
FROM control.subscription_plan plan
CROSS JOIN control.module module
WHERE plan.code IN ('supplier_free','neon_buyer_included','network_enterprise')
  AND plan.status='active' AND module.status='active'
ON CONFLICT (subscription_plan_id,module_id) DO UPDATE SET
  entitlement_mode='included',metadata=excluded.metadata,status='active',updated_at=now(),updated_by=excluded.created_by;

UPDATE control.subscription_plan_module entitlement
SET status='deprecated',updated_at=now(),updated_by='00000000-0000-0000-0000-000000000000'
WHERE entitlement.status='active'
  AND entitlement.metadata #>> '{_seed,pack}'='mesh.subscription-plan-modules'
  AND NOT EXISTS (SELECT 1 FROM control.module module WHERE module.id=entitlement.module_id AND module.status='active');

DO $assertions$ BEGIN
  IF (SELECT count(*) FROM master.workspace WHERE status='active') <> 5
    OR (SELECT count(*) FROM master.module WHERE status='active') <> 25
    OR (SELECT count(*) FROM control.workspace WHERE status='active') <> 5
    OR (SELECT count(*) FROM control.module WHERE status='active') <> 25
    OR (SELECT count(*) FROM control.workspace_module WHERE status='active' AND is_primary) <> 25 THEN
    RAISE EXCEPTION 'Mesh canonical catalog count mismatch';
  END IF;
  IF (SELECT count(*) FROM control.subscription_plan_module entitlement
      JOIN control.subscription_plan plan ON plan.id=entitlement.subscription_plan_id
      WHERE entitlement.status='active' AND plan.status='active'
        AND plan.code IN ('supplier_free','neon_buyer_included','network_enterprise')) <> 75 THEN
    RAISE EXCEPTION 'Mesh canonical plan entitlement count mismatch';
  END IF;
  IF EXISTS (
    SELECT 1 FROM control.workspace_module association
    LEFT JOIN control.workspace workspace ON workspace.id=association.workspace_id AND workspace.status='active'
    LEFT JOIN control.module module ON module.id=association.module_id AND module.status='active'
    WHERE association.status='active' AND (workspace.id IS NULL OR module.id IS NULL)
  ) THEN
    RAISE EXCEPTION 'Mesh active catalog contains an inactive workspace or module association';
  END IF;
END $assertions$;

COMMIT;
