# Approval task rules — implementation status

Date: 2026-09-15  
Status: implementation and DEV deployment in progress; full R1 acceptance remains open.  
Plan: [task authority, rules and escalation](approval-task-rules-implementation-plan.md).

## Bound DEV release and indexing recovery — 2026-09-15 02:14 UTC

The requested live task-control binding and document indexing correction are deployed and qualified. API, worker, scheduler, NEON and Studio are healthy. This closes those two outstanding items; the wider R1 follow-ups listed below retain their own scope.

The current independently published release is `01a0a2d3-d916-721e-a53e-cf13d0721afe`, activated at `2026-09-15T02:09:47.798Z`, on the existing CirrusAtlantic Operations / CirrusAtlantic UK supplier scope. All three profiles use manifest version 3 and edit policy `69514e2e-3bac-4ef7-b7ae-b2338516f60a`, version 2, hash `4ff4450703deae886a0f9b585d1c49ed58f00c8acdf7e1e6fc90c5339f64f925`. The original base publication, profile selection policy and accepted attempts are unchanged. The earlier version-2 release is retained as history.

Published behavior:

- Human review/approval tasks permit clarification, return for changes and rejection. Return/rejection retain mandatory reasons. Clarifications use a 48-hour response deadline with a bounded pause of the decision item's clock; the case clock continues.
- Returned requester corrections use explicit field-path coverage and full reapproval. Scope/requirement changes are denied. Unknown fields are denied. Authoritative field permissions, form validation and same-profile submission constraints still apply.
- An unanswered clarification owned by `catl.admin` can notify `catl.owner` as supervisor even though `catl.owner` owns the approval task. The published supervisor selector is `dev.bp.approvers.operating_organization`; the runtime requires exactly one eligible supervisor other than the respondent. No account, role membership or business permission grant was added.
- **Escalate pending response** requires a reason and sends a notice without transferring the response or vote. Approval stays blocked until the requester responds and the reviewer accepts the response. The same guarded command runs after the response deadline through the existing SLA maintenance worker. Notifications are deduplicated and recheck eligibility before delivery; answered or obsolete exchanges suppress stale notices.
- This response escalation is separate from transferring an approver's own assignment. It does not make self-reassignment valid or introduce a third approver. The live example covers an unanswered clarification; it does not establish a generic preparation-task supervisor hierarchy.

| Evidence | Result and boundary |
| --- | --- |
| [Bound release](../../../../governance/policy/reports/task-response-escalation-release-live.dev.json) | Real Studio browser authoring, seven fixtures, denied maker publication and independent publication of all three manifests. |
| [Final Studio controls](../../../../governance/policy/reports/task-response-escalation-controls-live.dev.json) | Deployed Studio loads the exact published hash and all eight human tasks expose the configured overdue-response supervisor role. |
| [Final profile journeys](../../../../governance/policy/reports/task-rules-final-journeys-live.dev.json) | Basic, Standard and Enhanced use version 3; each performs clarification, return, permitted correction, denied profile-change preview, resubmission to attempt 2 and full re-review. Nine real PDFs are rendered/scanned/downloaded and hash-verified. Earlier completed reviews are repeated. |
| [Final NEON browsers](../../../../governance/policy/reports/task-rules-final-browser-live.dev.json) | All three corrected attempts open in deployed screens, retain information history and download their review packs. |
| [Response escalation browser](../../../../governance/policy/reports/task-response-escalation-browser-live.dev.json) | Fresh Basic case `a1c7ba91-beb6-43dc-ac1a-bda93e64a6e9`: requester response escalates to the existing reviewer/supervisor; assignments stay unchanged, response remains open and approval blocked; requester answers, reviewer resumes and approves. |
| [Mailpit evidence](../../../../governance/policy/reports/task-response-escalation-communications-capture.dev.json) | Three actual captured emails—request, supervisor attention and answer—match durable delivery IDs, recipients and attempt links. Browser qualification also verifies one delivered inbox record for each. |
| [Deadline regression](../../../../governance/policy/reports/task-response-escalation-db.dev.json) | Real PostgreSQL commands with the actual worker role verify early denial, deadline discovery, one automatic escalation, preserved assignment/deadline, blocked approval and stale-notice suppression. Fixture deadlines and all writes roll back. This is not a live 48-hour elapsed-time claim. |
| [Deployed maintenance](../../../../governance/policy/reports/task-maintenance-live.dev.json) | Real queued SLA sweep completes through the deployed worker and its dedicated database credential. No live deadlines were altered. Document queue: 129 completed, zero active/waiting/failed at capture. |
| [Index recovery](../../../../governance/policy/reports/document-indexing-live.dev.json) | Recovered 89 existing failed extraction/indexing jobs; six known PDFs are searchable through the real Meilisearch adapter, with tenant and plane isolation. This does not claim a new search UI or BFF search route. |

