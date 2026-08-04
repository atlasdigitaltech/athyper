import { describe, expect, it, vi } from "vitest";
import { createMetaEntityAuthoringClient, type MetaEntityFetch } from "./client";

function response(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

describe("Meta Entity authoring client", () => {
  it("uses the canonical module-coordinate endpoint", async () => {
    const fetcher = vi.fn<MetaEntityFetch>().mockResolvedValue(response([{ coordinateKey: "athyper:core:meta" }]));
    const client = createMetaEntityAuthoringClient(fetcher);
    await expect(client.listModuleCoordinates()).resolves.toEqual([{ coordinateKey: "athyper:core:meta" }]);
    expect(fetcher).toHaveBeenCalledWith("/api/relay/meta-entity/module-coordinates", { signal: undefined });
  });

  it("creates an Entity with a coordinate and initial draft, never a raw module id", async () => {
    const fetcher = vi.fn<MetaEntityFetch>().mockResolvedValue(response({ id: "entity-id", moduleCode: "meta", entityCode: "example" }, 201));
    const client = createMetaEntityAuthoringClient(fetcher);
    await client.createEntity({
      moduleCoordinate: { planeCode: "athyper", workspaceCode: "core", moduleCode: "meta" },
      entityCode: "example",
      entityClass: "business",
      initialChangeSet: {
        changeSetCode: "initial_contract",
        title: "Initial contract",
        storagePlane: "neon",
        storageSchema: "document",
        storageObject: "example",
      },
    });
    const [, init] = fetcher.mock.calls[0]!;
    expect(JSON.parse(init?.body ?? "{}")).toMatchObject({
      moduleCoordinate: { planeCode: "athyper", workspaceCode: "core", moduleCode: "meta" },
      initialChangeSet: { storageObject: "example" },
    });
    expect(init?.body).not.toContain("moduleId");
  });
});
