# Final review report: current local development implementation

Review date: 2026-09-11.

**Verdict: the first infrastructure increment is implemented and has useful live verification. The complete local development workflow is not finished, and Phase 1 should remain open.** Neither preset currently starts application source watchers, compiles preview metadata, or runs the Business Partner scenario.

This is a final report on the changes completed so far, not a completion certificate for the five-phase plan.

## Scope and review method

Compared the user's attached workflow requirements with the [saved implementation plan](../architecture/local-development-plan.md), the current runner, preset catalog, package aliases, [runbook](../runbooks/local-development.md), and [initial verification record](local-development-runner-infrastructure-20260911.md).

Implementation reviewed:

- `tooling/scripts/local-dev/cli.mjs`: command parsing, selection, lifecycle and startup.
- `tooling/scripts/local-dev/model.mjs`: checkout identity, dependency selection and Compose projection.
- `tooling/scripts/local-dev/runtime.mjs`: process execution, ownership, locks, generated configuration, diagnostics and probes.
- `tooling/scripts/local-dev/start-secret-consumer.sh`: secret loading and privilege dropping.
- `tooling/scripts/local-dev/runner.test.mjs`: eight automated tests.
- `tooling/config/local-dev/presets.json`: versioned presets and capability allowlist.
- Four local-development package scripts and the associated documentation.

The checkout also contains unrelated, pre-existing BP, CI and release changes. This report does not certify those unrelated changes or attribute their package.json edits to the local runner. In particular, the runner increment added four scripts; other package.json changes are outside this review's scope.

This review reran the focused tests, formatting and shell syntax checks; inspected the active simple environment and recorded snapshots; checked identity discovery; compared the pre-existing container baseline; and reproduced interruption behavior in a temporary directory. It did not reset, restart or switch the actual environment during this review. Full startup, preset switching and reset results below are attributed to the prior recorded live verification, not represented as newly repeated tests.

## Review findings requiring follow-up

### R1 — P2: interruption can leave lifecycle commands permanently locked

`acquireLock()` creates `operation.lock` and only its returned cleanup function removes it. The CLI calls that cleanup in `finally`, but there is no signal-handling/process-supervision path to run it after normal process termination signals. A stopped or killed startup can therefore leave later `up`, `down` and `reset` calls blocked.

**Reproduced:** a temporary child process acquired the actual runtime lock, received SIGTERM, and left the lock file behind. No Docker state was changed by this reproduction.

References: [runtime.mjs](../../tooling/scripts/local-dev/runtime.mjs), lines 74–90; [cli.mjs](../../tooling/scripts/local-dev/cli.mjs), lines 358–370.

Required correction: supervise child operations, handle graceful interruption, and implement explicit stale-lock reconciliation that checks process identity and owned Docker resources. SIGKILL cannot be caught, so signal handlers alone are insufficient. Add regression coverage for both interruption and recovery.

### R2 — P2: reset performs destructive work before restart preflight

The reset branch calls `stop(stored, true)` before `start(stored)`. Version checks, Compose resolution, named-resource validation and port checks occur inside `start`. Thus an ordinary configuration error or unsupported tool version can be detected only after the disposable volumes have already been deleted. An invalid private secret is also discovered during preparation after deletion.

This does not imply deletion of shared DEV data: exact ownership checks are present. It does weaken the promised predictable reset/recovery behavior for the developer's owned data.

References: [cli.mjs](../../tooling/scripts/local-dev/cli.mjs), lines 150–158, 279–291 and 365–367.

Required correction: split preparation/validation from execution and validate reconstructability before deleting volumes. Preserve clear failure-state receipts when execution still fails after preflight. Test a failed reset preflight and prove existing owned data remains intact.

### R3 — P2: current receipts cannot identify an exact dirty source snapshot

Measurements record Git HEAD, a dirty-state boolean and the generated Compose checksum. They do not capture a digest of changed/untracked source contents or the actual running image IDs. Two different dirty checkouts can therefore produce receipts with the same source revision, dirty flag and Compose checksum while running different source/image content. The default IAM reference is also a mutable local tag.

References: [runtime.mjs](../../tooling/scripts/local-dev/runtime.mjs), lines 334–358; [model.mjs](../../tooling/scripts/local-dev/model.mjs), lines 98–101.