Two runtime defects were fixed during qualification. The correction resolver now finds the exact accepted task release by its immutable manifest, instead of loading only the base catalog and falsely reporting a profile change. Meilisearch now uses a deterministic SHA-256 storage key for both upsert and deletion, so scoped logical IDs containing colons are valid backend identifiers. Replays retain the same key and distinct scoped identities remain distinct.

Validation: host, contracts, control-admin and both Next applications build; targeted checks pass (25 selection-service tests, 39 compiler tests, 22 search-adapter tests, 4 information UI tests, 2 task-route tests and 18 Studio tests). Direct canonical definitions were updated; no migration scripts were added. Deployment receipts and rollback images are recorded in [the deployment report](../../../../governance/policy/reports/task-rules-deployment.dev.json).

For manual testing, create a **new request** to use the latest manifest. During review, request clarification as `catl.owner`, leave the `catl.admin` response pending, enter a supervisor-attention reason and choose **Escalate pending response**. Check Mailpit/inbox as `catl.owner`. Respond as `catl.admin`, then accept the response as `catl.owner`. For material corrections use return → edit → save → resubmit → full re-review. Existing cases intentionally retain their accepted rules.

## Refreshed-session qualification — 2026-09-15 01:41–01:46 UTC

Both saved DEV NEON sessions (`catl.admin` and `catl.owner`) are authenticated. All five deployed services are healthy. Authentication is no longer an open qualification blocker.

Fresh cases were created through the owning APIs using the existing published Basic/Standard/Enhanced manifests. Concurrent submission replay selected one run/attempt. Real document processing produced and scanned all review packs and decision documents; authorized downloads verified PDF signatures and stored SHA-256 hashes. Actual task votes reached case approval: Basic 1, Standard 2, Enhanced 10. These counts reflect the configured route tasks, not distinct reviewer identities; no three-person independence claim is made.

| Evidence | Result and boundary |
| --- | --- |
| [Fresh route/document journeys](../../../../governance/policy/reports/task-rules-journeys-live.dev.json) | Three new cases approved; six real PDFs downloaded and hash-verified. No controlled document port. |
| [NEON browser](../../../../governance/policy/reports/task-rules-browser-live.dev.json) | Three case screens and exact attempt views; report records browser download-command checks. Screenshots retained alongside the report. |
| [Mailpit capture](../../../../governance/policy/reports/task-rules-communications-capture.dev.json) | Six new submission/decision emails matched to delivery IDs, recipients and attempt links. Each corresponding milestone also has one delivered inbox record. |
| [Activation preconditions](../../../../governance/policy/reports/task-rules-activation-gates-live.dev.json) | All three fresh approved cases reject activation-confirmation generation with 409 and unchanged business state/version. |
| [Existing activation documents](../../../../governance/policy/reports/task-rules-activation-documents-live.dev.json) | Three previously activated fixtures retain authorized, hash-verified activation-document downloads. This is compatibility evidence, not three fresh activation journeys. |

Fresh case IDs: Basic `125234e6-ced9-4e6f-8fa9-ee63cde82b84`; Standard `20a0bb15-1ce2-42b6-9ff2-46d428fa8eee`; Enhanced `0b367e7c-91fa-47a9-8c1e-2125e867e0a6`.

Historical checkpoint, resolved by the later indexing recovery above: an independent extraction/indexing failure was observed: Meilisearch rejects colon-delimited document identifiers used by `documents.extract-index`. Rendering, scanning, download, approval and notices succeeded at that checkpoint; indexing had not yet been qualified. No business outcome was changed to conceal the indexing failure.

Historical checkpoint: at 01:46 UTC these new controls were still unbound. The later bound-release section above supersedes that blocker; the original unbound example policy remains only an example.

