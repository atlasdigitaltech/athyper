/** Restore markers only on the exact preserved DEV workload identities. */
import {readFileSync,statSync} from 'node:fs';
import {homedir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
if(process.argv.slice(2).join()!=='--confirm=RESTORE-DEV-PUBLICATION-MARKERS')throw Error('Explicit restoration confirmation required');
const dir=homedir()+'/.athyper/instances/dev/secrets/dev-publication';
const read=name=>{const p=dir+'/'+name,s=statSync(p);if(s.mode&0o077||s.uid!==process.getuid())throw Error('Private configuration required');return JSON.parse(readFileSync(p,'utf8'));};
const config=read('server.json'),credentials=read('client.json');
if(config.instance!=='dev'||config.entityCode!=='business_partner'||config.tenantCode!=='cirrusatlantic'||config.targets.join()!=='neon'||config.author.principalId===config.publisher.principalId)throw Error('Scope mismatch');
const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
for(const plane of ['studio','neon']) {
 const statements=['BEGIN;'];
 for(const role of ['author','publisher']) {
  const actor=config[role];if(actor.code!==`dev.metadata.${role}`||createHash('sha256').update(credentials[role]).digest('hex')!==actor.digest)throw Error('Credential mismatch');
  const predicate=`id=${quote(actor.principalId)}::uuid AND tenant_id=${quote(config.tenantId)}::uuid AND code=${quote(actor.code)} AND principal_type='service_account' AND provisioning_source='internal' AND status='active' AND auth_epoch=${Number(actor.authEpoch)}`;
  const marker=quote(JSON.stringify({role,instance:'dev'}));
  statements.push(`DO $$ BEGIN
   IF NOT EXISTS(SELECT 1 FROM master.principal WHERE ${predicate} AND (metadata->'devPublication'=${marker}::jsonb OR (NOT metadata ? 'devPublication' AND metadata#>>'{_seed,pack}'='existing-dev-publication-identities'))) THEN RAISE EXCEPTION 'Workload identity mismatch or unrecognized restoration source'; END IF;
   UPDATE master.principal SET metadata=metadata||jsonb_build_object('devPublication',${marker}::jsonb),updated_at=now(),updated_by=${quote(actor.principalId)}::uuid WHERE ${predicate} AND NOT metadata ? 'devPublication';
  END $$;`);
 }
 statements.push('COMMIT;');
 execFileSync('docker',['exec','-i','athyper-dev-db-1','psql','-X','-U','postgres','-d',`athyper_${plane}`,'-v','ON_ERROR_STOP=1'],{input:statements.join('\n'),stdio:['pipe','pipe','pipe']});
}
console.log('Restored exact DEV author/publisher role markers; identities, epochs and human grants unchanged.');
