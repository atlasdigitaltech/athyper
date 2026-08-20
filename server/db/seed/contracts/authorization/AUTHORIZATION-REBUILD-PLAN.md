# Athyper authorization rebuild plan

Status: Phase 1 inventory/compiler work package implemented. Phase 1 is Neon; Phase 2 is Studio; Phase 3 is Mesh. Enforcement remains disabled until the release gates for the active phase are green.

Current Phase 1 inventory result: 260/260 physical tables discovered, 45 attachment/content, business-partner and organization-topology tables reviewed, 215 explicitly pending review, 43 proposed operations, six proposed lifecycles, zero roles and zero grants. The strict release check intentionally fails while any table remains pending or the reviewed Studio-to-Neon organization provisioner remains unimplemented.

Mesh design inventory result: 78/78 master, document and network business-data tables discovered, eight network-topology tables reviewed, 70 explicitly pending review, 18 proposed operations, two proposed lifecycles, zero roles and zero grants. Its strict release check intentionally fails on pending review, the unimplemented Mesh-local provisioner and broad relationship/runtime RLS findings.

## Objective

Build a deny-by-default authorization product that is derived from reviewed business operations and lifecycles, not from SQL table names or UI routes. Cover every physical table, but publish permissions only for externally meaningful aggregate operations, lifecycle transitions, sensitive-data overlays, and tightly controlled system capabilities.

The clean baseline currently publishes 26 Studio, 23 Neon, and 32 Mesh permission definitions with no roles or grants. Neon has only two entity-operation definitions and neither is bound to a released operation. Phase 1 replaces this minimal baseline with reviewed Neon authority before any user receives a grant.

## Physical coverage boundary

Phase 1 covers the complete Neon-visible storage surface:

| Surface | Common tables | Neon tables | Total |
| --- | ---: | ---: | ---: |
| `master` | 28 | 112 | 140 |
| `document` | 1 | 119 | 120 |
| Total | 29 | 231 | 260 |

The source of truth for this inventory is the ordered Neon DDL manifest and these table definitions:

- `ddl/common/master/03_platform_tables.sql`
- `ddl/common/master/03_tables.sql`
- `ddl/planes/neon/master/03_tables.sql`
- `ddl/common/document/03_tables.sql`
- `ddl/planes/neon/document/03_tables.sql`

Every table must appear exactly once in a generated coverage contract. A missing or multiply classified table fails the compiler.

## Table classification model

Do not create a role or permission merely because a table exists. Classify every table into one of these ownership classes:

| Class | Meaning | Authorization treatment |
| --- | --- | --- |
| Aggregate root | User-visible business object with its own identity and lifecycle | Publish exact entity operations and lifecycle transitions. |
| Aggregate child | Line, component, assignment, allocation, identifier, registration, participant or other root-owned collection | No standalone CRUD permission. Mutate only through the root aggregate operation and inherit its scope. |
| Reference/configuration root | Governed setup data | Publish `read`, `create`, `update`, and only the reviewed activation/retirement transitions. |
| Sensitive overlay | PII, bank, tax, compensation, payroll, risk evidence or confidential content | Require an additional exact sensitive read/write/verify capability; ordinary root access is insufficient. |
| Immutable evidence | Posting output, history, audit evidence, calculation result, allocation evidence or lifecycle receipt | End users receive read authority only. Writes are service-owned and append-only. Corrections use a reviewed reversal or supersession operation. |
| Projection/derived state | Quota, cursor, schedule, balance, derivative, generated output or cache | No direct end-user mutation. A service capability owns refresh, reconcile, rebuild, render or retry. |
| Technical work state | Upload part, import chunk, worker attempt, queue or internal orchestration row | Worker/service principal only; never included in a human role. |

Examples:

- `purchase_invoice` is an aggregate root; invoice lines, distributions and applied payment terms are children.
- `journal_entry` is an aggregate root; journal lines and references are children; posting creates immutable accounting evidence.
- `business_partner` is a root; identifiers, tax registrations and organization assignments are root-owned collections. Supplier and customer extensions retain their own reviewed lifecycles.
- attachment quota rows, feed cursors, multipart parts and render outputs are projection/technical state, not user-managed records.
- `person_sensitive_profile`, bank details, compensation, payroll results and tax declarations require sensitive overlays.

