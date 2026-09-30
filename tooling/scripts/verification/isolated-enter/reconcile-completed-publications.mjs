import fs from "node:fs";
import cp from "node:child_process";
const manifest = JSON.parse(
  fs.readFileSync(
    "governance/policy/reports/business-partner-company-correction-candidate-v2-20260912.dev.json",
  ),
);
const pins = manifest.artifacts.filter(
  (a) => a.releaseId !== "c2cc6900-26c1-47ca-8dfc-1d488000950c",
);
const script = `
import {loadConfig} from './src/config/index.ts';import {createContainer} from './src/composition/create-container.ts';import {registerAdapters} from './src/composition/register-adapters.ts';import {createLifecycle} from '@athyper/server-foundation/lifecycle';import {KyselyPublicationAuthorityRepository,VerifiedPublicationArtifactLoader}from '@athyper/server-service-publication';import{canonicalBytes,sha256}from'@athyper/server-adapter-publication-signing';import{sql}from'kysely';
const config=loadConfig(),container=createContainer();registerAdapters(container,config,createLifecycle());const tenant='44444444-4444-4444-8444-444444444444',pins=${JSON.stringify(pins)};for(const url of [config.database.connectionString])if(new URL(url).hostname!=='athyper-bp-enter-db')throw Error('ISOLATED_DATABASE_REQUIRED');
const loader=new VerifiedPublicationArtifactLoader({store:container.adapters.publicationArtifactStore,verifier:container.adapters.publicationVerifier,canonicalizer:{canonicalBytes,sha256},runtimeVersion:config.publication.runtimeVersion});const results=await container.adapters.athyperDatabase.database.transaction().execute(async tx=>{await sql\`SELECT set_config('app.current_tenant_id',\${tenant},true)\`.execute(tx);const principal=(await sql\`SELECT id FROM master.principal WHERE tenant_id=\${tenant}::uuid AND code='seed.three-plane-provisioner' AND status='active'\`.execute(tx)).rows[0];await sql\`SELECT set_config('app.current_principal_id',\${principal.id},true)\`.execute(tx);const authority=new KyselyPublicationAuthorityRepository(tx),out=[];for(const pin of pins){const rows=(await sql\`SELECT d.id FROM publication.deployment d JOIN publication.artifact a ON a.id=d.artifact_id WHERE a.publication_release_id=\${pin.releaseId}::uuid AND a.content_hash=\${pin.artifactHash} AND a.status='signed' AND d.target_plane='neon' AND d.target_environment='local' AND d.status<>'failed'\`.execute(tx)).rows;if(rows.length!==1)throw Error('EXACT_DELIVERY_REQUIRED');const delivery=await authority.getDeployment(rows[0].id);const verified=await loader.load(delivery);const active=await container.adapters.neonDatabase.database.transaction().execute(async local=>{await sql.raw('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY').execute(local);await sql\`SELECT set_config('app.current_tenant_id',\${tenant},true)\`.execute(local);return(await sql\`SELECT a.id,a.deployment_id,a.source_release_id,a.artifact_hash,a.status FROM runtime_meta.release_activation_head h JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id WHERE a.source_release_id=\${pin.releaseId}::uuid AND a.artifact_hash=\${pin.artifactHash} AND h.artifact_hash=a.artifact_hash AND a.status='active'\`.execute(local)).rows;});if(active.length!==1)throw Error('ACTIVE_PROJECTION_MISMATCH');const evidence={reconciliation:true,reason:'Previously operator-projected signed artifact observed active; not a replay of original delivery',observedLocalDeploymentId:active[0].deployment_id,localAppliedReleaseId:active[0].id,artifactHash:pin.artifactHash,signatureVerified:verified.verification.signatureVerified,observedAt:new Date().toISOString()};const statuses=['pending','dispatched','received','staged','verified','activated'];for(const status of statuses.slice(statuses.indexOf(delivery.deploymentStatus)+1))await authority.transitionDeployment({deploymentId:delivery.deploymentId,status,evidence});const ack=await authority.acknowledge({deploymentId:delivery.deploymentId,targetInstance:'bp-enter-isolated-20260911',activeReleaseHash:pin.artifactHash,localAppliedReleaseId:active[0].id,evidence});out.push({...pin,deploymentId:delivery.deploymentId,priorStatus:delivery.deploymentStatus,localAppliedReleaseId:active[0].id,acknowledgementId:ack.id,signatureVerified:true});}return out;});console.log(JSON.stringify({kind:'isolated-publication-reconciliation',createdAt:new Date().toISOString(),results,activationHeadsChanged:false,accessChanged:false}));process.exit(0);
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
  { input: script, encoding: "utf8", timeout: 60000, maxBuffer: 2000000 },
);
if (r.status) {
  console.error(
    r.stderr
      .split("\n")
      .filter((l) => !l.includes("postgresql:"))
      .slice(0, 15)
      .join("\n"),
  );
  process.exit(1);
}
const report = JSON.parse(
  r.stdout
    .split("\n")
    .find((l) => l.startsWith('{"kind":"isolated-publication-reconciliation"')),
);
fs.writeFileSync(
  "governance/policy/reports/business-partner-final-publication-reconciliation-20260912.dev.json",
  JSON.stringify(report, null, 2) + "\n",
  { flag: "wx" },
);
console.log(report);
