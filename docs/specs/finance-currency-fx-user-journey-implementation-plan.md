# Currency and FX User Journey Implementation Plan

Status: Proposed

Prepared: 2026-07-24

Applies to: Neon Finance Setup, Finance Workbench, Entity App, Finance services, metadata runtime, Finance readiness, and the FX database contracts

## 1. Outcome

Deliver one clear Currency and FX journey:

1. Configure shared FX behavior once at tenant level.
2. Maintain tenant-wide rate values in the canonical `fx_rate` Entity List.
3. At company level, review inherited behavior and assign FX gain/loss accounts.
4. Keep company and ledger-book exceptions, policy history, and resolution traces in advanced surfaces.

The implementation reuses the existing `control.fx_policy`, `master.fx_rate`, policy resolver, rate import validation, exposure discovery, and posting-role mapping services. It changes the product shape and hardens lifecycle behavior; it does not introduce a second rate store or a parallel policy model.

## 2. Locked product decisions

### 2.1 Route ownership

| User task | Route or surface |
|---|---|
| View supported currencies | `/app/currency` |
| Configure the tenant default policy | `/finance/setup/tenant/{tenantCode}/currency-fx` |
| Maintain exchange rates | `/app/fx_rate` |
| Inspect one rate | `/app/fx_rate/{id}` |
| Review company currency usage and effective policy | `/finance/setup/company/{companyCode}/currency-fx` |
| Assign FX gain/loss accounts | Company Currency and FX page |
| Configure a company override | Company Currency and FX page |
| Configure a ledger-book override | Company page, Advanced section |
| Inspect policy history | `/app/fx_policy` and `/app/fx_policy/{id}` |
| Test rate resolution | Company page, Advanced section |

There is no separate Company+Book page in the first release.

### 2.2 Scope and ownership

- ISO currencies remain platform-owned in `shared.currency`.
- Rate values remain tenant-owned in `master.fx_rate`.
- A tenant default policy is a `control.fx_policy` row with both `company_code_id` and `ledger_book_id` null.
- A company override has `company_code_id` set and `ledger_book_id` null.
- A book override has both `company_code_id` and `ledger_book_id` set.
- FX gain/loss account mappings remain Company+Book records in `control.posting_role_account_map`.
- Adding a missing rate from a company page always writes to the tenant rate store.

### 2.3 Setup versus operational health

Tenant setup is complete when an active, effective tenant default policy exists for the general transaction context.

Rate availability does not make tenant setup incomplete. Missing or stale rates are operational-health findings.

Company setup is complete when either:

- the company has no foreign-currency exposure; or
- an effective tenant default exists and required `fx_gain`/`fx_loss` account mappings resolve for every exposed ledger book.

Company rate health is reported separately. It may affect posting or certification readiness, but it does not make the one-time setup form incomplete.

### 2.4 Historical behavior

- Policy edits create a new version and supersede or end-date the previous version.
- Returning a company to the tenant default end-dates or deactivates the company override; it never deletes it.
- Rate corrections use **Replace rate**. The existing rate becomes `superseded`, and a new active record is inserted.
- Rate and policy detail pages are read-only audit surfaces.
- Generic update, delete, and bulk-update operations are not available for `fx_rate` or `fx_policy`.

## 3. Current implementation baseline

The following foundation already exists and should be retained:

- `control.fx_policy` supports Tenant, Company, and Company+Book scope, effectivity, priority, version number, and `supersedes_id`.
- `resolveFxPolicy()` applies context, scope, date, priority, and version precedence.
- `traceFxResolution()` supports direct, inverse, and explicit-pivot triangulated selection.
- `loadCurrencyFxSetup()` discovers exposure from assigned books and linked bank accounts.
- `finance-fx-rate-import.service.ts` validates and imports up to 5,000 rate rows.
- `loadPostingRoleCoverage()` and the existing `PostingRoleCoverageMatrix` provide versioned Company+Book account assignment.
- App Router pages already exist for both target Finance Setup URLs.
- `fx_rate` is already registered as an Entity App entity.

