# Neon company context and friendly identity design

**Status:** Proposed for implementation  
**Scope:** Neon Web, shared shell, experience bootstrap, Neon master-data APIs, and exact-scope authorization  
**Decision:** Login selects an identity and tenant. Company selection is a reversible work-context filter inside that authenticated tenant; it is not another login session and never grants access.

## 1. Problem

The current Neon shell exposes raw tenant and principal UUIDs. A tenant can contain many legal entities and company codes, but the shell has no way to select the company or cross-company view in which the user intends to work.

For the Athyper demo tenant this produces an incomplete experience:

```text
Authenticated identity
└─ Athyper Group Holdings tenant
   ├─ 17 legal entities
   ├─ 17 company codes
   └─ 4 operating organizations
```

The backend already distinguishes tenant, legal-entity, company-code, and operating-organization authorization scopes. The frontend must expose those scopes without treating a work-context choice as authorization.

## 2. Goals

1. Show friendly tenant and person labels everywhere UUIDs are currently rendered.
2. Let users find and select one permitted company quickly, including tenants with hundreds of companies.
3. Support an explicit cross-company view where the operation permits it.
4. Preserve the tenant as the authentication/session boundary.
5. Require every company-owned API operation to carry an explicit company coordinate.
6. Continue enforcing authorization on the server for every operation and resource.
7. Make context changes predictable across navigation, tabs, refresh, expiry, and logout.
8. Provide accessible desktop and mobile interaction patterns.

## 3. Non-goals

- Keycloak does not own legal entities, company codes, or operating organizations.
- Selecting a company does not create a Redis authentication session.
- Selecting a company does not add permissions or widen authorization.
- UI filtering is not a substitute for server authorization or tenant-safe database predicates.
- V1 does not infer a company silently for mutations.

## 4. Context model

Use distinct names for each layer:

| Layer | Meaning | Owner | Lifetime |
|---|---|---|---|
| Identity | Human or service principal authenticated by Keycloak | IAM | Provider SSO lifetime |
| Plane session | Neon BFF session and encrypted provider tokens | Neon BFF/Redis | 30-minute idle, 10-hour absolute |
| Tenant context | Selected Neon membership | Neon BFF session | Until tenant switch/logout |
| Work context | Company, legal entity, or operating organization used by the UI | Neon frontend | Until changed, invalidated, or tenant switch |
| Operation scope | Authoritative company/resource coordinates sent with one API call | Domain contract/server | One request |

The initial work-context shape is:

```ts
type NeonWorkContext =
  | { mode: "all_permitted" }
  | {
      mode: "company";
      companyCodeId: string;
      legalEntityId: string;
    };
```

Operating-organization selection remains a separate, composable responsibility coordinate rather than overloading company selection. Its domain model, API contracts, module requirements and rollout plan are defined in [Neon operating organization build design](./neon-operating-organization-build-design.md).

## 5. Locked security invariants

1. `tenantId` comes only from the verified BFF session.
2. A browser-provided tenant ID is never authoritative.
3. The selected company must belong to the active tenant.
4. A selector option is shown only when the principal has at least one effective capability in that company.
5. Visibility in the selector does not prove permission for a particular operation.
6. Every company-owned read or mutation supplies an explicit `companyCodeId` through its typed operation contract.
7. Every server operation authorizes its permission and requested scope again.
8. `all_permitted` is permitted only for operations whose contract supports bounded multi-company reads.
9. Mutations require one concrete company unless the domain contract explicitly models a governed multi-company command.
10. Tenant switch, logout, principal change, or authorization-epoch change invalidates the active work context and all principal-scoped queries.
11. A stale, suspended, or newly unauthorized company fails closed and triggers context recovery.
12. Company IDs are never accepted as a global implicit header for writes; domain payloads remain explicit and auditable.

## 6. Experience contracts

### 6.1 Friendly shell identity

