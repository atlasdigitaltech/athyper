import fs from "node:fs";
import cp from "node:child_process";
const signed = JSON.parse(
  fs.readFileSync(
    "governance/policy/reports/business-partner-company-case-signing-1789182508198.dev.json",
  ),
);
const deploymentId = signed.result.signed[0].deploymentId;
const script = `
import {loadConfig} from './src/config/index.ts';import {createContainer} from './src/composition/create-container.ts';import {registerAdapters} from './src/composition/register-adapters.ts';import {createLifecycle} from '@athyper/server-foundation/lifecycle';import {KyselyPublicationAuthorityRepository,KyselyLocalProjectionRepository,VerifiedPublicationArtifactLoader} from '@athyper/server-service-publication';import {canonicalBytes,sha256} from '@athyper/server-adapter-publication-signing';import {sql} from 'kysely';
const config=loadConfig(),container=createContainer();registerAdapters(container,config,createLifecycle());for(const url of [config.database.connectionString,config.studioDatabase.connectionString])if(new URL(url).hostname!=='athyper-bp-enter-db')throw Error('ISOLATED_DATABASE_REQUIRED');
const tenant='44444444-4444-4444-8444-444444444444';const scoped=async(db,work)=>db.transaction().execute(async tx=>{await sql\`SELECT set_config('app.current_tenant_id',\${tenant},true)\`.execute(tx);return work(tx);});
const deployment=await scoped(container.adapters.athyperDatabase.database,tx=>new KyselyPublicationAuthorityRepository(tx).getDeployment('${deploymentId}'));if(!deployment||deployment.sourceReleaseId!=='ed6a7433-b41d-4ad8-8dda-44e1bdfba4a8'||!['pending','failed'].includes(deployment.deploymentStatus))throw Error('FAILED_CANDIDATE_COORDINATE_CHANGED');
const loader=new VerifiedPublicationArtifactLoader({store:container.adapters.publicationArtifactStore,verifier:container.adapters.publicationVerifier,canonicalizer:{canonicalBytes,sha256},runtimeVersion:config.publication.runtimeVersion});const loaded=await loader.load(deployment);
let failure;try{await scoped(container.adapters.neonDatabase.database,async tx=>{await new KyselyLocalProjectionRepository(tx).stage({deployment,artifact:loaded.document});throw Error('UNEXPECTEDLY_ACCEPTED');});}catch(e){if(e.message!=='COMPANY_CASE_OPERATION_SOURCE_INVALID')throw e;failure=e.message;}
if(!failure)throw Error('PROJECTION_FAILURE_REQUIRED');await scoped(container.adapters.athyperDatabase.database,tx=>new KyselyPublicationAuthorityRepository(tx).transitionDeployment({deploymentId:'${deploymentId}',status:'failed',evidence:{code:failure,detail:'Signed artifact rejected by production projection; missing reviewed operation provenance',phase:'stage',retryable:false,activationAttempted:false}}));console.log(JSON.stringify({kind:'company-projection-failure',capturedAt:new Date().toISOString(),deploymentId:'${deploymentId}',sourceReleaseId:deployment.sourceReleaseId,artifactHash:deployment.artifactHash,failure,artifactSignatureVerified:true,projectionRolledBack:true,releaseWithdrawn:false,artifactWithdrawn:false,activated:false}));process.exit(0);
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
  { input: script, encoding: "utf8", timeout: 60000 },
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
  const result = JSON.parse(
    r.stdout
      .split("\n")
      .find((l) => l.startsWith('{"kind":"company-projection-failure"')),
  );
  fs.writeFileSync(
    "governance/policy/reports/business-partner-company-case-projection-failure-20260912.dev.json",
    JSON.stringify(result, null, 2) + "\n",
    { flag: "wx" },
  );
  console.log(result);
}
