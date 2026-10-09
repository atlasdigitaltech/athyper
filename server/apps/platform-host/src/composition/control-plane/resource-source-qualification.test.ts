import { expect, it, vi, beforeEach } from "vitest";
import type { Kysely } from "kysely";
import {
  canonicalBytes,
  sha256,
} from "@athyper/server-adapter-publication-signing";
import { validateHistoricalFieldIdentityPlan } from "@athyper/server-plane-studio-meta-entity-authoring";
import type { MetaEntityGraph } from "@athyper/server-contract-meta-entity-authoring";
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("kysely", () => ({ sql: () => ({ execute: query }) }));
import { createResourceSourceQualification } from "./resource-source-qualification.js";
const graph = {
  contractSchema: "athyper.meta-entity-contract/2.2",
  entity: { entityCode: "fixture" },
  fields: [
    {
      id: "00000000-0000-4000-8000-000000000001",
      fieldKey: "code",
      dataType: "string",
      typeConfig: { kind: "string" },
    },
  ],
  operations: [],
  surfaces: [],
} as MetaEntityGraph;
const hash = sha256(canonicalBytes(graph));
const descriptor = { contract: "fixture" },
  descriptorHash = sha256(canonicalBytes(descriptor));
const base = {
  releaseId: "00000000-0000-4000-8000-000000000002",
  releaseNo: 1,
  publicationKey: "fixture.resource",
  generatedAt: "2026-10-08T00:00:00Z",
};
const tx = {} as Kysely<Record<string, never>>;
beforeEach(() => vi.resetAllMocks());
it("checks descriptor content against the host pin", async () => {
  const qualify = createResourceSourceQualification(descriptorHash, {
    canonicalBytes,
    sha256,
  });
  const source = {
    ...base,
    kind: "entity_authoring_descriptor" as const,
    payload: {
      schema: "entity.installed-authoring-descriptor/1",
      schemaVersion: 1,
      descriptorHash,
      descriptor,
    },
  };
  await qualify(tx, source);
  await expect(
    qualify(tx, {
      ...source,
      payload: { ...source.payload, descriptor: { changed: true } },
    }),
  ).rejects.toThrow("DESCRIPTOR_CHANGED");
});
it("qualifies exact current saved source and complete historical plan, rejecting stale snapshots", async () => {
  const plan = validateHistoricalFieldIdentityPlan(graph, [], {
    currentSourceHash: hash,
    releases: [],
  });
  const source = {
    ...base,
    kind: "entity_identity_review" as const,
    payload: {
      schema: "entity.historical-identity-review/1",
      reference: "fixture",
      entityId: base.releaseId,
      changeSetId: base.releaseId,
      tenantId: null,
      sourceHash: hash,
      authoringSchemaHash: descriptorHash,
      reviewedPlanHash: plan.planHash,
      proposerId: "00000000-0000-4000-8000-000000000003",
      reviewerId: "00000000-0000-4000-8000-000000000004",
      releases: [],
    },
  };
  const qualify = createResourceSourceQualification(descriptorHash, {
    canonicalBytes,
    sha256,
  });
  query
    .mockResolvedValueOnce({ rows: [{ graph, graphHash: hash }] })
    .mockResolvedValueOnce({ rows: [] });
  await qualify(tx, source);
  query.mockResolvedValueOnce({ rows: [{ graph, graphHash: "0".repeat(64) }] });
  await expect(qualify(tx, source)).rejects.toThrow("SOURCE_CHANGED");
});

it("does not reuse descriptor/identity authority to qualify live-read resources", async () => {
  const qualify = createResourceSourceQualification(descriptorHash, {
    canonicalBytes,
    sha256,
  });
  const content = {
    schema: "entity.effective-security-manifest/1",
    entityCode: "fixture",
    plane: "studio",
    source: {
      entityId: base.releaseId,
      releaseId: base.releaseId,
      contractHash: hash,
      tenantId: null,
    },
    scope: { contract: "tenant.record.v1", tenantId: base.releaseId },
    operations: [],
    fields: [],
    unsupportedControls: [],
  };
  await expect(
    qualify(tx, {
      ...base,
      kind: "entity_security_manifest",
      payload: {
        schema: "entity.installed-live-read-resource/1",
        pin: {
          owner: "platform",
          namespace: "entity",
          key: "security",
          version: 1,
          hash: sha256(canonicalBytes(content)),
        },
        content,
      },
    }),
  ).rejects.toThrow("RESOURCE_LIVE_READ_QUALIFICATION_REQUIRED");
  expect(query).not.toHaveBeenCalled();
});

