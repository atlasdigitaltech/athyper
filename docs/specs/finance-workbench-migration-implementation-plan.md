# Finance Workbench Migration, Cleanup, and Implementation Plan

**Status:** Proposed  
**Prepared:** 2026-07-19  
**Scope:** Finance Setup Phase 1 and Phase 2 UI, Workbench routing/BFF, canonical Entity List and Entity Record reuse, performance qualification  
**Authorization:** Detailed tenant/legal-entity/company permission UX is parked for Phase 3. Tenant isolation and verified request context remain mandatory.

## 1. Outcome

Create one Finance Workbench at `/workbench/finance/*` that guides a Finance Manager through setup readiness and complex finance configuration while reusing the platform's canonical Entity List and Entity Record experiences.

The steady-state navigation model is:

```text
Finance Workbench
  -> readiness, scope, dependencies, conflicts, and finance workflows
  -> canonical Entity List for ordinary setup records
  -> canonical Entity App for create, view, edit, and deactivate
  -> dedicated Finance surface only for compound or analytical workflows
```

The migration must improve the current package rather than create a second workbench or a Finance-specific CRUD framework.

## 2. Non-goals

- Preserve the backend finance DDL and service layer where they satisfy the requirement. Add narrowly scoped DDL/metadata contracts where the requirement audit proves a real gap.
- Do not duplicate generic entity list, record, form, audit, attachment, comment, saved-view, or lifecycle behavior.
- Do not move transactional AP, AR, journal, bank, or reporting APIs under a workbench namespace.
- Do not implement the final Phase 3 permission editor or role matrix during Phase 1/2.
- Do not weaken tenant isolation while permission UX is parked.
- Do not delete existing routes until redirects, navigation references, tests, and production evidence are in place.

## 3. Confirmed Current Baseline

| Area | Existing implementation | Finding |
|---|---|---|
| Generic workbench route | `apps/neon/app/(shell)/workbench/[...path]/page.tsx` delegates to `@athyper/app-neon/workbench` | The target route exists, but the shared `WorkbenchPage` is currently a placeholder and does not dispatch Finance workbenches. |
| Finance routes | `apps/neon/app/(shell)/finance/setup/**` | Company hub, explore, configure, operate, tenant rollup, and legal-entity rollup routes exist under the old path. |
| Finance BFF | `apps/neon/app/api/finance/setup/[...path]/route.ts` | It forwards only GET even though the server already exposes POST, PATCH, and DELETE setup mutations. |
| Finance package | `packages/domain/finance/finance-workbench` | 114 source files. It contains valuable finance views, but also large monoliths, direct tables, demo data, mock orchestration, and repeated fetch/query code. |
| Setup catalog | `FinanceDataSetupWorkbench.tsx` | 2,000+ lines; combines navigation, mock/generated rows, live rows, scenario simulation, tables, detail panels, and routing. It is a design prototype, not a sustainable runtime boundary. |
| Canonical Entity List | `/app/[entity]` + `@athyper/runtime-list` | Server-rendered descriptor/list resolution, access scope, saved views, list cache, intent prefetch, lazy loading, mutation invalidation, and diagnostics already exist. |
| Canonical Entity Record | `/app/[entity]/[id]` + `@athyper/runtime-canvas` | Shared record chrome, descriptor-driven fields, edit workspace, process surfaces, comments, attachments, activity, query hydration, and observability already exist. |
| Backend Finance Setup | `server/packages/services/finance/routes/finance-setup.route.ts` | Readiness, conflicts, posting preview, explore/configure/operate projections, and initial mutations already exist. |
| DTO ownership | Frontend DTOs are mirrored manually in server services | Contract drift risk. A shared schema should become authoritative. |
| Scope models | `FinanceScope` uses `scopeId`; setup DTOs use `scopeCode`; legal-entity semantics differ | One discriminated workbench scope contract is required before route migration. |

## 3.1 Pre-lock Requirement Validation

The existence of a physical table is not enough to declare a screen reusable through the Entity App. Each setup capability needs four layers:

1. physical DDL and integrity rules;
2. a registered metadata entity with fields, relations, list presentation, and mutation operations;
3. a BFF/runtime API path that preserves verified tenant and scope context;
4. a Finance Workbench projection only when cross-entity guidance or simulation is required.

### Phase 1 validation

