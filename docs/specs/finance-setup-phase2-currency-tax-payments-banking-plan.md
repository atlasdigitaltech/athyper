# Finance Setup Phase 2 — Currency, Tax, Payments, and Banking Implementation Plan

Status: Proposed for review

Last reviewed: 2026-07-20

Applies to: Neon Finance Setup, Finance Entity App, Finance Workbench, Finance services, metadata runtime, and Finance readiness

## 1. Objective

This plan covers the next four Finance Setup domains:

8. Currency and FX
9. Tax
10. Payments and Settlement
11. Banking and Treasury

The implementation must reuse the existing DDL wherever the business contract is already represented. New tables are justified only for requirements that cannot be expressed safely through current records, relationships, lifecycle, and effectivity.

The target operating model is:

```text
Tenant definitions
    -> Company policies and assignments
        -> Company/Book posting-role coverage
            -> Operational execution
                -> Reconciliation and governance evidence
```

## 2. Design principles

1. Canonical Entity App owns simple reusable definitions.
2. Finance Setup owns Company adoption, policy, assignment, validation, and readiness.
3. Aggregate editors own parent/child configuration that must be saved and validated together.
4. Operational records such as payments, statements, reconciliations, tax calculations, and FX revaluation runs are not setup CRUD.
5. Tenant isolation remains enforced even while detailed permissions are deferred.
6. Company Code, Legal Entity, Book, currency, and effective-date context are explicit in APIs and read models.
7. Posting setup resolves canonical posting roles to GL Accounts; module-specific configuration does not store arbitrary GL IDs when posting roles are appropriate.
8. Provider secrets never pass through generic Entity forms or ordinary JSON responses.
9. Configuration changes that affect accounting invalidate Finance Setup readiness certification.

## 3. Scope ownership

| Scope | Responsibilities in these domains |
|---|---|
| Platform | ISO currencies, countries, canonical payment/tax vocabularies, system bank formats |
| Tenant | FX rates, tax definitions, payment methods and terms, bank institutions/accounts, interface definitions |
| Legal Entity | Statutory tax identity and reporting context; future multi-registration ownership |
| Company Code | Tax applicability, payment policies, House Bank adoption, settlement rules, default routing |
| Company Code + Book | Posting-role account mappings, FX and settlement accounting, revaluation context |
| Operational | Payments, remittances, bank statements, reconciliation cases, tax evidence, FX revaluation runs |

## 4. Proposed information architecture

Do not add these domains back into one long horizontal Configure tab strip. Extend the Finance Setup journey with four focused pages.

```text
Finance Setup
├── Foundation
│   ├── Organization & Currency
│   ├── Chart of Accounts & GL Accounts
│   ├── Books & Ledgers
│   └── Fiscal Calendar & Periods
└── Financial Operations Setup
    ├── 8. Currency & FX
    ├── 9. Tax
    ├── 10. Payments & Settlement
    └── 11. Banking & Treasury
```

Recommended Company routes:

```text
/finance/setup/company/{companyCode}/operations-setup
/finance/setup/company/{companyCode}/operations-setup/currency-fx
/finance/setup/company/{companyCode}/operations-setup/tax
/finance/setup/company/{companyCode}/operations-setup/payments
/finance/setup/company/{companyCode}/operations-setup/banking
```

Recommended Tenant Definition routes:

```text
/finance/setup/tenant/{tenantCode}/definitions/currency-fx
/finance/setup/tenant/{tenantCode}/definitions/tax
/finance/setup/tenant/{tenantCode}/definitions/payments
/finance/setup/tenant/{tenantCode}/definitions/banking
```

The Tenant Definition pages are curated launchpads. Simple records open canonical Entity List/Record; aggregates open governed editors.

## 5. Existing model inventory

### 5.1 Currency and FX

