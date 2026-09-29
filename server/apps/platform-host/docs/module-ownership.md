# Module ownership

| Location | Owns | Naming convention |
| --- | --- | --- |
| `entrypoints/` | Executable process selection | One file per role |
| `kernel/` | Host startup sequencing and dependency container | Nouns for modules; `create`, `load`, `launch` verbs for actions |
| `config/` | Environment parsing and deployment validation | Name the configuration or validation responsibility |
| `composition/infrastructure/` | Resource-specific adapters, database selection, transaction bindings, and lifecycle ownership | `registerDatabases`, `registerStorage`, `registerTelemetry`, and other resource verbs |
| `composition/runtimes/` | HTTP, worker, scheduler process lifecycles | `startHttpRuntime`, `startWorkerRuntime`, `startSchedulerRuntime` |
| `composition/shared/entity-runtime/` | Shared entity metadata, handlers, reads, routes, activity | Entity-neutral behavior; entity-specific values come from metadata |
| `composition/shared/entity-governance/` | Entity authorization registration | Explicit authorization responsibility |
| `composition/shared/identity/` | Shared IAM and audit authority, trusted-device routes, platform control authority | `registerIdentityAuthority`; routes are separate from authority |
| `composition/shared/publication/` | Publication orchestration, qualification, recovery | Explicit publication responsibility |
| `composition/shared/collaboration/` | Comments and attachment section providers | Capability names |
| `composition/shared/documents/` | Document attachment admission | Document admission responsibility |
| `composition/shared/ai/` | Atlas inference admission and document knowledge bindings | Preserve capability names |
| `composition/shared/verification/` | Shared verification operational routes | Authentication and plane scope remain explicit |
| `composition/coordination/` | Cross-plane entity release review | Name the coordinated operation |
| `composition/control-plane/` | Privileged publication control authority | Separate from product spaces |
| `composition/spaces/` | Existing space-specific bindings | Preserve truthful domain names |
| `diagnostics/` | Heartbeat, metrics, error collection | Health or telemetry responsibility |
| `development/` | Existing local publication and preview support | Responsibility; development scope supplied by directory |

Use kebab-case filenames and camelCase functions. `create` returns a service or
value, `register` mutates registration state, `load` reads configuration or a
module, `start` starts resources, and `assert` rejects invalid state. Do not rename
published handler keys, permissions, routes, or entity codes for cosmetic consistency.

Compatibility exports are deliberately limited to existing operational import
paths. Tests remain either adjacent to their subject or in the existing composition
integration suite; their imports and source-inspection paths follow moved files.

`register-adapters.ts` is the combined coordinator over extracted resource
registrars. `register-{platform,services,runtimes}.ts` remain compatibility
composition roots, not evidence that all ownership has been extracted. The kernel container
also carries compatibility bindings for existing services. Control-plane and
coordination modules keep their existing explicit boundaries.

Operational scripts already live under `scripts/operations/`; static inventories
live under `scripts/verification/`. Existing database provisioning and integration
scripts stay under `scripts/db-verification/`. Existing `src/scripts/` tools retain
their package commands and emitted build paths: moving them outside `src` would
also change the build contract (`rootDir: src`). No empty script directories or
new forwarding APIs are needed just to match the proposed tree.


Entity construction now lives in `shared/entity-runtime/services.ts` and
`resources.ts`; mounting the existing routes lives in `http.ts`. Transfer
construction and registration live in `transfers.ts`. The combined registrar
supplies configuration and space-specific providers, assigns the resulting
services to the host, and retains publication callbacks pointing to those same
instances. New profile composition should consume these modules rather than
copying their service factories or HTTP bindings.

`shared/entity-runtime/experience.ts` composes Entity experience repositories,
cache, publication route admission and invalidation through explicit database,
transaction and late-bound metadata dependencies. `http.ts` mounts its existing
bootstrap routes. The combined registrar retains adapter selection, runtime
parameter policy and host health registration; repository health reports
availability, not a live database probe.

Governance persistence construction lives in `shared/entity-governance/persistence.ts`:
exact-plane repositories, consent and moderation receive database, transaction,
audit and outbox ports. `authorization-management.ts` owns writer prerequisites,
rollout ceilings and audit mapping; its operator evidence loader is adjacent.
Dedicated writer database construction belongs to `infrastructure/authorization-writer-databases.ts`.
The two existing loader tests moved beside their owners without losing discovery.

`shared/publication/targets.ts` constructs selected target projections, artifact
loaders and tenant-aware orchestrators. The combined registrar supplies the
activation guard; development approval policy stays outside shared construction.

Historical compiler/test output is archived in `docs/history/`; checkpoint
references were updated and log contents retained. Operational CLIs remain in
`src/scripts/` because production still executes their emitted paths.

`kernel/capability-registration.ts` owns the closed eligibility catalog for
extracted Entity capabilities, prevents duplicate registration, and selects
served-plane databases and health probes. The combined registrar now invokes
Entity persistence, experience, governance and authorization factories through
this boundary. Coordination connections do not expand capability ownership.

The jobs runtime and scheduler share `JobDeploymentBoundary`. Physical queue
names, cancellation channels, scheduler leader locks and durable ownership keys
use the same deployment namespace; execution coordinates and job-store access
must belong to served planes. Combined DEV transport names retain compatibility.

## Layout audit resolution

The composition root retains four `register-*` coordinators and the deprecated
`create-container.ts` compatibility export. Kernel policy and capability readiness
live under `kernel/`; capability-specific composition lives with its owner.
`kernel/capability-readiness.ts` evaluates compatibility capability requirements;
`capability-registration.ts` governs registration and resource eligibility.

`spaces/mesh/exchange-readiness.ts` owns the existing Mesh readiness behavior.
Neon finance and supplier bindings retain domain names under `spaces/neon/`.
They are compatibility integrations, not generic Entity Framework behavior.

Control authority is independent of Studio, Neon and Mesh. Its dedicated
`entrypoints/control-api.ts` and `composition/control-plane/` remain intentional.
Entity release review coordinates multiple planes and therefore keeps its own
`composition/coordination/entity-release-review/` boundary.

Configuration files for contact verification, publication policy and control
serve environment parsing and validation, so remain in `config/`.
`deployment-profile.ts` selects roles and served planes;
`deployment-environment.ts` filters environment inputs for those selections.
They have different responsibilities. The deprecated `config/index.ts` forwards
to the canonical environment module until operational consumers migrate.

Focused unit tests live in their owners' `__tests__/` folders. Tests exercising
multiple composition boundaries stay in `composition/__tests__/`. Diagnostics
already separates health and telemetry; add readiness or kernel lifecycle modules
only when they own concrete behavior. Empty legacy processes, monitoring and
entities directories have been removed.
