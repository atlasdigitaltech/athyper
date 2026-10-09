# Deep Analysis — `deploy/` (Stack v2)

Purpose: understand what the current `deploy/` tree does, and extract the minimal
container recipe for the agreed **first step** — one container setup + three
applications (neon / mesh / studio), each serving **one static page**.

---

## 1. What `deploy/` is

`deploy/` is a **production-grade, controller-owned container orchestration
system** ("Stack v2"). It is far larger than "run three apps": it manages a
hardened multi-service platform (ingress, Postgres, IAM, cache, object storage,
search, document processing, observability) with policy gates, receipts,
digest-pinned image sets, and release/rehearsal governance.

It is driven by a CLI controller (`athyper`) and three Docker Compose projects.
Running the full "parity" preset costs **13,312 MiB RAM and 15.95 CPU** — the
opposite of a three-static-page starting point.

## 2. Directory map

| Path | Role |
| --- | --- |
| `stackctl/` | The `athyper` controller CLI (27 modules: `plan`, `gates`, `execution`, `policy`, `model`, `schema`, `evidence`, `qualification`, `rehearsal`, `operations`, `doctor`, `lifecycle`, …). Owns every mutating Compose action, receipts, and gates. |
| `compose/` | The three Compose projects: `platform` (shared ingress), `instance` (core infra + app overlay), `operations` (observability). |
| `config/` | Build/config for ~20 infra images: `postgres`, `pgbouncer`, `traefik`, `redis`(valkey), `iam`(keycloak), `meilisearch`, `gotenberg`, `tika`, `clamav`, `seaweedfs`, `s3-tools`, `metabase`, `telemetry`, … |
| `docker-bake.hcl` | Build matrix: 5 app targets (`neon-web`, `mesh-web`, `studio-web`, `runtime-server`, `iam`) + ~15 infra targets. |
| `catalog/` | `applications.yaml`, `capabilities.yaml`, `workload-sets.yaml` — the service/instance catalog. |
| `instances/` | ~29 JSON schemas (receipts, image sets, qualification, rehearsal, backup) + `templates/stg.yaml`. |
| `image-sets/` | Digest-pinned image sets: `dev.yaml`, `candidates/`, `releases/`. |
| `bootstrap/` | Secret-generation + host-config scripts (`generate-*-secrets.sh`, `Configure-AthyperHosts.ps1`). |
| `providers/`, `aws/` | Provider config (e.g. AWS SES) and object-storage assets. |
| `orchestration/` | K3s assessment gate (deferred; Compose remains the orchestrator). |
| `releases/`, `rehearsals/`, `resources/`, `schemas/`, `production/`, `docs/` | Release/rehearsal governance, resource profiles, and operations docs. |

## 3. The three Compose projects

### `compose/platform/` — shared ingress (the only project publishing ports 80/443)
- `ingress`: Traefik 3.7.13, host-based routing to `gateway-<instance>` aliases.
- `platform-outage`: nginx outage/maintenance page.

### `compose/instance/` — core infrastructure (`compose.yaml`) + app overlay
Core (`compose.yaml`) services:

| Service | Image | Purpose |
| --- | --- | --- |
| `gateway` | traefik | per-instance edge router (no host port) |
| `gateway-outage` | nginx | outage fallback |
| `db` | postgres 16.15 | primary database |
| `db-init` | postgres | one-shot DB/user bootstrap |
| `dbpool-apps` / `dbpool-session` | pgbouncer | connection pools |
| `memorycache` / `jobqueue` / `secretstore-cache` | valkey | cache / queue / secret cache |
| `objectstorage` + `objectstorage-init` | seaweedfs + s3-tools | S3-compatible storage |
| `iam` | keycloak | identity provider |

Overlay `compose.parity.yaml` (the DEV full preset) adds:

| Service | Image | Purpose |
| --- | --- | --- |
| `neon-web` / `mesh-web` / `studio-web` | athyper *-web | the three Next.js planes |
| `api` / `worker` / `scheduler` | runtime-server | Express API + BullMQ workers |
| `db-migration` / `db-forward-migration` | runtime-server | clean-slate / forward DDL runners |
| `virusscan` | clamav | malware scan |
| `docrender` | gotenberg | PDF/HTML rendering |
| `docparser` | tika | document parsing |
| `searchcore` + `searchcore-key-init` | meilisearch | search |

### `compose/operations/` — observability
Grafana / Prometheus / Loki / Tempo / Alloy (optional "lite" preset).

## 4. How the three apps are built and run

### Build — `docker-bake.hcl` → `apps/Dockerfile`

Each plane is the **same multi-stage Next.js build**, parameterized by build args:

```hcl
target "neon-web" {
  dockerfile = "apps/Dockerfile"
  args = { APP_PACKAGE = "@athyper/neon", APP_NAME = "neon" }
}
```

