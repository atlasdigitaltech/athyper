# Server Platform Host Rebuild Plan

Status: proposed execution runbook  
Scope: rebuild the backend under `server/` from the preserved implementation in `server-backup/`  
Package namespace rule: every workspace package physically under `server/` starts with `@athyper/server-`

## 1. Outcome

Rebuild the server as a layered workspace with a small executable host, explicit package ownership, one-way dependencies, and capability-by-capability parity with the legacy server.

This is a reconstruction, not a bulk move. Code enters the new tree only after its owner, public API, dependencies, tests, and composition wiring are understood.

Recommended canonical host identity:

- Folder: `server/apps/platform-host`
- Package: `@athyper/server-platform-host`
- Role: composition root and executable processes only

The source notes also use `apps/backend` and `@athyper/server-backend`. Do not use both conventions. Unless the team explicitly chooses the alternative before Phase 1, this runbook uses `platform-host` because it describes the package's responsibility more precisely.

## 2. Current-state warning

At the time this plan was prepared:

- `server/` is empty in the working tree and its former contents appear as deletions.
- `server-backup/` contains the legacy database, scripts, root configuration, application source, and packages, but is untracked.
- `pnpm-workspace.yaml` still targets the former `server` root and package paths; it does not yet target `server/apps/platform-host` or contract packages under `server/packages/contracts`.
- The worktree contains many unrelated changes. Migration commits must be path-scoped and must not absorb or revert those changes.
- The legacy root package is `@athyper/runtime-server`; most legacy child packages do not yet follow the required `@athyper/server-*` naming rule.

Therefore, preservation and baseline capture are mandatory before any cleanup. Do not delete `server-backup/` until the final retirement gate passes.

## 3. Target structure

```text
server/
├─ apps/
│  └─ platform-host/
│     ├─ src/
│     │  ├─ main.ts
│     │  ├─ config/
│     │  ├─ composition/
│     │  │  ├─ create-container.ts
│     │  │  ├─ register-adapters.ts
│     │  │  ├─ register-platform.ts
│     │  │  └─ register-services.ts
│     │  └─ processes/
│     │     ├─ api/
│     │     ├─ worker/
│     │     ├─ scheduler/
│     │     └─ shared/
│     ├─ package.json
│     └─ tsconfig.json
├─ packages/
│  ├─ foundation/
│  ├─ contracts/
│  ├─ adapters/
│  ├─ runtime/
│  ├─ platform/
│  ├─ services/
│  ├─ planes/
│  └─ test-utils/
├─ db/
├─ scripts/
├─ package.json
├─ tsconfig.json
├─ vitest.config.ts
├─ Dockerfile.dev
├─ Dockerfile.prod
├─ .env.example
├─ staging.env.example
└─ production.env.example
```

## 4. Architecture rules

The allowed dependency flow is:

```text
apps/platform-host
        ↓
planes / services / platform
        ↓
runtime / adapters / contracts
        ↓
foundation
```

Enforce these rules from the first slice:

1. `foundation` imports no other server package and contains capability-neutral primitives only.
2. `contracts` contains types, schemas, events, and ports; it contains no infrastructure implementation.
3. `adapters` implement contracts and do not import the host.
4. `runtime` provides reusable HTTP, jobs, and scheduling mechanisms; it does not own process startup.
5. `platform`, `services`, and `planes` do not import application composition.
6. Only `apps/platform-host` constructs concrete implementations and owns environment/process concerns.
7. Cross-package imports use declared package exports. Filesystem-relative cross-package imports and undeclared deep imports are forbidden.
8. Public `index.ts` files remain deliberately small. Internal files are not exported by default.
9. No package or import named `kernel` is introduced.
10. Every package under `server/` uses an `@athyper/server-*` name.

## 5. Canonical naming

Use `@athyper/server-<layer>-<capability>`, with Foundation retained as one package exposing purposeful subpaths.