| Object | Existing model | Scope | Recommended UI |
|---|---|---|---|
| Currency catalog | `shared.currency` | Platform | Read-only reference |
| FX rate | `master.fx_rate` | Tenant | Rate Workbench plus Entity Record |
| FX lookup | `master.get_fx_rate()` | Tenant runtime | Resolution-trace API |
| Revaluation run | `document.fx_revaluation_run` | Company/Book/Period | Operational Workbench |
| Revaluation line | `ledger.fx_revaluation_line` | Runtime evidence | Read-only drill-down |
| FX gain/loss accounts | `control.posting_role_account_map` | Company/Book | Posting Role Coverage Matrix |

### 5.2 Tax

| Object | Existing model | Scope | Recommended UI |
|---|---|---|---|
| Tax jurisdiction | `master.tax_jurisdiction` | Tenant | Entity App |
| Tax type | `master.tax_type` | Tenant | Entity App |
| Rate schedule | `control.tax_rate_schedule` | Tenant | Tax aggregate editor |
| Tax group | `control.tax_group` | Tenant | Tax aggregate editor |
| Group component | `control.tax_group_component` | Group child | Tax aggregate editor |
| Resolution rule | `control.tax_resolution_rule` | Tenant | Rule matrix/editor |
| WHT threshold | `control.wht_threshold_config` | Tenant | WHT policy editor |
| Rounding rule | `control.rounding_rule` | Tenant | Entity App/reference picker |
| Company tax reference | `master.company_code.tax_registration_number`, `tax_jurisdiction_id` | Company | Company Tax Profile |
| Counterparty tax profile | `master.party_tax_profile` | Business Partner | Business Partner Entity App |
| Tax calculation | `ledger.tax_calculation` | Runtime evidence | Read-only trace |
| Tax credit movement | `ledger.tax_credit_movement` | Runtime evidence | Read-only register |
| WHT certificate | `document.wht_certificate` | Runtime document | Tax Operations Workbench |

### 5.3 Payments and Settlement

| Object | Existing model | Scope | Recommended UI |
|---|---|---|---|
| Payment method | `master.payment_method` | Tenant | Entity App |
| Payment term | `master.payment_term` | Tenant | Payment Term aggregate editor |
| Payment term clause | `master.payment_term_clause` | Term child | Aggregate editor |
| Discount tier | `master.payment_term_discount_tier` | Term child | Aggregate editor |
| Holiday calendar/day | `master.holiday_calendar`, `holiday_calendar_day` | Tenant/optional Company | Aggregate editor |
| Company payment policy | `control.payment_method_company_policy` | Company | Payment Policy Matrix |
| Interface binding | `control.payment_method_interface_binding` | Tenant/optional Company | Routing editor |
| Settlement rule | `control.payment_settlement_rule` | Company/Book | Settlement Accounting editor |
| Payment entry/allocation | `document.payment_entry`, `payment_entry_allocation` | Runtime | Payment Operations Workbench |
| Remittance output | `document.payment_remittance_output` | Runtime | Read-only/output operations |
| Discount result | `document.payment_term_discount_result` | Runtime evidence | Settlement drill-down |

### 5.4 Banking and Treasury

| Object | Existing model | Scope | Recommended UI |
|---|---|---|---|
| Bank institution/branch | `master.bank_party` | Tenant | Entity App |
| Physical bank account | `master.bank_account` | Tenant | Entity App with masked values |
| Owner/Company link | `master.bank_account_link` | Tenant/Company | House Bank aggregate editor |
| House Bank finance config | `master.bank_account_house_config` | Company link | House Bank aggregate editor |
| Bank format rule | `control.bank_format_rule` | Platform/Tenant | Entity App/reference |
| Bank interface profile | `control.bank_interface_profile` | Tenant | Secure aggregate editor |
| Interface routing | `control.payment_method_interface_binding` | Tenant/Company | Payments/Banking shared editor |
| Bank statement/line | `document.bank_statement`, `bank_statement_line` | Operational | Bank Statement Workbench |
| Reconciliation case/line | `document.bank_recon_case`, `bank_recon_case_line` | Operational | Reconciliation Workbench |
| Planning scenario/line | `document.planning_scenario`, `document.planning_scenario_line` | Versioned planning document | Treasury Operations, later slice |

