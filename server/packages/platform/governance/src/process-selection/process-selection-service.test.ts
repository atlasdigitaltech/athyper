import { describe, it, expect, vi } from "vitest";
import type { ProcessAttemptCoordinate } from "@athyper/server-contract-governance";
import { setup } from "./setup.test-helper.js";
describe("scoped process selection", () => {
  for (const [level, profile] of [
    ["basic", "simple"],
    ["standard", "standard"],
    ["enhanced", "enhanced"],
  ] as const)
    it(`maps ${level} to ${profile} using one authored first-match definition`, async () => {
      const s = setup();
      (s.facts as any).requestedRequirement = level;
      const result = await s.service.preview(s.context, s.facts.caseId, {});
      expect(result.status).toBe("ready");
      if (result.status !== "ready") return;
      expect(result.selection.candidateProfile.code).toBe(profile);
      expect(result.selection.effectiveProfile.code).toBe(profile);
      expect(result.selection.trace.map((t) => t.result)).toEqual(
        level === "enhanced"
          ? ["matched", "not_evaluated", "not_evaluated"]
          : level === "standard"
            ? ["false", "matched", "not_evaluated"]
            : ["false", "false", "matched"],
      );
      expect(s.append).not.toHaveBeenCalled();
    });
  for (const floor of ["standard", "enhanced"] as const)
    it(`raises Basic to trusted ${floor} minimum`, async () => {
      const s = setup();
      (s.facts.minimumControls[0] as any).minimumProfile = floor;
      (s.facts.minimumControls[0]!.authority as any).version = 2;
      const result = await s.service.preview(s.context, s.facts.caseId, {});
      expect(result).toMatchObject({
        status: "ready",
        selection: {
          candidateProfile: { code: "simple" },
          effectiveProfile: { code: floor },
        },
      });
    });
  for (const scenario of [
    "missing",
    "ambiguous",
    "scope",
    "authority",
    "catalog",
    "gates",
    "none",
    "unexpected_action",
    "unsafe_config",
  ] as const)
    it(`fails closed for ${scenario}`, async () => {
      const s = setup();
      if (scenario === "missing")
        (s.facts as any).requestedRequirement = undefined;
      if (scenario === "ambiguous")
        s.publications.mockResolvedValue([s.publication, s.publication]);
      if (scenario === "scope")
        (s.facts as any).scope = { ...s.facts.scope, tenantId: "different" };
      if (scenario === "authority") (s.facts as any).minimumControls = [];
      if (scenario === "catalog") s.isPublished.mockResolvedValue(false);
      if (scenario === "gates")
        (s.facts.minimumControls[0] as any).mandatoryGateCodes = [
          "unavailable.gate",
        ];
      if (["none", "unexpected_action", "unsafe_config"].includes(scenario)) {
        const exact = s.policy.evaluateExact.bind(s.policy);
        vi.spyOn(s.policy, "evaluateExact").mockImplementation(
          async (...args) => {
            const r = await exact(...args);
            return {
              ...r,
              decision:
                scenario === "none"
                  ? {
                      ...r.decision,
                      action: "none",
                      winning: undefined,
                      outcomes: [],
                    }
                  : {
                      ...r.decision,
                      winning: {
                        ...r.decision.winning!,
                        ...(scenario === "unexpected_action"
                          ? { action: "allow" as const }
                          : { actionConfig: { profile: "simple" } }),
                      },
                    },
            };
          },
        );
      }
      const result = await s.service.preview(s.context, s.facts.caseId, {});
      expect(result.status).toBe(
        scenario === "missing" ? "incomplete" : "unavailable",
      );
      expect(s.append).not.toHaveBeenCalled();
    });
  it("does not turn authorization denial into a configuration preview", async () => {
    const s = setup();
    s.loadFacts.mockRejectedValue(Error("FORBIDDEN"));
    await expect(
      s.service.preview(s.context, s.facts.caseId, {}),
    ).rejects.toThrow("FORBIDDEN");
  });
  it("pins the full trace and manifest in the supplied acceptance transaction", async () => {
    const s = setup(),
      preview = await s.service.preview(s.context, s.facts.caseId, {});
    if (preview.status !== "ready") throw Error(preview.code);
    const c: ProcessAttemptCoordinate = {
      scope: s.facts.scope,
      caseId: s.facts.caseId,
      submissionSnapshot: s.facts.snapshot,
      manifest: preview.selection.executionManifest.revision,
      selectionId: "00000000-0000-4000-8000-000000007771",
      cycleRunId: "00000000-0000-4000-8000-000000007772",
      attemptId: "00000000-0000-4000-8000-000000007773",
      attemptNumber: 1,
    };
    const tx = { transaction: "owned by P2" };
    const result = await s.service.select(
      s.context,
      s.facts.caseId,
      c,
      "p1a-test-key",
      tx,
    );
    expect(s.append).toHaveBeenCalledWith(result, tx);
    expect(result.coordinate).toEqual(c);
    expect(result.factHash).toMatch(/^[a-f0-9]{64}$/);
    await expect(
      s.service.select(
        s.context,
        s.facts.caseId,
        { ...c, submissionSnapshot: { ...c.submissionSnapshot, version: 2 } },
        "p1a-test-key",
        tx,
      ),
    ).rejects.toThrow("COORDINATE_MISMATCH");
  });
});

