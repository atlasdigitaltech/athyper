# Internal supplier onboarding — P0 baseline and audit

Date: 2026-09-14
Status: P0 complete — source and local configuration inventory; P1–P9 remain unimplemented under this plan.
Baseline commit: `ee58a9f495d6b2dee8e6e6b17140bad15b010cf2` (clean working tree at audit start).
Scope: Increment A of the [implementation plan](internal-supplier-onboarding-implementation-plan.md). B/C remain separate follow-ups.

## Evidence and reproduction

[Captured configuration](internal-supplier-onboarding-p0-evidence.json) contains the active local preview's field/operation inventory, published case contract, cycle revision coordinates, policy/template inventories, notification versions and local service status. Configuration was read from `athyper-dev-db-1` / `athyper_neon` and the source API's durable preview store; the running QA candidate was not used. PostgreSQL reads use a read-only transaction; SQLite is opened read-only. No business records, credentials or signing keys are captured.

Reproduce from the repository root:

```sh
node tooling/scripts/verification/audit-internal-supplier-onboarding-p0.mjs > /tmp/internal-supplier-onboarding-p0-evidence.json
```

The [collector](../../../tooling/scripts/verification/audit-internal-supplier-onboarding-p0.mjs) accepts optional database-container and source-API-container positional arguments. It fails if either configured runtime cannot be read. Captured timestamps and running-service uptime naturally change. This is configuration evidence, not API/browser or rendering qualification.

## Published intake and field authority

The active development graph for tenant `44444444-4444-4444-8444-444444444444`, entity `business_partner`, is **revision 58**, graph hash `890379d02697d6df27213886c87da3f62d6ea18c645bef26bdd6eab8cb7e22b9`. It provides 19 intake surfaces. This signed local preview is distinct from the PostgreSQL case-runtime descriptor; inspecting only `runtime_meta.entity_descriptor` would miss the form definition. The separate `business_partner_request` preview is revision 1 with no intake surfaces in the captured NEON projection.

| Published surface/section | Existing value keys and behavior | Increment A reuse/change |
| --- | --- | --- |
| `intake_details.scope` | `operatingOrganizationId`, `profileMode`; Standard request=`standard`, Full profile=`full`, default=`standard`; profile mode is request-only | Add requirement/reason to a shared governance section, available in both views; form mode must not select process |
| `intake_details.identity` | `name`, `registrationCountryCode`, `ownershipClass`, `legalClassification`, `supplierType`, `qualificationTypeCode`, `legalForm`, `websiteUrl`, `description` | Preserve identity and subtype semantics; qualification type is not a routing requirement |
| Addresses and contacts | Repeatable `addresses`, `contacts`, with separate item/channel surfaces | Reuse native bindings and validation; active address editor requires country, purpose, line 1 and city; contact name is required |
| Full profile sections | `incorporationDate`, `aliases`, `identifiers`, `taxRegistrations`, `classifications`, `governanceRelations`, `relationships`, `certifications` | Keep existing optional collection capture and row validation; do not interpret classifications as authoritative routing facts in A |
| Request banking/documents | `bankAccounts` and supporting-document item surfaces | Reuse protected capture and attachment ownership; these are not generated review/decision/activation documents |
| Requirement and reason | No `requestedComplianceLevel` or routing-requirement reason found in active intake or published case schema | Publish new semantic fields in P1; do not alias an existing status, qualification or generic `reasonCode` to this purpose |

The evidence includes every surface's field keys, labels, controls, requiredness, defaults, lookup options, visibility and payload coordinates where present. Source owners are [full-profile authoring](../../../server/db/scripts/provisioning/business-partner-full-profile.ts), [request capture authoring](../../../server/db/scripts/provisioning/business-partner-request-capture.ts), [address editor](../../../server/db/scripts/provisioning/business-partner-address-editor.ts), and the [native intake graph](../../../server/db/scripts/provisioning/business-partner-intake-graph.ts). NEON consumes published descriptors through the [request workspace](../../../packages/planes/neon/business-partner/src/request-workspace.tsx); server composition resolves the intake descriptor for command validation in [register-services](../../../server/apps/platform-host/src/composition/register-services.ts).

