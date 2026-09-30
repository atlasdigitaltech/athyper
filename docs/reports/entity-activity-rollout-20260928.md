# Activity DEV rollout — 2026-09-28

## Current outcome

Reusable root, aggregate/domain recording, and hard/soft-delete adapters are implemented and tested. The DEV schema/catalog is installed and the source API, worker and restricted control API are healthy after restart. **Country Activity release 9 is published and active on Studio, Neon and Mesh.** All three targets report verified Ed25519 signatures, valid manifests and runtime compatibility. Authenticated application manual acceptance remains to be performed.

The successor draft is `3a38a9c2-8797-4de0-bd1a-3a6315a21a50`, revision 2. The exact publication policy is `entity.successor.b7e5b981-2227-4720-ba5d-040a48ab6842.9.activity`. It preserves Country's read-only reference behavior and enrolls its inherited `platform.activity.standard` v1 Activity capability. Versions and automatic capture stay disabled for Country. No Country rows or user role grants were changed. Authenticated maker/checker approval and governed activation advanced the heads from release 8 to release 9.

## Evidence

- [Installation receipt](activity-dev-install-20260928.json): Studio authoring constraint; canonical permission definitions on all three planes; immutable history ledger on all three planes.
- [Persistence preflight](activity-dev-persistence-preflight-20260928.json): runtime ledger/audit/snapshot privileges and capture execute privilege verified on all three planes.
- [Compiler preflight](activity-dev-compiler-preflight-20260928.json): candidate identity matches API, worker and control API.
- [Runtime receipt](activity-dev-runtime-20260928.json): healthy API/worker/control API; unchanged release heads; restricted control session returned HTTP 401 without authenticated bearer context.
- [Live baseline](activity-successor-baseline-20260928.json) and [postflight](activity-successor-postflight-20260928.json): release 8 predecessor pins are unchanged.
- [Saved successor draft](activity-successor-draft-20260928.json): actual draft, replay and stale-predecessor checks passed.
- [Publication-policy candidate](activity-successor-policy-candidate-20260928.json): exact source/target/compiler pins; parsed successfully. This file is a reviewable proposal, not an enrolled or approved policy.

## Governed publication procedure (completed)

The restricted control API requires a fresh platform-control bearer context with `x-plane: studio`. The existing machine publication credentials can execute an independently activated policy; they cannot propose or approve it. This requirement is enforced by [policy enrollment routes](../../server/apps/platform-host/src/composition/shared/publication/policy-enrollment-routes.ts) and [workload execution](../../server/apps/platform-host/src/composition/shared/publication/workload-routes.ts).

1. An authorized proposer authenticates with the platform-control realm and MFA, then POSTs the candidate to `https://api.dev.athyper.test/api/studio/publication-policies`.
2. An independent authorized approver authenticates separately and POSTs `{"expectedHash":"<returned policy hash>"}` to `/api/studio/publication-policies/<policy UUID>/activate`.
3. Execute the resulting exact policy version/hash through `/api/studio/publication-policies/<policy UUID>/execute`, using the installed author/publisher workload credentials. Recheck the candidate's compiler identity and release heads first; regenerate the candidate if either changed.
4. Observe signed release dispatch and successful activation receipts on all three planes. Confirm the installed Activity binding, actual runtime persistence privileges, and current authorized user access. Catalog registration itself grants no user permission.
5. Complete the manual checks below. This report does not mark Phase 6 complete.

Do not put bearer tokens, passwords, OTP values or workload secrets into reports or chat. Initially, no valid platform-control session was available. The user subsequently completed separate browser password/OTP logins as platform.admin and platform.owner. Proposal and approval used those verified identities; execution used the installed workload credentials.

## Country manual checks after publication

Open Country through Studio, Neon and Mesh at `/app/entity/country/manage`, then select the same Country record in the intended plane/tenant.

| Check | Expected result |
|---|---|
| Footer and full navigation | Comments, Files/Attachments, Activity; current metadata remains in Record information |
| Activity views | Audit log and Saved snapshots when authorized; no Versions tab |
| Side/full switch | Same selection and usable layout in either view |
| Audit query | Correct record scope, date filtering and pagination; empty history is valid when no matching events exist |
| Manual snapshot | Capture, list, read and compare an immutable tenant-local copy |
| Restricted viewer | Missing query/read/capture permissions hide or deny the corresponding action; field access remains enforced |
| Isolation | A snapshot from another tenant or record cannot be read or compared |

Canonical permissions remain `common.audit.event.query`, `common.records.snapshot.read`, and `common.records.snapshot.capture`; the existing service aliases remain unchanged. Use existing governed role/profile administration for any test-user grants.

## SQL experiment: what it proves

