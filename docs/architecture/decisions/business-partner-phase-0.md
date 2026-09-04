# Business Partner Phase 0 architecture baseline

Status: Accepted
Date: 2026-09-04
Decision owners: Architecture, IAM and Security, UI Platform, Document Platform, Communications Platform, Release Engineering

## Context

Business Partner already spans governed lifecycle commands, NEON operational data, MESH exchange, Studio definitions, IAM, document storage, notifications and Atlas. Phase 0 fixes the authority and trust boundaries before additional workflow surfaces are built. It does not authorize a new data plane, a second workflow engine or a direct browser-to-service transport.

## Decisions

### BP-D010 — authority model

Accepted. The three authoritative data planes remain:

- Studio: versioned definitions, release semantics and TrustIAM desired state;
- MESH: network account, relationship, disclosure and exchange authority;
- NEON: recipient-local Business Partner, supplier/customer roles, governed cases, decisions and operational materialization.

IAM owns authentication and verified session/context claims. The Document domain owns attachment metadata and links; Object Storage owns bytes. Communications owns routing and delivery, never workflow state. Atlas may read authorized snapshots and propose commands, never decide or mutate directly.

Cross-plane input is a signed/versioned proposal until the receiving plane independently authenticates, authorizes, validates and commits it. There are no cross-plane database writes or foreign keys. UI visibility, canonical-party correlation, delivery success and AI output confer no authority.

### BP-D011 — external applicant trust boundary

Accepted. An external applicant is an untrusted, invitation-bound principal outside the workforce shell boundary.

- The invitation is hashed at rest, expires, is limited-use and binds the tenant, journey, case, intended identity claims and permitted field/evidence set.
- Token possession is insufficient after acceptance. IAM establishes a least-privileged applicant session and the server rechecks invitation, principal, tenant, case, status and authorization epoch on every request.
- The applicant surface exposes only invitation purpose, permitted fields, evidence lifecycle, correction tasks and safe status. It never exposes internal navigation, queue names, comments, candidate matches, decision controls or another case.
- Tenant, principal, permissions hash and authorization epoch in the experience coordinate are server-derived or server-verified. Browser values are selectors, not claims.
- Cancellation, expiry, completion, rejection and support recovery revoke or rotate access and advance the authorization epoch. Recovery cannot transfer case authority without a recorded support command.
- Applicant uploads are hostile until size/type/hash verification and malware scanning complete. Extracted values and AI output remain proposals.
- Workforce, MESH partner-admin and candidate trust paths remain separate. An identity correlation does not merge their entitlements or sessions.

### BP-D012 — generic workflow UI ownership and dependency budget

Accepted. Contract Platform owns the domain-neutral wire contracts in `@athyper/contract-platform-entity-runtime`. UI Platform owns `@athyper/platform-entity-workflow-ui`. NEON, MESH and Studio retain their adapters, domain labels and commands.

Both packages begin with a runtime/workspace dependency budget of `0/0`. React remains a peer of the UI package and does not grant permission to add a runtime framework. A dependency-budget change requires an owner, justification and a reviewed governance update. Generic UI extraction begins only after one real vertical slice proves the contract and at least two plane adapters need the same behavior.

### BP-D013 — protected documents

Accepted. The common classification vocabulary is `public`, `internal`, `confidential` and `restricted`. Business Partner evidence defaults to `confidential`; bank proof, government identity, beneficial-ownership identity and authentication/security evidence are `restricted`. A definition may raise classification but cannot lower these floors.

Metadata and object bytes remain separate. Browser contracts never expose bucket, object key, provider ID or reusable URL. Download is a permission- and purpose-checked action producing a short-lived response. The target environment must pass the [protected-document qualification checklist](../business-partner/protected-documents.md) before protected uploads are enabled.

### BP-D014 — notifications

Accepted. Domain commands emit reference-only events after commit. Communications resolves recipients, preference rules, templates and authorized deep links at planning/delivery time. Templates may contain safe references and display labels, never tax, bank, identity-document, evidence content, tokens or internal decision commentary. The normative event matrix is [Business Partner notifications](../business-partner/notifications.md).

### BP-D015 — release status

Accepted. Release reporting uses `designed`, `implemented`, `integration-tested`, `E2E-tested` and `production-qualified` as separate evidence states. The current Business Partner capability is implemented in substantial part; production qualification is blocked by absent target-environment evidence and runbooks. Local coverage or a passing compile does not change that status.

## Consequences

- Phase 1 extends existing packages and the same-origin relay; it does not add a Business Partner shared kit or browser fetch wrapper.
- The typed case, evidence, context-coordinate and notification-event contracts are dependency-free and parser-backed.
- Existing frontend spine budgets are accepted at their current passing values. The two workflow packages are now explicitly budgeted.
- Six pre-existing Business Partner UI operation gaps are closed with named relay entries and retained in the Phase 0 inventory.
- Threat-model actions have accountable role owners; delivery phases must turn each action into retained evidence.

## Exit evidence

The machine-readable baseline is `governance/config/governance/business-partner-phase0.v1.json`. `pnpm policy:business-partner-phase0` verifies this decision, contract publication, package budgets, route/catalog inventory, named relay operations, threat ownership and release wording.
