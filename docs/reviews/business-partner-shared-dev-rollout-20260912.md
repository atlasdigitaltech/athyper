# Business Partner — shared DEV NEON rollout

## Current workflow decision

The user selected **direct DEV development → QA release qualification**. Local
preview and the isolated BP environment are no longer stages in this workflow.
Develop and integrate against the existing DEV source workspace and normal DEV
Studio/NEON URLs. After DEV passes, freeze one candidate for QA. Existing isolated
evidence remains historical; do not repeat its build sequence for each DEV edit.

DEV already runs the source workspace with all six applications healthy. Use
`pnpm dev:workspace status` to check it; no environment switch is necessary.
The ordinary DEV source process handles development builds. Use
`pnpm dev:workspace build` only when a DEV container build is actually needed,
and freeze the tested source for QA after integration is complete.

Generated `.next-*` directories are excluded from Git and Docker build contexts.
Keep real source changes and reviewed qualification records for commit review.
Do not bulk-stage the working tree or delete evidence as build cleanup.

The user completed the isolated manual walkthrough and reported **no blockers** on
12 September 2026. Proceed with the accepted NEON scope. Manual walkthrough access
has been revoked. No shared DEV deployment, grant or enforcement activation has
been performed by this preflight.

## Next deliverable and estimate

The next deliverable is the accepted BP journey running in shared DEV through
NEON, with release-bound regression and reviewed operational access. Allow
**1–2 focused working days as a provisional planning estimate**, subject to the
upgrade rehearsal and normal-host qualification. This is not an estimate for the
whole BP backlog or a promise of unattended elapsed time.

| Step | Work and exit criterion |
| --- | --- |
| Prepare candidate | Freeze reviewed source; reconcile existing database state with required migrations; prepare exact artifacts, bindings and rollback. |
| Promote | Apply the rehearsed data-preserving upgrade and publish/install the reviewed contracts through the supported Studio/runtime path. Verify actual API, worker and NEON bindings. |
| Qualify | Run company lifecycle, independent approval/application, import/export, child authorization, populated field/reveal/count checks, Finance journal activity, scoped Atlas retrieval and revocation/recovery against that same release. |
| Enable normal use | Review operational roles, obtain the separately required enforcement approval, activate and verify requester/reviewer journeys; close evidence and cleanup. |

No new temporary grant window is requested for preparation. Normal sign-in is
needed when authenticated execution is ready. Existing expired or revoked access
must remain expired or revoked. Acceptance of the 66 dispositions remains recorded;
reopen only changes introduced by the promoted release or newly observed differences.

## Verified promotion gaps

- Shared DEV runs the mounted source workspace. The isolated pilot uses pinned
  images and an isolated qualification entrypoint. Copying that entrypoint into
  shared DEV is not the supported promotion path.
- Normal host source already includes BP case authority, governed import routes
  and Finance journal activity wiring. Presence in source is not live qualification.
- Shared NEON has no runtime release activation heads. The isolated NEON database
  has the five accepted BP/dependency heads. Their hashes are retained in preflight.
- Shared databases already contain company ownership columns, the trigger and the
  draft function. Do not replay the old additive migration blindly.
- Shared NEON lacks the company approver function and reveal audit contract; its
  company materialization function differs from the accepted isolated function.
  The lifecycle migration is in the NEON manifest, but the reveal audit migration
  is not. Reconcile this before an upgrade rehearsal.
- Shared Studio lacks the document collection publication function. Its migration
  is already listed in the Studio manifest. Other Studio prerequisites still need
  rehearsal; this inventory is not a full schema comparison.
- The normal deployment loader requires a release/image-bound signed enforcement
  approval with qualification coverage. The isolated-host bypass is not reusable
  approval evidence for shared DEV.

## Validation and evidence

Current source regression passed **298 tests in six groups** (publication,
authorization, commands/providers/import/Atlas, runtime bindings, Studio and NEON).
Source remained unchanged during the run. This is source/service/route/UI-contract
evidence, not an authenticated release-level regression.

- [Readiness inventory and regression binding](../../governance/policy/reports/business-partner-shared-dev-promotion-readiness-20260912.dev.json)
- [Initial runtime preflight](../../governance/policy/reports/business-partner-shared-dev-promotion-preflight-20260912.dev.json)
- [Manual access revocation](../../governance/policy/reports/business-partner-manual-ui-revocation-20260912.dev.json)
- [Accepted isolated closure](../../governance/policy/reports/business-partner-final-closure-accepted-20260912.dev.json)

## Scope retained for later

Generic direct create/update and other deferred operations, compatibility
retirement, broader Atlas conversations/insights/assistance, and production
certification remain separate workstreams. Mesh remains excluded. Global/legal
entity ownership and cross-instance revocation synchronization are not selected.
Their completion is not part of this DEV milestone.