it("ignores supplier classification as a route fact, including internal Intercompany + Enhanced", async () => {
  const s = setup();
  Object.assign(s.facts, {
    requestedRequirement: "enhanced",
    supplierType: "intercompany",
    ownershipClass: "internal",
  });
  expect(await s.service.preview(s.context, s.facts.caseId, {})).toMatchObject({
    status: "ready",
    selection: { effectiveProfile: { code: "enhanced" } },
  });
});
it("never persists selection for a missing result and propagates evidence storage failure", async () => {
  const s = setup(),
    p = await s.service.preview(s.context, s.facts.caseId, {});
  if (p.status !== "ready") throw Error(p.code);
  const c: ProcessAttemptCoordinate = {
    scope: s.facts.scope,
    caseId: s.facts.caseId,
    submissionSnapshot: s.facts.snapshot,
    manifest: p.selection.executionManifest.revision,
    selectionId: "00000000-0000-4000-8000-000000007771",
    cycleRunId: "00000000-0000-4000-8000-000000007772",
    attemptId: "00000000-0000-4000-8000-000000007773",
    attemptNumber: 1,
  };
  s.append.mockRejectedValueOnce(Error("STORAGE_UNAVAILABLE"));
  await expect(
    s.service.select(s.context, s.facts.caseId, c, "p1a-test-key", {}),
  ).rejects.toThrow("STORAGE_UNAVAILABLE");
  s.append.mockClear();
  const exact = s.policy.evaluateExact.bind(s.policy);
  vi.spyOn(s.policy, "evaluateExact").mockImplementation(async (...args) => {
    const r = await exact(...args);
    return {
      ...r,
      decision: {
        ...r.decision,
        action: "none",
        outcomes: [],
        winning: undefined,
      },
    };
  });
  await expect(
    s.service.select(s.context, s.facts.caseId, c, "p1a-test-key", {}),
  ).rejects.toThrow("RESULT_MISSING");
  expect(s.append).not.toHaveBeenCalled();
});

describe("same-profile correction selection", () => {
  for (const level of ["basic", "standard", "enhanced"] as const)
    it(`retains exact ${level} pins despite changed publication head`, async () => {
      const s = setup();
      (s.facts as any).requestedRequirement = level;
      const first = await s.service.preview(s.context, s.facts.caseId, {});
      if (first.status !== "ready") throw Error(first.code);
      s.pinned.mockResolvedValue({
        publication: structuredClone(s.publication),
        evidence: { ...first.selection } as any,
      });
      s.publications.mockRejectedValue(
        Error("mutable head must not be consulted"),
      );
      const exact = vi.spyOn(s.policy, "evaluateExact");
      expect(await s.service.preview(s.context, s.facts.caseId, {})).toEqual(
        first,
      );
      expect(exact.mock.calls[0]?.[0].revision).toEqual(first.selection.policy);
    });
  for (const [before, after] of [
    ["basic", "enhanced"],
    ["enhanced", "basic"],
  ] as const)
    it(`rejects ${before} to ${after} without accepting evidence`, async () => {
      const s = setup();
      (s.facts as any).requestedRequirement = before;
      const first = await s.service.preview(s.context, s.facts.caseId, {});
      if (first.status !== "ready") throw Error(first.code);
      s.pinned.mockResolvedValue({
        publication: structuredClone(s.publication),
        evidence: { ...first.selection } as any,
      });
      (s.facts as any).requestedRequirement = after;
      expect(await s.service.preview(s.context, s.facts.caseId, {})).toEqual({
        status: "unavailable",
        code: "PROCESS_CORRECTION_PROFILE_CHANGE_UNSUPPORTED",
      });
      expect(s.append).not.toHaveBeenCalled();
    });
  it("accepts a changed assertion when current controls retain the same effective profile", async () => {
    const s = setup();
    (s.facts as any).requestedRequirement = "enhanced";
    const first = await s.service.preview(s.context, s.facts.caseId, {});
    if (first.status !== "ready") throw Error(first.code);
    s.pinned.mockResolvedValue({
      publication: structuredClone(s.publication),
      evidence: { ...first.selection } as any,
    });
    (s.facts as any).requestedRequirement = "basic";
    (s.facts.minimumControls[0] as any).minimumProfile = "enhanced";
    (s.facts.minimumControls[0]!.authority as any).version = 2;
    expect(
      await s.service.preview(s.context, s.facts.caseId, {}),
    ).toMatchObject({
      status: "ready",
      selection: {
        requestedRequirement: "basic",
        candidateProfile: { code: "simple" },
        effectiveProfile: { code: "enhanced" },
      },
    });
  });
});

it("retains original policy eligibility date while refreshing control facts on correction", async () => {
  const s = setup();
  const initial = await s.service.preview(s.context, s.facts.caseId, {});
  if (initial.status !== "ready") throw Error(initial.code);
  s.pinned.mockResolvedValue({
    publication: structuredClone(s.publication),
    evidence: { ...initial.selection } as any,
  });
  (s.facts as any).authorityAsOf = "2027-01-01T00:00:00.000Z";
  const exact = vi.spyOn(s.policy, "evaluateExact");
  const result = await s.service.preview(s.context, s.facts.caseId, {});
  expect(result).toMatchObject({
    status: "ready",
    selection: {
      policyEffectiveOn: "2026-09-14",
      authorityAsOf: "2027-01-01T00:00:00.000Z",
    },
  });
  expect(exact.mock.calls[0]?.[0].effectiveOn).toBe("2026-09-14");
  expect(exact.mock.calls[0]?.[0].facts).toMatchObject({
    source: { authorityAsOf: "2027-01-01T00:00:00.000Z" },
  });
});