The implementation must close these gaps:

| Gap | Current behavior | Required behavior |
|---|---|---|
| Tenant page | The tenant route renders a combined custom Rate Workbench | It renders tenant default settings plus summaries and links to `/app/fx_rate` |
| Company page | The complete policy editor and trace are prominent | Inherited summary and posting accounts are primary; overrides and traces are advanced |
| Tenant policy API | No tenant-policy read/write endpoint | Add tenant summary and append-only tenant policy commands |
| Company policy lifecycle | Existing policy rows can be updated in place | Replace with versioned create/supersede/end commands |
| Rate maintenance | Custom textarea import and table | Canonical Entity List, read-only record, governed add/replace/import |
| Rate lifecycle | Admin PATCH can change an active rate in place | All corrections call one transactional Replace Rate command |
| Rate source selection | The active-rate unique index excludes `source` | Allow one active rate per natural key and source so source preference can work |
| Rate lineage | `master.fx_rate` has no explicit predecessor link | Add version/lineage fields and show them on the detail page |
| Policy Entity App | Metadata fields are seeded only if an entity already exists | Fully register `fx_policy` as a read-only advanced entity |
| FX posting accounts | Existing matrix is all-role and full-workbench oriented | Reuse it in compact mode filtered to `fx_gain` and `fx_loss` |
| Exposure detection | Books and bank accounts only | Include effective company payment policies with explicit foreign currency |
| Import runtime | The active Runtime List advertises import but has no active wizard | Add a supported governed import route; do not depend on `product-deprecated` |
| Permissions | FX routes authenticate but do not consistently authorize commands | Enforce view/configure/rate/advanced permissions at the server |

## 4. Target page behavior

### 4.1 Tenant Currency and FX page

Component:

```text
TenantCurrencyFxSettingsPage
├── SetupPageHeader
├── SetupStatusBanner
├── EffectivePolicyEditor
├── EntityCollectionSummary       entity="fx_rate"
└── CompanyPolicyUsageSummary
```

Required states:

1. **No tenant default**
   - Show `Default settings are not configured`.
   - Primary action: `Configure default settings`.
   - Setup status is `not_started`.

2. **Active tenant default**
   - Show the normal fields without requiring Advanced to be opened:
     - transaction rate type;
     - month-end revaluation rate type;
     - maximum age;
     - preferred source;
     - allow inverse.
   - Setup status is `complete`, regardless of current rate availability.

3. **Scheduled future default only**
   - Show it as scheduled.
   - Setup remains incomplete until a policy is effective as of the requested date.

4. **Operational rate attention**
   - Show active-rate count, latest effective date, and unresolved requirement count.
   - Link to a filtered `/app/fx_rate` view when possible.
   - Do not alter the setup-completion banner.

5. **Permission-limited viewer**
   - Show effective settings and summaries.
   - Hide or disable edit/import commands with a server-supplied reason.

Advanced fields stay collapsed:

- pivot currency;
- allow triangulation;
- missing-rate behavior;
- manual override;
- manual override approval;
- automatic revaluation reversal;
- effective date;
- priority;
- ordered fallback sources after the preferred source.

The simple `Preferred source` control edits the first entry in `preferred_sources`. Advanced settings edit the remaining source order.

### 4.2 Exchange-rate Entity List and record

List route: `/app/fx_rate`

Default columns:

- From currency
- To currency
- Rate
- Rate type
- Effective date/time
- Source
- Status

Default filters:

- From currency
- To currency
- Rate type
- Effective date
- Source
- Status

List commands:

- Add rate
- Import rates
- Export

Record route: `/app/fx_rate/{id}`

The record is read-only and displays:

- rate identity and value;
- generated inverse rate;
- rate type and effective timestamp;
- source and source reference;
- status and version;
- predecessor/successor lineage;
- created/status-change audit;
- metadata that is explicitly safe for display.

The only correction command is `Replace rate`. It opens a governed form prefilled from the selected record and requires a replacement reason or source reference.

### 4.3 Company Currency and FX page

