#!/usr/bin/env tsx

/**
 * Publishes one already-reviewed split entity runtime set to a local DEV plane.
 *
 * This is intentionally entity-driven: `entityCode`, authoring root and source
 * definition release are arguments.  A domain definition validator may be used
 * before generic compilation, but this publisher never contains an entity UI,
 * reader, projection, or handler implementation.
 */
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Client } from "pg";
import type { PublicationSigner, PublicationVerifier } from "@athyper/server-contract-publication";
import {
  compileBusinessPartnerCompiledEntity,
  compileCompiledEntityArtifacts,
  compiledEntityRuntimeProjection,
} from "@athyper/server-service-publication";

const CONFIRMATION = "LOCAL-COMPILED-ENTITY-RUNTIME";
const SIGNATURE_ALGORITHM = "development-local-sha256";
const SIGNING_KEY_ID = "local-development-compiled-entity-publisher";
const UUID_NAMESPACE = Buffer.from("2cbfecc4e5be5da0b81b5011abdbef11", "hex");

type QueryClient = Pick<Client, "query">;
type Json = Record<string, unknown>;

export async function publishDevelopmentCompiledEntityRuntime(options: {
  readonly neonDatabaseUrl: string;
  readonly studioDatabaseUrl?: string;
  readonly entityCode: string;
  readonly authoringRoot: string;
  readonly sourceDefinitionReleaseId: string;
  /** A frozen scoped candidate compiled by compile-release-candidate.mts. */
  readonly candidateOutput?: string;
  readonly confirmation?: string;
  readonly dryRun?: boolean;
  /** Scoped DEVFULL machine authority, checked before any publication writes. */
  readonly authority?: {
    readonly tenantId: string;
    readonly entityCode: string;
    readonly keyId: string;
    readonly author: { readonly principalId: string; readonly code: string; readonly authEpoch: number };
    readonly publisher: { readonly principalId: string; readonly code: string; readonly authEpoch: number };
    readonly signer: PublicationSigner;
    readonly verifier: PublicationVerifier;
  };
  readonly expectedActiveArtifactHash?: string;
}) {
  if (!options.dryRun && (!options.authority || !options.expectedActiveArtifactHash))
    throw new Error("Scoped workload authority, signer and pinned active artifact are required");
  const neonUrl = new URL(options.neonDatabaseUrl);
  const studioUrl = new URL(options.studioDatabaseUrl ?? siblingDatabaseUrl(options.neonDatabaseUrl, "athyper_studio"));
  if (!localDatabase(neonUrl) || neonUrl.pathname !== "/athyper_neon") throw new Error("compiled entity publication requires local athyper_neon");
  if (!localDatabase(studioUrl) || studioUrl.pathname !== "/athyper_studio") throw new Error("compiled entity publication requires local athyper_studio");
  if (!/^[a-z][a-z0-9_.-]{0,126}$/.test(options.entityCode)) throw new Error("entityCode is invalid");
  if (!options.dryRun && options.confirmation !== CONFIRMATION) throw new Error(`apply requires --confirm=${CONFIRMATION}`);

  const studio = new Client({ connectionString: studioUrl.toString() });
  const neon = new Client({ connectionString: neonUrl.toString() });
  await Promise.all([studio.connect(), neon.connect()]);
  try {
    const source = await one<{ tenant_id: string; bundle_json: Json; release_no: number; release_key: string }>(studio, `
      SELECT revision.tenant_id::text, revision.bundle_json, release.release_no::int, release.release_key
      FROM publication.release release
      JOIN publication.business_partner_definition_release_link link ON link.publication_release_id=release.id
      JOIN snapshot.business_partner_definition_revision revision ON revision.id=link.definition_revision_id
      JOIN publication.artifact artifact ON artifact.publication_release_id=release.id
        AND artifact.plane_code='neon' AND artifact.artifact_kind='business_partner_definition_bundle'
      WHERE release.id=$1::uuid AND release.status='published' AND artifact.status='signed'`, [options.sourceDefinitionReleaseId]);

    const authority = options.authority;
    if (!options.dryRun) {
      if (!authority || authority.tenantId !== source.tenant_id || authority.entityCode !== options.entityCode || authority.author.principalId === authority.publisher.principalId)
        throw new Error("DEV publication authority scope mismatch");
      for (const role of ["author", "publisher"] as const) {
        const actor = authority[role];
        const checked = await studio.query(`SELECT id FROM master.principal WHERE id=$1::uuid AND tenant_id=$2::uuid
          AND code=$3 AND status='active' AND principal_type='service_account' AND provisioning_source='internal'
          AND auth_epoch=$4 AND metadata->'devPublication'=$5::jsonb`,
          [actor.principalId, authority.tenantId, actor.code, actor.authEpoch, JSON.stringify({role,instance:"dev"})]);
        if (checked.rowCount !== 1) throw new Error("DEV workload principal is absent, revoked or out of scope");
      }
    }
    const signatureAlgorithm = authority ? "Ed25519" : SIGNATURE_ALGORITHM;
    const signingKeyId = authority?.keyId ?? SIGNING_KEY_ID;
    const authoring = options.candidateOutput
      ? await readFrozenCandidate(options.candidateOutput, options.authoringRoot)
      : await readAuthoring(options.authoringRoot);
    const registry = registryFrom(authoring.registry);
    const releaseContent = publishedReleaseAuthoring(authoring.release, options.entityCode, options.sourceDefinitionReleaseId, signatureAlgorithm, signingKeyId);
    const compileInput = {
      artifacts: authoring.artifacts.map(({ ref, value }) => ({ ref, content: publishedArtifact(value) })),
      release: { content: releaseContent }, registry, canonicalizer,
    };
    // BP's broad authoring tree still uses its domain compiler. A frozen scoped
    // candidate already carries the pinned, validated artifact set and must go
    // through the generic compiler so it cannot silently expand back to that tree.
    const compilation = options.entityCode === "business_partner" && !options.candidateOutput
      ? compileBusinessPartnerCompiledEntity({ definition: { bundle: source.bundle_json, plane: "neon", canonicalizer }, compiledEntity: { artifacts: compileInput.artifacts, release: compileInput.release, registry } }).compiled
      : compileCompiledEntityArtifacts(compileInput);
    const publicationKey = `metadata.compiled_entity.${options.entityCode}`;
    const existing = await studio.query<{ id: string; release_no: number; unsigned_hash: string }>(`
      SELECT release.id::text, release.release_no::int, compilation.unsigned_hash
      FROM publication.release release
      JOIN publication.artifact_compilation compilation ON compilation.publication_release_id=release.id
      WHERE release.release_key=$1 AND release.status='published'
        AND compilation.plane_code='neon' AND compilation.artifact_kind='compiled_entity_runtime'
        AND compilation.unsigned_document #>> '{manifest,evidence,compiledReleaseHash}'=$2
        AND compilation.unsigned_document #>> '{projection,release,signature,value}' IS NOT NULL
      ORDER BY release.release_no DESC LIMIT 1`, [publicationKey, compilation.release.releaseHash]);
    if (existing.rows[0]) {
      const head = await one<{artifact_hash:string}>(neon, "SELECT artifact_hash FROM runtime_meta.release_activation_head WHERE publication_key=$1", [publicationKey]);
      if (head.artifact_hash !== existing.rows[0].unsigned_hash) throw new Error("Matching publication exists but is not active; inspect deployment before retry");
      return {mode:"already_applied",publicationKey,releaseId:existing.rows[0].id,releaseNo:existing.rows[0].release_no,compiledReleaseHash:compilation.release.releaseHash,artifactCount:compilation.report.artifactCount};
    }
    const generatedAt = new Date().toISOString();
    const payload = compiledEntityRuntimeProjection(compilation, generatedAt, options.entityCode);
    const prior = await studio.query<{ release_no: number }>("SELECT release_no::int FROM publication.release WHERE release_key=$1 ORDER BY release_no DESC LIMIT 1", [publicationKey]);
    const releaseNo = (prior.rows[0]?.release_no ?? 0) + 1;
    const coordinate = `${publicationKey}:r${releaseNo}:${payload.release.releaseHash}`;
    const releaseId = deterministicUuid(`${coordinate}:release`), artifactId = deterministicUuid(`${coordinate}:artifact:neon`);
    const compilationId = deterministicUuid(`${coordinate}:compilation:neon`), commandId = deterministicUuid(`${coordinate}:deployment`), correlationId = deterministicUuid(`${coordinate}:correlation`);
    const manifest = {
      schema: "athyper.compiled-entity-runtime-publication/2.0", publicationKey, releaseId, releaseNo,
      targetPlane: "neon", artifactKind: "compiled_entity_runtime", payloadSha256: sha256(payload),
      evidence: { sourceDefinitionReleaseId: options.sourceDefinitionReleaseId, sourceDefinitionReleaseKey: source.release_key, sourceDefinitionReleaseNo: source.release_no, compiledReleaseId: payload.release.releaseId, compiledReleaseHash: payload.release.releaseHash, compilerVersion: compilation.report.compilerVersion },
    };
    const projection = { applied_release_payload: {
      id: releaseId, tenant_id: null, artifact_kind: "compiled_entity_runtime", payload_schema_version: "2.0", payload_hash: manifest.payloadSha256, payload_json: payload,
      coordinates: { release_id: releaseId, release_no: releaseNo, publication_key: publicationKey, plane_code: "neon", entityCode: options.entityCode, compiled_release_id: payload.release.releaseId, compiled_release_hash: payload.release.releaseHash }, generated_at: generatedAt,
    }};
    const artifactHash = sha256({ manifest, projection });
    let signature = "";
    if (!options.dryRun && authority) {
      const bytes = canonicalizer.canonicalBytes({ manifest, projection });
      signature = (await authority.signer.sign({keyId:signingKeyId,algorithm:signatureAlgorithm,bytes})).signature;
      if (!await authority.verifier.verify({keyId:signingKeyId,algorithm:signatureAlgorithm,bytes,signature}))
        throw new Error("Publication signature verification failed");
    }
    if (options.dryRun) return { mode: "planned", publicationKey, releaseId, releaseNo, artifactHash, compiledReleaseHash: payload.release.releaseHash, artifactCount: compilation.report.artifactCount };

    const authorId = authority!.author.principalId, publisherId = authority!.publisher.principalId;
    const active = await one<{artifact_hash:string}>(neon, "SELECT artifact_hash FROM runtime_meta.release_activation_head WHERE publication_key=$1", [publicationKey]);
    if (active.artifact_hash !== options.expectedActiveArtifactHash) throw new Error("Active release changed; prepare a new candidate");
    let deploymentId = "", appliedReleaseId = "";
    await studio.query("BEGIN");
    try {
      await studio.query("SELECT set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true),pg_advisory_xact_lock(hashtextextended($3,0))", [source.tenant_id, publisherId, publicationKey]);
      await studio.query(`INSERT INTO publication.release(id,tenant_id,release_key,release_no,release_kind,status,compatibility_level,release_hash,manifest_hash,minimum_runtime_version,created_by,metadata)
        VALUES($1::uuid,$2::uuid,$3,$4,'publish','preparing','backward_compatible',$5,$6,'2.0.0',$7::uuid,$8::jsonb) ON CONFLICT(id) DO NOTHING`, [releaseId, source.tenant_id, publicationKey, releaseNo, stripPrefix(payload.release.releaseHash), sha256(manifest), publisherId, JSON.stringify({ source: "local-development", entityCode: options.entityCode, sourceDefinitionReleaseId: options.sourceDefinitionReleaseId })]);
      await studio.query(`INSERT INTO publication.artifact_compilation(id,publication_release_id,plane_code,artifact_kind,unsigned_document,unsigned_hash,compiler_name,compiler_version,created_by)
        VALUES($1::uuid,$2::uuid,'neon','compiled_entity_runtime',$3::jsonb,$4,'athyper.compiled-entity-artifact-compiler',$5,$6::uuid) ON CONFLICT(id) DO NOTHING`, [compilationId, releaseId, JSON.stringify({ manifest, projection }), artifactHash, compilation.report.compilerVersion, publisherId]);
      await studio.query(`INSERT INTO publication.artifact(id,publication_release_id,plane_code,artifact_kind,artifact_uri,content_hash,status,created_by)
        VALUES($1::uuid,$2::uuid,'neon','compiled_entity_runtime',$3,$4,'compiled',$5::uuid) ON CONFLICT(id) DO NOTHING`, [artifactId, releaseId, `local://runtime/${options.entityCode}/neon/compiled-entity-runtime.json`, artifactHash, publisherId]);
      let artifact = await one<{ status: string }>(studio, "SELECT status FROM publication.artifact WHERE id=$1::uuid", [artifactId]);
      if (artifact.status === "compiled") artifact = await one(studio, "SELECT status FROM publication.fn_transition_artifact($1::uuid,'validated')", [artifactId]);
      if (artifact.status === "validated") await studio.query("SELECT publication.fn_transition_artifact($1::uuid,'signed',$2,$3,$4)", [artifactId, signatureAlgorithm, signingKeyId, signature]);
      let release = await one<{ status: string }>(studio, "SELECT status FROM publication.release WHERE id=$1::uuid", [releaseId]);
      if (release.status === "preparing") release = await one(studio, "SELECT status FROM publication.fn_transition_release($1::uuid,'approved',$2::uuid,$3::uuid,$4::jsonb)", [releaseId, publisherId, correlationId, JSON.stringify({ authenticated: true, authorId, noSelfPublish: true })]);
      if (release.status === "approved") await studio.query("SELECT publication.fn_transition_release($1::uuid,'published',$2::uuid,$3::uuid,$4::jsonb)", [releaseId, publisherId, correlationId, JSON.stringify({ authenticated: true, environment: "development" })]);
      const deployment = await one<{ id: string; status: string }>(studio, "SELECT id::text,status FROM publication.fn_create_deployment($1::uuid,$2::uuid,'neon','development','athyper_neon',1,$3::uuid,$4::uuid)", [commandId, artifactId, correlationId, publisherId]);
      deploymentId = deployment.id;
      if (deployment.status === "pending") await studio.query("SELECT publication.fn_transition_deployment($1::uuid,'dispatched',$2::jsonb)", [deploymentId, JSON.stringify({ authenticated: true, environment: "development" })]);
      await studio.query("COMMIT");
    } catch (error) { await studio.query("ROLLBACK").catch(() => undefined); throw error; }
    await neon.query("BEGIN");
    try {
      await neon.query("SELECT set_config('app.database_plane','neon',true),set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true),pg_advisory_xact_lock(hashtextextended($3,0))", [source.tenant_id, publisherId, publicationKey]);
      const currentHead = await one<{artifact_hash:string}>(neon, "SELECT artifact_hash FROM runtime_meta.release_activation_head WHERE publication_key=$1 FOR UPDATE", [publicationKey]);
      if (currentHead.artifact_hash !== options.expectedActiveArtifactHash) throw new Error("Active release changed before activation");
      const staged = await one<{ id: string; status: string }>(neon, "SELECT id::text,status FROM runtime_meta.fn_stage_release_projection($1,$2::uuid,$3,$4::uuid,$5,$6::jsonb,$7::jsonb)", [publicationKey, releaseId, releaseNo, deploymentId, artifactHash, JSON.stringify(manifest), JSON.stringify(projection)]);
      appliedReleaseId = staged.id;
      if (staged.status !== "active") {
        const verified = await one<{ status: string; failure_code: string | null }>(neon, "SELECT status,failure_code FROM runtime_meta.fn_verify_release($1::uuid,$2,$3::jsonb)", [staged.id, artifactHash, JSON.stringify({ signature_verified: true, manifest_valid: true, runtime_compatible: true, target_plane: "neon", payload_hash: manifest.payloadSha256, payload_schema_version: "2.0", signature_algorithm: signatureAlgorithm, signing_key_id: signingKeyId })]);
        if (verified.status !== "verified") throw new Error(`compiled runtime verification failed: ${verified.failure_code ?? verified.status}`);
        await neon.query("SELECT runtime_meta.fn_activate_release($1::uuid,$2::jsonb)", [staged.id, JSON.stringify({ source: "local-development", entityCode: options.entityCode, sourceDefinitionReleaseId: options.sourceDefinitionReleaseId })]);
      }
      await neon.query("COMMIT");
    } catch (error) { await neon.query("ROLLBACK").catch(() => undefined); throw error; }
    await transitionDeployment(studio, deploymentId, artifactHash, appliedReleaseId, options.entityCode);
    return { mode: "applied", publicationKey, releaseId, releaseNo, appliedReleaseId, artifactHash, compiledReleaseHash: payload.release.releaseHash, artifactCount: compilation.report.artifactCount };
  } finally { await Promise.all([studio.end(), neon.end()]); }
}

