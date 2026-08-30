# Athyper Business Partner 360 view build sequence plan

**Status:** Proposed Phase 1 execution plan  
**Prepared:** 2026-08-30  
**Build design:** [Athyper Business Partner 360 view build design](./athyper-business-partner-360-view-build-design.md)  
**Parent architecture:** [Athyper Business Partner architecture design](./athyper-business-partner-architecture-design.md)  
**Related backlog:** [Athyper Business Partner pending build plan](./athyper-business-partner-pending-build-plan.md)

## 1. Purpose and execution decision

This plan turns the Phase 1 Business Partner 360 design into an ordered implementation sequence. It does not reopen the design decisions or replace the wider Business Partner backlog.

The build will proceed as deployable vertical slices. Each slice includes its contract, data access, policy, API, UI, tests, observability, and rollout evidence. Schema-only and UI-only slices are not accepted as complete.

The controlling decisions are:

1. close typed request materialization before claiming complete identity coverage;
2. establish the secure summary, scope, and section-provider framework before adding domain sections;
3. deliver common organization identity before commercial controls, workforce, and MESH;
4. keep restricted data masked at the repository boundary and absent from bootstrap payloads;
5. keep the existing aggregate route as a compatibility adapter until all consumers have moved;
6. exclude every risk field and dependency from Phase 1 contracts, completeness, UI, and fixtures;
7. release behind tenant capability controls and retire the old aggregate only after production evidence.

This plan deliberately does not assign calendar duration. Teams may schedule independent lanes in parallel only after the dependency and entry gates below are satisfied.

## 2. Starting baseline

The sequence assumes the repository foundation recorded in the build design:

- canonical Business Partner, supplier, customer, person, workforce, scope, company, bank, qualification, certificate, request, audit, and MESH-link tables exist;
- the governed request kernel and initial materializers exist;
- a limited Business Partner aggregate and record route exist;
- supplier eligibility and customer credit/lifecycle services exist;
- STUDIO signed definition publication and MESH projection/link foundations exist.

The build must not recreate those authorities. Any gap found in an existing foundation is handled as an additive correction in the earliest affected slice.

Before implementation begins, record a baseline commit and attach results for the currently passing Business Partner database, service, host, UI, and browser suites. Existing uncommitted work must be identified and preserved.

## 3. Dependency graph and critical path

```text
BS360-00 baseline and contract lock
    |
    +--> BS360-01 typed materialization closure
    |        |
    |        `--------------------+
    |                             |
    `--> BS360-02 secure 360 core + summary shell
             |                    |
             v                    v
        BS360-03 common identity sections
             |
             +--> BS360-04 roles, scope, AP and AR
             |        |
             |        `--> BS360-05 commercial controls
             |
             +--> BS360-06 requests and activity
             |
             +--> BS360-07 person and workforce privacy
             |
             `--> BS360-08 MESH network

BS360-03 + BS360-04 + BS360-05 + BS360-06 + BS360-07 + BS360-08
             |
             v
        BS360-09 completeness and governed actions
             |
             v
        BS360-10 hardening, canary, cutover and retirement
```

The release critical path is `00 -> 01 -> 02 -> 03 -> 04 -> 05 -> 09 -> 10`. Slices 06, 07, and 08 may run in parallel after the secure core and their stated entry gates are met, but all are Phase 1 release requirements.

## 4. Sequence overview

