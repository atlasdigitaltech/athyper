import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const apply=process.argv.includes('--apply');if(process.argv.slice(2).some(x=>x!=='--apply'))throw Error('Use --apply or no arguments for rehearsal');
const name='20260910_baseline_activation_precondition.sql',migration=readFileSync('server/db/migrations/'+name,'utf8'),hash=createHash('sha256').update(migration).digest('hex');
const body=migration.replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,'');
const input=`BEGIN; SET LOCAL lock_timeout='5s';
DO $$ BEGIN IF current_database()<>'athyper_neon' OR NOT EXISTS(SELECT 1 FROM master.tenant WHERE id='44444444-4444-4444-8444-444444444444' AND code='cirrusatlantic') THEN RAISE EXCEPTION 'Unexpected target'; END IF; END $$;
SELECT pg_advisory_xact_lock(hashtextextended('${name}',0));
SELECT NOT EXISTS(SELECT 1 FROM public.athyper_schema_migration_v1 WHERE migration_name='${name}') AS install \\gset
\\if :install
${body}
INSERT INTO public.athyper_schema_migration_v1(migration_name,sha256,status,runner_id,completed_at) VALUES('${name}','${hash}','applied','atlas-baseline-bridge',clock_timestamp());
\\endif
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.athyper_schema_migration_v1 WHERE migration_name='${name}' AND sha256='${hash}' AND status='applied') OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='runtime_meta.release_activation_head'::regclass AND tgname='baseline_activation_precondition' AND tgenabled IN ('O','A')) THEN RAISE EXCEPTION 'Migration evidence or activation guard mismatch'; END IF; END $$;
${apply?'COMMIT':'ROLLBACK'};`;
try{execFileSync('docker',['exec','-i','athyper-dev-db-1','psql','-X','-qAt','-U','postgres','-d','athyper_neon','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',timeout:15000,stdio:['pipe','pipe','pipe']});}catch(e){throw Error('Neon migration failed: '+String(e.stderr).split('\n')[0]);}
const receipt={observedAt:new Date().toISOString(),environment:'dev',plane:'neon',migration:name,sha256:hash,applied:apply,runtimeHeadChanged:false};writeFileSync(`docs/examples/atlas-f5/cirrus-baseline-precondition.${apply?'applied':'dry-run'}.json`,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