| Requirement | DDL/domain baseline | Generic Entity App baseline | Useful current Finance design | Pre-lock decision/gap |
|---|---|---|---|---|
| Company and legal entity | `master.company_code` and `master.legal_entity` exist with relationships and audit/lifecycle fields. | Both are registered metadata entities. Field and operation activation still needs a runtime audit. | Company Hub scope chips, legal-entity hierarchy, tenant/legal-entity rollups, and readiness navigation are useful. | Retain hierarchy and rollup as Workbench context. Use Entity App for record CRUD. Do not retain the custom tree as the only way to manage records. |
| Base currency and ledger books | Company functional currency, shared currency reference, ledger-book base currency, and company-book assignments exist. | `currency`, `ledger_book`, and `company_code_book_assignment` are registered entities. | Book assignment panel and company context are useful; the custom Books table is duplicative. | Reuse assignment/readiness presentation. Use canonical lists and Entity Apps for currency/book/assignment records. Define whether company functional currency becomes immutable after opening balances/postings. |
| Fiscal calendar and fiscal periods | `master.fiscal_period` exists; company has `fiscal_year_start_month`; periods 0-16 are supported. There is no separate `fiscal_calendar` or reusable calendar-template table. | `fiscal_period` is registered. No calendar-template entity exists. | Period selector, period status, matrix, and close workbench are useful. | Lock one model: simple generated periods from company start month, or add calendar/template DDL for 4-4-5, irregular, and shared calendars. The UI cannot be finalized until this decision is made. |
| Chart of Accounts | Chart, GL accounts, company-chart assignment, mapping/posting rules, and company activation tables exist. | Chart, GL account, company-chart assignment, and company GL account are registered. | COA tabs, hierarchy explorer, mapping intent, account inspector, and Trial Balance drill-through are useful. Some catalog/explorer paths still use demo data or custom tables. | Retain the hierarchy/mapping workbench. Replace ordinary catalog/account tables with canonical Entity List. Remove demo-backed production paths. |
| GL account master | `master.gl_account` provides hierarchy and account behavior; company controls are separate. | Registered metadata entity. | Account tree, account detail, contextual record links, and postability indicators are useful. | Use Entity App for master CRUD; keep Workbench hierarchy, impact, and validation. Prevent direct deletion when assignments/postings exist through lifecycle/operations. |
| Company GL activation and posting controls | `master.company_code_gl_account` and postability services exist. | Registered metadata entity; current dedicated mutation services also exist. | GL Controls Grid, coverage percentage, assign/edit dialogs, postability preview, and conflict handling are useful. `CompanyControlsView` overlaps this surface. | Consolidate on one GL Controls workbench. Route ordinary row CRUD to Entity App where metadata is complete; keep bulk activation, coverage, and posting simulation as workbench actions. Retire duplicate controls tables. |
| House banks and bank-account links | Bank party/account/link/house-config tables and finance projections exist. | All core bank master/link/config records are registered entities. | Bank chain, house-bank coverage, and activate/deactivate intent are useful. | Retain chain/readiness visualization. Use Entity Apps for bank, account, link, and config CRUD. Keep workbench actions only for primary/activation or validation across the chain. |
| Opening balances and Trial Balance validation | Opening balances are represented through fiscal period 0, journal entries, and resulting GL balances. There is no `opening_balance` setup table. | `journal_entry` is registered; `gl_balance` is not a CRUD master entity and should remain read-only. | Trial Balance, account drill-through, period selector, and GL detail are useful. | Treat this as a governed import/post/validate workflow, not generic CRUD. Define source template, balancing rules, idempotency, approval/posting, retry, and certification before UI lock. |
| Period-open and posting-readiness certification | Fiscal-period status, per-book `governance.book_period_status`, cycle runs/tasks/certification, and postability services exist. | `fiscal_period` is registered; `book_period_status` is not currently registered as a metadata entity. | Readiness journey, conflicts, period matrix, close cycle, blocker logic, task completion, and sign-off are useful. | Retain and strengthen the dedicated close/readiness workbench. Register supporting governance entities only if direct record management is required; transitions must remain governed operations, not unrestricted field edits. |

### Phase 2 validation

| Requirement | DDL/domain baseline | Generic Entity App baseline | Useful current Finance design | Pre-lock decision/gap |
|---|---|---|---|---|
| Dimensions and mandatory policies | Dimension type/value/set and operational masters exist; `control.dimension_policy` and allowed values exist. | Dimension masters are registered. `dimension_policy` and its allowed-value child are not currently registered. | Setup taxonomy and coverage concepts are useful; no complete live policy-management surface exists. | Use canonical lists for dimension masters. Add metadata contracts for policy entities, then build one coverage/violation workbench. |
| Accounting profiles and posting templates | Accounting profile master and detailed config/event/template/book/dimension tables exist with a resolution engine. | `accounting_profile` is registered. Detailed `acct_profile_*` control entities are not currently registered. | Accounting Profile Workbench, profile/event/template grouping, related-app model, and simulator concept are valuable. | Retain and refactor the simulator/composition workbench. Register detailed entities or provide a governed aggregate editor. Do not assume generic CRUD works today. |
| Tax, WHT, and tax-account mapping | Jurisdiction/type/schedule/group/component/WHT/rounding structures exist. Posting-role resolution is designed, but `resolve_posting_role_account()` references `control.posting_role_account_map` and no physical creation was found. | Jurisdiction, type, and tax group are registered. Rate schedule, group component, WHT threshold, rounding rule, and posting-role map are not fully Entity App-ready. | Tax setup taxonomy and backend resolution documentation are useful; no complete live tax workbench exists. | Add missing metadata contracts and settle the physical posting-role/tax-account mapping model before UI lock. Build effective-date overlap, recoverability, WHT, and account-coverage simulation in the workbench. |
| Payment methods and company policies | Payment method and company policy tables exist. | Payment method is registered; company policy is not. | Payment section taxonomy and AP/AR method use are useful; no complete setup workflow exists. | Use Entity App for methods. Register company policy and build a company rollout/eligibility matrix. |
| Payment terms, installments, discounts | Term, clause, discount-tier, and application/result structures exist. | Term, clause, and discount tier are registered. | Parent/child composition idea and document payment-term card are useful. | Reuse Entity Apps for records; add a term simulator for baseline date, installments, discounts, holidays, and due date. |
| Bank interfaces and settlement rules | Format rules, interface profiles, bindings, method policies, connector types, and settlement rules exist. | These control entities are generally not registered for the generic Entity App. | Banking-control taxonomy and house-bank chain are useful; no complete routing editor exists. | Add metadata contracts or a governed aggregate editor. Build method -> company policy -> bank account -> interface -> settlement role -> GL resolution trace. |

