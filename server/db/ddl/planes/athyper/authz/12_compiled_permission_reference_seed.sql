-- seed-contract-version: 1
-- seed-pack: athyper.compiled-legacy-permissions
-- seed-pack-version: 1.0.0
-- seed-dataset: authz.compiled-permission-catalog
-- seed-data-class: production_reference
-- seed-provenance: {"source":"Wave 4 legacy permission compiler","publisher":"Athyper","source_version":"wave4-platform-catalog.v1","retrieved_at":"2026-08-03","license":"internal"}
-- seed-plane: athyper
-- seed-tenant-scope: none
-- seed-natural-key: authz.permission(canonical_code)
-- seed-cross-file-ids: true
-- seed-id-strategy: deterministic-uuid:athyper-wave4-athyper-permission-v1
-- seed-expected-row-count: exact:24
-- seed-assertions: expected-count,orphan,uniqueness,semantic
-- seed-demo-data: false
-- seed-assertion: expected-count
-- seed-assertion: orphan
-- seed-assertion: uniqueness
-- seed-assertion: semantic

DO $guard$ BEGIN IF current_setting('app.database_plane', true) <> 'athyper' THEN
 RAISE EXCEPTION 'compiled permission pack requires app.database_plane=athyper'; END IF; END $guard$;

INSERT INTO authz.permission (id,canonical_code,permission_kind,module_id,risk_tier,requires_mfa,
 metadata,status,created_by)
SELECT md5('athyper:permission:' || s.canonical_code)::uuid,s.canonical_code,s.permission_kind::authz.permission_kind_d,
 m.id,s.risk_tier::authz.risk_tier_d,s.requires_mfa,
 jsonb_build_object('_seed',jsonb_build_object('pack','athyper.compiled-legacy-permissions','version','1.0.0'),'name',s.name),
 'draft','00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
    ('jobs.board.view','job','capability','medium',false,'View Job Queues (BullBoard)'),
    ('jobs.queue.manage','job','capability','critical',true,'Manage Job Queues'),
    ('iam.parameter.manage','iam','capability','high',true,'Manage Tenant Parameter Overrides'),
    ('iam.idp.read','iam','capability','low',false,'View Tenant Identity Providers'),
    ('iam.idp.manage','iam','capability','critical',false,'Manage Tenant Identity Providers'),
    ('platform.reference.view','meta','system_action','low',false,'View Reference Data'),
    ('platform.reference.import','meta','system_action','medium',false,'Import Reference Data'),
    ('platform.taxonomy.view','meta','system_action','low',false,'View Taxonomy'),
    ('platform.taxonomy.import','meta','system_action','medium',false,'Import Taxonomy Crosswalks'),
    ('platform.catalog.view','meta','system_action','low',false,'View Platform Catalog'),
    ('platform.catalog.manage','meta','system_action','high',false,'Manage Platform Catalog'),
    ('platform.subscriptions.view','meta','system_action','low',false,'View Subscription Plans'),
    ('platform.subscriptions.manage','meta','system_action','critical',false,'Manage Subscription Plans'),
    ('metadata.contract.view','meta','system_action','low',false,'View Metadata Contracts'),
    ('metadata.contract.draft.create','meta','system_action','medium',false,'Create Metadata Contract Draft'),
    ('metadata.contract.edit','meta','system_action','high',false,'Edit Metadata Contract Draft'),
    ('metadata.contract.submit','meta','system_action','high',false,'Submit Metadata Contract'),
    ('metadata.contract.review','meta','system_action','high',false,'Review Metadata Contract'),
    ('metadata.contract.publish','meta','system_action','critical',true,'Publish Metadata Contract'),
    ('metadata.contract.rollback','meta','system_action','critical',true,'Rollback Metadata Contract'),
    ('metadata.contract.import','meta','system_action','critical',true,'Import Metadata Contract'),
    ('metadata.contract.export','meta','system_action','medium',false,'Export Metadata Contract'),
    ('metadata.overlay.edit','meta','system_action','high',true,'Edit Metadata Tenant Overlay'),
    ('metadata.contract.break_glass','meta','system_action','critical',true,'Break-glass Metadata Approval')
) AS s(canonical_code,module_code,permission_kind,risk_tier,requires_mfa,name)
JOIN control.module m ON m.code=s.module_code
ON CONFLICT (canonical_code) DO UPDATE SET permission_kind=excluded.permission_kind,
 module_id=excluded.module_id,risk_tier=excluded.risk_tier,requires_mfa=excluded.requires_mfa,
 metadata=excluded.metadata,status='suspended',status_changed_at=now(),status_changed_by=excluded.created_by,
 updated_at=now(),updated_by=excluded.created_by
WHERE (authz.permission.permission_kind,authz.permission.module_id,
 authz.permission.risk_tier,authz.permission.requires_mfa,authz.permission.metadata,authz.permission.status)
 IS DISTINCT FROM (excluded.permission_kind,excluded.module_id,excluded.risk_tier,
 excluded.requires_mfa,excluded.metadata,'published'::authz.catalog_status_d);

UPDATE authz.permission
SET status='published',status_changed_at=now(),status_changed_by='00000000-0000-0000-0000-000000000000'::uuid,
    updated_at=now(),updated_by='00000000-0000-0000-0000-000000000000'::uuid
WHERE metadata->'_seed'->>'pack' = 'athyper.compiled-legacy-permissions'
  AND status IN ('draft','suspended');

DO $assertions$ BEGIN
 IF (SELECT count(*) FROM authz.permission WHERE metadata->'_seed'->>'pack' = 'athyper.compiled-legacy-permissions' AND status='published') <> 24 THEN
   RAISE EXCEPTION 'athyper compiled permission count mismatch'; END IF;
 IF EXISTS (SELECT 1 FROM authz.permission p LEFT JOIN control.module m ON m.id=p.module_id WHERE p.metadata->'_seed'->>'pack' = 'athyper.compiled-legacy-permissions' AND m.id IS NULL) THEN
   RAISE EXCEPTION 'athyper compiled permission module orphan'; END IF;
END $assertions$;
