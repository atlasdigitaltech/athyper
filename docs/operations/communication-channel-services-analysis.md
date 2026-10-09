---
title: Communication channel services analysis
---

# Communication channel services analysis

Inventory and gap analysis of the outbound communication channels the platform
implements, which providers each channel can use, and what is actually wired in
DEV, QA, STG and a future production placement. This is analysis: it selects no
provider, changes no behaviour, and authorises no provider enablement.

This complements [container decomposition across DEV, QA, STG and Production](/operations/container-decomposition-dev-qa-stg-prod)
and the [cloud and region placement analysis](/operations/cloud-region-placement-analysis).

## 1. The channels

The channel set is defined once, in `server/packages/contracts/notifications/src/delivery.ts`:

| Channel  | Contract value | Preference surface | Requires recipient address            | Requires consent    |
| -------- | -------------- | ------------------ | ------------------------------------- | ------------------- |
| In-app   | `in_app`       | yes                | no, keyed by principal                | no                  |
| Email    | `email`        | yes                | verified email contact                | no                  |
| SMS      | `sms`          | yes                | verified phone contact                | **no gate in code** |
| WhatsApp | `whatsapp`     | yes                | opt-in row with the phone number      | **yes, enforced**   |
| Push     | `push`         | yes                | registered device or web subscription | subscription itself |
| Webhook  | `webhook`      | **no**             | tenant-configured endpoint            | subscription itself |

Webhook is in the delivery contract but is not a user-facing preference. Only the
first five appear in `PreferenceChannel` in
`server/packages/platform/notifications/src/notification-preferences.ts`.

The seeded `notification.channel` lookup domain in
`server/db/ddl/planes/neon/control/lookup-packs/12_erp_master_data_seed.sql` declares
exactly these six, each with `is_extensible = true`, plus capability metadata:
`whatsapp` carries `requires_optin`, `push` carries `requires_subscription`, and
`webhook` carries `uses_hmac_signing`.

## 2. One port, many transports

Every channel is a `NotificationChannelHandler` — `channel`, `send()`, `health()`,
optional `close()`. The orchestrator
(`server/packages/platform/notifications/src/notification-orchestrator.ts`) resolves
the recipient, looks up the handler and calls it. No transport resolves templates or
recipients; that separation is explicit in the contract.

The adapter package `server/packages/adapters/communications` implements:

| Adapter                               | Channel                    | Wire protocol                                          |
| ------------------------------------- | -------------------------- | ------------------------------------------------------ |
| `email.adapter.ts`                    | email                      | SMTP via Nodemailer, optional auth                     |
| `ses-email.adapter.ts`                | email                      | Amazon SES v2 `SendEmail`, per-environment behaviour   |
| `sms.adapter.ts`                      | sms                        | Twilio REST API `2010-04-01`                           |
| `whatsapp-meta.adapter.ts`            | whatsapp                   | Meta Graph API, configurable version and base URL      |
| `web-push.adapter.ts`                 | push                       | VAPID web push                                         |
| `fcm-push.adapter.ts`                 | push                       | Firebase Cloud Messaging                               |
| `capture.adapter.ts`                  | email, sms, whatsapp, push | Local Mailpit capture, DEV only                        |
| `ses-event-sqs.adapter.ts`            | —                          | Consumes SES delivery events from SQS                  |
| `ses-tenant-control-plane.adapter.ts` | —                          | SES v2 tenant, suppression and resource administration |

Composition lives in
`server/apps/platform-host/src/composition/infrastructure/messaging.ts`. Each
transport is enabled only when its complete configuration is present, and shared
configuration validation in `server/apps/platform-host/src/config/environment.ts`
refuses partial configuration.

## 3. How a channel becomes active

| Channel                     | Enabled when                                                                                  | Validation rule                                                                                                              |
| --------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| email, SMTP                 | `EMAIL_PROVIDER=smtp` and host and from address present                                       | `SMTP_USER` and `SMTP_PASS` must both be set or both absent                                                                  |
| email, SES v2               | `EMAIL_PROVIDER=ses` and region, configuration set and from address present                   | Outside `local`, `SES_EVENT_QUEUE_URL` and an event region are **required**; native SES must consume its own delivery events |
| sms                         | `TWILIO_ACCOUNT_SID` **and** `TWILIO_AUTH_TOKEN`                                              | The adapter additionally requires a from number or a messaging service SID                                                   |
| whatsapp                    | `META_WHATSAPP_API_VERSION`, `META_WHATSAPP_PHONE_NUMBER_ID` and `META_WHATSAPP_ACCESS_TOKEN` | All-or-nothing: any one without the others is a startup error                                                                |
| push, FCM                   | `PUSH_FCM_PROJECT_ID`, `PUSH_FCM_CLIENT_EMAIL` and `PUSH_FCM_PRIVATE_KEY`                     | All-or-nothing                                                                                                               |
| push, web                   | `VAPID_SUBJECT`, `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`                                   | All-or-nothing                                                                                                               |
| all three external channels | `NOTIFICATION_CAPTURE=true`                                                                   | Local only, unauthenticated Mailpit SMTP, `EMAIL_PROVIDER=smtp`; SMS and WhatsApp are captured rather than sent              |
| in_app                      | always                                                                                        | Injected by composition, not configured                                                                                      |