Component:

```text
CompanyCurrencyFxSettingsPage
├── SetupPageHeader
├── SetupStatusBanner
├── CurrencyExposureSummary
├── EffectivePolicySummary
├── PostingRoleCoverageMatrix     roleCodes=["fx_gain", "fx_loss"]
├── RateRequirementList
└── AdvancedSettings
```

State priority:

1. **No foreign-currency exposure**
   - Show `No FX setup is required`.
   - Show functional currency and the evaluated exposure sources.
   - Hide account assignment, override controls, and rate warnings.
   - Keep links to tenant defaults, currency catalogue, and exchange rates.

2. **Tenant default missing**
   - Show `Tenant FX defaults are not configured`.
   - Primary action: `Configure tenant defaults`.
   - Do not allow a company-only policy unless a later product decision explicitly enables it.

3. **Inherited tenant default**
   - Show `Using {tenantName} tenant defaults`.
   - Render a read-only effective-policy summary.
   - Put `Create company override` behind a deliberate secondary action.

4. **Company override**
   - Show `Using a {companyCode}-specific override`.
   - Actions: `Edit override`, `View tenant default`, and `Return to tenant default`.
   - Edit creates a new policy version.

5. **Posting accounts missing**
   - Make `Assign FX gain and loss accounts` the primary setup action.
   - Show one row per active, relevant ledger book.
   - Reuse the existing versioned posting-role assignment command.

6. **Rate missing or stale**
   - Show operational attention separately from setup completion.
   - Actions: `Add missing rate` and `Manage all rates`.
   - Prefill the Add Rate form from the selected requirement.

7. **Advanced**
   - Ledger-book policy overrides.
   - Policy history.
   - Rate-resolution trace.
   - Hide the section when the user lacks the advanced permission.

### 4.4 Rate-health dates

Rate health must be evaluated against a purpose-specific required date:

- normal transaction rate: the page `asOfDate`;
- month-end revaluation rate: the most recent completed fiscal period end on or before `asOfDate`.

This prevents a valid 30 June Period End rate from being called stale merely because the user opens the page later in July. The response must include both `requiredAsOfDate` and `observedAt` so the UI does not imply that all rate types use today's date.

## 5. Read models and API contract

Keep URL route parameters as readable tenant/company codes. Resolve UUIDs inside the authenticated tenant and active Legal Entity context.

### 5.1 Tenant read model

Add:

```text
GET /finance/setup/tenant/:tenantCode/fx
```

Response sections:

```text
tenant
setupStatus
activeDefaultPolicy
scheduledDefaultPolicies
rateSummary
companyUsage
permissions
computedAt
```

`rateSummary.attentionCount` is the number of distinct unresolved tenant requirements, deduplicated by:

```text
fromCurrency + toCurrency + rateType + purpose + requiredAsOfDate
```

The response may also include impacted company codes for drill-down, but the headline count is not multiplied by company.

`companyUsage` reports active companies using the tenant default and active companies with an effective company override.

### 5.2 Company read model

Retain and expand:

```text
GET /finance/setup/company/:companyCode/fx
```

Response sections:

```text
company
exposure
policy.tenantDefault
policy.companyOverride
policy.effective
postingAccounts
rateRequirements
setupStatus
operationalHealth
permissions
computedAt
```

Exposure sources include:

- assigned ledger-book base or override currency;
- linked bank-account currency;
- active company payment-policy currency;
- the ledger book selected by a settlement rule where applicable.

Each exposure reason is returned as structured data, not only presentation text.

### 5.3 Policy commands

Add explicit append-only commands:

```text
POST /finance/setup/tenant/:tenantCode/fx/policies
POST /finance/setup/tenant/:tenantCode/fx/policies/:policyId/replace

POST /finance/setup/company/:companyCode/fx/overrides
POST /finance/setup/company/:companyCode/fx/overrides/:policyId/replace
POST /finance/setup/company/:companyCode/fx/overrides/:policyId/end

POST /finance/setup/company/:companyCode/fx/book-overrides
POST /finance/setup/company/:companyCode/fx/book-overrides/:policyId/replace
POST /finance/setup/company/:companyCode/fx/book-overrides/:policyId/end
```