async function readAuthoring(rootPath: string) {
  const root = resolve(rootPath), paths = await jsonPaths(root);
  const documents = await Promise.all(paths.map(async (ref) => ({ ref, value: JSON.parse(await readFile(resolve(root, ref), "utf8")) as Json })));
  const release = documents.find((doc) => doc.value.artifactType === "release_envelope")?.value;
  const registry = JSON.parse(await readFile(resolve(root, "../review/registry-catalog.json"), "utf8")) as Json;
  if (!release || !registry) throw new Error("authoring root lacks release or registry catalog");
  return { release, registry, artifacts: documents.filter(({ value }) => ["core", "operation", "presentation_surface", "presentation_section", "flow"].includes(String(value.artifactType))) };
}
async function readFrozenCandidate(candidateOutput: string, authoringRoot: string) {
  const root = resolve(candidateOutput);
  const artifactsRoot = resolve(root, "entities");
  const paths = await jsonPaths(artifactsRoot);
  const documents = await Promise.all(paths.map(async (ref) => ({ ref, value: JSON.parse(await readFile(resolve(artifactsRoot, ref), "utf8")) as Json })));
  const release = documents.find((doc) => doc.ref === "release.json")?.value;
  if (!release) throw new Error("frozen candidate lacks release.json");
  const artifacts = documents.filter(({ value }) => ["core", "operation", "presentation_surface", "presentation_section", "flow"].includes(String(value.artifactType)));
  if (!artifacts.length || !Array.isArray(release.artifacts) || artifacts.length !== release.artifacts.length)
    throw new Error("frozen candidate artifact set is incomplete");
  const registry = JSON.parse(await readFile(resolve(authoringRoot, "../review/registry-catalog.json"), "utf8")) as Json;
  return { release, registry, artifacts };
}
async function jsonPaths(root: string, prefix = ""): Promise<string[]> { const entries = await readdir(resolve(root, prefix), { withFileTypes: true }); return (await Promise.all(entries.map((entry) => entry.isDirectory() ? jsonPaths(root, `${prefix}${entry.name}/`) : entry.isFile() && entry.name.endsWith(".json") ? [`${prefix}${entry.name}`] : []))).flat(); }
function publishedArtifact(value: Json): Json { const { artifactHash: _hash, ...content } = value; return { ...content, contractStatus: "published" }; }
function publishedReleaseAuthoring(value: Json, entityCode: string, sourceDefinitionReleaseId: string, algorithm: string, keyId: string): Json { const { artifacts: _artifacts, releaseHash: _hash, signature: _signature, ...content } = value; return { ...content, contractStatus: "published", releaseId: `compiled-${entityCode}-${sourceDefinitionReleaseId}`, signature: { algorithm, keyId, value: "publication-envelope-signed-externally" } }; }
function registryFrom(value: Json) { const entries = Array.isArray(value.entries) ? value.entries as Json[] : []; const keys = (kind: string) => new Set(entries.filter((entry) => entry.kind === kind).map((entry) => String(entry.key))); return { permissions: keys("permission"), handlers: keys("handler"), renderers: keys("renderer"), resolvers: keys("resolver"), evaluators: keys("evaluator") }; }
const canonicalizer = { canonicalBytes: (value: unknown) => new TextEncoder().encode(canonical(value)), sha256: (value: Uint8Array) => `sha256:${createHash("sha256").update(value).digest("hex")}` };
function canonical(value: unknown): string { if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; if (value && typeof value === "object") return `{${Object.entries(value as Json).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`; return JSON.stringify(value); }
function sha256(value: unknown) { return createHash("sha256").update(canonical(value)).digest("hex"); }
function stripPrefix(hash: string) { return hash.replace(/^sha256:/, ""); }
function deterministicUuid(name: string) { const bytes = createHash("sha1").update(UUID_NAMESPACE).update(name).digest().subarray(0, 16); bytes[6] = (bytes[6]! & 15) | 80; bytes[8] = (bytes[8]! & 63) | 128; const hex = bytes.toString("hex"); return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`; }
function localDatabase(url: URL) {
  if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) return true;
  const octets = url.hostname.split(".").map(Number);
  return octets.length === 4 && octets.every((value) => Number.isInteger(value) && value >= 0 && value <= 255) &&
    (octets[0] === 10 || (octets[0] === 172 && octets[1]! >= 16 && octets[1]! <= 31) || (octets[0] === 192 && octets[1] === 168));
}
function siblingDatabaseUrl(databaseUrl: string, name: string) { const url = new URL(databaseUrl); url.pathname = `/${name}`; return url.toString(); }
async function one<T extends object>(client: QueryClient, statement: string, values: unknown[] = []): Promise<T> { const result = await client.query<T>(statement, values); if (result.rows.length !== 1) throw new Error(`expected one row, received ${result.rows.length}`); return result.rows[0]!; }
async function transitionDeployment(studio: QueryClient, deploymentId: string, artifactHash: string, appliedReleaseId: string, entityCode: string) { const deployment = await one<{ status: string }>(studio, "SELECT status FROM publication.deployment WHERE id=$1::uuid", [deploymentId]); const order = ["pending", "dispatched", "received", "staged", "verified", "activated"] as const; for (let next = order.indexOf(deployment.status as typeof order[number]) + 1; next < order.length; next++) await studio.query("SELECT publication.fn_transition_deployment($1::uuid,$2::publication.deployment_status_d,$3::jsonb)", [deploymentId, order[next], JSON.stringify({ authenticated: true, entityCode, localAppliedReleaseId: appliedReleaseId })]); await studio.query("SELECT publication.fn_acknowledge_activation($1::uuid,'athyper_neon',$2,$3::uuid,$4::jsonb)", [deploymentId, artifactHash, appliedReleaseId, JSON.stringify({ authenticated: true, entityCode })]); }
function option(args: string[], name: string) { const equal = args.find((item) => item.startsWith(`${name}=`)); if (equal) return equal.slice(name.length + 1); const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; }
async function main() { const args = process.argv.slice(2), neonDatabaseUrl = option(args, "--database-url") ?? process.env.ATHYPER_NEON_DATABASE_ADMIN_URL; if (!neonDatabaseUrl) throw new Error("set ATHYPER_NEON_DATABASE_ADMIN_URL or --database-url"); const result = await publishDevelopmentCompiledEntityRuntime({ neonDatabaseUrl, studioDatabaseUrl: option(args, "--studio-database-url") ?? process.env.ATHYPER_STUDIO_DATABASE_ADMIN_URL, entityCode: option(args, "--entity-code") ?? "business_partner", authoringRoot: option(args, "--authoring-root") ?? resolve(dirname(new URL(import.meta.url).pathname), "../../../../../../metadata/products/mdg/entities"), sourceDefinitionReleaseId: option(args, "--source-definition-release-id") ?? "", ...(option(args, "--candidate-output") ? { candidateOutput: option(args, "--candidate-output")! } : {}), confirmation: option(args, "--confirm"), dryRun: args.includes("--plan") || args.includes("--dry-run") }); process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); }
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
