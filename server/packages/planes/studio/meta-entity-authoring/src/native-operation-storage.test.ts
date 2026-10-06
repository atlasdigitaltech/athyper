import { expect, it } from "vitest";
import {
  nativeOperationFromStorage,
  nativeOperationToStorage,
} from "./native-operation-storage.js";
import {
  nativeOperationNode,
  validateFoundationNode,
  validateNativeOperation,
  type NativeOperationRow,
} from "@athyper/server-contract-meta-entity-authoring";
const id = (n: number) =>
  "00000000-0000-4000-8000-" + String(n).padStart(12, "0");
function row(): NativeOperationRow {
  return {
    id: id(1),
    operationKey: "read",
    operationKind: "read",
    description: null,
    labelId: id(2),
    auditEventCode: "test.read",
    executionMode: "synchronous",
    idempotencyMode: "none",
    inputSurfaceId: null,
    resultSurfaceId: null,
    authorizationTarget: "existing",
    authorizationEffect: "read",
    requiresParentRead: false,
    requiresPreflight: false,
    replacementOperationId: null,
    handlerKey: "entity.record.read.v1",
    handlerVersion: 1,
    preflightKey: null,
    preflightVersion: null,
    extensionFieldMode: "none",
    exportFormats: null,
    exportMaxRecords: null,
  };
}
it("round-trips the complete operation dictionary through SQL columns", () => {
  const r = row(),
    stored = nativeOperationToStorage(r);
  expect(stored.handler_version).toBe(1);
  expect(nativeOperationFromStorage(stored)).toEqual(r);
  expect(() =>
    nativeOperationFromStorage({ ...stored, label_id: undefined }),
  ).toThrow();
});
it("rejects unpaired, invalid and overflowing target values", () => {
  for (const patch of [
    { handlerVersion: null },
    { preflightKey: "test.preflight.v1" },
    {
      operationKind: "execute" as const,
      handlerKey: null,
      handlerVersion: null,
    },
    { exportMaxRecords: "1" },
  ])
    expect(() => validateNativeOperation({ ...row(), ...patch })).toThrow(
      "NATIVE_OPERATION_INVALID",
    );
  const r = {
    ...row(),
    operationKind: "export" as const,
    authorizationEffect: "write" as const,
    exportFormats: ["csv"],
    exportMaxRecords: "9223372036854775807",
  };
  expect(nativeOperationFromStorage(nativeOperationToStorage(r))).toEqual(r);
  expect(() =>
    validateNativeOperation({ ...r, exportMaxRecords: "9223372036854775808" }),
  ).toThrow("NATIVE_OPERATION_INVALID");
  expect(() =>
    validateNativeOperation({ ...r, exportFormats: ["csv", "csv"] }),
  ).toThrow("NATIVE_OPERATION_INVALID");
});
it("distinguishes partial read selection from qualification and excludes derived client input", () => {
  const partial = {
    ...row(),
    handlerKey: null,
    handlerVersion: null,
    requiresPreflight: null,
  };
  expect(() => validateNativeOperation(partial)).not.toThrow();
  expect(() => validateNativeOperation(partial, true)).toThrow(
    "NATIVE_OPERATION_INVALID",
  );
  const { id: _, requiresPreflight: __, ...client } = row();
  validateFoundationNode(nativeOperationNode(true, true), client, "/client");
  expect(() =>
    validateFoundationNode(
      nativeOperationNode(true, true),
      { ...client, requiresPreflight: false },
      "/client",
    ),
  ).toThrow();
  expect(() =>
    validateFoundationNode(
      nativeOperationNode(true, true),
      { ...client, requiresMfa: false },
      "/client",
    ),
  ).toThrow();
});