Command rules:

- tenant commands force `company_code_id` and `ledger_book_id` to null;
- company commands resolve and set the Company UUID and force `ledger_book_id` null;
- book commands verify that the book is actively assigned to the Company;
- the server owns `version_no`, `supersedes_id`, scope UUIDs, status-change fields, and audit fields;
- clients send `expectedVersionNo` for replacement/end commands;
- equal-scope overlap errors return a stable `FX_POLICY_EFFECTIVITY_CONFLICT` code;
- replacing a policy never changes its scope in place.

### 5.4 Rate commands

Add:

```text
POST /finance/setup/tenant/:tenantCode/fx/rates
POST /finance/setup/tenant/:tenantCode/fx/rates/:rateId/replace
POST /finance/setup/tenant/:tenantCode/fx/rates/imports/validate
POST /finance/setup/tenant/:tenantCode/fx/rates/imports
```

The Add Rate and import commands share one normalization/validation function. The Replace Rate command:

1. locks the active source record;
2. verifies `expectedVersionNo`;
3. marks the old record `superseded`;
4. inserts the new active record with incremented version and `supersedes_id`;
5. writes one audit event containing both IDs;
6. commits atomically.

Do not maintain separate create/update logic in the Platform Admin route. Platform Admin must call the same service. Deprecate and then remove its in-place PATCH behavior.

### 5.5 Resolution trace

Retain:

```text
GET /finance/setup/company/:companyCode/fx/resolution-trace
```

Require the advanced view permission. Include:

- requested context and purpose;
- scope candidates and why each lost;
- source and recency candidates;
- direct/inverse/triangulated attempts;
- selected rate IDs and policy ID;
- stable reason codes alongside human-readable explanations.

### 5.6 Runtime-policy parity

Do not expose an editable policy field as complete unless its runtime consumer honors it.

| Policy field | Current consumer state | Required work |
|---|---|---|
| Default and revaluation rate types | Used by Finance FX setup resolution | Keep and add purpose-specific tests |
| Preferred sources | Used for source ranking | Make unlisted-source fallback depend on `missing_rate_behavior` |
| Maximum rate age | Used by rate selection | Evaluate against the purpose-specific required date |
| Allow inverse | Used by rate selection | Keep |
| Pivot and allow triangulation | Used by rate selection | Keep explicit-pivot rule |
| Missing-rate behavior | Stored but not applied as a runtime outcome | Return `block`, `manual_override_required`, or `fallback_exhausted` outcomes and enforce them in shared document FX resolution |
| Manual override and approval | Stored but not resolved from `fx_policy` | Feed the effective policy into manual-rate authorization and block posting until approval when required |
| Automatic revaluation reversal | Stored but not consumed by an FX revaluation executor | Wire it into revaluation-run creation before enabling the editor; otherwise render it read-only with a clear deferred status |

The rollout gate must fail if an editable field is still presentation-only.

## 6. Database and metadata work

### 6.1 `master.fx_rate` lifecycle hardening

Add:

```text
version_no      integer not null default 1
supersedes_id   uuid null
```

Add a tenant-scoped self-reference:

```text
(tenant_id, supersedes_id) -> master.fx_rate (tenant_id, id) ON DELETE RESTRICT
```

Add an index for successor lookup by `supersedes_id`.

Add and force tenant RLS on `master.fx_rate`, with tenant read/insert/update policies and platform-admin policies matching the established master-data pattern. The update policy does not replace the immutability guard; it permits only the governed lifecycle transition executed inside the tenant.

Replace `fxr_pair_date_uq` with an active uniqueness contract that includes `source`:

```text
tenant_id
from_currency
to_currency
rate_type
effective_date
coalesce(effective_time, '00:00:00')
source
```

This allows Central Bank and API rates for the same pair and timestamp to coexist so `preferred_sources` is meaningful.

