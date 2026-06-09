# Render Profile — docrender (Gotenberg) + docparser (Tika)

Document rendering and content extraction services. docrender (Gotenberg) replaced the
planned `athyper-renderer` stub.

## Services

| Service | Purpose | Internal URL |
|---|---|---|
| `docrender` | HTML/Office → PDF | `http://docrender:3000` |
| `docparser` | Text/metadata extraction from binaries | `http://docparser:9998` |

Both are stateless, internal-only (no Traefik labels), and have no DB or
Redis coupling.

## Canonical tuning + error-category contract

The canonical documentation for Gotenberg CLI flags, the Tika XML config
format, and the **`log.render_dlq.error_category` mapping that binds the
`GotenbergAdapter`** lives in
[stack/config/render/README.md](../../config/render/README.md). Do not
fork the error-category table — update that file if the Gotenberg
status-code surface changes.

### Config file layout (for quick reference)

| File | Consumed by |
|---|---|
| `stack/config/render/docrender.conf` | Operator reference (mounted read-only into docrender container) |
| `stack/config/render/environments/docrender.{staging,production}.conf` | Per-env diff targets |
| `stack/config/render/docparser-config.xml` | **docparser / Tika** via `--config` CLI flag (mounted at `/config/docparser-config.xml`) |
| `stack/config/render/environments/docparser-config.{staging,production}.xml` | Per-env variants |

### Why docrender's `.conf` is not read by Gotenberg

Gotenberg 8.x has no config-file option; every knob is a CLI flag passed
at container launch. The `.conf` file is a documented, diffable
reference of the knob values. Compose interpolates the actual flag
values from `stack/env/.env` at parse time. Operator workflow for
tuning changes lives in
[stack/config/render/README.md](../../config/render/README.md).

## Adapter status — Track B / B1 #2

- **Synchronous path (`RenderService`)**: `GotenbergClient` implemented at
  `server/packages/foundation/render/gotenberg-client.ts`. Preferred over the
  legacy `PdfRendererClient` when `DOCRENDER_BASE_URL` is set in the
  runtime env. Throws `GotenbergError` with `category` set per the
  contract in `stack/config/render/README.md`.
- **Async path (`render-document.worker.ts`)**: still uses in-process
  Puppeteer via `@sparticuz/chromium-min`. Migration to
  `GotenbergClient` + DLQ-category-aware retry policy is the next
  follow-up PR. The worker's `log.render_dlq` writes today use a
  generic error category; swapping to Gotenberg unlocks the full
  contract.

### Adapter responsibilities

1. Read per-render overrides from `document.render_output.manifest_json`
   before constructing the Gotenberg request (paper size, orientation,
   margins, scale, header/footer, background — see
   `master.print_profile` column mapping in
   [docs/guides/stack-container.md](../../../docs/guides/stack-container.md)).
2. On failure, write a row to `log.render_dlq` with:
   - `error_category` — per the contract in
     [stack/config/render/README.md](../../config/render/README.md)
   - `render_output_id` — FK back to `document.render_output`
   - `attempt_count` — incremented per retry
   - `error_detail` — Gotenberg response body (truncated to 4 KB)
3. Emit an `event.outbox` event for `crash` and `permanent` categories so
   the notification layer can alert ops.

### Scaling notes

- Chromium (HTML→PDF) is **concurrent within one instance**.
- LibreOffice (Office→PDF) is **serialised per instance** — scale via
  `DOCRENDER_REPLICAS`, not by raising in-process parallelism.
- `DOCRENDER_LIBREOFFICE_RESTART_AFTER` guards against memory leaks at
  the cost of a cold-start every N conversions.

## Environment variables

See `stack/env/.env.example` (search `# --- Render profile ---` and
`# RENDER PROFILE`):

- `DOCRENDER_REPLICAS` — 1 local, 2 staging/production
- `DOCRENDER_MEMORY_LIMIT` — 1 g local, 1.5 g staging, 2 g production
- `DOCRENDER_API_TIMEOUT` — HTTP request ceiling (120 s local, 180 s staging/production)
- `DOCRENDER_LIBREOFFICE_RESTART_AFTER` — LibreOffice restart cadence (50 local, 100 staging/production)
- `DOCRENDER_CHROMIUM_ALLOW_LIST` — Chromium URL allow-list (default `file:///tmp.*` — **security-sensitive**)
- `DOCPARSER_MEMORY_LIMIT` — 1 g local, 1.5 g staging, 2 g production