| Order | Build slice | Primary result | Depends on | Exit evidence |
|---:|---|---|---|---|
| 00 | Baseline and contract lock | Frozen v1 section, authority, sensitivity, and scope contracts | Current foundation | Approved field/authority ledger and green baseline |
| 01 | Typed materialization closure | Repeating identity data becomes authoritative typed rows | 00 | Atomic apply/replay/rollback evidence |
| 02 | Secure 360 core and summary shell | Small summary, scope resolver, manifest, shell, compatibility adapter | 00; contract portion of 01 | Four party lenses render correct authorized manifests |
| 03 | Common identity sections | Identity, contacts, addresses, identifiers/tax | 01, 02 | Applied request data appears masked and provenance-linked |
| 04 | Roles, scope, AP and AR | Role-aware organization/company configuration | 02, 03 | Dual-role data remains independent by role and scope |
| 05 | Commercial controls | Banking, qualification, certificates, credit | 04 | Restricted-value leakage suite passes |
| 06 | Requests and activity | Explainable governed history and supported business summaries | 02, 03 | Current-state fixtures map to safe timeline evidence |
| 07 | Person and workforce privacy | Purpose-bound person/employment/assignment experience | 02, 03 | HR/non-HR matrix and non-prefetch tests pass |
| 08 | MESH network | Local-first network provenance with isolated live degradation | 02, 03 | MESH outage affects Network only; person leak tests pass |
| 09 | Completeness and governed actions | Definition-driven missing-data guidance and propose-change routing | 03–08 | Deterministic completeness and command-routing matrix |
| 10 | Hardening and cutover | Accessible, observable, performant phased release | 09 | All release gates pass and compatibility retirement is approved |

## 5. Cross-cutting slice discipline

Every slice must contain, in the same change set or a clearly linked atomic series:

1. contract and compatibility impact;
2. additive DDL/migration only where required, including generated projections and RLS;
3. repository/service/API implementation with explicit tenant and scope predicates;
4. server-side permission, applicability, and redaction enforcement;
5. bounded UI integration driven by the server manifest/capabilities;
6. unit, database, contract, integration, negative-authorization, and relevant browser tests;
7. safe metrics, logs, readiness behavior, and failure reason codes;
8. deployment, fallback, rollback/roll-forward, and evidence notes;
9. an update to the delivery evidence ledger in section 8.

No slice may:

- add a denormalized `bp_360` source-of-truth document;
- expose a direct browser-to-MESH path or cross-plane SQL join;
- use unrestricted request JSON as the normal reader for typed identity fields;
- return raw bank, tax, national identifier, birth-date, compensation, or raw audit values;
- mutate canonical Business Partner rows from inline UI controls;
- add or retain Phase 1 risk score, band, incident, exposure, or trend fields;
- infer company or organization scope from the first row returned.

## 6. Detailed build sequence

### BS360-00 — Baseline and contract lock

**Objective:** remove ambiguity before code paths and migrations multiply.

Build:

- inventory every Phase 1 displayed field and assign domain owner, plane, source table/service, sensitivity class, permission, scope, effective-date rule, masking rule, and provenance behavior;
- reconcile final section codes, route names, query coordinates, reason codes, pagination envelope, and v1 schema version;
- reconcile new permission names with the platform catalog and identify which are discoverable versus hidden when denied;
- define organization, customer, supplier, dual-role, person, workforce, external-worker, and MESH-linked acceptance fixtures;
- publish or stage a STUDIO definition revision containing the Phase 1 section manifest, presentation policy, requirement-pack identifiers, compatibility range, and explicit risk exclusion;
- capture the current aggregate consumers and define the compatibility response mapping and retirement signal;
- freeze a risk-negative contract fixture so later imports cannot reintroduce risk fields accidentally.

Likely touch points:

```text
server/packages/contracts/master-data/
server/packages/services/publication/
server/db/ddl/planes/neon/authz/
packages/planes/neon/business-partner/
apps/neon/app/(shell)/mdg/business-partner/
```

Verify:

- every rendered value has one authority and sensitivity entry;
- every section has applicability and permission behavior for all acceptance fixtures;
- contract compile and definition publication compatibility tests pass;
- the Phase 1 contract schema rejects all risk field families.

**Exit:** the field/authority ledger, v1 contracts, fixtures, permission matrix, and compatibility plan are review-approved. No UI field remains unclassified.

### BS360-01 — Typed materialization closure

**Objective:** ensure the 360 view reads authoritative rows rather than incomplete request payloads.

Build:

