# Channel Integration Architecture

Athyper's notification model describes six channels. Runtime availability is
reported by `GET /api/notifications/capabilities` for the relay-stamped
`X-Plane`; clients must not infer availability from lookup or preference rows.
In-app, email, push, SMS, and webhook have adapter implementations, subject to
environment configuration. WhatsApp consent/schema support exists, but its
delivery adapter is not registered. Digest staging and flush logic exist, but
the scheduler is not active.

---

## System Architecture

```
Business Event (lifecycle transition, workflow action, finance posting, etc.)
        │
        ▼
NotificationOrchestrator.dispatch()
        │
        ├─ PreferenceEvaluator (reads master.principal_notification_preference)
        ├─ RecipientResolver (principal → channel address)
        ├─ DedupChecker (dedupKey + window → prevent duplicate sends)
        │
        ▼
event.notification_message (status=pending)
        │
        ▼  [5-min sweep: jobs-notifications / sched:notification-sweep]
Notification Worker (jobs-notifications queue)
        │
        ├─ in_app  → event.notification_delivery (channel='in_app') + SSE push
        ├─ email   → EmailAdapter (nodemailer SMTP)
        ├─ push    → PushAdapter (FCM / VAPID Web Push)
        ├─ sms     → SmsAdapter (Twilio)
        ├─ webhook → WebhookDeliveryWorker (HMAC-SHA256 signed HTTP)
        └─ whatsapp→ Twilio WhatsApp Business API
        │
        ▼
event.notification_delivery (per-channel delivery record, monthly partitioned)
```

---

## Channel Reference

### 1. In-App (`in_app`)

The default fallback channel. All principals receive in-app notifications unless explicitly opted out.

**Delivery mechanism:**
- An `event.notification_delivery` row is inserted with `channel = 'in_app'`.
- The record includes `read_at`, `opened_at`, `clicked_at` timestamps for engagement tracking.
- A real-time SSE stream at `GET /platform/notifications/stream` pushes new notification counts to connected clients.

**SSE Stream details:**
- DB poll every 15 seconds for `event.notification_delivery WHERE channel='in_app' AND created_at > connection_start`
- Heartbeat comment `: keepalive` every 25 seconds (prevents Traefik/nginx proxy timeouts)
- Events emitted: `notification:new` (full message payload) and `notification:count` (unread integer)
- Auth: requires valid `neon_sid` session cookie; per-tenant isolation enforced

**No external provider required.** All in-app delivery is handled internally.

---

### 2. Email (`email`)

**Adapter:** `server/packages/services/jobs/adapters/email.adapter.ts`

**Library:** `nodemailer`

**Provider config:** Stored in `control.notification_provider` (provider_type = `smtp`). Credentials are AES-256-GCM encrypted at rest.

**Payload fields used:**
- `rendered_html` — Full HTML body (generated from `control.notification_template`)
- `rendered_text` — Plain-text fallback
- `subject` — From `event.notification_message.subject`
- `from_override` — Per-plane from address (e.g. `noreply@neon.athyper.com`)

**Environment variables:**
```env
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
```

**Features:**
- TLS via STARTTLS (port 587) or SSL (port 465)
- `Reply-To` header support
- Template versioning: `control.notification_template.version` is pinned in the delivery record

---

### 3. SMS (`sms`)

**Adapter:** `server/packages/services/jobs/adapters/sms.adapter.ts`

**Provider:** Twilio Messaging API

**Payload constraints:**
- Maximum 1600 characters (10 SMS segments); adapter truncates with `[...]` suffix
- Phone numbers must be in E.164 format (`+44...`)
- `rendered_text` field used (no HTML)

**Environment variables:**
```env
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=+1...          # Static originator
TWILIO_MESSAGING_SERVICE_SID=     # Optional: use Messaging Service for alphanumeric sender
```

**Recipient resolution:** `event.principal_contact` or `master.principal` `phone_e164` field.

---

### 4. Push Notifications (`push`)

**Adapter:** `server/packages/services/jobs/adapters/push.adapter.ts`

Supports three sub-channels:

