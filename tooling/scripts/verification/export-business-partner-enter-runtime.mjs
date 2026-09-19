import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  copyFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
if (process.argv.length !== 2)
  throw Error("Read-only verification takes no arguments");
const run = (args, options = {}) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    ...options,
  });
const before = JSON.parse(run(["inspect", "athyper-dev-worker-1"]))[0];
const report = {
  imageId:
    "sha256:671d0d5abecbfc16790e2d8e643222171eed8d1b5ab485b3b4048b466439fc47",
};
if (before.Image !== report.imageId) throw Error("Signing image changed");
const root = join(
  homedir(),
  ".athyper/instances/dev/deployments/bp-enter-correction-worker-20260911",
);
const seal = JSON.parse(
  readFileSync(
    "governance/policy/reports/business-partner-enter-correction-review-seal.dev.json",
  ),
);
const packet = JSON.parse(
  readFileSync(
    "governance/policy/reviews/business-partner-enter-correction-runtime-workflow.dev.json",
  ),
);
const exact = JSON.parse(
  readFileSync(
    "governance/policy/reports/business-partner-enter-correction-exact-release.dev.json",
  ),
);
const evidenceRoot = join(root, "evidence");
mkdirSync(evidenceRoot, { recursive: true, mode: 0o700 });
for (const row of packet.rows)
  for (const e of [
    ...row.proposal.implementationEvidence,
    ...row.proposal.regressionEvidence,
  ]) {
    const p = join(evidenceRoot, e.path);
    mkdirSync(dirname(p), { recursive: true });
    copyFileSync(e.path, p);
  }
