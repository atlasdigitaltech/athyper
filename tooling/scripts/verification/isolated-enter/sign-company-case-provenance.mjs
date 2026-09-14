import fs from "node:fs";
import cp from "node:child_process";
const script = `
import {loadConfig} from './src/config/index.ts';import {createContainer} from './src/composition/create-container.ts';import {registerAdapters} from './src/composition/register-adapters.ts';import {createLifecycle} from '@athyper/server-foundation/lifecycle';
import {KyselyPublicationAuthorityWork,KyselyPublicationAuthorityRepository,VerifiedPublicationArtifactLoader} from '@athyper/server-service-publication';import {canonicalBytes,sha256} from '@athyper/server-adapter-publication-signing';import {sql} from 'kysely';
const config=loadConfig(),container=createContainer();registerAdapters(container,config,createLifecycle());
if(new URL(config.studioDatabase.connectionString).hostname!=='athyper-bp-enter-db')throw Error('ISOLATED_AUTHORITY_REQUIRED');
const releaseId='ecbf538d-a1b7-4ba3-bb28-147d7263ed76',tenantId='44444444-4444-4444-8444-444444444444';
const result=await container.adapters.athyperDatabase.database.transaction().execute(async database=>{
await sql\`SELECT set_config('app.current_tenant_id',\${tenantId},true)\`.execute(database);
const worker=(await sql\`SELECT id FROM master.principal WHERE tenant_id=\${tenantId}::uuid AND code='seed.three-plane-provisioner' AND principal_type='service_account' AND status='active'\`.execute(database)).rows[0];if(!worker)throw Error('EXISTING_WORKER_IDENTITY_REQUIRED');await sql\`SELECT set_config('app.current_principal_id',\${worker.id},true)\`.execute(database);
const work=new KyselyPublicationAuthorityWork({caseOperationCatalog:async()=> (await sql.raw("SELECT p.id,p.canonical_code code,p.permission_kind kind,array_agg(DISTINCT s.scope_kind::text) AS scope_kinds FROM authz.permission p JOIN authz.permission_scope_kind s ON s.permission_id=p.id AND s.status='active' AND s.propagation_mode='exact' WHERE p.status='published' AND p.canonical_code LIKE 'neon.relationship.bp_company_setup_request.%' GROUP BY p.id,p.canonical_code,p.permission_kind").execute(container.adapters.neonDatabase.database)).rows.map(row=>({...row,scopeKinds:row.scope_kinds})),database,authority:new KyselyPublicationAuthorityRepository(database),store:container.adapters.publicationArtifactStore,signer:container.adapters.publicationSigner,canonicalizer:{canonicalBytes,sha256},bucket:container.adapters.objectStorageArtifactsBucket,signingKeyId:config.publication.signingKeyId,targetEnvironment:config.env,targetPlanes:['neon']});
const compiled=await work.compile(releaseId);const signed=[];for(const id of compiled.compilationIds)signed.push(await work.sign(id));return {compiled,signed};});
const artifacts=await container.adapters.athyperDatabase.database.transaction().execute(async db=>{await sql.raw('SET TRANSACTION READ ONLY').execute(db);await sql\`SELECT set_config('app.current_tenant_id',\${tenantId},true)\`.execute(db);return(await sql\`SELECT a.*,r.release_key,r.release_no FROM publication.artifact a JOIN publication.release r ON r.id=a.publication_release_id WHERE r.id=\${releaseId}::uuid AND a.status='signed'\`.execute(db)).rows;});
if(artifacts.length!==1)throw Error('ONE_COMPANY_ARTIFACT_REQUIRED');const loader=new VerifiedPublicationArtifactLoader({store:container.adapters.publicationArtifactStore,verifier:container.adapters.publicationVerifier,canonicalizer:{canonicalBytes,sha256},runtimeVersion:config.publication.runtimeVersion});const verified=[];
for(const a of artifacts){const coordinate={artifactUri:a.artifact_uri,artifactHash:a.content_hash,targetPlane:a.plane_code,publicationKey:a.release_key,sourceReleaseId:a.publication_release_id,sourceReleaseNo:Number(a.release_no),signatureAlgorithm:a.signature_algorithm,signingKeyId:a.signing_key_id,signature:a.signature};const loaded=await loader.load(coordinate);const negative={};for(const [name,patch]of Object.entries({hash:{artifactHash:'0'.repeat(64)},signature:{signature:'invalid'},release:{sourceReleaseId:'00000000-0000-4000-8000-000000000001'}})){try{await loader.load({...coordinate,...patch});negative[name]=false;}catch{negative[name]=true;}if(!negative[name])throw Error('ALTERED_COORDINATE_ACCEPTED');}verified.push({releaseId,artifactHash:a.content_hash,verification:loaded.verification,negative,document:loaded.document});}
console.log(JSON.stringify({kind:'company-case-signing',capturedAt:new Date().toISOString(),result,verified,dispatched:false,activated:false,workInvocation:'operator-invoked production compiler/signer; original queued compile job not drained'}));process.exit(0);
`;
const r = cp.spawnSync(
  "docker",
  [
    "exec",
    "-i",
    "athyper-bp-dependency-studio-api",
    "node",
    "--import",
    "tsx",
    "--input-type=module",
  ],
  { input: script, encoding: "utf8", timeout: 60000, maxBuffer: 4000000 },
);
if (r.status) {
  console.error(
    r.stderr
      .split("\n")
      .filter((l) => !l.includes("postgresql:"))
      .slice(0, 12)
      .join("\n"),
  );
  process.exitCode = 1;
} else {
  const report = JSON.parse(
    r.stdout
      .split("\n")
      .find((l) => l.startsWith('{"kind":"company-case-signing"')),
  );
  const path =
    "governance/policy/reports/business-partner-company-case-provenance-signing-" +
    Date.now() +
    ".dev.json";
  fs.writeFileSync(path, JSON.stringify(report, null, 2) + "\n", {
    flag: "wx",
  });
  console.log({
    report: path,
    artifacts: report.verified.map((v) => ({
      releaseId: v.releaseId,
      artifactHash: v.artifactHash,
      negative: v.negative,
    })),
    dispatched: false,
    activated: false,
  });
}