| Target folder | Package name |
| --- | --- |
| `apps/platform-host` | `@athyper/server-platform-host` |
| `packages/foundation` | `@athyper/server-foundation` |
| `packages/contracts/auth` | `@athyper/server-contract-auth` |
| `packages/contracts/events` | `@athyper/server-contract-events` |
| `packages/contracts/jobs` | `@athyper/server-contract-jobs` |
| `packages/contracts/records` | `@athyper/server-contract-records` |
| `packages/contracts/telemetry` | `@athyper/server-contract-telemetry` |
| `packages/adapters/auth-keycloak` | `@athyper/server-adapter-auth-keycloak` |
| `packages/adapters/cache-redis` | `@athyper/server-adapter-cache-redis` |
| `packages/adapters/database/core` | `@athyper/server-adapter-db-core` |
| `packages/adapters/database/neon-postgres` | `@athyper/server-adapter-db-neon` |
| `packages/adapters/database/athyper-postgres` | `@athyper/server-adapter-db-athyper` |
| `packages/adapters/database/mesh-postgres` | `@athyper/server-adapter-db-mesh` |
| `packages/runtime/http` | `@athyper/server-runtime-http` |
| `packages/runtime/jobs` | `@athyper/server-runtime-jobs` |
| `packages/runtime/scheduling` | `@athyper/server-runtime-scheduling` |
| `packages/platform/iam` | `@athyper/server-platform-iam` |
| `packages/platform/audit` | `@athyper/server-platform-audit` |
| `packages/services/records` | `@athyper/server-service-records` |
| `packages/planes/neon` | `@athyper/server-plane-neon` |
| `packages/test-utils` | `@athyper/server-test-utils` |

Examples of valid Foundation imports:

```ts
import { getRequestContext } from "@athyper/server-foundation/context";
import { LifecycleManager } from "@athyper/server-foundation/lifecycle";
import { retry } from "@athyper/server-foundation/resilience";
```

## 6. Kernel disposition

Move behavior according to responsibility, not its legacy directory:

| Legacy concept | Canonical owner |
| --- | --- |
| Request context | `foundation/context` |
| Lifecycle and shutdown primitives | `foundation/lifecycle` |
| Retry and circuit breaker | `foundation/resilience` |
| Transaction context | `foundation/transaction` |
| Tenant context | `foundation/tenancy` |
| Auth flag validation | `platform/iam/config` |
| Application bootstrap | `apps/platform-host/src/composition` |
| Runtime configuration | `apps/platform-host/src/config` |
| Lifecycle audit writer | `platform/audit` |
| Records mutation selection | `services/records/mutation` |

Rename `mutation-kernel-rollout.ts` to a responsibility-based name such as `mutation-rollout-policy.ts`; confirm its actual behavior before choosing the final name.

## 7. Execution phases

### Phase 0 — Preserve the source and record the baseline

1. Stop migration edits long enough to establish a reproducible baseline.
2. Confirm that `server-backup/` is the intended complete source and that it was not produced by a partial copy.
3. Record `git status --short` and separate unrelated work from server-migration commits.
4. Make `server-backup/` recoverable using an approved repository branch, commit, or external archive. Do not rely on its current untracked state.
5. Inventory legacy packages, package names, exports, scripts, environment variables, process entry points, routes, jobs, schedules, database commands, Docker entry points, and tests.
6. Run the legacy baseline from the preserved source and record pass/fail results rather than requiring a perfect baseline.

Suggested baseline commands, adjusted if workspace wiring requires a temporary preservation branch:

```powershell
pnpm.cmd --dir server-backup run typecheck
pnpm.cmd --dir server-backup run test -- --run
pnpm.cmd --dir server-backup run build
```

Deliverables:

- Recoverable legacy source
- Package/import rename matrix
- Route, worker, scheduler, database, and environment inventory
- Baseline results with known failures identified

Exit gate: the legacy implementation can be recovered and its current behavior is measurable.

### Phase 1 — Create workspace and host shells

1. Create the target directories without copying application logic.
2. Recreate `server/package.json`, `server/tsconfig.json`, and `server/vitest.config.ts`; do not copy the dependency-heavy legacy manifests unchanged.
3. Create `server/apps/platform-host/package.json` as `@athyper/server-platform-host`.
4. Add only executable-runtime dependencies to the host. Package-specific dependencies belong to the owning package.
5. Update `pnpm-workspace.yaml` to include explicit new patterns:
   - `server/apps/*`
   - `server/packages/foundation`
   - `server/packages/contracts/*`
   - required adapter/runtime/platform/service/plane patterns
6. Remove the obsolete `server` root-as-package entry once no command depends on it.
7. Add a minimal `main.ts` and API process that can start, expose liveness/readiness, and shut down cleanly without business capabilities.
8. Add scripts for `build`, `typecheck`, `test`, and each process mode using cross-platform environment handling; do not retain POSIX-only `MODE=value` scripts on Windows.