## Studio publication and rule capabilities — 2026-09-15 checkpoint

The DEV deployment now includes a Studio authoring API and screen backed by the existing policy evaluator and policy tables. Draft submission stores the policy, four required fixture classes and exact-hash results atomically. Independent publication activates the tested revision. Optional task proposals preserve the base selection and append immutable manifest releases for future submissions; accepted attempts and historical resolution retain their exact earlier revisions.

Studio exposes scope discovery, policy/fixture editing, task return/reject authority, clarification clocks and supervisor controls. These are the actual owning API payloads. The four-tab condition-builder/field-catalog experience and configured candidate-filter authoring are still incomplete. The shipped website example is deliberately narrow and must not be bound as a complete supplier correction policy.

Publication uses a separate bounded service connection. Canonical permissions limit policy writes to `workflow.task_edit`; ordinary API connections remain read-only. Studio authors map to existing NEON principals using provider, realm, issuer and subject, never display names. Missing or ambiguous identity mappings fail closed. No business-principal access grants or consent changes are made by the deployment.

Additional runtime behavior:

- Material edits record contributors in the owning patch transaction. Contributor exclusion applies conservatively across the case's attempts.
- `bounded_pause` information waits reserve at most the configured response window on the item's decision deadline; explicit resolution returns unused allowance. Case deadlines continue. Reminder eligibility follows the persisted item adjustment. Legacy `elapsed` mode remains supported.
- Supervisor consultation records advisory questions and answers, preserves assignee and deadline, and grants no vote. Notify and reassignment retain their distinct behavior. Consultation does not block the original assignee's decision.
- Policy child insertions, as well as changes/deletions, are blocked after activation. Concurrent successor releases cannot branch or retarget an accepted attempt.

Evidence and reproducible commands:

| Evidence | Command / boundary |
| --- | --- |
| [Authoring database](../../../../governance/policy/reports/task-policy-authoring-db.dev.json) | `pnpm exec tsx tooling/scripts/verification/qualify-task-policy-authoring-db.mts`; actual restricted service role, real policy/manifest/receipt/outbox tables, controlled authorizer; rollback |
| [Bounded information wait](../../../../governance/policy/reports/task-information-pause-db.dev.json) | `pnpm exec tsx tooling/scripts/verification/qualify-task-information-db.mts --bounded-pause`; owning commands and real SLA repository, controlled document readiness; rollback |
| [Consultation](../../../../governance/policy/reports/task-consultation-db.dev.json) | Same script with `--consultation`; actual task decisions and advice exchange; rollback |
| [Studio browser](../../../../governance/policy/reports/task-policy-authoring-live.dev.json) | `pnpm exec tsx tooling/scripts/verification/qualify-task-policy-authoring-live.mts`; real Studio sessions/API, unbound fixture publication only; consult the report's `passed` field |
| [Studio task controls](../../../../governance/policy/reports/task-rule-controls-live.dev.json) | `pnpm exec tsx tooling/scripts/verification/qualify-task-rule-controls-live.mts`; reads the published hash and populates task controls without business writes |
| [Canonical installation](../../../../governance/policy/reports/task-rules-schema.dev.json) | `node tooling/scripts/verification/install-task-rules-canonical-dev.mjs`; direct canonical definitions, no migrations |
| [DEV deployment](../../../../governance/policy/reports/task-rules-deployment.dev.json) | `node tooling/scripts/verification/deploy-task-rules-dev.mjs`; compiled outputs required first; per-service images, hashes and rollback files |

Deployment requires builds of the changed contract/platform packages and host, followed by Studio and NEON production builds. The deployment helper accepts `--api-only`, `--worker-only`, `--scheduler-only`, `--studio-only`, or `--neon-only`; it now checks service health and restores the previous image on startup failure. Do not run deployments concurrently. Transient session-bootstrap 503 responses were observed around service restarts; browser checks must run after service health stabilizes and must not treat a failed first navigation as acceptance.

Current verification: 16 authoring/publication PostgreSQL checks, 33 bounded-wait checks, 17 consultation checks and four deployed Studio browser checks passed. The published browser fixture is policy `9fcc06bc-6e8a-438f-bf9c-ef207d42a99a` (unbound). Regression suites passed: control-admin 805 (180 skipped), host 465 (one skipped), workflow 104, NEON Business Partner 224 and Studio Business Partner 18. Production web builds passed. Skips are not acceptance evidence.

