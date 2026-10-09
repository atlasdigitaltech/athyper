import { Kysely, PostgresDialect } from "kysely";
import { afterEach, expect, it, vi } from "vitest";
import * as authoring from "@athyper/server-plane-studio-meta-entity-authoring";
import { nativeReleaseFixture } from "../../../../../../packages/planes/studio/meta-entity-authoring/src/native-release-compilation.fixtures.js";
import { qualifyNativeReferencePublicationTarget } from "./target-qualification.js";
afterEach(() => vi.restoreAllMocks());
it("checks native storage fingerprint, database read and runtime/capability providers without legacy markers", async () => {
  const f = nativeReleaseFixture();
  f.graph.entity.ownershipModel = "system";
  f.graph.entity.entityClass = "reference";
  const target = authoring.nativePublicationTargets(f.graph, f.run())[0]!;
  const catalogue = vi
    .spyOn(authoring, "readNativeStorageCatalogue")
    .mockResolvedValue(f.c.core.catalogues[0]! as never);
  const query = vi.fn(async (text: string) => ({
    rows: text.includes("SELECT s.scope_kind")
      ? [{ scope_kind: "tenant" }]
      : [],
  }));
  const db = new Kysely<Record<string, never>>({
    dialect: new PostgresDialect({
      pool: {
        connect: async () => ({ query, release() {} }),
        end: async () => {},
      } as never,
    }),
  });
  const runtime = { qualify: vi.fn() },
    qualifyCapabilities = vi.fn(async () => {});
  const dependencies = {
    databases: { studio: db },
    runtime,
    qualifyCapabilities,
  };
  try {
    await qualifyNativeReferencePublicationTarget(target, dependencies, [
      target,
    ]);
    expect(
      query.mock.calls.some(
        ([text]) => text.includes("limit 0") || text.includes("LIMIT 0"),
      ),
    ).toBe(true);
    expect(runtime.qualify).toHaveBeenCalledWith(
      target.artifact.descriptor.authorization,
      target.artifact.descriptor.authorizationRuntime,
    );
    expect(qualifyCapabilities).toHaveBeenCalledWith(target);
    catalogue.mockResolvedValueOnce({
      ...f.c.core.catalogues[0]!,
      hash: "0".repeat(64),
    } as never);
    await expect(
      qualifyNativeReferencePublicationTarget(target, dependencies, [target]),
    ).rejects.toThrow("CATALOGUE_CHANGED");
    expect(qualifyCapabilities).toHaveBeenCalledTimes(1);
    query.mockRejectedValueOnce(Error("read privilege denied"));
    await expect(
      qualifyNativeReferencePublicationTarget(target, dependencies, [target]),
    ).rejects.toThrow("read privilege denied");
    expect(qualifyCapabilities).toHaveBeenCalledTimes(1);
  } finally {
    await db.destroy();
  }
});