Exit gate:

- Workspace discovery shows the host and initial packages exactly once.
- Minimal host build, typecheck, tests, startup, health check, and graceful shutdown pass.
- No legacy package implementation has been bulk-copied.

### Phase 2 — Restore database assets and operational scripts

1. Copy `db/`, `scripts/`, example environment files, and Dockerfiles selectively from `server-backup/`.
2. Exclude `.env`, `node_modules/`, `dist/`, `.turbo/`, `.local-evidence/`, logs, and `package-lock.json`.
3. Classify every script as retained, renamed, replaced, or retired.
4. Update script imports only after their target packages exist; keep temporarily blocked scripts documented.
5. Validate database package discovery, schema tooling, migrations, seed commands, and Docker build contexts.

Exit gate: database validation and non-destructive script checks pass, and no secret or generated artifact has entered `server/`.

### Phase 3 — Build Foundation

1. Create `@athyper/server-foundation` with explicit exports for `context`, `errors`, `lifecycle`, `observability`, `resilience`, `tenancy`, `transaction`, and `validation`.
2. Move only capability-neutral primitives and their tests.
3. Split legacy `foundation/kernel` by the disposition table above.
4. Remove all `@athyper/server-foundation/kernel` paths and all `kernel` exports.
5. Check Foundation source imports to prove it has no dependency on higher layers.

Exit gate: Foundation typecheck/tests pass, its dependency list is minimal, and a repository search finds no active kernel import.

### Phase 4 — Establish Contracts

1. Create contract packages only where an independently owned boundary exists: auth, events, jobs, records, and telemetry initially.
2. Extract ports and shared wire types before moving their implementations.
3. Choose one canonical owner for every duplicated interface and schema.
4. Publish narrow root exports; add subpath exports only when they represent stable public boundaries.
5. Add compile-time/API tests for contract compatibility.

Exit gate: contract packages contain no concrete database, network, process, or framework implementation and have no circular dependencies.

### Phase 5 — Build the first database adapter

1. Rebuild `packages/adapters/database/core` as `@athyper/server-adapter-db-core`.
2. Define its ports in Contracts or Foundation only when truly capability-neutral.
3. Move connection/transaction primitives and focused tests.
4. Rebuild one concrete Postgres adapter needed by the first vertical slice; defer the other planes.
5. Register the concrete adapter only in the host composition root.

Exit gate: adapter package tests pass against their intended test boundary, transaction/tenancy behavior is characterized, and consumers use public exports only.

### Phase 6 — Build reusable HTTP runtime

1. Create `@athyper/server-runtime-http` for server conventions, middleware contracts, health interfaces, error translation, and reusable HTTP lifecycle behavior.
2. Keep Express startup, process signals, environment loading, and concrete capability registration in the host.
3. Wire the minimal API process to the runtime package.
4. Add tests proving `runtime/http` has no import from `apps/platform-host`.

Exit gate: a minimal API boots through the composition root and shuts down cleanly with no capability packages present.

### Phase 7 — Recover the first vertical capability

Use IAM plus Audit as the first production slice because they establish identity and observability boundaries.

1. Characterize the existing IAM/Audit cycle with import and runtime tests.
2. Move shared types/ports into contract packages.
3. Make IAM emit or call an audit port; inject the Audit implementation from the host.
4. Move auth flag configuration out of the legacy kernel and into IAM configuration.
5. Register IAM and Audit in `register-platform.ts`.
6. Restore only their routes and tests, then validate an authenticated request end to end.

Exit gate: IAM and Audit have no circular dependency, package tests pass, and the vertical request works through the new host.

### Phase 8 — Recover Metadata and Records

1. Characterize route, query, mutation, lifecycle, caching, and transaction behavior before moving files.
2. Rebuild Metadata and expose only its stable service API/contracts.
3. Rebuild Records in query, mutation, lifecycle, repository, and route segments.
4. Rename kernel terminology according to actual responsibility.
5. Inject metadata, authorization, audit, transaction, and event dependencies through explicit ports.
6. Move tests with each segment, including characterization and integration tests.

Exit gate: representative read/write/lifecycle flows pass, no duplicated contracts remain, and neither package imports host composition.

### Phase 9 — Recover remaining capabilities incrementally