Country data lives in `shared.country` and is shared reference data without a tenant key or authoritative record counter. A direct SQL name change does not invoke the recording adapters. It must not be presented as a version, automatic snapshot, or guaranteed business audit event.

For an isolated database copy, or a specifically agreed DEV reference-data test:

1. Select one record and retain its original `name` and identity. Capture manual snapshot A through the UI.
2. Commit a narrowly scoped SQL update of that record's `name`, checking both its ID and expected original name. Respect existing audit-column constraints. An uncommitted update in a different connection is not visible to browser capture.
3. Refresh the record and capture manual snapshot B. Compare A and B: the authorized `name` field should show the change.
4. Restore the original name with an expected-current-value condition. Optionally capture C to verify restoration. A and B remain immutable.

The same experiment cannot validate automatic Versions. Use the disposable transactional integration suite for that; it invokes the actual record service, snapshot functions and immutable ledger. No SQL experiment was performed against live Country during this task.

## Validation and implementation limits

- Publication contracts: **213 passed**; Records: **313 passed**, four opt-in database cases skipped in the ordinary run.
- Explicit isolated PostgreSQL Activity test: **passed**, including owned child-only mutation, domain mutation, stale versions, replay/change-set conflicts, hard/soft deletion, and atomic rollback when required capture fails.
- Focused host Activity suites: **22 passed**. Offline Country preparation: **5 passed**.
- Records and publication source/test typechecks pass. Host typecheck retains the pre-existing attachment fixture missing `failInspection` in `qualify-document-malware.ts:279`.
- No CSS changed in this adapter deliverable. Earlier Activity browser checks passed; the existing repository-wide style-token findings remain outside this change.
- Aggregate/domain code is reusable infrastructure with explicit deployment registrations. No production domain writer was invented or enrolled. Owned collection payloads are retained server-side; the current comparison UI still exposes authorized root fields. Deleted records remain denied by current parent admission unless a future retained-parent authorization contract is provided.

## Authenticated proposal follow-up

The refreshed `platform.admin` password/OTP session successfully proposed policy `7c654f0a-74f4-4f4c-9e6d-31e67e53812d`, version 1, hash `417f8b978a770493260231caf3bb2d2c0f022f6b7f9cb5f879367d5d32b0f7bd`. Status is `pending_approval`; see [proposal receipt](activity-successor-policy-proposal-20260928.json). Separate `platform.owner` browser MFA has been started for independent activation. Publication and Country activation are not yet complete.

## Publication completed — 06:58 UTC

The independent `platform.owner` approval activated policy `7c654f0a-74f4-4f4c-9e6d-31e67e53812d`, version 1. Workload execution created and dispatched Country release **9**, `39f1958f-facd-4d9d-b53b-989aaecc307d`. Studio, Neon and Mesh all activated that release with verified signatures and the exact Activity binding: Audit Log and Saved Snapshots, manual capture enabled, automatic capture disabled, no recording/Versions enrollment.

- [Independent policy activation](activity-successor-policy-activation-20260928.json)
- [Workload execution](activity-successor-execution-20260928.json)
- [Target activation and installed Activity binding receipts](activity-successor-target-receipts-20260928.json)

Post-publication review found the browser relay was missing the Activity route allowlist. Added the seven exact endpoints to the reusable record-runtime relay group used by all three applications. Capture keeps mandatory idempotency; both POST endpoints keep CSRF/origin checks; tenant/plane context comes only from the verified session. Relay typecheck passes and **43 relay/composition/security tests pass**, including the new three-plane Activity checks. Source DEV Next.js apps reload the shared module.

The saved Neon application session returned HTTP 401, so signed-in browser/manual acceptance is not claimed. Platform-control sessions cannot substitute for tenant application sessions. Sign in to the desired application with an authorized account and follow the Country checks above. No manual snapshot or SQL data modification was performed by this publication step.

## Full-admin permission repair

The missing Activity tab was traced to the full-admin permission snapshot: the three published Activity permissions had not been added to `test.full_admin`. At the user's explicit request, the existing additive DEV reconciliation script was run on Studio, Neon and Mesh. It added `common.audit.event.query`, `common.records.snapshot.read`, and `common.records.snapshot.capture` to the existing Athyper and CirrusAtlantic tenant full-admin roles (six additions per plane). A second check found zero missing published permissions.

Active membership/role chains verify all three permissions for `athyper.admin`, `athyper.owner`, `catl.admin`, and `catl.owner` on each plane. Scope assignments and memberships are unchanged. Existing authorization invalidation triggers remain in use. Two reconciliation-script tests pass. Refresh the application session (sign out/in if needed) and reload the Country detail descriptor to update tab visibility; a live signed-in browser rendering is not claimed by these database checks.

Evidence: [grant receipts](activity-full-admin-grants-20260928.jsonl), [active assignment verification](activity-full-admin-access-20260928.json).