The [environment report](../../../../governance/policy/reports/task-rules-environment-live.dev.json) verifies deployed service health and Mailpit availability (83 existing captured messages at the check). The refreshed report now shows both NEON saved sessions authenticated. Existing mailbox contents alone do not establish delivery of the newly implemented interactions; fresh submission/decision captures are linked above.

Full acceptance still requires a complete reviewed live task/edit release, real document rendering/scanning/storage and authenticated downloads, plus newly captured Mailpit/inbox evidence. Remaining R1 capabilities include findings/to-do ownership, configured candidate filtering and delegation, correction recall, operational assignment exceptions, and published business calendars. These remain implementation work, not just authentication-dependent tests. R2/R3 and onboarding B/C remain separate.

## Earlier durable interaction checkpoint

The following table records the earlier interaction checkpoint; the newer implementation and deployment evidence above supersede its source-only boundary.

| Capability | Implemented behavior | Qualification boundary |
| --- | --- | --- |
| Information requests | Pinned task policy enables a question, requester response and explicit reviewer acceptance. One pending exchange blocks positive voting. Return/cancellation closes exchanges; old attempts cannot resume. | Real PostgreSQL owning commands under `athyperapp`, replay/conflict/privilege/stale-state checks; all fixture changes rolled back. |
| Supervisor escalation | Pinned role selector supports notify or replacement assignment. Reassignment cancels the original immutable item, retains history, preserves the deadline/quorum and transfers an outstanding exchange with lineage. The former assignee cannot vote. | Real task command and final lifecycle/quorum approval by an eligible replacement principal; temporary fixture membership rolled back. |
| Edit policy | Accepted manifest pins definition ID, version, hash and effective date. The existing policy evaluator handles the normalized diff; the request patch owner enforces the result and stores evidence in its update audit/outbox transaction. NEON correction form exposes an owning-API preview. | Preview/guard parity, uncovered-field denial, stale version rejection and isolation from a newer active definition; service tests prove denial precedes patch and accepted evidence accompanies the update. |
| Communications | Canonical templates/ingress for clarification requested/answered and supervisor attention. Recipients come from durable exchange/assignment records; links pin attempt/item. Stale exchanges and review reminders during a pending clarification are suppressed. Transfer emits a notice for the replacement exchange. | Real database planner preparation and recipient checks; no new captured-email delivery or browser claim. |
| NEON task controls | Request/respond/resume, configured escalation, mandatory escalation reason, history and pinned-link handling use owning APIs. No edit-and-approve or selective restart was introduced. | Component regression and type checks; deployed browser acceptance remains open. |

Canonical schema: `server/db/ddl/planes/neon/document/07_task_interactions.sql`, included in the NEON manifest. New interaction tables have tenant RLS and application SELECT only; mutation goes through protected commands. The existing supplier work-item immutability trigger was not weakened. Canonical notification definitions are in `control/16_supplier_communications_reference_seed.sql`. These files are direct build inputs, not migrations.

Evidence: [rollback database report](../../../../governance/policy/reports/task-information-db.dev.json); repeat with `pnpm exec tsx tooling/scripts/verification/qualify-task-information-db.mts`. The script uses a pre-acceptance manifest extension and controlled document-readiness boundary. It does **not** prove Studio publication, real rendering/storage, MFA, browser behavior or email delivery. It installs schema and notification definitions only inside its rollback transaction and leaves no grants behind.

### Current verification

- Real PostgreSQL rollback qualification: **28 checks passed**, including recipient-context authorization, stale notice/reminder suppression, transfer lineage and policy successor isolation.
- Control-admin suite: **805 passed, 180 skipped**.
- Host suite: **465 passed, 1 skipped**; owning interaction routes reject forged identities, policy pins and mismatched replay keys.
- Master-data suite: **423 passed, 25 skipped**.
- NEON Business Partner suite: **224 passed**.
- Host/control-admin/master-data builds and NEON type checks passed. Skipped tests are not claimed as qualification. No deployment, browser, real-rendering or email-delivery acceptance is implied.

### Published contract and operational limits

