# Business Partner qualification and operational eligibility

Status: lock candidate. The lock scope, preconditions and approval record are in section 19.1. This document becomes **Locked as business design** when that approval record is complete; until then it remains NOT LOCKED.

Review date: 2026-09-25. Scope of this revision: documentation only. No DDL, permissions, runtime behavior, metadata publication or DEV data changes are executed by this revision. The separately authorized initial read build is recorded in the linked delivery record; broader workflow/enforcement implementation remains subject to section 19.

Review revision 11 (2026-09-25): consolidates the agreed MetaEntity read-view design and lifecycle boundaries in §§6.1, 13.5 and 15.3. Partner capabilities replace separate supplier/customer identities in the target model; Preferred Partner remains an independent scoped designation. Future policy-triggered evidence reassessment is specified without claiming workflow implementation or blanket business-design sign-off. This revision supersedes conflicting descriptions of supplier/customer tables as permanent target authorities.

Review-window evidence: **pending**. Revisions 9 and 11 were both prepared on 2026-09-25. Before any lock signature, record the reviewers' baseline reference, the revision-9-to-11 change review, review date/window, and any disposition in the decision sheet or its cited evidence. Same-day editorial completion is not evidence that the required owners reviewed the final baseline.

Review revision 2: incorporated the follow-up source audit, including permissive legacy matching, narrowing-impact planning, directional restriction defaults and contract-owner go/no-go. Corrected the audit's risk-assessment fallback claim. Audit agreement is not business-owner sign-off; status remains NOT LOCKED.

Review revision 3: clarified independent identity, added governed action-requirement policy ownership, split requirement/command results, specified freshness and execution concurrency, corrected block-time handling, and expanded performance/replay acceptance. Approval to update this document is not business-design lock or authorization to implement it.

Review revision 4: sign-off candidate. Added explicit rollout authority/expiry, overlap acknowledgement, temporal pairings, disclosure permissions, retention, remediation and safe bulk disposition. Further refinements move to named QP-00 inputs unless evidence requires a material design change. NOT LOCKED: business approval of section 19 remains required.

Review revision 5: focused restriction-design extension requested after revision 4 closeout. Added target-bound obligation holds, governed actions, breadth-sensitive authority and migration/lineage acceptance. This supersedes revision 4 as the sign-off candidate; no DDL, grants or runtime behavior changed. Detailed design remains NOT LOCKED.

Review revision 6: corrected restriction/lineage ordering and transition enforcement; added reviewed contract-envelope materiality, aggregate prohibitions, resumption authority and target-closure disposition. Supersedes revision 5 as the sign-off candidate. Applying review recommendations is not design lock or runtime implementation authority.

Review revision 7: tenant-shape review. Added contextual deadline resolution, policy applicability/composition, governed profiles/bootstrap and scale discovery. Small tenants get simplified authoring, not implicit weaker controls. Single-operator approval and bulk widening remain explicitly gated proposals. This was the revision-7 NOT LOCKED sign-off candidate; retained as historical provenance.

Review revision 8: no design change. Added section 19.1 recording the lock scope, the preconditions to lock, and the approval record to be completed by the named business owners. Nothing in this revision alters a business rule, an acceptance scenario or a lock decision.

Review revision 9 (2026-09-25): refreshed the source baseline, corrected the DDL inventory, and defined the MetaEntity qualification/restriction view slice and acceptance cases. Existing storage and matching foundations are distinguished from remaining governance and enforcement work. Documentation only; no phase is certified complete and the business-design approval record remains open.

## Document control and audit disposition

Revision 11 is the final substantive business-design candidate unless a named material finding requires reopening. This editorial split is control revision 11a, not a new business-rule revision or a completed lock. Routine status updates, additional test evidence and stylistic improvements belong in the companion record, not another design round.

A reopening record must identify the finding ID, evidence, affected rule/decision IDs, named accountable owner, security/business impact, proposed disposition and required approvers. Reopen only affected rules. Unassigned or speculative suggestions remain a discovery backlog and cannot silently change the baseline. No material reopening is declared by this split.

| Artifact | Authority and change boundary |
| --- | --- |
| This business-design document | Normative business rules, lifecycle/UX contracts, L01–L25 and lock mechanics; source observations in §§3/22 are dated baseline evidence, not deployed truth. |
| [Decision sheet](business-partner-qualification-decision-sheet.md) | Concise business signature artifact; binds this exact baseline and decision IDs. It does not replace specialist approvals or engineering conformance. |
| [Delivery and acceptance record](business-partner-qualification-delivery-and-acceptance.md) | Implementation worklist, A01–A110/LC01–LC09, ownership assignments, dated DEV receipts and operational notes. Updates cannot relax business outcomes or confer implementation authority. |

Audit disposition: accept separation of delivery status, dedicated L24/L25 approval rows, named-material-finding reopening and live-catalog reconciliation. Retain normative §15 presentation/disclosure/receipt requirements here because moving those into an unrestricted status log would weaken the lock boundary. Move its transient §15.2 evidence and LC acceptance tracking, and §§17–18/20, to the companion. Historic revision notes below are provenance, not competing current status declarations.

## 1. Executive decision

Retain one reusable, role-independent Business Partner, with independent scoped qualification decisions. Connect decisions to sourcing and transactions through explicit operational policies. Do not implement an approval inheritance tree.

Support two execution paths:

1. Standing qualification for a defined role, organization/company, commodity and geography scope.
2. Contract-bound qualification supporting only the named contract and explicitly permitted downstream obligations.

Both paths may coexist. A tenant policy can require partner clearance before approving supplier qualification, but clearance does not create supplier approval. A supplier assignment does not create qualification. A commodity declaration or mapping does not create approval. A qualification does not grant the human user permission to execute a command.

Contract-bound execution is a confirmed business requirement in this proposal, but is a separately gated implementation phase, not part of a small metadata-only change.

## 2. Audit review and disposition

The two supplied audits are directionally strong. The following dispositions resolve their differences and avoid introducing new ambiguities.

| Audit point | Disposition and final recommendation |
| --- | --- |
| The tree implies inherited approval | Accept. Use independent decisions with labeled prerequisite/derivation relationships, never containment or implied grants. |
| Configurable prerequisites | Accept. Define review-only prerequisites separately from continuing dependencies. Prohibit cycles. |
| Prerequisites only checked at approval time | Amend. Correct for review-only evidence; unsafe for a continuing clearance, current restriction or mandatory risk dependency. Recheck continuing dependencies at the specified execution gates. |
| Restrictions win | Accept with qualification. An ordinary approval never overrides a matching restriction. Only a separately authorized exception can override a restriction explicitly marked exception-eligible; some restrictions are non-overridable. |
| Any matching approval grants | Amend. Any complete qualifying path can satisfy one policy requirement. All required requirement types must be satisfied; user authorization, setup, restrictions and transaction controls still apply. |
| Every matching decision's conditions accumulate | Amend. Conditions on selected supporting paths accumulate; mandatory context/policy obligations apply independently. Unrelated or redundant alternative approvals must not silently constrain every transaction. Context-wide conditions must be explicitly marked mandatory, not hidden on one optional decision. |
| Reject/suspend removes only its own coverage | Accept for independent qualification identities. Superseding/revoking the current revision must not resurrect an older revision. A rejection does not create a global ban; create an explicit restriction when required. |
| Partner-wide means due diligence only | Refine. Partner-wide is a scope dimension, not a decision purpose. For the proposed general-clearance type, direct execution uses are explicitly none; it only satisfies a prerequisite. Other types need explicit policy, not an inferred role restriction. |
| Contract limits belong outside qualification | Accept. Contract/procurement owns limits, reservations and consumption. Qualification references the authority; it must not duplicate balances. |
| Intersect all dates at business date | Amend. Intersect relevant coverage intervals for the requested action. Condition deadlines are predicates, not universally coverage windows. Historical coverage and current restrictions/authorization require separate time axes. Settlement is not governed blindly by the ordering cutoff. |
| DDL range check proves exclusive-end semantics | Refine. A greater-than range constraint alone does not prove endpoint semantics. The inspected reader's `effectiveUntil > businessDate` does establish exclusive-end behavior there; adopt it explicitly across the target. |
| Pin organization and category membership | Accept as initial default. No silent expansion from new hierarchy members or mappings. Intentional dynamic coverage is a future explicitly approved policy mode, not an implicit interpretation of All. |
| Add restrictions, reason codes and lineage | Accept. These are core functional deliverables, not optional presentation details. |
| Roles/setup outside Qualifications | Recommend accepting for navigation clarity. Shared workspace/navigation does not itself merge lifecycles, but a separate operational setup tab makes the distinction more visible. |
| Tenant-wide applicability defaults to no org/company | Refine. Tenant-wide overview and role-free admission may omit them. A PO release cannot be declared eligible without required company/line/context inputs; return CONTEXT_REQUIRED instead of treating missing inputs as wildcards. |
| Risk ranking can leak information | Accept. Use authorized, policy-approved recommendation signals; filter both reasons and ranking inputs, not just text. |
| Shell gate blocks all role-free journeys | Too broad. Current documentation records an exact registration-route exception; other target entry points need fresh browser acceptance. The cited section-audit document does not establish a universal shell failure. |
| Scope model is already done | Storage foundation exists, but full qualification evaluation is not done. See section 3. |

### 2.1 Examples resolving overlap

- A general clearance and a supplier capability approval satisfy different requirements. The first cannot replace the second.
- Two current independent IT capability decisions may be alternative evidence for the same requirement. The chosen valid path and its conditions are recorded.
- Insurance required for all work under C-014 is a contract-context obligation. Selecting a different qualification cannot bypass it.
- If the business intends every overlapping condition to bind, publish those conditions as mandatory scoped obligations. Do not derive this accidentally from every matching row.
- Revoking Q-003 removes Q-003 as a supporting path. It does not revoke independent Q-004 unless an explicit continuing dependency or restriction requires that effect.

## 3. Repository-grounded baseline

This is a dated source inspection of the dirty working tree, not a live deployment certification. Existing changes were preserved. Historical release evidence is not a fresh DEV verification. File line numbers are navigation hints only. QP-00 must reconcile source objects against the target database's `pg_catalog` and `pg_indexes` (including constraints, functions, triggers, RLS and grants), recording instance, timestamp and source/deployment revision before marking an existing authority confirmed.

| Capability | Observed source status | Planning consequence |
| --- | --- | --- |
| Qualification header | No `partner_role` or `role_id` columns; commercial capacity is a scope dimension. Context, conditions and `approved_snapshot_id` are present alongside the mutable decision row | Reuse role-independent storage; verify revision/snapshot guarantees and align remaining role-dependent command contracts. |
| Scope storage | Groups, include/exclude, typed coordinates, hierarchy version/fingerprint exist | Reuse the foundation; storage does not prove all semantics are enforced. |
| Qualification evaluator | `matchPartnerDecision` uses context matching, OR between groups, AND between dimensions and group exclusions; category/classification and country coordinates are supported | Verify pinned membership, hierarchy expansion and unsupported coordinates. The matcher does not evaluate row dates; current qualification/block scope constraints prohibit row dates, so any future per-row dating requires coordinated storage and matcher changes. |
| Missing company coordinates | Missing required dimensions or selected input coordinates produces `context_required`; explicit `selection_mode='all'` matches without a membership-set check | Preserve explicit missing-context handling; implement approved pinned-set semantics before claiming that All means a reviewed membership snapshot. |
| Supporting decision selection | Newest-first rows; first matching approved record with a snapshot reference, no conditions, valid dates and current review date is selected | Requirement-based alternative-path selection and immutable revision semantics remain work; current selection is not full policy composition. |
| Review due date | `nextReviewAt >= businessDate` is required for an active candidate; expiry processing also considers overdue review | Overdue review currently removes candidate coverage; it blocks qualification satisfaction if no alternative active candidate remains. Changing this requires explicit migration policy, not a silent warning-only default. |
| Failure-reason attribution | When no active supplier candidate exists, reason selection uses `qualifications[0]`, the newest returned row | Preserve legitimate blocking during migration, not potentially misleading newest-row attribution; explain the failed requirement and relevant evidence. |
| Block timing | Reader checks overlap against business-date midnight and next-day start; explicit named-timezone/execution-instant selection is absent in this query | Final-fractional-second truncation is removed. Implement the two-clock and timezone contract before certifying execution holds. |
| Role-free reader migration | Reader selects partner qualifications and derives optional commercial capacity from scopes; existing creation/execution paths still use role and operating-organization inputs | Storage/read progress does not complete general-clearance authoring or role-free admission. Test each contract separately. |
| Customer qualification | Missing active qualification blocks only inside `role === supplier`; customer credit/risk/setup checks remain separate | Customer qualification requirements are new enforcement where policy requires them. Include them explicitly in scope and tenant cutover acceptance; credit approval is not a substitute. |
| Risk reference selection | With a non-null selected qualification risk ID, SQL requires that exact approved assessment; with no selected risk ID, it selects an approved partner assessment ordered by version | No silent fallback for a non-approved referenced ID. Current ID selection is not immutable assessment-version pinning; target must distinguish explicit revision references from policy-selected baseline evidence. |
| Read projection | Qualification reader aggregates scope rows; adjacent preference/credit/designation projections still select single coordinates | Preserve structured qualification groups through the provider and metadata renderer; never infer broad coverage from a single summary coordinate. |
| Evaluation query | Requires supplier/customer role and operating organization; one optional commodity category | Role-free admission, tenant overview and line-level evaluation need explicit contracts. |
| Conditional decision | Conditions are stored as a JSON array; conditional or nonempty-condition candidates do not satisfy the current approval path and can produce `QUALIFICATION_CONDITIONS_REQUIRED` | Preserve conservative handling until validated condition schemas, satisfaction evidence and checkpoint evaluation exist. |
| Lifecycle | Pending can become approved/conditional/rejected/suspended; approved/conditional can become expired | Add proper suspension, revocation and revision effectiveness without overwriting decision outcome. |
| Blocks | Block has context, operation arrays, scope/target mode, target references, scope sealing, timing and lifting; matcher checks direct target equality | Reuse these foundations. Direct target matching does not prove downstream obligation-lineage enforcement or authorized exception support. |
| Preferred status | Supplier preference/customer designation already separate | Preserve ownership and approval separation. |
| Classification links | Decision scopes include `commodity_classification_id`; the previously cited qualification-classification link table is absent from inspected DDL | Crosswalk scope references and integrity guards before introducing another link resource; versioned evidence semantics still need verification. |
| Commands | Actor/tenant checks, idempotency, version checks and maker/checker in command exist | Preserve and extend; strengthen table constraint for `approved_by` defense in depth. |
| Evaluation persistence | Inspected ordinary resolve returns a fingerprint without persisting an evaluation there; activation stores readiness evidence | Add durable enforcement receipts. Do not confuse fingerprints with a complete audit trail. |
| Metadata | Existing section binds context/type/decision/dates/review and its registered provider returns only a qualifications collection | Add structured qualification details and a separately authorized restriction collection under the generic entity record runtime; see section 15.1. |
| Role-free shell | Exact core-registration route is documented as bypassing company selection | Test qualification/admission/list/detail separately without inventing company assignments. |
| Contract execution | Context and direct target fields exist, but do not establish contract lineage, reservation or limit enforcement | Discover and verify transaction-domain authorities before enabling contract-bound execution. |