Add a guard that rejects mutation of an inserted rate's business fields. Lifecycle and audit columns may change only through supersede commands.

### 6.2 `control.fx_policy` lifecycle hardening

No new policy table is required.

Refactor the service so active policy decisions are never updated in place. Use the existing `version_no` and `supersedes_id`.

For a future-effective replacement:

- end-date the current version on the day before the replacement starts;
- insert the future version;
- keep both records active but non-overlapping until their effective dates apply.

For a same-day correction:

- supersede the current record;
- insert the replacement as active.

For `Return to tenant default`:

- end-date the override when a valid prior date range remains;
- otherwise mark it inactive;
- retain the row and audit link.

### 6.3 Entity metadata

Update `fx_rate` metadata:

- list columns and filters match the journey;
- include effective time, inverse rate, source reference, lineage, lifecycle, and audit fields;
- remove generic `update`, `delete`, and `bulk_update`;
- make import a navigation operation to `/app/fx_rate/import`;
- add `replace` on Detail, navigating to `/app/fx_rate/{id}/replace`;
- keep Add Rate and Export according to granted Entity permissions.

Fully register `fx_policy` in `control.entity`, `control.entity_version`, fields, relations, and display config:

- title: transaction context;
- subtitle: derived scope label;
- list columns: Company, Book, context, effective dates, version, status;
- filters: Company, Book, context, effective dates, status;
- no generic create, update, delete, or bulk operations;
- mark it as an advanced, read-only audit entity.

## 7. Front-end structure

### 7.1 Finance Workbench

Refactor `packages/domain/finance/finance-workbench`:

```text
src/components/setup/
  SetupPageHeader.tsx
  SetupStatusBanner.tsx
  EffectivePolicyEditor.tsx
  EffectivePolicySummary.tsx
  EntityCollectionSummary.tsx
  RateRequirementList.tsx
  AdvancedSettings.tsx

src/views/currency-fx/
  TenantCurrencyFxSettingsPage.tsx
  CompanyCurrencyFxSettingsPage.tsx
  CurrencyExposureSummary.tsx
  CompanyPolicyUsageSummary.tsx
  BookPolicyOverrides.tsx
  FxResolutionTrace.tsx
```

Extend the existing `PostingRoleCoverageMatrix` with:

```text
roleCodes?: string[]
compact?: boolean
showMetrics?: boolean
```

Do not fork its mutation logic. The company page must use the existing versioned posting-role hooks and service.

Replace the broad `useCurrencyFxSetup.ts` contract with focused hooks:

- `useTenantCurrencyFxSettings`;
- `useCompanyCurrencyFxSettings`;
- `useCreateFxPolicy`;
- `useReplaceFxPolicy`;
- `useEndFxPolicy`;
- `useFxResolutionTrace`;
- `useAddFxRate`;
- `useReplaceFxRate`;
- `useValidateFxRateImport`;
- `useImportFxRates`.

All relevant query keys must be invalidated after a mutation:

- tenant FX settings;
- company FX settings;
- certification readiness;
- posting-role coverage;
- `fx_rate` Entity List data;
- `fx_policy` Entity List data.

### 7.2 Governed Entity flows

Add supported active-runtime routes:

```text
/app/[entity]/import
/app/fx_rate/[id]/replace
```

Implement `GovernedEntityImport` in the active runtime rather than importing from `packages/product-deprecated`.

The first supported adapter is `fx_rate`, with:

- CSV/XLSX upload or paste;
- column mapping;
- sample preview;
- full server dry-run;
- create/replace-by-natural-key mode;
- progress and result summary;
- downloadable error rows;
- 5,000-row request limit until asynchronous chunking is implemented.

Use the deprecated import page only as a behavioral reference. Its relay paths and update/upsert semantics must not be copied without adapting them to append-only rate replacement.

`GovernedEntityForm` should wrap the active descriptor-driven field controls for Add and Replace Rate. It must accept a command submitter so the UI can remain metadata-driven without falling back to generic table update.

### 7.3 App Router and navigation