## Permission model

Every published permission uses:

```text
neon.{business_domain}.{aggregate_or_capability}.{operation}
```

The storage schema is not automatically the business domain. Preferred domains include `relationship`, `organization`, `finance`, `treasury`, `procurement`, `sales`, `inventory`, `asset`, `catalog`, `project`, `risk`, `people`, `payroll`, `collaboration`, and `content`.

Examples:

```text
neon.relationship.business_partner.read
neon.relationship.business_partner.update
neon.relationship.business_partner.activate
neon.procurement.purchase_invoice.submit
neon.procurement.purchase_invoice.approve
neon.finance.journal_entry.post
neon.finance.journal_entry.reverse
neon.treasury.payment_entry.release
neon.people.employee.read_sensitive
neon.collaboration.attachment.download
neon.finance.inventory.rebuild
```

### Entity operation versus capability

Use an `entity_operation` when the request acts on one published aggregate or performs one of its lifecycle transitions. Use a `capability` only when the action is cross-aggregate, batch, operational, diagnostic, generated-output, or a sensitive-data overlay that is not itself a lifecycle transition.

| Operation family | Recommendation |
| --- | --- |
| Read | One `read` permission normally covers get/list/search at the same exposure and scope. Split `read_sensitive` and `export` because their risk differs. |
| Draft mutation | Use `create` and `update`; use `aggregate_update` only where child collection changes must be transactional with the root. |
| Deletion | Prefer `archive`, `retire` or `cancel`. Publish `delete` only when permanent deletion is a valid reviewed business action. |
| Approval lifecycle | Publish distinct `submit`, `approve`, `reject`, `withdraw`, `cancel`, and `reopen` operations only where the lifecycle supports them. |
| Accounting lifecycle | Publish distinct `post`, `reverse`, `close`, `reopen`, `release`, and `reconcile` operations. Posted evidence is never edited. |
| Logistics lifecycle | Use domain transitions such as `release`, `confirm`, `receive`, `accept`, `issue`, `complete`, and `close`. |
| Operational capability | Use exact capabilities such as `import`, `export`, `render`, `download`, `retry`, `rebuild`, `force_release`, or `provider_diagnostics`. |

Generic `manage`, caller-supplied permission codes, wildcard permissions, and route-only permission names are prohibited. Existing `manage` capabilities must be decomposed when they cover materially different authority.

## Scope model

Each permission declares an explicit compatible scope and the request supplies every required coordinate:

| Scope | Neon use |
| --- | --- |
| `tenant/exact` | Tenant-wide reference data or operations that truly cannot be partitioned further. |
| `legal_entity/exact` | Legal entity master, tax, assets and entity-owned business operations. |
| `company_code/exact` | Accounting, procurement, sales, payment and finance operations. |
| `operating_organization/subtree` | Organizational master, procurement/sales responsibility and operational ownership. |
| `resource/exact` | Record-specific ACL, project, site, warehouse, bank account or other resource coordinate until a reviewed first-class scope kind exists. |

Do not widen absent coordinates to tenant scope. `member_companies` and `relationship_participants` remain disabled until their resolvers have live qualification.

## Lifecycle and application wiring

The request path is obligatory:

1. Keycloak authenticates the subject and supplies organization/client/assurance claims. It does not grant Neon business permissions.
2. The BFF resolves an active organization projection, tenant-local principal, identity binding, plane membership and current `auth_epoch`.
3. A route requests a typed business operation such as `{ entityCode, operationKey }`; it does not nominate an arbitrary permission string.
4. The active runtime descriptor resolves exactly one published `authz.entity_operation_binding` plus required scope-coordinate bindings.
5. The central authorizer evaluates entitlement, explicit deny, allow evidence, scope containment, projection ceiling, MFA, SoD and hard policy.
6. The service opens the transaction, reloads current record status/version, validates the exact lifecycle transition, and performs the aggregate mutation.
7. Audit and outbox evidence are appended in the same transaction. A financial or immutable operation uses reversal/supersession rather than direct editing.

