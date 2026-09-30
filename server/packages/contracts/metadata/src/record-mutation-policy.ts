/** A published reference to an installed owning-service invariant. Never code or SQL. */
export interface RecordMutationPolicyV1 {
  readonly schemaVersion: 1;
  readonly handlerKey: string;
}
export function parseRecordMutationPolicy(
  value: unknown,
): RecordMutationPolicyV1 {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw TypeError("Invalid mutation policy");
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).sort().join() !== "handlerKey,schemaVersion" ||
    row.schemaVersion !== 1 ||
    typeof row.handlerKey !== "string" ||
    !/^[a-z][a-z0-9_.]{1,126}$/.test(row.handlerKey)
  )
    throw TypeError("Invalid mutation policy");
  return Object.freeze({ schemaVersion: 1, handlerKey: row.handlerKey });
}