## 6. Confirmed gaps and required decisions

### 6.1 FX policy gap

`master.fx_rate` stores rates well, but there is no effective-dated policy for:

- Preferred source and source priority
- Allowed fallback sources
- Maximum rate age
- Direct, inverse, and triangulation permissions
- Pivot currency
- Manual rate permission and approval
- Default rate type by business event
- Revaluation rate type and automatic reversal policy
- Company/Book override

The current `master.get_fx_rate()` defaults the triangulation pivot to `MYR`. That must not remain an implicit universal production policy.

Recommended schema addition, after contract approval:

```text
control.fx_policy
```

Suggested grain:

```text
tenant_id
company_code_id nullable
ledger_book_id nullable
transaction_context
effective_from / effective_to
priority
```

Suggested policy fields:

- default_rate_type
- revaluation_rate_type
- pivot_currency_code
- allow_inverse
- allow_triangulation
- preferred_sources JSON array or normalized child records
- maximum_rate_age_days
- missing_rate_behavior (`block`, `manual_with_approval`, `fallback`)
- manual_override_allowed
- manual_override_approval_required
- auto_reverse_revaluation
- status and audit fields

Do not use free-form Company metadata for this contract. Tenant parameters may provide a migration default, but they cannot safely represent effective-dated Company/Book policy.

### 6.2 Organization tax-registration gap

`master.company_code` supports one tax number and one jurisdiction. This is sufficient for the initial single-registration case but not for a Legal Entity or Company operating under multiple VAT/GST/WHT registrations.

`master.party_tax_profile` is restricted to `business_partner` ownership and should not be overloaded silently.

Recommended delivery decision:

- Initial release: use Company Code tax fields and label the limitation clearly.
- Multi-registration release: introduce a normalized organization tax-registration model after deciding whether registration authority belongs to Legal Entity, Company Code, or both.

Candidate model:

```text
master.organization_tax_registration
tenant_id
legal_entity_id
company_code_id nullable
jurisdiction_id
registration_type
registration_number
effective_from / effective_to
filing_frequency
status
certificate_attachment_id nullable
audit fields
```

### 6.3 Tax posting-role gap

The canonical posting-role catalog contains `input_tax_recoverable` and `wht_payable`, but the end-to-end tax vocabulary is incomplete.

Review and add only the roles required by supported tax flows, likely including:

- output_tax_payable
- input_tax_nonrecoverable or tax_expense
- reverse_charge_input
- reverse_charge_output
- wht_receivable
- tax_rounding_variance
- tax_suspense

Every role must define domain, normal balance, readiness criticality, aliases, and valid GL Account characteristics.

### 6.4 Tax rounding-selection gap

`control.rounding_rule` exists, but the active tax calculation currently uses a hardcoded rounding method and scale in application flow. The previous direct schedule linkage was removed.

Before implementation, choose where rounding resolves:

- Tax Group
- Tax jurisdiction/type
- Company tax profile
- Resolution rule outcome

Recommended: resolve rounding as part of the Tax Group aggregate, with Company override only if a statutory requirement demands it.

### 6.5 Bank-link lifecycle gap

`master.bank_account_link` uses effective dates but has no status/is_active/retired_at lifecycle column. Generic Entity retirement therefore cannot represent its lifecycle correctly.

Recommended: retain the table and use a custom `endBankAccountLink()` command that sets `effective_until`. Do not expose generic delete/retire for this entity.

### 6.6 Bank-interface secret gap

`control.bank_interface_profile.config` is JSON and is already marked read-only in metadata pending an encrypted credential contract.

