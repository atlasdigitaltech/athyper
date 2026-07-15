/**
 * Backwards-compatible shim. The canonical implementation moved to
 * `@athyper/svc-shared/operation-guard` so svc-finance (and any other
 * service downstream of svc-shared) can use it without a circular
 * dependency through svc-records.
 *
 * Keep this re-export until the records-side call sites
 * (export.route.ts, import.route.ts, routes/index.ts) migrate their
 * imports to `@athyper/svc-shared`. No behavioral difference.
 */
export {
  isEntityOperationAllowed,
  type CheckPermissionBatchFn,
} from "@athyper/svc-shared";
