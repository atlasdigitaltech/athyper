# Durable identity replay approval

Identity saga replay now uses persisted Studio maker-checker evidence. The former `approvedBy` request body and boolean approval callback have been removed. The replay request accepts an `approvalId` and consumes it atomically with the replay marker and transaction-bound audit event.

## API workflow

All requests use a verified Studio identity and the selected authority tenant. Mutations require elevated assurance and tenant-scoped `studio.iam.application_projection.replay` authority. Reading approval evidence requires `studio.iam.application_projection.read`.

| Actor | Operation | Body / result |
| --- | --- | --- |
| Requester | `POST /api/iam/identity-saga-attempts/{attemptId}/replay-approvals` | `{"reason":"Root cause corrected","ttlSeconds":900}` → 201, approval including `id` |
| Reviewer | `GET /api/iam/identity-replay-approvals/{approvalId}` | Review the requester, reason, exact attempt/version/hash, status and expiry. Use the existing saga evidence endpoint for failure evidence. |
| Independent reviewer | `POST /api/iam/identity-replay-approvals/{approvalId}/approve` | `{"reason":"Verified correction and reviewed impact"}` → 200 |
| Original requester | `POST /api/iam/identity-saga-attempts/{attemptId}/replay` | `{"approvalId":"<approval UUID>"}` → 202 |
| Authorized operator | `POST /api/iam/identity-replay-approvals/{approvalId}/revoke` | `{"reason":"Review evidence withdrawn"}` → 200, unless already consumed/revoked |

Approval lifetime defaults to 15 minutes, with a permitted range of 60–3600 seconds. Expiry is evaluated with PostgreSQL's clock. Expired rows retain their historical status; `expiresAt` determines whether they are usable. Requests and decisions require a nonblank reason of at most 1000 characters. An approver ID cannot be supplied by the client: the approver is the verified session principal.

The statuses are `pending` → `approved` → `consumed`, or `pending`/`approved` → `revoked`. A repeat or concurrent replay returns 409 after the first successful consumption. The approval record remains available for inspection; the worker owns subsequent saga progress.

## Transaction and database safeguards

Mutations lock the desired projection, then the attempt, then the approval. Consumption checks the tenant, requester, separate approver, exact attempt/version/hash, expiry, approval status, current desired state and absence of a newer attempt. Revocation serializes on the approval row. Audit failure rolls back both approval consumption and the replay marker.

Database controls include tenant RLS, composite foreign keys, immutable approval coordinates, actor-bound state transitions, one consumed approval per attempt, and a guard rejecting replay updates without consumed evidence. A deferred constraint prevents consumption from committing without its matching replay update. The HTTP database role receives no new write privilege on desired projections; a narrowly scoped security-definer routine obtains the projection lock.

The worker links manual replay to the immediately preceding, exact-version approved attempt. A newly authorized desired version reconciles as new work and does not inherit an old manual replay link.

## Install and enable

1. Apply `server/db/migrations/20260906_identity_replay_approval.sql` using the normal Studio migration process. It is listed in the Studio forward manifest, checks `app.database_plane='studio'`, and runs transactionally. Fresh builds install the same schema through the Studio DDL manifest. Never apply it to Neon or Mesh.
2. Deploy the host code and update callers to the approval-ID workflow above.
3. Verify the recorded test evidence and run the integration command below for the release candidate.
4. Set **`IAM_IDENTITY_REPLAY_ENABLED=true`** in the API process environment and restart it through the normal deployment process.

The flag defaults to false. While false, replay consumption returns 503 `IAM_REPLAY_DISABLED`; approval request/read/approve/revoke operations remain available after the migration. This is a rollout control, not a missing approval integration. Disabling it again stops new replay consumption without changing existing approvals or already-requested worker work.

## Live verification

Run from the repository root:

```sh
pnpm --filter @athyper/server-db run test:integration:identity-replay
```

The harness starts disposable PostgreSQL and Keycloak containers, creates isolated `studio`, `neon` and `mesh` databases, imports a dedicated Keycloak realm, and removes those resources on normal completion/failure. It does not read development/QA database URLs or modify those environments. Docker must be available. Defaults are PostgreSQL `16.13-bookworm` and the local `athyper/keycloak:rebuild-20260906` image; `IAM_TEST_KEYCLOAK_IMAGE` can select a compatible Keycloak image. Credentials are generated for the test and are not written to the evidence artifact.

The live suite verifies real password/TOTP authentication, real signed-token verification, tenant permissions, independent approval, duplicate/concurrent consumption, concurrent revocation, expired/revoked/changed-state rejection, direct database tampering guards, audit rollback, a worker claim and idempotent user creation through the real Keycloak Admin adapter. It exercises the production replay schema, forward migration, repository, service and HTTP routes with restricted `athyperapp` database access. Neon/Mesh sentinel checks verify that this Studio workflow does not mutate their state.

Evidence is written to `docs/runbooks/identity-replay-live-evidence.json`, or `IAM_REPLAY_EVIDENCE_PATH`. It includes timestamps, checks, actual server versions, container image IDs and source hashes.

The focused suite supplies minimal surrounding identity/permission fixtures; it does not certify the full business-partner/workforce saga or all plane-local projection schemas. The existing `external-worker-iam-cross-plane.mjs` harness has also been updated to request, approve and consume persisted approval; its full seeded cross-plane scenario is a separate broader qualification.