Recommended:

- Keep non-secret routing/configuration in `config` or typed fields.
- Store credentials in the platform secret provider, referenced by opaque credential reference.
- Return only credential status, version, and last-validated timestamps.
- Add test-connection and rotate-credential commands with audit evidence.

### 6.7 Advanced treasury boundary

Cash positioning, liquidity forecasts, cash pooling, intercompany funding, debt, investments, bank guarantees, signatory mandates, and exposure limits are broader Treasury capabilities.

For this implementation, “Banking & Treasury” includes House Banks, cash GL linkage, bank interfaces, statement readiness, and reconciliation policy. Advanced Treasury should be a later program rather than forced into House Bank tables.

## 7. Domain 8 — Currency and FX

### 7.1 Page design

The Company Currency & FX page contains:

1. Currency context
2. FX policy
3. Rate coverage
4. Posting-role coverage
5. Revaluation readiness

Header summary:

```text
Functional currency: MYR
Assigned books: Statutory/MYR, Group/USD
Foreign-currency House Banks: 1
Required currency pairs: 4
Current rate coverage: 3/4
```

### 7.2 Tenant definitions

- Currency catalog is read-only.
- FX Rates use a specialized Rate Workbench because rates are high-volume and import-oriented.
- Entity Record remains available for a single rate and audit trail.
- Support CSV/API import, validation, duplicate detection, supersession, and source attribution.

### 7.3 Company policy workflow

1. Derive required currencies from Company, assigned Books, account-restricted GL Accounts, House Banks, and active payment policies.
2. Select the effective FX policy.
3. Preview direct/inverse/triangulated resolution for every required pair.
4. Validate rate age and source.
5. Validate `fx_gain` and `fx_loss` posting-role coverage for every assigned Book that carries foreign-currency exposure.
6. Mark revaluation readiness.

### 7.4 Resolution trace API

Recommended endpoint:

```text
GET /finance/setup/company/{companyCode}/fx/resolution-trace
    ?from=USD&to=MYR&rateType=SPOT&asOf=2026-07-20&bookId={id}
```

Return:

- Applied policy and scope
- Direct candidates
- Inverse candidate
- Triangulation legs
- Selected source/rate/effective timestamp
- Age in days
- Rejection reasons
- Final status

### 7.5 Commands

- Import rates
- Validate import
- Post/supersede rates
- Save FX policy
- Test rate resolution
- Preview revaluation exposure
- Open FX Revaluation Workbench

### 7.6 Readiness checks

- Functional and Book currencies are valid.
- Every required currency pair resolves for required rate types.
- Rates meet maximum-age policy.
- Manual rates meet approval policy.
- FX gain/loss posting roles resolve for each relevant Company Book.
- Foreign-currency GL and House Bank accounts are identifiable.
- No hardcoded pivot is used without an effective policy.

## 8. Domain 9 — Tax

### 8.1 Page design

The Company Tax page contains:

1. Company tax profile
2. Jurisdictions and registrations
3. Tax groups and rate schedules
4. Resolution rules
5. WHT and rounding
6. Posting-role coverage
7. Resolution simulator

### 8.2 Tenant definition pattern

Use Entity App for simple references:

- Tax Jurisdiction
- Tax Type
- Rounding Rule

Use a governed Tax Configuration aggregate for:

```text
Tax Group
├── Components
│   └── Effective Rate Schedule
├── Direction and calculation sequence
├── Recoverability and reverse charge
├── WHT threshold rules
├── Rounding policy
└── Resolution rules
```

The current generic aggregate list is useful for navigation but is not sufficient as the final editor. It does not validate the aggregate as one tax contract or simulate resolution.

### 8.3 Company tax profile

Initial release fields:

- Company tax registration number
- Primary tax jurisdiction
- Country and regulatory framework
- Tax-effective date
- Supported purchase/sale/payment directions
- Posting Books

