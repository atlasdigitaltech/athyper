# Phase 9 Notifications Recovery

## Boundary

`@athyper/server-contract-notifications` owns provider-neutral delivery, inbox,
recipient, consent, push-subscription, webhook and dispatch contracts.
`@athyper/server-platform-notifications` owns orchestration, plane-local Kysely
repositories, the authenticated HTTP surface and BullMQ handlers. SMTP, Twilio,
Meta WhatsApp, FCM and Web Push remain concrete transports in
`@athyper/server-adapter-communications`. Only the platform host composes them.

## Three-plane model

Every repository operation carries `planeKey`, `tenantId` and `principalId` and
executes through the normal plane transaction coordinator. Athyper, Neon and
Mesh therefore use the same common `control`, `event`, `log` and plane-local
`master.principal_notification_preference` contracts without cross-plane reads.
The canonical runtime value is `athyper`; the stale DDL value `admin` was removed.

Routing `entity_type` is the published Entity Meta `entityCode`. Producers pass
stable entity coordinates and an approved payload projection. Templates and
transports must not query arbitrary entity tables or import Records services.

## Recovered in this increment

- In-app message, delivery and inbox projection are persisted atomically.
- Inbox list/read and self-scoped SSE routes are registered in the host.
- Web, Android and iOS push subscriptions are self-scoped and plane-local.
- Recipient email/phone resolution uses the canonical contact-link owner model.
- WhatsApp is exposed only with active plane-local consent.
- In-app, SMTP, SMS, Meta WhatsApp, FCM and Web Push handlers are host-composed.
- `notifications.dispatch` is a retryable BullMQ job with a deterministic
  semantic job ID; failed channel delivery causes queue retry.
- Governed outbox rows are projected into a notification-owned consumer-state
  table, claimed per tenant with leases, and planned idempotently from routing
  rules and active locale-aware templates.
- Rule conditions, recipient projections, strict required variables, principal
  preference overrides, rule-level digest defaults, and hourly/daily/weekly
  digest materialization are evaluated inside the selected physical plane.
- External and in-app deliveries use tenant-scoped `SKIP LOCKED` claims,
  exponential retry, expired-lease recovery, redacted attempt logs, terminal
  DLQ records, and message-count aggregation.
- SSE publication uses Redis pattern subscriptions scoped by tenant and
  principal, enabling multiple API replicas while PostgreSQL remains the source
  of truth.
- Webhooks use separately claimed deliveries, HMAC signatures, redirect denial,
  HTTPS/private-address enforcement, retry classification, lease recovery and
  terminal DLQ handling.
- The host registers BullMQ handlers plus per-plane discovery and digest
  schedules for Athyper, Neon and Mesh. Concrete transports remain host-only.
- Package APIs, tests, builds, server boundaries and DDL planning pass.

## Operations and retained follow-up

- Apply the common notification DDL to each plane through the governed database
  provisioning/migration process before enabling notification schedules. A
  worker must never operate against planes at different schema revisions.
- Start the dedicated BullMQ Redis profile and Mailpit/provider sandboxes for the
  full live matrix. The base local profile may provide only shared Redis and
  PostgreSQL.
- Add provider callbacks for delivery receipts, email bounce/complaint handling,
  provider-aware rate limiting, circuit breakers and configured failover.
- Store webhook signing secrets behind the platform secret reference boundary;
  the current DDL compatibility column is transitional.
- Add operational dashboards/alerts for planning lag, expired leases, retry age,
  DLQ growth, digest backlog and Redis SSE subscriber failures.

The implementation deliberately discovers tenant work through a narrow
security-definer database function. It does not enumerate tenant tables from an
untrusted request context, and every claim/write after discovery is executed in
an explicit plane and tenant transaction.

## Document attachments

Notification messages persist only a durable document attachment reference in
`event.notification_message_attachment`; they never store a MinIO/S3 key,
presigned URL, scan result or file bytes. The Documents service resolves a
reference immediately before delivery and enforces active, clean-scanned,
unexpired, linked and recipient-authorized state. Links are the default. Email
may receive embedded bytes only when a routing reference explicitly asks for it
and Documents confirms its configured size limit and checksum.

The resolver requires a host-injected recipient access policy. This is
intentional: a background notification job does not have a recipient's verified
permission snapshot and must not manufacture one. Without that policy the
delivery fails closed. Gotenberg remains upstream in Documents, while Tika and
Meilisearch continue asynchronously in document processing and never block a
notification send.
