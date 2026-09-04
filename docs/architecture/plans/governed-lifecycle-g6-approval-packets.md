# G6 compatibility-retirement approval packets

G6 requires one independently approved packet for each compatibility surface. A name, checkbox, ticket status, or role label is not an approval. Each approver signs the canonical evidence bundle with a distinct Ed25519 key and immutable authority-record reference.

## Evidence prerequisites

Packet preparation fails unless the selected surface has zero active consumers, a qualifying production zero-use observation, a passing forced-rollback recovery report bound to the current retirement-candidate hash, and matching clean/supported-upgrade immediate pre-retirement catalog and privilege captures.

The bundle contains hashes for the retirement register, consumer inventory, surface production observation, recovery report, retirement candidate, clean parity capture and supported-upgrade parity capture. All three attestations must reference the exact complete hash set.

## Prepare a surface packet

```bash
pnpm --filter @athyper/server-db db:assemble:g6-compatibility-approval -- \
  --mode=prepare \
  --surface=flattened_decision_scope \
  --consumer-inventory=docs/architecture/reports/g6/current-consumer-inventory.json \
  --observation-ledger=config/governance/governed-lifecycle-g6-retirement-observations.v1.json \
  --recovery-report=docs/architecture/reports/g6/recovery/REPLACE-surface.json \
  --clean-pre=docs/architecture/reports/g6/clean-pre-retirement.json \
  --upgrade-pre=docs/architecture/reports/g6/supported-upgrade-pre-retirement.json \
  --output=docs/architecture/reports/g6/approvals/flattened_decision_scope.draft.json \
  --confirm=PREPARE-G6-APPROVAL-PACKET
```

Repeat this for all six registered surfaces. The generated draft contains role-specific attestation templates.

## Attest independently

The surface owner documents consumer cutover and semantic compatibility. The database owner documents migration, backup, reconstruction, locking, privileges and rollback. The release owner documents the deployment window, monitoring, abort criteria and forward-fix plan. Every assertion must be substantive text; `yes`, `true`, `approved`, `ok` and checkbox equivalents are rejected.

After filling an attestation template, canonicalize it:

```bash
pnpm --filter @athyper/server-db db:assemble:g6-compatibility-approval -- \
  --mode=canonicalize \
  --surface=flattened_decision_scope \
  --attestation=docs/architecture/reports/g6/approvals/surface-owner.attestation.json \
  --output=docs/architecture/reports/g6/approvals/surface-owner.canonical \
  --confirm=CANONICALIZE-G6-ATTESTATION
```

Set `attestationHash` to the printed SHA-256, sign the canonical file using the approver-controlled Ed25519 private key, and place the base64 detached signature, public key and SHA-256 SPKI key ID in the attestation. Private keys must never enter the repository or packet.

## Assemble and evaluate

```bash
pnpm --filter @athyper/server-db db:assemble:g6-compatibility-approval -- \
  --mode=assemble \
  --surface=flattened_decision_scope \
  --draft=docs/architecture/reports/g6/approvals/flattened_decision_scope.draft.json \
  --surface-owner-attestation=docs/architecture/reports/g6/approvals/surface-owner.attestation.json \
  --database-owner-attestation=docs/architecture/reports/g6/approvals/database-owner.attestation.json \
  --release-owner-attestation=docs/architecture/reports/g6/approvals/release-owner.attestation.json \
  --output=docs/architecture/reports/g6/approvals/flattened_decision_scope.json \
  --confirm=ASSEMBLE-G6-APPROVAL-PACKET
```

Pass `--approval-dir=docs/architecture/reports/g6/approvals` to the G6 retirement evaluator. It re-hashes referenced files, re-verifies every signature, checks approver independence, and binds the packet to the exact production observation. Editing evidence or an attestation invalidates the packet. Approval packets authorize neither DDL execution nor post-retirement certification by themselves.
