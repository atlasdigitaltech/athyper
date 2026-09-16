# Internal business-workflow evidence matrix

**Review date:** 2026-09-14  
**Scope:** 7 NEON workspaces, 32 modules  
**Purpose:** source traceability for the business-facing design series; not an external capability commitment

## Review method and limits

The workspace inventory comes from the canonical platform catalogue. The review indexed canonical table declarations under common and NEON DDL, mapped selected business objects for each module, inspected representative constraints and relevant service implementations, and read the finance and governed Business Partner guidance. Other-plane records are not used to establish NEON ownership.

This is a source review of the current workspace, which contains ongoing changes. No live database, authenticated tenant workflow, external provider or production deployment was exercised. Application test files are referenced where found; they were not executed for this documentation change. Generated source links and mappings were checked for existence.

A lack of dedicated records in this scan is reported as a scoped finding, not proof that no implementation exists anywhere. The matrix does not treat catalogue descriptions, empty contract-package exports, generic workflow tables or mock-based tests as completed domain journeys. It also does not infer an enforced approval transition from a status column or paired audit fields.

## Common evidence sources

| Source                                                                                                                                                          | Use and limit                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| [governance/catalog/platform-catalog.v1.json](../../../governance/catalog/platform-catalog.v1.json)                                                             | Canonical names, 7 selected workspaces and 32 module identities.                                             |
| [server/db/ddl/planes/neon/_manifest.txt](../../../server/db/ddl/planes/neon/_manifest.txt)                                                                     | Fresh NEON foundation file order; not evidence of schema parity in a populated database.                     |
| [server/db/ddl/planes/neon/master/12_platform_catalog_reference_seed.sql](../../../server/db/ddl/planes/neon/master/12_platform_catalog_reference_seed.sql)     | Business descriptions and dependency hints. Older labels differ from current catalogue in places.            |
| [server/db/ddl/planes/neon/document/02_domains.sql](../../../server/db/ddl/planes/neon/document/02_domains.sql)                                                 | Stored domain/status vocabulary. It does not prove service transitions.                                      |
| [server/packages/services/finance/src/index.ts](../../../server/packages/services/finance/src/index.ts)                                                         | Exported bounded finance services. The finance foundation explicitly declares routesEnabledByDefault: false. |
| [server/packages/planes/neon/src/finance-http.ts](../../../server/packages/planes/neon/src/finance-http.ts)                                                     | Finance route definitions/dispatch; enablement and full domain behavior remain separate.                     |
| [docs/runbooks/finance-api-review-2026-09-07.md](../../../docs/runbooks/finance-api-review-2026-09-07.md)                                                       | Dated HTTP review with mocked domain/queue tests and explicit no-live-mutation limits.                       |
| [docs/architecture/business-partner/README.md](../../../docs/architecture/business-partner/README.md)                                                           | Canonical Business Partner authority and governed lifecycle.                                                 |
| [docs/architecture/decisions/governed-case-communications-and-documents.md](../../../docs/architecture/decisions/governed-case-communications-and-documents.md) | Current-source distinction between cases, cycles, workflows, communication and remaining bindings.           |
| [docs/contracts/atlas-business-partner-insights.md](../../../docs/contracts/atlas-business-partner-insights.md)                                                 | Bounded BP read/assessment capabilities; no general AI enablement for the other modules.                     |

## Module coverage matrix

