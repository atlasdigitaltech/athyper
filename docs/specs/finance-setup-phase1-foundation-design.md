# Finance Setup Phase 1 Foundation Design

Status: Proposed for review

Last reviewed: 2026-07-20

Applies to: Neon Finance Setup, canonical Entity App, Finance services, and Finance readiness

## 1. Objective

Phase 1 establishes the minimum accounting foundation required before a Company Code can post transactions.

The phase covers:

1. Organization and Currency
2. Chart of Accounts and GL Accounts
3. Books and Ledgers
4. Fiscal Calendar and Periods

The design preserves the existing DDL and separates reusable tenant definitions from Company Code adoption and controls.

```text
Tenant definition
    -> Company Code assignment
        -> Company-specific controls
            -> Generated operational records
                -> Readiness certification
```

Tenant isolation remains mandatory. Detailed Legal Entity and Company Code authorization is deferred to Phase 3, but every URL, API request, query, and record must retain tenant, Legal Entity, and Company Code context.

## 2. Landed ownership model

| Object | System ownership | Phase 1 UI | Notes |
|---|---|---|---|
| Tenant | Session/security context | Read-only context | Not edited from Finance Setup |
| Currency catalog | Platform reference | Read-only lookup | `shared.currency`; ISO currency reference |
| Legal Entity | Tenant | Entity App record | Statutory identity and reporting context |
| Company Code | Tenant under Legal Entity | Entity App record | Accounting and balancing unit |
| Chart of Accounts | Tenant | Entity App CRUD | Reusable by multiple Company Codes |
| GL Account | Tenant within one chart | Entity App list/record plus hierarchy view | A GL Account belongs to exactly one chart |
| Company Chart assignment | Company Code | Custom assignment panel | Determines charts usable by the company |
| Company GL control | Company Code and GL Account | Custom grid/editor | Controls company-level postability |
| Ledger Book | Tenant | Entity App CRUD | Reusable book definition |
| Company Book assignment | Company Code | Custom assignment panel | Determines books available to the company |
| Company default book | Company Code | Custom assignment command | Must reference an active assigned book |
| Fiscal Calendar definition | Tenant | Fiscal Calendar Designer | Versioned governed aggregate |
| Calendar period rule | Calendar version | Fiscal Calendar Designer | Child rules edited with calendar |
| Company Calendar assignment | Company Code | Custom assignment step | Effective by fiscal year |
| Fiscal Period | Company Code | Generated/read-only matrix | Operational company period gate |
| Book-period status | Company Code and Book | Generated/governed matrix | Operational book-specific gate |

### 2.1 Core rule

```text
Definitions are tenant-owned.
Assignments determine Company Code usage.
Controls determine Company Code posting behavior.
Generated periods become operational posting gates.
Governance certifies readiness.
```

## 3. Information architecture

Phase 1 should not use the current long horizontal Configure tab strip as its primary navigation. Use a compact foundation journey with four domain pages.

```text
Finance Setup
├── Tenant definitions
│   ├── Chart of Accounts
│   ├── GL Accounts
│   ├── Ledger Books
│   └── Fiscal Calendars
└── Company foundation
    ├── 1. Organization & Currency
    ├── 2. Chart of Accounts & GL Accounts
    ├── 3. Books & Ledgers
    └── 4. Fiscal Calendar & Periods
```

Recommended routes:

```text
/finance/setup
/finance/setup/tenant/{tenantCode}/definitions
/finance/setup/company/{companyCode}/foundation
/finance/setup/company/{companyCode}/foundation/organization
/finance/setup/company/{companyCode}/foundation/accounts
/finance/setup/company/{companyCode}/foundation/books
/finance/setup/company/{companyCode}/foundation/calendar
```

Canonical Entity App routes remain the editing destination for simple definitions:

```text
/app/chart_of_account
/app/chart_of_account/{id}
/app/gl_account
/app/gl_account/{id}
/app/ledger_book
/app/ledger_book/{id}
```

The Fiscal Calendar remains an aggregate editor because its header, construction rules, versioning, preview, assignment, and generation form one business transaction.

## 4. Entry and scope behavior

The existing `/finance/setup` company preselection remains the entry contract.

1. Tenant and Legal Entity come from the authenticated session and are read-only.
2. Company Code is mandatory and always visible in the preselection screen.
3. With one accessible company, it is selected by default.
4. With multiple accessible companies, the user confirms or changes the selection.
5. `Next` opens `/finance/setup/company/{companyCode}/foundation`.
6. The server verifies that the URL Company Code belongs to the session tenant and active Legal Entity.
7. Company switching returns to preselection; it must not silently substitute the first company.

