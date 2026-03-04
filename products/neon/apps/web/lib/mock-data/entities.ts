// lib/mock-data/entities.ts
//
// Centralized mock data for entity API routes.
// Single source of truth — consumed by both list and single-record endpoints.
// Will be replaced with DB queries when persistence layer is implemented.

// ---------------------------------------------------------------------------
// Account (Master entity — Finance / Core Accounting)
// ---------------------------------------------------------------------------

export interface AccountRecord {
    [key: string]: unknown;
    id: string;
    account_code: string;
    account_name: string;
    account_type: "Asset" | "Liability" | "Equity" | "Revenue" | "Expense";
    currency: string;
    parent_account: string | null;
    status: "Active" | "Inactive";
    description: string;
    created_at: string;
}

export const ACCOUNTS: AccountRecord[] = [
    {
        id: "ACC-001",
        account_code: "1000",
        account_name: "Cash and Cash Equivalents",
        account_type: "Asset",
        currency: "USD",
        parent_account: null,
        status: "Active",
        description: "Primary cash account for operating funds",
        created_at: "2025-01-15",
    },
    {
        id: "ACC-002",
        account_code: "1100",
        account_name: "Accounts Receivable",
        account_type: "Asset",
        currency: "USD",
        parent_account: null,
        status: "Active",
        description: "Trade receivables from customers",
        created_at: "2025-01-15",
    },
    {
        id: "ACC-003",
        account_code: "2000",
        account_name: "Accounts Payable",
        account_type: "Liability",
        currency: "USD",
        parent_account: null,
        status: "Active",
        description: "Trade payables to suppliers",
        created_at: "2025-01-15",
    },
    {
        id: "ACC-004",
        account_code: "3000",
        account_name: "Retained Earnings",
        account_type: "Equity",
        currency: "USD",
        parent_account: null,
        status: "Active",
        description: "Cumulative retained earnings",
        created_at: "2025-01-15",
    },
    {
        id: "ACC-005",
        account_code: "4000",
        account_name: "Sales Revenue (Legacy)",
        account_type: "Revenue",
        currency: "USD",
        parent_account: null,
        status: "Inactive",
        description: "Deprecated revenue account — migrated to 4100",
        created_at: "2025-01-15",
    },
    {
        id: "ACC-006",
        account_code: "4100",
        account_name: "Sales Revenue",
        account_type: "Revenue",
        currency: "USD",
        parent_account: null,
        status: "Active",
        description: "Primary revenue from product and service sales",
        created_at: "2025-03-01",
    },
    {
        id: "ACC-007",
        account_code: "5000",
        account_name: "Cost of Goods Sold",
        account_type: "Expense",
        currency: "USD",
        parent_account: null,
        status: "Active",
        description: "Direct costs of goods and services sold",
        created_at: "2025-01-15",
    },
    {
        id: "ACC-008",
        account_code: "6000",
        account_name: "Operating Expenses",
        account_type: "Expense",
        currency: "USD",
        parent_account: null,
        status: "Active",
        description: "General and administrative operating expenses",
        created_at: "2025-01-15",
    },
];

// Lookup map keyed by record ID for O(1) access in single-record endpoint
export const ACCOUNTS_BY_ID = Object.fromEntries(ACCOUNTS.map((a) => [a.id, a]));

// ---------------------------------------------------------------------------
// Purchase Invoice (Document entity — Supply Chain / Customer Experience)
// ---------------------------------------------------------------------------

export interface PurchaseInvoiceRecord {
    [key: string]: unknown;
    id: string;
    invoice_number: string;
    supplier: string;
    invoice_date: string;
    due_date: string;
    currency: string;
    net_amount: number;
    tax_amount: number;
    total_amount: number;
    status: "Draft" | "Submitted" | "Approved" | "Paid" | "Cancelled";
    payment_terms: string;
}

