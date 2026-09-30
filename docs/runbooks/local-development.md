# Local development

## Current daily workflow

Use the personal DEV workspace described in [Shared DEV workspace](shared-dev-workspace.md):

```sh
pnpm devfull
pnpm devsimple
pnpm dev:workspace status
```

`devfull` runs API, worker, scheduler, Studio, NEON and Mesh in source development
containers; `devsimple` selects NEON with the same backend processes. Both use
existing DEV infrastructure, data and `https://<app>.dev.athyper.test` URLs.
The workspace helper can resume its saved source configuration when legacy
application containers are absent. See the linked runbook for recovery and
source/image mode switches.

## Isolated workspace reference (historical)

The following records the earlier disposable-stack design and its limitations.
Use `pnpm dev:isolated` only when intentionally working with that separate
workflow. Its loopback URLs, reset behavior and identity setup do not describe
the daily shared DEV workspace above.

The runner now starts source API, worker, scheduler and the selected frontends, backed by isolated Docker infrastructure and the canonical three-plane database foundation. The complete Business Partner development and QA handoff workflow is **not yet delivered**. See the [plan](../architecture/local-development-plan.md).

### Isolated runner commands

```bash
pnpm dev:isolated up --preset devsimple
pnpm dev:isolated up --preset devfull
pnpm dev:isolated up --preset devsimple --apps neon --with search
pnpm dev:isolated up --preset devsimple --ports api=31000,neon=31001
pnpm dev:isolated up --infrastructure-only
pnpm dev:isolated status
pnpm dev:isolated logs
pnpm dev:isolated measure
pnpm dev:isolated down
pnpm dev:isolated reset
```

`devsimple` starts NEON; `devfull` starts Studio, NEON and Mesh. Both start the same source API, worker and scheduler. Application origins use distinct `<app>.<checkout-id>.localhost` hostnames to keep browser cookies separate. The current browser path uses direct loopback HTTP ports. Gateway application routing and trusted local TLS remain pending.

`--apps` selects real frontend processes. Runtime packages use `tsx watch`; frontends use Next development mode. The runner traverses workspace runtime dependencies and builds dependencies consumed from compiled JavaScript in dependency order, within the preset concurrency limit. It watches their source directories for further rebuilds. The initially inspected simple graph contained 129 packages and no compiled JavaScript dependencies requiring a build.

Source processes receive generated local credentials and endpoints rather than the shell's shared environment. Frontend `.env` files cause startup to refuse: move their configuration into the managed workflow before starting. An existing app `.env.example` is harmless. API and metrics listeners bind to loopback. IAM uses read-only consumer copies inside a private host directory so the image UID can read assigned secrets; canonical secret files remain owner-only. Source logs are private `<mode>-source.log` files under the environment directory, with one rotated file and a 5 MiB rotation threshold.

Startup checks tool versions, ownership, port collisions, available memory, secret inputs and image availability. It builds the existing IAM image if its source changed and resolves selected image references to local image IDs. Bare startup then applies/reuses the canonical foundation, publishes the permission catalogs, reconciles local OIDC callbacks and starts source processes. HTTP readiness covers API `/readyz`, worker/scheduler metrics endpoints and selected frontend pages. It does not prove authenticated product journeys.

### Isolated lifecycle and recovery

`down` stops owned source process groups and removes exactly owned containers/networks; named volumes and secrets survive. Switching presets stops source processes and reconciles infrastructure while retaining deselected service volumes. `reset` preflights its replacement before deleting owned volumes, then rebuilds infrastructure and the foundation. `reset --infrastructure-only` stops after infrastructure setup. Product fixtures and metadata artifacts are not yet restored by reset.

A foundation checksum mismatch refuses to adopt an existing schema. Use the disposable reset workflow when intentionally rebuilding this isolated baseline. It never resets shared DEV/QA or release-specific storage.

