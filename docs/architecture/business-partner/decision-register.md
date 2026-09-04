# Decision register

Status: review required before build planning

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

## 2. Decisions required

| ID | Required decision | Accountable group | Blocks |
| --- | --- | --- | --- |
| BP-Q001 | Confirm the first releasable scope: internal Supplier, invited Supplier, or both. | Product and architecture | Build-plan critical path |
| BP-Q002 | Approve the Customer state machine and verify whether all five lifecycle commands exist. | NEON Master Data | Customer acceptance plan |
| BP-Q003 | Approve the Supplier state machine, including deactivate/archive semantics. | Supplier operations and NEON | Supplier lifecycle |
| BP-Q004 | Approve the supplier Workforce commercial model: requisition, work order/SOW, engagement and placement boundaries. | Workforce, Procurement and Legal | Workforce scope |
| BP-Q005 | Approve separate restricted trust paths for organization applicants and candidates/workers. | IAM, Security and Privacy | External experiences |
| BP-Q006 | Approve candidate disclosure purposes, consent, retention, residency and revocation rules. | Privacy, Legal and Workforce | MESH candidate exchange |
| BP-Q007 | Approve matching thresholds, golden corpus and false-merge tolerance. | Data governance | Identity resolution |
| BP-Q008 | Approve protected evidence classes and storage qualification requirements. | Security, Privacy and Document platform | Evidence pilot |
| BP-Q009 | Decide the owner of proven generic case/evidence UI contracts. | Frontend architecture | Component extraction |
| BP-Q010 | Choose mandatory versus preference-aware notification events and MVP channels. | Product and Communications | Journey completion |
| BP-Q011 | Assign owners and dates for production runbooks and environment evidence. | Release owner and SRE | Production qualification |
| BP-Q012 | Decide whether internal employee onboarding remains outside this program. | Workforce product | Program boundary |

## 3. Source inconsistencies to resolve

| ID | Inconsistency | Required resolution |
| --- | --- | --- |
| BP-I001 | The scratchpad blueprint and delivery plan describe a complete five-action Customer lifecycle; the status sheet says only three actions exist. | Inspect commands and live tests; update all status and acceptance claims. |
| BP-I002 | The scratchpad process table labels self-registration as Scenario 2 while its scenario catalogue labels it Scenario 3. | Use the stable IDs in `acceptance-scenarios.md`; retire positional references. |
| BP-I003 | Scratchpad files describe backend G1-G5 as certified while repository audit evidence says production certification is blocked. | Use `implemented`, `integration-tested` and `production-qualified` as distinct statuses. |
| BP-I004 | The repository audit calls the first releasable slice invitation-backed, while its first engineering phase proves an internal requester flow. | Describe the internal flow as the first engineering slice and the invited flow as the first external release, if approved. |
| BP-I005 | “Workforce requester” can be mistaken for a supplier-provided worker. | Use explicit persona names throughout the product and backlog. |
| BP-I006 | The scratchpad proposes a shared Business Partner kit; the repository audit rejects plane-to-plane sharing in that form. | Prove domain-neutral contracts in NEON, then place only generic pieces in the approved platform runtime. |
| BP-I007 | Scratchpad AI timing says recommendations 12 and 8 can start “now,” while the milestone plan schedules them later. | Separate technical enablement from production release and bind each to a named gate. |

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

