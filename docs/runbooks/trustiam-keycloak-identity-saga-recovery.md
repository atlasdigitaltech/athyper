# TrustIAM/Keycloak identity saga recovery

## Scope and authority

Use this runbook for TrustIAM identity, organization-membership, application-projection, suspension, or deprovisioning failures. Keycloak remains authoritative only for credentials, sessions, required actions, and provider memberships. Plane-local `master.principal`, `master.principal_identity_binding`, `authz.plane_membership`, IAM-managed group membership, roles, and scope targets remain authoritative for business access.

Never copy Keycloak attributes, groups, or organization metadata into a business permission decision. Never repair IAM access by editing person, employment, business-partner, supplier, or customer history.

## Provider unavailable

1. Confirm the attempt has `failure_class=transient`, an exact `desired_version`/`desired_hash`, and a future `next_attempt_at`. Do not create a second manual user or organization.
2. Confirm local admission is already revoked for suspension/deprovisioning. Provider unavailability must not preserve plane-local access.
3. Check Keycloak health, admin API reachability, client credentials, rate limits, and realm routing. Do not put tokens, email addresses, or callback payloads in incident notes.
4. Allow the bounded backoff schedule to run. Stable provider idempotency keys make a repeated invite/create, membership, or application operation safe.
5. If the attempt reaches `dead_letter`, fix the provider condition before requesting replay. A stale desired version must be superseded, not replayed.

## Partial success

Partial provider success is expected and recoverable. Each step has a stable key derived from identity ID, desired version/hash, operation, and target coordinate.

- User exists, membership missing: reconciliation reuses the bound provider subject and repeats only membership/application convergence.
- Provider converged, local projection missing: the exact-version fence is checked again before applying the local principal/binding/membership/role projection.
- Local suspension succeeded, provider suspension failed: local access stays closed; retry only the provider operation.
- Provider deprovisioned, callback missing: periodic reconciliation reads provider state and records drift/observation. Do not reactivate local access from provider attributes.
- Extra provider user or membership: quarantine and investigate ownership. Reconciliation reports `extra`; it does not auto-grant local access or destructively delete an ambiguous provider record.

## Dead-letter replay

Replay is a privileged mutation, not a queue reset.

1. Verify the desired identity and organization projections still have the same version/hash as the failed attempt.
2. Record the incident/change ticket and remediation evidence without secrets or restricted identity payloads.
3. The requesting operator must hold `iam.identity.replay` and use an elevated MFA session.
4. A different authorized operator must approve the replay. The database rejects the same principal as requester and approver.
5. Request replay once. The next worker claim receives a higher fencing token and links `manual_replay_of` to the dead-letter attempt.
6. Confirm the old attempt remains immutable and the new attempt reaches `succeeded` or a new independently diagnosable dead letter.

## Callback anomalies

- Duplicate `event_id`: expected disposition is `duplicate`; no observation changes.
- Lower or equal provider sequence: expected disposition is `out_of_order`; no state regression.
- Different desired version/hash: expected disposition is `stale`; retain the receipt but do not update observed state.
- Matching exact version/hash and higher sequence: apply the observation. A provider status mismatch marks drift; it never changes desired business lifecycle or local permissions.

## Periodic reconciliation

Run reconciliation after provider recovery and on the normal schedule. Review all categories:

- `missing`: desired identity, employer/contact membership, or application projection is absent;
- `extra`: provider identity or projection has no desired TrustIAM coordinate;
- `mismatched`: status, version, hash, membership, or application coordinate differs.

For every repair, confirm desired and observed version/hash convergence, no unreplayed dead letters, no stale open lease, and correct employer membership for workforce users or contact membership for supplier/customer users. Separately verify local effective permissions from plane-local authorization evidence; a clean Keycloak projection is not proof of business access.

## Closure evidence

Capture tenant-safe IDs, attempt ID, fencing token, desired version/hash, provider request ID, disposition, retry count, reconciliation outcome, requester/approver IDs, and timestamps. Exclude tokens, credentials, raw callback bodies, provider attributes, and restricted person data.
