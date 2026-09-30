import { describe, expect, it, vi } from "vitest";
import type {
  GraphPreviewInput,
  GraphPreviewPorts,
  GraphPreviewStatus,
} from "../graph-preview.js";
import { createMetaEntityGraphPreview } from "../graph-preview.js";
import { graphDependencies } from "../graph-dependencies.js";

const env = {
  ATHYPER_LOCAL_WORKSPACE: "1",
  ATHYPER_ENV: "local",
  ATHYPER_DOMAIN_SUFFIX: "dev.athyper.test",
};
const input = (): {
  actorId: string;
  changeSet: GraphPreviewInput["changeSet"];
  graph: GraphPreviewInput["graph"];
} => ({
  actorId: "author",
  changeSet: {
    id: "change",
    tenantId: "tenant",
    entityId: "entity",
    entityCode: "invoice",
    branchCode: "main",
    status: "draft",
    revision: 1,
    createdBy: "author",
  },
  graph: {
    contractSchema: "athyper.meta-entity-contract/2.1",
    entity: { entityCode: "invoice" },
    fields: [
      { fieldKey: "id", dataType: "uuid", typeConfig: { kind: "uuid" } },
    ],
    operations: [],
    runtimeProfiles: [
      {
        backingKind: "virtual",
        apiExposure: "catalog_only",
        readMode: "none",
        writeMode: "none",
        concurrencyMode: "none",
      },
    ],
  },
});
function fixture() {
  let head = "",
    active: number | undefined;
  const statuses: GraphPreviewStatus[] = [];
  const discarded = vi.fn(async () => {});
  const ports: GraphPreviewPorts = {
    claim: async (saved) => (head = String(saved.changeSet.revision)),
    current: async (claim) => head === claim,
    resolve: async () => {},
    prepare: vi.fn(async (saved, _artifact, claim) => ({
      commit: async () => {
        if (head !== claim) return false;
        active = saved.changeSet.revision;
        return true;
      },
      discard: discarded,
    })),
    record: async (claim, status) => {
      if (head === claim) statuses.push(status);
    },
  };
  return { ports, statuses, discarded, active: () => active };
}
describe("local Meta Entity graph preview", () => {
  it("requires the explicit personal DEV environment", () => {
    const { ports } = fixture();
    expect(() => createMetaEntityGraphPreview(ports, {})).toThrow(
      /LOCAL_WORKSPACE/,
    );
    expect(() =>
      createMetaEntityGraphPreview(ports, {
        ...env,
        ATHYPER_DOMAIN_SUFFIX: "qa.athyper.test",
      }),
    ).toThrow(/LOCAL_WORKSPACE/);
  });
  it("compiles structural changes without publication or approval", async () => {
    const f = fixture(),
      preview = createMetaEntityGraphPreview(f.ports, env),
      saved = input();
    saved.graph = {
      ...saved.graph,
      fields: [
        ...saved.graph.fields,
        {
          fieldKey: "amount",
          dataType: "decimal",
          typeConfig: { kind: "decimal" },
        },
      ],
    };
    expect(await preview.saved(saved)).toMatchObject({
      state: "active",
      activeRevision: 1,
      developmentEvidence: true,
    });
    expect(f.ports.prepare).toHaveBeenCalledOnce();
    expect(f.statuses.map((status) => status.state)).toEqual([
      "compiling",
      "active",
    ]);
  });
  it("retains the active head when native validation fails, then recovers", async () => {
    const f = fixture(),
      preview = createMetaEntityGraphPreview(f.ports, env);
    await preview.saved(input());
    const bad = input();
    bad.changeSet = { ...bad.changeSet, revision: 2 };
    bad.graph = {
      ...bad.graph,
      operations: [
        {
          operationKey: "read",
          operationKind: "read",
          label: "Read",
          auditEventCode: "invoice.read",
          fieldKeys: ["missing"],
        },
      ],
    };
    expect(await preview.saved(bad)).toMatchObject({
      state: "failed",
      savedRevision: 2,
    });
    expect(f.active()).toBe(1);
    expect(f.ports.prepare).toHaveBeenCalledOnce();
    expect(
      await preview.saved({
        ...input(),
        changeSet: { ...input().changeSet, revision: 3 },
      }),
    ).toMatchObject({ state: "active", activeRevision: 3 });
  });
  it("rejects failed contract assertions and unresolved dependencies before staging", async () => {
    const f = fixture(),
      preview = createMetaEntityGraphPreview(f.ports, env),
      bad = input();
    bad.graph = {
      ...bad.graph,
      tests: [
        {
          key: "wrong",
          assertion: "path_equals",
          path: "entity.entityCode",
          expected: "wrong",
        },
      ],
    };
    expect(await preview.saved(bad)).toMatchObject({
      state: "failed",
      error: "GRAPH_PREVIEW_CONTRACT_TESTS_FAILED:wrong",
    });
    f.ports.resolve = async () => {
      throw Error("MISSING_PERMISSION");
    };
    expect(await preview.saved(input())).toMatchObject({
      state: "failed",
      error: "MISSING_PERMISSION",
    });
    expect(f.ports.prepare).not.toHaveBeenCalled();
  });
  it("does not activate a slow compilation over a newer save", async () => {
    const f = fixture();
    let release!: () => void, started!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const prepare = f.ports.prepare;
    f.ports.prepare = async (saved, artifact, claim) => {
      const prepared = await prepare(saved, artifact, claim);
      if (saved.changeSet.revision === 1) {
        started();
        await blocked;
      }
      return prepared;
    };
    const preview = createMetaEntityGraphPreview(f.ports, env);
    const older = preview.saved(input());
    await entered;
    await preview.saved({
      ...input(),
      changeSet: { ...input().changeSet, revision: 2 },
    });
    release();
    expect(await older).toMatchObject({ state: "superseded" });
    expect(f.active()).toBe(2);
    expect(f.discarded).toHaveBeenCalledOnce();
    expect(f.statuses.at(-1)).toMatchObject({
      savedRevision: 2,
      state: "active",
    });
  });
  it("does not preview a platform or approved change set", async () => {
    const f = fixture(),
      preview = createMetaEntityGraphPreview(f.ports, env);
    await expect(
      preview.saved({
        ...input(),
        changeSet: { ...input().changeSet, tenantId: null },
      }),
    ).rejects.toThrow(/TENANT_DRAFT/);
    await expect(
      preview.saved({
        ...input(),
        changeSet: { ...input().changeSet, status: "approved" },
      }),
    ).rejects.toThrow(/TENANT_DRAFT/);
  });
  it("collects external graph references, including exact revisions", () => {
    const graph = {
      ...input().graph,
      operationPermissions: [
        {
          entityOperationId: "op",
          targetPlane: "neon" as const,
          permissionCode: "neon.invoice.read",
          permissionKind: "entity_operation",
        },
      ],
      relationTargets: [
        {
          entityRelationId: "relation",
          relationTargetKey: "partner",
          targetEntityId: "partner-id",
          targetKeyKey: "primary",
        },
      ],
      lifecycleBindings: [
        {
          bindingKey: "status",
          entityFieldId: "status",
          targetPlane: "neon" as const,
          lifecycleCode: "invoice",
          lifecycleRevision: 4,
        },
      ],
    };
    expect(graphDependencies(graph)).toEqual(
      expect.arrayContaining([
        { kind: "entity", key: "partner-id" },
        { kind: "permission", key: "neon.invoice.read", plane: "neon" },
        { kind: "lifecycle", key: "invoice", plane: "neon", revision: 4 },
      ]),
    );
  });
});
