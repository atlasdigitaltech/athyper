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

## Follow-up review of the endpoint inventory

The earlier fixes are present in the current branch. A second pass found and fixed these additional defects:

| Severity | Finding | Remediation and regression evidence |
| --- | --- | --- |
| High | Provisioning, projection health and projection replay called the permission authorizer without a resource. Workspace-scoped role evidence could therefore pass a tenant-wide operation. | Pass the authenticated tenant (and replay attempt where applicable) to authorization. Real-authorizer tests reject workspace grants before database access; tenant-scoped provisioning remains allowed. |
| Medium | When subject uniqueness collided under a new idempotency key, the repository returned `Replayed` without storing that new key. That supposedly successful key could subsequently create an unrelated identity request. | Require both the persisted key and fingerprint to match. Same subject under a different key now returns 409; clients must retry with the original key. Repository tests exercise both replay and conflict results using the actual repository with scripted query results. |
| Medium | The provisioning route converted every `TypeError`, including repository/audit/outbox programming failures, into a 400 with the internal error message. | Introduce `ProvisioningValidationError` for known input failures. HTTP tests verify ordinary internal TypeErrors remain sanitized 500s and known validation errors remain 400s. |
| Low | An explicitly empty `realmKey` was silently dropped by the route, allowing provisioning in the default realm instead of rejecting invalid input. | Preserve the provided field so realm validation rejects it. HTTP regression checks the exact forwarded value. |

The trusted-device source assertion still expected the removed BFF local-elevation path. Updated it to check issuer MFA before elevation while retaining the API's tenant/principal/epoch/revocation/expiry assertions. Existing behavioral tests cover valid, expired, revoked and absent remembered-device evidence across all three planes.

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

## Durable approval follow-up

The missing integration has now been implemented. Identity replay uses a persisted Studio request, a separate authenticated reviewer, and atomic approval consumption/replay/audit. The old boolean verifier and caller-asserted approver body have been removed.

See [the rollout and API guide](identity-replay-approval.md) and [live verification evidence](identity-replay-live-evidence.json). The API keeps `IAM_IDENTITY_REPLAY_ENABLED=false` by default for rollout; enable it after the Studio migration and release verification. Isolated PostgreSQL/Keycloak testing now covers the focused replay workflow, including real OTP, concurrency, rollback and provider provisioning. The earlier no-live-testing limitation no longer applies to this workflow.

## Validation

Results from the preceding API review (durable-approval verification is recorded separately above):

- IAM package: **100 tests passed**; source and test typechecks passed.
- Host IAM HTTP suites: **11 tests passed**; host typecheck passed. The dependency-resolution blocker from the first pass is no longer present in the current workspace.
- Related trusted-device/projection/saga contract and database-source tests: **21 passed**.
- `git diff --check` passed.
- No live PostgreSQL, Keycloak, or concurrent replay integration run was performed. HTTP/repository tests use an in-process host and dummy/scripted database results; database boundary conclusions also rely on source inspection and existing tests.
- Changes were limited to the IAM review scope. Unrelated workspace edits were preserved.