| Workspace           | Module                                            | Evidence position                                    | Primary gap                                                                                                                                                                                          |
| ------------------- | ------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Finance             | [Financial Accounting](#evidence-acc)             | Source implementation present; activation unverified | The inspected balance-posting service consumes an already-posted journal snapshot. Journal authoring, approval and the entire close journey still require separate qualification.                    |
| Finance             | [Accounts Payable](#evidence-ap)                  | Data foundation defined; workflow proposed           | A full invoice-capture, matching, approval and settlement service journey was not established by this review.                                                                                        |
| Finance             | [Accounts Receivable](#evidence-ar)               | Supporting foundation only; workflow proposed        | A dedicated customer-invoice and collections lifecycle was not identified in the inspected canonical table inventory. Do not reuse the supplier invoice as evidence of receivables implementation.   |
| Finance             | [Cash & Treasury Management](#evidence-treasury)  | Source implementation present; activation unverified | Bank connectivity, payment authorization and full cash forecasting are proposed until their specific adapters and workflows are qualified.                                                           |
| Finance             | [Budget Management & Control](#evidence-budget)   | Source implementation present; activation unverified | Budget authoring approvals and automatic checks at every purchasing stage need journey-specific binding and qualification.                                                                           |
| Finance             | [Tax Management](#evidence-tax)                   | Source implementation present; activation unverified | Country-specific returns, electronic invoicing and authority submission are not established as available by these foundations.                                                                       |
| Finance             | [Fixed Asset Accounting](#evidence-faa)           | Source implementation present; activation unverified | The complete capitalization, scheduled depreciation and disposal approval experience requires separate qualification.                                                                                |
| Supply Chain        | [Supplier Management](#evidence-srm)              | Source implementation present; activation unverified | Specific qualification policies, communication routes and the full tenant onboarding journey still need deployment evidence.                                                                         |
| Supply Chain        | [Strategic Sourcing](#evidence-source)            | Data foundation defined; workflow proposed           | Supplier response collection, scoring, negotiation and award workflow are proposed until executable services are verified.                                                                           |
| Supply Chain        | [Contract Management](#evidence-contract)         | Source implementation present; activation unverified | Clause authoring, signature integration, obligation reminders and renewal workflows remain proposed.                                                                                                 |
| Supply Chain        | [Procurement](#evidence-buy)                      | Source implementation present; activation unverified | End-to-end requisition approval, supplier order transmission and receipt-to-invoice automation require explicit qualification.                                                                       |
| Supply Chain        | [Demand & Supply Planning](#evidence-demand)      | Source implementation present; activation unverified | The inspected planning service manages financial amounts and run lifecycle; it does not establish demand forecasting, supply optimization or material-requirements calculations.                     |
| Supply Chain        | [Inventory Management](#evidence-inventory)       | Source implementation present; activation unverified | Warehouse task orchestration, counting approvals and all physical movement entry channels require separate qualification.                                                                            |
| Supply Chain        | [Warehouse Management](#evidence-wms)             | Supporting foundation only; workflow proposed        | Dedicated bin, handling-unit, picking-task and scanning workflows were not identified in the inspected canonical inventory; this operational design is proposed.                                     |
| Supply Chain        | [Quality Management](#evidence-qms)               | Supporting foundation only; workflow proposed        | A dedicated inspection plan, nonconformance and corrective-action lifecycle was not identified in the inspected canonical inventory; these capabilities are proposed.                                |
| Supply Chain        | [Transportation & Logistics](#evidence-logistics) | Supporting foundation only; workflow proposed        | Carrier booking, shipment tracking, proof-of-delivery and freight settlement workflows require dedicated implementation verification.                                                                |
| Commercial          | [Customer Relationship Management](#evidence-crm) | Data foundation defined; workflow proposed           | Full lead capture, campaign management and opportunity stage automation are not established by the inspected source.                                                                                 |
| Commercial          | [Sales & Order Management](#evidence-sale)        | Data foundation defined; workflow proposed           | Order approval, credit admission, stock reservation and customer billing orchestration require additional service and deployment evidence.                                                           |
| Commercial          | [Pricing & Commercial Management](#evidence-pcm)  | Data foundation defined; workflow proposed           | A complete pricing engine, promotion/rebate settlement and margin approval workflow was not established by this review.                                                                              |
| People              | [Core Human Resources](#evidence-hr)              | Data foundation defined; workflow proposed           | End-to-end hiring, transfer, compensation and departure workflows remain subject to implementation and activation review.                                                                            |
| People              | [Time & Attendance](#evidence-tna)                | Data foundation defined; workflow proposed           | Time interpretation, overtime calculations, device feeds and approval-to-payroll integration were not verified end to end.                                                                           |
| People              | [Talent Management](#evidence-tal)                | Supporting foundation only; workflow proposed        | Dedicated applicant, performance-review, learning and succession models were not identified in the inspected inventory. Those capabilities are proposed rather than inferred from HR tables.         |
| People              | [Payroll](#evidence-payroll)                      | Data foundation defined; workflow proposed           | A qualified payroll calculation engine, jurisdiction rules, payslip delivery and filing integrations were not established by the inspected source.                                                   |
| People              | [External Workforce](#evidence-workforce)         | Source implementation present; activation unverified | Publishing can be blocked by policy readiness. A full supplier-to-invoice journey is not established by service presence.                                                                            |
| Projects & Services | [Project Management](#evidence-prjcost)           | Data foundation defined; workflow proposed           | Resource scheduling, progress approval, project billing and revenue recognition are not established by the project records alone.                                                                    |
| Projects & Services | [Professional Services](#evidence-psa)            | Supporting foundation only; workflow proposed        | Supplier-side statements of work are not evidence of a complete customer professional-services billing model. Customer staffing, timesheets, utilization and billing require dedicated verification. |
| Projects & Services | [Service Management](#evidence-itsm)              | Supporting foundation only; workflow proposed        | A dedicated service-ticket catalogue, incident/problem model and service-level timer implementation was not identified in this review.                                                               |
| Operations          | [Manufacturing](#evidence-mfg)                    | Data foundation defined; workflow proposed           | Capacity planning, shop-floor execution, quality release and full production costing need dedicated service qualification.                                                                           |
| Operations          | [Maintenance Management](#evidence-maint)         | Supporting foundation only; workflow proposed        | Dedicated maintenance plans, work orders, meter readings and preventive schedules were not identified in the inspected canonical inventory.                                                          |
| Assets & Facilities | [Enterprise Asset Management](#evidence-asset)    | Data foundation defined; workflow proposed           | A complete acquisition, transfer and disposal approval workflow requires implementation verification; accounting services do not establish operational asset workflows.                              |
| Assets & Facilities | [Real Estate Management](#evidence-assetrems)     | Supporting foundation only; workflow proposed        | Dedicated property, lease, tenancy, rent schedule and common-area charge models were not identified in the inspected canonical inventory. The workflow is proposed.                                  |
| Assets & Facilities | [Facilities Management](#evidence-assetfm)        | Supporting foundation only; workflow proposed        | Dedicated buildings/spaces, utility meters, occupancy and facilities-request workflows were not identified in the inspected canonical inventory.                                                     |

## Detailed mappings

Each mapping supports the module chapter's **inspected foundation**, not its proposed workflow. Constraint names below are copied from the selected table definition for review; they are not substituted for full rule analysis. Shared objects may legitimately appear under several modules, without transferring ownership. A retained table declaration may also be legacy storage: the external-workforce service-sheet bridge explicitly avoids writing the older external-service-entry tables. Current service ownership takes precedence over inferring an active workflow from those declarations.

<a id="evidence-acc"></a>

### Finance / Financial Accounting (`acc`)

[Business chapter](../finance.md#module-acc)

**Evidence position:** Source implementation present; activation unverified.

**Supported finding:** Journal and balance structures exist. Posting services validate complete posted journal snapshots, balance and currency consistency; period and close services are present.

**Boundary / remaining work:** The inspected balance-posting service consumes an already-posted journal snapshot. Journal authoring, approval and the entire close journey still require separate qualification.

| Business-object source      | Canonical declaration                                                                                | Observed structure                                                                                                                                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `master.gl_account`         | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L859)     | Status column: `master.finance_setup_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `gl_account_parent_self_chk`, `gl_account_level_chk`, `gl_account_path_chk`.                             |
| `master.ledger_book`        | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L917)     | Status column: `master.finance_setup_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `ledger_book_code_chk`, `ledger_book_name_chk`, `ledger_book_currency_chk`.                              |
| `master.fiscal_period`      | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L1033)    | Status column: `master.fiscal_period_status_d  NOT NULL DEFAULT 'future'`. Representative constraints: `fiscal_period_code_chk`, `fiscal_period_name_chk`, `fiscal_period_year_chk`.                          |
| `document.journal_entry`    | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L933) | Status column: `document.journal_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `journal_entry_number_chk`, `journal_entry_source_chk`, `journal_entry_date_chk`.                            |
| `document.journal_line`     | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L993) | Representative constraints: `journal_line_no_chk`, `journal_line_transaction_polarity_chk`, `journal_line_base_polarity_chk`.                                                                                 |
| `ledger.gl_balance`         | [planes/neon/ledger/03_tables.sql](../../../server/db/ddl/planes/neon/ledger/03_tables.sql#L299)     | Representative constraints: `gl_balance_amount_chk`, `gl_balance_sequence_chk`, `gl_balance_key_chk`.                                                                                                         |
| `ledger.book_period_status` | [planes/neon/ledger/03_tables.sql](../../../server/db/ddl/planes/neon/ledger/03_tables.sql#L189)     | Status column: `ledger.book_period_status_d NOT NULL DEFAULT 'future'`. Representative constraints: `book_period_status_version_chk`, `book_period_status_open_pair_chk`, `book_period_status_soft_pair_chk`. |

**Bounded source implementations:**

| Source                                                                                                                                            | Exported entry points                                                                              | Test pointer, not execution evidence                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| [server/packages/services/finance/src/ledger/gl-posting-service.ts](../../../server/packages/services/finance/src/ledger/gl-posting-service.ts)   | `GlPostingService`, `GlBalanceQueryService`                                                        | No same-name companion test linked; not a claim of no tests.                                            |
| [server/packages/services/finance/src/shared/book-period-service.ts](../../../server/packages/services/finance/src/shared/book-period-service.ts) | `BookPeriodService`, `isPostingPeriod`                                                             | No same-name companion test linked; not a claim of no tests.                                            |
| [server/packages/services/finance/src/closing/closing-services.ts](../../../server/packages/services/finance/src/closing/closing-services.ts)     | `FxRevaluationService`, `IcEliminationService`, `AssetRevaluationService`, `CloseReadinessService` | [Companion test source](../../../server/packages/services/finance/src/closing/closing-services.test.ts) |

**Design classification:** the primary workflow, business-role assignment, notifications, measures and tenant choices in this chapter are proposed. Only the separately stated foundation is source-supported. No exact UI statuses, statutory rules, approval thresholds or AI tools are inferred from these records.

<a id="evidence-ap"></a>

### Finance / Accounts Payable (`ap`)

[Business chapter](../finance.md#module-ap)

**Evidence position:** Data foundation defined; workflow proposed.

**Supported finding:** Supplier invoice, matching, accounting distribution and payment structures are defined. Shared finance controls are supporting components.

**Boundary / remaining work:** A full invoice-capture, matching, approval and settlement service journey was not established by this review.

| Business-object source                 | Canonical declaration                                                                                | Observed structure                                                                                                                                                                                                                                      |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `document.purchase_invoice`            | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L442) | Status column: `document.purchase_invoice_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `purchase_invoice_code_chk`, `purchase_invoice_name_chk`, `purchase_invoice_direction_chk`.                                                   |
| `document.purchase_invoice_line`       | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L543) | Representative constraints: `purchase_invoice_line_no_chk`, `purchase_invoice_line_description_chk`, `purchase_invoice_line_source_chk`.                                                                                                                |
| `document.invoice_match_case`          | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L625) | Status column: `document.invoice_match_case_status_d NOT NULL DEFAULT 'pending'`. Representative constraints: `invoice_match_case_exception_chk`, `invoice_match_case_match_pair_chk`, `invoice_match_case_result_chk`.                                 |
| `document.accounting_distribution`     | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L661) | Representative constraints: `accounting_distribution_source_chk`, `accounting_distribution_no_chk`, `accounting_distribution_basis_chk`.                                                                                                                |
| `document.payment_entry_allocation`    | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L881) | Representative constraints: `payment_entry_allocation_line_chk`, `payment_entry_allocation_target_chk`, `payment_entry_allocation_amount_chk`.                                                                                                          |
| `master.company_code_supplier_profile` | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L4764)    | Status column: `master.partner_extension_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `company_code_supplier_profile_metadata_chk`, `company_code_supplier_profile_status_pair_chk`, `company_code_supplier_profile_audit_pair_chk`. |

**Runtime evidence:** no module-specific service behavior is claimed by this review. Shared platform services are dependencies, not proof of this workflow.

**Design classification:** the primary workflow, business-role assignment, notifications, measures and tenant choices in this chapter are proposed. Only the separately stated foundation is source-supported. No exact UI statuses, statutory rules, approval thresholds or AI tools are inferred from these records.

<a id="evidence-ar"></a>

### Finance / Accounts Receivable (`ar`)

[Business chapter](../finance.md#module-ar)

**Evidence position:** Supporting foundation only; workflow proposed.

**Supported finding:** Customer and sales structures and shared payment records exist as supporting foundations.

**Boundary / remaining work:** A dedicated customer-invoice and collections lifecycle was not identified in the inspected canonical table inventory. Do not reuse the supplier invoice as evidence of receivables implementation.

| Business-object source                 | Canonical declaration                                                                                 | Observed structure                                                                                                                                                                                                                                     |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `master.customer`                      | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L1987)     | Status column: `master.customer_status_d NOT NULL DEFAULT 'prospect'`. Representative constraints: `customer_code_fmt_chk`, `customer_record_version_chk`, `customer_metadata_object_chk`.                                                             |
| `master.company_code_customer_profile` | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L4799)     | Status column: `master.partner_extension_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `company_code_customer_profile_statement_chk`, `company_code_customer_profile_metadata_chk`, `company_code_customer_profile_status_pair_chk`. |
| `document.sales_order`                 | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L2182) | Status column: `document.sales_order_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `sales_order_code_fmt_chk`, `sales_order_requested_date_chk`, `sales_order_total_chk`.                                                            |
| `document.payment_entry`               | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L796)  | Status column: `document.payment_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `payment_entry_number_chk`, `payment_entry_supplier_chk`, `payment_entry_method_chk`.                                                                 |
| `document.payment_entry_allocation`    | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L881)  | Representative constraints: `payment_entry_allocation_line_chk`, `payment_entry_allocation_target_chk`, `payment_entry_allocation_amount_chk`.                                                                                                         |

**Runtime evidence:** no module-specific service behavior is claimed by this review. Shared platform services are dependencies, not proof of this workflow.

**Design classification:** the primary workflow, business-role assignment, notifications, measures and tenant choices in this chapter are proposed. Only the separately stated foundation is source-supported. No exact UI statuses, statutory rules, approval thresholds or AI tools are inferred from these records.

<a id="evidence-treasury"></a>

### Finance / Cash & Treasury Management (`treasury`)

[Business chapter](../finance.md#module-treasury)

**Evidence position:** Source implementation present; activation unverified.

**Supported finding:** Bank, payment, statement, reconciliation and netting structures exist; foreign-exchange close services provide a bounded implementation.

**Boundary / remaining work:** Bank connectivity, payment authorization and full cash forecasting are proposed until their specific adapters and workflows are qualified.

| Business-object source         | Canonical declaration                                                                                 | Observed structure                                                                                                                                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `master.bank_account`          | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L1261)     | Status column: `master.bank_account_status_d   NOT NULL DEFAULT 'pending_verification'`. Representative constraints: `bank_account_code_chk`, `bank_account_name_chk`, `bank_account_holder_chk`.               |
| `document.payment_entry`       | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L796)  | Status column: `document.payment_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `payment_entry_number_chk`, `payment_entry_supplier_chk`, `payment_entry_method_chk`.                          |
| `document.bank_statement`      | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L2544) | Status column: `document.bank_statement_status_d       NOT NULL DEFAULT 'imported'`. Representative constraints: `bank_statement_period_chk`, `bank_statement_reference_chk`, `bank_statement_source_hash_chk`. |
| `document.bank_statement_line` | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L2585) | Representative constraints: `bank_statement_line_no_chk`, `bank_statement_line_description_chk`, `bank_statement_line_amount_chk`.                                                                              |
| `document.bank_recon_case`     | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L2620) | Status column: `document.bank_recon_case_status_d      NOT NULL DEFAULT 'open'`. Representative constraints: `bank_recon_case_number_chk`, `bank_recon_case_confidence_chk`, `bank_recon_case_amounts_chk`.     |
| `document.netting_batch`       | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L4060) | Status column: `document.netting_batch_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `netting_batch_number_chk`, `netting_batch_company_chk`, `netting_batch_cutoff_chk`.                     |
| `document.fx_revaluation_run`  | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L3902) | Status column: `document.fx_revaluation_run_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `fx_revaluation_run_gain_chk`, `fx_revaluation_run_loss_chk`, `fx_revaluation_run_line_count_chk`.  |

**Bounded source implementations:**

| Source                                                                                                                                        | Exported entry points                                                                              | Test pointer, not execution evidence                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| [server/packages/services/finance/src/closing/closing-services.ts](../../../server/packages/services/finance/src/closing/closing-services.ts) | `FxRevaluationService`, `IcEliminationService`, `AssetRevaluationService`, `CloseReadinessService` | [Companion test source](../../../server/packages/services/finance/src/closing/closing-services.test.ts) |

**Design classification:** the primary workflow, business-role assignment, notifications, measures and tenant choices in this chapter are proposed. Only the separately stated foundation is source-supported. No exact UI statuses, statutory rules, approval thresholds or AI tools are inferred from these records.

<a id="evidence-budget"></a>

### Finance / Budget Management & Control (`budget`)

[Business chapter](../finance.md#module-budget)

**Evidence position:** Source implementation present; activation unverified.

**Supported finding:** Budget mutation, reversal, balance rebuilding and version controls are implemented in source.

**Boundary / remaining work:** Budget authoring approvals and automatic checks at every purchasing stage need journey-specific binding and qualification.

| Business-object source       | Canonical declaration                                                                                 | Observed structure                                                                                                                                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `document.budget_profile`    | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L3664) | Status column: `document.budget_profile_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `budget_profile_code_fmt_chk`, `budget_profile_name_chk`, `budget_profile_version_chk`.                 |
| `document.budget_allocation` | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L3716) | Status column: `document.budget_allocation_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `budget_allocation_fiscal_year_chk`, `budget_allocation_period_chk`, `budget_allocation_amount_chk`. |
| `ledger.budget_transaction`  | [planes/neon/ledger/03_tables.sql](../../../server/db/ddl/planes/neon/ledger/03_tables.sql#L1)        | Representative constraints: `budget_transaction_reversal_contract_chk`, `budget_transaction_amount_chk`, `budget_transaction_fiscal_year_chk`.                                                                  |
| `ledger.budget_balance`      | [planes/neon/ledger/03_tables.sql](../../../server/db/ddl/planes/neon/ledger/03_tables.sql#L50)       | Representative constraints: `budget_balance_fiscal_year_chk`, `budget_balance_period_chk`, `budget_balance_amount_chk`.                                                                                         |

**Bounded source implementations:**

| Source                                                                                                                                  | Exported entry points                                                              | Test pointer, not execution evidence                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| [server/packages/services/finance/src/budget/budget-service.ts](../../../server/packages/services/finance/src/budget/budget-service.ts) | `BudgetService`, `BudgetBalanceService`, `rebuildFromLog`, `applyBudgetTransition` | [Companion test source](../../../server/packages/services/finance/src/budget/budget-service.test.ts) |

**Design classification:** the primary workflow, business-role assignment, notifications, measures and tenant choices in this chapter are proposed. Only the separately stated foundation is source-supported. No exact UI statuses, statutory rules, approval thresholds or AI tools are inferred from these records.

<a id="evidence-tax"></a>

### Finance / Tax Management (`tax`)

[Business chapter](../finance.md#module-tax)

**Evidence position:** Source implementation present; activation unverified.

**Supported finding:** Calculation and tax-credit services exist alongside jurisdiction, registration and withholding-certificate structures.

**Boundary / remaining work:** Country-specific returns, electronic invoicing and authority submission are not established as available by these foundations.

| Business-object source                 | Canonical declaration                                                                                 | Observed structure                                                                                                                                                                                                                               |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `master.tax_jurisdiction`              | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L115)      | Status column: `master.tax_identity_status_d        NOT NULL DEFAULT 'draft'`. Representative constraints: `tax_jurisdiction_code_chk`, `tax_jurisdiction_name_chk`, `tax_jurisdiction_description_chk`.                                         |
| `master.tax_type`                      | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L298)      | Status column: `master.tax_identity_status_d   NOT NULL DEFAULT 'draft'`. Representative constraints: `tax_type_code_chk`, `tax_type_name_chk`, `tax_type_description_chk`.                                                                      |
| `master.organization_tax_registration` | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L344)      | Status column: `master.organization_status_d NOT NULL DEFAULT 'active'`. Representative constraints: `organization_tax_registration_values_chk`, `organization_tax_registration_range_chk`, `organization_tax_registration_metadata_object_chk`. |
| `ledger.tax_calculation`               | [planes/neon/ledger/03_tables.sql](../../../server/db/ddl/planes/neon/ledger/03_tables.sql#L537)      | Representative constraints: `tax_calculation_rate_chk`, `tax_calculation_amount_chk`, `tax_calculation_reversal_chk`.                                                                                                                            |
| `ledger.tax_credit_movement`           | [planes/neon/ledger/03_tables.sql](../../../server/db/ddl/planes/neon/ledger/03_tables.sql#L612)      | Representative constraints: `tax_credit_movement_amount_chk`, `tax_credit_movement_reversal_chk`, `tax_credit_movement_self_chk`.                                                                                                                |
| `document.wht_certificate`             | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L4173) | Status column: `document.wht_certificate_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `wht_certificate_number_chk`, `wht_certificate_period_chk`, `wht_certificate_amount_chk`.                                               |

**Bounded source implementations:**

| Source                                                                                                                                              | Exported entry points                         | Test pointer, not execution evidence                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------ |
| [server/packages/services/finance/src/tax/tax-calculation-service.ts](../../../server/packages/services/finance/src/tax/tax-calculation-service.ts) | `TaxCalculationService`, `taxEvidenceHash`    | No same-name companion test linked; not a claim of no tests. |
| [server/packages/services/finance/src/tax/tax-credit-service.ts](../../../server/packages/services/finance/src/tax/tax-credit-service.ts)           | `TaxCreditService`, `rebuildTaxCreditBalance` | No same-name companion test linked; not a claim of no tests. |

**Design classification:** the primary workflow, business-role assignment, notifications, measures and tenant choices in this chapter are proposed. Only the separately stated foundation is source-supported. No exact UI statuses, statutory rules, approval thresholds or AI tools are inferred from these records.

<a id="evidence-faa"></a>

### Finance / Fixed Asset Accounting (`faa`)

[Business chapter](../finance.md#module-faa)

**Evidence position:** Source implementation present; activation unverified.

**Supported finding:** Asset-book, depreciation and transaction structures exist. Asset revaluation and close-readiness services have source implementations; this does not establish a depreciation execution service.

**Boundary / remaining work:** The complete capitalization, scheduled depreciation and disposal approval experience requires separate qualification.

| Business-object source             | Canonical declaration                                                                                 | Observed structure                                                                                                                                                                                                                           |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `master.asset`                     | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L2121)     | Status column: `master.asset_status_d   NOT NULL DEFAULT 'draft'`. Representative constraints: `asset_code_chk`, `asset_name_chk`, `asset_description_chk`.                                                                                  |
| `master.asset_book`                | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L2188)     | Status column: `master.asset_status_d             NOT NULL DEFAULT 'draft'`. Representative constraints: `asset_book_life_chk`, `asset_book_amounts_chk`, `asset_book_currency_chk`.                                                         |
| `document.asset_transaction`       | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L3869) | Status column: `document.asset_transaction_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `asset_transaction_amount_chk`, `asset_transaction_period_chk`, `asset_transaction_reversal_chk`.                                 |
| `document.depreciation_run`        | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L2693) | Status column: `document.depreciation_run_status_d NOT NULL DEFAULT 'planned'`. Representative constraints: `depreciation_run_code_chk`, `depreciation_run_name_chk`, `depreciation_run_key_chk`.                                            |
| `document.depreciation_schedule`   | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L2791) | Status column: `document.depreciation_schedule_status_d    NOT NULL DEFAULT 'planned'`. Representative constraints: `depreciation_schedule_amounts_chk`, `depreciation_schedule_actual_pair_chk`, `depreciation_schedule_actual_status_chk`. |
| `ledger.asset_revaluation_reserve` | [planes/neon/ledger/03_tables.sql](../../../server/db/ddl/planes/neon/ledger/03_tables.sql#L643)      | Representative constraints: `asset_revaluation_reserve_amount_chk`, `asset_revaluation_reserve_carrying_chk`, `asset_revaluation_reserve_recoverable_chk`.                                                                                   |

**Bounded source implementations:**

| Source                                                                                                                                        | Exported entry points                                                                              | Test pointer, not execution evidence                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| [server/packages/services/finance/src/closing/closing-services.ts](../../../server/packages/services/finance/src/closing/closing-services.ts) | `FxRevaluationService`, `IcEliminationService`, `AssetRevaluationService`, `CloseReadinessService` | [Companion test source](../../../server/packages/services/finance/src/closing/closing-services.test.ts) |

**Design classification:** the primary workflow, business-role assignment, notifications, measures and tenant choices in this chapter are proposed. Only the separately stated foundation is source-supported. No exact UI statuses, statutory rules, approval thresholds or AI tools are inferred from these records.

<a id="evidence-srm"></a>

### Supply Chain / Supplier Management (`srm`)

[Business chapter](../supply-chain.md#module-srm)

**Evidence position:** Source implementation present; activation unverified.

**Supported finding:** Governed Business Partner services and supplier eligibility services exist. Source architecture separates cases, decisions, materialization and activation.

**Boundary / remaining work:** Specific qualification policies, communication routes and the full tenant onboarding journey still need deployment evidence.

| Business-object source                  | Canonical declaration                                                                                 | Observed structure                                                                                                                                                                                                                                      |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `master.business_partner`               | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L1856)     | Status column: `master.business_partner_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `business_partner_code_fmt_chk`, `business_partner_purpose_chk`, `business_partner_name_nonempty_chk`.                                          |
| `master.supplier`                       | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L1947)     | Status column: `master.supplier_status_d NOT NULL DEFAULT 'onboarding'`. Representative constraints: `supplier_code_fmt_chk`, `supplier_record_version_chk`, `supplier_metadata_object_chk`.                                                            |
| `master.company_code_supplier_profile`  | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L4764)     | Status column: `master.partner_extension_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `company_code_supplier_profile_metadata_chk`, `company_code_supplier_profile_status_pair_chk`, `company_code_supplier_profile_audit_pair_chk`. |
| `document.business_partner_request`     | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L4427) | Status column: `text        NOT NULL DEFAULT 'draft'`. Representative constraints: `business_partner_request_no_chk`, `business_partner_request_kind_chk`, `business_partner_request_source_chk`.                                                       |
| `document.supplier_activation_evidence` | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L5155) | Representative constraints: `supplier_activation_evidence_status_chk`, `supplier_activation_evidence_hash_chk`, `supplier_activation_evidence_key_chk`.                                                                                                 |

**Bounded source implementations:**

| Source                                                                                                                                                                        | Exported entry points                     | Test pointer, not execution evidence                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------ |
| [server/packages/services/master-data/src/business-partner-request-service.ts](../../../server/packages/services/master-data/src/business-partner-request-service.ts)         | `createBusinessPartnerRequestService`     | No same-name companion test linked; not a claim of no tests. |
| [server/packages/services/master-data/src/business-partner-eligibility-service.ts](../../../server/packages/services/master-data/src/business-partner-eligibility-service.ts) | `createBusinessPartnerEligibilityService` | No same-name companion test linked; not a claim of no tests. |

**Design classification:** the primary workflow, business-role assignment, notifications, measures and tenant choices in this chapter are proposed. Only the separately stated foundation is source-supported. No exact UI statuses, statutory rules, approval thresholds or AI tools are inferred from these records.

<a id="evidence-source"></a>

### Supply Chain / Strategic Sourcing (`source`)

[Business chapter](../supply-chain.md#module-source)

**Evidence position:** Data foundation defined; workflow proposed.

**Supported finding:** Sourcing events and company/demand/award allocations are defined.

**Boundary / remaining work:** Supplier response collection, scoring, negotiation and award workflow are proposed until executable services are verified.

| Business-object source                     | Canonical declaration                                                                                 | Observed structure                                                                                                                                                                                                                                                   |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `document.sourcing_event`                  | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L2842) | Status column: `document.sourcing_event_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `sourcing_event_code_chk`, `sourcing_event_name_chk`, `sourcing_event_central_buyer_chk`.                                                                    |
| `document.sourcing_event_company`          | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L2895) | Status column: `document.sourcing_company_status_d NOT NULL DEFAULT 'active'`. Representative constraints: `sourcing_event_company_metadata_chk`, `sourcing_event_company_status_pair_chk`, `sourcing_event_company_audit_pair_chk`.                                 |
| `document.sourcing_event_demand`           | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L2917) | Status column: `document.sourcing_demand_status_d NOT NULL DEFAULT 'included'`. Representative constraints: `sourcing_event_demand_quantity_chk`, `sourcing_event_demand_amount_chk`, `sourcing_event_demand_fx_chk`.                                                |
| `document.sourcing_event_award`            | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L2952) | Status column: `document.sourcing_award_status_d NOT NULL DEFAULT 'recommended'`. Representative constraints: `sourcing_event_award_amount_chk`, `sourcing_event_award_approval_pair_chk`, `sourcing_event_award_conversion_pair_chk`.                               |
| `document.sourcing_event_award_allocation` | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L2990) | Status column: `document.sourcing_award_allocation_status_d NOT NULL DEFAULT 'planned'`. Representative constraints: `sourcing_event_award_allocation_quantity_chk`, `sourcing_event_award_allocation_amount_chk`, `sourcing_event_award_allocation_conversion_chk`. |

**Runtime evidence:** no module-specific service behavior is claimed by this review. Shared platform services are dependencies, not proof of this workflow.

**Design classification:** the primary workflow, business-role assignment, notifications, measures and tenant choices in this chapter are proposed. Only the separately stated foundation is source-supported. No exact UI statuses, statutory rules, approval thresholds or AI tools are inferred from these records.

<a id="evidence-contract"></a>

### Supply Chain / Contract Management (`contract`)

[Business chapter](../supply-chain.md#module-contract)

**Evidence position:** Source implementation present; activation unverified.

**Supported finding:** The shared commitment model and fulfillment service provide related foundations; a separate universal legal-contract lifecycle was not established.

**Boundary / remaining work:** Clause authoring, signature integration, obligation reminders and renewal workflows remain proposed.

| Business-object source                   | Canonical declaration                                                                                 | Observed structure                                                                                                                                                                                                             |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `document.commitment`                    | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L254)  | Status column: `document.commitment_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `commitment_code_chk`, `commitment_name_chk`, `commitment_order_type_chk`.                                                 |
| `document.commitment_line`               | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L325)  | Status column: `document.commitment_line_status_d NOT NULL DEFAULT 'open'`. Representative constraints: `commitment_line_no_chk`, `commitment_line_description_chk`, `commitment_line_source_chk`.                             |
| `document.commitment_release_allocation` | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L407)  | Representative constraints: `commitment_release_allocation_self_chk`, `commitment_release_allocation_amount_chk`, `commitment_release_allocation_reversal_chk`.                                                                |
| `document.intercompany_agreement`        | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L3932) | Status column: `document.intercompany_agreement_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `intercompany_agreement_number_chk`, `intercompany_agreement_company_chk`, `intercompany_agreement_dates_chk`. |

**Bounded source implementations:**

| Source                                                                                                                                          | Exported entry points | Test pointer, not execution evidence                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------ |
| [server/packages/services/finance/src/ledger/commitment-service.ts](../../../server/packages/services/finance/src/ledger/commitment-service.ts) | `CommitmentService`   | No same-name companion test linked; not a claim of no tests. |

**Design classification:** the primary workflow, business-role assignment, notifications, measures and tenant choices in this chapter are proposed. Only the separately stated foundation is source-supported. No exact UI statuses, statutory rules, approval thresholds or AI tools are inferred from these records.

<a id="evidence-buy"></a>

### Supply Chain / Procurement (`buy`)

[Business chapter](../supply-chain.md#module-buy)

**Evidence position:** Source implementation present; activation unverified.

**Supported finding:** Requisition, purchase-order commitment, receipt and service-acceptance structures exist. Commitment fulfillment services are implemented in source.

**Boundary / remaining work:** End-to-end requisition approval, supplier order transmission and receipt-to-invoice automation require explicit qualification.

| Business-object source                 | Canonical declaration                                                                                 | Observed structure                                                                                                                                                                                                                 |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `document.purchase_requisition`        | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L1116) | Status column: `document.requisition_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `purchase_requisition_code_chk`, `purchase_requisition_name_chk`, `purchase_requisition_dates_chk`.                           |
| `document.commitment`                  | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L254)  | Status column: `document.commitment_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `commitment_code_chk`, `commitment_name_chk`, `commitment_order_type_chk`.                                                     |
| `document.purchase_order_confirmation` | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L1240) | Status column: `document.confirmation_status_d NOT NULL DEFAULT 'received'`. Representative constraints: `purchase_order_confirmation_code_chk`, `purchase_order_confirmation_name_chk`, `purchase_order_confirmation_amount_chk`. |
| `document.receipt`                     | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L1403) | Status column: `document.receipt_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `receipt_code_chk`, `receipt_name_chk`, `receipt_source_chk`.                                                                     |
| `document.service_sheet`               | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L1525) | Status column: `document.service_sheet_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `service_sheet_code_chk`, `service_sheet_name_chk`, `service_sheet_period_chk`.                                             |
| `ledger.commitment_fulfillment`        | [planes/neon/ledger/03_tables.sql](../../../server/db/ddl/planes/neon/ledger/03_tables.sql#L343)      | Representative constraints: `commitment_fulfillment_amount_chk`, `commitment_fulfillment_quantity_chk`, `commitment_fulfillment_fx_chk`.                                                                                           |

**Bounded source implementations:**

| Source                                                                                                                                          | Exported entry points | Test pointer, not execution evidence                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------ |
| [server/packages/services/finance/src/ledger/commitment-service.ts](../../../server/packages/services/finance/src/ledger/commitment-service.ts) | `CommitmentService`   | No same-name companion test linked; not a claim of no tests. |

**Design classification:** the primary workflow, business-role assignment, notifications, measures and tenant choices in this chapter are proposed. Only the separately stated foundation is source-supported. No exact UI statuses, statutory rules, approval thresholds or AI tools are inferred from these records.

<a id="evidence-demand"></a>

### Supply Chain / Demand & Supply Planning (`demand`)

[Business chapter](../supply-chain.md#module-demand)

**Evidence position:** Source implementation present; activation unverified.

**Supported finding:** Planning scenario structures and financial planning-run/output services exist as supporting foundations.

**Boundary / remaining work:** The inspected planning service manages financial amounts and run lifecycle; it does not establish demand forecasting, supply optimization or material-requirements calculations.

| Business-object source            | Canonical declaration                                                                                 | Observed structure                                                                                                                                                                                      |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `document.planning_scenario`      | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L3766) | Status column: `document.planning_scenario_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `planning_scenario_code_chk`, `planning_scenario_version_chk`, `planning_scenario_name_chk`. |
| `document.planning_scenario_line` | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L3813) | Representative constraints: `planning_scenario_line_number_chk`, `planning_scenario_line_fiscal_year_chk`, `planning_scenario_line_period_chk`.                                                         |
| `ledger.planning_run`             | [planes/neon/ledger/03_tables.sql](../../../server/db/ddl/planes/neon/ledger/03_tables.sql#L90)       | Status column: `ledger.planning_run_status_d NOT NULL DEFAULT 'pending'`. Representative constraints: `planning_run_retry_self_chk`, `planning_run_version_chk`, `planning_run_hash_chk`.               |
| `ledger.planning_output`          | [planes/neon/ledger/03_tables.sql](../../../server/db/ddl/planes/neon/ledger/03_tables.sql#L139)      | Representative constraints: `planning_output_fiscal_year_chk`, `planning_output_period_chk`, `planning_output_wbs_project_chk`.                                                                         |
| `control.planning_model`          | [planes/neon/control/03_tables.sql](../../../server/db/ddl/planes/neon/control/03_tables.sql#L690)    | Status column: `control.planning_record_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `planning_model_code_fmt_chk`, `planning_model_name_chk`, `planning_model_fiscal_range_chk`.    |
| `master.bom`                      | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L4192)     | Status column: `master.bom_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `bom_code_fmt_chk`, `bom_name_chk`, `bom_quantity_chk`.                                                      |

**Bounded source implementations:**

| Source                                                                                                                                          | Exported entry points                         | Test pointer, not execution evidence                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [server/packages/services/finance/src/planning/planning-service.ts](../../../server/packages/services/finance/src/planning/planning-service.ts) | `PlanningRunService`, `PlanningOutputService` | [Companion test source](../../../server/packages/services/finance/src/planning/planning-service.test.ts) |

**Design classification:** the primary workflow, business-role assignment, notifications, measures and tenant choices in this chapter are proposed. Only the separately stated foundation is source-supported. No exact UI statuses, statutory rules, approval thresholds or AI tools are inferred from these records.

<a id="evidence-inventory"></a>

### Supply Chain / Inventory Management (`inventory`)

[Business chapter](../supply-chain.md#module-inventory)

**Evidence position:** Source implementation present; activation unverified.

**Supported finding:** Inventory movement, balance query/rebuild and valuation-related services exist.

**Boundary / remaining work:** Warehouse task orchestration, counting approvals and all physical movement entry channels require separate qualification.

| Business-object source             | Canonical declaration                                                                                 | Observed structure                                                                                                                                                              |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `master.item`                      | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L3909)     | Status column: `master.catalog_record_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `item_code_fmt_chk`, `item_name_chk`, `item_description_chk`.             |
| `master.warehouse`                 | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L3315)     | Status column: `master.organization_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `warehouse_code_chk`, `warehouse_name_chk`, `warehouse_description_chk`.    |
| `ledger.inventory_movement`        | [planes/neon/ledger/03_tables.sql](../../../server/db/ddl/planes/neon/ledger/03_tables.sql#L392)      | Representative constraints: `inventory_movement_sequence_chk`, `inventory_movement_quantity_chk`, `inventory_movement_cost_chk`.                                                |
| `ledger.inventory_balance`         | [planes/neon/ledger/03_tables.sql](../../../server/db/ddl/planes/neon/ledger/03_tables.sql#L457)      | Representative constraints: `inventory_balance_value_chk`, `inventory_balance_sequence_chk`, `inventory_balance_key_chk`.                                                       |
| `ledger.inventory_valuation_layer` | [planes/neon/ledger/03_tables.sql](../../../server/db/ddl/planes/neon/ledger/03_tables.sql#L495)      | Representative constraints: `inventory_valuation_layer_quantity_chk`, `inventory_valuation_layer_value_chk`, `inventory_valuation_layer_consumption_pair_chk`.                  |
| `document.stocktake`               | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L2265) | Status column: `document.stocktake_status_d NOT NULL DEFAULT 'planned'`. Representative constraints: `stocktake_code_fmt_chk`, `stocktake_name_chk`, `stocktake_reference_chk`. |

**Bounded source implementations:**

| Source                                                                                                                                              | Exported entry points                                                                                                  | Test pointer, not execution evidence                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [server/packages/services/finance/src/inventory/inventory-service.ts](../../../server/packages/services/finance/src/inventory/inventory-service.ts) | `ValuationLayerService`, `InventoryBalanceService`, `InventoryQueryService`, `InventoryMovementService`, `rebuildFifo` | [Companion test source](../../../server/packages/services/finance/src/inventory/inventory-service.test.ts) |

**Design classification:** the primary workflow, business-role assignment, notifications, measures and tenant choices in this chapter are proposed. Only the separately stated foundation is source-supported. No exact UI statuses, statutory rules, approval thresholds or AI tools are inferred from these records.

<a id="evidence-wms"></a>

### Supply Chain / Warehouse Management (`wms`)

[Business chapter](../supply-chain.md#module-wms)

**Evidence position:** Supporting foundation only; workflow proposed.

**Supported finding:** Warehouse and stock/receipt/delivery structures are supporting foundations.

**Boundary / remaining work:** Dedicated bin, handling-unit, picking-task and scanning workflows were not identified in the inspected canonical inventory; this operational design is proposed.

| Business-object source      | Canonical declaration                                                                                 | Observed structure                                                                                                                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `master.warehouse`          | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L3315)     | Status column: `master.organization_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `warehouse_code_chk`, `warehouse_name_chk`, `warehouse_description_chk`.          |
| `document.receipt`          | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L1403) | Status column: `document.receipt_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `receipt_code_chk`, `receipt_name_chk`, `receipt_source_chk`.                        |
| `document.delivery_note`    | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L1308) | Status column: `document.delivery_note_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `delivery_note_code_chk`, `delivery_note_name_chk`, `delivery_note_dates_chk`. |
| `ledger.inventory_movement` | [planes/neon/ledger/03_tables.sql](../../../server/db/ddl/planes/neon/ledger/03_tables.sql#L392)      | Representative constraints: `inventory_movement_sequence_chk`, `inventory_movement_quantity_chk`, `inventory_movement_cost_chk`.                                                      |

**Runtime evidence:** no module-specific service behavior is claimed by this review. Shared platform services are dependencies, not proof of this workflow.

**Design classification:** the primary workflow, business-role assignment, notifications, measures and tenant choices in this chapter are proposed. Only the separately stated foundation is source-supported. No exact UI statuses, statutory rules, approval thresholds or AI tools are inferred from these records.

<a id="evidence-qms"></a>

### Supply Chain / Quality Management (`qms`)

[Business chapter](../supply-chain.md#module-qms)

**Evidence position:** Supporting foundation only; workflow proposed.

**Supported finding:** Receipt and item records can anchor quality context.

**Boundary / remaining work:** A dedicated inspection plan, nonconformance and corrective-action lifecycle was not identified in the inspected canonical inventory; these capabilities are proposed.

| Business-object source   | Canonical declaration                                                                                 | Observed structure                                                                                                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `document.receipt`       | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L1403) | Status column: `document.receipt_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `receipt_code_chk`, `receipt_name_chk`, `receipt_source_chk`.                         |
| `document.service_sheet` | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L1525) | Status column: `document.service_sheet_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `service_sheet_code_chk`, `service_sheet_name_chk`, `service_sheet_period_chk`. |
| `master.item`            | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L3909)     | Status column: `master.catalog_record_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `item_code_fmt_chk`, `item_name_chk`, `item_description_chk`.                    |

**Runtime evidence:** no module-specific service behavior is claimed by this review. Shared platform services are dependencies, not proof of this workflow.

**Design classification:** the primary workflow, business-role assignment, notifications, measures and tenant choices in this chapter are proposed. Only the separately stated foundation is source-supported. No exact UI statuses, statutory rules, approval thresholds or AI tools are inferred from these records.

<a id="evidence-logistics"></a>

### Supply Chain / Transportation & Logistics (`logistics`)

[Business chapter](../supply-chain.md#module-logistics)

**Evidence position:** Supporting foundation only; workflow proposed.

**Supported finding:** Delivery and scheduling records provide supporting shipment context.

**Boundary / remaining work:** Carrier booking, shipment tracking, proof-of-delivery and freight settlement workflows require dedicated implementation verification.

| Business-object source   | Canonical declaration                                                                                 | Observed structure                                                                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `document.delivery_note` | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L1308) | Status column: `document.delivery_note_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `delivery_note_code_chk`, `delivery_note_name_chk`, `delivery_note_dates_chk`.               |
| `document.schedule_line` | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L1751) | Status column: `document.schedule_status_d NOT NULL DEFAULT 'active'`. Representative constraints: `schedule_line_number_chk`, `schedule_line_quantity_chk`, `schedule_line_fulfillment_state_chk`. |
| `master.warehouse`       | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L3315)     | Status column: `master.organization_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `warehouse_code_chk`, `warehouse_name_chk`, `warehouse_description_chk`.                        |
| `document.sales_order`   | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L2182) | Status column: `document.sales_order_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `sales_order_code_fmt_chk`, `sales_order_requested_date_chk`, `sales_order_total_chk`.         |

**Runtime evidence:** no module-specific service behavior is claimed by this review. Shared platform services are dependencies, not proof of this workflow.

**Design classification:** the primary workflow, business-role assignment, notifications, measures and tenant choices in this chapter are proposed. Only the separately stated foundation is source-supported. No exact UI statuses, statutory rules, approval thresholds or AI tools are inferred from these records.

<a id="evidence-crm"></a>

### Commercial / Customer Relationship Management (`crm`)

[Business chapter](../commercial.md#module-crm)

**Evidence position:** Data foundation defined; workflow proposed.

**Supported finding:** Opportunity, company allocation and quotation structures are defined; probability and amount constraints provide data-level controls.

**Boundary / remaining work:** Full lead capture, campaign management and opportunity stage automation are not established by the inspected source.

| Business-object source               | Canonical declaration                                                                                 | Observed structure                                                                                                                                                                                              |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `master.customer`                    | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L1987)     | Status column: `master.customer_status_d NOT NULL DEFAULT 'prospect'`. Representative constraints: `customer_code_fmt_chk`, `customer_record_version_chk`, `customer_metadata_object_chk`.                      |
| `document.sales_opportunity`         | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L2350) | Status column: `document.sales_opportunity_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `sales_opportunity_code_fmt_chk`, `sales_opportunity_name_chk`, `sales_opportunity_amount_pair_chk`. |
| `document.sales_opportunity_company` | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L2391) | Status column: `document.sales_participation_status_d NOT NULL DEFAULT 'active'`. Representative constraints: `sales_opportunity_company_status_pair_chk`, `sales_opportunity_company_audit_pair_chk`.          |
| `document.sales_quotation`           | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L2411) | Status column: `document.sales_quotation_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `sales_quotation_code_fmt_chk`, `sales_quotation_name_chk`, `sales_quotation_validity_chk`.            |

**Runtime evidence:** no module-specific service behavior is claimed by this review. Shared platform services are dependencies, not proof of this workflow.

**Design classification:** the primary workflow, business-role assignment, notifications, measures and tenant choices in this chapter are proposed. Only the separately stated foundation is source-supported. No exact UI statuses, statutory rules, approval thresholds or AI tools are inferred from these records.

<a id="evidence-sale"></a>

### Commercial / Sales & Order Management (`sale`)

[Business chapter](../commercial.md#module-sale)

**Evidence position:** Data foundation defined; workflow proposed.

**Supported finding:** Order, quotation and intercompany allocation structures are defined.

**Boundary / remaining work:** Order approval, credit admission, stock reservation and customer billing orchestration require additional service and deployment evidence.

| Business-object source                          | Canonical declaration                                                                                 | Observed structure                                                                                                                                                                                                                                                              |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `document.sales_order`                          | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L2182) | Status column: `document.sales_order_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `sales_order_code_fmt_chk`, `sales_order_requested_date_chk`, `sales_order_total_chk`.                                                                                     |
| `document.sales_order_line`                     | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L2218) | Status column: `text        NOT NULL DEFAULT 'open'`. Representative constraints: `sales_order_line_number_chk`, `sales_order_line_description_chk`, `sales_order_line_quantity_chk`.                                                                                           |
| `document.sales_quotation`                      | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L2411) | Status column: `document.sales_quotation_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `sales_quotation_code_fmt_chk`, `sales_quotation_name_chk`, `sales_quotation_validity_chk`.                                                                            |
| `document.sales_order_intercompany_fulfillment` | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L2504) | Status column: `document.intercompany_fulfillment_status_d NOT NULL DEFAULT 'planned'`. Representative constraints: `sales_order_intercompany_fulfillment_amount_chk`, `sales_order_intercompany_fulfillment_company_chk`, `sales_order_intercompany_fulfillment_metadata_chk`. |
| `master.customer`                               | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L1987)     | Status column: `master.customer_status_d NOT NULL DEFAULT 'prospect'`. Representative constraints: `customer_code_fmt_chk`, `customer_record_version_chk`, `customer_metadata_object_chk`.                                                                                      |

**Runtime evidence:** no module-specific service behavior is claimed by this review. Shared platform services are dependencies, not proof of this workflow.

**Design classification:** the primary workflow, business-role assignment, notifications, measures and tenant choices in this chapter are proposed. Only the separately stated foundation is source-supported. No exact UI statuses, statutory rules, approval thresholds or AI tools are inferred from these records.

<a id="evidence-pcm"></a>

### Commercial / Pricing & Commercial Management (`pcm`)

[Business chapter](../commercial.md#module-pcm)

**Evidence position:** Data foundation defined; workflow proposed.

**Supported finding:** Catalogue prices, pricing components and quotations provide price and commercial-term foundations.

**Boundary / remaining work:** A complete pricing engine, promotion/rebate settlement and margin approval workflow was not established by this review.

| Business-object source       | Canonical declaration                                                                                 | Observed structure                                                                                                                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `master.catalog_price`       | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L4143)     | Status column: `master.catalog_record_status_d NOT NULL DEFAULT 'active'`. Representative constraints: `catalog_price_type_chk`, `catalog_price_amount_chk`, `catalog_price_quantity_chk`.             |
| `master.condition_type`      | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L186)      | Status column: `master.pricing_condition_status_d       NOT NULL DEFAULT 'draft'`. Representative constraints: `condition_type_code_chk`, `condition_type_name_chk`, `condition_type_description_chk`. |
| `document.pricing_component` | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L1646) | Representative constraints: `pricing_component_sequence_chk`, `pricing_component_scope_chk`, `pricing_component_basis_value_chk`.                                                                      |
| `document.sales_quotation`   | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L2411) | Status column: `document.sales_quotation_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `sales_quotation_code_fmt_chk`, `sales_quotation_name_chk`, `sales_quotation_validity_chk`.   |

**Runtime evidence:** no module-specific service behavior is claimed by this review. Shared platform services are dependencies, not proof of this workflow.

**Design classification:** the primary workflow, business-role assignment, notifications, measures and tenant choices in this chapter are proposed. Only the separately stated foundation is source-supported. No exact UI statuses, statutory rules, approval thresholds or AI tools are inferred from these records.

<a id="evidence-hr"></a>

### People / Core Human Resources (`hr`)

[Business chapter](../people.md#module-hr)

**Evidence position:** Data foundation defined; workflow proposed.

**Supported finding:** Employment, position, work assignment, compensation and people-case structures are defined.

**Boundary / remaining work:** End-to-end hiring, transfer, compensation and departure workflows remain subject to implementation and activation review.

| Business-object source           | Canonical declaration                                                                                 | Observed structure                                                                                                                                                                                                              |
| -------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `master.person`                  | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L2369)     | Status column: `text        NOT NULL DEFAULT 'active'`. Representative constraints: `person_code_nonempty_chk`, `person_name_nonempty_chk`, `person_first_name_nonempty_chk`.                                                   |
| `master.employee`                | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L3082)     | Status column: `text        NOT NULL DEFAULT 'active'`. Representative constraints: `employee_code_nonempty_chk`, `employee_name_nonempty_chk`, `employee_number_nonempty_chk`.                                                 |
| `master.employment`              | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L3131)     | Status column: `text        NOT NULL DEFAULT 'active'`. Representative constraints: `employment_code_nonempty_chk`, `employment_name_nonempty_chk`, `employment_number_nonempty_chk`.                                           |
| `master.position`                | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L3045)     | Status column: `text        NOT NULL DEFAULT 'draft'`. Representative constraints: `position_code_nonempty_chk`, `position_name_nonempty_chk`, `position_parent_not_self_chk`.                                                  |
| `master.work_assignment`         | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L3180)     | Status column: `text        NOT NULL DEFAULT 'active'`. Representative constraints: `work_assignment_code_nonempty_chk`, `work_assignment_name_nonempty_chk`, `work_assignment_manager_not_self_chk`.                           |
| `master.compensation_assignment` | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L4433)     | Status column: `master.compensation_assignment_status_d NOT NULL DEFAULT 'planned'`. Representative constraints: `compensation_assignment_code_chk`, `compensation_assignment_amount_chk`, `compensation_assignment_dates_chk`. |
| `document.people_request`        | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L3224) | Status column: `document.hr_approval_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `people_request_code_chk`, `people_request_type_chk`, `people_request_target_chk`.                                         |
| `document.hr_case`               | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L3401) | Status column: `document.hr_case_status_d NOT NULL DEFAULT 'open'`. Representative constraints: `hr_case_code_chk`, `hr_case_name_chk`, `hr_case_type_chk`.                                                                     |
| `document.onboarding_case`       | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L3418) | Status column: `document.people_case_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `onboarding_case_code_chk`, `onboarding_case_name_chk`, `onboarding_case_json_chk`.                                        |
| `document.offboarding_case`      | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L3431) | Status column: `document.people_case_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `offboarding_case_code_chk`, `offboarding_case_name_chk`, `offboarding_case_json_chk`.                                     |