The foundation header displays the context once:

```text
Company Name (CODE)  ·  Legal Entity  ·  Functional Currency
Foundation readiness: 2 of 4 complete
```

Do not repeat Tenant, Legal Entity, Company Code, Book, and Period in every card. Show the selected Book or fiscal year only inside the domain where it changes the result.

## 5. Domain 1 — Organization and Currency

### 5.1 Purpose

Confirm the statutory and accounting boundary before assigning accounting structures.

### 5.2 Existing model

| Concern | Existing storage |
|---|---|
| Legal Entity statutory profile | `master.legal_entity` |
| Legal Entity country | `master.legal_entity.country_code` |
| Legal Entity functional currency | `master.legal_entity.functional_currency` |
| Legal Entity reporting currency | `master.legal_entity.reporting_currency` |
| Company Code profile | `master.company_code` |
| Company functional currency | `master.company_code.functional_currency` |
| Company country and framework | `master.company_code.country_code`, `regulatory_framework` |
| Company business clock | `timezone_code`, `locale_code`, `date_format`, `week_start` |
| Currency reference | `shared.currency` |

No new table is required.

### 5.3 Screen design

Use a review card with three sections:

- Session context: Tenant and active Legal Entity, read-only.
- Statutory context: Legal Entity country, functional currency, reporting currency, and regulatory framework.
- Company accounting profile: Company Code, country, functional currency, regulatory framework, timezone, locale, and status.

`Edit Legal Entity` and `Edit Company Code` open their canonical Entity Record views. The foundation page should not duplicate those CRUD forms.

### 5.4 Rules

- Company Code must belong to the selected Legal Entity and tenant.
- Legal Entity and Company Code must be active before final readiness certification.
- Currency codes must resolve to active `shared.currency` records.
- Company functional currency is the default transaction/accounting currency where no more specific book or account rule applies.
- Legal Entity reporting currency is statutory/reporting context; it is not a substitute for a Ledger Book base currency.
- Changing functional currency after posted journals or certified opening balances is blocked and requires a governed migration.
- Company country should default from the Legal Entity but remains explicit because tax and localization can be Company Code-specific.

### 5.5 Completion check

Organization and Currency is complete when:

- Legal Entity is active.
- Company Code is active and correctly linked.
- Legal Entity country, functional currency, and reporting currency are valid.
- Company functional currency, country, timezone, and regulatory framework are valid.

## 6. Domain 2 — Chart of Accounts and GL Accounts

### 6.1 Existing model

| Concern | Existing storage |
|---|---|
| Chart definition | `master.chart_of_account` |
| GL hierarchy and classification | `master.gl_account` |
| Company-to-chart assignment | `master.company_code_chart_assignment` |
| Company GL controls | `master.company_code_gl_account` |
| Effective postable account projection | `master.mv_company_postable_account` |

No new table is required for Phase 1.

### 6.2 Tenant definition experience

Chart of Accounts uses canonical Entity List and Record:

- Code, name, framework, country, account range, version, lifecycle, and lock state.
- Record relationship shows the GL Accounts in that chart.
- Activation requires at least one valid posting account.
- A chart used by a Company Code cannot be deleted; retire or version it.

GL Accounts use canonical Entity List and Record with an optional hierarchy lens:

- Filter is always scoped by `chart_of_account_id`.
- Display code, name, account class, node type, normal balance, subledger type, optional currency, parent, status, and usage count.
- Header nodes cannot accept postings.
- Posting nodes can become company-postable only through an active chart assignment.
- One GL Account belongs to exactly one Chart of Accounts.
- The same account code can exist in different charts as different records.

### 6.3 Company assignment experience

The Company Accounts page contains two sequential panels.

#### A. Chart assignment

Show assignment type, chart, version, chart status, effective dates, assignment status, primary indicator, and impacted account count.

Supported assignment types in Phase 1:

- `operating` — required; drives ordinary posting availability.
- `local` — optional statutory/local chart.
- `group` or `reporting` — optional reporting chart.

Commands:

- Assign chart
- Set primary within assignment type
- Change effective dates
- Deactivate assignment
- Open chart definition
- View GL Accounts

At least one active primary operating chart is required. Deactivation of the final active primary operating chart is blocked unless a replacement is activated in the same transaction.

#### B. Company GL controls

Use the existing custom grid over `master.mv_company_postable_account` and `master.company_code_gl_account`.

Columns:

- Account code and name
- Account class and node type
- Posting allowed
- Manual posting blocked
- Automatic posting blocked
- Cost Center required
- Profit Center required
- Project required
- Reconciliation type
- Tax category
- Default Cost Center and Site
- Control coverage status

