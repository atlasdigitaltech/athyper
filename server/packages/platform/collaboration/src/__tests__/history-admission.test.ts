import { it, expect, vi } from "vitest";
import {
  createCollaborationService,
  createInMemoryCollaborationPersistence,
} from "../index.js";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
const context = {
  planeKey: "neon",
  tenantId: "11111111-1111-4111-8111-111111111111",
  principalId: "22222222-2222-4222-8222-222222222222",
} as VerifiedRequestContext;
const commentId = "33333333-3333-4333-8333-333333333333";
function fixture(denied = false) {
  const persistence = createInMemoryCollaborationPersistence();
  const history = vi.fn(async () => ({ items: [] }));
  const authorizeCapability = vi.fn(async () => {
    if (denied) throw new Error("denied");
    return {};
  });
  const service = createCollaborationService({
    repository: { ...persistence.repository, history },
    transactions: persistence.transactions,
    authorizer: { authorize: async () => ({ allowed: true }) },
    principals: { resolveActivePrincipals: async (_c, ids) => ids },
    outbox: { append: async () => {} },
    audit: { record: vi.fn() },
    authorizeCapability,
  });
  return { service, history, authorizeCapability };
}
it("denies history before persistence is touched", async () => {
  const f = fixture(true);
  await expect(f.service.history!({ context, commentId })).rejects.toThrow(
    "denied",
  );
  expect(f.history).not.toHaveBeenCalled();
});
it("bounds history pages and forwards the revision cursor after admission", async () => {
  const f = fixture();
  await f.service.history!({
    context,
    commentId,
    limit: 10000,
    beforeRevision: 7,
  });
  expect(f.authorizeCapability).toHaveBeenCalledWith(
    "history",
    expect.anything(),
    expect.anything(),
  );
  expect(f.history).toHaveBeenCalledWith(
    expect.objectContaining({ limit: 50, beforeRevision: 7 }),
    expect.anything(),
  );
});
it("rejects malformed revision cursors before admission", async () => {
  const f = fixture();
  await expect(
    f.service.history!({ context, commentId, beforeRevision: -1 }),
  ).rejects.toMatchObject({ code: "INVALID_HISTORY_QUERY" });
  expect(f.authorizeCapability).not.toHaveBeenCalled();
});