const config = {
  schemaVersion: 1,
  root: "/bp-review",
  evidenceRoot: "/bp-evidence",
  manifestPins: { [seal.releaseId]: seal.manifestSha256 },
};
writeFileSync(join(root, "review-config.json"), JSON.stringify(config), {
  mode: 0o600,
});
writeFileSync(join(root, "exact.json"), JSON.stringify(exact), { mode: 0o600 });
const script = `import{readFileSync,writeFileSync}from'node:fs';import{runWithJobContext}from'@athyper/server-foundation/context';import{createAuthenticatedEntityReleaseReview,KyselyPublicationAuthorityWork,VerifiedPublicationArtifactLoader}from'@athyper/server-service-publication';import{sql}from'kysely';import{canonicalBytes,sha256}from'@athyper/server-adapter-publication-signing';import{loadConfig}from'/app/server/dist/config/index.js';import{createContainer}from'/app/server/dist/composition/create-container.js';import{registerAdapters}from'/app/server/dist/composition/register-adapters.js';import{registerPlatform}from'/app/server/dist/composition/register-platform.js';import{registerRuntimes}from'/app/server/dist/composition/register-runtimes.js';import{registerServices}from'/app/server/dist/composition/register-services.js';import{loadDeploymentEntityReleaseReview}from'/app/server/dist/composition/entity-release-review-deployment.js';import{createLifecycle}from'/app/server/node_modules/@athyper/server-foundation/dist/lifecycle/index.js';
const config=loadConfig(),lifecycle=createLifecycle(),container=createContainer();registerAdapters(container,config,lifecycle);registerRuntimes(container,config,lifecycle);registerPlatform(container,config);
const registered=new Map(),scheduled=[];const originalRegister=container.runtimes.jobs.register.bind(container.runtimes.jobs);container.runtimes.jobs.register=(queue,name,handler)=>{registered.set(name,handler);return originalRegister(queue,name,handler)};container.runtimes.jobs.enqueue=async(queue,name,data,options)=>{if(!['publication.sign-artifact','publication.dispatch'].includes(name))throw Error('Unexpected downstream job');scheduled.push({queue,name,data,options});return 'captured:'+scheduled.length};
const review=loadDeploymentEntityReleaseReview('/bp-review-config.json',{neon:container.adapters.neonDatabase.database,studio:container.adapters.athyperDatabase.database});registerServices(container,{entityAuthorizationReleaseReview:review},config);
const services=container.services,checks={recordSurfaces:!!services.records?.surfaces,providers:!!services.businessPartner360,governedImport:!!services.businessPartnerGovernedImport,requestPreflight:typeof services.businessPartnerRequests?.preflightCreate==='function',revealPreflight:typeof services.businessPartner360?.preflightReveal==='function',qualificationPreflight:typeof services.businessPartnerEligibility?.preflightQualification==='function',exportPreflight:typeof services.records?.transfers?.preflightExport==='function',compiler:container.runtimes.jobDefinitions.some(j=>j.code==='publication.compile-artifact')};
if(Object.values(checks).some(v=>!v))throw Error(JSON.stringify({checks}));const exact=JSON.parse(readFileSync('/bp-exact.json','utf8'));
const reviewReceipt=await createAuthenticatedEntityReleaseReview(review).qualify(exact.coordinate);

const id=exact.coordinate.releaseId;if(id!=='c2cc6900-26c1-47ca-8dfc-1d488000950c'||exact.coordinate.releaseNo!==1)throw Error('Exact approved release required');
const execution={tenantId:exact.coordinate.tenantId,principalId:exact.durable.publishedBy,planeKey:'studio',scope:'tenant',requestId:'bp-release20-signing'};
const invoke=(name,data)=>runWithJobContext(execution,()=>registered.get(name).handle({id:'bp-release20:'+name,name,data,execution}));
// Capture the actual composed runtime verifier without executing compilation.
// This interception is confined to this disposable inspection process.
let runtime;const originalCompile=KyselyPublicationAuthorityWork.prototype.compile;
try{KyselyPublicationAuthorityWork.prototype.compile=function(){runtime=this.options.authorizationCompilation?.runtime;return Promise.resolve({compilationIds:[]})};await invoke('publication.compile-artifact',{releaseId:id});}finally{KyselyPublicationAuthorityWork.prototype.compile=originalCompile;}
if(!runtime)throw Error('Native runtime verifier unavailable');
const rows=await container.adapters.athyperDatabase.database.transaction().execute(async tx=>{await sql.raw("SET TRANSACTION READ ONLY").execute(tx);await sql.raw("SET LOCAL app.current_tenant_id='44444444-4444-4444-8444-444444444444'").execute(tx);return(await sql.raw("SELECT a.*,r.release_key,r.release_no FROM publication.artifact a JOIN publication.release r ON r.id=a.publication_release_id WHERE r.id='c2cc6900-26c1-47ca-8dfc-1d488000950c' AND a.status='signed'").execute(tx)).rows;});
if(rows.length!==1)throw Error('Exactly one signed runtime artifact required');const a=rows[0];
const loader=new VerifiedPublicationArtifactLoader({store:container.adapters.publicationArtifactStore,verifier:container.adapters.publicationVerifier,canonicalizer:{canonicalBytes,sha256},runtimeVersion:config.publication.runtimeVersion,authorizationRuntime:runtime});
const coordinate={artifactUri:a.artifact_uri,artifactHash:a.content_hash,targetPlane:a.plane_code,publicationKey:a.release_key,sourceReleaseId:a.publication_release_id,sourceReleaseNo:Number(a.release_no),signatureAlgorithm:a.signature_algorithm,signingKeyId:a.signing_key_id,signature:a.signature};
const loaded=await loader.load(coordinate);const artifactBytes=await container.adapters.publicationArtifactStore.get({uri:a.artifact_uri,expectedSha256:a.content_hash});if(sha256(artifactBytes)!==a.content_hash)throw Error('Export hash mismatch');writeFileSync('/bp-export/artifact.json',artifactBytes,{mode:0o600,flag:'wx'});writeFileSync('/bp-export/coordinate.json',JSON.stringify(coordinate,null,2),{mode:0o600,flag:'wx'});const d=loaded.document.envelope.payload.entityDescriptor.descriptor;
if(d.authorizationRuntime.schemaVersion!==2||d.authorization.operations.length!==42)throw Error('Unexpected signed runtime');
let alteredHashRejected=false;try{await loader.load({...coordinate,artifactHash:'0'.repeat(64)});}catch{alteredHashRejected=true;}if(!alteredHashRejected)throw Error('Altered artifact hash accepted');
console.log(JSON.stringify({kind:'bp_release20_runtime_verification',releaseId:id,artifactId:a.id,artifactHash:a.content_hash,verification:loaded.verification,runtimeVersion:d.authorizationRuntime.runtimeVersion,operationCount:d.authorization.operations.length,reviewReceipt,alteredHashRejected,readOnly:true,grantsChanged:false,activationAuthorized:false}));process.exit(0);`;
// Resolve package import from /app/server rather than from a bind-mounted script.
writeFileSync(
  join(root, "export-verified.mjs"),
  script.replace(
    "'/app/server/node_modules/@athyper/server-foundation/dist/lifecycle/index.js'",
    "'@athyper/server-foundation/lifecycle'",
  ),
);
const exportRoot = join(
  homedir(),
  ".athyper/instances/dev/deployments/bp-enter-isolated-20260911",
);
mkdirSync(exportRoot, { recursive: true, mode: 0o700 });
const env = run([
  "exec",
  "athyper-dev-worker-1",
  "node",
  "--input-type=module",
  "-e",
  `import{readFileSync,readdirSync}from'node:fs';const pid=readdirSync('/proc').find(p=>/^\\d+$/.test(p)&&readFileSync('/proc/'+p+'/cmdline','utf8').startsWith('node\\0dist/main.js'));if(!pid)throw Error('Worker process missing');process.stdout.write(readFileSync('/proc/'+pid+'/environ','utf8'));`,
]);
const entries = env.split("\0").filter(Boolean);
if (entries.some((e) => e.includes("\n")))
  throw Error("Multiline environment not supported");
