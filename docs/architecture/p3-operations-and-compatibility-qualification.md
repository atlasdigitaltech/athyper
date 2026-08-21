# P3 operations and compatibility qualification

Status: local gates implemented; disposable-environment and dual-server live
gates require external services.

## Decisions

The platform host retains the Sentry SDK and supports a Sentry or compatible
GlitchTip DSN. Without a DSN it is an explicit no-op. Boot failures are fatal
and flushed before exit; unexpected HTTP, worker, and scheduler paths use
operational capture. Unit tests verify disabled, operational, fatal, and flush
paths without sending network traffic.

The supported BullBoard replacement is the authenticated REST surface under
`/api/jobs/admin`: queue, execution, dead-letter, cancel/retry/replay, and
schedule governance operations. Reads require `jobs.board.view` or
`jobs.schedule.view`; mutations require `jobs.queue.manage` or
`jobs.schedule.manage`. There is no embedded BullBoard endpoint. The emergency
compose sidecar is unsupported and excluded from product qualification.

## Automated gates

`pnpm openapi:check` requires every public route to be a contract route or to
match an exact, reason-bearing exclusion source. New unclassified routes and
stale exclusions fail. An exclusion is migration debt, not OpenAPI coverage.

Legacy-versus-rebuilt compatibility must compare method, normalized path,
request/response schema, authorization, durable side effects, and failure
semantics. Static route identity alone is insufficient. Live contract replay
requires both servers plus isolated databases and is not represented as passed
by repository-only tests.

The disposable three-plane gate must start Studio, Neon, and Mesh PostgreSQL,
Redis/BullMQ, object storage, search, malware scanning, rendering, API, worker,
and scheduler processes. It must verify readiness, representative verticals,
retry/dead-letter and schedule behavior, signal handling, bounded graceful
drain, and idempotent shutdown. Missing service endpoints or credentials make
this gate `not run`, never `passed`.
