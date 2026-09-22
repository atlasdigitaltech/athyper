import { describe, it, expect, vi } from "vitest";
import { createRecordParticipantResolver } from "./record-participants.js";
import type { EntityCapabilityRequest } from "./entity-capability-policy.js";
const input = {
  context: { principalId: "self", tenantId: "tenant", planeKey: "neon" },
  entityCode: "business_partner",
  recordId: "record",
  kind: "comments",
  action: "mention",
  input: { visibility: "public" },
} as EntityCapabilityRequest;
describe("record participant admission", () => {
  it("filters denied candidates and rechecks revoked recipients on submission", async () => {
    let revoked = false;
    const admit = vi.fn(
      async (_: unknown, id: string) => id !== "denied" && !revoked,
    );
    const resolver = createRecordParticipantResolver({
      candidates: async () => [
        { id: "member", displayName: "Member" },
        { id: "denied", displayName: "Denied" },
      ],
      admit,
    });
    expect(await resolver.search(input, "m")).toEqual([
      { id: "member", displayName: "Member" },
    ]);
    revoked = true;
    expect(await resolver.validate(input, ["member"])).toBe(false);
  });
  it("limits private audiences to self even if another candidate can read the record", async () => {
    const resolver = createRecordParticipantResolver({
      candidates: async () => [
        { id: "self", displayName: "Self" },
        { id: "other", displayName: "Other" },
      ],
      admit: async () => true,
    });
    const privateInput = { ...input, input: { visibility: "private" } };
    expect(await resolver.search(privateInput, "")).toEqual([
      { id: "self", displayName: "Self" },
    ]);
    expect(await resolver.validate(privateInput, ["other"])).toBe(false);
  });
  it("bounds search and rejects oversized recipient lists", async () => {
    const candidates = vi.fn(async () =>
      Array.from({ length: 50 }, (_, i) => ({
        id: String(i),
        displayName: String(i),
      })),
    );
    const resolver = createRecordParticipantResolver({
      candidates,
      admit: async () => true,
    });
    expect(await resolver.search(input, "q")).toHaveLength(20);
    expect(candidates).toHaveBeenCalledWith(input, "q", 50);
    expect(await resolver.validate(input, Array(21).fill("x"))).toBe(false);
  });
});
