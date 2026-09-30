// Controlled DEV fault injection; browser requests provide the acceptance evidence.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
const root = new URL("../../../", import.meta.url).pathname.replace(/\/$/, "");
const { Client } = createRequire(root + "/server/db/package.json")("pg");
const host = execFileSync(
  "docker",
  [
    "inspect",
    "athyper-dev-db-1",
    "--format",
    "{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}",
  ],
  { encoding: "utf8" },
).trim();
const password = execFileSync(
  "docker",
  ["exec", "athyper-dev-db-1", "sh", "-c", 'cat "$POSTGRES_PASSWORD_FILE"'],
  { encoding: "utf8" },
).trim();

import {writeFileSync} from 'node:fs';
const {spawnSync}=await import('node:child_process');
if(!process.argv.includes('--dev-only'))throw Error('Pass --dev-only to run controlled DEV quota tests and restore policies afterward');
for(const plane of ['neon','mesh','studio']){
 const db=new Client({host,user:'postgres',password,database:'athyper_'+plane});await db.connect();
 const actor=(await db.query("SELECT tenant_id,principal_id FROM master.principal_identity_binding WHERE username='catl.admin' AND status='active' LIMIT 1")).rows[0];
 if(actor?.tenant_id!=='44444444-4444-4444-8444-444444444444')throw Error('Expected CIRRUSATLANTIC fixture tenant');
 const old=(await db.query('SELECT * FROM ai.atlas_tenant_quota_policy WHERE tenant_id=$1',[actor.tenant_id])).rows[0];
 writeFileSync(process.env.HOME+'/.athyper/instances/dev/receipts/atlas-browser-acceptance/'+plane+'/quota-before.json',JSON.stringify(old??null,null,2),{mode:0o600});
 try{
  await db.query("INSERT INTO ai.atlas_tenant_quota_policy(tenant_id,max_requests,max_input_tokens,max_output_tokens,window_seconds,created_by) VALUES($1,1,1,1,3600,$2) ON CONFLICT(tenant_id) DO UPDATE SET max_requests=1,max_input_tokens=1,max_output_tokens=1,updated_at=clock_timestamp(),updated_by=$2",[actor.tenant_id,actor.principal_id]);
  const result=spawnSync('node',['tooling/scripts/verification/verify-atlas-browser-acceptance.mjs',plane,'--quota'],{stdio:'inherit',timeout:160000,env:{...process.env,LD_LIBRARY_PATH:root+'/node_modules/.cache/playwright-linux-libs/usr/lib/x86_64-linux-gnu'}});if(result.status)throw Error(plane+' quota browser check failed');
 }finally{
  if(old)await db.query('UPDATE ai.atlas_tenant_quota_policy SET max_requests=$2,max_input_tokens=$3,max_output_tokens=$4,window_seconds=$5,updated_at=clock_timestamp(),updated_by=$6 WHERE tenant_id=$1',[actor.tenant_id,old.max_requests,old.max_input_tokens,old.max_output_tokens,old.window_seconds,actor.principal_id]);
  else await db.query('DELETE FROM ai.atlas_tenant_quota_policy WHERE tenant_id=$1',[actor.tenant_id]);
  console.log(plane+' quota policy restored');await db.end();
 }
}
