# Business Partner Phase 0 baseline

Status: Architecture accepted; Phase 0 gates green; repository aggregate and production qualification blocked
Baseline date: 2026-09-04

The accepted decisions are in [Business Partner Phase 0 architecture baseline](../decisions/business-partner-phase-0.md). The machine-readable inventory is `governance/config/governance/business-partner-phase0.v1.json`.

## Frontend spine baseline

`pnpm policy:frontend-spine`, `pnpm policy:plane-boundaries` and `pnpm contracts:check` passed before Phase 0 changes. No existing package exceeded its configured runtime or workspace budget, so the accurate action is an explicit re-baseline: retain every current limit and add the two previously unbudgeted workflow packages.

| Package                                     | Owner             | Runtime/workspace budget | Phase 0 decision                                                |
| ------------------------------------------- | ----------------- | -----------------------: | --------------------------------------------------------------- |
| `@athyper/contract-platform-entity-runtime` | Contract Platform |                    0 / 0 | Owns dependency-free wire types and parsers                     |
| `@athyper/platform-entity-workflow-ui`      | UI Platform       |                    0 / 0 | Reserved for proven domain-neutral UI; remains empty in Phase 0 |

No new package was created. Plane adapters remain in their existing NEON, MESH and Studio packages.

The aggregate `pnpm policy` command is not green at this baseline. Pre-existing blockers include workspace manifest version/local-package consistency in `policy:versions`, broad legacy `tsconfig` policy drift and `policy:content-ui-boundaries` targeting a retired source path; the aggregate chain stops before every check is evaluated, so this is not a claim that those are the only global blockers. Phase 0 does not silently re-baseline unrelated package versions, TypeScript policy or retired package paths. The Phase 0, frontend-spine, plane-boundary, contract, catalog and focused regression gates listed below are green; the repository-wide exit gate remains open until those central authorities are repaired separately.

Database regression validation also exposed stale generated NEON authorization inventory and a catalog-ownership step lost during migration squash. The canonical DDL now rebinds the established Business Partner permission families to `mdg.bp` through the required suspended state, and the generated inventory is current. That inventory remains explicitly non-enforcing and release-blocked, with 262 tables awaiting business review.

## Browser route inventory

| Route                                            | Source/ownership                                                    | Current purpose                              |
| ------------------------------------------------ | ------------------------------------------------------------------- | -------------------------------------------- |
| `/mdg/business-partner`                          | NEON static page                                                    | Module overview                              |
| `/mdg/business-partner/partners`                 | NEON static page                                                    | Manage/list entry                            |
| `/mdg/business-partner/business-partners`        | Catalog entity adapter                                              | Descriptor-driven Business Partner list      |
| `/mdg/business-partner/new`                      | NEON static page                                                    | Supplier request                             |
| `/mdg/business-partner/customer/new`             | NEON static page                                                    | Customer request                             |
| `/mdg/business-partner/person/new`               | NEON static page                                                    | Explicit organization-only boundary guidance |
| `/mdg/business-partner/requests`                 | NEON static page; catalog request entity resolves to the same route | Case list                                    |
| `/mdg/business-partner/requests/:requestId`      | NEON static page                                                    | Case detail/decision                         |
| `/mdg/business-partner/requests/:requestId/edit` | NEON static page                                                    | Draft correction                             |
| `/mdg/business-partner/:recordId`                | NEON static page                                                    | Business Partner 360                         |
| `/mdg/business-partner/:recordId/customer`       | NEON static page                                                    | Customer controls                            |
| `/mdg/business-partner/:recordId/roles/new`      | NEON static page                                                    | Add supplier/customer role                   |
| `/mdg/business-partner/:recordId/scope/new`      | NEON static page                                                    | Assign organization/company scope            |

## Catalog inventory