**Runtime evidence:** no module-specific service behavior is claimed by this review. Shared platform services are dependencies, not proof of this workflow.

**Design classification:** the primary workflow, business-role assignment, notifications, measures and tenant choices in this chapter are proposed. Only the separately stated foundation is source-supported. No exact UI statuses, statutory rules, approval thresholds or AI tools are inferred from these records.

<a id="evidence-tna"></a>

### People / Time & Attendance (`tna`)

[Business chapter](../people.md#module-tna)

**Evidence position:** Data foundation defined; workflow proposed.

**Supported finding:** Shift, attendance, adjustment and leave records are defined.

**Boundary / remaining work:** Time interpretation, overtime calculations, device feeds and approval-to-payroll integration were not verified end to end.

| Business-object source                   | Canonical declaration                                                                                 | Observed structure                                                                                                                                                                                                 |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `master.shift_type`                      | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L2738)     | Status column: `text        NOT NULL DEFAULT 'active'`. Representative constraints: `shift_type_code_nonempty_chk`, `shift_type_name_nonempty_chk`, `shift_type_break_chk`.                                        |
| `master.work_pattern`                    | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L2764)     | Status column: `text        NOT NULL DEFAULT 'active'`. Representative constraints: `work_pattern_code_nonempty_chk`, `work_pattern_name_nonempty_chk`, `work_pattern_type_chk`.                                   |
| `document.shift_assignment`              | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L3060) | Status column: `document.shift_assignment_status_d NOT NULL DEFAULT 'scheduled'`. Representative constraints: `shift_assignment_code_chk`, `shift_assignment_time_chk`, `shift_assignment_date_chk`.               |
| `document.time_punch`                    | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L3078) | Representative constraints: `time_punch_key_chk`, `time_punch_json_chk`, `time_punch_void_chk`.                                                                                                                    |
| `document.attendance_day`                | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L3094) | Status column: `document.attendance_day_status_d NOT NULL DEFAULT 'open'`. Representative constraints: `attendance_day_minutes_chk`, `attendance_day_punch_span_chk`, `attendance_day_version_chk`.                |
| `document.attendance_adjustment_request` | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L3114) | Status column: `document.hr_approval_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `attendance_adjustment_request_code_chk`, `attendance_adjustment_kind_chk`, `attendance_adjustment_json_chk`. |
| `document.leave_request`                 | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L3189) | Status column: `document.hr_approval_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `leave_request_code_chk`, `leave_request_dates_chk`, `leave_request_half_chk`.                                |
| `document.leave_balance_entry`           | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L3209) | Representative constraints: `leave_balance_entry_period_chk`, `leave_balance_entry_source_chk`, `leave_balance_entry_delta_chk`.                                                                                   |