An operation lock serializes mutations. SIGINT/SIGTERM abort running commands and release the lock after cleanup. `pnpm dev:isolated recover` validates ownership and refuses recovery while any recorded operation/child PID remains present. Legacy locks without child tracking require manual process inspection. Source supervisor ownership includes the checkout and Linux process start identity; this implementation currently targets Linux/WSL.

### Isolated configuration and resources

The checked-in [catalog](../../tooling/config/local-dev/presets.json) has strict nested validation. `--ports key=port,...` accepts known keys, unprivileged integer ports and distinct values. Both infrastructure and source configurations are recorded below `~/.athyper/local-dev/environments/<checkout-id>/`.

Simple/full infrastructure working-set targets remain 6/16 GiB. Startup requires at least 2/8 GiB available host memory respectively. These are admission floors, not guarantees about future load. Core container memory limits are separately set by preset. Source Node heap limits are 1536/3072 MiB per process; dependency build concurrency is 1/2. WSL's configured memory ceiling still applies regardless of physical RAM.

`measure` captures container memory, actual image IDs, exact source-file hashes including dirty/untracked files, and source-process RSS when running. Summed RSS is explicitly labeled because shared pages can be counted more than once. Source manifests are private separate files rather than flooding terminal output.

`--with queue` selects the existing queue-admin profile and routes local BullMQ connections to its separate jobs Redis. `--with analytics` selects the existing analytics profile. These additions have configuration-resolution coverage; their live initialization still needs qualification. Large AI models remain outside this runner. Full source processes receive the local OTLP endpoint; end-to-end application trace collection and log shipping remain unverified.

### Isolated identity and checks

```bash
pnpm dev:isolated foundation
pnpm dev:isolated identity
pnpm dev:isolated watch
pnpm test:local-runner
pnpm test:local-lifecycle --reset-disposable
node tooling/scripts/local-dev/browser-smoke.mjs
node tooling/scripts/local-dev/feedback.mjs
```

`foundation` applies the existing versioned DDL and permission catalog applicator to validated owned storage. `identity` reserves `local.requester`, `local.approver`, `local.steward` and `local.unauthorized` in the isolated realm. Credentials stay in private storage. These users have **no product test grants yet**; identity creation does not satisfy the authorization milestone or manufacture approvals.

`watch` starts/reuses source processes against an initialized environment. The lifecycle suite is explicitly destructive to this runner's disposable volumes: it tests down/up preservation, simple/full switches, reset and unchanged unmanaged containers. The browser smoke checks page responses and real Keycloak PKCE login redirects; it does not submit credentials or complete an authenticated journey. The feedback check measures API watch restart latency using a reversible timestamp change, not a business-semantic edit.

Still required: broader host/probe portability, trusted TLS and application gateway routes, explicit synthetic product grants, metadata compiler/signing/reload integration, BP fixtures and the complete allowed/denied journey matrix, and candidate freeze/qualification with Stack v2 image binding. No QA readiness or release acceptance is asserted by these commands.

## Shared workspace graph preview verification

Run `pnpm test:local-graph-browser` in the shared DEV source workspace after capturing
DEV Studio `catl.admin` with elevated assurance and DEV NEON `catl.admin` with its
existing permissions. The runner verifies both identities before changing metadata.
It forks a published BP graph through Studio, saves a list presentation through the
editor, and checks NEON's authenticated descriptor response. It also checks failed
compilation retaining the active revision, recovery, concurrent revision rejection,
and rejection of publication by an author without publication authority.

Receipts are private development evidence in
`~/.athyper/qualification/dev-graph-preview/`; they do not qualify a release. The
working draft remains visible in Studio. A failed run records the last completed
check; it must not be reported as a successful browser journey.

The separately approved `provision-cirrusatlantic-preview-session.sql` grant permits
only author/validate/test for two hours. It does not extend existing expired grants,
remove MFA, or provide publication/reviewer authority. Re-running it does not renew
an expired session grant. Inspect the actual expiration before running the proof.