Required correction before using these as milestone evidence: record a content-addressed source snapshot, relevant mounted configuration/script hashes and actual container image IDs/digests. Include assertion outcomes and scope in the receipt. Preserve old receipts. Existing snapshots remain useful infrastructure measurements, not exact-build or authorization evidence.

### R4 — P2 portability risk: host access and secret permissions depend on the tested setup

Supplemental probes fetch private container IPs directly. This works on the tested WSL/native Docker setup but must not be assumed to work from every Docker Desktop host. Secret files also retain host ownership with mode 0600. Grafana and Redis exporter have explicit wrappers, while Keycloak uses the image's non-root UID; a different host UID requires validation or an adapted secret delivery mechanism.

References: [runtime.mjs](../../tooling/scripts/local-dev/runtime.mjs), lines 170–200 and 403–427; [model.mjs](../../tooling/scripts/local-dev/model.mjs), IAM configuration; [start-secret-consumer.sh](../../tooling/scripts/local-dev/start-secret-consumer.sh).

Evidence classification: code-inspection portability risk; not reproduced on a second platform or host UID in this review.

Required correction: state supported host configurations, test another non-default UID, and use a portable owned-network probe mechanism or declared host endpoints where appropriate. Validate on a representative 16 GB development machine before claiming that support.

## Completed work

| Area                     | Implemented behavior                                                                                                                        | Assessment                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Shared runner            | Both aliases invoke one CLI and preset catalog                                                                                              | Implemented                                            |
| Explicit selection       | Existing overlay/profile definitions resolve through Docker Compose; only selected infrastructure and its allowed dependencies are retained | Implemented and tested                                 |
| Application exclusion    | Infrastructure dependency traversal rejects API, worker, scheduler, frontend-image and migration services                                   | Implemented and tested                                 |
| Checkout isolation       | Stable checkout ID controls project, local ports, volumes, realm and runtime directory                                                      | Implemented on tested host                             |
| Ownership controls       | Manager, environment and Compose-project labels are required for lifecycle resources; existing named volumes/networks are checked           | Implemented and tested                                 |
| Single active checkout   | Registry and operation lock reject another checkout; Docker inventory also detects another running managed environment                      | Implemented; interrupted-lock recovery incomplete      |
| Infrastructure lifecycle | Startup, switching, stop and infrastructure reset                                                                                           | Previously live-tested; reset preflight issue remains  |
| Identity infrastructure  | Existing IAM image build path, generated isolated realm and exact issuer discovery                                                          | Implemented; not login/MFA/authorization qualification |
| Secrets                  | Generated private local secrets; dedicated wrappers for differing service UIDs; Infisical key format corrected                              | Implemented on tested host                             |
| Readiness                | Native health checks, supplemental HTTP probes, Redis connectivity metric and Grafana configured-credential check                           | Implemented and previously live-tested                 |
| Diagnostics              | Plan, doctor, status, logs and measurements                                                                                                 | Implemented with limitations below                     |
| Documentation            | Runbook, plan checkpoint and initial verification record                                                                                    | Present and explicit about pending application work    |

The implementation correctly keeps `applicationReady: false` and `phase1Qualified: false`. It does not relabel infrastructure readiness as business authorization success.

## Requirement gaps and phase status

| Phase                            | Status  | Missing completion work                                                                                                                                         |
| -------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Runner and presets            | Partial | Close lifecycle findings, repeatable integration/evidence capture and the initial application vertical slice requested in the attachment                        |
| 2. Fast source development       | Pending | API/worker/scheduler supervision, selected frontend watchers, dependency-aware rebuilds, browser routing/callback verification, measured edit feedback          |
| 3. Identity and metadata preview | Pending | Foundation/migration setup, synthetic personas and explicit grants, Studio revision detection, compiler integration, local signing/trust and coordinated reload |
| 4. BP scenario                   | Pending | Fixtures and successful/denied journeys covering ownership, independent children, providers, commands, imports, revocation, UI and bounded Atlas behavior       |
| 5. QA candidate handoff          | Pending | Freeze/qualification commands, exact-source/image/artifact binding and existing Stack v2 pipeline integration                                                   |

