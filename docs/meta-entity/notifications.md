# Notifications & MFA Configuration

This document covers the control-schema tables that govern notification routing, templates, outbox dispatch, and MFA enrollment state.

---

## Table Map

| Table | Purpose |
|---|---|
| `control.notification_provider` | Channel adapter registry |
| `control.notification_routing_rule` | Event → template → channel → recipient routing |
| `control.outbox_routing_rule` | Business-event → outbox-topic dispatch map |
| `control.notification_template` | Versioned per-channel/locale message templates |
| `control.mfa_config` | Local mirror of Keycloak MFA enrollment state |

---

## `control.notification_provider`

Platform-level adapter registry. One row per provider implementation per channel (e.g. SendGrid for email, Twilio for SMS, FCM for push). `ARCHETYPE=C;SCOPE=N`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `channel` | `text NOT NULL` | Validated via `notification.channel` lookup |
| `code` | `text NOT NULL` | Unique within channel |
| `name` | `text NOT NULL` | |
| `adapter_key` | `text NOT NULL` | Stable implementation identifier (e.g. `sendgrid_v3`, `twilio_sms`) |
| `priority` | `smallint NOT NULL DEFAULT 1` | `>= 1`; lower = higher priority |
| `is_enabled` | `bool NOT NULL DEFAULT true` | |
| `config` | `jsonb NOT NULL DEFAULT '{}'` | API keys, endpoints — stored encrypted at rest |
| `rate_limit` | `jsonb` | `{per_minute: N, per_hour: N, burst: N}` |
| `health` | `text NOT NULL DEFAULT 'healthy'` | `healthy` / `degraded` / `down` — updated by health-check worker |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

**Unique:** `(channel, code)`

---

## `control.notification_routing_rule`

Event-driven routing rules that map a trigger event to a template and dispatch target. `ARCHETYPE=C;SCOPE=G` — `tenant_id = NULL` = platform global rule; tenant rows override.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid` | NULL = platform global |
| `code` | `text NOT NULL` | Unique per tenant |
| `name` | `text NOT NULL` | |
| `description` | `text` | |
| `event_type` | `text NOT NULL` | Trigger event (e.g. `journal_entry.approved`) |
| `entity_type` | `text` | NULL = any entity |
| `lifecycle_state` | `text` | NULL = any state |
| `workflow_phase` | `text` | NULL = any; `in_workflow` = while WF open; `post_workflow` = after terminal WF state |
| `condition_expr` | `jsonb` | JSONLogic condition; NULL = always matches |
| `template_key` | `text NOT NULL` | References `control.notification_template.template_key` |
| `channels` | `text[] NOT NULL` | `array_length >= 1`; lookup codes from `notification.channel` |
| `priority` | `text NOT NULL DEFAULT 'normal'` | Validated via `notification.priority` lookup |
| `recipient_rules` | `jsonb NOT NULL DEFAULT '{}'` | `{actor: bool, ou_members: bool, role: str, explicit_ids: [uuid, ...]}` |
| `sla_minutes` | `smallint` | Optional SLA deadline for this notification |
| `dedup_window_ms` | `int NOT NULL DEFAULT 300000` | Suppress duplicate `(event_type, entity_id, recipient)` within window (default 5 min) |
| `is_enabled` | `bool NOT NULL DEFAULT true` | |
| `sort_order` | `smallint NOT NULL DEFAULT 0` | |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

**Unique:** `(tenant_id, code) NULLS NOT DISTINCT`

### Workflow Phase Discriminator

| Value | When Applied |
|---|---|
| `NULL` | Any phase — rule fires regardless of workflow state |
| `in_workflow` | While a workflow_request is open (e.g. approval-request, SLA-nearing) |
| `post_workflow` | After terminal WF state (e.g. completion, rejection notifications) |

---

## `control.outbox_routing_rule`

Business-event → outbox-topic dispatch map. Makes outbox routing inspectable and tenant-overridable. `ARCHETYPE=C;SCOPE=G`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid` | NULL = platform-global |
| `event_type` | `text NOT NULL` | e.g. `payment.approved` |
| `topic` | `text NOT NULL` | Outbox topic: `iam` / `wf` / `audit` / `fin` / `custom` |
| `handler_id` | `uuid` | FK → `hook_action_registry(id)` — pins to a specific emit_event handler |
| `condition_expr` | `jsonb` | JSONLogic; NULL = always routes |
| `is_enabled` | `bool NOT NULL DEFAULT true` | |
| `sort_order` | `smallint NOT NULL DEFAULT 0` | |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