| Sub-channel | Protocol | Registration Table |
|---|---|---|
| Web (browser) | VAPID Web Push | `event.push_subscription` (platform=`web`) |
| Android | FCM v1 | `event.push_subscription` (platform=`android`) |
| iOS | FCM (APNs relay) | `event.push_subscription` (platform=`ios`) |

**Web Push (VAPID):**
```env
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:ops@athyper.com
```

**FCM (Android/iOS):**
```env
PUSH_FCM_PROJECT_ID=
PUSH_FCM_CLIENT_EMAIL=
PUSH_FCM_PRIVATE_KEY=<PEM private key from the service account>
```

**`event.push_subscription` key columns:**
| Column | Notes |
|---|---|
| `principal_id` | Owning principal |
| `platform` | `web` / `android` / `ios` |
| `device_id` | Unique per device installation |
| `endpoint` | Web Push subscription URL (web only) |
| `p256dh_key` | VAPID encryption key (web only) |
| `auth_key` | VAPID auth secret (web only) |
| `device_token` | FCM registration token (Android/iOS) |
| `is_active` | Auto-deactivated on FCM 410 (unregistered) |
| `last_used_at` | Updated on each successful delivery |
| `expires_at` | Web Push subscriptions can expire |

---

### 5. Webhook (`webhook`)

**Adapter:** `server/packages/services/jobs/adapters/webhook.adapter.ts`

**Worker:** `server/packages/services/jobs/workers/webhook-delivery.worker.ts`

**Queue:** `jobs-webhook-delivery`

Webhooks deliver outbound HTTP POST payloads to registered subscriber URLs, signed with HMAC-SHA256.

**`event.webhook_subscription` key columns:**
| Column | Notes |
|---|---|
| `target_url` | HTTPS URL to deliver to |
| `signing_secret` | Random 32-byte secret for HMAC-SHA256 |
| `topics` | `text[]` — event topics this subscription receives |
| `max_retries` | Default 5; exponential backoff |
| `timeout_ms` | Default 10000ms |
| `last_delivery_status` | Latest HTTP status code |
| `failure_count` | Consecutive failures; auto-disable at threshold |

**Delivery headers:**
```
X-Webhook-Signature-256: sha256=<hex>
X-Webhook-Delivery: <uuid>
X-Webhook-Topic: <topic>
Content-Type: application/json
```

**Signature verification (consumer side):**
```javascript
const sig = crypto.createHmac('sha256', signingSecret)
  .update(rawBody)
  .digest('hex')
const expected = `sha256=${sig}`
// compare with constant-time equal
```

**Retry policy:** Exponential backoff — 1 min, 5 min, 30 min, 2 hr, 8 hr. After `max_retries` failures, subscription `failure_count` is incremented and auto-disabled.

---

### 6. WhatsApp (`whatsapp`)

**Current status:** Schema, consent, and provider-model groundwork only. No
WhatsApp channel handler is registered, so the capabilities endpoint returns
`available: false` and clients do not offer this preference.

**Consent requirement:** A principal must have an `event.whatsapp_consent` row with `consent_status = 'consented'` before any WhatsApp message is delivered.

**`event.whatsapp_consent` key columns:**
| Column | Notes |
|---|---|
| `principal_id` | |
| `phone_e164` | Recipient phone in E.164 format |
| `consent_status` | `pending` / `consented` / `revoked` |
| `consented_at` | |
| `revoked_at` | |
| `consent_source` | How consent was obtained (e.g. `opt_in_form`, `api`) |
| `waba_id` | WhatsApp Business Account ID |
| `namespace` | Template namespace for approved message templates |

**Message templates:** WhatsApp requires pre-approved message templates (Meta Business Manager). Template keys are referenced via `control.notification_template.template_key`.

---

## Database Tables

### Core Event Tables

| Table | Schema | Purpose |
|---|---|---|
| `event.outbox` | Transactional outbox — source of truth for all domain events |  |
| `event.notification_message` | Dispatch envelope per event + routing rule |  |
| `event.notification_delivery` | Per-channel delivery record (monthly partitioned by `sent_at`) |  |
| `event.notification_delivery_claim` | Idempotency guard — prevents duplicate sends |  |
| `event.digest_staging` | Pending messages for hourly/daily/weekly digest batching |  |
| `event.push_subscription` | Web/mobile device push registrations |  |
| `event.whatsapp_consent` | WhatsApp opt-in consent registry |  |
| `event.webhook_subscription` | Outbound webhook target configuration |  |
| `event.endpoint` | Integration endpoint registry with health tracking |  |