it("routes component sources through the configured deployment qualifier and propagates rejection", async () => {
  const payload = {
    schema: "entity.ui-component-resource/1",
    declaration: { tenantId: null, supportedPlanes: ["studio"] },
    implementation: {
      packageName: "fixture",
      exportName: "Text",
      runtimeKey: "text",
      sourceHash: "a".repeat(64),
    },
  };
  const source = { ...base, kind: "entity_ui_component" as const, payload };
  const component = vi.fn(async () => {});
  const qualify = createResourceSourceQualification(
    descriptorHash,
    { canonicalBytes, sha256 },
    component,
  );
  await qualify(tx, source);
  expect(component).toHaveBeenCalledWith(payload);
  component.mockRejectedValueOnce(Error("COMPONENT_DEPLOYMENT_FILE_CHANGED"));
  await expect(qualify(tx, source)).rejects.toThrow(
    "COMPONENT_DEPLOYMENT_FILE_CHANGED",
  );
  expect(query).not.toHaveBeenCalled();
});

it("qualifies native resources against independently loaded source, rejecting altered policy and pins", async () => {
  const { nativeReleaseFixture } =
    await import("../../../../../packages/planes/studio/meta-entity-authoring/src/native-release-compilation.fixtures.js");
  const { compileNativeLiveReadResources } =
    await import("@athyper/server-plane-studio-meta-entity-authoring");
  const f = nativeReleaseFixture();
  const inputs: Parameters<typeof compileNativeLiveReadResources>[0] = {
    graph: f.graph,
    compiler: f.c,
    controls: f.controls,
    releaseId: base.releaseId,
    tenantId: base.releaseId,
    provider: { ...f.c.listProviders[0]!.provider, namespace: "records" },
    securityCoordinate: {
      owner: "platform",
      namespace: "entity",
      key: "fixture.security",
      version: 1,
    },
    storageCoordinate: {
      owner: "platform",
      namespace: "entity",
      key: "fixture.storage",
      version: 1,
    },
    permissions: [],
  };
  const candidates = compileNativeLiveReadResources(inputs);
  const read = vi.fn(async () => structuredClone(inputs));
  const qualify = createResourceSourceQualification(
    f.c.authoringSchemaHash,
    { canonicalBytes, sha256 },
    undefined,
    read,
  );
  const source = {
    ...base,
    kind: "entity_security_manifest" as const,
    payload: candidates.security,
  };
  await qualify(tx, source);
  await qualify(tx, {
    ...base,
    kind: "entity_storage_authority",
    payload: candidates.storage,
  });
  expect(read).toHaveBeenCalledWith(tx, source);
  const altered = structuredClone(source);
  Reflect.set(altered.payload.content.fields[0]!, "queryUses", []);
  Reflect.set(
    altered.payload.pin,
    "hash",
    sha256(canonicalBytes(altered.payload.content)),
  );
  await expect(qualify(tx, altered)).rejects.toThrow(
    "RESOURCE_LIVE_READ_SOURCE_CHANGED",
  );
  const changedPin = structuredClone(source);
  Reflect.set(changedPin.payload.pin, "version", 2);
  await expect(qualify(tx, changedPin)).rejects.toThrow(
    "RESOURCE_LIVE_READ_SOURCE_CHANGED",
  );
  read.mockRejectedValueOnce(Error("EXACT_SAVED_SOURCE_UNAVAILABLE"));
  await expect(qualify(tx, source)).rejects.toThrow(
    "EXACT_SAVED_SOURCE_UNAVAILABLE",
  );
});