- Change the existing tenant Currency and FX page to render `TenantCurrencyFxSettingsPage`.
- Change the existing company page to render `CompanyCurrencyFxSettingsPage`.
- Update Finance Setup labels from `FX rate workbench` to `Tenant FX settings`.
- Add direct `Manage exchange rates` links to `/app/fx_rate`.
- Keep `/app/fx_policy` out of the normal setup journey and show it only under advanced navigation.
- Preserve authentication redirects and readable route codes.

## 8. Permissions and audit

### 8.1 Permission model

Use:

| Capability | Permission |
|---|---|
| View tenant/company FX setup | `FINANCE_SETUP.VIEW` |
| Edit tenant or company policy and posting accounts | `FINANCE_SETUP.CONFIGURE` |
| View book overrides, policy history, and resolution trace | `FINANCE_SETUP.ADVANCED_CONFIGURE` |
| Add rate | Entity permission `fx_rate.create` |
| Replace rate | Entity permission `fx_rate.replace` |
| Import rates | Entity permission `fx_rate.import` |
| Export rates | Entity permission `fx_rate.export` |

Add `FINANCE_SETUP.ADVANCED_CONFIGURE` to the permission catalogue and assign it only to the intended advanced finance administrator roles.

Authorization is enforced in service routes. UI permission flags control presentation but are never the enforcement boundary.

### 8.2 Audit events

Add or split audit activity types:

```text
finance_setup.fx_tenant_policy_created
finance_setup.fx_policy_replaced
finance_setup.fx_policy_ended
finance_setup.fx_rate_created
finance_setup.fx_rate_replaced
finance_setup.fx_rates_imported
```

Audit detail includes scope, version, predecessor ID, changed field names, rate natural key, import counts, and correlation ID. Do not log complete uploaded files or sensitive request headers.

Posting-role account assignment continues to use the existing versioned audit events.

## 9. Delivery sequence

### Slice 1: Contract and lifecycle hardening

Primary files:

- `server/db/ddl/master/01c_tables_extended.sql`
- `server/db/ddl/master/03_constraints.sql`
- `server/db/ddl/master/04_indexes.sql`
- a focused `master.fx_rate` RLS contract under `server/db/ddl/master`
- `server/db/ddl/control/01v_finance_operations_setup_contract.sql`
- finance metadata seed files
- `server/packages/services/finance/services/finance-fx-policy.service.ts`
- `server/packages/services/finance/services/finance-fx-rate-import.service.ts`

Deliver:

- rate version/lineage;
- source-aware uniqueness;
- immutable rate values;
- append-only policy commands;
- fully registered read-only `fx_policy` entity;
- corrected `fx_rate` operations.

Exit criteria:

- direct active-rate edits fail;
- two active rates with different sources may coexist;
- rate replacement and policy replacement preserve history;
- generic Entity metadata exposes no destructive correction path.

### Slice 2: Read models and authorized commands

Primary files:

- `server/packages/services/finance/routes/finance-fx-setup.route.ts`
- `server/packages/services/finance/services/finance-fx-policy.service.ts`
- new focused tenant/exposure/rate-health service modules
- Finance Setup permission seeds

Deliver:

- tenant summary;
- expanded company summary;
- purpose-specific rate health;
- runtime enforcement for every enabled policy field;
- tenant/company/book policy commands;
- Add/Replace Rate commands;
- permission enforcement and stable error codes.

Exit criteria:

- every page state is representable without client-side inference;
- setup and operational health are distinct fields;
- tenant and Legal Entity scope checks cover every command.

### Slice 3: Tenant page

Primary files:

- `apps/neon/app/(shell)/finance/setup/tenant/[tenantCode]/currency-fx/page.tsx`
- Finance Workbench currency-FX views, components, and hooks
- Finance Setup navigation

Deliver:

- empty/configured/scheduled tenant states;
- basic and advanced policy editor;
- rate summary;
- company usage summary;
- links to Entity Rate maintenance and import.

Exit criteria:

- saving the default creates or replaces an append-only tenant policy;
- missing rates never change tenant setup completion;
- no custom rate table appears on the tenant page.