- inventory existing request child/evidence structures before adding tables;
- add or reuse typed request children for addresses, named contacts, contact channels, identifiers, tax registrations, classifications, and certificates;
- remove restricted tax/national identifiers from unrestricted proposed payloads, audit JSON, outbox payloads, metrics, and errors;
- extend approved-request application to materialize all applicable typed children atomically with the BP/role/scope result;
- bind every applied child to request, definition field code, client item key, source, effective range, and immutable application evidence;
- add deterministic application fingerprints and exact replay behavior;
- preserve optimistic concurrency and rerun volatile validation/scope authorization immediately before writes;
- add safe backfill or explicit legacy-read behavior for previously applied requests; do not silently reinterpret legacy JSON.

Primary implementation area:

```text
server/db/migrations/
server/db/ddl/planes/neon/document/
server/packages/contracts/master-data/src/business-partner-requests.ts
server/packages/services/master-data/src/kysely-business-partner-request-repository.ts
server/packages/services/master-data/src/business-partner-request-service.ts
```

Verify:

- one approved organization request produces correct current address, contact/channel, identifier, tax, classification, and certificate rows;
- forced failure at each write stage rolls back master, snapshot, audit, outbox, and request status together;
- exact replay returns original coordinates; fingerprint conflict and stale base version return stable conflicts;
- restricted-value scans over database-visible events, API errors, logs, and test snapshots find no raw value;
- owner-type collision and cross-tenant tests fail closed.

**Exit:** no required newly collected Phase 1 identity extension exists only in general request JSON, and application remains atomic and idempotent.

### BS360-02 — Secure 360 core and summary shell

**Objective:** establish the reusable server and client framework on which every section depends.

Build server contracts and orchestration:

- add `business-partner-360.ts` contracts for scope, summary, section manifest, section envelope, provenance, redaction notice, cursors, and safe errors;
- implement BP visibility and scope resolution once per request, including organization/company/legal-entity validation and tenant business date;
- implement policy evaluation for record visibility, section applicability, discoverability, actions, and redaction class;
- implement the bounded summary reader: identity summary, role summaries, primary contact/address, masked primary IDs, open-work counts, five recent events, provenance, and section manifest;
- register the summary BFF route and bounded relay allowlist;
- retain the old aggregate endpoint and map it through a compatibility adapter without expanding its contract.

Build the client shell:

- create the `360/` package structure, context, client, section registry, identity header, scope bar, navigation, and reusable section-state components;
- keep `/mdg/business-partner/[recordId]` as the canonical route;
- make `section`, `roleLens`, organization, company/legal entity, and `asOf` deterministic URL state;
- abort in-flight requests on BP/scope change and include permission epoch in query keys;
- render navigation from the returned manifest only;
- show explicit empty, restricted, partial, stale, unavailable, and scope-selection states.

Verify:

- supplier, customer, dual-role, and person fixtures return/render distinct correct manifests;
- invalid company/organization pairs fail with `BP_360_SCOPE_INVALID`;
- invisible BPs return non-enumerating `404`; direct denied sections return `403` only after visibility;
- no person-sensitive data is present in server-rendered/bootstrap JSON;
- deep links, browser back/forward, request abort, and scope invalidation behave deterministically;
- summary meets the size and warm-database performance budget on representative fixtures.

**Exit:** the shell can ship dark behind a tenant capability flag, and all remaining sections plug into one policy/manifest/envelope contract.

### BS360-03 — Common identity vertical slices

**Objective:** deliver the shared organization/person data foundation in four independently testable increments.

Build in this order:

1. **Identity:** canonical names, aliases, lifecycle, legal facts, parent, classifications, and external references.
2. **Contacts:** named contact, role, title/department, email/phone channel, verification, primary and effective state.
3. **Addresses:** owner-aware purpose, validation, primary/current/effective state, and address events.
4. **Identifiers & tax:** registration schemes, issuing authority/country, external IDs, masked tax/identifier status, and separate audited reveal command where approved.

For each increment:

