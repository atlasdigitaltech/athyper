# Finance Setup Configuration Design

Status: Proposed baseline

Last reviewed: 2026-07-20

Applies to: Neon Finance Setup, Finance Entity App, Finance Workbenches

## 1. Purpose

This document defines the landed information architecture and ownership model for Finance Setup. It is based on a scan of the existing DDL in the `master`, `control`, `document`, `ledger`, and `governance` schemas.

The design preserves the existing database model wherever it is sound. New tables should be introduced only when an explicit requirement cannot be represented safely through the current model.

The governing principles are:

```text
Definitions are tenant-owned.
Assignments determine company usage.
Controls determine company posting behaviour.
Legal Entity provides statutory context and an authorization boundary.
Governance certifies readiness and recurring finance operations.
```

## 2. Scope model

### 2.1 Tenant

The Tenant owns reusable finance definitions:

- Charts of Accounts
- GL Accounts within each Chart of Accounts
- Ledger Books
- Fiscal Calendar definitions
- Dimension types and reusable values
- Accounting Profiles and posting templates
- Posting-role vocabulary
- Tax definitions, rates, and groups
- Payment Methods and Payment Terms
- Bank formats and interface definitions
- Exchange rates

Tenant isolation remains mandatory in every phase.

### 2.2 Legal Entity

The Legal Entity represents the statutory body and authorization boundary. It owns or supplies:

- Legal identity and registration
- Country and regulatory framework
- Functional and reporting currencies
- Tax residence and registration context
- Consolidation hierarchy
- Optional shared defaults for its Company Codes

The Legal Entity should not duplicate every tenant and company configuration. Use it only where statutory meaning or inherited policy genuinely exists.

### 2.3 Company Code

The Company Code is the accounting, posting, and balancing unit. It owns:

- Chart of Accounts assignments
- Ledger Book assignments and default book
- Fiscal Calendar assignment and generated periods
- GL Account controls
- Posting-role-to-account assignments by book
- Dimension policies and defaults
- Payment Method policies
- House Banks and bank-account links
- Tax applicability and account determination
- Opening balances
- Posting readiness and close cycles

### 2.4 Book

Book-specific configuration includes:

- Book-period status
- Posting-role account mapping
- Accounting Profile book rules
- Cross-book posting rules
- Book-specific close and certification evidence

## 3. User experience architecture

Finance Setup should provide one central landing experience, but configuration should be split into focused workspaces.

```text
Finance Setup
├── Organization & Currency
├── Chart of Accounts & GL Accounts
├── Books & Ledgers
├── Fiscal Calendar & Periods
├── Dimensions
├── Account Determination
├── Accounting Profiles
├── Currency & FX
├── Tax
├── Payments & Settlement
├── Banking & Treasury
├── Document Controls
├── Opening Balances
├── Readiness & Close Governance
└── Intercompany (when enabled)
```

The landing page provides scope selection, progress, readiness, issues, and navigation. It should not become one large editor or a long horizontal tab strip.

Recommended company routes:

```text
/finance/setup
/finance/setup/company/{companyCode}
/finance/setup/company/{companyCode}/foundation
/finance/setup/company/{companyCode}/accounting-controls
/finance/setup/company/{companyCode}/tax-payments
/finance/setup/company/{companyCode}/banking
```

Tenant definitions should open through canonical Entity List and Entity Record views. Company assignments, aggregate configuration, and governed commands remain in Finance Setup.

## 4. Organization and currency foundation

This is the first setup domain because all posting depends on company, country, currency, book, and business-date context.

| Configuration | Scope | Existing model |
|---|---|---|
| Legal Entity statutory profile | Legal Entity | `master.legal_entity` |
| Legal Entity functional/reporting currency | Legal Entity | `master.legal_entity` |
| Company Code profile | Company | `master.company_code` |
| Company functional currency | Company | `master.company_code.functional_currency` |
| Company reporting/group currency | Company/Legal Entity | `master.company_code`, `master.legal_entity` |
| Country and regulatory framework | Legal Entity/Company | Existing columns |
| Time zone, locale, and business date | Company | `master.company_code` |

Required readiness checks:

- Tenant context is valid.
- Legal Entity is active.
- Company Code is active and belongs to the active Legal Entity.
- Functional currency is configured.
- Reporting currency is resolvable.
- Country, time zone, and business-date context are valid.

## 5. Chart of Accounts and GL Accounts

### 5.1 Ownership

| Object | Scope | UI |
|---|---|---|
| Chart of Accounts | Tenant | Entity App CRUD |
| GL Account | Tenant/Chart | Entity App CRUD and Record |
| Company Chart assignment | Company | Custom assignment panel |
| Company GL controls | Company | Custom grid/editor |

Existing models:

