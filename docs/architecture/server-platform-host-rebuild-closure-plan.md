# Server Platform Host Rebuild Closure Plan

Status: in progress — Increments A-D passed; Increment E partially qualified  
Date: 2026-08-10  
Source: `docs/architecture/server-platform-host-rebuild-status-report.md`

## Execution status

| Increment | Status |
| --- | --- |
| A — closure baseline | Passed |
| B — naming and source accuracy | Passed |
| C — mechanical architecture gate | Passed |
| D — inventory and classification | Passed; deferred dispositions still require approval before staging |
| E — clean revision qualification | Partial; local package/static/Docker gates pass, clean and live-environment gates remain |
| F — staging/canary/rollback | Blocked on E and parity approval |
| G — stabilization and final closure | Pending |

See `server-platform-host-closure-qualification-report.md` for evidence and
`../runbooks/server-platform-host-staging-cutover.md` for the protected
environment procedure.

## 1. Objective

Close the remaining Platform Host rebuild exceptions without disturbing the dirty worktree, weakening package boundaries, or deleting `server-backup` before cutover approval.

The work is complete only when architecture rules are mechanically enforced, every legacy surface has a parity or retirement disposition, a clean revision passes local/container qualification, and staging rollout plus rollback evidence survives the agreed stabilization window.

## 2. Fixed decisions and boundaries

### 2.1 Root server manifest

Retain `server/package.json` as a private command orchestrator and rename it from `@athyper/server` to `@athyper/server-workspace`.

Rationale:

- repository commands already depend on `pnpm --dir server ...`;
- the manifest is not selected by the current `pnpm-workspace.yaml` server patterns;
- it owns aggregate developer commands, not runtime code or deployable exports;
- `@athyper/server-workspace` satisfies the namespace rule and makes its purpose explicit.

The architecture gate must treat it as the one named server workspace orchestrator. It must remain `private`, expose no package exports, contain no runtime source, and never appear in a production dependency closure.

### 2.2 Backup protection

`server-backup` is read-only behavioral reference throughout this plan. No stage may delete, move, reformat, bulk-copy, or add runtime imports from it. Physical retirement requires a separate reviewable change after staging stabilization and recoverability approval.

### 2.3 Evidence policy

Every executable gate records:

- commit SHA and dirty/clean state;
- UTC start/end times;
- toolchain versions;
- command and exit code;
- image digest or database/container identity where applicable;
- sanitized output and operator identity;
- links to any incident, waiver, or retirement approval.

Secrets, tokens, connection strings, JWTs, and raw customer data must never be captured. Evidence is written create-only and checksum-addressed. The team should use its governed release-evidence store; a local evidence folder is temporary input, not the system of record.

## 3. Execution sequence

### Increment A - Establish the closure baseline

1. Record the current dirty worktree without modifying unrelated files.
2. Confirm `server-backup` is recoverable from an approved branch, tag, commit, or external archive. Record its immutable reference and checksum.
3. Capture the active workspace package list and the production host dependency closure.
4. Record current results for the existing server boundary, workspace-resolution, Docker-workspace, DDL-model, aggregate typecheck, test, and build commands.
5. Create an exceptions ledger for baseline failures; do not silently normalize existing failures into the new gate.

Artifacts:

- baseline evidence manifest;
- backup recoverability record;
- initial exception ledger.

Gate A: the backup can be restored independently, the dirty worktree is preserved, and all later results can be tied to a specific revision.

### Increment B - Close naming and source-accuracy exceptions

1. Rename the root manifest to `@athyper/server-workspace` and update lockfile/workspace metadata produced by a normal frozen-compatible install workflow.
2. Add a repository assertion that the root orchestrator is private, export-free, outside production dependency closure, and contains scripts/dev tooling only.
3. Replace the stale `Phase 1 stub` comments in worker and scheduler entry points with descriptions of their actual composition behavior.
4. Search executable source, configuration, Docker, and scripts for obsolete `@athyper/server`, `@athyper/runtime-server`, host-path, and stub claims. Classify deliberate historical references in documentation separately.
5. Run the host package typecheck, tests, and build.

Gate B:

- every manifest below `server/` uses an approved `@athyper/server-*` name;
- `@athyper/server-workspace` is not deployable and is absent from the host production closure;
- worker and scheduler source comments match behavior;
- host typecheck, tests, and build pass.

### Increment C - Add the mechanical architecture gate

Extend or replace `scripts/policy/verify-server-boundaries.mjs` so one deterministic command validates the rebuilt architecture rather than only the legacy promoted-service layout. Prefer a data-driven ownership manifest over scattered path constants.