**Runtime evidence:** no module-specific service behavior is claimed by this review. Shared platform services are dependencies, not proof of this workflow.

**Design classification:** the primary workflow, business-role assignment, notifications, measures and tenant choices in this chapter are proposed. Only the separately stated foundation is source-supported. No exact UI statuses, statutory rules, approval thresholds or AI tools are inferred from these records.

<a id="evidence-tal"></a>

### People / Talent Management (`tal`)

[Business chapter](../people.md#module-tal)

**Evidence position:** Supporting foundation only; workflow proposed.

**Supported finding:** Jobs, positions and lifecycle case records provide supporting foundations.

**Boundary / remaining work:** Dedicated applicant, performance-review, learning and succession models were not identified in the inspected inventory. Those capabilities are proposed rather than inferred from HR tables.

| Business-object source      | Canonical declaration                                                                                 | Observed structure                                                                                                                                                                          |
| --------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `master.person`             | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L2369)     | Status column: `text        NOT NULL DEFAULT 'active'`. Representative constraints: `person_code_nonempty_chk`, `person_name_nonempty_chk`, `person_first_name_nonempty_chk`.               |
| `master.position`           | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L3045)     | Status column: `text        NOT NULL DEFAULT 'draft'`. Representative constraints: `position_code_nonempty_chk`, `position_name_nonempty_chk`, `position_parent_not_self_chk`.              |
| `master.job`                | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L2639)     | Status column: `text        NOT NULL DEFAULT 'draft'`. Representative constraints: `job_code_nonempty_chk`, `job_name_nonempty_chk`, `job_status_chk`.                                      |
| `document.onboarding_case`  | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L3418) | Status column: `document.people_case_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `onboarding_case_code_chk`, `onboarding_case_name_chk`, `onboarding_case_json_chk`.    |
| `document.offboarding_case` | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L3431) | Status column: `document.people_case_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `offboarding_case_code_chk`, `offboarding_case_name_chk`, `offboarding_case_json_chk`. |

