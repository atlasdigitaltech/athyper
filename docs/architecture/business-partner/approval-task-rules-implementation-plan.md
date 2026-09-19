# Task authority, approval rules and escalation — implementation plan

Date: 2026-09-15  
Status: implementation in progress; see the [checkpoint and remaining work](approval-task-rules-implementation-status.md). No release acceptance is claimed.  
Pilot: internal supplier onboarding in NEON, with reusable platform contracts and Studio authoring.

## 1. Outcome and scope

Combine the two supplied designs into one governed task model: **to-do performs work; review assesses evidence; approval authorizes an outcome**. A case owns their shared context, evidence and lifecycle. Task type, decision authority, assignment, edit permission and escalation behavior are separate published properties.

The first release must support explicit task authority, deterministic edit/filter rules, controlled correction, information requests, and supervisor notification/consultation/reassignment. It must preserve the existing supplier invariant: a material correction creates a fresh attempt in the same run and restarts all selected reviews against a new pack.

Deliver in three independently qualified releases:

| Release | Included | Acceptance boundary |
| --- | --- | --- |
| R1 — Governed tasks and safe rules | Packages W0–W11 below: task types/authority, evidence completion, adverse findings, edit rules, full-review correction, candidate filters, information requests, notification/consultation/reassignment escalation, Studio/NEON integration and qualification | All listed R1 behavior works through owning APIs and real local services; no selective approval carry-forward |
| R2 — Selective reapproval | Dependency-scoped invalidation and explicit approval carry-forward within an unchanged profile/manifest | Separate work packages and evidence; not a hidden R1 gate |
| R3 — Additional supervisor approval | A predeclared conditional supervisor control, including joins, quorum and final-decision protection | Separate work packages and evidence; arbitrary editing of a running task graph remains unsupported |

Existing onboarding follow-up B (profile-changing rerouting/replacement runs) and C (commodity/industry fact semantics) remain separate. R2/R3 do not implicitly authorize B/C. Automatic business approval, unrestricted edit-and-approve, external supplier/MESH intake and rollout to unrelated business domains are excluded from R1.

This document is a plan, not evidence that its proposed commands, fields or screens already exist. No business records, permissions, published policies or running attempts are changed by preparing it.

## 2. Verified reuse inventory and gaps

Repository review establishes these starting points. W0 must confirm exact storage/route details before implementation.

| Existing owner / source | Reuse | Gap addressed here |
| --- | --- | --- |
| [Task approval runner](../../../server/packages/platform/workflow/src/task-approval-runner.ts) | Domain-free runner, staged votes, maker exclusion, deduplication, quorum rejection | Currently rejects conditional stage rules with `TASK_RULE_UNSUPPORTED`; no assumption that generic conditional execution already works |
| [Supplier task owner](../../../server/apps/platform-host/src/composition/supplier-process-tasks.ts) | Exact attempt/task/workflow coordinates, document gating, review vs approval, final case decision | Explicit per-task negative-action authority, to-do completion, findings, information requests and governed reassignment |
| [Workflow authoring](../../../server/packages/platform/workflow/src/authoring.ts) | Immutable definitions, version/hash, basic stage validation | Typed task/rule contracts, cross-artifact control validation, previews and compatibility checks |
| [Policy service](../../../server/packages/platform/policy/src/policy-service.ts) | Existing expression evaluator, exact publication evaluation, outcomes and traces | Purpose-scoped typed adapters; existing global action precedence cannot substitute for edit/filter semantics |
| [Process coordinates](../../../server/packages/contracts/governance/src/process-selection.ts) | Tenant/scope, selection, run, attempt, snapshot, manifest and task bindings | Assignment generation and new command/evidence bindings |
| [P5 correction](internal-supplier-onboarding-p5-implementation.md) | Atomic return/cancellation, immutable history, same-run new attempt, full re-review, profile-change refusal | Authorized recall, edit impact evaluation, contributor tracking |
| [P4 documents](internal-supplier-onboarding-p4-implementation.md) and [P6 completion](internal-supplier-onboarding-p6-implementation.md) | Render/scan/storage provenance, domain readiness and distinct completion owners | Link new tasks to existing owners; do not create checkbox substitutes |
| [SLA automation](../../../server/packages/platform/workflow/src/sla-automation.ts) and [P7 communications](internal-supplier-onboarding-p7-implementation.md) | Durable reminders, outbox, recipient access checks, delivery deduplication | Supplier process items currently retain voting ownership during escalation; new reassignment must use task owner, not generic SLA row mutation |
| [Studio designer](../../../packages/planes/studio/business-partner/src/workflow-designer.tsx) | Existing workflow authoring surface | Task authority, four rule sets, test fixtures and result explanation |
| [NEON task actions](../../../packages/planes/neon/business-partner/src/supplier-process-correction.tsx) | Assigned review/approval, return/reject and correction UI | Task badges, evidence/checklists, blockers, information exchange, escalation and edit-impact explanation |

