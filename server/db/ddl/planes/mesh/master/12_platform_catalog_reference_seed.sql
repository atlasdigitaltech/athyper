-- seed-contract-version: 1
-- seed-pack: mesh.platform-catalog
-- seed-pack-version: 1.0.0
-- seed-dataset: platform.workspace-module-catalog
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Wave 4 platform catalog rewrite","publisher":"Athyper","source_version":"wave4-platform-catalog.v1","retrieved_at":"2026-08-03","license":"internal"}
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
    (md5('mesh:workspace:' || 'core')::uuid, 'core', 'Core Platform', 'Meta-driven runtime, authentication, and platform services', 10, true, '{"_seed":{"pack":"mesh.platform-catalog","version":"1.0.0"}}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid),
    (md5('mesh:workspace:' || 'ptr')::uuid, 'ptr', 'Partner Collaboration', 'Partner-facing collaboration: proposals, orders, invoices, contracts, and logistics', 90, false, '{"_seed":{"pack":"mesh.platform-catalog","version":"1.0.0"}}'::jsonb, 'active', '00000000-0000-0000-0000-000000000000'::uuid)
ON CONFLICT (code) DO UPDATE SET
  name=excluded.name, description=excluded.description, sort_order=excluded.sort_order,
  is_shared_infrastructure=excluded.is_shared_infrastructure, metadata=excluded.metadata, status='active',
  updated_at=now(), updated_by=excluded.created_by
WHERE (master.workspace.name,master.workspace.description,master.workspace.sort_order,master.workspace.is_shared_infrastructure,master.workspace.metadata,master.workspace.status)
 IS DISTINCT FROM (excluded.name,excluded.description,excluded.sort_order,excluded.is_shared_infrastructure,excluded.metadata,'active'::shared.ref_status_d);

INSERT INTO master.module (id,code,name,description,workspace_id,config,metadata,status,created_by)
SELECT md5('mesh:module:' || seed_rows.code)::uuid, seed_rows.code,seed_rows.name,seed_rows.description,workspace.id,seed_rows.config,
       '{"_seed":{"pack":"mesh.platform-catalog","version":"1.0.0"}}'::jsonb,'active','00000000-0000-0000-0000-000000000000'::uuid
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
    ('pcon', 'Proposal & Contract Collaboration', 'Partner-facing collaboration for proposals, commercial terms, and contract exchange', '{"tier":"Base","dependencies":["fnd","rel","doc","wfl"]}'::jsonb, 'ptr'),
    ('omi', 'Order Intake', 'Inbound partner orders and order acknowledgements received from external parties', '{"tier":"Base","dependencies":["fnd","rel","int"]}'::jsonb, 'ptr'),
    ('imo', 'Invoice Delivery', 'Outbound invoices and invoice delivery to customers or partner channels', '{"tier":"Base","dependencies":["fnd","rel","doc","int"]}'::jsonb, 'ptr'),
    ('ccon', 'Customer Contract Portal', 'Customer-visible contract access, commercial documents, and renewal interaction', '{"tier":"Base","dependencies":["fnd","rel","doc","wfl"]}'::jsonb, 'ptr'),
    ('soo', 'Sales Order Delivery', 'Outbound sales orders sent to fulfillment, distributors, or trading partners', '{"tier":"Base","dependencies":["fnd","rel","int"]}'::jsonb, 'ptr'),
    ('sii', 'Sales Invoice Intake', 'Inbound customer-side sales invoice intake and validation from connected channels', '{"tier":"Base","dependencies":["fnd","rel","doc","int"]}'::jsonb, 'ptr'),
    ('logx', 'Logistics Collaboration', 'Shipment visibility, transport milestone exchange, and logistics partner coordination', '{"tier":"Base","dependencies":["fnd","rel","int","ntf"]}'::jsonb, 'ptr')
) AS seed_rows(code,name,description,config,workspace_code)
JOIN master.workspace ON workspace.code=seed_rows.workspace_code
ON CONFLICT (code) DO UPDATE SET
  name=excluded.name,description=excluded.description,workspace_id=excluded.workspace_id,config=excluded.config,
  metadata=excluded.metadata,status='active',updated_at=now(),updated_by=excluded.created_by
WHERE (master.module.name,master.module.description,master.module.workspace_id,master.module.config,master.module.metadata,master.module.status)
 IS DISTINCT FROM (excluded.name,excluded.description,excluded.workspace_id,excluded.config,excluded.metadata,'active'::shared.ref_status_d);

DO $assertions$ BEGIN
  IF (SELECT count(*) FROM master.workspace WHERE status='active') <> 2
     OR (SELECT count(*) FROM master.module WHERE status='active') <> 19 THEN
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