**Runtime evidence:** no module-specific service behavior is claimed by this review. Shared platform services are dependencies, not proof of this workflow.

**Design classification:** the primary workflow, business-role assignment, notifications, measures and tenant choices in this chapter are proposed. Only the separately stated foundation is source-supported. No exact UI statuses, statutory rules, approval thresholds or AI tools are inferred from these records.

<a id="evidence-payroll"></a>

### People / Payroll (`payroll`)

[Business chapter](../people.md#module-payroll)

**Evidence position:** Data foundation defined; workflow proposed.

**Supported finding:** Payroll periods, runs, result lines, pay configuration and declaration records are defined.

**Boundary / remaining work:** A qualified payroll calculation engine, jurisdiction rules, payslip delivery and filing integrations were not established by the inspected source.

| Business-object source              | Canonical declaration                                                                                 | Observed structure                                                                                                                                                                                                                      |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `master.pay_component`              | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L2827)     | Status column: `text        NOT NULL DEFAULT 'draft'`. Representative constraints: `pay_component_code_nonempty_chk`, `pay_component_name_nonempty_chk`, `pay_component_type_nonempty_chk`.                                             |
| `master.pay_structure`              | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L2885)     | Status column: `text        NOT NULL DEFAULT 'draft'`. Representative constraints: `pay_structure_code_nonempty_chk`, `pay_structure_name_nonempty_chk`, `pay_structure_effective_chk`.                                                 |
| `master.statutory_scheme`           | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L2933)     | Status column: `text        NOT NULL DEFAULT 'active'`. Representative constraints: `statutory_scheme_code_nonempty_chk`, `statutory_scheme_name_nonempty_chk`, `statutory_scheme_type_nonempty_chk`.                                   |
| `document.payroll_period`           | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L3444) | Status column: `document.payroll_period_status_d NOT NULL DEFAULT 'open'`. Representative constraints: `payroll_period_code_chk`, `payroll_period_name_chk`, `payroll_period_number_chk`.                                               |
| `document.payroll_run`              | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L3459) | Status column: `document.payroll_run_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `payroll_run_code_chk`, `payroll_run_name_chk`, `payroll_run_no_chk`.                                                              |
| `document.payroll_run_employee`     | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L3483) | Status column: `document.payroll_run_employee_status_d NOT NULL DEFAULT 'included'`. Representative constraints: `payroll_run_employee_reason_chk`, `payroll_run_employee_error_chk`, `payroll_run_employee_status_pair_chk`.           |
| `document.payroll_result`           | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L3496) | Status column: `document.payroll_result_status_d NOT NULL DEFAULT 'calculating'`. Representative constraints: `payroll_result_amount_chk`, `payroll_result_net_chk`, `payroll_result_json_chk`.                                         |
| `document.payroll_result_line`      | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L3514) | Representative constraints: `payroll_result_line_no_chk`, `payroll_result_line_amount_chk`, `payroll_result_line_component_chk`.                                                                                                        |
| `document.employee_tax_declaration` | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L3157) | Status column: `document.employee_tax_declaration_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `employee_tax_declaration_code_chk`, `employee_tax_declaration_year_chk`, `employee_tax_declaration_submit_pair_chk`. |

