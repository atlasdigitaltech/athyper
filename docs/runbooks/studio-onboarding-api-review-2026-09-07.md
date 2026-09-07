# Studio onboarding API review — 2026-09-07

Reviewed the local implementations of these authenticated POST routes, including host registration, lifecycle transitions, reconciliation, work-item resolution, persistence SQL, and onboarding DDL/RLS:

- `/api/studio/onboarding/cases`
- `/api/studio/onboarding/cases/{caseId}/actions/{action}`
- `/api/studio/onboarding/cases/{caseId}/reconcile`
- `/api/studio/onboarding/cases/{caseId}/work-items/{workItemId}/resolve`

## Findings fixed

| Priority | Finding | Correction |
| --- | --- | --- |
| High | Draft creation omitted the management authorization callback, although the lifecycle service itself performs no permission check. | Authorize the verified caller before creating a draft. |
| High | Reconciliation emitted apply commands regardless of lifecycle state, including rejected and offboarded cases. | Restrict reconciliation to provisioning, reconciling, active, and offboarding. Check the case tenant against the HTTP caller before observing resources or issuing commands. |
| High | Actions accepted compilation or canonical revision payloads outside their intended operations, permitting unrelated transitions to replace compiled resources or change desired state. | Accept compilation only in compile and canonical revisions only in submit/approve. Reject same-status writes; normal retries continue to use the original expected status and repository idempotency markers. |
| High | A changed approval advanced case desired coordinates without advancing resource coordinates, so receipt validation rejected the version/hash actually sent by the saga. | Update resource desired version/hash in the same lifecycle transaction, preserving applied coordinates for drift detection. |
| Medium | Draft requests without an explicit case ID generated a random ID on each retry; the ID participates in the fingerprint, causing conflicts. | Generate a stable UUID from the tenant, normalized case code, and idempotency key. |
| Medium | Coercion accepted objects/numbers as strings; malformed UUIDs and enum values reached PostgreSQL; invalid desired-version values were silently omitted, dropping concurrency protection. | Validate required strings, UUIDs, enums, object payloads, and positive integer versions before dispatch. |
| Medium | Compilation trusted a TypeScript cast and failed on missing arrays, invalid children, duplicate identifiers/coordinates/codes, or invalid database values. | Validate structure, UUIDs, enums, database code syntax, priority bounds, object payloads, duplicates, dependencies, and cycles before persistence. |
| Medium | Unknown actions, missing cases, draft conflicts, and work-item permission failures became server errors; message substring matching could misclassify unrelated failures as conflicts. | Map known errors to 400/403/404/409 and forward unexpected errors to the application handler. |
| Low | The test TypeScript configuration inherited the production exclusion of test files. | Explicitly include tests in typechecking by overriding exclusions. |

## Verification

- `pnpm --filter @athyper/server-plane-studio-onboarding test`: 52 tests passed across five files.
- `pnpm --filter @athyper/server-plane-studio-onboarding typecheck`: production and test TypeScript checks.
- `git diff --check -- server/packages/planes/studio/onboarding`: clean.

Regression coverage includes actual Express HTTP requests with the real lifecycle service and stub persistence, authentication and authorization on all four routes, draft replay and changed-payload conflicts, malformed inputs, error mapping, lifecycle guards, cross-tenant reconciliation rejection, and compiled PostgreSQL statement checks for resource version propagation and stale/replayed commands.

The SQL tests use a controlled Kysely driver, not a live PostgreSQL instance. This review does not establish deployed RLS/session behavior, foreign-key integration, or concurrent lifecycle/reconciliation behavior against running provisioners. No deployment or live API mutation was performed. Existing unrelated workspace changes were preserved.
