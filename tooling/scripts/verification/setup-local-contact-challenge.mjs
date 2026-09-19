#!/usr/bin/env node
// Development-only provisioning; never accepts arbitrary targets or database URLs.
import { generateKeyPairSync, createPublicKey, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const root=resolve(homedir(),'.athyper/instances/dev/secrets');
if(!existsSync(root))throw Error('Existing development secret authority required');
const run=sql=>{
 const r=spawnSync('docker',['exec','-i','athyper-dev-db-1','psql','-U','postgres','-d','athyper_neon','-X','-v','ON_ERROR_STOP=1','-At'],{input:sql,encoding:'utf8'});
 if(r.status!==0)throw Error(r.stderr || 'Local database command failed');return r.stdout;
};
const present=run("BEGIN READ ONLY; SELECT count(*) FROM master.tenant WHERE id='44444444-4444-4444-8444-444444444444' AND code='cirrusatlantic' AND status='active'; COMMIT;");
if(!present.split('\n').includes('1'))throw Error('Expected active local pilot tenant missing');
const schema=readFileSync(resolve('server/db/scripts/provisioning/sql/local-contact-challenge.sql'),'utf8');
const inventory=run("BEGIN READ ONLY; SELECT count(*) FROM information_schema.tables WHERE table_schema='master' AND table_name IN ('local_contact_challenge','local_contact_challenge_limit'); COMMIT;");
if(inventory.split('\n').includes('0'))run('BEGIN;'+schema+' GRANT SELECT,INSERT,UPDATE ON master.local_contact_challenge,master.local_contact_challenge_limit TO athyper_runtime; COMMIT;');
else if(!inventory.split('\n').includes('2'))throw Error('Incomplete challenge schema; manual review required');
const deliveryPath=resolve(root,'local-contact-challenge-delivery-key');
if(!existsSync(deliveryPath))writeFileSync(deliveryPath,randomBytes(32).toString('base64')+'\n',{mode:0o600,flag:'wx'});
if((statSync(deliveryPath).mode&0o777)!==0o600 || Buffer.from(readFileSync(deliveryPath,'utf8').trim(),'base64').length!==32)throw Error('Invalid local delivery key');
const privatePath=resolve(root,'local-contact-challenge-private-key'), trustPath=resolve(root,'local-contact-challenge-trust');
if(existsSync(privatePath)!==existsSync(trustPath))throw Error('Incomplete local signer secret set; refusing overwrite');
if(!existsSync(privatePath)) {
 const pair=generateKeyPairSync('ed25519');
 const from=new Date(Date.now()-60_000),until=new Date(Date.now()+90*86400_000);
 const trust=[{provider:'athyper-local-challenge',keyId:'local-contact-challenge-v1',publicKeyPem:pair.publicKey.export({type:'spki',format:'pem'}).toString(),tenantIds:['44444444-4444-4444-8444-444444444444'],planeKeys:['neon'],notBefore:from.toISOString(),notAfter:until.toISOString()}];
 writeFileSync(privatePath,pair.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600,flag:'wx'});
 writeFileSync(trustPath,JSON.stringify(trust,null,2)+'\n',{mode:0o600,flag:'wx'});
}
for(const path of [privatePath,trustPath])if((statSync(path).mode&0o777)!==0o600)throw Error('Signer files must be owner-only');
const trust=JSON.parse(readFileSync(trustPath,'utf8'));
if(!Array.isArray(trust)||trust.length<1||trust.length>3||trust.filter(k=>k.publicKeyPem===createPublicKey(readFileSync(privatePath)).export({type:'spki',format:'pem'}).toString()).length!==1||trust.some(k=>k.provider!=='athyper-local-challenge'||JSON.stringify(k.tenantIds)!==JSON.stringify(['44444444-4444-4444-8444-444444444444'])||JSON.stringify(k.planeKeys)!==JSON.stringify(['neon'])))throw Error('Signer/trust mismatch');
console.log('Local challenge tables and owner-only signer files ready. No IAM permissions granted; runtime enablement remains separate.');
