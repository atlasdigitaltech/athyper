import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  relay: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("@athyper/platform-bff-relay", () => ({
  buildRelayHandler: vi.fn(() => mocks.relay),
}));
vi.mock("@/lib/server/session", () => ({
  getNeonServerSession: vi.fn(async () => ({ userId: "user-1" })),
}));
vi.mock("@/lib/server/session-configuration-cache", () => ({
  buildSessionConfigurationIdentity: vi.fn(() => ({
    tenantId: "tenant-1",
    planeKey: "neon",
    realmKey: "athyper",
    principalId: "user-1",
  })),
  invalidateSessionConfiguration: mocks.invalidate,
}));

import { PATCH, POST } from "../route";

describe("saved-view session configuration invalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.relay.mockResolvedValue(new Response(null, { status: 204 }));
  });

  it("invalidates the entity from a successful saved-view create body", async () => {
    await POST(
      new Request("http://localhost/api/relay/platform/saved-views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entity_code: "journal_entry" }),
      }) as never,
      { params: Promise.resolve({ path: ["platform", "saved-views"] }) },
    );

    expect(mocks.invalidate).toHaveBeenCalledWith(expect.objectContaining({
      namespace: "saved_views",
      tenantId: "tenant-1",
      principalId: "user-1",
      keyParts: { entityCode: "journal_entry" },
      reason: "saved_view_mutation",
    }));
  });

  it("invalidates the entity encoded in a successful saved-view resource path", async () => {
    await PATCH(
      new Request("http://localhost/api/relay/platform/saved-views/journal-entry/view-1", {
        method: "PATCH",
      }) as never,
      { params: Promise.resolve({ path: ["platform", "saved-views", "journal-entry", "view-1"] }) },
    );

    expect(mocks.invalidate).toHaveBeenCalledWith(expect.objectContaining({
      keyParts: { entityCode: "journal_entry" },
    }));
  });

  it("does not invalidate when the upstream mutation fails", async () => {
    mocks.relay.mockResolvedValueOnce(new Response("failed", { status: 500 }));
    await PATCH(
      new Request("http://localhost/api/relay/platform/saved-views/journal_entry/view-1", {
        method: "PATCH",
      }) as never,
      { params: Promise.resolve({ path: ["platform", "saved-views", "journal_entry", "view-1"] }) },
    );

    expect(mocks.invalidate).not.toHaveBeenCalled();
  });
});