Current supplier reviews expose return/reject with a required reason. R1 must preserve those capabilities for legacy pinned definitions. New definitions may instead grant a specialist only adverse-finding authority. This is an explicit publication change, not a silent reinterpretation of existing tasks.

## 3. Non-negotiable invariants

1. A to-do or review never approves a case. Each supplier profile has exactly one final-decision task; intermediate approvals affect their own scope only.
2. Approval, materialization, activation and closure remain distinct, with existing document/readiness owners enforcing gates.
3. Submitted business content and generated evidence are immutable. Reviewers decide against exact snapshots and document versions.
4. UI visibility is not authority. Every command rechecks current actor permission, tenant/company scope, assignment, task/attempt state and expected versions.
5. No-result, ambiguous rule results, missing required facts and insufficient eligible quorum cannot authorize work or approve a proposal.
6. Published rule revisions and execution semantics are pinned. Later publication does not silently change an active attempt. Live access, delegation validity and trusted controls are rechecked at command time.
7. Saving a correction does not submit it. R1 material corrections require explicit validation and resubmission, a new attempt and pack, and full re-review.
8. Completed decisions, old snapshots and ready documents remain historical. Cancelled or superseded work cannot receive new votes or satisfy new gates.
9. Mutations commit state, evidence, command receipt and outbox intent atomically. Delivery/rendering executes after commit and cannot invent a business outcome.
10. No candidate filter, supervisor hierarchy, delegation or administrator role can weaken mandatory controls or confer implicit decision authority.

## 4. Published task model

### 4.1 Type and authority

Use a common task contract with a discriminated execution configuration. Map the existing preparation projection to its supported completion owner; do not simply rename all preparation into manually completable to-dos.

| Property | To-do | Review | Approval |
| --- | --- | --- | --- |
| Purpose | Produce a deliverable | Assess named facts/evidence | Authorize a defined proposal |
| Positive action | `complete_task` | `accept_review` | `approve_step` (adapter may retain existing `approve` wire command) |
| Output | Validated evidence or authoritative service result | Checklist, findings and evidence references | Version-bound decision |
| Default data editing | Authorized draft fields | Findings/comments only | Decision/comments only |
| Negative/exception actions | Report blocker; request assistance | Adverse finding; optional case return/reject authority | Return/reject if explicitly granted |
| Case-final authority | Forbidden | Forbidden | Only published final-decision binding |

Separate fields must express: business responsibility, mandatory/optional status, input field paths and evidence purposes, dependencies, completion predicate, allowed actions, outcome scope, reviewer selectors, quorum, independence requirements, edit-policy reference, filter-policy reference, SLA/escalation-policy reference and information-request policy.

All references include stable ID, revision and artifact hash. Catalog compilation rejects missing owners/references, duplicate codes, dependency cycles, conflicting final authorities, forbidden actions on task kinds, impossible configured quorums, unknown field paths and unsupported execution capabilities.

Three serial approvers may be levels of one task when they share a responsibility. Procurement review, compliance review and business authorization should be separate tasks because their evidence and authorities differ. Personal reminders are outside the mandatory case graph and cannot satisfy gates.

