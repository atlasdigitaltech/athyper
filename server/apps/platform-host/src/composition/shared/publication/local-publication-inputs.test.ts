import { Kysely, PostgresDialect } from "kysely";
import { expect, it, vi } from "vitest";
vi.mock("@athyper/server-plane-studio-meta-entity-authoring", () => ({
  compileNativePublication: () => ({
    contractHash: "a".repeat(64),
    descriptorHash: "b".repeat(64),
  }),
  nativePublicationTargets: () => [
    { targetPlane: "studio", artifact: { descriptorHash: "c".repeat(64) } },
  ],
  sha256: () => "d".repeat(64),
}));
vi.mock("./compiler-build.js", () => ({
  publicationCompilerIdentity: () => ({ buildHash: "e".repeat(64) }),
}));
import { resolveLocalPublicationInputs } from "./local-publication-inputs.js";
it("uses the admitted predecessor reader for control requests and rejects missing or changed predecessors", async () => {
  let rows: unknown[] = [
    {
      artifact_hash: "f".repeat(64),
      applied_release_id: "applied",
      source_release_id: "prior",
      source_release_no: 2,
      row_version: 1,
      valid: true,
    },
  ];
  const query = vi.fn(async (_sql: string, _parameters?: unknown[]) => ({
    rows,
  }));
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        connect: async () => ({ query, release() {} }),
        end: async () => {},
      } as never,
    }),
  });
  const input = {
    database: db,
    authority: "control" as const,
    source: {
      graph: {
        entity: { entityClass: "reference", entityCode: "test_fixture" },
      },
      compiler: {},
    } as never,
    changeSetId: "draft",
    revision: 1,
    predecessorReleaseId: "prior",
    instance: "dev",
  };
  try {
    const result = await resolveLocalPublicationInputs(input);
    expect(result.targets[0]?.predecessor?.sourceReleaseId).toBe("prior");
    expect(query.mock.calls[0]?.[0]).toContain(
      "publication.read_local_publication_predecessor",
    );
    rows = [];
    await expect(resolveLocalPublicationInputs(input)).rejects.toThrow(
      "PREDECESSOR_EVIDENCE_REQUIRED",
    );
    rows = [{ source_release_id: "different", valid: true }];
    await expect(resolveLocalPublicationInputs(input)).rejects.toThrow(
      "PREDECESSOR_EVIDENCE_REQUIRED",
    );
    rows = [{ source_release_id: "prior", valid: false }];
    await expect(resolveLocalPublicationInputs(input)).rejects.toThrow(
      "HEAD_INVALID",
    );
  } finally {
    await db.destroy();
  }
});
