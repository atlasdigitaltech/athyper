# Server Platform Host rebuild status report

Date: 2026-08-10  
Plan reviewed: **Server Platform Host Rebuild Plan**  
Closure plan: `docs/architecture/server-platform-host-rebuild-closure-plan.md`

## Decision

**Rebuild implementation and local static/package qualification: complete.**  
**Clean-environment qualification and staging cutover: not complete.**

The rebuilt server is a layered workspace with
`server/apps/platform-host` as the only executable composition root. The
remaining closure work is environmental and governance work, not an identified
missing host implementation: clean-checkout qualification, live disposable
infrastructure, parity approval, staging canary/rollback, and stabilization.

## Completed closure work

- The private root command orchestrator is named
  `@athyper/server-workspace`; its aggregate commands cover all
  `@athyper/server-*` packages.
- Worker and scheduler entry comments describe their active capability
  registration, recovery, scheduling, and heartbeat behavior.
- The mechanical rebuild-boundary gate and 12 focused policy tests enforce
  package identity, kernel absence, package/deep import rules, layer and host
  direction, Foundation isolation, declared dependencies, contract ownership,
  and backup isolation.
- Workspace-resolution, Docker-workspace, canonical-package, inventory, and
  static DDL-model gates pass.
- The deterministic Phase 0 inventory classifies 1,937 legacy/current surfaces.
  No item is unclassified; 1,216 remain explicitly deferred and block staging.
- Aggregate typecheck, tests, and build pass across all 66 active server
  packages. The focused host suite passes 53 tests.
- The production image builds successfully from the host and database workspace
  graphs. Local digest:
  `sha256:a2d9abb1616c33eb85ee3df29e4020bbb080bb1677da8538496e919085bbd0a2`.
  Its entry point exists and `server-backup` is absent from the runtime image.
- `server-backup` is recoverable from baseline commit
  `951299c22c366c153055d8f3515da2c54211c614`: all 2,059 backup files are
  byte-identical to that commit's `server/` tree.

Detailed command evidence and exceptions are in
`docs/architecture/server-platform-host-closure-qualification-report.md`.

## Current gate status

| Closure increment | Status | Assessment |
| --- | --- | --- |
| A — closure baseline | Passed | Dirty worktree preserved; revision and backup recovery evidence recorded. |
| B — naming/source accuracy | Passed | Root orchestrator and process source are corrected and enforced. |
| C — architecture gate | Passed | Current tree and violation fixtures pass. |
| D — inventory/parity matrix | Classification passed; approvals pending | Inventory is deterministic and complete, but deferred rows are not parity approval. |
| E — clean candidate qualification | Partial | Static/package/Docker checks pass locally. Clean checkout, deployment profiles, live databases, Redis/object store, three process modes, and vertical integrations remain. |
| F — staging/canary/rollback | Blocked | Gate E and parity approval are mandatory preconditions. |
| G — stabilization/retirement | Pending | Starts after Gate F; backup removal remains a separate change. |

## Material exceptions and remaining work

1. Correct `config/deployment/profiles.json` and its ownership matrix. The
   deployment-profile policy currently identifies stale inactive package
   references and active rebuilt packages without ownership. Do not waive or
   weaken the policy.
2. Review and close or explicitly approve the 1,216 deferred entries in
   `docs/architecture/server-platform-host-parity-matrix.md`.
3. Create a reviewable candidate commit and repeat Gate E from a clean checkout.
4. Apply current DDL to disposable Studio, Neon, and Mesh databases and qualify
   Redis/object storage plus independent API, worker, and scheduler startup,
   readiness/heartbeats, failure behavior, drain, signals, and representative
   integrations.
5. Execute the protected staging canary and rollback runbook at
   `docs/runbooks/server-platform-host-staging-cutover.md`, then complete the
   agreed stabilization window.
6. Retain `server-backup` until a separate post-stabilization retirement
   proposal is approved.

## Completion recommendation

Record the rebuild as **“implementation complete; local qualification passed;
clean-environment and deployment closure pending.”** Do not mark the whole
runbook complete until Increments E through G have immutable, approved evidence.