The user's attachment explicitly asks for one frontend and API in the initial vertical slice. Those are not present. The saved plan places most watcher work in Phase 2; under either interpretation, the complete daily development workflow cannot be marked delivered.

Additional gaps:

- `--apps` stores a choice but starts no frontend.
- Bare `pnpm devsimple` and `pnpm devfull` intentionally fail without `--infrastructure-only`.
- `pnpm test:local --scenario business_partner`, `candidate:freeze` and `candidate:qualify` are not implemented by this increment.
- Reset restores infrastructure databases, buckets and realm, not a product fixture baseline.
- Gateway configuration contains no application routes; TLS/browser integration is pending.
- The JSON catalog has a schema version and selected input checks, but no comprehensive checked-in configuration schema validator.
- Ports are deterministically allocated and collisions rejected; developer port overrides are not implemented.
- Memory targets are reported, not capacity admission controls. Build concurrency is metadata only while the build/watch supervisor is absent. Container resource limits are inherited from existing Compose definitions rather than separately tuned per preset.
- Queue administration, analytics and large-AI opt-ins are not wired. Observability backends/Redis metrics do not establish application log/trace collection.
- The lifecycle/measurement assertions from the earlier live exercise are documented, but are not yet a checked-in repeatable lifecycle integration suite.

## Verification results

Fresh checks in this review:

| Check                                                                        | Result                                                                         |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `pnpm test:local-runner`                                                     | 8 passed                                                                       |
| Prettier on runner modules, catalog, runbook and initial verification record | Passed                                                                         |
| `sh -n tooling/scripts/local-dev/start-secret-consumer.sh`                   | Passed                                                                         |
| `dev:local doctor`                                                           | No reported tool-version failures; Node 24.19.0, pnpm 10.33.0, Compose 5.5.0   |
| Current simple environment                                                   | Seven long-running containers healthy; database initializer exited as expected |
| Generated realm discovery                                                    | HTTP 200; exact expected issuer                                                |
| Default application startup                                                  | Explicitly rejected because application integration is pending                 |
| Original unrelated-container baseline                                        | All 79 still running with unchanged start timestamps                           |
| Signal interruption reproduction                                             | Confirmed stale-lock finding R1                                                |

The unchanged-container comparison establishes no restarts for those baseline containers; it is not a fresh database/grant fingerprint audit. No lifecycle mutations were performed on the actual environment by this review.

Earlier recorded live checks cover both infrastructure presets, data preservation across switches and stop/start, explicit reset, and rejection of a second checkout. Those are useful scoped results. They do not prove runtime permissions, stored ownership or revocation.

## Resource findings

The existing raw measurement files were inspected:

| Preset / observation               | UTC timestamp           | Working set |
| ---------------------------------- | ----------------------- | ----------- |
| Simple after full-to-simple switch | 2026-09-11 10:57:11.995 | 1,147 MiB   |
| Simple after stop/start            | 2026-09-11 10:59:15.761 | 794 MiB     |
| Full after corrected clean reset   | 2026-09-11 10:56:21.963 | 2,593 MiB   |

These are historical infrastructure snapshots inspected during this review, not new benchmark runs. They are below the configured infrastructure targets. They exclude source watchers, builds, application tests and large AI workloads; neither sustained performance nor 16 GB-machine support is established.

Docker currently reports approximately 31.34 GiB memory and 16 processors in the WSL environment. The proposed 44 GB WSL ceiling remains an optional host change and was not applied by this work. No additional allocation is needed merely to claim success for these small infrastructure snapshots.

## Recommended next delivery

1. Fix interruption/recovery and reset preflight, with repeatable lifecycle failure tests.
2. Complete the smallest application vertical slice: NEON frontend plus API/worker from source, the required foundation setup, and valid local identity/browser routing.
3. Prove shared-package edits reach the appropriate consumers using dependency-aware watching.
4. Add the Studio preview compiler, local trust, deterministic personas/grants and compatible artifact reload.
5. Run the common BP suite through real Studio/Mesh APIs and NEON UI in simple mode; add all-frontend coverage in full mode.
6. Capture source-bound milestone evidence and integrate candidate qualification only after the complete journey passes.

Retain the infrastructure increment as the foundation for this work. Do not close the full plan, claim QA readiness or reuse release 20 approvals for it. This review changed only this report; implementation fixes remain outstanding.
