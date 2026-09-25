/** Read-only recovery preflight. Restored archives must be in an isolated container. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { assertCompiledEntityRuntimePublication } from "../../../server/packages/contracts/publication/src/index.js";

const source = "athyper-bp-recovery-20260924";
const target = "athyper-dev-db-1";
function query(container: string, database: string, sql: string): any[] {
  const text = execFileSync("docker", ["exec", container, "psql", "-X", "-U", "postgres", "-d", database, "-At", "-v", "ON_ERROR_STOP=1", "-c", `SELECT coalesce(json_agg(q),'[]'::json) FROM (${sql}) q`], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  return JSON.parse(text);
}
const [head] = query(source, "athyper_neon", "SELECT a.* FROM runtime_meta.release_activation_head h JOIN runtime_meta.applied_release a ON a.id=h.applied_release_id WHERE h.publication_key='metadata.compiled_entity.business_partner'");
if (!head) throw Error("BACKUP_ACTIVE_RELEASE_REQUIRED");
const [record] = query(source, "athyper_studio", `SELECT row_to_json(r) AS release,row_to_json(a) AS artifact,row_to_json(c) AS compilation FROM publication.release r JOIN publication.artifact a ON a.publication_release_id=r.id JOIN publication.artifact_compilation c ON c.publication_release_id=r.id AND c.artifact_kind=a.artifact_kind AND c.plane_code=a.plane_code WHERE r.id='${head.source_release_id}'::uuid AND a.plane_code='neon' AND a.artifact_kind='compiled_entity_runtime'`);
if (!record || record.release.status !== "published" || record.artifact.status !== "signed") throw Error("BACKUP_PUBLICATION_REQUIRED");
// Match this legacy local publisher's persisted canonicalization exactly.
const canonical = (value: any): string => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : `{${Object.keys(value).sort((a, b) => a.localeCompare(b)).map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
const sha = (value: any) => createHash("sha256").update(canonical(value)).digest("hex");
const document = record.compilation.unsigned_document;
const payload = document.projection.applied_release_payload.payload_json;
if (sha(document) !== head.artifact_hash || head.artifact_hash !== record.artifact.content_hash || sha(payload) !== document.manifest.payloadSha256) throw Error("BACKUP_HASH_MISMATCH");
assertCompiledEntityRuntimePublication(payload);
const catalog = new Set(query(target, "athyper_neon", "SELECT n.nspname||'.'||c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p','v','m','f')").map(row => row.name));
const sources = new Set<string>();
function visit(value: any) {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    if ((key === "sourceObject" || key === "source_object") && typeof child === "string") sources.add(child);
    visit(child);
  }
}
visit(payload);
const missing = [...sources].filter(name => !catalog.has(name));
const verifier = `
import {readFileSync} from 'node:fs';
import {createInfisicalSecretStore} from '@athyper/server-adapter-secretstore-infisical';
import {CachedPublicationKeyResolver,Ed25519PublicationVerifier} from '@athyper/server-adapter-publication-signing';
let data='';for await(const chunk of process.stdin)data+=chunk;
const input=JSON.parse(data),e=process.env;
if(input.keyId!==e.PUBLICATION_SIGNING_KEY_ID)throw Error('RECOVERY_SIGNING_KEY_MISMATCH');
const store=createInfisicalSecretStore({endpoint:e.INFISICAL_URL,token:readFileSync(e.INFISICAL_TOKEN_FILE,'utf8').trim(),workspaceId:e.INFISICAL_WORKSPACE_ID,environment:e.INFISICAL_ENVIRONMENT,secretPath:e.INFISICAL_SECRET_PATH});
try{const keys=new CachedPublicationKeyResolver(store,[{keyId:input.keyId,publicKeyReferences:[e.PUBLICATION_PUBLIC_KEY_REFERENCE]}]);
const valid=await new Ed25519PublicationVerifier(keys).verify({...input,bytes:Buffer.from(input.bytes,'base64')});
if(!valid)throw Error('RECOVERY_SIGNATURE_INVALID');console.log('verified');keys.clear();}finally{store.close?.();}`;
export async function remoteVerify(input: { keyId: string; algorithm: string; signature: string; bytes: Uint8Array }) {
  return execFileSync("docker", ["exec", "-i", "-w", "/app/server", "athyper-dev-source-worker-1", "node", "--input-type=module", "-e", verifier], { input: JSON.stringify({...input, bytes: Buffer.from(input.bytes).toString("base64")}), encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim() === "verified";
}
const verified = await remoteVerify({keyId: record.artifact.signing_key_id, algorithm: record.artifact.signature_algorithm, signature: record.artifact.signature, bytes: Buffer.from(canonical(document))});
if (!verified) throw Error("RECOVERY_SIGNATURE_INVALID");
console.log(JSON.stringify({ sourceContainer: source, targetContainer: target, publicationKey: head.publication_key, releaseId: head.source_release_id, releaseNo: head.source_release_no, artifactHash: head.artifact_hash, signatureAlgorithm: record.artifact.signature_algorithm, signingKeyId: record.artifact.signing_key_id, artifactCount: payload.artifacts.length, sourceObjects: sources.size, missingSourceObjects: missing, hashesVerified: true, contractValidated: true, signatureVerified: verified, mutated: false }, null, 2));
if (missing.length) process.exitCode = 1;
export { query, head, record, document, payload, missing, verified, canonical };
