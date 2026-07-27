export type FinanceEntitySchema = "master" | "control" | "shared";
export type FinanceEntityScope = "tenant" | "company";

export interface FinanceEntityDirectoryItem {
  code: string;
  label: string;
  schema: FinanceEntitySchema;
  domain: string;
  href: string;
  scopeFilterField?: string;
}

export interface FinanceEntityDirectoryGroup {
  code: string;
  label: string;
  description: string;
  scope: FinanceEntityScope;
  schema: FinanceEntitySchema;
  items: readonly FinanceEntityDirectoryItem[];
}

type EntityDefinition = readonly [
  code: string,
  label: string,
  domain: string,
  scopeFilterField?: string,
  schemaOverride?: FinanceEntitySchema,
];

function entityItems(
  schema: FinanceEntitySchema,
  definitions: readonly EntityDefinition[],
): FinanceEntityDirectoryItem[] {
  return definitions.map(([code, label, domain, scopeFilterField, schemaOverride]) => ({
    code,
    label,
    schema: schemaOverride ?? schema,
    domain,
    href: `/app/${code}`,
    scopeFilterField,
  }));
}

/**
 * Complete Finance setup catalog for /setup/finance.
 *
 * This intentionally includes configuration roots and their directly
 * maintainable child tables. Documents, transactions, logs, runtime metadata,
 * security administration and generated app-index views are excluded.
 */