### Phase 3 validation

| Requirement | Current baseline | Phase 1/2 preservation rule |
|---|---|---|
| Tenant-level authorization | Tenant resolution, RLS, session context, and coarse Finance Setup permission checks exist. | Never remove tenant filtering or RLS. Every route resolves tenant from verified session context, not request payload. |
| Legal-entity-level authorization | Legal-entity context exists, but Finance Setup reads are primarily tenant-filtered and the final delegated access model is not uniformly applied. | Carry legal-entity scope code and resolved ID through server context, record ownership, links, query keys, and audit. Do not hard-code all-tenant assumptions into UI components. |
| Company-code-level authorization | Company scope is widely present, but current workbench scenario logic is presentation-oriented and not an authorization boundary. | Carry company code in scope-aware routes and resolve it inside the verified tenant. Keep server checks authoritative when Phase 3 adds grants. |
| Multi-legal-entity/multi-company access | Rollup and multi-company data models exist; final access filtering is incomplete for this workbench. | Scope switchers must consume server-returned accessible scopes later. Do not derive access from company count, hidden tabs, or client scenario flags. |

## 3.2 Design-lock Blockers

The Finance UI design should not be declared locked until these decisions have owners and accepted contracts:

1. Fiscal calendar model: simple month generation versus reusable/irregular calendar templates.
2. Opening-balance process: import format, period-0 journal generation, validation, approval/posting, idempotency, reversal, and certification.
3. Posting-role account mapping: create and govern the physical mapping model used by tax, settlement, fixed assets, and other posting profiles, or replace the current resolver contract.
4. Entity App readiness: complete metadata field, relation, list, lifecycle, and operation contracts for every Phase 1/2 CRUD entity.
5. Period governance ownership: define which changes are Entity App CRUD and which are controlled close/reopen operations.
6. One scope contract: tenant/legal entity/company identity separated from fiscal/book/currency lens values.
7. Coarse security baseline: permission UX may be parked, but existing RLS, verified context, CSRF, mutation authorization, and audit cannot be parked.
8. Readiness definition: publish the dependency and evidence rule for every Phase 1 and Phase 2 step.

### 3.3 Authorization Park Contract for Phase 1/2

“Full CRUD without detailed permission controls” should mean a deliberately broad Finance implementation role, not unauthenticated or unchecked writes.

During Phase 1/2:

- authenticated Finance setup users may receive one coarse tenant-scoped `FINANCE_SETUP.CONFIGURE` capability for the in-scope setup entities and operations;
- the UI does not need the final tenant/legal-entity/company permission administration screens;
- the server still verifies session, tenant, CSRF, mutation capability, record tenant ownership, optimistic concurrency, and audit actor;
- Entity App operation descriptors remain the source of truth for whether create/edit/deactivate is technically supported;
- scope metadata is stored and returned even when the coarse capability permits all legal entities and companies in the tenant.

During Phase 3, replace the broad grant with legal-entity/company-aware grants and accessible-scope resolution. The Phase 1/2 routes and components should not require structural changes for that refinement.

## 4. Architectural Decisions

### 4.1 Surface ownership

| Requirement | Owning surface |
|---|---|
| Setup journey, readiness, coverage, conflicts, impact | Finance Workbench |
| Searchable/sortable/filterable setup records | Canonical Entity List |
| Create, full record view, edit, deactivate | Canonical Entity App |
| COA hierarchy and mapping | Dedicated Finance Workbench |
| GL activation coverage and posting controls | Dedicated Finance Workbench with Entity App links |
| Fiscal-period matrix and close transitions | Dedicated Finance Workbench |
| Opening-balance validation and Trial Balance | Dedicated Finance Workbench |
| Accounting profile event/template composition | Dedicated Finance Workbench, with Entity App for individual definitions |
| Tax resolution simulation and tax-account coverage | Dedicated Finance Workbench, with Entity App for individual definitions |
| Bank interface routing and settlement simulation | Dedicated Finance Workbench, with Entity App for individual definitions |

### 4.2 Reuse rule

