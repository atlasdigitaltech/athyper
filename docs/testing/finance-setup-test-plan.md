# Finance Setup Test Plan

## Purpose

This plan covers the Finance Setup experience in Neon, the API calls made by
each setup surface, authorization and scope enforcement, and the setup versus
operational-health distinction.

Application base URL: `https://neon.athyper.local`

Use these placeholders throughout the plan:

- `{tenantCode}`: tenant code, for example `ACME`.
- `{companyCode}`: company code, for example `MY01`.
- `{leCode}`: legal-entity code.
- `{policyId}`, `{rateId}`, and `{bookId}`: IDs returned from the API.

Browser-facing APIs use `https://neon.athyper.local/api/...`. Neon relays them
to the runtime API; testers should test the Neon URL rather than an internal
runtime address.

## Test users and prerequisite data

Create or identify these users:

| User | Required permissions | Intended test coverage |
| --- | --- | --- |
| Finance Admin | All Finance Setup permissions | Full positive-path coverage |
| Finance Configurator | `FINANCE_SETUP.VIEW`, `FINANCE_SETUP.CONFIGURE` | Normal setup commands |
| FX Advanced Admin | Configurator permissions plus `FINANCE_SETUP.ADVANCED_CONFIGURE` | Company/book overrides and resolution trace |
| Finance Viewer | `FINANCE_SETUP.VIEW` only | Read-only behavior |
| Restricted Configurator | Configurator permission restricted to one company | Company-scope enforcement |
| No Finance Permission | No Finance Setup permission | Authorization-negative tests |

Prepare a tenant with two legal entities, each with at least one company. One
company should be fully configured and one deliberately incomplete. The test
data should include an operating chart, ledger book, fiscal calendar, GL
accounts, posting roles, a foreign-currency exposure, an FX rate, a payment
term, tax group, house bank, and bank account. Keep at least one missing item
in each domain to verify warnings and blockers.

## Application URL inventory

| Area | URL | Test objective |
| --- | --- | --- |
| Finance Setup landing | `/finance/setup` | Scope selection and Finance Setup domains |
| Tenant roll-up | `/finance/setup/tenant/{tenantCode}` | Tenant readiness and unresolved items |
| Legal entity roll-up | `/finance/setup/legal-entity/{leCode}` | Legal-entity readiness roll-up |
| Company hub | `/finance/setup/company/{companyCode}` | Overall readiness, domain links, and certification |
| Foundation default | `/finance/setup/company/{companyCode}/foundation` | Redirect to Organization foundation |
| Foundation: Organization | `/finance/setup/company/{companyCode}/foundation/organization` | Company context and organization setup |
| Foundation: Accounts | `/finance/setup/company/{companyCode}/foundation/accounts` | Chart, accounts, and GL controls |
| Foundation: Books | `/finance/setup/company/{companyCode}/foundation/books` | Book assignments and defaults |
| Foundation: Calendar | `/finance/setup/company/{companyCode}/foundation/calendar` | Fiscal calendar and periods |
| Configure workspace | `/finance/setup/company/{companyCode}/configure` | Posting-role, chart, book, and calendar configuration |
| Explore workspace | `/finance/setup/company/{companyCode}/explore` | Read-only chart, account, book, and bank exploration |
| Operate workspace | `/finance/setup/company/{companyCode}/operate` | Operational blockers and reconciliation signals |
| Tenant Currency & FX | `/finance/setup/tenant/{tenantCode}/currency-fx` | Tenant FX policy and rate health |
| Company Currency & FX | `/finance/setup/company/{companyCode}/currency-fx` | Inheritance, posting accounts, rates, and overrides |
| FX rate entity | `/app/fx_rate` | Governed rate list |
| Add FX rate | `/app/fx_rate/new` | Governed single-rate creation |
| Import FX rates | `/app/fx_rate/import` | Import validation and import |
| Export FX rates | `/app/fx_rate/export` | Rate export |
| Tenant tax definitions | `/finance/setup/tenant/{tenantCode}/tax` | Tax groups and WHT thresholds |
| Company tax | `/finance/setup/company/{companyCode}/tax` | Registration, simulation, and coverage |
| Tenant payment terms | `/finance/setup/tenant/{tenantCode}/payment-terms` | Payment-term definitions |
| Company payments | `/finance/setup/company/{companyCode}/payments` | Payment policies, interfaces, and settlement rules |
| Company banking | `/finance/setup/company/{companyCode}/banking` | House banks, links, verification, and interfaces |
| Certification panel | `/finance/setup/company/{companyCode}#certification-readiness` | Certification readiness and operational attention |

## API inventory

### Context, readiness, and navigation