Active operations include `case_create`, `case_update`, `case_validate`, `case_submit`, `case_decide`, `case_materialize`, and `case_read`, with published permission codes retained in the evidence. Their existence does not establish permission to assert a new field. P1 must add/verify field and operation authorization together, allow incomplete drafts, require a valid explicit selection on submission, and retain actor/change reason. Basic and changes to a saved requirement require a reason. Selected profile and mandatory minimum controls remain server-owned.

The published `master.business_partner` case contract is ID `fec7fec0-76e1-4096-8dd2-3511f212d6e4`, release 1, hash `8479bcda43aab1f93588e74145fdf6ca6483e2cee58dd492e56d62953d099b60`. It has `additionalProperties=false`, requires `businessPartnerCode`, and currently declares `supplierType` as a string. New proposal fields therefore need the canonical case schema as well as the form contract. The active case-runtime descriptor is `07800fdb-e9a5-4c2b-be61-fad8e7ed0690`, hash `935f2a4d661e1ca320886186b529d9166ec811fc41e5d20d221fd7098febea10`. The [development runtime provisioner](../../../server/db/scripts/provisioning/provision-development-business-partner-runtime.ts) is a concrete schema/projection update point.

Two statements in the older [prototype notes](full-profile-prototype.md) are no longer current for this environment: the case contract is present, and the active address editor requires line 1/city. Neither statement proves current API persistence or browser completion; those must be qualified against owning APIs later.

## Supplier type and ownership confirmation

The published `details_supplier_type` control is a **single select**, required, default `general`, with exactly `general | strategic | service | carrier | intercompany`. `details_ownership_class` is a required `external | internal` select, default `external`. Both bind canonical payload fields. There are no independent Strategic and Intercompany toggles.

[Request validation](../../../server/packages/services/master-data/src/business-partner-request-validator.ts) enforces `(ownershipClass === "internal") === (subtype === "intercompany")` when creating a commercial role. The [master functions](../../../server/db/ddl/planes/neon/master/07_functions.sql) and [triggers](../../../server/db/ddl/planes/neon/master/08_triggers.sql) also enforce ownership/subtype compatibility; [reference seeds](../../../server/db/ddl/planes/neon/master/12_business_partner_reference_seed.sql) define the five supplier choices. Preserve these layers.

Valid A fixtures include external/general plus any valid compliance requirement, and internal/intercompany plus Enhanced. Invalid internal/general and external/intercompany remain invalid. “Internal onboarding” describes the initiating channel, not forced internal ownership. A Strategic + Intercompany subtype fixture is unrepresentable. No supplier-type split is needed for P1.

## Policy semantics and authoring

| Reuse target | Verified behavior | Missing A contract/integration |
| --- | --- | --- |
| [Policy service](../../../server/packages/platform/policy/src/policy-service.ts) | Ascending rule priority within each definition; `first_match` stops within that definition. Winner across collected outcomes uses `deny > require_workflow > warn > escalate > allow`; equal action precedence retains the earlier outcome | Resolve exactly one scoped definition; consistent `require_workflow` result; typed profile/manifest validation; never use `permitted` alone to authorize launch |
| Same service, `simulate` / `evaluate` | Simulation traces evaluated rules only and is unaudited. Evaluation audits matched IDs and decision. No outcome produces `action=none`, `permitted=true` | Durable complete selection evidence, winner/trace/fact hash/authority versions/attempt; no route must create no run |
| [Repository](../../../server/packages/platform/policy/src/kysely-policy-repository.ts), [cache](../../../server/packages/platform/policy/src/cached-policy-repository.ts), [contracts](../../../server/packages/contracts/policy/src/policy.ts) | Active, effective-date definitions filtered by entity, tenant/global and optional IDs; returned version is evidence, not an exact-version request. Cache keys include plane, tenant, entity, date and IDs | Exact revision/hash evaluation, company/process-family binding and pinned replay; extend repository and cache contracts together |
| [Bounded evaluator](../../../server/packages/platform/policy/src/json-rule-evaluator.ts) | Variable lookup, equality, comparisons, boolean logic, membership, arithmetic, missing-fact operators with limits | Reuse for the three requirement predicates; no new expression engine or taxonomy traversal |
| [Authoring service](../../../server/packages/platform/policy/src/policy-authoring-service.ts) and [routes](../../../server/packages/platform/policy/src/policy-routes.ts) | Successor drafts, normalization/hash, duplicate-priority validation, test cases/results, diff, signed bundles, dependency checks and activation validation | Scoped adapter/publication wiring still required; generic validation does not prove three-value coverage, profile availability or minimum-control safety |