- `master.chart_of_account`
- `master.gl_account`
- `master.company_code_chart_assignment`
- `master.company_code_gl_account`
- `master.mv_company_postable_account`

### 5.2 Canonical rules

- One GL Account belongs to exactly one Chart of Accounts.
- The same account code may exist as separate records in different charts.
- A Company Code can have operating, local, group, and reporting chart assignments.
- The active primary operating chart determines normal posting-account availability.
- Company GL controls determine posting permission, manual/automatic restrictions, required dimensions, reconciliation type, and defaults.
- The final active primary operating assignment cannot be deactivated without a replacement.
- Assignment changes refresh the company-postable-account projection and readiness state.

### 5.3 Cross-chart mapping gap

The DDL supports multiple chart assignments but does not contain a normalized, effective-dated GL-account-to-GL-account mapping table.

Current JSON mappings exist in:

- `control.book_posting_rule.account_mapping`
- `control.acct_profile_book_rule.account_mapping`

If governed Local-to-Group or statutory-to-reporting account mapping becomes a requirement, introduce a canonical mapping relation only after the mapping grain, direction, purpose, versioning, and effectivity rules are agreed.

## 6. Books and ledgers

| Configuration | Scope | Existing model |
|---|---|---|
| Ledger Book definition | Tenant | `master.ledger_book` |
| Company Book assignment | Company | `master.company_code_book_assignment` |
| Company default book | Company | `master.company_code.default_ledger_book_id` |
| Cross-book posting rules | Company/Book | `control.book_posting_rule` |
| Cross-book execution trace | Runtime | `document.book_posting_derivation` |

Required behavior:

- A Company Code may use multiple active books.
- A book must have an active, effective company assignment before it can be selected.
- The company default book is stored in `master.company_code.default_ledger_book_id`.
- Book status and assignment status must be presented separately.
- Posting requires both the fiscal-period gate and the selected book-period gate.
- Cross-book derivations must be idempotent, traceable, loop-safe, and monitored.

### 6.1 Known primary-book defect

The current `setPrimaryBook()` implementation attempts to use `company_code_id` on `master.ledger_book`. That column does not exist. The action must be corrected to update the company default-book contract and verify an active company-book assignment.

## 7. Fiscal Calendar and periods

| Configuration | Scope | Existing model |
|---|---|---|
| Fiscal Calendar definition | Tenant | `control.fiscal_calendar_config` |
| Period-construction rules | Calendar | `control.fiscal_calendar_period_rule` |
| Company assignment | Company | `control.company_fiscal_calendar_assignment` |
| Generated fiscal periods | Company | `master.fiscal_period` |
| Book-period status | Company/Book | `governance.book_period_status` |

Supported calendar patterns include monthly, 4-4-5, 4-5-4, 5-4-4, thirteen-period, and custom calendars.

The workspace must support:

- Calendar design and versioning
- Period preview
- Company assignment
- Generation and regeneration safeguards
- Opening, normal, adjustment, and closing periods
- Fiscal-period and book-period commands
- Open, soft-close, and hard-close state transitions

## 8. Dimensions

| Configuration | Scope | Existing model |
|---|---|---|
| Dimension types | Tenant | `master.dimension_type` |
| Dimension values | Tenant or Company | `master.dimension_value` |
| Dimension sets | Tenant | `master.dimension_set` |
| Dimension-set items | Set | `master.dimension_set_item` |
| Company defaults | Company | `master.company_code_dimension_default` |
| Mandatory/optional policies | Tenant or Company | `control.dimension_policy` |
| Allowed values | Policy | `control.dimension_policy_allowed_value` |
| Profile derivation rules | Accounting Profile | `control.acct_profile_dimension_rule` |

The aggregate editor must cover:

- System dimensions such as Cost Center, Profit Center, and Project
- Standard and custom dimensions
- Tenant-global versus company-specific values
- Hierarchy and effective dates
- Posting, budgeting, and planning eligibility
- Required, optional, forbidden, fixed, inherited, and derived behaviors
- Account, book, subledger, and document-type scope filters

## 9. Account determination and posting roles

| Configuration | Scope | Existing model |
|---|---|---|
| Posting-role vocabulary | Platform/Tenant | `control.lookup_value` domain `finance.posting_role` |
| Compatibility aliases | Global/Tenant | `control.posting_role_alias` |
| Role-to-account mapping | Company/Book | `control.posting_role_account_map` |

The Account Determination workspace includes:

- Posting Role catalog
- Company and Book account mappings
- Effective dates and priority
- Mandatory-role coverage
- Resolution trace
- Missing and incompatible account diagnostics

Posting roles cover General Ledger, AP, AR, Tax, Payments, Banking, FX, Inventory, Fixed Assets, Intercompany, Clearing, and Suspense.

## 10. Accounting profiles and posting templates