For each remaining platform package, service, adapter, and plane:

1. Select one bounded capability.
2. Inventory its incoming/outgoing imports, routes, jobs, tables, configuration, and tests.
3. Assign contracts and implementations to canonical owners.
4. Create/rename its package using the `@athyper/server-*` convention.
5. Copy the minimum implementation and tests.
6. Replace legacy imports and declare workspace dependencies.
7. Register concrete implementations in the host.
8. Pass the per-package and vertical-slice gates before selecting the next capability.

Recommended order after Records: notifications, policy/rules, workflow, documents/rendering/object storage, search, jobs, finance/business/master/content/publication/integration/numbering, remaining plane-specific packages.

Exit gate: every retained legacy capability is classified and either passes parity or has an approved retirement record.

### Phase 10 — Compose worker and scheduler processes

1. Create reusable job and scheduling packages before executable process code.
2. Add worker and scheduler entry points under `apps/platform-host/src/processes`.
3. Share configuration, observability, lifecycle, and adapter registration without importing one executable entry point from another.
4. Test startup failure, signal handling, graceful drain, idempotency, retry, and readiness behavior.
5. Update Docker/compose commands to use the new host package and entry points.

Exit gate: API, worker, and scheduler independently build, start, report health where applicable, and shut down safely.

### Phase 11 — Enforce architecture and naming

Add automated checks that fail on:

- A package under `server/` whose name does not start with `@athyper/server-`
- A `kernel` directory, package, or import
- Relative imports crossing package boundaries
- Imports from packages into `apps/platform-host`
- Foundation imports from another server layer
- Undeclared workspace dependencies
- Unexported deep imports
- Duplicate package names or contracts
- Active imports from `server-backup`

Run repository-wide workspace resolution, typecheck, tests, build, Docker build, and representative database/integration checks.

Exit gate: all automated boundary checks and CI gates pass from a clean checkout.

### Phase 12 — Cut over and retire the backup

1. Compare the final inventory with the Phase 0 inventory.
2. Prove route, process, configuration, database, and operational-command parity or record approved retirements.
3. Deploy to a non-production environment and run smoke, migration, rollback, and observability checks.
4. Cut over using the normal deployment rollback mechanism; do not combine cutover with backup deletion.
5. Observe the agreed stabilization window.
6. Remove `server-backup/` only in a separate, reviewable change after the source is recoverable from version control and the parity sign-off is recorded.

Exit gate: production acceptance is complete, rollback evidence exists, and no workspace/configuration reference points to the backup.

## 8. Standard gate for every package or capability

Every migration unit must satisfy all of the following before merge:

```powershell
pnpm.cmd --filter <package-name> run typecheck
pnpm.cmd --filter <package-name> run test -- --run
pnpm.cmd --filter <package-name> run build
```

Also verify:

- Package name and folder follow the canonical convention.
- Manifest declares every external and workspace dependency it imports.
- Public exports are intentional and minimal.
- No deep, relative cross-package, kernel, host, or backup import exists.
- Characterization tests were moved or replaced with equivalent coverage.
- The affected vertical process passes a smoke test.
- Documentation and the rename matrix are updated.

## 9. Commit and rollback strategy

Use small, path-scoped commits aligned to the phases. A useful sequence is:

1. Preservation/inventory only
2. Workspace and empty host shell
3. Database assets and scripts
4. Foundation
5. Contracts
6. Database core plus first concrete adapter
7. HTTP runtime plus minimal API
8. One commit series per vertical capability
9. Worker/scheduler composition
10. Enforcement and CI
11. Cutover configuration
12. Backup retirement

Each pre-cutover rollback is a revert of the current migration unit. Cutover rollback restores the previous deployment artifact/configuration; it must not depend on the presence of an untracked local backup directory.

## 10. Definition of done

The rebuild is complete only when:

- `server/apps/platform-host` is the sole backend composition root.
- All packages under `server/` use `@athyper/server-*` names.
- The dependency direction is mechanically enforced.
- No active `kernel` concept or `server-backup` dependency remains.
- API, worker, scheduler, database, scripts, and Docker workflows pass from a clean checkout.
- Required legacy behavior has parity evidence; removed behavior has explicit approval.
- Secrets and generated artifacts are absent from version control.
- `server-backup/` is removed only after cutover, stabilization, and recoverability sign-off.

