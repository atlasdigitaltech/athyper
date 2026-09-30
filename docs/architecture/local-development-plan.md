# Local development architecture

Updated 12 September 2026. The accepted architecture is one personal DEV workspace,
an isolated local QA environment, and a later staging server. The older preset
implementation plan below is retained as historical context.

Implementation update: [Meta Entity preview and dependency packaging](../reviews/meta-entity-preview-and-dependencies-20260912.md)
adds the tested coordinator and candidate v2 format. Generic runtime activation,
automatic dependency capture/import and full QA qualification remain incomplete.

```text
LOCAL DEVELOPMENT WORKSPACE
  Source mode ↔ Container mode
  Same *.dev.athyper.test URLs, IAM, grants and authoring databases
  Studio save → local compile/sign → activate → refresh affected consumers
                 │ milestone only
       Freeze code + complete metadata dependencies + migrations + image digests
                 ↓
LOCAL QA
  Separate product databases and IAM; *.qa.athyper.test
  Import authoring; QA signing, independent review and full journey qualification
                 │ only after all required qualification passes
       Promote the same application images and verified metadata content
                 ↓
STAGING SERVER
  Environment-specific configuration, credentials and signing trust
```

## Deployed state and daily rule

- DEV is running in source mode with API, worker, scheduler and all three frontends healthy.
- Source and container configurations retain the same URLs, IAM/database coordinates,
  networks and preview storage. Container mode uses the last built application code.
- BP text/layout and bounded workflow preview is active. A supported metadata save
  requires neither an image rebuild, candidate freeze, release approval nor a QA run.
- Local QA has separate product/IAM storage and exact candidate images. Native QA
  signing/activation of the BP form/workflow bundle works. Full qualification is
  incomplete because the candidate does not yet carry the complete product entity
  descriptor/operation dependencies and authenticated acceptance evidence.
- Staging is not deployed: the server target is not available.
- Generic Meta Entity graph preview is still an implementation gap. The architecture
  is not fully delivered until those supported graph edits have the same automatic
  local compile/activate loop. Do not route ordinary edits through QA to compensate.

Use `pnpm devfull` for daily three-plane development. Save supported metadata with
**Save and preview locally** in Studio, check saved/active revision status, then
refresh the affected NEON view. Use `pnpm dev:workspace build` and
`pnpm dev:workspace container` only for a container rehearsal or when changing the
application implementation used by container mode. Freeze a coherent milestone
when its complete dependency set and local tests are ready.

The live configuration audit passed 25 checks; see
[architecture evidence](../reviews/local-workspace-architecture-20260912.json).
Seventeen focused workspace, preview and QA-overlay tests passed. These establish
the current boundaries and supported preview behavior, not full QA acceptance.
See [daily workflow](../runbooks/shared-dev-workspace.md) and
[QA qualification status](../reviews/qa-publication-qualification-20260912.md).

## Historical implementation plan

## 1. Objective and boundaries

Provide one reproducible local workflow for Studio, NEON and Mesh, with two resource/service presets. Everyday editing uses source watch and isolated development metadata. Release qualification occurs at a coherent milestone, followed by a separate shared-environment activation decision.

Both presets use the same versioned compiler, identity integration, ownership resolvers, authorization engine, field policies and command services. Service selection and resource settings differ; business semantics do not.

The first product scenario covers Business Partner, company-owned setup requests, one independently owned child, and one bounded Atlas service invocation. Preserve release 20 and all existing approvals/evidence. Existing DEV, QA-named and isolated release containers remain outside runner ownership.

## 2. Audit dispositions

| Audit item                                | Final disposition                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Compose selection mechanism               | Accept explicit resolution, correct the premise: this checkout uses both overlay files and native `profiles:`. `compose.optional.yaml` contains observability, secretstore, analytics and admin profiles; `compose.parity.yaml` contains migration profiles. `deploy/stackctl/src/capability.mjs` already emits `composeFiles` and `composeProfiles`. Reuse both mechanisms. |
| Dependency watching                       | Adopt dependency-aware `turbo watch` with finite upstream build tasks where needed and selectively interruptible persistent consumers. Verify actual workspace-change propagation.                                                                                                                                                                                           |
| Simple preset versus three-plane scenario | Run Studio authoring and Mesh consumption through real authenticated runtime APIs in the common suite. NEON is the only required frontend. Separate all-three-frontend browser coverage.                                                                                                                                                                                     |
| Candidate image pipeline                  | Use Stack v2 image machinery. Correction: current `release.yml` builds workspace artifacts and creates a GitHub release; it does not itself build container images. Existing `deploy/docker-bake.hcl` is the local image build entry point.                                                                                                                                  |
| Concurrent checkouts                      | Isolation identities support multiple dormant checkouts; v1 supports one active runner-managed environment per machine. Account separately for unmanaged workloads.                                                                                                                                                                                                          |
| Measured Phase 1 exit                     | Add measured simple-preset infrastructure memory and machine details as a required receipt.                                                                                                                                                                                                                                                                                  |
| IAM harness evidence                      | Cite its readiness-only scope. Live platform-host authorization scenarios are additional work, not already satisfied by `test:iam-live`.                                                                                                                                                                                                                                     |

