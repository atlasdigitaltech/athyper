#!/usr/bin/env node
// F0: read-only Docker/SQL/HTTP inventory. No generation, login, grants or deployment.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { sha256, planes, flagNames, declaredTables, compareTables, reconcileReceipt, buildCapabilityMatrix, assessBaseline } from './atlas-foundation-baseline-model.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const [target, output] = process.argv.slice(2);
if (!['dev', 'qa'].includes(target) || !output || process.argv.length !== 4) {
  console.error('Usage: pnpm atlas:baseline <dev|qa> <report.json>');
  process.exit(2);
}
const run = (command, args, options = {}) => execFileSync(command, args, {
  cwd: root, encoding: 'utf8', timeout: 25000, maxBuffer: 16000000,
  stdio: ['ignore', 'pipe', 'pipe'], ...options,
}).trim();
const docker = (...args) => run('docker', args);
const query = (plane, sql) => JSON.parse(docker('exec', `athyper-${target}-db-1`, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', `athyper_${plane}`, '-c',
  `BEGIN READ ONLY; SET LOCAL statement_timeout='15s'; ${sql}; COMMIT;`));
const report = { schema: 'atlas-foundation-baseline/1', phase: 'F0', target, capturedAt: new Date().toISOString(),
  observationScope: 'Operator inventory; no business payloads, credentials, prompts, identities, or provider generation. Tenant coordinates are pseudonymized. Each SQL probe uses a read-only transaction; probes are not a cross-service snapshot.',
  checks: {}, schemaComparisons: {}, capabilityMatrix: [], findings: [],
};
async function check(name, work) {
  try { report.checks[name] = { status: 'captured', data: await work() }; }
  catch { report.checks[name] = { status: 'unavailable', reason: 'Probe failed; inspect target/schema locally. Raw errors are intentionally not retained.' }; }
  console.log(`${name}: ${report.checks[name].status}`);
  return report.checks[name].data;
}

const sourcePaths = [
  'server/db/ddl/common/ai', 'server/db/ddl/common/runtime_meta', 'server/db/ddl/planes/studio/metadata',
  'server/db/ddl/planes/studio/ai', 'server/db/ddl/planes/studio/publication', 'server/db/ddl/planes/studio/snapshot',
  'server/db/migrations', 'server/packages/platform/ai/src', 'server/packages/contracts/ai/src',
  'server/packages/contracts/metadata/src', 'server/packages/platform/metadata/src',
  'server/packages/planes/studio/meta-entity-authoring/src', 'server/packages/adapters/ai-ollama/src',
  'server/packages/services/master-data/src', 'server/packages/services/records/src',
  'server/apps/platform-host/src/composition', 'server/apps/platform-host/src/config',
  'packages/platform/ai', 'packages/platform/shell/shell/src', 'deploy/config/atlas',
  'tooling/scripts/verification/capture-atlas-foundation-baseline.mjs', 'tooling/scripts/verification/atlas-foundation-baseline-model.mjs',
  'tooling/scripts/verification/atlas-foundation-baseline.test.mjs', 'package.json', 'server/db/package.json', 'server/db/scripts/README.md',
  ...planes.map(plane=>`server/db/ddl/planes/${plane}/_manifest.txt`),
];
await check('source', () => {
  const files = [...new Set(run('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', ...sourcePaths]).split('\0').filter(Boolean))].sort();
  const inventory = files.map(path => ({ path, sha256: existsSync(resolve(root, path)) ? sha256(readFileSync(resolve(root, path))) : null }));
  return { head: run('git', ['rev-parse', 'HEAD']), dirty: Boolean(run('git', ['status', '--porcelain'])),
    scope: sourcePaths, scopedTreeSha256: sha256(JSON.stringify(inventory)), files: inventory,
    deploymentCorrespondence:'Source and deployed emitted-file hashes are recorded independently; no reproducible build correspondence is asserted.' };
});
await check('checkedModelConfiguration',()=>{
  const bytes=readFileSync(resolve(root,'deploy/config/atlas/local-inference.json'));const c=JSON.parse(bytes);
  return {sha256:sha256(bytes),publicModelId:c.model.publicId,upstream:c.model.upstream,digest:c.model.digest,engineVersion:c.engine.version,contextTokens:c.request.num_ctx,outputTokens:c.request.num_predict,cloudEnabled:c.cloudEnabled};
});

