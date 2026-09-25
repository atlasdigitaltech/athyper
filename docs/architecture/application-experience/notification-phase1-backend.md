# Notification configuration — Phase 1 backend

Status: Phase 1 complete, including authenticated Studio → Neon verification on 2026-09-23. All three sample policies were independently reviewed, signed, published and read from Neon. Temporary verification grants were revoked. No notification delivery or Studio frontend is introduced by this phase.

## What is built

- Shared v1 contracts for `comments` and `attachments`, explicit parent record coordinates, template variables, channel/template references, and `inherit`, `override`, `disabled` modes.
- Authenticated Studio draft APIs for policy listing/reading/saving, template listing/reading/upserting, validation and synthetic preview.
- Existing graph revisions, tenant authorization, independent review, signing and publication are reused.
- Notification-only drafts use a separate configuration entity identity and publish an `entity_notifications` descriptor to a separate activation key: `metadata.notifications.<entityCode>.<tenantId-without-hyphens>`.
- Studio has an authenticated publication-inspection API that reads Neon’s tenant-scoped active configuration through the shared reader. Phase 2 will connect this configuration to Neon event planning and delivery.

Notification configuration lives in existing `metadata.entity_capability.binding.notifications` JSON on a configuration identity (for example `business_partner_notifications`). Each configuration explicitly stores `targetEntityCode: "business_partner"`. This avoids replacing Business Partner’s latest native release and prevents downstream domain compilers from accidentally reading a notification-only graph. The target must exist in the tenant/global metadata catalog, and a configuration identity cannot be retargeted after publication. No duplicate template is copied into each entity when using inheritance. The shared platform v1 template catalog is immutable, code-versioned and referenced by exact key/channel/locale/version. These APIs edit **entity override templates**, not the existing operational `control.notification_template` rows. Editing shared defaults through Studio is a later extension; publishing a new shared default version must preserve v1 for existing references.

The existing runtime routing rows and delivery behavior are unchanged. Provider credentials, user preferences and channel activation belong to Phase 2 and are not stored in a template. `disabled` is terminal in the published projection; the Phase 2 resolver must honor it before legacy fallback.

## Local usage

The Studio migrations are `server/db/migrations/20260923_notification_configuration.sql` and `server/db/migrations/20260923_notification_compilation_source.sql`; both are applied locally and included in the Studio migration manifest and fresh DDL. They provide narrowly scoped preparation and tenant-scoped compilation-source functions for the existing publication service role. They do not configure policies through SQL or grant direct metadata access to the worker.

Use existing authenticated Playwright storage states:

- `tests/e2e/.auth/dev/studio/catl.admin.json`: author/publisher.
- `tests/e2e/.auth/dev/studio/catl.owner.json`: independent reviewer.
- Neon session files are not needed for administrative inspection; the Studio publisher uses its existing publication-read permission.

Alternative existing session files can be selected with `NOTIFICATION_STUDIO_AUTHOR_STATE`, `NOTIFICATION_STUDIO_REVIEWER_STATE`. The script still requires the same tenant and independent author/reviewer principals.

From the repository root:

```sh
node tooling/scripts/verification/setup-notification-policies.dev.mjs --check
node tooling/scripts/verification/setup-notification-policies.dev.mjs
```

Preflight checks both Studio sessions and the Studio publication-inspection permission before any draft is created. The script never reads provider secrets, grants permissions, updates tables, or sends messages. It uses normal BFF CSRF protection and the validated authoring services. Existing authorization is required; refreshed sessions alone do not grant permissions.

The script creates a separate `business_partner_notifications` configuration identity when needed, and dedicated notification branches for:

1. Business Partner inheriting shared defaults, then verifies the active Neon configuration.
2. Business Partner overriding the email template while retaining the shared in-app template, then verifies the replacement notification configuration.
3. A neutral `notification_employee_example` configuration entity with comments and attachment notifications disabled. It does not modify an actual Employee domain entity.

The final active BP sample is the override. Each run creates new reviewed releases. Existing domain release history and UI/storage publication heads are not changed. A partial-run receipt is saved as `/tmp/athyper-notification-phase1.dev.json`; use `node tooling/scripts/verification/setup-notification-policies.dev.mjs --resume` to continue a published sample through normal APIs. Resume redispatches the same release and skips verified samples; it does not create replacement releases. An unfinished draft requires inspection. Do not blindly rerun a failed publish to repair worker or authentication problems.

