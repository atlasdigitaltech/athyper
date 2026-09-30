import { readFileSync } from "node:fs";
import { createHash, generateKeyPairSync, sign, verify } from "node:crypto";
import { expect, it } from "vitest";
import { Kysely, PostgresDialect } from "kysely";
import {
  PUBLICATION_ARTIFACT_SCHEMA_V1,
  PUBLICATION_ARTIFACT_MEDIA_TYPE_V1,
} from "@athyper/server-contract-publication";
import { VerifiedPublicationArtifactLoader } from "../publication-artifact-loader.js";
import { readPublishedNotificationConfiguration } from "../notification-configuration-source.js";
const graph = JSON.parse(
  readFileSync(
    new URL(
      "../../../../../../tooling/fixtures/notifications/business-partner-inherit.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const ordered = (x: unknown): unknown =>
  Array.isArray(x)
    ? x.map(ordered)
    : x && typeof x === "object"
      ? Object.fromEntries(
          Object.entries(x)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, ordered(v)]),
        )
      : x;
const canonicalBytes = (x: unknown) => Buffer.from(JSON.stringify(ordered(x))),
  sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const id = "10000000-0000-4000-8000-000000000001",
  tenant = "44444444-4444-4444-8444-444444444444",
  key = `metadata.notifications.business_partner.${tenant.replaceAll("-", "")}`;
const descriptor = () => ({
  schema: "athyper.entity-notifications/1",
  entityCode: "business_partner",
  sourceEntityCode: "business_partner_notifications",
  notifications: {
    comments: structuredClone(graph.capabilities[0].binding.notifications),
    attachments: structuredClone(graph.capabilities[1].binding.notifications),
  },
});
async function load(mode = "valid") {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519"),
    contract = structuredClone(graph),
    d = descriptor();
  if (mode === "bad-schema") d.schema = "athyper.entity-notifications/2";
  if (mode === "source-mismatch") d.notifications.comments.mode = "disabled";
  const contractHash = sha256(canonicalBytes(contract)),
    at = "2026-09-23T00:00:00.000Z";
  const payload = {
    entityContract: {
      id,
      tenantId: tenant,
      entityId: id,
      entityCode: "business_partner_notifications",
      releaseId: id,
      revisionId: id,
      releaseNo: 1,
      contractSchemaCode: "athyper.meta-entity-contract",
      contractSchemaVersion: "2.1",
      contractHash,
      contract,
      publicationKey: key,
      signature: {
        algorithm: "Ed25519",
        keyId: "test",
        signature: sign(
          null,
          canonicalBytes(mode === "bad-signature" ? {} : contract),
          privateKey,
        ).toString("base64"),
      },
      publishedAt: at,
    },
    entityDescriptor: {
      id,
      plane: "neon",
      descriptorKind: "entity_notifications",
      descriptorSchemaVersion: "1.0.0",
      sourceContractHash: contractHash,
      compiledHash: sha256(canonicalBytes(d)),
      descriptor: d,
      compilerVersion: "test/1",
      compatibilityLevel: "backward_compatible",
      generatedAt: at,
    },
  };
  const envelope = {
    schema: PUBLICATION_ARTIFACT_SCHEMA_V1,
    publicationKey: key,
    releaseId: id,
    releaseNo: 1,
    releaseKind: "publish",
    targetPlane: "neon",
    artifactKind: "entity_runtime",
    generatedAt: at,
    compatibilityLevel: "backward_compatible",
    payload,
  };
  const manifest = {
    artifactSchema: PUBLICATION_ARTIFACT_SCHEMA_V1,
    mediaType: PUBLICATION_ARTIFACT_MEDIA_TYPE_V1,
    publicationKey: key,
    releaseId: id,
    releaseNo: 1,
    targetPlane: "neon",
    artifactKind: "entity_runtime",
    payloadSha256: sha256(canonicalBytes(payload)),
    compiler: { name: "test", version: "1.0.0" },
    contractSchemaVersion: "2.1",
    descriptorSchemaVersion: "1.0.0",
    signatureAlgorithm: "Ed25519",
    signingKeyId: "test",
    createdAt: at,
  };
  const signature = sign(
      null,
      canonicalBytes({ envelope, manifest }),
      privateKey,
    ).toString("base64"),
    bytes = canonicalBytes({ envelope, manifest, signature });
  const loader = new VerifiedPublicationArtifactLoader({
    store: { get: async () => bytes, putImmutable: async () => {} },
    verifier: {
      verify: async (input) =>
        verify(
          null,
          input.bytes,
          publicKey,
          Buffer.from(input.signature, "base64"),
        ),
    },
    canonicalizer: { canonicalBytes, sha256 },
    runtimeVersion: "1.0.0",
  });
  return loader.load({
    deploymentId: id,
    deploymentStatus: "dispatched",
    targetPlane: "neon",
    targetEnvironment: "test",
    targetInstance: "*",
    publicationKey: key,
    sourceReleaseId: id,
    sourceReleaseNo: 1,
    artifactUri: "s3://test/notifications.json",
    artifactHash: sha256(bytes),
    signatureAlgorithm: "Ed25519",
    signingKeyId: "test",
    signature,
  });
}
it("verifies both signed contract and notification projection", async () =>
  expect((await load()).verification.signatureVerified).toBe(true));
it.each(["bad-schema", "source-mismatch"])(
  "rejects correctly signed but invalid %s",
  async (mode) => {
    await expect(load(mode)).rejects.toThrow("ARTIFACT_PAYLOAD_INVALID");
  },
);
it("rejects an invalid inner signature despite a signed envelope", async () => {
  await expect(load("bad-signature")).rejects.toThrow(
    "ARTIFACT_SIGNATURE_INVALID",
  );
});
it("reads only the tenant notification head and validates its schema and parent identity", async () => {
  let rows: any[] = [
    {
      tenant_id: tenant,
      entity_code: "business_partner_notifications",
      compiled_json: descriptor(),
      release_id: id,
      release_no: "1",
      compiled_hash: "hash",
    },
  ];
  const queries: any[] = [];
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        end: async () => {},
        connect: async () => ({
          query: async (text: any, parameters: any) => {
            queries.push({ text, parameters });
            return { rows };
          },
          release() {},
        }),
      } as any,
    }),
  });
  try {
    const read = await readPublishedNotificationConfiguration(
      db,
      tenant,
      "business_partner",
    );
    expect(read?.releaseId).toBe(id);
    expect(queries[0].parameters).toEqual([key]);
    expect(queries[0].text).toContain("'entity_notifications'");
    rows = [{ ...rows[0], tenant_id: "another-tenant" }];
    await expect(
      readPublishedNotificationConfiguration(db, tenant, "business_partner"),
    ).rejects.toThrow(/coordinates/);
    rows = [];
    expect(
      await readPublishedNotificationConfiguration(
        db,
        tenant,
        "business_partner",
      ),
    ).toBeNull();
  } finally {
    await db.destroy();
  }
});