### 4.2 Completion and findings

To-do completion validates a deliverable through a published completion port. For example, uploading a certificate requires the correct attachment version, scan status and permitted evidence association. Company/bank readiness comes from its existing domain owner. A to-do completion button cannot update readiness directly.

Review completion requires all mandatory checks and resolution of blocking findings. Findings have scope, severity, evidence, author, status and resolution evidence; they are append-only in history. The actor authorized to resolve a finding is configured separately from its author. Reopening/resolving must not erase the original finding or automatically approve a task.

An adverse finding blocks the configured task/dependents and creates an actionable exception for its owner. It is not equivalent to rejecting the case. Return/reject are case lifecycle commands and require explicit task authority. Existing definitions retain current negative-action authority through the compatibility mapping.

## 5. Four rule sets and deterministic evaluation

### 5.1 Approval rules

Define mandatory responsibilities, order/dependencies, levels, quorum, final-decision designation, applicable scope and minimum controls. R1 uses the selected profile's declared graph. It does not activate arbitrary conditional stages or remove tasks at runtime.

### 5.2 Edit rules

Avoid one overloaded action enum. Publish three separate results: **permission**, **change impact** and **submission behavior**.

| Authoring label | Typed meaning | R1 execution |
| --- | --- | --- |
| Edit not allowed | Permission denied | No mutation; explain correction option |
| Edit without reapproval | Allowed only for explicitly separate, non-approval metadata | Version/audit metadata through its own owner; submitted payload/pack unchanged |
| Edit requires reapproval | Allowed correction; impact requires full review | Create/use a correction draft; resubmission creates a new attempt and pack |
| Edit with resubmission | Authorized correction; explicit submit required | Same safe R1 mechanism; label describes submission behavior, not a weaker impact rule |

No R1 material edit is applied to an active submitted snapshot. Both material-edit labels require explicit resubmission; there is no implicit submit on Save and no single save-and-approve command. This resolves the overlap in the supplied design.

Compute a normalized server-side diff against the correct base revision, including nested fields, array members, deletion/null distinctions, referenced attachment changes and derived approval facts. Clients cannot supply an authoritative impact result. Evaluate actor, state, scope, field paths, old/new values and trusted controls.

Use the existing evaluator through a purpose-specific adapter. For edit evaluation, collect applicable typed outcomes and apply a defined conservative reducer: any applicable deny blocks the patch; otherwise every changed path needs positive coverage; any material/unknown dependency requires full re-review. Uncovered fields deny editing, rather than becoming implicitly writable. Mandatory protections execute independently of allow rules. Validate payload schemas and consistent action envelopes; never use generic `permitted` alone.

Resolve exactly one applicable published definition per purpose and scope, with its evaluation mode declared in the bundle. Edit policies require collection of applicable outcomes, so a first-match definition that could hide a protective rule is rejected. Candidate filters use their declared transform order; escalation schedules select a unique action per trigger/level. Tied priorities, overlapping scope definitions and conflicting results must produce compilation errors or explicit unavailable results when they can only be detected at runtime. Preserve the existing supplier selection policy's first-match semantics unchanged; these adapters do not globally modify policy precedence.

Distinguish missing policy configuration from an explicit deny: configuration absence returns unavailable and blocks the operation. Preview includes applicable rule IDs, revision/hash, covered paths, required correction behavior and reason. Commit reevaluates under lock; a preview is not an authorization token.

Track all material contributors for the new attempt, not just its original creator. Apply the published maker/checker exclusions to those contributors. If approver 3 contributes a material amendment, they cannot be the independent checker for that amendment; resolve an eligible substitute or block with an assignment exception.

### 5.3 Candidate filter rules

Pipeline: required responsibility → scoped candidates → current permission/status checks → valid delegation → maker/conflict exclusions → deduplication within responsibility → independence validation → quorum validation → assignment evidence.

Use an explicitly ordered pipeline of typed transforms, not whichever generic policy outcome happens to win. Every transform retains before/after identities and reason codes in protected evidence. Missing filter configuration blocks; an explicitly published identity/no-op filter is valid. Mandatory exclusions still apply to a no-op filter.

