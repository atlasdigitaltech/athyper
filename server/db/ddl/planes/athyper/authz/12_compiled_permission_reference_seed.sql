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

INSERT INTO authz.permission (id,canonical_code,permission_kind,resource_code,operation_code,module_id,risk_tier,requires_mfa,
 provenance_ref,metadata,status,created_by)
SELECT md5('athyper:permission:' || s.canonical_code)::uuid,s.canonical_code,s.permission_kind::authz.permission_kind_d,
 s.resource_code,s.operation_code,m.id,s.risk_tier::authz.risk_tier_d,s.requires_mfa,
 'wave4:legacy-permission:' || s.legacy_code,
 jsonb_build_object('_seed',jsonb_build_object('pack','athyper.compiled-legacy-permissions','version','1.0.0'),'name',s.name,'legacy_scope_type',s.scope_type),
 'draft','00000000-0000-0000-0000-000000000000'::uuid
FROM (VALUES
    ('jobs.board.view','jobs.board','view','job','capability','medium',false,'View Job Queues (BullBoard)','JOBS.BOARD.VIEW','tenant'),
    ('jobs.queue.manage','jobs.queue','manage','job','capability','critical',true,'Manage Job Queues','JOBS.QUEUE.MANAGE','tenant'),
    ('iam.parameter.manage','iam.parameter','manage','iam','capability','high',true,'Manage Tenant Parameter Overrides','IAM.PARAMETER.MANAGE','tenant'),
    ('iam.idp.read','iam.idp','read','iam','capability','low',false,'View Tenant Identity Providers','IAM.IDP.READ','tenant'),
    ('iam.idp.manage','iam.idp','manage','iam','capability','critical',false,'Manage Tenant Identity Providers','IAM.IDP.MANAGE','tenant'),
    ('platform.reference.view','platform.reference','view','meta','system_action','low',false,'View Reference Data','PLATFORM.REFERENCE.VIEW','tenant'),
    ('platform.reference.import','platform.reference','import','meta','system_action','medium',false,'Import Reference Data','PLATFORM.REFERENCE.IMPORT','tenant'),
    ('platform.taxonomy.view','platform.taxonomy','view','meta','system_action','low',false,'View Taxonomy','PLATFORM.TAXONOMY.VIEW','tenant'),
    ('platform.taxonomy.import','platform.taxonomy','import','meta','system_action','medium',false,'Import Taxonomy Crosswalks','PLATFORM.TAXONOMY.IMPORT','tenant'),
    ('platform.catalog.view','platform.catalog','view','meta','system_action','low',false,'View Platform Catalog','PLATFORM.CATALOG.VIEW','tenant'),
    ('platform.catalog.manage','platform.catalog','manage','meta','system_action','high',false,'Manage Platform Catalog','PLATFORM.CATALOG.MANAGE','tenant'),
    ('platform.subscriptions.view','platform.subscriptions','view','meta','system_action','low',false,'View Subscription Plans','PLATFORM.SUBSCRIPTIONS.VIEW','tenant'),
    ('platform.subscriptions.manage','platform.subscriptions','manage','meta','system_action','critical',false,'Manage Subscription Plans','PLATFORM.SUBSCRIPTIONS.MANAGE','tenant'),
    ('metadata.contract.view','metadata.contract','view','meta','system_action','low',false,'View Metadata Contracts','metadata.contract.view','tenant'),
    ('metadata.contract.draft.create','metadata.contract.draft','create','meta','system_action','medium',false,'Create Metadata Contract Draft','metadata.contract.draft.create','tenant'),
    ('metadata.contract.edit','metadata.contract','edit','meta','system_action','high',false,'Edit Metadata Contract Draft','metadata.contract.edit','tenant'),
    ('metadata.contract.submit','metadata.contract','submit','meta','system_action','high',false,'Submit Metadata Contract','metadata.contract.submit','tenant'),
    ('metadata.contract.review','metadata.contract','review','meta','system_action','high',false,'Review Metadata Contract','metadata.contract.review','tenant'),
    ('metadata.contract.publish','metadata.contract','publish','meta','system_action','critical',true,'Publish Metadata Contract','metadata.contract.publish','tenant'),
    ('metadata.contract.rollback','metadata.contract','rollback','meta','system_action','critical',true,'Rollback Metadata Contract','metadata.contract.rollback','tenant'),
    ('metadata.contract.import','metadata.contract','import','meta','system_action','critical',true,'Import Metadata Contract','metadata.contract.import','tenant'),
    ('metadata.contract.export','metadata.contract','export','meta','system_action','medium',false,'Export Metadata Contract','metadata.contract.export','tenant'),
    ('metadata.overlay.edit','metadata.overlay','edit','meta','system_action','high',true,'Edit Metadata Tenant Overlay','metadata.overlay.edit','tenant'),
    ('metadata.contract.break_glass','metadata.contract','break_glass','meta','system_action','critical',true,'Break-glass Metadata Approval','metadata.contract.break_glass','tenant')
) AS s(canonical_code,resource_code,operation_code,module_code,permission_kind,risk_tier,requires_mfa,name,legacy_code,scope_type)
JOIN master.module m ON m.code=s.module_code
ON CONFLICT (canonical_code) DO UPDATE SET permission_kind=excluded.permission_kind,resource_code=excluded.resource_code,
 operation_code=excluded.operation_code,module_id=excluded.module_id,risk_tier=excluded.risk_tier,requires_mfa=excluded.requires_mfa,
 provenance_ref=excluded.provenance_ref,metadata=excluded.metadata,status='suspended',status_changed_at=now(),status_changed_by=excluded.created_by,
 updated_at=now(),updated_by=excluded.created_by
