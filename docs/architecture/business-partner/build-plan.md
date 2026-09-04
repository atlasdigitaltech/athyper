# Business Partner evidence-backed build plan

Status: proposed execution baseline

Inputs: [implementation status](implementation-status.md), [acceptance scenarios](acceptance-scenarios.md), [decision register](decision-register.md), and the accepted Phase 0 ADR

## 1. Delivery decision

Use `BP-SUP-001`—internal Supplier onboarding for a new organization—as the first engineering vertical slice.

This does not change the product recommendation that invitation-backed Supplier onboarding is the first meaningful external release. The internal slice is first because the repository already contains its governed command path, UI entry points and integration tests. Completing it proves the native contracts and test harness needed by the external applicant, Customer and Workforce journeys without weakening their boundaries.

The first slice ends with a materialized Business Partner and Supplier in `onboarding`, plus explicit readiness. Qualification and activation remain a later Supplier-controls slice (`BP-SUP-009`).

## 2. Planning assumptions

- One cross-functional squad owns the first slice: frontend, NEON service, database/test and UX/accessibility skills.
- IAM, Document Platform and Communications provide named reviewers/adapters rather than a second write path.
- Existing DDL and governed commands are frozen unless a failing acceptance test proves a defect.
- Work is sliced by acceptance outcome, not frontend/backend phase.
- A story is complete only with positive and negative automated evidence.
- Production qualification is a separate release activity and remains blocked until its runbooks and environment evidence exist.

Sizing is relative and must be converted to calendar estimates only after owner/capacity assignment:

- S: one bounded change with existing contract and tests;
- M: several coordinated changes within one authority/package family;
- L: cross-package or cross-plane slice with new fixtures and operational behavior;
- XL: multi-authority program requiring product/security decisions.

## 3. Workstreams

| WS | Workstream | Size | Depends on | Primary outcome |
| --- | --- | --- | --- | --- |
| WS0 | Baseline, contracts and policy | Complete locally | — | Accepted authority/trust boundary and drift gate |
| WS1 | Native governed case vertical | L | WS0 | First complete create → validate → submit → decide → materialize UI journey |
| WS2 | Journey, task and decision experience | L | WS1 contract | Reusable task inbox/timeline and maker-checker workspace |
| WS3 | Evidence and restricted applicant | L | WS1, IAM/Document review | Invitation-bound Supplier/Customer applicant journey |
| WS4 | Supplier controls and lifecycle | L | WS1, WS2 | Qualification, bank, readiness, activation and ongoing controls |
| WS5 | MESH relationship and exchange | XL | WS1, WS2 | Relationship, disclosure, receive/quarantine, link and acknowledgement UI |
| WS6 | Customer controls and lifecycle | L | WS1, WS2 | Complete Customer credit/designation/readiness and five actions |
| WS7 | Supplier-provided Workforce | XL | WS3, WS5, approved BP-Q004/BP-Q006 | Requisition → candidate → engagement → placement → IAM/offboarding |
| WS8 | Studio authoring and simulation | XL | WS1 contract, WS2 model | Definition/rule/journey/release authoring and compatibility simulation |
| WS9 | Proof, operations and qualification | L | Begins with WS1; closes each release | Snapshot/lineage/ops views, runbooks and retained environment evidence |
| WS10 | Atlas Business Partner automation | XL | Deterministic owner command + eval set per feature | Read-only first, then governed proposals without new authority |

WS2, WS3 and the first WS6 gaps can overlap after WS1 freezes the native case view/action contracts. WS7 remains outside the critical path until its commercial and privacy decisions are approved.

## 4. Scenario-to-workstream mapping

### 4.1 Supplier

