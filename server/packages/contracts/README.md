# Server contract ownership

These packages define stable boundaries only. They contain no Express, BullMQ,
Kysely, database, network-client, or telemetry-SDK implementation.

| Package | Canonical ownership | Explicitly not owned here |
| --- | --- | --- |
| `@athyper/server-contract-auth` | verified identity, permission snapshots, token-verification and authorization ports | Keycloak/Jose, middleware, session storage |
| `@athyper/server-contract-events` | domain-event and transactional-outbox envelopes, publisher/handler ports | outbox SQL, queues, webhooks |
| `@athyper/server-contract-jobs` | generic job envelopes, execution context, queue and scheduler ports | BullMQ, Redis, worker processes, capability-specific job catalogs |
| `@athyper/server-contract-notifications` | provider-neutral delivery requests, results, channels, and channel-handler lifecycle | SMTP/Twilio SDKs, template rendering, recipient lookup, push subscriptions, webhook delivery |
| `@athyper/server-contract-records` | record query/mutation commands, results, and service ports | descriptors, SQL plans, Kysely repositories, HTTP responses |
| `@athyper/server-contract-rendering` | validated HTML-to-PDF requests, page options, rendered artifacts, renderer health | templates, durable output state, object storage, Gotenberg/Chromium clients |
| `@athyper/server-contract-telemetry` | exportable log/metric/trace records and exporter port | in-process logger/metrics/tracer ports, OpenTelemetry, Pino, Sentry |

Foundation remains the canonical owner of `PlaneKey`, logging, metrics, and
tracing primitives. Contracts may import those types in the allowed downward
direction; Foundation never imports contracts.
