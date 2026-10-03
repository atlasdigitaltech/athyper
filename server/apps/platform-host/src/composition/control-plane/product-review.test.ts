import { expect, it, vi } from "vitest";
import type { VerifiedRequestContext } from "@athyper/server-contract-auth";
import { createControlProductReview } from "./product-review.js";
const authority = {
  tenantId: "11111111-1111-4111-8111-111111111111",
  realmKey: "platform-control",
  issuer: "https://iam.dev.athyper.test/realms/platform-control",
  audience: "athyper-platform-control-api",
};
it.each([
  { realmKey: "athyper" },
  { tenantId: "44444444-4444-4444-8444-444444444444" },
  { planeKey: "neon" },
  { assurance: "standard" },
])(
  "rejects a mismatched control identity before accessing drafts: %j",
  async (patch) => {
    const transaction = vi.fn();
    const service = createControlProductReview({
      database: { transaction } as never,
      authority,
      audit: {} as never,
    });
    const context = {
      planeKey: "studio",
      realmKey: authority.realmKey,
      tenantId: authority.tenantId,
      assurance: "elevated",
      ...patch,
    } as VerifiedRequestContext;
    await expect(
      service.inspect(context, "10000000-0000-4000-8000-000000000001"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(transaction).not.toHaveBeenCalled();
  },
);
