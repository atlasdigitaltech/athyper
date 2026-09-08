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

it.each(["tenant", "organization", "company", "organization_company"])("admits published %s directory reads through base permission", async (mode) => {
  const authorize = vi.fn(async (input: { resource?: unknown }) => input.resource
    ? { allowed: false as const, reason: "scope_not_contained" }
    : { allowed: true as const });
  await expect(authorizeRecordListRead({ authorize } as never, { tenantId: "tenant" } as never, {
    entityCode: "partner", directoryScope: { schemaVersion: 1, mode },
    operations: { read: { permissionCode: "partner.read" } },
  } as never)).resolves.toEqual({ allowed: true });
  expect(authorize).toHaveBeenCalledTimes(2);
});

it.each(["denied_by_grant", "missing_permission", "scope_binding_missing"])("never retries %s for a directory record", async (reason) => {
  const authorize = vi.fn(async () => ({ allowed: false as const, reason }));
  await expect(authorizeRecordListRead({ authorize } as never, { tenantId: "tenant" } as never, {
    entityCode: "partner", directoryScope: { schemaVersion: 1, mode: "tenant" },
    operations: { read: { permissionCode: "partner.read" } },
  } as never, { recordId: "record" })).rejects.toThrow("not permitted");
  expect(authorize).toHaveBeenCalledTimes(1);
});

it("preserves base denials and legacy scope containment", async () => {
  const authorize = vi.fn(async (input: { resource?: unknown }) => ({ allowed: false as const, reason: input.resource ? "scope_not_contained" : "denied_by_grant" }));
  for (const directoryScope of [undefined, { schemaVersion: 1, mode: "tenant" }]) {
    await expect(authorizeRecordListRead({ authorize } as never, { tenantId: "tenant" } as never, {
      entityCode: "partner", directoryScope, operations: { read: { permissionCode: "partner.read" } },
    } as never)).rejects.toThrow("not permitted");
  }
  expect(authorize).toHaveBeenCalledTimes(3);
});
