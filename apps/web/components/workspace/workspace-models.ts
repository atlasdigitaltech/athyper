import {
  BarChart3,
  Building2,
  CalendarDays,
  CheckCircle2,
  FileCheck2,
  FileText,
  GitBranch,
  HeadphonesIcon,
  Plus,
  Settings,
  Shield,
  ShoppingCart,
  Timer,
  Users,
  Wallet,
  Wrench,
} from "lucide-react";
import type {
  WorkspaceDashboardModel,
  WorkspaceEntityLink,
  WorkspaceEntitySection,
} from "./WorkspaceDashboard";

function section(
  key: WorkspaceEntitySection["key"],
  title: string,
  items: WorkspaceEntityLink[],
): WorkspaceEntitySection {
  return { key, title, items };
}

export const financeWorkspaceModel: WorkspaceDashboardModel = {
  href: "/finance",
  title: "Finance",
  description: "Accounting, AP, AR, cash, reporting, and period close",
  statusLabel: "Workspace dashboard",
  quickActions: [
    { label: "Create Journal", href: "/app/journal_entry/new", icon: Plus },
    { label: "Create Supplier Invoice", href: "/app/purchase_invoice/new", icon: FileText, variant: "outline" },
    { label: "Review Approvals", href: "/inbox?tab=approvals", icon: CheckCircle2, variant: "outline" },
    { label: "Open Reports", href: "/finance/reports", icon: BarChart3, variant: "outline" },
  ],
  modules: [
    {
      code: "ACC",
      label: "Core Accounting",
      description: "General ledger, AP, AR, fiscal controls, and close work.",
      sections: [
        section("work", "Work", [
          { label: "Journal Entries", href: "/app/journal_entry", archetype: "Doc", description: "Manual journals with workflow approval and posting.", primaryAction: "Create / post" },
          { label: "Purchase Invoice", href: "/app/purchase_invoice", archetype: "Doc", description: "Invoice matching, approval, posting, and holds." },
          { label: "Financial Reports", href: "/finance/reports", archetype: "Rich", description: "P&L, balance sheet, cash flow, and exports." },
        ]),
        section("masterData", "Master Data", [
          { label: "Chart of Accounts", href: "/finance/coa", archetype: "Rich", description: "Account hierarchy explorer and posting controls." },
          { label: "Spend Categories", href: "/workbench/supply-chain/spend-categories", archetype: "Rich", description: "Spend taxonomy, intent defaults, and company-code overrides." },
          { label: "Business Intents", href: "/finance/business-intents", archetype: "Rich", description: "Intent ontology, GL fallback, and approval policy overlays." },
          { label: "Business Partners", href: "/app/business_partner", archetype: "Rich", description: "Supplier and customer roles with company-code settings." },
          { label: "Cost Centers", href: "/app/cost_center", archetype: "Rich", description: "Cost accounting dimensions for posting and reporting." },
          { label: "Legal Entities", href: "/finance/admin?tab=legal-entities", archetype: "Rich", description: "Group hierarchy, consolidation, and operating entities.", adminOnly: true },
        ]),
        section("setup", "Setup", [
          { label: "Fiscal Periods", href: "/app/fiscal_period", archetype: "Simple", description: "Open, soft-close, and hard-close accounting periods.", adminOnly: true },
          { label: "Company Controls", href: "/finance/admin?tab=controls", archetype: "Rich", description: "Account class rules, reconciliation flags, and posting controls.", adminOnly: true },
          { label: "COA Mapping", href: "/finance/admin?tab=mapping", archetype: "Rich", description: "Cross-chart translation and reporting mappings.", adminOnly: true },
          { label: "Taxonomy Controls", href: "/workbench/supply-chain/spend-categories", archetype: "Rich", description: "Category and intent resolution controls.", adminOnly: true },
        ]),
      ],
    },
    {
      code: "PAY",
      label: "Payment Processing",
      description: "Collections, disbursements, payment methods, and reconciliation.",
      sections: [
        section("work", "Work", [
          { label: "Payment Entries", href: "/app/payment_entry", archetype: "Doc", description: "Outbound and inbound payments with settlement status.", primaryAction: "Create payment" },
          { label: "Payment Runs", href: "/document/payment-run", archetype: "Doc", description: "Batch disbursement review and release workflow." },
          { label: "AP Workbench", href: "/finance/ap", archetype: "Rich", description: "Payables invoices, aging buckets, and outbound payments." },
          { label: "AR Workbench", href: "/finance/ar", archetype: "Rich", description: "Receivables aging, inbound receipts, and customer balances." },
        ]),
        section("masterData", "Master Data", [
          { label: "Bank Accounts", href: "/app/bank_account", archetype: "Rich", description: "Bank account master data and account ownership." },
          { label: "Payment Terms", href: "/app/payment_term", archetype: "Simple", description: "Due date, discount, and settlement terms.", adminOnly: true },
          { label: "Payment Methods", href: "/app/payment_method", archetype: "Simple", description: "Cash, transfer, card, check, and gateway methods.", adminOnly: true },
        ]),
        section("setup", "Setup", [
          { label: "Bank House Config", href: "/app/bank_account_house_config", archetype: "Simple", description: "House bank settings and controlled reference data.", adminOnly: true },
          { label: "Payment Approval", href: "/setup/workflows", archetype: "Simple", description: "Approval routing for payment release.", adminOnly: true },
        ]),
      ],
    },
    {
      code: "TREASURY",
      label: "Treasury & Cash Management",
      description: "Cash positioning, bank reconciliation, liquidity, and exposure.",
      sections: [
        section("work", "Work", [
          { label: "Cash Flow", href: "/ledger/gl-workbench?tab=cash-flow", archetype: "Rich", description: "Liquidity view and forecasted cash movement." },
          { label: "Bank Reconciliation", href: "/finance/bank-recon", archetype: "Rich", description: "Statement review, clearing, and unreconciled items." },
        ]),
        section("masterData", "Master Data", [
          { label: "Bank Accounts", href: "/app/bank_account", archetype: "Rich", description: "Operational bank accounts and settlement settings." },
          { label: "Bank Parties", href: "/app/bank_party", archetype: "Rich", description: "Bank institutions, branches, and account providers." },
        ]),
        section("setup", "Setup", [
          { label: "Reconciliation Rules", href: "/finance/admin?tab=controls", archetype: "Simple", description: "Matching tolerances and clearing controls.", adminOnly: true },
        ]),
      ],
    },
    {
      code: "BUDGET",
      label: "Budget & Funds Control",
      description: "Budget planning, allocation, commitments, and availability checks.",
      sections: [
        section("work", "Work", [
          { label: "Budget Requests", href: "/document/budget-request", archetype: "Doc", description: "Budget change requests with approval workflow." },
          { label: "Budget Allocations", href: "/app/budget_allocation", archetype: "Rich", description: "Allocation tracking and commitment control." },
        ]),
        section("masterData", "Master Data", [
          { label: "Budget Profiles", href: "/app/budget_profile", archetype: "Rich", description: "Budget structures, controls, and ownership." },
        ]),
        section("setup", "Setup", [
          { label: "Funds Control Rules", href: "/setup/policies", archetype: "Simple", description: "Availability check policies and override rules.", adminOnly: true },
        ]),
      ],
    },
    {
      code: "PAYG",
      label: "Payment Gateway",
      description: "External payment provider connectivity and gateway status.",
      sections: [
        section("work", "Work", [
          { label: "Gateway Status", href: "/master/payment-gateway", archetype: "Rich", description: "Provider health, events, and settlement status." },
        ]),
        section("setup", "Setup", [
          { label: "Gateway Providers", href: "/setup/integrations/providers", archetype: "Simple", description: "Provider credentials, webhooks, and routing.", adminOnly: true },
        ]),
      ],
    },
  ],
  adminStudioHref: "/metadata-studio",
};

