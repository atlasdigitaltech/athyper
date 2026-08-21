# Stack v2 workload placement

**Status:** Operations-lite composed; heavy monitoring adapters remain pending
**Reviewed:** 2026-08-21

## Inventory result

The legacy `stack/compose/` tree contains 39 distinct Compose service IDs when
all profiles and overlays are combined. The number 40 in the machine inventory
referred to Docker images, not 40 application services. All 39 legacy services
exist in the Stack v2 service catalog and every one now has exactly one workload
set in `deploy/catalog/workload-sets.yaml`.

Stack v2 also owns five additions: shared platform ingress, database
initialization, foundation migration, Infisical database initialization, and
analytics database initialization. The authorization qualification database is
an ephemeral test fixture and is not an application workload.

## Placement decision

| Workload set | Legacy services | Placement | Activation | Current state |
|---|---:|---|---|---|
| `instance-runtime` | 20 | One copy per DEV/QA/STG instance | Instance preset | Composed |
| `instance-operator-tools` | 5 | Instance-scoped, loopback-only | Explicit profile | Composed |
| `instance-telemetry-exporter` | 1 | Beside the instance Redis provider | Explicit profile | Composed |
| `shared-observability` | 8 | One host operations project | Platform policy | Partial |
| `shared-monitoring` | 3 | One host operations project | Platform policy | Design required |
| `retired-legacy-discovery` | 2 | Prohibited | Never | Retired |

Starting all 39 legacy services inside every instance is rejected. It duplicates
stateful operations data, exposes unnecessary administration surfaces, and does
not fit the `laptop-32` envelope. The 20-service runtime is the correct DEV
baseline. Optional tools are activated only for a bounded task and are stopped
after use.

## Remaining implementation

### Shared observability

Prometheus, Loki, Tempo, Grafana, Alertmanager, Redis exporter, and Alloy belong
in a controller-owned `athyper-operations` project. Every metric, log, and trace
must carry `instance`, `environment`, `service`, and `source_revision` labels.
DEV/QA/STG data must have separate retention and query boundaries.

The local Loki and Tempo configurations use filesystem storage, so their legacy
S3 bucket initialization jobs must not run locally. They remain catalogued for
remote object-storage mode and must produce one-shot completion receipts there.
Alloy receives Loki-compatible push traffic and forwards structured logs without Docker API access.
The two legacy socket proxies remain prohibited; direct `docker.sock` mounting
is also prohibited.

The `athyper-operations` project now provides the bounded
`laptop-32-ops-lite` model. Prometheus, Loki, Grafana, Alloy, and Alertmanager
use 1,408 MiB/1.35 CPU of a 3,072 MiB/3 CPU operations budget. Tempo is an
explicit `tracing` mode and raises that envelope to 1,792 MiB/1.7 CPU. Alloy
accepts push-based Loki traffic on a loopback binding and has no Docker API
discovery.

The controller accepts exactly one operations mode at a time. It has no `full`
mode and rejects attempts to combine tracing and monitoring modes. This keeps
the full legacy observability/monitoring suite off `laptop-32`.

### Shared monitoring

Uptime Kuma, Healthchecks, and GlitchTip belong in the operations project, not
inside an application instance. Their databases, cache namespaces, routes,
backup owners, authentication, and retention must be independent of DEV/QA/STG.
GlitchTip and Healthchecks require dedicated least-privilege database roles;
they must not reuse the PostgreSQL administrator identity found in Stack v1.

External event-ingest endpoints may bypass interactive gateway authentication
only when protected by service-specific DSNs or signed tokens. Operator UIs must
remain authenticated and loopback-only on workstations.

Uptime Kuma is composed as the on-demand `statuswatch` mode at 1,600 MiB/1.55
CPU including the lite baseline. `cronwatch` and `errorcollect` are recognized
controller modes but remain blocked until their dedicated PostgreSQL/cache
roles, file-secret adapters, migration receipts, and backup contracts exist.

### Operator tools

Infisical, Metabase, Pgweb, Bull Board, and the separate jobs Redis are optional
instance capabilities. They require exact confirmation, owner-only secrets,
loopback bindings, controller receipts, and resource admission. Pgweb and Bull
Board are on-demand and must not use `restart: unless-stopped`.

## Required completion order

1. Add controlled `operations up/down` execution and an independent project
   ownership receipt; planning remains read-only today.
2. Remove the transitional six-service observability copy from the instance
   optional overlay.
3. Add controller-rendered Prometheus targets with mandatory instance labels.
4. Add monitoring database initialization, file-secret adapters, and least-privilege roles.
5. Compose and qualify Uptime Kuma, Healthchecks, and GlitchTip.
6. Add backup/restore receipts for operations state.
7. Run DEV with each operations mode independently on `laptop-32`, then execute
   QA isolation twice before enabling shared operations for STG.

Run the reconciliation at any time with:

```sh
pnpm athyper catalog inspect --json
pnpm athyper operations plan lite --json
pnpm athyper operations plan tracing --json
pnpm athyper operations plan statuswatch --json
```

The command returns exit code `2` while a workload set is `partial` or
`design-required`, and also fails if a legacy service is missing, duplicated, or
assigned to no workload set.