const containers = await check('containers', () => {
  const names = docker('ps', '-a', '--format', '{{.Names}}').split('\n').filter(name => name.startsWith(`athyper-${target}-`));
  return names.map(name => JSON.parse(docker('inspect', name, '--format',
    '{"name":{{json .Name}},"imageId":{{json .Image}},"configuredImage":{{json .Config.Image}},"state":{{json .State.Status}},"startedAt":{{json .State.StartedAt}},"health":{{if .State.Health}}{{json .State.Health.Status}}{{else}}null{{end}}}')));
});
const api = containers?.find(row => row.name === `/athyper-${target}-api-1`);
const apiStartedAt = api?.startedAt && Number.isFinite(Date.parse(api.startedAt)) ? new Date(api.startedAt).toISOString() : null;

await check('deployedRuntime', () => JSON.parse(docker('exec', `athyper-${target}-api-1`, 'node', '--input-type=module', '-e', `
import fs from 'node:fs'; import path from 'node:path'; import {createRequire} from 'node:module'; import {createHash} from 'node:crypto';
const require=createRequire(process.cwd()+'/package.json');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const entry=require.resolve('@athyper/server-platform-ai'), dir=path.dirname(entry);
const files=['agent-runtime.js','local-generation-composition.js','business-partner-tools.js','business-partner-case-tools.js','business-partner-insight-tools.js','business-partner-list-insights.js','entity-section-tool.js','entity-section-tool-selection.js','knowledge.js','runtime-tool-coordinator.js'];
const modules=files.map(name=>({name,present:fs.existsSync(path.join(dir,name)),sha256:fs.existsSync(path.join(dir,name))?hash(fs.readFileSync(path.join(dir,name))):null}));
const localPath=process.env.ATLAS_LOCAL_INFERENCE_CONFIG_PATH;
let configuration=null;
if(localPath){const bytes=fs.readFileSync(localPath);const c=JSON.parse(bytes);configuration={sha256:hash(bytes),schema:c.schema,model:{upstream:c.model.upstream,digest:c.model.digest,displayName:c.model.displayName,publicId:c.model.publicId},engineVersion:c.engine?.version,request:{num_ctx:c.request.num_ctx,num_predict:c.request.num_predict,think:c.request.think},cloudEnabled:c.cloudEnabled};}
const compositionPath=path.join(process.cwd(),'dist/composition/register-services.js');
const composition=fs.readFileSync(compositionPath,'utf8');
const policyPath=path.join(dir,'local-generation-composition.js');
const policySource=fs.existsSync(policyPath)?fs.readFileSync(policyPath,'utf8'):null;
const adapterPackages=fs.readdirSync(path.join(process.cwd(),'node_modules/@athyper')).filter(name=>/adapter.*(ai-|search|redis|s3|object)/.test(name)).map(name=>{try{const entry=require.resolve('@athyper/'+name);return {name,entrySha256:hash(fs.readFileSync(entry))}}catch{return {name,entrySha256:null}}});
console.log(JSON.stringify({flags:Object.fromEntries(${JSON.stringify(flagNames)}.map(k=>[k,process.env[k]??null])),configuration,modules,
  adapterPackages,
  compositionSha256:hash(composition),policySourceSha256:policySource===null?null:hash(policySource),
  promptRevisions:[...new Set(policySource?.match(/atlas-local-chat-v[0-9]+/g)||[])],
  policyRevisions:[...new Set(policySource?.match(/atlas-local(?:-[a-z]+)*-v[0-9]+/g)||[])],
  compositionReferences:{insightOwner:composition.includes('businessPartnerAtlasInsights'),caseOwner:composition.includes('createBusinessPartnerCaseTools'),localProvider:composition.includes('OllamaModelProvider'),fullProviderKnowledge:composition.includes('createAtlasA2Services')},
  evidenceKind:'deployed-files-and-host-environment; not a live in-process registry snapshot'}));
`)));