Extend the experience bootstrap with display-safe values. Do not put these values into the authentication cookie.

```ts
interface ExperienceBootstrap {
  // existing fields
  readonly identity: {
    readonly displayName: string;
    readonly secondaryLabel?: string; // username or verified email, policy-controlled
    readonly initials: string;
  };
  readonly tenant: {
    readonly id: string;
    readonly code: string;
    readonly displayName: string;
  };
}
```

Sources:

- Tenant label: `master.tenant.display_name`, falling back to `name`, then `code`.
- Identity label: the tenant-local principal/person projection, falling back to principal code.
- Raw UUIDs are permitted only in diagnostic/support details, never as the primary shell label.
- Values are normalized, length-bounded, escaped by React, and never taken directly from unverified token claims.

### 6.2 Company-context bootstrap

Add a dedicated operation rather than making authentication/session responses carry business master data:

```http
GET /api/neon/work-contexts
```

```ts
interface NeonWorkContextBootstrap {
  readonly schemaVersion: 1;
  readonly revision: string;
  readonly tenantId: string;
  readonly supportsAllPermitted: boolean;
  readonly companies: readonly {
    readonly companyCodeId: string;
    readonly code: string;
    readonly displayName: string;
    readonly legalEntityId: string;
    readonly legalEntityCode: string;
    readonly legalEntityName: string;
    readonly countryCode: string;
    readonly functionalCurrency: string;
    readonly status: "active";
    readonly capabilityGroups: readonly (
      "finance" | "procurement" | "inventory" | "sales" | "people" | "projects"
    )[];
  }[];
}
```

The repository reads active tenant-owned companies and intersects them with the principal's effective authorization scopes. A tenant-wide allow may expose all active companies for that permission group. Exact legal-entity/company grants expose only covered companies. The response contains capability groups for UX hints only; operation authorization remains authoritative.

The revision must change when company master data, membership, role grants, permission evidence, or authorization epoch changes.

## 7. Shell UX

### 7.1 Desktop header

Replace the raw labels with two distinct controls:

```text
Athyper Neon   |   Athyper Group Holdings   |   Company: All permitted companies ▾
                                                       Priya Nair ▾
```

- Tenant control label: `Business context`.
- Company control label: `Company`.
- Account control shows display name and optional secondary label.
- Tenant switching remains a separate action and retains its current session-rotation semantics.

### 7.2 Company picker

Use a searchable command-dialog/popover, not a native select, once there are more than approximately eight companies.

Each option shows:

```text
ATHQ · Athyper Group Holdings
Athyper Group Holdings Ltd · AE · AED
```

Required behaviors:

- Search company code, display name, legal name, country, and currency.
- Group by legal entity only when multiple company codes share a legal entity.
- Pin recent companies locally.
- Show the current selection with a checkmark.
- Show `All permitted companies` first when the current module supports it.
- Do not show inaccessible or inactive companies.
- Do not show authorization-rule internals.
- Provide a support reference on load failure.

### 7.3 All-company behavior

`All permitted companies` is a reporting/list context, not a wildcard authorization grant.

- Lists send no invented company ID; their contract sends `companyScope: { mode: "all_permitted" }`.
- The server derives the permitted company set from authorization and applies it to the query.
- Create, edit, post, approve, reverse, and other company-owned mutations prompt for or require a concrete company.
- If a user starts a mutation from an all-company list, the record's authoritative company is carried into the command and displayed in the confirmation surface.

### 7.4 Mobile

- Tenant and company controls appear at the top of the navigation drawer.
- The picker opens as a full-height sheet with search fixed at the top.
- Selection closes the sheet, announces the change, and restores focus to the trigger.

### 7.5 Accessibility

- Trigger uses `aria-haspopup="dialog"`, `aria-expanded`, and an accessible name containing the current company.
- Dialog has a visible title, search label, result count, and close action.
- Arrow keys move through results; Enter selects; Escape closes.
- Selection changes are announced through a polite live region.
- Focus is trapped only while the dialog/sheet is open and returns to the trigger.
- Do not rely on flags, initials, or color as the only identifier.
- Meet WCAG 2.2 AA contrast and target-size requirements.

