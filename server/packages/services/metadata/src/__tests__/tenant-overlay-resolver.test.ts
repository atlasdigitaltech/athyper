import { describe, expect, it } from "vitest";

import {
  TenantOverlayValidationError,
  resolveTenantOverlay,
} from "../tenant-overlay-resolver.js";

const fields = [
  { name: "id", column_name: "id" },
  { name: "tenant_id", column_name: "tenant_id" },
  { name: "name", column_name: "name" },
] as any;

function queryFor(
  overlays: Array<Record<string, unknown>>,
  changes: Array<Record<string, unknown>>,
) {
  let call = 0;
  return {
    async query<T extends object>() {
      call += 1;
      return { rows: (call === 1 ? overlays : changes) as T[] };
    },
  };
}

const input = {
  tenantId: "00000000-0000-0000-0000-000000000001",
  entityId: "00000000-0000-0000-0000-000000000002",
  entityCode: "purchase_order",
  entityVersionId: "00000000-0000-0000-0000-000000000003",
  baseCompiledHash: "a".repeat(64),
  fields,
};

describe("tenant overlay resolver", () => {
  it("resolves deterministic presentation, execution, and policy deltas", async () => {
    const result = await resolveTenantOverlay(queryFor(
      [{ id: "overlay-b", priority: 200, version: 1 }, { id: "overlay-a", priority: 100, version: 1 }],
      [
        { overlay_id: "overlay-a", change_order: 1, kind: "modify_field", path: "field.name", value: { label: "Supplier name", searchable: false } },
        { overlay_id: "overlay-b", change_order: 1, kind: "tweak_policy", path: "policy", value: { companyScopeMode: "restricted" } },
      ],
    ), input);

    expect(result?.overlaySet).toEqual(["overlay-b", "overlay-a"]);
    expect(result?.executionOverlay.fieldOverrides?.name?.searchable).toBe(false);
    expect(result?.executionOverlay.policy?.companyScopeMode).toBe("restricted");
    expect(result?.catalogFieldOverrides.name?.label).toBe("Supplier name");
    expect(result?.overlayHash).toHaveLength(64);
  });

  it("rejects structural and principal-specific tenant changes", async () => {
    await expect(resolveTenantOverlay(queryFor(
      [{ id: "overlay-a", priority: 100, version: 1 }],
      [
        { overlay_id: "overlay-a", change_order: 1, kind: "remove_field", path: "field.name", value: null },
        { overlay_id: "overlay-a", change_order: 2, kind: "tweak_policy", path: "policy", value: { dataPolicy: { principalId: "user-1" } } },
      ],
    ), input)).rejects.toBeInstanceOf(TenantOverlayValidationError);
  });

  it("only accepts default sort fields from the base contract", async () => {
    const result = await resolveTenantOverlay(queryFor(
      [{ id: "overlay-a", priority: 100, version: 1 }],
      [{ overlay_id: "overlay-a", change_order: 1, kind: "modify_field", path: "display.default_sort", value: { field: "name", direction: "asc" } }],
    ), input);

    expect(result?.executionOverlay.defaultSort).toEqual([{ field: "name", direction: "asc", nulls: "last" }]);
  });
});