### Control Tables

| Table | Schema | Purpose |
|---|---|---|
| `control.notification_provider` | External service credentials (SMTP, Twilio, Firebase) |  |
| `control.notification_template` | Template definitions (HTML/text body, variables schema) |  |
| `control.notification_routing_rule` | Event code → template + channels + conditions |  |
| `control.connector_type` | Global connector type catalog |  |

### Master / Preference Tables

| Table | Schema | Purpose |
|---|---|---|
| `master.principal_notification_preference` | Per-principal event opt-in/out per channel |  |
| `master.notification` | User notification inbox (read_at, archived_at) |  |

### Log Tables

| Table | Schema | Purpose |
|---|---|---|
| `log.notification_delivery_attempt` | Failed delivery audit trail |  |
| `log.notification_dlq` | Dead-letter entries after max retries exhausted |  |

---

## `event.notification_delivery` — Key Columns

This is the central delivery ledger. It is range-partitioned monthly by `sent_at`.

| Column | Notes |
|---|---|
| `id` | |
| `tenant_id` | |
| `message_id` | FK → `event.notification_message` |
| `recipient_id` | FK → `master.principal` |
| `recipient_addr` | Email address / phone / device token (resolved at send time) |
| `channel` | `in_app` / `email` / `sms` / `push` / `webhook` / `whatsapp` |
| `provider_id` | FK → `control.notification_provider` |
| `status` | `pending` → `queued` → `sent` → `delivered` / `bounced` / `failed` / `cancelled` |
| `attempt_count` | |
| `max_attempts` | From provider config |
| `last_error` | Error message from last failed attempt |
| `error_category` | `transient` / `permanent` / `rate_limit` / `invalid_recipient` |
| `sent_at` | Partition key |
| `delivered_at` | Confirmed delivery (provider callback or polling) |
| `read_at` | In-app only |
| `opened_at` | Email open pixel tracking |
| `clicked_at` | Link click tracking |
| `bounced_at` | Email hard bounce |
| `next_retry_at` | Scheduled retry time |
| `locked_until` | Optimistic lock for worker claim |
| `subscription_id` | FK → `event.webhook_subscription` (webhook channel only) |
| `channel_detail` | `jsonb` — channel-specific overflow: `{sms: {direction, from, to, message_ref}, webhook: {event_type, response_status, payload_hash}, email: {from_addr, reply_to}}` |

---

## Queue Architecture

| Queue | Job Names | Trigger | Concurrency |
|---|---|---|---|
| `jobs-notifications` | `sweep`, `send` | Scheduler every 5 min (`sched:notification-sweep`) | 5 |
| `jobs-webhook-delivery` | `sweep-webhooks`, `deliver-webhook` | Scheduler periodic (`sched:webhook-delivery-sweep`) | — |
| `jobs-domain-outbox` | `drain:fin`, `drain:wf`, `drain:audit`, `drain:search`, `drain:lifecycle` | Per-topic schedulers | 3 |
| `jobs-iam-kc-sync` | `kc-sync` | IAM sync scheduler | — |
| `jobs-lifecycle-timers` | `sweep`, `fire` | Timer sweep scheduler | — |

All queues run in BullMQ on the shared Redis instance (DB 0).

---

## Notification Routing Configuration

**`control.notification_routing_rule`** connects event codes to templates and channels:

```sql
-- Example: journal_entry submitted → email + in_app to finance-approvers
INSERT INTO control.notification_routing_rule
  (tenant_id, event_code, template_key, channels, conditions, recipient_type, recipient_value)
VALUES
  (NULL, 'journal_entry.submitted', 'je_submitted_approval', 
   ARRAY['email','in_app'], NULL, 'role', 'FINANCE_APPROVER');
```

| Column | Notes |
|---|---|
| `event_code` | e.g. `journal_entry.submitted`, `invoice.overdue` |
| `template_key` | FK → `control.notification_template.template_key` |
| `channels` | `text[]` — ordered list; first in list = preferred channel |
| `conditions` | JSONLogic — NULL = always route |
| `recipient_type` | `principal` / `role` / `group` / `requester` / `assignee` |
| `recipient_value` | UUID or role code |
| `priority` | Lower = evaluated first when multiple rules match same event_code |

