#!/usr/bin/env tsx

import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { Client } from "pg";
import { createBusinessPartnerFoundationDefinition } from "../../../packages/services/publication/src/business-partner-foundation-definition.js";
import { compileBusinessPartnerDefinition } from "../../../packages/services/publication/src/business-partner-definition-compiler.js";

const CONFIRMATION = "LOCAL-BUSINESS-PARTNER-DEFINITION-3.1.1";
const PUBLICATION_KEY =
  "studio.business_partner.definition.business_partner.onboarding";
const SOURCE_VERSION = "development-definition-v3.1.1";
const PUBLISHED_AT = "2026-09-06T00:00:00.000Z";
const UUID_NAMESPACE = Buffer.from("e9ab0e30f87b5ea3bf2f64259bcaee76", "hex");
const SIGNATURE_ALGORITHM = "development-local-sha256";
const SIGNING_KEY_ID = "local-development-studio-publisher";

type QueryClient = Pick<Client, "query">;

export async function publishDevelopmentBusinessPartnerDefinition(options: {
  readonly neonDatabaseUrl: string;
  readonly studioDatabaseUrl?: string;
  readonly confirmation?: string;
  readonly dryRun?: boolean;
}) {
  const neonUrl = new URL(options.neonDatabaseUrl);
  const studioUrl = new URL(
    options.studioDatabaseUrl ??
      siblingDatabaseUrl(options.neonDatabaseUrl, "athyper_studio"),
  );
  if (!localDatabase(neonUrl) || neonUrl.pathname !== "/athyper_neon")
    throw new Error("definition publication requires local athyper_neon");
  if (!localDatabase(studioUrl) || studioUrl.pathname !== "/athyper_studio")
    throw new Error("definition publication requires local athyper_studio");
  if (!options.dryRun && options.confirmation !== CONFIRMATION)
    throw new Error(`apply requires --confirm=${CONFIRMATION}`);

  const studio = new Client({ connectionString: studioUrl.toString() });
  const neon = new Client({ connectionString: neonUrl.toString() });
  await studio.connect();
  await neon.connect();
  try {
    const prior = await one<{
      tenant_id: string;
      bundle_json: Record<string, unknown>;
      release_no: number;
      semantic_version: string;
    }>(
      studio,
      `
      SELECT revision.tenant_id::text,revision.bundle_json,revision.semantic_version,release.release_no::int
      FROM snapshot.business_partner_definition_revision revision
      JOIN publication.business_partner_definition_release_link link ON link.definition_revision_id=revision.id
      JOIN publication.release release ON release.id=link.publication_release_id
      WHERE release.release_key=$1 AND release.status='published'
      ORDER BY release.release_no DESC LIMIT 1`,
      [PUBLICATION_KEY],
    );
    if (prior.semantic_version === "3.1.1") {
      const active = await one<{
        semantic_version: string;
        release_no: number;
      }>(
        neon,
        "SELECT semantic_version,release_no::int FROM runtime_meta.fn_active_business_partner_definition($1)",
        [PUBLICATION_KEY],
      );
      if (active.semantic_version === "3.1.1")
        return {
          mode: "already_applied",
          publicationKey: PUBLICATION_KEY,
          releaseNo: active.release_no,
          semanticVersion: active.semantic_version,
        };
    }
    const hashes = prior.bundle_json["sourceContractHashes"];
    if (!record(hashes))
      throw new Error("published definition is missing sourceContractHashes");
    const bundle = createBusinessPartnerFoundationDefinition(
      hashes as Record<string, string>,
    );
    const canonicalizer = {
      canonicalBytes: (value: unknown) =>
        new TextEncoder().encode(canonical(value)),
      sha256: (bytes: Uint8Array) =>
        createHash("sha256").update(bytes).digest("hex"),
    };
    const compiled = compileBusinessPartnerDefinition({
      bundle,
      plane: "neon",
      canonicalizer,
      ...(prior.semantic_version===bundle.semanticVersion?{}:{priorSemanticVersion: prior.semantic_version}),
    });
    const releaseNo = prior.semantic_version===bundle.semanticVersion?prior.release_no:prior.release_no + 1;
    const revisionId = deterministicUuid(
      `${PUBLICATION_KEY}:${SOURCE_VERSION}:revision`,
    );
    const releaseId = deterministicUuid(
      `${PUBLICATION_KEY}:${SOURCE_VERSION}:release`,
    );
    const artifactId = deterministicUuid(
      `${PUBLICATION_KEY}:${SOURCE_VERSION}:artifact:neon`,
    );
    const compilationId = deterministicUuid(
      `${PUBLICATION_KEY}:${SOURCE_VERSION}:compilation:neon`,
    );
    const deploymentCommandId = deterministicUuid(
      `${PUBLICATION_KEY}:${SOURCE_VERSION}:deployment-command:neon`,
    );
    const correlationId = deterministicUuid(
      `${PUBLICATION_KEY}:${SOURCE_VERSION}:correlation`,
    );
    const projectionId = deterministicUuid(
      `${PUBLICATION_KEY}:${SOURCE_VERSION}:projection:neon`,
    );
    const bundleHash = compiled.sourceBundleHash;
    const payload = {
      id: projectionId,
      tenant_id: prior.tenant_id,
      artifact_kind: "business_partner_definition_bundle",
      payload_schema_version: "1.0.0",
      payload_hash: compiled.compiledBundleHash,
      payload_json: compiled.bundle,
      coordinates: {
        revision_id: revisionId,
        release_id: releaseId,
        release_no: releaseNo,
        publication_key: PUBLICATION_KEY,
        plane_code: "neon",
        bundle_code: bundle.bundleCode,
        semantic_version: bundle.semanticVersion,
        source_bundle_hash: bundleHash,
        compile_report: compiled.report,
      },
      generated_at: PUBLISHED_AT,
    };
    const manifest = {
      schema: "athyper.development-business-partner-definition/1.0",
      sourceVersion: SOURCE_VERSION,
      publicationKey: PUBLICATION_KEY,
      releaseId,
      releaseNo,
      targetPlane: "neon",
      artifactKind: "business_partner_definition_bundle",
      sourceBundleHash: bundleHash,
      compiledBundleHash: compiled.compiledBundleHash,
    };
    const projection = { applied_release_payload: payload };
    const artifactHash = sha256({ manifest, projection });
    const signature = sha256({
      artifactHash,
      releaseId,
      signingKeyId: SIGNING_KEY_ID,
    });
    if (options.dryRun)
      return {
        mode: "planned",
        publicationKey: PUBLICATION_KEY,
        releaseId,
        releaseNo,
        semanticVersion: bundle.semanticVersion,
        artifactHash,
        compiledBundleHash: compiled.compiledBundleHash,
      };

    const actors = await studio.query<{ id: string }>(
      "SELECT id::text FROM master.principal WHERE tenant_id=$1::uuid AND status='active' ORDER BY created_at,id LIMIT 3",
      [prior.tenant_id],
    );
    if (actors.rows.length < 2)
      throw new Error(
        "definition publication requires separate active author and publisher principals",
      );
    const authorId =
      actors.rows.find(
        (actor) => actor.id !== "81cd1978-2df5-5c9a-938a-2f8c291aea13",
      )?.id ?? actors.rows[0]!.id;
    const publisherId = actors.rows.find((actor) => actor.id !== authorId)?.id;
    if (!publisherId)
      throw new Error(
        "definition publication could not select a publisher distinct from the author",
      );

    let studioDeploymentId = "";
    await studio.query("BEGIN");
    try {
      await studio.query(
        "SELECT set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true),pg_advisory_xact_lock(hashtextextended($3,0))",
        [prior.tenant_id, publisherId, PUBLICATION_KEY],
      );
      await studio.query(
        `INSERT INTO snapshot.business_partner_definition_revision(id,tenant_id,bundle_code,semantic_version,bundle_schema_version,bundle_json,bundle_hash,target_planes,idempotency_key,created_by)
        VALUES($1::uuid,$2::uuid,$3,$4,'1.0.0',$5::jsonb,$6,ARRAY['neon']::text[],$7,$8::uuid) ON CONFLICT(tenant_id,idempotency_key) DO NOTHING`,
        [
          revisionId,
          prior.tenant_id,
          bundle.bundleCode,
          bundle.semanticVersion,
          JSON.stringify(bundle),
          bundleHash,
          SOURCE_VERSION,
          authorId,
        ],
      );
      await studio.query(
        `INSERT INTO publication.release(id,tenant_id,release_key,release_no,release_kind,status,compatibility_level,release_hash,manifest_hash,minimum_runtime_version,created_by,metadata)
        VALUES($1::uuid,$2::uuid,$3,$4,'publish','preparing','backward_compatible',$5,$6,'1.0.0',$7::uuid,$8::jsonb) ON CONFLICT(id) DO NOTHING`,
        [
          releaseId,
          prior.tenant_id,
          PUBLICATION_KEY,
          releaseNo,
          bundleHash,
          sha256(manifest),
          publisherId,
          JSON.stringify({
            source: "local-development-studio-publication",
            semanticVersion: bundle.semanticVersion,
            authenticated: true,
          }),
        ],
      );
      await studio.query(
        `INSERT INTO publication.business_partner_definition_release_link(publication_release_id,definition_revision_id,publish_idempotency_key,created_by)
        VALUES($1::uuid,$2::uuid,$3,$4::uuid) ON CONFLICT(publication_release_id) DO NOTHING`,
        [releaseId, revisionId, `${SOURCE_VERSION}:publish`, publisherId],
      );
      await studio.query(
        `INSERT INTO publication.artifact_compilation(id,publication_release_id,plane_code,artifact_kind,unsigned_document,unsigned_hash,compiler_name,compiler_version,created_by)
        VALUES($1::uuid,$2::uuid,'neon','business_partner_definition_bundle',$3::jsonb,$4,'athyper.development-business-partner-definition','1.0.0',$5::uuid) ON CONFLICT(id) DO NOTHING`,
        [
          compilationId,
          releaseId,
          JSON.stringify({ manifest, projection }),
          artifactHash,
          publisherId,
        ],
      );
      await studio.query(
        `INSERT INTO publication.artifact(id,publication_release_id,plane_code,artifact_kind,artifact_uri,content_hash,status,created_by)
        VALUES($1::uuid,$2::uuid,'neon','business_partner_definition_bundle',$3,$4,'compiled',$5::uuid) ON CONFLICT(id) DO NOTHING`,
        [
          artifactId,
          releaseId,
          `local://studio/${PUBLICATION_KEY}/neon/business_partner_definition_bundle.json`,
          artifactHash,
          publisherId,
        ],
      );
      let artifactStatus = await one<{ status: string }>(
        studio,
        "SELECT status FROM publication.artifact WHERE id=$1::uuid",
        [artifactId],
      );
      if (artifactStatus.status === "compiled")
        artifactStatus = await one(
          studio,
          "SELECT status FROM publication.fn_transition_artifact($1::uuid,'validated')",
          [artifactId],
        );
      if (artifactStatus.status === "validated")
        await studio.query(
          "SELECT publication.fn_transition_artifact($1::uuid,'signed',$2,$3,$4)",
          [artifactId, SIGNATURE_ALGORITHM, SIGNING_KEY_ID, signature],
        );
      let releaseStatus = await one<{ status: string }>(
        studio,
        "SELECT status FROM publication.release WHERE id=$1::uuid",
        [releaseId],
      );
      if (releaseStatus.status === "preparing")
        releaseStatus = await one(
          studio,
          "SELECT status FROM publication.fn_transition_release($1::uuid,'approved',$2::uuid,$3::uuid,$4::jsonb)",
          [
            releaseId,
            publisherId,
            correlationId,
            JSON.stringify({
              authenticated: true,
              authorId,
              noSelfPublish: true,
            }),
          ],
        );
      if (releaseStatus.status === "approved")
        await studio.query(
          "SELECT publication.fn_transition_release($1::uuid,'published',$2::uuid,$3::uuid,$4::jsonb)",
          [
            releaseId,
            publisherId,
            correlationId,
            JSON.stringify({ authenticated: true, environment: "development" }),
          ],
        );
      const deployment = await one<{ id: string; status: string }>(
        studio,
        "SELECT id::text,status FROM publication.fn_create_deployment($1::uuid,$2::uuid,'neon','development','athyper_neon',1,$3::uuid,$4::uuid)",
        [deploymentCommandId, artifactId, correlationId, publisherId],
      );
      studioDeploymentId = deployment.id;
      if (deployment.status === "pending")
        await studio.query(
          "SELECT publication.fn_transition_deployment($1::uuid,'dispatched',$2::jsonb)",
          [
            deployment.id,
            JSON.stringify({ authenticated: true, environment: "development" }),
          ],
        );
      await studio.query("COMMIT");
    } catch (error) {
      await studio.query("ROLLBACK").catch(() => undefined);
      throw error;
    }

    await neon.query("BEGIN");
    let appliedReleaseId: string;
    try {
      await neon.query(
        "SELECT set_config('app.database_plane','neon',true),set_config('app.current_tenant_id',$1,true),set_config('app.current_principal_id',$2,true),pg_advisory_xact_lock(hashtextextended($3,0))",
        [prior.tenant_id, publisherId, PUBLICATION_KEY],
      );
      const staged = await one<{ id: string; status: string }>(
        neon,
        "SELECT id::text,status FROM runtime_meta.fn_stage_release_projection($1,$2::uuid,$3,$4::uuid,$5,$6::jsonb,$7::jsonb)",
        [
          PUBLICATION_KEY,
          releaseId,
          releaseNo,
          studioDeploymentId,
          artifactHash,
          JSON.stringify(manifest),
          JSON.stringify(projection),
        ],
      );
      appliedReleaseId = staged.id;
      if (staged.status !== "active") {
        const verified = await one<{
          status: string;
          failure_code: string | null;
        }>(
          neon,
          "SELECT status,failure_code FROM runtime_meta.fn_verify_release($1::uuid,$2,$3::jsonb)",
          [
            staged.id,
            artifactHash,
            JSON.stringify({
              signature_verified: true,
              manifest_valid: true,
              runtime_compatible: true,
              target_plane: "neon",
              definition_bundle_hash: compiled.compiledBundleHash,
              definition_bundle_schema_version: "1.0.0",
              signature_algorithm: SIGNATURE_ALGORITHM,
              signing_key_id: SIGNING_KEY_ID,
            }),
          ],
        );
        if (verified.status !== "verified")
          throw new Error(
            `definition verification failed: ${verified.failure_code ?? verified.status}`,
          );
        await neon.query(
          "SELECT runtime_meta.fn_activate_release($1::uuid,$2::jsonb)",
          [
            staged.id,
            JSON.stringify({
              source: "local-development-studio-publication",
              semanticVersion: bundle.semanticVersion,
              authenticated: true,
            }),
          ],
        );
      }
      await neon.query("COMMIT");
    } catch (error) {
      await neon.query("ROLLBACK").catch(() => undefined);
      throw error;
    }

    const deployment = await one<{ id: string; status: string }>(
      studio,
      "SELECT id::text,status FROM publication.deployment WHERE command_id=$1::uuid",
      [deploymentCommandId],
    );
    const order = [
      "pending",
      "dispatched",
      "received",
      "staged",
      "verified",
      "activated",
    ] as const;
    for (
      let next = order.indexOf(deployment.status as (typeof order)[number]) + 1;
      next < order.length;
      next += 1
    )
      await studio.query(
        "SELECT publication.fn_transition_deployment($1::uuid,$2::publication.deployment_status_d,$3::jsonb)",
        [
          deployment.id,
          order[next],
          JSON.stringify({
            authenticated: true,
            environment: "development",
            localAppliedReleaseId: appliedReleaseId,
          }),
        ],
      );
    await studio.query(
      "SELECT publication.fn_acknowledge_activation($1::uuid,'athyper_neon',$2,$3::uuid,$4::jsonb)",
      [
        deployment.id,
        artifactHash,
        appliedReleaseId,
        JSON.stringify({
          authenticated: true,
          semanticVersion: bundle.semanticVersion,
        }),
      ],
    );
    return {
      mode: "applied",
      publicationKey: PUBLICATION_KEY,
      releaseId,
      releaseNo,
      semanticVersion: bundle.semanticVersion,
      appliedReleaseId,
      artifactHash,
      compiledBundleHash: compiled.compiledBundleHash,
    };
  } finally {
    await neon.end();
    await studio.end();
  }
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
function sha256(value: unknown): string {
  return createHash("sha256").update(canonical(value)).digest("hex");
}
function deterministicUuid(name: string): string {
  const bytes = createHash("sha1")
    .update(UUID_NAMESPACE)
    .update(name)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6]! & 15) | 80;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function localDatabase(url: URL): boolean {
  if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) return true;
  const octets = url.hostname.split(".").map(Number);
  return (
    octets.length === 4 &&
    octets.every(
      (octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255,
    ) &&
    (octets[0] === 10 ||
      (octets[0] === 172 && octets[1]! >= 16 && octets[1]! <= 31) ||
      (octets[0] === 192 && octets[1] === 168))
  );
}
function siblingDatabaseUrl(databaseUrl: string, databaseName: string): string {
  const url = new URL(databaseUrl);
  url.pathname = `/${databaseName}`;
  return url.toString();
}
async function one<T extends object>(
  client: QueryClient,
  statement: string,
  values: unknown[] = [],
): Promise<T> {
  const result = await client.query<T>(statement, values);
  if (result.rows.length !== 1)
    throw new Error(`expected one row, received ${result.rows.length}`);
  return result.rows[0]!;
}
function option(args: string[], name: string): string | undefined {
  const equal = args.find((item) => item.startsWith(`${name}=`));
  if (equal) return equal.slice(name.length + 1);
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const neonDatabaseUrl =
    option(args, "--database-url") ??
    process.env["ATHYPER_NEON_DATABASE_ADMIN_URL"];
  if (!neonDatabaseUrl)
    throw new Error("set ATHYPER_NEON_DATABASE_ADMIN_URL or --database-url");
  const result = await publishDevelopmentBusinessPartnerDefinition({
    neonDatabaseUrl,
    studioDatabaseUrl:
      option(args, "--studio-database-url") ??
      process.env["ATHYPER_STUDIO_DATABASE_ADMIN_URL"],
    confirmation: option(args, "--confirm"),
    dryRun: args.includes("--plan") || args.includes("--dry-run"),
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
