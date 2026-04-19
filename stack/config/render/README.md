# Render pipeline config — Gotenberg + Tika

Canonical home for Gotenberg and Tika tuning. The compose files under
`stack/compose/render/` are intentionally thin and defer to this directory
for everything that operators would want to diff across environments
(timeouts, memory, parser exclusions, OCR policy).

## File layout

| File                                        | Purpose                                                                 | Read by container? |
|---------------------------------------------|-------------------------------------------------------------------------|--------------------|
| `gotenberg.conf`                            | Shell-style KEY=VALUE reference for Gotenberg CLI tuning (local)        | No — operator ref  |
| `environments/gotenberg.staging.conf`       | Same knobs tuned for staging                                            | No — operator ref  |
| `environments/gotenberg.production.conf`    | Same knobs tuned for production                                         | No — operator ref  |
| `tika-config.xml`                           | Apache Tika `--config` XML (parsers, OCR, timeouts) — local defaults    | **Yes**            |
| `environments/tika-config.staging.xml`      | Tika XML for staging                                                    | **Yes**            |
| `environments/tika-config.production.xml`   | Tika XML for production                                                 | **Yes**            |

### Gotenberg is CLI-flag driven, not file-driven

Gotenberg 8.x has no `--config=<file>` option; every knob is a CLI flag
passed at `docker run`. `gotenberg.conf` is therefore **not** read by
the Gotenberg process — it is a documented, diffable reference of the
flag values that operators are expected to propagate into `stack/env/.env`
for compose-time `${...}` interpolation. The same file is mounted
read-only at `/etc/athyper/render/gotenberg.conf` inside the container
purely so `docker exec gotenberg cat /etc/athyper/render/gotenberg.conf`
surfaces the "what and why" during triage.

### Tika is truly file-driven

`tika-config.xml` is mounted at `/config/tika-config.xml` and the
compose command passes `--config=/config/tika-config.xml` to
`tika-server`. Edits take effect on container restart.

## Render DLQ contract — Gotenberg error categories

**Binding on the `GotenbergAdapter`**
([server/src/foundation/render/gotenberg-client.ts](../../../server/src/foundation/render/gotenberg-client.ts)).
Retry / DLQ policy is driven by the category, never by the adapter.

| Gotenberg signal                               | `log.render_dlq.error_category` | Policy                                               |
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

To change a Gotenberg knob for production:

1. Edit `environments/gotenberg.production.conf` with the new value.
2. Copy the same key into `stack/env/production.env.example` (and the
   deployed `stack/env/.env` on the prod host).
3. Redeploy. Compose reads the env at parse time and bakes the flag
   into the `gotenberg` container's command.

To change a Tika knob:

1. Edit `environments/tika-config.production.xml`.
2. `docker compose up -d tika` (or equivalent). No env-file touch needed.

## Scaling + pool notes

- **Chromium (HTML→PDF)** is concurrent within a single Gotenberg instance.
- **LibreOffice (Office→PDF)** is serialised per instance. Scale via
  `GOTENBERG_REPLICAS`, never by raising in-process parallelism.
- `--libreoffice-restart-after=N` bounds LibreOffice memory-leak growth
  at the cost of a cold-start every N conversions. Keep N small on
  memory-constrained hosts, large on beefy prod nodes.
- Tika OCR jobs are CPU-bound and per-request; the task timeout in
  `tika-config.xml` is the hard ceiling before the parse is aborted.

## Environment variable surface (read by compose)

See `stack/env/.env.example` under `# --- Render profile ---` and
`# --- Render URLs ---`:

- `GOTENBERG_REPLICAS` — 1 local, 2 staging/production
- `GOTENBERG_MEMORY_LIMIT` — 1 g local, 1.5 g staging, 2 g production
- `GOTENBERG_API_TIMEOUT` — HTTP-level API timeout (default `120s`)
- `GOTENBERG_LIBREOFFICE_RESTART_AFTER` — LibreOffice restart cadence (default `50`)
- `GOTENBERG_CHROMIUM_ALLOW_LIST` — Chromium URL allow-list (default `file:///tmp.*`)
- `GOTENBERG_BASE_URL` — app-side consumer URL (default `http://gotenberg:3000`)
- `TIKA_MEMORY_LIMIT` — 1 g local, 1.5 g staging, 2 g production
- `TIKA_URL` — app-side consumer URL (default `http://tika:9998`)
