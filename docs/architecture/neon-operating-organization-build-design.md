# Neon operating organization build design

**Status:** Implementation in progress; foundation and first Procurement entry guard are built  
**Scope:** Neon Web, Finance, Procurement, Sales, Inventory, People, Projects, shared shell, experience APIs, authorization, master data, audit, telemetry, and localization  
**Companion:** [Neon company context and friendly identity design](./neon-company-context-and-identity-design.md)  
**Decision:** An operating organization is a tenant-owned operational responsibility boundary. It is not a statutory owner, accounting owner, authentication context, or replacement for a company code.

## 1. Canonical model

Neon has two related organization structures inside one authenticated tenant:

```text
Tenant
|-- Legal Entity hierarchy
|   `-- Company Code
|
`-- Operating Organization hierarchy
    |-- Procurement organization
    |-- Sales organization
    `-- Shared-services organization
          <many-to-many, effective-dated assignment>
        Company Codes
```

The structures answer different questions:

| Coordinate | Question answered | Primary responsibility |
|---|---|---|
| Tenant | Whose isolated business data is this? | Authentication, tenancy and data isolation |
| Legal entity | Which statutory person owns the obligation? | Incorporation, tax, regulation and statutory reporting |
| Company code | Which accounting entity posts and balances the transaction? | Ledgers, fiscal periods, currency and transactional ownership |
| Operating organization | Which operational team coordinates or owns the process? | Procurement, sales and shared-service responsibility |
| Site | Where is the physical operation performed? | Stock, receiving, shipping and physical execution |
| Org unit | Where does a person sit in the management structure? | People hierarchy and managerial responsibility |

The legal-entity tree and operating-organization tree must not be merged. An operating organization can serve company codes owned by different legal entities. Every posted business transaction still has one authoritative company code unless a domain contract explicitly models a governed intercompany command.

## 2. Existing foundation

The Neon schema already provides the correct base:

- `master.legal_entity` is tenant-owned and may have a legal-entity parent.
- `master.company_code` belongs to exactly one same-tenant legal entity.
- `master.operating_organization` is tenant-owned and may have an operating-organization parent.
- `master.operating_organization_company_assignment` joins organizations and companies many-to-many with role, status and effective dates.
- `master.procurement_organization_profile` and `master.sales_organization_profile` add optional behavior to an organization.
- Procurement may declare a lead company.
- Sales may declare booking and invoicing companies.
- Authorization snapshots already carry `operatingOrganizationIds` independently from company and legal-entity IDs.

This design qualifies and exposes those structures without moving master-data ownership into Keycloak, browser storage, or authentication sessions.

### 2.1 Implementation checkpoint (2026-08-18)

- Stage 1 canonical DDL and a forward migration now enforce controlled participation roles, non-overlapping active assignments, hierarchy cycle/depth protection, and effective profile-default membership.
- Stage 2 exposes a typed, exact-Neon operating-organization catalog whose organization and company authorization coordinates are intersected independently.
- Stage 3 provides a company-aware, capability-aware organization provider and accessible selector with recoverable errors, privacy-safe telemetry, tenant/principal-scoped preferences, and injectable locale messages.
- Stage 4 has started: the Procurement entry route requires an exact compatible company and procurement organization and produces an explicit command scope. Transactional purchase-order command validation, audit/outbox evidence, and domain-level negative tests remain the next slice.
- Stages 5 through 7 remain planned. `member_companies` authorization propagation remains disabled pending its separate expansion, effective-time, deny-precedence, and cross-company security qualification.

## 3. Locked domain invariants

### 3.1 Ownership

1. Every record belongs to exactly one tenant.
2. Every company code belongs to exactly one legal entity in the same tenant.
3. An operating organization belongs directly to the tenant, not to a legal entity.
4. An operating organization may participate with zero or more company codes.
5. A company code may participate in zero or more operating organizations.
6. Company participation does not transfer statutory or accounting ownership.
7. Operating-organization hierarchy edges never cross a tenant.
8. Historical documents retain their original company and organization coordinates after later reorganization.

### 3.2 Hierarchy

1. An organization cannot be its own parent.
2. The hierarchy must be acyclic, including indirect ancestry.
3. A node has at most one active parent in version 1.
4. Authorization `subtree` propagation follows only effective, active descendant edges.
5. Moving a node is a governed amendment that changes authorization/catalog revisions.
6. A hierarchy mutation must be rejected if it creates a cycle, excessive depth, or an ambiguous effective-time state.

Recommended initial maximum depth: 12. This is high enough for enterprise structures and prevents accidental or malicious recursive expansion.

### 3.3 Company participation

1. Organization/company assignments are effective-dated.
2. At most one active assignment exists for the same organization, company and participation role at a business instant.
3. Initial controlled roles are `lead` and `participant`; new roles require reviewed reference data and semantics.
4. A profile's lead, booking or invoicing company must be an effective member of that organization.
5. Deactivating an assignment blocks new operations but does not alter historical documents.
6. Backdated assignment changes require an explicit governed amendment and audit reason.
7. Assignment resolution uses the document business date, not only the current clock.

### 3.4 Profiles and capabilities

Organization `domain` is a classification and search hint. Executable behavior comes from validated profiles and permissions.

- A procurement-capable organization has a valid procurement profile.
- A sales-capable organization has a valid sales profile.
- A shared-services organization may coordinate multiple capabilities through explicit profiles.
- Domain alone never grants a capability.
- Profile defaults propose values; they do not bypass company authorization or write validation.

## 4. Context model

Authentication, browsing and commands use separate context objects.

### 4.1 Authenticated tenant context

The Neon BFF session owns:

```ts
interface NeonTenantSession {
  readonly plane: "neon";
  readonly tenantId: string;
  readonly principalId: string;
  readonly authEpoch: number;
}
```

The browser cannot choose or override these values in an API request.

### 4.2 User work context

The frontend may retain a reversible preference:

```ts
interface NeonOperationalWorkContext {
  readonly companyScope:
    | { readonly mode: "all_permitted" }
    | { readonly mode: "legal_entity"; readonly legalEntityId: string }
    | {
        readonly mode: "company";
        readonly companyCodeId: string;
        readonly legalEntityId: string; // resolved from the current catalog
      };
  readonly operatingOrganization?: {
    readonly id: string;
    readonly domain: "procurement" | "sales" | "shared_services" | string;
  };
  readonly siteId?: string;
}
```

This state improves usability only. It is not authorization evidence and must be revalidated after login, tenant change, authorization-epoch change, catalog revision, expiry, suspension or effective-date change.

### 4.3 Command scope

Commands carry exact domain coordinates:

```ts
interface ProcurementCommandScope {
  readonly companyCodeId: string;
  readonly operatingOrganizationId: string;
  readonly businessDate: string;
  readonly siteId?: string;
}
```

The server derives the legal entity from the company. A command must not accept an independently selected legal entity/company pair. Legal-entity ID is supplied only when the operation itself is legally scoped and the server still validates consistency.

## 5. Context requirements by Neon surface

Use explicit route and operation policies instead of implicit component assumptions:

```ts
type NeonContextRequirement =
  | "tenant"
  | "company_or_all"
  | "legal_entity_or_all"
  | "company_required"
  | "company_site_required"
  | "company_procurement_org_required"
  | "company_sales_org_required"
  | "operating_org_or_all";