`EMAIL_PROVIDER` is inferred when it is not set: any SES variable selects `ses`,
otherwise any SMTP variable selects `smtp`, otherwise `disabled`. Setting one SES
variable by accident therefore changes the selected provider.

## 4. The behaviour that matters most: skipping is silent

When a channel has no handler, or the recipient has no address for that channel,
the orchestrator does not fail. It records a delivery with `status: "skipped"` and
an error of `handler_unavailable` or `recipient_address_unavailable`, then
continues to the next channel.

The job handler
(`server/packages/platform/notifications/src/notification-jobs.ts`) throws only for
deliveries whose status is `failed`. Skipped deliveries are counted in the job
output and otherwise pass silently.

Consequences worth stating plainly:

- A channel that is routed and preferred but not configured produces a successful
  job and no message. Nothing pages, nothing retries, nothing fails.
- A recipient with no verified phone number produces the same outcome for SMS and
  WhatsApp.
- Channel availability is therefore **not** observable through job success. It is
  observable only by reading the delivery ledger, and only if someone looks.

## 5. Consent and recipient resolution

`createNotificationRecipientResolver` in
`server/packages/platform/notifications/src/recipient-resolver.ts` resolves
addresses per channel in one pass:

| Channel          | Address source               | Gate                                                     |
| ---------------- | ---------------------------- | -------------------------------------------------------- |
| `in_app`, `push` | principal identifier         | none at resolution; push needs an active subscription    |
| `email`          | verified email contact       | `status='active'`, `is_verified`, within effective dates |
| `sms`            | verified phone contact       | same verification gate                                   |
| `whatsapp`       | `event.whatsapp_consent` row | `consent_status='opted_in'`                              |

The directory query reads `master.contact_link` joined to `control.owner_type` for
`owner_type.code='principal'`, restricted to `channel_type` in
`email`, `phone`, `sms`, `whatsapp`, and to verified, active, currently effective
rows.

WhatsApp is the only channel with a dedicated consent gate. SMS sends to any
verified phone contact, and the seeded capability metadata does not mark SMS as
requiring opt-in. That asymmetry is a content and compliance decision, not a
technical requirement, and it is currently implicit.

### 5.1 Two consent models that do not currently meet

There are two consent structures:

1. **`event.channel_consent_event`** — the DDL comment calls it the immutable
   compliance ledger. `server/packages/platform/governance/src/consent/channel-consent-service.ts`
   writes it, hashes destinations, and provides grant, revoke, check-at-time and
   history, with audit and outbox records.
2. **`event.whatsapp_consent`** — the DDL comment calls it a compatibility state
   table for the current WhatsApp API, with a trigger that mirrors `opted_in` and
   `revoked` mutations into the ledger. It is the table the recipient resolver and
   the notification planner actually read.

**Finding: no application code inserts into `event.whatsapp_consent`.** Every
TypeScript reference reads from it — the resolver, the planner, and the preference
capability check. The generic consent service writes the governance table and the
ledger, but not this table.

The effect is that WhatsApp delivery is unreachable through the normal application
path: the transport can be configured, routing and preferences can select it, and
every delivery will still be skipped because no consent row can be created by the
product. The table, its status constraint, its trigger, its indexes and the
`requires_optin` lookup metadata are all present; only the write path is missing.

This is a concrete, verifiable integration gap between the notification channel and
the governance consent service. It may be a shared-framework improvement; it is not
covered by any current entity onboarding work, and the correct fix depends on where
consent is meant to be captured, so it needs a decision rather than a guess.

## 6. Provider mapping per market

Facts below come from provider documentation, not from repository source.

