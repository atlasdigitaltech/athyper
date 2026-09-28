# Compiled publication signature representation correction

## Completed successor publication

Country release 6 (`fd5d1272-8447-4a50-a59d-d2c0d6997a48`) is active on
Studio, Neon and Mesh as of 2026-09-27 20:12:53 UTC. Compatible control/API/worker
readers were reloaded before execution. Independent real admin/owner OTP sessions
submitted and activated policy `2679477a-7057-4503-b663-e40cfd9cbe69`, version 1,
hash `88af021c852bc9667458f5b4c2bd55183caca332a8a8d4ee689ffc75cc1334b9`.

All three database receipts report head version 6, active status, no failure,
valid manifest, compatible runtime and verified Ed25519 outer signature. Each
new payload has no inner release.signature property. Direct JSON comparison of
commentBinding and attachmentBinding against release 5 is equal on every plane.
Historical signed payloads were not rewritten.

| Plane | Applied release |
| --- | --- |
| Studio | 01a0e47f-c211-7b06-844e-02f6701ecd00 |
| Neon | 01a0e47f-c044-7726-bbd7-2727a923bb47 |
| Mesh | 01a0e47f-bffd-7203-ae1f-4738a3cad2cd |

Post-activation signed-in Neon catl.admin Comments and Attachments reads both
returned 200 and the release 6 ID. Saved Mesh/Studio captures remain anonymous;
their release 6 signed-in checks were not performed. No new test business data was
created during this successor check.

Preparation evidence: compiled-signature-successor-baseline-20260928.json,
compiled-signature-successor-draft-20260928.json and
compiled-signature-successor-policy-candidate-20260928.json in this directory.
The rollout instructions below describe the now-completed reader-first sequence.

## Implemented

New compiled release manifests omit the unused inner `signature` property.
`releaseHash` remains a content identity, computed over the same unsigned fields
as before. Authentication continues to use the existing outer Ed25519 signature
over canonical `{ envelope, manifest }`, including the complete payload.

The release reader admits an absent signature. Legacy signature objects are
deprecated, opaque metadata: only known string-valued fields are accepted and
their original values are preserved. Empty objects and historical literal
`"undefined"` values remain readable without manufacturing new strings. Preserving
these bytes is important because the outer signature covers them. Neither legacy
inner metadata nor `contractStatus` is accepted as cryptographic proof.

Historical review-only manifests with null key/value and explicit
`not_signed_do_not_activate` status remain readable as review metadata; the
publication status guard still rejects them. These null/status exceptions do not
apply to published manifests.

The structural admission guard's comments now describe this boundary accurately.
The target loader additionally compares descriptor source entity/release identity
against signed manifest provenance when a descriptor supplies source metadata.
The upstream source release hash and compiled package hash intentionally differ.

Regression coverage exercises valid/invalid real outer Ed25519 signatures, legacy
placeholder preservation, omission in newly compiled output, invalid legacy value
types and signed-but-inconsistent source provenance.

Verification: publication service 348 tests passed, publication contracts 165
passed, platform metadata 83 passed (2 skipped). Publication service, contracts,
metadata and Studio authoring typechecks passed; diff whitespace check passed.

## Rollout and scope

Reader-first deployment is required: older readers required an inner signature
object and cannot consume newly emitted signature-free manifests. Deploy the
updated publication and runtime readers before producing a successor. Historical
release 5 is not rewritten or re-signed; release 6 supersedes it.

This compiler change invalidates the earlier source-build fingerprint for future
execution. Do not alter the approved historical policy to bypass its fingerprint;
any future successor needs its own reviewed current compiler pin and approval.

No additional duplicate signature call, database write grants, activation bypass,
BP metadata, or Country capability-setting changes are introduced. Database
tampering controls remain a separate hardening review; the loader does not protect
against arbitrary privileged writes that bypass publication admission.