**Runtime evidence:** no module-specific service behavior is claimed by this review. Shared platform services are dependencies, not proof of this workflow.

**Design classification:** the primary workflow, business-role assignment, notifications, measures and tenant choices in this chapter are proposed. Only the separately stated foundation is source-supported. No exact UI statuses, statutory rules, approval thresholds or AI tools are inferred from these records.

<a id="evidence-workforce"></a>

### People / External Workforce (`workforce`)

[Business chapter](../people.md#module-workforce)

**Evidence position:** Source implementation present; activation unverified.

**Supported finding:** Source services support requisition publication guards, workforce requests, placement activation and engagement ending. The service-acceptance bridge links approved external work to canonical service sheets; retained older service-entry records are not its write target.

**Boundary / remaining work:** Publishing can be blocked by policy readiness. A full supplier-to-invoice journey is not established by service presence.

| Business-object source                     | Canonical declaration                                                                                 | Observed structure                                                                                                                                                                                               |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `document.workforce_requisition`           | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L5183) | Status column: `text NOT NULL DEFAULT 'draft'`. Representative constraints: `workforce_requisition_code_chk`, `workforce_requisition_name_chk`, `workforce_requisition_model_chk`.                               |
| `document.external_candidate_submission`   | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L5230) | Status column: `text NOT NULL DEFAULT 'submitted'`. Representative constraints: `external_candidate_submission_hash_chk`, `external_candidate_submission_rate_chk`, `external_candidate_submission_version_chk`. |
| `document.contingent_work_order`           | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L5269) | Status column: `text NOT NULL DEFAULT 'draft'`. Representative constraints: `contingent_work_order_code_chk`, `contingent_work_order_name_chk`, `contingent_work_order_revision_chk`.                            |
| `document.worker_engagement`               | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L5391) | Status column: `text NOT NULL DEFAULT 'pending'`. Representative constraints: `worker_engagement_code_chk`, `worker_engagement_source_chk`, `worker_engagement_class_chk`.                                       |
| `document.worker_operational_placement`    | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L5429) | Status column: `text NOT NULL DEFAULT 'active'`. Representative constraints: `worker_operational_placement_range_chk`, `worker_operational_placement_allocation_chk`, `worker_operational_placement_status_chk`. |
| `document.worker_compliance_item`          | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L5448) | Representative constraints: `worker_compliance_item_code_chk`, `worker_compliance_item_category_chk`, `worker_compliance_item_gate_chk`.                                                                         |
| `document.external_time_sheet`             | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L5493) | Status column: `text NOT NULL DEFAULT 'draft'`. Representative constraints: `external_time_sheet_code_chk`, `external_time_sheet_period_chk`, `external_time_sheet_submit_source_chk`.                           |
| `document.service_sheet_source_allocation` | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L5637) | Representative constraints: `service_sheet_source_allocation_source_chk`, `service_sheet_source_allocation_kind_chk`, `service_sheet_source_allocation_amount_chk`.                                              |