**Fan-out:** Multiple rows with the same `event_type` route to multiple topics. Evaluated `sort_order ASC` — first enabled match per `(event_type, topic)` wins.

---

## `control.notification_template`

Versioned message templates per `(template_key, channel, locale)`. `ARCHETYPE=B_LITE;SCOPE=G` — `tenant_id = NULL` = platform default; tenant rows override.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid` | NULL = platform default |
| `template_key` | `text NOT NULL` | Stable identifier shared across channel/locale variants (e.g. `approval_requested`, `invoice_due`) |
| `channel` | `text NOT NULL` | Validated via `notification.channel` lookup |
| `locale` | `text NOT NULL DEFAULT 'en'` | BCP-47 locale code |
| `version` | `smallint NOT NULL DEFAULT 1` | `>= 1`; increment for each revision |
| `status` | `text NOT NULL DEFAULT 'draft'` | `draft` / `active` / `retired` |
| `subject` | `text` | Email/SMS subject line |
| `body_text` | `text` | Plain-text body |
| `body_html` | `text` | HTML body |
| `body_json` | `jsonb` | Structured body for push/in-app notifications (action buttons, images) |
| `variables_schema` | `jsonb` | JSON Schema for template variable validation at dispatch time |
| `metadata` | `jsonb NOT NULL DEFAULT '{}'` | |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

**Unique:** `(tenant_id, template_key, channel, locale, version) NULLS NOT DISTINCT`

**CHECK:** `num_nonnulls(body_text, body_html, body_json) >= 1` — at least one body variant must be present.

---

## `control.mfa_config`

Local mirror of Keycloak MFA enrollment state. One row per `(tenant, principal, method_type)`. `ARCHETYPE=C;SCOPE=T`.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `tenant_id` | `uuid NOT NULL` | |
| `principal_id` | `uuid NOT NULL` | |
| `method_type` | `text NOT NULL` | Validated via lookup (e.g. `email`, `sms`, `totp`, `webauthn`, `backup`) |
| `is_enabled` | `bool NOT NULL DEFAULT false` | |
| `is_verified` | `bool NOT NULL DEFAULT false` | |
| `is_primary` | `bool NOT NULL DEFAULT false` | `is_primary` requires `is_enabled AND is_verified` |
| `enrolled_at` | `timestamptz` | Set when `is_enabled = true` |
| `verified_at` | `timestamptz` | Set when `is_verified = true` |
| `last_used_at` | `timestamptz` | |
| `contact_link_id` | `uuid` | Required for `email` / `sms`; NULL for `totp` / `webauthn` / `backup` |
| `credential_hash` | `text` | Base32 TOTP secret; bcrypt hash of backup codes; NULL for webauthn |
| `user_label` | `text` | Display label set by user in KC account console (e.g. `My YubiKey`) |
| `keycloak_credential_id` | `text UNIQUE NULLS NOT DISTINCT` | KC credential UUID |
| `keycloak_synced_at` | `timestamptz` | |
| `keycloak_sync_status` | `text NOT NULL DEFAULT 'pending'` | `pending` / `synced` / `drift` / `error` |
| `metadata` | `jsonb NOT NULL DEFAULT '{}'` | |
| `created_at` | `timestamptz NOT NULL` | |
| `created_by` | `uuid NOT NULL` | |
| `updated_at` / `updated_by` | `timestamptz` / `uuid` | |

**Unique:** `(tenant_id, principal_id, method_type)`

### Contact Link Requirements

| method_type | contact_link_id |
|---|---|
| `email` | REQUIRED |
| `sms` | REQUIRED |
| `totp` | MUST BE NULL |
| `webauthn` | MUST BE NULL |
| `backup` | MUST BE NULL |

---

## Notification Dispatch Flow

```
Event emitted (e.g. journal_entry.approved)
        │
        ▼
outbox_routing_rule → topic match → outbox worker
        │
        ▼
notification_routing_rule → template_key + channels + recipient_rules
        │
        ▼
notification_template (channel + locale version resolution)
        │
        ▼
notification_provider (health check → failover if degraded/down)
        │
        ▼
Sent + dedup_window_ms prevents duplicate delivery
```

---

## Related Docs

- [Overview](./overview.md)
- [Lookup System](./lookup.md)
- [Platform Governance](./platform-governance.md)