Accounting Profiles define how business events create journal entries. They require one governed aggregate editor.

Existing models:

- `master.accounting_profile`
- `control.acct_profile_config`
- `control.acct_profile_event`
- `control.acct_profile_entry_template`
- `control.acct_profile_book_rule`
- `control.acct_profile_dimension_rule`
- `control.acct_profile_commitment_config`
- `control.acct_profile_revenue_config`
- `control.acct_profile_settlement_config`
- `control.transaction_event_catalog`
- `control.transaction_flow_template`

Editor sections:

```text
Accounting Profile
├── Profile Configuration
├── Business Events
├── Entry Templates
├── Book Rules
├── Posting Roles
├── Dimension Derivation
├── Commitment Rules
├── Revenue and COGS Rules
└── Settlement Rules
```

## 11. Currency and FX

| Configuration | Scope | Existing model |
|---|---|---|
| Currency catalog | Platform | `shared.currency` |
| Exchange rates | Tenant | `master.fx_rate` |
| Revaluation runs | Company/Book/Period | `document.fx_revaluation_run` |
| Revaluation lines | Runtime | `ledger.fx_revaluation_line` |
| FX gain/loss accounts | Company/Book | Posting-role mappings |

Supported rate types include Spot, Period Average, Period End, Budget, Contracted, and Historical.

The configuration experience should cover enabled currencies, exchange rates, rate types, revaluation policy, and FX posting-role coverage.

### 11.1 FX policy gap

The rate store is comprehensive, but no clear governed model was identified for preferred source, source priority, maximum rate age, missing-rate fallback, and manual-override approval. Settle this contract before automated FX interfaces are enabled.

## 12. Tax

Existing setup models:

- `master.tax_jurisdiction`
- `master.tax_type`
- `control.tax_rate_schedule`
- `control.tax_group`
- `control.tax_group_component`
- `control.tax_resolution_rule`
- `control.wht_threshold_config`
- `control.rounding_rule`

The Tax aggregate editor includes:

- Jurisdictions and registrations
- Tax types
- Rate schedules and effectivity
- Tax groups and components
- Purchase, sale, payment, import, and export direction
- Recoverability
- Reverse charge
- Withholding-tax thresholds
- Rounding
- Tax account determination through posting roles

`ledger.tax_calculation` and `ledger.tax_credit_movement` are runtime evidence and do not belong in setup CRUD.

## 13. Payments and settlement

### 13.1 Tenant definitions

- `master.payment_method`
- `master.payment_term`
- `master.payment_term_clause`
- `master.payment_term_discount_tier`
- `master.holiday_calendar`
- `master.holiday_calendar_day`
- `control.bank_format_rule`
- `control.bank_interface_profile`

### 13.2 Company policies

- `control.payment_method_company_policy`
- `control.payment_method_interface_binding`
- `control.payment_settlement_rule`

Company policy controls eligibility, direction, currency, preferred House Bank, default method, interface routing, and settlement posting roles.

### 13.3 Payment Term company-policy decision

Payment Terms are currently assigned through company-specific Supplier and Customer profiles. No general `payment_term_company_policy` was identified.

Retain the existing model unless Finance requires company-wide eligible terms, default purchase/sales terms, or prohibited terms. Add a company policy only when one of those requirements is confirmed.

## 14. Banking and treasury

The operational chain is:

```text
Bank Party
→ Physical Bank Account
→ Company Bank-account Link
→ House Bank Configuration
→ Currency-compatible Cash GL Account
→ Payment Interface
→ Bank Statement
→ Reconciliation
```

Setup models:

- `master.bank_party`
- `master.bank_account`
- `master.bank_account_link`
- `master.bank_account_house_config`
- `control.bank_format_rule`
- `control.bank_interface_profile`
- `control.payment_method_interface_binding`

Operational models, not setup CRUD:

- `document.bank_statement`
- `document.bank_statement_line`
- `document.bank_recon_case`
- `document.bank_recon_case_line`

House Bank GL selection must be filtered to company-valid posting accounts from the active operating chart. It must validate company GL controls, reconciliation classification, posting permission, and currency compatibility.

One local-currency and one foreign-currency physical bank account require two House Bank configurations and two currency-compatible cash GL Accounts.

## 15. Document controls

Existing models:

- `control.entity_numbering_config`
- `control.entity_numbering_counter`

Finance Setup should configure numbering for Journal Entries, Purchase Invoices, Sales Invoices, Payments, Bank Statements, Credit/Debit Notes, and Opening-Balance journals.

The counter is runtime state and should be read-only except through a governed correction command.

### 15.1 Recurring-journal gap

A first-class recurring-journal template table was not found. Monthly-close governance refers to recurring accrual processing, but governance tasks do not replace recurring-entry configuration. Introduce a recurring-journal model only when that product requirement is activated.