Deduplication must not collapse Procurement and Finance responsibilities, merge watcher and voter authority, or count one person twice toward independent-person quorum. Delegation is scoped, time-limited and auditable; delegator/delegate cannot supply duplicate votes for the same responsibility. R1 supports a bounded single-hop delegation resolution; ambiguity or loops produce an exception.

Pin the required threshold when a stage is activated. Later permission loss must not reduce an all/percentage quorum until remaining people can pass it. Block and resolve missing eligible seats through governed assignment; recheck the voter at command time. No empty-candidate auto-approval, automatic business approval or cross-responsibility retain-first/last filter in R1.

### 5.4 Escalation rules

Publish triggers (manual, due threshold, unresolved blocker, information overdue), business calendar/timezone, recipients, mode, bounded escalation depth, repeat schedule, fallback and resolution owner.

| Mode | Effect | Release |
| --- | --- | --- |
| Notify | Alert an authorized recipient; task owner remains | R1 |
| Consult | Open linked advisory exchange; no voting authority transfer | R1 |
| Reassign | Eligible replacement takes an outstanding assignment; prior assignee loses that item's authority | R1 |
| Add approval | Activate a predeclared additional control | R3 |

Manual escalation requires a reason; automatic escalation records a system reason and exact trigger occurrence. Resolve the supervisor from an authoritative, effective-dated organization relationship. A delegate is not assumed to be a supervisor. If that relationship is absent in the pilot, configure an explicit governed supervisor selector; do not infer from usernames or titles. Multiple matches, self-supervision, cycles, out-of-scope recipients or insufficient permission go to a configured exception queue.

Reassignment changes only an outstanding seat, preserves task responsibility/quorum and completed votes, increments an assignment generation, and commits assignment history/outbox together. It does not replace an entire approval task or change the selected profile. A replacement who conflicts with an existing voter is rejected where independence is required.

SLA dates are calculated from task activation using the pinned calendar revision/timezone and persisted as UTC instants. R1 information waits pause that item's decision clock with a maximum wait duration and separate response deadline; they do not indefinitely pause the overall case deadline. Notify/consult do not pause the decision clock by default. Reassignment preserves elapsed time and due date, avoiding endless SLA resets. Alternate schedules require explicit published configuration and tests.

## 6. Correction and information lifecycle

### 6.1 Return and preparer recall

Existing return remains an authorized reviewer command. Add `request_correction` for an authorized preparer who cannot edit submitted data. Add a separate scoped `recall_for_correction` permission: when granted by the published policy, recall atomically ends outstanding work and opens the correction draft; otherwise the request routes to the current authorized reviewer/case owner for a return decision. Ownership alone is insufficient permission.

Lock the case/current attempt before recall, return, reject or resubmission. Preserve the same cancellation coverage as P5: outstanding items/stages/tasks, pending document jobs and render leases. Save and validation operate on the returned draft only. Resubmission reuses exact pinned policy/profile/manifest semantics, rechecks trusted minimum controls and creates one new attempt on replay. Profile changes create no new work and retain the explicit close/new-request path.

### 6.2 Information request and consultation

An information request records asker, authorized respondent, exact task/attempt/snapshot, question, due date and status. The parent work item is waiting for information, not completed or returned. Allow one blocking exchange per work item in R1; discussion entries can be multiple and append-only.

The respondent answers through a scoped command. The assigned reviewer explicitly accepts the response to resume; responding never casts a vote. Other independent tasks may proceed, but the waiting item cannot vote and joins requiring it remain blocked. A count-quorum completion by other eligible items cancels an exchange whose parent item is cancelled.

Answers are contextual evidence linked to the original snapshot. If the answer changes a business fact or introduces evidence required for approval, convert through Return for changes; do not treat a new certificate as a harmless chat attachment. Resolve document access/scanning through the existing owner. Return, rejection, cancellation or supersession closes the exchange and suppresses old reminders. Reassignment transfers control of an open exchange to the new assignee and leaves its history intact.

