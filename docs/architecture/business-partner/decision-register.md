# Decision register

Status: Phase 0 architecture decisions accepted; product-scope decisions remain open

## 1. Accepted architectural direction

| ID | Decision | Rationale |
| --- | --- | --- |
| BP-D001 | Use one governed lifecycle presented through bounded plane experiences. | Avoids a new cross-plane application and duplicate authority. |
| BP-D002 | Studio, MESH and NEON are the three authoritative planes. | IAM, storage, notifications and Atlas have narrower platform authority. |
| BP-D003 | Business Partner represents an organization; Supplier and Customer are thin roles. | Prevents identity duplication and supports dual-role organizations. |
| BP-D004 | A supplier-provided worker is a Person/External Worker, not a Business Partner. | Keeps organization, natural-person and engagement authorities separate. |
| BP-D005 | Cross-plane input is a proposal until accepted by the receiving authority. | Prevents direct writes and preserves local policy. |
| BP-D006 | AI may explain, extract and draft; it cannot own state or bypass a governed command. | Preserves human accountability and deterministic enforcement. |
| BP-D007 | Extend the existing Atlas workspace. | Avoids split conversations, proposals and confirmation behavior. |
| BP-D008 | Extract generic frontend workflow components only after a real slice proves their contract. | Avoids a premature cross-plane shared package. |
| BP-D009 | Release claims require target-environment evidence and runbooks. | Local tests alone do not prove production qualification. |
| BP-D010 | Approve the three-plane authority model and proposal-only cross-plane boundary. | Preserves exact-plane ownership and governed commands. |
| BP-D011 | Use a separate invitation-bound external applicant trust path. | Prevents workforce-shell, cross-case and cross-tenant authority leakage. |
| BP-D012 | Contract Platform owns generic workflow contracts; UI Platform owns generic workflow UI, both at a 0/0 runtime/workspace dependency budget. | Keeps contracts dependency-free and prevents premature framework growth. |
| BP-D013 | Adopt protected-document classification floors and target-environment storage qualification. | Code-level storage adapters do not prove protected-data controls. |
| BP-D014 | Route reference-only domain events through the Communications planner and versioned templates. | Delivery cannot own workflow state or leak protected payloads. |
| BP-D015 | Report implementation and production qualification separately. | The current environment evidence is blocked, irrespective of local coverage. |

## 2. Decisions required

| ID | Required decision | Accountable group | Blocks |
| --- | --- | --- | --- |
| BP-Q001 | Confirm the first releasable scope: internal Supplier, invited Supplier, or both. | Product and architecture | Build-plan critical path |
| BP-Q002 | Approve the Customer state semantics and complete UI/direct test coverage for deactivate and archive. All five backend actions are verified as implemented. | NEON Master Data | Customer acceptance plan |
| BP-Q003 | Approve the Supplier state machine, including deactivate/archive semantics. | Supplier operations and NEON | Supplier lifecycle |
| BP-Q004 | Approve the supplier Workforce commercial model: requisition, work order/SOW, engagement and placement boundaries. | Workforce, Procurement and Legal | Workforce scope |
| BP-Q006 | Approve candidate disclosure purposes, consent, retention, residency and revocation rules. | Privacy, Legal and Workforce | MESH candidate exchange |
| BP-Q007 | Approve matching thresholds, golden corpus and false-merge tolerance. | Data governance | Identity resolution |
| BP-Q011 | Assign owners and dates for production runbooks and environment evidence. | Release owner and SRE | Production qualification |
| BP-Q012 | Decide whether internal employee onboarding remains outside this program. | Workforce product | Program boundary |

## 3. Source inconsistencies to resolve