| Scenario | Primary WS | Supporting WS | Current gap that makes it not green |
| --- | --- | --- | --- |
| BP-SUP-001 | WS1 | WS2, WS9 | Compatibility client, prompt/navigation debt, no complete UI E2E |
| BP-SUP-002 | WS1 | WS2, WS4 | No dedicated existing-BP Supplier fixture/E2E |
| BP-SUP-003 | WS1 | WS6 | Dual-role backend proof exists; no full UI journey |
| BP-SUP-004 | WS5 | WS3, WS4 | Relationship/detail/disclosure/link workspaces missing |
| BP-SUP-005 | WS5 | WS3 | Network identity/relationship UI missing |
| BP-SUP-006 | WS3 | WS1, WS9 | Restricted applicant API boundary exists; applicant surface absent |
| BP-SUP-007 | WS3 | WS5 | Self-registration policy UI and branch evidence absent |
| BP-SUP-008 | WS4 | WS5, WS10 | Scored attributable matching and merge workspace absent |
| BP-SUP-009 | WS4 | WS2, WS9 | Decision workspaces and actionable readiness incomplete |
| BP-SUP-010 | WS4 | WS5, WS9 | Product transition semantics, continuous cases and lifecycle UI incomplete |

### 4.2 Customer

| Scenario | Primary WS | Supporting WS | Current gap that makes it not green |
| --- | --- | --- | --- |
| BP-CUS-001 | WS6 | WS1, WS2 | Current E2E proves form presence, not complete materialization |
| BP-CUS-002 | WS6 | WS1, WS2 | Backend add-role proof exists; UI E2E absent |
| BP-CUS-003 | WS6 | WS1 | Dual-role unit proof exists; complete UI journey absent |
| BP-CUS-004 | WS6 | WS2, WS9 | Credit UI lacks full conditions/scope and negative E2E |
| BP-CUS-005 | WS6 | WS2 | Dedicated designation/scope decision workspace absent |
| BP-CUS-006 | WS6 | WS2, WS10 | Readiness exists; action guidance and complete E2E absent |
| BP-CUS-007 | WS6 | WS9 | Backend has five actions; UI/direct tests cover only three |
| BP-CUS-008 | WS6 | WS9 | Change/history/reconciliation UI and E2E absent |

### 4.3 Supplier-provided Workforce

| Scenario | Primary WS | Supporting WS | Current gap that makes it not green |
| --- | --- | --- | --- |
| BP-WRK-001 | WS7 | WS5, WS2 | DDL exists; product command/API/UI absent |
| BP-WRK-002 | WS7 | WS5, WS3 | Candidate-specific disclosure/receive service and UI absent |
| BP-WRK-003 | WS7 | WS3, WS9 | Candidate trust path decision and surface absent |
| BP-WRK-004 | WS7 | WS2, WS10 | Evaluation/selection command and workspace absent |
| BP-WRK-005 | WS7 | WS2 | Work order/SOW lifecycle service and acceptance UI absent |
| BP-WRK-006 | WS7 | WS2, WS9 | Person resolution/materialization journey incomplete |
| BP-WRK-007 | WS7 | WS9 | IAM backend subset is tested; placement/status UI absent |
| BP-WRK-008 | WS7 | WS9 | Effective amendment/transfer service and UI incomplete |
| BP-WRK-009 | WS7 | WS9, WS10 | Triggered compliance case and scoped reactivation incomplete |
| BP-WRK-010 | WS7 | WS9 | End-to-end termination/deprovision/replay evidence absent |

### 4.4 Cross-cutting

| Scenario | Primary WS | Applied to |
| --- | --- | --- |
| BP-X-001 Exact replay | WS1 | Every mutation workstream |
| BP-X-002 Concurrent mutation | WS1 | Every editable/decision workstream |
| BP-X-003 Transaction rollback | WS1 | Every materialization/authority workstream |
| BP-X-004 Contract mismatch | WS5 | WS3, WS7, WS8 |
| BP-X-005 Tenant/plane/scope denial | WS0 | Every workstream |
| BP-X-006 Maker/checker | WS2 | WS1, WS4, WS6, WS7, WS8 |
| BP-X-007 Sensitive reveal | WS3 | WS4, WS6, WS7, WS9 |
| BP-X-008 Evidence lifecycle | WS3 | WS7, WS9 |
| BP-X-009 Historical proof | WS9 | All domain workstreams |
| BP-X-010 Notification reliability | WS9 | All domain workstreams |
| BP-X-011 Atlas safety | WS10 | Every Atlas-enabled surface |
| BP-X-012 Accessibility/responsive | WS9 | Every UI story continuously |
| BP-X-013 Operational recovery | WS9 | All released workstreams |
| BP-X-014 Clean/upgrade parity | WS9 | Every DDL-affecting release |