## 7. API, storage and transaction contracts

Names below are proposed operations, not claims of existing routes. W1 fixes final names and extends the current task routes, contracts and BFF allowlist together.

| Operation | Owning service | Required behavior |
| --- | --- | --- |
| Task detail/actions | Task orchestration + domain adapter | Type, authority, dependencies, exact coordinates, allowed actions and denial reasons |
| Complete to-do / record or resolve finding | Task owner + completion port | Validate evidence and allowed transition; never use generic completion to bypass voting |
| Accept review / approve / return / reject | Existing task/lifecycle owners | Preserve exact bindings and add published action-authority enforcement |
| Edit preview / correction request / recall | Request and lifecycle owners | Server diff, published policy evaluation, explicit editability transition |
| Open / respond / resolve information exchange | Task owner | Scoped access, waiting/resume behavior, durable response history |
| Escalate / reassign / resolve assignment exception | Task owner | Supervisor/candidate checks, assignment generation, unchanged control obligations |
| Publish / validate / simulate rule bundle | Existing authoring/publication owners | Immutable references, typed compiler validation, durable validation report |

Every mutation includes an idempotency key and relevant expected versions. Decision/assignment operations bind tenant and organization/company scope, case, run, selection, attempt, snapshot, manifest, cycle task, workflow request/stage/work item, task definition and rule bundle revisions, and assignment generation. Actor identity comes from verified context, not request data. Task evidence operations that have no workflow stage use a discriminated coordinate type rather than fake workflow IDs.

Reusing a key with the same normalized request returns its receipt; different payload returns conflict. Read authorization still applies to replay. Return structured validation, denial, stale-version, configuration-unavailable, unresolved-assignment and invalid-transition results; use stable codes with UI explanations.

Extend existing storage where ownership fits; add durable records only for missing concepts: task action authority/version, findings, information exchanges, correction requests, assignment history/exceptions, material contributors, rule evaluation evidence and escalation occurrence receipts. W0 produces the concrete table/column map. Do not add a parallel case or voting database. Evidence includes typed inputs/hash, rule IDs/revisions, matched outcomes, actor, timestamp, source/target coordinates and normalized diff; protect sensitive values with existing access/retention controls.

Define consistent lock order (case → current attempt → task/workflow/stage → work item → linked exchange/assignment record) across command owners. Stage-level serialization protects quorum; case-level serialization protects closure/correction races. Retry deadlocks through existing bounded transaction support. The database must reject stale callbacks and unauthorized state changes even where an alternative generic route is invoked.

Key race outcomes:

| Race | Required result |
| --- | --- |
| Approve vs reassign same item | One commits first; loser gets stale state; old assignee cannot vote after transfer |
| Final approval vs return/recall | One valid lifecycle transition; loser cannot reopen or finalize obsolete work |
| Two votes satisfying quorum | One stage advance, no duplicate downstream items |
| Response vs return/cancel | Historical exchange may be read; late mutation cannot resume a closed attempt |
| Escalation/reminder vs task completion | Completed task remains completed; obsolete notification suppressed |
| Two resubmissions | One new attempt/pack/task set, replay returns identical coordinates |
| Publication vs running command | Running command uses pinned revision and current authorization, not latest policy head |

## 8. Studio and NEON experience

Studio adds task responsibility/type/authority, evidence completion configuration and separate tabs for Approval, Edit, Candidate Filters and Escalation. Include enabled status, explicit priority/order, condition builder, field selector, action parameters and examples. Moving a rule changes a draft only; publishing creates an immutable revision. R1 must reject unsupported selective restart, auto-approve and add-approval actions at API/compiler level, not merely hide them.

Simulation uses the same typed adapters as runtime with controlled facts. Show before/after candidates, each exclusion reason, quorum, edit coverage, restart scope, supervisor target, SLA dates and missing configuration. Require positive, negative, overlap and missing-fact fixtures before publication. No mutation, grant or task creation from preview.

