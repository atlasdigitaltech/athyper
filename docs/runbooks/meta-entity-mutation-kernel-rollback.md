# Meta-entity mutation-kernel rollback

Owner: Records Platform. Scope every rollback by entity, operation, and tenant cohort.

Rollback on authorization/tenant/parity mismatch, duplicate idempotent writes, non-atomic audit/outbox behavior, unapproved p95 regression above 15%, SQL/transaction budget breach, or kernel-caused conflict spikes.

1. Move only the affected `mutation_kernel.{operation}.{entity}` cohort to `dual_read_comparison` or `shadow_validation`.
2. Confirm `allowDualWriteBusinessData` remains false. One request must never reach two authoritative writers.
3. Preserve completed idempotency rows and stable event keys; do not replay successful commands.
4. Verify compatibility traffic rises and the new kernel performs validation/comparison only.
5. Run tenant isolation, permission revocation, strict-field rejection, version/lock conflict, audit/outbox rollback, and deterministic replay qualification.
6. Record the rollback time, cohort, last event key, and qualification artifact.

Promotion restarts at internal tenants, then the small external cohort. Full rollout requires a fresh stable-environment report. Compatibility deletion additionally requires zero traffic for the full release window and passing retirement evidence.
