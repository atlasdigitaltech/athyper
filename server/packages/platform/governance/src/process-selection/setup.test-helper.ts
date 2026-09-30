import { fixture } from "./fixture.test-helper.js";
import { vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import type {
  ProcessSelectionFacts,
  ProcessSelectionEvidence,
} from "@athyper/server-contract-governance";
import {
  createPolicyService,
  createJsonRuleEvaluator,
} from "@athyper/server-platform-policy";
import { createProcessSelectionService } from "./process-selection-service.js";
export function setup() {
  const publication = fixture();
  (publication.minimumControls[0] as any).minimumProfile = "simple";
  const context = {
    planeKey: publication.scope.planeKey,
    tenantId: publication.scope.tenantId,
    principalId: "00000000-0000-4000-8000-000000009999",
  } as VerifiedRequestContext;
  const facts: ProcessSelectionFacts = {
    scope: publication.scope,
    caseId: "00000000-0000-4000-8000-000000008888",
    snapshot: {
      id: "00000000-0000-4000-8000-000000008889",
      version: 1,
      hash: "f".repeat(64),
    },
    requestedRequirement: "basic",
    reason: "P1a qualification",
    minimumControls: structuredClone(publication.minimumControls),
    authorityAsOf: "2026-09-14T00:00:00.000Z",
  };
  const loadFacts = vi.fn(async () => facts),
    publications = vi.fn(async () => [publication]),
    append = vi.fn(async (e: ProcessSelectionEvidence) => e),
    isPublished = vi.fn(async () => true);
  const policy = createPolicyService({
    repository: {
      findActive: vi.fn(async () => {
        throw Error("active must never run");
      }),
      findExact: async () => publication.definition,
    },
    transactions: { run: async (_p, _a, work) => work({}) },
    audit: { record: vi.fn() },
  });
  const pinned = vi.fn<
    NonNullable<
      import("./process-selection-service.js").ProcessSelectionServicePorts<{}>["pinned"]
    >
  >(async () => undefined);
  const service = createProcessSelectionService({
    pinned,
    facts: loadFacts,
    publications,
    policy,
    compiler: () => ({ evaluator: createJsonRuleEvaluator(), isPublished }),
    evidence: { append, get: async () => undefined },
  });
  return {
    publication,
    pinned,
    context,
    facts,
    loadFacts,
    publications,
    append,
    isPublished,
    policy,
    service,
  };
}
