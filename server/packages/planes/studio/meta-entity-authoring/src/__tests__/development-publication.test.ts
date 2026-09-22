import { describe, expect, it, vi } from "vitest";
import type {
  MetaEntityChangeSet,
  MetaEntityGraph,
} from "@athyper/server-contract-meta-entity-authoring";
import {
  DevelopmentPublicationWorkflow,
  type DevelopmentPublicationPolicy,
  type DevelopmentPublicationPorts,
  type DevelopmentPublicationRequest,
} from "../development-publication.js";
import { MetaEntityAuthoringService } from "../authoring-service.js";
import {
  compileGraph,
  validateGraph,
  runContractTests,
} from "../deterministic.js";

const graph: MetaEntityGraph = {
  contractSchema: "athyper.meta-entity-contract/2.1",
  entity: { entityCode: "business_partner" },
  runtimeProfiles: [
    {
      profileKey: "default",
      backingKind: "virtual",
      apiExposure: "catalog_only",
      readMode: "none",
      writeMode: "none",
    },
  ],
  fields: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      fieldKey: "code",
      dataType: "string",
      typeConfig: { kind: "string" },
    },
  ],
  operations: [
    {
      operationKey: "read",
      operationKind: "read",
      label: "Read",
      auditEventCode: "bp.read",
    },
  ],
  surfaces: [
    {
      id: "00000000-0000-4000-8000-000000000002",
      surfaceKey: "intake_partner",
      surfaceKind: "form",
      title: "Partner",
    },
  ],
};
const overlay = (g: MetaEntityGraph): MetaEntityGraph => ({
  ...g,
  surfaces: g.surfaces!.map((s) => ({
    ...s,
    layoutConfig: {
      ...s.layoutConfig,
      intakePresentation: {
        defaultLayout: "content",
        allowedLayouts: ["content"],
      },
    },
  })),
});
const policy: DevelopmentPublicationPolicy = {
  environment: "dev",
  instance: "dev",
  preset: "devfull",
  enabled: true,
  authorPrincipalId: "author",
  publisherPrincipalId: "publisher",
};
const request: DevelopmentPublicationRequest = {
  entityCode: "business_partner",
  scope: { kind: "tenant", tenantId: "tenant" },
  targets: ["neon"],
  overlay: "intake",
};

function fixture() {
  const source: MetaEntityChangeSet = {
    id: "published",
    entityId: "bp",
    entityCode: "business_partner",
    tenantId: "tenant",
    branchCode: "main",
    revision: 1,
    status: "published",
    createdBy: "original-author",
  };
  let current: MetaEntityChangeSet = {
    ...source,
    id: "draft",
    status: "draft",
    createdBy: "author",
  };
  let stored = structuredClone(graph);
  const publish = vi.fn(async (input: { targetPlanes: readonly string[] }) => ({
    release: { id: "release-new", releaseNo: 2 },
    artifact: {
      ...compileGraph(stored),
      signatureAlgorithm: "Ed25519",
      signingKeyId: "existing-key",
      signature: "signed",
    },
  }));
  const authorize = vi.fn(
    async (_permission: string, _changeSetId: string) => {},
  );
  const service = {
    createDraft: vi.fn(async () => current),
    readGraph: vi.fn(async () => ({ changeSet: current, graph: stored })),
    replaceGraph: vi.fn(async (i: { graph: MetaEntityGraph }) => {
      stored = i.graph;
      current = { ...current, revision: current.revision + 1 };
      return current;
    }),
    validate: vi.fn(async () => ({
      ...validateGraph(stored),
      changeSetId: current.id,
      checkedRevision: current.revision,
    })),
    test: vi.fn(async () => ({
      ...runContractTests(stored),
      changeSetId: current.id,
      checkedRevision: current.revision,
    })),
    submit: vi.fn(async () => {
      current = { ...current, status: "in_review", submittedBy: "author" };
      return current;
    }),
    approve: vi.fn(async () => {
      current = { ...current, status: "approved", approvedBy: "publisher" };
      return current;
    }),
    publish,
  } satisfies Pick<
    MetaEntityAuthoringService,
    | "createDraft"
    | "readGraph"
    | "replaceGraph"
    | "validate"
    | "test"
    | "submit"
    | "approve"
    | "publish"
  >;
  const actors: string[] = [];
  const ports: DevelopmentPublicationPorts = {
    current: vi.fn(async () => ({
      releaseId: "release-old",
      changeSet: source,
      graph,
      supportedTargets: ["neon"] as const,
    })),
    overlays: { intake: overlay },
    withCurrent: async (_r, _id, work) => work(),
    asWorkload: async (id, work) => {
      actors.push(id);
      return work({ service, authorize });
    },
    record: vi.fn(async () => {}),
  };
  return { ports, service, actors, authorize };
}

