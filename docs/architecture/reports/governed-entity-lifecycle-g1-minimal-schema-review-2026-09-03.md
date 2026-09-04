# G1 minimal-schema review

**Status:** Accepted prerequisite; G1 implementation remains in progress  
**Date:** 2026-09-03  
**Authority:** `../decisions/governed-entity-lifecycle.md`

The executable review is `server/db/ddl/governed-entity-lifecycle-minimal-schema-review.v1.json`. CI validation is provided by `db:verify:governed-lifecycle-minimal-schema`.

## Disposition

| Proposed relation                           | Disposition | Reason                                                                                                                                                                     |
| ------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `document.entity_case`                      | Accepted    | No current relation owns a payload-free, contract-pinned proposal head independently of journey and command-delivery state.                                                |
| `document.entity_case_command_evidence`     | Accepted    | `event.command_execution` is mutable and expires; audit and domain ledgers do not enforce case/version/replay identity.                                                    |
| `document.entity_case_validation`           | Accepted    | Searchable case/snapshot/ruleset findings cannot be enforced by snapshots or generic audit and currently duplicate across request families.                                |
| `document.entity_case_materialization`      | Accepted    | Materialization attempt identity and retry lifecycle differ from case state, transient command claiming and member lineage.                                                |
| `snapshot.entity_case_snapshot_lineage`     | Accepted    | Snapshot predecessor chains cannot represent cross-snapshot transformation or member-to-authority provenance.                                                              |
| `governance.cycle_subject`                  | Accepted    | `cycle_run.data` cannot enforce typed pre/post-materialization subjects or their cardinality.                                                                              |
| `metadata.entity_surface_component_binding` | Accepted    | Existing field bindings cannot compose a positioned released surface slice from another entity contract.                                                                   |
| `governance.authority_register`             | Merged      | Authority declarations belong in immutable `runtime_meta.applied_release_payload` artifacts and generated CI inventories; a second lifecycle table would create drift.     |
| `mesh.network_relationship_capability`      | Accepted    | Relationship status and metadata cannot enforce independent capability episodes, approvals, non-overlap or bilateral authorization. Construction remains scheduled for G3. |

## Guardrails for the next implementation slice

- Add no generic proposal JSON to `document.entity_case`.
- Keep `event.command_execution` as the transient command claim and make case evidence append-only with case retention.
- Keep complete validation input/output in immutable snapshots; the validation table is a bounded search projection only.
- Put materialization member mappings in lineage, not in the materialization attempt.
- Add `cycle_subject`; do not create another journey table.
- Project the authority register as a signed/applied release payload and compare it to functions, triggers and grants in CI.
- Do not add the accepted MESH capability relation during the G1 document pipeline slice; its bilateral RLS and command lifecycle are implemented in G3.

## Verification

```text
PASS all nine G1 relations reviewed: 8 accepted, 1 merged, 0 rejected
PASS server/db TypeScript typecheck
PASS git diff --check
```

The accepted canonical foundation is now present and compiles from empty Studio, NEON and MESH databases. It adds a payload-free, contract/hash/form-release-pinned case head; durable command, validation and materialization evidence; typed cycle subjects; immutable snapshot lineage; and Studio surface-component bindings. The merged authority register remains an applied-release artifact rather than a table, and the MESH capability remains owned by G3.

Forward migrations now construct the six common relations on Studio, NEON and MESH and the surface component binding on Studio. They compiled on the populated supported-upgrade databases. A live three-plane catalog probe verifies RLS/FORCE RLS, tenant-composite contract/snapshot/case constraints, command idempotency identity, immutable evidence triggers, absence of proposal payload columns and zero PUBLIC table grants.

The canonical common DDL now includes a command-owned draft path. It validates the pinned published Entity contract and complete optional form-release coordinate, bounds and canonicalizes JSON through `jsonb`, captures every accepted version through the immutable snapshot API, enforces optimistic versions and exact request-fingerprint replay, and performs recursive deletion-aware three-way merge. Overlapping edits return sorted JSON-pointer conflict paths without overwriting the current snapshot. Case state, permanent case command evidence, transient command execution and outbox intent commit in one transaction; a trigger rejects direct case writes.

A clean rollback probe passes create, exact replay, ordinary revision, non-overlapping stale-base merge, overlapping conflict, contract rejection, source snapshot counts and direct-write denial. The shared draft-command migration compiled on the populated supported-upgrade Studio, NEON and MESH databases, and all three manifests now install it after the case foundation. A live two-session NEON probe proves serialized non-overlapping merge, overlapping conflict, exact concurrent replay and atomic evidence/outbox/snapshot counts; it removes only its generated fixtures afterward.

The shared lifecycle command now owns `submit`, `approve` and `reject`. Submit revalidates the pinned contract, captures a submitted snapshot, records immutable lineage, binds the case as the primary typed cycle subject and starts the cycle run/task atomically. Decision requires a different actor from the case creator, enforces the assigned task owner and exact case version, captures decision snapshot/lineage, completes the task and eligible run, and records case evidence, audit execution and outbox in the same transaction. Clean and supported-upgrade rollback probes cover approval, rejection, exact replay, stale version, wrong tenant, maker-checker denial and required rejection reason.

NEON now has the first domain-owned materializer for an approved internal-only Business Partner registration. It accepts only the bounded internal organization payload, creates the normalized Business Partner and invokes the existing S5 lifecycle command for activation. It revalidates normalized snapshot content against the pinned contract, then atomically records the result snapshot, materialization attempt, authority lineage, case transition, durable case evidence, command audit and outbox. Replay returns the same Business Partner, snapshot and outbox; stale execution leaves no command record. The adapter has no MESH dependency and creates no supplier or customer role. G1 remains open for application consumer cutover and the remaining supplier/customer domain materializers.