```

| Surface | Browse/report context | Mutation context |
|---|---|---|
| Neon dashboard | Tenant, company, organization or all permitted | Not applicable |
| Core Accounting | Company, legal entity or all permitted | Exact company |
| Journal posting | Exact company | Exact company |
| Consolidation | Legal entity or all permitted | Governed consolidation scope |
| Procurement lists | Company, procurement organization or all permitted | Exact company + procurement organization |
| Purchase order | Exact company + procurement organization | Exact company + procurement organization |
| Sales lists | Company, sales organization or all permitted | Exact company + sales organization |
| Sales order | Exact company + sales organization | Exact company + sales organization; booking/invoicing rules validated |
| Inventory availability | Company, site or bounded all-permitted | Exact company + site for movement |
| Stock movement | Exact company + site(s) | Exact company + source/destination site |
| People | Tenant, legal entity, company or org unit as operation permits | Explicit employment/company coordinate |
| Projects | Company, organization or portfolio as operation permits | Exact owning company; organization when process-owned |
| Shared services | Operating organization or all permitted | Exact beneficiary company + responsible organization |

`all_permitted` is valid only for bounded reads and reports. It is never a write coordinate and never silently resolves to a default company.

## 6. Selection experience

### 6.1 Shell

The global Neon shell keeps Company as the primary operational selector:

```text
Athyper Neon | Athyper Group Holdings | Company: Athyper Malaysia Retail | Priya Nair
```

Operating Organization is shown only when relevant to the current module or route:

```text
Procurement / Purchase Orders
Company: Athyper Malaysia Retail
Procurement organization: Athyper Global Procurement
```

This prevents Finance users from being forced through an irrelevant organization choice.

### 6.2 Bidirectional filtering

- Selecting a company filters organizations to active assignments compatible with that company, module and permission.
- Selecting an organization filters company choices to effective, authorized member companies.
- A filter that yields one choice may propose it as a default.
- A mutation must display and confirm the exact company even when only one choice remains.
- Changing either coordinate clears incompatible site, draft defaults and company-/organization-scoped query data.
- The system never silently replaces an incompatible mutation context with a different company.

### 6.3 Lead/default behavior

Lead, booking and invoicing companies are defaults, not authority:

- A lead company may be preselected for a new draft only if it is active, assigned and permitted.
- The selected accounting company remains visible on the form and confirmation.
- A sales booking company and invoicing company may differ only through an explicit domain rule.
- Cross-company results create auditable intercompany consequences rather than hiding company ownership.

### 6.4 Persistence

Persist only IDs and mode under a tenant/principal namespace:

```text
athyper.neon.operational-context.v1:{tenantId}:{principalId}:{module}
```

Labels, assignments, profiles and permissions always come from fresh validated catalogs. Preferences are discarded when the selected coordinates are missing or incompatible.

### 6.5 Localization and accessibility

- All UI copy comes from locale catalogs; identifiers and error codes remain stable.
- Organization display name falls back from localized name to `display_name`, `name`, then `code`.
- Search uses locale-aware collation and normalization.
- Currency, country, timezone and business-date presentation uses the effective company locale unless the user explicitly selects another supported display locale.
- Selectors expose type, code, company participation and status as text; color and icons are not the only cues.
- Desktop uses an accessible dialog/popover; mobile uses a full-height sheet.
- Focus restoration, keyboard selection, live-region announcements and WCAG 2.2 AA remain mandatory.

## 7. Discovery API contracts

Keep company discovery and operating-organization discovery separate so their authorization, size, caching and lifecycle can evolve independently.

### 7.1 Company catalog

Existing operation:

```http
GET /api/neon/work-contexts
```

It returns permitted active company codes with their derived legal entities.

### 7.2 Operating-organization catalog

Add:

```http
GET /api/neon/operating-organizations
```

Supported filters:

```text
companyCodeId=<uuid>
domain=procurement|sales|shared_services
effectiveAt=YYYY-MM-DD
cursor=<opaque>
```

Response:

```ts
interface NeonOperatingOrganizationCatalog {
  readonly schemaVersion: 1;
  readonly tenantId: string;
  readonly revision: string;
  readonly effectiveAt: string;
  readonly organizations: readonly {
    readonly id: string;
    readonly code: string;
    readonly displayName: string;
    readonly domain: string;
    readonly parentId?: string;
    readonly path: readonly { readonly id: string; readonly displayName: string }[];
    readonly capabilities: readonly ("procurement" | "sales" | "shared_services")[];
    readonly companyAssignments: readonly {
      readonly companyCodeId: string;
      readonly participationRole: "lead" | "participant" | string;
      readonly effectiveFrom: string;
      readonly effectiveUntil?: string;
    }[];
    readonly defaults?: {
      readonly leadCompanyCodeId?: string;
      readonly bookingCompanyCodeId?: string;
      readonly invoicingCompanyCodeId?: string;
      readonly currency?: string;
    };
  }[];
  readonly nextCursor?: string;
}
```

The endpoint returns only organizations for which the principal has at least one effective capability. It must not expose inaccessible organizations merely because they share a company assignment.

### 7.3 Context compatibility

For large or rapidly changing tenants, add a focused validation operation:

```http
POST /api/neon/context-decisions
```

```ts
interface NeonContextDecisionRequest {
  readonly operationCode: string;
  readonly companyCodeId?: string;
  readonly operatingOrganizationId?: string;
  readonly siteId?: string;
  readonly businessDate: string;
}

