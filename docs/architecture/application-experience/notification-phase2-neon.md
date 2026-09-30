# Phase 2 — Neon notification runtime and experience

Implemented locally on 2026-09-23. Phase 1 publication remains the configuration source; no Studio frontend or new account grants were added.

## Build behavior

- The shared planner reads the published parent entity configuration. An entity override selects exact template versions; inherit uses the platform defaults. Disabled is terminal and cannot fall through to broad routing rules. Business Partner is a host context, not a dependency of the shared runtime.
- Comment edits emit mentions only for newly added recipients, excluding the author. Events carry revision-based identities. Durable source identity prevents replay duplicates; configured rolling deduplication uses transaction locks to prevent concurrent duplicates.
- Planning and delivery check the recipient's current access, comment audience, preferences and external-channel consent. A stale queued notification can be suppressed after access or policy changes.
- Ordinary comment attachments are not emailed automatically. Explicit references are pinned to versions and checked against the comment association, recipient access and existing attachment lifecycle/security checks. Required failures stop delivery; optional failures omit the file.
- In-app messages persist locally. Email, push, WhatsApp and SMS use the existing capture adapters and worker path. The shared callback mapping boundary supports mocked provider statuses; real provider callback authentication and ingestion are deferred. Existing provider-specific ingestion remains unchanged. Generic webhooks are not enabled for Collaboration.
- Neon hosts notification read/dismiss/counts, authorized parent links, mention-channel preferences and browser-push enrollment controls. Operator delivery inspection and retry use existing permissions. Shared UI components and theme tokens provide the controls and empty/error states.
- Notifications and workflow Inbox load independently. An Inbox permission failure no longer hides successfully loaded notifications.

## Main code areas

| Responsibility | Location |
| --- | --- |
| Published routing/rendering, planner, delivery guard, callback mapping | `server/packages/platform/notifications/src` |
| Mention deltas, event identity, explicit file references | `server/packages/platform/collaboration/src` |
| Capability admission and published reader composition | `server/apps/platform-host/src/composition/register-services.ts` |
| Shared notification controls and list integration | `packages/platform/shell/activity-center-data/src` |
| Typed client and authenticated relay | `packages/platform/communications/notifications-client`, `packages/platform/gateway/bff-relay` |
| Local event discovery and permission catalog | `server/db/migrations/20260923_entity_notification_discovery.sql`, `20260923_notification_operations_permissions.sql` |

## API usage

Neon uses `/api/relay` in front of the normal backend APIs. Mutations retain CSRF, authentication and existing idempotency/version requirements.

- Notification inbox: `/notifications/inbox`; counts: `/notifications/counts`; per-message read/dismiss and read-all use the existing notification routes.
- Preferences: `/notifications/preferences`; preview: `/notifications/preferences/preview`. Updates use the returned version with `If-Match`; conflicts offer reload.
- Browser enrollment uses the existing push configuration and subscription/device services. Local capture does not prove receipt by a physical device.
- Operator list: `GET /operations/notifications/deliveries`, with optional `before` cursor. Requires `notifications.delivery.read`.
- Operator replay: `POST /operations/notifications/deliveries/:id/replay` uses the existing delivery replay endpoint and an idempotency key. Requires `notifications.delivery.replay`; the server rechecks eligibility.

The two operator permissions are catalog entries only. No users, roles or groups receive them automatically.

Comment create/edit may explicitly request a selected attachment:

```json
{
  "attachmentIds": ["<selected-attachment-uuid>"],
  "notificationAttachments": [
    { "attachmentId": "<selected-attachment-uuid>", "required": true }
  ]
}
```

The service pins the version. Clients cannot provide storage URLs or arbitrary file bytes. The published rule's attachment mode must also permit inclusion.

## Local walkthrough

The Neon migrations above have been applied to the local database. Source-mounted API, worker and web services picked up the changes. Keep `NOTIFICATION_CAPTURE=true`, `EMAIL_PROVIDER=smtp`, and `SMTP_HOST=mailtrap` for this walkthrough.

With refreshed local Playwright authentication states:

```sh
node tooling/scripts/verification/verify-entity-notifications.dev.mjs
```

This creates a marked BP comment through the authenticated API, mentions the admitted owner, edits while retaining the mention, runs the normal queue jobs, and checks persisted deliveries plus Mailpit. It writes `/tmp/entity-notifications-phase2-live.json`. It does not publish configuration, grant access, change consent, or edit database rows directly. It intentionally leaves the marked test comment for inspection.

The normal queue can also be requested independently:

```sh
node tooling/scripts/verification/sweep-entity-notifications.dev.mjs
```

Open Neon Notifications as the recipient, follow the parent link, mark the notification read, dismiss it, and open Notification preferences. Operator controls appear only for an appropriately authorized account.

## Verification completed

- Live BP: exactly one mention event after create and retained-mention edit; one delivered in-app notification and one captured email. Email selected the published `bp_mention` override; in-app selected shared `comment_mention`.
- Live recipient: authorized record link, read/dismiss APIs, preferences UI, and hidden operator controls for an unprivileged account.
- Mailpit adapter smoke: email, SMS, WhatsApp, and web/Android/iOS push captures. These channels were tested through capture adapters; the live BP publication remains in-app/email.
- Shared fixtures: neutral second-entity routing and disabled entity suppression; added mention B, access/consent/preference denial, deduplication, pinned attachment handling, worker failures, and mocked callback transitions.
- Browser fixtures: preference save, version conflict recovery, permission-scoped operator inspection/retry, and Inbox failure isolation.

The local accounts correctly receive 403 for operator APIs. Authorized operator retry was verified with backend/browser fixtures, not by adding live grants. Physical devices and external providers remain deferred to section 14 of the build plan.

Targeted checks passed: 180 notification tests, 59 Collaboration tests, 38 communications-adapter tests (one opt-in test skipped in the ordinary run), 2 attachment-resolver tests, 10 host tests, and 4 browser tests. The separate opt-in Mailpit smoke also passed. Notification, Collaboration, host, relay and Activity center typechecks passed.

See [verification receipt](../../reports/notification-phase2-live-verification-20260923.json).