- Human task `informationPolicy`: `athyper.task-information-policy/1`, `clockMode: elapsed`, integer `responseHours` from 1 to 168. The earlier elapsed mode continues the existing deadline. The newer bounded-pause behavior is described above; published business calendars and timed information reminders remain open. Unsupported clock modes fail publication.
- Human task `escalationPolicy`: `athyper.task-escalation-policy/1`, `mode: notify | reassign`, explicit `supervisorRole`. Exactly one eligible scoped candidate must resolve. A replacement must also satisfy the original primary reviewer role and independence requirements. Missing, ambiguous or duplicate candidates block reassignment. This is an explicit role-based supervisor selector, not a qualified employee-manager hierarchy traversal.
- Manifest `editPolicy` references an exact `workflow.task_edit` definition. Approval-content paths require `full_reapproval`; uncovered paths deny. No metadata-only paths are enabled by the supplier adapter. Existing submitted-state edit locks remain authoritative.
- No existing policy or manifest was republished and no accepted attempt was retargeted. Legacy manifests without these optional controls retain their prior behavior.
- Apply the canonical schema before deploying the new host/worker: task projection and notification eligibility now query the interaction tables.

### Remaining release work

Studio currently has no mounted durable policy-authoring repository/API, and its Business Partner workflow editor writes a different definition object from the process catalog. Completing W9 requires the actual draft/test/approval/publication owner and immutable new catalog revisions; adding fields to the old editor would not enable runtime behavior. Current selection publications reject overlapping effective scope, so publication rollout also needs an explicit, reviewed cutover protocol for **new** requests while retaining accepted attempt pins.

Remaining qualification must exercise published controls through fresh Studio/NEON sessions and real rendering/storage and captured delivery, including concurrency and full three-profile journeys. The broader R1 plan also retains findings/to-do ownership, contributor/delegation enforcement, authorized correction recall, consultation, operational exceptions and calendar scheduling. R2 selective reapproval and R3 additional approval levels remain separate releases.

## Earlier source foundation

- Shared workflow contracts distinguish to-do, review and approval responsibilities, required evidence owners, dependency scope and final-decision authority.
- Task contract validation rejects non-approval final authority, to-do case return/rejection authority, dependency cycles, missing predecessors and mandatory tasks outside the final decision's dependency closure.
- Human supplier task bindings accept an explicit versioned `caseAuthority`. Absent properties preserve legacy return/reject behavior; malformed/null/unknown authority is rejected. The process publication compiler checks this contract, including when an otherwise correct manifest hash is supplied.
- Supplier task projection derives allowed actions from the pinned manifest. The command owner rejects ungranted return/reject actions before business mutation. The canonical PostgreSQL lifecycle function also enforces the pinned action grant.
- NEON renders task responsibility/completion effects and respects each allowed action independently. Preparation remains an evidence projection; it has not been converted into a manually completable task.
- Candidate filtering records maker, ineligible, duplicate and independence-conflict exclusions. The existing task runner now uses this reducer and retains its evidence. Current scoped eligibility resolution remains owned by the supplier adapter; new delegation, supervisor and cross-task contributor integration are not implied.
- Quorum validation rejects empty/all and malformed count/percentage thresholds. Generic quorum evaluation no longer treats an empty all-approver set as approval.
- Edit-result evaluation consumes typed outcomes from an exact-revision policy evaluation. It rejects first-match mode, wrong hash/revision, unsafe action envelopes, uncovered fields and metadata rules applied to approval content. Mixed material edits require explicit resubmission. The normalized server diff distinguishes missing/null, nested changes, parent deletion and whole-array replacement. The current checkpoint above mounts it in the request patch owner and preview API for manifests with an explicit edit-policy pin.
- Existing policy activation now validates the reserved `workflow.task_edit` purpose: collect-mode evaluation, unique rule identities, explicit typed result envelopes, supported paths and no selective-reapproval result. Activation requires nonempty publication-test evidence. Unrelated policy purposes retain their existing behavior.

No new expression engine was added. No policy/catalog was published permanently and no live accepted attempt was changed. Canonical SQL and command journeys were qualified inside rollback transactions. That earlier checkpoint was source-only; current deployment receipts are linked above.

## Baseline discoveries affecting the remaining build