## 16. Opening balances

Opening balances remain a governed workflow rather than a master table:

```text
Import Request and Chunks
→ Period-0 Draft Journals
→ Validation
→ Trial-Balance Reconciliation
→ Error Correction and Retry
→ Evidence Pack
→ Certification
→ Period-0 Close
```

Reuse the existing import infrastructure, journal documents, GL balances, and governance model. Do not introduce an opening-balance master table.

## 17. Readiness and close governance

Existing governance models:

- `governance.cycle_type`
- `governance.cycle_phase`
- `governance.cycle_task_category`
- `governance.cycle_task_template`
- `governance.cycle_task_dependency`
- `governance.cycle_run`
- `governance.cycle_task`
- `governance.cycle_deviation`
- `governance.cycle_certification`
- `governance.cycle_cross_dependency`
- `governance.cycle_carryforward_rule`
- `governance.report_pack`
- `governance.book_period_status`

Governed workspaces:

- Finance Setup Readiness
- Opening Balance Migration
- Monthly Close
- Year-End Close

Finance Setup readiness verifies Organization, Currency, Books, Calendar, Periods, Chart assignment, GL controls, Posting Roles, House Banks, Payment Methods, Tax, Opening Balances, Test posting/reversal, deviations, and final certification.

An open period is not by itself proof of posting readiness. The UI must distinguish selected-book period state from overall certified posting eligibility.

## 18. Intercompany

Show this domain only for tenants with multiple Company Codes and intercompany enabled.

Existing models:

- `master.intercompany_trading_pair`
- `document.intercompany_agreement`
- `document.intercompany_transaction`
- `document.netting_batch`
- `document.ic_elimination`
- `ledger.consolidation_elimination`

Configuration includes trading pairs, counterparty AP/AR profiles, settlement mode, mirror automation, netting, elimination rules, and posting-role coverage.

## 19. Module-specific setup outside the core journey

The following DDL families are substantial but should remain separate module setup workspaces linked from Finance Setup.

### Fixed Assets

- Asset Classes
- Asset Books
- Asset-class/Book policies
- Capitalization and depreciation controls

### Budgeting and Planning

- Budget Profiles and Allocations
- Budget-check configuration
- Planning Models and Drivers
- Forecast/Budget bridge

### Inventory Accounting

- Commodity and inventory policies
- Inventory valuation
- COGS and variance account determination

### Consolidation and Reporting

- Consolidation and elimination execution
- Reporting currencies
- Governance report packs

## 20. Parked scope

The following work is explicitly parked:

```text
Organization details
Addresses & Contacts
```

The existing canonical Address and Contact DDL remains in place. Future work can provide a simplified inheritance experience for the common single-Tenant, single-Legal-Entity, single-Company scenario and controlled overrides for multi-company tenants.

## 21. Implementation priority

### Phase A — Core posting readiness

1. Organization and currencies
2. Chart of Accounts and GL Accounts
3. Company Chart assignment
4. Ledger Books, Company assignment, and default book correction
5. Fiscal Calendar and periods
6. Company GL controls
7. Posting-role account mappings
8. House Banks
9. Opening balances
10. Readiness certification

### Phase B — Operational accounting readiness

11. Dimensions and policies
12. Accounting Profiles and templates
13. Tax configuration
14. Payments, terms, interfaces, and settlement
15. Currency and FX
16. Document numbering
17. Cross-book posting

### Phase C — Conditional and extended modules

18. Intercompany
19. Fixed Assets
20. Budgeting and Planning
21. Inventory Accounting
22. Consolidation and advanced reporting

## 22. UI implementation rules

- Use Entity App List and Record views for simple tenant masters.
- Use aggregate editors for Fiscal Calendars, Accounting Profiles, Dimension Policies, Tax Groups and Rate Schedules, and Payment/Bank Interface policies.
- Use custom company assignment panels for Chart and Ledger Book assignments.
- Use governed workbenches for Opening Balances, Posting Readiness, Monthly Close, Year-End Close, Posting Role Coverage, and Cross-book diagnostics.
- Preserve Tenant, Legal Entity, Company Code, and Book context in URLs and API payloads.
- Never treat a URL Company Code as authorization.
- Continue enforcing tenant isolation while detailed Phase 3 permission controls are parked.
- Prefer activation, deactivation, retirement, and effective dating over destructive deletion after financial use.
- Recalculate readiness and write audit evidence after material configuration changes.

## 23. Final design decision

The current DDL is comprehensive and should be reused. The remaining work is primarily:

- Scope-aware information architecture
- Canonical Entity App metadata
- Governed aggregate editors
- Company assignment command APIs
- Readiness integration
- Audit evidence
- Correction of specific contract defects

No broad Finance DDL rewrite is recommended.
