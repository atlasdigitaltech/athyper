/** Disposable-only Studio persistence -> real compiler -> verified local activation. */
import assert from "node:assert/strict";
import {
  createHash,
  generateKeyPairSync,
  randomUUID,
  sign,
  verify,
} from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import { KyselyMetaEntityAuthoringRepository } from "@athyper/server-plane-studio-meta-entity-authoring";
import { compileGraph } from "@athyper/server-plane-studio-meta-entity-authoring";
import {
  compileCompiledEntityArtifacts,
  compiledEntityRuntimeProjection,
} from "../../../../packages/services/publication/src/compiled-entity-artifact-compiler.js";
import { VerifiedPublicationArtifactLoader } from "../../../../packages/services/publication/src/publication-artifact-loader.js";
import { KyselyLocalProjectionRepository } from "../../../../packages/services/publication/src/kysely-local-projection-repository.js";
import {
  PinnedCompiledEntityReader,
  createRuntimeMetaCompiledEntityReleaseSource,
} from "../../../../packages/platform/metadata/src/index.js";
import type { MetaEntityGraph } from "../../../../packages/contracts/meta-entity-authoring/src/model.js";
import type {
  PublicationArtifactDocumentV1,
  PublicationDeploymentBundle,
} from "@athyper/server-contract-publication";
const container = process.argv[2];
if (!container || !/^(athyper-ca02-local-|athyper-bp-integration-local-)/.test(container))
  throw new Error("An isolated athyper-ca02-local-* container is required");
const info = JSON.parse(
  execFileSync("docker", ["inspect", container], { encoding: "utf8" }),
)[0];
assert.equal(info.Config.Labels["athyper.environment"], "disposable_local");
const host = info.NetworkSettings.Networks.bridge?.IPAddress;
assert.ok(host, "Connect the disposable container to its local bridge first");
const database = (plane: string) =>
  new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({
        host,
        user: "postgres",
        database: `athyper_${plane}`,
        options: `-c app.database_plane=${plane}`,
        max: 2,
      }),
    }),
  });
const studio = database("studio"),
  neon = database("neon");
const zero = "00000000-0000-0000-0000-000000000000",
  entityCode = "ca01_example";
