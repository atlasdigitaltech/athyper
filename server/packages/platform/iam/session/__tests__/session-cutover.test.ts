import { describe, expect, it, vi } from "vitest";
import { SessionCutoverResolver, compareSessions } from "../session-cutover.js";

const base: any = {
  contractVersion: "2", evaluatorContractVersion: "2", plane: "neon",
  tenantOrAccountId: "11111111-1111-4111-8111-111111111111",
  principalId: "22222222-2222-4222-8222-222222222222",
  identityBindingId: "33333333-3333-4333-8333-333333333333",
  catalogVersion: "1", policyVersions: ["p1"], authorizationFingerprint: "x",
  decisions: [{ canonicalCode: "invoice.read", available: true, decision: "allow", reason: "grant", organizationalScope: { all: false, ids: ["le-1"] }, authorizationFingerprint: "y", evidence: [] }],
  resolvedAt: "2026-01-01T00:00:00Z", expiresAt: "2026-01-01T00:05:00Z",
};

describe("canonical session cutover", () => {
  it("classifies permission and scope ceiling mismatches", () => {
    expect(compareSessions(base, { ...base, decisions: [{ ...base.decisions[0], decision: "deny", organizationalScope: { all: true, ids: [] } }] })).toEqual(["permission", "scope"]);
  });

  it("keeps legacy authoritative in shadow and records parity", async () => {
    const records: any[] = [];
    const legacy = { resolve: vi.fn(async () => base) };
    const candidate = { resolve: vi.fn(async () => ({ ...base, resolvedAt: "later", expiresAt: "later" })) };
    const resolver = new SessionCutoverResolver(legacy, candidate, "shadow", { append: async (record) => void records.push(record) }, "r1");
    await expect(resolver.resolve({ tenantId: base.tenantOrAccountId, plane: "neon" })).resolves.toBe(base);
    expect(records[0]).toMatchObject({ status: "match", mismatchAreas: [] });
  });

  it("uses only the canonical candidate after enforcement", async () => {
    const candidate = { resolve: vi.fn(async () => base) };
    const resolver = new SessionCutoverResolver(undefined, candidate, "enforce");
    await resolver.resolve({ tenantId: base.tenantOrAccountId, plane: "neon" });
    expect(candidate.resolve).toHaveBeenCalledOnce();
  });
});