export const supplyChainWorkspaceModel: WorkspaceDashboardModel = {
  href: "/supply-chain",
  title: "Supply Chain",
  description: "Procurement, stock, goods movement, quality, and logistics",
  metrics: [
    { label: "Open POs", value: "42", detail: "Procurement queue" },
    { label: "Receipts Due", value: "18", detail: "Next 7 days" },
    { label: "Supplier Holds", value: "3", detail: "Need review" },
    { label: "Shipments", value: "11", detail: "In transit" },
  ],
  quickActions: [
    { label: "Create Requisition", href: "/app/requisition/new", icon: Plus },
    { label: "Create Purchase Order", href: "/app/purchase_order/new", icon: ShoppingCart, variant: "outline" },
    { label: "Review Approvals", href: "/inbox?workspace=supply-chain", icon: CheckCircle2, variant: "outline" },
    { label: "Supplier Intake", href: "/app/business_partner/new?mode=supplier", icon: Users, variant: "outline" },
  ],
  modules: [
    {
      code: "BUY",
      label: "Procurement",
      description: "Purchasing, requisitions, purchase orders, and receiving.",
      sections: [
        section("work", "Work", [
          { label: "Purchase Requisitions", href: "/document/purchase-requisition", archetype: "Doc", description: "Internal buying requests routed for approval.", primaryAction: "Create request" },
          { label: "Purchase Orders", href: "/app/purchase_order", archetype: "Doc", description: "Supplier commitments, approval, close, and cancellation.", primaryAction: "Create PO" },
          { label: "Receipts", href: "/document/receipt", archetype: "Doc", description: "Goods and service receipt confirmation." },
          { label: "Supplier Invoices", href: "/app/purchase_invoice", archetype: "Doc", description: "Invoice matching, approval, posting, and holds." },
        ]),
        section("masterData", "Master Data", [
          { label: "Business Partners", href: "/app/business_partner", archetype: "Rich", description: "Supplier and customer identity management." },
          { label: "Suppliers", href: "/app/supplier", archetype: "Rich", description: "Supplier lifecycle, qualification, and company-code profile." },
          { label: "Spend Categories", href: "/workbench/supply-chain/spend-categories", archetype: "Rich", description: "Procurement spend classification and policy overlays.", adminOnly: true },
        ]),
        section("setup", "Setup", [
          { label: "Supplier Policies", href: "/setup/policies", archetype: "Simple", description: "Controls for supplier onboarding and blocked spend.", adminOnly: true },
          { label: "Approval Workflow", href: "/setup/workflows", archetype: "Simple", description: "Requisition and PO routing rules.", adminOnly: true },
        ]),
      ],
    },
    {
      code: "SRM",
      label: "Supplier Relationship Management",
      description: "Supplier lifecycle, qualification, risk, and performance.",
      sections: [
        section("work", "Work", [
          { label: "Supplier Evaluations", href: "/master/supplier-evaluation", archetype: "Rich", description: "Performance scorecards and evaluation cycles." },
          { label: "Supplier Qualifications", href: "/app/supplier_qualification", archetype: "Doc", description: "Qualification requests and approval outcomes." },
        ]),
        section("masterData", "Master Data", [
          { label: "Suppliers", href: "/app/supplier", archetype: "Rich", description: "Supplier profiles, tax details, bank links, and risk status." },
          { label: "Supplier Certifications", href: "/app/business_partner_certification", archetype: "Rich", description: "Certificates, validity, and compliance evidence." },
        ]),
        section("setup", "Setup", [
          { label: "Qualification Rules", href: "/setup/policies", archetype: "Simple", description: "Rules for supplier eligibility and risk review.", adminOnly: true },
        ]),
      ],
    },
    {
      code: "SOURCE",
      label: "Sourcing",
      description: "RFQs, bids, supplier comparison, and award decisions.",
      sections: [
        section("work", "Work", [
          { label: "RFQs", href: "/document/rfq", archetype: "Doc", description: "Request for quotation events and supplier responses." },
          { label: "Quotations", href: "/document/quotation", archetype: "Doc", description: "Bid comparison and commercial evaluation." },
          { label: "Awards", href: "/document/award", archetype: "Doc", description: "Sourcing award approvals and conversion." },
        ]),
        section("setup", "Setup", [
          { label: "Sourcing Templates", href: "/setup/doc-services", archetype: "Simple", description: "RFQ document templates and print forms.", adminOnly: true },
        ]),
      ],
    },
    {
      code: "CONTRACT",
      label: "Contract Management",
      description: "Commercial contracts, obligations, terms, and renewals.",
      sections: [
        section("work", "Work", [
          { label: "Contracts", href: "/master/contract", archetype: "Rich", description: "Contract records, obligations, amendments, and renewal status." },
          { label: "Expiring Soon", href: "/master/contract?filter=expiring", archetype: "Rich", description: "Renewal attention list for contract owners." },
        ]),
        section("setup", "Setup", [
          { label: "Contract Workflows", href: "/setup/workflows", archetype: "Simple", description: "Review, approval, and renewal workflows.", adminOnly: true },
        ]),
      ],
    },
    {
      code: "INVENTORY",
      label: "Inventory Management",
      description: "Items, warehouses, stock levels, and inventory movement.",
      sections: [
        section("work", "Work", [
          { label: "Stock Levels", href: "/master/stock-level", archetype: "Rich", description: "On-hand, allocated, available, and safety stock." },
          { label: "Stock Movements", href: "/master/stock-movement", archetype: "Doc", description: "Inventory movement history and adjustments." },
        ]),
        section("masterData", "Master Data", [
          { label: "Items", href: "/app/item", archetype: "Rich", description: "Products, materials, and services catalog." },
          { label: "Warehouses", href: "/app/warehouse", archetype: "Rich", description: "Storage locations and inventory positions." },
          { label: "Item Categories", href: "/app/item_category", archetype: "Simple", description: "Item classification and defaults.", adminOnly: true },
        ]),
        section("setup", "Setup", [
          { label: "Inventory Controls", href: "/setup/policies", archetype: "Simple", description: "Valuation, movement, and count policies.", adminOnly: true },
        ]),
      ],
    },
    {
      code: "QMS",
      label: "Quality Management",
      description: "Inspections, quality exceptions, and corrective action.",
      sections: [
        section("work", "Work", [
          { label: "Inspections", href: "/master/inspection", archetype: "Doc", description: "Incoming and in-process inspection records." },
          { label: "NCRs", href: "/master/ncr", archetype: "Doc", description: "Non-conformance review and corrective action." },
        ]),
      ],
    },
    {
      code: "WMS",
      label: "Warehouse Management",
      description: "Bin management, putaway, picking, and packing.",
      sections: [
        section("work", "Work", [
          { label: "Warehouse Movements", href: "/master/warehouse-movement", archetype: "Doc", description: "Warehouse movement tasks and exceptions." },
          { label: "Locations", href: "/master/warehouse-location", archetype: "Rich", description: "Bins, zones, and storage rules." },
        ]),
      ],
    },
    {
      code: "LOGISTICS",
      label: "Transportation & Logistics",
      description: "Deliveries, shipments, carriers, and freight cost.",
      sections: [
        section("work", "Work", [
          { label: "Shipments", href: "/app/shipment", archetype: "Doc", description: "Shipment planning, carrier status, and milestones." },
          { label: "Deliveries", href: "/document/delivery", archetype: "Doc", description: "Delivery execution and proof of delivery." },
        ]),
        section("masterData", "Master Data", [
          { label: "Carriers", href: "/app/carrier", archetype: "Rich", description: "Carrier records, service levels, and contacts." },
        ]),
      ],
    },
  ],
  adminStudioHref: "/metadata-studio",
};