## 8. Frontend state and navigation

Create a `NeonWorkContextProvider` inside the existing principal-scoped provider tree.

Resolution order:

1. Validate an explicit deep-link company coordinate, if the route contract permits one.
2. Restore the last valid selection from local storage keyed by plane, tenant, and principal.
3. If exactly one company is permitted, select it.
4. Otherwise choose `all_permitted` for read-only landing pages.
5. A mutation route with no concrete company renders a blocking company-choice state.

Storage key:

```text
athyper.neon.work-context.v1:{tenantId}:{principalId}
```

Persist only mode and IDs. Labels always come from the latest server response. Never persist permissions or use persisted state before server validation.

Company-specific deep links should use a stable, typed query coordinate only where shareability is useful:

```text
/finance/journals?company=athq
```

The code is resolved to an authorized ID server-side/client-side from the current bootstrap. Invalid deep links show `Company unavailable` and offer permitted recovery choices; they never silently select a different company for a mutation.

All query keys for company-owned data include the effective work-context coordinate:

```ts
["principal", plane, tenantId, authEpoch, "company", companyScopeKey, operation, input]
```

On company change:

1. Cancel active company-scoped requests.
2. Commit the validated selection.
3. Invalidate old company-scoped queries.
4. Preserve tenant-wide shell/identity queries.
5. Re-evaluate the current route's context requirement.
6. Move to the module landing route only when the current route cannot operate in the new context.

## 9. Route context policy

Extend each Neon route definition with a work-context requirement:

```ts
type WorkContextRequirement =
  | "tenant"
  | "company_or_all"
  | "company_required"
  | "operating_organization_required";
```

Initial policy:

| Surface | Requirement |
|---|---|
| Neon landing/dashboard | `tenant` |
| Finance lists/reports | `company_or_all` |
| Journal/invoice/payment mutations | `company_required` |
| Procurement lists | `company_or_all` |
| Purchase document mutation | `company_required` or explicit operating-organization flow |
| Inventory stock/movement | `company_required` |

Route guards improve recovery and usability. They do not perform authorization.

## 10. API and server enforcement

Every typed operation declares whether it is tenant-wide, single-company, or multi-company.

Example mutation:

```ts
interface CreateJournalCommand {
  readonly companyCodeId: string;
  readonly ledgerBookId: string;
  readonly fiscalPeriodId: string;
  // domain fields
}
```

Server processing order:

1. Resolve the verified Neon request context from the BFF relay.
2. Validate the typed request.
3. Load the company using `(tenant_id, company_code_id)`.
4. Authorize the operation against `company_code` and/or `legal_entity` evidence.
5. Validate domain invariants such as ledger/company ownership.
6. Execute with tenant-safe predicates and audit the selected company.

Do not rely on navigation visibility, selector contents, local storage, URL codes, or client capability groups.

## 11. Failure and change handling

| Condition | UX |
|---|---|
| Context catalog loading | Stable shell skeleton; business content waits |
| Catalog unavailable | Retry surface; preserve no unverified selection |
| No permitted companies | Explain that tenant access exists but no company scope is assigned |
| Stored company removed | Clear it and request selection; never reuse its label |
| Authorization epoch changed | Refresh session/bootstrap and re-resolve work context |
| Company suspended during use | API returns scoped denial; invalidate context catalog and recover |
| Single operation denied | Preserve company selection; show operation-specific access denial |
| Tenant switched | Clear in-memory work context and use the new tenant/principal storage namespace |
| Application logout | Clear in-memory context; local preference may remain but must be revalidated next login |
| Global logout | Clear in-memory context; optionally remove recent-company preferences on shared devices |

## 12. Friendly account menu

