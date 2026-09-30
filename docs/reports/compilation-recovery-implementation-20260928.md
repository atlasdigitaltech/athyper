# Generic compilation recovery — 2026-09-28

## Publication completed

At 2026-09-27T16:25Z, the refreshed platform.admin proposal and independent
platform.owner activation completed successfully for recovery policy
`a9953bc3-f508-414a-8b7c-2920074052c0`, version 1, hash
`d0d40bc857eb66694ac2ca84665476df367fb5ae37bfcc9cca7ce2c816512336`.
Execution returned HTTP 200 `recovery_queued`. Recovery compile execution
`01a0e3ae-d5da-754d-804b-9b7052a88ef6` succeeded, followed by all three signing
and dispatch jobs. Country source release 4 is now active on Studio, Neon and
Mesh, each at head version 4. The original failed job and immutable source hash
remain unchanged. No BP metadata was introduced.

See `compilation-recovery-policy-activation-20260928.json` and
`compilation-recovery-activation-baseline-20260928.json` for approval and
per-plane activation evidence. The earlier blocked state below is historical;
publication is no longer pending. Signed-in feature acceptance remains pending.

## Implemented

The failed immutable source can be retried through a separately enrolled,
expiring `athyper.dev-compilation-recovery-policy/1`. New files use generic
compilation-recovery names. No BP metadata, repositories or grants were restored.
Original source signatures, approvals and the failed job remain unchanged.

The policy pins the failed source/job, original and corrected compiler, workload
actors and original per-plane predecessors. Proposal/activation require no
runtime artifacts or compilation yet. Execution checks real workload IAM and
qualifies the live target dependencies before queueing. Compile/sign/dispatch
recheck recovery authority; its evidence is part of the signed qualification
receipt. This does not authorize arbitrary job retries or rewriting artifacts.

## Verification

- Host build passed.
- Host suite: 707 passed, 25 skipped (93 passing suites; 3 skipped).
- Publication service: 332 passed.
- Publication contracts: 139 passed; source/test typechecks passed.
- PostgreSQL rollback integration passed: exact pins, tenant and actor scope,
  runtime/control API roles, no public execute grant, and empty-artifact boundary.
- Worker regression verifies approval rechecks at compile/sign/dispatch and
  changed recovery evidence changing the qualification receipt.
- Execution tests verify committed audit precedes enqueue, deterministic retry
  keys and no queueing after failed authorization/qualification/audit checks.

The DEV read-only guard was installed using
`server/db/scripts/operations/publication/install-compilation-recovery.mjs`.
DDL SHA-256: `14d522cfc3d06a56a32724718db4bdb90bc18039ac6f2f2fe84d5102faf405ae`.
The control API was restarted. No source release writes or activations occurred.

## Current live state and remaining gate

At 2026-09-27T16:14Z, Country release 3 remains active on Studio, Neon and Mesh.
Release 4 (`2ce95226-0b30-4137-aaa0-3594ec946547`) remains the immutable failed
publication source; failed compile job `01a0e38c-1dc5-7ab5-8a83-5ba874654333`
has not been reset or deleted.

The unapproved candidate is `compilation-recovery-policy-candidate-20260928.json`.
It expires at 2026-09-27T20:13:48.983Z and pins compiler
`43182ebd31b24c5f26b0aadefc880590b74aebe037ef5c0a7c644b9605ca2100`.
Regenerate an unapproved candidate if expired or the compiler changes:

```sh
pnpm exec tsx server/db/scripts/operations/publication/prepare-compilation-recovery.ts \
  --release=2ce95226-0b30-4137-aaa0-3594ec946547 \
  --failed-job=01a0e38c-1dc5-7ab5-8a83-5ba874654333
```

Both stored human sessions returned HTTP 401 `AUTH_TOKEN_INVALID`. Fresh real
platform.admin proposal and independent platform.owner activation are required
through the existing publication-policy routes. Then execute with configured
workload credentials and verify signed runtime activation on all planes.
No live recovery approval or execution is claimed by these unit/SQL tests.
Signed-in summary/collaboration, preview generation and indexed-content-search
acceptance still remain after activation.