WHERE (authz.permission.permission_kind,authz.permission.resource_code,authz.permission.operation_code,authz.permission.module_id,
 authz.permission.risk_tier,authz.permission.requires_mfa,authz.permission.provenance_ref,authz.permission.metadata,authz.permission.status)
 IS DISTINCT FROM (excluded.permission_kind,excluded.resource_code,excluded.operation_code,excluded.module_id,excluded.risk_tier,
 excluded.requires_mfa,excluded.provenance_ref,excluded.metadata,'published'::authz.catalog_status_d);

INSERT INTO authz.permission_scope_policy (permission_id,scope_kind,propagation_mode,created_by)
SELECT permission.id,'tenant','exact','00000000-0000-0000-0000-000000000000'::uuid
FROM authz.permission permission
WHERE permission.provenance_ref LIKE 'wave4:legacy-permission:%'
  AND permission.status IN ('draft','suspended')
ON CONFLICT (permission_id,scope_kind) DO UPDATE SET
 propagation_mode=excluded.propagation_mode,updated_at=now(),updated_by=excluded.created_by
WHERE authz.permission_scope_policy.propagation_mode IS DISTINCT FROM excluded.propagation_mode;

UPDATE authz.permission
SET status='published',status_changed_at=now(),status_changed_by='00000000-0000-0000-0000-000000000000'::uuid,
    updated_at=now(),updated_by='00000000-0000-0000-0000-000000000000'::uuid
WHERE provenance_ref LIKE 'wave4:legacy-permission:%'
  AND status IN ('draft','suspended');

DO $assertions$ BEGIN
 IF (SELECT count(*) FROM authz.permission WHERE provenance_ref LIKE 'wave4:legacy-permission:%' AND status='published') <> 24 THEN
   RAISE EXCEPTION 'athyper compiled permission count mismatch'; END IF;
 IF EXISTS (SELECT 1 FROM authz.permission p LEFT JOIN master.module m ON m.id=p.module_id WHERE p.provenance_ref LIKE 'wave4:legacy-permission:%' AND m.id IS NULL) THEN
   RAISE EXCEPTION 'athyper compiled permission module orphan'; END IF;
END $assertions$;