export const peopleWorkspaceModel: WorkspaceDashboardModel = {
  href: "/people",
  title: "People",
  description: "HR, payroll, attendance, and workforce management",
  metrics: [
    { label: "Active Employees", value: "248", detail: "Across company codes" },
    { label: "Leave Requests", value: "7", detail: "Waiting approval" },
    { label: "Payroll Runs", value: "1", detail: "Open cycle" },
    { label: "Onboarding", value: "5", detail: "In progress" },
  ],
  quickActions: [
    { label: "Create Employee", href: "/app/employee/new", icon: Plus },
    { label: "Review Leave", href: "/app/leave_request", icon: CalendarDays, variant: "outline" },
    { label: "Open Payroll", href: "/app/payroll_run", icon: Wallet, variant: "outline" },
  ],
  modules: [
    {
      code: "HR",
      label: "Human Resources",
      description: "Employee lifecycle, organization structure, leave, and attendance.",
      sections: [
        section("work", "Work", [
          { label: "Leave Requests", href: "/app/leave_request", archetype: "Doc", description: "Employee leave requests and approval flow.", primaryAction: "Approve" },
          { label: "Attendance", href: "/app/attendance", archetype: "Rich", description: "Attendance records, exceptions, and corrections." },
        ]),
        section("masterData", "Master Data", [
          { label: "Employees", href: "/app/employee", archetype: "Rich", description: "Employee profiles, assignments, and lifecycle state." },
          { label: "Positions", href: "/master/position", archetype: "Rich", description: "Position catalog and organization assignment." },
        ]),
        section("setup", "Setup", [
          { label: "Leave Types", href: "/app/leave_type", archetype: "Simple", description: "Leave policy lookup and entitlement mapping.", adminOnly: true },
          { label: "Holiday Calendars", href: "/app/holiday_calendar", archetype: "Simple", description: "Holiday schedules by country and company.", adminOnly: true },
        ]),
      ],
    },
    {
      code: "PAYROLL",
      label: "Payroll",
      description: "Payroll processing, pay registers, and statutory compliance.",
      sections: [
        section("work", "Work", [
          { label: "Payroll Runs", href: "/app/payroll_run", archetype: "Doc", description: "Payroll run preparation, review, approval, and posting." },
          { label: "Pay Register", href: "/master/pay-register", archetype: "Rich", description: "Employee pay summary and period output." },
        ]),
        section("setup", "Setup", [
          { label: "Payroll Controls", href: "/setup/policies", archetype: "Simple", description: "Payroll validation, approval, and posting controls.", adminOnly: true },
        ]),
      ],
    },
  ],
  adminStudioHref: "/metadata-studio",
};

