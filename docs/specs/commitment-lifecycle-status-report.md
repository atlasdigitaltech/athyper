# Commitment Lifecycle Implementation Status Report

Date: 2026-07-13  
Assessment basis: Commitment Lifecycle Implementation Plan review draft and the
implemented WP1-WP9 Phase 0A purchase-order slice.

## Executive status

| Scope | Status | Disposition |
|---|---|---|
| Phase 0A PO implementation | Implemented | Application, workflow, lifecycle metadata, hooks, tests, and release evidence are present. |
| Phase 0A operational exit gate | Release-gated | Pending DDL/system seeds must be applied and strict assertions plus DB-backed draft-to-terminal scenarios must pass. |
| Phase 0 governance/design freeze | Partial | PO matrix and ownership cleanup exist; subtype and parent-child governance are incomplete. |
| Broader commitment architecture | Partial/future | Contract, framework, standing-order, subscription, lease, capacity, and aggregate-revision work is outside the completed PO slice. |

Phase 0A must not yet be marked operationally complete. The code-level slice is
implemented, but the target database has not passed the release activation gate.

## 1. Audit disposition

| Item | Status | Evidence / remaining work |
|---|---|---|
| Retain `cmt_no_self_parent` | Complete | The existing constraint remains in `01c_tables_commitment.sql`. |
| Add hierarchy cycle and subtype compatibility validation | Not complete | No explicit commitment hierarchy cycle detector or approved parent-child compatibility policy was found. |
| Retain non-negative release-allocation checks | Complete | Existing quantity and amount controls remain. |
| Add relational and capacity controls | Not complete | A complete capacity-event/capacity-consumption control model is not implemented in this slice. |
| Preserve core PO authoring snapshot graph | Complete | PO snapshots cover header, lines, pricing components, accounting distributions, and current schedules. |
| Extend snapshots to revisions, terms, allocations, obligations, and financial references | Partial | Identity and material-transition coverage were extended; the complete commercial graph extension remains future work. |
| Consistent commercial aggregate revision | Not complete | Header `previous_version_id` remains; full aggregate supersession/revision is not implemented. |
| Generate measurable PO transition/test matrix | Complete | The executable 23-row PO contract and focused integration matrix now exist. |

## 2. Approved architecture direction

| Principle | Status | Notes |
|---|---|---|
| `document.commitment` remains aggregate root | Complete | PO remains a public facade over the physical commitment aggregate. |
| Public PO authorization/UI/history/operations remain distinct | Complete for PO | PO permissions, operations, action rules, activity identity, and outbox identity are public-entity aware. |
| Lifecycle selected by subtype and versioned profile | Partial | PO uses the active commitment lifecycle and carries `po.standard` profile identity, but a general persisted versioned-profile resolver is not complete. |
| Approved commercial data is superseded, not overwritten | Partial | Snapshot and child-current-row policies exist; full aggregate commercial revision is not complete. |
| Releases pin an exact approved parent revision | Not complete | Planned for contract/framework phases. |
| Capacity uses append-only history | Not complete | Planned for framework/standing-order phases. |
| Snapshots preserve approved basis without unlimited ledger history | Complete for PO core | Current authoring graph and material lifecycle evidence are captured; broader subtype children remain future work. |
| Unsupported commitment subtypes remain operationally disabled | Partial/unverified | PO is the only completed subtype, but an explicit enforced subtype enablement matrix still needs to be frozen and asserted. |

## 3. Mandatory identity model

| Consumer | Status | Current result |
|---|---|---|
| Permissions and UI | Complete for PO | Uses `public_entity_type=purchase_order`. |
| Accounting and fulfillment | Complete for PO | Uses physical commitment ID and aggregate services. |
| Activity events | Complete for PO transitions | Carries public entity, aggregate root, subtype, aggregate ID, and profile identity in detail. |
| Snapshots | Complete for PO transitions | `related.lifecycle_identity` preserves both public and aggregate identities plus profile. |
| Transactional outbox | Complete for PO transitions | Emits subtype-aware PO events with commitment correlation. |
| Hooks | Partial | Hook payloads preserve public source identity and aggregate-aware effects, but the generic hook execution schema does not yet persist all five identity fields as first-class columns. |
| Lifecycle instances and every operation record | Partial | Runtime correlation exists; universal first-class identity persistence across all lifecycle/operation records remains broader architecture work. |
| Idempotency | Complete for implemented PO effects | Tenant, source/aggregate ID, transition, operation/hook action, and execution token participate in retry protection. |

## 4. Phase 0 governance and design freeze

### 4.1 Supported subtype matrix

| Subtype | Status |
|---|---|
| Purchase order | Implemented; release-gated |
| Contract | Not enabled; Phase 6 work not implemented |
| Framework agreement | Not enabled; Phase 6 work not implemented |
| Standing order | Not enabled; Phase 6 work not implemented |
| Subscription | Not enabled; Phase 8 work not implemented |
| Lease | Not enabled; Phase 8 work not implemented |
| Grant award | Vocabulary only |
| Internal order | Vocabulary only |

