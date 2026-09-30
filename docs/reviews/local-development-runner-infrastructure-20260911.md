# Local development runner: first infrastructure increment

Date: 2026-09-11. Scope: local infrastructure engineering evidence only. The overall development plan, application runtime and BP authorization journey are not qualified by this record.

## Implemented

- `devsimple` and `devfull` aliases use one runner and versioned preset catalog.
- Existing Compose overlays/profiles resolve through Docker Compose, then a selected private graph excludes application images, migrations and external platform networks.
- Checkout identity controls projects, volumes, ports, realm, secrets and manifests. Lifecycle changes require exact manager/environment/project labels and an exclusive operation lock.
- `plan`, `doctor`, `status`, `logs`, `measure`, infrastructure startup, preset switching, `down` and infrastructure `reset` are available.
- Source-aware IAM image reuse/build uses the existing Docker Bake definition. The generated realm uses isolated names and callback coordinates.
- Secret consumers use private files; wrappers drop privileges before Grafana/Redis-exporter startup. Infisical receives the required 32-byte UTF-8 encryption key.
- A private host-access network enables loopback bindings without opening the existing internal data/operations networks or attaching shared networks.

## Observed validation

Eight runner tests pass, covering preset identity, invalid inputs, dependency exclusion, private network/volume projection, foreign ownership rejection, lifecycle locking, distinct checkouts, and generated realm/private-secret behavior. Formatting and shell syntax checks pass.

Real container testing established:

1. Simple infrastructure starts; Keycloak discovery returns HTTP 200 with the exact generated issuer.
2. Switching to full preserves a marker in the disposable PostgreSQL database.
3. Explicit runner reset removes that marker and initializes fresh infrastructure. Full startup after clean reset passes native health checks and the supplemental HTTP probes, including Redis metrics connectivity and the configured Grafana credential.
4. Switching full back to simple preserves a newly created marker.
5. `down` followed by simple startup preserves that marker across container/network recreation.
6. All 79 pre-existing running containers in the before-test inventory retained their IDs, running state and start timestamps at the comparison checkpoint. The runner did not restart those deployments.
7. A separate temporary checkout invoked the real CLI and was rejected by the active-checkout guard before Docker startup. The temporary checkout was removed after the check.

Selected Docker working-set snapshots:

| Preset    | Snapshot time (UTC)     | Infrastructure working set | Target     |
| --------- | ----------------------- | -------------------------- | ---------- |
| devsimple | 2026-09-11 10:57:11.995 | 1,147 MiB                  | 6,144 MiB  |
| devfull   | 2026-09-11 10:56:21.963 | 2,593 MiB                  | 16,384 MiB |

These measurements cover the selected infrastructure on the current WSL host (approximately 32 GB available to WSL, 16 logical processors), with other workloads present. They do not include future source watchers, application builds or BP scenarios, and do not establish support on a physical 16 GB developer machine. Full-preset measurements followed initialization and are not sustained-load benchmarks.

Timestamped raw snapshots remain under `~/.athyper/local-dev/environments/2a7d2dadf3eb/measurement-*.json`. They include source revision/dirty state, Compose checksum, tool versions and per-container measurements. They are development receipts; earlier failed/partial startup snapshots do not become qualification evidence after a fix.

Live testing found and corrected realm import naming, secret-file consumers, Infisical key format, internal-network port publication, and Compose's handling of an independently targeted successful one-shot initializer. A clean reset was used to validate the corrected bootstrap; existing DEV/QA databases were not repaired or modified.

## Remaining work

Source watcher supervision and dependency propagation, application routing/TLS, foundation/migration fixtures, signed metadata preview, synthetic identity/elevation journeys, BP tests, stale-lock recovery, and final Phase 1 qualification receipts remain pending. No WSL allocation change, publication, release approval, grant change in existing environments or shared activation occurred.