- add an independently authorized repository reader and route;
- use explicit selected columns and opaque cursor pagination;
- resolve registered owner types and effective ranges correctly;
- add allowlisted field mapping, provenance, redaction notices, and section UI/drawer;
- link propose-change entry points to the governed request shell but defer completeness scoring to BS360-09.

Verify:

- typed children created in BS360-01 appear in the correct section after apply;
- current/expired/primary rules and pagination remain stable under concurrent inserts;
- masked values never enter URLs, telemetry, toast/error content, or browser persistence;
- organization and person applicability fixtures render correctly;
- each section may fail without taking down the identity header or other loaded sections.

**Exit:** the common identity domains are authoritative, masked, paginated, provenance-linked, and usable without the legacy aggregate panels.

### BS360-04 — Roles, scope, AP and AR company configuration

**Objective:** make the page genuinely role- and scope-aware before adding control-heavy sections.

Build:

- deliver role summaries and effective operating-organization, legal-entity, org-unit, and company assignments;
- deliver separate supplier Procurement & AP and customer Sales & AR sections;
- keep supplier and customer company configuration in separate contracts and components;
- validate selected company membership under the selected organization on every request;
- represent global identity, missing-scope, invalid-scope, historical, and read-only states explicitly;
- add governed routes for add role, assign organization, and configure company;
- remove supplier-shaped readiness loading from customer/person bootstrap behavior.

Verify:

- one dual-role fixture keeps procurement/sales assignments and AP/AR profiles independent;
- changing organization/company invalidates only scoped queries;
- historical `asOf` produces effective rows and disables actions;
- unauthorized cross-organization/company/legal-entity reads fail closed;
- customer and person lenses do not load supplier eligibility.

**Exit:** all role and company data is selected by explicit authorized scope, never merged by convenience or inferred from row order.

### BS360-05 — Commercial controls

**Objective:** expose governed supplier/customer controls without weakening their existing authorities.

Build in this order:

1. masked banking links and bank-verification state;
2. qualifications, preference designations, and operational blocks;
3. certifications and authorized attachment manifests/downloads;
4. customer company-scoped credit review labeled **Credit review**.

Rules:

- normal banking readers select only masked views or explicit safe columns;
- reveal is a separate purpose-bound, audited, no-store command with short-lived UI state;
- qualification, block, certification, bank-verification, and credit services remain authoritative;
- the 360 module composes their read results and governed deep links; it does not duplicate decisions;
- do not import supplier risk hooks or show risk-derived readiness reasons in Phase 1.

Verify:

- API, logs, snapshots, HTML, analytics, and browser cache scans contain no raw bank/tax values;
- expired/revoked/effective control states resolve correctly for `asOf`;
- attachment authorization and expired-link failure are enforced;
- maker/checker, scope, and permission boundaries remain enforced by the owning commands;
- every Phase 1 fixture and contract remains risk-field negative.

**Exit:** banking, supplier controls, certificates, and customer credit are usable and independently authorized with no restricted-data or risk leakage.

### BS360-06 — Requests, governance activity, and business activity

**Objective:** make current state explainable without exposing raw evidence payloads.

Build:

- add paginated request history, open-work summary, workflow/decision state, evidence manifest, and materialization-result links;
- implement the unified activity mapper over allowlisted event codes from audit, request/workflow, lifecycle, address, bank, qualification, certification, workforce, and MESH projections;
- redact changes before they enter the public activity contract;
- keep governance activity separate from commercial transaction summaries;
- integrate only supported summary readers from procurement, finance, sales, projects, and contracts;
- report unsupported business-activity providers as unavailable or omit them; do not query undocumented transaction tables.

Verify:

- every current-state mutation in acceptance fixtures maps to a safe timeline item or fails an explicit unmapped-event test;
- raw audit `old_values`, `new_values`, request payloads, and evidence content never reach the response;
- cursor order is deterministic across heterogeneous event sources;
- one unavailable transaction provider does not fail governance activity or the summary;
- deep links respect owning-module authorization.