- Workspace: `mdg` / `/mdg` / Master Data Governance.
- Module: `bp` / `/mdg/business-partner` / Business Partner Management.
- Entity adapters: `business_partner` -> `business-partners`; `business_partner_request` -> `requests`.
- Module navigation: Overview, Manage, Review & Approval and Create.

The platform catalog remains the route/module authority. Static detail/action routes are module-owned descendants and do not create a second navigation registry.

## Operation and allowlist audit

The NEON module declares operations only with `createOperation` and uses the shared API client. No raw `fetch` path exists in the Business Partner plane packages or pages.

Existing operation families are governed case create/list/view/update/validate/submit/decide/apply; aggregate and eligibility reads; Customer credit and lifecycle commands; 360 summary, common, role/company, commercial, network and explainability sections; purpose-bound tax/bank reveal; and authorized attachment download.

The machine baseline enumerates all 23 current `createOperation` declarations with method, normalized path, source and relay status. The Phase 0 policy compares that count per source file, so a new declaration requires an inventory and allowlist decision.

Six UI declarations had a matching server route but no matching NEON relay entry. Phase 0 added explicit named entries:

| ID      | Method/path                                                                   | Named operation                                         |
| ------- | ----------------------------------------------------------------------------- | ------------------------------------------------------- |
| BP-R001 | `GET /api/neon/business-partners/:businessPartnerId/360/governance`           | `neon.business-partners.360.governance`                 |
| BP-R002 | `POST /api/attachments/:attachmentId/download`                                | `attachments.download`                                  |
| BP-R003 | `GET /api/neon/business-partners/:businessPartnerId/customer-credit-reviews`  | `neon.business-partners.customer-credit-reviews.list`   |
| BP-R004 | `POST /api/neon/business-partners/:businessPartnerId/customer-credit-reviews` | `neon.business-partners.customer-credit-reviews.create` |
| BP-R005 | `POST /api/neon/customer-credit-reviews/:reviewId/decisions`                  | `neon.business-partners.customer-credit-reviews.decide` |
| BP-R006 | `POST /api/neon/business-partners/:businessPartnerId/customer-lifecycle`      | `neon.business-partners.customer-lifecycle`             |

Server-only inbound profile events and internal/external invitation endpoints are not browser-relayed by this change. They keep their existing trust-specific authentication boundaries.

## Contracts and policy artifacts

- `@athyper/contract-platform-entity-runtime` exports v1 case, evidence, experience-coordinate and notification-event types plus parsers.
- [Protected documents](protected-documents.md) defines classification floors and the production storage checklist.
- [Notifications](notifications.md) defines recipient hints, delivery class, channels, templates and deep links.
- The Phase 0 decision records external applicant isolation and assigns all named threat-model actions in the governance baseline.

## Threat-model ownership

| Action                                                           | Accountable owner         | Evidence target                          |
| ---------------------------------------------------------------- | ------------------------- | ---------------------------------------- |
| Cross-invitation, tenant and terminal-state isolation            | IAM and Security          | Phase 1 authorization tests              |
| Protected uploads, malware failure and signed-download replay    | Document Platform and SRE | Phase 2 target-environment qualification |
| Stored XSS and template escaping for applicant-controlled labels | Frontend Security         | Phase 1 contract/component tests         |
| Purpose-bound reveal, recent elevation and audit completeness    | IAM and NEON Master Data  | Phase 2 security tests                   |
| Proposal-only cross-plane movement and no recipient direct write | MESH and NEON             | Phase 3 integration tests                |
| Prompt/indirect tool injection from evidence and Atlas sources   | Atlas AI Security         | Phase 4 evaluations and abuse tests      |

These are accountable role owners, not evidence of completion. A release gate may close an action only with the named retained test or environment artifact.

## Release status

Repository contracts and local implementation are substantial. The read-only release qualification report is currently `blocked`: required rollout/qualification runbooks and seven environment evidence records are absent. Therefore the capability is not production-qualified. Phase 0 policy and compile results must not be presented as target-environment release evidence.