## API shapes

Backend paths below use `/api`; through the browser BFF use `/api/relay` instead. All draft routes require an authenticated Studio tenant and `metadata.entity.author`; validation requires `metadata.entity.validate`. Standard submit/review/publish permissions remain unchanged. Read models never bypass tenant checks. Revisions are shared with the enclosing entity draft.

Let `D = /api/meta-entity-authoring/change-sets/:id` and `N = D/notifications/:capability`, where capability is `comments` or `attachments`.

| Method/path | Input | Response |
| --- | --- | --- |
| `GET D/notifications` | None | `{ revision, policies: [{ capability, configuration }] }` |
| `GET N` | None | `{ revision, configuration, projection }` |
| `GET N/templates` | None | `{ revision, shared, overrides }` |
| `GET N/templates/:key` | Optional `channel`, `locale`, `version` query | `{ revision, templates }` |
| `PUT N/templates/:key` | `{ expectedRevision, template }` | `{ changeSet, template }` |
| `PUT N/policy` | `{ expectedRevision, policy }` | `{ changeSet, configuration }` |
| `POST N/validate` | `{}` or `{ configuration }` | `{ valid: true, projection }` |
| `POST N/preview` | `{ reference, variables }` | `{ preview: { subject, bodyText, bodyHtml, channel, locale, version }, sent: false }` |
| `GET /api/meta-entity-authoring/inspection/notifications/:entityCode` | None; publication read permission | `{ entityCode, sourceEntityCode, releaseId, releaseNo, compiledHash, notifications, sharedTemplates }` |

There is one policy per enabled Collaboration capability. `PUT policy` creates the explicit configuration when absent and updates it when present. It preserves templates and the target entity coordinate established in the graph. `PUT templates/:key` creates or replaces the exact draft coordinate; published releases are immutable. Create a new draft and template version for published changes.

Policy save example:

```json
{
  "expectedRevision": 3,
  "policy": {
    "schemaVersion": 1,
    "mode": "override",
    "defaultPolicyRef": "platform.comments.notifications.v1",
    "rules": [{
      "event": "collaboration.comment.mentioned",
      "enabled": true,
      "recipients": "mentioned",
      "channels": ["email"],
      "templates": [{ "key": "bp_mention", "channel": "email", "locale": "en", "version": 1 }],
      "attachmentMode": "none",
      "dedupWindowMs": 300000
    }]
  }
}
```

Create the referenced template before saving that policy:

```json
{
  "expectedRevision": 2,
  "template": {
    "key": "bp_mention", "channel": "email", "locale": "en", "version": 1,
    "subject": "Business Partner mention",
    "bodyText": "A colleague mentioned you: {{excerpt}}",
    "variables": { "excerpt": "string" }
  }
}
```

Preview example:

```json
{
  "reference": { "key": "bp_mention", "channel": "email", "locale": "en", "version": 1 },
  "variables": { "excerpt": "Synthetic example only." }
}
```

Preview accepts only declared, typed synthetic variables. It does not fetch record data, resolve recipients, create outbox rows, or call delivery adapters. Authored templates are plain text; the HTML preview is escaped. Variable types are `string`, `number`, `boolean`, and HTTPS `url`. Arbitrary authored HTML, expressions and helper execution are intentionally unsupported in v1.

Record context example:

```json
{
  "resourceType": "document.comment", "resourceId": "comment-id",
  "parentEntityCode": "business_partner", "parentRecordId": "record-id"
}
```

The policy target identifies an entity type; the event parent identifies a particular record of that type. A notification's resource and parent record remain distinct. The coordinate contract is available for Phase 2 event enrichment; this phase does not change existing emitted event payloads.

## Policy semantics and errors