If multi-registration is approved, replace the single registration presentation with an effective-dated registration matrix.

### 8.4 Tax resolution simulator

Inputs:

- Document type and direction
- Bill-to, ship-to, bill-from, and ship-from jurisdictions
- Counterparty tax status
- Commodity category
- Supplier industry
- Document date
- Amount and currency

Outputs:

- Candidate rules and rejection reasons
- Selected rule and Tax Group
- Ordered components
- Rate and basis
- Recoverable/nonrecoverable split
- Reverse-charge result
- WHT threshold result
- Rounding result
- Required posting roles and account resolution status

### 8.5 Commands

- Create/version Tax Group
- Add/reorder components
- Add/effect/end rate schedule
- Activate/deactivate resolution rule
- Save WHT threshold
- Assign rounding policy
- Simulate tax resolution
- Validate posting-role coverage

### 8.6 Readiness checks

- Company has a valid primary jurisdiction and registration for the initial scope.
- Every active Tax Group has at least one active component.
- Component rates are effective and non-overlapping for required contexts.
- Resolution rules do not have ambiguous equal-priority matches.
- WHT thresholds use valid currency and dates.
- Rounding is explicitly resolved; hardcoded application fallback is reported.
- Required tax posting roles resolve by Company and Book.
- Tax accounts are active, postable, and compatible with role normal balance.

## 9. Domain 10 — Payments and Settlement

### 9.1 Page design

The Company Payments page contains:

1. Payment-method eligibility matrix
2. Defaults by direction and currency
3. Payment Terms and holiday-calendar references
4. Bank-interface routing
5. Settlement accounting
6. Coverage and conflict diagnostics

### 9.2 Tenant definitions

Entity App:

- Payment Method
- Bank Format Rule

Aggregate editors:

- Payment Term, clauses, discount tiers, and holiday-calendar linkage
- Bank Interface Profile and capability configuration

Payment Terms remain assigned through Company Supplier and Customer profiles. Do not add a general Company Payment Term policy until a requirement exists for Company-wide eligibility, defaults, or prohibitions.

### 9.3 Company payment-policy matrix

Rows are Payment Methods; columns show:

- Direction
- Currency or all currencies
- Effective dates
- Minimum/maximum amount
- Default method
- Preferred House Bank
- Manual/file/API eligibility
- Dual approval
- Cutoff and timezone
- Interface routing status
- Settlement-rule status

Filters:

- Outbound/inbound
- Currency
- Missing House Bank
- Missing interface
- Missing settlement accounting
- Conflicting defaults

### 9.4 Interface routing

Routing precedence should be deterministic:

```text
Company + method + House Bank + currency + direction + country + network
    -> Company + method + currency + direction
        -> Tenant method/network default
```

Highest priority wins only after specificity. Equal-priority equally-specific matches are a configuration error, not an arbitrary selection.

### 9.5 Settlement accounting

`control.payment_settlement_rule` already references posting roles and should remain the source contract for:

- Clearing
- Bank settlement
- Bank fee
- Discount
- FX gain/loss
- Chargeback
- Suspense

Each rule is validated against an assigned Book and the Posting Role Coverage Matrix.

### 9.6 Commands

- Enable/disable payment method for Company
- Set default by direction/currency
- Assign preferred House Bank
- Save cutoffs and channel permissions
- Bind interface
- Test routing
- Save settlement rule
- Trace settlement-account resolution

### 9.7 Readiness checks

- At least one eligible method exists for required direction.
- At most one active default exists for each Company/direction/currency window.
- Preferred House Bank belongs to the Company and supports the policy currency/direction.
- Required interface exists and is active when the method requires one.
- Interface binding resolves without ambiguity.
- Settlement rules exist for relevant method/direction/Book combinations.
- Every required settlement posting role resolves to a postable Company GL Account.
- Cutoff timezone is valid and paired with cutoff time.