export const projectsWorkspaceModel: WorkspaceDashboardModel = {
  href: "/projects",
  title: "Projects",
  description: "Project management, costing, service requests, and ITSM",
  metrics: [
    { label: "Active Projects", value: "18", detail: "Open portfolio" },
    { label: "Timesheets", value: "26", detail: "Need approval" },
    { label: "Tickets", value: "13", detail: "Open incidents" },
    { label: "Budget Alerts", value: "2", detail: "Need review" },
  ],
  quickActions: [
    { label: "Create Project", href: "/app/project/new", icon: Plus },
    { label: "Enter Timesheet", href: "/app/timesheet/new", icon: Timer, variant: "outline" },
    { label: "Open Tickets", href: "/app/support_ticket", icon: HeadphonesIcon, variant: "outline" },
  ],
  modules: [
    {
      code: "PRJCOST",
      label: "Project Management",
      description: "Projects, tasks, WBS, budgets, cost tracking, and revenue recognition.",
      sections: [
        section("work", "Work", [
          { label: "Projects", href: "/app/project", archetype: "Rich", description: "Project setup, milestones, budgets, and status." },
          { label: "Project Tasks", href: "/master/project-task", archetype: "Rich", description: "Task planning, ownership, and progress tracking." },
          { label: "Timesheets", href: "/app/timesheet", archetype: "Doc", description: "Time capture and approval against project tasks." },
        ]),
        section("setup", "Setup", [
          { label: "Project Controls", href: "/setup/policies", archetype: "Simple", description: "Budget, approval, and posting controls.", adminOnly: true },
        ]),
      ],
    },
    {
      code: "ITSM",
      label: "Service Management",
      description: "Tickets, SLAs, service workflow, and operational support.",
      sections: [
        section("work", "Work", [
          { label: "Support Tickets", href: "/app/support_ticket", archetype: "Doc", description: "Service requests, incidents, resolution, and SLA status." },
          { label: "Service Queue", href: "/master/ticket", archetype: "Rich", description: "Ticket triage and assignment queue." },
        ]),
        section("setup", "Setup", [
          { label: "SLA Policies", href: "/setup/policies", archetype: "Simple", description: "Priority, breach, and escalation rules.", adminOnly: true },
        ]),
      ],
    },
  ],
  adminStudioHref: "/metadata-studio",
};