Required checks:

1. **Package identity:** discover all server manifests, require unique `@athyper/server-*` names, validate folder/name convention, and enforce the root-orchestrator invariant.
2. **Kernel absence:** reject active package names, directories, exports, and import segments named `kernel`; allow only named historical fixtures or documentation.
3. **Cross-package imports:** resolve relative imports and reject any that cross a package root. Reject filesystem imports into another package even when the target exists.
4. **Deep imports:** allow a package subpath only when it is explicitly declared in the target manifest's `exports` map.
5. **Host direction:** reject imports of `server/apps/platform-host` from Foundation, contracts, adapters, runtimes, platform, services, planes, database code, and scripts.
6. **Layer direction:** enforce `host -> planes/services/platform -> runtime/adapters/contracts -> foundation`, with a small reviewed exception file if a valid edge cannot be represented directly.
7. **Foundation isolation:** Foundation may use Node built-ins and its own files but may not depend on another `@athyper/server-*` package or concrete infrastructure library.
8. **Declared dependencies:** every imported workspace/external package must be declared in the importing manifest; every declared `workspace:*` target must resolve exactly once.
9. **Contract ownership:** maintain a machine-readable registry for canonical cross-package contract symbols or schemas and reject duplicate ownership. Tests/fixtures may duplicate shapes only through named allowlists.
10. **Backup isolation:** reject executable imports, Docker `COPY`, workspace membership, build inputs, and runtime configuration references to `server-backup`.

Implementation requirements:

- add focused tests with one passing fixture and one fixture per violation class;
- provide actionable output containing the source manifest/file, violated rule, and expected owner;
- add `policy:server-rebuild-boundaries` at the repository root;
- add it to the normal policy command and CI before build/test jobs;
- keep the existing workspace-resolution and Docker-workspace checks, updating obsolete `@athyper/runtime-server` assumptions to `@athyper/server-platform-host`.

Gate C: all architecture fixtures pass, the current rebuilt tree passes with no undocumented exception, and CI fails when each prohibited edge is introduced in a fixture.

### Increment D - Produce the Phase 0 inventory and parity matrix

Build a repeatable inventory tool that scans both `server-backup` and the rebuilt `server` tree. It should generate machine-readable inventory first, followed by a reviewed Markdown summary.

Inventory categories:

- HTTP routes: method, path, authentication, permission, owner;
- processes and entry points;
- job queues, job names, payload owner, handler owner, retries and DLQ behavior;
- schedules: code, cadence, queue, handler, physical-plane behavior;
- configuration/environment keys: process scope, secret classification, alias/deprecation state;
- package and database scripts;
- DDL/migration/seed/verification commands;
- Docker/compose services and operational scripts;
- health, readiness, metrics, audit, and alert surfaces.

Each legacy item must have exactly one disposition:

- `migrated`: current owner and parity evidence identified;
- `replaced`: successor behavior and migration evidence identified;
- `retired`: reason, impact, and named approval recorded;
- `deferred`: owning follow-up plan, risk, and due gate recorded.

Each row also records owner, target package/file, tests, configuration changes, data migration, rollback path, approval, and evidence link. Generated output must be deterministic so CI can detect unreviewed legacy drift.

Recommended artifacts:

- `docs/architecture/server-platform-host-legacy-inventory.json`;
- `docs/architecture/server-platform-host-parity-matrix.md`;
- a small reviewed retirement/exception manifest consumed by the generator.

Gate D: no retained legacy route, process, job, schedule, configuration key, database command, or operational script is unclassified; every retirement has explicit approval; generated files are current in CI.

### Increment E - Qualify a clean revision

Run this increment from a temporary clean worktree or CI checkout at the candidate commit. Do not clean, reset, stash, or otherwise mutate the user's active dirty worktree.

Qualification order:

1. Verify Node/pnpm versions and run `pnpm install --frozen-lockfile`.
2. Verify workspace discovery and unique package resolution.
3. Run the new rebuild-boundary gate plus existing workspace, Docker-workspace, canonical-package, deployment-profile, and DDL-model policies.
4. Run aggregate server typecheck, tests, and build.
5. Build `server/Dockerfile.prod`; record the immutable image digest and inspect the runtime filesystem/dependency closure for absence of source secrets and `server-backup`.
6. Render local/staging/production compose configurations and reject stale command paths, missing variables, and invalid process scoping.
7. Apply current DDL to disposable Studio, Neon, and Mesh PostgreSQL databases; run DDL, RLS/security-definer, seed, and representative repository checks.
8. Start API, worker, and scheduler independently with disposable Redis/object-store/database dependencies.
9. Verify API liveness/readiness, worker/scheduler heartbeat freshness, startup failure on missing mandatory dependencies, SIGTERM handling, bounded graceful drain, idempotent shutdown, job retry, and schedule reconciliation.
10. Run representative verticals: authenticated IAM/Audit request, record read/write, notification job, document/render/storage flow, governed Jobs lifecycle, and Publication projection/canary fixture.