## 5. First vertical slice: BP-SUP-001

### 5.1 User outcome

An authorized internal requester creates a Supplier onboarding case for a new organization, completes and validates it, submits it, and observes its state. A different authorized approver reviews the pinned evidence and approves it. An authorized materializer applies the approved snapshot exactly once. The requester can open the resulting Business Partner/Supplier and see explicit readiness without gaining approval or activation authority.

### 5.2 In scope

- Existing NEON Supplier form, case list/detail/edit and Business Partner 360.
- Native `/api/neon/business-partner-cases` browser operations.
- `GovernedCaseViewV1` projection or an explicit versioned adapter to it.
- Existing fixed deterministic validation, with accurate release/version display.
- Current workflow task coordinates and maker/checker decision.
- Materialization result, snapshot and lineage summary.
- Reference-only submit/return/decision/materialization notifications.
- Loading, empty, validation, forbidden, stale, conflict, returned, rejected, failure and historical states.
- Keyboard, screen-reader, phone/desktop and 200% zoom behavior.
- Local integration and production-like E2E evidence.

### 5.3 Explicitly out of scope

- External invitation/applicant UI.
- MESH relationship or disclosure.
- Scored/AI duplicate resolution; retain truthful exact-match behavior.
- Qualification decision and Supplier activation.
- New DDL authority or a second workflow engine.
- Generic cross-plane UI extraction before this slice proves the contract.
- Atlas mutation proposals; read-only cited explanation may be included only if its existing contract is sufficient.

### 5.4 Backlog

| ID | Story | Size | Acceptance evidence |
| --- | --- | --- | --- |
| BP-V1-001 | Add native case operations and remove browser dependency on compatibility request paths for this journey. | M | Relay inventory, contract test and old/new response parity fixture |
| BP-V1-002 | Adapt server/client output to `GovernedCaseViewV1`, retaining exact definition, ownership, progress, actions and evidence summary. | M | Parser/producer compatibility and unknown-field/invalid-state tests |
| BP-V1-003 | Refactor the Supplier create/edit/detail surfaces around the governed view without creating a new shared package. | M | Component tests for all page states and no raw fetch/duplicate client |
| BP-V1-004 | Replace `window.prompt()` with an accessible decision dialog and `window.location.assign` with the approved router/navigation guard. | S | Focus trap/restore, cancel, reason validation and unsaved-change tests |
| BP-V1-005 | Make validation and duplicate behavior truthful and actionable. | M | Exact-match source displayed; blocking findings focus/link to permitted fields; no claim of scored matching |
| BP-V1-006 | Render current task owner/status/version and enforce maker/checker through server-denied tests. | M | Visible-then-denied, wrong owner, stale task and return/resubmit tests |
| BP-V1-007 | Show materialization result coordinates and bounded snapshot/lineage summary. | M | Exact replay returns same result; history is read-only and restricted fields omitted |
| BP-V1-008 | Route reference-only lifecycle notifications through the approved event/template matrix. | M | Deduplication, safe template data, failure/dead-letter tests |
| BP-V1-009 | Add a real two-actor E2E fixture and scenario test for the complete journey. | L | `BP-SUP-001`, BP-X-001/002/003/005/006/009/010/012 pass without optional skips |
| BP-V1-010 | Add slice telemetry and a qualification evidence manifest. | S | Latency/failure/stuck-case measurements and retained command/test metadata |

### 5.5 Recommended implementation order

1. Freeze the native producer/consumer contract with `BP-V1-001` and `BP-V1-002`.
2. Build the two-actor fixture and failing journey test in `BP-V1-009` before UI refactoring.
3. Complete form/case states and navigation in `BP-V1-003` and `BP-V1-004`.
4. Complete validation/task boundaries in `BP-V1-005` and `BP-V1-006`.
5. Add result proof and notifications in `BP-V1-007` and `BP-V1-008`.
6. Close accessibility, telemetry and retained evidence in `BP-V1-009` and `BP-V1-010`.