**Exit:** authorized users can explain who/what/when/source/request for current state through safe evidence links.

### BS360-07 — Person and workforce privacy view

**Objective:** deliver a person-first experience with stricter privacy boundaries than organization records.

Build:

- deliver Personal, Employment, Assignments, Onboarding/Offboarding, and Engagements sections;
- select current/historical employment, assignment, external-worker, engagement, and placement ranges using the chosen `asOf`;
- keep `person_sensitive_profile` out of summary, prefetch, generic exports, logs, and caches;
- add only approved purpose-bound restricted readers/reveal commands, including step-up and access audit where policy requires;
- show supplier/customer/network sections for a person only when a separate approved commercial role and policy make them applicable;
- enforce no-store and state clearing for sensitive drawers and route changes.

Verify:

- HR, manager, ordinary BP reader, and unauthorized user permission matrices prove allowed, redacted, hidden, and non-enumerating states;
- exact date of birth, national ID, compensation, and sensitive evidence are absent by default;
- effective employment/assignment/engagement selection handles boundary dates and non-overlap correctly;
- generic BP export and MESH paths reject person/workforce fields;
- browser tests prove sensitive state clears on close, scope change, permission loss, and navigation.

**Exit:** internal workforce, external worker, and person fixtures render correct data without supplier shaping or privacy leakage.

### BS360-08 — MESH network section

**Objective:** show governed network provenance while preserving plane autonomy and outage isolation.

Build:

- read the NEON account link, received snapshot/projection, match/diff, selective-acceptance, and bank-disclosure status first;
- add a typed MESH adapter only for live relationship/publication summaries not available locally;
- require NEON network permission, a valid relationship coordinate, and independent MESH authorization;
- label all MESH values with authority, source object, observed time, schema/field-set version, hash, and freshness;
- show accepted versus ignored fields and publication/withdrawal state without implying full identity parity;
- enforce the organization/commercial-role gate before any person-linked record may call the adapter;
- use a bounded timeout and return local safe projection with stale/unavailable state when MESH fails.

Verify:

- MESH timeout, denial, incompatible schema, stale projection, and corrupt response affect Network only;
- no browser-to-MESH request or NEON-to-MESH database join exists;
- person/workforce payload and adapter-call denial tests pass at UI, service, schema, and event boundaries;
- received, accepted, published, ignored, and withdrawn states have distinct provenance;
- bank disclosure shows presence/status only unless separately governed.

**Exit:** Network is useful from local evidence, richer when live access succeeds, and harmless to the core 360 experience when unavailable.

### BS360-09 — Definition-driven completeness and governed actions

**Objective:** convert the complete read surface into role/scope-aware guidance and safe change initiation.

Build:

- implement the organization base, supplier scope/payable, customer scope/credit, person base, and workforce active requirement packs;
- evaluate requirements against the last valid verified STUDIO definition, caller-visible field set, role, scope, `asOf`, verification/effective state, and BP version;
- allow a restricted verified value to satisfy a requirement without revealing it;
- return required and recommended results separately with deterministic fingerprints;
- add missing-data actions that route to `amend_partner`, add-role, assign-organization, configure-company, change-bank, change-employment, lifecycle, qualification, or certification flows;
- expose actions only from server capabilities and retain read-only behavior in historical mode;
- keep operational readiness separate and exclude risk from every completeness pack.

Verify:

- fingerprints change only when relevant BP data, scope, date, definition, verification, or policy changes;
- STUDIO outage uses last valid local definition; absent/incompatible definitions fail the completeness card closed while canonical identity remains visible;
- every displayed action maps to one governed request/command and no component owns a direct master-data mutation;
- restricted presence contributes correctly without value disclosure;
- risk fields and risk reasons are absent from completeness tests and snapshots.

**Exit:** users receive deterministic missing-data guidance and every correction begins through an existing governed authority.

### BS360-10 — Hardening, canary, cutover, and retirement