Evidence locations, relative to this document:

- [Qualification and block tables](../../../server/db/ddl/planes/neon/control/03_tables.sql): qualification near line 208, blocks near 413, decision scopes near 2505.
- [Decision command](../../../server/db/ddl/planes/neon/control/07_functions.sql): `control.command_business_partner_decision` near line 4206.
- [Eligibility contracts](../../../server/packages/contracts/master-data/src/business-partner-eligibility.ts): reasons near 83 and query near 311.
- [Eligibility repository](../../../server/packages/services/master-data/src/kysely-business-partner-eligibility-repository.ts): projected scope near 152 and evaluator near 654.
- [Current scope matcher](../../../server/packages/services/master-data/src/partner-decision-scope.ts).
- [Registered record providers](../../../server/apps/platform-host/src/composition/entities/business-partner-record-providers.ts).
- [Eligibility service](../../../server/packages/services/master-data/src/business-partner-eligibility-service.ts): ordinary evaluation near 50.
- [Classification evidence link](../../../server/db/ddl/planes/neon/master/29_partner_commodity_classification.sql).
- [Current qualification presentation](../../../metadata/products/mdg/entities/business_partner/presentation.section.qualifications-certificates.json).
- [Role-free registration evidence](partner-core-registration-and-unspsc.md) and [role-free section audit](partner-role-free-section-audit.md).

### 3.1 Follow-up audit findings and severity

Historical audit: the earlier reader ignored exclusions and group correlation, with permissive organization/company matching. The current source uses the shared matcher described above; these findings must not be reported as unchanged current behavior. Preserve A05/A06/A44 as regression requirements and establish which version is deployed before assessing exposure. Per-row date semantics must be reconciled with current constraints, not inferred from the presence of date columns.

Remaining source gaps include unconditional All matching without pinned membership resolution, incomplete policy/path composition, and direct-target matching without demonstrated downstream lineage enforcement. Source inspection does not establish deployed exposure or certify the full target. Confirm deployed version, scope records and complete execution gates before making an impact claim.

Rejected as stated: the audit claims an unapproved pinned risk assessment falls through to another assessment. The inspected SQL contains `status='approved' AND (:riskId IS NULL OR id=:riskId)`. A non-null ID that is not approved produces no row, followed by `RISK_ASSESSMENT_MISSING`. Ordering cannot bypass that predicate. If no risk ID is selected, baseline selection is possible; that is a separate policy behavior. A reference to an assessment ID is also not a reference to an immutable assessment version.

Accepted with refinement: restrictive defaults must not be weakened when sharing the scope grammar. Preserve legacy NULL organization/company as broad restrictions, normalize them to explicit unrestricted modes in the target, and reject incomplete new commands. Do not use malformed restrictions or failed data retrieval as a reason to grant execution.

Accepted: early shadow impact reporting, a contract-owner go/no-go, explicit dependency checkpoints, selected-path receipts, approval-time snapshot display and named settlement-exception authority. The audit's support for lock decisions is advisory feedback, not authorization to implement them.

## 4. Business boundaries and ownership

| Domain | Owns | Does not establish by itself |
| --- | --- | --- |
| Partner facts | Identity, industry/commodity declarations, contacts, addresses, protected tax/banking, certificates, governance | Supplier/customer approval or transaction eligibility |
| Qualification | A review outcome with explicit purpose, coverage, context, evidence, conditions and validity | Operational assignment, human permissions, contract balance |
| Risk assessment | Findings, mitigations, residual risk and authorized acceptance | Commercial award or qualification automatically |
| Operational setup | Partner capability indicators, organizational assignments, partner-owned company profiles and activation | Qualification coverage |
| Preference | Scoped preferred status | Qualification or permission to award |
| Restriction | Action-specific prohibitions and governed lifting | A replacement qualification |
| Contract/procurement | Commitments, lines, limits, reservations, receipt and invoice lineage | Partner-wide approval |
| Eligibility service | Composes current policies and authoritative evidence for an action | Independent ownership of all contributing domain state |

Preserve protected banking/identifier/tax permissions and audited reveal. Role-free facts are not unrestricted facts. User authorization and business qualification are separate checks.

## 5. Independent decisions and prerequisites

```text
Business Partner
  ├─ Q-001: general clearance (no direct execution uses)
  ├─ Q-002: standing supplier capability, specified scope
  ├─ Q-003: contract C-014 execution qualification
  └─ Q-004: standing IT Services capability, derived from Q-003 evidence

Explicit relationships, never inherited grants:
  Q-002 -- approval prerequisite --> Q-001 revision
  Q-003 -- continuing dependency --> required current risk acceptance
  Q-004 -- evidence reuse -------> Q-003 revision
```

Tenant presets may require clearance, tenant-level supplier qualification or company review in a familiar sequence. A flexible tenant may qualify directly for Company X/IT Services. A strict ladder is optional policy, not mandatory data structure.

Prerequisite kinds:

1. Review-time prerequisite: checked when approving a revision; pin evidence and policy version. Later expiry does not automatically remove coverage.
2. Continuing dependency: must remain satisfied at defined execution checkpoints; each dependency explicitly records its action/checkpoint set, required evidence state, failure effect and policy version. Approval validates this set; evaluators must not invent it per action. Pin the dependency rule and support governed renewal/replacement of its evidence.
3. Evidence reuse: preserves provenance only, not inherited permission or automatic revocation.

Validate cycles, required qualification types and scope compatibility. A prerequisite may not broaden the dependent decision. Policy changes require an explicit grandfather/review/immediate-enforcement strategy; do not silently reinterpret approved history.

## 6. Qualification identity, revisions and states

Each qualification identity is one independently governed decision series with its own stable ID, tenant, partner, qualification type/purpose and decision context. These descriptive fields are not a composite uniqueness key. Multiple identities may share tenant, partner, type/purpose and context, including separate standing IT Services decisions for Companies A and B. Duplicate detection and overlap review are separate controls, not uniqueness constraints on purpose.

Distinguish requirement type (what policy needs, such as supplier capability), qualification type/purpose (what assessment was conducted, such as technical capability), qualification identity (the decision series), coverage (where it applies), and revision (reviewed content within that series). Policy maps acceptable qualification types/evidence to requirement types; scope matching remains mandatory. Do not encode every company/category into a purpose code merely to allow independent decisions.

A decision revision owns the reviewed content. Proposed revisions may be edited with concurrency checks; submitted/decided content is frozen, with changes represented by another revision. At most one revision per qualification identity is effective at a business instant; independent identities remain possible alternative supporting paths.

Separate:

- Workflow: draft, submitted, in review, completed, withdrawn.
- Outcome: cleared for general-clearance display, approved, conditional or rejected according to type.
- Effectiveness: scheduled, effective, suspended, expired, revoked, superseded; rejected decisions are not applicable grants.
- Concurrency version: technical lost-update prevention, not business revision history.

Suspension/resumption/revocation are authorized lifecycle events referencing the decided revision. They do not change the original approval into another outcome. Revocation is terminal for that grant; reapproval requires a new reviewed revision. Each qualification identity has one fixed decision-context key: `standing`, or the typed event/contract/engagement/project identity defined in section 7. Changing from contract-bound to standing creates another qualification identity. At most one effective revision per qualification identity is selected at a business instant; coverage groups belong to that revision, not competing concurrently effective revisions. Source document versions are pinned separately from the stable context key.

A pending or rejected amendment does not silently remove a currently effective approval. A deliberate suspension/revocation can. Once an old revision is superseded, revoking its successor does not revive it.

### 6.1 Consolidated lifecycle contract — current storage versus target

This is the agreed presentation and ownership direction. Target lifecycle commands below are not claims that current writers implement every transition. The initial read view must display the actual stored value, not translate an unsupported state into a fabricated approval or permission.

| Axis | Current source DDL | Target contract |
| --- | --- | --- |
| Partner lifecycle | `master.business_partner_status_d`: draft, active, inactive, archived | Active / Inactive for the partner identity. Before reducing the domain, place draft intake in the shared case lifecycle and resolve archive/retention consumers explicitly. Inactive records remain available for authorized historical reads; action policy distinguishes new commitments from settlement/reversal obligations. |
| Partner capabilities | Separate supplier/customer identities and lifecycles remain installed | Independent Supplier and Customer indicators on Business Partner; labels Enabled / Not enabled. Neither, either or both may be enabled. Supplier means “We buy from this partner”; Customer means “We sell to this partner.” Physical field names, audited writers and existing code/type destinations require a coordinated contract. |
| Qualification stored decision | pending, approved, conditional, rejected, suspended, expired | Preserve these codes in the initial view. Future governed revisions separate decision outcome from suspension/expiry/revocation events and temporal effectiveness, as specified in §6. No Preferred decision code. |
| Restriction lifecycle | active, lifted, cancelled, expired | Preserve separate restriction lifecycle, validity and scope/target authority. Active does not alone mean currently applicable or enforced. See §13.5. |
| Organization/company setup | draft, active, inactive, archived | Independent setup lifecycle, not qualification or restriction. Do not collapse its existing states without resolving setup authoring and retention. |
| Preference designation | `control.supplier_preference_designation`: pending, approved, rejected, revoked | Reuse/adapt partner-owned, capability-scoped preference. Display Preferred Partner independently of qualification; do not add a parallel designation authority or imply customer preference is already implemented. |

Target qualification transition rules for the later command stage:

- Pending may become Approved, Conditional or Rejected through authorized review. Approved and Conditional require actual retained approval/snapshot evidence; conditional is not unconditional approval.
- Suspension applies to an existing approved/conditional grant. Authorized resumption restores only that grant's original outcome after current requirements are rechecked; it cannot renew an expired period.
- Rejection does not become approval by editing a status field. Reassessment produces a reviewed revision. Expired or revoked grants are not silently reactivated; renewal/reapproval requires a new reviewed revision.
- Expiry is determined at the documented exclusive validity boundary. An expiry job may persist a transition, but transaction checks cannot rely on the job having run. A suspended grant may also be outside its date window; display both facts.
- Revoked and Superseded are target effectiveness/history concepts, not new values silently added to today's qualification decision domain. Implement revision/event authority before exposing those histories.
- A capability being Not enabled is a setup fact, not rejection or misconduct. Temporarily blocked and Prohibited belong to restrictions; qualification expiry does not switch the capability indicator off.

### 6.2 Material overlap and duplicate review

For the same tenant/partner, flag a material overlap when decisions can satisfy a common requirement under an applicable active, transition or proposed activation policy, their contexts can apply to the same action, at least one complete coverage-group pair intersects across all dimensions, and effective intervals intersect. Include effective, scheduled-approved and submitted revisions. Same-contract or standing/contract intersections may matter; unrelated event contexts need not overlap. Use conservative candidate detection: uncertain intersection is flagged for review, never silently omitted. Explain approximate matches so reviewers can dismiss a false positive with evidence.

Unacknowledged material overlap prevents approval. The authorized independent reviewer records supplement, replacement, intentional alternative or demonstrated non-overlap, with justification and referenced revisions; acknowledgement never waives conditions or restrictions. Display the overlap and disposition in the register. Concurrent approvals must synchronize/revalidate the overlap set so both cannot pass on stale observations. Exact purpose duplication is not a uniqueness violation; idempotency still prevents duplicate command execution.

Run the check for initial approval, amendments/re-pinning and policy activation that changes candidate relationships. Approved snapshots are immutable, so source hierarchy changes alone cannot silently create new scope. General continuous overlap analytics may follow, but these known mutation paths are in scope and cannot be deferred as unspecified drift. Reopening work does not automatically revoke existing approvals; use the governed restriction/effectiveness process when necessary.

## 7. Coverage grammar

Decision context appears once in the header. Each coverage group contains five applicability dimensions.

| Dimension | Explicit modes |
| --- | --- |
| Commercial relationship | Partner-wide / selected supplier/customer applicability |
| Operating organization | All tenant organizations / selected organizations |
| Company | All within the applicable organizational set / selected companies |
| Commodity | All / whole selected tenant categories / selected declarations / categories limited to selected declarations |
| Geography | Unrestricted / selected countries with delivery, service-performance, registration or another approved purpose |

Context: standing or one typed RFP/tender/contract/engagement/project reference. Multiple named contexts use separate decisions initially. An event origin and an applicability context are separate fields.

Within a dimension, selected values mean OR. Dimensions within one group mean AND. Complete groups mean OR. Exclusions subtract only within the matching group. Never combine values across groups to manufacture a match. For coverage grants, every required mode is explicit; missing does not mean All. Zero groups or empty selected sets cannot be approved. No company selection rows are needed for an explicit All mode backed by its approved snapshot; missing rows without that mode cannot grant coverage.

Restriction defaults are directional, not copied from grant defaults. Legacy NULL organization/company restrictions remain broad, within their tenant/partner/action and other explicit constraints. Target writes use explicit unrestricted/selected modes and reject incomplete input; migration normalizes legacy NULL to unrestricted, never to an empty match. An unresolved active restriction or failed restriction lookup must block affected execution for review, not disappear. Shared syntax does not imply identical grant/prohibition defaults.