An explicit, enforced subtype enablement/profile matrix remains required before
Phase 0 governance can be marked complete.

### 4.2 Parent-child policy

Status: not complete.

The recommended contract/framework/standing-order to PO relationship matrix has
not yet been implemented as an authoritative policy contract with cycle,
compatibility, and revision-pinning validation. The existing self-parent check is
necessary but not sufficient.

### 4.3 Ownership documents

| Document/control | Status |
|---|---|
| Executable PO lifecycle matrix | Complete |
| Unified-child lifecycle plan | Present |
| Generated purchase-order wiring report | Present |
| One authoritative PO action-rule seed | Complete; duplicate PO rules were removed from `072p` |
| Umbrella commitment lifecycle plan | Not found as a dedicated authoritative repository document |

## 5. Phase 0A purchase-order lifecycle

### 5.1 State model

All requested PO states and routes are represented in the executable contract:

- Canonical: `draft -> pending_approval -> approved -> active -> partially_fulfilled -> fully_fulfilled -> closed`.
- Alternate: cancel, reject/revise, return/withdraw, hold/release, short close,
  and policy-controlled expiry.
- Hold release restores the recorded prior executable state.
- Fulfillment state is derived from posted GR/SES ledger evidence and reversals.

Status: implemented; database activation pending.

### 5.2 Required PO operations

| Requirement | Status | Result |
|---|---|---|
| Submit validation | Complete | Shared authoritative header/line/schedule/currency preflight. |
| Start and correlate workflow | Complete | Workflow request creation and PO state update share one transaction. |
| Approve/reject/return/withdraw | Complete | Work-item authorization and self-approval guard apply; return restores draft; withdraw closes pending tasks. |
| `approved -> active` through `place_order` | Complete | Canonical `PO.PLACE_ORDER` transition, permission, operation, and action rule. |
| Budget and encumbrance effects | Complete in code | Approval hook materializes schedules and commits budget; terminal hooks release remaining budget. |
| Restore previous hold state | Complete | Prior state is persisted in PO metadata and restored exactly. |
| Goods receipt/service acceptance fulfillment | Complete in code | Posted GR/SES fulfillment ledger drives physical PO state. |
| Invoice reconciliation is not fulfillment | Complete | Invoice posting rebuilds only `invoiced_amount`. |
| Receipt/service reversals | Complete in code | Reversal ledger rows recalculate fulfillment and can move the PO backward safely. |
| Short close | Complete | Closes remaining lines/schedules and releases financial commitment. |
| Cancel and expiry effects | Complete | Activity-aware validation, child retirement, snapshots/outbox, and budget release are wired. |
| Closure eligibility | Complete | Normal close requires fully fulfilled state and amount completeness. |
| Material-transition snapshot decisions | Complete in seed/code | Includes submit, approval, placement, rework, terminal routes, and derived fulfillment/reversal snapshots. |
| Hook identity propagation | Complete for PO outputs; partial universally | PO activity, snapshot, and outbox payloads carry mandatory identities. Universal schema normalization is future work. |
| Complete PO integration suite | Partial/release-gated | Code-level PO tests pass; DB-backed scenarios against newly applied seeds remain required. |

### 5.3 Exit gate

| Exit criterion | Implementation status | Release verification |
|---|---|---|
| One active operation | Implemented | Strict seed assertion pending execution after seed apply. |
| One permission | Implemented | Strict seed assertion pending execution. |
| One handler | Implemented | Code/typecheck verified; DB metadata verification pending. |
| Validation policy | Implemented | Focused policy tests pass. |
| Workflow behavior | Implemented | Workflow suite passes, including return outcome. |
| Business effects | Implemented | DB-backed budget/fulfillment scenarios pending. |
| Activity event | Implemented | Transaction-hook assertion pending. |
| Snapshot decision | Implemented | Material snapshot assertion pending. |
| Transactional outbox event | Implemented | Hook assertion and worker delivery verification pending. |
| Hook action registration | Implemented | Strict DB assertion pending. |
| Integration test | Code-level complete | Full DB-backed draft-to-terminal matrix pending. |
| No active equivalent transition on retired lifecycle | Seeded/asserted | Must be verified after seed activation. |

## Verification evidence

- Purchase-order focused tests: 15 passed.
- Workflow suite: 80 passed, 2 intentionally skipped.
- Business, workflow, records, and runtime-server typechecks: passed.
- Database discovery: 867 SQL files discovered successfully.
- Database status at assessment time: 26 pending and 9 changed scripts.
- Pending/changed database scripts were not applied because the shared database
  and worktree also contain unrelated changes.

## Completion decision

The WP1-WP9 Phase 0A implementation can be reported as code complete.

Do not report the overall Commitment Lifecycle plan as complete: hierarchy
governance, subtype enablement profiles, commercial aggregate revision,
revision-pinned releases, and capacity controls remain outstanding.

Do not mark Phase 0A operationally complete until an isolated target database
passes seed activation, strict seed assertions, the full DB-backed PO lifecycle
matrix, hook retry/idempotency checks, and outbox delivery verification.