**Bounded source implementations:**

| Source                                                                                                                                                                                      | Exported entry points                       | Test pointer, not execution evidence                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| [server/packages/services/master-data/src/supplier-workforce-requisition-service.ts](../../../server/packages/services/master-data/src/supplier-workforce-requisition-service.ts)           | `createSupplierWorkforceRequisitionService` | No same-name companion test linked; not a claim of no tests.                                                                   |
| [server/packages/services/master-data/src/workforce-service.ts](../../../server/packages/services/master-data/src/workforce-service.ts)                                                     | `createWorkforceService`                    | No same-name companion test linked; not a claim of no tests.                                                                   |
| [server/packages/services/master-data/src/worker-engagement-lifecycle-service.ts](../../../server/packages/services/master-data/src/worker-engagement-lifecycle-service.ts)                 | `createWorkerEngagementLifecycleService`    | No same-name companion test linked; not a claim of no tests.                                                                   |
| [server/packages/services/finance/src/external-workforce/service-sheet-source-service.ts](../../../server/packages/services/finance/src/external-workforce/service-sheet-source-service.ts) | `ExternalWorkforceServiceSheetService`      | [Companion test source](../../../server/packages/services/finance/src/external-workforce/service-sheet-source-service.test.ts) |

**Design classification:** the primary workflow, business-role assignment, notifications, measures and tenant choices in this chapter are proposed. Only the separately stated foundation is source-supported. No exact UI statuses, statutory rules, approval thresholds or AI tools are inferred from these records.

<a id="evidence-prjcost"></a>

### Projects & Services / Project Management (`prjcost`)

[Business chapter](../projects-services.md#module-prjcost)

**Evidence position:** Data foundation defined; workflow proposed.

**Supported finding:** Project, work-breakdown and task structures exist; Finance provides related budget and accounting components.

**Boundary / remaining work:** Resource scheduling, progress approval, project billing and revenue recognition are not established by the project records alone.

| Business-object source              | Canonical declaration                                                                                 | Observed structure                                                                                                                                                                                                                                           |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `master.project`                    | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L4285)     | Status column: `master.project_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `project_code_fmt_chk`, `project_name_chk`, `project_description_chk`.                                                                                        |
| `master.project_wbs`                | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L4334)     | Status column: `master.project_record_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `project_wbs_code_fmt_chk`, `project_wbs_name_chk`, `project_wbs_no_self_parent_chk`.                                                                  |
| `master.project_item`               | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L4380)     | Status column: `master.project_record_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `project_item_code_fmt_chk`, `project_item_name_chk`, `project_item_quantity_chk`.                                                                     |
| `document.project_task`             | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L3569) | Status column: `document.project_task_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `project_task_code_fmt_chk`, `project_task_title_chk`, `project_task_planned_range_chk`.                                                               |
| `document.project_task_requirement` | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L3623) | Status column: `document.project_requirement_status_d NOT NULL DEFAULT 'planned'`. Representative constraints: `project_task_requirement_quantity_chk`, `project_task_requirement_metadata_object_chk`, `project_task_requirement_status_evidence_pair_chk`. |
| `document.budget_allocation`        | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L3716) | Status column: `document.budget_allocation_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `budget_allocation_fiscal_year_chk`, `budget_allocation_period_chk`, `budget_allocation_amount_chk`.                                              |

**Runtime evidence:** no module-specific service behavior is claimed by this review. Shared platform services are dependencies, not proof of this workflow.

**Design classification:** the primary workflow, business-role assignment, notifications, measures and tenant choices in this chapter are proposed. Only the separately stated foundation is source-supported. No exact UI statuses, statutory rules, approval thresholds or AI tools are inferred from these records.

<a id="evidence-psa"></a>

### Projects & Services / Professional Services (`psa`)

[Business chapter](../projects-services.md#module-psa)

**Evidence position:** Supporting foundation only; workflow proposed.

**Supported finding:** Project foundations exist. Statement-of-work and external-service structures support supplier-side engagements.

**Boundary / remaining work:** Supplier-side statements of work are not evidence of a complete customer professional-services billing model. Customer staffing, timesheets, utilization and billing require dedicated verification.

| Business-object source            | Canonical declaration                                                                                 | Observed structure                                                                                                                                                                             |
| --------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `master.project`                  | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L4285)     | Status column: `master.project_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `project_code_fmt_chk`, `project_name_chk`, `project_description_chk`.                          |
| `master.project_wbs`              | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L4334)     | Status column: `master.project_record_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `project_wbs_code_fmt_chk`, `project_wbs_name_chk`, `project_wbs_no_self_parent_chk`.    |
| `document.project_task`           | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L3569) | Status column: `document.project_task_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `project_task_code_fmt_chk`, `project_task_title_chk`, `project_task_planned_range_chk`. |
| `document.statement_of_work`      | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L5319) | Representative constraints: `statement_of_work_code_chk`, `statement_of_work_name_chk`, `statement_of_work_revision_chk`.                                                                      |
| `document.statement_of_work_item` | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L5368) | Status column: `text NOT NULL DEFAULT 'planned'`. Representative constraints: `statement_of_work_item_line_chk`, `statement_of_work_item_type_chk`, `statement_of_work_item_amount_chk`.       |
| `document.external_time_sheet`    | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L5493) | Status column: `text NOT NULL DEFAULT 'draft'`. Representative constraints: `external_time_sheet_code_chk`, `external_time_sheet_period_chk`, `external_time_sheet_submit_source_chk`.         |

**Runtime evidence:** no module-specific service behavior is claimed by this review. Shared platform services are dependencies, not proof of this workflow.

**Design classification:** the primary workflow, business-role assignment, notifications, measures and tenant choices in this chapter are proposed. Only the separately stated foundation is source-supported. No exact UI statuses, statutory rules, approval thresholds or AI tools are inferred from these records.

<a id="evidence-itsm"></a>

### Projects & Services / Service Management (`itsm`)