Organization/company relationships must be valid. Selection of a parent does not implicitly include descendants: distinguish exact selection from approved subtree expansion. Snapshot subtree/category membership and hierarchy versions at approval. Current structural incompatibility still blocks execution; historical snapshots do not authorize an invalid current company association.

Initial release: All/whole-category/subtree coverage is resolved and pinned at approval. UI says, for example, "All 8 current companies; future additions require review." Tenant-wide is not limited to the current user's visible companies. Broad-scope approval requires corresponding authority; hidden candidates must not be silently dropped to shrink the scope.

Dynamic future membership is deferred unless explicitly approved as a separate policy mode with clear risk, notifications and acceptance tests.

## 8. Partner commodity linkage

Capture direct UNSPSC declarations independently of roles, organizations, companies and tenant-category mappings. Industry classifications remain separate partner facts; crosswalks are reference relationships, not partner declarations.

Supported qualification coverage:

- Specific declarations: pin declaration identity, version and shared code identity/version.
- Whole tenant category: pin the category definition and approved membership. Where no UNSPSC mapping exists, require an explicit transaction category or governed classification of the line; do not infer membership from a description.
- Category limited to declarations: both category and selected declaration membership must match.
- All commodities: no commodity restriction for this qualification type, not a claim of universal technical capability.

Mappings support candidate discovery and proposed evidence. They neither create declarations nor grant coverage. Mapping updates never silently expand coverage. An unmapped declaration remains discoverable by direct code search. A direct category qualification may be supported by its own evidence without UNSPSC.

Evidence links are not automatically scope selectors. Mark their usage explicitly. Archived declarations remain in historical evidence; continuing-dependency policy determines whether reassessment is necessary.

## 9. Sourcing, preference and selection

Any active partner can be considered for sourcing under invitation policy and applicable restrictions. Admission is a separate evaluation mode: it must not require an existing supplier role, company profile or supplier-activation readiness. Event/company context may be required by the event, but not as a hidden prerequisite for creating partner facts.

Show candidates as qualified, qualified with conditions, relevant declared capability, relevant experience, assessment required or restricted. Relevant, qualified and preferred are different attributes.

Recommendation levels: recommend, propose shortlist, auto-invite. Auto-invite requires explicit policy and a fresh admission check at send time. No automatic award follows from ranking.

Ranking uses authorized signals: code/category match, matching qualification, scoped preference, permitted performance indicators and approved derived readiness bands. Restrict access to sensitive derived bands; do not leak risk through ordering while hiding the text. Explain reasons using permission-filtered references.

Selection in drafts is not authorization to execute. A supplier qualified only in Company X may be selectable as a candidate elsewhere, but cannot release transactions elsewhere using that qualification. UI distinguishes candidate selection from executable selection and never labels a context-incomplete preview Allowed.

## 10. Operational gates and composition

Policy defines requirement types for each action. Example for PO release: general clearance if required, supplier capability, contract linkage if required, operational setup, risk acceptance, applicable mandatory conditions, financial/contract controls and human command authorization.

### 10.0 Canonical business-operation contract

Every business operation is evaluated against one complete, typed context. The context is never inferred from the currently open partner screen or a user's visible company list.

```text
Requested action + authenticated actor + tenant
  + partner + role (when applicable)
  + organization/company + commodity/geography
  + RFP/engagement/contract/transaction-lineage context
  + business effective time and execution instant
             │
             ▼
Operational eligibility
  ├─ Authorization and configured enforcement route
  ├─ Scope-based and target-bound restrictions/exceptions
  ├─ Qualification policy, supporting revisions and conditions
  ├─ Operational setup, risk and continuing dependencies
  └─ Transaction-domain controls: contract, amount, receipt, invoice, bank/payment
             │
             ▼
Allowed / Blocked / Requirements pending / Context required
  + explainable receipt, selected policy set and evaluated evidence
```

No source record independently grants an operation: partner active status establishes the record; supplier/customer capability and setup establish the relevant operational configuration; qualification satisfies only the requirements it covers; restriction prohibits the actions it covers; contract/procurement owns commitment state; human authorization controls who may issue the command. A current eligibility result is action- and context-specific, never a global Business Partner status.

The command handler, not a browser projection or a cached preview, is authoritative. Read models may display readiness and recommendations only with their evaluated context, timestamp and source version. A transaction change that affects the contract, line, company, commodity, geography, amount, action or effective time invalidates that preview and requires current evaluation at execution.

Evaluation order:

1. Authenticate, authorize and validate tenant/partner references and action inputs. Resolve the explicit enforcement configuration and authoritative restriction policy; missing required authority fails closed.
2. Evaluate directly matchable scope-based restrictions and only their valid restriction-scoped exceptions. A known unexcepted prohibition can stop execution immediately.
3. Resolve authoritative transaction/obligation lineage required by this action, including downstream target discovery. Missing necessary lineage yields RESTRICTION_LINEAGE_UNRESOLVED and blocks affected execution; do not infer no matching hold.
4. Evaluate target-bound restrictions against that lineage and their valid restriction-scoped exceptions. Combine both restriction passes; no first-match permission and no weaker precedence for a late-discovered hold.
5. Select the qualification authority/policy for the enforcement mode and current evidence. In enforced mode, match complete groups per requirement and choose deterministic supporting paths under versioned policy, not client choice or latest-wins. Record exact decision revisions and groups per requirement/line. Controlled transition uses its explicitly approved grant authority, never an inferred fallback.
6. Evaluate requirement-scoped exceptions against identified requirements, then check supporting-path conditions, mandatory obligations and continuing dependencies. A requirement exception cannot override a restriction.
7. Check operational setup, line-level coverage and domain-owned controls using resolved lineage. Qualification and lineage work may be parallelized internally, but no final Allowed or Requirements pending result is issued before all required restriction checks finish.
8. Atomically enforce mutable limits and revalidate authority versions, temporal predicates, lineage and restriction sets at the synchronized command boundary.
9. Persist execution evidence and emit committed events. Aggregate the final result using the precedence below; a matching unexcepted restriction or unresolved required restriction lineage produces Blocked, regardless of qualification results.

Restrictions do not disappear because another approval matches. Rejected/suspended/revoked independent decisions contribute no coverage; they are not global prohibitions by themselves. No policy qualification requirement is reported as NOT_REQUIRED, not Qualified.

Restriction enforcement is independent of whether any qualification requirement exists. Not required skips only that qualification requirement, never restriction checks. An unconfigured action remains unavailable under bootstrap rules. Both restriction passes use the same authority, exception and result-precedence rules; the two passes are an evaluation dependency order, not separate decisions that can authorize execution independently.

Customer qualification requirement types are in scope. Enforce them for configured customer actions independently of credit checks. A tenant policy may explicitly require none; report that as Not required rather than inheriting the current supplier-only enforcement branch. Introducing a new customer requirement requires tenant impact review and staged activation, not an unannounced global block.

Result vocabulary has two distinct levels:

| Level | Values |
| --- | --- |
| Requirement outcome | satisfied, unsatisfied, not_required, context_required |
| Command result | allowed, blocked, requirements_pending, context_required |

Command composition, in precedence order:

1. Blocked: a known hard restriction, authorization denial, unavailable mandatory policy/restriction authority, or policy-defined hard failure determines the result. Do not disclose protected reasons to unauthorized callers.
2. Context required: necessary inputs are missing and no known hard denial already determines the result.
3. Requirements pending: evaluation has sufficient context but remediable mandatory requirements remain unmet.
4. Allowed: every mandatory gate passes; advisory warnings may remain.

Only Allowed permits execution. Requirements pending is not a softer permission. Not required applies to an individual requirement and cannot bypass other gates. Reasons carry enforcement effect (advisory, remediable gate or hard denial) under the pinned policy; `CONDITION_OVERDUE` alone does not decide severity. Draft capture has its own action policy and is not automatically disabled by an execution denial.

### 10.1 Freshness and the execution boundary

The action contract enumerates its authoritative revalidation set: applicable policy/activation generation, chosen decision revisions and effectiveness events, coverage snapshots, active restriction/exception set, condition satisfaction, continuing dependencies/risk evidence, partner/role status, organization/company relationships, actor authority, and relevant contract line/limit versions. Payment additionally checks current banking readiness. Only relevant domains participate, but an implementation must not omit a required domain silently.

A change invalidates the previous evaluation and requires reevaluation; it is not downgraded to a warning. Detect newly inserted restrictions as well as changed observed rows using an authoritative generation or equivalent concurrency protection. Reevaluate temporal predicates even when versions are unchanged: a condition, exception, authorization or policy window can expire without a write.

Use the applicable authority-generation set, not a universal per-tenant transaction counter. Partner-local restriction changes must not serialize unrelated partners; partner/action-class partitioning is a candidate, not a substitute for tenant-policy, organization-control or actor-authorization generations. Broad generations are read-mostly and change for genuine authority mutations, not every transaction. High-frequency state uses its natural aggregate boundary (for example partner/action or contract line). Emergency broad holds remain immediate and must not be delayed to meet an "infrequent activation" assumption. Benchmark broad activation and local mutations explicitly; a transaction-frequency broad invalidation bottleneck requires redesign.

Preview responses carry evaluated-at and valid-before instants, bounded by a configured maximum age and the earliest known relevant temporal boundary. Changing transaction inputs invalidates the preview. An unexpired preview is never command authority; commands evaluate current state regardless of this UX freshness bound. Changed evidence/policy may trigger a bounded retry or `STALE_EVALUATION` with no execution. Already committed idempotent retries return the original committed result rather than execute again.

Define an atomic authorization/commit boundary with the owning transaction domain. Policy activation and concurrent restriction mutations must participate in the synchronization protocol so they serialize before or after the command's authorization point. A final version comparison alone is insufficient if a conflicting mutation can occur between that comparison and commitment. Across domains, use an explicit version-fenced/reservation protocol; if the required guarantee is unavailable, fail closed and treat integration as not ready. Mutations ordered after a committed authorization affect subsequent checkpoints; they do not rewrite historical receipts.

### 10.2 Document-scale evaluation

Batch line evaluation, deduplicate repeated scope coordinates and fetch shared evidence together. Avoid per-line N+1 queries; allow bounded chunking for large documents rather than promising constant queries for arbitrary input size. Reuse immutable version-addressed artifacts safely, but never treat a cached preview/eligibility result as release authority. Recheck mutable authorities at execution.

QP-00 defines a benchmark contract including representative 200-line mixed-commodity POs, supported maximum size, group/condition volume, tenant data scale, concurrent releases, hardware/database configuration, and numerical p95/p99 latency and query/lock budgets. QP-02 must approve and measure that budget before exit; QP-05 adds reservation contention and retries. No unsupported performance claim or unspecified target can satisfy the exit gate. Bound evaluation complexity and fail explicitly on unsupported limits, not by omitting lines or requirements.

Include restriction writes concurrent with evaluation reads: unrelated partners, a hot single partner, tenant-wide policy activation and emergency broad holds. Measure retry rate, lock waits, throughput and tail latency, demonstrating isolation of unrelated partner traffic without weakening authority freshness.

| Action | Business gate |
| --- | --- |
| Partner fact read/capture | Tenant and fact permissions; no supplier/customer prerequisite |
| RFP discovery/invitation/response | Separate admission policy and event restrictions |
| Qualification approval | Reviewer authority, evidence, prerequisites, maker/checker and complete scope |
| Award | Event evaluation, risk acceptance, conditions and authority |
| Contract draft | Authorized candidate capture; unresolved requirements visible |
| Contract activation/amendment/value increase | Required qualifications, context/risk changes, conditions and authority |
| Purchase request | Candidate nomination permitted by policy; gaps visible |
| PO draft/release/amendment | Draft distinct from commitment; release checks each line and reserves limits |
| Goods receipt/service acceptance | Existing obligation, performer authority and current execution holds |
| Invoice capture/posting/approval | Capture records a received document; posting/approval checks source, matching and applicable holds |
| Payment | Valid approved payable, banking/reveal separation, payment authority and settlement restrictions |
| Credit memo/return | Trace original obligation; reversal/recovery rules, not new-purchase rules |
| Supplier portal access | Identity/participant authorization and resource permissions; qualification is not login authorization |
| Sales order/customer billing | Independent customer applicability and relevant credit controls |

Mixed-commodity documents have per-line results and an aggregate result. Initial release blocks document release if a required line fails; partial release must be explicitly supported by the owning transaction domain.

## 11. Contract-only execution and limits

```text
RFP-014 / IT Services
  -> award to this partner
  -> Contract C-014 / Company X
  -> Q-003 / contract-bound qualification
  -> covered PO lines -> receipt -> matched invoice -> settlement

Optional independent path:
Q-003 evidence -> expanded-scope review -> standing Q-004
```

Validate typed source links, tenant, partner, company and contract lines. Free-text references never establish authority. A contract-bound qualification supports only explicitly permitted downstream actions; RFP participation approval alone cannot release a PO.

If Q-003 is the only capability approval, unrelated execution has no qualifying path. Other RFP participation remains available under admission rules. If a valid standing Q-004 also covers the transaction, it may provide an alternative path unless policy requires contract linkage or an explicit contract-only restriction applies.

Contract/procurement owns authorized amount/quantity, currency, unit conversions, taxes/charges treatment, amendments and consumption. Qualification has no balance. Before implementation, identify the authoritative module and settle these accounting semantics with its owner.

### 11.1 Reviewed contract envelope and amendment materiality

A contract-bound qualification revision records the contract version and reviewed engagement envelope: value/quantity basis, currency/conversion basis, scope, duration and material risk assumptions. This is immutable review evidence, not another commitment balance. Stable contract identity alone cannot establish that a materially changed engagement has been assessed.

Contract amendment policy compares cumulative change to that reviewed baseline, not only to the immediately preceding amendment. It defines thresholds and responses: notification, time-bound reassessment, block on additional commitments pending reassessment, or a separately authorized immediate restriction. Do not universally allow or block every increase. Current contract limit checks remain necessary but cannot substitute for a required reassessment gate. Existing settlement uses its own policy.

Record amendment events, dependency impact and reassessment work separately; never overwrite the approved qualification revision's original envelope. A completed governed review may issue a new revision/baseline. Contract-extension rules and source-version retention still apply. Thresholds, currency treatment, affected actions and the response to pending reassessment require procurement/risk business approval before activation.