The account menu contains:

- Display name
- Optional username or masked email
- Current tenant display name
- `Switch business context`
- `Sign out of Neon`
- `Sign out of Athyper everywhere`

The primary label must never fall back directly to a UUID. If no safe display value exists, use `Account` and expose the principal ID only inside a copyable support-details disclosure.

## 13. Telemetry and audit

Emit privacy-bounded events:

- `neon.work_context.opened`
- `neon.work_context.search_completed` with result-count bucket, not search text
- `neon.work_context.changed` with mode and opaque IDs
- `neon.work_context.invalidated` with reason
- `neon.work_context.denied` with operation code and error taxonomy

Do not emit names, email addresses, search text, tokens, permissions, or full API payloads. Business mutations continue to audit their authoritative company on the server.

## 14. Delivery plan

### Phase 1 — Contracts and friendly labels

- Extend the experience contracts and PostgreSQL adapter with tenant/principal display data.
- Replace raw UUID shell labels.
- Add parsing, fallback, length, and cross-tenant tests.

### Phase 2 — Work-context API

- Add the typed `/api/neon/work-contexts` operation and relay allowlist entry.
- Implement exact-plane repository and authorization-scope intersection.
- Add revision, empty-state, suspension, tenant isolation, and permission-scope tests.

### Phase 3 — Selector and provider

- Build the accessible picker and `NeonWorkContextProvider`.
- Add validated persistence, recent items, mobile sheet, query-key scoping, and context invalidation.
- Integrate the selector into Neon only; keep the shared shell capability generic.

### Phase 4 — Domain adoption

- Classify each Neon route by work-context requirement.
- Add explicit company coordinates to Finance, Procurement, and Inventory contracts.
- Reject implicit mutation context in server handlers.
- Add multi-company list semantics where supported.

### Phase 5 — Hardening and rollout

- Feature flag the selector by tenant.
- Run shadow telemetry comparing displayed companies with authorization evidence.
- Enable for demo tenants, then internal tenants, then general availability.
- Remove UUID fallbacks and any temporary implicit-company behavior after adoption.

## 15. Acceptance criteria

1. The shell shows `Athyper Group Holdings` and a friendly person name, not UUIDs.
2. A user with 17 permitted companies can find any company by code or name using keyboard only.
3. A user never sees a company for which no effective company capability exists.
4. Selecting a company does not rotate or duplicate the authentication session.
5. Tenant switching still rotates the BFF session and invalidates company state.
6. Refresh restores only a still-authorized selection.
7. Cross-company lists return only server-derived permitted companies.
8. Company-owned mutations cannot execute from `all_permitted` without an explicit authoritative company.
9. Forging a company ID, URL value, or local-storage value fails server authorization.
10. Suspension or grant removal recovers without data from the old company remaining visible.
11. Application and global logout retain their existing distinct guarantees.
12. Desktop and mobile selector flows pass automated accessibility checks and manual screen-reader/keyboard verification.

## 16. Required test matrix

- 0, 1, 17, and 500 permitted companies.
- Tenant-wide permission versus exact legal-entity/company grants.
- Different permissions across different companies.
- Duplicate display names with distinct company codes.
- Suspended company and expired grant.
- Stale persisted context and forged deep link.
- Tenant switch with overlapping company codes.
- Authorization-epoch change during an open picker and during an in-flight request.
- Multi-tab selection changes; tabs may retain independent work contexts, but each must revalidate authorization.
- Application logout, global logout, idle expiry, absolute expiry, and Keycloak back-channel logout.
- Mobile viewport, keyboard-only, screen reader, zoom, high contrast, and reduced motion.

## 17. Architectural outcome

Neon will have one authentication session per plane and tenant context, a separately validated company work context for usability, and explicit server-enforced company coordinates for security. Friendly labels improve comprehension without weakening the opaque-session design, while the selector scales from a single-company tenant to complex multi-company groups.