const source = JSON.parse(
  readFileSync(
    new URL(
      "../../../../../metadata/entities/business_partner/operation.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const canonical = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canonical)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.entries(v)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, item]) => [k, canonical(item)]),
        )
      : v;
const canonicalBytes = (v: unknown) =>
  Buffer.from(JSON.stringify(canonical(v)));
const sha256 = (v: Uint8Array) => createHash("sha256").update(v).digest("hex");
try {
  const members = (["comments", "attachments"] as const).map(
    (capabilityKey) => ({
      capabilityKey,
      declaration: {
        enabled: true as const,
        serviceKey: `platform.${capabilityKey}.v1`,
        ownerEntityCode: entityCode,
        load: "lazy" as const,
      },
      binding: {
        ...source[
          capabilityKey === "comments" ? "commentBinding" : "attachmentBinding"
        ],
        ownerEntityCode: entityCode,
        ...(capabilityKey === "comments" ? {
          attachments: {
            ...source.commentBinding.attachments,
            bindingRef: `${entityCode}/operation#attachmentBinding`,
          },
        } : {}),
      },
    }),
  );
  let saved!: MetaEntityGraph;
  await studio.transaction().execute(async (tx) => {
    await sql`SELECT set_config('app.current_tenant_id',${zero},true),set_config('app.current_principal_id',${zero},true)`.execute(
      tx,
    );
    const entityId = randomUUID();
    await sql`INSERT INTO metadata.entity(id,tenant_id,module_id,entity_code,entity_class,ownership_model,status,created_by) SELECT ${entityId}::uuid,${zero}::uuid,id,${entityCode},'configuration','tenant','draft',${zero}::uuid FROM control.module WHERE status='active' ORDER BY code LIMIT 1 ON CONFLICT DO NOTHING`.execute(
      tx,
    );
    const entity = (
      await sql<{
        id: string;
      }>`SELECT id FROM metadata.entity WHERE tenant_id=${zero}::uuid AND entity_code=${entityCode}`.execute(
        tx,
      )
    ).rows[0]!;
    await sql`SET LOCAL ROLE athyperapp`.execute(tx);
    const repository = new KyselyMetaEntityAuthoringRepository(tx);
    const draft = await repository.createDraft({
      tenantId: zero,
      entityId: entity.id,
      entityCode,
      branchCode: `fixture-${randomUUID()}`,
      title: "CA01 local capability fixture",
      actorId: zero,
    });
    const graph: MetaEntityGraph = {
      contractSchema: "athyper.meta-entity-contract/2.1",
      entity: {
        entityCode,
        entityClass: "configuration",
        ownershipModel: "tenant",
      },
      runtimeProfiles: [
        {
          profileKey: "default",
          backingKind: "virtual",
          apiExposure: "catalog_only",
          readMode: "none",
          writeMode: "none",
        },
      ],
      fields: [],
      operations: [],
      capabilities: members,
    };
    await repository.replaceGraph({
      changeSetId: draft.id,
      expectedRevision: draft.revision,
      graph,
      actorId: zero,
    });
    saved = await repository.loadGraph(draft.id);
    assert.equal(saved.capabilities?.length, 2);
    await sql`SELECT set_config('app.current_tenant_id',${randomUUID()},true)`.execute(
      tx,
    );
    const hidden = (
      await sql<{
        count: string;
      }>`SELECT count(*)::text count FROM metadata.entity_capability WHERE change_set_id=${draft.id}::uuid`.execute(
        tx,
      )
    ).rows[0]!;
    assert.equal(hidden.count, "0");
    await sql`SELECT set_config('app.current_tenant_id',${zero},true)`.execute(
      tx,
    );
    assert.deepEqual(
      compileGraph(saved).descriptor.capabilities,
      Object.fromEntries(members.map((m) => [m.capabilityKey, m.declaration])),
    );
    await assert.rejects(
      repository.replaceGraph({
        changeSetId: draft.id,
        expectedRevision: draft.revision,
        graph,
        actorId: zero,
      }),
    );
  });
  const releaseId = randomUUID(),
    publicationKey = `metadata.compiled_entity.${entityCode}`;
  const prior = (
    await sql<{
      n: string;
    }>`SELECT coalesce(max(source_release_no),0)::text n FROM runtime_meta.applied_release WHERE publication_key=${publicationKey}`.execute(
      neon,
    )
  ).rows[0]!;
  const releaseNo = Number(prior.n) + 1;
  const base = {
    schema: "athyper.compiled-entity-artifact/2.0-draft",
    schemaVersion: 2,
    contractStatus: "published",
    entityCode,
    plane: "neon",
    dependencies: [],
  };
  const registry = {
    handlers: new Set(
      members.flatMap((m) => [
        m.declaration.serviceKey,
        ...m.binding.actions.map((a: { handlerKey: string }) => a.handlerKey),
      ]),
    ),
    permissions: new Set<string>(
      members.flatMap((m) =>
        m.binding.actions.map(
          (a: { permissionCode: string }) => a.permissionCode,
        ),
      ),
    ),
    resolvers: new Set(["platform.records.admission.v1"]),
    renderers: new Set(members.map((m) => m.declaration.serviceKey)),
    evaluators: new Set<string>(),
  };
  const compilation = compileCompiledEntityArtifacts({
    capabilityMembers: { [entityCode]: saved.capabilities! },
    canonicalizer: { canonicalBytes, sha256: (v) => `sha256:${sha256(v)}` },
    registry,
    artifacts: [
      ...members.map((member) => ({
        ref: `${entityCode}/presentation.section.${member.capabilityKey}.json`,
        content: {
          ...base,
          artifactType: "presentation_section",
          artifactKey: `${entityCode}/presentation.section.${member.capabilityKey}`,
          sectionKey: member.capabilityKey,
          rendererKey: member.binding.serviceKey,
          dataBinding: {
            serviceKey: member.binding.serviceKey,
            ownerEntityCode: entityCode,
            includeInAggregate: false,
          },
          dependencies: [`${entityCode}/core`, `${entityCode}/operation`],
        },
      })),
      {
        ref: `${entityCode}/core.json`,
        content: {
          ...base,
          artifactType: "core",
          artifactKey: `${entityCode}/core`,
          fields: [],
        },
      },
      {
        ref: `${entityCode}/operation.json`,
        content: {
          ...base,
          artifactType: "operation",
          artifactKey: `${entityCode}/operation`,
          operations: [],
          dependencies: [`${entityCode}/core`],
        },
      },
    ],
    release: {
      content: {
        schema: "athyper.compiled-entity-release/2.0-draft",
        contractStatus: "published",
        releaseId,
        releaseNo,
        targetPlanes: ["neon"],
        externalDependencies: [],
        signature: {
          algorithm: "Ed25519",
          keyId: "ca01-local",
          value: "outer-envelope-signed",
        },
      },
    },
  });
  const now = new Date().toISOString(),
    payload = compiledEntityRuntimeProjection(compilation, now, entityCode);
  const envelope = {
    schema: "athyper.publication-artifact.v1" as const,
    publicationKey,
    releaseId,
    releaseNo,
    releaseKind: "publish" as const,
    targetPlane: "neon" as const,
    artifactKind: "compiled_entity_runtime" as const,
    generatedAt: now,
    compatibilityLevel: "breaking" as const,
    payload,
  };
  const manifest = {
    artifactSchema: "athyper.publication-artifact.v1" as const,
    mediaType: "application/vnd.athyper.publication-artifact.v1+json" as const,
    publicationKey,
    releaseId,
    releaseNo,
    targetPlane: "neon" as const,
    artifactKind: "compiled_entity_runtime" as const,
    payloadSha256: sha256(canonicalBytes(payload)),
    compiler: { name: "ca01-local", version: "1.0.0" },
    contractSchemaVersion: "2.0",
    descriptorSchemaVersion: "2.0",
    signatureAlgorithm: "Ed25519",
    signingKeyId: "ca01-local",
    createdAt: now,
  };
  const keys = generateKeyPairSync("ed25519"),
    signature = sign(
      null,
      canonicalBytes({ envelope, manifest }),
      keys.privateKey,
    ).toString("base64");
  const document: PublicationArtifactDocumentV1 = {
      envelope,
      manifest,
      signature,
    },
    bytes = canonicalBytes(document);
  const deployment: PublicationDeploymentBundle = {
    deploymentId: randomUUID(),
    deploymentStatus: "received",
    targetPlane: "neon",
    targetEnvironment: "disposable_local",
    targetInstance: container,
    publicationKey,
    sourceReleaseId: releaseId,
    sourceReleaseNo: releaseNo,
    artifactUri: "fixture://ca01",
    artifactHash: sha256(bytes),
    signatureAlgorithm: "Ed25519",
    signingKeyId: "ca01-local",
    signature,
  };
  const loader = new VerifiedPublicationArtifactLoader({
    store: { get: async () => bytes, putImmutable: async () => {} },
    canonicalizer: { canonicalBytes, sha256 },
    verifier: {
      verify: async (input) =>
        verify(
          null,
          input.bytes,
          keys.publicKey,
          Buffer.from(input.signature, "base64"),
        ),
    },
    runtimeVersion: "1.0.0",
  });
  const loaded = await loader.load(deployment);
  const repository = new KyselyLocalProjectionRepository(neon);
  const staged = await repository.stage({
    deployment,
    artifact: loaded.document,
  });
  assert.equal(
    (
      await repository.verify({
        appliedReleaseId: staged.id,
        computedArtifactHash: loaded.computedArtifactHash,
        evidence: loaded.verification,
      })
    ).status,
    "verified",
  );
  assert.equal(
    (await repository.activate({ appliedReleaseId: staged.id })).status,
    "active",
  );
  const reader = new PinnedCompiledEntityReader({
    source: createRuntimeMetaCompiledEntityReleaseSource({
      databases: { neon },
    }),
  });
  const admitted = await reader.resolve({
    tenantId: zero,
    principalId: zero,
    planeKey: "neon",
    entityCode,
  });
  assert.ok(admitted);
  for (const member of members) {
    const section = await reader.section(admitted, member.capabilityKey);
    assert.equal(section.content.rendererKey, member.binding.serviceKey);
    assert.deepEqual(member.binding.layouts, ["drawer", "content"]);
  }
  assert.deepEqual(
    (await reader.operation(admitted)).content.commentBinding,
    members[0]!.binding,
  );
  console.log(
    JSON.stringify({
      result:
        "CA01 Studio persistence, real compilation, signature verification and local activation passed",
      publicationKey,
      releaseNo,
      releaseHash: admitted.release.releaseHash,
    }),
  );
} finally {
  await studio.destroy();
  await neon.destroy();
}