it("compiles notification releases through the scoped source without direct metadata access", async () => {
  const { KyselyPublicationAuthorityWork } =
    await import("../kysely-publication-authority-work.js");
  const { KyselyPublicationAuthorityRepository } =
    await import("../kysely-authority-repository.js");
  const at = "2026-09-23T00:00:00.000Z";
  const queries: string[] = [];
  let saved: readonly unknown[] = [];
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        end: async () => {},
        connect: async () => ({
          query: async (text: string, parameters: readonly unknown[]) => {
            queries.push(text);
            if (text.includes("JOIN metadata.entity_release"))
              throw Error("Direct metadata access forbidden");
            if (
              text.includes("fn_notification_configuration_compilation_source")
            )
              return {
                rows: [
                  {
                    publication_release_id: id,
                    tenant_id: tenant,
                    release_key: key,
                    release_no: 1,
                    release_kind: "publish",
                    compatibility_level: "backward_compatible",
                    revision_id: id,
                    contract_schema_code: "athyper.meta-entity-contract",
                    contract_schema_version: "2.1",
                    contract_hash: "sql-ledger-hash",
                    contract_signature: "old",
                    signature_algorithm: "Ed25519",
                    contract_signing_key_id: "old-key",
                    published_at: at,
                    published_by: id,
                    entity_id: id,
                    entity_code: "business_partner_notifications",
                    contract_json: graph,
                    descriptor_id: id,
                    plane_key: "neon",
                    compiled_json: descriptor(),
                    compiled_hash: "sql-hash",
                    created_at: at,
                  },
                ],
              };
            if (text.includes("INSERT INTO publication.artifact_compilation"))
              saved = parameters;
            if (
              text.includes(
                "SELECT id,unsigned_hash FROM publication.artifact_compilation",
              )
            )
              return { rows: [{ id: saved[0], unsigned_hash: saved[5] }] };
            return { rows: [] };
          },
          release() {},
        }),
      } as any,
    }),
  });
  try {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const worker = new KyselyPublicationAuthorityWork({
      database: db,
      authority: new KyselyPublicationAuthorityRepository(db),
      store: {
        get: async () => {
          throw Error("Unexpected artifact read");
        },
        putImmutable: async () => {
          throw Error("Unexpected artifact write");
        },
      },
      signer: {
        sign: async (input) => ({
          signature: sign(null, input.bytes, privateKey).toString("base64"),
          algorithm: "Ed25519",
          keyId: input.keyId,
        }),
      },
      canonicalizer: { canonicalBytes, sha256 },
      bucket: "test",
      signingKeyId: "test",
      targetEnvironment: "test",
      targetPlanes: ["neon", "mesh"],
    });
    expect((await worker.compile(id)).compilationIds).toEqual([saved[0]]);
    const unsigned = JSON.parse(String(saved[4]));
    const payload = unsigned.envelope.payload;
    expect(saved[2]).toBe("neon");
    expect(payload.entityDescriptor.descriptorKind).toBe(
      "entity_notifications",
    );
    expect(payload.entityContract.contractHash).toBe(
      sha256(canonicalBytes(graph)),
    );
    expect(
      verify(
        null,
        canonicalBytes(graph),
        publicKey,
        Buffer.from(payload.entityContract.signature.signature, "base64"),
      ),
    ).toBe(true);
    expect(
      queries.some((q) => q.includes("JOIN metadata.entity_release")),
    ).toBe(false);
  } finally {
    await db.destroy();
  }
});
