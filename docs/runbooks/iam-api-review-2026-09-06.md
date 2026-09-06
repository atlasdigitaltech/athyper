# IAM API review — 2026-09-06

Reviewed all nine requested endpoints, their authentication middleware and IAM service, provisioning transaction/outbox/idempotency handling, exact-plane identity resolution, replay service/repository, and the associated database constraints and triggers. Changes are local; no database or deployment was modified.

## Findings and changes

| Severity | Finding | Remediation |
| --- | --- | --- |
| High | A caller could supply another principal's UUID as `approvedBy`; neither the replay service nor database proved that principal approved the attempt. | Identity replay now requires a trusted approval verifier bound to authority tenant, attempt, requester and approver. Missing or rejected evidence returns 403 before mutation. The service also explicitly rejects non-Studio contexts. |
| High | The `AUTHORIZED` role check ran only when no context mismatch existed. In shadow/off mode, a mismatched selector could bypass the role requirement. | Check the role independently after context rollout handling, preserving enforce-mode mismatch errors. |
| High | Provisioning permissions from a non-Studio context could be applied to a Studio authority transaction; a request could also override the authenticated realm. | Require Studio context and the authenticated realm before persistence. |
| Medium | Projection replay and identity evidence cast unvalidated path IDs to PostgreSQL UUIDs. Invalid IDs could become database errors/500 responses. | Add runtime UUID schemas and documented 400 responses. |
| Medium | Several IAM contracts omitted authentication's 401/503 outcomes. Response enforcement could convert those responses to 500. | Declare reachable authentication statuses; cover all eight authenticated endpoint handlers with response enforcement enabled. |
| Low | `/me` and projection health lacked explicit cache prevention despite returning principal/permission or tenant operational data. | Set `Cache-Control: private, no-store` on successful responses. |
| Low | Provisioning's request contract admitted an empty target-plane list, relying on deeper service validation. | Reject empty lists at the HTTP boundary with `minItems: 1`. |

## Endpoint coverage

| Endpoint | Review and verification |
| --- | --- |
| GET contexts | Verified bearer-token verification, issuer/realm and plane admission, active projection and membership filters, exact-plane directory selection, read-only snapshot, sanitized presentation and no-store. HTTP regression covers missing credentials. |
| GET projection-health | Reviewed Studio permission checks and tenant-bounded aggregate/dead-letter queries; fixed response statuses and caching. |
| POST projection-reconciliation-attempts/{attemptId}/replay | Reviewed permission, tenant, dead-letter state and one-time update predicates; fixed UUID validation and response statuses. |
| POST identity-saga-attempts/{attemptId}/replay | Closed caller-asserted approval acceptance, added explicit Studio boundary, preserved MFA and distinct-principal checks, fixed response statuses. |
| GET identity-saga-attempts/{attemptId}/evidence | Reviewed Studio permission and authority tenant predicates, selected evidence fields and database receipt size constraint; fixed UUID validation and response statuses. |
| GET me | Reviewed authenticated context projection; fixed no-store and unavailable-authority response declaration. |
| POST provisioning-requests | Reviewed uniqueness/fingerprint conflict handling and transaction-bound request/outbox/audit writes; added plane/realm boundaries and empty-plane validation. |
| POST trusted-devices | Reviewed issuer authentication-method requirement, digest/TTL validation, exact-plane storage, epoch binding, unique digest collision handling and transactional audit. Regression covers missing MFA and unavailable exact-plane adapters. |
| POST trusted-devices/verify | Reviewed tenant/principal/epoch/digest/revocation/expiry predicates and no-store decisions. Regression confirms unavailable Neon/Mesh storage never falls back to Studio. |

## Approval integration still required

Identity saga replay is deliberately unavailable by default after this fix. Host composition exposes `verifyIdentityReplayApproval`; no durable approval adapter exists in the reviewed implementation, so the normal host returns `IAM_REPLAY_APPROVAL_REQUIRED` (403). Connect this dependency to a durable review workflow before enabling replay. Its contract requires approval of the exact tenant, attempt, requester and approver; a principal-existence check or unconditional true is insufficient. Existing direct `IdentityReplayService` consumers also need this evidence provider.

This mitigates the authorization defect but does **not** implement a maker-checker approval UI or persistence workflow. No second user's bearer token is requested or exchanged.

## Validation

- IAM package: 93 tests passed; source and test typechecks passed.
- Host IAM HTTP suites: 10 tests passed, including the existing audit/provisioning vertical and the new API regressions.
- Related trusted-device/projection/saga contract and database-source tests: 20 passed, one failed. The failure is the existing source-pattern assertion in `server/db/scripts/__tests__/platform/trusted-device-expiry.test.ts`, which expects `!decision.active ... decision.expiresAt <= effectiveAt` in the already-modified BFF source. This review did not edit that BFF file or test.
- Host typecheck is blocked by unresolved `@athyper/server-runtime-http` imports in `server/packages/services/master-data/src/business-partner-360-route-contracts.ts` and `business-partner-360-routes.ts`.
- No live PostgreSQL, Keycloak, or concurrent replay integration run was performed. HTTP tests use an in-process host and a dummy database driver; database boundary conclusions also rely on source inspection and existing tests.