If a screen's main job is ordinary entity CRUD, it must use `/app/<entity>` and `/app/<entity>/<id>`. A dedicated workbench is justified only when the user must understand or change relationships across multiple entity types, inspect readiness, simulate resolution, or execute a governed finance workflow.

### 4.3 Server/client boundary

The current setup screen is a large client component. The target should be:

```text
Next.js server route
  -> resolve session and route scope once
  -> render FinanceWorkbenchShell
  -> stream readiness/navigation and selected surface with Suspense
  -> mount small client islands for scope switching, tabs, filters, and actions
```

Do not client-fetch data that the route can load and dehydrate once. Do not fetch the same descriptor, company context, or readiness payload independently in child cards.

## 5. Target Repository Structure

```text
apps/neon/app/(shell)/workbench/finance/
  page.tsx
  setup/
    page.tsx
    tenant/[tenantCode]/page.tsx
    legal-entity/[legalEntityCode]/page.tsx
    company/[companyCode]/
      page.tsx
      explore/page.tsx
      configure/page.tsx
      operate/page.tsx
    [area]/[section]/page.tsx
  coa/page.tsx
  close/page.tsx
  reports/page.tsx

apps/neon/app/api/workbench/finance/
  [...path]/route.ts
  __tests__/

packages/domain/finance/finance-workbench/src/
  manifest/
    finance-workbench-manifest.ts
    phase-1-setup.ts
    phase-2-setup.ts
  shell/
    FinanceWorkbenchShell.tsx
    FinanceWorkbenchHeader.tsx
    FinanceWorkbenchNavigation.tsx
    FinanceScopeBar.tsx
  setup/
    hub/
    explore/
    configure/
    operate/
    surfaces/
  entity-integration/
    FinanceEntityListFrame.tsx
    FinanceEntityLaunchActions.tsx
    FinanceRecordPreview.tsx
    entity-links.ts
  contracts/
    finance-workbench.types.ts
  hooks/
  lib/
  views/                    # existing operational/reporting workbenches during migration

packages/shared/data-integration/api-contracts/src/schemas/
  finance-workbench.ts
```

Route files remain thin composition roots. Finance UI and finance-specific behavior stay in the domain package. Session forwarding, CSRF checks, and BFF concerns stay in the Neon application. SQL and domain services stay on the server.

## 6. Route and API Contract

### 6.1 Public UI routes

Canonical routes:

```text
/workbench/finance
/workbench/finance/setup
/workbench/finance/setup/company/:companyCode
/workbench/finance/setup/legal-entity/:legalEntityCode
/workbench/finance/setup/tenant/:tenantCode
/workbench/finance/setup/:area/:section
/workbench/finance/coa
/workbench/finance/close
/workbench/finance/reports
```

Legacy `/finance/setup/**` routes become temporary redirects. Keep query parameters and fragments when redirecting. Update navigation manifests, server-generated readiness links, emails/bookmarks where applicable, and login `next` URLs before removing old pages.

### 6.2 BFF routes

Use `/api/workbench/finance/**` for workbench projections and finance-setup actions. Initially map this BFF namespace to the existing upstream `/api/finance/setup/**` endpoints. This avoids a risky server route rename during UI migration.

The BFF must support GET, POST, PATCH, and DELETE, using the shared module-relay/CSRF conventions. Preserve `Idempotency-Key` and `If-Match` where supported. Do not implement a custom fetch relay that diverges from the canonical BFF security behavior.

Keep `/api/finance/**` for transactional domain APIs such as journals, AP/AR, bank reconciliation, payment execution, and financial reports.

### 6.3 Shared contracts

Move these contracts into one shared schema package:

- workbench scope;
- readiness journey and step state;
- conflicts and severity;
- posting preview;
- explore/configure/operate projections;
- mutation requests and responses;
- API error envelope.

Server and frontend should infer TypeScript types from the same schema. Delete the hand-maintained server mirrors only after contract tests prove compatibility.

### 6.4 Scope contract

Adopt one discriminated shape:

```ts
type FinanceWorkbenchScope =
  | { type: "tenant"; code: string }
  | { type: "legal_entity"; code: string }
  | { type: "company"; code: string };
```

Fiscal year, period, book, and currency are lens values, not scope identity. Resolve codes to UUIDs once at the server boundary. Include the resolved scope fingerprint in cache and query keys. Never accept a client UUID as proof of access.

## 7. Canonical Entity List Integration

### 7.1 Required approach

Render the shared Runtime List presenter from a server component inside the Finance Workbench frame. Reuse:

- descriptor resolution;
- visible-column projection;
- server search/filter/sort/pagination;
- saved views;
- browser list cache;
- intent prefetch;
- lazy-list bounds;
- mutation invalidation;
- list diagnostics and skeletons.

Do not render finance-owned HTML tables for ordinary setup entities.

### 7.2 Additive framework extension

The runtime list already supports slots and a `PageFrame` adapter. Add only the smallest extension required for embedding:

