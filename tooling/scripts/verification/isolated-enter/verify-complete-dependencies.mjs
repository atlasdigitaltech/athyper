import { execFileSync } from "node:child_process";
import fs from "node:fs";
const script = `
import {loadConfig} from './src/config/index.ts';
import {createContainer} from './src/composition/create-container.ts';
import {registerAdapters} from './src/composition/register-adapters.ts';
import {createLifecycle} from '@athyper/server-foundation/lifecycle';
import {VerifiedPublicationArtifactLoader} from '@athyper/server-service-publication';
import {canonicalBytes,sha256} from '@athyper/server-adapter-publication-signing';
import {sql} from 'kysely';
const config=loadConfig(),lifecycle=createLifecycle(),container=createContainer();registerAdapters(container,config,lifecycle);
const rows=await container.adapters.athyperDatabase.database.transaction().execute(async tx=>{await sql.raw('SET TRANSACTION READ ONLY').execute(tx);await sql.raw("SET LOCAL app.current_tenant_id='44444444-4444-4444-8444-444444444444'").execute(tx);return(await sql.raw("SELECT a.*,r.release_key,r.release_no FROM publication.artifact a JOIN publication.release r ON r.id=a.publication_release_id WHERE r.id IN ('ff8168be-3136-41d5-9d07-df65c91d5c83','9827ce80-766d-4262-9b4f-835307ac33d2','145f6381-50c7-4450-8e16-7d66bf30b237') AND a.status='signed'").execute(tx)).rows;});
if(rows.length!==3)throw Error('EXACTLY_THREE_DEPENDENCIES_REQUIRED');
const loader=new VerifiedPublicationArtifactLoader({store:container.adapters.publicationArtifactStore,verifier:container.adapters.publicationVerifier,canonicalizer:{canonicalBytes,sha256},runtimeVersion:config.publication.runtimeVersion});
const results=[];
for(const a of rows){
 const coordinate={artifactUri:a.artifact_uri,artifactHash:a.content_hash,targetPlane:a.plane_code,publicationKey:a.release_key,sourceReleaseId:a.publication_release_id,sourceReleaseNo:Number(a.release_no),signatureAlgorithm:a.signature_algorithm,signingKeyId:a.signing_key_id,signature:a.signature};
 const loaded=await loader.load(coordinate);
 const negative={};for(const [name,change] of Object.entries({hash:{artifactHash:'0'.repeat(64)},signature:{signature:'invalid'},release:{sourceReleaseId:'00000000-0000-0000-0000-000000000000'}})){try{await loader.load({...coordinate,...change});negative[name]=false;}catch{negative[name]=true;}if(!negative[name])throw Error('ALTERED_'+name+'_ACCEPTED');}
 const entity=loaded.document.envelope.payload.entityDescriptor;const d=entity?.descriptorKind==='entity_runtime'?entity.descriptor:undefined;
 if(d&&(d.entityCode!=='business_partner_request'||d.authorization.operations.length!==2||d.fields.length!==7))throw Error('CHILD_DESCRIPTOR_MISMATCH');
 results.push({releaseId:a.publication_release_id,artifactId:a.id,artifactHash:a.content_hash,verification:loaded.verification,negative,entityCode:d?.entityCode,fields:d?.fields.length,operations:d?Object.keys(d.operations):undefined});
}
console.log(JSON.stringify({kind:'dependency-artifact-verification',capturedAt:new Date().toISOString(),runtimeVersion:config.publication.runtimeVersion,readOnly:true,results}));process.exit(0);
`;
const output = execFileSync(
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
  {
    input: script,
    encoding: "utf8",
    timeout: 60000,
    stdio: ["pipe", "pipe", "pipe"],
  },
);
const report = JSON.parse(
  output
    .split("\n")
    .find((x) => x.startsWith('{"kind":"dependency-artifact-verification"')),
);
const path =
  "governance/policy/reports/business-partner-dependency-artifact-verification-" +
  Date.now() +
  ".dev.json";
fs.writeFileSync(path, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log({ report: path, ...report });