### Slice 4: Rate Entity maintenance

Primary files:

- `apps/neon/app/(shell)/app/[entity]`
- active runtime list/import/form packages
- `fx_rate` metadata
- FX rate service and route

Deliver:

- required list columns and filters;
- governed Add Rate;
- governed Import Rates;
- read-only detail;
- Replace Rate flow;
- export.

Exit criteria:

- all rate writes use the same domain service;
- old records remain inspectable after replacement;
- import and single-record correction produce identical lifecycle semantics.

### Slice 5: Company page and posting accounts

Primary files:

- `apps/neon/app/(shell)/finance/setup/company/[companyCode]/currency-fx/page.tsx`
- company Currency and FX components/hooks
- existing posting-role matrix and hooks
- exposure/readiness service

Deliver:

- no-exposure state;
- tenant-missing state;
- inherited/override summaries;
- compact gain/loss account matrix;
- operational rate requirements;
- Add Missing Rate prefill.

Exit criteria:

- the normal inherited path requires no policy editing;
- missing accounts are the primary company setup action;
- rate warnings remain operational attention.

### Slice 6: Advanced administration

Deliver:

- company and book override dialogs;
- return-to-tenant command;
- policy history links;
- resolution trace;
- advanced permission gating;
- read-only `/app/fx_policy`.

Exit criteria:

- no separate Company+Book route exists;
- every override transition is retained in history;
- users without advanced permission cannot call or see advanced commands.

### Slice 7: Certification, migration, and rollout

Deliver:

- adapt Finance certification to the new setup/health split;
- migration report for tenants with missing tenant defaults;
- feature-flagged navigation switch;
- observability and support runbook;
- remove the old custom `FxRateWorkbench` after parity is proven.

Exit criteria:

- existing rate and policy history remains readable;
- posting gates use deterministic service status, not UI state;
- rollback can restore old navigation without rolling back data migrations.

## 10. Test plan

### 10.1 Database contract tests

- `fx_rate` has version and tenant-scoped predecessor FK.
- Active uniqueness includes source.
- business-field updates to an existing rate are rejected.
- cross-tenant rate and policy lineage is rejected.
- `fx_policy` equal-scope/equal-priority overlaps remain rejected.
- Entity metadata contains `fx_rate.replace` and no update/delete/bulk-update.
- `fx_policy` is registered as read-only.
- RLS is enabled and forced for both stores.

### 10.2 Service integration tests

- Tenant default create, future replacement, same-day replacement, and conflict.
- Company override precedence over tenant; book override precedence over company.
- Return to tenant default preserves the ended override.
- Optimistic-concurrency mismatch returns `409`.
- Multiple source rates coexist and preferred source wins.
- Direct, inverse, triangulated, stale, missing, and identity resolution.
- Add Rate and Replace Rate preserve lineage and audit.
- Import validates currencies, rate types, sources, duplicates, and size.
- Import replaces only the matching natural key including source.
- Exposure discovery covers books, bank accounts, and payment policies.
- No-exposure Company reports setup not required.
- Period End health uses the latest completed fiscal-period end.
- Missing rates do not change tenant setup completion.
- Posting account readiness evaluates only required FX roles/books.
- Tenant, Legal Entity, Company, Book, and permission boundaries.

### 10.3 UI component tests

- Tenant empty, configured, scheduled, attention, and viewer-only states.
- Advanced tenant fields are collapsed by default.
- Company no-exposure, no-tenant-default, inherited, overridden, accounts-missing, and rate-attention states.
- Compact posting matrix shows only `fx_gain` and `fx_loss`.
- Return to tenant default requires confirmation and refreshes effective policy.
- Add Missing Rate carries pair, type, purpose, and effective date.
- Record detail has no edit/delete action.
- Advanced controls are absent without permission.
- Loading, empty, error, retry, and mutation-conflict behavior.

### 10.4 End-to-end journeys