NEON uses one task shell with badges **TO-DO**, **REVIEW**, **APPROVAL**, **FINAL APPROVAL** and **SYSTEM GATE**. Show scope, required evidence, what completion changes, assignee, due/wait status, escalation owner and prerequisites above actions. Buttons come from owning API capabilities. Explain review acceptance versus final case approval.

Add editable findings/checklists, blocker reporting, reason-required return/reject, information exchange, escalation history and authorized assignment controls. Correction UI previews the diff and states: “Saving does not restart reviews. Resubmitting creates a new review pack and restarts all reviews.” No unrestricted restart/no-restart toggle. Historical links show old version/attempt and require explicit navigation to current work; they never silently retarget a vote.

The 360 Requests and Activity tabs link to exact task/attempt evidence. Activity shows task type, business action, actor display name with stable identity available, reason, timestamp and outcome; redact unavailable identities appropriately. The 360 screen is a history/entry surface, not a separate decision owner. Existing request form views and direct APIs must enforce identical edit rules.

## 9. R1 implementation work packages

Each package produces a reviewable artifact and observable exit evidence. Dependency ordering reflects security and transaction ownership, not just screen availability.

| Package | Work and primary owner | Dependencies | Observable exit condition |
| --- | --- | --- | --- |
| W0 — Baseline and concrete mapping | Inventory contracts, DDL, permission/delegation/supervisor/calendar facts, legacy catalogs, routes, UI and qualification tools | None | Reuse map, exact change list and fixture roster; absent dependencies have explicit governed configuration paths |
| W1 — Shared contracts and compiler | Workflow/governance/control-admin contracts; task authority, rule envelopes, coordinates, errors and capability versions | W0 | Compiler rejects unsafe type/action combinations, ambiguous bindings, unknown fields, invalid graphs and unsupported features; legacy mapping fixtures pass |
| W2 — Storage and command foundation | Canonical DDL/RLS/grants, evidence/receipts, lock/version protocol and domain ports | W1 | Real database replay, stale-command, cross-tenant and transaction-rollback tests pass; generic commands cannot bypass owner |
| W3 — Task outcomes and evidence | To-do completion, findings, explicit return/reject authority; preserve final-decision owner | W2 | Real commands distinguish work/review/approval; required deliverables/findings block progression; legacy supplier action matrix preserved |
| W4 — Candidate filters and assignment exceptions | Existing resolver/runner adapters, scoped delegation, independence and quorum evidence | W1–W3 | Empty/filtered/duplicate/conflicting candidates block or resolve correctly; no quorum weakening; reassignment candidate port available |
| W5 — Edit rules and correction | Policy adapter, normalized diff, contributor tracking, correction request/recall, existing P5 resubmission | W3–W4 | Both forms/API reject active payload edits; allowed metadata isolated; correction produces one new attempt/pack and full re-review; profile-changing submission produces no new work |
| W6 — Information and consultation | Exchanges, response access, explicit resume, findings integration and bounded waiting | W3–W4 | Question/answer resumes same unchanged task without duplicate votes; changed approval facts require correction; return/cancel and quorum completion close stale exchanges |
| W7 — Supervisor escalation and SLA | Governed hierarchy selector, notify/consult/reassign, calendar/deadline behavior and stale occurrence checks | W4, W6 | Eligible supervisor transfer works; old vote fails; missing/looping supervisor raises exception; completed votes and quorum remain intact |
| W8 — Communications and operations | Existing outbox/notification owners; new milestone templates, recipient access, exception queues and metrics | W3–W7 | One logical notice per eligible recipient/channel/occurrence; local capture/inbox receipts; stale suppression and delivery failure leave business state unchanged |
| W9 — Studio publication | Existing workflow designer and publication owners; four rule sets, tests, previews and immutable bundles | W1; acceptance against W3–W7 | Publish/replay exact bundle; preview/runtime parity; changing a draft/head does not retarget active work |
| W10 — NEON task integration | Common task shell, both request forms, findings, information, correction, escalation and 360 history | W3–W9 | Browser journeys use owning APIs; correct actions and explanations by task/authority; deep links remain version-bound |
| W11 — Local qualification and release | Direct canonical build, fixtures, service/DB/browser evidence, compatibility and runbook | W0–W10 | All R1 acceptance rows below pass with declared boundaries; fresh reproducible build; no unexplained open R1 gates |

