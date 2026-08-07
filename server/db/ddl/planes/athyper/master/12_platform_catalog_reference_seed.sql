-- seed-contract-version: 1
-- seed-pack: athyper.platform-catalog
-- seed-pack-version: 2.0.0
-- seed-dataset: platform.workspace-module-catalog
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Wave 2 catalog simplification","publisher":"Athyper","source_version":"wave2-final-catalog.v2","retrieved_at":"2026-08-04","license":"internal"}
-- seed-plane: athyper
-- seed-tenant-scope: none
-- seed-natural-key: master.workspace(code);master.module(code)
-- seed-cross-file-ids: true
-- seed-id-strategy: deterministic-uuid:athyper-wave4-athyper-catalog-v1
-- seed-expected-row-count: query:wave2_athyper_platform_catalog
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false
-- seed-assertion: expected-count
-- seed-assertion: orphan
-- seed-assertion: uniqueness
-- seed-assertion: semantic

DO $guard$ BEGIN
  IF current_setting('app.database_plane', true) <> 'athyper' THEN
    RAISE EXCEPTION 'platform catalog pack requires app.database_plane=athyper';
  END IF;
END $guard$;

-- Transitional compatibility source. Wave 2 copies these exact UUIDs into
-- control.workspace/control.module and all new FKs resolve against control.
INSERT INTO master.workspace (
  id,code,name,description,sort_order,is_shared_infrastructure,metadata,status,created_by
)
VALUES
  (md5('athyper:workspace:foundation')::uuid,'foundation','Platform Foundation','Hidden runtime and shared-data foundation',0,true,'{"_seed":{"pack":"athyper.platform-catalog","version":"2.0.0"}}','active','00000000-0000-0000-0000-000000000000'),
  (md5('athyper:workspace:entity')::uuid,'entity','Entity Studio','Metadata, policy, workflow, publication, document, and content authoring',10,false,'{"_seed":{"pack":"athyper.platform-catalog","version":"2.0.0"}}','active','00000000-0000-0000-0000-000000000000'),
  (md5('athyper:workspace:trustiam')::uuid,'trustiam','TrustIAM Studio','Identity, access, onboarding, and identity governance',20,false,'{"_seed":{"pack":"athyper.platform-catalog","version":"2.0.0"}}','active','00000000-0000-0000-0000-000000000000'),
  (md5('athyper:workspace:plans')::uuid,'plans','Plans & Entitlements Studio','Plans, module entitlements, usage, and quotas',30,false,'{"_seed":{"pack":"athyper.platform-catalog","version":"2.0.0"}}','active','00000000-0000-0000-0000-000000000000'),
  (md5('athyper:workspace:observability')::uuid,'observability','Observability Studio','Platform telemetry, errors, and reliability',40,false,'{"_seed":{"pack":"athyper.platform-catalog","version":"2.0.0"}}','active','00000000-0000-0000-0000-000000000000'),
  (md5('athyper:workspace:communications')::uuid,'communications','Communications Studio','Notifications, messaging, activity, and commentary',50,false,'{"_seed":{"pack":"athyper.platform-catalog","version":"2.0.0"}}','active','00000000-0000-0000-0000-000000000000'),
  (md5('athyper:workspace:integration')::uuid,'integration','Integration & Automation Studio','Integration endpoints, APIs, connectors, automation, and jobs',60,false,'{"_seed":{"pack":"athyper.platform-catalog","version":"2.0.0"}}','active','00000000-0000-0000-0000-000000000000'),
  (md5('athyper:workspace:atlas_ai')::uuid,'atlas_ai','Atlas AI Studio','AI providers, agents, knowledge, retrieval, and safety',70,false,'{"_seed":{"pack":"athyper.platform-catalog","version":"2.0.0"}}','active','00000000-0000-0000-0000-000000000000'),
  (md5('athyper:workspace:extension')::uuid,'extension','Extension Studio','Governed plugins, extensions, SDKs, and developer tooling',80,false,'{"_seed":{"pack":"athyper.platform-catalog","version":"2.0.0"}}','active','00000000-0000-0000-0000-000000000000'),
  (md5('athyper:workspace:platform_ops')::uuid,'platform_ops','Platform Operations Studio','Internal platform operations, security, search, and analytics',90,true,'{"_seed":{"pack":"athyper.platform-catalog","version":"2.0.0"}}','active','00000000-0000-0000-0000-000000000000')