### 5.6 Entry gate

- WS0 policy, plane boundaries, contracts and relevant package tests pass.
- Product accepts internal Supplier as the engineering slice.
- A deterministic clean/upgrade database fixture can create requester, approver, materializer, organization/company scope and published definition.
- The exact match behavior and test organization identifiers are approved for non-production fixtures.

### 5.7 Exit gate

The slice is complete only when:

- the complete UI journey passes without an optional environment skip;
- requester, approver and materializer are distinct test principals;
- the case is pinned to a definition release and every mutation uses expected version/idempotency;
- stale, replay, return, reject, server denial and injected rollback branches pass;
- materialization creates one BP and one Supplier in onboarding and exposes stable result/lineage coordinates;
- readiness is explicit but cannot be overridden or activated through this slice;
- notifications are reference-only and deduplicated;
- WCAG 2.2 AA automated checks, manual keyboard path, 200% zoom and phone/desktop layouts pass;
- no active browser path for this journey uses the compatibility request route;
- local evidence is retained without being represented as production qualification.

## 6. Subsequent release slices

| Slice | Scenarios | Prerequisite | Exit outcome |
| --- | --- | --- | --- |
| R2 Existing/dual-role organization | BP-SUP-002, BP-SUP-003, BP-CUS-002, BP-CUS-003 | WS1 | Role extension reuses identity and preserves independent authorities |
| R3 Invited Supplier | BP-SUP-004, BP-SUP-006 | WS3 plus bounded WS5 path | External applicant completes a protected, proposal-only journey |
| R4 Supplier controls | BP-SUP-008, BP-SUP-009, BP-SUP-010 | WS2, WS4 | Qualification/bank/readiness/lifecycle become UI-drivable |
| R5 Customer complete | BP-CUS-001 through BP-CUS-008 | WS1, WS2, WS6 | Credit/designation/readiness and all five lifecycle actions are green |
| R6 MESH complete | BP-SUP-005, BP-SUP-007 and remaining exchange branches | WS5 | Account/relationship/disclosure/quarantine/link/ack flow is green |
| R7 Supplier Workforce | BP-WRK-001 through BP-WRK-010 | BP-Q004/BP-Q006, WS3, WS5, WS7 | Candidate through deprovisioning is green without crossing Person boundaries |
| R8 Studio/operations | Applicable BP-X scenarios | WS8, WS9 | Authoring/simulation, proof viewers, runbooks and qualification evidence close |
| R9 Atlas depth | BP-X-011 plus selected domain scenarios | WS10 and deterministic owner gates | Evaluated read/proposal automation ships without new authority |

## 7. Risks and controls

| Risk | Control |
| --- | --- |
| First slice grows into a workflow rewrite | Freeze commands/DDL; route and present existing authority only |
| Native and compatibility clients drift | Parity fixtures; one browser path; later retire compatibility with measured zero use |
| Generic UI extracted too early | Require one proven slice and a second plane consumer before extraction |
| Shallow E2E tests overstate readiness | Require mutation journey, distinct principals and non-skipped fixture |
| DDL existence overstates Workforce completeness | Report DDL, service, UI and E2E independently |
| Five Customer backend actions overstate delivery | Add UI and direct tests for deactivate/archive before BP-CUS-007 is green |
| MESH proposal presented as accepted authority | Negative direct-write and requested-capability tests in every exchange slice |
| Production status conflated with local green checks | Keep certification report blocking until target evidence and runbooks pass |

## 8. Build-plan readiness actions

Before converting relative sizes into sprint commitments:

1. Product ratifies `BP-SUP-001` as the first engineering slice and identifies the first external release.
2. Assign named accountable owners to WS1, test fixtures and production qualification.
3. Resolve Customer and Supplier state semantics (`BP-Q002`, `BP-Q003`).
4. Confirm supported upgrade baseline and database fixture strategy.
5. Set numeric latency, reliability, accessibility-environment and notification thresholds for the slice.
6. Decide where retained local qualification evidence is stored without committing environment secrets.