Design W8/W9/W10 contracts in W1 so backend packages expose the required evidence. UI implementation can proceed after contracts stabilize, but acceptance depends on live owning APIs. Do not postpone negative-action authority or assignment checks until after UI delivery.

## 10. Qualification matrix and fixtures

Use the existing P9 harness as the starting point. Add separate fixtures and report names; preserve historical P0–P9 receipts. Require distinct preparer, reviewer 1, reviewer 2, final approver and supervisor identities for real three-level/independence checks, plus conflicted, out-of-scope and revoked candidates. Two existing DEV users alone cannot prove all these scenarios.

| ID | Scenario | Required evidence |
| --- | --- | --- |
| Q01 | To-do/review/intermediate/final authority | Service + PostgreSQL + browser: first three cannot finalize case; final approval remains distinct from activation |
| Q02 | Deliverable and adverse finding | Missing/unscanned document and unresolved finding block; domain completion callback is authoritative; reviewer without reject grant cannot close case |
| Q03 | Required reasons and operation access | Return/reject/manual escalation reject blank reasons; wrong actor/scope/attempt is denied through direct API as well as UI |
| Q04 | Three-level correction | Two approvals → third returns → preparer saves without task creation → resubmits → new pack and all three reviews restart; old decisions remain history |
| Q05 | Edit policy | Mixed/nested/deleted/attachment changes, unknown path, missing config and privileged actor tested; metadata edits never mutate submitted snapshot |
| Q06 | Contributor independence | Material editor excluded from prohibited checker seats; insufficient independent reviewers creates exception, not silent bypass |
| Q07 | Candidate filtering | Duplicate within responsibility, same user across distinct responsibilities, delegation expiry, permission revocation, all/count/percentage quorum and empty candidates |
| Q08 | Information wait | Same task/snapshot resumes after accepted answer; no implied vote; changed facts require correction; bounded timeout, parallel task/quorum and stale response behavior |
| Q09 | Supervisor modes | Notify/consult do not grant a vote; reassign invalidates old authority; self/missing/ambiguous/cyclic/ineligible supervisor handled explicitly |
| Q10 | Concurrency/replay | All races in section 7 under real concurrent database transactions, including deliberate failures before commit |
| Q11 | Policy publication | Exact old revision after new publication; missing/ambiguous/unsafe results rejected; preview equals commit evaluation for identical facts/version |
| Q12 | Document and completion regression | Actual renderer/scanner/storage, authenticated download and content hash; all three purposes and unchanged materialization/activation gates for Basic/Standard/Enhanced |
| Q13 | Communications | Real inbox and Mailpit; replay uniqueness, stale suppression, revoked recipient access and failed transport with unchanged business outcome |
| Q14 | UI/entry coverage | Studio publication; NEON both form views; task badges/actions; 360 entry/history; historical links; scoped supervisor screens |
| Q15 | Compatibility and clean build | Old pinned attempts retain action semantics; new bundles work; ordinary non-supplier tasks unaffected; clean canonical build/publication replay succeeds |

Tests layer contract/compiler fixtures, focused service tests, real PostgreSQL constraint/RLS/race checks, owning API journeys, and browser evidence. Controlled clocks/ports are suitable for fault and timing tests, but final successful document/download and notification journeys require actual local services. Add calendar tests for holidays, timezone boundaries and daylight-saving transitions where the configured calendar supports them.

Capture source/artifact hashes, exact policy/catalog revisions, fixture identities/scopes, before/after coordinates, API receipts, database assertions, browser screenshots, document checksums and delivery IDs. Redact credentials, protected field values and signed URLs. Report passed/failed/skipped separately; mocks, stale screenshots and previews do not count as live qualification. Authentication or missing grants leave named acceptance rows open rather than declaring success.

## 11. Local build, compatibility and operations

