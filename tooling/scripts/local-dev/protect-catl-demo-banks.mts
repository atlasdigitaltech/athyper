/** DEV-only protected replacements for the organization and person synthetic bank fixtures. */
import {readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {id} from '../../fixtures/business-partner-core/seed-identity.mjs';
import {createInfisicalSecretStore} from '../../../server/packages/adapters/secretstore-infisical/src/index.ts';
if(!process.argv.includes('--inside')){
 if(!process.argv.includes('--apply'))throw Error('Explicit --apply required');
 const info=JSON.parse(execFileSync('docker',['inspect','athyper-dev-db-1'],{encoding:'utf8'}))[0];
 assert.equal(info.Config.Labels['com.docker.compose.project'],'athyper-dev');
 const url=new URL(`postgresql://postgres@${(Object.values(info.NetworkSettings.Networks)[0] as any).IPAddress}:5432/athyper_neon`);
 url.password=readFileSync(join(homedir(),'.athyper/instances/dev/secrets/postgres-password'),'utf8').trim();
 try{console.log(execFileSync('docker',['exec','-i','-w',process.cwd(),'athyper-dev-source-api-1','node','--import','tsx',join(process.cwd(),'tooling/scripts/local-dev/protect-catl-demo-banks.mts'),'--inside'],{input:JSON.stringify({databaseUrl:url.toString()}),encoding:'utf8'}));}
 catch {throw Error('Protected fixture setup failed; inspect safe DEV diagnostics');}
}else{
 assert.equal(process.env.PROTECTED_VALUES_INFISICAL_ENVIRONMENT,'dev');
 assert.equal(process.env.PROTECTED_VALUES_INFISICAL_URL,'https://secrets.dev.athyper.test:8443');
 let input='';for await(const chunk of process.stdin)input+=chunk;
 const {Client}=createRequire(join(process.cwd(),'server/db/package.json'))('pg');
 const db=new Client({connectionString:JSON.parse(input).databaseUrl});await db.connect();
 const store=createInfisicalSecretStore({endpoint:process.env.PROTECTED_VALUES_INFISICAL_URL!,token:readFileSync(process.env.PROTECTED_VALUES_INFISICAL_TOKEN_FILE!,'utf8').trim(),workspaceId:process.env.PROTECTED_VALUES_INFISICAL_WORKSPACE_ID!,environment:'dev',secretPath:'/',createOnly:true});
 const receipts:any[]=[];let committed=false;
 const tenant='44444444-4444-4444-8444-444444444444',partner='b4137225-4534-5469-8138-09d15a970271';
 try{
 await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='3s'");
 await db.query("SELECT pg_advisory_xact_lock(hashtextextended('demo.catl.protected-banks.v1',0))");
 const actor=(await db.query("SELECT created_by FROM master.business_partner WHERE tenant_id=$1 AND id=$2 AND code='BP-DEMO-CORE-001'",[tenant,partner])).rows[0]?.created_by;assert.ok(actor);
 await db.query("SELECT set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true),set_config('app.database_plane','neon',true)",[tenant,actor]);
 for(const [partner,oldLink,newAccount,newLink,suffix] of [
 ['b4137225-4534-5469-8138-09d15a970271','47620075-5c74-5c38-8e7e-47edd1eebfda','8ca21001-64b0-4aa3-8910-7c14c97a3001','8ca21001-64b0-4aa3-8910-7c14c97a4001','3001'],
 ['b4137225-4534-5469-8138-09d15a970271','cd5b4b2e-b42e-4608-9a82-c04ca9d84002','8ca21001-64b0-4aa3-8910-7c14c97a3002','8ca21001-64b0-4aa3-8910-7c14c97a4002','3002'],
 [id('cirrusatlantic','person-partner'),id('cirrusatlantic','person-bank-link'),id('cirrusatlantic','person-protected-bank'),id('cirrusatlantic','person-protected-bank-link'),'3001']]){
  const old=(await db.query('SELECT a.*,l.effective_until link_until,l.is_primary FROM master.payment_instrument_link l JOIN master.bank_account a ON a.tenant_id=l.tenant_id AND a.id=l.payment_instrument_id WHERE l.tenant_id=$1 AND l.owner_id=$2 AND l.id=$3 FOR UPDATE OF l,a',[tenant,partner,oldLink])).rows[0];
  assert.ok(old);assert.equal(old.account_last4,suffix);assert.ok(old.account_id_value.startsWith('DEMO'));assert.ok(old.metadata?._seed);
  const token=`bank:${newAccount}`,reference=`protected-values/${tenant}/${token}`;
  const existing=(await db.query('SELECT metadata FROM master.bank_account WHERE tenant_id=$1 AND id=$2',[tenant,newAccount])).rows[0];
  if(existing){assert.equal(existing.metadata.protectedValueToken,token);assert.ok(old.link_until);continue;}
  assert.equal(old.link_until,null);
  receipts.push(await store.create!(reference,new TextEncoder().encode(old.account_id_value)));
  assert.equal(new TextDecoder().decode((await store.resolve(reference)).bytes),old.account_id_value);
  const fingerprint=createHash('sha256').update(old.account_id_value).digest('hex').toUpperCase();
  const meta=JSON.stringify({_seed:'demo.catl.protected-banks.v1',protectedValueToken:token,replacesAccountId:old.id});
  await db.query("INSERT INTO master.payment_instrument(id,tenant_id,instrument_type_code,name,status,metadata,created_by) VALUES($1,$2,'bank_account','Protected demo — not for payment','inactive',$3,$4)",[newAccount,tenant,meta,actor]);
  await db.query(`INSERT INTO master.bank_account(id,tenant_id,bank_institution_id,bank_branch_id,provisional_bank_reference_id,account_holder_name,account_id_type,account_id_value,account_last4,currency_code,bic_override,metadata,created_by)
   SELECT $1,tenant_id,bank_institution_id,bank_branch_id,provisional_bank_reference_id,account_holder_name,account_id_type,$2,account_last4,currency_code,bic_override,$3,$4 FROM master.bank_account WHERE tenant_id=$5 AND id=$6`,[newAccount,fingerprint,meta,actor,tenant,old.id]);
  await db.query('UPDATE master.payment_instrument_link SET effective_until=CURRENT_DATE,updated_by=$1 WHERE tenant_id=$2 AND id=$3',[actor,tenant,oldLink]);
  await db.query(`INSERT INTO master.payment_instrument_link(id,tenant_id,owner_type_id,owner_type,owner_id,payment_instrument_id,relationship_role,purpose,is_primary,effective_from,metadata,created_by)
   SELECT $1,tenant_id,owner_type_id,owner_type,owner_id,$2,relationship_role,purpose,is_primary,CURRENT_DATE,$3,$4 FROM master.payment_instrument_link WHERE tenant_id=$5 AND id=$6`,[newLink,newAccount,meta,actor,tenant,oldLink]);
 }
 await db.query('COMMIT');committed=true;console.log(JSON.stringify({protectedReplacements:3,priorLinksEnded:true,priorAccountsPreserved:true}));
 }catch(error){await db.query('ROLLBACK');throw Error(`Fixture setup failed (${(error as any).code??'validation'}); no values logged`);}
 finally{if(!committed)for(const receipt of receipts)await receipt.discard();await db.end();await store.close?.();}
}