| API | Method | Expected result |
| --- | --- | --- |
| `/api/finance/master/scope-options` | `GET` | Active tenant, legal entity, accessible companies, and default company |
| `/api/finance/setup/readiness?scopeType=tenant&scopeCode={tenantCode}` | `GET` | Tenant readiness roll-up |
| `/api/finance/setup/readiness?scopeType=legal_entity&scopeCode={leCode}` | `GET` | Legal-entity readiness roll-up |
| `/api/finance/setup/readiness?scopeType=company&scopeCode={companyCode}` | `GET` | Company-hub readiness |
| `/api/finance/setup/conflicts?scopeType=company&scopeCode={companyCode}` | `GET` | Company setup conflicts and blockers |
| `/api/finance/setup/certification-readiness?scopeType=company&scopeCode={companyCode}` | `GET` | Four-domain certification outcome |
| `/api/finance/setup/posting-preview?...` | `GET` | Posting eligibility for company, period, and account |

`/api/finance/master/scope-options` must return `200` after login. It is the
primary smoke test because Finance Setup uses it to resolve scope.

### Foundation and company configuration

| API group | Key APIs |
| --- | --- |
| Foundation summary | `GET /api/finance/setup/company/{companyCode}/foundation` |
| Explore | `GET /api/finance/setup/explore/chart-tree`, `gl-accounts`, `books`, `house-banks` |
| Configure reads | `GET /api/finance/setup/configure/gl-controls`, `chart-assignments`, `chart-options`, `book-assignments`, `book-options`, `fiscal-calendar`, `posting-role-coverage` |
| Calendar | `GET /api/finance/setup/configure/fiscal-calendar/period-matrix`, `GET .../{calendarId}/preview`, `POST /api/finance/setup/company/{companyCode}/fiscal-periods/{fiscalYear}/generate` |
| GL controls | `POST /api/finance/setup/company/{companyCode}/gl-controls`, `PATCH` or `DELETE .../gl-controls/{controlId}` |
| Chart assignments | `POST /api/finance/setup/company/{companyCode}/chart-assignments`, `PUT` or `DELETE .../{assignmentId}`, `POST .../{assignmentId}/set-primary` |
| Book assignments | `POST /api/finance/setup/company/{companyCode}/book-assignments`, `PUT` or `DELETE .../{assignmentId}`, `POST .../{bookId}/set-default` |
| Posting roles | `GET /api/finance/setup/configure/posting-role-resolution-trace`; create, update, and delete through `/api/finance/setup/mutations/posting-role-account-map` |

### Currency and FX

| API | Method | Test purpose |
| --- | --- | --- |
| `/api/finance/setup/tenant/{tenantCode}/fx` | `GET` | Tenant policy, rate, and usage summary |
| `/api/finance/setup/company/{companyCode}/fx` | `GET` | Company inheritance, readiness, and FX health |
| `/api/finance/setup/tenant/{tenantCode}/fx/policies` | `POST` | Create tenant default policy |
| `/api/finance/setup/tenant/{tenantCode}/fx/policies/{policyId}/replace` | `POST` | Replace policy while preserving history |
| `/api/finance/setup/company/{companyCode}/fx/overrides` | `POST` | Create company override |
| `/api/finance/setup/company/{companyCode}/fx/overrides/{policyId}/replace` | `POST` | Replace company override |
| `/api/finance/setup/company/{companyCode}/fx/overrides/{policyId}/end` | `POST` | End a company override |
| `/api/finance/setup/company/{companyCode}/fx/book-overrides` | `POST` | Advanced company/book override |
| `/api/finance/setup/company/{companyCode}/fx/resolution-trace` | `GET` | Explain resolved policy and rate |
| `/api/finance/setup/tenant/{tenantCode}/fx/rates` | `GET`, `POST` | List and add rates |
| `/api/finance/setup/tenant/{tenantCode}/fx/rates/{rateId}` | `GET` | Rate detail and lineage |
| `/api/finance/setup/tenant/{tenantCode}/fx/rates/{rateId}/replace` | `POST` | Replace a rate; do not edit it in place |
| `/api/finance/setup/tenant/{tenantCode}/fx/rates/imports/validate` | `POST` | Validate import rows |
| `/api/finance/setup/tenant/{tenantCode}/fx/rates/imports` | `POST` | Import rates |
| `/api/finance/setup/tenant/{tenantCode}/fx/rates/export` | `GET` | Export rates |

### Tax, payments, and banking