**Objective:** qualify the composed view for phased production use and remove compatibility code safely.

Build and verify:

- complete tenant isolation, RLS, IDOR, cross-scope, permission-epoch, redaction, purpose-expiry, reveal-replay, and export-governance tests;
- execute representative high-cardinality query plans and add only justified tenant-leading indexes;
- meet summary, section, payload, cached-switch, and MESH-timeout targets from the design;
- complete WCAG 2.2 AA keyboard, focus, contrast, target-size, zoom/reflow, screen-reader, responsive, localization, and RTL testing;
- add safe section latency/error, completeness, redaction, reveal, materialization, and MESH-fallback dashboards and alerts;
- document definition fallback, MESH outage, stale cursor, permission change, failed materialization, reveal incident, rollback, and support runbooks;
- enable the 360 view for internal test tenants, then a canary cohort, then broader tenants based on measured gates;
- monitor old aggregate calls and migrate every known consumer;
- retire the monolithic component and old endpoint only after zero known consumers, an agreed observation window, and rollback approval.

Required release evidence:

| Gate | Required proof |
|---|---|
| Functional | All seven acceptance fixture families render their correct sections and governed actions |
| Data | All Phase 1 authoritative families have a reader or approved exclusion; typed materialization is complete |
| Security/privacy | Permission/RLS matrices and restricted-value scans pass; person data never reaches MESH |
| Contract | v1 compatibility passes and risk fields are absent from API, UI, fixtures, and telemetry |
| Performance | Summary/section SLOs, payload limits, pagination, and no-N+1 query evidence pass |
| Resilience | MESH and STUDIO failure modes degrade according to contract |
| UX | Supported browsers, responsive layouts, accessibility, localization, and deep-link journeys pass |
| Operations | Dashboards, alerts, runbooks, canary criteria, and rollback signals are approved |

**Exit:** Phase 1 release gates pass, the canary remains within SLO/error thresholds, owners sign off, and legacy retirement is separately approved and completed.

## 7. Parallel work rules

After BS360-02 establishes the shared contracts, teams may use these lanes:

| Lane | May start when | Work | Merge constraint |
|---|---|---|---|
| A — common data | BS360-01 and 02 contracts are stable | BS360-03 | Merges first because later lanes consume its readers/components |
| B — commercial | Relevant role/scope contracts from 02 are stable | BS360-04 then 05 | Must not import risk or create alternative decision authorities |
| C — explainability | Activity envelope and event allowlist are stable | BS360-06 | Unmapped events fail tests rather than falling back to raw payloads |
| D — workforce privacy | Person policy and no-prefetch tests are stable | BS360-07 | Sensitive readers remain isolated from generic summary/cache |
| E — network | MESH adapter and provenance contracts are stable | BS360-08 | Must remain local-first and independently degradable |
| F — definition content | Requirement-pack codes and manifest contract are stable | STUDIO portion of BS360-09 | Activation waits for corresponding NEON reader capability |

Parallel work must not fork shared public contracts. Contract changes go through BS360-00 ownership and update every consumer fixture in the same change.

## 8. Delivery evidence ledger

Update this table when a slice starts and in the same change that claims its exit gate.