1. Allow `AthyperListPage`/`NeonAdapterConfig` to receive an optional frame override or `presentation="embedded"`.
2. Implement `FinanceEntityListFrame` that suppresses duplicate page chrome while preserving the canonical command bar, toolbar, table, pagination, selection, and cache provider.
3. Use `aboveTable`/`belowTable` slots for Finance readiness and impact context.
4. Keep canonical detail and create hrefs pointing to `/app/<entity>`, `/app/<entity>/<id>`, and `/app/<entity>/new`.

Do not fork `RuntimeListPage`, `RuntimeListPresenter`, or the table islands into the Finance package.

### 7.3 Entity surface manifest

Replace `SmartEntity`, `SmartRow`, and `generatedRows()` with a declarative manifest containing only stable configuration:

```ts
interface FinanceSetupSurfaceDefinition {
  key: string;
  phase: 1 | 2;
  area: "master" | "control" | "governance";
  entityCode: string;
  scope: "tenant" | "legal_entity" | "company" | "operational";
  presentation: "entity_list" | "dedicated_workbench";
  workbenchHref?: string;
  dependencies: readonly string[];
  readinessKey?: string;
}
```

Labels, fields, list columns, create capability, and lifecycle vocabulary should come from entity metadata wherever possible.

## 8. Canonical Entity Record Integration

### 8.1 Full record and CRUD

Open the canonical Entity App for full records and mutations:

```text
List          /app/:entity
Create        /app/:entity/new
Record        /app/:entity/:id
Edit          /app/:entity/:id/edit
```

The Finance Workbench should use the shared href builders rather than string concatenation.

### 8.2 Workbench preview

Keep the in-workbench record preview intentionally lightweight:

- identity, status, scope, and owner;
- finance readiness/impact;
- dependency and conflict summary;
- open record, edit, and open-in-new-tab actions.

Do not mount the entire Runtime Record Workspace in a side panel during the first migration. That would duplicate descriptor, record, process, comments, and attachment loading. A future record-peek surface is acceptable only if it consumes the same dehydrated record query cache and passes the record-workspace performance budgets.

### 8.3 Return context

When opening the Entity App, carry a safe `returnTo` value pointing to the Finance Workbench and preserve the workbench scope/lens in the return URL. Validate `returnTo` as an internal path before using it.

## 9. Phase 1 Surface Plan

| Setup capability | Primary experience | CRUD destination |
|---|---|---|
| Company and legal entity | Canonical lists plus hierarchy/readiness workbench | `company_code`, `legal_entity` Entity Apps |
| Base currency and ledger books | Company setup summary plus canonical lists | `company_code`, `ledger_book`, assignment Entity Apps |
| Fiscal calendar and periods | Period matrix for coverage/status; canonical list for definitions | `fiscal_period` and calendar Entity Apps |
| Chart of Accounts | Dedicated COA catalog/tree/mapping workbench | `chart_of_account` Entity App |
| GL account master | Canonical list; COA hierarchy context where needed | `gl_account` Entity App |
| Company GL activation and controls | Dedicated coverage grid and conflict view | `company_code_gl_account` Entity App for row CRUD |
| House banks and links | Dedicated chain/coverage view plus canonical lists | bank account/link/house-config Entity Apps |
| Opening balances and Trial Balance | Dedicated import/validation and Trial Balance views | source entities through Entity Apps |
| Period open and certification | Dedicated close/readiness workflow | fiscal-period and governance records through Entity Apps |

Phase 1 readiness must expand beyond the current five-step model to include opening-balance validation and Trial Balance certification explicitly.

## 10. Phase 2 Surface Plan

| Setup capability | Primary experience | CRUD destination |
|---|---|---|
| Dimensions and mandatory policies | Coverage matrix and violation preview | dimension and policy Entity Apps |
| Accounting profiles and templates | Multi-pane composition, event simulation, Dr/Cr preview | profile/event/template Entity Apps |
| Tax, WHT, and tax-account mapping | Resolution simulator, temporal overlap warnings, account coverage | tax schedule/group/component/mapping Entity Apps |
| Payment methods and company policies | Company rollout and eligibility matrix | method and policy Entity Apps |
| Payment terms and discounts | Terms composition and due-date simulation | term/clause/tier Entity Apps |
| Bank interfaces and settlement rules | Routing chain and posting-role resolution preview | interface/binding/settlement Entity Apps |

## 11. Migration and Cleanup Sequence

### P0 - Freeze contracts and capture baseline

- Inventory every current Finance route, API call, query key, entity code, deep link, and server-generated action link.
- Capture screenshots and interaction tests for current company hub, explore, configure, COA, GL, close, and reports.
- Capture canonical list cold/warm metrics for representative Finance master entities.
- Capture canonical record cold/warm metrics for one Finance master and one ledger entity.
- Add route-contract tests before moving paths.

Exit gate: baseline evidence exists; no route or payload is being inferred from screenshots alone.

### P1 - Shared contracts and scope normalization

- Add the shared Finance Workbench schema.
- Adapt frontend hooks and server services to it without changing behavior.
- Introduce `FinanceWorkbenchScope` and route/lens helpers.
- Add contract tests and remove duplicate DTO declarations after parity.