await check('deployedToolFactories', () => JSON.parse(docker('exec', `athyper-${target}-api-1`, 'node', '--input-type=module', '-e', `
import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';
const require=createRequire(process.cwd()+'/package.json');const m=await import(pathToFileURL(require.resolve('@athyper/server-platform-ai')));
const unavailable=async()=>{throw Error('F0 must never execute a reader');};
const owner={read:unavailable,readContacts:unavailable,readAddresses:unavailable};
const definitions=[['records','createBusinessPartnerAtlasTools',[]],['case-owner','createBusinessPartnerCaseTools',[{read:unavailable}]],['insight-owner','createBusinessPartnerInsightTools',[owner,unavailable]]];
const missingFactoryExports=definitions.filter(([,name])=>typeof m[name]!=='function').map(([,name])=>name);
const groups=definitions.filter(([,name])=>typeof m[name]==='function').map(([requirement,name,args])=>[requirement,m[name](...args)]);
console.log(JSON.stringify({evidenceKind:'construction-only with nonexecuting owner placeholders; does not prove live registration or reader connectivity',
 missingFactoryExports,
 tools:groups.flatMap(([requirement,tools])=>tools.map(t=>({toolCode:t.manifest.toolCode,version:t.manifest.version,access:t.manifest.access,allowedPlanes:t.manifest.allowedPlanes,requiredPermissions:t.manifest.requiredPermissions,confirmation:t.manifest.confirmation,ownerRequirement:requirement,section:t.entitySection?.sectionKey??null})))}));
`)));

await check('providerMetadata', async () => {
  if(report.checks.deployedRuntime.status!=='captured')throw Error('Dependent runtime inventory unavailable');
  if (!report.checks.deployedRuntime.data?.configuration) return { configured: false, probe: 'not-applicable' };
  return JSON.parse(docker('exec', `athyper-${target}-api-1`, 'node', '-e', `
(async()=>{const c=JSON.parse(require('fs').readFileSync(process.env.ATLAS_LOCAL_INFERENCE_CONFIG_PATH));
if(c.endpoint!=='http://atlas-inference:11434')throw Error('Unsupported endpoint');
const get=async p=>{const r=await fetch(c.endpoint+p,{redirect:'error',signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error('Unavailable');return r.json()};
const [version,tags,ps]=await Promise.all([get('/api/version'),get('/api/tags'),get('/api/ps')]);
const model=(tags.models??[]).find(x=>x.name===c.model.upstream);const loaded=(ps.models??[]).find(x=>x.name===c.model.upstream);
const norm=s=>s?.replace(/^sha256:/,'');
console.log(JSON.stringify({engineVersion:version.version,expectedEngineVersion:c.engine.version,engineMatches:version.version===c.engine.version,modelPresent:!!model,digest:model?.digest??null,digestMatches:!!model&&norm(model.digest)===norm(c.model.digest),loaded:!!loaded,sizeBytes:loaded?.size??null,vramBytes:loaded?.size_vram??null,contextLength:loaded?.context_length??null,generationProbed:false}));})().catch(()=>process.exitCode=1);
`));
});

