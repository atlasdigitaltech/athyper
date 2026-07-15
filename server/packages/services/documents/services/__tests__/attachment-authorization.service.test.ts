import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ checkPermission: vi.fn() }));
vi.mock("@athyper/svc-iam", () => ({ checkPermission: mocks.checkPermission }));

import { authorizeAttachmentAccess } from "../attachment-authorization.service.js";

function chain(result: unknown, many = false) {
  const value: Record<string, unknown> = {};
  for (const key of ["select", "where", "innerJoin"]) value[key] = vi.fn(() => value);
  value.executeTakeFirst = vi.fn(async () => many ? undefined : result);
  value.execute = vi.fn(async () => many ? result : []);
  return value;
}

function dbWith(...responses: Array<{ value: unknown; many?: boolean }>) {
  const selectFrom = vi.fn();
  for (const response of responses) selectFrom.mockReturnValueOnce(chain(response.value, response.many));
  return { selectFrom };
}

describe("authorizeAttachmentAccess", () => {
  beforeEach(() => {
    mocks.checkPermission.mockReset();
    mocks.checkPermission.mockResolvedValue({ decision: "allow" });
  });

  it("denies when no matching entity operation token policy exists", async () => {
    const db = dbWith({ value: undefined });
    const result = await authorizeAttachmentAccess({
      db: db as never,
      context: {
        tenantId: "tenant-b-id",
        tenantCode: "tenant-b",
        realmKey: "athyper",
        principalId: "principal-1",
        subject: "subject-1",
      },
      entityCode: "purchase_invoice",
      entityId: "record-1",
      action: "read",
    });
    expect(result).toMatchObject({ allowed: false, error: "ENTITY_OPERATION_REQUIRED" });
    expect(mocks.checkPermission).not.toHaveBeenCalled();
  });

  it("allows context principal reuse without DB lookup", async () => {
    const db = dbWith({ value: [{ permission_code: "read", is_enabled: true, tenant_id: null }], many: true });
    const result = await authorizeAttachmentAccess({
      db: db as never,
      context: {
        tenantId: "tenant-a-id",
        tenantCode: "tenant-a",
        realmKey: "athyper",
        principalId: "principal-1",
        subject: "subject-1",
      },
      entityCode: "purchase_invoice", entityId: "record-1", action: "read_attachment",
    });
    expect(result).toMatchObject({ allowed: true, principalId: "principal-1" });
    expect(mocks.checkPermission).toHaveBeenCalledTimes(2);
  });

  it("requires both the parent entity operation and attachment permission", async () => {
    const db = dbWith(
      { value: { id: "tenant-a-id", code: "tenant-a" } },
      { value: { principal_id: "principal-1" } },
      { value: [{ permission_code: "update", is_enabled: true, tenant_id: null }], many: true },
    );
    const result = await authorizeAttachmentAccess({
      db: db as never,
      context: {
        tenantId: "tenant-a-id",
        tenantCode: "tenant-a",
        realmKey: "athyper",
        principalId: "principal-1",
        subject: "subject-1",
      },
      entityCode: "purchase_invoice", entityId: "record-1", action: "create_attachment",
    });
    expect(result).toMatchObject({ allowed: true, tenantId: "tenant-a-id", principalId: "principal-1" });
    expect(mocks.checkPermission).toHaveBeenNthCalledWith(1, db, "tenant-a-id", "principal-1", "update", expect.any(Object));
    expect(mocks.checkPermission).toHaveBeenNthCalledWith(2, db, "tenant-a-id", "principal-1", "attachment.create", expect.any(Object));
  });

  it("denies when either permission check is not allowed", async () => {
    mocks.checkPermission.mockResolvedValueOnce({ decision: "allow" }).mockResolvedValueOnce({ decision: "deny" });
    const db = dbWith(
      { value: [{ permission_code: "read", is_enabled: true, tenant_id: null }], many: true },
    );
    const result = await authorizeAttachmentAccess({
      db: db as never,
      context: {
        tenantId: "tenant-a-id",
        tenantCode: "tenant-a",
        realmKey: "athyper",
        principalId: "principal-1",
        subject: "subject-1",
      },
      entityCode: "purchase_invoice", entityId: "record-1", action: "read_attachment",
    });
    expect(result).toMatchObject({ allowed: false, error: "PERMISSION_DENIED" });
  });
});