Follow the established local-build approach: update canonical definitions, DDL, constraints, RLS/grants and manifests directly; no migration scripts. Add explicit fresh-database and existing-local compatibility checks. Never rewrite immutable published artifacts or active attempt manifests to make an old attempt look upgraded.

Introduce a capability/schema version on new bundles. Absence selects a documented legacy adapter preserving current supplier actions and full-review correction, rather than enabling new features by default. New executions opt into the new bundle. Incompatible extensions fail publication/launch before work is created. Review actual old DDL constraints and generic workflow routes during W0/W2, not just TypeScript compatibility.

For rollback, disable new publication/selection and retain the runtime reader/executor for already-pinned new bundles. Reverting to a binary that cannot understand active bundle versions is not a safe rollback. Complete/cancel those attempts through supported commands or retain a compatible binary. Do not delete evidence or mutate history.

Runbook covers unresolved assignments, missing supervisor/calendar configuration, overdue information, unavailable pinned artifacts, document failure and notification failure. Metrics include age by task type, assignment exceptions, information-wait age, escalation/reassignment counts, stale-command rejection, correction counts and delivery suppression. Operations may repair configuration or invoke authorized commands; they may not force approval by editing task status.

Use scoped fixture principals and supported local authorization provisioning. Do not reuse expired historical temporary grants or silently opt real users into communications. Keep captured delivery local and require any additional live access/consent through established supported authorization paths. This plan grants no new permissions.

## 12. Follow-up release plans

### R2 — Selective reapproval within an unchanged profile

| Package | Work | Exit condition |
| --- | --- | --- |
| S0 | Publish task input/evidence dependencies, derived facts and independence boundaries | Complete dependency graph; unknown inputs force full re-review |
| S1 | Compute changed-input impact and downstream closure, including parallel joins and final decision | Deterministic impact plan; no affected task silently retained |
| S2 | Create explicit carry-forward evidence into the new attempt | Original vote remains bound to original snapshot; new record states source decision, unchanged inputs, policy/reason and eligibility basis; no copied or backdated vote |
| S3 | Rebuild invalidated tasks/pack bindings, show retained/restarted reviews and qualify races | Real service/DB/browser evidence for partial changes, changed documents, revoked actors and joins |

Recheck whether a prior decision remains usable under current controls, distinct from whether its author may cast a new vote. Required new independent checking cannot be bypassed through carry-forward. Conservatively restart the final-decision task for every changed submitted business snapshot. Profile/manifest changes still use follow-up B, not selective reapproval.

### R3 — Predeclared additional supervisor approval

| Package | Work | Exit condition |
| --- | --- | --- |
| E0 | Define conditional-control semantics and extend the currently unsupported runner capability | Compiler/runtime agree on allowed conditions, exact pinned branch and minimum controls |
| E1 | Publish dormant supervisor control and its dependencies before execution | Manifest represents possible added control; no runtime graph mutation or second final authority |
| E2 | Activate exactly once on authorized escalation, record trigger/evidence and block required joins | Existing valid votes retained; original final task waits for supervisor control; no auto-approval |
| E3 | Qualify escalation vs final vote, repeated trigger, no eligible supervisor and correction | Atomic finalization checks ensure a required supervisor control cannot be skipped |

R3 cannot append tasks after final approval. A new business change after approval belongs to its governed change lifecycle. Unplanned replacement runs/rerouting remain follow-up B.

## 13. Implementation start and completion definition

Start with **W0**, then land **W1/W2** before enabling any new actions. W0 must produce the exact schema/route/permission map, supervisor and calendar source choice, explicit legacy/new catalog mapping, and multi-principal qualification roster. These are implementation discovery outputs, not reasons to assume missing platform capabilities exist.

R1 is complete only when W0–W11 and Q01–Q15 have reviewable evidence, the three supplier profiles preserve their existing gates, and the runbook identifies deployment/compatibility boundaries. R2, R3, onboarding B and onboarding C remain visibly separate. Product build authorization and subsequent implementation status should be recorded alongside this plan without changing its initial proposed status into an unsupported completion claim.