export const PURCHASE_INVOICES: PurchaseInvoiceRecord[] = [
    {
        id: "PI-001",
        invoice_number: "INV-2026-0001",
        supplier: "Acme Industrial Supplies",
        invoice_date: "2026-02-01",
        due_date: "2026-03-03",
        currency: "USD",
        net_amount: 12500.0,
        tax_amount: 1125.0,
        total_amount: 13625.0,
        status: "Draft",
        payment_terms: "Net 30",
    },
    {
        id: "PI-002",
        invoice_number: "INV-2026-0002",
        supplier: "Global Tech Components",
        invoice_date: "2026-01-28",
        due_date: "2026-02-27",
        currency: "USD",
        net_amount: 8750.0,
        tax_amount: 787.5,
        total_amount: 9537.5,
        status: "Submitted",
        payment_terms: "Net 30",
    },
    {
        id: "PI-003",
        invoice_number: "INV-2026-0003",
        supplier: "Premier Office Solutions",
        invoice_date: "2026-01-15",
        due_date: "2026-02-14",
        currency: "USD",
        net_amount: 3200.0,
        tax_amount: 288.0,
        total_amount: 3488.0,
        status: "Approved",
        payment_terms: "Net 30",
    },
    {
        id: "PI-004",
        invoice_number: "INV-2026-0004",
        supplier: "Swift Logistics Ltd",
        invoice_date: "2026-01-05",
        due_date: "2026-01-20",
        currency: "USD",
        net_amount: 15000.0,
        tax_amount: 1350.0,
        total_amount: 16350.0,
        status: "Paid",
        payment_terms: "Net 15",
    },
    {
        id: "PI-005",
        invoice_number: "INV-2026-0005",
        supplier: "NorthStar Raw Materials",
        invoice_date: "2026-02-10",
        due_date: "2026-04-11",
        currency: "EUR",
        net_amount: 22000.0,
        tax_amount: 1980.0,
        total_amount: 23980.0,
        status: "Draft",
        payment_terms: "Net 60",
    },
    {
        id: "PI-006",
        invoice_number: "INV-2026-0006",
        supplier: "CloudServe Hosting Inc",
        invoice_date: "2026-02-01",
        due_date: "2026-02-15",
        currency: "USD",
        net_amount: 4500.0,
        tax_amount: 405.0,
        total_amount: 4905.0,
        status: "Submitted",
        payment_terms: "Net 15",
    },
    {
        id: "PI-007",
        invoice_number: "INV-2026-0007",
        supplier: "Pinnacle Consulting Group",
        invoice_date: "2026-01-20",
        due_date: "2026-03-21",
        currency: "GBP",
        net_amount: 18500.0,
        tax_amount: 3700.0,
        total_amount: 22200.0,
        status: "Approved",
        payment_terms: "Net 60",
    },
    {
        id: "PI-008",
        invoice_number: "INV-2026-0008",
        supplier: "EcoClean Facility Services",
        invoice_date: "2025-12-15",
        due_date: "2026-01-14",
        currency: "USD",
        net_amount: 2800.0,
        tax_amount: 252.0,
        total_amount: 3052.0,
        status: "Cancelled",
        payment_terms: "Net 30",
    },
];

// Lookup map keyed by record ID for O(1) access in single-record endpoint
export const PURCHASE_INVOICES_BY_ID = Object.fromEntries(PURCHASE_INVOICES.map((p) => [p.id, p]));

// ---------------------------------------------------------------------------
// Registry — maps entity slug → { list, byId }
// ---------------------------------------------------------------------------

export const ENTITY_DATA_REGISTRY: Record<
    string,
    { list: Record<string, unknown>[]; byId: Record<string, Record<string, unknown>> }
> = {
    account: { list: ACCOUNTS, byId: ACCOUNTS_BY_ID },
    "chart-of-accounts": { list: ACCOUNTS, byId: ACCOUNTS_BY_ID },
    "purchase-invoice": { list: PURCHASE_INVOICES, byId: PURCHASE_INVOICES_BY_ID },
};