## 3. Presets

| Area                          | devsimple                                                                    | devfull                                             |
| ----------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------- |
| Intended machine              | 16 GB RAM                                                                    | 64 GB RAM                                           |
| Core infrastructure           | PostgreSQL, Redis, identity, object storage; required gateway/pools          | Same                                                |
| Frontends                     | NEON default; selectable                                                     | Studio, NEON and Mesh                               |
| API and worker                | Source watch, low worker concurrency                                         | Source watch, bounded higher worker concurrency     |
| Scheduler                     | Scenario-required                                                            | Enabled                                             |
| Search and document services  | Scenario-required                                                            | Enabled                                             |
| Observability                 | Logs, readiness, status                                                      | Supported metrics, logs, tracing and dashboards     |
| Secret storage                | Owner-only local development secret files through existing adapter contracts | Configured secret-store integration                 |
| Admin consoles                | Optional                                                                     | Enabled only when connected to actual active stores |
| Analytics and large AI models | Explicit opt-in                                                              | Explicit opt-in                                     |

`devfull` is a versioned allowlist of supported base services, not every future repository service. Publication/signing dependencies required by metadata preview belong to the core set in both presets. Optional capability dependencies are resolved before startup; unavailable required services fail readiness and never become successful test substitutes.

Application code runs from the checkout in both modes. Containers host infrastructure. A production-image rehearsal is a candidate operation, not another daily preset.

## 4. Commands and implementation locations

All commands below are proposed:

```bash
pnpm devsimple
pnpm devsimple --apps studio,neon
pnpm devsimple --with search
pnpm devfull
pnpm dev:local doctor
pnpm dev:local status
pnpm dev:local logs
pnpm dev:local down
pnpm dev:local reset
pnpm test:local --scenario business_partner
pnpm test:local --scenario business_partner --coverage all-frontends
```

Both aliases invoke one runner. Startup includes watching; repeat startup reconciles services without duplicate processes. Switching presets preserves data and stops/starts only runner-owned services. `down` retains volumes. `reset` explicitly recreates only the disposable environment's stores and fixtures after validating ownership.

Suggested locations:

- `tooling/scripts/local-dev/`: runner, lifecycle, process supervision and metadata coordination.
- `tooling/config/local-dev/`: schema, preset manifests and resource targets.
- `tests/local/scenarios/`: real runtime journeys and expected outcomes.
- `tests/local/fixtures/`: deterministic synthetic data and grants.
- `docs/runbooks/local-development.md`: implementation-time operating instructions.

Reuse existing stack controller planning utilities, Compose services, package scripts and IAM adapters. Follow `deploy/compose/instance/profiles/README.md` for new optional fragments. Extract useful isolated-release functions without copying their release IDs, approval files or image assumptions.

## 5. Configuration, isolation and concurrency

The versioned manifest records a stable environment ID, canonical checkout identity, preset, apps, capabilities, Compose files/profiles/services, ports, origins, storage identifiers, fixture revision and active artifact revision. Secrets stay outside the manifest in owner-only files.

Resolve selection into ordered `docker compose -f ...` arguments plus existing profile activation and explicit service targets. Inspect the resolved Compose model so a dependency cannot unexpectedly start an image-based application alongside its source watcher. Do not introduce native profiles named `devsimple` and `devfull` as a competing selection layer.

Each checkout has distinct projects, volumes, databases with existing plane boundaries, Redis resources, object buckets, identity realm/clients, signing keys, runtime directory and labels. Derive stable ports/origins with collision checks. Validate browser callbacks, issuer URLs, gateway-to-host routing and required local TLS using existing auth contracts.

Use a machine-wide active-environment registry and exclusive startup lock. A second checkout's startup reports the active environment and refuses to start automatically; it never stops that environment. Read-only `status` lists active/dormant environments and does not refuse inspection. Stale locks require process/resource reconciliation before recovery.