[Business chapter](../projects-services.md#module-itsm)

**Evidence position:** Supporting foundation only; workflow proposed.

**Supported finding:** Shared case, work-item and workflow records provide a potential orchestration foundation.

**Boundary / remaining work:** A dedicated service-ticket catalogue, incident/problem model and service-level timer implementation was not identified in this review.

| Business-object source      | Canonical declaration                                                                                | Observed structure                                                                                                                                                                                         |
| --------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `document.work_item`        | [common/document/03_tables.sql](../../../server/db/ddl/common/document/03_tables.sql#L1)             | Status column: `document.work_item_status_d NOT NULL DEFAULT 'open'`. Representative constraints: `work_item_type_chk`, `work_item_source_chk`, `work_item_claim_chk`.                                     |
| `document.workflow_request` | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L155) | Status column: `document.workflow_request_status_d NOT NULL DEFAULT 'pending'`. Representative constraints: `workflow_request_entity_chk`, `workflow_request_definition_chk`, `workflow_request_hash_chk`. |
| `document.entity_case`      | [common/document/03_tables.sql](../../../server/db/ddl/common/document/03_tables.sql#L50)            | Status column: `text NOT NULL DEFAULT 'draft'`. Representative constraints: `entity_case_code_chk`, `entity_case_entity_chk`, `entity_case_target_chk`.                                                    |
| `master.asset`              | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L2121)    | Status column: `master.asset_status_d   NOT NULL DEFAULT 'draft'`. Representative constraints: `asset_code_chk`, `asset_name_chk`, `asset_description_chk`.                                                |

**Runtime evidence:** no module-specific service behavior is claimed by this review. Shared platform services are dependencies, not proof of this workflow.

**Design classification:** the primary workflow, business-role assignment, notifications, measures and tenant choices in this chapter are proposed. Only the separately stated foundation is source-supported. No exact UI statuses, statutory rules, approval thresholds or AI tools are inferred from these records.

<a id="evidence-mfg"></a>

### Operations / Manufacturing (`mfg`)

[Business chapter](../operations-management.md#module-mfg)

**Evidence position:** Data foundation defined; workflow proposed.

**Supported finding:** Bills of materials and production order/component structures are defined, including quantity/date and completion-evidence constraints. Inventory services provide supporting stock behavior.

**Boundary / remaining work:** Capacity planning, shop-floor execution, quality release and full production costing need dedicated service qualification.

| Business-object source                | Canonical declaration                                                                                 | Observed structure                                                                                                                                                                                                |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `master.bom`                          | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L4192)     | Status column: `master.bom_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `bom_code_fmt_chk`, `bom_name_chk`, `bom_quantity_chk`.                                                                |
| `master.bom_component`                | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L4232)     | Status column: `master.catalog_record_status_d NOT NULL DEFAULT 'active'`. Representative constraints: `bom_component_line_chk`, `bom_component_quantity_chk`, `bom_component_scrap_chk`.                         |
| `document.production_order`           | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L2070) | Status column: `document.production_order_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `production_order_code_fmt_chk`, `production_order_quantity_chk`, `production_order_planned_range_chk`. |
| `document.production_order_component` | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L2131) | Status column: `text        NOT NULL DEFAULT 'planned'`. Representative constraints: `production_order_component_line_chk`, `production_order_component_quantity_chk`, `production_order_component_status_chk`.   |
| `ledger.inventory_movement`           | [planes/neon/ledger/03_tables.sql](../../../server/db/ddl/planes/neon/ledger/03_tables.sql#L392)      | Representative constraints: `inventory_movement_sequence_chk`, `inventory_movement_quantity_chk`, `inventory_movement_cost_chk`.                                                                                  |

**Runtime evidence:** no module-specific service behavior is claimed by this review. Shared platform services are dependencies, not proof of this workflow.

**Design classification:** the primary workflow, business-role assignment, notifications, measures and tenant choices in this chapter are proposed. Only the separately stated foundation is source-supported. No exact UI statuses, statutory rules, approval thresholds or AI tools are inferred from these records.

<a id="evidence-maint"></a>

### Operations / Maintenance Management (`maint`)

[Business chapter](../operations-management.md#module-maint)

**Evidence position:** Supporting foundation only; workflow proposed.

**Supported finding:** Asset identity and purchasing/stock/service records provide supporting foundations.

**Boundary / remaining work:** Dedicated maintenance plans, work orders, meter readings and preventive schedules were not identified in the inspected canonical inventory.

| Business-object source      | Canonical declaration                                                                                 | Observed structure                                                                                                                                                                     |
| --------------------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `master.asset`              | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L2121)     | Status column: `master.asset_status_d   NOT NULL DEFAULT 'draft'`. Representative constraints: `asset_code_chk`, `asset_name_chk`, `asset_description_chk`.                            |
| `master.site`               | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L2451)     | Status column: `text        NOT NULL DEFAULT 'draft'`. Representative constraints: `site_code_nonempty_chk`, `site_name_nonempty_chk`, `site_type_nonempty_chk`.                       |
| `document.service_sheet`    | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L1525) | Status column: `document.service_sheet_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `service_sheet_code_chk`, `service_sheet_name_chk`, `service_sheet_period_chk`. |
| `ledger.inventory_movement` | [planes/neon/ledger/03_tables.sql](../../../server/db/ddl/planes/neon/ledger/03_tables.sql#L392)      | Representative constraints: `inventory_movement_sequence_chk`, `inventory_movement_quantity_chk`, `inventory_movement_cost_chk`.                                                       |

**Runtime evidence:** no module-specific service behavior is claimed by this review. Shared platform services are dependencies, not proof of this workflow.

**Design classification:** the primary workflow, business-role assignment, notifications, measures and tenant choices in this chapter are proposed. Only the separately stated foundation is source-supported. No exact UI statuses, statutory rules, approval thresholds or AI tools are inferred from these records.

<a id="evidence-asset"></a>

### Assets & Facilities / Enterprise Asset Management (`asset`)

[Business chapter](../assets-facilities.md#module-asset)

**Evidence position:** Data foundation defined; workflow proposed.

**Supported finding:** Asset register, component and assignment-history structures are defined.

**Boundary / remaining work:** A complete acquisition, transfer and disposal approval workflow requires implementation verification; accounting services do not establish operational asset workflows.

| Business-object source            | Canonical declaration                                                                             | Observed structure                                                                                                                                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `master.asset`                    | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L2121) | Status column: `master.asset_status_d   NOT NULL DEFAULT 'draft'`. Representative constraints: `asset_code_chk`, `asset_name_chk`, `asset_description_chk`.                                                |
| `master.asset_class`              | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L2078) | Status column: `master.asset_class_status_d   NOT NULL DEFAULT 'active'`. Representative constraints: `asset_class_parent_self_chk`, `asset_class_code_chk`, `asset_class_name_chk`.                       |
| `master.asset_component`          | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L2239) | Status column: `master.asset_class_status_d     NOT NULL DEFAULT 'active'`. Representative constraints: `asset_component_not_self_chk`, `asset_component_allocation_chk`, `asset_component_effective_chk`. |
| `master.asset_assignment_history` | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L2282) | Representative constraints: `asset_assignment_coordinates_chk`, `asset_assignment_reference_pair_chk`, `asset_assignment_reason_chk`.                                                                      |
| `master.site`                     | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L2451) | Status column: `text        NOT NULL DEFAULT 'draft'`. Representative constraints: `site_code_nonempty_chk`, `site_name_nonempty_chk`, `site_type_nonempty_chk`.                                           |

**Runtime evidence:** no module-specific service behavior is claimed by this review. Shared platform services are dependencies, not proof of this workflow.

**Design classification:** the primary workflow, business-role assignment, notifications, measures and tenant choices in this chapter are proposed. Only the separately stated foundation is source-supported. No exact UI statuses, statutory rules, approval thresholds or AI tools are inferred from these records.

<a id="evidence-assetrems"></a>

### Assets & Facilities / Real Estate Management (`assetrems`)

[Business chapter](../assets-facilities.md#module-assetrems)

**Evidence position:** Supporting foundation only; workflow proposed.

**Supported finding:** Site, asset and shared commitment structures provide related foundations.

**Boundary / remaining work:** Dedicated property, lease, tenancy, rent schedule and common-area charge models were not identified in the inspected canonical inventory. The workflow is proposed.

| Business-object source | Canonical declaration                                                                                | Observed structure                                                                                                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `master.site`          | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L2451)    | Status column: `text        NOT NULL DEFAULT 'draft'`. Representative constraints: `site_code_nonempty_chk`, `site_name_nonempty_chk`, `site_type_nonempty_chk`.                                   |
| `master.asset`         | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L2121)    | Status column: `master.asset_status_d   NOT NULL DEFAULT 'draft'`. Representative constraints: `asset_code_chk`, `asset_name_chk`, `asset_description_chk`.                                        |
| `document.commitment`  | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L254) | Status column: `document.commitment_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `commitment_code_chk`, `commitment_name_chk`, `commitment_order_type_chk`.                     |
| `master.payment_term`  | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L1535)    | Status column: `master.payment_term_status_d              NOT NULL DEFAULT 'draft'`. Representative constraints: `payment_term_code_chk`, `payment_term_name_chk`, `payment_term_description_chk`. |

**Runtime evidence:** no module-specific service behavior is claimed by this review. Shared platform services are dependencies, not proof of this workflow.

**Design classification:** the primary workflow, business-role assignment, notifications, measures and tenant choices in this chapter are proposed. Only the separately stated foundation is source-supported. No exact UI statuses, statutory rules, approval thresholds or AI tools are inferred from these records.

<a id="evidence-assetfm"></a>

### Assets & Facilities / Facilities Management (`assetfm`)

[Business chapter](../assets-facilities.md#module-assetfm)

**Evidence position:** Supporting foundation only; workflow proposed.

**Supported finding:** Sites, assets and financial scope records provide supporting foundations.

**Boundary / remaining work:** Dedicated buildings/spaces, utility meters, occupancy and facilities-request workflows were not identified in the inspected canonical inventory.

| Business-object source   | Canonical declaration                                                                                 | Observed structure                                                                                                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `master.site`            | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L2451)     | Status column: `text        NOT NULL DEFAULT 'draft'`. Representative constraints: `site_code_nonempty_chk`, `site_name_nonempty_chk`, `site_type_nonempty_chk`.                       |
| `master.asset`           | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L2121)     | Status column: `master.asset_status_d   NOT NULL DEFAULT 'draft'`. Representative constraints: `asset_code_chk`, `asset_name_chk`, `asset_description_chk`.                            |
| `master.cost_center`     | [planes/neon/master/03_tables.sql](../../../server/db/ddl/planes/neon/master/03_tables.sql#L600)      | Status column: `master.organization_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `cost_center_code_chk`, `cost_center_name_chk`, `cost_center_category_chk`.        |
| `document.service_sheet` | [planes/neon/document/03_tables.sql](../../../server/db/ddl/planes/neon/document/03_tables.sql#L1525) | Status column: `document.service_sheet_status_d NOT NULL DEFAULT 'draft'`. Representative constraints: `service_sheet_code_chk`, `service_sheet_name_chk`, `service_sheet_period_chk`. |

**Runtime evidence:** no module-specific service behavior is claimed by this review. Shared platform services are dependencies, not proof of this workflow.

**Design classification:** the primary workflow, business-role assignment, notifications, measures and tenant choices in this chapter are proposed. Only the separately stated foundation is source-supported. No exact UI statuses, statutory rules, approval thresholds or AI tools are inferred from these records.

## Promotion and maintenance rules

To designate a capability as available, record the source revision, deployed image/configuration, active definition and permissions, target tenant/environment and current acceptance evidence. Exercise the relevant primary, denial, exception, retry and correction paths. Include actual provider and cross-module outcomes where the journey depends on them.

Keep handoff IDs H01–H16 consistent across the series. If ownership changes, update both sender and receiver chapters. Extend this matrix when a new module-specific service or data model replaces a supporting foundation. Keep proposed reporting and Atlas use cases marked as proposals until their own activation evidence exists.
