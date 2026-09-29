# Architecture documentation

This directory contains durable architecture decisions, current architecture guidance, and active architecture-governance plans. Generated evidence and completed delivery records belong in Git history, not in the live architecture tree.

## Canonical decisions

- `decisions/governed-entity-lifecycle.md` — target lifecycle for Business Partner, supplier, customer and workforce changes across Studio, Governance, MESH, snapshots, workflow and NEON.
- Business Partner: the former `business-partner/README.md` summary was removed with the bespoke app (commit `870f08f52`). Business Partner now onboards through the shared Entity Framework; see the [onboarding guide](../runbooks/meta-entity-onboarding.md).

## Current guidance

- [Shared Application Experience — System Design](application-experience/system-design.md) — shared Neon, Mesh and Studio UI architecture, component inventory, entity reuse and package boundaries; local-build scope with future deployment work deferred.
- [Shared Application Experience — Build Work Plan](application-experience/build-work-plan.md) — ordered local build and repository cleanup tasks with focused checks; no production rollout or formal decision gates.
- [Record navigation and Summary View design](application-experience/record-navigation-and-summary-view-design.md) — proposed compiled-record navigation, URL state, optional layout views, and lazy summary-card contract.
- `system-architecture-overview.md` — engineer-facing system architecture: design principles, layer diagram, multi-tenancy (RLS) model, physical database architecture, infrastructure and Docker Compose service inventory.
- `frontend-first-business-module.md` — architectural boundary and readiness contract for the first frontend Business Partner module.
- [Entity authorization adoption](../runbooks/entity-authorization-adoption.md) — implemented contract foundation, inventory/dry-run commands, grant-review constraint and remaining activation gates.
- [Entity and record authorization](../contracts/entity-record-authorization.md) — proposed generic contract from application entry through record ownership, sections, fields and commands; includes migration and acceptance gates.
- [Business Partner authorization profile](../contracts/business-partner-authorization-profile.md) — proposed first use case of the generic contract, with ownership boundaries and adoption journeys.
- Task authority, approval rules and escalation — proposed implementation plan for to-do/review/approval scopes, edit and candidate-filter rules, correction, information requests, supervisor escalation and separate selective-reapproval extensions.

Generated inventories, test evidence, completion reports, and dated review narratives do not belong here. Versioned governance inventories and durable evidence belong under `governance/policy/reports/` when they must remain live; otherwise Git history is the archive.

## Complete index (added 2026-09-30)

Every remaining Markdown document, grouped by directory. Presence here does not make a document current; check its status label and date. Contrary to the note above, this tree also holds generated inventories and evidence that tooling reads (for example `generated/ddl-service-coverage.json` and the server route manifests); do not move those.

### `.`