The live NEON `control.policy_definition` inventory is **empty**, across all tenants. Reusable policy source is not a published supplier-selection policy. Authoring test evaluation also has its own orchestration wrapper around the shared evaluator; P1a must verify authoring/runtime result parity, not infer it from the presence of simulation. Trusted tenant/company minimum controls have no established process-selection binding in this inventory; Business Partner must supply their typed authority/version contract.

## Runtime, documents and communication reuse

| Owner/source | Concrete reuse | A work remaining |
| --- | --- | --- |
| [Case DDL](../../../server/db/ddl/common/document/03_tables.sql), [snapshot DDL](../../../server/db/ddl/common/snapshot/03_tables.sql) | Case command evidence, validation/materialization records, immutable submission/decision/result snapshot references and tenant-composite constraints | Typed immutable selection/manifest/attempt coordinates and enforceable case/run/task/document ownership; no duplicate proposal store |
| [Request service](../../../server/packages/services/master-data/src/business-partner-request-service.ts), [case repository](../../../server/packages/services/master-data/src/kysely-business-partner-case-repository.ts) | Transactional submission, idempotent replay, pinned workflow definition/version/hash, stage/work-item owner/version checks and quorum; materialization lineage | Existing workflow is case-owned; extract/reuse execution for task-owned reviews. Intermediate outcomes must not approve the case. Current return/resubmit path reuses workflow state; add explicit attempts, cancellation and full re-review |
| [Cycle contracts](../../../server/packages/contracts/control-admin/src/cycle-config.ts), [execution](../../../server/packages/platform/governance/src/cycles/cycle-execution-services.ts), [DDL](../../../server/db/ddl/common/governance/03_tables.sql) | Versioned template reader, run/task/dependency state and completion services | Existing task contract has completion mode/handler/applicability but no complete typed task workflow, final-decision, document or attempt binding; design these in P1 |
| [Supplier cycle adapter](../../../server/packages/services/master-data/src/business-partner-onboarding-cycle.ts), [active seed source](../../../server/db/ddl/planes/neon/control/12_reference_seed.sql) | Event-driven run creation/replay and task projection | Adapter queries latest cycle template before replay handling; case events drive task completion. Replace with accepted manifest/attempt ownership. Two adapter paths independently mark runs complete; consolidate evaluation in P6 |
| [Document service](../../../server/packages/services/documents/src/document-service.ts), [contracts](../../../server/packages/contracts/documents/src) | Strict template variables, authorization, PDF rendering, malware scanning, object storage, hash/provenance, idempotent artifact acceptance, outbox/audit and storage cleanup | Current call selects current template binding and accepts supplied data; add authorized snapshot projection, exact template/source pinning, durable render intent/job and attempt-aware callbacks/gates. P2 uses the P1 document-port contract |
| [Eligibility service](../../../server/packages/services/master-data/src/business-partner-eligibility-service.ts), [case repository](../../../server/packages/services/master-data/src/kysely-business-partner-case-repository.ts), [master functions](../../../server/db/ddl/planes/neon/master/07_functions.sql) | Readiness evaluation, explicit activation, protected bank/qualification checks, approved proposal materialization and snapshot lineage | Preserve separate approval/materialization/activation/closure; link company/bank work and required result-document gate for every profile |
| [Notification planner](../../../server/packages/platform/notifications/src/notification-planner.ts), [BP event routing](../../../server/packages/services/master-data/src/business-partner-notifications.ts) | Source-event/rule/recipient/channel idempotency, templates, preferences, delivery rows and transactional event consumption | Pilot milestone contracts, local capture-email coverage, attempt-aware reminder suppression and pinned document references |
| [Attachment resolver](../../../server/packages/services/documents/src/notification-attachment-resolver.ts), [host composition](../../../server/apps/platform-host/src/composition/register-services.ts) | Artifact eligibility, integrity and access-policy checks; linked/versioned attachment resolution | Host creates resolver only when access policy and storage are supplied (or resolver injected). Prove real recipient policy wiring; availability of resolver code is not authorization evidence |

