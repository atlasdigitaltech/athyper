import { migrationSourcePath } from "./migration-source.mjs";
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {sql,save} from './atlas-f6-common.mjs';
const apply=process.argv.includes('--apply');
if(process.argv.slice(2).some(x=>x!=='--apply'))throw Error('Use --apply or no arguments');
const results=[];
for(const [plane,name] of ['mesh','neon','studio'].map(plane=>[plane,'20260910_atlas_intent_feedback.sql'])){
 const source=readFileSync(migrationSourcePath(name),'utf8'),hash=createHash('sha256').update(source).digest('hex');
 const body=source.replace(/^BEGIN;\s*/,'').replace(/COMMIT;\s*$/,'');
 sql(plane,`BEGIN; SET LOCAL lock_timeout='5s';
 SELECT pg_advisory_xact_lock(hashtextextended('${name}',0));
 SELECT NOT EXISTS(SELECT 1 FROM public.athyper_schema_migration_v1 WHERE migration_name='${name}') AS install \\gset
 \\if :install
 ${body}
 INSERT INTO public.athyper_schema_migration_v1(migration_name,sha256,status,runner_id,completed_at) VALUES('${name}','${hash}','applied','atlas-f6-persona',clock_timestamp());
 \\endif
 DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.athyper_schema_migration_v1 WHERE migration_name='${name}' AND sha256='${hash}' AND status='applied') THEN RAISE EXCEPTION 'MIGRATION_MISMATCH'; END IF; END $$;
 ${apply?'COMMIT':'ROLLBACK'};`);
 results.push({plane,name,sha256:hash});
}
save(`persona-schema.${apply?'applied':'dry-run'}.json`,{observedAt:new Date().toISOString(),applied:apply,results});console.log(JSON.stringify({applied:apply,results}));
