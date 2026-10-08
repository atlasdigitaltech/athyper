import { Kysely, PostgresDialect } from "kysely";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { KyselyPublicationAuthorityRepository } from "./kysely-authority-repository.js";
const canonical = {
  canonicalBytes: (v: unknown) => Buffer.from(JSON.stringify(v)),
  sha256: (v: Uint8Array) => createHash("sha256").update(v).digest("hex"),
};
it("persists exact generated resource source in the existing ledger with atomic replay checks", async () => {
  const source = {
    releaseId: "00000000-0000-4000-8000-000000000001",
    publicationKey: "fixture.resource",
    releaseNo: 1,
    generatedAt: "2026-10-08T00:00:00Z",
    kind: "entity_authoring_descriptor" as const,
    payload: {
      schema: "entity.installed-authoring-descriptor/1",
      schemaVersion: 1,
      descriptor: {},
      descriptorHash: "a".repeat(64),
    },
  };
  const hash = canonical.sha256(canonical.canonicalBytes(source)),
    metadata = { artifactKind: source.kind, authoringResourceSource: source };
  const row = {
    id: source.releaseId,
    tenant_id: "authority",
    release_key: source.publicationKey,
    release_no: 1,
    release_kind: "publish",
    status: "preparing",
    release_hash: hash,
    manifest_hash: hash,
    created_by: "author",
    created_at: source.generatedAt,
    metadata,
  };
  const queries: string[] = [];
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        connect: async () => ({
          query: async (text: string) => {
            queries.push(text);
            return { rows: [row], rowCount: 1 };
          },
          release() {},
        }),
        end: async () => {},
      } as never,
    }),
  });
  try {
    const input = {
      id: source.releaseId,
      tenantId: "authority",
      publicationKey: source.publicationKey,
      releaseNo: 1,
      releaseKind: "publish" as const,
      compatibilityLevel: "breaking" as const,
      releaseHash: hash,
      manifestHash: hash,
      actorId: "author",
      authoringResourceSource: source,
    };
    await db.transaction().execute(async (tx) => {
      await new KyselyPublicationAuthorityRepository(
        tx,
        canonical,
      ).createRelease(input);
    });
    expect(queries.filter((q) => q.startsWith("begin"))).toHaveLength(1);
    expect(queries.some((q) => q.includes("entity_release_link"))).toBe(false);
    await expect(
      new KyselyPublicationAuthorityRepository(db, canonical).createRelease({
        ...input,
        actorId: "different",
      }),
    ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    await expect(
      new KyselyPublicationAuthorityRepository(db, canonical).createRelease({
        ...input,
        entityReleaseId: source.releaseId,
      }),
    ).rejects.toThrow("SOURCE_INVALID");
    await expect(
      new KyselyPublicationAuthorityRepository(db, canonical).createRelease({
        ...input,
        releaseHash: "b".repeat(64),
      }),
    ).rejects.toThrow("HASH_MISMATCH");
  } finally {
    await db.destroy();
  }
});
