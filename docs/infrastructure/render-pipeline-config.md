# Render pipeline config — docrender (Gotenberg) + docparser (Tika)

Canonical home for docrender and docparser tuning. The compose files under
`stack/compose/render/` are intentionally thin and defer to this directory
for everything that operators would want to diff across environments
(timeouts, memory, parser exclusions, OCR policy).

## File layout

| File                                              | Purpose                                                                 | Read by container? |
|---------------------------------------------------|-------------------------------------------------------------------------|--------------------|
| `docrender.conf`                                  | Shell-style KEY=VALUE reference for docrender CLI tuning (local)        | No — operator ref  |
| `environments/docrender.staging.conf`             | Same knobs tuned for staging                                            | No — operator ref  |
| `environments/docrender.production.conf`          | Same knobs tuned for production                                         | No — operator ref  |
| `docparser-config.xml`                            | Apache Tika `--config` XML (parsers, OCR, timeouts) — local defaults    | **Yes**            |
| `environments/docparser-config.staging.xml`       | Tika XML for staging                                                    | **Yes**            |
| `environments/docparser-config.production.xml`    | Tika XML for production                                                 | **Yes**            |

### docrender is CLI-flag driven, not file-driven

Gotenberg 8.x has no `--config=<file>` option; every knob is a CLI flag
passed at `docker run`. `docrender.conf` is therefore **not** read by
the Gotenberg process — it is a documented, diffable reference of the
flag values that operators are expected to propagate into `stack/env/.env`
for compose-time `${...}` interpolation. The same file is mounted
read-only at `/etc/athyper/render/docrender.conf` inside the container
purely so `docker exec docrender cat /etc/athyper/render/docrender.conf`
surfaces the "what and why" during triage.

### docparser is truly file-driven

`docparser-config.xml` is mounted at `/config/docparser-config.xml` and the
compose command passes `--config=/config/docparser-config.xml` to
`tika-server`. Edits take effect on container restart.

## Render DLQ contract — docrender error categories

**Binding on the `GotenbergAdapter`**
([server/packages/foundation/render/gotenberg-client.ts](../../server/packages/foundation/render/gotenberg-client.ts)).
Retry / DLQ policy is driven by the category, never by the adapter.

| docrender signal                               | `log.render_dlq.error_category` | Policy                                               |
|------------------------------------------------|---------------------------------|------------------------------------------------------|
| HTTP 503 (LibreOffice busy, pool exhausted)    | `transient`                     | Retry with exponential backoff; no DLQ on first failures |
| HTTP 504 (conversion timeout)                  | `timeout`                       | Retry **once**; if still 504, DLQ                    |
| HTTP 400 (bad template / invalid input)        | `permanent`                     | DLQ immediately — no retry                           |
| Connection refused / container crash           | `crash`                         | DLQ + alert ops via `event.outbox` → `ops_alert` topic |
| HTTP 200 with empty body                       | `permanent`                     | DLQ — treat as malformed output                      |
| Other 5xx                                      | `transient`                     | Retry with exponential backoff                       |

When the Gotenberg image is bumped (see compose file), re-check the
status-code surface and update this table plus
`gotenberg-client.ts#classifyHttpError` in lockstep.

## Per-environment workflow

To change a docrender knob for production:

1. Edit `environments/docrender.production.conf` with the new value.
2. Copy the same key into `stack/env/production.env.example` (and the
   deployed `stack/env/.env` on the prod host).
3. Redeploy. Compose reads the env at parse time and bakes the flag
   into the `docrender` container's command.

To change a docparser knob:

1. Edit `environments/docparser-config.production.xml`.
2. `docker compose up -d docparser` (or equivalent). No env-file touch needed.

## Scaling + pool notes

- **Chromium (HTML→PDF)** is concurrent within a single docrender instance.
- **LibreOffice (Office→PDF)** is serialised per instance. Scale via
  `DOCRENDER_REPLICAS`, never by raising in-process parallelism.
- `--libreoffice-restart-after=N` bounds LibreOffice memory-leak growth
  at the cost of a cold-start every N conversions. Keep N small on
  memory-constrained hosts, large on beefy prod nodes.
- docparser OCR jobs are CPU-bound and per-request; the task timeout in
  `docparser-config.xml` is the hard ceiling before the parse is aborted.

## Environment variable surface (read by compose)

See `stack/env/.env.example` under `# --- Render profile ---` and
`# --- Render URLs ---`:

- `DOCRENDER_REPLICAS` — 1 local, 2 staging/production
- `DOCRENDER_MEMORY_LIMIT` — 1 g local, 1.5 g staging, 2 g production
- `DOCRENDER_API_TIMEOUT` — HTTP-level API timeout (default `120s`)
- `DOCRENDER_LIBREOFFICE_RESTART_AFTER` — LibreOffice restart cadence (default `50`)
- `DOCRENDER_CHROMIUM_ALLOW_LIST` — Chromium URL allow-list (default `file:///tmp.*`)
- `DOCRENDER_BASE_URL` — app-side consumer URL (default `http://docrender:3000`)
- `DOCPARSER_MEMORY_LIMIT` — 1 g local, 1.5 g staging, 2 g production
- `DOCPARSER_URL` — app-side consumer URL (default `http://docparser:9998`)