export const manufacturingWorkspaceModel: WorkspaceDashboardModel = {
  href: "/manufacturing",
  title: "Manufacturing",
  description: "Production operations, BOM, and maintenance management",
  metrics: [
    { label: "Work Orders", value: "16", detail: "In production" },
    { label: "Maintenance", value: "5", detail: "Due this week" },
    { label: "BOM Changes", value: "3", detail: "Awaiting approval" },
    { label: "QC Holds", value: "2", detail: "Need review" },
  ],
  quickActions: [
    { label: "Create Work Order", href: "/app/work_order/new", icon: Plus },
    { label: "Open BOM", href: "/app/bom", icon: Settings, variant: "outline" },
    { label: "Maintenance Queue", href: "/app/maintenance_order", icon: Wrench, variant: "outline" },
  ],
  modules: [
    {
      code: "MFG",
      label: "Manufacturing",
      description: "BOMs, work orders, MRP, and production execution.",
      sections: [
        section("work", "Work", [
          { label: "Work Orders", href: "/app/work_order", archetype: "Doc", description: "Production orders, operations, and scheduling.", primaryAction: "Release" },
          { label: "Bill of Materials", href: "/app/bom", archetype: "Rich", description: "Product structures and component definitions." },
        ]),
        section("setup", "Setup", [
          { label: "Production Rules", href: "/setup/policies", archetype: "Simple", description: "Planning, release, and issue controls.", adminOnly: true },
        ]),
      ],
    },
    {
      code: "MAINT",
      label: "Maintenance Management",
      description: "Preventive and corrective maintenance for assets and equipment.",
      sections: [
        section("work", "Work", [
          { label: "Maintenance Orders", href: "/app/maintenance_order", archetype: "Doc", description: "Preventive and corrective maintenance work orders." },
          { label: "Equipment", href: "/master/equipment", archetype: "Rich", description: "Equipment records, service history, and location." },
        ]),
        section("setup", "Setup", [
          { label: "Maintenance Plans", href: "/app/maintenance_plan", archetype: "Simple", description: "Preventive schedule templates and triggers.", adminOnly: true },
        ]),
      ],
    },
  ],
  adminStudioHref: "/metadata-studio",
};

