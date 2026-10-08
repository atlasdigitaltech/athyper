import { expect, it, vi, beforeEach } from "vitest";
import type { Kysely } from "kysely";
import {
  canonicalBytes,
  sha256,
} from "@athyper/server-adapter-publication-signing";
import { validateLegacyFieldIdentityPlan } from "@athyper/server-plane-studio-meta-entity-authoring";
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
  const plan = validateLegacyFieldIdentityPlan(graph, [], {
    currentSourceHash: hash,
    releases: [],
  });
  const source = {
    ...base,
    kind: "entity_identity_review" as const,
    payload: {
      schema: "entity.legacy-identity-review/1",
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