| Domain | APIs |
| --- | --- |
| Tax | `GET /api/finance/setup/tenant/{tenantCode}/tax/groups`; `POST .../tax/groups/versions`; `POST .../tax/wht-thresholds`; `GET /api/finance/setup/company/{companyCode}/tax`; `POST .../tax/registrations`; `POST .../tax/simulate` |
| Payments | `GET` and `POST /api/finance/setup/tenant/{tenantCode}/payment-terms`; `GET /api/finance/setup/company/{companyCode}/payments`; `POST .../payments/policies`, `interface-bindings`, `interface-trace`, and `settlement-rules` |
| Banking | `GET /api/finance/setup/company/{companyCode}/banking`; `POST .../house-banks`; `POST .../house-banks/{linkId}/end-link`; `POST .../bank-accounts/{bankAccountId}/verify`; `POST /api/finance/setup/bank-interfaces/{profileId}/connection:test` |

## Functional test scenarios

### Scope and navigation

| ID | Scenario | Steps | Expected result |
| --- | --- | --- | --- |
| FS-001 | Login and landing | Log in as Finance Admin and open `/finance/setup`. | `scope-options` returns `200`; tenant and permitted companies appear. |
| FS-002 | No session | Open a Finance Setup URL while logged out. | Redirect to login; no sensitive data is returned. |
| FS-003 | Tenant isolation | Change the URL to another tenant code. | Page/API returns `404` or scope-denied; no cross-tenant data. |
| FS-004 | Legal-entity isolation | Select Legal Entity A and access a Company from Legal Entity B. | Company route/API is denied or returns `404`. |
| FS-005 | Restricted company access | Use Restricted Configurator on permitted and unpermitted company URLs. | Permitted company works; the other is denied. |
| FS-006 | Deep links | Directly open every applicable URL in the inventory. | Correct page loads; login preserves the original destination. |

### Foundation and posting readiness

| ID | Scenario | Steps | Expected result |
| --- | --- | --- | --- |
| FS-010 | Foundation summary | Open Foundation Organization. | Legal entity, functional currency, and status are correct. |
| FS-011 | Chart assignment | Add an operating chart, set it primary, and refresh. | One primary chart is visible and persists. |
| FS-012 | GL control lifecycle | Add, edit, then remove a GL control. | UI and API reflect each transition; validation is actionable. |
| FS-013 | Book assignment | Assign a book and set it default. | Default appears across Foundation/Configure views after refresh. |
| FS-014 | Fiscal calendar | Preview calendar, assign it, and generate periods. | Period matrix matches expected dates; invalid/duplicate generation is rejected safely. |
| FS-015 | Posting-role coverage | Leave a required posting role unmapped, then map it. | Initial state is a setup blocker; blocker clears after mapping. |
| FS-016 | Posting preview | Call preview for valid and incomplete setup. | Valid setup is eligible; incomplete setup returns deterministic blockers. |
| FS-017 | Conflict inbox | Create a known conflict or incomplete record, then resolve it. | Conflict appears in Company Hub and `/conflicts`, then clears on resolution. |

### Tenant Currency and FX

| ID | Scenario | Steps | Expected result |
| --- | --- | --- | --- |
| FS-020 | Empty tenant state | Use a tenant without an FX default. | Tenant page presents empty state and Create Default action. |
| FS-021 | Create tenant policy | Save a basic default policy. | `POST .../fx/policies` succeeds and summary updates. |
| FS-022 | Advanced policy | Save permitted advanced policy fields. | Fields persist and affect resolution. |
| FS-023 | Policy replacement history | Replace policy using returned `policyId`. | New policy is effective; prior version remains inspectable. |
| FS-024 | Rate health separate from setup | Remove/expire a needed rate after a valid policy exists. | Policy remains configured; rate is operational attention, not setup failure. |
| FS-025 | Source-aware uniqueness | Add the same pair/date/type from two distinct sources. | Source-distinct active rates can coexist where contract permits. |
| FS-026 | Rate immutability | Attempt direct generic edit of an active rate. | Edit is unavailable/rejected; only Replace Rate is allowed. |
| FS-027 | Rate replacement | Replace a rate with expected version. | New rate is current; old record and lineage remain. |
| FS-028 | Import parity | Import a correction equivalent to a single Replace Rate. | Both flows yield the same lifecycle semantics and retain prior record. |
| FS-029 | Import validation | Upload malformed, duplicate, and valid rows. | Row errors are reported; invalid import does not write unexpectedly. |
| FS-030 | Entity-navigation feature flag | Test enabled and disabled states. | Enabled opens `/app/fx_rate`; disabled returns users to tenant Currency & FX without changing data. |

### Company Currency and FX