export const assetManagementWorkspaceModel: WorkspaceDashboardModel = {
  href: "/asset-management",
  title: "Asset Management",
  description: "Assets, property, leases, facilities, and lifecycle visibility",
  metrics: [
    { label: "Assets", value: "1,284", detail: "Registered" },
    { label: "Depreciation", value: "1", detail: "Run pending" },
    { label: "Leases", value: "9", detail: "Expiring soon" },
    { label: "Facilities Work", value: "6", detail: "Open orders" },
  ],
  quickActions: [
    { label: "Create Asset", href: "/app/asset/new", icon: Plus },
    { label: "Run Depreciation", href: "/master/depreciation-run", icon: BarChart3, variant: "outline" },
    { label: "Open Facilities", href: "/app/facility", icon: Building2, variant: "outline" },
  ],
  modules: [
    {
      code: "ASSET",
      label: "Asset Management",
      description: "Fixed asset register, lifecycle, depreciation, and disposals.",
      sections: [
        section("work", "Work", [
          { label: "Depreciation Runs", href: "/master/depreciation-run", archetype: "Doc", description: "Depreciation execution, review, and posting." },
        ]),
        section("masterData", "Master Data", [
          { label: "Fixed Assets", href: "/app/asset", archetype: "Rich", description: "Asset register, valuation, ownership, and lifecycle." },
        ]),
        section("setup", "Setup", [
          { label: "Asset Controls", href: "/setup/policies", archetype: "Simple", description: "Capitalization, depreciation, and disposal controls.", adminOnly: true },
        ]),
      ],
    },
    {
      code: "ASSETREMS",
      label: "Real Estate Asset Management",
      description: "Properties, leases, tenancy, rental billing, and CAM charges.",
      sections: [
        section("work", "Work", [
          { label: "Leases", href: "/app/lease", archetype: "Doc", description: "Lease records, renewals, terms, and billing status." },
        ]),
        section("masterData", "Master Data", [
          { label: "Properties", href: "/app/property", archetype: "Rich", description: "Property portfolio, units, ownership, and occupancy." },
        ]),
      ],
    },
    {
      code: "ASSETFM",
      label: "Facility Management",
      description: "Buildings, utilities, space, maintenance, and service cost centers.",
      sections: [
        section("work", "Work", [
          { label: "Facility Work Orders", href: "/document/facility-work-order", archetype: "Doc", description: "Facility requests, assignment, and completion status." },
        ]),
        section("masterData", "Master Data", [
          { label: "Facilities", href: "/app/facility", archetype: "Rich", description: "Buildings, spaces, utilities, and service ownership." },
        ]),
      ],
    },
  ],
  adminStudioHref: "/metadata-studio",
};

