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
if (process.argv.length !== 3 || process.argv[2] !== "--compile-sign")
  throw Error("Use --compile-sign");
const run = (args, options = {}) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    ...options,
  });
const report = JSON.parse(
  readFileSync(
    "governance/policy/reports/business-partner-v2-worker-candidate.dev.json",
  ),
);
const before = JSON.parse(run(["inspect", "athyper-dev-worker-1"]))[0];
if (before.Image !== report.baseImage)
  throw Error("Worker changed during qualification");
const root = join(
  homedir(),
  ".athyper/instances/dev/deployments/bp-release-20-worker-20260911",
);
const seal = JSON.parse(
  readFileSync(
    "governance/policy/reports/business-partner-release-20-review-seal.dev.json",
  ),
);
const packet = JSON.parse(
  readFileSync(
    "governance/policy/reviews/business-partner-release-20-workflow.dev.json",
  ),
);
const exact = JSON.parse(
  readFileSync(
    "governance/policy/reports/business-partner-v2-exact-release.dev.json",
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
const script = `import{readFileSync}from'node:fs';import{runWithJobContext}from'@athyper/server-foundation/context';import{createAuthenticatedEntityReleaseReview}from'@athyper/server-service-publication';import{loadConfig}from'/app/server/dist/config/index.js';import{createContainer}from'/app/server/dist/composition/create-container.js';import{registerAdapters}from'/app/server/dist/composition/register-adapters.js';import{registerPlatform}from'/app/server/dist/composition/register-platform.js';import{registerRuntimes}from'/app/server/dist/composition/register-runtimes.js';import{registerServices}from'/app/server/dist/composition/register-services.js';import{loadDeploymentEntityReleaseReview}from'/app/server/dist/composition/entity-release-review-deployment.js';import{createLifecycle}from'/app/server/node_modules/@athyper/server-foundation/dist/lifecycle/index.js';
const config=loadConfig(),lifecycle=createLifecycle(),container=createContainer();registerAdapters(container,config,lifecycle);registerRuntimes(container,config,lifecycle);registerPlatform(container,config);
const registered=new Map(),scheduled=[];const originalRegister=container.runtimes.jobs.register.bind(container.runtimes.jobs);container.runtimes.jobs.register=(queue,name,handler)=>{registered.set(name,handler);return originalRegister(queue,name,handler)};container.runtimes.jobs.enqueue=async(queue,name,data,options)=>{if(!['publication.sign-artifact','publication.dispatch'].includes(name))throw Error('Unexpected downstream job');scheduled.push({queue,name,data,options});return 'captured:'+scheduled.length};
const review=loadDeploymentEntityReleaseReview('/bp-review-config.json',{neon:container.adapters.neonDatabase.database,studio:container.adapters.athyperDatabase.database});registerServices(container,{entityAuthorizationReleaseReview:review},config);
const services=container.services,checks={recordSurfaces:!!services.records?.surfaces,providers:!!services.businessPartner360,governedImport:!!services.businessPartnerGovernedImport,requestPreflight:typeof services.businessPartnerRequests?.preflightCreate==='function',revealPreflight:typeof services.businessPartner360?.preflightReveal==='function',qualificationPreflight:typeof services.businessPartnerEligibility?.preflightQualification==='function',exportPreflight:typeof services.records?.transfers?.preflightExport==='function',compiler:container.runtimes.jobDefinitions.some(j=>j.code==='publication.compile-artifact')};
if(Object.values(checks).some(v=>!v))throw Error(JSON.stringify({checks}));const exact=JSON.parse(readFileSync('/bp-exact.json','utf8'));
const reviewReceipt=await createAuthenticatedEntityReleaseReview(review).qualify(exact.coordinate);

const id=exact.coordinate.releaseId;if(id!=='21bec59b-86fb-441c-93b2-5027f2999d0b'||exact.coordinate.releaseNo!==20)throw Error('Exact approved release required');
const execution={tenantId:exact.coordinate.tenantId,principalId:'01a08402-6143-7590-9a3e-cbf04c6110a1',planeKey:'studio',scope:'tenant',requestId:'bp-release20-signing'};
const invoke=(name,data)=>runWithJobContext(execution,()=>registered.get(name).handle({id:'bp-release20:'+name,name,data,execution}));
const compile=await invoke('publication.compile-artifact',{releaseId:id});const signing=scheduled.filter(j=>j.name==='publication.sign-artifact');if(!signing.length)throw Error('No native compilations');const signed=[];for(const job of signing)signed.push(await invoke(job.name,job.data));
console.log(JSON.stringify({kind:'bp_release20_native_handler_signing',releaseId:id,checks,reviewReceipt,compile,signed,dispatchHeld:scheduled.filter(j=>j.name==='publication.dispatch').map(j=>j.data),queueConsumersStarted:false,dispatchExecuted:false,grantsChanged:false,activationAuthorized:false}));process.exit(0);`;
// Resolve package import from /app/server rather than from a bind-mounted script.
writeFileSync(
  join(root, "sign-only.mjs"),
  script.replace(
    "'/app/server/node_modules/@athyper/server-foundation/dist/lifecycle/index.js'",
    "'@athyper/server-foundation/lifecycle'",
  ),
);
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
      dirname(seal.directory) + ":/bp-review:ro",
      "-v",
      evidenceRoot + ":/bp-evidence:ro",
      "-v",
      join(root, "review-config.json") + ":/bp-review-config.json:ro",
      "-v",
      join(root, "exact.json") + ":/bp-exact.json:ro",
      "-v",
      join(root, "sign-only.mjs") + ":/app/server/bp-sign-only.mjs:ro",
      "--entrypoint",
      "node",
      report.imageId,
      "/app/server/bp-sign-only.mjs",
    ],
    { timeout: 60000 },
  );
  const receipt = JSON.parse(result.split("\n").find((l) => l.startsWith("{")));
  writeFileSync(
    "governance/policy/reports/business-partner-v2-runtime-signing.dev.json",
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