## 10. Domain 11 — Banking and Treasury

### 10.1 Page design

The Company Banking page follows the actual setup chain:

```text
Bank Institution
    -> Physical Bank Account
        -> Company Bank-account Link
            -> House Bank Configuration
                -> Currency-compatible Cash GL Account
                    -> Payment Interface and Reconciliation Readiness
```

Display one House Bank card per Company-linked account:

- Bank and masked account identifier
- Account currency
- Verification status
- Usage: disbursement/collection/both
- Default flags
- Cash GL Account and currency compatibility
- Manual/file/API capability
- Reconciliation mode
- Interface-binding coverage
- Latest statement and reconciliation status

### 10.2 Tenant definitions

Entity App owns:

- Bank Party
- Bank Account

Sensitive account values are masked in list responses. Full values require a dedicated reveal action and audit trail when permissions are introduced.

### 10.3 House Bank aggregate

Use one governed editor to create or maintain:

1. Company Bank-account Link
2. House Bank Configuration
3. Cash GL linkage
4. Usage/default policy
5. Reconciliation mode
6. Related payment/interface coverage

Do not ask users to create `bank_account_link` and `bank_account_house_config` independently through unrelated Entity forms.

### 10.4 Currency-specific GL invariant

For each House Bank:

- The linked GL Account must be reachable through the active Company operating Chart.
- The GL Account must be an active posting account.
- If the GL Account has `currency_code`, it must equal the Bank Account currency.
- A local-currency and USD Bank Account normally require separate cash GL Accounts when account-specific currency is enforced.
- The same GL Account must not be used for incompatible account currencies unless it is explicitly multi-currency and accounting policy permits it.

### 10.5 Lifecycle commands

- Link Bank Account to Company
- Configure as House Bank
- Set default disbursement/collection
- Change cash GL linkage
- Verify account
- End Company link
- Deactivate House Bank usage
- Test interface
- Open Bank Statement Workbench
- Open Reconciliation Workbench

Ending a link must check for future payments, active policies, open statements, and unreconciled cases.

### 10.6 Treasury summary in this release

Show a read-only operational summary without creating new Treasury setup masters:

- Cash balance by House Bank and currency
- Last statement date
- Unreconciled amount/count
- Pending outbound payments
- Expected inbound collections
- FX exposure indicator
- Link to cash forecast scenario when available

### 10.7 Readiness checks

- Required House Bank links are active and effective.
- Physical Bank Accounts are active and verified where policy requires.
- Account currency matches House Bank cash GL policy.
- Default disbursement/collection elections are unambiguous.
- Cash GL Accounts are active, postable, and Company-reachable.
- Payment policies reference valid House Banks.
- Interface-required House Banks have a resolvable active binding.
- Reconciliation mode and statement-import capability are configured.
- No critical open lifecycle conflict exists.

## 11. API architecture

### 11.1 Canonical Entity API

Continue using Entity API for simple definition CRUD:

- `fx_rate` record drill-down only
- `tax_jurisdiction`
- `tax_type`
- `rounding_rule`
- `payment_method`
- `bank_format_rule`
- `bank_party`
- `bank_account`

High-volume import, aggregates, secure credentials, policy commands, simulations, and lifecycle transitions use Finance Setup APIs.

### 11.2 Recommended Finance Setup endpoints

