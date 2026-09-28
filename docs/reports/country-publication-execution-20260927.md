# DEV Country publication execution — 2026-09-27

## Outcome

Publication was attempted through the enrolled workload endpoint, not through
direct release inserts. **Country is not published or activated.**

Fresh inventory at 04:45:10 UTC is recorded in the adjacent JSON receipt. It is
local diagnostic evidence, not immutable audit storage.

| Stage | Verified live state |
| --- | --- |
| Canonical source | `bded3c66-95b6-43b9-b8fd-df8e003e54e9`, draft, lock version 1, original source hash unchanged |
| Studio authoring releases | 0 |
| Studio publication releases / deployments | 0 / 0 |
| Studio / Neon / Mesh activation heads | 0 / 0 / 0 |
| Country data | 247 rows in each plane, unchanged |
| API / worker | Running, healthy, dedicated scoped publication configuration mounted read-only |

## Execution fixes applied

1. Added `control.publication_policy_enrollment_is_active` as a narrowly scoped
   boolean evidence reader. Ordinary principal RLS had hidden the independent
   reviewer from the publisher; no principal-table visibility was broadened.
   Exact publisher/tenant probes returned true; wrong tenant/actor returned false.
   The reviewer row remained unreadable under the runtime role.
2. Connected the active machine policy to edit, submit and review authorization,
   not only automated publish. Each still requires its actual scoped role grant,
   enrolled actor, exact source and persisted actor-separation evidence.
3. Installed the nine declared `common.collaboration.comment.*` and
   `common.collaboration.attachment.*` permissions using an exact deterministic
   catalog seed on Studio, Neon and Mesh. The seed was applied twice per plane to
   verify idempotency. It adds tenant-exact capability catalog entries only: no
   role grants and no reference-record write permission. Read/download risk is
   low; tenant-local mutations are medium. The existing reference-view-only
   entity operation projection remains unchanged.
4. Corrected capability qualification: comment revisions are written by the
   security-definer capture trigger, not by direct runtime INSERT. Qualification
   now verifies capture, numbering and immutability triggers plus table RLS/read
   access. No database privileges were added for revision writes.
5. Restarted DEV API and worker to load implementation changes. Public failures
   remain sanitized; server logs carry constrained diagnostic codes.

Source DDL: `planes/studio/control/13_publication_policy_evidence.sql` and
`common/authz/18_common_collaboration_permissions.sql`. These targeted statements
were applied to DEV; no full-schema deployment was performed.

## Current root cause — not a stale source revision

Last request `e1f20502-1aa7-46d8-ac96-7c82f47ab498` passed target qualification and
failed in `KyselyMetaEntityAuthoringRepository.recordValidation` at the source
row lock, before persisting validation or submitting the draft.

A rolled-back live probe with role `athyper_runtime`, the authority tenant and
the exact enrolled author showed:

```json
{"visible": 1, "lockable": 0}
```

`metadata.entity_change_set_tenant_read` admits global rows. Its UPDATE policy
only admits tenant-owned rows. PostgreSQL applies that update visibility to
`SELECT FOR UPDATE`, so the repository reports a revision conflict for an RLS
denial. The actual lock version is still 1.

The same implementation boundary also covers validation snapshot insertion,
submit/review transitions and system-owned release creation. Fixing only this
first row lock would not complete that boundary. Tenant-global UPDATE grants or
running the workflow through `athyperadmin` are not acceptable fixes.

## Required next implementation

Implement a restricted database command path for enrolled system-owned
publication, scoped to the independently activated policy, authority tenant,
author/publisher, exact source pins and lifecycle transition. Preserve ordinary
tenant RLS, immutable source/validation evidence, independent review and the
normal signing/preparation/worker pipeline. Denial tests must cover an ordinary
tenant actor, wrong workload, wrong source, revoked/superseded enrollment and
changed pins. This is a database authorization implementation gap, not another
session refresh or human approval request.

After that path passes live role-isolation tests, rerun the same enrolled
workflow and verify compilation/signing, dispatch, receipts and active heads
independently for all three targets. No target success is implied by the current
prerequisite qualification pass. Comment/attachment user grants and live browser
acceptance remain separate from merely having catalog entries.

## Fresh verification

- Host full suite: **671 passed, 25 skipped**, 88 files passed, 3 skipped.
- Common collaboration seed contract test: **1 passed** (after correcting its
  test-only import to the existing contract source).
- Host typecheck: exactly the previously held preflight import diagnostic;
  no clean compilation claim.
- Capability qualification checks passed during the live workflow for all three
  targets before the authoring row-lock failure.
- Country source, policy pins, historical drafts and reference records unchanged.
- No release, signing success, worker delivery, activation, rollback or manual
  app readiness is claimed. QA, staging and production were not changed.

Reproduce inventory using
`pnpm --filter @athyper/server-db exec tsx scripts/operations/publication/inventory-dev-entity-product.ts --product=<repository>/metadata/products/shared/entities/country`.