---

## Inbound Webhook Receiver

For receiving webhooks from external services (e.g. payment gateways, ERPs):

**Route:** `POST /api/webhooks/:subscriptionId`

**Authentication:** HMAC-SHA256 only (no Bearer token). Header: `X-Webhook-Signature-256: sha256=<hex>`

**Security pipeline:**
1. Resolve `event.webhook_subscription` by `subscriptionId`
2. Constant-time HMAC-SHA256 verification
3. Replay protection: SHA-256(rawBody) checked against 5-minute LRU window → `409` on duplicate
4. Rate limit: 120 req/min per `subscriptionId` (sliding window)
5. Write to `event.outbox` (topic=`webhook:inbound`)
6. Return `202 Accepted`

**Error codes:**
| Code | Reason |
|---|---|
| 400 | Missing/malformed signature header |
| 401 | Signature mismatch |
| 404 | Subscription not found or inactive |
| 409 | Duplicate delivery (replay) |
| 429 | Rate limit exceeded |

---

## Integration Hub

The integration hub manages connections to external systems via the `event.endpoint` and `control.connector_type` tables.

**Routes registered via `registerIntegrationRoutes`:**

| Resource | Methods | Path |
|---|---|---|
| Endpoints | GET, POST, PATCH | `/api/integration/endpoints[/:id]` |
| Outbox | GET, POST retry/discard | `/api/integration/outbox[/:id]` |
| Providers | GET, POST, PATCH | `/api/integration/providers[/:id]` |
| Deliveries | GET | `/api/integration/deliveries[/:id]` |
| Webhooks | GET, POST, PATCH | `/api/integration/webhooks[/:id]` |
| Connector Types | GET | `/api/integration/connector-types` |
| Connections | GET, POST, PATCH, DELETE, POST /test | `/api/integration/connections[/:id]` |

**Endpoint health monitoring:**
- `event.endpoint.health` tracks `healthy` / `degraded` / `down`
- Background worker polls `health_check_url` on a configurable interval
- Health status is surfaced on the `/setup/integrations` admin page

---

## Digest Batching

Principals can configure `frequency_code` in `master.principal_notification_preference`:

| Frequency | Description |
|---|---|
| (none) | Immediate delivery |
| `hourly_digest` | Batched and sent at top of each hour |
| `daily_digest` | Batched and sent at 08:00 tenant local time |
| `weekly_digest` | Batched and sent Monday 08:00 |

Digest staging and aggregation code exist, but the scheduler that activates the
flow is currently disabled. The capabilities endpoint therefore marks
non-immediate digest frequencies unavailable.

---

## Admin UI

Located at `/setup/integrations` (neon app), accessible to principals with `INTEGRATIONS.VIEW` permission.

| Tab | Content |
|---|---|
| Connections | Active connector instances with health status |
| Connectors | Global connector type catalog |
| Providers | Notification provider credentials (SMTP, Twilio, Firebase) |
| Outbox | Transactional outbox event browser (date-bounded, retry/discard) |
| Deliveries | Delivery ledger browser with channel filter |
| Webhooks | Outbound webhook subscriptions + delivery history |

---

## Developer Notes

- **Template variables** are defined in `control.notification_template.variables` (JSON Schema). The template renderer validates the payload against this schema before rendering.
- **Credential encryption:** All `control.notification_provider` credentials are AES-256-GCM encrypted using `CREDENTIAL_MASTER_KEY`. Never store plain credentials in the DB.
- **Replay protection window:** 5 minutes (LRU in-memory). For longer idempotency, use the `event.notification_delivery_claim` table which stores `idempotency_key` with a TTL.
- **Partition maintenance:** `event.notification_delivery` is range-partitioned monthly. A scheduled job creates next month's partition and drops partitions older than the retention window.
- **SSE connection limits:** Traefik is configured with a 120-second idle timeout. The 25-second heartbeat keeps connections alive. A single Redis pub/sub channel is used per tenant for fan-out.
