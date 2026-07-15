# Purchase Order Phase 0A Exit Gate

Status: implementation complete; database activation and DB-backed scenario
execution remain release-time gates.

## Work-package disposition

| WP | Delivered evidence |
|---|---|
| WP1 | Executable 23-row lifecycle contract and frozen decision matrix. |
| WP2 | Rejected state, canonical transitions, permissions, operations, state masks, and one authoritative action-rule seed. |
| WP3 | Shared submit preflight, atomic workflow creation/source update, approver authorization, no-self-approval, approve/reject/return, and requester withdrawal cleanup. |
| WP4 | Approved-to-active `PO.PLACE_ORDER`; approval hook materializes schedules and commits budget/encumbrance in the workflow transaction. |
| WP5 | Exact hold restoration, activity-aware cancellation/expiry, short close, normal close eligibility, child retirement, and budget release hooks. |
| WP6 | GR/SES-only physical fulfillment derivation, receipt/service reversal recalculation, and invoice-only financial reconciliation. |
| WP7 | Mandatory public/aggregate/profile identity in activity, snapshot, and transactional outbox payloads; material-transition snapshot coverage. |
| WP8 | Contract, policy, path-integration, and workflow suites plus strict SQL seed assertions. |
| WP9 | This evidence record and the deployment checklist below. |

## Automated evidence

- `@athyper/svc-business` typecheck: pass.
- Purchase-order focused tests: 15 pass.
- `@athyper/svc-workflow` suite: 80 pass, 2 intentionally skipped.
- `@athyper/svc-workflow` typecheck: pass.
- `@athyper/svc-records` typecheck: pass.
- Runtime server typecheck: pass.
- Database discovery: pass, 867 SQL files discovered.
- Database status is readable; changed/pending migrations were not applied by
  this implementation run because the shared worktree/database contains
  unrelated pending changes.

## Release activation checklist

Before marking Phase 0A operationally complete in an environment:

1. Review and apply the pending DDL/system-seed batch in an isolated database.
2. Enable strict seed assertions with `app.assert_seed_contracts=on`; the PO
   assertion verifies one operation, permission, activity hook, outbox hook,
   and required material snapshot per active commitment transition.
3. Run the DB-backed lifecycle scenarios with seeded approvers, budget
   allocations, schedules, distributions, receipts, service sheets, invoices,
   and reversal documents.
4. Verify no active hooks remain on the retired standalone `purchase_order`
   lifecycle and that all runtime resolution uses the active `commitment`
   lifecycle through the purchase-order facade.
5. Confirm outbox delivery and hook-execution retry/idempotency in the target
   worker topology.

Phase 0A may be marked complete only after these release checks pass in the
target database. No second commitment subtype should be enabled before then.