Support search, class filters, only-unconfigured filter, bulk activation, bulk dimension requirement, and row-level edit.

### 6.4 Rules

- Company GL controls can reference only accounts reached through an active Company Chart assignment.
- Header accounts are never postable.
- Inactive chart or GL definitions are never projected as postable.
- Account-specific currency, when present, restricts postings to that currency; it does not replace company or book currency.
- Chart assignment changes refresh the postable-account projection and invalidate readiness.
- Company control changes are audited and invalidate readiness when they affect critical accounts.

### 6.5 Completion check

Accounts is complete when:

- One active primary operating chart exists.
- The assigned chart is active and effective.
- The chart contains active posting accounts.
- Every required posting account has a valid Company GL control or an explicitly accepted default policy.
- No critical Company GL control points to an inactive or unreachable GL Account.

## 7. Domain 3 — Books and Ledgers

### 7.1 Existing model

| Concern | Existing storage |
|---|---|
| Ledger Book definition | `master.ledger_book` |
| Company Book assignment | `master.company_code_book_assignment` |
| Company default book | `master.company_code.default_ledger_book_id` |
| Book-specific posting gate | `governance.book_period_status` |

No new table is required.

### 7.2 Tenant definition experience

Ledger Books use canonical Entity List and Record:

- Code and name
- Category and reporting standard
- Base currency
- Auto-post, approval, manual JE, reversal, and close behavior
- Lifecycle status
- Assigned Company Code count

Typical definitions include Statutory, Tax, Management, and Group Reporting books. A tenant book is reusable; it is not owned by one Company Code.

### 7.3 Company assignment experience

The Books page shows available tenant books and current Company assignments.

Assignment fields:

- Ledger Book
- Effective from/to
- Optional override currency
- Optional alternate COA prefix
- Priority
- Conflict strategy
- Assignment status
- Default-for-company indicator

Commands:

- Assign book
- Set as company default
- Edit assignment
- Deactivate assignment
- Open Ledger Book definition
- View period gates

The default marker belongs to the Company Code assignment context. It must not be inferred from the tenant-level `ledger_book.is_primary` flag.

### 7.4 Required contract correction

The current `setPrimaryBook()` service incorrectly queries and updates `company_code_id` on `master.ledger_book`; that column does not exist.

Replace the command contract with:

```text
setCompanyDefaultBook(tenantId, companyCode, bookId)
```

The command must:

1. Resolve the Company Code inside the tenant.
2. Lock the Company Code and target assignment.
3. Verify the Company Book assignment is active and effective.
4. Update `master.company_code.default_ledger_book_id`.
5. Audit the Company Code assignment change.
6. Invalidate company readiness.

The hardening trigger that derives the default from the highest-priority active assignment conflicts with explicit user selection. Phase 1 must choose one source of truth. Recommended decision: `company_code.default_ledger_book_id` is explicit authority; assignment priority resolves routing conflicts but does not silently replace a user-selected default.

The tenant-level `ledger_book.is_primary` may remain a tenant provisioning default for new companies, but the company UI must label it `Tenant default`, never `Company primary`.

### 7.5 Currency precedence

For a selected Company Book:

```text
company_code_book_assignment.override_currency_code
    -> ledger_book.base_currency_code
        -> company_code.functional_currency only as validation/defaulting context
```

An override is allowed only for an explicit business requirement and must be visible in readiness and reporting headers.

### 7.6 Completion check

Books is complete when:

- At least one active tenant Ledger Book is assigned and effective.
- The Company default book references an active effective assignment.
- Book and override currencies are valid.
- Book base currency is compatible with the intended statutory/reporting purpose.
- No duplicate or conflicting effective assignment exists.

## 8. Domain 4 — Fiscal Calendar and Periods

### 8.1 Existing model

| Concern | Existing storage |
|---|---|
| Calendar header/version | `control.fiscal_calendar_config` |
| Period construction | `control.fiscal_calendar_period_rule` |
| Company assignment | `control.company_fiscal_calendar_assignment` |
| Company period gate | `master.fiscal_period` |
| Company/Book period gate | `governance.book_period_status` |

No additional table is required.

### 8.2 Tenant definition experience

Retain and refine the existing Fiscal Calendar Designer. It supports:

- Monthly, 4-4-5, 4-5-4, 5-4-4, thirteen-period, and custom patterns
- Fiscal-year label rule
- Anchor month/day and weekday rule
- Period count and leap-week behavior
- Ordered opening, normal, adjustment, and closing rules
- Exact-date preview
- Draft, active, and retired versions

Active versions are immutable. A change to an active calendar creates a new draft version linked through `supersedes_id`.