### 11.2 Reservation and consumption

At release, atomically reserve/commit against authoritative contract lines using row locking or equivalent serializable conditional updates, in the same transaction as release where feasible. If domains are separate, require a durable reservation protocol; do not simulate atomicity with asynchronous projection updates. Check shared header caps as well as line caps.

Idempotent retry must not double-reserve. Cancellation releases only the unconsumed commitment; amendment applies the net delta. Receipt/invoice/payment must not each consume the same ordering allowance again. Reversals follow the owner's ledger policy. Reconcile leaked/stale reservations with audit evidence. Two concurrent releases cannot both consume the same remainder.

## 12. Time, expiry and historical replay

Use inclusive start, exclusive end: `[effective_from, effective_until)`. No end means explicitly unbounded where policy permits. UI may display inclusive "Valid through 31 Dec 2027" for an exclusive stored end of 1 Jan 2028; API documentation and date filters must state the convention.

Store actual dates/timestamps and a source/version derivation reference. "Contract ordering expiry" is explanatory text, not a date value. Contract extension does not automatically extend qualification; it initiates a reviewed amendment or an explicitly delegated policy action producing a new revision.

Two clocks:

- Business effective date/time: coverage relevant to the obligation/action, validated against the source document and authorized backdating policy.
- Evaluation time: current actor authority, current hard restrictions, dependency state and command freshness.

Historical replay is read-only and records what policy/evidence was known at the original evaluation. Current execution with a backdated business date still checks today's applicable holds. Do not allow backdating to bypass revocation or a payment block. Persist both clocks and evidence/policy versions.

Replay requires captured inputs, evaluator semantics/version, policy, both clocks and referenced evidence versions. It must reproduce the original decision and chosen-path explanation; divergence is an audit finding. If history is insufficient, return Replay unavailable with the missing dependencies, never reconstruct a purported original result from current data. Replay grants no permission to execute today.

For deliberate whole-business-day block overlap, resolve tenant-local day start and next-day start to explicit instants using a named timezone; use `block_start < next_day_start AND (block_end IS NULL OR block_end > day_start)`. Do not assume every local day is 24 hours or use `23:59:59`. Current execution holds use the actual execution instant. Test fractional seconds, exclusive boundaries, timezone independence and daylight-saving transitions. Migration reports timing changes instead of silently preserving accidental session-timezone behavior.

Restriction authors explicitly select `temporal_kind`: instant-bounded (timestamp interval) or whole-business-day (date interval and named timezone). Action policy declares whether a check concerns current execution or business-date overlap; UI callers cannot choose the clock. Resolve restriction boundaries once under their declared intent:

| Restriction intent | Execution-instant check | Explicit business-date-overlap check |
| --- | --- | --- |
| Instant-bounded | Block only if execution instant lies in its interval; an 18:00 start does not block 09:00 | Flag overlap with the explicitly resolved business-day interval; this does not claim the hold was active at 09:00 |
| Whole-business-day | Block if execution instant lies in the authored local-date interval resolved to instants | Match overlap between resolved date intervals; preserve each named timezone |

All execution gates check current operational holds at the execution instant. Qualification/obligation coverage also uses the action's business date as already specified. Additional day-overlap prohibition checks require an explicit action-policy rule; they are not the universal default. Reporting may show day overlap without granting or blocking a command. Store the selected check semantics in the receipt.

For new commitments, intersect relevant decision/scope/contract-ordering intervals. Conditions have action-specific deadlines and satisfaction rules; they are not all extra validity intervals. Receipt and settlement of existing obligations use their own execution/closeout policy, not an automatic requirement that ordering coverage remains open.

Default: expiry blocks new commitments, but legitimate existing obligations may settle if current settlement checks pass. Optional strict tenant policy places an explicit post-expiry payment hold with a governed exception process. Partner inactivity prevents new business but routes existing obligations through controlled closeout, not automatic deletion.

Next review due is separate from expiry. Policy explicitly chooses blocking at named gates or warning with reassessment work. A date-based obligation resolves through its declared company/organization context and named timezone/calendar policy, not a presumed tenant singleton. Tenant-wide obligations may explicitly adopt a tenant default. Pin the resolution basis and resolved deadline instant; changes require impact review, not silent reinterpretation. Migration preserves today's blocking effect as an explicit legacy policy until an authorized owner approves a change; include expiry jobs and existing expired outcomes in reconciliation.

For coverage spanning contexts, prefer per-context deadlines when independently actionable; otherwise explicitly choose one common deadline rule, with earliest resolved boundary as the proposed conservative default for a shared obligation. Record all contributing contexts and the selected boundary. Missing required calendar/timezone authority produces a configuration gap, not a server-timezone fallback. Business-day adjustment and calendar-date expiry are different policies.

Source clarification: `control.fiscal_calendar_config` and `control.company_fiscal_calendar_assignment` exist (control/03_tables.sql near 1945 and 2326), but the inspected tables do not define named timezones or holiday/workday review rules. Reuse fiscal assignments for genuinely fiscal-period-based obligations; QP-00 must identify authoritative timezone/business-calendar resolution rather than assuming a fiscal calendar implements it. Test different company timezones, DST and shared-obligation boundaries.

## 13. Restrictions, exceptions and conditions

Qualification answers "What assurance do we have?" Restriction answers "What must stop?" Eligibility answers "Can this exact action proceed now?" Qualifications and restrictions retain independent lifecycles; neither a new approval nor lifting one restriction automatically establishes eligibility.

The prohibited action set is the union across all matching scope-based and target-bound restrictions, after resolving each restriction's own authorized exceptions. Any remaining applicable prohibition blocks execution. "Not prohibited by this restriction" is never evidence of permission. Lifting or excepting one hold does not resolve another.

Shared applicability determines enforcement. Optional origin/evidence links to qualification revisions, RFP assessments, contracts, performance reviews or risk findings explain why a restriction exists; they do not implicitly define its scope or make it dependent on qualification validity. A partner with no qualification can still be restricted. Tenant-wide here means the named partner within its tenant, not all partners.

Extend the existing block authority using the shared scope grammar where feasible. Physical design may add a block owner to decision scopes or use a typed common scope owner; decide after business lock, avoiding two competing grammars.

Preserve broad prohibition semantics: legacy NULL organization/company means unrestricted within the remaining block coordinates. Grant normalization must never turn such a block into no coverage. New restrictions use explicit modes; incomplete writes are rejected, and unreadable/unresolved active restrictions fail closed for affected actions. Include migration equivalence tests before changing the block reader.

A restriction records tenant/partner, action set, coverage/context, start/end, severity, reason, imposing authority, review date, lifting authority, visibility classification and exception eligibility. Global prohibitions and group exclusions are not interchangeable.

Impose/lift/extend are separately authorized and audited. Emergency suspension may have distinct authority and retrospective review. Expiry ends a restriction automatically by time; lifting is an explicit action with a reason. Preserve both histories. Non-overridable blocks cannot be bypassed by any qualification.

Qualification suspension and restriction are not interchangeable. Suspension removes one supporting path; if the intention is to stop an action across all paths, impose an explicit restriction. Effectiveness events record suspension reason, originating finding and required resumption authority. Risk/compliance/performance-origin suspensions require the relevant specialist clearance as well as qualification authority; relabeling the reason as administrative cannot downgrade the requirement. Resumption never lifts a separate restriction. Administrative evidence-renewal suspension may use ordinary authority only where policy explicitly permits it and no unresolved specialist finding applies. Define required clearance by source risk and intended protection, not solely an assumed equivalent scope breadth.

Exceptions reference specific restriction/requirement, scope, transaction/action, duration, approver and justification. No generic "override all" flag. Surface EXCEPTION_APPLIED without disclosing protected details. Partner-facing reasons may be redacted; internal authorized audit retains full evidence.

For a strict post-expiry settlement hold, proposed authority is a tenant-designated Finance/AP exception approver with authority for the company and amount, independent of the requester, plus contract-owner confirmation of the obligation. Risk/compliance-imposed holds additionally require their designated lifting authority; non-overridable holds remain blocked. Supplier setup administrators and contract authors receive no implicit exception power. Tenant policy names authorized principals/roles and escalation thresholds before this exception path is enabled; final payment release remains a separate authorization.

Conditions record binding kind (supporting-path or mandatory context/policy), owner, checkpoint, deadline, evidence/version, blocking/advisory effect and satisfaction history. Conditional approval requires at least one meaningful unresolved or continuing condition. A satisfied condition remains in history; it is not deleted. Conditions becoming overdue mid-flight are enforced at their specified checkpoint.

### 13.1 Scope-based and target-bound restrictions

| Mode | Enforcement basis |
| --- | --- |
| Scope-based | Explicit positive applicability groups, context, action selection and temporal rules |
| Target-bound | Stable transaction/document-line or obligation identity and explicitly covered downstream actions; mutable descriptive scope cannot release the hold |

Target-bound authoring validates tenant, partner, company, context and target consistency. Reject a PO line described as belonging to C-014 when it does not; never silently reconcile contradictory inputs. Record validated applicability/context as evidence. Later reclassification or contract relinking raises review work but cannot narrow the target hold. Tenant isolation, actor authority, action, effective interval and validated downstream lineage still apply; target identity does not replace these checks.

Amendment, cancellation, split and replacement commands preserve restricted-obligation linkage or require an authorized disposition. Creating a new line ID must not evade a hold. Preserve cancelled targets as historical evidence; cancellation is not automatically lifting, especially if a payable remains. If lineage cannot be determined, stop the affected operation with RESTRICTION_LINEAGE_UNRESOLVED and remediation rather than infer that the new document is unrelated.

Target closure/cancellation emits TARGET_CLOSED_REVIEW_REQUIRED, assigns the restriction owner a disposition task and preserves the effective hold until governed resolution or its valid expiry. Review checks remaining payables, unmatched invoices, replacements/splits, settlement and reversal obligations. A missing target is an integrity failure, not proof that exposure is zero. If no relevant obligation remains, the authorized owner can close/lift according to policy with evidence; this review flag need not introduce another terminal status.

Walk authoritative lineage at each checkpoint, including restrictions imposed after an invoice or payment draft exists. Cached/stamped inherited holds are projections only. A hold on PO-100 line 20 can follow its matched invoice lines and payment allocations; the same partner appearing elsewhere does not establish propagation. Broad partner/company restrictions are evaluated independently of these target links.

Initial release permits positive restriction groups only: no exclude rows. Narrow initial scope explicitly; relief from an effective restriction requires governed lifting, amendment or an eligible exception. Scope narrowing is a reduction in protection and needs appropriate authority, not ordinary editing. Qualification exclusion semantics remain unchanged; sharing scope infrastructure does not authorize restriction exclusions.

### 13.2 Governed action catalog and operational effects

Select from the same governed business-action catalog used by requirement policies, not a hardcoded UI list. Support exact stable action IDs and explicitly labeled action classes. Initial class membership is versioned and pinned; technical endpoint refactors retain business-action identity. A genuinely new action/class membership requires restriction-impact review and an approved compatibility/migration disposition before activation. Do not allow a new payment endpoint to bypass existing payment holds. Until compatibility and tenant/action configuration are established, execution is unavailable. "New commitments" has one catalog definition shared by expiry and restriction policies.

| Restriction actions | Receipt / service acceptance | Invoice handling | Payment |
| --- | --- | --- | --- |
| Payment release only | Not prohibited by this restriction | Capture/post/approve not prohibited by this restriction | Matching release blocked |
| Invoice approval and payment release | Not prohibited by this restriction | Capture remains distinct; approval blocked | Matching release blocked |
| Service acceptance and payment release | Acceptance blocked; physical receipt recording evaluated separately | Capture permitted if separately authorized; posting/approval depends on matching rules | Matching release blocked |
| New commitments class | Existing obligations follow their action policies | Existing obligations follow their action policies | Existing obligations follow settlement policy |

Every "not prohibited" cell still requires other qualifications, permissions and transaction controls. Receiving a deliverable is not certification of satisfactory performance. Invoice capture, posting, approval and payment release are distinct actions. Performance deterioration initiates review/remediation; imposing a hold or suspending qualification is a separate governed action unless a published policy explicitly delegates automation.

Draft creation and capture are first-class restrictable catalog actions, separate from release/posting. Ordinary release/payment holds do not select them by default. Severe cases may explicitly restrict specified draft actions under authorized policy; inactivity, fraud investigation or another reason does not implicitly prohibit all administrative recording. Recording received documents, investigation and controlled closeout remain deliberately governed, not assumed either universally allowed or blocked.

For mixed payment allocations, distinguish PAYMENT_DIRECTLY_RESTRICTED from PAYMENT_CONTAINS_RESTRICTED_ALLOCATION. If safe split/partial settlement is unsupported, block the whole payment. When supported, only demonstrably unrestricted allocations may proceed; the restricted balance retains its hold. Splitting never overrides a document-level payment restriction. Receipts record matched target/obligation/allocation references and policy version without protected account values.

### 13.3 Authority and authoring

| Breadth | Required authority baseline |
| --- | --- |
| Transaction or line | Relevant operational authority for that target/action |
| Contract or company | Applicable contract/company authority |
| Category across companies | Category authority plus the affected company coverage |
| Partner-wide across tenant | Elevated tenant authority with appropriate independent review |

Restriction policy also considers action sensitivity and reason: payment and sourcing powers differ; even a narrow compliance/security hold may require specialist authority. Define imposing, lifting, narrowing, extending and exception authority separately. Emergency imposition is explicitly authorized and followed by mandatory review; it does not imply unrestricted lifting power. This is target governance, not a claim that the existing repository already exposes a single governed block command or permission ladder.

The authoring form includes mode, explicit unrestricted/selected dimensions, context/target, actions or class/version, downstream coverage, origin/evidence, business severity, enforcement effect, exception eligibility, visibility classification, temporal kind/timezone, effective interval, review owner and lifting requirements. Policy and actor authority constrain choices; authors cannot freely make compliance holds overridable. Severity/priority does not determine enforcement by itself. A restriction prohibits actions; advisory findings are separately labeled and must not masquerade as an effective prohibition.

