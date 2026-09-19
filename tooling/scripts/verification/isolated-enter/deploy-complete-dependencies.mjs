import fs from "node:fs";
import os from "node:os";
import { spawnSync } from "node:child_process";
const root =
  os.homedir() +
  "/.athyper/instances/dev/deployments/bp-enter-isolated-20260911";
const password = fs
  .readFileSync(root + "/database.env", "utf8")
  .split("\n")
  .find((x) => x.startsWith("POSTGRES_PASSWORD="))
  .slice(18);
const verification = JSON.parse(
  fs.readFileSync(
    "governance/policy/reports/business-partner-dependency-artifact-verification-1789168786752.dev.json",
  ),
);
const pins = Object.fromEntries(
  verification.results.map((r) => [r.releaseId, r.artifactHash]),
);
const migration = fs
  .readFileSync(
    "server/db/scripts/operations/upgrades/legacy-baseline-20260914/20260912_runtime_contract_code_identity.sql",
    "utf8",
  )
  .replace(/BEGIN;/, "")
  .replace(/COMMIT;/, "");
const dryRun = process.argv.includes("--dry-run");
const script = `
import {loadConfig} from './src/config/index.ts';import {createContainer} from './src/composition/create-container.ts';import {registerAdapters} from './src/composition/register-adapters.ts';import {createLifecycle} from '@athyper/server-foundation/lifecycle';
import {VerifiedPublicationArtifactLoader,KyselyLocalProjectionRepository} from '@athyper/server-service-publication';import {canonicalBytes,sha256} from '@athyper/server-adapter-publication-signing';import {sql,Kysely,PostgresDialect} from 'kysely';import {createNeonDatabaseAdapter} from '@athyper/server-adapter-db-neon';import {randomUUID} from 'node:crypto';
const config=loadConfig(),container=createContainer();registerAdapters(container,config,createLifecycle());
const pins=${JSON.stringify(pins)};
const conn=new URL(config.database.connectionString);if(conn.hostname!=='athyper-bp-enter-db'||conn.pathname!=='/athyper_neon')throw Error('ISOLATED_DESTINATION_REQUIRED');conn.username='postgres';conn.password=${JSON.stringify(password)};
const db=createNeonDatabaseAdapter({connectionString:conn.toString(),max:2}).database;
const rows=await container.adapters.athyperDatabase.database.transaction().execute(async tx=>{await sql.raw('SET TRANSACTION READ ONLY').execute(tx);await sql.raw("SET LOCAL app.current_tenant_id='44444444-4444-4444-8444-444444444444'").execute(tx);return(await sql.raw("SELECT a.*,r.release_key,r.release_no FROM publication.artifact a JOIN publication.release r ON r.id=a.publication_release_id WHERE r.id IN ('ff8168be-3136-41d5-9d07-df65c91d5c83','9827ce80-766d-4262-9b4f-835307ac33d2','145f6381-50c7-4450-8e16-7d66bf30b237') AND a.status='signed'").execute(tx)).rows;});
if(rows.length!==3)throw Error('DEPENDENCY_SET_MISMATCH');
const loader=new VerifiedPublicationArtifactLoader({store:container.adapters.publicationArtifactStore,verifier:container.adapters.publicationVerifier,canonicalizer:{canonicalBytes,sha256},runtimeVersion:config.publication.runtimeVersion});
const prepared=[];for(const a of rows){if(pins[a.publication_release_id]!==a.content_hash)throw Error('PIN_MISMATCH');const deployment={deploymentId:randomUUID(),artifactUri:a.artifact_uri,artifactHash:a.content_hash,targetPlane:a.plane_code,publicationKey:a.release_key,sourceReleaseId:a.publication_release_id,sourceReleaseNo:Number(a.release_no),signatureAlgorithm:a.signature_algorithm,signingKeyId:a.signing_key_id,signature:a.signature};prepared.push({deployment,loaded:await loader.load(deployment)});}
let results;try {await db.transaction().execute(async tx=>{
await sql.raw(${JSON.stringify(migration)}).execute(tx);
await sql.raw("SET LOCAL app.current_tenant_id='44444444-4444-4444-8444-444444444444';SET LOCAL app.current_principal_id='cca94907-7519-5871-8e3c-6b11aa545c93'").execute(tx);
const before=(await sql.raw("SELECT artifact_hash FROM runtime_meta.release_activation_head WHERE publication_key='metadata.entity.business_partner.local-master-data.cirrusatlantic.enter-correction'").execute(tx)).rows;
if(before.length!==1||before[0].artifact_hash!=='45ddc85ece1f453e84b1eccc0cea9ca141fe9847c68ab7d2500e7d347d7b75fc')throw Error('BP_BASE_CHANGED');
const repository=new KyselyLocalProjectionRepository(tx),out=[];
for(const {deployment,loaded} of prepared){const active=await repository.findActive(deployment.publicationKey);if(active){if(active.artifactHash!==deployment.artifactHash)throw Error('EXISTING_DEPENDENCY_CHANGED');out.push({releaseId:deployment.sourceReleaseId,replay:true});continue;}
const staged=await repository.stage({deployment,artifact:loaded.document});await repository.verify({appliedReleaseId:staged.id,computedArtifactHash:deployment.artifactHash,evidence:loaded.verification});await repository.activate({appliedReleaseId:staged.id,evidence:{isolatedQualification:true,sharedActivation:false}});out.push({releaseId:deployment.sourceReleaseId,artifactHash:deployment.artifactHash,appliedReleaseId:staged.id,verification:loaded.verification});}
results=out;if(${dryRun})throw Error('EXPECTED_QUALIFICATION_ROLLBACK');});}catch(e){if(e.message!=='EXPECTED_QUALIFICATION_ROLLBACK')throw e;}
console.log(JSON.stringify({kind:'isolated-dependency-projection',capturedAt:new Date().toISOString(),results,rollbackOnly:${dryRun},sharedActivation:false}));process.exit(0);
`;
const r = spawnSync(
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
if (r.status !== 0) {
  console.error(
    (r.stderr ?? "")
      .split("\n")
      .filter((x) => !x.includes("password") && !x.includes("postgresql:"))
      .slice(0, 10)
      .join("\n"),
  );
  process.exit(1);
}
const report = JSON.parse(
  r.stdout
    .split("\n")
    .find((x) => x.startsWith('{"kind":"isolated-dependency-projection"')),
);
const out =
  "governance/policy/reports/business-partner-dependency-projection-" +
  Date.now() +
  ".dev.json";
fs.writeFileSync(out, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log({ report: out, ...report });