```text
GET  /finance/setup/company/{companyCode}/currency-fx
GET  /finance/setup/company/{companyCode}/fx/coverage
GET  /finance/setup/company/{companyCode}/fx/resolution-trace
POST /finance/setup/fx/imports/validate
POST /finance/setup/fx/imports
PUT  /finance/setup/company/{companyCode}/fx-policy

GET  /finance/setup/company/{companyCode}/tax
GET  /finance/setup/company/{companyCode}/tax/coverage
POST /finance/setup/company/{companyCode}/tax/simulate
POST /finance/setup/tax-groups
PUT  /finance/setup/tax-groups/{taxGroupId}
POST /finance/setup/tax-groups/{taxGroupId}/activate

GET  /finance/setup/company/{companyCode}/payment-policies
POST /finance/setup/company/{companyCode}/payment-policies
PUT  /finance/setup/company/{companyCode}/payment-policies/{policyId}
POST /finance/setup/company/{companyCode}/payment-routing/trace
PUT  /finance/setup/company/{companyCode}/settlement-rules/{ruleId}

GET  /finance/setup/company/{companyCode}/house-banks
POST /finance/setup/company/{companyCode}/house-banks
PUT  /finance/setup/company/{companyCode}/house-banks/{houseBankId}
POST /finance/setup/company/{companyCode}/house-banks/{houseBankId}/set-default
POST /finance/setup/company/{companyCode}/house-banks/{houseBankId}/end-link
POST /finance/setup/bank-interfaces/{interfaceId}/test

GET  /finance/setup/company/{companyCode}/operations-readiness
```

Every Company endpoint resolves the URL code under the authenticated tenant and Legal Entity context. Client-supplied tenant IDs are never authorization.

## 12. Security and audit contract

- RLS remains enabled and forced on reused tenant tables.
- Company-scoped service queries include tenant and Company predicates even where RLS exists.
- Bank account identifiers are masked by default.
- Credential material is write-only through a secret-provider adapter.
- Manual FX rates, tax overrides, Bank Account verification, settlement-rule changes, and default House Bank changes require audit activity records.
- Audit detail stores references and before/after policy fields, never credentials or full bank account identifiers.
- Mutation APIs accept correlation ID and optimistic concurrency version.

## 13. Readiness roll-up

Add four domain statuses:

```text
currency_fx
tax
payments_settlement
banking_treasury
```

Each returns:

- state: not_started, in_progress, ready, blocked
- passed/total check count
- blocker/warning count
- material-change timestamp
- certification freshness
- primary action

The operations-setup roll-up becomes Ready for Certification only when all enabled domains pass deterministic checks. A tenant may explicitly mark a domain Not Applicable only through a governed applicability decision, not by absence of records.

## 14. Implementation stages

### Stage A — Contract hardening

- Lock scope and lifecycle vocabulary for all four domains.
- Correct metadata relationships and display contracts.
- Remove generic delete/retire from `bank_account_link`.
- Define secure interface-credential contract.
- Complete canonical tax posting roles.
- Decide tax rounding resolution.
- Decide FX policy schema and remove implicit MYR pivot behavior.
- Add integration tests for RLS and cross-tenant references.

### Stage B — Currency and FX

- Add approved FX policy model and resolver.
- Add rate import/validation service.
- Add FX resolution trace.
- Build required-pair coverage service.
- Build Currency & FX Company page and Rate Workbench.
- Connect posting-role and revaluation readiness.

### Stage C — Tax

- Harden metadata for all Tax aggregate members.
- Build Tax Group/version editor and component ordering.
- Add effectivity/ambiguity validation.
- Implement WHT threshold and rounding selection.
- Build tax-resolution simulator.
- Add Company Tax Profile and posting-role coverage.
- Decide and, if approved, implement multi-registration storage.

### Stage D — Payments and Settlement

- Build Payment Term aggregate editor.
- Build Company Payment Policy Matrix.
- Build deterministic interface-routing resolver and trace.
- Build Settlement Accounting editor.
- Integrate House Bank eligibility and Posting Role Coverage.
- Add policy conflict/readiness checks.

### Stage E — Banking and Treasury

- Harden Bank Party and Bank Account Entity contracts.
- Build House Bank aggregate API and editor.
- Add cash GL currency/postability validation.
- Implement effective end-link lifecycle.
- Add secure interface test/credential status.
- Surface Bank Statement and Reconciliation readiness.
- Add the limited Treasury operational summary.

### Stage F — Certification and rollout

