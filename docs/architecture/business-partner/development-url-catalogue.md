# Business Partner development URL catalogue

Status: development environment reference

Last verified: 2026-09-06

All application URLs resolved through the development gateway when last verified. Authentication, selected tenant context and permissions determine whether an experience or operation is available.

This catalogue contains every frontend page and browser API route currently declared under `apps/studio/app`, `apps/neon/app` and `apps/mesh/app`. It lists the Business Partner Runtime APIs relevant to this architecture package. The generated Runtime OpenAPI document is the authoritative exhaustive inventory for backend endpoints outside this capability.

## Runtime discovery and health

- API base: `https://api.dev.athyper.test`
- [Swagger documentation](https://api.dev.athyper.test/docs)
- [OpenAPI document](https://api.dev.athyper.test/openapi.json)
- [Liveness](https://api.dev.athyper.test/livez)
- [Readiness](https://api.dev.athyper.test/readyz)

Readiness returned `503` at the last verification because of unrelated MESH exchange-contract and tenant-less case-age checks. Check release-specific services independently before attributing that result to Business Partner onboarding.

## Common application routes

These routes exist on all three application origins:

| Function | Studio | NEON | MESH |
| --- | --- | --- | --- |
| Application root | [Open](https://studio.dev.athyper.test/) | [Open](https://neon.dev.athyper.test/) | [Open](https://mesh.dev.athyper.test/) |
| Sign in | [Open](https://studio.dev.athyper.test/sign-in) | [Open](https://neon.dev.athyper.test/sign-in) | [Open](https://mesh.dev.athyper.test/sign-in) |
| Sign out page | [Open](https://studio.dev.athyper.test/logout) | [Open](https://neon.dev.athyper.test/logout) | [Open](https://mesh.dev.athyper.test/logout) |
| Select tenant/context | [Open](https://studio.dev.athyper.test/select-context) | [Open](https://neon.dev.athyper.test/select-context) | [Open](https://mesh.dev.athyper.test/select-context) |
| Home | [Open](https://studio.dev.athyper.test/home) | [Open](https://neon.dev.athyper.test/home) | [Open](https://mesh.dev.athyper.test/home) |
| Inbox | [Open](https://studio.dev.athyper.test/inbox) | [Open](https://neon.dev.athyper.test/inbox) | [Open](https://mesh.dev.athyper.test/inbox) |
| Notifications | [Open](https://studio.dev.athyper.test/notifications) | [Open](https://neon.dev.athyper.test/notifications) | [Open](https://mesh.dev.athyper.test/notifications) |
| Atlas | [Open](https://studio.dev.athyper.test/atlas) | [Open](https://neon.dev.athyper.test/atlas) | [Open](https://mesh.dev.athyper.test/atlas) |
| Master Data Governance | [Open](https://studio.dev.athyper.test/mdg) | [Open](https://neon.dev.athyper.test/mdg) | [Open](https://mesh.dev.athyper.test/mdg) |
| Application liveness | [Open](https://studio.dev.athyper.test/livez) | [Open](https://neon.dev.athyper.test/livez) | [Open](https://mesh.dev.athyper.test/livez) |
| Application readiness | [Open](https://studio.dev.athyper.test/readyz) | [Open](https://neon.dev.athyper.test/readyz) | [Open](https://mesh.dev.athyper.test/readyz) |
| Notification service worker | [Open](https://studio.dev.athyper.test/notification-sw.js) | [Open](https://neon.dev.athyper.test/notification-sw.js) | [Open](https://mesh.dev.athyper.test/notification-sw.js) |

The application shells also declare descriptor-driven routes:

```text
/{workspaceSlug}
/{workspaceSlug}/{moduleSlug}
```

NEON additionally supports deeper descriptor-driven segments:

```text
/{workspaceSlug}/{moduleSlug}/{segments...}
```

These are route patterns, not individually reviewable pages until a workspace/module descriptor supplies concrete slugs.

## Studio applications

| Function | URL | Current behavior |
| --- | --- | --- |
| Business Partner configuration | [Open](https://studio.dev.athyper.test/mdg/business-partner) | Landing and navigation |
| Data model | [Open](https://studio.dev.athyper.test/mdg/business-partner/model) | Model overview |
| Validation | [Open](https://studio.dev.athyper.test/mdg/business-partner/validation) | Validation view |
| Matching | [Open](https://studio.dev.athyper.test/mdg/business-partner/matching) | Matching configuration |
| Definition, form and case-contract publication | [Open](https://studio.dev.athyper.test/mdg/business-partner/publication) | Authoring workspace |
| Workflow | [Open](https://studio.dev.athyper.test/mdg/business-partner/workflows) | Read-only overview; not the complete administration designer |
| Operations | [Open](https://studio.dev.athyper.test/mdg/business-partner/operations) | Operations experience |
| AI experience | [Open](https://studio.dev.athyper.test/mdg/business-partner/ai-experience) | AI experience |
| Entity experiences | [Open](https://studio.dev.athyper.test/entity/experiences) | Entity experience configuration |

## NEON applications

| Function | URL |
| --- | --- |
| Module home | [Open](https://neon.dev.athyper.test/mdg/business-partner) |
| Master list | [Open](https://neon.dev.athyper.test/mdg/business-partner/partners) |
| Create Supplier request | [Open](https://neon.dev.athyper.test/mdg/business-partner/new) |
| Create Customer request | [Open](https://neon.dev.athyper.test/mdg/business-partner/customer/new) |
| Create Person request | [Open](https://neon.dev.athyper.test/mdg/business-partner/person/new) |
| Requests | [Open](https://neon.dev.athyper.test/mdg/business-partner/requests) |
| Request detail and workflow | `https://neon.dev.athyper.test/mdg/business-partner/requests/{caseId}#workflow` |
| Edit draft or returned request | `https://neon.dev.athyper.test/mdg/business-partner/requests/{caseId}/edit` |
| Business Partner 360 | `https://neon.dev.athyper.test/mdg/business-partner/{businessPartnerId}` |
| Supplier controls | `https://neon.dev.athyper.test/mdg/business-partner/{businessPartnerId}/supplier` |
| Customer controls | `https://neon.dev.athyper.test/mdg/business-partner/{businessPartnerId}/customer` |
| Add role | `https://neon.dev.athyper.test/mdg/business-partner/{businessPartnerId}/roles/new` |
| Add scope | `https://neon.dev.athyper.test/mdg/business-partner/{businessPartnerId}/scope/new` |
| MESH proposals | [Open](https://neon.dev.athyper.test/mdg/business-partner/mesh-proposals) |
| External Supplier application | [Open](https://neon.dev.athyper.test/supplier-application) |
| Workflow inbox | [Open](https://neon.dev.athyper.test/inbox) |
| Notifications | [Open](https://neon.dev.athyper.test/notifications) |
| Data transfers | [Open](https://neon.dev.athyper.test/operations/data-transfers) |
| New data transfer | [Open](https://neon.dev.athyper.test/operations/data-transfers/new) |
| Workforce requests | [Open](https://neon.dev.athyper.test/people/workforce/requests) |
| New Workforce request | [Open](https://neon.dev.athyper.test/people/workforce/requests/new) |
| Workforce request detail | `https://neon.dev.athyper.test/people/workforce/requests/{requestId}` |
| Workforce requisitions | [Open](https://neon.dev.athyper.test/people/workforce/requisitions) |

The canonical master-list route is `/mdg/business-partner/partners`; `/mdg/business-partner` is the module landing page.

Development workflow examples:

- [Case 52e23a67](https://neon.dev.athyper.test/mdg/business-partner/requests/52e23a67-b01d-48b5-ac2a-9add96a47ead#workflow)
- [Case 8f80c237](https://neon.dev.athyper.test/mdg/business-partner/requests/8f80c237-2fa9-4276-b625-51625e83dd94#workflow)

## MESH applications

| Function | URL |
| --- | --- |
| Business Partner home | [Open](https://mesh.dev.athyper.test/mdg/business-partner) |
| Organization profile | [Open](https://mesh.dev.athyper.test/mdg/business-partner/profile) |
| Network relationships | [Open](https://mesh.dev.athyper.test/mdg/business-partner/relationships) |
| Profile and change requests | [Open](https://mesh.dev.athyper.test/mdg/business-partner/requests) |
| Data transfers | [Open](https://mesh.dev.athyper.test/operations/data-transfers) |
| New data transfer | [Open](https://mesh.dev.athyper.test/operations/data-transfers/new) |

## Browser authentication and relay APIs

The following browser-facing routes are implemented independently on each application origin:

```text
https://studio.dev.athyper.test
https://neon.dev.athyper.test
https://mesh.dev.athyper.test
```

Replace `{appOrigin}` below with one of those origins.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `{appOrigin}/api/auth/login` | Start the OIDC login flow |
| `GET` | `{appOrigin}/api/auth/callback` | IAM callback; not a manual review entry point |
| `GET` | `{appOrigin}/api/auth/contexts` | List permitted tenant/application contexts |
| `GET` | `{appOrigin}/api/auth/session` | Read the current browser session |
| `POST` | `{appOrigin}/api/auth/session/context` | Change the active tenant/context |
| `POST` | `{appOrigin}/api/auth/refresh` | Refresh the application session |
| `POST` | `{appOrigin}/api/auth/touch` | Extend/touch active session state |
| `POST` | `{appOrigin}/api/auth/step-up/start` | Start elevated-assurance authentication |
| `POST` | `{appOrigin}/api/auth/mfa/verify` | Verify the MFA challenge |
| `POST` | `{appOrigin}/api/auth/logout` | Start authenticated logout |
| `GET` | `{appOrigin}/api/auth/logout/callback` | IAM logout callback; not a manual review entry point |
| `POST` | `{appOrigin}/api/auth/backchannel-logout` | IAM back-channel logout; IAM-to-application only |
| `GET/POST/PUT/PATCH/DELETE` | `{appOrigin}/api/relay/{path...}` | Authenticated same-origin relay to the Runtime API |

Use the `/sign-in`, `/logout` and `/select-context` pages for manual UX review. Callback, back-channel and relay routes are protocol endpoints and should not be opened as ordinary pages.

## Studio and cycle APIs

All paths use `https://api.dev.athyper.test`.

```text
POST /api/studio/business-partner-definitions
POST /api/studio/business-partner-definitions/simulations
GET  /api/studio/business-partner-definitions/{revisionId}
POST /api/studio/business-partner-definitions/{revisionId}/publish

POST /api/studio/business-partner-case-contracts
POST /api/studio/business-partner-case-contracts/simulations
GET  /api/studio/business-partner-case-contracts/{revisionId}
POST /api/studio/business-partner-case-contracts/{revisionId}/publish

POST /api/control-admin/cycle-config/preview
POST /api/control-admin/cycle-config/validate
POST /api/control-admin/cycle-config/publish
POST /api/control-admin/cycle-config/desired-state/apply
GET  /api/control-admin/cycle-config/{cycleTypeId}/revisions/latest
GET  /api/control-admin/cycle-config/{cycleTypeId}/revisions/{version}
```

## NEON definition, case and workflow APIs

```text
GET /api/neon/business-partner-definitions/active-descriptors
GET /api/neon/business-partner-definitions/active-request-form

POST  /api/neon/business-partner-cases
GET   /api/neon/business-partner-cases
GET   /api/neon/business-partner-cases/{caseId}
GET   /api/neon/business-partner-cases/{caseId}/view
PATCH /api/neon/business-partner-cases/{caseId}
POST  /api/neon/business-partner-cases/{caseId}/validate
POST  /api/neon/business-partner-cases/{caseId}/submit
POST  /api/neon/business-partner-cases/{caseId}/decisions
POST  /api/neon/business-partner-cases/{caseId}/materialize

GET  /api/workflow/requests/{workflowRequestId}/context
GET  /api/workflow/inbox
POST /api/workflow/work-items
POST /api/workflow/items/{workItemId}/actions/{action}
```

The case query includes its pinned onboarding cycle. Compatibility routes under `/api/neon/business-partner-requests` remain available; new consumers should use native case routes.

## Business Partner aggregate and 360 APIs

```text
GET  /api/neon/business-partners/{businessPartnerId}
GET  /api/neon/business-partners/{businessPartnerId}/360/summary
GET  /api/neon/business-partners/{businessPartnerId}/360/{section}
POST /api/neon/business-partners/{businessPartnerId}/360/identifiers-tax/reveal
POST /api/neon/business-partners/{businessPartnerId}/360/banking/reveal
```

See [Business Partner field extensibility and 360 aggregation](field-extensibility-and-360-aggregation.md) for the aggregation and security model.

## Invitation and registration APIs

```text
GET  /api/neon/business-partner-invitation-templates/{journeyKind}
POST /api/neon/business-partner-invitations
GET  /api/neon/business-partner-invitations/{invitationId}
POST /api/neon/business-partner-invitations/{invitationId}/resend
POST /api/neon/business-partner-invitations/{invitationId}/cancel
POST /api/neon/business-partner-invitations/{invitationId}/support-recovery

POST  /api/neon/external/business-partner-invitations/{journeyKind}/accept
GET   /api/neon/external/business-partner-invitations/{journeyKind}/requests/{requestId}/status
PATCH /api/neon/external/business-partner-invitations/{journeyKind}/requests/{requestId}/correction
POST  /api/neon/external/business-partner-invitations/{journeyKind}/requests/{requestId}/evidence/stage
POST  /api/neon/external/business-partner-invitations/{journeyKind}/requests/{requestId}/evidence/complete
POST  /api/neon/external/business-partner-invitations/{journeyKind}/requests/{requestId}/evidence
POST  /api/neon/external/business-partner-invitations/{journeyKind}/requests/{requestId}/submit
```

## Qualification, activation and banking APIs

```text
GET  /api/neon/business-partners/{businessPartnerId}/eligibility
POST /api/neon/business-partners/{businessPartnerId}/qualifications
POST /api/neon/business-partner-qualifications/{qualificationId}/decisions

POST /api/neon/business-partners/{businessPartnerId}/protected-bank-registrations
GET  /api/neon/protected-bank-registrations/{bankAccountLinkId}
POST /api/neon/protected-bank-registrations/{bankAccountLinkId}/decisions
POST /api/neon/protected-bank-registrations/{bankAccountLinkId}/applications

POST /api/neon/business-partner-bank-verifications
GET  /api/neon/business-partner-bank-verifications/{verificationId}
POST /api/neon/business-partner-bank-verifications/{verificationId}/decisions
POST /api/neon/business-partner-bank-verifications/{verificationId}/applications
```

Supplier activation is an `activate_supplier` Entity Case followed by the standard validation, submission, decision and materialization commands. The old direct `/supplier-activation` route intentionally returns `409 SUPPLIER_ACTIVATION_CASE_REQUIRED`.

## NEON and MESH exchange APIs

```text
POST /api/neon/mesh-business-partner-account-links
GET  /api/neon/mesh-business-partner-account-links/{linkId}
POST /api/neon/mesh-business-partner-account-links/{linkId}/decisions

POST /api/neon/business-partner-profile-events
GET  /api/neon/business-partner-profile-events/receipts
GET  /api/neon/business-partner-profile-events/quarantine
POST /api/neon/business-partner-profile-events/{eventId}/replays
GET  /api/neon/business-partner-profile-projections

POST /api/neon/business-partner-profile-matches
GET  /api/neon/business-partner-profile-matches/{matchId}
POST /api/neon/business-partner-profile-matches/{matchId}/requests
POST /api/neon/business-partner-profile-change-previews
POST /api/neon/business-partner-profile-change-resolutions
POST /api/neon/mesh-bank-account-events

GET  /api/mesh/business-partner-network-workspace
POST /api/mesh/business-partner-network-relationships
POST /api/mesh/business-partner-network-relationships/{relationshipId}/decisions
POST /api/mesh/business-partner-network-relationships/{relationshipId}/capabilities
POST /api/mesh/business-partner-network-capabilities/{capabilityId}/decisions
POST /api/mesh/business-partner-registration-exchanges
POST /api/mesh/business-partner-registration-exchanges/{exchangeId}/decisions

POST /api/mesh/business-partner-profile-publications
GET  /api/mesh/business-partner-profile-publications
GET  /api/mesh/business-partner-profile-publications/{publicationId}
POST /api/mesh/business-partner-profile-publications/{publicationId}/withdrawals

POST /api/mesh/business-partner-bank-disclosures
GET  /api/mesh/business-partner-bank-disclosures/{disclosureId}
POST /api/mesh/business-partner-bank-disclosures/{disclosureId}/decisions
POST /api/mesh/business-partner-bank-disclosures/{disclosureId}/revocations
```

For the authoritative complete route inventory, use the live OpenAPI document rather than copying this point-in-time catalogue into client code.
