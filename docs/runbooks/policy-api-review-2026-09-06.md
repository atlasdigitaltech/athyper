# Policy API code review — 2026-09-06

Scope: `POST /api/policy/evaluate` and `POST /api/policy/simulate`, their host registration, authorization, input validation, shared policy service, SQL repository, cache, rule evaluator, transaction/audit behavior, and HTTP runtime integration. Reviewed the local checkout; no requests were sent to the deployed API and no live database validation was performed.

## Findings and fixes

| Severity | Finding | Fix |
| --- | --- | --- |
| P1 | The host shares a cached repository across plane-local databases, but the cache key omitted the plane. The same tenant/entity/date/selection evaluated first on one plane could supply another plane's policy definitions and simulation trace. | Both service paths propagate the verified plane into repository queries. Cache keys include the plane and use structured serialization. Calls without a plane bypass caching. Tenant invalidation still clears entries across planes. |
| P2 | Raw Express registration bypassed the host's authenticated tenant/principal rate limiter. Repeated evaluations could continue querying policies and writing audit events beyond that configured limit. | Register both endpoints through the HTTP route-contract mechanism, which applies the limiter after authentication. Declare permissions, response contracts, and error statuses. Remove their obsolete undocumented-route exceptions. |
| P2 | An explicit empty `policyDefinitionIds` array silently removed the SQL selection and evaluated every active policy. The cache also conflated an empty selection with an omitted selection. | HTTP requests require 1–100 UUIDs when this field is supplied; omission continues to select all applicable policies. Internal repository calls with an empty selection return no definitions without querying. Cache keys distinguish empty and omitted selections. UUIDs are lowercased before deduplication. |
| P2 | Invalid optional `entityId` and `pipelineId` values, including objects, numbers, null, and blank strings, were silently discarded. Evaluation could succeed while omitting intended audit coordinates. | Supplied optional fields must be nonempty strings; otherwise return 400 before invoking the service. Valid strings remain trimmed. |
| P2 | Fact path traversal read inherited JavaScript properties. For example, a `missing` rule for `toString` considered that field present even when absent from the JSON facts, potentially changing the decision. | Read only own properties at every path segment, preserving existing prototype-path restrictions and genuine own facts. |

Both endpoints also set `Cache-Control: private, no-store` before authentication to prevent storage of decisions, traces, and authentication failures. The policy test TypeScript configuration now overrides inherited exclusions so test files actually participate in type checking.

## Behavior verified

- Authentication precedes permission checking; each endpoint requests its distinct permission.
- Rejected authentication/authorization does not invoke either policy operation.
- Request-body context does not replace the verified context; service identity facts override caller-provided values.
- Missing or malformed entity/facts/selection fields are rejected, and valid optional coordinates are forwarded.
- Deny precedence, first-match evaluation, ordered simulation traces, and plane transaction selection remain covered by service tests.
- Evaluation awaits its audit write and rejects when that write fails; simulation remains unaudited.
- Simulation-unavailable responses remain 501 and do not invoke evaluation.
- Unexpected service failures propagate to HTTP error handling.
- HTTP contracts expose authenticated operations and enforce the configured tenant/principal request limit.

## Validation

- Policy package: **72 tests passed** across four files.
- Policy package production and test TypeScript checks: passed.
- Host policy integration: **1 test passed** after route-contract migration.
- Earlier host suite run: **127 passed, 1 skipped** before route-contract migration.
- Repository-wide OpenAPI check: blocked by existing unrelated undocumented routes and a stale audit-route exception. The migrated policy exceptions were removed; no policy-specific errors remain in that check.

SQL tenant/global filtering, active-status filtering, effective-date filtering, parameter binding, and rule ordering were inspected in source. These checks do not certify live database contents, RLS/grants, deployed configuration, or production behavior. Policy-definition authoring and publication workflows were outside this route review.
