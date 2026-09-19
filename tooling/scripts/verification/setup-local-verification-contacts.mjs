import {spawnSync} from 'node:child_process';
const sql=`BEGIN;
SELECT set_config('app.database_plane','neon',true),set_config('app.current_tenant_id','44444444-4444-4444-8444-444444444444',true),set_config('app.current_principal_id','cca94907-7519-5871-8e3c-6b11aa545c93',true);
INSERT INTO master.contact_link(tenant_id,owner_type_id,owner_id,channel_type,value,purpose,role_qualifier,is_primary,is_verified,metadata,status,created_by)
SELECT '44444444-4444-4444-8444-444444444444',o.id,b.id,'email',v.email,'notification','local-verification',false,false,'{"source":"local-contact-verification:v1"}','active','cca94907-7519-5871-8e3c-6b11aa545c93'
FROM control.owner_type o CROSS JOIN master.business_partner b CROSS JOIN (VALUES('catl.admin@verification.dev.athyper.test'),('catl.owner@verification.dev.athyper.test')) v(email)
WHERE o.code='business_partner' AND o.tenant_id IS NULL AND b.tenant_id='44444444-4444-4444-8444-444444444444' AND b.code='CATL-BP-001'
AND NOT EXISTS(SELECT 1 FROM master.contact_link c WHERE c.tenant_id=b.tenant_id AND c.owner_id=b.id AND c.value=v.email AND c.role_qualifier='local-verification');
SELECT id,value,is_verified FROM master.contact_link WHERE tenant_id='44444444-4444-4444-8444-444444444444' AND metadata->>'source'='local-contact-verification:v1';
COMMIT;`;
const r=spawnSync('docker',['exec','-i','athyper-dev-db-1','psql','-U','postgres','-d','athyper_neon','-X','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8'});
process.stdout.write(r.stdout);process.stderr.write(r.stderr);process.exit(r.status??1);