interface NeonContextDecision {
  readonly allowed: boolean;
  readonly reasonCode?: string;
  readonly normalized: {
    readonly companyCodeId?: string;
    readonly legalEntityId?: string;
    readonly operatingOrganizationId?: string;
    readonly siteId?: string;
  };
  readonly revision: string;
}
```

This operation is a UX preflight. The domain command must authorize and validate again inside its transaction.

## 8. Authorization model

An operation is allowed only when all applicable dimensions intersect:

```text
permission entitlement
AND active principal/plane membership
AND tenant boundary
AND company/legal-entity scope
AND operating-organization scope
AND effective organization-company assignment
AND resource/site scope when required
AND business policy (MFA, SoD, approval, period, status)
```

### 8.1 Propagation

- Tenant scope covers the tenant only where the permission contract allows tenant scope.
- Company-code scope is exact unless a reviewed permission contract says otherwise.
- Legal-entity scope is exact; expansion to owned companies is performed only by a qualified resolver for a compatible permission.
- Operating-organization `subtree` expands only to active descendants.
- `member_companies` must remain disabled until its resolver, deny precedence, temporal behavior and live qualification cases are complete.
- Deny evidence wins over allow evidence at the covered coordinate.

### 8.2 Cross-dimensional grants

Possessing an operating-organization grant does not automatically grant accounting access to all member companies. For a purchase-order command, the user needs both:

1. permission coverage for the chosen procurement organization; and
2. permission coverage for the chosen company, directly or through a compatible reviewed scope.

This intersection prevents an organization administrator from gaining unintended finance access and prevents a company accountant from acting for an unrelated procurement organization.

### 8.3 Server authorization resource

Every domain service should authorize with a complete resource coordinate:

```ts
await authorizer.authorize({
  context,
  permissionCode: "neon.procurement.purchase_order.create",
  resource: {
    tenantId: context.tenantId,
    entityCode: "purchase_order",
    operationKey: "create",
    companyCodeId,
    legalEntityId: company.legalEntityId,
    operatingOrganizationId,
    siteId,
  },
});
```

Missing required coordinates fail closed through operation bindings.

## 9. Command processing

For a company/organization-owned write, the server executes in this order:

1. Resolve the immutable verified Neon request context.
2. Validate the typed command and idempotency key.
3. Load the company with `(tenant_id, company_code_id)`.
4. Derive its legal entity; never trust a mismatched browser pair.
5. Load the operating organization with `(tenant_id, organization_id)`.
6. Validate status, hierarchy/profile capability and effective dates.
7. Validate the effective organization/company assignment at the business date.
8. Load and validate the site or resource coordinate when required.
9. Authorize the permission against all required coordinates.
10. Evaluate MFA, segregation-of-duties, period and domain policy.
11. Write the transaction, audit record and outbox event atomically.
12. Return the authoritative coordinates and revision.

No middleware-supplied global organization header may replace explicit command coordinates.

## 10. Persistence and historical truth

Business documents store immutable identifiers needed to explain responsibility at creation and posting:

```text
tenant_id
company_code_id
legal_entity_id (derived/validated snapshot where the domain requires it)
operating_organization_id (when process-owned)
site_id (when physically executed)
business_date
```

Names are resolved for current UI presentation. Legally required document rendering may additionally retain an approved immutable organization-name/address snapshot according to the document policy.

Reorganizations never rewrite posted history. A superseding assignment changes which new documents may be created from its effective date.

## 11. Database hardening

The current same-tenant foreign keys remain authoritative. Add qualification for:

1. Recursive cycle detection on organization parent changes.
2. A bounded hierarchy-depth guard.
3. Non-overlapping effective assignment ranges for identical organization/company/role coordinates.
4. Controlled participation-role reference data.
5. A deferred trigger or service invariant ensuring profile default companies are effective organization members.
6. Status/effective-time consistency for organization, company and assignment.
7. Governed amendment evidence for backdated or structural changes.
8. Supporting indexes for active descendants, effective assignments, company-to-organization lookup and organization-to-company lookup.

Prefer database constraints for structural impossibilities and transaction-domain validation for rules involving business date, authorization or multiple lifecycle states.

## 12. Frontend provider structure

Build on the existing company provider:

```text
Principal-scoped application providers
`-- NeonWorkContextProvider
    `-- NeonOperatingOrganizationProvider
        `-- Module route/context guard
            `-- Domain queries and commands