### 8.3 Company assignment and generation experience

Separate definition from adoption in a four-step flow:

1. Select an active calendar version.
2. Preview exact periods for the target fiscal year.
3. Assign it to the Company Code from an effective fiscal year.
4. Generate Company fiscal periods and Book-period gates.

The period matrix displays:

- Fiscal year and period number
- Period type
- Start and end date
- Calendar version provenance
- Company period status
- One Book-period status column for every active assigned book
- Generation and last-change metadata

### 8.4 Rules

- Company calendar assignments cannot overlap for the same effective fiscal years.
- Ordinary posting-date resolution selects only a normal period.
- Opening, adjustment, and closing workflows select their period type explicitly.
- Adjustment semantics come from `period_type = 'adjustment'`, not `period_number > 12`.
- Period 0 remains the opening-balance period.
- Generation is idempotent for unchanged future periods.
- Generation cannot alter an opened, soft-closed, or hard-closed period whose dates or semantics differ.
- Generating Company periods seeds missing `governance.book_period_status` rows for every active Company Book assignment without overwriting existing statuses.
- Posting requires both the Company fiscal period and selected Book period to permit posting.

### 8.5 Legacy-column correction

`master.company_code.fiscal_year_start_month` and `fiscal_year_variant` are legacy summary/default fields. Once a Company Calendar assignment exists, the assigned versioned calendar is authoritative.

Recommended behavior:

- Use legacy fields only to propose the first calendar template during migration.
- Display them read-only as derived compatibility values after assignment.
- Never resolve posting dates directly from those columns when an assignment exists.
- Add a consistency check so legacy values cannot silently disagree with the active assigned calendar.

### 8.6 Completion check

Calendar is complete when:

- One active calendar assignment covers the current fiscal year.
- Preview validation has no gaps, overlaps, duplicate period numbers, or invalid dates.
- Fiscal periods exist for the current year and required forward horizon.
- Book-period rows exist for every active Company Book assignment.
- At least one normal period can be opened through the governed command path.

## 9. Phase 1 readiness

The four domain checks roll up into a foundation status.

| Status | Meaning |
|---|---|
| Not started | Required definitions or assignments do not exist |
| In progress | Some requirements exist, but one or more blocking checks fail |
| Ready for certification | All deterministic checks pass |
| Certified | A valid Finance Setup readiness certification exists |
| Stale | A material configuration change occurred after certification |

Material changes include:

- Functional currency change
- Primary operating Chart change
- Critical GL control change
- Default or assigned Book change
- Calendar assignment or generated-period change

Phase 1 can expose full CRUD without detailed role enforcement, but production posting must continue to enforce tenant isolation, Company Code scope, period gates, and the configured readiness rollout policy.

## 10. API design

Use the canonical Entity API for simple tenant definitions and dedicated Finance Setup commands for assignments and aggregates.

### 10.1 Canonical Entity API

- Legal Entity
- Company Code
- Chart of Accounts
- GL Account
- Ledger Book

Do not introduce duplicate `/api/finance/master/*` CRUD endpoints for these entities. Neon may proxy canonical runtime/entity APIs, but the backend contract remains the Entity API.

### 10.2 Finance Setup APIs

Recommended scoped contract:

```text
GET  /finance/setup/company/{companyCode}/foundation
GET  /finance/setup/company/{companyCode}/chart-assignments
POST /finance/setup/company/{companyCode}/chart-assignments
PUT  /finance/setup/company/{companyCode}/chart-assignments/{id}
POST /finance/setup/company/{companyCode}/chart-assignments/{id}/set-primary

GET  /finance/setup/company/{companyCode}/gl-controls
PUT  /finance/setup/company/{companyCode}/gl-controls/{glAccountId}
POST /finance/setup/company/{companyCode}/gl-controls/bulk

GET  /finance/setup/company/{companyCode}/book-assignments
POST /finance/setup/company/{companyCode}/book-assignments
PUT  /finance/setup/company/{companyCode}/book-assignments/{id}
POST /finance/setup/company/{companyCode}/books/{bookId}/set-default

GET  /finance/setup/fiscal-calendars
POST /finance/setup/fiscal-calendars
PUT  /finance/setup/fiscal-calendars/{calendarId}
GET  /finance/setup/fiscal-calendars/{calendarId}/preview
POST /finance/setup/company/{companyCode}/calendar-assignments
POST /finance/setup/company/{companyCode}/fiscal-years/{fiscalYear}/generate
```

Every Company-scoped handler resolves `companyCode` under the request tenant. Client-supplied tenant IDs are never trusted as authorization.

