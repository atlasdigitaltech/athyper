# Business Partner qualification — decision sheet

> **Historical.** Written before commit `870f08f52` removed the bespoke Business Partner and workforce applications. Routes, packages and files named here may no longer exist, and de-linked paths were dead when this was cleaned up. New entity work goes through the shared Entity Framework ([onboarding guide](../../runbooks/meta-entity-onboarding.md)); do not treat this as current instruction.

Status: **Unsigned — NOT LOCKED**. Concise business review/signature artifact for [revision 11 business design, editorial control 11a](business-partner-qualification-business-design-and-plan.md#19-design-lock-decisions). Layout is print-friendly; physical page count depends on print settings. The full design controls if a summary is ambiguous; resolve ambiguity before signing.

Baseline reference (commit plus artifact hash for uncommitted content): _______  Sheet version: _______  Review date: _______

Before signing, verify that the recorded baseline reference identifies the reviewed business-design **revision 11 / editorial control 11a** and that this sheet matches it; if either document has been superseded, reconcile the references and review the changes before signing.

## Decisions in plain language

| ID | Proposed default to approve |
| --- | --- |
| L01 | Keep qualification decisions independent; link prerequisites explicitly, never inherit approval. |
| L02 | General clearance satisfies prerequisites only; it cannot authorize transactions. |
| L03 | Meet every required requirement; valid alternatives are allowed, mandatory conditions bind, and restrictions win. |
| L04 | Declare when continuing dependencies are rechecked and what a failure does. |
| L05 | Pin approved company/category membership; later additions need review. |
| L06 | Use exclusive end dates and both business/execution clocks; backdating cannot bypass current holds. |
| L07 | Stop new commitments at expiry; separately govern settlement and any independently approved payment exception. |
| L08 | Recommend and review shortlists; automatic invitations need explicit policy and a fresh check. |
| L09 | Keep commercial setup separate from qualifications and restrictions. |
| L10 | Require a verified contract/limit owner; defer unsupported contract execution rather than invent balances. |
| L11 | Broader standing coverage needs a new reviewed decision, not an expanded contract approval. |
| L12 | Review incomplete conditional legacy records; never assume unconditional approval. |
| L13 | Review tenant cutover impacts; do not widen coverage just to preserve old matches. |
| L14 | Define overdue-review effects by policy; retain legacy blocking until an authorized change. |
| L15 | Apply customer qualification requirements where configured, independently of credit approval. |
| L16 | Missing grant scope grants nothing; preserve broad restrictions and fail closed on invalid restriction state. |
| L17 | Allow independent decision identities with the same purpose; detect overlap separately. |
| L18 | Govern immutable policy versions and tenant activation; an editor is not a substitute for approval. |
| L19 | Configure each action's authority explicitly; transition expiry blocks until authorized recovery. |
| L20 | Require reviewer acknowledgement of material overlap, including concurrent approvals and amendments. |
| L21 | Authorize restrictions by breadth, action and reason; use explicit scope/target and positive groups initially. |
| L22 | Use stable actions or pinned action classes; new actions need reviewed compatibility before activation. |
| L23 | Assess cumulative contract changes against the reviewed baseline; never duplicate contract balances. |
| L24 | People may hold multiple roles, but independence and specialist controls remain. Any single-operator alternative needs separate control-specific approval. |
| L25 | Use versioned presets and explicitly adopted signed bundles; they create ordinary governed records, not bypasses. |

Approval of L24 preserves existing separation controls; it does not itself authorize a single-operator exception. L25 approval does not adopt or activate any tenant bundle. Neither a signature nor an implemented read view grants transaction permission.

## Record the decision

L01–L23 may be approved as a listed set with explicit exceptions, but that batch is complete only when **every applicable required-approval row below** has its own named approver and date/signature reference. The Business sponsor / partner-governance row alone cannot approve Procurement, Finance / AP, Risk / compliance, Platform / security, or Data governance / audit decisions. L24 and L25 must each have their own disposition and signature reference; a blanket signature is insufficient. Use Approve / Amend / Defer and reference exact IDs and amendment text. Any amendment affecting a rule follows the design's reopening process before lock.

| Required approval | IDs | Disposition / amendment reference | Named approver | Date / signature reference |
| --- | --- | --- | --- | --- |
| Business sponsor / partner governance | L01–L23 | | | |
| Business sponsor / partner governance — individual review | L24 only | | | |
| Business sponsor / partner governance — individual review | L25 only | | | |
| Procurement | L07, L10, L23 and P3 | | | |
| Finance / AP | L07, L21 | | | |
| Risk / compliance | L04, L14, L24 | | | |
| Platform / security | L16, L18, L19, L25 | | | |
| Data governance / audit | L06, L13, L14 | | | |

Lock checklist: all decisions and required approvals recorded; named QP-00 owners have accepted their responsibilities (P2); launch-tenant bulk re-pin need resolved or rollout explicitly deferred (P3). Record evidence references: _______

Business-design §19.1 records the resulting lock and references these signatures. A01–A110 and LC01–LC09 remain separately attested business/engineering acceptance requirements in the [delivery record](business-partner-qualification-delivery-and-acceptance.md); this sheet does not certify their implementation. Missing signatures or prerequisites leave the design NOT LOCKED.