```

Provider responsibilities:

- `NeonWorkContextProvider`: permitted companies and legal entities.
- `NeonOperatingOrganizationProvider`: permitted organizations and compatibility with the selected company/module/date.
- Route guard: usability requirements and recovery UI.
- Typed domain client: explicit coordinates in every operation.
- Server: final authority.

Query keys include every effective coordinate:

```ts
[
  "principal", plane, tenantId, principalId, authEpoch,
  "company", companyScopeKey,
  "operating-organization", operatingOrganizationId ?? "none",
  "site", siteId ?? "none",
  operationId, input
]
```

Changing a coordinate cancels matching in-flight requests, clears incompatible drafts, invalidates affected cache entries and re-evaluates the current route.

## 13. Error contract and recovery

Use stable problem codes with localized presentation:

| Code | Meaning | Recovery |
|---|---|---|
| `NEON_COMPANY_REQUIRED` | A write lacks an exact company | Open company picker |
| `NEON_OPERATING_ORGANIZATION_REQUIRED` | Module operation needs an organization | Open filtered organization picker |
| `NEON_CONTEXT_INCOMPATIBLE` | Company/org/site combination is invalid | Preserve valid coordinates and request correction |
| `NEON_ORGANIZATION_NOT_PERMITTED` | Principal lacks effective organization scope | Refresh catalogs; contact administrator |
| `NEON_COMPANY_NOT_PERMITTED` | Principal lacks effective company scope | Refresh catalogs; contact administrator |
| `NEON_ORGANIZATION_ASSIGNMENT_INACTIVE` | Organization does not serve company at business date | Choose a compatible organization/company |
| `NEON_ORGANIZATION_PROFILE_REQUIRED` | Required procurement/sales profile is absent | Administrator configuration |
| `NEON_CONTEXT_REVISION_STALE` | Master data or authorization changed | Refresh catalogs and retry safely |
| `NEON_SITE_REQUIRED` | Physical operation needs a site | Open site picker |
| `NEON_CONTEXT_SERVICE_UNAVAILABLE` | Catalog/decision service unavailable | Retry with support reference; do not use stale authority |

Never silently change an exact write context after an error. Read-only pages may fall back to a broader permitted view only when the route contract explicitly allows it and the UI announces the change.

## 14. Telemetry and audit

### 14.1 Browser diagnostics

Emit privacy-bounded events:

- `neon.operating_context.catalog_loaded`
- `neon.operating_context.catalog_failed`
- `neon.operating_context.organization_changed`
- `neon.operating_context.compatibility_failed`
- `neon.operating_context.selection_invalidated`
- `neon.operating_context.write_blocked`

Allowed fields include opaque IDs, module/operation code, result-count bucket, reason code, revision and request ID. Do not emit names, emails, search text, tokens, permission lists or business document payloads.

### 14.2 Server telemetry

Measure:

- catalog and decision latency by outcome;
- number of authorized organizations/companies by bounded bucket;
- context-denial reason;
- stale revision and assignment-change rates;
- authorization resolver expansion size and depth;
- command failure stage;
- cache hit/miss without identity labels.

### 14.3 Business audit

Every successful mutation records tenant, principal, permission, company, derived legal entity, operating organization when applicable, site when applicable, business date, authorization/profile revision, idempotency evidence and correlation/request IDs.

## 15. Events and cache invalidation

Publish transactional outbox events for:

- operating organization created/updated/status changed;
- hierarchy parent changed;
- company assignment activated/changed/ended;
- procurement/sales profile changed;
- lead/booking/invoicing company changed;
- authorization grant or projection changed.

Consumers invalidate organization catalogs, company compatibility, authorization snapshots, module queries and saved-default validation. Events carry opaque IDs and revisions; consumers resolve labels from their own read models.

## 16. Performance and scale

Design targets:

- 500 permitted companies per principal.
- 1,000 visible operating organizations per tenant.
- 10,000 effective organization/company assignments per tenant.
- Organization depth no greater than 12.
- Catalog p95 below 400 ms when warm and below 1.5 s when cold in the supported deployment profile.

Use stable cursor pagination for large catalogs, ETags/revisions for conditional reads, effective-assignment indexes and request-snapshot caching. Never cache across tenant, principal, auth epoch, business date or authorization/profile revision.

## 17. Staged implementation

### Stage 0 - Decisions and vocabulary

- Approve this document as the baseline.
- Lock ownership definitions, controlled participation roles and context requirements.
- Inventory every Neon route and operation by required coordinates.
- Confirm that `member_companies` remains off until explicitly qualified.

Exit: no module uses Operating Organization as an accounting owner or implicit authorization grant.

### Stage 1 - Data integrity

- Add hierarchy cycle/depth qualification.
- Add effective-range overlap protection.
- Qualify profile default-company membership.
- Add lookup indexes and amendment/audit behavior.
- Add migration and seed validation for 0, 1, many and cross-legal-entity company assignments.

Exit: invalid structures cannot be created through supported paths.

### Stage 2 - Contracts and read model

- Add typed operating-organization catalog and parsers.
- Add exact-plane repository reads and authorization intersection.
- Add hierarchy path, capabilities, assignments, defaults and revision.
- Add relay allowlisting, problem responses and telemetry.

Exit: a client can discover only permitted, effective and compatible organizations.

### Stage 3 - Frontend context foundation

- Add `NeonOperatingOrganizationProvider` below the company provider.
- Add accessible organization picker and module-aware filtering.
- Add validated module-scoped preferences and compatibility recovery.
- Add query-key scoping and coordinate-change invalidation.
- Externalize all messages into locale catalogs.

Exit: organization selection is reliable for read-only routes and never grants access.

### Stage 4 - Procurement vertical slice

- Require company + procurement organization on purchase-order creation.
- Validate profile, effective assignment, authorization and business date transactionally.
- Add lead-company default proposal without silent posting ownership.
- Add audit/outbox evidence and negative security tests.

Exit: one complete procurement read/write workflow enforces the design end to end.

### Stage 5 - Sales and shared services

- Add sales-organization context.
- Qualify booking/invoicing company differences and intercompany consequences.
- Add shared-service beneficiary-company handling.
- Add subtree scope qualification.

Exit: sales and cross-company service flows remain explicit and auditable.

### Stage 6 - Inventory, People and Projects

- Add company/site invariants for inventory.
- Add employment/legal-employer rules for People.
- Add owning-company and responsible-organization rules for Projects.
- Reject organization coordinates on operations that do not support them.

Exit: all Neon modules declare and enforce context requirements.

### Stage 7 - Hardening and rollout

- Add feature-flagged tenant rollout.
- Run shadow comparisons between catalog visibility and authorization evidence.
- Exercise authorization changes, backdated assignments, reorganization and multi-tab state.
- Add SLO dashboards and alerting.
- Remove temporary implicit-company or unqualified organization behavior.

Exit: general availability with security, accessibility, localization and operational sign-off.

## 18. Required test matrix

### Structure

- Root, child and 12-level organization trees.
- Direct and indirect cycle attempts.
- Same code in different tenants and duplicate code in one tenant.
- One company in many organizations and one organization across many legal entities.
- Concurrent and overlapping assignment changes.
- Lead/default company outside membership.

### Authorization

- Tenant, legal-entity, company and organization grants independently.
- Organization exact versus subtree propagation.
- Company and organization intersection.
- Explicit deny below an allowed subtree.
- Plan-locked, MFA and segregation-of-duties cases.
- Forged tenant/company/legal-entity/organization/site coordinates.
- Authorization epoch changes during catalog load and command execution.

### Effective time

- Future, active, expired and backdated assignments.
- Document business date differing from server date.
- Organization or company suspended after a draft but before posting.
- Historical document rendering after reorganization.

### UX and lifecycle

- 0, 1, 4, 100 and 1,000 visible organizations.
- 0, 1, 17 and 500 companies.
- Duplicate names and distinct codes.
- Company change invalidating organization/site.
- Organization change narrowing companies.
- All-permitted read transitioning to an exact write.
- Tenant switch, idle expiry, absolute expiry, application/global/back-channel logout.
- Multi-tab independent preferences with shared authorization invalidation.
- Keyboard, screen reader, mobile, zoom, high contrast and reduced motion.
- English plus at least one right-to-left and one CJK locale before general availability.

## 19. Acceptance criteria

1. Users can distinguish tenant, company, legal entity and operating organization without UUIDs.
2. The shell company selector remains stable across modules.
3. Organization selection appears only where relevant.
4. A procurement write cannot execute without one exact company and compatible procurement organization.
5. A sales write cannot execute without validated booking/invoicing rules.
6. An inventory movement cannot execute without exact company and site coordinates.
7. An operating-organization grant alone cannot create accounting access to member companies.
8. A company grant alone cannot act for an unrelated operating organization.
9. `all_permitted` never executes an ordinary mutation.
10. Hierarchy and assignment changes are effective-dated, auditable and revisioned.
11. Historical documents retain their original responsibility coordinates.
12. Every API fails closed for stale, inactive, incompatible or forged coordinates.
13. Browser telemetry contains no identity labels or business payloads.
14. UI messages and formatting are locale-ready.
15. The Procurement vertical slice proves the complete model before wider module adoption.

## 20. Architectural outcome

Neon gains a stable enterprise organization model in which statutory ownership, accounting ownership and operational responsibility remain explicit. Operating organizations can coordinate work across company and legal-entity boundaries, while every business write retains one authoritative company and the server validates the complete coordinate intersection. This scales from a single-company tenant to a multinational shared-services organization without turning UI context into authority.