export const customerExperienceWorkspaceModel: WorkspaceDashboardModel = {
  href: "/customer-experience",
  title: "Customer Experience",
  description: "CRM, selling, order management, and customer billing",
  metrics: [
    { label: "Open Opportunities", value: "21", detail: "Pipeline" },
    { label: "Sales Orders", value: "14", detail: "Open fulfillment" },
    { label: "Invoices", value: "9", detail: "Awaiting payment" },
    { label: "Customer Blocks", value: "2", detail: "Need review" },
  ],
  quickActions: [
    { label: "Create Customer", href: "/app/customer/new", icon: Plus },
    { label: "Create Sales Order", href: "/app/sales_order/new", icon: ShoppingCart, variant: "outline" },
    { label: "Open Pipeline", href: "/master/opportunity", icon: FileCheck2, variant: "outline" },
  ],
  modules: [
    {
      code: "CRM",
      label: "Customer Relationship Management",
      description: "Leads, opportunities, accounts, contacts, and customer status.",
      sections: [
        section("work", "Work", [
          { label: "Opportunities", href: "/master/opportunity", archetype: "Rich", description: "Pipeline records, ownership, stage, and expected revenue." },
          { label: "Contacts", href: "/master/contact", archetype: "Rich", description: "Customer contacts and communication channels." },
        ]),
        section("masterData", "Master Data", [
          { label: "Customers", href: "/app/customer", archetype: "Rich", description: "Customer master records, credit terms, and contacts." },
          { label: "Customer Blocks", href: "/app/customer_block", archetype: "Simple", description: "Controlled block reasons and release status.", adminOnly: true },
        ]),
      ],
    },
    {
      code: "SALE",
      label: "Sales & Order Management",
      description: "Sales cycle, quotations, sales orders, invoices, and delivery.",
      sections: [
        section("work", "Work", [
          { label: "Sales Orders", href: "/app/sales_order", archetype: "Doc", description: "Order entry, fulfillment, and delivery tracking." },
          { label: "Sales Invoices", href: "/app/sales_invoice", archetype: "Doc", description: "Customer billing, approval, and AR handoff." },
          { label: "Sales Quotations", href: "/document/sales-quotation", archetype: "Doc", description: "Customer quotations and conversion to order." },
        ]),
        section("setup", "Setup", [
          { label: "Sales Workflow", href: "/setup/workflows", archetype: "Simple", description: "Quote, order, and invoice approval rules.", adminOnly: true },
        ]),
      ],
    },
  ],
  adminStudioHref: "/metadata-studio",
};

