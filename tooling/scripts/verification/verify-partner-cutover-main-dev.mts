/** Main DEV repository acceptance. Synthetic writes always roll back; no extra database. */
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {readBusinessPartner360CommercialControlSection} from '../../../server/packages/services/master-data/src/business-partner/banking/controls-reader';
import {KyselyBusinessPartnerEligibilityRepository} from '../../../server/packages/services/master-data/src/kysely-business-partner-eligibility-repository.js';
import {KyselyBusinessPartnerAccountBankRepository} from '../../../server/packages/planes/neon/src/business-partner-account-bank-linkage.js';
import {createKyselyPermissionResolver} from '../../../server/packages/platform/iam/src/kysely-permission-resolver.js';
import {createPermissionAuthorizer} from '../../../server/packages/platform/iam/src/permission-authorizer.js';
if(process.argv[2]!=='--confirm-main-dev')throw Error('Explicit main DEV target required');
const info=JSON.parse(execFileSync('docker',['inspect','athyper-dev-db-1'],{encoding:'utf8'}))[0];
assert.equal(info.Config.Labels['com.docker.compose.project'],'athyper-dev');
const {Pool}=createRequire(join(process.cwd(),'server/db/package.json'))('pg');
const {Kysely,PostgresDialect,sql}=createRequire(join(process.cwd(),'server/packages/services/master-data/package.json'))('kysely');
const pool=new Pool({host:(Object.values(info.NetworkSettings.Networks)[0] as any).IPAddress,port:5432,user:'postgres',database:'athyper_neon',password:readFileSync(join(homedir(),'.athyper/instances/dev/secrets/postgres-password'),'utf8').trim()});
const db=new Kysely<any>({dialect:new PostgresDialect({pool})});
const rollback=Error('EXPECTED_ROLLBACK');
try{
 const partners=(await sql<any>`SELECT bp.id,bp.tenant_id,bp.created_by,tenant.code,
   (SELECT id FROM master.operating_organization WHERE tenant_id=bp.tenant_id AND status='active' LIMIT 1) organization_id
   FROM master.business_partner bp JOIN master.tenant tenant ON tenant.id=bp.tenant_id WHERE bp.code='BP-DEMO-CORE-001' ORDER BY tenant.code`.execute(db)).rows;
 assert.equal(partners.length,3);
 for(const partner of partners){
  try{await db.transaction().execute(async tx=>{
   await sql`SELECT set_config('app.current_tenant_id',${partner.tenant_id},true),set_config('app.current_principal_id',${partner.created_by},true),set_config('app.database_plane','neon',true)`.execute(tx);
   const admin=(await sql<any>`SELECT id,auth_epoch FROM master.principal WHERE tenant_id=${partner.tenant_id}::uuid AND code=${partner.code==='cirrusatlantic'?'catl.admin':partner.code==='technostat'?'tksa.admin':'athyper.admin'}`.execute(tx)).rows[0];assert.ok(admin);
   const identity:any={tenantId:partner.tenant_id,principalId:admin.id,authEpoch:admin.auth_epoch,realmKey:'athyper',planeKey:'neon',assurance:'baseline'};
   await sql`SELECT set_config('app.current_principal_id',${admin.id},true)`.execute(tx);
   await sql`SET LOCAL ROLE athyperapp`.execute(tx);
   const permissions=await createKyselyPermissionResolver({run:async(_identity,work)=>work(tx as never)}).resolve(identity);
   const readDecision=await createPermissionAuthorizer().authorize({context:{...identity,permissions},permissionCode:'neon.relationship.business_partner.read',resource:{tenantId:partner.tenant_id,entityCode:'business_partner',resourceCode:'business_partner',operationKey:'read'}});
   assert.equal(readDecision.allowed,true,JSON.stringify(readDecision));
   await sql`RESET ROLE`.execute(tx);
   await sql`SELECT set_config('app.current_principal_id',${partner.created_by},true)`.execute(tx);
   const input:any={tenantId:partner.tenant_id,businessPartnerId:partner.id,asOf:new Date().toISOString().slice(0,10),historical:false,operatingOrganizationId:partner.organization_id,roleLens:'all',sectionCode:'banking'};
   const banking=await readBusinessPartner360CommercialControlSection(input,tx as never);
   assert.equal((banking.data as any).accounts.length,1);
   assert.equal((banking.data as any).accounts[0].accountStatus,'inactive');
   assert.ok(!('verified' in (banking.data as any).accounts[0]));
   await readBusinessPartner360CommercialControlSection({...input,sectionCode:'qualifications-certificates'},tx as never);
   const decision=await new KyselyBusinessPartnerEligibilityRepository().resolve({...input,role:'supplier',operationCode:'payment',businessDate:input.asOf},tx as never);
   assert.equal(decision?.eligible,false);assert.ok(decision?.reasons.some(r=>r.code==='ROLE_MISSING'));
   const scopes=['commercial_capacity','operating_organization','company_code','commodity_category','country'].map(kind=>({kind,selection:'all',...(kind==='country'?{countryPurpose:'delivery'}:{})}));
   const header={operationCodes:['payment'],reason:'Synthetic rollback acceptance only'};
   const blockId=(await sql<any>`SELECT control.assemble_partner_decision(${partner.tenant_id}::uuid,${partner.id}::uuid,'restriction',${JSON.stringify(header)}::jsonb,${JSON.stringify(scopes)}::jsonb,${partner.created_by}::uuid) id`.execute(tx)).rows[0].id;
   const blocked=await new KyselyBusinessPartnerEligibilityRepository().resolve({...input,role:'supplier',operationCode:'payment',businessDate:input.asOf},tx as never);
   assert.ok(blocked?.activeBlockIds.includes(blockId));
   assert.ok(blocked?.reasons.some(r=>r.code==='BLOCKED_FOR_OPERATION'));
   const otherAction=await new KyselyBusinessPartnerEligibilityRepository().resolve({...input,role:'supplier',operationCode:'purchase_order',businessDate:input.asOf},tx as never);
   assert.ok(!otherAction?.activeBlockIds.includes(blockId));
   const populated=await readBusinessPartner360CommercialControlSection({...input,sectionCode:'qualifications-certificates'},tx as never);
   const readBlock=(populated.data as any).blocks.find((b:any)=>b.id===blockId);assert.ok(readBlock);assert.equal(readBlock.coverage.length,5);
   assert.ok(readBlock.coverage.every((s:any)=>!('created_by' in s)&&!('metadata' in s)));
   const repository=new KyselyBusinessPartnerAccountBankRepository();
   const source=await repository.protectedRegistrationSource(partner.tenant_id,partner.id,undefined,tx as never);assert.ok(source);
   const key='cutover-'+randomUUID();
   const captured=await repository.createProtectedRegistration({tenantId:partner.tenant_id,principalId:partner.created_by,businessPartnerId:partner.id,accountHolderName:'Rollback acceptance only',accountIdType:'local',accountFingerprint:'a'.repeat(64),accountLast4:'1234',currencyCode:'GBP',bankName:'Synthetic pending directory',bankCountryCode:'GB',protectedValueToken:'bank:'+randomUUID(),idempotencyKey:key,source},tx as never);
   assert.equal(captured.status,'active');assert.equal(captured.account_last4,'1234');
   const replay=await repository.protectedRegistrationByKey(partner.tenant_id,key,tx as never);assert.equal(replay?.bank_account_link_id,captured.bank_account_link_id);
   const wrongTenant=partners.find(p=>p.tenant_id!==partner.tenant_id)!;
   assert.equal(await repository.protectedRegistration(wrongTenant.tenant_id,String(captured.bank_account_link_id),tx as never),null);
   throw rollback;
  });}catch(error){if(error!==rollback)throw error;}
  console.log(JSON.stringify({tenant:partner.code,publishedDirectoryAuthorization:true,bankingRead:true,qualificationRead:true,eligibilityFailClosed:true,populatedRestrictionReadAndActionMatch:true,bankCaptureAndReplay:true,crossTenantLookupDenied:true,syntheticWritesRolledBack:true}));
 }
}finally{await db.destroy();}
