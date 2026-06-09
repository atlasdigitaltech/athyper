/**
 * @athyper/svc-records
 *
 * Intentional fan-in: this service depends on svc-business, svc-finance,
 * svc-iam, and svc-policy because record operations (CRUD, bulk actions,
 * import, export, entity-level actions) are the integration layer where all
 * domain concerns converge:
 *
 *   svc-iam      — permission checks on every mutating route
 *   svc-policy   — pre-save policy evaluation (deny / require_workflow guards)
 *   svc-business — AP invoice extraction, proforma promotion, business logic
 *   svc-finance  — journal posting triggered by record state transitions
 *
 * If this fan-in depth ever grows past 4, extract a dedicated svc-orchestration
 * layer rather than adding more direct dependencies here.
 */

export { registerRecordsRoutes, type RecordsRoutesDeps } from "./routes/index.js";
