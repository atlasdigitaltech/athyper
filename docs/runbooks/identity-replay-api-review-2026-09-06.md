# Identity replay approval API review — 2026-09-06

Reviewed the local `stack-v2-foundation` checkout (base `535cd9ac`), including the four requested routes in `identity-replay-routes.ts`, the service, PostgreSQL repository, permission authorizer, authentication/context wiring, Studio DDL and forward migration, and the downstream replay consumer. The linked GitHub source was unavailable (404); the local source was used.

## Confirmed bugs fixed

| Priority | Affected operation | Trigger and previous behavior | Fix |
| --- | --- | --- | --- |
| P2 | Request, approve, revoke | A JSON reason containing NUL passed validation but PostgreSQL cannot store NUL in `text`, resulting in an internal error. | Reject NUL in the route schema and service before persistence; HTTP returns 400. |
| P2 | Request, approve, revoke | A reason containing 1000 supplementary Unicode characters passed JSON Schema but failed the service's UTF-16 code-unit length check. | Count Unicode code points consistently with JSON Schema and PostgreSQL. Reasons of 1000 characters succeed; 1001 fail. |
| P2 | Approve; shared downstream replay consumer | Approval expiry could occur after the SQL `UPDATE` predicate but before a database trigger's fresh clock check. The trigger raised SQLSTATE `23514`, which escaped as HTTP 500. | Translate the two specific replay transition/evidence guard errors to `409 IAM_REPLAY_APPROVAL_STALE` after transaction rollback. Unrelated constraint, database and audit failures retain their original behavior. |

The expiry fix uses the existing database guard messages and SQLSTATE; changes to those guard messages must update the mapping. No database migration is required.

## Review coverage

- All four HTTP routes: verified context forwarding, permission checks, Studio-only access, write MFA, read access at baseline assurance, UUID validation, request schema enforcement, forbidden actor fields, TTL bounds/default, reason trimming, Unicode/NUL handling, no-store success responses, domain error mapping and internal-error sanitization.
- Repository: independent maker/checker, absent or tenant-invisible evidence, replayable terminal state, desired version/hash, newer attempts, atomic conditional transitions, revocation independent of desired-state freshness, and transaction-bound auditing.
- Database and wiring: selected authority tenant context, RLS, composite foreign keys, immutable coordinates, actor-bound transitions, projection/attempt/approval lock order, approval-row serialization for revoke, single consumption, replay marker atomicity and worker linkage.
- Expired approval records intentionally retain historical status. Reads remain available; usability depends on `expiresAt`. The replay enable flag intentionally controls consumption only.

## Validation

- `pnpm --filter @athyper/server-platform-iam test`: 156 tests across 19 files passed.
- `pnpm --filter @athyper/server-platform-iam typecheck`: production and test TypeScript checks passed.
- `IAM_REPLAY_EVIDENCE_PATH=/tmp/identity-replay-review-evidence.json pnpm --filter @athyper/server-db run test:integration:identity-replay`: all 23 live checks passed on PostgreSQL 16.13 and Keycloak 26.7.2. Evidence: [identity-replay-api-review-evidence.json](identity-replay-api-review-evidence.json). All recorded source hashes match the reviewed files.
- The live PostgreSQL/Keycloak suite was extended to persist Unicode reasons through request/approve/revoke, check cross-tenant GET isolation, reject NUL, and force expiry between an UPDATE predicate and the production database guard. The forced-expiry assertion also verifies the approval remains pending and no approval audit event commits.

The live harness uses disposable containers and minimal surrounding fixtures. It covers real authentication/TOTP, restricted database access, concurrent consumption and revocation, direct database guards, audit rollback, and real Keycloak worker provisioning; it does not certify a full deployed production installation.
