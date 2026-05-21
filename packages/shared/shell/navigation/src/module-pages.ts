/**
 * @athyper/navigation — Module Page Definitions
 *
 * Static mapping of every module code → the navigable pages shown in the
 * ContextPanel accordion when that module is expanded.
 *
 * Routes map to existing app/(shell) routes:
 *   /document/[documentType]  — document lists
 *   /master/[entity]          — entity lists
 *   /ledger/*                 — GL / finance views
 *   /setup/*                  — admin setup
 *
 * Keep each module to ≤ 6 items. Secondary pages are reachable via ⌘K.
 * Add `withModuleParam: true` for routes that should append ?module=CODE.
 */

export interface ModulePage {
  /** Stable key for React rendering. */
  key: string;
  label: string;
  href: string;
  /** Append ?module={code} to the href (e.g. saved-views). */
  withModuleParam?: boolean;
}

export const MODULE_PAGES: Record<string, ModulePage[]> = {
  // ── Supply chain ──────────────────────────────────────────────────────────
  BUY: [
    { key: "pr",        label: "Requisitions",      href: "/document/purchase-requisition" },
    { key: "po",        label: "Purchase orders",   href: "/document/purchase-order" },
    { key: "receipts",  label: "Receipts",          href: "/document/receipt" },
    { key: "bp",        label: "Business Partners", href: "/app/business-partner" },
    { key: "views",     label: "Saved views",       href: "/saved-views", withModuleParam: true },
  ],
  SOURCE: [
    { key: "rfq",       label: "RFQs",              href: "/document/rfq" },
    { key: "quotes",    label: "Quotations",        href: "/document/quotation" },
    { key: "awards",    label: "Awards",            href: "/document/award" },
    { key: "views",     label: "Saved views",       href: "/saved-views", withModuleParam: true },
  ],
  CONTRACT: [
    { key: "list",      label: "Contracts",         href: "/master/contract" },
    { key: "expiring",  label: "Expiring soon",     href: "/master/contract?filter=expiring" },
    { key: "views",     label: "Saved views",       href: "/saved-views", withModuleParam: true },
  ],
  SRM: [
    { key: "partners",  label: "Business Partners", href: "/app/business-partner" },
    { key: "suppliers", label: "Suppliers",         href: "/app/supplier" },
    { key: "evaluate",  label: "Evaluations",       href: "/master/supplier-evaluation" },
    { key: "views",     label: "Saved views",       href: "/saved-views", withModuleParam: true },
  ],
  INVENTORY: [
    { key: "items",     label: "Items",             href: "/master/inventory-item" },
    { key: "stock",     label: "Stock levels",      href: "/master/stock-level" },
    { key: "movements", label: "Movements",         href: "/master/stock-movement" },
    { key: "views",     label: "Saved views",       href: "/saved-views", withModuleParam: true },
  ],
  QMS: [
    { key: "inspections",label: "Inspections",      href: "/master/inspection" },
    { key: "ncr",       label: "NCRs",              href: "/master/ncr" },
    { key: "views",     label: "Saved views",       href: "/saved-views", withModuleParam: true },
  ],
  SUBCON: [
    { key: "orders",    label: "Subcon orders",     href: "/document/subcon-order" },
    { key: "views",     label: "Saved views",       href: "/saved-views", withModuleParam: true },
  ],
  DEMAND: [
    { key: "forecasts", label: "Forecasts",         href: "/master/demand-forecast" },
    { key: "plans",     label: "Plans",             href: "/master/demand-plan" },
    { key: "views",     label: "Saved views",       href: "/saved-views", withModuleParam: true },
  ],
  WMS: [
    { key: "locations", label: "Locations",         href: "/master/warehouse-location" },
    { key: "movements", label: "Movements",         href: "/master/warehouse-movement" },
    { key: "views",     label: "Saved views",       href: "/saved-views", withModuleParam: true },
  ],
  LOGISTICS: [
    { key: "deliveries",label: "Deliveries",        href: "/document/delivery" },
    { key: "shipments", label: "Shipments",         href: "/document/shipment" },
    { key: "views",     label: "Saved views",       href: "/saved-views", withModuleParam: true },
  ],

  // ── Finance ───────────────────────────────────────────────────────────────
  ACC: [
    { key: "profiles",  label: "Accounting profiles", href: "/finance/accounting-profiles" },
    { key: "ap",        label: "AP workbench",      href: "/finance/ap" },
    { key: "ar",        label: "AR workbench",      href: "/finance/ar" },
    { key: "journals",  label: "Journal entries",   href: "/finance/gl?tab=journals" },
    { key: "gl",        label: "GL workbench",      href: "/finance/gl" },
    { key: "coa",       label: "Chart of accounts", href: "/finance/coa" },
  ],
  PAY: [
    { key: "runs",      label: "Payment runs",      href: "/document/payment-run" },
    { key: "bank",      label: "Bank reconciliation",href: "/finance/bank-recon" },
    { key: "views",     label: "Saved views",       href: "/saved-views", withModuleParam: true },
  ],
  BUDGET: [
    { key: "budgets",   label: "Budgets",           href: "/master/budget" },
    { key: "requests",  label: "Budget requests",   href: "/document/budget-request" },
    { key: "views",     label: "Saved views",       href: "/saved-views", withModuleParam: true },
  ],
  TREASURY: [
    { key: "accounts",  label: "Bank accounts",     href: "/master/bank-account" },
    { key: "cashflow",  label: "Cash flow",         href: "/ledger/gl-workbench?tab=cash-flow" },
    { key: "views",     label: "Saved views",       href: "/saved-views", withModuleParam: true },
  ],
  ASSET: [
    { key: "assets",    label: "Assets",            href: "/master/asset" },
    { key: "deprec",    label: "Depreciation",      href: "/master/depreciation-run" },
    { key: "views",     label: "Saved views",       href: "/saved-views", withModuleParam: true },
  ],
  PAYG: [
    { key: "gateway",   label: "Gateway status",    href: "/master/payment-gateway" },
    { key: "views",     label: "Saved views",       href: "/saved-views", withModuleParam: true },
  ],

  // ── Customer experience ───────────────────────────────────────────────────
  CRM: [
    { key: "customers", label: "Customers",         href: "/master/customer" },
    { key: "contacts",  label: "Contacts",          href: "/master/contact" },
    { key: "opportunities",label: "Opportunities",  href: "/master/opportunity" },
    { key: "views",     label: "Saved views",       href: "/saved-views", withModuleParam: true },
  ],
  SALE: [
    { key: "orders",    label: "Sales orders",      href: "/document/sales-order" },
    { key: "quotes",    label: "Quotations",        href: "/document/sales-quotation" },
    { key: "invoices",  label: "Sales invoices",    href: "/document/sales-invoice" },
    { key: "views",     label: "Saved views",       href: "/saved-views", withModuleParam: true },
  ],

  // ── People management ──────────────────────────────────────────────────────
  HR: [
    { key: "employees", label: "Employees",         href: "/master/employee" },
    { key: "positions", label: "Positions",         href: "/master/position" },
    { key: "leaves",    label: "Leave requests",    href: "/document/leave-request" },
    { key: "views",     label: "Saved views",       href: "/saved-views", withModuleParam: true },
  ],
  PAYROLL: [
    { key: "runs",      label: "Payroll runs",      href: "/master/payroll-run" },
    { key: "views",     label: "Saved views",       href: "/saved-views", withModuleParam: true },
  ],

  // ── Project management ────────────────────────────────────────────────────
  PRJCOST: [
    { key: "projects",  label: "Projects",          href: "/master/project" },
    { key: "tasks",     label: "Tasks",             href: "/master/project-task" },
    { key: "timesheet", label: "Timesheets",        href: "/document/timesheet" },
    { key: "views",     label: "Saved views",       href: "/saved-views", withModuleParam: true },
  ],
  ITSM: [
    { key: "tickets",   label: "Tickets",           href: "/master/ticket" },
    { key: "views",     label: "Saved views",       href: "/saved-views", withModuleParam: true },
  ],

  // ── Manufacturing & operations ─────────────────────────────────────────────
  MFG: [
    { key: "orders",    label: "Work orders",       href: "/document/work-order" },
    { key: "bom",       label: "Bill of materials", href: "/master/bill-of-materials" },
    { key: "views",     label: "Saved views",       href: "/saved-views", withModuleParam: true },
  ],
  MAINT: [
    { key: "orders",    label: "Maintenance orders",href: "/document/maintenance-order" },
    { key: "equipment", label: "Equipment",         href: "/master/equipment" },
    { key: "views",     label: "Saved views",       href: "/saved-views", withModuleParam: true },
  ],

  // ── Asset management ──────────────────────────────────────────────────────
  ASSETREMS: [
    { key: "properties",label: "Properties",        href: "/master/property" },
    { key: "leases",    label: "Leases",            href: "/master/lease" },
    { key: "views",     label: "Saved views",       href: "/saved-views", withModuleParam: true },
  ],
  ASSETFM: [
    { key: "facilities",label: "Facilities",        href: "/master/facility" },
    { key: "workorders",label: "Work orders",       href: "/document/facility-work-order" },
    { key: "views",     label: "Saved views",       href: "/saved-views", withModuleParam: true },
  ],

  // ── Platform / admin ──────────────────────────────────────────────────────
  FND: [
    { key: "tenants",    label: "Tenants",          href: "/setup/tenant" },
    { key: "blueprints", label: "Blueprints",       href: "/setup/blueprints" },
    { key: "plans",      label: "Subscription plans", href: "/setup/platform/plans" },
  ],
  META: [
    { key: "entities",    label: "Entities",          href: "/setup/metadata" },
    { key: "lookups",     label: "Lookup domains",    href: "/setup/metadata/lookups" },
    { key: "lifecycle",   label: "Lifecycle bindings",href: "/setup/metadata/lifecycle" },
    { key: "operations",  label: "Entity operations", href: "/setup/metadata/operations" },
    { key: "fieldgroups", label: "Field groups",      href: "/setup/metadata/field-groups" },
    { key: "erd",         label: "Schema ERD",        href: "/setup/metadata/erd" },
    { key: "descriptor",  label: "Descriptor tool",   href: "/setup/metadata/descriptor" },
    { key: "modules",     label: "Modules",           href: "/setup/metadata/modules" },
    { key: "reference",   label: "Reference data",    href: "/setup/metadata/reference" },
    { key: "studio",      label: "Meta Studio",       href: "/metadata-studio" },
  ],
  IAM: [
    { key: "users",      label: "Users",            href: "/setup/users" },
    { key: "roles",      label: "Roles",            href: "/setup/roles" },
    { key: "groups",     label: "Groups",           href: "/setup/groups" },
  ],
  AUD: [
    { key: "log",        label: "Audit log",        href: "/audit/events" },
    { key: "governance", label: "Cycle runs",       href: "/governance/cycle-runs" },
    { key: "moderation", label: "Moderation",       href: "/setup/moderation" },
    { key: "gov-setup",  label: "Cycle types",      href: "/setup/governance" },
  ],
  POL: [
    { key: "policies",   label: "Policy definitions", href: "/setup/policies" },
    { key: "evaluator",  label: "Evaluator",          href: "/setup/policies?tab=evaluator" },
  ],
  WFL: [
    { key: "definitions", label: "Workflows",    href: "/master/workflow-definition" },
    { key: "templates",   label: "Templates",    href: "/setup/workflows" },
    { key: "compliance",  label: "Compliance",   href: "/setup/workflows/compliance" },
    { key: "requests",    label: "Requests",     href: "/master/workflow-request" },
    { key: "inbox",       label: "Inbox",        href: "/inbox" },
  ],
  JOB: [
    { key: "jobs",       label: "Jobs",             href: "/master/job-definition" },
    { key: "runs",       label: "Runs",             href: "/master/job-run" },
  ],
  NTF: [
    { key: "admin",      label: "Admin console",    href: "/setup/notifications" },
    { key: "all",        label: "All notifications",href: "/notifications" },
  ],
  INT: [
    { key: "endpoints",  label: "Endpoints",        href: "/setup/integrations" },
    { key: "providers",  label: "Providers",        href: "/setup/integrations/providers" },
    { key: "outbox",     label: "Outbox",           href: "/setup/integrations/outbox" },
    { key: "deliveries", label: "Deliveries",       href: "/setup/integrations/deliveries" },
    { key: "webhooks",   label: "Webhooks",         href: "/setup/integrations/webhooks" },
  ],
  DOC: [
    { key: "all",        label: "Documents",        href: "/master/document" },
  ],
  CMS: [
    { key: "browser",    label: "Content",          href: "/content" },
    { key: "quarantine", label: "Quarantine",        href: "/setup/content" },
  ],
  ACT: [
    { key: "activity",   label: "Activity feed",    href: "/master/activity" },
  ],
  REL: [
    { key: "lookup",     label: "Lookup values",    href: "/master/lookup-value" },
    { key: "entities",   label: "Shared entities",  href: "/master/shared-entity" },
  ],
};

/**
 * Get the primary navigation href for a module.
 * Used when clicking the module label itself (not a page sub-item).
 * Returns the first non-"Saved views" page, or a fallback.
 */
export function getModulePrimaryHref(code: string): string {
  const pages = MODULE_PAGES[code];
  if (!pages || pages.length === 0) return `/module/${code.toLowerCase()}`;
  const primary = pages.find((p) => p.key !== "views");
  return primary?.href ?? pages[0]?.href ?? `/module/${code.toLowerCase()}`;
}