- [athyper Robust Architecture](athyper-robust-architecture-whitepaper.md)
- [Atlas foundation F0 — reviewed baseline](atlas-foundation-f0-baseline.md)
- [Atlas Meta Entity learning foundation](atlas-meta-entity-learning-foundation.md)
- [Authorization v2 ownership, evaluation, and plane boundary ADR](authorization-v2-ownership-evaluation-and-plane-boundary-adr.md) — Accepted
- [Shared AI and URL classification repair](ci-ai-url-repair.md)
- [Wave 0 — CI verification integrity](ci-invariant-map.md) — implementation commit `de2762cb4f5201291138f771b4e8315b53cda23a` qualified locally and on GitHub for all mappe
- [Development URL catalogue — all applications and Runtime APIs](development-url-catalogue.md)
- [Shared entity form framework](entity-form-framework.md)
- [Shared entity intake](entity-intake.md)
- [Adding the first business module](frontend-first-business-module.md)
- [Local development architecture](local-development-plan.md)
- [Phase 1 — Package Ownership Matrix](package-ownership-matrix.md)
- [Metadata publication automation](publication-automation.md)
- [Server Platform Host legacy parity matrix](server-platform-host-parity-matrix.md)
- [Normalized Server Route Manifest](server-route-manifest.md)
- [athyper System Architecture Overview](system-architecture-overview.md)
- [Wave 1 local review](wave1-repository-drift-review.md) — implemented locally; uncommitted and pending combined candidate qualification. Base HEAD: `8cf6737d63b3e7744a6

### `application-experience`

- [Activity center — UX review and recommended build](application-experience/activity-center-ux-review.md)
- [Activity collections — Phase 1 backend usage](application-experience/activity-collections-phase1-api.md)
- [Activity collections — application integration](application-experience/activity-collections-phase2-usage.md)
- [Attachment discovery UI — 2026-09-22](application-experience/attachment-discovery-ui-20260922.md)
- [business-context-selector-design.md](application-experience/business-context-selector-design.md)
- [Business Partner capability replacement — implementation handover](application-experience/business-partner-capability-build-handover.md) — BP/profile ownership, current capability readers, document-reference cutover, project ownership, capability co
- [BP code cleanup — work package and file ledger](application-experience/business-partner-code-cleanup-work-package.md)
- [Business Partner collaboration release candidate](application-experience/business-partner-collaboration-release-candidate.md) — proposed source boundary, pending implementation completion and immutable freeze.
- [Business Partner coordinated implementation](application-experience/business-partner-coordinated-implementation.md) — in progress. **Main DEV was rebuilt from the cleaned DDL, reseeded and published on 2026-09-24.** Banking and 
- [Business Partner data model — finalized table set and cleanup addendum](application-experience/business-partner-data-model-cleanup-addendum.md) — locked target logical design for source-cleanup planning. Physical field contracts, dependency replacement and
- [Business Partner detail page — current source inventory](application-experience/business-partner-detail-file-inventory-current.md)
- [Business Partner detail page — source inventory](application-experience/business-partner-detail-file-inventory.md)
- [Business Partner facts — DDL and MetaEntity implementation plan](application-experience/business-partner-facts-ddl-metaentity-plan.md)
- [Business Partner identity — field and writer contract](application-experience/business-partner-identity-field-writer-contract.md) — organization/person identity DDL, category-safe readers and metadata are deployed to the same main DEV instanc
- [Business Partner integrated release readiness](application-experience/business-partner-integrated-release-readiness.md)
- [BP cleanup C02 — legacy-shell reachability](application-experience/business-partner-legacy-shell-reachability.md)
- [Business Partner Phase 2 — Neon relationship and reference expansion](application-experience/business-partner-phase-2-build-plan.md)
- [Business Partner qualification and operational eligibility](application-experience/business-partner-qualification-business-design-and-plan.md) — lock candidate. The lock scope, preconditions and approval record are in section 19.1. This document becomes *
- [Business Partner qualification — decision sheet](application-experience/business-partner-qualification-decision-sheet.md) — **Unsigned — NOT LOCKED**. Concise business review/signature artifact for [revision 11 business design, editor
- [Business Partner qualification — delivery and acceptance record](application-experience/business-partner-qualification-delivery-and-acceptance.md) — evolving delivery record, not business-design lock or implementation authorization. Extracted from business-de
- [Capability profiles and runtime controls — final design](application-experience/capability-profiles-and-runtime-controls-design.md) — implementation-ready specification following design/audit review; not shipped. This document
- [Comments and Files audit remediation](application-experience/collaboration-audit-remediation.md)
- [Collaboration file naming and code ownership](application-experience/collaboration-code-ownership.md)
- [Collaboration full-view cleanup plan](application-experience/collaboration-full-view-cleanup-plan.md) — implemented, 2026-09-22. Validation results are recorded below.
- [Collaboration panel UI — 2026-09-22](application-experience/collaboration-panel-ui-20260922.md)
- [DEVFULL BP publication preflight — 2026-09-21](application-experience/devfull-bp-publication-readiness.md) — **activation blocked by integration prerequisites**. No release, schema,
- [Record Activity API and UI](application-experience/entity-activity-api.md) — Phase 3 completed — authorized audit queries and snapshot listing/read/compare/manual capture implemented and 
- [Activity comparison — Delivery A implementation](application-experience/entity-activity-delivery-a.md) — implemented in the working tree, 2026-09-28. Browser fixtures and focused service tests verified; this is not 
- [Delivery B — related-section snapshots](application-experience/entity-activity-delivery-b.md) — **B1/B2, B3 consistent manual capture and B4 reusable collection UI implemented and fixture-tested.** Optional
- [Delivery C — Timeline and Audit log](application-experience/entity-activity-delivery-c.md) — implemented and locally validated; compatible DEV services restarted. Country successor is prepared, **not pub
- [Entity Activity: earlier-phase source inventory](application-experience/entity-activity-file-inventory.md)
- [Meta Entity Activity — implementation plan](application-experience/entity-activity-implementation-plan.md) — Delivery A/B/C reusable implementation and local validation complete. Compatible DEV services restarted. Count
- [Authoritative Versions and automatic capture](application-experience/entity-activity-recording.md) — root, owned aggregate/domain, and delete recording adapters implemented and verified, 2026-09-28. DEV schema/c
- [Activity UX: audit response and companion interaction specification](application-experience/entity-activity-ux-audit-review.md) — revised design proposal, 2026-09-28. Read with [Meta Entity requirements](application-experience/entity-activity-ux-requirements.md).
- [Meta Entity–driven Activity and snapshot comparison](application-experience/entity-activity-ux-requirements.md) — proposed requirements, refined on 2026-09-28 and supplemented by the [audit response and interaction specifica
- [Entity comments and attachments — metadata-controlled build plan](application-experience/entity-comments-and-attachments-build-plan.md)
- [CA-00 — comments and attachments baseline inventory](application-experience/entity-comments-and-attachments-ca00-inventory.md)
- [CA-01 / CA-02 implementation and local acceptance](application-experience/entity-comments-and-attachments-ca01-ca02-implementation.md)
- [CA-03 policy and authorization admission](application-experience/entity-comments-and-attachments-ca03-implementation.md)
- [CA-07 participant, history and draft-retention implementation](application-experience/entity-comments-and-attachments-ca07-implementation.md)
- [CA-09 local implementation and qualification — 2026-09-22](application-experience/entity-comments-and-attachments-ca09-qualification.md)
- [CA-10 local publication and signed-in acceptance](application-experience/entity-comments-and-attachments-ca10-local-acceptance.md)
- [Entity App comments and attachments design](application-experience/entity-comments-and-attachments-design.md) — design direction accepted on 2026-09-21; implementation remains planned. Revision 3 retains typed MetaEntity c
- [Entity notification channels — local development build plan](application-experience/entity-notification-channels-build-plan.md) — ready for local development implementation. Prepared 2026-09-23; revised for two phases: Studio backend only, 
- [Native entity onboarding boundaries](application-experience/entity-onboarding-boundaries.md) — Stage 3 implemented for the Country path, 2026-09-28. This is not a
- [Entity-driven record page: first implementation slice](application-experience/entity-record-first-slice.md)
- [Entity record route cleanup](application-experience/entity-record-route-cleanup.md)
- [Three-plane localization — guidance and deferred build plan](application-experience/localization-guidance-and-build-plan.md)
- [Metadata-driven Activity center — local build plan](application-experience/metadata-driven-activity-center-build-plan.md) — Phase 1 and Phase 2 implemented and locally verified. Studio collection-authoring frontend remains deferred. S
- [Notification configuration — Phase 1 backend](application-experience/notification-phase1-backend.md) — Phase 1 complete, including authenticated Studio → Neon verification on 2026-09-23. All three sample policies 
- [Phase 2 — Neon notification runtime and experience](application-experience/notification-phase2-neon.md)
- [Partner Access Model](application-experience/partner-access-model.md) — **Proposed model — evidence-gated; not locked or authorized for live grant changes.**
- [Partner Industries and Commodities — DEV acceptance](application-experience/partner-classification-collections.md)
- [Partner classifications and commercial decisions](application-experience/partner-classification-separation.md)
- [Role-free registration and direct UNSPSC — CATL DEV checkpoint](application-experience/partner-core-registration-and-unspsc.md)
- [Role-free partner section audit — 2026-09-24](application-experience/partner-role-free-section-audit.md)

### `application-experience/hr-people-management`

- [Wednesday customer demo — live internal pay cycle](application-experience/hr-people-management/customer-demo-pay-cycle-plan.md)
- [Employee personal information — screenshot-to-DDL review](application-experience/hr-people-management/employee-personal-information-ddl-review.md)
- [HR localization and local / foreign employees](application-experience/hr-people-management/hr-country-localization-and-foreign-employees.md)
- [Workforce implementation — Stage 1 Internal, Stage 2 External](application-experience/hr-people-management/hr-internal-external-implementation-plan.md)
- [HR data model: SAP, Oracle, Athyper and Frappe](application-experience/hr-people-management/hr-model-sap-oracle-athyper-frappe-comparison.md)
- [HR module delivery plan — Employee 360 through full People delivery](application-experience/hr-people-management/hr-module-delivery-plan.md)
- [HR policy DDL assessment](application-experience/hr-people-management/hr-policy-ddl-assessment.md)
- [HR People Management — later release readiness](application-experience/hr-people-management/hr-release-readiness-checklist.md)
- [Internal and External Workforce — SAP benchmark and table/field analysis](application-experience/hr-people-management/hr-workforce-table-field-analysis.md)
- [Stage 0 comprehensive foundation review](application-experience/hr-people-management/stage-0-comprehensive-review.md)
- [Stage 0 — Employee 360 readiness baseline](application-experience/hr-people-management/stage-0-employee-360-readiness.md) — **in progress**, reassessed 2026-09-22. The migration and initial fixtures are locally applied. The [comprehen
- [Stage 1 Employee directory and Employee 360 v1 — build note](application-experience/hr-people-management/stage-1-employee-360-build-note.md) — Employee 360 v1 is locally working on 2026-09-22. The Stage 1 contract and local completion checks are complet
- [Employee 360 post-v1 hardening — local build note](application-experience/hr-people-management/stage-1-employee-360-hardening-build-note.md)
- [Employee 360 profile and lifecycle follow-up](application-experience/hr-people-management/stage-1-employee-360-transaction-follow-up.md)
- [Stage 2 HR setup and User foundation — build status](application-experience/hr-people-management/stage-2-hr-setup-user-foundation-build-note.md)

### `application-experience/neon-business-partner-ddl-review`

- [BP2-02 and BP2-03 implementation record](application-experience/neon-business-partner-ddl-review/bp2-02-03-implementation.md)
- [BP2-09A — partner-level Banking implementation, 2026-09-23](application-experience/neon-business-partner-ddl-review/bp2-09a-implementation.md) — **complete for the recorded BP2-09A acceptance scope**. Release 19 remains active. BP2-09B is optional company
- [BP2 integration checkpoint — 2026-09-23](application-experience/neon-business-partner-ddl-review/bp2-integration-20260923.md)

### `decisions`

- [Entity authorization adoption decisions](decisions/entity-authorization-adoption.md) — implementation baseline; activation is gated by qualification evidence.
- [Governed case flow: cycles, workflows, communications, and generated documents](decisions/governed-case-communications-and-documents.md) — Current-source architecture review and proposed integration contract
- [MESH–NEON governed entity lifecycle architecture](decisions/governed-entity-lifecycle.md) — Canonical target architecture and migration contract
