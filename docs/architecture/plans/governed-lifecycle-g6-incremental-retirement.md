# G6 incremental compatibility retirement

G6 retires exactly one surface per reviewed release in the order recorded by `governed-lifecycle-g6-retirement-sequence.v1.json`. The migrations under `server/db/retirements/g6` are deliberately absent from the active forward-migration manifest. A batch, skipped predecessor, changed migration hash, missing signed packet or mismatched database identity is rejected.

## Per-surface release sequence

1. Run `db:inventory:governed-lifecycle-g6-consumers` into a new immutable report and review zero runtime references for the selected surface.
2. Close the final production observation checkpoint. The observation must bind the refreshed inventory and connected production database identity.
3. Capture clean and supported-upgrade `pre_retirement` catalog and privilege evidence immediately before approval.
4. Run the isolated-backup recovery rehearsal and assemble the three-signature surface approval packet. Re-run the G6 evaluator with the inventory, parity captures and approval directory; the selected row must be `eligible_to_schedule_retirement`.
5. Apply the one surface migration separately to production, a newly built clean database and a newly restored supported-upgrade database. Use `db:apply:g6-compatibility-retirement`; its confirmation string binds the surface, packet and migration hashes. SQL execution uses one transaction, a transaction advisory lock, a five-second lock timeout and a fifteen-minute statement timeout. Any error rolls back.
6. Run rollback-contained negative, exact-replay, tenant-isolation, audit and privilege probes against the retired version and record `athyper.g6-post-retirement-behavioral-probes` evidence. A structural absence check is already mandatory inside the apply transaction; it does not replace behavioral probes.
7. Provision clean and pinned supported-upgrade databases from scratch for the exact release revision, apply the same signed migration hash, and retain their application receipts and build logs.
8. Capture `post_retirement` parity from both disposable databases.
9. Run `db:certify:g6-compatibility-retirement` with the three application receipts, behavioral probe evidence and both post captures. It compares catalog rows and privilege rows exactly, not only their reported hashes.
10. If migration, probes, build or parity fails, stop the release. The migration is forward-only: rollback uses the rehearsed backup/reconstruction procedure before traffic resumes, otherwise deploy a separately reviewed forward fix. Never edit or silently retry the failed migration artifact.

The documentation surface is the first release. Its application action verifies that the temporary inventory has actually been removed by the reviewed release commit and records Git-based recovery; it performs no database mutation. After each certification, publish a new reviewed sequence-state revision advancing `certifiedThroughOrder` by exactly one and naming the next surface. Automation must never update that authority merely because a command exited successfully.

No current surface is eligible. Therefore none of the staged migration files is active and this runbook does not authorize execution.

Local-development exception (2026-09-04): the repository owner explicitly authorized destructive retirement despite one unbackfilled applied request and active legacy request consumers. All six local surfaces are retired and recorded in `docs/architecture/reports/g6/local-development-retirement-2026-09-04.json`. This exception does not alter the production state or authorize production execution.

## Local-development cleanup

A disposable local-development environment may evaluate retirement without a
production observation window by passing
`--execution-context=local_development` to
`db:evaluate:governed-lifecycle-g6-retirement`. This is a development-only
checkpoint waiver: it sets the required observation duration to zero and uses
the freshly generated source-consumer inventory as the cutover proof.

The waiver never authorizes a production retirement. Zero active consumers,
the isolated-clone recovery rehearsal, three independently signed approvals,
clean/supported-upgrade pre-parity, behavioral probes and post-parity remain
mandatory. In particular, the Business Partner request family cannot be
removed while its request repository or invitation facade still accesses the
legacy tables.