Impact preview states both prevented and unaffected actions, with permission-filtered affected documents. Example: "Hold payment for PO-100 lines 10/20 under C-014; goods receipt and invoice capture are not prohibited by this hold." Preview is not authority and execution rechecks current state.

### 13.4 Migration, examples and boundary

Legacy `business_partner_block` rows migrate as scope-based restrictions, never invented target holds. Preserve tenant/partner, role, organization/company breadth, temporal meaning and reviewed operation semantics. Normalize previously unconstrained commodity/geography/context dimensions to explicit unrestricted modes. Existing positive action coverage must not disappear.

Reconcile operation naming such as `ordering` versus `order` and `invoicing` versus `invoice` against actual callers/catalog before mapping. Do not reproduce an ineffective string match as intended behavior or silently expand it. Report both weakening and widening; reviewed action mapping and equivalence/impact tests are cutover prerequisites. Required source discovery remains QP-00 work, not proof of live exploitation.

Java qualification plus Database restriction is valid: Java execution may proceed; Database is prohibited even if another approval later covers it. Absence of Database qualification alone is a qualification gap, not a reason to invent a prohibition. A SAP performance finding may justify a C-014 payment-only hold while SAP qualification and authorized receipt remain effective. A separate broader company/category hold requires explicit broader authority.

Partner-independent controls, such as stopping all Company X payments during close, are out of scope for the partner restriction resource. Keep them in the company/payment authority and compose their result with partner restrictions, qualifications and transaction controls. Do not create synthetic partner records or duplicate control authorities.

### 13.5 Restriction lifecycle and display contract

| State | Meaning and target command boundary |
| --- | --- |
| Active | A recorded prohibition. It applies only when its time, operation, context and coverage/target match; a future start is Scheduled. No blanket “partner blocked” inference. |
| Lifted | An authorized early release, retaining actor, time and reason. Lifting one restriction does not remove another or establish eligibility. |
| Cancelled | Target meaning: withdrawn before taking effect. Once effective, use Lift, not Cancel. Audit existing command semantics before enforcing this target rule. |
| Expired | Its exclusive end has passed. No renewal by changing the historical row; a new authorized restriction is required for a new period. |

Target transitions: Active → Lifted, Cancelled (pre-effective only), or Expired (at the end boundary). Terminal records do not return to Active. Lifecycle commands require tenant/scope authority, optimistic concurrency, idempotency and retained audit history. Workflow submission/review is a separate future concern, not another restriction status.

Temporary block describes a time-bounded restriction, not capability activation. Prohibited is the preferred business label for an explicitly classified prohibition; “Blacklisted” requires a separately agreed classification/authority and must never be inferred from a null end date. Current DDL has no dedicated blacklist classification. Invalid/unavailable restriction evaluation cannot be displayed as “No restrictions” or used to permit execution.

Initial read projection displays stored lifecycle plus provider-assessed date window (Unspecified, Scheduled, Within date window, Ended), with its assessment basis. Within date window is not an eligibility result. Detailed confidential reasons remain separately authorized.

## 14. Risk and evidence reuse

Partner baseline assessments and engagement assessments remain independently versioned. Engagement assessment references the baseline version, identifies additional exposure, records mitigations and requires appropriate residual-risk acceptance.

A required pinned assessment revision that is missing, unapproved or otherwise unusable cannot be silently replaced. Return a specific reason and require the governed evidence/dependency update. If policy intentionally selects a current baseline rather than a pinned revision, declare that mode and record the selected assessment/version in the receipt. A newly selected baseline is not retroactive evidence for an earlier approval.

An engagement can have lower residual risk than a baseline indicator only with documented context/mitigation and authorized acceptance. It cannot erase baseline findings or override hard restrictions. Ratings across contexts are not interchangeable numbers.

When a baseline is superseded, identify dependent decisions and emit reassessment work. Material critical findings trigger configured immediate holds; a routine correction does not automatically revoke every qualification. Record RISK_BASELINE_SUPERSEDED and whether it is warning, pending reassessment or blocking under the policy. Current critical restrictions remain enforceable even if a background dependency job is delayed.

"Qualify for future business" creates a separate linked standing qualification, proposes expanded scope, reuses eligible versions and collects gaps. Evidence reuse and continuing dependency are distinct link kinds. Source expiry alone does not invalidate a standing qualification based only on historical evidence. No automatic technical-capability or tenant-wide approval follows from successful contract execution.

## 15. User experience and explainability

Near-term navigation reuses the existing MetaEntity record shell:

```text
360 View | Qualifications | Roles & scope | Business Transactions | Comments | Files

Qualifications
  Qualifications
  Restrictions
  Reviews and history (next stage; absent from initial tab)
```

Responsive overflow may group navigation, but resource ownership stays separate. Restrictions have an explicit independently authorized section even when a partner has no qualification. Certificates remain evidence in 360 View; Roles & scope remains operational setup. Links open risk/setup/work records without duplicating ownership. Additional top-level workspaces are a later metadata navigation decision, not a prerequisite for this view slice.

Global register:

| Business Partner | Decision | Coverage summary | Context | Outcome | Effectiveness | Valid through |
| --- | --- | --- | --- | --- | --- | --- |
| Aster | Q-001 General clearance | Partner-wide; tenant-wide; clearance only | Standing | Cleared | Effective | 31 Dec 2027 |
| Aster | Q-002 Supplier capability | Supplier; approved company set; all commodities | Standing | Approved | Effective | 31 Dec 2027 |
| Aster | Q-003 IT Services | Supplier; Company X; selected IT Services | C-014; origin RFP-014 | Conditional | Effective; see conditions | 30 Jun 2027 |
| Aster | Q-004 IT Services | Supplier; approved tenant company set; category snapshot | Standing; derived from Q-003 | Approved | Scheduled | 30 Jun 2028 |

Dates are illustrative. In a partner workspace omit the repeated partner column. Expand rows for prerequisites, source lineage, effectivity reasons, conditions and date basis. Coverage summary is rendered from structured authoritative scope, never parsed back as authority. Protect hidden-scope details.

Creation: Purpose & intended use -> Coverage -> Evidence/risk/conditions -> Review. Show six dimensions without six mandatory selectors: context in the header, five applicability rows per group, presets for simple cases, optional alternative groups. Review displays scope changes and examples of allowed/not-covered use before approval.

Check applicability has tenant overview, sourcing-admission and concrete-action modes. Tenant overview requires no fabricated org/company, but does not certify a PO. Concrete actions request missing coordinates and return CONTEXT_REQUIRED. UI and execution share the evaluator.

Permission-bind each mode: tenant overview requires partner read plus permissions for the qualification summaries actually returned; sourcing admission requires authority to manage/check admission for the named event (or an explicitly limited participant self-check); concrete-action preview requires the same scoped action authority as execution. Partner read alone does not permit probing all commercial gates. Preview is non-mutating and never substitutes for execution-time authorization/MFA. QP-00 maps these capabilities to actual permission names without granting them here.

Keep the internal result truthful. Callers lacking legitimate resource/action access receive a generic authorization/resource response before business results are exposed. Authorized action evaluators may learn "Cannot proceed" while confidential hold details remain redacted. Detailed reasons need separate permission. Incomplete-context probes must stay within the authorized target scope; do not falsify Context required to disguise a known denial. Test result-level disclosure, not merely reason filtering.

Reason vocabulary includes existing reasons plus:

- ORGANIZATION_NOT_COVERED, COMPANY_NOT_COVERED, COMMODITY_NOT_COVERED, GEOGRAPHY_NOT_COVERED, CONTEXT_NOT_COVERED, CONTEXT_REQUIRED.
- QUALIFICATION_NOT_EFFECTIVE, QUALIFICATION_REVOKED, PREREQUISITE_UNMET, CONDITION_UNMET, CONDITION_OVERDUE.
- CONTRACT_COVERAGE_MISSING, CONTRACT_LIMIT_EXHAUSTED, RISK_BASELINE_SUPERSEDED, RISK_REFERENCE_UNAVAILABLE, REVIEW_OVERDUE, RESTRICTION_UNRESOLVED, EXCEPTION_APPLIED, POLICY_UNAVAILABLE, STALE_EVALUATION.
- ENFORCEMENT_NOT_CONFIGURED, ENFORCEMENT_AUTHORITY_UNAVAILABLE, ENFORCEMENT_CONFIGURATION_AMBIGUOUS, TRANSITION_EXPIRED distinguish missing bootstrap, authority outage, conflicting configuration and scheduled expiry. POLICY_UNAVAILABLE remains the parent policy failure category, with structured unavailable/ambiguous/expired cause where applicable.
- PAYMENT_DIRECTLY_RESTRICTED, PAYMENT_CONTAINS_RESTRICTED_ALLOCATION, RESTRICTION_LINEAGE_UNRESOLVED distinguish document holds, allocation holds and unresolved propagation.
- TARGET_CLOSED_REVIEW_REQUIRED identifies a restriction needing disposition review; CONTRACT_ENVELOPE_REASSESSMENT_REQUIRED identifies a material engagement change. These findings carry policy-defined checkpoint effects, not automatic global bans.

Each structured reason identifies its action/line and the applicable requirement, decision revision, group, condition, restriction or contract resource, plus safe remediation. Restriction-only early exits need not invent a qualification requirement reference. Existing `recordId` is useful but a single ID is insufficient for a complete multi-line/multi-requirement explanation. Preserve full internal provenance and permission-filter externally.

Persist enforcement receipts (including rejected command attempts without losing them to transaction rollback), source revisions, input digest, both clocks, policy version and chosen paths. Successful receipt persistence must be atomic with, or durably correlated to, command execution. Preview telemetry is explicitly non-authoritative and has a retention policy. Never log protected bank/tax values or confidential risk detail unnecessarily.

An early-exit receipt explicitly records that evaluation was truncated, the restriction pass at which it stopped and which downstream gates were not evaluated; if requirements were not yet resolved, record that fact rather than invent their outcomes. Absence of a requirement outcome never means satisfied or not required. UI/remediation views must not imply that the reported hold was the only obstacle; lifting it requires fresh evaluation of all applicable gates before execution.

Retain policy versions, activation/enforcement history, evaluator semantics and non-sensitive replay evidence for at least the referencing receipt retention period and applicable holds. Dependency-aware retention prevents routine supersession/cleanup from destroying replay. Receipts contain protected evidence references and approved integrity attestations, not raw bank/tax values; avoid plain hashes of guessable identifiers that could leak values. Reuse signed validation results where adequate. If a legitimately purged dependency is required for replay, report Replay unavailable naming only authorized dependency details. Deletion remains subject to the applicable retention/erasure/hold governance; it is not automatically permissible in all circumstances. Record authorized purge and replay impact without retaining erased secrets.

### 15.1 MetaEntity qualification and restriction view contract

Revision 10 scope decision: initial delivery is the read-only MetaEntity-driven Qualifications tab with Qualifications and Restrictions sections. Evidence browsing/upload/linking, risk/evidence review, snapshot viewers, review/history timelines, work queues, approval routing, capture/edit, impose/lift and exception commands move to the next stage. Do not expose placeholder sections or disabled workflow buttons for deferred work. Existing stored decisions may be displayed without building those journeys. This plan update is not runtime implementation or business-design sign-off.

Use `/app/entity/business_partner/{recordId}` and the existing shared `EntityRecordPage`. Metadata declares tabs, sections, fields, labels, lookup references, renderers, pagination and operation references. Registered providers return structured authorized data; server commands own decisions and enforce tenant, scope, lifecycle and maker/checker rules. No BP-specific page fork, client-side eligibility engine or unrestricted generic table writer is introduced.

| Surface | Required read projection |
| --- | --- |
| Qualification register/detail — initial | Stable reference, type, context, stored outcome, coverage groups, effective dates, review due date and authorized stored condition summaries. Temporal status needs a provider-supplied basis and does not certify prerequisite/condition satisfaction |
| Restriction register/detail — initial | Stable reference, permitted reason, scope/target mode, prohibited operations, coverage or typed target, stored lifecycle, start/end and authorized stored lifting details. Temporal status describes the interval, not certified downstream enforcement |
| Evidence, reviews and history — next stage | Evidence/risk links, snapshot/revision viewers, review provenance and exception history; never fabricate history from mutable rows |

Field labels and enumeration/reference names resolve through metadata and lookup contracts. Dates use the shared locale-aware date/date-time renderer and preserve section 12's boundary semantics. Coverage summaries are display projections of structured groups; show approved membership snapshots only when backed by actual retained membership evidence. Outcome, record lifecycle and effectiveness must not be collapsed into one status. An approved future qualification is Scheduled, and a future active restriction is not yet effective.

The existing `qualifications-certificates` section key and `neon.bp.section.qualifications-certificates.v1` handler are compatibility coordinates. Retain or explicitly alias them during publication; any rename must update descriptors, providers, tabs, deep links and tests together. Their names do not authorize merging certificates into qualifications. Add a registered restriction projection and corresponding core/presentation/access bindings; the current provider returns qualifications only. Choose exact new artifact/handler keys during the metadata contract crosswalk, checking registered names rather than inventing an existing API.

Qualification read does not grant restriction read or confidential-reason disclosure. Resolve section, row, field and target-link authorization server-side before returning data; omit unauthorized counts, summaries and hidden-scope details as well as rows. Distinguish authorized empty, denied, unavailable and error states. Do not label a denied or failed restriction query “No restrictions.” A restricted section must not prevent independently permitted qualifications from loading.

The partner-scoped register supports organization and person categories without manufacturing supplier/customer records or a company selection for tenant-native reads. Resolve company/context only where required by the requested operation. Load bounded, deterministic pages and fetch details on demand; preserve the selected section, filters and URL state across refresh/navigation. Reveal data and confidential evidence do not enter shared caches or generic list responses.

Initial delivery exposes authorized read navigation only; mutation/workflow affordances are omitted even if legacy operations exist. Subsequent stages may expose registered, implemented and authorized operations. Structured condition storage and direct target fields do not prove condition or downstream enforcement. Synthetic fixtures cover both categories and preserve existing approval/snapshot integrity requirements; deferring evidence UI does not permit bypassing those requirements.

### 15.2 Initial table and metadata boundary