Exit gate: server and frontend compile against one contract; company, legal-entity, and tenant scope tests pass.

### P2 - Route and BFF foundation

- Add real Finance dispatch under `/workbench/finance/**`.
- Add `/api/workbench/finance/[...path]` with all required methods and CSRF behavior.
- Point client hooks to one API path builder.
- Keep old UI routes as redirects and old BFF GET route as a temporary compatibility proxy.
- Update navigation and server-generated readiness links.

Exit gate: old and new bookmarks reach the same screen; mutations no longer fail because of a GET-only BFF.

### P3 - Workbench shell and canonical entity embedding

- Split the 2,000-line setup component into server shell, manifest, navigation, scope bar, and client islands.
- Add the embedded canonical Runtime List frame extension.
- Implement one pilot surface: `gl_account` or `ledger_book`.
- Verify list features, create/detail links, return context, scope filtering, cache behavior, and responsive layout.

Exit gate: the pilot contains no Finance-owned table implementation and meets canonical list performance gates.

### P4 - Phase 1 migration

- Migrate Phase 1 ordinary entity surfaces to the canonical list.
- Retain/refactor dedicated COA, GL controls, house-bank, Trial Balance, and close workflows.
- Replace generated/demo rows with live records or explicit empty states.
- Route CRUD to Entity App.
- Add readiness dependencies and validation for each Phase 1 step.

Exit gate: all Phase 1 setup areas are discoverable, live-data-backed, and have working create/view/edit paths.

### P5 - Phase 2 migration

- Migrate dimensions, profiles, tax, payment methods, terms, interfaces, and settlement rules.
- Add simulators/previews only where multiple entities must resolve together.
- Keep ordinary definitions in canonical Entity Apps.
- Expand readiness and conflict categories for Phase 2.

Exit gate: every Phase 2 definition has an owning Entity App and every compound setup has a dedicated workbench projection.

### P6 - Performance hardening

- Remove duplicate company/scope/descriptor/readiness requests.
- Batch readiness counts and conflict summaries; prohibit per-card and per-row API calls.
- Use visible-field projection for embedded lists.
- Enable metadata-driven list caching and intent prefetch for frequently revisited Finance entities.
- Ensure mutations invalidate canonical entity lists, record queries, and workbench readiness projections.
- Add Workbench `Server-Timing` and browser performance marks.
- Run production-build qualification, not only development mode.

Exit gate: all performance budgets in Section 13 pass with retained artifacts.

### P7 - Compatibility removal and cleanup

- Remove `generatedRows`, `SmartTable`, scenario-only runtime branches, and placeholder detail forms.
- Remove Finance-owned direct tables that represent ordinary entity lists.
- Remove unused demo-data and mock imports from production paths.
- Remove old `/finance/setup/**` pages after redirect telemetry is quiet for the agreed window.
- Remove `/api/finance/setup` compatibility BFF after all callers use `/api/workbench/finance`.
- Split remaining oversized workbench files by surface and responsibility.
- Narrow package exports to supported public entry points.

Exit gate: route scans, import scans, and API-path policy tests show no legacy Finance Setup callers.

### P8 - Phase 3 authorization integration

- Add permission-driven affordance visibility and mutation gates by tenant/legal-entity/company scope.
- Keep server authorization authoritative; UI controls are explanatory, not security boundaries.
- Include permission stamp and verified scope fingerprint in relevant cache identities.

This phase is parked, but Phases 1/2 must preserve the required scope metadata and extension points.

## 12. Explicit Cleanup Inventory

### 12.1 Existing Finance UI disposition