export const FINANCE_ENTITY_DIRECTORY: readonly FinanceEntityDirectoryGroup[] = [
  {
    code: "tenant-master",
    label: "Tenant — Master Data",
    description: "Shared Finance master data available across legal entities and company codes.",
    scope: "tenant",
    schema: "master",
    items: entityItems("master", [
      ["legal_entity", "Legal Entities", "Organization"],
      ["company_code", "Company Codes", "Organization"],
      ["chart_of_account", "Charts of Accounts", "Accounting"],
      ["gl_account", "GL Accounts", "Accounting"],
      ["ledger_book", "Ledger Books", "Accounting"],
      ["dimension_type", "Dimension Types", "Accounting"],
      ["dimension_value", "Dimension Values", "Accounting"],
      ["dimension_set", "Dimension Sets", "Accounting"],
      ["dimension_set_item", "Dimension Set Items", "Accounting"],
      ["business_intent", "Business Intents", "Accounting"],
      ["accounting_profile", "Accounting Profiles", "Accounting"],
      ["currency", "Currencies", "Currency & FX", undefined, "shared"],
      ["fx_rate", "Exchange Rates", "Currency & FX"],
      ["tax_jurisdiction", "Tax Jurisdictions", "Tax"],
      ["tax_type", "Tax Types", "Tax"],
      ["holiday_calendar", "Holiday Calendars", "Payments"],
      ["holiday_calendar_day", "Holiday Calendar Days", "Payments"],
      ["payment_term", "Payment Terms", "Payments"],
      ["payment_term_clause", "Payment Term Clauses", "Payments"],
      ["payment_term_discount_tier", "Payment Term Discount Tiers", "Payments"],
      ["payment_method", "Payment Methods", "Payments"],
      ["bank_party", "Banks", "Banking"],
      ["bank_account", "Bank Accounts", "Banking"],
      ["asset_class", "Asset Classes", "Assets"],
      ["budget_profile", "Budget Profiles", "Planning"],
      ["planning_model", "Planning Models", "Planning"],
      ["intercompany_trading_pair", "Intercompany Trading Pairs", "Intercompany"],
      ["cost_center", "Cost Centers", "Organization"],
      ["profit_center", "Profit Centers", "Organization"],
      ["site", "Sites", "Organization"],
      ["warehouse", "Warehouses", "Organization"],
      ["project", "Projects", "Organization"],
      ["project_item", "Project Items", "Organization"],
      ["change_reason_code", "Change Reason Codes", "Governance"],
    ]),
  },
  {
    code: "tenant-control",
    label: "Tenant — Control Configuration",
    description: "Shared Finance rules, policies, mappings and determination configuration.",
    scope: "tenant",
    schema: "control",
    items: entityItems("control", [
      ["fx_policy", "FX Policies", "Currency & FX"],
      ["rounding_rule", "Rounding Rules", "Tax"],
      ["tax_rate_schedule", "Tax Rate Schedules", "Tax"],
      ["tax_group", "Tax Groups", "Tax"],
      ["tax_group_version", "Tax Group Versions", "Tax"],
      ["tax_group_component", "Tax Group Components", "Tax"],
      ["tax_resolution_rule", "Tax Resolution Rules", "Tax"],
      ["wht_threshold_config", "WHT Threshold Configuration", "Tax"],
      ["fiscal_calendar_config", "Fiscal Calendar Configuration", "Accounting"],
      ["fiscal_calendar_period_rule", "Fiscal Calendar Period Rules", "Accounting"],
      ["posting_role_alias", "Posting Role Aliases", "Accounting"],
      ["book_posting_rule", "Book Posting Rules", "Accounting"],
      ["acct_profile_config", "Accounting Profile Configuration", "Accounting"],
      ["acct_profile_commitment_config", "Commitment Profile Configuration", "Accounting"],
      ["acct_profile_revenue_config", "Revenue Profile Configuration", "Accounting"],
      ["acct_profile_settlement_config", "Settlement Profile Configuration", "Accounting"],
      ["acct_profile_event", "Accounting Profile Events", "Accounting"],
      ["acct_profile_entry_template", "Accounting Entry Templates", "Accounting"],
      ["acct_profile_book_rule", "Accounting Profile Book Rules", "Accounting"],
      ["acct_profile_dimension_rule", "Accounting Profile Dimension Rules", "Accounting"],
      ["intent_to_accounting_profile_rule", "Intent to Accounting Profile Rules", "Accounting"],
      ["intent_profile_override", "Intent Profile Overrides", "Accounting"],
      ["dimension_policy", "Dimension Policies", "Accounting"],
      ["dimension_policy_allowed_value", "Dimension Policy Allowed Values", "Accounting"],
      ["commodity_classification_to_intent_rule", "Classification to Intent Rules", "Accounting"],
      ["commodity_category_buy_policy", "Commodity Buy Policies", "Accounting"],
      ["commodity_category_sell_policy", "Commodity Sell Policies", "Accounting"],
      ["commodity_category_inventory_policy", "Commodity Inventory Policies", "Accounting"],
      ["commodity_classification_config", "Commodity Classification Configuration", "Accounting"],
      ["commodity_code_to_category_rule", "Commodity Code to Category Rules", "Accounting"],
      ["bank_format_rule", "Bank Format Rules", "Banking"],
      ["bank_interface_profile", "Bank Interface Profiles", "Banking"],
      ["payment_method_interface_binding", "Payment Method Interface Bindings", "Payments"],
      ["payment_settlement_rule", "Payment Settlement Rules", "Payments"],
      ["asset_class_book_policy_template", "Asset Book Policy Templates", "Assets"],
      ["budget_check_config", "Budget Check Configuration", "Planning"],
      ["planning_driver", "Planning Drivers", "Planning"],
      ["planning_driver_formula", "Planning Driver Formulas", "Planning"],
      ["planning_driver_assumption", "Planning Driver Assumptions", "Planning"],
      ["planning_driver_version", "Planning Driver Versions", "Planning"],
    ]),
  },
  {
    code: "company-master",
    label: "Company Code — Master Data",
    description: "Master-data assignments and extensions for the selected company code.",
    scope: "company",
    schema: "master",
    items: entityItems("master", [
      ["company_code_chart_assignment", "Chart Assignments", "Accounting", "company_code_id"],
      ["company_code_gl_account", "Company GL Accounts", "Accounting", "company_code_id"],
      ["company_code_book_assignment", "Book Assignments", "Accounting", "company_code_id"],
      ["company_code_dimension_default", "Dimension Defaults", "Accounting", "company_code_id"],
      ["fiscal_period", "Fiscal Periods", "Accounting", "company_code_id"],
      ["bank_account_link", "Bank Account Links", "Banking", "company_code_id"],
      ["bank_account_house_config", "House Bank Configuration", "Banking", "company_code_id"],
      ["company_code_supplier_profile", "Supplier Company Profiles", "Payables", "company_code_id"],
      ["company_code_customer_profile", "Customer Company Profiles", "Receivables", "company_code_id"],
      ["organization_tax_registration", "Tax Registrations", "Tax", "company_code_id"],
      ["asset", "Assets", "Assets", "company_code_id"],
      ["asset_book", "Asset Books", "Assets", "company_code_id"],
      ["asset_component", "Asset Components", "Assets", "company_code_id"],
      ["asset_assignment_history", "Asset Assignment History", "Assets", "company_code_id"],
      ["budget_allocation", "Budget Allocations", "Planning", "company_code_id"],
    ]),
  },
  {
    code: "company-control",
    label: "Company Code — Control Configuration",
    description: "Company-specific policies, posting maps, calendar assignments and overrides.",
    scope: "company",
    schema: "control",
    items: entityItems("control", [
      ["fx_policy", "Company FX Policy Overrides", "Currency & FX", "scope_id"],
      ["company_fiscal_calendar_assignment", "Fiscal Calendar Assignments", "Accounting", "company_code_id"],
      ["posting_role_account_map", "Posting Role Account Maps", "Accounting", "company_code_id"],
      ["payment_method_company_policy", "Payment Method Company Policies", "Payments", "company_code_id"],
      ["supplier_posting_override", "Supplier Posting Overrides", "Payables", "company_code_id"],
      ["asset_class_book_policy", "Asset Class Book Policies", "Assets", "company_code_id"],
      ["finance_posting_rollout_policy", "Finance Posting Rollout Policies", "Governance", "company_code_id"],
    ]),
  },
] as const;
