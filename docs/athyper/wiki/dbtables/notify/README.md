# Notify Schema (`notify`)

The `notify` schema implements the full notification delivery pipeline: in-app notifications, multi-channel fan-out, preference management, digest rollups, delivery tracking with engagement analytics, suppression/compliance enforcement, WhatsApp consent, and Web Push subscription storage. Two tables (`notification` and `delivery`) are range-partitioned by month on `created_at` for scalable time-series storage.

**Source**: `framework/adapters/db/src/sql/110_notify.sql`

---

## Table of Contents

1. [notify.notification](#notifynotification)
2. [notify.preference](#notifypreference)
3. [notify.dlq](#notifydlq)
4. [notify.digest_staging](#notifydigest_staging)
5. [notify.whatsapp_consent](#notifywhatsapp_consent)
6. [notify.message](#notifymessage)
7. [notify.delivery](#notifydelivery)
8. [notify.suppression](#notifysuppression)
9. [notify.push_subscription](#notifypush_subscription)

---

## notify.notification

### Functional Description

Stores user-facing notifications across all supported channels (in-app, email, SMS, push, webhook, WhatsApp). Each row represents a single notification targeted at a specific recipient with full read/dismiss lifecycle tracking and optional expiry. The table is **range-partitioned by month** on `created_at` to manage high-volume notification data with efficient time-based pruning.

### Technical Details

| Column                  | Type        | Nullable | Default             | Description                                                               |
| ----------------------- | ----------- | -------- | ------------------- | ------------------------------------------------------------------------- |
| id                      | uuid        | NOT NULL | `gen_random_uuid()` | Unique notification identifier                                            |
| tenant_id               | uuid        | NOT NULL |                     | Tenant that owns this notification                                        |
| recipient_id            | uuid        | NOT NULL |                     | Principal ID of the notification recipient                                |
| sender_id               | uuid        | YES      |                     | Principal ID of the sender (null for system-generated)                    |
| channel                 | text        | NOT NULL | `'in_app'`          | Delivery channel: `in_app`, `email`, `sms`, `push`, `webhook`, `whatsapp` |
| category                | text        | YES      |                     | Notification category for grouping/filtering                              |
| priority                | text        | NOT NULL | `'normal'`          | Priority level: `low`, `normal`, `high`, `urgent`                         |
| title                   | text        | NOT NULL |                     | Notification title/headline                                               |
| body                    | text        | YES      |                     | Notification body content                                                 |
| icon                    | text        | YES      |                     | Icon identifier or URL                                                    |
| action_url              | text        | YES      |                     | URL to navigate to when the notification is clicked                       |
| entity_type             | text        | YES      |                     | Type of the related business entity                                       |
| entity_id               | uuid        | YES      |                     | ID of the related business entity                                         |
| is_read                 | boolean     | NOT NULL | `false`             | Whether the recipient has read the notification                           |
| read_at                 | timestamptz | YES      |                     | Timestamp when notification was read                                      |
| is_dismissed            | boolean     | NOT NULL | `false`             | Whether the recipient has dismissed the notification                      |
| dismissed_at            | timestamptz | YES      |                     | Timestamp when notification was dismissed                                 |
| expires_at              | timestamptz | YES      |                     | Expiry timestamp; expired notifications should not be shown               |
| metadata                | jsonb       | YES      |                     | Extensible metadata payload                                               |
| created_at              | timestamptz | NOT NULL | `now()`             | Creation timestamp (partition key)                                        |
| created_by_principal_id | uuid        | YES      |                     | Principal who created the notification (mutually exclusive with service)  |
| created_by_service      | text        | YES      |                     | Service that created the notification (mutually exclusive with principal) |

### Primary Key

`(id, created_at)` -- composite key includes partition column as required by PostgreSQL partitioned tables.

### Foreign Keys

| Constraint                  | Column    | References      | On Delete |
| --------------------------- | --------- | --------------- | --------- |
| notification_tenant_id_fkey | tenant_id | core.tenant(id) | CASCADE   |

### Constraints

| Constraint                           | Type  | Description                                                                                                       |
| ------------------------------------ | ----- | ----------------------------------------------------------------------------------------------------------------- |
| notification_channel_chk             | CHECK | channel IN (`in_app`, `email`, `sms`, `push`, `webhook`, `whatsapp`)                                              |
| notification_priority_chk            | CHECK | priority IN (`low`, `normal`, `high`, `urgent`)                                                                   |
| notification_read_consistency_chk    | CHECK | `is_read = false` requires `read_at IS NULL`; `is_read = true` requires `read_at IS NOT NULL`                     |
| notification_dismiss_consistency_chk | CHECK | `is_dismissed = false` requires `dismissed_at IS NULL`; `is_dismissed = true` requires `dismissed_at IS NOT NULL` |
| notification_expiry_sanity_chk       | CHECK | `expires_at` must be after `created_at` (or null)                                                                 |
| notification_created_by_chk          | CHECK | Exactly one of `created_by_principal_id` or `created_by_service` must be set                                      |

### Indexes

| Index                             | Columns                                    | Condition                      | Description                                   |
| --------------------------------- | ------------------------------------------ | ------------------------------ | --------------------------------------------- |
| idx_notification_recipient_unread | (recipient_id, is_read, created_at DESC)   | `WHERE is_read = false`        | Fast unread notification feed                 |
| idx_notification_recipient_active | (tenant_id, recipient_id, created_at DESC) | `WHERE is_dismissed = false`   | Active (non-dismissed) notifications per user |
| idx_notification_recipient_time   | (tenant_id, recipient_id, created_at DESC) |                                | Full notification timeline per user           |
| idx_notification_entity           | (tenant_id, entity_type, entity_id)        |                                | Lookup notifications by related entity        |
| idx_notification_expires          | (expires_at)                               | `WHERE expires_at IS NOT NULL` | Batch expiry cleanup                          |

### Partitioning

Range-partitioned by `created_at` on monthly boundaries. Initial provisioning creates the current month plus 3 months forward. Partition naming convention: `notification_YYYY_MM`.

### Relationships

- Belongs to `core.tenant`
- References `recipient_id` (logically a `core.principal`)
- Optionally references a business entity via `entity_type` + `entity_id`

---

## notify.preference

### Functional Description

Stores scoped notification preference overrides that control whether a specific event+channel combination is enabled and at what frequency. Preferences can be scoped to individual users, organizational units, or tenants, enabling a layered override model where user preferences take precedence over org-unit and tenant defaults.

### Technical Details

| Column                  | Type           | Nullable | Default             | Description                                                                       |
| ----------------------- | -------------- | -------- | ------------------- | --------------------------------------------------------------------------------- |
| id                      | uuid           | NOT NULL | `gen_random_uuid()` | Unique preference identifier                                                      |
| tenant_id               | uuid           | NOT NULL |                     | Owning tenant                                                                     |
| scope                   | text           | NOT NULL |                     | Preference scope: `user`, `org_unit`, `tenant`                                    |
| user_principal_id       | uuid           | YES      |                     | Principal ID (set when scope = `user`)                                            |
| org_unit_id             | uuid           | YES      |                     | Org unit ID (set when scope = `org_unit`)                                         |
| event_code              | text           | NOT NULL |                     | Event type code this preference applies to                                        |
| channel                 | text           | NOT NULL |                     | Delivery channel this preference applies to                                       |
| is_enabled              | boolean        | NOT NULL | `true`              | Whether delivery is enabled for this event+channel                                |
| frequency               | text           | NOT NULL | `'immediate'`       | Delivery frequency: `immediate`, `hourly_digest`, `daily_digest`, `weekly_digest` |
| quiet_hours             | jsonb          | YES      |                     | Quiet hours configuration (time windows to suppress delivery)                     |
| metadata                | jsonb          | YES      |                     | Extensible metadata                                                               |
| created_at              | timestamptz(6) | NOT NULL | `now()`             | Creation timestamp                                                                |
| created_by_principal_id | uuid           | YES      |                     | Principal who created the preference                                              |
| created_by_service      | text           | YES      |                     | Service that created the preference                                               |
| updated_at              | timestamptz(6) | YES      |                     | Last update timestamp                                                             |
| updated_by              | text           | YES      |                     | Who last updated                                                                  |

### Primary Key

`(id)`

### Foreign Keys

| Constraint                     | Column            | References         | On Delete |
| ------------------------------ | ----------------- | ------------------ | --------- |
| preference_tenant_fkey         | tenant_id         | core.tenant(id)    | CASCADE   |
| preference_user_principal_fkey | user_principal_id | core.principal(id) | CASCADE   |

### Constraints

| Constraint                    | Type  | Description                                                                             |
| ----------------------------- | ----- | --------------------------------------------------------------------------------------- |
| preference_scope_chk          | CHECK | scope IN (`user`, `org_unit`, `tenant`)                                                 |
| preference_channel_chk        | CHECK | channel IN (`in_app`, `email`, `sms`, `push`, `webhook`, `whatsapp`)                    |
| preference_frequency_chk      | CHECK | frequency IN (`immediate`, `hourly_digest`, `daily_digest`, `weekly_digest`)            |
| preference_scope_user_chk     | CHECK | When scope = `user`, `user_principal_id` must be set and `org_unit_id` must be null     |
| preference_scope_org_unit_chk | CHECK | When scope = `org_unit`, `org_unit_id` must be set and `user_principal_id` must be null |
| preference_scope_tenant_chk   | CHECK | When scope = `tenant`, both `user_principal_id` and `org_unit_id` must be null          |
| preference_created_by_chk     | CHECK | Exactly one of `created_by_principal_id` or `created_by_service` must be set            |

### Indexes

| Index                          | Columns                                             | Condition                  | Description                                         |
| ------------------------------ | --------------------------------------------------- | -------------------------- | --------------------------------------------------- |
| preference_user_scope_uniq     | (tenant_id, user_principal_id, event_code, channel) | `WHERE scope = 'user'`     | Unique user-scoped preference per event+channel     |
| preference_org_unit_scope_uniq | (tenant_id, org_unit_id, event_code, channel)       | `WHERE scope = 'org_unit'` | Unique org-unit-scoped preference per event+channel |
| preference_tenant_scope_uniq   | (tenant_id, event_code, channel)                    | `WHERE scope = 'tenant'`   | Unique tenant-scoped preference per event+channel   |
| idx_preference_lookup          | (tenant_id, event_code, channel)                    |                            | Fast preference resolution lookup                   |

### Relationships

- Belongs to `core.tenant`
- Optionally references `core.principal` (user scope)

---

## notify.dlq

### Functional Description

Dead-letter queue for notification deliveries that have permanently failed or exhausted their retry budget. Records the original delivery payload, error details, and classification so operations teams can investigate, fix, and replay failed deliveries. Supports replay tracking with counters.

### Technical Details

| Column         | Type           | Nullable | Default             | Description                                                          |
| -------------- | -------------- | -------- | ------------------- | -------------------------------------------------------------------- |
| id             | uuid           | NOT NULL | `gen_random_uuid()` | Unique DLQ entry identifier                                          |
| tenant_id      | uuid           | NOT NULL |                     | Owning tenant                                                        |
| delivery_id    | uuid           | NOT NULL |                     | Original delivery attempt ID                                         |
| message_id     | uuid           | NOT NULL |                     | Parent message ID                                                    |
| channel        | text           | NOT NULL |                     | Channel that failed                                                  |
| provider_code  | text           | NOT NULL |                     | Delivery provider code                                               |
| recipient_id   | uuid           | YES      |                     | Recipient principal ID                                               |
| recipient_addr | text           | NOT NULL |                     | Recipient address (email, phone, endpoint URL)                       |
| last_error     | text           | YES      |                     | Last error message                                                   |
| error_category | text           | YES      |                     | Error classification: `transient`, `permanent`, `rate_limit`, `auth` |
| attempt_count  | integer        | NOT NULL | `0`                 | Number of delivery attempts made                                     |
| payload        | jsonb          | NOT NULL |                     | Original delivery payload for replay                                 |
| metadata       | jsonb          | YES      |                     | Extensible metadata                                                  |
| dead_at        | timestamptz(6) | NOT NULL | `now()`             | Timestamp when moved to DLQ                                          |
| replayed_at    | timestamptz(6) | YES      |                     | Timestamp of last replay attempt                                     |
| replayed_by    | text           | YES      |                     | Who triggered the replay                                             |
| replay_count   | integer        | NOT NULL | `0`                 | Number of times this entry has been replayed                         |
| created_at     | timestamptz(6) | NOT NULL | `now()`             | Creation timestamp                                                   |

### Primary Key

`(id)`

### Foreign Keys

| Constraint      | Column    | References      | On Delete |
| --------------- | --------- | --------------- | --------- |
| dlq_tenant_fkey | tenant_id | core.tenant(id) | CASCADE   |

### Constraints

| Constraint             | Type  | Description                                                                |
| ---------------------- | ----- | -------------------------------------------------------------------------- |
| dlq_channel_chk        | CHECK | channel IN (`in_app`, `email`, `sms`, `push`, `webhook`, `whatsapp`)       |
| dlq_error_category_chk | CHECK | error_category IN (`transient`, `permanent`, `rate_limit`, `auth`) or NULL |

### Indexes

| Index              | Columns                   | Condition                   | Description                                |
| ------------------ | ------------------------- | --------------------------- | ------------------------------------------ |
| idx_dlq_tenant     | (tenant_id, dead_at DESC) |                             | Browse DLQ entries by tenant, newest first |
| idx_dlq_unreplayed | (tenant_id)               | `WHERE replayed_at IS NULL` | Find entries that have never been replayed |

### Relationships

- Belongs to `core.tenant`
- Logically references `notify.delivery` and `notify.message` (no FK enforced on DLQ to avoid cross-partition reference issues)

---

## notify.digest_staging

### Functional Description

Staging area that accumulates individual notification payloads for digest-mode delivery. When a user's preference is set to hourly, daily, or weekly digest, individual messages are staged here instead of being delivered immediately. A scheduled digest job collects staged entries, groups them, renders a combined digest message, and marks them as delivered.

### Technical Details

| Column       | Type           | Nullable | Default             | Description                                                        |
| ------------ | -------------- | -------- | ------------------- | ------------------------------------------------------------------ |
| id           | uuid           | NOT NULL | `gen_random_uuid()` | Unique staging entry identifier                                    |
| tenant_id    | uuid           | NOT NULL |                     | Owning tenant                                                      |
| recipient_id | uuid           | NOT NULL |                     | Recipient principal ID                                             |
| channel      | text           | NOT NULL |                     | Target delivery channel                                            |
| frequency    | text           | NOT NULL |                     | Digest frequency: `hourly_digest`, `daily_digest`, `weekly_digest` |
| message_id   | uuid           | NOT NULL |                     | Source message ID                                                  |
| event_code   | text           | NOT NULL |                     | Event code for grouping                                            |
| subject      | text           | YES      |                     | Subject line for digest email                                      |
| payload      | jsonb          | NOT NULL |                     | Notification payload to include in digest                          |
| template_key | text           | NOT NULL |                     | Template to use for rendering                                      |
| priority     | text           | NOT NULL | `'normal'`          | Priority level: `low`, `normal`, `high`, `urgent`                  |
| metadata     | jsonb          | YES      |                     | Extensible metadata                                                |
| staged_at    | timestamptz(6) | NOT NULL | `now()`             | When this entry was staged                                         |
| delivered_at | timestamptz(6) | YES      |                     | When the digest containing this entry was delivered                |

### Primary Key

`(id)`

### Foreign Keys

| Constraint                 | Column    | References      | On Delete |
| -------------------------- | --------- | --------------- | --------- |
| digest_staging_tenant_fkey | tenant_id | core.tenant(id) | CASCADE   |

### Constraints

| Constraint                   | Type  | Description                                                          |
| ---------------------------- | ----- | -------------------------------------------------------------------- |
| digest_staging_channel_chk   | CHECK | channel IN (`in_app`, `email`, `sms`, `push`, `webhook`, `whatsapp`) |
| digest_staging_frequency_chk | CHECK | frequency IN (`hourly_digest`, `daily_digest`, `weekly_digest`)      |
| digest_staging_priority_chk  | CHECK | priority IN (`low`, `normal`, `high`, `urgent`)                      |

### Indexes

| Index                            | Columns                                       | Condition                    | Description                                         |
| -------------------------------- | --------------------------------------------- | ---------------------------- | --------------------------------------------------- |
| idx_digest_staging_pending       | (tenant_id, recipient_id, channel, frequency) | `WHERE delivered_at IS NULL` | Find pending digest entries per recipient           |
| idx_digest_staging_frequency     | (frequency, staged_at)                        | `WHERE delivered_at IS NULL` | Batch pickup by frequency for scheduled digest jobs |
| idx_digest_staging_pending_order | (tenant_id, recipient_id, staged_at)          | `WHERE delivered_at IS NULL` | Order pending entries chronologically per recipient |

### Relationships

- Belongs to `core.tenant`
- Logically references `notify.message`

---

## notify.whatsapp_consent

### Functional Description

Tracks WhatsApp opt-in and opt-out consent per phone number per tenant, as required by WhatsApp Business API compliance. Stores the E.164-formatted phone number, opt-in method, and the 24-hour conversation window timestamps that govern when business-initiated messages are allowed. This table is the authoritative source for WhatsApp deliverability checks.

### Technical Details

| Column                    | Type           | Nullable | Default             | Description                                                           |
| ------------------------- | -------------- | -------- | ------------------- | --------------------------------------------------------------------- |
| id                        | uuid           | NOT NULL | `gen_random_uuid()` | Unique consent record identifier                                      |
| tenant_id                 | uuid           | NOT NULL |                     | Owning tenant                                                         |
| phone_number              | text           | NOT NULL |                     | E.164-formatted phone number (e.g., `+60123456789`)                   |
| principal_id              | uuid           | YES      |                     | Associated principal (may be null for external recipients)            |
| opted_in                  | boolean        | NOT NULL | `false`             | Current opt-in status                                                 |
| opted_in_at               | timestamptz(6) | YES      |                     | When the user opted in                                                |
| opted_out_at              | timestamptz(6) | YES      |                     | When the user opted out                                               |
| opt_in_method             | text           | YES      |                     | How consent was obtained (e.g., `web_form`, `sms_keyword`, `qr_code`) |
| conversation_window_start | timestamptz(6) | YES      |                     | Start of the current 24h conversation window                          |
| conversation_window_end   | timestamptz(6) | YES      |                     | End of the current 24h conversation window                            |
| metadata                  | jsonb          | YES      |                     | Extensible metadata                                                   |
| created_at                | timestamptz(6) | NOT NULL | `now()`             | Record creation timestamp                                             |
| updated_at                | timestamptz(6) | YES      |                     | Last update timestamp                                                 |

### Primary Key

`(id)`

### Foreign Keys

| Constraint                   | Column    | References      | On Delete |
| ---------------------------- | --------- | --------------- | --------- |
| whatsapp_consent_tenant_fkey | tenant_id | core.tenant(id) | CASCADE   |

### Constraints

| Constraint                      | Type  | Description                                           |
| ------------------------------- | ----- | ----------------------------------------------------- |
| whatsapp_consent_phone_e164_chk | CHECK | Phone number matches E.164 regex: `^\+[1-9]\d{1,14}$` |

### Indexes

| Index                              | Columns                   | Condition                        | Description                    |
| ---------------------------------- | ------------------------- | -------------------------------- | ------------------------------ |
| whatsapp_consent_tenant_phone_uniq | (tenant_id, phone_number) |                                  | Unique phone number per tenant |
| idx_whatsapp_consent_principal     | (principal_id)            | `WHERE principal_id IS NOT NULL` | Lookup consent by user         |

### Relationships

- Belongs to `core.tenant`
- Optionally references a principal

---

## notify.message

### Functional Description

Represents a logical notification message -- the fan-out root for a single event processed by a single notification rule. One event may produce multiple messages (one per matching rule), and each message fans out into multiple deliveries (one per recipient per channel). Tracks aggregate delivery progress with counters for total recipients, successful deliveries, and failures.

### Technical Details

| Column           | Type           | Nullable | Default             | Description                                                                             |
| ---------------- | -------------- | -------- | ------------------- | --------------------------------------------------------------------------------------- |
| id               | uuid           | NOT NULL | `gen_random_uuid()` | Unique message identifier                                                               |
| tenant_id        | uuid           | NOT NULL |                     | Owning tenant                                                                           |
| event_id         | text           | NOT NULL |                     | Source event identifier                                                                 |
| event_code       | text           | NOT NULL |                     | Event type code                                                                         |
| rule_id          | uuid           | YES      |                     | Notification rule that triggered this message                                           |
| template_key     | text           | NOT NULL |                     | Template used for rendering                                                             |
| template_version | integer        | NOT NULL |                     | Template version at time of rendering                                                   |
| subject          | text           | YES      |                     | Rendered subject line                                                                   |
| payload          | jsonb          | NOT NULL |                     | Rendered notification payload                                                           |
| priority         | text           | NOT NULL | `'normal'`          | Priority: `low`, `normal`, `high`, `urgent`                                             |
| status           | text           | NOT NULL | `'pending'`         | Lifecycle status: `pending`, `planning`, `delivering`, `completed`, `partial`, `failed` |
| recipient_count  | integer        | NOT NULL | `0`                 | Total number of target recipients                                                       |
| delivered_count  | integer        | NOT NULL | `0`                 | Number of successful deliveries                                                         |
| failed_count     | integer        | NOT NULL | `0`                 | Number of failed deliveries                                                             |
| entity_type      | text           | YES      |                     | Related business entity type                                                            |
| entity_id        | uuid           | YES      |                     | Related business entity ID                                                              |
| correlation_id   | text           | YES      |                     | Correlation ID for tracing                                                              |
| metadata         | jsonb          | YES      |                     | Extensible metadata                                                                     |
| created_at       | timestamptz(6) | NOT NULL | `now()`             | Creation timestamp                                                                      |
| completed_at     | timestamptz(6) | YES      |                     | When all deliveries finished                                                            |
| expires_at       | timestamptz(6) | YES      |                     | Message expiry (deliveries should not proceed after this)                               |

### Primary Key

`(id)`

### Foreign Keys

| Constraint             | Column    | References                 | On Delete |
| ---------------------- | --------- | -------------------------- | --------- |
| message_tenant_id_fkey | tenant_id | core.tenant(id)            | CASCADE   |
| message_rule_id_fkey   | rule_id   | meta.notification_rule(id) | NO ACTION |

### Constraints

| Constraint                | Type  | Description                                                                       |
| ------------------------- | ----- | --------------------------------------------------------------------------------- |
| message_status_chk        | CHECK | status IN (`pending`, `planning`, `delivering`, `completed`, `partial`, `failed`) |
| message_priority_chk      | CHECK | priority IN (`low`, `normal`, `high`, `urgent`)                                   |
| message_channel_chk       | CHECK | Placeholder (always true); message is channel-agnostic                            |
| message_expiry_sanity_chk | CHECK | `expires_at` must be after `created_at` (or null)                                 |

### Indexes

| Index              | Columns                      | Condition                           | Description                              |
| ------------------ | ---------------------------- | ----------------------------------- | ---------------------------------------- |
| idx_message_tenant | (tenant_id, created_at DESC) |                                     | Browse messages by tenant                |
| idx_message_event  | (event_id)                   |                                     | Find messages for a specific event       |
| idx_message_status | (status)                     | `WHERE status NOT IN ('completed')` | Find in-progress messages for processing |

### Relationships

- Belongs to `core.tenant`
- Optionally belongs to `meta.notification_rule`
- Parent of `notify.delivery` (one-to-many)

---

## notify.delivery

### Functional Description

Tracks individual per-channel, per-recipient delivery attempts with full engagement lifecycle: sent, delivered, opened, clicked, bounced. Each delivery is linked to a parent message and includes provider-specific details, retry counters, and external tracking IDs for webhook reconciliation. The table is **range-partitioned by month** on `created_at` for scalable high-volume delivery tracking.

### Technical Details

| Column         | Type           | Nullable | Default             | Description                                                                                 |
| -------------- | -------------- | -------- | ------------------- | ------------------------------------------------------------------------------------------- |
| id             | uuid           | NOT NULL | `gen_random_uuid()` | Unique delivery identifier                                                                  |
| message_id     | uuid           | NOT NULL |                     | Parent message ID                                                                           |
| tenant_id      | uuid           | NOT NULL |                     | Owning tenant                                                                               |
| channel        | text           | NOT NULL |                     | Delivery channel: `in_app`, `email`, `sms`, `push`, `webhook`, `whatsapp`                   |
| provider_code  | text           | NOT NULL |                     | Delivery provider identifier (e.g., `sendgrid`, `twilio`)                                   |
| recipient_id   | uuid           | YES      |                     | Recipient principal ID                                                                      |
| recipient_addr | text           | NOT NULL |                     | Recipient address (email, phone number, endpoint URL)                                       |
| status         | text           | NOT NULL | `'pending'`         | Delivery status: `pending`, `queued`, `sent`, `delivered`, `bounced`, `failed`, `cancelled` |
| attempt_count  | integer        | NOT NULL | `0`                 | Number of delivery attempts made                                                            |
| max_attempts   | integer        | NOT NULL | `3`                 | Maximum allowed delivery attempts                                                           |
| last_error     | text           | YES      |                     | Most recent error message                                                                   |
| error_category | text           | YES      |                     | Error classification: `transient`, `permanent`, `rate_limit`, `auth`                        |
| external_id    | text           | YES      |                     | Provider-assigned external tracking ID                                                      |
| sent_at        | timestamptz(6) | YES      |                     | When the message was sent to the provider                                                   |
| delivered_at   | timestamptz(6) | YES      |                     | When delivery was confirmed                                                                 |
| opened_at      | timestamptz(6) | YES      |                     | When the recipient opened the message (email tracking)                                      |
| clicked_at     | timestamptz(6) | YES      |                     | When the recipient clicked a link                                                           |
| bounced_at     | timestamptz(6) | YES      |                     | When the message bounced                                                                    |
| metadata       | jsonb          | YES      |                     | Extensible metadata                                                                         |
| created_at     | timestamptz(6) | NOT NULL | `now()`             | Creation timestamp (partition key)                                                          |
| updated_at     | timestamptz(6) | YES      |                     | Last update timestamp                                                                       |

### Primary Key

`(id, created_at)` -- composite key includes partition column.

### Foreign Keys

| Constraint               | Column     | References         | On Delete |
| ------------------------ | ---------- | ------------------ | --------- |
| delivery_message_id_fkey | message_id | notify.message(id) | CASCADE   |
| delivery_tenant_id_fkey  | tenant_id  | core.tenant(id)    | CASCADE   |

### Constraints

| Constraint                   | Type  | Description                                                                            |
| ---------------------------- | ----- | -------------------------------------------------------------------------------------- |
| delivery_channel_chk         | CHECK | channel IN (`in_app`, `email`, `sms`, `push`, `webhook`, `whatsapp`)                   |
| delivery_status_chk          | CHECK | status IN (`pending`, `queued`, `sent`, `delivered`, `bounced`, `failed`, `cancelled`) |
| delivery_error_category_chk  | CHECK | error_category IN (`transient`, `permanent`, `rate_limit`, `auth`) or NULL             |
| delivery_attempts_sanity_chk | CHECK | `attempt_count <= max_attempts`                                                        |

### Indexes

| Index                    | Columns                                      | Condition                                       | Description                                            |
| ------------------------ | -------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------ |
| idx_delivery_message     | (message_id)                                 |                                                 | Find all deliveries for a message                      |
| idx_delivery_status      | (status)                                     | `WHERE status IN ('pending', 'queued', 'sent')` | Active delivery processing                             |
| idx_delivery_external    | (external_id)                                | `WHERE external_id IS NOT NULL`                 | Webhook reconciliation by provider tracking ID         |
| idx_delivery_tenant_time | (tenant_id, created_at DESC)                 |                                                 | Browse deliveries by tenant                            |
| idx_delivery_pickup      | (channel, provider_code, status, created_at) | `WHERE status IN ('pending', 'queued')`         | Worker pickup: channel+provider partitioned work queue |

### Partitioning

Range-partitioned by `created_at` on monthly boundaries. Initial provisioning creates the current month plus 3 months forward. Partition naming convention: `delivery_YYYY_MM`.

### Relationships

- Belongs to `notify.message` (many-to-one)
- Belongs to `core.tenant`

---

## notify.suppression

### Functional Description

Global suppression list that prevents delivery to addresses that have bounced, opted out, or are compliance-blocked. Uses the `citext` extension for case-insensitive address matching (critical for email address normalization). When the delivery pipeline encounters a recipient address in the suppression list, the delivery is skipped and logged accordingly.

### Technical Details

| Column                  | Type           | Nullable | Default             | Description                                                                             |
| ----------------------- | -------------- | -------- | ------------------- | --------------------------------------------------------------------------------------- |
| id                      | uuid           | NOT NULL | `gen_random_uuid()` | Unique suppression entry identifier                                                     |
| tenant_id               | uuid           | NOT NULL |                     | Owning tenant                                                                           |
| channel                 | text           | NOT NULL |                     | Channel this suppression applies to                                                     |
| address                 | citext         | NOT NULL |                     | Suppressed address (case-insensitive via citext)                                        |
| reason                  | text           | NOT NULL |                     | Suppression reason: `hard_bounce`, `complaint`, `opt_out`, `compliance_block`, `manual` |
| source                  | text           | YES      |                     | Where the suppression originated (e.g., provider feedback loop)                         |
| provider_code           | text           | YES      |                     | Provider that reported the suppression                                                  |
| metadata                | jsonb          | YES      |                     | Extensible metadata                                                                     |
| suppressed_at           | timestamptz(6) | NOT NULL | `now()`             | When the suppression was created                                                        |
| expires_at              | timestamptz(6) | YES      |                     | Optional expiry (for temporary suppressions)                                            |
| created_by_principal_id | uuid           | YES      |                     | Principal who created the suppression                                                   |
| created_by_service      | text           | YES      |                     | Service that created the suppression                                                    |

### Primary Key

`(id)`

### Foreign Keys

| Constraint                 | Column    | References      | On Delete |
| -------------------------- | --------- | --------------- | --------- |
| suppression_tenant_id_fkey | tenant_id | core.tenant(id) | CASCADE   |

### Constraints

| Constraint                 | Type  | Description                                                                     |
| -------------------------- | ----- | ------------------------------------------------------------------------------- |
| suppression_channel_chk    | CHECK | channel IN (`in_app`, `email`, `sms`, `push`, `webhook`, `whatsapp`)            |
| suppression_reason_chk     | CHECK | reason IN (`hard_bounce`, `complaint`, `opt_out`, `compliance_block`, `manual`) |
| suppression_created_by_chk | CHECK | Exactly one of `created_by_principal_id` or `created_by_service` must be set    |

### Indexes

| Index                                   | Columns                       | Condition | Description                                     |
| --------------------------------------- | ----------------------------- | --------- | ----------------------------------------------- |
| suppression_tenant_channel_address_uniq | (tenant_id, channel, address) |           | Unique suppression per tenant+channel+address   |
| idx_suppression_lookup                  | (channel, address)            |           | Fast suppression check during delivery pipeline |

### Relationships

- Belongs to `core.tenant`

---

## notify.push_subscription

### Functional Description

Stores Web Push API subscription registrations per user per device. Each row contains the VAPID endpoint, the P-256 Diffie-Hellman public key (`p256dh`), and the auth secret required to encrypt push payloads per the Web Push Protocol (RFC 8291). Subscriptions can be deactivated without deletion to handle stale/expired browser registrations.

### Technical Details

| Column       | Type        | Nullable | Default             | Description                                  |
| ------------ | ----------- | -------- | ------------------- | -------------------------------------------- |
| id           | uuid        | NOT NULL | `gen_random_uuid()` | Unique subscription identifier               |
| tenant_id    | uuid        | NOT NULL |                     | Owning tenant                                |
| principal_id | text        | NOT NULL |                     | User principal identifier                    |
| endpoint     | text        | NOT NULL |                     | Web Push endpoint URL                        |
| p256dh       | text        | NOT NULL |                     | P-256 ECDH public key for payload encryption |
| auth         | text        | NOT NULL |                     | Authentication secret for payload encryption |
| is_active    | boolean     | NOT NULL | `true`              | Whether this subscription is active          |
| created_at   | timestamptz | NOT NULL | `now()`             | When the subscription was registered         |
| updated_at   | timestamptz | NOT NULL | `now()`             | Last update timestamp                        |

### Primary Key

`(id)`

### Constraints

None beyond NOT NULL constraints.

### Indexes

| Index                         | Columns                              | Condition | Description                                                   |
| ----------------------------- | ------------------------------------ | --------- | ------------------------------------------------------------- |
| push_sub_tenant_endpoint_uniq | (tenant_id, endpoint)                |           | Unique endpoint per tenant (prevents duplicate subscriptions) |
| idx_push_sub_principal        | (tenant_id, principal_id, is_active) |           | Find active subscriptions for a user                          |

### Relationships

- Belongs to `core.tenant` (logical; no FK declared)
- Associated with a user principal via `principal_id`