| Concern | Concrete existing owner | Required next work |
| --- | --- | --- |
| Runtime task data | `document.workflow_request`, `document.workflow_stage`, `document.work_item`; `governance.process_attempt` and `governance.cycle_task` | Add exchange/assignment evidence and command contracts without duplicating case/voting storage |
| Case outcomes | `document.command_entity_case_lifecycle`; supplier task host adapter | Preserve gate/negative-authority checks in direct and task-driven routes |
| Replay/outbox | `event.command_execution`, existing task receipts and `event.outbox` | Bind new interaction/reassignment commands and scheduled occurrences |
| Work-item reassignment | `document.trg_supplier_task_work_item_binding` currently prevents assignee and eligibility mutation | Implement a governed assignment protocol with history, generation/version checks and matching database guards; do not weaken the trigger generically |
| Policy evaluation | `createPolicyService().evaluateExact`, existing immutable policy publications and traces | Wire the edit adapter to exact pinned purpose-specific policy references and durable evaluation receipts |
| Supervisor identity | `master.employee.manager_id`, employee/principal mapping; `master.position.reports_to_position_id` | Verify authority, effective dates, company scope, mapping and fixture completeness; a manager identifier alone is not decision authority |
| Delegation | `authz.delegation`, `authz.delegation_grant` | Enforce exact scope, expiry, independent-person quorum and bounded resolution in task assignment |
| Calendar | `master.holiday_calendar`, `master.holiday_calendar_day` | Publish a versioned calendar binding and business-time scheduling; existing `scheduleSla` uses elapsed minutes |
| Conditional levels | `createTaskApprovalRunner` rejects `stage.rules` | Preserve refusal until a qualified capability exists; extra supervisor control remains a separate release |
| Studio | Business Partner workflow designer currently edits workflow configuration, separate from the process manifest/catalog publisher | Connect the four rule editors to the actual publication owner; do not save ignored fields in a UI-only configuration object |
| BFF | Existing process-task allowlist covers view/start/decide/cancel | Extend in lockstep with authenticated owning routes once new commands are implemented |

## Earlier foundation verification

| Check | Result | Boundary |
| --- | --- | --- |
| Workflow package tests | 104 passed | Includes task contract, candidate/quorum and edit-result behavior |
| Process-selection compiler tests | 31 passed | Includes explicit authority and malformed authority publication |
| Policy package tests | 90 passed | Includes edit-policy activation rejection and unrelated-policy compatibility |
| Host package suite | 462 passed, 1 existing skip | Regression suite before the additional focused authority test |
| Additional host authority tests | 2 passed | Actual task service with controlled SQL responses; ungranted return/reject rejected before mutation |
| NEON Business Partner tests | 221 passed | Existing product regression suite |
| Workflow type checks, control-admin build, host build, NEON Business Partner type checks | Passed | Source/compiler checks; not deployed browser acceptance |
| Canonical lifecycle function | PostgreSQL accepted `CREATE OR REPLACE FUNCTION`; transaction rolled back | Syntax/definition validation only, not full real-case denial/concurrency qualification |

## Full-plan tracking (read with current checkpoint above)

1. Complete W0/W1 mapping and published rule-bundle/capability references, legacy compatibility and compiler integration. No whole package is marked accepted by this checkpoint.
2. W2 durable exchange, assignment, finding and contributor storage/command protection; real database failure and concurrency checks.
3. W3 task-owned to-do completion and adverse findings with explicit resolution authority.
4. W4 configured candidate-filter policies, scoped delegation and assignment exception ownership.
5. W5 live exact-policy edit preview/commit, metadata ownership, authorized correction request/recall and contributor exclusions; retain P5 full re-review.
6. W6 information requests and consultation with waiting/resume, bounded deadlines and stale exchange closure.
7. W7 supervisor resolution, authorized reassignment, assignment generations and business-calendar SLA behavior.
8. W8 committed notifications and operational queues for new events, including recipient access and stale suppression.
9. W9 Studio rule authoring, simulation, immutable publication and runtime parity.
10. W10 complete NEON task/interaction/edit screens and 360 evidence links against owning APIs.
11. W11 canonical fresh-build, multi-principal service/database/browser qualification and safe deployment/runbook.

R2 selective reapproval and R3 additional supervisor controls remain separate follow-up releases as specified in the plan. The original supplier return → edit → save → resubmit → full re-review path remains the deployed manual-testing baseline.
