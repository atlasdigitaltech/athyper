import { Kysely, PostgresDialect, type PostgresPoolClient } from "kysely";
import { expect, it, vi } from "vitest";
import { parseCompiledEntityReleaseEnvelope } from "@athyper/server-contract-publication";
import { createRuntimeMetaCompiledEntityReleaseSource } from "../runtime-descriptor-repository.js";

const coordinate = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  principalId: "22222222-2222-4222-8222-222222222222",
  entityCode: "business_partner",
  planeKey: "neon" as const,
};
const hash = `sha256:${"a".repeat(64)}`;
const release = parseCompiledEntityReleaseEnvelope({
  schema: "athyper.compiled-entity-release/2.0-draft",
  contractStatus: "published",
  releaseId: "tenant-release",
  releaseNo: 1,
  targetPlanes: ["neon"],
  artifacts: [
    {
      artifactKey: "business_partner/core",
      artifactType: "core",
      entityCode: "business_partner",
      ref: "business_partner/core.json",
      hash,
    },
  ],
  externalDependencies: [],
  signature: {},
  releaseHash: hash,
});

it("reads tenant-owned fragments through the same tenant transaction as release resolution", async () => {
  const query = vi.fn(
    async (_sql: string, _parameters: readonly unknown[]) => ({
      rows: [],
      command: "SELECT" as const,
      rowCount: 0,
    }),
  );
  const database = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        end: async () => {},
        // SQL-only fixture; the cursor overload is not exercised by this repository.
        connect: async () => ({
          query: query as unknown as PostgresPoolClient["query"],
          release: () => {},
        }),
      },
    }),
  });
  const withTenantTransaction = vi.fn(async (_plane, _actor, work) =>
    work(database),
  );
  try {
    const source = createRuntimeMetaCompiledEntityReleaseSource({
      databases: { neon: database },
      withTenantTransaction,
    });
    expect(
      await source.findArtifact({
        coordinate,
        release,
        entry: release.artifacts[0]!,
      }),
    ).toBeNull();
    expect(withTenantTransaction).toHaveBeenCalledWith(
      "neon",
      coordinate,
      expect.any(Function),
    );
    const [statement, parameters] = query.mock.calls[0]!;
    expect(statement).toContain(
      "payload.tenant_id IS NULL OR payload.tenant_id=",
    );
    expect(statement).toContain("->>'releaseId'");
    expect(statement).toContain("->>'releaseHash'");
    expect(parameters).toEqual([
      coordinate.tenantId,
      release.releaseHash,
      release.releaseId,
      "business_partner/core",
    ]);
  } finally {
    await database.destroy();
  }
});

it("rejects a fragment read in a plane outside the admitted release", async () => {
  const source = createRuntimeMetaCompiledEntityReleaseSource({
    databases: {},
  });
  await expect(
    source.findArtifact({
      coordinate: { ...coordinate, planeKey: "mesh" },
      release,
      entry: release.artifacts[0]!,
    }),
  ).rejects.toThrow("PLANE_NOT_ADMITTED");
});
