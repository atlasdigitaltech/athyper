# Server Platform Host closure qualification report

Status: **local qualification partial; staging is blocked**  
Captured: 2026-08-10T10:25:33Z  
Branch: `refactor/three-plane-packages`  
Baseline commit: `951299c22c366c153055d8f3515da2c54211c614`  
Worktree: intentionally dirty; no clean, reset, checkout, or stash was performed

## Decision

Closure Increments A through D are implemented and locally verified. Increment E
has passed workspace resolution, architecture policies, aggregate server
typecheck/tests/build, the static DDL model, compose rendering, and production
image build/inspection. It is **not complete** because the evidence was produced
from the preserved dirty worktree rather than a clean candidate revision, the
deployment-profile registry is stale, and disposable three-plane/process
qualification has not been executed.

Increment F must not start until the deferred legacy dispositions are approved
or closed and Gate E is repeated from an immutable clean candidate.

## Executed evidence

| Gate | Result | Evidence |
| --- | --- | --- |
| A — baseline and backup | Pass | `server-backup` contains 2,059 files, all byte-identical to the baseline commit's `server/` tree. Restore source and tree hash are recorded in the baseline report. |
| B — naming and source accuracy | Pass | Root orchestrator is private `@athyper/server-workspace`; worker/scheduler comments describe active composition; host typecheck, 53 tests, and build passed. |
| C — architecture enforcement | Pass | Rebuild-boundary policy and 12 fixture tests pass. It enforces identity, kernel absence, import boundaries/direction, Foundation isolation, dependencies, contract ownership, and backup isolation. |
| D — inventory | Pass with deferred work | Deterministic inventory check passes for 1,937 items. All items are classified; 1,216 are explicitly deferred and therefore block Gate F. |
| E — workspace/package checks | Pass locally | Workspace resolution reports 150 active packages. Server aggregate typecheck, tests, and build pass across 66 active server packages. Canonical-package, Docker-workspace, rebuild-boundary, inventory, and DDL-model checks pass. |
| E — compose rendering | Pass locally | `stack/compose/apps/athyper-apps.yml` renders with `--no-interpolate --quiet`. |
| E — production image | Pass locally | `athyper-platform-host:closure-local` built successfully. Digest: `sha256:a2d9abb1616c33eb85ee3df29e4020bbb080bb1677da8538496e919085bbd0a2`; size: 80,733,506 bytes. Runtime entry point exists and `server-backup` is absent. |
| E — clean revision | Pending | Current evidence is intentionally tied to a dirty working tree, not a candidate commit. |
| E — live disposable infrastructure | Pending | Studio/Neon/Mesh PostgreSQL application, Redis/object-store startup, API/worker/scheduler lifecycle, vertical integrations, graceful drain, and signal behavior require a disposable environment. |
| F — staging/canary/rollback | Blocked | Gate E and parity approvals are prerequisites. No staging mutation was attempted. |
| G — stabilization/retirement | Pending | Starts only after Gate F. `server-backup` remains protected. |

## Toolchain

- Node `v24.15.0`
- pnpm `10.33.0`
- Docker client/server `29.4.0`

The image itself reports Node `v24.19.0`, inherited from the current
`node:24-alpine` base. Pinning the base image by digest is recommended for the
candidate build if byte-for-byte image reproducibility is required.

## Blocking exceptions

1. `config/deployment/profiles.json` and its ownership matrix still reference
   inactive legacy packages and omit rebuilt active packages. The deployment
   profile policy correctly fails; it was not weakened or waived.
2. The generated parity matrix has 1,216 deferred legacy surfaces. Deferred
   means classified, not approved for retirement or accepted for staging.
3. No candidate commit exists for an isolated clean-checkout run.
4. Live disposable database/process qualification and protected staging
   deployment require environment access and named operators.

## Required next decision

Package the current path-scoped changes into a reviewable candidate commit,
resolve the deployment-profile registry, and assign/close the deferred parity
rows. Then run Increment E from a clean checkout using the staging cutover
runbook. Only a successful clean Gate E authorizes staging.

## Backup rule

`server-backup` must not be removed during closure. Its eventual removal is a
separate approved change after Gate F, the stabilization window, and proof that
rollback no longer depends on the working-tree copy.
