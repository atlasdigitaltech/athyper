import {
  nativeOperationMember,
  validateNativeOperation,
  type NativeOperationRow,
} from "@athyper/server-contract-meta-entity-authoring";
/** SQL projection only; not a writer, authority grant or source initializer. */
export function nativeOperationToStorage(
  row: NativeOperationRow,
): Readonly<Record<string, unknown>> {
  validateNativeOperation(row);
  return {
    id: row.id,
    ...Object.fromEntries(
      Object.entries(nativeOperationMember.columns).map(([p, c]) => [
        c.column,
        row[p as keyof NativeOperationRow],
      ]),
    ),
  };
}
export function nativeOperationFromStorage(
  stored: Readonly<Record<string, unknown>>,
): NativeOperationRow {
  const row = {
    id: stored.id,
    ...Object.fromEntries(
      Object.entries(nativeOperationMember.columns).map(([p, c]) => [
        p,
        stored[c.column],
      ]),
    ),
  };
  validateNativeOperation(row);
  return row;
}