describe("DEVFULL authoring orchestration", () => {
  it("performs a real compile, separate authorization stages and dispatch using the provided service", async () => {
    const f = fixture();
    const result = await new DevelopmentPublicationWorkflow(
      policy,
      f.ports,
    ).run(request);
    expect(result.status).toBe("dispatched");
    expect(f.actors).toEqual(["author", "publisher"]);
    expect(f.authorize.mock.calls.map((c) => c[0])).toEqual([
      "metadata.entity.author",
      "metadata.entity.submit",
      "metadata.entity.review",
      "metadata.entity.publish",
    ]);
    expect(f.service.publish).toHaveBeenCalledWith(
      expect.objectContaining({ actorId: "publisher", targetPlanes: ["neon"], expectedSourceReleaseId: "release-old" }),
    );
    const saved = f.service.replaceGraph.mock.calls[0]![0].graph;
    expect(saved.fields[0]!.id).not.toBe(graph.fields[0]!.id);
    expect(graph.surfaces![0]!.layoutConfig).toBeUndefined();
  });
  it("plans with no mutation and skips unchanged graphs", async () => {
    const f = fixture();
    expect(
      (
        await new DevelopmentPublicationWorkflow(policy, f.ports).run(
          request,
          true,
        )
      ).status,
    ).toBe("planned");
    expect(f.service.createDraft).not.toHaveBeenCalled();
    f.ports.overlays = { intake: (g) => g };
    expect(
      (await new DevelopmentPublicationWorkflow(policy, f.ports).run(request))
        .status,
    ).toBe("unchanged");
    expect(f.service.createDraft).not.toHaveBeenCalled();
  });
  it.each([
    { environment: "qa" },
    { environment: "local" },
    { instance: "qa" },
    { preset: "devsimple" },
    { enabled: false },
  ])("rejects configuration %j", async (change) => {
    const f = fixture();
    await expect(
      new DevelopmentPublicationWorkflow({ ...policy, ...change }, f.ports).run(
        request,
      ),
    ).rejects.toThrow("DEVFULL_ONLY");
    expect(f.ports.current).not.toHaveBeenCalled();
  });
  it("does not turn a tenant release into a global product release", async () => {
    const f = fixture();
    await expect(
      new DevelopmentPublicationWorkflow(policy, f.ports).run({
        ...request,
        scope: { kind: "product" },
      }),
    ).rejects.toThrow("SCOPE_MISMATCH");
    expect(f.service.createDraft).not.toHaveBeenCalled();
  });
  it("stops when IAM refuses the publisher; never sets elevated assurance", async () => {
    const f = fixture();
    f.authorize
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(Error("machine permission absent"));
    await expect(
      new DevelopmentPublicationWorkflow(policy, f.ports).run(request),
    ).rejects.toThrow("machine permission absent");
    expect(f.service.publish).not.toHaveBeenCalled();
    expect(f.service.approve).not.toHaveBeenCalled();
  });
  it("refuses a graph changed between submission and review", async () => {
    const f = fixture(),
      original = f.ports.asWorkload;
    f.ports.asWorkload = async (id, work) => {
      if (id === "publisher")
        f.service.readGraph.mockImplementationOnce(async () => ({
          changeSet: { id: "draft", revision: 2 } as MetaEntityChangeSet,
          graph: { ...graph, entity: { entityCode: "other" } },
        }));
      return original(id, work);
    };
    await expect(
      new DevelopmentPublicationWorkflow(policy, f.ports).run(request),
    ).rejects.toThrow("REVIEW_CHANGED");
    expect(f.service.approve).not.toHaveBeenCalled();
  });
});