`apps/Dockerfile`:
1. **build stage** — copies the monorepo, `pnpm install --frozen-lockfile`,
   `pnpm --filter "${APP_PACKAGE}" build`.
2. **runtime stage** — copies `.next/standalone`, `.next/static`, `public`, drops
   package-manager tooling, runs `node apps/${APP_NAME}/server.js` as `node` on
   port `3000`.

This is clean and directly reusable for the rebuild.

### Run — `compose.parity.yaml`

Each web service (`x-web-common`) **depends on `api`, `iam`, and `memorycache`**
before it starts, joins `edge` + `app` networks, and is health-checked at
`http://127.0.0.1:3000/`. In the full stack, the app cannot even start without
the API + Keycloak + Redis.

```yaml
neon-web:
  <<: *web-common
  image: ...athyper-neon-web:dev
  environment:
    ATHYPER_APP_ID: neon
    ATHYPER_APP_DOMAIN: neon.${ATHYPER_DOMAIN_SUFFIX}
```

## 5. The controller (`stackctl`) — what it owns

`stackctl/bin/athyper.mjs` is the entrypoint. It enforces, in order: host
qualification, cold-start evidence, secret-file policy, candidate-image
immutability, resource limits, and receipt ownership. Every mutation
(`up`/`down`/`restart`/`backup`/`restore`) requires the instance ID repeated on
the command line and an exact controller ownership receipt. Plans
(`athyper plan dev`) are read-only. This is release-engineering machinery, not
needed to show three static pages.

## 6. Full stack vs. the first step — the gap

| Concern | Full Stack v2 | First step (three static pages) |
| --- | --- | --- |
| Services | ~20 (incl. 3 apps) | **3** (the apps only) |
| Ingress | Traefik, TLS, hostnames | loopback ports (or optional nginx) |
| DB / cache / search / docs / storage | Postgres, Valkey, Meilisearch, Gotenberg, Tika, SeaweedFS, ClamAV | **none** |
| IAM | Keycloak + clients/secrets | **none** |
| Controller / gates / receipts | `stackctl` + schemas + image sets | **none** |
| Observability | Grafana/Prometheus/Loki/Tempo | **none** |

The current app runtime *hard-couples* the web apps to `api` + `iam` +
`memorycache` via `depends_on`. For a static page, that coupling must be removed
so each plane can boot standalone.

## 7. Minimal first-step recipe (extracted)

One `docker-compose.yml`, three services, no infrastructure, no controller:

```yaml
services:
  neon-web:
    build:
      context: .
      dockerfile: apps/Dockerfile
      args: { APP_PACKAGE: "@athyper/neon", APP_NAME: neon }
    ports: ["127.0.0.1:3001:3000"]
    restart: unless-stopped
    healthcheck: { test: ["CMD-SHELL", "wget -q --spider http://127.0.0.1:3000/"], interval: 15s, timeout: 5s, retries: 10 }

  mesh-web:
    build:
      context: .
      dockerfile: apps/Dockerfile
      args: { APP_PACKAGE: "@athyper/mesh", APP_NAME: mesh }
    ports: ["127.0.0.1:3002:3000"]
    restart: unless-stopped

  studio-web:
    build:
      context: .
      dockerfile: apps/Dockerfile
      args: { APP_PACKAGE: "@athyper/studio", APP_NAME: studio }
    ports: ["127.0.0.1:3003:3000"]
    restart: unless-stopped
```

Each app is a minimal Next.js project with a single `app/page.tsx`
(e.g. "Neon — country reference (coming)"). Reaches:
`http://127.0.0.1:3001` (neon), `:3002` (mesh), `:3003` (studio).

Hostname routing (`neon.dev.athyper.test` etc.) via a shared Traefik ingress can
be re-added in a later phase once there is an API to route.

## 8. Reuse vs. discard

**Reuse (carry into the rebuild):**
- `apps/Dockerfile` — the standalone Next.js multi-stage build (verbatim pattern).
- The app build-arg convention (`APP_PACKAGE` / `APP_NAME`).
- Service naming `neon-web` / `mesh-web` / `studio-web` and port `3000`.

**Discard for now (not needed until later phases):**
- `stackctl/` controller, gates, receipts, schemas, catalogs, image-sets.
- `compose/platform/` + `compose/operations/` + all infra services.
- `config/` infra images, `bootstrap/` secret scripts, `providers/`, `aws/`,
  `orchestration/`, `releases/`, `rehearsals/`, `production/`.

## 9. Recommendation

1. First step = **3 standalone Next.js apps, one page each, one compose file**
   (§7). No Postgres/Keycloak/Redis/Traefik/controller.
2. Keep the `apps/Dockerfile` pattern so later phases (DB, API, entity framework,
   publication) bolt on without reworking the app build.
3. Reintroduce infrastructure **incrementally** (Postgres+DDL next, then API,
   then IAM) rather than restoring the full Stack v2 envelope.