| Slice | Status | Contract/DDL evidence | Service/API evidence | UI/browser evidence | Security/operations evidence |
|---|---|---|---|---|---|
| BS360-00 | In progress | [Contract lock](./athyper-business-partner-360-contract-lock.md); [P0 integration baseline](./athyper-business-partner-360-integration-baseline-evidence.md); v1 runtime contract; STUDIO descriptor; permission seed | Typechecks and contract/publication tests pass; technical review passed with fresh-build corrections | Seven deterministic acceptance families load and replay against the isolated three-plane baseline; legacy risk-band presentation removed | 177 DB/static tests, DDL model, three-plane contexts, migration/schema and risk-negative assertions pass; named owner approvals pending |
| BS360-01 | In progress | [Typed materialization closure](./athyper-business-partner-360-typed-materialization.md); [P0 security evidence](./athyper-business-partner-360-security-privacy-evidence.md); [production-repository evidence](./evidence/business-partner-360-materialization-evidence.json); forward migration; seven typed request-child contracts | Typed create/patch and atomic application wiring; full seven-family production-repository journey; exact replay/fingerprint/stale and service tests pass | N/A | Disposable migration, seven immutable child links, explicit legacy no-reinterpretation, clean rollback, six-stage fault injection, forced RLS/IDOR/scope/owner matrices and database leakage scans pass; accountable approvals pending |
| BS360-02 | In progress | [Secure 360 core](./athyper-business-partner-360-secure-core.md); v1 summary/manifest/envelope/safe-error contracts | Single visibility/scope/policy orchestration; bounded Kysely summary; summary/section routes; legacy compatibility adapter | Dark capability-gated canonical shell; manifest navigation; deterministic URL coordinates, abort, permission-epoch keys, and explicit states | Non-enumerating visibility, scoped permission decisions, masked-only identifiers, 75 KiB guard, no-store response, explicit relay allowlist, and focused tests pass; disposable-DB performance and browser E2E evidence pending |
| BS360-03 | In progress | [Common identity sections](./athyper-business-partner-360-common-identity-sections.md); typed identity/contact/address/identifier section contracts | Four independently authorized effective-dated readers; snapshot keyset cursors; masked-only identifiers/tax; purpose-bound audited reveal command | Independently abortable section panels, local failure states, provenance/redaction presentation, governed propose-change links, short-lived reveal state | Static typed-materialization/owner/masking/storage guards and focused service/client tests pass; disposable-DB concurrency/materialization, browser cleanup, and production protected-value resolver evidence pending |
| BS360-04 | In progress | [Role/scope and company configuration](./athyper-business-partner-360-role-scope-company.md); separate Roles/AP/AR contracts | Role-lens-bound organization validation; BP-bound legal entity validation; effective role/scope reader; isolated supplier AP and customer AR readers | Separate Roles & Scope, Procurement/AP, and Sales/AR components; global/missing/historical/read-only states; governed action routes; scoped-only cache invalidation | Dual-role/historical/scope/static tests pass and 360 bootstrap has no eligibility dependency; disposable-DB cross-scope/boundary and browser evidence pending |
| BS360-05 | In progress | [Commercial controls](./athyper-business-partner-360-commercial-controls.md); masked banking, supplier-control, certificate-manifest, and Credit review contracts | Independent safe projections; separate purpose-bound audited bank reveal; owning-service deep links; explicit relay allowlist | Banking, qualifications/preferences/blocks/certifications, and Credit review panels; scoped/historical states; 60-second reveal state | 55 service and 9 client tests pass; raw-bank/classification-negative static guards pass; attachment download authority, disposable-DB boundary tests, and browser leakage scans pending |
| BS360-06 | In progress | [Explainability](./athyper-business-partner-360-explainability.md); request/evidence/materialization, safe activity, and provider-summary contracts | Paginated request history; allowlisted fail-closed activity mapper; payload-free audit projection; isolated supported-provider port | Separate Requests, Activity, and Business Activity panels with open work, safe evidence links, pagination, and provider states | 59 service and 9 client tests pass; unmapped/redaction/cursor/provider-isolation/static leakage guards pass; concrete provider adapters, disposable-DB fixture coverage, and browser authorization/leakage tests pending |
| BS360-07 | In progress | [Person and workforce privacy](./athyper-business-partner-360-person-workforce-privacy.md); [P0 security evidence](./athyper-business-partner-360-security-privacy-evidence.md); safe person/workforce contracts and restricted-reader boundary | Effective workforce reader; HR/manager/ordinary/unauthorized matrix; step-up/no-store reveal; generic BP export and MESH guards | Person-first panels; historical read-only state; ephemeral audited reveal drawer with state clearing | Live forced-RLS/IDOR and MESH payload scans plus service/client/records suites pass; release-browser automation and independent privacy approval pending |
| BS360-08 | In progress | [MESH network](./athyper-business-partner-360-mesh-network.md); typed local/live summary and provenance contracts | Local-first account-link/projection/match/acceptance/bank-status reader; exact-role/person gate; independently authorized typed MESH adapter; 50–3000 ms timeout and isolated degradation | Network panel for received/matched/accepted/ignored/published/withdrawn states, status-only bank disclosure, live/local provenance, and stale/unavailable states | Service, adapter, client, NEON-plane, and DB-contract tests pass; production live transport, disposable three-plane RLS fixtures, and browser outage/authorization automation pending |
| BS360-09 | In progress | [Definition-driven completeness](./athyper-business-partner-360-completeness.md); seven versioned STUDIO requirement packs and typed required/recommended/action contracts | Verified-local definition parser; scope/effective/verification presence reader; restricted-presence evaluator; relevant-only fingerprints; definition failure isolated to completeness | Completeness card renders required/recommended outcomes, restricted satisfaction, server-provided governed links, and historical read-only state | Focused evaluator plus service/publication/client suites pass; disposable-DB pack boundaries, last-valid rollback integration, and governed-action browser automation pending |
| BS360-10 | In progress | 2026-08-30 | Codex | Safe OTEL metrics, dashboards/alerts, 0% feature seed, tenant-leading indexes, exact caller/scope query coordinates, responsive/a11y shell controls, release/retirement evaluators, and operations runbook added. Live high-cardinality plans, WCAG/browser certification, failure rehearsal, canary observation, owner approvals, and separate legacy retirement remain release-environment gates. | UI typecheck + 30 tests, master-data typecheck + 78 tests, control-admin typecheck + 53 tests, platform-host typecheck, 174 DB/static tests, dashboard JSON, alert YAML, and diff hygiene pass. Local DB cardinality is insufficient for performance qualification; rollout remains disabled. |

