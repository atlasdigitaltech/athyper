import { expect, it } from "vitest";
import type { NativeOperationRow } from "@athyper/server-contract-meta-entity-authoring";
import { planNativeOperationBranch, changed } from "./graph-reconciliation.js";
import { nativeOperationToStorage } from "./native-operation-storage.js";
const id = "00000000-0000-4000-8000-000000000001";
function row(): NativeOperationRow {
  return {
    id,
    operationKey: "read",
    operationKind: "read",
    labelId: id,
    description: null,
    auditEventCode: "fixture.read",
    executionMode: "synchronous",
    idempotencyMode: "none",
    inputSurfaceId: null,
    resultSurfaceId: null,
    authorizationTarget: "existing",
    authorizationEffect: "read",
    requiresParentRead: false,
    requiresPreflight: false,
    replacementOperationId: null,
    handlerKey: "registered.read",
    handlerVersion: 1,
    preflightKey: null,
    preflightVersion: null,
    extensionFieldMode: "none",
    exportFormats: null,
    exportMaxRecords: null,
  };
}
it("preserves existing operation identities, creation attribution and unmapped SQL controls", () => {
  const op = row(),
    stored = {
      ...nativeOperationToStorage(op),
      created_at: "2026-10-07T00:00:00.123456Z",
      created_by: id,
      protected_control: true,
    };
  expect(changed(planNativeOperationBranch([op], [stored]))).toBe(false);
  const plan = planNativeOperationBranch(
    [{ ...op, description: "Edited" }],
    [stored],
  );
  expect(plan.insert).toEqual([]);
  expect(plan.update).toEqual([
    { id, before: stored, values: { description: "Edited" } },
  ]);
  expect(plan.remove).toEqual([]);
  expect(plan.update[0]!.values).not.toHaveProperty("protected_control");
});
it("rejects new operation identities and attempts to mutate service-derived preflight state", () => {
  const op = row(),
    stored = nativeOperationToStorage(op);
  expect(() => planNativeOperationBranch([op], [])).toThrowError(
    expect.objectContaining({ code: "OPERATION_PROTECTED_SOURCE_REQUIRED" }),
  );
  expect(() =>
    planNativeOperationBranch([{ ...op, operationKey: "other" }], [stored]),
  ).toThrowError(
    expect.objectContaining({ code: "AUTHORING_MEMBER_REMAP_REQUIRED" }),
  );
  expect(() =>
    planNativeOperationBranch(
      [
        {
          ...op,
          requiresPreflight: true,
          preflightKey: "registered.preflight",
          preflightVersion: 1,
        },
      ],
      [stored],
    ),
  ).toThrowError(
    expect.objectContaining({ code: "AUTHORING_SERVICE_PROPERTY_IMMUTABLE" }),
  );
  expect(() =>
    planNativeOperationBranch(
      [{ ...op, protectedControl: false } as unknown as NativeOperationRow],
      [stored],
    ),
  ).toThrow("FOUNDATION_UNSUPPORTED_PROPERTY");
});
