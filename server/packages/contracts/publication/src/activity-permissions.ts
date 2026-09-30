/** Closed common catalog. These entries register vocabulary, never role grants. */
export const ACTIVITY_PERMISSION_CATALOG = Object.freeze({
  "common.audit.event.query": Object.freeze({ domain: "audit", entity: "event", operation: "query", riskTier: "low", servicePermissionCode: "audit.event.query" }),
  "common.records.snapshot.read": Object.freeze({ domain: "records", entity: "snapshot", operation: "read", riskTier: "low", servicePermissionCode: "records.snapshot.read" }),
  "common.records.snapshot.capture": Object.freeze({ domain: "records", entity: "snapshot", operation: "capture", riskTier: "medium", servicePermissionCode: "records.snapshot.capture" }),
});
export function isActivityPermissionCode(code: string): code is keyof typeof ACTIVITY_PERMISSION_CATALOG {
  return Object.hasOwn(ACTIVITY_PERMISSION_CATALOG, code);
}
export function activityCanonicalPermission(servicePermissionCode: string): keyof typeof ACTIVITY_PERMISSION_CATALOG | undefined {
  return (Object.keys(ACTIVITY_PERMISSION_CATALOG) as (keyof typeof ACTIVITY_PERMISSION_CATALOG)[])
    .find(code => ACTIVITY_PERMISSION_CATALOG[code].servicePermissionCode === servicePermissionCode);
}