const schemaNames = plane => plane === 'studio' ? ['ai', 'runtime_meta', 'metadata', 'publication', 'snapshot'] : ['ai', 'runtime_meta'];
const expected = {};
for (const plane of planes) {
  const manifestPath=`server/db/ddl/planes/${plane}/_manifest.txt`;
  const manifest=readFileSync(resolve(root,manifestPath),'utf8');
  const files=manifest.split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith('#'));
  expected[plane] = files.flatMap(file=>declaredTables(readFileSync(resolve(root,'server/db/ddl',file),'utf8'))).filter(name=>schemaNames(plane).includes(name.split('.')[0]));
  await check(`${plane}.database`,()=>query(plane,`SELECT jsonb_build_object('observedAt',now(),'serverVersion',current_setting('server_version'),'readOnly',current_setting('transaction_read_only'),'apiStartedAt',${apiStartedAt ? `'${apiStartedAt}'` : 'NULL'})`));
  const schema = await check(`${plane}.schema`, () => query(plane, `SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.schema,t.table),'[]'::jsonb) FROM (
    SELECT n.nspname AS schema,c.relname AS table,c.relkind,c.relrowsecurity AS rls,c.relforcerowsecurity AS force_rls,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull) ORDER BY a.attnum),'[]'::jsonb) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('name',con.conname,'type',con.contype,'validated',con.convalidated,'definitionMd5',md5(pg_get_constraintdef(con.oid))) ORDER BY con.conname),'[]'::jsonb) FROM pg_constraint con WHERE con.conrelid=c.oid) AS constraints,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('name',ic.relname,'valid',i.indisvalid,'definitionMd5',md5(pg_get_indexdef(i.indexrelid))) ORDER BY ic.relname),'[]'::jsonb) FROM pg_index i JOIN pg_class ic ON ic.oid=i.indexrelid WHERE i.indrelid=c.oid) AS indexes,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('name',tg.tgname,'enabled',tg.tgenabled,'definitionMd5',md5(pg_get_triggerdef(tg.oid))) ORDER BY tg.tgname),'[]'::jsonb) FROM pg_trigger tg WHERE tg.tgrelid=c.oid AND NOT tg.tgisinternal) AS triggers,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('role',g.grantee,'privilege',g.privilege_type) ORDER BY g.grantee,g.privilege_type),'[]'::jsonb) FROM information_schema.role_table_grants g WHERE g.table_schema=n.nspname AND g.table_name=c.relname AND g.grantee IN ('athyper_runtime','athyperapp','athyperadmin','PUBLIC')) AS grants,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('name',p.polname,'command',p.polcmd,'definitionMd5',md5(coalesce(pg_get_expr(p.polqual,p.polrelid),'')||coalesce(pg_get_expr(p.polwithcheck,p.polrelid),''))) ORDER BY p.polname),'[]'::jsonb) FROM pg_policy p WHERE p.polrelid=c.oid) AS policies
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN (${schemaNames(plane).map(x => `'${x}'`).join(',')}) AND c.relkind IN ('r','p') AND NOT c.relispartition) t`));
  if (schema) report.schemaComparisons[plane] = compareTables(expected[plane], schema);

  await check(`${plane}.descriptors`, () => query(plane, `SELECT coalesce(jsonb_agg(jsonb_build_object(
    'entityCode',c.entity_code,'scopeKey',CASE WHEN c.tenant_id IS NULL THEN 'platform' ELSE md5(c.tenant_id::text) END,
    'releaseNo',c.release_no,'contractHash',c.entity_contract_hash,'descriptorHash',d.compiled_hash,
    'descriptorKind',d.descriptor_kind,'plane',d.plane_code,'activatedAt',h.activated_at,'artifactHash',h.artifact_hash,
    'fieldCount',jsonb_array_length(coalesce(d.compiled_json->'fields','[]'::jsonb)),
    'storageVersionField',d.compiled_json->'storage'->>'versionField','directoryMode',d.compiled_json->'directoryScope'->>'mode',
    'authorizationDeclared',d.compiled_json ? 'authorization','aiDeclared',d.compiled_json ? 'ai',
    'aiEnabled',d.compiled_json->'ai'->'enabled','aiContextKinds',d.compiled_json->'ai'->'contextKinds',
    'aiProviders',d.compiled_json->'ai'->'insightProviders','aiActions',d.compiled_json->'ai'->'actions',
    'aiSummaryFields',d.compiled_json->'ai'->'summaryFieldKeys','aiSearchFields',d.compiled_json->'ai'->'searchFieldKeys'
  ) ORDER BY c.entity_code,d.compiled_hash),'[]'::jsonb)
  FROM runtime_meta.release_activation_head h
  JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id AND a.status='active'
  JOIN runtime_meta.entity_descriptor d ON d.applied_release_id=a.id AND d.status='active'
  JOIN runtime_meta.entity_contract c ON c.id=d.entity_contract_id AND c.status='published'`));

  await check(`${plane}.experienceProfiles`, () => {
    if(!schema)throw Error('Dependent schema inventory unavailable');
    if(!schema.some(row=>row.schema==='ai'&&row.table==='atlas_experience_release'))return {tablePresent:false,profiles:[]};
    return {tablePresent:true,profiles:query(plane, `SELECT coalesce(jsonb_agg(jsonb_build_object(
    'scopeKey',md5(tenant_id::text||':'||scope),'revision',revision,'hash',content_hash,'status',status,
    'agents',(SELECT coalesce(jsonb_agg(jsonb_build_object('code',a->>'code','publicModelId',a->>'publicModelId','promptRevision',a->>'promptRevision','planes',a->'planes','toolCodes',a->'toolCodes')),'[]'::jsonb) FROM jsonb_array_elements(coalesce(definition->'agents','[]'::jsonb)) a)
    )),'[]'::jsonb) FROM ai.atlas_experience_release WHERE status='published'`)};
  });
  await check(`${plane}.policies`, () => query(plane, `SELECT jsonb_build_object(
    'actions',(SELECT coalesce(jsonb_agg(jsonb_build_object('scopeKey',md5(tenant_id::text),'actionCode',action_code,'autonomyLevel',autonomy_level,'confirmationRequired',requires_human_confirmation,'active',is_active)),'[]'::jsonb) FROM ai.ai_action_policy),
    'thresholds',(SELECT coalesce(jsonb_agg(jsonb_build_object('scopeKey',md5(tenant_id::text),'actionCode',action_code,'modelId',model_id,'suggest',min_for_suggest,'assist',min_for_assist,'auto',min_for_auto,'active',is_active)),'[]'::jsonb) FROM ai.ai_confidence_threshold),
    'quotaPolicies',(SELECT coalesce(jsonb_agg(jsonb_build_object('scopeKey',md5(tenant_id::text),'revision',revision,'maxRequests',max_requests,'maxInputTokens',max_input_tokens,'maxOutputTokens',max_output_tokens,'windowSeconds',window_seconds)),'[]'::jsonb) FROM ai.atlas_tenant_quota_policy),
    'knowledgeSources',(SELECT count(*) FROM ai.atlas_knowledge_source),
    'feedbackRows',(SELECT count(*) FROM ai.ai_feedback_log))`));
  await check(`${plane}.recentRuns`, () => query(plane, `SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM (
    SELECT outcome,error_code AS "errorCode",error_category AS "errorCategory",prompt_version AS "promptVersion",policy_revision AS "policyRevision",
    actual_model_id AS "actualModelId",count(*) AS count,max(completed_at) AS "lastAt",
    sum(model_call_count) AS "modelCalls",sum(tool_call_count) AS "toolCalls",
    count(*) FILTER (WHERE ${apiStartedAt ? `created_at >= '${apiStartedAt}'::timestamptz` : 'false'}) AS "sinceApiStartCount"
    FROM ai.ai_agent_run WHERE created_at >= now()-interval '24 hours'
    GROUP BY outcome,error_code,error_category,prompt_version,policy_revision,actual_model_id ORDER BY max(completed_at) DESC LIMIT 100) t`));
  await check(`${plane}.toolInvocations`, () => query(plane, `SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM (
    SELECT tool_code AS "toolCode",status,terminal_error_class AS "errorClass",policy_revision AS "policyRevision",count(*) AS count,max(created_at) AS "lastAt",
    count(*) FILTER (WHERE ${apiStartedAt ? `created_at >= '${apiStartedAt}'::timestamptz` : 'false'}) AS "sinceApiStartCount"
    FROM ai.ai_tool_invocation WHERE created_at >= now()-interval '24 hours'
    GROUP BY tool_code,status,terminal_error_class,policy_revision ORDER BY max(created_at) DESC LIMIT 100) t`));
  await check(`${plane}.durableRuns`,()=>query(plane,`SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM (
    SELECT status,terminal_error_class AS "errorClass",count(*) AS count,
    count(*) FILTER (WHERE metering_run_id IS NULL) AS "withoutMeteringLink",max(started_at) AS "lastStartedAt"
    FROM ai.atlas_run WHERE created_at>=now()-interval '24 hours'
    GROUP BY status,terminal_error_class ORDER BY max(started_at) DESC LIMIT 100) t`));
}