ON CONFLICT (code) DO UPDATE SET
  name=excluded.name,description=excluded.description,sort_order=excluded.sort_order,
  is_shared_infrastructure=excluded.is_shared_infrastructure,metadata=excluded.metadata,status='active',
  updated_at=now(),updated_by=excluded.created_by
WHERE (master.workspace.name,master.workspace.description,master.workspace.sort_order,master.workspace.is_shared_infrastructure,master.workspace.metadata,master.workspace.status)
  IS DISTINCT FROM (excluded.name,excluded.description,excluded.sort_order,excluded.is_shared_infrastructure,excluded.metadata,excluded.status);

INSERT INTO master.module (id,code,name,description,workspace_id,config,metadata,status,created_by)
SELECT md5('athyper:module:' || v.code)::uuid,v.code,v.name,v.description,w.id,v.config,
       '{"_seed":{"pack":"athyper.platform-catalog","version":"2.0.0"}}'::jsonb,
       'active','00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
  ('fnd','Foundation Runtime','Meta-driven runtime engine','{"tier":"Foundation"}'::jsonb,'foundation'),
  ('rel','Reference & Shared Data','Reference and shared data services','{"tier":"Foundation"}'::jsonb,'foundation'),
  ('meta','Metadata Studio','Centralized declarative Entity authoring','{"tier":"Core","dependencies":["fnd","rel"]}'::jsonb,'entity'),
  ('pol','Policy & Rules Engine','Policies, validation rules, and decision logic','{"tier":"Core","dependencies":["fnd","meta"]}'::jsonb,'entity'),
  ('wfl','Workflow Engine','State machines, approvals, gates, and timers','{"tier":"Core","dependencies":["fnd","pol"]}'::jsonb,'entity'),
  ('pub','Publication & Release Management','Compile, sign, deploy, activate, and reconcile releases','{"tier":"Core","dependencies":["meta","pol","wfl"]}'::jsonb,'entity'),
  ('doc','Document Generation & Processing','PDF, HTML, extraction, and document transformation','{"tier":"Core","dependencies":["fnd"]}'::jsonb,'entity'),
  ('cms','Content & Object Storage','Governed content and object storage','{"tier":"Core","dependencies":["fnd"]}'::jsonb,'entity'),
  ('iam','Identity & Access Management','TrustIAM authentication and authorization administration','{"tier":"Core","dependencies":["fnd","rel"]}'::jsonb,'trustiam'),
  ('onb','Trust & Onboarding','Organization onboarding, expansion, and offboarding','{"tier":"Core","dependencies":["iam","pol","wfl","pub"]}'::jsonb,'trustiam'),
  ('aud','Identity Audit & Governance','Identity reviews, certification, evidence, and compliance','{"tier":"Core","dependencies":["iam","wfl"]}'::jsonb,'trustiam'),
  ('sub','Subscription Management','Subscription lifecycle and effective assignments','{"tier":"Core","dependencies":["fnd","rel"]}'::jsonb,'plans'),
  ('ent','Plan & Module Entitlements','Plan-to-module commercial entitlement management','{"tier":"Core","dependencies":["sub"]}'::jsonb,'plans'),
  ('usg','Usage & Quota','Usage metrics, limits, overrides, and enforcement','{"tier":"Core","dependencies":["sub","ent"]}'::jsonb,'plans'),
  ('obs','Platform Observability','Metrics, logs, traces, and dashboards','{"tier":"Operations","dependencies":["fnd"]}'::jsonb,'observability'),
  ('err','Error Tracking','Application error capture and diagnosis','{"tier":"Operations","dependencies":["obs"]}'::jsonb,'observability'),
  ('sre','Service Reliability','Health checks, uptime, alerts, and reliability operations','{"tier":"Operations","dependencies":["obs"]}'::jsonb,'observability'),
  ('ntf','Notifications & Messaging','Email, SMS, push, WhatsApp, and in-app messaging','{"tier":"Core","dependencies":["fnd"]}'::jsonb,'communications'),
  ('act','Activity & Commentary','Comments, mentions, reactions, and timelines','{"tier":"Core","dependencies":["fnd","ntf"]}'::jsonb,'communications'),
  ('int','Integration Hub','APIs, connectors, endpoints, webhooks, and future Camel execution','{"tier":"Core","dependencies":["fnd","pol"]}'::jsonb,'integration'),
  ('job','Automation & Jobs','Schedulers, queues, workers, and background tasks','{"tier":"Core","dependencies":["fnd","int"]}'::jsonb,'integration'),
  ('aip','AI Provider & Model Management','AI provider, model, credential-reference, and routing governance','{"tier":"AI","dependencies":["fnd","sec"]}'::jsonb,'atlas_ai'),
  ('agt','Agents & Governed Tools','Governed agents, tools, runs, and invocation policy','{"tier":"AI","dependencies":["aip","pol","aud"]}'::jsonb,'atlas_ai'),
  ('knw','Knowledge & Retrieval','Knowledge sources, indexing, retrieval, and grounding','{"tier":"AI","dependencies":["aip","cms","sea"]}'::jsonb,'atlas_ai'),
  ('aig','AI Governance & Safety','AI policy, evaluation, drift, safety, and evidence','{"tier":"AI","dependencies":["aip","pol","aud"]}'::jsonb,'atlas_ai'),
  ('ext','Plugins & Extensions','Signed, versioned, sandboxed plugin lifecycle','{"tier":"Future","dependencies":["pub","sec"]}'::jsonb,'extension'),
  ('dev','Developer Tools & SDK','Developer portal, SDKs, contracts, and testing tools','{"tier":"Future","dependencies":["ext","int"]}'::jsonb,'extension'),
  ('ops','Platform Operations','Internal tenant and service operations','{"tier":"Internal","dependencies":["fnd","obs"]}'::jsonb,'platform_ops'),
  ('sec','Secrets & Security','Secret references, scanning, and platform security operations','{"tier":"Internal","dependencies":["fnd"]}'::jsonb,'platform_ops'),
  ('sea','Search','Shared platform search services','{"tier":"Internal","dependencies":["fnd"]}'::jsonb,'platform_ops'),
  ('ana','Analytics','Shared operational and platform analytics','{"tier":"Future","dependencies":["fnd","obs"]}'::jsonb,'platform_ops')
) v(code,name,description,config,workspace_code)
JOIN master.workspace w ON w.code=v.workspace_code
ON CONFLICT (code) DO UPDATE SET
  name=excluded.name,description=excluded.description,workspace_id=excluded.workspace_id,
  config=excluded.config,metadata=excluded.metadata,status='active',updated_at=now(),updated_by=excluded.created_by
WHERE (master.module.name,master.module.description,master.module.workspace_id,master.module.config,master.module.metadata,master.module.status)
  IS DISTINCT FROM (excluded.name,excluded.description,excluded.workspace_id,excluded.config,excluded.metadata,excluded.status);

DO $assertions$ BEGIN
  IF (SELECT count(*) FROM master.workspace WHERE status='active') <> 10
     OR (SELECT count(*) FROM master.module WHERE status='active') <> 31 THEN
    RAISE EXCEPTION 'athyper final platform catalog count mismatch';
  END IF;
  IF EXISTS (
    SELECT 1 FROM master.module m LEFT JOIN master.workspace w ON w.id=m.workspace_id
    WHERE m.status='active' AND w.id IS NULL
  ) THEN RAISE EXCEPTION 'athyper final platform catalog contains orphan modules'; END IF;
END $assertions$;