| Existing component/area | Decision | Reuse plan |
|---|---|---|
| `CompanyHubView` | Retain and refactor | Keep the composition and status hierarchy. Move initial loading server-side, combine compatible readiness/conflict loads, and expand the journey to the agreed Phase 1/2 evidence model. |
| `ReadinessJourney`, `NeedsAttentionInbox`, status chips | Retain | Rebind to the shared contract and metadata-driven step manifest. Keep these Finance-specific because the Entity App does not own cross-entity readiness. |
| `WorkspaceCards` | Refactor | Replace generic Explore/Configure/Operate marketing cards with task-oriented entries tied to incomplete setup steps and current scope. |
| `ExploreWorkspaceView` | Retain and split | Keep chart hierarchy and cross-entity inspection. Replace ordinary GL account/book lists with the embedded canonical Runtime List. |
| `ChartTreePanel` and `InspectorPanel` | Retain and refactor | Use live projections, canonical record links, keyboard tree behavior, and a lightweight preview. Avoid fetching full Entity Record surfaces in the inspector. |
| `GlAccountsListPanel` | Replace | Use embedded Runtime List for `gl_account`; keep only Finance-specific postability/impact slots. |
| `BooksListPanel` | Replace | Use embedded Runtime List for `ledger_book` and `company_code_book_assignment`. |
| `HouseBanksExplorePanel` | Retain as a chain view | Show bank -> account -> link -> house config completeness. Send ordinary CRUD to Entity Apps. |
| `ConfigureWorkspaceView` | Retain as a route concept | Rebuild tabs from the setup manifest and URL state. It should host GL coverage, assignments, bank readiness, and other cross-entity configuration—not generic CRUD grids. |
| `GlControlsGrid` and dialogs | Retain selectively | Preserve coverage, bulk assignment intent, validation, and postability. Prefer Entity App for single-row CRUD; keep dedicated mutations for legitimate bulk/workflow operations. |
| `ChartAndBookAssignmentPanels` | Refactor | Keep primary-assignment and impact context. Render canonical assignment lists and use governed operations for “set primary.” |
| `FinanceDataSetupWorkbench` | Replace as a monolith | Extract its useful information architecture into a manifest and shell. Remove generated rows, custom generic table/detail rendering, scenario simulation, and mixed routing/data responsibilities. |
| `CoaWorkbench` | Retain and refactor | Keep hierarchy, mapping, controls, and Trial Balance integration. Replace catalog/account generic tables and remove unrelated legal-entity CRUD from COA navigation. |
| `CoaCatalogView` | Replace | Canonical `chart_of_account` Runtime List with Finance readiness slots. |
| `AccountExplorerView` | Refactor heavily | Remove demo-data dependency. Keep hierarchy and account-impact behavior using live projections and canonical record links. |
| `MappingWorkbenchView` | Refactor heavily | Replace demo mappings with an authoritative mapping service/entity contract and simulation/validation. |
| `LegalEntityView` | Retain as hierarchy context | Use it for organizational orientation and rollup. Open canonical Legal Entity/Company Entity Apps for CRUD. |
| `CompanyControlsView` | Retire after parity | Consolidate its filters and useful indicators into the canonical GL Controls workbench; avoid two competing company-control grids. |
| `CloseCycleWorkbench` | Retain | This is a justified governed workflow. Normalize scope, route, API, transition error handling, and performance behavior. |
| `PeriodCloseDashboardView` and period matrix variants | Consolidate | Select one operational close entry point and one setup/readiness matrix; remove overlapping dashboards after feature parity. |
| `AccountingProfileWorkbench` | Retain and refactor | Keep composition, related definitions, and simulator. Replace direct/manual entity reads where canonical metadata APIs can supply them; add an aggregate save only if profile consistency requires one transaction. |
| Taxonomy workbench manifest/header | Split and retain shared pattern | Keep the workbench-mode pattern, but move Finance Setup ownership/dependencies to the Finance setup manifest and avoid one oversized cross-domain manifest. |
| `FinanceContextBar`, scope/fiscal choosers | Retain after unification | Merge onto one scope/lens contract and one URL-state helper. Remove parallel company selectors inside child surfaces. |
| `recordLinks.ts` | Retain | Continue using shared Entity App href builders and context-menu behavior; add validated return context centrally. |
| `demo-data.ts` and orchestrator mocks | Test/story/demo only | Remove from production exports and production workbench routes when live replacements exist. |
| Finance hooks with direct `fetch()` | Consolidate | Use typed API clients, shared query keys, abort signals, normalized errors, semantic invalidation, and server bootstrap where appropriate. |

### Remove or replace after migration

- `SmartEntity`, `SmartRow`, `ChildSurface`, `generatedRows`, and `SmartTable` in `FinanceDataSetupWorkbench.tsx`.
- Hard-coded setup rows, dates, company names, statuses, and scenario-derived fake data.
- Generic entity detail fields rendered as static labels in `StandardDetailPanel`.
- Direct entity-table implementations when the same entity can use Runtime List.
- Direct string construction of `/app/*`, `/finance/setup/*`, and `/api/finance/setup/*` paths.
- Client hooks that independently reload context already available from the server route.
- Frontend/server DTO mirrors after shared schema adoption.
- Production exports of `demo-data` and invoice orchestrator mocks where they are no longer test-only.

### Retain and refactor

- Company Hub readiness concept.
- Explore/configure/operate separation where it represents real user intent.
- COA hierarchy, mapping, Trial Balance, close, reconciliation, and reporting workbenches.
- Finance-specific status, amount, period, and scope components where they do not duplicate platform primitives.
- Existing server Finance Setup services and DDL, subject to batching and contract normalization.

## 13. Performance Plan and Gates

### 13.1 Canonical list gates

Reuse the existing Runtime List gates:

- cold rows visible under 2,000 ms median;
- warm rows visible within 500 ms median;
- no skeleton on a valid warm navigation;
- descriptor and session configuration reused within their valid windows;
- no incompatible cache reuse after query, scope, permission, or mutation changes.

### 13.2 Canonical record gates

Reuse `perf/budgets/record-workspace.v1.json`:

- initial record usable: 3,000 ms;
- warm record navigation: 500 ms;
- first surface ready: 1,000 ms;
- zero exact duplicate calls;
- zero N+1 request families;
- zero per-item enrichment calls;
- unsupported surfaces: zero calls.

### 13.3 Finance Workbench-specific gates