1. Configure a tenant default and observe setup become complete with no rates loaded.
2. Import tenant rates and inspect one read-only rate record.
3. Replace a rate and verify both old and new records and lineage.
4. Open a Company with no FX exposure and perform no setup.
5. Open an exposed Company, inherit the tenant policy, and assign missing gain/loss accounts.
6. Add a missing rate from the Company page and observe tenant-wide rate health refresh.
7. Create a Company override, replace it, then return to the tenant default.
8. Create a book override from Advanced and inspect it in `/app/fx_policy`.
9. Verify that a normal finance administrator cannot access book overrides or resolution trace.
10. Switch between Companies and confirm policies and accounts are never leaked across scope.

## 11. Migration and rollout

### 11.1 Data migration

- Backfill existing rates with `version_no = 1`.
- Leave `supersedes_id` null where historical lineage cannot be reconstructed.
- Rebuild the active-rate unique index to include source after detecting and reporting any pre-existing conflicts.
- Treat existing policy rows as version 1 unless their lineage is already populated.
- Do not invent a tenant default from dissimilar Company policies.
- Provide a dry-run report:
  - tenants with an active tenant default;
  - tenants with only Company policies;
  - tenants with no policies;
  - tenants with overlapping or ambiguous policy candidates;
  - active-rate keys that will conflict under the new index.

If every active Company policy in a tenant is identical, the migration tool may offer an explicit consolidation option, but it must not silently create or retire policies.

### 11.2 Feature rollout

Use a tenant feature flag such as `finance.currency_fx_journey_v2`.

Roll out in this order:

1. database and service compatibility;
2. read-only new tenant/company pages for internal users;
3. policy and posting-account commands;
4. Rate Entity add/replace/import;
5. advanced overrides and trace;
6. default-on navigation;
7. remove the custom Rate Workbench and in-place admin PATCH.

Monitor:

- policy/rate command failure codes;
- unresolved rate requirement count;
- import validation and commit counts;
- optimistic-concurrency conflicts;
- resolution method distribution;
- stale/missing rate findings;
- cross-scope authorization denials;
- page/API latency for multi-company tenants.

## 12. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Existing generic or Platform Admin APIs bypass append-only rules | Add database immutability guard and route every writer through the domain service |
| Tenant summary becomes expensive across many Companies | Batch exposure queries, deduplicate requirements before resolution, and cache the computed summary briefly |
| Period End rates are incorrectly judged against today's date | Resolve health using the latest completed fiscal-period end and return the evaluated date |
| Optional posting roles incorrectly block setup | Filter to `fx_gain`/`fx_loss` and compute required cells per exposed book |
| Users create unnecessary Company overrides | Show inherited summary by default and keep override creation secondary |
| Import reintroduces update/upsert semantics | Define import mode as create or append-only replace by natural key |
| Policy history is incomplete for legacy in-place edits | Preserve available rows/audit, start explicit lineage at migration, and do not fabricate predecessors |
| Advanced administration leaks into the normal journey | Gate both server commands and UI navigation with the advanced permission |

## 13. Definition of done

The work is complete when:

1. The tenant page configures policy only and links to canonical rate maintenance.
2. `/app/fx_rate` is the sole normal rate-maintenance list.
3. Rate records are read-only and corrections are append-only replacements.
4. The company page defaults to inherited policy summary plus gain/loss account assignment.
5. No-exposure Companies require no FX setup.
6. Missing/stale rates are reported as operational health, not tenant setup incompletion.
7. Company and book overrides preserve full history and are advanced actions.
8. `/app/fx_policy` is a read-only advanced audit surface.
9. Every mutation is tenant-safe, permission-checked, audited, and concurrency-aware.
10. The database, service, UI, and end-to-end tests above pass.

## 14. Explicitly out of scope

- A separate Company+Book settings page.
- Company-specific copies of exchange rates.
- Automatic rate-provider scheduling or credential management.
- Revaluation-run execution UI.
- Redesign of the shared currency catalogue.
- Organization tax, payments, or banking journeys beyond the exposure data required by this page.
- Reconstructing historical predecessors that were never stored.