export const coreWorkspaceModel: WorkspaceDashboardModel = {
  href: "/core",
  title: "Core",
  description: "Infrastructure modules for metadata, identity, workflow, jobs, and integrations",
  metrics: [
    { label: "Core Modules", value: "13", detail: "Platform services" },
    { label: "Workflows", value: "Active", detail: "Approval engine" },
    { label: "Jobs", value: "Healthy", detail: "Automation runtime" },
    { label: "Notifications", value: "Live", detail: "Delivery services" },
  ],
  quickActions: [
    { label: "Open Metadata Studio", href: "/metadata-studio", icon: Settings },
    { label: "Workflow Setup", href: "/setup/workflows", icon: GitBranch, variant: "outline" },
    { label: "Identity Setup", href: "/setup/users", icon: Shield, variant: "outline" },
  ],
  modules: [
    {
      code: "META",
      label: "Metadata Studio",
      description: "Declarative entities, fields, forms, lists, and policies.",
      sections: [
        section("work", "Work", [
          { label: "Entities", href: "/setup/metadata", archetype: "Rich", description: "Registered entities, descriptors, and data models.", adminOnly: true },
          { label: "Descriptor Tool", href: "/setup/metadata/descriptor", archetype: "Rich", description: "Compiled descriptor inspection and diagnostics.", adminOnly: true },
          { label: "Schema ERD", href: "/setup/metadata/erd", archetype: "Rich", description: "Entity relationship visualization.", adminOnly: true },
        ]),
        section("setup", "Setup", [
          { label: "Lookup Domains", href: "/setup/metadata/lookups", archetype: "Simple", description: "Controlled lookup domains and values.", adminOnly: true },
          { label: "Entity Operations", href: "/setup/metadata/operations", archetype: "Simple", description: "Runtime action definitions and handlers.", adminOnly: true },
          { label: "Modules", href: "/setup/metadata/modules", archetype: "Simple", description: "Tenant module subscriptions and status.", adminOnly: true },
        ]),
      ],
    },
    {
      code: "IAM",
      label: "Identity & Access Management",
      description: "Users, roles, groups, permissions, and delegation.",
      sections: [
        section("work", "Work", [
          { label: "Users", href: "/setup/users", archetype: "Rich", description: "User accounts, grants, and workbench access.", adminOnly: true },
          { label: "Roles", href: "/setup/roles", archetype: "Rich", description: "Role assignments and permission packs.", adminOnly: true },
          { label: "Groups", href: "/setup/groups", archetype: "Rich", description: "Approval and security groups.", adminOnly: true },
        ]),
      ],
    },
    {
      code: "WFL",
      label: "Workflow Engine",
      description: "State machines, approvals, templates, and work items.",
      sections: [
        section("work", "Work", [
          { label: "Workflow Inbox", href: "/inbox", archetype: "Doc", description: "Pending approval tasks and work items." },
          { label: "Workflow Definitions", href: "/master/workflow-definition", archetype: "Rich", description: "Reusable workflow definitions.", adminOnly: true },
          { label: "Requests", href: "/master/workflow-request", archetype: "Doc", description: "Workflow request history and status.", adminOnly: true },
        ]),
        section("setup", "Setup", [
          { label: "Workflow Templates", href: "/setup/workflows", archetype: "Simple", description: "Approval templates and routing setup.", adminOnly: true },
        ]),
      ],
    },
    {
      code: "JOB",
      label: "Automation & Jobs",
      description: "Schedulers, job definitions, job runs, and background tasks.",
      sections: [
        section("work", "Work", [
          { label: "Job Definitions", href: "/master/job-definition", archetype: "Rich", description: "Scheduled and triggered job definitions.", adminOnly: true },
          { label: "Job Runs", href: "/master/job-run", archetype: "Doc", description: "Execution history, status, and failures.", adminOnly: true },
        ]),
      ],
    },
    {
      code: "INT",
      label: "Integration Hub",
      description: "API connections, providers, webhooks, and delivery events.",
      sections: [
        section("work", "Work", [
          { label: "Endpoints", href: "/setup/integrations", archetype: "Rich", description: "Integration endpoints and connection state.", adminOnly: true },
          { label: "Deliveries", href: "/setup/integrations/deliveries", archetype: "Doc", description: "Delivery attempts, retries, and errors.", adminOnly: true },
        ]),
        section("setup", "Setup", [
          { label: "Providers", href: "/setup/integrations/providers", archetype: "Simple", description: "Integration provider registry.", adminOnly: true },
          { label: "Webhooks", href: "/setup/integrations/webhooks", archetype: "Simple", description: "Webhook subscriptions and secrets.", adminOnly: true },
        ]),
      ],
    },
    {
      code: "NTF",
      label: "Notification Services",
      description: "Notifications, delivery channels, templates, and digests.",
      sections: [
        section("work", "Work", [
          { label: "All Notifications", href: "/notifications", archetype: "Doc", description: "Notification feed and delivery status." },
          { label: "Admin Console", href: "/setup/notifications", archetype: "Rich", description: "Notification templates and delivery setup.", adminOnly: true },
        ]),
      ],
    },
  ],
  adminStudioHref: "/metadata-studio",
};