Concurrent runner environments are out of scope for v1. The manifest retains independent IDs so later concurrency support does not require changing resource identity. Existing unmanaged workloads count toward capacity; the runner reports them but does not stop them.

## 6. Lifecycle

1. Check pinned Node/pnpm, Docker, available resources, ports and manifest compatibility.
2. Resolve preset and scenario dependencies; acquire the environment lock.
3. Create/reuse owned infrastructure and validate readiness.
4. Apply explicit migrations and idempotent initialization.
5. Seed missing baseline fixtures without overwriting development drafts or records.
6. Compile, sign and verify the initial preview artifact set.
7. Start API/worker and selected frontend processes; start scheduler when selected.
8. Verify routes, authentication and consumer artifact compatibility.
9. Print URLs, active services, metadata revision and concise diagnostics.

Readiness includes usable authenticated application paths, not just listening ports. Startup failures identify the failed step, retain useful diagnostics and clean up only resources created by the failed attempt where appropriate. Retry must not require manual SQL repairs. Reset validates ownership before any destructive action and restores a deterministic baseline.

## 7. Source watching and incremental work

Use dependency-aware `turbo watch` for the selected graph. Packages exporting source rely on verified source watching; packages exporting compiled output require finite upstream build tasks in dependency order. Use `persistent: true` and `interruptible: true` only for consumers that must restart on dependency changes. Do not make another task depend on completion of a persistent task.