- Add four-domain readiness endpoint and UI roll-up.
- Invalidate certification on material changes.
- Add migration/defaulting for existing tenants.
- Add single-company and multi-company test scenarios.
- Add multi-currency, multi-Book, multi-House-Bank, and multi-jurisdiction test matrices.
- Enable production posting gates according to rollout policy.

## 15. Test strategy

### Database and service integration

- Tenant RLS and cross-tenant FK rejection
- FX direct, inverse, triangulated, stale, missing, and manual-rate cases
- FX policy precedence by Tenant, Company, Book, context, and date
- Tax rule specificity, ambiguity, effectivity, recoverability, reverse charge, WHT, and rounding
- Payment default uniqueness and effective-date overlap
- Interface routing specificity and equal-priority conflict
- Settlement posting-role resolution by Company and Book
- House Bank account/GL currency compatibility
- Link end-dating with dependent records
- Bank interface secret non-disclosure

### UI and contract

- Company switching reloads Company policies but preserves tenant definitions
- Entity links open canonical records
- Aggregate save reports child-level validation errors
- Readiness counts match service checks
- Multi-Book and multi-currency status is never collapsed to one implicit Book/currency
- Sensitive fields stay masked and are absent from browser payloads

### End-to-end scenarios

1. Local-currency Company with one statutory Book and one House Bank.
2. Company with local and USD Books plus local and USD House Bank accounts.
3. Outbound file payment with settlement, fee, and FX postings.
4. Inbound collection with suspense and reconciliation.
5. Purchase invoice with recoverable tax and WHT.
6. Cross-jurisdiction tax resolution with reverse charge.
7. Period-end FX revaluation and automatic reversal.
8. Multi-company tenant sharing definitions but maintaining independent policies.

## 16. Acceptance criteria

1. Tenant definitions are reusable across Company Codes without copying records.
2. Company policies cannot reference another tenant or an inaccessible Company resource.
3. Required FX rates resolve according to an explicit policy with traceable source and age.
4. Tax resolution is deterministic and explainable before a transaction is posted.
5. Tax, FX, payment, and banking posting roles resolve for every relevant Company Book.
6. Payment method routing resolves to one eligible interface or returns a clear configuration conflict.
7. Every House Bank has a valid currency-compatible Company-postable cash GL Account.
8. Bank credentials are never stored or returned as ordinary editable JSON.
9. Setup screens separate definitions, Company policy, and operational evidence.
10. Material changes invalidate Finance readiness certification.
11. Single-company setup remains simple while multi-company and multi-currency scope stays explicit.
12. No operational payment, tax, statement, reconciliation, or revaluation record is treated as setup CRUD.

## 17. Decisions required before build

1. Approve `control.fx_policy` or limit the first release to tenant-wide parameter defaults.
2. Select the default FX pivot migration behavior; do not retain implicit MYR globally.
3. Approve the canonical tax posting-role additions.
4. Select tax rounding ownership and precedence.
5. Decide whether multi-registration tax storage is in this release or deferred.
6. Confirm Payment Terms remain assigned through Supplier/Customer Company profiles.
7. Confirm bank-interface secret provider and credential-reference contract.
8. Confirm advanced Treasury remains outside this setup phase.

## 18. Final recommendation

Proceed with a hybrid implementation:

- Entity App for simple tenant masters.
- Specialized Rate Workbench for high-volume FX rates.
- Governed aggregate editors for Tax, Payment Terms, Payment Policies, interfaces, settlement, and House Banks.
- Posting Role Coverage for all tax, FX, payment, and banking account determination.
- Operational Workbenches for payments, statements, reconciliation, and revaluation.
- Add only the approved FX policy model initially; add organization tax-registration storage only when multi-registration is included in scope.

This preserves the strong existing DDL, closes the genuine policy gaps, and avoids duplicating canonical Entity CRUD inside Finance Setup.