Allowed status values are `Not started`, `In progress`, `Blocked`, `Exit gate met`, and `Released`. `Exit gate met` means the slice evidence is complete in a development/integration environment; it does not itself certify production release.

## 9. Backlog alignment

This sequence depends on and contributes to the broader pending plan as follows:

| 360 slice | Related pending package | Coordination requirement |
|---|---|---|
| BS360-01 | P1 request/materializer closure | Reuse the single application authority and request-kind invariants |
| BS360-04 and 05 | P3 customer parity; P4 supplier completion | Compose existing company, readiness, qualification, bank, and credit authorities |
| BS360-07 | P2 workforce completion | Consume authoritative onboarding/employment/assignment lifecycle readers |
| BS360-00 and 09 | P6 STUDIO bundles | Publish compatible manifest, field policy, and completeness packs |
| BS360-08 | P8 MESH closure | Consume governed link/projection/publication contracts without cross-plane authority leakage |
| BS360-10 | P9 production qualification | Reuse common production evidence and add 360-specific performance/accessibility gates |

A dependency not yet complete in the pending plan does not authorize a temporary bypass. The affected 360 section remains unavailable or behind its capability flag until the authority is ready.

## 10. Immediate first implementation increment

Begin with a bounded BS360-00/01 contract-and-materialization increment:

1. create the field/authority/sensitivity ledger for Identity, Contacts, Addresses, and Identifiers & Tax;
2. inventory existing typed request children and protected evidence patterns for those four domains;
3. freeze the v1 scope, summary, manifest, section envelope, error, and risk-negative schemas;
4. implement one typed vertical apply path, starting with addresses;
5. prove apply, rollback, replay, stale-version, RLS, owner-type collision, masking, and audit/outbox non-leakage;
6. repeat the same pattern for contact person/channel, identifier, and tax;
7. only after those gates, start the BS360-02 summary shell and expose BS360-03 sections one at a time.

This first increment removes the largest data-integrity blocker while establishing the contracts needed for safe parallel delivery.