| Channel      | Provider in the stack            | Regions that serve the four target markets                                                                                                                                                                             |
| ------------ | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Email        | Amazon SES v2                    | Singapore `ap-southeast-1`, Malaysia `ap-southeast-5`, Mumbai `ap-south-1`, Hyderabad `ap-south-2`, UAE `me-central-1`, Bahrain `me-south-1` ([SES endpoints](https://docs.aws.amazon.com/general/latest/gr/ses.html)) |
| Email        | SMTP fallback                    | Any; the repository documents it as a disabled compatibility and rollback path                                                                                                                                         |
| SMS          | Twilio                           | Global; per-country sender rules apply. Saudi Arabia restricts alphanumeric sender IDs, so sender registration is a prerequisite, not an afterthought                                                                  |
| WhatsApp     | Meta WhatsApp Business Cloud API | Global Graph API; business messaging requires an approved WABA, template messages for business-initiated sends, and per-recipient opt-in                                                                               |
| Push, web    | VAPID web push, no provider      | Not regional; endpoint is the browser's push service                                                                                                                                                                   |
| Push, native | Firebase Cloud Messaging         | Global service, no per-region endpoint                                                                                                                                                                                 |

**There is no SES region in Saudi Arabia.** An in-Kingdom Saudi placement therefore
sends transactional email from `me-central-1` or `me-south-1`, which means email
content leaves the Kingdom even when everything else stays. This is the same class
of decision as the object-storage constraint in the placement analysis.

Also note the SES SMTP endpoint caveat: SMTP endpoints do not exist in Bahrain,
UAE, Malaysia and Hyderabad. That does not affect this stack, which uses the SES v2
API, but it would affect any decision to prefer SMTP in those regions.

## 7. Regional fit for channel providers

| Market       | Email                                 | SMS                                   | WhatsApp                         | Notes                                                                                     |
| ------------ | ------------------------------------- | ------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------- |
| Singapore    | SES `ap-southeast-1`                  | Twilio                                | Meta                             | Strongest provider coverage; a natural shared hub                                         |
| Malaysia     | SES `ap-southeast-5`                  | Twilio                                | Meta                             | In-country email available                                                                |
| India        | SES `ap-south-1`, `ap-south-2`        | Twilio                                | Meta                             | RBI payment-data localisation applies to message content if payment data enters scope     |
| Saudi Arabia | **No SES region**; use UAE or Bahrain | Twilio with Saudi sender registration | Meta, WABA and template approval | In-Kingdom email is not available from SES; SDAIA and PDPL classification governs content |

If a market requires in-Kingdom message content, the email channel has no
first-party AWS answer and needs a provider decision — a KSA-region transactional
email provider, or an accepted cross-border transfer with its own data-protection
basis. SMS and WhatsApp are third-party by nature and already cross borders.

## 8. What is configured per environment

| Environment | Email                                                                                                                                | SMS               | WhatsApp          | Push                         | Capture |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------- | ----------------- | ---------------------------- | ------- |
| DEV         | Mailpit SMTP through the capture path                                                                                                | captured          | captured          | captured                     | yes     |
| QA          | Mailpit SMTP through the capture path                                                                                                | captured          | captured          | captured                     | yes     |
| STG         | `EMAIL_PROVIDER=ses` with region, configuration set, from and reply-to, plus the SES event queue; SMTP toggles present but commented | **commented out** | **commented out** | VAPID set; FCM commented out | no      |
| PROD        | same shape as STG in `server/production.env.example`                                                                                 | commented out     | commented out     | VAPID set; FCM commented out | no      |

So the only externally active channel in the documented STG/PROD configuration is
email. The other three external channels are implemented and validated as code, but
their environment files ship them disabled. That is consistent with their content
being routed as skipped in any environment where they are enabled without these
values.

## 9. Verification and observability

- `server/apps/platform-host/src/composition/shared/verification.ts` verifies the
  selected email transport, and exercises email send only in `local`.
- Only `notifications.ses-event-source` registers a health probe
  (`messaging.ts`). Every channel handler implements `health()`, and the SES email
  handler performs a real account check, but **no composition registers per-channel
  health**. A configured-but-broken SMS, WhatsApp or push transport appears healthy
  at the platform level.
- Combined with section 4, the practical observability position is that a missing
  or broken external channel is invisible: no job failure, no health signal, no
  alert. What exists is the delivery ledger.

This is the single most valuable area to improve before any additional channel is
enabled in a governed environment, and it is a shared-framework concern rather than
an entity concern.

## 10. Findings

1. **Skipped deliveries do not fail jobs.** `handler_unavailable` and
   `recipient_address_unavailable` are recorded and counted, never raised. A
   governed environment can believe a channel is delivering when nothing is sent.
2. **WhatsApp consent has no writer in application code.** The table, trigger,
   constraints, indexes, planner check and resolver check all exist, and the
   channel metadata declares `requires_optin`; no code path creates the row. The
   channel is unreachable through the product as built.
3. **No per-channel health is registered**, although the contract and every adapter
   support it.
4. **SMS has no consent gate**, unlike WhatsApp, and no explicit decision record
   for that asymmetry.
5. **Only email is configured for STG/PROD.** SMS, WhatsApp and FCM are
   implemented, tested and deliberately left disabled; enabling any of them is a
   provider, consent and content decision, not a configuration toggle.
6. **`EMAIL_PROVIDER` inference is implicit.** Introducing a single SES or SMTP
   variable silently changes the selected transport.
7. **Saudi Arabia has no SES region**, so in-Kingdom email delivery is not
   available from the current primary provider.
8. **Notification delivery is not acknowledgement.** Per the governed case
   communications review, notifications establish that a message was routed and
   delivered to a transport; they do not establish that a task, approval or
   signature happened. No channel here should be treated as business evidence.

## 11. What would need deciding

- Whether the WhatsApp consent write path belongs in the governance consent
  service, a dedicated opt-in surface, or the notification planning layer.
- Whether skipped deliveries for a routed, preferred, configured channel should
  become a failure or an observable warning.
- Whether per-channel health should be registered and what a degraded channel means
  for a governed environment.
- Whether SMS requires an explicit opt-in decision to match WhatsApp.
- Which provider serves in-Kingdom email for a Saudi placement, and on what
  data-protection basis.
- Whether STG and PROD should enable SMS, WhatsApp or native push at all, and what
  evidence each would need before it is treated as qualified.

None of these is resolved here. Each is a framework or governance decision with an
owner, and none should be implemented as part of entity onboarding.