For the local development tenant, `BP_SUPPLIER_ONBOARDING` type ID is `01a09ddf-3a3b-7b7f-88ed-7ef68b90ac22`. Latest revision is **2**, ID `01a09ddf-3a44-7c47-9e3a-18ec284c20bf`, hash `98d5067fcc064af9bcfad40409723ddba07b53ccd8877984ca1f02270239933b`. Its eight tasks are `INVITATION`, `REGISTRATION`, `DUPLICATE_REVIEW`, `QUALIFICATION`, `BANK_REGISTRATION`, `BANK_VERIFICATION`, `SUPPLIER_READINESS`, `ACTIVATION`. This is neither the three A profile catalogs nor Enhanced's ten business tasks. Global-tenant revision coordinates are also captured separately.

The sole local render template/binding is `virusscan.qualification`, `qualification.print/default/en`, version 1 (`e3667767-c804-45d2-a3ae-4a5dbdf45d5d`). No supplier review-pack, decision-document or activation-confirmation template is published. Reuse `master.template`, `master.template_binding`, `snapshot.template_version` and document artifact storage, but author all three purposes in P4.

Existing BP notification templates include submitted, returned and rejected in-app/email; approved/materialized in-app; workflow-stage activation in-app/email/push. These are version 1 in the captured inventory. Supplier activation currently maps to the materialized template in BP routing. Existing notifications do not establish all A milestones or reminder behavior.

## Local dependencies and qualification baseline

Node `v24.19.0` and pnpm `10.33.0` match the root toolchain. The source API/worker/scheduler, three web planes, PostgreSQL/pools, cache, object storage, renderer, parser, malware scanner, capture mail, IAM and gateways were running; relevant containers reported healthy. Health does not prove a successful render/scan/store round trip, recipient authorization or owning-API access.

Use the existing root `devsimple` / `devfull` / `dev:local` entry points and [runtime provisioning](../../../server/db/scripts/provisioning/provision-development-business-partner-runtime.ts), native graph authoring/publication and canonical DDL. Update common case/cycle/policy DDL and NEON master/document/template sources directly when implementing their owning packages. No migrations, resets, publications, renders or communications were performed for P0. Rebuild and synthetic database/browser qualification belong to P9; an older preview receipt or the running QA image is not evidence of the source build.

Focused baseline checks executed successfully:

| Command | Result |
| --- | --- |
| `pnpm --filter @athyper/server-platform-policy test` | 4 files, 72 tests passed |
| `pnpm --filter @athyper/server-service-master-data exec vitest run src/__tests__/business-partner-case-service.test.ts` | 1 file, 54 tests passed |
| `pnpm exec tsx --tsconfig tooling/config/tsconfig-react.json --test tests/foundation/business-partner-full-profile.test.ts` | 6 tests passed |

These 132 tests confirm the inspected reuse baseline; they do not qualify new A behavior. No full build, browser mutation, database concurrency test or real document generation was run.

## P0 exit and P1 handoff

P0's observable exit is met: the published field inventory and exact local coordinates are captured, subtype/ownership constraints are confirmed in UI/service/DDL, policy semantics and authoring are identified, and runtime/template/dependency gaps have concrete owners.

P1 can proceed with the following bounded contracts:

1. Publish `requestedComplianceLevel` plus a dedicated requirement reason; retain draft incompleteness, both views, field authorization and server-only selected profile/minimums. Finalize the reason key through native authoring, not a master-data compliance-status alias.
2. Define shared typed selection, policy/profile/manifest revision/hash, snapshot/fact authority, attempt/idempotency, task/workflow and document gate bindings. Keep P4's port usable by P2 before rendering is connected.
3. Require one scoped first-match definition, all three enum mappings, unambiguous priorities, registered complete profiles, consistent action shape and minimum-control validation at publication. Missing results fail closed for process launch.
4. Implement exact-revision policy evaluation and durable evidence in P1a before submission integration in P2. Do not introduce routing branches in supplier service code or infer profile from supplier type/employee count.

No P0 finding requires profile-changing replacement runs, downgrade exceptions, richer classification rules or an orthogonal supplier-type model. Those remain B/C. Exact workflow/reviewer/document/policy coordinates for A do not exist yet and must be published and qualified by their owning packages.