await check('authenticatedReadStatus', async () => {
  const require = createRequire(resolve(root, 'package.json'));
  const { request } = require('@playwright/test');
  const results = [];
  for (const persona of ['neon', 'neon-owner', 'neon-athyper']) {
    const storage = resolve(root, `tests/e2e/.auth/${persona}.json`);
    if (!existsSync(storage)) { results.push({ persona, status: 'storage-state-absent' }); continue; }
    const client = await request.newContext({baseURL:`https://neon.${target}.athyper.test`,ignoreHTTPSErrors:true,storageState:storage,timeout:8000});
    try {
      for (const path of ['/api/relay/atlas/admission','/api/relay/entity-runtime/business_partner/list-descriptor']) {
        try {
          const response=await client.get(path,{maxRedirects:0});
          results.push({persona,path,httpStatus:response.status()});
        } catch { results.push({persona,path,status:'request-unavailable'}); }
      }
    } finally { await client.dispose(); }
  }
  return {results,scope:'Existing stored sessions only; no login, role changes, record reads or model calls. HTTP 200 is not persona qualification.'};
});

await check('priorEvidence', () => {
  const dir = resolve(root, 'docs/architecture/business-partner/evidence');
  return readdirSync(dir).filter(name => /^(bp-ai|atlas-).*\.json$/.test(name) && !name.startsWith('atlas-f0-')).sort().map(name => {
    const bytes=readFileSync(resolve(dir,name));const receipt=JSON.parse(bytes);
    return {path:relative(root,resolve(dir,name)),sha256:sha256(bytes),...reconcileReceipt(receipt,api?.imageId)};
  });
});