| ID | Scenario | Steps | Expected result |
| --- | --- | --- | --- |
| FS-031 | No-exposure company | Open a company without foreign-currency exposure. | Clear no-exposure state and no false missing-rate warning. |
| FS-032 | Missing tenant policy | Open company with no tenant policy. | Tenant-missing state and tenant-page link are shown. |
| FS-033 | Normal inherited path | Configure tenant default and open company page. | Company shows inherited policy and does not require editing. |
| FS-034 | Posting account matrix | Remove FX gain/loss account mapping. | Matrix identifies missing account as primary setup action. |
| FS-035 | Operational rate warning | Configure exposure with missing rate. | Add Missing Rate prefill is available; warning remains operational attention. |
| FS-036 | Company override | Create, replace, and end override as Configurator. | Effective policy changes correctly; history remains visible. |
| FS-037 | Book override | Create, replace, and end book override as Advanced Admin. | Advanced permission is required; trace proves precedence. |
| FS-038 | Resolution trace | Request pair, rate type, date, context, and book. | Trace explains effective policy/rate and value source. |
| FS-039 | Advanced authorization | Log in as normal Configurator. | Advanced controls are hidden; direct advanced API request returns `403`. |

### Tax, payments, and banking

| ID | Scenario | Steps | Expected result |
| --- | --- | --- | --- |
| FS-040 | Tax definitions | Create tax-group version and WHT threshold. | Tenant tax page refreshes with effective version. |
| FS-041 | Tax registration and simulation | Add registration and simulate tax. | Result uses company/tax context; invalid input returns `400`. |
| FS-042 | Payment terms | Create/update a payment term. | It appears in tenant definitions and is selectable where relevant. |
| FS-043 | Payment policy and interface | Save policy/interface binding and run trace. | Routing trace reflects effective configuration. |
| FS-044 | Settlement rules | Create valid and invalid/overlapping rules. | Valid rule persists; invalid setup is rejected or flagged. |
| FS-045 | House bank lifecycle | Add bank link and end-link with effective date. | Effective state changes correctly; history is retained where applicable. |
| FS-046 | Bank account verification | Verify a company bank account. | Verification state and audit outcome are shown. |
| FS-047 | Bank-interface connection | Test a configured interface profile. | Safe test result is returned; a failure does not mark account verified. |

### Certification, authorization, and regression

| ID | Scenario | Steps | Expected result |
| --- | --- | --- | --- |
| FS-050 | Setup/health split | Leave an FX rate missing but complete required setup. | Certification is based on setup; rate issue is operational attention. |
| FS-051 | Certification blocker | Remove a required posting account. | Certification is blocked with an actionable link. |
| FS-052 | Viewer permissions | Log in as Finance Viewer. | Reads work; all mutation controls and direct mutations are denied. |
| FS-053 | No permission | Log in with no Finance permission. | Finance data and commands are denied. |
| FS-054 | Invalid parameters | Omit required path/query/body values. | API returns `400` with stable error code; no server error. |
| FS-055 | Unknown resource | Use invalid tenant/company/rate IDs. | API returns `404`; no cross-scope data is disclosed. |
| FS-056 | Refresh and navigation | Save domain changes, refresh, go back, and reopen. | Persisted state matches API; no client-only completion inference. |
| FS-057 | Browser/API consistency | Compare visible summaries with Network responses. | Values, blockers, permissions, and action availability match. |

## API validation standards

For every API scenario, validate:

- `200` or `201` only for valid, authorized requests.
- `400` for malformed input or missing required parameters.
- `401` at the browser proxy when no session exists.
- `403` for missing permission or tenant, company, or legal-entity scope violations.
- `404` for unknown or out-of-scope resources.
- No `500`, unhandled exception, or HTML error response.
- Stable `error` codes for expected failures.
- Tenant, legal-entity, and company isolation.
- A successful mutation is still visible after a full page reload.
- Audit information reflects the correct actor where it is exposed.

For FX, explicitly validate these error-code families:
`FX_PERMISSION_DENIED`, `FX_TENANT_SCOPE_DENIED`,
`FX_COMPANY_SCOPE_DENIED`, `FX_LEGAL_ENTITY_SCOPE_DENIED`, and
`FX_PAIR_REQUIRED`.

## Suggested execution order and exit criteria

1. Run scope/navigation smoke tests: FS-001 to FS-006.
2. Configure one company through Foundation: FS-010 to FS-017.
3. Configure tenant policies and rates: FS-020 to FS-030.
4. Validate inherited company FX and advanced override behavior: FS-031 to FS-039.
5. Complete Tax, Payments, and Banking: FS-040 to FS-047.
6. Run certification, authorization, and negative regression: FS-050 to FS-057.
7. Repeat critical paths with the restricted user and second legal entity.

The test cycle passes when every domain reaches its intended configured state,
incomplete setup produces deterministic actionable blockers, operational health
is distinct from setup completion, and no user can read or modify data outside
their authorized tenant, legal entity, or company scope.
