# Local development implementation report — 2026-09-11

The infrastructure runner and initial application slice now work on the inspected Linux/WSL host. Bare `pnpm devsimple` starts NEON plus source API/worker/scheduler; bare `pnpm devfull` starts all three frontends and the same runtime processes. **The complete five-phase plan remains incomplete.** Metadata preview, authenticated BP journeys and candidate qualification are not delivered by this increment.

## Implemented

- Lifecycle cancellation, child-process tracking, conservative stale-lock recovery and source process-group supervision. A second checkout cannot replace the active environment. A remote Docker endpoint is refused.
- Reset preflight before volume deletion: ownership, available memory, ports, private inputs and image availability. Images are resolved to exact local image IDs before replacement. Canonical foundation setup and permission catalog application are included in ordinary startup/reset.
- Strict nested preset validation, developer port overrides, preset-specific core container limits and 2/8 GiB available-memory admission floors. The object-storage initializer has a separate 512 MiB limit after a fresh-reset run exposed exit 137 under the inherited 128 MiB limit.
- Source API, worker and scheduler supervision; selected Next frontend watchers; dependency graph traversal and bounded upstream builds when compiled JavaScript dependencies exist. The inspected simple/full runtime graphs contain 129/135 packages respectively, with no compiled dependencies requiring a build in those graphs.
- Separate frontend `.localhost` origins and automatic reconciliation of their isolated OIDC callbacks. Source processes receive generated local configuration. Existing frontend environment files are rejected rather than silently inherited.
- Bounded local source logs, source-process RSS measurements, per-file source hashes including dirty/untracked inputs and actual infrastructure image IDs. Receipts distinguish development evidence from release qualification.
- Synthetic requester, approver, steward and unauthorized identities in the isolated realm. Their passwords satisfy the existing realm policy. No product grants or human approval records are created.
- Queue/analytics profile selection and queue connection configuration; full-mode search/document/mail/OTLP endpoint configuration. Queue/analytics live initialization and application telemetry collection still need verification.
- IAM-readable secret copies beneath private host directories, preserving owner-only canonical files. A different container UID could read the assigned IAM secret but could not write it. Host-probe portability remains limited to Linux/WSL.

Two source defects were fixed while exercising the runner. The database squash omitted six account/bank linkage permission definitions still required by the runtime. They were restored from `20260828_neon_business_partner_account_bank_linkage.sql` in commit `88c7c651^`, preserving IDs, MFA, separation of duties and exact scope declarations. Managed local scheduler restarts now allow a bounded wait for the previous leader lease; mutations still require the existing Redis fence, and the production default remains immediate acquisition.

## Verification

| Check                                                | Result                                                                                                                        |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Runner unit/regression tests                         | 14 passed                                                                                                                     |
| Scheduling tests                                     | 13 passed, including no write before delayed leadership acquisition                                                           |
| Host runtime registration and metrics endpoint tests | 4 passed                                                                                                                      |
| Scheduling package typecheck                         | Passed                                                                                                                        |
| Seed contract lint                                   | Passed: 73 files checked; 22 unchanged pre-contract files baseline-bound                                                      |
| Checked-in Docker lifecycle suite                    | Passed: down/up and simple/full switches preserve a record; final reset removes it and starts the source application baseline |
| Unmanaged containers                                 | All 79 retained their IDs and start times through the lifecycle suite                                                         |
| Actual second-checkout CLI startup                   | Rejected; original active-environment record unchanged                                                                        |
| Actual CLI SIGTERM                                   | Interrupted command exited and operation lock was removed                                                                     |
| Invalid-secret reset preflight                       | Rejected; all eight current containers and four volumes unchanged                                                             |
| Full-preset HTTP readiness                           | API, worker metrics, scheduler metrics, Studio, NEON and Mesh all returned 200                                                |
| Chromium browser smoke                               | All three frontend pages and PKCE redirects to the correct isolated realm/callback passed                                     |
| Synthetic identity setup                             | Four distinct users created; product grants remain unconfigured                                                               |
| API watch latency                                    | 2,544 ms from a source timestamp change to a new API process with successful readiness                                        |

The watch measurement changes/restores source timestamps without changing contents. It proves watch/restart propagation, not an authorization-semantic edit. Browser smoke stops at the real identity-provider login form; it does not prove completed MFA, authenticated product access or a BP journey.

| Snapshot                                     | Infrastructure | Source processes     |
| -------------------------------------------- | -------------- | -------------------- |
| Simple after clean baseline/source startup   | 1,340 MiB      | 2,053 MiB summed RSS |
| Full after all frontend browser smoke checks | 2,542 MiB      | 3,525 MiB summed RSS |

Docker memory and summed process RSS are different accounting measures; RSS can count shared pages repeatedly. These are light-load snapshots on the existing 32 GiB WSL ceiling, not peak measurements on representative 16 GB hardware. No Windows/WSL configuration was changed.

Private evidence is under `~/.athyper/local-dev/environments/2a7d2dadf3eb/`. Relevant receipts include `lifecycle-1789127251030.json`, `preflight-1789127347695.json`, `feedback-1789127350277.json`, `browser-1789127681052.json`, `measurement-1789127684672.json`, `signal-*.json` and `checkout-*.json`. Earlier failed receipts remain present. The successful lifecycle run preceded the final IAM consumer-copy and optional endpoint changes; the subsequent full startup and browser checks exercised those changes.

## Requirement status

| Phase                            | Status                                       | Remaining completion work                                                                                                                                                                                                                      |
| -------------------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Runner and presets            | Delivered for the inspected Linux/WSL target | Broader host portability remains outside the verified support boundary. The initial frontend/API slice and repeatable lifecycle evidence now exist.                                                                                            |
| 2. Fast source development       | Core implemented; qualification partial      | Gateway application routing/trusted TLS; broader edit and shared-package propagation checks; compile peaks and representative 16 GB validation. Dependency supervision uses the runner's workspace graph rather than a separate Turbo watcher. |
| 3. Identity and metadata preview | Partial                                      | Explicit product grants; forward-migration integration; Studio revision detection; native metadata compilation, local signing/trust and coordinated reload. Synthetic identities and canonical foundations are implemented.                    |
| 4. BP scenario                   | Pending                                      | Deterministic product fixtures and the full allowed/denied ownership, independent-child, provider, command/import, revocation, UI and bounded Atlas journeys in both presets.                                                                  |
| 5. QA candidate handoff          | Pending                                      | Freeze/qualify commands, exact source/application-image/artifact binding, Stack v2 integration and representative MFA/independent review.                                                                                                      |

The legacy BP development bootstrap declares `development-local-sha256` signatures and supplies `signature_verified: true`; it was not used to claim native signed-artifact qualification. Historical isolated-release harnesses also retain their own storage/release contracts. The new metadata preview path needs explicit development evidence and trust handling through the native compiler and loader.

`pnpm test:local --scenario business_partner`, `candidate:freeze` and `candidate:qualify` remain unimplemented. Reset restores the infrastructure and canonical foundation/catalog baseline, not the requested BP product-fixture baseline. Release 20, its approvals and shared activation decisions were not changed by this work.

The local environment is left running in `devfull`. See the [runbook](../runbooks/local-development.md) for commands and the [plan](../architecture/local-development-plan.md) for the remaining acceptance criteria.
