import { expect, it } from "vitest";
import { projectStoredFieldWrites } from "../native-runtime-projection.js";

const field = { fieldKey: "display_name", valueOrigin: "stored", writeMode: "mutable" };
const operations = ["create", "patch"].map(key => ({ operationKey: key, operationKind: key === "patch" ? "update" : "create", fieldKeys: [field.fieldKey] }));

it("requires matching policy and operation field enrollment for each write", () => {
  expect(projectStoredFieldWrites(field, { writeOperations: ["create", "patch"] }, operations)).toEqual(["create", "patch"]);
  expect(projectStoredFieldWrites(field, { writeOperations: [] }, operations)).toEqual([]);
  expect(() => projectStoredFieldWrites(field, { writeOperations: ["patch"] }, [])).toThrow("WRITE_BINDING_REQUIRED");
  expect(() => projectStoredFieldWrites(field, { writeOperations: ["patch"] }, [{ ...operations[1], fieldKeys: [] }])).toThrow("WRITE_BINDING_REQUIRED");
  expect(() => projectStoredFieldWrites(field, { writeOperations: ["patch"] }, [{ ...operations[1], status: "deprecated" }])).toThrow("WRITE_BINDING_REQUIRED");
});

it("preserves read-only and write-once semantics", () => {
  expect(projectStoredFieldWrites({ ...field, writeMode: "read_only" }, { writeOperations: [] }, operations)).toEqual([]);
  expect(() => projectStoredFieldWrites({ ...field, writeMode: "read_only" }, { writeOperations: ["patch"] }, operations)).toThrow("WRITE_MODE_MISMATCH");
  expect(projectStoredFieldWrites({ ...field, writeMode: "write_once" }, { writeOperations: ["create"] }, operations)).toEqual(["create"]);
  expect(() => projectStoredFieldWrites({ ...field, writeMode: "write_once" }, { writeOperations: ["patch"] }, operations)).toThrow("WRITE_MODE_MISMATCH");
  expect(() => projectStoredFieldWrites({ ...field, valueOrigin: "computed" }, { writeOperations: [] }, operations)).toThrow("FIELD_ADAPTER_REQUIRED");
});

it("uses explicit field policies with the persisted operation shape", () => {
  const persisted = operations.map(({ fieldKeys: _hint, ...operation }) => operation);
  expect(projectStoredFieldWrites(field, { writeOperations: ["patch"] }, persisted)).toEqual(["patch"]);
  expect(projectStoredFieldWrites(field, { writeOperations: [] }, persisted)).toEqual([]);
  expect(() => projectStoredFieldWrites(field, { writeOperations: ["patch"] }, persisted.filter(operation => operation.operationKey !== "patch"))).toThrow("WRITE_BINDING_REQUIRED");
});