report.capabilityMatrix = buildCapabilityMatrix(report.checks.deployedToolFactories.data?.tools ?? [],report.checks['neon.experienceProfiles'].data?.profiles ?? [],report.checks['neon.toolInvocations'].data ?? [],new Date(Date.parse(report.capturedAt)-86400000).toISOString());
for (const [plane, comparison] of Object.entries(report.schemaComparisons)) {
  if (comparison.missing.length || comparison.extra.length) report.findings.push({code:'SCHEMA_TABLE_PRESENCE_DIFFERENCE',plane,...comparison});
}
for (const plane of planes) {
  const bp=(report.checks[`${plane}.descriptors`].data??[]).filter(row=>row.entityCode==='business_partner');
  for(const descriptor of bp) {
    if(!descriptor.aiDeclared)report.findings.push({code:'BP_AI_METADATA_ABSENT',plane,descriptorHash:descriptor.descriptorHash,interpretation:'Legacy NEON BP admission does not establish generic entity AI enablement.'});
    if(!descriptor.storageVersionField)report.findings.push({code:'BP_STORAGE_VERSION_FIELD_ABSENT',plane,descriptorHash:descriptor.descriptorHash,interpretation:'Content-hash citations and owner revisions remain distinct from a published row-version field.'});
  }
}
report.findings.push({code:'REGISTRY_OBSERVABILITY_LIMIT',interpretation:'Factory inventory, published profile references and invocation history are separate evidence. No live in-process registry introspection endpoint was used.'});
for(const plane of planes){const profiles=report.checks[`${plane}.experienceProfiles`].data;if(profiles?.tablePresent===false)report.findings.push({code:'EXPERIENCE_PROFILE_TABLE_ABSENT',plane});else if(profiles?.profiles.length===0)report.findings.push({code:'NO_PUBLISHED_EXPERIENCE_PROFILE',plane,interpretation:'Default Atlas behavior is separate from a published agent tool allowlist.'});}
const storedStatuses=report.checks.authenticatedReadStatus.data?.results??[];
if(!storedStatuses.some(row=>row.httpStatus===200))report.findings.push({code:'AUTHENTICATED_OBSERVATION_UNAVAILABLE',interpretation:'Stored sessions did not establish current signed-in admission. No credentials or permissions changed.'});
const configured=report.checks.deployedRuntime.data?.configuration;
report.modelConfigurationMatchesSource=configured?configured.sha256===report.checks.checkedModelConfiguration.data?.sha256:null;
if(configured&&report.modelConfigurationMatchesSource===false)report.findings.push({code:'DEPLOYED_MODEL_CONFIGURATION_DIFFERS_FROM_SOURCE'});
if(report.checks.providerMetadata.data?.configured!==false&&report.checks.providerMetadata.status==='captured'&&(!report.checks.providerMetadata.data.engineMatches||!report.checks.providerMetadata.data.digestMatches))report.findings.push({code:'PROVIDER_PIN_MISMATCH'});
report.assessment=assessBaseline(report.checks,report.schemaComparisons);
if(api){try{
  const end=JSON.parse(docker('inspect',`athyper-${target}-api-1`,'--format','{"imageId":{{json .Image}},"startedAt":{{json .State.StartedAt}}}'));
  report.deploymentStableDuringCapture=end.imageId===api.imageId&&end.startedAt===api.startedAt;
}catch{report.deploymentStableDuringCapture=false;}
if(!report.deploymentStableDuringCapture){report.assessment.inventoryStatus='partial';report.assessment.missingObservations.push('stable-api-deployment');}}
if(report.checks.source.data){
  const currentFiles=[...new Set(run('git',['ls-files','-z','--cached','--others','--exclude-standard','--',...sourcePaths]).split('\0').filter(Boolean))].sort().map(path=>({path,sha256:existsSync(resolve(root,path))?sha256(readFileSync(resolve(root,path))):null}));
  report.sourceStableDuringCapture=sha256(JSON.stringify(currentFiles))===report.checks.source.data.scopedTreeSha256;
  if(!report.sourceStableDuringCapture){report.assessment.inventoryStatus='partial';report.assessment.missingObservations.push('stable-source-snapshot');}
}
report.completedAt=new Date().toISOString();
const path=resolve(root,output);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(report,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({output:path,assessment:report.assessment,capabilities:report.capabilityMatrix.length,findings:report.findings.length}));
if(report.assessment.inventoryStatus==='partial')process.exitCode=1;
