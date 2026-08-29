import { describe, expect, it, vi } from "vitest";
import { authorizeRecordListRead } from "../record-read-access.js";

describe("record read authorization modes", () => {
  it("does not invent entity-operation coordinates for an explicit permission-only catalog", async () => {
    const authorize = vi.fn(async () => ({ allowed: true as const }));
    const context = { tenantId: "tenant-1" } as never;
    const descriptor = {
      entityCode: "metadata_entity",
      operations: {
        read: {
          code: "read",
          permissionCode: "studio.metadata.contract.view",
          authorizationMode: "permission_only",
        },
      },
    } as never;

    await expect(authorizeRecordListRead({ authorize } as never, context, descriptor)).resolves.toEqual({ allowed: true });
    expect(authorize).toHaveBeenCalledWith({
      context,
      permissionCode: "studio.metadata.contract.view",
      resource: { tenantId: "tenant-1" },
    });
  });
});