const envFile = join(root, ".smoke.env");
writeFileSync(envFile, entries.join("\n") + "\n", { mode: 0o600 });
try {
  const mounts = before.Mounts.filter(
    (m) =>
      !["/bp-review", "/bp-evidence", "/bp-review-config.json"].includes(
        m.Destination,
      ),
  ).flatMap((m) => [
    "-v",
    m.Source + ":" + m.Destination + (m.RW ? "" : ":ro"),
  ]);
  const result = run(
    [
      "run",
      "--rm",
      ...Object.keys(before.NetworkSettings.Networks)
        .filter((n) => n.endsWith("_app") || n.endsWith("_data"))
        .flatMap((n) => ["--network", n]),
      "--env-file",
      envFile,
      ...mounts,
      "-v",
      exportRoot + ":/bp-export",
      "-v",
      dirname(seal.directory) + ":/bp-review:ro",
      "-v",
      evidenceRoot + ":/bp-evidence:ro",
      "-v",
      join(root, "review-config.json") + ":/bp-review-config.json:ro",
      "-v",
      join(root, "exact.json") + ":/bp-exact.json:ro",
      "-v",
      join(root, "export-verified.mjs") +
        ":/app/server/bp-export-verified.mjs:ro",
      "--entrypoint",
      "node",
      report.imageId,
      "/app/server/bp-export-verified.mjs",
    ],
    { timeout: 60000 },
  );
  const receipt = JSON.parse(result.split("\n").find((l) => l.startsWith("{")));
  writeFileSync(
    "governance/policy/reports/business-partner-enter-runtime-export.dev.json",
    JSON.stringify(
      {
        ...receipt,
        imageId: report.imageId,
        capturedAt: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
  );
  console.log(receipt);
} finally {
  rmSync(envFile, { force: true });
}
