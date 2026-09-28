# DEV entity successor wiring — 2026-09-27

## Follow-up: authenticated proposal, 07:17:52 UTC

`platform.admin` refreshed through the restricted control API with password and
OTP. The pinned successor policy was submitted successfully and is now
`pending_approval`: `50c68cb8-dc24-438b-9054-d7936eb65bca`, version 1, hash
`d2583112edeec4dc6001972f65f066d726cc55adbd5aabd8d8f11b99e708834d`.
The receipt is `entity-successor-policy-proposal-20260927.json`.
Independent `platform.owner` activation is still outstanding. No successor
release was created or dispatched. The implementation checkpoint below records
the state before this proposal.

## Implementation checkpoint

Country is **not ready for manual acceptance**. The active release still has its
historical incomplete authorization projection. No real successor enrollment,
approval or release was created by this checkpoint.

## Implemented and deployed

- The restricted MFA-protected control API accepts the separately versioned
  successor policy, checks the measured compiler source-build identity and
  persisted source/predecessor pins at both proposal and independent activation.
  First-release documents cannot gain successor authority through extra fields.
- The workload route selects the successor workflow explicitly. Live machine
  policy, real workload IAM, maker/checker, revocation and target qualification
  remain required. Human publication permissions were not weakened.
- The restricted successor SQL allocator rechecks enrolled authority, source,
  actors, predecessor and validation under the entity allocation lock. It
  creates a new release with an explicit supersedes link; it never updates the
  historical release. The first-release SQL allocator still denies successors.
- Immutable publication metadata carries the enrolled successor policy. The v3
  scoped compilation reader carries this to worker/host lowering. Compile,
  sign and dispatch require the expected predecessor in the signed manifest.
- Runtime activation compares the exact stored predecessor head under its lock.
  Caller-supplied activation evidence cannot provide missing signed pins.
- Source enrollment initially failed a real runtime-RLS probe because global
  saved graphs were hidden. A tenant/principal-scoped read-only function now
  exposes only the linked successor source; it also works for the restricted
  control API without granting broad metadata/snapshot reads.

DEV Studio received the updated system-publication functions and new successor
functions. Studio, Neon and Mesh received the guarded activation function.
The control API, API and worker were restarted. All three containers are running;
the public unauthenticated control session endpoint returns 401 as required.
This is not evidence of successful authenticated enrollment or entity access.

## Verification

- Studio authoring: typecheck clean; **197 tests passed**.
- Publication service: typecheck clean; **332 tests passed**.
- Host: **682 passed, 25 skipped**. Typecheck retains the one historical
  `entity-case-preflight.ts` missing `KyselyBusinessPartnerCaseRepository` error.
- **7 DEV PostgreSQL tests passed**, using rollback-only fixtures: activation
  comparison on all three planes, missing/stale pin rejection, idempotent replay,
  allocation without enrollment denied, scoped runtime/control source reads,
  wrong-tenant denial, and positive guarded allocation under synthetic independent
  test enrollment. Ephemeral test signing material is **not** trusted DEV release
  evidence. These tests did not create real approvals or successor releases.
- Import-boundary tests cover the new host and authoring modules.
- Operational provisioning/install scripts pass `node --check`.

## Live install receipts

Applied at 07:12:33 UTC. Installation checked that the captured heads were
unchanged before and after each independently committed target migration.

| Target | Installed DDL SHA-256 | Unchanged active applied release | Head version |
|---|---|---|---|
| Studio | `a0d9ebefd63df85377dc02c5d74c614acbab96869c38d6902d484bea698d5355` | `01a0e14b-c3b6-7dec-8926-881234ffc023` | 1 |
| Neon | `b5d9630199699eb9bd77b1f59371703d368432e0ad80b905f33e30fb3be0895b` | `01a0e14b-c387-73b0-90f5-17fa09561d41` | 1 |
| Mesh | `b5d9630199699eb9bd77b1f59371703d368432e0ad80b905f33e30fb3be0895b` | `01a0e14b-c351-78ad-b73a-0e3db00eaef7` | 1 |

Compiler source-build fingerprint measured independently in the control API,
worker and local process: `11f0036c2335e747a976f1436fca80e32d890479cf6818724600c296c4be351e`.
It covers the explicitly listed compilation/authoring/contract sources, signing
canonicalizer, host publication adapters, dependency lock and Node version. It
is not a whole-system binary attestation. Source changes within this scope require
a fresh policy pin. See `compiler-build.ts` for the exact measurement boundary.

The proposed policy document is
`entity-successor-policy-candidate-20260927.json`. It has **no authority** until
submitted and independently activated through authenticated API calls.

## Remaining live gate

1. `platform.admin`: fresh MFA session, submit the exact candidate policy.
2. `platform.owner`: separate fresh MFA session, activate the returned policy hash.
3. Execute with mounted publication workloads, then observe signing, immutable
   storage, per-target dispatch and guarded activation.
4. Verify installed operation bindings and authenticated list/detail, denied
   access, tenant isolation and collaboration on each plane. Do not infer these
   outcomes from passing SQL fixtures or container startup.

No QA, staging or production deployment occurred. No historical source hash,
Country UUID, signed release or activation head was rewritten. These local
receipts are diagnostic evidence, not immutable audit storage.
