import { expect, it, vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { assertLocalRecordSource } from "@athyper/server-service-records";
import {
  createVerifiedProfileSourceResolver,
  type VerifiedProfileSourceSnapshot,
} from "./verified-profile-source.js";

const request = {
  context: {
    tenantId: "tenant",
    principalId: "admin",
  } as VerifiedRequestContext,
  ownerPrincipalId: "user",
};
const source = {
  plane: "neon" as const,
  tenantId: "workforce-tenant",
  entityCode: "person",
  recordId: "person",
  verified: true,
};
const local: VerifiedProfileSourceSnapshot = {
  tenantId: "tenant",
  principalId: "user",
  revision: "7",
  complete: true,
  fenced: true,
  state: "confirmed_unlinked",
  sources: [],
};

it("admits only positively confirmed unlinked ownership and preserves the caller's transaction", async () => {
  const transaction = {};
  const lockAndRead = vi.fn(async () => local);
  const resolver = createVerifiedProfileSourceResolver({ lockAndRead });
  await expect(
    assertLocalRecordSource(resolver, request, transaction),
  ).resolves.toBeUndefined();
  expect(lockAndRead).toHaveBeenCalledWith(request, transaction);
});

it.each([
  { complete: false },
  { fenced: false },
  { principalId: "admin" },
  { tenantId: "other" },
  { revision: " " },
  { state: "unresolved" },
  { sources: [source] },
  { state: "linked", sources: [] },
  { state: "linked", sources: [{ ...source, verified: false }] },
  { state: "linked", sources: [source, { ...source, recordId: "other" }] },
])(
  "fails closed for incomplete, ambiguous or mismatched proof %j",
  async (override) => {
    const resolver = createVerifiedProfileSourceResolver({
      lockAndRead: async () =>
        ({ ...local, ...override }) as VerifiedProfileSourceSnapshot,
    });
    expect((await resolver(request, {})).state).toBe("unavailable");
    await expect(
      assertLocalRecordSource(resolver, request, {}),
    ).rejects.toThrow("unavailable");
  },
);

it("blocks local writes for internal and external roles sharing one authoritative Person", async () => {
  const resolver = createVerifiedProfileSourceResolver({
    lockAndRead: async () => ({
      ...local,
      state: "linked",
      sources: [source, source],
    }),
  });
  expect(await resolver(request, {})).toEqual({
    tenantId: "tenant",
    principalId: "user",
    revision: "7",
    state: "linked",
    source: { plane: source.plane, tenantId: source.tenantId, entityCode: source.entityCode, recordId: source.recordId },
  });
  await expect(assertLocalRecordSource(resolver, request, {})).rejects.toThrow(
    "authoritative source",
  );
});

it("propagates authority outages instead of falling back to local profile editing", async () => {
  const resolver = createVerifiedProfileSourceResolver({
    lockAndRead: async () => {
      throw Error("AUTHORITY_OFFLINE");
    },
  });
  await expect(resolver(request, {})).rejects.toThrow("AUTHORITY_OFFLINE");
});
