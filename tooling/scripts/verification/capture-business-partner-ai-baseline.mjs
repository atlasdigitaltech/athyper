// BP-AI-00 operator inventory. Reads DEV/QA metadata, never changes business data.
// Synthetic inference bypasses the Atlas application only to measure the provider;
// it is explicitly not an authorization or end-to-end Atlas qualification.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const output = process.argv[2];
if (!output) throw new Error('Usage: node tooling/scripts/verification/capture-business-partner-ai-baseline.mjs <sanitized-output.json>');
const report = { schema: 'bp-ai-baseline/1', capturedAt: new Date().toISOString(), checks: {} };
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', timeout: 180_000, maxBuffer: 2_000_000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
async function check(name, work) {
  try { report.checks[name] = { status: 'captured', data: await work() }; }
  catch { report.checks[name] = { status: 'unavailable', reason: 'Probe failed; inspect locally without publishing credentials or raw business data.' }; }
  console.log(`${name}: ${report.checks[name].status}`);
}
const query = `SELECT coalesce(jsonb_agg(jsonb_build_object(
  'release',release_no,'descriptorHash',compiled_hash,'storage',compiled_json->'storage',
  'directoryScope',compiled_json->'directoryScope','operations',compiled_json->'operations',
  'fieldPermissions',(SELECT coalesce(jsonb_agg(jsonb_build_object('key',f->>'key','readPermissionCode',f->>'readPermissionCode')),'[]'::jsonb) FROM jsonb_array_elements(compiled_json->'fields') f WHERE f ? 'readPermissionCode')
)), '[]'::jsonb) FROM runtime_meta.fn_active_entity_descriptor('metadata.entity.business_partner','entity_runtime')`;
await check('containers', () => docker('ps', '--format', '{{json .}}').split('\n').map(JSON.parse)
  .filter(x => /^athyper-(dev|qa)-(api|neon-web|worker|scheduler|searchcore|objectstorage|memorycache|docparser|virusscan|atlas-atlas-inference)-/.test(x.Names))
  .map(x => ({ name: x.Names, image: x.Image, status: x.Status })));
for (const env of ['dev', 'qa']) {
  await check(`${env}Descriptor`, () => JSON.parse(docker('exec', `athyper-${env}-db-1`, 'psql', '-U', 'postgres', '-d', 'athyper_neon', '-Atc', query)));
  await check(`${env}VersionColumn`, () => docker('exec', `athyper-${env}-db-1`, 'psql', '-U', 'postgres', '-d', 'athyper_neon', '-Atc', "SELECT column_name||':'||data_type FROM information_schema.columns WHERE table_schema='master' AND table_name='business_partner' AND column_name='record_version'"));
}
await check('modelConfiguration', () => JSON.parse(docker('exec', 'athyper-dev-api-1', 'node', '-e', `const c=JSON.parse(require('fs').readFileSync('/athyper/config/atlas-local-inference.json','utf8')); console.log(JSON.stringify({schema:c.schema,model:c.model,request:c.request,cloudEnabled:c.cloudEnabled}))`)));
await check('devRedis', () => docker('exec', 'athyper-dev-memorycache-1', 'sh', '-c', 'export REDISCLI_AUTH="$(cat /run/secrets/redis-password)"; redis-cli --no-auth-warning CONFIG GET maxmemory maxmemory-policy; redis-cli --no-auth-warning MODULE LIST'));
await check('memorySnapshot', () => docker('stats', '--no-stream', '--format', '{{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}', 'athyper-dev-searchcore-1', 'athyper-dev-objectstorage-1', 'athyper-dev-memorycache-1', 'athyper-dev-atlas-atlas-inference-1'));
await check('authenticatedReadProbes', async () => {
  const { request } = createRequire(process.cwd() + '/package.json')('@playwright/test');
  const results = [];
  for (const persona of ['neon', 'neon-owner', 'neon-athyper']) {
    const client = await request.newContext({ baseURL: 'https://neon.dev.athyper.test', ignoreHTTPSErrors: true, storageState: `tests/e2e/.auth/${persona}.json`, timeout: 15_000 });
    try {
      for (const path of ['/api/relay/atlas/admission', '/api/relay/entity-runtime/business_partner/list-descriptor', '/api/relay/entity-runtime/business_partner/list?limit=1']) {
        const start = performance.now();
        const response = await client.get(path, { maxRedirects: 0 });
        // Never serialize response bodies, cookies, headers, identities or records.
        results.push({ persona, path, httpStatus: response.status(), elapsedMs: Math.round(performance.now() - start), authorizedRead: response.status() === 200 });
      }
    } finally { await client.dispose(); }
  }
  return results;
});
await check('providerBenchmark', () => JSON.parse(docker('exec', 'athyper-dev-api-1', 'node', '-e', `
(async()=>{
 const config=JSON.parse(require('fs').readFileSync('/athyper/config/atlas-local-inference.json','utf8'));
 const samples=[];
 for(let i=0;i<3;i++){
  const start=performance.now(); let first=null,done=null,buffer='';
  const response=await fetch(config.endpoint+'/api/chat',{method:'POST',headers:{'content-type':'application/json'},signal:AbortSignal.timeout(45000),body:JSON.stringify({model:config.model.upstream,think:false,stream:true,options:{num_ctx:config.request.num_ctx,num_predict:128,temperature:0},messages:[{role:'system',content:'Explain only supplied synthetic facts. Do not infer purchasing eligibility.'},{role:'user',content:'Synthetic partner DEMO-BP-001 is an organization in draft. Supplier readiness is not evaluated. Summarize in two sentences.'}]})});
  if(!response.ok)throw Error('Provider unavailable');
  for await(const chunk of response.body){buffer+=Buffer.from(chunk).toString();let n;while((n=buffer.indexOf('\\n'))>=0){const line=buffer.slice(0,n);buffer=buffer.slice(n+1);if(!line.trim())continue;const event=JSON.parse(line);if(first===null&&event.message?.content)first=performance.now()-start;if(event.done)done=event;}}
  if(!done)throw Error('Incomplete provider stream');
  samples.push({sample:i+1,firstTextMs:Math.round(first??0),totalMs:Math.round(performance.now()-start),promptTokens:done.prompt_eval_count,outputTokens:done.eval_count,loadMs:Math.round((done.load_duration??0)/1e6),generationTokensPerSecond:done.eval_duration?Math.round(done.eval_count/(done.eval_duration/1e9)*100)/100:null,doneReason:done.done_reason});
 }
 console.log(JSON.stringify({kind:'synthetic-provider-only',samples,outputCap:128,contextWindow:config.request.num_ctx,toolSchemasIncluded:false,authorizationTest:false,notes:'Sequential samples; first may include load cost. Not p95, concurrency or end-to-end Atlas latency.'}));
})().catch(()=>{process.exitCode=1});`)));
report.authenticatedBenchmarkAvailable = report.checks.authenticatedReadProbes?.data?.every(x => x.authorizedRead) ?? false;
const path = resolve(output);
mkdirSync(dirname(path), { recursive: true });
writeFileSync(path, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
console.log(`Sanitized baseline saved to ${path}`);
