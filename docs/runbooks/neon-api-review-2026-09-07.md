# Neon API source review — 2026-09-07

Scope: `/api/neon/*` route registration, input boundaries, authorization scope, replay/idempotency behavior, profile matching, and related service/repository code. Reviewed the current working tree and preserved existing changes, including the earlier finance work. No commits, deployments, database migrations, or production writes were performed.

## Coverage

The existing source manifest contains 133 normalized current method/path entries across 16 source files for this prefix. This is a source inventory, not a statement that every endpoint was exercised against a running deployment. Compatibility aliases and generated route registrations were also inspected in source.

| Source | Manifest entries |
| --- | ---: |
| `server/apps/platform-host/src/composition/finance-routes.ts` | 5 |
| `server/packages/planes/neon/src/business-partner-account-bank-linkage-routes.ts` | 12 |
| `server/packages/planes/neon/src/business-partner-profile-match-routes.ts` | 5 |
| `server/packages/planes/neon/src/business-partner-profile-projection-routes.ts` | 5 |
| `server/packages/planes/neon/src/register-finance.ts` | 24 |
| `server/packages/platform/experience/src/routes.ts` | 2 |
| `server/packages/services/master-data/src/business-partner-360-route-contracts.ts` | 4 |
| `server/packages/services/master-data/src/business-partner-eligibility-routes.ts` | 15 |
| `server/packages/services/master-data/src/business-partner-invitation-routes.ts` | 13 |
| `server/packages/services/master-data/src/business-partner-request-routes.ts` | 19 |
| `server/packages/services/master-data/src/governed-internal-business-partner-routes.ts` | 4 |
| `server/packages/services/master-data/src/supplier-workforce-requisition-routes.ts` | 3 |
| `server/packages/services/master-data/src/worker-engagement-iam-routes.ts` | 1 |
| `server/packages/services/master-data/src/worker-engagement-lifecycle-routes.ts` | 2 |
| `server/packages/services/master-data/src/workforce-routes.ts` | 17 |
| `server/packages/services/publication/src/business-partner-definition-consumer-routes.ts` | 2 |

## Findings and fixes

All findings below were addressed in this review.

| Severity | Finding | Change |
| --- | --- | --- |
| P1 | Account-link and bank-verification creation replayed tenant-level keys before authorizing access to the stored resource. A caller knowing a key could receive data after losing the relevant permission. | Reauthorize replay against the stored relationship/company before returning it. |
| P1 | Protected registration used `neon.relationship.entity_case.create`, but the generic permission helper classified this as a relationship permission and supplied the company ID as `networkRelationshipId`. Replays also trusted the newly supplied company scope. | Treat registration as company scoped; authorize the stored company on replay. |
| P1 | Bank/link creation accepted reused keys with different coordinates; protected registration also accepted changed bank details. Concurrent creation could race the initial lookup. | Compare stored coordinates and protected registration details; return 409 on mismatches. Serialize each tenant/operation/key with a transaction-scoped PostgreSQL advisory lock before reading. Internal comparison fields are removed from registration responses. Completed registration replays no longer require the secret store. |
| P1 | Profile-match and acceptance inserts used `ON CONFLICT DO NOTHING`, but their subsequent reads did not check whether the concurrent winner belonged to different inputs. The acceptance path could associate another acceptance with a newly created case. | Validate the row returned after the race, using match coordinates or acceptance hash, before returning data or invoking case creation. |
| P2 | Matching two absent legal names awarded 80 points. Missing/empty values could also compare equal for the other name/code scoring fields. | Require a nonempty normalized source value before awarding those points. |
| P2 | Account-code diffs read `candidate.accountCode`, although candidates expose `code`. Candidate incorporation dates were converted to strings without an explicit date-only SQL projection. | Map the account-code diff to `code`; select incorporation dates as PostgreSQL text to retain the calendar-date representation. |
| P2 | Projection-list relationship filters were not UUID validated. Repeated filters were silently discarded; repeated limit values could be coerced. | Validate scalar UUID filters and integer query representations before calling the service. |
| P2 | Profile-match and protected-bank route helpers coerced JSON objects, arrays, numbers, and booleans to strings. | Require nonempty strings for fields using these helpers, including idempotency keys and bank details. |
| P2 | Workforce UUID validation searched for an embedded UUID instead of matching the whole value. | Anchor the UUID expression so prefixed/suffixed values fail with 400 before service invocation. |
| P2 | Business-partner case list cursors reached a `timestamptz` SQL cast without timestamp validation. Business Partner 360 accepted impossible calendar dates matching the date pattern. | Validate list timestamps in the service and calendar dates in the 360 route, returning 400 for invalid values. |
| P2 | External invitation rate-limit keys included the caller-controlled User-Agent, allowing quota resets. Expired entries were retained indefinitely. | Key by client IP and remove expired entries. The limiter remains process local, as before. |

## Verification

- Neon package: 79 tests passed, including new service regression tests and route-handler boundary checks.
- Master-data package: 231 tests passed; 11 opt-in PostgreSQL tests skipped.
- Experience package: 45 tests passed.
- Host finance HTTP review and finance import-boundary suites: 123 tests passed.
- Publication business-partner definition and case-contract suites: 37 tests passed.
- Neon and master-data production/test TypeScript checks passed.
- `git diff --check` passed for the reviewed packages.

Total: 515 passing tests across these suite selections. Existing tests account for most of this total; it is not a count of new tests or individually exercised Neon endpoints.

## Evidence limits

No live PostgreSQL, identity-provider, secret-store, or end-to-end Mesh-to-Neon integration was exercised. PostgreSQL advisory-lock concurrency and the additional SQL projection fields were reviewed in source, but were not validated against a live database. The new profile race regressions simulate conflicting repository results; they are not multi-connection database tests. The invitation limiter still requires shared infrastructure for a quota spanning multiple server processes. Existing finance changes were validated and retained, not authored by this review.
