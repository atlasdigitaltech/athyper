# Connector administration API review — 2026-09-07

Scope: draft saving, validation, activation, suspension, deprecation, and health-check queuing under `/api/control-admin/connectors`.

## Fixes

- Draft saving reads the tenant-scoped current row and rejects existing active, suspended, or deprecated connectors. It cannot reset the lifecycle to draft.
- Saves require an explicit nonnegative safe-integer expected version. Version zero creates a new draft; updates must match the current version. Lifecycle commands require a positive matching version. No write occurs for a stale preflight version or forbidden transition.
- Draft writes project known fields and derive tenant identity from verified context. HTTP schemas reject tenant/version injection, unexpected fields, non-draft status on a draft save, and a body id that differs from the route id.
- Reads use the exact-plane repository. Rows returned for another tenant or resource are rejected. Missing repositories return 503 without cross-plane fallback.
- Validation now covers shapes and types at both HTTP and service boundaries, unique endpoint codes, HTTPS base URLs, URI secret references, nested inline credential fields, and endpoint URL safety. Backslashes, traversal segments, fragments, whitespace, encoded unsafe forms, origin changes, and credential-bearing query parameters are rejected. HTTPS secret-provider references remain supported.
- Activation and health checks require a usable base URL and at least one endpoint. Deprecated connectors cannot request health checks.
- Health jobs carry verified `planeKey`, tenant, connector id, and requester. HTTP 202 is returned only with a nonempty job id.
- Renaming a draft invalidates both old and new connector-code cache keys. Failed persistence does not invalidate caches.
- Dedicated response contracts and `HttpError` mapping preserve 400/403/404/409/503 responses. Known commit-time version/lifecycle conflicts map to 409; unexpected failures remain generic 500 errors.

## Request compatibility

Create with `PUT /connectors/{id}/draft` and `{ "connector": { ... }, "expectedVersion": 0 }`. Update a draft with its current positive version. Lifecycle POST bodies contain `{ "expectedVersion": currentVersion }`.

Identifiers use alphanumeric characters plus `_`, `.`, and `-`, with a 128-character cap. Connector codes use the existing uppercase format. Names are bounded at 256 characters; URLs/references/paths at 2,048 characters; endpoint arrays at 100. Endpoint schemas reject unknown fields. URI references cannot contain userinfo, query strings, or fragments. Configuration recursion is bounded and cyclic/non-JSON values are rejected for direct service calls.

## Adapter requirements and validation limits

No concrete `ConnectorRepository` or `ConnectorHealthJobs` implementation was found in the repository. Repository implementations must atomically enforce expected versions and lifecycle rules in the tenant scope; service preflight checks alone cannot prevent races. The contracts now require expected versions and document these guarantees. Adapters should report `CONTROL_ADMIN_VERSION_CONFLICT` or `CONTROL_ADMIN_LIFECYCLE_INVALID` for concurrent conflicts.

Queue implementations must retain the new plane field. Workers must resolve the connector in that exact plane/tenant and recheck its lifecycle and outbound-network policy at execution time. URL syntax validation is not DNS, redirect, private-network, or remote-connectivity enforcement. No live health job, database write, or deployment flag change was performed during this review.

## Verification

- Control-admin package: 275 tests passed, including 105 new connector service/HTTP regression cases. Production and test TypeScript checks passed.
- Control-admin contract package: 2 tests passed; production and test TypeScript checks passed.
- HTTP tests enable response-schema enforcement and cover every route's authentication/permission checks, lifecycle transitions, malformed and forged input, stale versions, commit-time conflicts, and 202 job receipts.