- `inherit`: resolve `platform.comments.notifications.v1` or `platform.attachments.notifications.v1`; rules must be empty.
- `override`: merge by event, replacing that event's complete settings. An override with `enabled: false` removes that inherited event.
- `disabled`: emit an empty effective rule list; rules must be empty. Stored draft templates are inert.
- Comments default: mentioned users, in-app and email, explicit attachment mode `none`, configured dedup window of five minutes. Attachment defaults have no notifying events.
- Supported channels: `in_app`, `email`, `push`, `sms`, `whatsapp`, `webhook`. Channel configuration does not imply an active provider or a send.
- Every selected channel requires exactly one English fallback template. Optional other locales require exact, existing references; no implicit “latest” lookup.
- Missing references, unsupported schema/default versions, duplicate coordinates, malformed variables and incompatible settings return `422 NOTIFICATION_CONFIGURATION_INVALID` with a detail message.
- Stale revision or a noneditable draft returns a conflict; fetch the current draft before retrying.
- Unavailable capability/template returns 404. Unauthorized and cross-tenant access is denied. Unpublished Neon configuration returns `404 NOTIFICATION_CONFIGURATION_NOT_PUBLISHED`.

## Publication flow

Use a notification-only contract 2.1 draft on an entity with `entityClass: "configuration"`. Every configured capability must reference the same explicit `targetEntityCode`. Include one virtual, catalog-only runtime profile (`readMode` and `writeMode` are `none`). The examples in `tooling/fixtures/notifications/` contain complete graphs. Such a draft must not include domain fields, operations, surfaces or other nonempty application branches.

1. Create draft with `POST /api/meta-entity-authoring/change-sets`.
2. Save the graph with `PUT D/graph`, `If-Match: <revision>`, and the graph itself as the body.
3. Configure/preview through the notification APIs.
4. `POST D/validate`, `POST D/test`.
5. `POST D/submit` with `{ expectedRevision }`.
6. A different principal calls `POST D/approve` with the current revision.
7. Publisher calls `POST D/publish` with `{ expectedRevision, targetPlanes: ["neon"] }`.
8. Normal workers sign, dispatch and apply. Read the resulting configuration from Neon and match the returned release ID.

The SQL preparer independently checks tenant/publisher identity, review and graph shape. The target verifies signed content hashes and template/schema validity, and checks the notification projection against the authored capability configuration. A malformed or incompatible signed projection is rejected rather than silently defaulted.

The projected source and effective policy are returned together for the future Studio UI and Neon resolver. The read endpoint does not call Studio or select an unverified draft.

## Completed checks

The affected contract, authoring, publication and notification backend suites pass, as do relay checks and the six affected package typechecks. Targeted coverage includes inheritance/override/disabled behavior, missing/version-mismatched references, typed preview/escaping, immutable shared defaults, tenant/plane/auth denial, stale revisions, noneditable drafts, notification-only compilation, signed artifact validation, source mismatch rejection and tenant-scoped active reads. The existing independent-review tests remain in place.

The refreshed Studio admin/owner sessions are now authenticated with elevated assurance. Live preflight exposed and corrected an inappropriate idempotency header in the setup script. The administrative read was moved to Studio publication inspection: `publication.deployment.view` exists in Studio, not Neon. Its tenant-scoped authorization no longer sends an incomplete entity-operation coordinate.

The user-approved two-hour grants were applied only to the named Studio accounts for this verification and revoked at 2026-09-23T01:56:51.776Z. Zero active grant edges remain under the verification source reference. Other access was preserved; existing deployment-observer access can still allow publication inspection, so a blanket 403 after cleanup is not expected.

The live run exposed a worker query that required direct metadata access. The compilation-source migration fixes this through a tenant-scoped, read-only function restricted to approved/published notification releases. Retrying the original signed release succeeded. The publication suite passes all 214 tests, including regression coverage for this worker path and canonical contract signing; its source and test typechecks also pass.

Live API checks confirmed invalid template references (422), reviewer authoring denial (403), anonymous inspection denial (401), stale revision conflicts (409), escaped preview HTML, missing-variable rejection and `sent: false`. BP inherits shared defaults in the first release, then overrides email while retaining the shared in-app template. The neutral Employee sample has no effective comment or attachment rules. Final active BP configuration is intentionally the override.

Release IDs and the access-cleanup receipt are recorded in [the local verification result](../../reports/notification-phase1-live-verification-20260923.json). Phase 2 routing and channel delivery remain separate work.