Turborepo documents that persistent tasks with their own dependency awareness can retain native watching; tasks lacking it can be marked interruptible for watch-driven restarts: [official watch reference](https://turborepo.dev/docs/reference/watch).

Assign one owner to each restart path to prevent duplicate restarts between Turbo, tsx and the runner. Metadata invalidation is coordinated separately from ordinary source watching. Exclude generated artifacts from source-trigger loops while explicitly tracking their consuming dependencies.

| Change                         | Action                                                       |
| ------------------------------ | ------------------------------------------------------------ |
| CSS, wording, icons, layout    | Frontend hot reload                                          |
| API/provider/command source    | Affected process reload                                      |
| Source-exported dependency     | Native source watch or verified dependency-triggered restart |
| Compiled-output dependency     | Affected upstream builds, then consumer restart              |
| Metadata/bindings              | Compile, validate and reload affected artifact set           |
| Ownership/permission semantics | Same plus targeted authorization regressions                 |
| Schema                         | Explicit migration plus affected reload                      |
| Cross-plane contract           | Validate affected producers and consumers together           |

Verify representative UI, API, worker and shared-package edits with a visible behavior assertion and measured edit-to-ready time. Keep failure diagnostics and the last usable output where safe; never report a stale build as current.

## 8. Metadata preview

Studio saved drafts are the authoring source. Detect database-backed authoring revisions rather than watching files alone. Checked-in fixtures restore authoring inputs through the same versioned authoring model.

Debounce saves, compile one immutable source revision into the required plane artifacts, and reject superseded compilation results. Validate bindings, ownership resolver availability and consumer compatibility. Sign with local-only development keys and use the normal verification path. Existing shared/QA trust must reject these keys.

Coordinate affected API, workers and caches around one compatible artifact set. For v1, pause affected work admission, stage the complete set, restart consumers and verify their revisions before resuming. Failed compilation leaves the previous working set active; partial loading must not be advertised as ready. Report the saved draft revision separately from the active revision.

A NEON cosmetic change has no Mesh publication. Cross-plane metadata changes fan out from the Studio revision; they are not a serial Studio-to-NEON-to-Mesh authoring chain.

Queued work records relevant contract/revision coordinates, checks compatibility at execution and rechecks current authorization. Define fail/retry outcomes for incompatible jobs. Metadata reload never substitutes for a schema migration or overrides revocation.

## 9. Identity, fixtures and authorization

Seed requester, independent approver, steward, wrong-company, unauthorized and revoked personas. Include two companies, another tenant boundary and independently owned child records with deliberately conflicting access. Fixtures define exact grants and expected denials; missing grants fail tests rather than being automatically widened.

Automate test login/elevation through an isolated identity realm and normal runtime interfaces. Keep issuer/audience, sessions, memberships, tenant scope, field policies, stored ownership, workflow separation of duties and execution-time checks real. Synthetic elevation is development evidence, not human MFA acceptance.

Automatic preview publication is distinct from business workflow approval. A local BP request still requires a different approver where its workflow specifies one. Never fabricate human approval records.

The [IAM harness README](../../tests/iam-live/README.md) expressly limits its current gate to dependency readiness and states that it is not platform-host authorization evidence. The live scenario tests below must therefore be implemented separately.

Run tests in a dedicated scenario namespace with fresh deterministic fixture state. If current storage contracts cannot isolate that state safely, require an explicit test reset of the disposable environment and make the impact visible; never silently destroy interactive drafts. Each run restores revocation fixtures independently so test ordering cannot hide failures.

## 10. Common suite and frontend coverage

The default simple preset must run `business_partner` without Studio and Mesh frontends:

- Invoke real Studio authoring APIs using a test author principal, compile/load through the preview coordinator and verify active revision.
- Exercise real NEON APIs and the NEON browser journey.
- Exercise affected Mesh runtime APIs and assert artifact compatibility and consumed behavior.
- Invoke the bounded Atlas service through its authorized tool/service interface. Model/conversation coverage remains separate.

These are authenticated runtime tests, not mocked APIs or compile-only substitutes. Backend plane composition remains consistent in both presets.

The `all-frontends` suite additionally verifies Studio authoring UI and Mesh browser consumption. It is required before QA candidate acceptance and runs on devfull or an appropriately provisioned CI environment. It is not claimed by the simple preset's default pass.

| Boundary             | Required assertion                                                                                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Identity             | Valid login works; invalid issuer/audience/session fails                                                                                 |
| Ownership            | Correct owner succeeds; wrong company/tenant, missing owner and conflicting supplied context fail                                        |
| Independent children | Readable parent does not implicitly authorize child                                                                                      |
| Providers and fields | Rows/counts/aggregates/nested projections respect access; masked reads differ from reveals                                               |
| Errors               | Authorization outages remain distinguishable from denials and empty results                                                              |
| Workflow             | Create, validate, submit, independent approve, apply succeeds; self-approval and premature apply fail                                    |
| Import/jobs          | Same command/preflight rules; deterministic retry; incompatible payload fails                                                            |
| Revocation           | New reads and queued stale-authority execution fail after revocation                                                                     |
| Context              | Shared BP browse requires no company solely to browse; existing owner comes from storage; creation requests missing required coordinates |
| UI/Atlas             | Server decision DTOs and missing-context behavior agree                                                                                  |
| Reload               | Failed compile retains working state; incompatible or partially loaded revisions cannot pass readiness                                   |
| Preset parity        | Same common scenario and fixture revision yield equivalent business/authorization outcomes                                               |

Development receipts identify source snapshot including dirty changes, compiler/artifact hashes, migration set, preset, fixture/grant revisions and expected/actual assertions. They are labeled development evidence and are not release acceptance.

## 11. Resource plan

Budgets cover one runner-managed environment; other workloads consume additional capacity. These are engineering targets, not measured guarantees or blanket per-service reservations.

| Budget                       | devsimple                                                                      | devfull on the inspected 64 GB host          |
| ---------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------- |
| Infrastructure target        | 4–6 GiB                                                                        | 10–16 GiB                                    |
| Apps/source watchers         | 3–5 GiB with one frontend                                                      | 8–12 GiB with three frontends                |
| Additional build/test bursts | Serialize; keep whole development workload near/below 12 GiB on 16 GB hardware | 4–6 GiB above ordinary workloads             |
| Build parallelism            | 1 expensive build initially                                                    | Benchmark 2, then 4                          |
| Logs/telemetry               | Short bounded retention                                                        | Bounded retention with diagnostics           |
| Large AI models              | Separate explicit budget                                                       | Separate explicit budget within host ceiling |

The prior local inspection found 63.62 GiB physical RAM and 32 Windows logical processors. WSL is configured for 32 GB RAM, 16 processors and 16 GB swap. Docker saw approximately 31.34 GiB and 73 running containers. Linux reported about 14 GiB used and 16 GiB available; interval samples showed no active swapping. These light-load measurements do not establish build peaks.

Recommended optional host change: WSL memory ceiling 44 GB; retain 16 processors and 16 GB swap initially. This leaves approximately 20 GB outside WSL at its ceiling. Do not silently edit Windows configuration or restart WSL from the runner; a restart interrupts existing workloads. devfull remains usable under the current ceiling when measured available capacity is sufficient.

DEV Redis was approximately 431 MiB against a 512 MiB limit; inspect memory composition/eviction before considering a 1 GiB full-preset limit. PostgreSQL and runtime containers were well below limits in that sample. Do not increase all limits to fill RAM. Existing production-style frontend container usage does not predict source-watch peaks.

Root `pnpm build` currently forces concurrency 1. Benchmark a separate local build path at 2 and 4 while watchers are active; preserve other build entry points until evidence supports changes. Limit test workers independently to avoid nested concurrency multiplication.

Measure per-service and whole-environment memory, available host memory, CPU, swap activity, startup, first compile, repeated edits and full scenario runtime. Record hardware/tool versions and whether caches/images were warm. Docker working-set readings and process RSS must not be naively summed as identical accounting.

## 12. Implementation phases and exit criteria

| Phase                    | Deliverables                                                                                | Required exit evidence                                                                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1: infrastructure runner | Manifest, presets, resolved Compose plan, locks, ownership checks, lifecycle, diagnostics   | Both presets start/stop; switching preserves data; second checkout start rejected; unmanaged resources unchanged; measured simple idle infrastructure at or below 6 GiB after readiness and settling                             |
| 2: source development    | App supervision, dependency-aware Turbo watch, URLs/auth callbacks, affected builds         | UI/API/worker/shared-package changes observed without image rebuilds; restart failures recover; record first-compile/edit latency and peak memory on a 16 GB reference environment                                               |
| 3: metadata and identity | Studio revision detection, dev signing/trust, coordinated load, synthetic principals/grants | Failed/stale compile and partial load tests pass; real authenticated decisions run; dev keys rejected outside local trust; no automatic grant widening                                                                           |
| 4: BP milestone          | Common suite, all-frontends suite, deterministic records, bounded Atlas service test        | Common suite passes in simple and full with same fixtures; all-frontends suite passes in full; ownership/denial/revocation assertions pass; full simple journey fits the measured 16 GB target without sustained swapping or OOM |
| 5: QA handoff            | Candidate manifest, existing image pipeline integration, qualification receipts             | Immutable source/artifact/image identities agree; scan/provenance and native signing evidence present; representative MFA and independent review complete where required                                                         |

Phase 1 must publish actual memory readings, not just the target. If it misses the target, reduce optional scope or tune before declaring completion. Phase 2 establishes repeatable latency baselines; later phases may not silently regress them. A CPU/memory-constrained environment is useful preliminary evidence, but validate the full developer experience on representative 16 GB hardware before claiming support.

## 13. Candidate pipeline and evidence

Proposed commands:

```bash
pnpm candidate:freeze --scenario business_partner
pnpm candidate:qualify <candidate-id>
```

Freeze creates an immutable candidate input manifest, not an automatic registry publication. A QA candidate requires a committed exact revision; dirty local snapshots remain development receipts. Include lockfile, compiler/metadata hashes, migrations, config contract and scenario/fixture/grant versions.

Feed the exact revision into `.github/workflows/stack-v2-images.yml` with channel `candidate`, using its existing explicit publication confirmation when publication is authorized. Ordinary startup/freeze must not dispatch remote writes automatically. The workflow produces a digest-addressed ImageSet with SBOM/provenance and scan evidence. Attach its results to a new immutable candidate build receipt; preserve the original freeze inputs.

Use existing Dockerfiles and `deploy/docker-bake.hcl` for local rehearsal. Share or validate target definitions/build arguments with Stack v2 to prevent drift. API, worker and scheduler can use the same runtime-server digest with distinct process modes; do not invent separate images unnecessarily. Current `release.yml` continues its existing tag/workspace-build role; no third candidate image implementation is introduced.

The inspected Stack v2 workflow scans a loaded build, then performs a publishing build. Candidate qualification must establish that security evidence applies to the published runnable image content, for example by scanning the final digest and binding that report before qualification. Reusing a Dockerfile alone does not prove scanned/published identity. This is a Phase 5 pipeline integration check.

Qualification runs the frozen runtime images and exact native signed metadata with QA-appropriate trust, representative identities, real MFA and independent review where required. Development trust and automated identity evidence cannot substitute. Preserve release 20 evidence; changes to any qualified input require a new candidate identity and corresponding validation. Shared activation, rollout and recovery acceptance remain separate from local development and candidate preparation.

## 14. Completion

The workflow is complete when developers can start either preset, edit code and Studio metadata, observe affected behavior, run repeatable successful and denied BP journeys, switch presets and reset owned state without ordinary image rebuilds, manual SQL repairs, permission bypasses or repeated human release approvals. The measured simple workflow must fit a 16 GB development machine; the full workflow must remain within available resources including existing workloads.

No runtime settings, WSL configuration, grants, release records or deployment state are changed by this plan.