Gate E: the candidate commit passes all checks from a clean checkout, all three production images/process modes are reproducible, and evidence references the exact commit and image digest. Flaky reruns do not count as a pass without a recorded root cause and approved remediation.

### Increment F - Stage, canary, and rehearse rollback

Preconditions:

- Gates A-E passed;
- parity/retirement matrix approved;
- distinct least-privilege API and worker database credentials provisioned;
- backups/restores tested for affected databases and object-store state;
- rollout owner, rollback owner, incident channel, and stabilization duration named.

Execution:

1. Deploy the candidate image digest to staging with all high-risk capability flags disabled.
2. Apply migrations using the approved migration identity and capture schema/version evidence.
3. Start API, worker, and scheduler with process-scoped secrets and flags. Confirm API cannot access signing-only secrets and non-HTTP processes are probed through heartbeats.
4. Run staging smoke checks for routing, authentication, authorization, health/readiness, database connections, Redis/BullMQ, object storage, secret store, telemetry export, and audit persistence.
5. Enable one canary capability/tenant/plane at a time. Run Jobs and Publication recovery/replay checks before expanding.
6. Validate dashboards and alerts for request failures, job latency/retries/DLQ, schedule lag, database saturation, Redis availability, worker heartbeat age, audit failures, and Publication activation/acknowledgement lag.
7. Rehearse application rollback to the prior image without schema rollback. Prove compatibility with the migrated schema or execute the pre-approved forward-fix/restore path.
8. Re-deploy the candidate, prove convergence and absence of duplicate durable mutations, and seal sanitized evidence.

Gate F: staging smoke and canary pass, alerts are observable, rollback completes within the agreed recovery objective, re-deployment converges, and release/operations owners approve the evidence.

### Increment G - Stabilize and close the rebuild

1. Begin the agreed stabilization window only after Gate F. Recommended minimum: 48 hours or the organization's longer normal change window.
2. During the window, track error rate, latency, readiness, restart count, job retry/DLQ, schedule lag, database health, audit completeness, and capability-specific canary indicators.
3. Stop the window clock for a material incident; remediate, repeat affected gates, and restart the window.
4. At window completion, update the status report and parity matrix with final approvals.
5. Create a separate backup-retirement proposal identifying the exact `server-backup` target, recoverable source reference, image/commit accepted in production, and rollback independence.
6. Delete `server-backup` only in that separate approved change. Run architecture, workspace, clean-checkout, and Docker gates again after deletion.

Gate G: production acceptance and stabilization are signed off, rollback no longer depends on the local backup directory, and any backup removal has passed as an independent reviewable change.

## 4. CI gate layout

Use fast failures before expensive qualification:

1. manifest/workspace resolution;
2. server rebuild architecture policy and fixtures;
3. generated inventory/parity drift check;
4. package typecheck and tests;
5. aggregate build;
6. Docker build and image inspection;
7. disposable database/container integration;
8. staging-only smoke/canary/rollback workflow.

Only stages 1-7 belong in ordinary pull-request CI. Staging mutation belongs in a protected deployment workflow with environment approval and immutable evidence retention.

## 5. Rollback boundaries

- Increments A-D are reverted as path-scoped code/document changes.
- Increment E is non-mutating qualification against disposable infrastructure.
- Increment F application rollback restores the previous image/configuration; it must not delete databases, reverse append-only evidence, or depend on `server-backup`.
- Destructive database restore is an incident path, not the default rollback. It requires the existing production approval process.
- Increment G backup removal is never bundled with application cutover.

## 6. Final definition of done

The remaining activity is complete when all of the following are true:

- the root orchestrator decision is implemented and enforced;
- stale process comments are removed;
- the complete rebuilt architecture gate runs in CI;
- the legacy inventory has no unclassified item;
- retained behavior has parity evidence and retired behavior has approval;
- a clean candidate revision passes workspace, typecheck, test, build, Docker, database, and three-process qualification;
- staging migration, smoke, canary, observability, rollback, and re-deploy evidence is approved;
- the stabilization window completes without an unresolved material incident;
- `server-backup` remains protected until a separate retirement change is approved;
- the Platform Host rebuild status report is updated to **complete** only after these gates pass.
