# Preflight persistence mapping — unresolved implementation gate

## Superseding host cleanup — 2026-09-27

The unused `composition/entity-case-preflight.ts` BP repository adapter was
removed, not restored or replaced with a permissive stub. Production composition
had no caller. Historical BP verification harnesses that import it are retired
references and must not be used to qualify the generic runtime. Country's
read-only reference runtime does not require a change-case preflight. The mapping
below remains a requirement for any future generic workflow implementation; this
cleanup does not claim that implementation or relax its authorization checks.

Inspected sources: common/document/03_tables.sql, common/document/07_functions.sql,
common/snapshot/03_tables.sql under server/db/ddl. This describes repository DDL,
not verification of a deployed database. No DDL or persistence reader changed.

## Lifecycle

| Persisted state | Interpretation / contract action |
| --- | --- |
| draft | Editable; submission still requires pinned-contract validation and a valid cycle task |
| submitted, in_review | Distinct persisted states; do not collapse to pending_approval without an explicit service-contract migration |
| approved, rejected | Decision state requires matching accepted decision evidence |
| materializing, materialized | Do not mechanically rename to applying/applied; reconcile materialization command and result evidence first |
| cancelled, conflicted | Preserve distinctly; conflicted is absent from the current TypeScript status union |

The existing contract's validating, validation_failed, returned, failed and
pending_approval states are not this table's vocabulary. The generic reader must
not fabricate them. Prefer a persistence-facing evidence model retaining raw DDL
states, with an explicit evaluator, rather than casting into EntityChangeCaseRecord.

## Evidence mapping

| Requirement | Persisted source and required checks |
| --- | --- |
| Case identity and version | document.entity_case: exact tenant/id, entity_code, operation_code, row_version; use the selected plane's database |
| Contract pin | entity_contract_id + entity_contract_hash joined to runtime_meta.entity_contract; do not call the contract ID a publication release ID without establishing its release relationship |
| Current/submitted/decision snapshots | Corresponding case IDs joined to snapshot.entity_snapshot_identity by tenant/id; require entity_type=document.entity_case, matching entity_id and entity_contract_hash; payload_hash is explicit |
| Payload | snapshot.entity_snapshot joined through its immutable identity, not a caller-supplied payload or a mutable case JSON column |
| Submission actor | Accepted entity.case.submit command evidence whose result_snapshot_id matches submitted_snapshot_id; recorded_by is the actor, not updated_by |
| Approval actor/fingerprint | Accepted entity.case.decision evidence with ENTITY_CASE_APPROVED and approved after_status, matching decision_snapshot_id; recorded_by and request_fingerprint |
| Snapshot correspondence | Verify submitted_from/decided_from lineage links for this tenant/case and snapshot contract identity; approval uses a new decision snapshot, not the same snapshot ID as submission |
| Workflow | governance.cycle_subject binds the case to cycle_run/cycle_task; cross-check command result_evidence cycleRunId/cycleTaskId and primary subject binding |
| Work ownership | cycle_task.owner_principal_id; DDL uses ready/in_progress/completed, not open/claimed |
| Validation findings | document.entity_case_validation groups findings by evaluation_id and evaluated_snapshot_id with pinned ruleset identity; findings alone do not prove a completed successful evaluation |

## Validation completion remains unresolved

The inspected lifecycle command validates the pinned contract inline on submit.
An accepted submission is evidence that this command passed its checks at that
time; it is not a reusable persisted validation result for an editable draft.
The findings table has no evaluation-completion row or outcome/version field.
Zero findings must therefore NOT produce validation.outcome=passed.

Before implementing the reader, trace the validation writer and its completed
command evidence to establish a trustworthy evaluation receipt, snapshot, ruleset
and version relationship. If no such receipt exists, revise the evidence contract
and command workflow explicitly; do not infer one from timestamps or absence.

## Actor separation and transaction boundary

The inspected decision command prevents the creator from deciding, validates the
primary cycle subject, and rejects a nonmatching assigned task owner. It permits
an unassigned owner. The old host preflight additionally required an assigned owner,
elevated assurance, submitter/decider separation and approver/materializer separation.
Preserve those stricter host requirements pending a deliberate policy reconciliation;
do not weaken them to the minimum DDL guard.

Read all evidence in one read-only repeatable-read transaction with tenant/principal
stamping and exact-plane selection. Missing, ambiguous or inconsistent evidence
blocks the governed operation. Authorization remains separate from evidence reading.
Commands must recheck under write locks; successful preflight is not a write grant.

## Reader implementation gate

Unresolved: persisted status contract, completed validation receipt, contract-to-release
pin relationship, exact materialization evidence, and the policy for unassigned tasks.
Until resolved, retain the existing preflight failure rather than installing an
adapter that invents successful evidence. Tests must cover stale versions, changed
snapshots/contracts, cross-tenant/plane reads, missing evaluation receipts, task
ownership and all actor-separation checks before claiming behavioral equivalence.