Studio authors the entity operation, lifecycle and policy contracts. Activation must atomically publish the matching Neon `runtime_meta.entity_descriptor`, `authz.entity_operation_binding`, and `authz.entity_operation_scope_binding`. Rollback restores those artifacts from the same release.

Specialized services currently using short strings such as `finance.ledger.post`, `documents.render`, `master.contact.pii.read`, and `records.create` must migrate to the same typed operation/capability registry. No compatibility alias is added.

## Phase 1 — Neon

### N1. Complete coverage inventory

Produce `neon-table-authorization-coverage.v1.json` with one row for every one of the 260 tables:

- table and owning package;
- business domain and aggregate root;
- classification;
- externally readable/writable flags;
- status/version/soft-delete fields;
- parent/root coordinate;
- sensitivity classification;
- required scope coordinates;
- writer identity: user service, worker, projection reconciler, or database-only;
- current route/service/repository references;
- lifecycle contract owner.

Gate: 260/260 classified, no duplicate ownership, no unexplained direct writer.

### N2. Define aggregates and lifecycle contracts

Review the inventory by business slices:

1. shared tenant, profile, address, contact, attachment, comment, conversation and content;
2. organization, legal entity, company code, organizational structure and finance setup;
3. business partner, supplier, customer, bank/tax, certification and risk;
4. catalog, product, item, BOM, warehouse and production;
5. procurement, requisition, sourcing, commitments, invoices, receipts and service sheets;
6. sales opportunity, quotation, sales order and fulfillment;
7. journal, payment, bank reconciliation, budget, planning, tax, asset and close operations;
8. project and WBS;
9. people, employment, attendance, leave, compensation and payroll;
10. imports, rendering, derivatives, quota and other system-owned work state.

For each aggregate, approve its operations, state transition graph, risk tier, MFA, SoD, entitlement, scope coordinates, event, idempotency and correction behavior.

Gate: every externally executable operation has one owner and one reviewed transition/policy contract.

### N3. Compile the Neon catalog and operation bindings

- Generate the canonical catalog from approved contracts.
- Generate explicit scope compatibility.
- Generate one and only one binding for every executable entity operation.
- Reject incomplete scope bindings, dynamic permission codes, aliases, generic actions and unbound lifecycle operations.
- Keep roles and grants at zero during catalog qualification.

Gate: zero missing, ambiguous or invalid Neon operation bindings; deterministic compiler output and double-compile equality.

### N4. Wire services and database enforcement

- Add typed `authorizeCapability` and `authorizeEntityOperation` entry points.
- Make records, documents, attachments, master-data and finance services pass exact operation and resource coordinates.
- Remove route/service permission literals and caller-selected permission strings.
- Authorize before mutation, then revalidate status/version and policy inside the same transaction.
- Make aggregate children inaccessible through generic standalone mutation.
- Bind application projection ceilings to every effective scope evaluation.
- Qualify RLS under actual runtime, worker, projection and administrator roles.

Gate: zero unqualified Neon application permission references and zero direct unguarded production mutation paths.

### N5. Build reviewed job-function roles

Roles are curated bundles over permissions; they are never generated from tables. Initial candidates:

- Neon read-only auditor;
- organization/master-data steward;
- business-partner onboarding preparer and reviewer;
- supplier bank/tax verifier;
- procurement requester, buyer, approver and receiver;
- AP invoice processor and AP approver;
- GL accountant, poster and controller;
- treasury payment preparer and payment releaser;
- inventory operator and inventory controller;
- asset accountant;
- sales representative and sales approver;
- project accountant and project manager;
- risk analyst and risk approver;
- employee self-service, line manager, HR operations;
- payroll processor and payroll approver;
- integration worker roles with exact system actions.

