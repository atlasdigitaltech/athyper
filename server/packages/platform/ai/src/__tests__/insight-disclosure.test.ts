import { describe, expect, it } from "vitest";
import {
  parseAtlasInsightResult,
  type AtlasDisclosureCandidate,
  type AtlasInsightOwnerProjection,
} from "@athyper/server-contract-ai";
import { projectAtlasInsight } from "../insight-disclosure.js";
import {
  atlasInsightReuseKey,
  mayReuseAtlasInsight,
} from "../insight-reuse-policy.js";
import { context } from "./review-fixture.js";

const candidate = <T>(
  value: T,
  claim = "read",
): AtlasDisclosureCandidate<T> => ({
  state: "evaluated_pass",
  claims: [claim],
  value,
});
const fixture = (): AtlasInsightOwnerProjection => ({
  evaluationMode: "user_scoped",
  scope: candidate({ entityCode: "business_partner", fingerprint: "scope" }),
  coverage: candidate(
    {
      target: "record",
      state: "complete",
      evaluatedCount: 1,
      authorizedTotalCount: 1,
    },
    "aggregate",
  ),
  evaluatedAt: "2026-09-08T00:00:00Z",
  freshness: "current",
  evidence: [
    candidate({
      id: "identity",
      entityCode: "business_partner",
      recordId: "bp-1",
      descriptorRevision: "d1",
      sourceRevision: "v1",
      sourceRevisionKind: "record_version",
      observedAt: "2026-09-08T00:00:00Z",
    }),
    candidate(
      {
        id: "HIDDEN-EVIDENCE",
        entityCode: "bank",
        recordId: "HIDDEN-RECORD",
        descriptorRevision: "d1",
        sourceRevision: "v1",
        sourceRevisionKind: "record_version",
        observedAt: "2026-09-08T00:00:00Z",
      },
      "secret",
    ),
  ],
  actions: [
    candidate({ id: "open", actionId: "bp.open", evidenceIds: ["identity"] }),
    candidate({
      id: "HIDDEN-ACTION",
      actionId: "bp.open",
      evidenceIds: ["HIDDEN-EVIDENCE"],
    }),
  ],
  findings: [
    candidate({
      id: "identity-finding",
      code: "identity",
      severity: "info",
      state: "evaluated_pass",
      facts: { name: "Acme" },
      ruleVersion: "r1",
      evidenceIds: ["identity"],
      actionIds: ["open"],
    }),
    candidate({
      id: "HIDDEN-FINDING",
      code: "bank-review",
      severity: "blocker",
      state: "evaluated_fail",
      facts: { reason: "HIDDEN-SENTINEL" },
      ruleVersion: "r1",
      evidenceIds: ["HIDDEN-EVIDENCE"],
      actionIds: [],
    }),
  ],
});
const policy = {
  authorize: async ({ claim }: { claim: string }) => claim === "read",
  actionRegistered: (id: string) => id === "bp.open",
};

