import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {Kysely,PostgresDialect,sql} from 'kysely';
import pg from 'pg';
import {BusinessPartnerDefinitionService} from '../../business-partner-definition-service.ts';
import {KyselyPublicationAuthorityRepository} from '../../kysely-authority-repository.ts';

if(!process.argv.includes('--confirm=LOCAL-DEV-ROLLBACK'))throw new Error('Explicit development rollback test required');
const tenantId='44444444-4444-4444-8444-444444444444';
// The provisioning service is the test actor. No human approval is performed.
const actorId='41f9d49a-35c6-55bd-8fb3-8074195b6c0f';
const bundle=JSON.parse(readFileSync(process.env.DEFINITION_BUNDLE_FILE,'utf8'));
bundle.bundleCode='verification.rollback.'+randomUUID().replaceAll('-','');
const pool=new pg.Pool({host:process.env.DEFINITION_DATABASE_HOST,port:5432,database:'athyper_studio',user:'athyper_runtime',password:readFileSync(process.env.DEFINITION_PASSWORD_FILE,'utf8').trim(),max:1});
let checked=false;
pool.on('connect',client=>{
 const original=client.query.bind(client);
 client.query=async (...args)=>{
   const query=typeof args[0]==='string'?args[0]:args[0].text;
   if(query.trim().toLowerCase()==='commit'){
     const rows=(await original('SELECT * FROM snapshot.business_partner_definition_revision WHERE bundle_code=$1',[bundle.bundleCode])).rows;
     if(rows.length){
       assert.equal(rows.length,1);assert.equal(rows[0].created_by,actorId);
       await original("SELECT set_config('app.current_tenant_id','11111111-1111-4111-8111-111111111111',true)");
       assert.equal((await original('SELECT id FROM snapshot.business_partner_definition_revision WHERE bundle_code=$1',[bundle.bundleCode])).rows.length,0,'other tenant must not read the revision');
       checked=true;
     }
     return original('ROLLBACK');
   }
   return original(...args);
 };
});
const database=new Kysely({dialect:new PostgresDialect({pool})});
try{
 const canonicalizer={canonicalBytes:value=>Buffer.from(JSON.stringify(value)),sha256:bytes=>createHash('sha256').update(bytes).digest('hex')};
 const service=new BusinessPartnerDefinitionService({database,authority:new KyselyPublicationAuthorityRepository(database),canonicalizer});
 const revision=await service.author({tenantId,actorId,idempotencyKey:randomUUID(),bundle,targetPlanes:['neon','mesh']});
 assert.equal(revision.bundleCode,bundle.bundleCode);assert.equal(checked,true);
 assert.equal(await service.get(tenantId,revision.id),null,'save probe must have rolled back');
 const setting=(await sql`SELECT current_setting('app.current_tenant_id',true) AS tenant`.execute(database)).rows[0].tenant;
 assert.ok(!setting,'tenant context must not leak after transaction');
 console.log(JSON.stringify({save:'passed_and_rolled_back',read:'passed',crossTenantRead:'denied',tenantContextLeak:false,humanApprovalPerformed:false}));
}finally{await database.destroy();}