Mandatory SoD pairs include preparer/approver, invoice processor/payment releaser, journal preparer/poster, payment preparer/releaser, supplier-bank editor/verifier, payroll processor/approver, and risk assessor/final approver. Critical roles require MFA, finite assignments, named owners and approval evidence.

Gate: every role has an owner, purpose, incompatible-role set, reviewed permission diff, allowed scopes and positive/negative persona tests.

### N6. Qualify and enable Neon

- Apply the catalog with zero grants and prove no access.
- Apply reviewed pilot roles to dedicated test principals only.
- Run tenant, legal-entity, company-code, organization-subtree and exact-resource isolation tests.
- Run lifecycle invalid-transition, stale-version, missing-coordinate, MFA, SoD, deny, delegation revocation and ACL tests.
- Revoke Keycloak organization/client admission and confirm session/access loss within SLA.
- Run double apply, rollback, projection provenance and runtime-role RLS qualification.
- Enable Neon enforcement only after all gates are green; Studio and Mesh remain deny-all.

## Phase 2 — Studio

Repeat the same process for Studio control, metadata, IAM/trust, onboarding, publication, document and administrative aggregates. Prioritize:

- authorization catalog/role administration with independent approval;
- entity metadata authoring and release lifecycle;
- organization/application projection lifecycle;
- tenant/subscription administration;
- onboarding cases and work items;
- publication/release/rollback;
- support and break-glass operations.

Studio may author releases for other planes, but it never receives direct Neon or Mesh data authority. Cross-plane changes go through signed/versioned projection contracts and plane-local appliers.

## Phase 3 — Mesh

Repeat the process for Mesh partner, network account, relationship, exchange, envelope, collaboration and document lifecycles. Prioritize bilateral scope and participation:

- network-account admission;
- relationship establishment, suspension and termination;
- partner profile and certification;
- document envelope publish/share/accept/reject/revoke;
- exact-record ACL and participant visibility;
- cross-tenant exchange delivery, retry and reconciliation.

Mesh authority must be the intersection of local tenant authority, network relationship state, participant coordinates and the application projection ceiling. No relationship or participant coordinate means deny.

## Cross-phase release gates

No phase enables enforcement until it proves:

- complete physical-table classification;
- complete application-demand coverage;
- exactly one binding per executable entity operation;
- explicit scope, entitlement, risk, MFA and SoD metadata;
- no generic, unqualified, dynamic or caller-selected permission;
- no child/evidence/system table exposed as generic CRUD;
- no runtime administrator, owner, superuser or `BYPASSRLS` identity;
- reviewed roles with zero unintended effective-access edges;
- live RLS, projection provenance, suspension, session revocation and rollback;
- deterministic fresh build and double apply.

## First implementation work package

Start Phase 1 with a non-enforcing inventory/compiler change only:

1. generate the 260-row Neon table coverage contract from DDL and repository references;
2. classify the shared attachment/content and business-partner slices as the first reviewed examples;
3. define typed operation and lifecycle contract schemas;
4. make the compiler fail for an unclassified table, an unowned writer, a child published as generic CRUD, or an operation without scope coordinates;
5. publish a review report, but do not create roles, grants or enforcement changes.

This establishes the repeatable mechanism before the larger procurement, finance, people and payroll decisions are encoded.

Implemented artifacts and commands:

- `inventory/neon/reviewed-slices.v1.json` — reviewed example ownership, operations and lifecycles;
- `inventory/neon/compiled/table-authorization-coverage.v1.json` — deterministic 260-row DDL/repository inventory;
- `inventory/neon/compiled/review-report.md` — human review report and pending queue;
- `pnpm --filter @athyper/server-db run db:seed:authorization:neon-inventory:build`;
- `pnpm --filter @athyper/server-db run db:seed:authorization:neon-inventory:check`;
- `pnpm --filter @athyper/server-db run db:seed:authorization:neon-inventory:release-check` — must remain red until all 260 rows are reviewed.

## Organization-topology slice

The next reviewed slice adds Neon legal entities, company codes, operating organizations, procurement/sales organization profiles and operating-organization/company-code assignments.