describe("BP-AI-03 disclosure", () => {
  it("withholds protected evidence, dependent outcomes, actions and unapproved totals", async () => {
    const result = await projectAtlasInsight(context, fixture(), policy);
    expect(result.findings).toHaveLength(1);
    expect(result.coverage).toEqual({ target: "record", state: "unavailable" });
    expect(JSON.stringify(result)).not.toContain("HIDDEN");
    expect(result.actions.map((a) => a.id)).toEqual(["open"]);
  });
  it("never converts restricted evaluation into missing data, even if a claim is permitted", async () => {
    const owner = fixture();
    const result = await projectAtlasInsight(
      context,
      {
        ...owner,
        findings: owner.findings.map((f) => ({ ...f, state: "restricted" })),
      },
      policy,
    );
    expect(result.findings).toEqual([]);
  });
  it("rejects broader evaluation and denied scope", async () => {
    await expect(
      projectAtlasInsight(
        context,
        { ...fixture(), evaluationMode: "service" } as never,
        policy,
      ),
    ).rejects.toThrow("unavailable");
    await expect(
      projectAtlasInsight(context, fixture(), {
        ...policy,
        authorize: async () => false,
      }),
    ).rejects.toThrow("unavailable");
  });
  it("does not accept unregistered actions or dependent findings", async () => {
    const result = await projectAtlasInsight(context, fixture(), {
      ...policy,
      actionRegistered: () => false,
    });
    expect(result.actions).toEqual([]);
    expect(result.findings).toEqual([]);
  });
  it("rejects extra raw diagnostics, invented references, invalid totals and restricted wire states", async () => {
    const result = await projectAtlasInsight(context, fixture(), policy);
    for (const altered of [
      { ...result, rawOwnerReason: "HIDDEN" },
      {
        ...result,
        coverage: { target: "record", state: "complete", evaluatedCount: -1 },
      },
      {
        ...result,
        evidence: result.evidence.map((e) => ({
          ...e,
          url: "https://invented",
        })),
      },
      {
        ...result,
        findings: result.findings.map((f) => ({
          ...f,
          evidenceIds: ["invented"],
        })),
      },
      {
        ...result,
        findings: result.findings.map((f) => ({ ...f, state: "restricted" })),
      },
    ])
      expect(() => parseAtlasInsightResult(altered)).toThrow(
        "Invalid Atlas insight",
      );
  });
});

const binding = {
  canonicalScope: '{"record":"bp-1"}',
  descriptorVersions: ["d1"],
  ruleVersions: ["r1"],
  dataRevisions: ["bp:v1", "address:v3"],
  intent: "brief",
  locale: "en",
};
const now = new Date("2026-09-08T00:01:00Z");
const lineage = {
  schemaVersion: 1 as const,
  bindingKey: atlasInsightReuseKey(context, binding),
  claims: ["identity", "address"],
  createdAt: "2026-09-08T00:00:00Z",
  expiresAt: "2026-09-08T00:02:00Z",
};
it("reauthorizes every cache/history use and binds all authority/scope/source dimensions", async () => {
  const input = {
    context,
    binding,
    lineage,
    now,
    maxAgeMs: 120000,
    authorize: async () => true,
  };
  expect(await mayReuseAtlasInsight(input)).toBe(true);
  expect(
    await mayReuseAtlasInsight({
      ...input,
      authorize: async (_c, claim) => claim !== "address",
    }),
  ).toBe(false);
  expect(
    await mayReuseAtlasInsight({
      ...input,
      authorize: async () => {
        throw new Error("offline");
      },
    }),
  ).toBe(false);
  expect(await mayReuseAtlasInsight({ ...input, lineage: null })).toBe(false);
  expect(
    await mayReuseAtlasInsight({ ...input, now: new Date(lineage.expiresAt) }),
  ).toBe(false);
  for (const changed of [
    { tenantId: "another" },
    { principalId: "another" },
    { planeKey: "mesh" as const },
    { profileHash: "new" },
    { authEpoch: 2 },
  ])
    expect(
      await mayReuseAtlasInsight({
        ...input,
        context: { ...context, ...changed },
      }),
    ).toBe(false);
  for (const changed of [
    { canonicalScope: "different" },
    { descriptorVersions: ["d2"] },
    { ruleVersions: ["r2"] },
    { dataRevisions: ["bp:v1", "address:v4"] },
    { intent: "eligibility" },
    { locale: "ms" },
  ])
    expect(
      await mayReuseAtlasInsight({
        ...input,
        binding: { ...binding, ...changed },
      }),
    ).toBe(false);
});

it("does not retain a complete assessment or evaluated count after withholding findings", async () => {
  const owner = fixture();
  const result = await projectAtlasInsight(context, owner, {...policy, authorize: async ({claim}) => claim !== "secret"});
  expect(result.coverage.state).toBe("partial");
  expect(result.coverage.evaluatedCount).toBeUndefined();
  expect(JSON.stringify(result)).not.toContain("HIDDEN");
});
