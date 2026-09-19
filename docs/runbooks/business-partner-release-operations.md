# Business Partner release operations

Status: local R8 operations baseline; target-environment rehearsal required

This runbook covers Business Partner definition simulation, qualification-proof
inspection and release triage. The Studio proof workspace is read-only. It does
not authorize publication, workflow decisions, replay, database repair or
production certification.

## Definition simulation

1. Open **Business Partner → Operations & Proof** in Studio.
2. Paste the complete proposed definition bundle and select every intended
   consumer plane.
3. Supply the immutable prior revision ID when evaluating an upgrade.
4. Run the simulation and retain the source and compiled hashes for each plane.
5. Treat any schema removal, workflow-stage removal, version downgrade, source
   hash mismatch or unsafe MESH projection as blocking.

A compatible simulation is evidence for review, not permission to publish. An
independent actor must use the publication command, which recompiles and
rechecks compatibility against the latest approved/published release.

## Authoring and independent approval

1. Open **Business Partner → Publication**. Paste a complete governed bundle or
   load a revision by ID and choose **Copy into new draft**. Advance the semantic
   version and apply any section edits before simulation.
2. Select the consumers and prior comparison revision, then simulate. Editing the
   draft or consumers clears the result. Save only after a successful simulation.
3. Retain the saved revision ID and source hash for the independent checker.
4. In a separately authenticated checker session with publish permission, load
   that revision in **Review and approve release**. Review the immutable content,
   author, hash, consumers and minimum runtime version, then confirm approval.
5. Choose **Approve and queue release** and retain the release ID and compilation
   job ID. Approval/queue success does not prove deployment or consumer adoption.
6. Inspect publication deployment and consumer evidence through the existing
   operations procedures. Keep production qualification blocked until its five
   receipt gates pass.

The server rejects self-publication. An ambiguous command failure can be retried
in the same mounted workspace using the same idempotency key. After navigation
or a session change, reconcile existing revision/release evidence before retrying;
the workspace does not persist retry keys across sessions.

## Proof inspection

The proof viewer exposes scenario status and repository evidence coordinates.
It must not render credentials, request payloads, protected evidence, candidate
data, bank values or notification addresses. `local_verified` means the listed
local checks passed. `environment_required` and `blocked` must remain visible
until a retained target-environment receipt exists.

Before qualification, verify that evidence files exist, hashes and source
revision agree, all named actors are distinct where maker/checker applies, and
the report still states `productionQualified: false` unless every certification
gate has passed.

## Triage and recovery

| Symptom                   | First check                                   | Authorized recovery boundary                                   |
| ------------------------- | --------------------------------------------- | -------------------------------------------------------------- |
| Simulation rejects        | Error code and prior revision coordinate      | Correct the draft; never edit the prior revision               |
| Publication compile fails | Simulation hashes versus queued release       | Publication authority retry after defect review                |
| Projection is stale       | Target active release and deployment evidence | Publication deployment/reconciliation command                  |
| Case or outbox is stuck   | Version, owner, attempts and correlation ID   | Domain/workflow/notification operation from the owning runbook |
| IAM or MESH drift         | Desired versus applied version/hash           | Owning reconciliation command; no direct table update          |
| Qualification is blocked  | Every listed environment blocker              | Re-run the missing target check and retain a sanitized receipt |

After recovery, rerun the relevant deterministic simulation or verifier, retain
the sanitized command/test receipt and confirm no new idempotency key duplicated
the domain effect. Production qualification remains blocked until target
database, cross-plane, security/privacy, accessibility, operations, rollback and
named ownership evidence have all been retained and certified.

## R8 production qualification receipts

Run `pnpm qualify:business-partner-r8` before and after attaching any receipt.
The verifier reads
`governance/config/governance/business-partner-r8-qualification.v1.json` and
rejects a production claim unless all five gates are `passed` with valid
receipts below `governance/evidence/business-partner/r8/`.

Every receipt uses schema
`athyper.business-partner-r8-evidence-receipt/1`, identifies its exact gate,
states `environment: production`, records start/completion timestamps and the
full source Git revision, carries a SHA-256 content digest, and states
`sanitized: true`. Do not retain passwords, tokens, authorization headers,
private keys, email addresses, database URLs or protected business payloads.

1. For `target_evidence_lifecycle`, retain an immutable evidence location
   reference and a retention deadline at least 90 days after completion.
2. For `manual_accessibility`, a named reviewer records WCAG 2.2 AA, 200% zoom,
   desktop and phone viewports, and at least one real assistive technology.
   Automated results supplement but never replace this receipt.
3. For `clean_upgrade_parity`, provision distinct clean and supported-upgrade
   databases, run the live catalog parity command from the manifest, and retain
   sanitized database references with exactly zero drift.
4. For `production_canary_rollback`, run the existing publication canary
   operation. Retain Studio, Neon and MESH correlation IDs and prove that the
   exact prior active heads were restored on all three planes.
5. For `named_owner_certification`, product, engineering, operations and
   security/privacy owners must be four distinct named people with timestamps.

Set a gate to `passed` and its `receipt` path only after that receipt has been
reviewed and retained. The verifier intentionally fails if the manifest claims
qualification early or if a receipt is missing, outside the evidence directory,
malformed, incomplete or appears to contain sensitive material.

## R8 executable intake

Use this runbook for R8 target prerequisites, manual review steps,
parity/canary collection and owner sign-off. Run
`pnpm preflight:business-partner-r8` before target work.
Generate additional review packets with `pnpm prepare:business-partner-r8
--packet=<unique-id>`. Record completed sanitized artifacts with
`pnpm record:business-partner-r8 --input=<artifact.json>`; this validates retained
bytes and updates the gate without hand-editing pass state. Drafts cannot pass.
The four owner certifications must pin the exact prerequisite receipt hashes.