Proposed initial gates:

| Metric | Budget |
|---|---:|
| Company Hub usable, cold | 2,500 ms median |
| Company Hub usable, warm | 500 ms median |
| Scope switch to updated readiness | 1,000 ms median |
| Embedded list warm navigation | 500 ms median |
| Initial readiness requests | 1 aggregated request |
| Per-card/per-row readiness requests | 0 |
| Duplicate business requests | 0 |
| Workbench initial JSON transfer | 250 KB maximum before compression |

These budgets should become machine-readable under `perf/budgets/finance-workbench.v1.json` before enforcement.

### 13.4 Query and cache rules

- One company context resolution per request.
- One aggregated readiness query/service call per selected scope and lens.
- No SQL or API query per setup card, account row, company row, tax component, or bank link.
- Cache keys include tenant, resolved scope fingerprint, finance lens, descriptor/version, and permission stamp when Phase 3 activates.
- Authenticated upstream fetches remain `no-store`; deliberate reuse occurs in bounded application caches.
- Mutation success invalidates by semantic entity and affected workbench scope, not by clearing all Finance queries.
- Prefetch only on visible/hover/focus intent and only for metadata-enabled entities.

## 14. Testing Strategy

### Contract tests

- Shared schema parse/serialize tests.
- Frontend/server compatibility fixtures.
- Scope code-to-ID resolution and tenant isolation tests.
- Stable route and query-key tests.

### UI tests

- Entity list embedded frame parity with `/app/:entity`.
- Create/detail/edit links and return navigation.
- Scope switching and lens preservation.
- Empty, loading, error, conflict, and stale-data states.
- Keyboard navigation, focus return, responsive layout, and accessibility names.

### API tests

- GET/POST/PATCH/DELETE relay coverage.
- CSRF rejection for mutations.
- Session and tenant-context propagation.
- Idempotency and optimistic-concurrency headers.
- Upstream status/body/header preservation.
- Compatibility proxy and redirect behavior.

### Domain tests

- Readiness dependency truth tables.
- GL postability and period gates.
- House-bank chain completeness.
- Opening-balance/Trial Balance validation.
- Phase 2 profile, tax, payment, and settlement resolution previews.

### Performance tests

- Runtime List cold/warm/context-switch/mutation revisit matrix.
- Runtime Record master/ledger matrix.
- Finance Hub cold/warm/scope-switch matrix.
- Large COA, multi-company, multi-legal-entity, and skewed tax/profile datasets.

## 15. Delivery Order by Vertical Slice

Use vertical slices rather than building all navigation first and wiring data later:

1. Route/BFF foundation and shared scope contract.
2. Company Hub with real Phase 1 readiness.
3. Ledger Book canonical list/record/CRUD pilot.
4. COA and GL account list/record plus dedicated hierarchy.
5. Company GL controls and postability.
6. Fiscal periods, opening balances, Trial Balance, and certification.
7. House banks and links.
8. Phase 1 cleanup and performance qualification.
9. Dimensions and accounting profiles.
10. Tax and WHT.
11. Payment methods, terms, bank interfaces, and settlement.
12. Phase 2 cleanup and performance qualification.

Each slice must include route, contract, server projection, canonical list/record links, empty/error states, tests, cache invalidation, and performance evidence before moving to the next slice.

## 16. Risks and Controls

| Risk | Control |
|---|---|
| Entity metadata is incomplete for a Finance table | Add/fix metadata first; do not compensate with a permanent custom CRUD table. |
| Embedded list duplicates page chrome or URL state | Add one supported embedded frame contract and keep canonical list state semantics. |
| Workbench and Entity App fetch the same record | Use lightweight preview; full record opens in Entity App. Do not mount full record workspace in the first cut. |
| Old and new routes diverge | Redirect old UI routes and proxy old API paths during a measured compatibility window. |
| BFF mutation path bypasses security conventions | Reuse the shared module relay and CSRF behavior. |
| Scope switch leaks stale rows | Scope fingerprint in list/workbench cache keys; clear incompatible browser state on context change. |
| Phase 3 requires a redesign | Preserve scope type/code, resolved IDs server-side, ownership metadata, and permission-aware extension points now. |
| Large monoliths return during Phase 2 | Enforce manifest/shell/surface separation and package-level import boundaries. |

## 17. Definition of Done

The Finance Workbench migration is complete when:

- `/workbench/finance/**` is canonical and all navigation uses it;
- ordinary Finance setup records use the canonical Entity List and Entity App;
- dedicated workbenches exist only for justified cross-entity or analytical workflows;
- Phase 1 and Phase 2 CRUD paths work end to end;
- no generated/mock setup records appear in production;
- frontend and server use one shared Finance Workbench contract;
- the BFF supports required read and mutation methods with canonical security behavior;
- old routes and compatibility APIs have measured, tested retirement evidence;
- list, record, and Finance Workbench performance gates pass against a production build;
- no duplicate/N+1 request patterns are introduced;
- tenant isolation and scope correctness remain enforced while permission UX is parked.