DEV releases, fixtures, test outcomes, temporary grants and known gaps are maintained in the [delivery and acceptance record](business-partner-qualification-delivery-and-acceptance.md#152-initial-table-and-metadata-boundary). They are not frozen business rules and are not evidence of design lock.

### 15.3 Finalized MetaEntity view composition and future dependencies

Navigation hierarchy: **Qualifications** page tab → **Qualifications** and **Restrictions** child sections. Both use metadata labels as visible headings and authorized section navigation. Retain the current compatibility section keys. Do not promote every section to a page tab. Restricted sections are omitted server-side, including their data/counts; hiding a button is not authorization.

Commercial setup is the target replacement label for Roles & scope: Partner capabilities, Organization assignments, Supplier company profiles and Customer company profiles. It does not duplicate qualification/restriction coverage. Retire the old supplier/customer identity collections only with their consumer replacement. Metadata owns fields, labels, enumeration/reference bindings, locale dates and registered presentation/operation keys; server providers own tenant-safe projections and server commands own transitions. No hardcoded UI state maps or arbitrary metadata-defined executable operations.

| View | Required distinction |
| --- | --- |
| Qualifications | Actual stored decision; coverage; conditions recorded but not evaluated; validity/review dates; date-window basis. Approved, Preferred and transaction Allowed must never be synonyms. |
| Restrictions | Actual stored lifecycle; prohibited operations; scope or authorized target; validity; permitted lifting details. Never imply enforcement completeness from the read projection. |
| Partner capabilities — next commercial setup slice | Enabled / Not enabled independently for Supplier and Customer. Optional control summaries say Restrictions apply or Requires contextual validation, not global Allowed. |
| Preferred Partner — future | Separate scoped designation with validity, next review, decision provenance and exact supporting evidence/assessment versions. Show Approved · Preferred Partner as independent labels only when authorized facts support both. |

Future certification, risk and performance integration uses policy-defined dependencies, not every certificate attached to a partner:

| Event | Policy-controlled response |
| --- | --- |
| Required certification expires | Re-evaluate only dependent qualification/preference coverage. |
| Risk assessment becomes unacceptable or overdue | Trigger review and the explicitly configured suspension/restriction response. |
| Performance falls below a defined threshold | Trigger preference review or withdrawal as policy permits. |
| Supporting evidence is renewed | Reassess; never silently restore a withdrawn approval or preference. |

Each dependency declares scope, evidence/version reference, mandatory versus advisory meaning, recheck point and failure effect. Mandatory failures can stop effective use without rewriting the original approval; advisory changes may create review work. Missing policy/evaluation means unknown/review required, not successful reassessment. Preference influences ranking only among otherwise eligible alternatives; it never overrides restrictions, setup, credit or human command authority.

Manual initiation and automatic event-triggered review use the same governed command contract. Automatic workflow initiation is not automatic approval. Automated approval requires an explicit activated policy, sufficient evidence, permitted decision authority and an auditable outcome; otherwise route to an authorized reviewer. Deduplicate events, pin policy/evidence versions, reject stale results and prevent a delayed renewal event from resurrecting a later revocation. This is next-stage design only: no evidence UI, workflow buttons, background approval or eligibility claims are added to the initial read slice.

#### Lifecycle acceptance traceability

LC01–LC09 are maintained in the [delivery acceptance record](business-partner-qualification-delivery-and-acceptance.md#additional-acceptance-cases-for-the-consolidated-contract). Required business outcomes remain governed by §§6, 13 and 15; changing a test expectation cannot change those rules.

## 16. Target logical model and migration rules

This is a logical extension plan, not approved SQL/table naming:

```text
Qualification identity
  -> Decision revision
       -> Qualification type/purpose / approval policy version
       -> Typed context and source lineage
       -> Coverage groups / explicit modes / snapshots
       -> Evidence and classification-version references
       -> Risk-assessment-version links
       -> Structured conditions / validity
       -> Workflow and approval history
  -> Effectiveness events (suspend/resume/revoke/supersede)

Separate authorities:
  Tenant/action enforcement configuration -> transition or enforced mode
  Action requirement policy identity -> immutable policy versions
    -> Tenant / action applicability / requirement type set
    -> Accepted qualification types and evidence-selection rules
    -> Deterministic alternative-path selection
    -> Mandatory obligations / review rules / dependency checkpoints
    -> Authoring, review, activation and effective windows
  Restriction / exception
    -> Scope-based or target-bound mode / positive applicability
    -> Stable action IDs or class version / temporal intent
    -> Obligation lineage / authoring evidence / lifecycle authority
  Prerequisite / continuing dependency / evidence reuse
  Role/company operational setup and preference
  Contract commitment/reservation ledger
  Enforcement evaluation receipt
  Remediation work references / bulk disposition audit (reuse work infrastructure)
```

After lock, extend existing resources rather than creating parallel services. Preserve tenant/partner composite foreign keys, command-only mutations, RLS, reveal controls and maker/checker. Classification/evidence references and context links need referential integrity, not unvalidated generic JSON IDs.

Action-requirement policy is tenant-scoped and versioned, immutable once activated, with separately authorized authoring/review/activation, maker/checker, effective windows and staged tenant enablement. Policy selection must resolve deterministically for an action/context; ambiguous competing active versions or unavailable mandatory policy fail closed. Requirement alternatives and obligations are data in that policy, not hardcoded tenant branches.

Policy applicability explicitly supports relationship, organization, company, commodity and geography (with country purpose), plus decision context, using explicit modes. A simple tenant can adopt one tenant-wide policy per action and never edit the additional dimensions. Tenant/action enforcement configuration establishes the authority route; within enforced mode, applicable contextual policy components supply requirements. It must not treat a narrower context as an unconfigured legacy escape path.

Do not use unqualified most-specific-wins across independent dimensions. Compose mandatory baseline/jurisdiction obligations with applicable overlays; specificity alone cannot remove a mandatory requirement. Overrides of replaceable rules require explicit override authority and a declared predecessor/rule relationship. Declare precedence for permitted alternatives and reject unresolved conflicts/ambiguous active versions. An organization-specific and a country-specific rule are not inherently ordered. Receipts record every contributing policy version and the resolved policy-set fingerprint; freshness checks cover the entire set. Existing references to a pinned policy version mean this resolved set where composition is used. QP-00 must specify/test composition before dimensional policy activation.

### 16.1 Explicit rollout authority

Tenant/action enforcement configuration is separately authorized, versioned and auditable. It determines which authority must resolve; missing policy is never interpreted as permission to use legacy behavior.

| State | Execution authority and behavior |
| --- | --- |
| Controlled transition | Named existing evaluator/configuration remains the approved grant authority; verified restriction enforcement still applies. New qualification policy may run in shadow. Record authorities distinctly; shadow results cannot grant execution. |
| Enforced | Activated requirement-policy version controls execution; failure never falls back to legacy. |
| Missing, unreadable, ambiguous or expired configuration | Block affected execution with the distinct cause; separately authorized draft actions remain separate. |

Transition records include tenant/actions, approved legacy authority/version, justification, approving authority, start/end, migration owner and activation criteria. Bootstrap each tenant/action before routing it through the new gate. A newly cataloged action is unavailable for execution until explicitly configured; empty lookup is ENFORCEMENT_NOT_CONFIGURED, not transition mode. Enforced configuration with missing mandatory policy fails POLICY_UNAVAILABLE. Receipt records enforcement mode/version and the evaluator that actually authorized the command.

Transition expiry blocks affected execution with TRANSITION_EXPIRED; it neither extends itself nor automatically activates an unready policy. Proposed notification schedule: migration owner at 30, 14, 7 and 1 days before expiry, escalation at 7 days to the accountable business owner, and immediate notice at expiry; short transitions emit overdue milestones on creation. Delivery failures create operational alerts; timers never change expiry semantics. Recovery requires an authorized activation or a fresh, justified, time-bounded extension approval preserving prior history. No automatic renewal or retroactive authorization.

Transition approval is not acceptance of known over-grants. A tenant/action may not enter controlled transition before its exposure review is complete and any required containment is separately authorized. Record review evidence and containment disposition on the transition approval; where containment is a prerequisite, verify it is effective before activation. An incomplete exposure review is not a reason to default to transition mode. An extension cannot waive a hard restriction or silently broaden legacy coverage. Existing general/customer requirement rollout is governed here; Not required within an enforced policy is different from not yet activated.

Every restriction represented as effective must have verified enforcement coverage on all actions it claims to prohibit, in every rollout mode. Transition may defer new qualification semantics, not silently ignore holds. Where needed, place the verified restriction gate around the legacy execution path. During coexistence, consider applicable prohibitions from both authorities with canonical identity/mapping, lifecycle and exception reconciliation; never use a stale legacy copy to resurrect a legitimately lifted/excepted hold. Validate target-lineage enforcement end to end, not merely the new reader in isolation.

If a restriction mode/target/action cannot be enforced, do not activate it or display it as effective. Report the capability gap and route to a separately authorized supported containment if needed; do not silently broaden the proposed hold. Unconfigured actions are already blocked, not an opportunity to execute outside the gate. New prohibitions can cause operational harm if incorrectly broadened, so overlap, authority, impact and migration safeguards still apply. No fallback from enforced qualification mode is introduced by this restriction wrapper.

### 16.2 Policy lifecycle and migration

Initial delivery uses governed configuration artifacts validated and published through explicit commands, reusing suitable existing workflow/authorization/publication mechanisms after inventory. Activation does not require a software deployment per tenant. A dedicated authoring UI may follow; validated import, review, activation and inspection are initial deliverables, not deferred governance. Policy activation history is separate from immutable version content.

An evaluation pins the applicable policy at selection and uses it throughout. At the synchronized execution boundary, a newly applicable version requires reevaluation or `STALE_EVALUATION`; never combine versions. Future-dated activation also requires a time check even without a new write. Record the policy version and activation generation in the receipt. Technical synchronization details belong in the post-lock DDL/service ADR but must satisfy section 10.1 before enforcement is enabled.

Migration must not invent missing approvals, dates, conditions or historical revisions. Recover provenance from mutation evidence where available. Mark incomplete history and route ambiguous legacy conditional decisions for review; do not auto-convert them to unconditional approval. Treat normalized scope and legacy header inconsistencies as reconciliation exceptions. Preserve stable IDs and external references with compatibility contracts.

Role-free clearance needs reader and requirement-mapping cutover alongside schema changes: simply making `partner_role` nullable leaves the current equality predicate unable to select it. Prove both direct role-free reads and clearance prerequisite evaluation in QP-02. Preserve justified denial effects, not legacy newest-row misattribution. Reconcile block-time differences under explicitly named timezones as part of cutover impact analysis.

Shadow-evaluate old/new results starting in QP-02, using representative existing tenant data as well as synthetic adversarial cases. Investigate both widening and narrowing: stricter matching will remove some legacy matches, while changed review-due or customer policies can change results independently. Baseline restrictions must remain at least as protective. Record evaluator/policy versions and distinguish qualification-path differences from overall command differences; another gate can hide a permissive match.

Produce a permission-controlled report per tenant, partner, qualification and affected action/context: old/new results, chosen paths, difference reason, impacted open documents, severity, accountable owner and proposed resolution. Separate actual observed cases from generated coverage probes. Include absent modes, cross-group joins, ignored exclusions/commodities/geography/scope dates, implicit review blocking and new customer enforcement. An old match is not proof of approved business intent.

Before tenant cutover, notify business owners and resolve cases by reviewed revision, valid alternative evidence, explicit policy decision, governed exception where permitted, or acknowledged blocking. Track unresolved cases and document-level settlement treatment. Never widen the new matcher or silently convert missing company scope to All simply to preserve old matches. No blanket permissive grace period: any permitted transition exception is bounded by scope/action/time, independently approved and cannot override hard restrictions. Where no valid resolution exists, affected new execution stays blocked with remediation guidance; drafts and permitted closeout remain distinct.

Cut over writers and readers deliberately, with one authority and no silent fallback to the permissive legacy evaluator. Failure to obtain current required policy/evidence fails closed for execution; draft capture may remain available. Reconcile counts, hashes, tenant isolation and multi-group membership. Rollback must not erase new decisions or bypass restrictions; disable affected execution or roll forward where data semantics prevent safe reversal.

### 16.3 Remediation and bulk disposition

Reuse suitable work-item/notification infrastructure. Remediation records the failed requirement/resource, owner, deadline, escalation, deduplication key, evidence and resolution. Unassigned work routes to a named tenant queue; closure verifies the required correction and triggers reevaluation. Closing a work item does not approve a qualification or grant eligibility. QP-00 confirms work ownership and adapters; foundational routing is required before cutover, not only QP-06 automation.

Bulk migration tools may assign work, record disposition and acknowledge reviewed impacts with permission-scoped previews, per-record version checks, actor/reason, audit and partial-failure results. They may not approve qualification revisions, lift restrictions, grant exceptions or activate policies. Those remain separate per-record governed commands with their own authority and evidence. Overlap acknowledgement in a batch still requires explicit coverage of each flagged pair and cannot be combined with automatic approval. Retry never silently skips stale records or converts a disposition into permission.

## 17. Implementation plan after business-design lock

Moved to the [delivery and acceptance record](business-partner-qualification-delivery-and-acceptance.md#17-implementation-plan-after-business-design-lock). Section numbering and IDs are preserved; delivery updates do not revise the business baseline.

### 17.1 Delivery slices and dependencies

Moved to the [delivery and acceptance record](business-partner-qualification-delivery-and-acceptance.md#171-delivery-slices-and-dependencies). Section numbering and IDs are preserved; delivery updates do not revise the business baseline.

### 17.2 Full business capability worklist

Moved to the [delivery and acceptance record](business-partner-qualification-delivery-and-acceptance.md#172-full-business-capability-worklist). Section numbering and IDs are preserved; delivery updates do not revise the business baseline.

## 18. Acceptance matrix

Moved to the [delivery and acceptance record](business-partner-qualification-delivery-and-acceptance.md#18-acceptance-matrix). Section numbering and IDs are preserved; delivery updates do not revise the business baseline.

### 18.1 MetaEntity view acceptance

Moved to the [delivery and acceptance record](business-partner-qualification-delivery-and-acceptance.md#181-metaentity-view-acceptance). Section numbering and IDs are preserved; delivery updates do not revise the business baseline.

### 18.2 Sign-off ownership index

Moved to the [delivery and acceptance record](business-partner-qualification-delivery-and-acceptance.md#182-sign-off-ownership-index). Section numbering and IDs are preserved; delivery updates do not revise the business baseline.

## 19. Design-lock decisions

Approve or amend these recommendations before DDL work. They are proposed defaults, not already authorized tenant configuration.

| ID | Decision for review | Recommended default |
| --- | --- | --- |
| L01 | Independent decisions vs approval inheritance | Independent decisions; configurable typed prerequisites |
| L02 | General partner clearance | Explicit prerequisite-only purpose; display Cleared; no direct execution uses |
| L03 | Overlap and conditions | Requirement-based alternative paths; mandatory context/policy obligations bind; restrictions dominate; record chosen path per requirement/line |
| L04 | Continuing prerequisites | Dependency explicitly declares recheck actions/checkpoints and failure effect; not approval time alone |
| L05 | Future members in All/category/subtree | Pinned membership initially, displayed at approval (e.g. All 8 current companies); dynamic expansion deferred |
| L06 | Temporal and backdating rules | Exclusive end; both clocks; current restrictions cannot be bypassed |
| L07 | Contract expiry and payment | Stop new commitments; separate settlement; optional strict hold exception requires independent scoped Finance/AP authority and contract-owner confirmation, plus hold-owner authority where applicable |
| L08 | Initial automatic sourcing behavior | Recommendations and buyer-reviewed shortlist; auto-invite requires separate explicit policy |
| L09 | Roles/setup navigation | Separate tab linked to Qualifications; independent ownership and lifecycle |
| L10 | Contract-only build scope | Required target; QP-00 owner/limit go/no-go; defer QP-05 and dependent automation for a separately scoped domain build if no authority exists |
| L11 | Broader category qualification | New linked standing decision with independent review, not mutation of contract approval |
| L12 | Conditional legacy records | Reconcile or review; never silently treat as unconditional |
| L13 | Coverage narrowing at evaluator cutover | QP-02 per-tenant impact report; reviewed revision or explicit bounded disposition; no auto-widening to preserve legacy matches |
| L14 | Overdue review and migration | Explicit per-policy blocking/warning; preserve legacy blocking until authorized change; include expiry jobs and existing expired rows |
| L15 | Customer qualification enforcement | In scope where policy requires; separate from credit and staged per tenant with impact acceptance |
| L16 | Grant vs prohibition defaults | Missing grant mode confers no coverage; preserve legacy broad restrictions and normalize explicitly; invalid restriction state must not open execution |
| L17 | Qualification identity vs purpose | Independent stable IDs; same purpose/context may coexist with distinct coverage; duplicate review separate from uniqueness |
| L18 | Requirement-policy governance and initial authoring | First-class immutable activated versions; governed configuration publication and tenant activation initially; dedicated editor may follow without weakening review controls |
| L19 | Pre-activation and transition expiry | Explicit tenant/action authority; controlled transition with approved legacy version/end date; notices and expiry block; only fresh approved extension or activation restores service |
| L20 | Material overlap control | Approval blocked pending reviewer acknowledgement/justification; independent alternatives allowed; amendments/policy activation rechecked; no automatic duplicate rejection |
| L21 | Restriction authority and authoring | Scope breadth plus action sensitivity/reason determine authority; policy-constrained exception settings; explicit target/scope modes; positive groups only initially |
| L22 | Restriction action coverage | Stable exact actions or versioned pinned classes; genuinely new actions require compatibility/impact disposition before activation; no endpoint-refactor bypass |
| L23 | Contract amendment materiality | Pin reviewed contract envelope; cumulative thresholds and policy-specific reassessment/commitment response; no duplicated balance or silent approval expansion |
| L24 | Minimum viable governance | Allow multiple hats but preserve decision-level separation and specialist authority; no automatic relaxation by tenant size; single-operator capability requires separate explicit control-specific approval before implementation |
| L25 | Governed profiles and bootstrap | Versioned qualification presets and signed default policy/configuration bundles adopted explicitly; materialize ordinary explicit decisions/configuration, never runtime profile bypasses |

After approval, record approver/date/version here, freeze the business examples, and prepare a separate DDL extension ADR covering concrete tables, foreign keys, enum migration, guarded commands, RLS, indexes, backfill and cutover. This document does not authorize deploying any such change.

### 19.1 Lock record and scope

Lock is a business act, not an editorial state. It is complete only when P1–P3 and every approval row below are satisfied. Use the linked decision sheet as the signature artifact; populate these rows with its immutable version/signature references, not duplicate independent approvals. L24 and L25 each require their own explicit disposition and signature reference, even when signed by the same person on the same date. A batch L01–L23 signature cannot satisfy either.

**What lock establishes**

- Normative rules in sections 1–16 and 21, together with approved L01–L25, become the QP-00 baseline. Section 15.2 is a pointer only. Source observations in §§3/22 are dated evidence requiring the live crosswalk, not immutable assertions about a deployment.
- A change to a locked rule requires evidence, a named owner and a stated impact; it reopens only the affected rule.
- Normative business examples in §§5, 11, 13.4 and 15 are frozen, excluding §15.2 delivery evidence. Dates, grants, release IDs, test results, source line numbers and other operational facts in the companion are not frozen. Updating those facts cannot alter a normative example.

**What lock does not establish**

- It is not authorization to implement. Section 17's phase gates and QP-00's go/no-go decisions stand unchanged.
- It authorizes no DDL, permission grant, metadata publication, runtime behavior or DEV data change.
- It is not a claim that every question is answered. Named QP-00 discovery in sections 20 and 21 remains open by design.

**Preconditions to lock**

| # | Precondition | Accountable | Status |
| --- | --- | --- | --- |
| P1 | L01 to L25 approved. L24 and L25 are new in revision 7 and require explicit individual review, not a batch signature | Business sponsor / partner-governance owner | Open |
| P2 | Every accountable role in section 20 assigned to a named individual; an unassigned role is a blocked phase under that table's consequence column | Business sponsor | Open |
| P3 | Section 21.3's conditional answered: whether any target launch tenant requires governed bulk re-pin. If yes, that scope is resolved or that tenant rollout is explicitly deferred before lock | Procurement / business sponsor | Open |

**Approval record**

| Role | Name | Decisions approved | Date | Signature reference |
| --- | --- | --- | --- | --- |
| Business sponsor / partner-governance owner | | L01–L23 | | |
| Business sponsor / partner-governance owner — individual L24 review | | L24 only; explicit disposition required | | |
| Business sponsor / partner-governance owner — individual L25 review | | L25 only; explicit disposition required | | |
| Procurement domain owner | | L07, L10, L23, P3 | | |
| Finance / AP owner | | L07, L21 | | |
| Risk / compliance owner | | L04, L14, L24 | | |
| Platform / security owner | | L16, L18, L19, L25 | | |
| Data governance / audit owner | | L06, L13, L14 | | |

Decision-sheet version and immutable baseline reference: _______

Locked revision: _______  Lock date: _______  Recorded by: _______

On completion, change the status line at the top of this document to **Locked as business design**, retaining the scope statement above, and open the DDL extension ADR described in the preceding paragraph.

## 20. QP-00 handoff and review closure

Moved to the [delivery and acceptance record](business-partner-qualification-delivery-and-acceptance.md#20-qp-00-handoff-and-review-closure). Section numbering and IDs are preserved; delivery updates do not revise the business baseline.

## 21. Tenant profiles, proportional operation and scale

Tenant shape is a guided configuration preset, not an authorization tier or a separate data model. Company size does not determine regulatory duties or justify dropping controls. A small high-risk tenant may need stronger controls than a large low-risk operation. Profiles select defaults and hide irrelevant authoring choices while materializing the same explicit records.

| Control/capability | Small/simple | Mid-size | Large/multicountry |
| --- | --- | --- | --- |
| Tenant isolation, restriction precedence, audit receipts, protected-data controls and non-overridable holds | Mandatory | Mandatory | Mandatory |
| Maker/checker, overlap acknowledgement, specialist clearance | Same mandatory rules by default; consolidate roles, not forbidden actor pairs | Same rules with delegated queues | Same rules with distributed specialist authority |
| Policy applicability | Tenant/action preset often sufficient | Optional company/category/context overlays | Contextual rules where required; dimensionality not forced without business need |
| Deadline basis | Explicit default often sufficient | Default or company/organization resolution | Per-context or declared shared-obligation rule |
| Qualification authoring | One-screen governed preset | Presets plus scoped editing | Presets plus delegated review and impact campaigns |
| Organization/category expansion | Per-decision review | Campaign-prepared per-decision deltas | Same initial control; governed bulk widening/dynamic mode requires a separate approved extension |
| Snapshot storage | Same immutable set semantics; efficient small-set encoding allowed | Reusable set references | Reusable sets and measured storage/index strategy |

### 21.1 Staffing and governance boundaries

Seven accountable QP-00 roles do not require seven people. A named person/team may own multiple deliverables; the same independent decider can perform overlap acknowledgement and qualification approval where authorized. Actual prohibited maker/checker pairs, conflicts of interest and specialist qualifications still apply. Specialist approval may be a legitimately authorized shared/external function rather than a dedicated employee.

Classify controls as invariant, policy-configurable, or requiring an explicitly approved alternative governance mode. Invariants cannot be disabled by a profile. Reviewer routing, schedules, thresholds and presets are configurable within approved bounds. The current command's maker-as-decider rejection remains unchanged: single-operator qualification approval is not available merely because a small profile was selected. If staffing is insufficient, escalate/delegate legitimately or keep the governed capability unavailable.

L24 asks owners whether any control-specific single-operator mode should be designed. If approved later, identify permitted actions/risk limits, alternative assurance, receipt disclosure and forbidden exceptions; assess source-command/DDL changes separately. Do not classify all specialist clearance or independence as universally relaxable. Unacknowledged material overlap remains an approval gate, not an advisory small-tenant default.

### 21.2 Governed qualification profiles and new-tenant adoption

Qualification profiles are versioned authoring templates: purpose, explicit scope modes, evidence checklist, validity/review defaults and approved workflow references. They materialize normal decision revisions, pinned coverage and provenance. The evaluator never grants because a profile name is present. Existing decisions do not change when a profile changes. A simple "supplier across current companies, annual review" journey may fit one screen, but creation and independent approval remain distinct actions.

Platform-owned default bundles contain signed/versioned policy and enforcement configurations plus compatible profiles. Provisioning requires recorded adoption by an authorized tenant representative, validates company/context references and supported capabilities, and records bundle/item versions. Activation uses the existing governed path and applicable separation controls; a signature proves origin, not tenant consent. Missing configuration still fails closed. Tenant amendments use ordinary review/publication; a later bundle release never silently overrides custom policy. Reuse verified publication infrastructure rather than inventing a parallel trust service.

### 21.3 Coverage maintenance and snapshot representation

Acquisitions and reorganizations create a real per-decision review cost under pinned coverage. Initial delivery provides campaign preparation: identify affected decisions, propose named snapshot deltas, collect reusable evidence, route reviews and track per-record commands. The non-authorizing bulk-disposition prohibition in section 16.3 remains intact.

QP-00 business sponsor/procurement owners must choose whether scale requires a separate governed bulk re-pin capability or future dynamic-membership mode. Additive scope is still an expansion; member-count/risk thresholds alone do not establish authorization. Any proposed bulk approval needs named set/delta evidence, reviewer authority across every company/category, per-record version/risk checks, conflict handling, partial-failure semantics and an explicit amendment to section 16.3 before implementation. Do not silently introduce this carve-out through a tenant preset. If mandatory for a target launch, resolve it before the relevant scope is locked or commit that tenant rollout as deferred.

QP-00 database owner must propose reusable immutable member sets before QP-01 schema selection. Prefer tenant-isolated content-addressed sets referenced by decisions with hierarchy/source version and set identity/digest; small explicit sets may have compact encoding with identical semantics. Include canonicalization, collision verification, RLS, reference-aware retention and index costs. Share membership storage without sharing decision authority. No cross-tenant existence leakage through global hashes. Immutability does not imply infinite retention: apply the agreed receipt/dependency retention rules.

### 21.4 Evidence-backed scale gates and owners

| Shape | Benchmark and discovery focus | QP-00 accountable owner |
| --- | --- | --- |
| Small/simple | Cold start, explicit bootstrap, profile usability, two-person/multiple-hat routing and honest insufficient-staff escalation | Provisioning/workflow and tenant business owners |
| Mid single-country | Steady-state workload, default policies and routine reviews | Domain/performance owners |
| Large multi-company | Immutable set growth, impact-campaign volume, approval overlap against submitted/scheduled/effective decisions, contention | Database/performance and migration owners |
| Large multicountry | Contextual policy composition, mixed calendars/timezones, evidence-access/residency constraints | Platform/security, temporal and data-governance owners |

Add these workloads to section 10.2; retain its 200-line and authority-write concurrency tests. Bound overlap candidate selection through tenant/partner/type/time/context indexes and deduplicated set operations. Conservative detection may over-flag, but timeout/complexity overflow cannot silently omit an overlap or permit approval. Record target volumes, numerical budgets and measured results before applicable phase exit. Residency/disclosure constraints remain explicit requirements for evidence routing, not an inference from tenant size.

Tenant-shape audit disposition: accept contextual calendars, dimensional policy, proportional authoring, bootstrap and scale discovery. Correct the fiscal-calendar/timezone conflation, avoid blanket most-specific-wins, do not equate roles with distinct headcount, and do not enable same-person approval or bulk widening without explicit business authorization. QP-00 owns concrete calendar sources, composition semantics, staffing feasibility and scale estimates; reopen affected rules only with evidence.

## 22. Current DDL inventory and extension boundary

This section is the repository-backed DDL map for the design. It identifies the current Neon objects that the implementation must reuse or extend; it is not a second schema definition and it does not authorize a migration. The authoritative SQL remains the versioned DDL files named below. “Target extension” is a design obligation only until the business design is locked and the DDL extension ADR is approved.

| Status | Meaning |
| --- | --- |
| **Existing authority** | Current DDL that owns the record or transaction fact. Reuse it; do not duplicate it in a qualification or eligibility schema. |
| **Existing support** | Current command, constraint, seed, access control or projection infrastructure that must be assessed for reuse. |
| **Extension required** | Capability required by this design but not represented completely by the current object. Specify it in the post-lock ADR and migrate compatibly. |

### 22.1 Partner facts — tenant + business-partner facts, independent of commercial roles

The following are partner facts. Creating, reading or governing these records must not require creation of `master.supplier`, `master.customer`, a company profile or a commercial qualification. Tenant isolation and the applicable record permissions still apply.

| Fact area | Existing DDL authority | Design use and boundary |
| --- | --- | --- |
| Core partner identity | `master.business_partner`, `master.business_partner_alias` | Canonical partner identity and alternate names. A qualification/restriction refers to the partner; it does not copy identity data. |
| Network and governance facts | `master.business_partner_relationship`, `master.business_partner_governance_relation` | Partner relationships and governance/ownership are role-independent facts. The Network projection must remain safe where no supplier/customer role exists. |
| Identifiers and tax | `master.business_partner_identifier`, `master.business_partner_tax_registration` | Protected identifier/tax values remain in their current protected-data paths. Eligibility receives an authorized result or reference, never a generic clear-value payload. |
| Industry declarations | `master.business_partner_industry_classification` | Partner-declared industry classifications, not a supplier/customer qualification. Crosswalk/catalog metadata is supporting reference information, not a partner declaration. |
| Commodity declarations | `master.business_partner_commodity_classification` | Canonical role-free declared/verified UNSPSC (or other classification) facts, effective dates and provenance. A category mapping may assist qualification discovery but must not manufacture or widen a declaration. The local clean build deliberately has no legacy-capability or origin table. |
| Commodity reference/catalog | `master.commodity_category` and shared classification/crosswalk catalog objects | Tenant categories and shared codes are reference data. The implementation must retain version/provenance where a qualification relies on a mapping. |
| Certificates and risk facts | `master.certification_type`, `master.certification`, `master.party_risk_assessment` | Partner-owned evidence and risk facts. They may be cited by a decision revision; a certificate or risk assessment does not itself grant eligibility. |
| Contact/address intake and materialization | `document.business_partner_request`, `document.business_partner_request_contact_person`, `document.business_partner_request_contact_channel`, `document.business_partner_request_address`, `document.business_partner_request_identifier`, `document.business_partner_request_tax_registration`, `document.business_partner_request_classification`, `document.business_partner_request_certification`, `document.business_partner_request_materialization_item` | Governed request staging and materialization are the current intake path. QP-00 must name the authoritative post-materialization contact/address sources and projection contracts before adding an eligibility dependency; this inventory does not infer them from request staging. |
| Banking facts | `shared.bank_institution`, `shared.bank_branch`, `shared.bank_identifier`, `master.payment_instrument`, `master.payment_instrument_link`, `master.bank_account`, `master.bank_provisional_reference` | Instrument identity, account subtype, partner relationship and directory references remain bank-domain owned. Current readiness reads use instrument/link facts. Do not restore discarded bank-account link/usage tables or infer independent bank verification from an active instrument. Payment enforcement must consume the readiness authority required by its policy without exposing protected account values. |

`master/29_partner_commodity_classification.sql` defines partner-owned commodity declarations and their guards. Current qualification classification coordinates use `control.business_partner_decision_scope.commodity_classification_id`; the formerly cited `control.business_partner_qualification_classification` table is absent from inspected current DDL. Crosswalk scope guards and command ownership before proposing a new evidence-link resource. Current declaration storage requires a tenant commodity category; verify any direct UNSPSC/code model against the active catalog contract before describing it as implemented.

### 22.2 Commercial setup — optional operating enablement, not partner facts

These objects represent optional commercial or operating setup. They are not prerequisites for registration, industries, commodities, contacts, identifiers, tax, certificates, governance/ownership or a partner-wide qualification.

| Setup concern | Existing DDL authority | Required separation |
| --- | --- | --- |
| Commercial capabilities | Current: `master.supplier`, `master.customer`. Target: independent indicators on `master.business_partner` | Retire separate identities after document/setup consumers move together. Preserve codes, types, external references and audit semantics through an explicit field map. Capability activation is not qualification or permission. |
| Operating organization and company extension | `master.business_partner_operating_organization_assignment`, `master.operating_organization`, `master.company_code`, `master.operating_organization_company_assignment` | Validate organization/company membership when a scope names them. Absence of a company selection must be represented explicitly as tenant/all-applicable coverage, never inferred from a null. |
| Company commercial profiles | `master.company_code_supplier_profile`, `master.company_code_customer_profile` | Adapt ownership from supplier/customer IDs to tenant-consistent Business Partner IDs, preserving company uniqueness and settings. Profile applicability follows capability activation; activation does not create profiles for every company. Setup remains an action-specific prerequisite, not a universal partner read restriction. |
| Banking/payment setup | `master.bank_account_house_config`, `master.bank_account_house_payment_method`, `document.supplier_activation_evidence`, and the preferred instrument-link reference on the supplier company profile | House-bank configuration remains treasury-owned and activation remains separately governed. The retired bank-verification table is not a current authority to restore. Name and verify any additional verification requirement through its owning domain before claiming support. |

### 22.3 Qualification — current control objects and required evolution

| Design concern | Existing DDL/support | Required treatment |
| --- | --- | --- |
| Qualification decision | `control.business_partner_qualification` | Reuse role-independent identity, context, condition array and approved-snapshot reference. Audit snapshot/revision constraints and writers before claiming immutable approved history; add only demonstrated gaps. |
| Explicit scope | `control.business_partner_decision_scope` | Reuse grouped dimensions, selection modes and include/exclude grammar. Current qualification/block scope rows cannot carry effective dates; header periods apply. Decide whether target per-row dating is needed and update constraints and matching together if introduced. |
| Classification linkage | `control.business_partner_decision_scope.commodity_classification_id` and category coordinates | Reuse typed coordinates and verify tenant/partner integrity guards. Preserve evidence/source versions when approving coverage. A separate qualification-classification table is not part of the inspected baseline. |
| Existing commands and evidence | `control.command_create_business_partner_decision`, `control.command_business_partner_decision`, `control.business_partner_mutation_evidence` | Reuse governed command/evidence patterns, then close the documented gaps: revision identity, scope snapshots, evidence/risk references, conditions, review history, overlap acknowledgment and independently authorized decision transitions. |
| Adjacent commercial controls | `control.supplier_preference_designation`, `control.customer_account_designation`, `control.customer_credit_review` | Keep separate. Preference, customer account setup and credit review can be input requirements for a particular action but are not synonyms for qualification. |

The current qualification object does not prove the full target model. Context, condition storage and coverage groups already exist; immutable revision guarantees, pinned membership evaluation, condition satisfaction and reproducible history require explicit verification and gap implementation. The design remains proposed until its approval record is complete.

### 22.4 Restriction — current prohibition control and required evolution

| Design concern | Existing DDL/support | Required treatment |
| --- | --- | --- |
| Partner restriction/block | `control.business_partner_block` | Current prohibition authority, including its effective/lift lifecycle, operation/reason catalog and existing scope dimensions. It remains independent of qualification: a valid qualification never cancels a matching restriction. |
| Guarding and catalog controls | `control.trg_guard_business_partner_block`, related constraints/indexes, `control/12_business_partner_control_reference_seed.sql` | Reuse lifecycle guarding, catalog seeding and audit conventions. A hold may be activated only where the executing capability can enforce it. |
| Target-bound restrictions and exceptions | Existing target/context fields and scope sealing; enforcement extensions required | Reuse `restriction_mode`, typed target references and operation arrays. Direct target equality is not downstream lineage enforcement. Verify target continuity, action-class/version semantics, release/resumption, authorized exceptions and immutable audit support before activation. |
| Restriction evaluation | Shared context/scope/direct-target matcher exists; full ordered evaluation remains required | Current reader retains matches and unresolved-context candidates conservatively. Implement and prove downstream lineage and ordered passes before final eligibility composition; early exits require the truncated receipt in section 15. |

### 22.5 Transaction and context authorities — existing document-side facts

The following existing document tables are the observed candidates for the RFP → award → commitment/contractual execution → receipt/invoice/payment chain. This inventory does **not** declare that every `document.commitment` is a legal contract or that its current commands satisfy the reservation model. QP-00 procurement and finance owners must identify the authoritative document type, lifecycle commands, action clocks and limit authority before QP-05 enables contract-bound eligibility.

| Operational context | Existing DDL authority | Eligibility use |
| --- | --- | --- |
| Sourcing/RFP and invitation | `document.sourcing_event`, `document.sourcing_event_company`, `document.sourcing_event_demand`, `document.business_partner_invitation` | Determines invitation/participant context. Active registration may permit invitation subject to policy; it does not establish purchasing/payment authorization. |
| Award and downstream lineage | `document.sourcing_event_award`, `document.sourcing_event_award_allocation`, `document.sourcing_event_intercompany_allocation` | Provides award context and observed linkage toward an `output_commitment_id`. Preserve the exact award/allocation/version reference in an event-specific qualification or restriction. |
| Commitment/contract candidate and lines | `document.commitment`, `document.commitment_line`, `document.commitment_release_allocation` | Candidate authority for company, supplier, line/category, value and released allocations. Owner validation is required before it becomes the contractual eligibility authority or reservation ledger described in section 11. |
| Purchase request/order confirmation | `document.purchase_requisition`, its line/staging objects, `document.purchase_order_confirmation`, `document.purchase_order_confirmation_line` | Source/action context for demand and order confirmation. Evaluate a line against its resolved company, partner, commodity/category, document lineage and business instant. |
| Receipt/service acceptance | `document.receipt`, `document.receipt_line`, `document.service_sheet`, `document.service_sheet_line` | Goods/service acceptance gates use the same resolved lineage but may have a different action class than invoice or payment. |
| Invoice and matching | `document.purchase_invoice`, `document.purchase_invoice_line`, `document.invoice_match_case` | Invoice posting/matching must evaluate separately from receipt. A performance restriction can, for example, allow receipt yet block invoice posting if the policy and restriction action class say so. |
| Settlement | `document.payment_entry`, `document.payment_entry_allocation` | Payment eligibility is independently evaluated at the settlement action. A contract-bound approval may permit only matching allocations while a payment-specific restriction blocks settlement without retroactively changing receipt history. |

### 22.6 Eligibility, policy and receipt extension boundary

No existing table in this inventory is asserted to be the complete action/context-specific eligibility engine. The post-lock DDL ADR must define a normalized, tenant-isolated extension using the existing partner, setup, qualification, restriction and document identifiers as foreign references. It must cover at least the following logical records; final physical names, keys and partitioning are an ADR decision.

| Logical record | Responsibility | Must not duplicate |
| --- | --- | --- |
| Qualification identity and revision | Stable qualification identity; immutable approved revision, context, coverage snapshot, conditions, evidence/risk/classification references and review history | Partner facts, commercial-role records or certificate bodies |
| Restriction identity and revision/target | Scoped prohibition, target/lineage binding, action classes, effective period, lift/resumption and authorized exception history | A generic unscoped “blocked” flag |
| Policy/version and policy applicability | Versioned tenant/action policy, pre-activation/transition state, requirement composition and dependency declarations | Hard-coded eligibility rules in individual transaction services |
| Operational eligibility receipt | Immutable request/action/context snapshot, policy/restriction/qualification versions, outcome, reasons, evaluated/truncated gates, actor and correlation/idempotency data | Live protected values or a mutable status field on a partner |
| Context and dependency snapshot/set | Resolved company/organization/category/geography/document/lineage and reusable immutable member-set references needed for replay | Cross-tenant shared decision authority or unpinned reference mappings |
| Work/remediation linkage | Required evidence, risk review, workflow item and completion evidence where result is Requirements pending | A bypass around the existing governed workflow services |

The physical model must enforce tenant/partner consistency, referential integrity, scope-mode validity, effective-period rules, stable version references, RLS/grants, indexes for the evaluation path and append-only/audit semantics appropriate to each record. It must also preserve legal hold, retention, purge and receipt replay rules from sections 15–16. A new table is justified only where the existing authority cannot represent the required immutable decision, target, policy or receipt semantics.

### 22.7 Current DDL source map and implementation rule

The primary DDL sources are [master tables](../../../server/db/ddl/planes/neon/master/03_tables.sql), [payment-instrument integrity](../../../server/db/ddl/planes/neon/master/14_payment_instrument_integrity.sql), [shared bank master](../../../server/db/ddl/common/shared/03_bank_master.sql), [role-free commodity classification](../../../server/db/ddl/planes/neon/master/29_partner_commodity_classification.sql), [control tables](../../../server/db/ddl/planes/neon/control/03_tables.sql), [control functions](../../../server/db/ddl/planes/neon/control/07_functions.sql), [control constraints](../../../server/db/ddl/planes/neon/control/05_constraints.sql), [indexes](../../../server/db/ddl/planes/neon/control/06_indexes.sql), [triggers](../../../server/db/ddl/planes/neon/control/08_triggers.sql), [RLS](../../../server/db/ddl/planes/neon/control/10_rls.sql), [grants](../../../server/db/ddl/planes/neon/control/11_grants.sql), [control reference seed](../../../server/db/ddl/planes/neon/control/12_business_partner_control_reference_seed.sql), and [document tables](../../../server/db/ddl/planes/neon/document/03_tables.sql).

Before QP-01 chooses a new physical schema, verify the actual target database through `pg_catalog` and `pg_indexes`, not only repository searches. Capture object definitions, constraints, indexes, functions, triggers, RLS/policies and grants, together with database/instance identity, inspection time, source revision (and dirty-tree artifact hashes where applicable), applied build/release identity and drift disposition. Edited DDL is not proof of an applied schema. Unverified inventory entries remain source candidates. Then produce a line-by-line DDL crosswalk: source object, authoritative owner, reuse/extension/deprecation decision, migration/backfill strategy, compatibility surface, RLS/grant impact, retention impact and acceptance evidence. No target extension may weaken existing tenant isolation, maker/checker rules, protected-data controls or document-domain ownership. No existing partner/setup/transaction table may gain a mutable global “eligible” flag: operational eligibility is derived for the requested action and context, then recorded as a receipt.
