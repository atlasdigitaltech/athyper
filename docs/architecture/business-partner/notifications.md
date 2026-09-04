# Business Partner notification matrix

Status: Phase 0 routing baseline accepted
Owners: Business Partner Product and Communications Platform

Commands publish `athyper.notification-event/1` references after commit. `recipientHints` are planning inputs, not addresses. Communications resolves the actual recipient against current authorization and relationship state, renders the versioned template, checks channel policy and creates an authorized deep link at delivery time.

| Event type                                    | Recipient hint                       | Delivery class          | Default channels                    | Template key                                     | Deep-link key                          |
| --------------------------------------------- | ------------------------------------ | ----------------------- | ----------------------------------- | ------------------------------------------------ | -------------------------------------- |
| `business_partner.invitation.created`         | `invitee`                            | Mandatory transactional | Email; SMS if explicitly configured | `business_partner.invitation.created.v1`         | `business_partner.invitation.accept`   |
| `business_partner.invitation.expiring`        | `invitee`, `requester`               | Policy controlled       | Email, in-app for requester         | `business_partner.invitation.expiring.v1`        | `business_partner.invitation.resume`   |
| `business_partner.invitation.cancelled`       | `invitee`, `requester`               | Mandatory transactional | Email, in-app for requester         | `business_partner.invitation.cancelled.v1`       | `business_partner.invitation.status`   |
| `business_partner.case.submitted`             | `current_approver`, `approval_queue` | Policy controlled       | In-app + email                      | `business_partner.case.submitted.v1`             | `business_partner.case.decision`       |
| `business_partner.case.returned`              | `requester`, `applicant`             | Mandatory transactional | In-app + email                      | `business_partner.case.returned.v1`              | `business_partner.case.correction`     |
| `business_partner.case.approved`              | `requester`, `relationship_owner`    | Preference aware        | In-app                              | `business_partner.case.approved.v1`              | `business_partner.case.outcome`        |
| `business_partner.case.rejected`              | `requester`, `applicant`             | Mandatory transactional | In-app + email                      | `business_partner.case.rejected.v1`              | `business_partner.case.outcome`        |
| `business_partner.case.materialized`          | `requester`, `relationship_owner`    | Preference aware        | In-app                              | `business_partner.case.materialized.v1`          | `business_partner.record.360`          |
| `business_partner.duplicate.review_required`  | `data_steward_queue`                 | Policy controlled       | In-app                              | `business_partner.duplicate.review_required.v1`  | `business_partner.duplicate.review`    |
| `business_partner.qualification.expiring`     | `relationship_owner`, `steward`      | Policy controlled       | In-app + email                      | `business_partner.qualification.expiring.v1`     | `business_partner.qualification.renew` |
| `business_partner.activation.blocked`         | `relationship_owner`, `steward`      | Policy controlled       | In-app                              | `business_partner.activation.blocked.v1`         | `business_partner.readiness`           |
| `business_partner.profile.quarantined`        | `mesh_integration_steward`           | Mandatory security      | In-app + operational alert          | `business_partner.profile.quarantined.v1`        | `business_partner.profile.quarantine`  |
| `business_partner.bank_verification.required` | `bank_verifier`                      | Mandatory security      | In-app                              | `business_partner.bank_verification.required.v1` | `business_partner.bank.decision`       |

## Policy rules

- Mandatory transactional events may bypass preference suppression only for the parties affected by a legal or workflow obligation.
- Mandatory security events ignore normal preferences, use the narrowest operational audience and may suppress user delivery until containment is complete.
- Policy-controlled events use the published journey/tenant policy. Preference-aware events honor the recipient's current channel preferences.
- The planner drops or reroutes a recipient whose invitation, account, relationship, assignment or permission is no longer active. A stale deep link must still fail closed at the destination.
- Deduplication uses event type, aggregate/case reference and committed version. Delivery retry never repeats the domain command.
- Templates contain only safe display labels, reference numbers, status, dates, counts and action summaries. They exclude bank/tax values, evidence content or filenames when sensitive, identity claims, tokens, internal comments and raw errors.
- Localization fallback, HTML/text escaping, stored-XSS payloads, bounce/failure handling, retry/dead-letter behavior, mandatory exceptions and deep-link authorization are required tests.

## Minimum event data

Every event supplies a stable event ID/type, occurrence time, tenant and plane, subject reference, recipient hints, delivery class, template key, deduplication key and safe primitive `templateData`. Case/relationship/actor references are included only when applicable. Rendered bodies and recipient addresses are not domain-event fields.