- Neon owns all three aggregate records and their `draft -> active -> inactive -> retired -> archived` business lifecycles.
- Keycloak proves subject, client, organization admission and assurance only. Keycloak roles are not Neon business permissions and do not own any Neon organization record.
- Studio onboarding owns the case, approval, desired version/hash and reconciliation evidence. `active` on the onboarding case means orchestration convergence only.
- TrustIAM `application_projection` and `projection_scope` rows constrain the maximum authorization scope. They never create a Neon master record and never grant a Neon business permission.
- Studio direct SQL into Neon is forbidden. An authenticated, allowlisted, idempotent command must be executed by a Neon-local master-data provisioner in the exact target database.
- The provisioner may create or update only `draft` rows using per-resource field allowlists. It may not activate a record, mutate authorization catalogs, delete organization history or change immutable topology coordinates.
- Legal-entity/company-code ownership and operating-organization hierarchy coordinates are immutable after creation in this slice. Reparenting or reassignment remains unpublished until a dual-coordinate scope and downstream-impact workflow is reviewed.
- Company-code assignment is an operating-organization aggregate operation requiring both `operatingOrganizationId` and `companyCodeId`; the assignment table has no standalone CRUD permission.
- Activation, deactivation, retirement and archival are Neon-local lifecycle operations with exact scope, MFA and SoD requirements.

The boundary contract is `inventory/neon/studio-neon-organization-boundary.v1.json`. Its plane-local provisioner is intentionally marked `required_not_implemented`, so this slice remains design-only and non-enforcing.

## Mesh network-topology slice

The first Mesh slice reviews `network_account`, its identifier/reference/profile/commodity/tax children, the bilateral `network_relationship`, and append-only `network_lifecycle_event` evidence.

- Keycloak supplies identity, client/organization admission and assurance only.
- Studio onboarding may request only a pending Mesh network account. It cannot activate an account or create, accept, reject, suspend, resume or terminate a relationship.
- TrustIAM projects an exact `network_account` scope and mandatory `networkRoleCeiling`. A Mesh relationship scope is a participant-specific descendant of that account ceiling.
- Mesh owns account activation and every relationship lifecycle decision. Relationship acceptance is performed only by the counterparty; the initiator cannot accept its own request.
- Every relationship operation carries acting-account, buyer-account, supplier-account, buyer-tenant and supplier-tenant coordinates. Existing relationships additionally require the exact relationship coordinate. Missing coordinates deny.
- Network-account role, account/participant identities and relationship buyer/supplier coordinates cannot be changed through generic update operations.
- Account activation, reinstatement, retirement, relationship acceptance/resume/termination and network-role changes carry reviewed MFA and SoD gates. Suspension remains a high-risk immediate safety action and does not wait for SoD.
- Lifecycle evidence is append-only and database-written in the same transaction as the state transition.

Static review found `mesh.network_relationship` still uses participant `FOR ALL` mutation RLS and all eight reviewed tables retain a `CURRENT_USER` broad-write policy. Those findings are release blockers: runtime mutation must become function-only and side-aware under qualified least-privilege roles.

Implemented artifacts and commands:

- `inventory/mesh/reviewed-slices.v1.json` — reviewed ownership, bilateral coordinates, operations and lifecycles;
- `inventory/mesh/studio-mesh-network-boundary.v1.json` — Keycloak/Studio/TrustIAM/Mesh authority separation;
- `inventory/mesh/compiled/table-authorization-coverage.v1.json` — deterministic 78-row coverage inventory;
- `inventory/mesh/compiled/review-report.md` — human review and RLS qualification report;
- `pnpm --filter @athyper/server-db run db:seed:authorization:mesh-inventory:build`;
- `pnpm --filter @athyper/server-db run db:seed:authorization:mesh-inventory:check`;
- `pnpm --filter @athyper/server-db run db:seed:authorization:mesh-inventory:release-check` — remains red until all 78 rows and implementation/RLS blockers are cleared.