All mutations require optimistic concurrency/version metadata, audit actor, correlation ID, reason where material, and readiness invalidation.

## 11. Current implementation reuse and cleanup

### Reuse

- Finance Setup company preselection and scope validation
- Canonical Entity List and Record UX
- `ChartAssignmentPanel`
- `GlControlsGrid`
- `BookAssignmentPanel` presentation
- Fiscal Calendar Designer, preview, assignment, and generation services
- `master.mv_company_postable_account`
- Existing fiscal and Book-period gates
- Finance Setup audit and readiness services

### Refactor

- Replace the broad horizontal Configure tab strip with four Phase 1 foundation pages.
- Move Chart, GL Account, and Ledger Book CRUD links to the Tenant Definitions area.
- Add missing create/edit/deactivate commands to Chart and Book assignment panels.
- Correct `setPrimaryBook()` to a Company default-book command.
- Stop presenting `ledger_book.is_primary` as a Company-specific primary flag.
- Make the assigned fiscal calendar authoritative over legacy Company fiscal-year fields.
- Replace disabled “follow-up sprint” assignment buttons with actual governed CRUD.
- Remove or isolate demo-backed `FinanceDataSetupWorkbench` paths from the production Finance Setup navigation.

## 12. Delivery slices

### Slice 1 — Foundation shell and organization

- Add the four-domain foundation navigation.
- Reuse company preselection and context header.
- Build Organization and Currency review card.
- Link to Legal Entity and Company Entity Records.
- Add domain completion endpoint and status.

### Slice 2 — Accounts

- Confirm Chart and GL metadata Entity contracts.
- Add Tenant Definitions links.
- Complete Chart assignment CRUD.
- Harden primary operating assignment invariants.
- Complete Company GL controls grid and bulk actions.
- Refresh postable-account projection and readiness after mutations.

### Slice 3 — Books

- Confirm Ledger Book Entity contract.
- Complete Company Book assignment CRUD.
- Replace `setPrimaryBook()` with `setCompanyDefaultBook()`.
- Resolve the trigger versus explicit-default conflict.
- Add currency precedence validation.

### Slice 4 — Calendar and periods

- Rehome the existing Fiscal Calendar Designer in the foundation journey.
- Separate tenant definition and Company assignment steps visually.
- Add generated Company/Book period matrix.
- Add legacy-field consistency validation.
- Surface period-generation conflicts and evidence.

### Slice 5 — Readiness and hardening

- Implement the four deterministic completion checks.
- Invalidate certification on material changes.
- Add tenant-isolation and multi-company integration tests.
- Add posting-gate and date-resolution integration tests.
- Validate single-company and multi-company UX.

## 13. Acceptance criteria

Phase 1 is complete when:

1. A tenant administrator can define Charts, GL Accounts, Ledger Books, and Fiscal Calendars without entering a Company-specific editor.
2. A Finance Manager can select a Company Code and complete all four foundation domains without seeing another tenant's data.
3. One tenant definition can be reused by multiple Company Codes through explicit assignments.
4. Chart and Book assignments support create, edit, deactivate, effective dating, and default/primary commands.
5. Company GL controls are limited to accounts reachable through active Chart assignments.
6. The Company default Book is explicit, active, and assigned.
7. Fiscal periods and Book-period gates are generated from the assigned calendar version.
8. Multi-book status is shown as a matrix; the UI never summarizes one Book as if it represented all Books.
9. Material changes invalidate readiness certification.
10. All APIs enforce tenant isolation and Company Code membership server-side.

## 14. Review decisions requested

The following decisions should be locked before implementation:

1. Confirm `company_code.default_ledger_book_id` as the authoritative Company default Book.
2. Confirm `ledger_book.is_primary` means only Tenant provisioning default, or retire the field from business use.
3. Confirm the active Company Calendar assignment is authoritative over `fiscal_year_start_month` and `fiscal_year_variant`.
4. Confirm Phase 1 Chart assignment types: operating, local, group/reporting.
5. Confirm whether every projected posting GL Account requires an explicit Company GL control row, or whether documented defaults are allowed.
6. Confirm the forward fiscal-period generation horizon, recommended current year plus one future fiscal year.

## 15. Recommendation

Approve the hybrid design:

- Canonical Entity App for tenant-owned simple definitions.
- Custom Finance Setup foundation pages for Company assignments and controls.
- Aggregate Fiscal Calendar Designer for versioning, rules, preview, assignment, and generation.
- Governance/readiness checks over the resulting configuration.

This approach reuses the existing DDL, avoids duplicate CRUD implementations, supports single- and multi-company tenants, and preserves the scope metadata needed for Phase 3 authorization.