| ID | Inconsistency | Required resolution |
| --- | --- | --- |
| BP-I001 | The scratchpad blueprint and delivery plan describe a complete five-action Customer lifecycle; the status sheet says only three actions exist. | Inspect commands and live tests; update all status and acceptance claims. |
| BP-I002 | The scratchpad process table labels self-registration as Scenario 2 while its scenario catalogue labels it Scenario 3. | Use the stable IDs in `acceptance-scenarios.md`; retire positional references. |
| BP-I003 | Scratchpad files describe backend G1-G5 with an unqualified release claim while repository audit evidence says production qualification is blocked. | Use `implemented`, `integration-tested` and `production-qualified` as distinct statuses. |
| BP-I004 | The repository audit calls the first releasable slice invitation-backed, while its first engineering phase proves an internal requester flow. | Describe the internal flow as the first engineering slice and the invited flow as the first external release, if approved. |
| BP-I005 | “Workforce requester” can be mistaken for a supplier-provided worker. | Use explicit persona names throughout the product and backlog. |
| BP-I006 | The scratchpad proposes a shared Business Partner kit; the repository audit rejects plane-to-plane sharing in that form. | Prove domain-neutral contracts in NEON, then place only generic pieces in the approved platform runtime. |
| BP-I007 | Scratchpad AI timing says recommendations 12 and 8 can start “now,” while the milestone plan schedules them later. | Separate technical enablement from production release and bind each to a named gate. |

### Build-plan resolution record

| ID | Status | Evidence-backed disposition |
| --- | --- | --- |
| BP-I001 | Resolved for implementation status | Contract, service, route and `control.command_customer_lifecycle` implement all five actions. UI and direct service tests cover only activate, suspend and reactivate; deactivate/archive remain delivery gaps. |
| BP-I002 | Resolved | Positional numbers are retired in favor of stable `BP-SUP-*`, `BP-CUS-*`, `BP-WRK-*` and `BP-X-*` IDs. |
| BP-I003 | Resolved | Phase 0 decision BP-D015 and the certification command separate local implementation from production qualification; certification currently remains blocked. |
| BP-I004 | Resolved for planning | `BP-SUP-001` is the first engineering slice. Invitation-backed Supplier onboarding remains the recommended first external release, pending BP-Q001 ratification. |
| BP-I005 | Resolved in documentation | Persona names now distinguish internal workforce requester, Supplier administrator/recruiter, candidate and external worker. |
| BP-I006 | Resolved | BP-D012 assigns generic contracts/UI to platform owners only after a real slice proves reuse; no Business Partner shared kit is introduced. |
| BP-I007 | Resolved for planning | WS10 begins with read-only Atlas enablement and requires a deterministic owner command plus evaluation gate before any proposal feature releases. |

### Proposed build-plan decisions awaiting accountable-owner ratification

| ID | Proposal | Rationale |
| --- | --- | --- |
| BP-P001 | Select `BP-SUP-001` as the first engineering vertical slice. | It has the strongest existing command/UI/test foundation and proves reusable native case contracts. |
| BP-P002 | Treat invitation-backed Supplier onboarding as the first external release after the internal slice. | It exercises IAM, evidence and external trust without placing those risks on the contract-foundation path. |
| BP-P003 | End the first slice at Supplier `onboarding` with explicit readiness, not automatic activation. | Qualification and activation are separate authorities covered by `BP-SUP-009`. |

## 4. Status vocabulary

All future status reporting must use the following independent fields rather than one ambiguous check mark:

| Field | Evidence required |
| --- | --- |
| Designed | Approved contract, authority and state model |
| DDL present | Migration exists and clean/upgrade application passes |
| Command present | Exact-plane command implements authorization, versioning, idempotency and evidence |
| API present | Registered/allowlisted route exposes the command or query |
| UI present | Real API integrated with required states and accessibility |
| Integration-tested | Database/service test proves command and failure branches |
| E2E-tested | Named journey runs through UI against production-like dependencies |
| Production-qualified | Target environment, runbooks, observability, rollback and retained evidence pass |

## 5. Change control

Decision IDs are stable. An approved decision is changed only through an ADR or a recorded amendment referencing affected journeys and acceptance scenarios. A repository implementation observation is dated evidence, not a permanent architectural decision.
