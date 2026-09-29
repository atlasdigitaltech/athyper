/** Published ownership policy. A separate admin capability widens owner scope,
 * never tenant scope or field/operation permissions. */
export interface RecordOwnerAccessV1 {
  readonly schemaVersion: 1;
  readonly ownerField: string;
  readonly administerPermission: string;
  readonly createdByField: string;
  readonly updatedByField: string;
}
export function parseRecordOwnerAccess(value: unknown): RecordOwnerAccessV1 {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Invalid record owner access");
  const row = value as Record<string, unknown>;
  if (
    Object.keys(row).sort().join() !==
      [
        "administerPermission",
        "createdByField",
        "ownerField",
        "schemaVersion",
        "updatedByField",
      ].join() ||
    row.schemaVersion !== 1 ||
    typeof row.ownerField !== "string" ||
    !/^[a-z][a-z0-9_]{1,62}$/.test(row.ownerField) ||
    [row.createdByField, row.updatedByField].some(
      (field) =>
        typeof field !== "string" || !/^[a-z][a-z0-9_]{1,62}$/.test(field),
    ) ||
    typeof row.administerPermission !== "string" ||
    !/^[a-z][a-z0-9_.]{1,159}$/.test(row.administerPermission)
  )
    throw new TypeError("Invalid record owner access");
  return Object.freeze({
    schemaVersion: 1,
    ownerField: row.ownerField,
    administerPermission: row.administerPermission,
    createdByField: row.createdByField as string,
    updatedByField: row.updatedByField as string,
  });
}
